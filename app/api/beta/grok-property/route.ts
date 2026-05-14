// app/api/beta/grok-property/route.ts
import { NextRequest, NextResponse } from 'next/server';

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
    const { address } = await req.json();

    if (!address?.trim()) {
      return NextResponse.json({ error: 'address is required' }, { status: 400 });
    }

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'XAI_API_KEY not configured' }, { status: 503 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 85_000);

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'grok-4',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Analyze this property and return structured JSON: ${address.trim()}` },
        ],
        temperature: 0.1,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = await response.text();
      console.error('[beta/grok-property] Grok API error:', err);
      return NextResponse.json({ error: 'Grok API failed', detail: err }, { status: 502 });
    }

    const data = await response.json();
    let result = {};

    try {
      result = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON from Grok' }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      address: address.trim(),
      result,
      meta: {
        model: data.model,
        fetched_at: new Date().toISOString(),
      },
    });

  } catch (err: any) {
    console.error('[beta/grok-property]', err);

    if (err.name === 'AbortError' || err.code === 23) {
      return NextResponse.json({
        error: 'Grok took too long to respond. Try again.',
      }, { status: 504 });
    }

    return NextResponse.json({
      error: 'Server error',
      message: err.message,
    }, { status: 500 });
  }
}
