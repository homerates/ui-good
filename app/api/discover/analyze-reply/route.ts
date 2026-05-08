// app/api/discover/analyze-reply/route.ts
// POST — AI analysis of an LO's chat response in the context of a specific chip question.
// Returns actionable insight: was the answer specific? what's missing? what to ask next?

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

function fmt$(n: number) {
  return '$' + Math.round(n).toLocaleString();
}

function buildSystemPrompt(params: {
  chipTitle: string;
  chipSubtopics: string;
  loanType: string;
  scenario: {
    price: number; loanAmount: number; downPct: number;
    rate: number; term: number; ltv: number; monthlyPayment: number;
  };
}): string {
  const { chipTitle, chipSubtopics, loanType, scenario } = params;
  const typeLabel: Record<string, string> = {
    fha: 'FHA', conventional: 'Conventional', va: 'VA', jumbo: 'Jumbo',
  };
  const label = typeLabel[loanType] ?? loanType.toUpperCase();

  return [
    'You are HomeRates AI, embedded in the Discover evaluation tool. A borrower asked their loan officer a specific question and you are analyzing the LO\'s response.',
    '',
    `QUESTION TOPIC: ${chipTitle}`,
    `COVERS: ${chipSubtopics}`,
    '',
    'LOAN SCENARIO:',
    `Loan Type: ${label}`,
    `Purchase Price: ${fmt$(scenario.price)}`,
    `Loan Amount: ${fmt$(scenario.loanAmount)}`,
    `Down Payment: ${scenario.downPct}%`,
    `FRED Benchmark Rate: ${scenario.rate.toFixed(3)}%`,
    `Term: ${scenario.term} years`,
    `LTV: ${(scenario.ltv * 100).toFixed(1)}%`,
    `Est. Monthly P&I: ${fmt$(scenario.monthlyPayment)}/mo`,
    '',
    'Analyze the LO\'s reply in 2–4 sentences. Be direct and specific:',
    '1. State whether the LO gave a concrete, specific answer or a vague/incomplete one.',
    '2. Identify the single most important piece of information that is missing.',
    '3. Give the borrower ONE precise follow-up question they can paste directly into the chat.',
    '',
    'Speak to the borrower, not the LO. Do not repeat back what the LO said verbatim. Be honest but professional.',
  ].join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const { loReply, chipTitle, chipSubtopics, loanType, scenario } = await req.json();

    if (!loReply?.trim())    return NextResponse.json({ error: 'loReply required' }, { status: 400 });
    if (!chipTitle)          return NextResponse.json({ error: 'chipTitle required' }, { status: 400 });
    if (!scenario?.price)    return NextResponse.json({ error: 'scenario required' }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI unavailable' }, { status: 503 });

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 250,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt({ chipTitle, chipSubtopics, loanType: loanType ?? 'conventional', scenario }),
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

    const data     = await res.json();
    const analysis = data.choices?.[0]?.message?.content?.trim() ?? '';
    return NextResponse.json({ analysis });
  } catch (err) {
    console.error('[discover/analyze-reply]', err);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
