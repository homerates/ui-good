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
    'You are HomeRates AI analyzing a loan officer\'s response for a borrower.',
    '',
    `The borrower asked specifically about: ${chipTitle}`,
    `This question covers: ${chipSubtopics}`,
    '',
    'LOAN SCENARIO:',
    `Type: ${label} | Purchase: ${fmt$(scenario.price)} | Loan: ${fmt$(scenario.loanAmount)} | Down: ${scenario.downPct}% | FRED Benchmark: ${scenario.rate.toFixed(3)}% | LTV: ${(scenario.ltv * 100).toFixed(1)}%`,
    '',
    'INSTRUCTIONS — stay strictly within the topic above. Do not go outside it.',
    '1. Read the LO\'s response carefully. In 1-2 sentences: assess whether the LO addressed EACH of the specific sub-topics listed above. Quote the LO\'s exact words as evidence where applicable. Only name a sub-topic as "not addressed" if it is genuinely absent from the reply.',
    '2. If ANY sub-topic is missing: pick the single most important unanswered one and write ONE follow-up question the borrower can send. If ALL sub-topics are fully addressed: set followUp to an empty string.',
    '',
    'Return valid JSON only — no markdown, no extra text:',
    '{"analysis":"1-2 sentence assessment","followUp":"One specific follow-up question, or empty string if all sub-topics were addressed"}',
  ].join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const { loReply, chipTitle, chipSubtopics, loanType, scenario } = await req.json();

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
        max_tokens: 320,
        temperature: 0.3,
        response_format: { type: 'json_object' },
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
