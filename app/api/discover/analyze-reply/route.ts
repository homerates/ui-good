// app/api/discover/analyze-reply/route.ts
// POST — AI analysis of an LO's chat response scoped to a specific chip question.
// Returns { analysis, followUp } — analysis is 1-2 sentences, followUp is one
// clickable question the borrower can send directly to the LO.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

function fmt$(n: number) {
  return '$' + Math.round(n).toLocaleString();
}

type CostFacts = {
  apr?: number; points?: number; lenderCredit?: number;
  originationFee?: number; originationFeePct?: number;
};

function buildSystemPrompt(params: {
  chipTitle: string;
  chipSubtopics: string;
  loanType: string;
  scenario: {
    price: number; loanAmount: number; downPct: number;
    rate: number; term: number; ltv: number; monthlyPayment: number;
    fairParRate?: number; fairParCounty?: string;
  };
  // Already computed by HomeRates deterministically — the model's job is to
  // explain what these mean, never to re-derive, re-parse, or override them.
  extractedValue?: string;
  gapStatus?: string;
  gapNote?: string;
  costFacts?: CostFacts;
}): string {
  const { chipTitle, chipSubtopics, loanType, scenario, extractedValue, gapStatus, gapNote, costFacts } = params;
  const typeLabel: Record<string, string> = {
    fha: 'FHA', conventional: 'Conventional', va: 'VA', jumbo: 'Jumbo',
  };
  const label = typeLabel[loanType] ?? loanType.toUpperCase();
  const usingFairPar = typeof scenario.fairParRate === 'number';

  // Loan-type-specific context injected into the system prompt
  const loanTypeContext: string[] = [];
  // The flat Jumbo portfolio-premium guess is only needed when falling back to
  // the FRED conforming average — a real LLPA/OBMMI fair par rate already
  // prices the Jumbo segment correctly, so applying the flat offset on top of
  // it would double-count the premium.
  if (loanType === 'jumbo' && !usingFairPar) {
    loanTypeContext.push(
      'JUMBO RATE CONTEXT: The FRED 30yr Benchmark is for conforming loans only. Jumbo rates naturally carry a 0.35–0.65% portfolio premium above conforming. A Jumbo rate 0.60% above FRED is within normal range — do NOT flag it as Alert. Only flag as elevated if the spread exceeds 0.90% above FRED after accounting for the Jumbo premium.'
    );
  }
  // NOTE: no generic origination-fee percentage benchmark here (Phase B) —
  // Discovery does not classify individual fees as fair/high/low from a
  // percentage assumption. Cost facts are relayed as plain facts below.
  if (chipTitle.toLowerCase().includes('after') || chipTitle.toLowerCase().includes('future')) {
    loanTypeContext.push(
      'COMMITMENT QUALITY: Distinguish between concrete commitments ("we send an email alert when rates drop 0.50%", "we waive all lender fees on a refi") and vague marketing language ("we care about your future", "we have a lifetime guarantee"). Vague commitments with no mechanism or threshold should be flagged as "check" — ask the borrower to request specifics in writing.'
    );
  }

  const factLines: string[] = [];
  if (extractedValue) factLines.push(`DETERMINISTICALLY EXTRACTED VALUE FROM THIS REPLY: ${extractedValue}`);
  if (gapStatus) factLines.push(`DETERMINISTIC GAP STATUS (already computed — explain it, do not recompute or contradict it): ${gapStatus.toUpperCase()}${gapNote ? ` — ${gapNote}` : ''}`);
  if (costFacts) {
    const parts: string[] = [];
    if (costFacts.apr != null)               parts.push(`APR ${costFacts.apr}%`);
    if (costFacts.points != null)            parts.push(`${costFacts.points} discount point(s)`);
    if (costFacts.lenderCredit != null)      parts.push(`${fmt$(costFacts.lenderCredit)} lender credit`);
    if (costFacts.originationFee != null)    parts.push(`${fmt$(costFacts.originationFee)} origination fee`);
    if (costFacts.originationFeePct != null) parts.push(`${costFacts.originationFeePct}% origination fee`);
    if (parts.length > 0) {
      factLines.push(`ADDITIONAL EXTRACTED FACTS FROM THIS REPLY: ${parts.join(', ')}. State these plainly — do not independently judge any fee as high, low, or fair using a percentage assumption of your own.`);
    }
  }

  return [
    'You are HomeRates AI — an independent mortgage analyst helping a borrower evaluate a loan officer\'s response.',
    '',
    `The borrower asked specifically about: ${chipTitle}`,
    `This question covers: ${chipSubtopics}`,
    '',
    'LOAN SCENARIO:',
    `Type: ${label} | Purchase: ${fmt$(scenario.price)} | Loan: ${fmt$(scenario.loanAmount)} | Down: ${scenario.downPct}% | ` +
      (usingFairPar
        ? `Fair Par Rate (LLPA-adjusted for this borrower's credit/LTV/program${scenario.fairParCounty ? `, ${scenario.fairParCounty}` : ''}): ${scenario.fairParRate!.toFixed(3)}%`
        : `FRED 30yr Benchmark: ${scenario.rate.toFixed(3)}%`) +
      ` | LTV: ${(scenario.ltv * 100).toFixed(1)}%`,
    ...(factLines.length > 0 ? ['', 'DETERMINISTIC FACTS (already extracted/computed by HomeRates — treat as ground truth; do not re-derive, re-parse, or contradict these):', ...factLines] : []),
    ...(loanTypeContext.length > 0 ? ['', ...loanTypeContext] : []),
    '',
    'INSTRUCTIONS — stay strictly within the topic above.',
    '1. Write a 2-3 sentence assessment for the borrower:',
    '   (a) If a deterministic gap status is provided above, explain in plain English WHY that status makes sense given the numbers already shown — do not recompute the spread or state a different status.',
    '   (b) If no deterministic value was extracted, say plainly that no specific figure was quoted yet — do not guess one from the reply text.',
    '   (c) COMPLETENESS: identify any sub-topics from the list above that were genuinely not addressed in the reply.',
    '2. If ANY sub-topic is missing OR a commitment is vague/unverifiable: write ONE focused follow-up question the borrower can send. If ALL sub-topics are fully and concretely addressed: set followUp to an empty string.',
    '',
    'Return valid JSON only — no markdown, no extra text:',
    '{"analysis":"2-3 sentence assessment explaining the deterministic status and coverage check","followUp":"One specific follow-up question, or empty string if all sub-topics were addressed"}',
  ].join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const { loReply, chipTitle, chipSubtopics, loanType, scenario, extractedValue, gapStatus, gapNote, costFacts } = await req.json();

    if (!loReply?.trim()) return NextResponse.json({ error: 'loReply required' }, { status: 400 });
    if (!chipTitle)       return NextResponse.json({ error: 'chipTitle required' }, { status: 400 });
    if (!scenario?.price) return NextResponse.json({ error: 'scenario required' }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI unavailable' }, { status: 503 });

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 420,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt({ chipTitle, chipSubtopics, loanType: loanType ?? 'conventional', scenario, extractedValue, gapStatus, gapNote, costFacts }),
          },
          {
            role: 'user',
            content: `LO's response:\n\n${loReply.trim()}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[discover/analyze-reply] OpenAI error:', err);
      return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
    }

    const data = await res.json();
    const raw  = data.choices?.[0]?.message?.content?.trim() ?? '{}';

    let parsed: { analysis?: string; followUp?: string } = {};
    try { parsed = JSON.parse(raw); } catch { /* malformed — return empty */ }

    return NextResponse.json({
      analysis:  parsed.analysis  ?? '',
      followUp:  parsed.followUp  ?? '',
    });
  } catch (err) {
    console.error('[discover/analyze-reply]', err);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
