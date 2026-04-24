// app/api/market-intelligence/route.ts
// POST /api/market-intelligence
// 3-engine pipeline: Tavily (web context) → Grok (reasoning) → OpenAI (consumer formatting)

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

import { NextResponse } from 'next/server';

interface PropertyInput {
  address: string;
  list_price?: number;
  redfin_avm?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  price_per_sqft?: number;
  status?: string;
  date_seen?: string;
}

const DISCLAIMER =
  'HomeRates.ai provides educational market intelligence only. This is not an appraisal, financial advice, investment advice, or a loan approval. Buyers should verify all property, pricing, tax, HOA, condition, and comparable sale information with licensed professionals.';

// ── Step 1: Tavily web context ────────────────────────────────────────────────

async function tavilyContext(p: PropertyInput): Promise<string> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return 'Web context unavailable (no API key).';

  const parts = p.address.split(',').map(s => s.trim());
  const street = parts[0];
  const cityState = parts.slice(1).join(', ');

  const queries = [
    `"${street}" ${cityState} listing price history days on market`,
    `"${street}" ${cityState} Redfin sold comparable`,
    `${cityState} luxury home market trends price reductions 2025 2026`,
  ];

  const results = await Promise.allSettled(
    queries.map(q =>
      fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8_000),
        body: JSON.stringify({
          api_key: key,
          query: q,
          max_results: 3,
          search_depth: 'basic',
          include_answer: true,
        }),
      }).then(r => r.json()),
    ),
  );

  const snippets: string[] = [];
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const d = r.value;
    if (d.answer) snippets.push(d.answer);
    for (const res of (d.results ?? []).slice(0, 2)) {
      if (res.content) snippets.push(`[${res.url ?? 'web'}] ${String(res.content).slice(0, 350)}`);
    }
  }

  return snippets.join('\n\n').slice(0, 6_000) || 'No web context found.';
}

// ── Step 2: Grok structured reasoning ────────────────────────────────────────

async function grokAnalyze(p: PropertyInput, webContext: string): Promise<unknown> {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error('XAI_API_KEY not set');

  const gapPct =
    p.list_price && p.redfin_avm && p.redfin_avm > 0
      ? Math.round(((p.list_price - p.redfin_avm) / p.redfin_avm) * 100)
      : null;

  const systemPrompt = `You are a real estate market intelligence engine for HomeRates.ai.
Analyze residential property listings for buyer education only.
Return ONLY valid JSON — no markdown, no explanation, no code fences.`;

  const userPrompt = `Analyze this property for a buyer:

Address: ${p.address}
List Price: ${p.list_price ? `$${p.list_price.toLocaleString()}` : 'Unknown'}
Redfin AVM: ${p.redfin_avm ? `$${p.redfin_avm.toLocaleString()}` : 'Unknown'}
${gapPct !== null ? `Price vs AVM Gap: ${gapPct > 0 ? '+' : ''}${gapPct}% vs AVM` : ''}
Beds: ${p.beds ?? '—'} | Baths: ${p.baths ?? '—'} | Sqft: ${p.sqft?.toLocaleString() ?? '—'}
Price/Sqft: ${p.price_per_sqft ? `$${p.price_per_sqft}` : '—'}
Status: ${p.status ?? 'For Sale'}
Date: ${p.date_seen ?? new Date().toLocaleDateString()}

Web Context:
${webContext}

Return ONLY this JSON structure:
{
  "headline": "one factual sentence for a buyer",
  "confidence_score": "Low|Medium|High",
  "price_position": {
    "interpretation": "2-3 sentence analysis of list price vs AVM and what it means for a buyer",
    "gap_analysis": "if gap >10%, explain what could account for it — otherwise leave empty string"
  },
  "buyer_takeaway": "2-3 sentence key message a buyer should understand before making an offer",
  "possible_explanations": ["3-5 items — what might explain current list price positioning"],
  "negotiation_signals": ["3-5 buyer leverage points based on data available"],
  "red_flags": ["2-4 items a buyer must verify before offering"],
  "questions_to_ask": ["4-6 questions buyer should ask seller agent or during inspection"],
  "comp_strategy": ["2-4 items — how to evaluate comps for this property type and market"],
  "mortgage_angle": ["2-3 financing considerations relevant to this price point"],
  "offer_signal": "Cautious|Needs Comp Review|Potential Leverage|Strongly Supported",
  "source_notes": ["2-3 notes on data confidence and sources used"]
}

Rules: No appraisal values. No investment advice. No lending advice. Buyer education only.`;

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    signal: AbortSignal.timeout(55_000),
    body: JSON.stringify({
      model: (process.env.XAI_MODEL || 'grok-4').trim(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Grok API error: ${res.status} — ${errBody.slice(0, 200)}`);
  }
  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? '';
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Grok returned no JSON');
  return JSON.parse(match[0]);
}

// ── Step 3: OpenAI consumer formatting ───────────────────────────────────────

async function openaiFormat(p: PropertyInput, grokData: unknown, _webContext: string): Promise<unknown> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return grokData;

  const systemPrompt = `You are a consumer communication specialist for HomeRates.ai.
Polish AI real estate market analysis for homebuyers.
Return ONLY valid JSON — no markdown, no explanation, no code fences.`;

  const userPrompt = `Polish this market analysis for a homebuyer at ${p.address}.

Analysis to polish:
${JSON.stringify(grokData, null, 2)}

Requirements:
- Language clear and empowering, not condescending
- Each array: max 5 concise items — remove redundancy
- Preserve all factual content — never invent new data
- Compliance: no appraisals, no investment advice, no lending promises
- offer_signal and confidence_score must remain unchanged

Return the EXACT same JSON structure, polished.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.15,
    }),
  });

  if (!res.ok) return grokData;
  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? '';
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return grokData;
  return JSON.parse(match[0]);
}

// ── Build final report ────────────────────────────────────────────────────────

function buildReport(p: PropertyInput, raw: any) {
  const gapAmount =
    p.list_price != null && p.redfin_avm != null ? p.list_price - p.redfin_avm : undefined;
  const gapPercent =
    p.list_price != null && p.redfin_avm != null && p.redfin_avm > 0
      ? Math.round(((p.list_price - p.redfin_avm) / p.redfin_avm) * 100)
      : undefined;

  return {
    headline: raw.headline ?? 'Market intelligence complete.',
    confidence_score: raw.confidence_score ?? 'Medium',
    price_position: {
      list_price: p.list_price,
      avm: p.redfin_avm,
      gap_amount: gapAmount,
      gap_percent: gapPercent,
      interpretation: raw.price_position?.interpretation ?? '',
      gap_analysis: raw.price_position?.gap_analysis ?? '',
    },
    buyer_takeaway: raw.buyer_takeaway ?? '',
    possible_explanations: (raw.possible_explanations as string[]) ?? [],
    negotiation_signals: (raw.negotiation_signals as string[]) ?? [],
    red_flags: (raw.red_flags as string[]) ?? [],
    questions_to_ask: (raw.questions_to_ask as string[]) ?? [],
    comp_strategy: (raw.comp_strategy as string[]) ?? [],
    mortgage_angle: (raw.mortgage_angle as string[]) ?? [],
    offer_signal: raw.offer_signal ?? 'Needs Comp Review',
    source_notes: (raw.source_notes as string[]) ?? [],
    disclaimer: DISCLAIMER,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const property: PropertyInput = body.property;
    if (!property?.address) {
      return NextResponse.json({ ok: false, error: 'property.address required' }, { status: 400 });
    }

    const providersUsed: string[] = [];

    // Step 1: Tavily
    const webContext = await tavilyContext(property).catch(() => 'Web context unavailable.');
    if (webContext && webContext !== 'Web context unavailable.') providersUsed.push('tavily');

    // Step 2: Grok
    let grokData: unknown;
    let grokOk = false;
    try {
      grokData = await grokAnalyze(property, webContext);
      providersUsed.push('grok');
      grokOk = true;
    } catch (err: any) {
      const errMsg: string = err.message ?? 'unknown error';
      console.error('[market-intelligence] Grok failed:', errMsg);
      grokData = {
        headline: `AI analysis for ${property.address} — limited data available.`,
        confidence_score: 'Low',
        price_position: {
          interpretation: 'Full AI analysis unavailable. Review the Redfin AVM vs list price gap manually.',
          gap_analysis: '',
        },
        buyer_takeaway: 'Consult a local real estate agent for a comparative market analysis before making an offer.',
        possible_explanations: ['AI analysis temporarily unavailable — please retry.'],
        negotiation_signals: [],
        red_flags: ['Unable to complete full analysis — verify data with local agent.'],
        questions_to_ask: ['Request a full CMA from your buyer agent before making an offer.'],
        comp_strategy: [],
        mortgage_angle: [],
        offer_signal: 'Needs Comp Review',
        source_notes: [`Grok error: ${errMsg.slice(0, 120)}`],
      };
    }

    // Step 3: OpenAI (only if Grok succeeded — skip if already degraded)
    let finalData = grokData;
    if (grokOk) {
      try {
        finalData = await openaiFormat(property, grokData, webContext);
        providersUsed.push('openai');
      } catch {
        finalData = grokData;
      }
    }

    return NextResponse.json({
      ok: true,
      module: 'market_intelligence',
      property,
      report: buildReport(property, finalData),
      meta: {
        providers_used: providersUsed,
        generated_at: new Date().toISOString(),
        build_tag: 'market-intel-v1',
      },
    });
  } catch (err: any) {
    console.error('[market-intelligence] Fatal:', err);
    return NextResponse.json({ ok: false, error: err.message ?? 'Analysis failed' }, { status: 500 });
  }
}
