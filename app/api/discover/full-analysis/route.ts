// app/api/discover/full-analysis/route.ts
// POST — Grok 4.3 full scorecard after all 4 Discover chips have been answered.
// Returns a structured { analysis } object for display in the Discover dock.

export const runtime    = 'nodejs';
export const dynamic    = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSupabase } from '../../../../lib/supabaseServer';

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) return raw.slice(start, end + 1);
  return raw;
}

const LOAN_LABELS: Record<string, string> = {
  fha: 'FHA', conventional: 'Conventional', va: 'VA', jumbo: 'Jumbo',
};

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { threadId, loanType: clientLoanType, scenario: clientScenario } = body;

  if (!threadId) return NextResponse.json({ error: 'threadId required' }, { status: 400 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  // Verify caller is the borrower on this thread
  const { data: thread } = await sb
    .from('conversation_threads')
    .select('borrower_id')
    .eq('id', threadId)
    .maybeSingle();

  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
  if (thread.borrower_id !== userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  // Fetch all messages for this thread, ordered by time
  const { data: allMessages } = await sb
    .from('messages')
    .select('sender_role, content, metadata, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  const msgs = (allMessages ?? []) as Array<{
    sender_role: string; content: string;
    metadata: Record<string, unknown> | null; created_at: string;
  }>;

  // Scope to after last scenario_reset marker
  const lastResetIdx = msgs.reduce((acc, m, i) =>
    m.metadata?.type === 'scenario_reset' ? i : acc, -1);
  const currentMsgs = lastResetIdx >= 0 ? msgs.slice(lastResetIdx + 1) : msgs;

  // Extract conversation: chip question + first LO reply per chip
  const CHIP_IDS = ['rate', 'costs', 'process', 'after-close'];
  const conversation: Array<{ topic: string; question: string; lo_reply: string }> = [];

  for (const chipId of CHIP_IDS) {
    const chipMsg = currentMsgs.find(
      m => m.metadata?.type === 'discover_chip' && (m.metadata as any)?.chipId === chipId
    );
    if (!chipMsg) continue;
    const loReply = currentMsgs.find(
      m => m.sender_role === 'professional' && m.created_at > chipMsg.created_at
    );
    if (loReply) {
      conversation.push({
        topic:    (chipMsg.metadata as any)?.title ?? chipId,
        question: chipMsg.content,
        lo_reply: loReply.content,
      });
    }
  }

  // Fetch live FRED rate
  let fredRate = 6.875;
  try {
    const fredRes = await fetch(`${req.nextUrl.origin}/api/fred`, { cache: 'no-store' });
    if (fredRes.ok) {
      const fredData = await fredRes.json();
      if (fredData?.ok && fredData.mort30Avg) fredRate = fredData.mort30Avg;
    }
  } catch { /* use default */ }

  const loanType: string  = clientLoanType ?? 'conventional';
  const loanLabel: string = LOAN_LABELS[loanType] ?? loanType.toUpperCase();

  const snap = clientScenario;
  // Prefer the real LLPA/OBMMI fair par rate (already priced to this borrower's
  // credit score, LTV, occupancy, property type, and program) over the flat FRED
  // average + hardcoded Jumbo offset — same fix as analyze-reply's benchmark.
  const usingFairPar = typeof snap?.fairParRate === 'number';
  const marketRate = usingFairPar
    ? snap!.fairParRate!
    : loanType === 'jumbo'
      ? parseFloat((fredRate + 0.50).toFixed(3))
      : fredRate;

  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const inputData = {
    loan_type: loanLabel,
    scenario: snap ? {
      purchase_price:        snap.price,
      loan_amount:           snap.loanAmount,
      down_payment_pct:      snap.downPct,
      fred_benchmark_rate:   fredRate,
      ...(usingFairPar && { fair_par_rate_llpa_adjusted: snap!.fairParRate }),
      term_years:            snap.term ?? 30,
      estimated_monthly_pi:  snap.monthlyPayment,
    } : null,
    conversation,
  };

  const systemPrompt = `You are an expert mortgage AI Coach for HomeRates.ai. Produce clear, borrower-first analysis that quantifies dollar impacts and benchmarks lender quotes against current market data. Be direct, neutral, and factual. Output ONLY valid JSON — no markdown, no code fences, no extra text.`;

  const userPrompt = `Analyze this borrower-lender conversation and produce a complete scorecard.

Input:
${JSON.stringify(inputData, null, 2)}

Current date: ${currentDate}
FRED 30yr conforming rate: ${fredRate.toFixed(3)}%
${usingFairPar
    ? `This borrower's real fair par rate (LLPA-adjusted for their credit score, LTV, occupancy, property type, and program): ${marketRate.toFixed(3)}%. Benchmark the quoted rate against THIS number, not the flat FRED conforming rate above — it is already the correct, borrower-specific figure.`
    : `Current 30yr ${loanLabel} market average: ${marketRate.toFixed(3)}%\nNote: ${loanType === 'jumbo' ? 'Jumbo rates naturally run 0.35–0.65% above FRED conforming. Adjust competitiveness assessment accordingly.' : 'Compare quoted rate directly to FRED benchmark.'}`}

Return ONLY this exact JSON structure:
{
  "overall_recommendation": "2-3 sentences: rate competitiveness, fee assessment, clear verdict on proceed/negotiate/shop",
  "decision_score": integer 0-100 (70+ = proceed, 50-69 = negotiate first, below 50 = shop elsewhere),
  "confidence": "low|medium|medium-high|high",
  "key_strengths": ["3-5 short bullets"],
  "key_concerns": ["3-5 short bullets"],
  "market_context": {
    "current_market_rate": ${marketRate.toFixed(3)},
    "quoted_rate": null,
    "quoted_vs_market": "+X.XXX string (positive if above market, negative if below)",
    "monthly_impact": integer dollar difference per month vs market rate,
    "lock_strategy": "1-2 sentence lock recommendation"
  },
  "personalized_scenarios": [
    {
      "scenario_name": "Accept Current Quote",
      "monthly_pi": integer,
      "total_interest_5yrs": "~$XXX,000",
      "notes": "brief note"
    },
    {
      "scenario_name": "Negotiate to Market Rate (${marketRate.toFixed(2)}%)",
      "monthly_pi": integer,
      "savings_per_month": integer,
      "5yr_savings": "~$XX,000",
      "notes": "achievability note"
    }
  ],
  "risk_assessment": {
    "loan_type_specific": "key requirement or risk for ${loanLabel} loans",
    "servicing": "assessment of servicing quality",
    "timeline": "assessment of closing timeline and contingency risk"
  },
  "next_best_questions": [
    "4 specific, high-value questions the borrower should ask next"
  ],
  "wealth_building_tie_in": "1-2 sentences on equity strategy, refi threshold, or long-term wealth angle"
}`;

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI unavailable' }, { status: 503 });

  try {
    const grokRes = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model:           'grok-4.3',
        messages:        [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        temperature:     0.2,
        max_tokens:      2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!grokRes.ok) {
      const errText = await grokRes.text().catch(() => '');
      console.error('[discover/full-analysis] Grok error:', errText);
      return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
    }

    const grokData = await grokRes.json();
    const raw      = grokData.choices?.[0]?.message?.content?.trim() ?? '{}';
    const cleaned  = extractJson(raw);

    let analysis: Record<string, unknown> = {};
    try { analysis = JSON.parse(cleaned); } catch { /* malformed */ }

    // Stamp with metadata
    analysis._generated_at   = new Date().toISOString();
    analysis._fred_rate       = fredRate;
    analysis._market_rate     = marketRate;
    analysis._loan_type       = loanType;

    return NextResponse.json({ analysis });

  } catch (err) {
    console.error('[discover/full-analysis]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
