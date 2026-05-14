// app/api/beta/grok-property/route.ts
// BETA — standalone Grok property intelligence endpoint.
// Completely isolated from the existing property data pipeline.
// Uses the same XAI_API_KEY / grok-4 pattern as the rest of the codebase.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

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
  "grok_intelligence_summary": "2-3 sentence high-quality summary including market context",
  "life_fit_score": number,
  "estimated_piti": number,
  "data_freshness": "Listing data as of [date]",
  "confidence": "high | medium | low"
}`;

export async function POST(req: NextRequest) {
  try {
    // Optional gate: if BETA_ACCESS_KEY is set, callers must send it as x-beta-key header
    const betaKey = process.env.BETA_ACCESS_KEY;
    if (betaKey && req.headers.get('x-beta-key') !== betaKey) {
      return NextResponse.json({ error: 'Unauthorized — x-beta-key header required' }, { status: 401 });
    }

    const { address } = await req.json();
    if (!address?.trim()) {
      return NextResponse.json({ error: 'address is required' }, { status: 400 });
    }

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'XAI_API_KEY not configured' }, { status: 503 });
    }

    const userPrompt = `Analyze this property and return the JSON object: ${address.trim()}`;

    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[beta/grok-property] xAI error:', err);
      return NextResponse.json({ error: 'Grok request failed', detail: err }, { status: 502 });
    }

    const data  = await res.json();
    const raw   = data.choices?.[0]?.message?.content?.trim() ?? '{}';
    const usage = data.usage ?? null;

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(raw); } catch {
      return NextResponse.json({ error: 'Grok returned malformed JSON', raw }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      address: address.trim(),
      result: parsed,
      meta: {
        model:        data.model ?? 'grok-4',
        prompt_tokens: usage?.prompt_tokens ?? null,
        completion_tokens: usage?.completion_tokens ?? null,
        fetched_at:   new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[beta/grok-property]', err);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
