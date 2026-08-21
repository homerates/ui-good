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
  const { threadId, loanType: clientLoanType, scenario: clientScenario, findings: clientFindings } = body;
  const findings: Array<{ id: string; title: string; extractedValue: string | null; gapStatus: string; gapNote: string; costFacts?: Record<string, number> }> =
    Array.isArray(clientFindings) ? clientFindings : [];

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

  // ── Deterministic market context — computed here, never by the model ──────
  // The Rate finding's extractedValue is already parsed by DiscoverDock's
  // extractFromReply(); reuse it directly rather than asking the model to
  // re-derive a quoted rate from conversation prose.
  const rateFinding    = findings.find(f => f.id === 'rate') ?? null;
  const quotedRateVal  = rateFinding?.extractedValue ? parseFloat(rateFinding.extractedValue) : null;
  const rateDelta      = quotedRateVal != null && !isNaN(quotedRateVal)
    ? parseFloat((quotedRateVal - marketRate).toFixed(3))
    : null;

  function monthlyPI(loanAmt: number, ratePct: number, years = 30): number {
    const r = ratePct / 100 / 12, n = years * 12;
    if (r <= 0) return loanAmt / n;
    return loanAmt * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }
  const monthlyImpact = quotedRateVal != null && snap?.loanAmount
    ? Math.round(monthlyPI(snap.loanAmount, quotedRateVal) - monthlyPI(snap.loanAmount, marketRate))
    : null;

  const marketContext = {
    market_rate_source:  usingFairPar ? 'llpa_fair_par' : 'fred_flat',
    current_market_rate: marketRate,
    quoted_rate:         quotedRateVal,
    quoted_vs_market:    rateDelta,
    monthly_impact:      monthlyImpact,
    rate_gap_status:     rateFinding?.gapStatus ?? null,
  };

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
    // Already extracted/computed by HomeRates deterministically — ground truth.
    // The model explains these; it does not re-derive or override them.
    deterministic_findings: findings,
    deterministic_market_context: marketContext,
    // Raw Q&A text — use ONLY to judge completeness/tone/vagueness (e.g. was
    // lock period addressed, was the after-close commitment concrete). Any
    // numeric fact already present above must come from there, not from
    // re-reading this text.
    conversation,
  };

  const systemPrompt = `You are an expert mortgage AI Coach for HomeRates.ai. Synthesize the deterministic findings already provided into a clear, borrower-first explanation. You explain what the numbers mean — you never invent, recompute, or restate different numbers than the ones given. Be direct, neutral, and factual. Output ONLY valid JSON — no markdown, no code fences, no extra text.`;

  const userPrompt = `Synthesize this borrower-lender Discovery conversation into an evidence-based explanation. Do NOT produce an overall score, grade, or single numeric verdict of any kind — HomeRates deliberately does not reduce a 4-domain lender evaluation to one number.

Input (deterministic_findings and deterministic_market_context are already-computed facts — treat them as ground truth; conversation is raw text for completeness/tone judgment only):
${JSON.stringify(inputData, null, 2)}

Current date: ${currentDate}

Return ONLY this exact JSON structure:
{
  "strengths": ["3-5 short bullets — what this LO's responses got right, citing the deterministic findings/facts above"],
  "concerns": ["3-5 short bullets — where the findings show a gap (check/alert status) or a fact worth questioning"],
  "missing_information": ["bullets — sub-topics, documents (e.g. Loan Estimate), or commitments not yet confirmed in the conversation"],
  "market_commentary": "1-2 sentences explaining what deterministic_market_context's numbers mean for this borrower in plain English — do not restate different numbers than the ones given",
  "questions_worth_asking": ["3-5 specific, high-value questions the borrower should ask next"],
  "alternatives_or_tradeoffs": ["2-4 bullets on real tradeoffs worth weighing — e.g. negotiating toward the fair par rate, points vs. lender credit, lock-period length, timeline vs. rate risk — grounded in the facts given, not invented figures"]
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

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(cleaned); } catch { /* malformed */ }

    // market_context is assembled from the deterministic values computed above,
    // never from the model's output — even if the model echoed numbers into
    // its response, they are ignored here. No decision_score field exists
    // anywhere in this contract; do not reintroduce one.
    const analysis: Record<string, unknown> = {
      strengths:                 parsed.strengths ?? [],
      concerns:                  parsed.concerns ?? [],
      missing_information:       parsed.missing_information ?? [],
      market_context:            marketContext,
      market_commentary:         parsed.market_commentary ?? '',
      questions_worth_asking:    parsed.questions_worth_asking ?? [],
      alternatives_or_tradeoffs: parsed.alternatives_or_tradeoffs ?? [],
      _generated_at:             new Date().toISOString(),
      _fred_rate:                fredRate,
      _market_rate:              marketRate,
      _loan_type:                loanType,
    };

    return NextResponse.json({ analysis });

  } catch (err) {
    console.error('[discover/full-analysis]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
