// app/api/rate-marketplace/discover/route.ts
// AI-powered discover dialogue for a specific lender rate offer.
// Borrower asks questions; AI answers using rate + scenario context.
// Lender identity is NEVER mentioned — always "this lender" / "this offer".

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

const GROK_URL = 'https://api.x.ai/v1/chat/completions';

type MsgRole = 'user' | 'assistant';
interface Msg { role: MsgRole; content: string; }

export async function POST(req: NextRequest) {
  const XAI_API_KEY = process.env.XAI_API_KEY;
  if (!XAI_API_KEY) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
  }

  let body: {
    rate: number; apr: number; monthly: number; estClosingCosts: number;
    scenario: Record<string, unknown>;
    messages: Msg[];
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { rate, apr, monthly, estClosingCosts, scenario, messages } = body;

  if (typeof rate !== 'number' || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const userMsgCount = messages.filter(m => m.role === 'user').length;

  const systemMsg = `You are a mortgage rate intelligence assistant on HomeRates.ai, helping a borrower understand a specific rate offer from an anonymous lender.

RATE OFFER:
- Rate: ${rate.toFixed(3)}% (30-year fixed, PAR — no discount points, no lender credits)
- APR: ${apr.toFixed(3)}%
- Monthly payment (P&I only): $${monthly.toLocaleString()}
- Est. third-party closing costs used in APR: $${estClosingCosts.toLocaleString()} (title, escrow, appraisal, recording — NOT a lender charge)

BORROWER SCENARIO:
- Loan amount: $${Number(scenario.loanAmount ?? 0).toLocaleString()}
- LTV: ${scenario.ltv}%
- Credit score range: ${creditBand(Number(scenario.creditScore ?? 720))}
- Occupancy: ${scenario.occupancy}
- Loan purpose: ${scenario.loanPurpose}
- Lock period: ${scenario.lockDays} days
- State: ${scenario.state}
- Loan type: ${scenario.loanType}

RULES:
- NEVER reveal lender identity. Always say "this lender" or "this offer" — never a name.
- Only use publicly available facts: CFPB guidelines, Fannie Mae LLPA rules, standard mortgage industry knowledge.
- Do NOT promise what this specific lender will or won't do. Use "typically", "standard practice is", "ask them for...".
- For lender-specific questions (timeline, underwriting speed, overlays), acknowledge uncertainty and suggest asking directly when they connect.
- Keep responses to 2–3 sentences max. The borrower is in an inline chat.
- Be direct, educational, and conversational — not salesy. No filler phrases.`;

  const res = await fetch(GROK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-3-mini',
      messages: [{ role: 'system', content: systemMsg }, ...messages],
      max_tokens: 250,
      temperature: 0.35,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'AI upstream error' }, { status: 502 });
  }

  const json = await res.json();
  const response: string = json.choices?.[0]?.message?.content
    ?? "I couldn't generate a response. Please try again.";

  // Surface connect CTA after 3 user messages
  const showConnectCTA = userMsgCount >= 3;

  return NextResponse.json({ response, showConnectCTA });
}

function creditBand(score: number): string {
  if (score >= 760) return '760+';
  if (score >= 740) return '740–759';
  if (score >= 720) return '720–739';
  if (score >= 700) return '700–719';
  if (score >= 680) return '680–699';
  if (score >= 660) return '660–679';
  if (score >= 640) return '640–659';
  if (score >= 620) return '620–639';
  return '<620';
}
