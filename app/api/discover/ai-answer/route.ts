// app/api/discover/ai-answer/route.ts
// POST — Ask AI open-text question within the Discover dock.
// Uses the borrower's scenario snapshot for context.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

function fmt$(n: number) {
  return '$' + Math.round(n).toLocaleString();
}

function buildSystemPrompt(loanType: string, snap: {
  price: number; loanAmount: number; downPct: number;
  rate: number; term: number; ltv: number; monthlyPayment: number;
}): string {
  const typeLabel: Record<string, string> = {
    fha: 'FHA', conventional: 'Conventional', va: 'VA', jumbo: 'Jumbo',
  };
  const label = typeLabel[loanType] ?? loanType.toUpperCase();
  return [
    'You are HomeRates AI, an expert mortgage analyst embedded in the HomeRates Discover tool.',
    'The borrower has a specific loan scenario and is evaluating a lender quote. Answer their question using the scenario numbers below.',
    'Be direct and specific. Use actual dollar figures from the scenario. Keep answers under 5 sentences.',
    'You are an educational tool — not a licensed advisor. Do not provide financial advice. Avoid legal language.',
    '',
    `SCENARIO:`,
    `Loan Type: ${label}`,
    `Purchase Price: ${fmt$(snap.price)}`,
    `Loan Amount: ${fmt$(snap.loanAmount)}`,
    `Down Payment: ${snap.downPct}%`,
    `Benchmark Rate: ${snap.rate.toFixed(3)}%`,
    `Term: ${snap.term} years`,
    `LTV: ${(snap.ltv * 100).toFixed(1)}%`,
    `Est. Monthly Payment: ${fmt$(snap.monthlyPayment)}/mo`,
  ].join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const { question, loanType, scenario } = await req.json();

    if (!question?.trim()) {
      return NextResponse.json({ error: 'question required' }, { status: 400 });
    }
    if (!scenario?.price || !scenario?.rate) {
      return NextResponse.json({ error: 'scenario required' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI unavailable' }, { status: 503 });
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 300,
        temperature: 0.3,
        messages: [
          { role: 'system', content: buildSystemPrompt(loanType ?? 'conventional', scenario) },
          { role: 'user',   content: question.trim() },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[discover/ai-answer] OpenAI error:', err);
      return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
    }

    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content?.trim() ?? '';
    return NextResponse.json({ answer });
  } catch (err) {
    console.error('[discover/ai-answer]', err);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
