// app/api/rate-intelligence-engine/route.ts
// POST — fetch live FRED 30y par rate + compute LLPA breakdown + rate curve.
// Public endpoint (no auth required) — consumer-facing tool.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  computeLLPA,
  buildNegotiationBrief,
  recommendCurvePoint,
  type LLPAInput,
} from '../../../lib/pricing/llpa-engine';
import { getStateLimitInfo } from '../../../lib/pricing/conforming-limits';

const FALLBACK_PAR_RATE = 6.82; // used if FRED fetch fails

async function fetchParRate(): Promise<number> {
  const key = process.env.FRED_API_KEY ?? '';
  if (!key) return FALLBACK_PAR_RATE;
  try {
    const url =
      `https://api.stlouisfed.org/fred/series/observations` +
      `?series_id=MORTGAGE30US&api_key=${key}&file_type=json&sort_order=desc&limit=1`;
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!r.ok) return FALLBACK_PAR_RATE;
    const json = await r.json();
    const val = parseFloat(json.observations?.[0]?.value ?? '');
    return isNaN(val) ? FALLBACK_PAR_RATE : val;
  } catch {
    return FALLBACK_PAR_RATE;
  }
}

export async function POST(req: NextRequest) {
  let body: LLPAInput & { state?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Basic input validation
  const { creditScore, ltv, occupancy, loanPurpose, propertyType, loanAmount, lockDays } = body;
  if (
    typeof creditScore !== 'number' ||
    typeof ltv !== 'number' ||
    typeof loanAmount !== 'number' ||
    !['primary', 'second', 'investment'].includes(occupancy) ||
    !['purchase', 'rate_term_refi', 'cash_out_refi'].includes(loanPurpose) ||
    !['sfr', '2unit', '3_4unit', 'condo', 'manufactured'].includes(propertyType) ||
    ![15, 30, 45, 60].includes(lockDays)
  ) {
    return NextResponse.json({ error: 'Missing or invalid input fields' }, { status: 400 });
  }

  if (creditScore < 580 || creditScore > 850) {
    return NextResponse.json({ error: 'creditScore must be 580–850' }, { status: 400 });
  }
  if (ltv < 1 || ltv > 97) {
    return NextResponse.json({ error: 'LTV must be 1–97' }, { status: 400 });
  }
  if (loanAmount < 50_000 || loanAmount > 10_000_000) {
    return NextResponse.json({ error: 'loanAmount out of range' }, { status: 400 });
  }

  // County-aware conforming limit lookup
  const stateLimitInfo = getStateLimitInfo(body.state ?? '');
  const engineInput: LLPAInput = {
    ...body,
    highBalanceCeiling: stateLimitInfo.ceiling,
  };

  const parRate = await fetchParRate();
  const result  = computeLLPA(engineInput, parRate);

  if ('ineligible' in result && result.ineligible) {
    return NextResponse.json({ error: result.ineligible, ineligible: true }, { status: 422 });
  }

  const { index: recommendedIdx, reasoning } = recommendCurvePoint(result.rateCurve);
  const negotiationBrief = buildNegotiationBrief(engineInput, result, parRate);

  return NextResponse.json({
    ...result,
    parRate,
    lenderParRate: parseFloat((parRate + result.rateEquivalent).toFixed(3)),
    recommendedCurvePoint: {
      point: result.rateCurve[recommendedIdx],
      reasoning,
    },
    negotiationBrief,
    // Expose limit context to the UI
    conformingBaseline:  stateLimitInfo.baseline,
    highBalanceCeiling:  stateLimitInfo.ceiling,
    isHighCostState:     stateLimitInfo.isHighCostState,
    stateName:           stateLimitInfo.stateName,
  });
}
