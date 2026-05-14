// app/api/beta/grok-property/route.ts
import { NextRequest } from 'next/server';
import { getSupabase } from '../../../../lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const SYSTEM_PROMPT = `You are HomeRates.AI's Property Intelligence Expert.

Current date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

Your job is to deliver the highest quality, most accurate, and freshest property analysis possible.

CRITICAL REQUIREMENTS:
- Always start with the current status: For Sale, Pending, Sold, Off Market, or Withdrawn.
- Include last sale date and price if available.
- Include original list date, days on market, and price changes if known.
- Use the most recent public data possible.
- Clearly state data freshness (e.g., "Listing data as of [today's date]").
- For estimated_piti: calculate using current 30yr fixed rate (~7%), 20% down, 1.2% property tax rate, 0.5% insurance. Round to nearest $50.
- For life_fit_score: score 0-100 based on schools, neighborhood quality, commute access, walkability, and value vs comparable sales.
- For comparable_sales: include 3-4 real recent sales within 0.5 miles from the past 18 months.

Return ONLY valid JSON — no markdown, no explanation, no extra text:
{
  "current_status": "For Sale | Pending | Sold | Off Market | Withdrawn",
  "last_sold_date": "Month DD, YYYY or null",
  "last_sold_price": number or null,
  "original_list_date": "Month DD, YYYY or null",
  "days_on_market": number or null,
  "current_list_price": number or null,
  "price_per_sqft": number or null,
  "sqft": number or null,
  "bedrooms": number or null,
  "bathrooms": number or null,
  "year_built": number or null,
  "lot_size_sqft": number or null,
  "key_highlights": ["string", "string", "string", "string"],
  "comparable_sales": [
    { "address": "string", "sold_price": number, "sold_date": "Mon YYYY", "sqft": number or null, "price_per_sqft": number or null }
  ],
  "grok_intelligence_summary": "2-3 sentence high-quality summary including market context",
  "life_fit_score": number,
  "estimated_piti": number,
  "data_freshness": "Listing data as of [date]",
  "confidence": "high | medium | low"
}`;

function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase().replace(/\s+/g, ' ');
}

function cacheTtlMs(status: string): number {
  const s = (status ?? '').toLowerCase();
  if (s === 'sold' || s === 'off market' || s === 'withdrawn') return 7 * 24 * 60 * 60 * 1000;
  return 6 * 60 * 60 * 1000; // active listings: 6h
}

function sse(payload: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

// ── GET: read from cache ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.trim();
  if (!address) {
    return new Response(JSON.stringify({ error: 'address query param required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const sb = getSupabase();
  if (!sb) return new Response(JSON.stringify({ cached: false }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const { data } = await sb
    .from('grok_property_cache')
    .select('grok_result, model, fetched_at')
    .eq('address_normalized', normalizeAddress(address))
    .gt('expires_at', new Date().toISOString())
    .single();

  if (!data) return new Response(JSON.stringify({ cached: false }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  return new Response(JSON.stringify({
    cached: true,
    result: data.grok_result,
    meta: { model: data.model, fetched_at: data.fetched_at, from_cache: true },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// ── POST: stream Grok + cache result on completion ────────────────────────────

export async function POST(req: NextRequest) {
  const { address } = await req.json().catch(() => ({}));

  if (!address?.trim()) {
    return new Response(JSON.stringify({ error: 'address is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'XAI_API_KEY not configured' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
  const encodedAddr = encodeURIComponent(address.trim());

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 85_000);

  let upstream: Response;
  try {
    upstream = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'grok-4',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Analyze this property and return structured JSON: ${address.trim()}` },
        ],
        temperature: 0.1,
        max_tokens: 1200,
        stream: true,
        response_format: { type: 'json_object' },
      }),
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    return new Response(JSON.stringify({ error: 'Failed to reach Grok', detail: err.message }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!upstream.ok) {
    clearTimeout(timeoutId);
    const errText = await upstream.text().catch(() => '');
    console.error('[beta/grok-property] upstream error:', errText);
    return new Response(JSON.stringify({ error: 'Grok API error', detail: errText }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    });
  }

  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      // Send map URLs immediately — photo loads while Grok thinks
      ctrl.enqueue(sse({
        meta_early: {
          street_view_url: mapsKey
            ? `https://maps.googleapis.com/maps/api/streetview?size=820x260&location=${encodedAddr}&return_error_code=true&key=${mapsKey}`
            : null,
          static_map_url: mapsKey
            ? `https://maps.googleapis.com/maps/api/staticmap?center=${encodedAddr}&zoom=15&size=820x260&scale=2&maptype=satellite&markers=color:green%7C${encodedAddr}&key=${mapsKey}`
            : null,
        },
      }));

      const reader = upstream.body!.getReader();
      let buffer = '';
      let fullContent = '';
      let tokensStarted = false;

      const heartbeat = setInterval(() => {
        if (!tokensStarted) ctrl.enqueue(sse({ thinking: true }));
      }, 2000);

      const finish = () => { clearTimeout(timeoutId); clearInterval(heartbeat); };

      const cacheResult = async (result: Record<string, unknown>): Promise<void> => {
        const sb = getSupabase();
        if (!sb) return;
        const now = new Date();
        const ttl = cacheTtlMs((result.current_status as string) ?? '');
        const { error } = await sb.from('grok_property_cache').upsert({
          address_normalized: normalizeAddress(address),
          address_raw:        address.trim(),
          grok_result:        result,
          model:              'grok-4',
          fetched_at:         now.toISOString(),
          expires_at:         new Date(now.getTime() + ttl).toISOString(),
        }, { onConflict: 'address_normalized' });
        if (error) console.error('[beta/grok-property] cache write error:', error.message);
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;

            const payload = trimmed.slice(6);
            if (payload === '[DONE]') {
              finish();
              try {
                const result = JSON.parse(fullContent);
                const fetchedAt = new Date().toISOString();
                ctrl.enqueue(sse({ done: true, result, meta: { model: 'grok-4', fetched_at: fetchedAt } }));
                await cacheResult(result);
              } catch {
                ctrl.enqueue(sse({ error: 'Grok returned malformed JSON' }));
              }
              ctrl.close();
              return;
            }

            try {
              const chunk = JSON.parse(payload);
              const token: string = chunk.choices?.[0]?.delta?.content ?? '';
              if (token) {
                if (!tokensStarted) { tokensStarted = true; clearInterval(heartbeat); }
                fullContent += token;
                ctrl.enqueue(sse({ token }));
              }
            } catch { /* skip malformed SSE chunks */ }
          }
        }

        finish();
        if (fullContent) {
          try {
            const result = JSON.parse(fullContent);
            const fetchedAt = new Date().toISOString();
            ctrl.enqueue(sse({ done: true, result, meta: { model: 'grok-4', fetched_at: fetchedAt } }));
            await cacheResult(result);
          } catch {
            ctrl.enqueue(sse({ error: 'Incomplete JSON from Grok' }));
          }
        } else {
          ctrl.enqueue(sse({ error: 'No data received from Grok' }));
        }
        ctrl.close();
      } catch (err: any) {
        finish();
        const isTimeout = err.name === 'AbortError' || err.code === 23;
        ctrl.enqueue(sse({ error: isTimeout ? 'Grok took too long — try again.' : (err.message ?? 'Stream error') }));
        ctrl.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
