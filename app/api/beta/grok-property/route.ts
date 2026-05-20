// app/api/beta/grok-property/route.ts
import { NextRequest } from 'next/server';
import { getSupabase } from '../../../../lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 150;

// ── PITI (deterministic — same logic as CalcEngine) ───────────────────────────

async function getLiveRate(origin: string): Promise<number> {
  try {
    const res = await fetch(`${origin}/api/ticker`, { cache: 'no-store' });
    if (!res.ok) return 6.875;
    const json = await res.json();
    const item = json?.items?.find((i: any) => i.label === '30Y FIXED');
    if (item?.value) {
      const parsed = parseFloat(String(item.value).replace('%', ''));
      if (Number.isFinite(parsed) && parsed > 3 && parsed < 12) return parsed;
    }
  } catch {}
  return 6.875;
}

function calcPITI(
  price: number,
  annualRate: number,
  annualTaxRate = 0.012,
  annualInsRate = 0.005,
  hoaMonthly    = 0,
): number {
  const principal = price * 0.80;
  const r = annualRate / 100 / 12;
  const n = 360;
  const pi = r > 0
    ? principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
    : principal / n;
  const monthlyTax = (price * annualTaxRate) / 12;
  const monthlyIns = (price * annualInsRate) / 12;
  return Math.round((pi + monthlyTax + monthlyIns + hoaMonthly) / 50) * 50;
}

// ── Grok prompts ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are HomeRates.AI's Property Intelligence Expert.

Current date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

Your job is to deliver the highest quality, most accurate, and freshest property analysis possible.

CRITICAL REQUIREMENTS:
- If verified listing facts are provided in the user message, treat them as authoritative and reflect them accurately in all factual fields.
- Always include current_status: For Sale, Pending, Sold, Off Market, or Withdrawn.
- Include last sale date and price if available from public records.
- Include original list date and days on market.
- For life_fit_score: score 0-100 based on schools, neighborhood quality, commute access, walkability, and value vs comparable sales.
- For comparable_sales: include 3-4 real recent sales within 0.5 miles from the past 18 months. Use real addresses.
- grok_intelligence_summary: 2-3 high-quality sentences covering market context, positioning, and key buyer/seller considerations.

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
  "data_freshness": "Listing data as of [date]",
  "confidence": "high | medium | low"
}`;

// Deep mode: instructs Grok to use live web search for current listing data
const DEEP_SYSTEM_PROMPT = `You are HomeRates.AI's Property Intelligence Expert with LIVE WEB SEARCH.

Current date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

CRITICAL: Search the web NOW to find the current active listing for the property address provided. Do not rely solely on training data — retrieve live values from Redfin, Zillow, or MLS.

REQUIRED SEARCHES:
1. Find the exact listing page on Redfin or Zillow for the address
2. Extract: days on market, original list date, lot size, year built, listing agent, MLS number
3. Get last sold date and price from public records
4. Get Zillow Zestimate and Redfin Estimate (current AVM)
5. Find Zillow saves/favorites count
6. Find 4 real recent comparable sales within 0.5 miles, past 18 months (real addresses, verified prices)
7. Find market stats for this ZIP: median DOM, median sale price, sale-to-list ratio
8. life_fit_score 0-100: schools, walkability, commute, neighborhood quality, value vs comps

Return ONLY valid JSON — no markdown, no code fences, no explanation:
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
  "zillow_estimate": number or null,
  "redfin_estimate": number or null,
  "zillow_saves": number or null,
  "market_median_dom": number or null,
  "market_sale_to_list": number or null,
  "market_median_price": number or null,
  "key_highlights": ["string", "string", "string", "string"],
  "comparable_sales": [
    { "address": "string", "sold_price": number, "sold_date": "Mon YYYY", "sqft": number or null, "price_per_sqft": number or null, "days_on_market": number or null }
  ],
  "grok_intelligence_summary": "2-3 high-quality sentences covering market context, positioning, buyer/seller considerations",
  "buyer_strategy": "1-2 sentences of specific actionable strategy based on live search data",
  "life_fit_score": number,
  "data_freshness": "Live data as of [date]",
  "confidence": "high | medium | low"
}`;

function buildUserMessage(address: string, redfin?: RedfinFacts | null): string {
  if (!redfin) {
    return `Analyze this property and return structured JSON: ${address.trim()}`;
  }
  const facts: string[] = [`Address: ${address.trim()}`];
  if (redfin.current_status)    facts.push(`Status: ${redfin.current_status}`);
  if (redfin.current_list_price) facts.push(`List Price: $${redfin.current_list_price.toLocaleString()}`);
  if (redfin.bedrooms)           facts.push(`Bedrooms: ${redfin.bedrooms}`);
  if (redfin.bathrooms)          facts.push(`Bathrooms: ${redfin.bathrooms}`);
  if (redfin.sqft)               facts.push(`Sqft: ${redfin.sqft.toLocaleString()}`);
  if (redfin.year_built)         facts.push(`Year Built: ${redfin.year_built}`);
  if (redfin.days_on_market != null) facts.push(`Days on Market: ${redfin.days_on_market}`);
  if (redfin.last_sold_price)    facts.push(`Last Sold Price: $${redfin.last_sold_price.toLocaleString()}`);
  if (redfin.last_sold_date)     facts.push(`Last Sold Date: ${redfin.last_sold_date}`);
  if (redfin.lot_size_sqft)      facts.push(`Lot Size: ${redfin.lot_size_sqft.toLocaleString()} sqft`);

  return `The following verified listing facts are from Redfin MLS — treat as authoritative:\n\n${facts.join('\n')}\n\nReturn structured JSON for this property. Ensure factual fields match the verified data above exactly. Focus your intelligence on: comparable_sales, grok_intelligence_summary, life_fit_score, and key_highlights.`;
}

function buildDeepUserMessage(address: string, redfin?: RedfinFacts | null): string {
  const base = `Search the web for the current listing: ${address.trim()}`;
  if (!redfin) return base + '\n\nFind the exact Redfin/Zillow page and return all available data as structured JSON.';
  const facts: string[] = [];
  if (redfin.current_list_price) facts.push(`Known list price: $${redfin.current_list_price.toLocaleString()}`);
  if (redfin.bedrooms)           facts.push(`Beds: ${redfin.bedrooms}`);
  if (redfin.bathrooms)          facts.push(`Baths: ${redfin.bathrooms}`);
  if (redfin.sqft)               facts.push(`Sqft: ${redfin.sqft.toLocaleString()}`);
  return `${base}\n\nAlready known from Redfin: ${facts.join(', ')}.\n\nSearch for additional live data: days on market, lot size, year built, last sold, Zillow/Redfin estimates, comps, and market stats. Return complete structured JSON.`;
}

// Strip markdown code fences from Grok response when response_format is not enforced
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) return raw.slice(start, end + 1);
  return raw;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RedfinFacts {
  current_status?:     string | null;
  current_list_price?: number | null;
  bedrooms?:           number | null;
  bathrooms?:          number | null;
  sqft?:               number | null;
  year_built?:         number | null;
  days_on_market?:     number | null;
  last_sold_price?:    number | null;
  last_sold_date?:     string | null;
  lot_size_sqft?:      number | null;
  tax_rate_effective?: number | null;
  hoa_monthly?:        number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Strips all punctuation — used for cache fallback and new writes
function normalizeAddressStrict(addr: string): string {
  return addr.trim().toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function cacheTtlMs(status: string): number {
  const s = (status ?? '').toLowerCase();
  if (s === 'sold' || s === 'off market' || s === 'withdrawn') return 7 * 24 * 60 * 60 * 1000;
  return 6 * 60 * 60 * 1000;
}

function sse(payload: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function mergeResult(
  grok:   Record<string, unknown>,
  redfin: RedfinFacts | null,
  pitiCalc: number,
  liveRate: number,
): Record<string, unknown> {
  const base: Record<string, unknown> = { ...grok };

  // Always use our deterministic PITI + live rate
  base.estimated_piti = pitiCalc;
  base.rate_used      = liveRate;

  // Redfin facts override Grok on every factual field where we have data
  if (redfin) {
    if (redfin.current_status != null)    base.current_status    = redfin.current_status;
    if (redfin.current_list_price != null) base.current_list_price = redfin.current_list_price;
    if (redfin.bedrooms != null)          base.bedrooms          = redfin.bedrooms;
    if (redfin.bathrooms != null)         base.bathrooms         = redfin.bathrooms;
    if (redfin.sqft != null)             base.sqft              = redfin.sqft;
    if (redfin.year_built != null)       base.year_built        = redfin.year_built;
    if (redfin.days_on_market != null)   base.days_on_market    = redfin.days_on_market;
    if (redfin.last_sold_price != null)  base.last_sold_price   = redfin.last_sold_price;
    if (redfin.last_sold_date != null)   base.last_sold_date    = redfin.last_sold_date;
    if (redfin.lot_size_sqft != null)    base.lot_size_sqft     = redfin.lot_size_sqft;
    // Recalculate price_per_sqft from verified numbers
    if (redfin.current_list_price && redfin.sqft && redfin.sqft > 0) {
      base.price_per_sqft = Math.round(redfin.current_list_price / redfin.sqft);
    }
  }

  return base;
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

  const normalized       = normalizeAddress(address);
  const normalizedStrict = normalizeAddressStrict(address);
  const candidates       = [...new Set([normalized, normalizedStrict])];

  // Try exact normalized match first (no TTL filter — report page shows any cached data)
  let { data, error } = await sb
    .from('grok_property_cache')
    .select('grok_result, model, fetched_at')
    .in('address_normalized', candidates)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fuzzy fallback — match on first meaningful address token (street number + street name)
  if (!data) {
    const tokens = normalizedStrict.split(' ').filter(Boolean);
    const fuzzyPrefix = tokens.slice(0, 3).join(' '); // e.g. "1131 mataro ct"
    if (fuzzyPrefix.length >= 6) {
      const { data: fuzzyData } = await sb
        .from('grok_property_cache')
        .select('grok_result, model, fetched_at')
        .ilike('address_normalized', `%${fuzzyPrefix}%`)
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fuzzyData) data = fuzzyData;
    }
  }

  console.log('[grok-property GET] result:', data ? 'HIT' : 'MISS', error ? `error=${error.message}` : '');

  if (!data) return new Response(JSON.stringify({ cached: false }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const mapsKey    = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
  const encodedAddr = encodeURIComponent(address);

  return new Response(JSON.stringify({
    cached: true,
    result: data.grok_result,
    meta: { model: data.model, fetched_at: data.fetched_at, from_cache: true },
    map_urls: mapsKey ? {
      street_view_url: `https://maps.googleapis.com/maps/api/streetview?size=820x260&location=${encodedAddr}&return_error_code=true&key=${mapsKey}`,
      static_map_url:  `https://maps.googleapis.com/maps/api/staticmap?center=${encodedAddr}&zoom=15&size=820x260&scale=2&maptype=satellite&markers=color:green%7C${encodedAddr}&key=${mapsKey}`,
    } : null,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// ── POST: stream Grok + cache merged result on completion ─────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const address: string      = body.address ?? '';
  const redfin:  RedfinFacts | null = body.redfin ?? null;
  const deep:    boolean     = body.deep === true;

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

  // Fetch live rate + calculate PITI before streaming starts
  const origin   = req.nextUrl.origin;
  const liveRate = await getLiveRate(origin);
  const price    = redfin?.current_list_price ?? null;
  const pitiCalc = price
    ? calcPITI(price, liveRate, redfin?.tax_rate_effective ?? 0.012, 0.005, redfin?.hoa_monthly ?? 0)
    : 0;

  const mapsKey    = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
  const encodedAddr = encodeURIComponent(address.trim());

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), deep ? 140_000 : 85_000);

  // Build API body — deep mode enables web search and removes json_object constraint
  const apiBody: Record<string, unknown> = {
    model:       'grok-4',
    messages: [
      { role: 'system', content: deep ? DEEP_SYSTEM_PROMPT : SYSTEM_PROMPT },
      { role: 'user',   content: deep ? buildDeepUserMessage(address, redfin) : buildUserMessage(address, redfin) },
    ],
    temperature: 0.1,
    max_tokens:  deep ? 3000 : 1200,
    stream:      true,
  };
  if (!deep) apiBody.response_format = { type: 'json_object' };
  if (deep)  apiBody.tools           = [{ type: 'live_search' }];

  let upstream: Response;
  try {
    upstream = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify(apiBody),
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
      ctrl.enqueue(sse({
        meta_early: {
          street_view_url: mapsKey
            ? `https://maps.googleapis.com/maps/api/streetview?size=820x260&location=${encodedAddr}&return_error_code=true&key=${mapsKey}`
            : null,
          static_map_url: mapsKey
            ? `https://maps.googleapis.com/maps/api/staticmap?center=${encodedAddr}&zoom=15&size=820x260&scale=2&maptype=satellite&markers=color:green%7C${encodedAddr}&key=${mapsKey}`
            : null,
          // Send live rate + piti immediately — only if price was known
          rate_used:      liveRate,
          ...(pitiCalc > 0 ? { estimated_piti: pitiCalc } : {}),
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
          address_normalized: normalizeAddressStrict(address),
          address_raw:        address.trim(),
          grok_result:        result,
          model:              deep ? 'grok-4-search' : 'grok-4',
          fetched_at:         now.toISOString(),
          expires_at:         new Date(now.getTime() + ttl).toISOString(),
        }, { onConflict: 'address_normalized' });
        if (error) console.error('[beta/grok-property] cache write error:', error.message);
      };

      const finalizeResult = (raw: string): Record<string, unknown> | null => {
        try {
          const cleaned = deep ? extractJson(raw) : raw;
          const grok    = JSON.parse(cleaned);
          const merged  = mergeResult(grok, redfin, pitiCalc, liveRate);
          if (deep) merged.deep_analysis = true;
          return merged;
        } catch { return null; }
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
              const merged = finalizeResult(fullContent);
              if (merged) {
                ctrl.enqueue(sse({ done: true, result: merged, meta: { model: 'grok-4', fetched_at: new Date().toISOString() } }));
                await cacheResult(merged);
              } else {
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
        const merged = finalizeResult(fullContent);
        if (merged) {
          ctrl.enqueue(sse({ done: true, result: merged, meta: { model: 'grok-4', fetched_at: new Date().toISOString() } }));
          await cacheResult(merged);
        } else {
          ctrl.enqueue(sse({ error: fullContent ? 'Incomplete JSON from Grok' : 'No data received from Grok' }));
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
