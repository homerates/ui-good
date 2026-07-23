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
  resolveObmmiSeriesId,
  CONFORMING_OBMMI_SERIES_IDS,
  type LLPAInput,
  type LoanType,
} from '../../../lib/pricing/llpa-engine';
import { getStateLimitInfo } from '../../../lib/pricing/conforming-limits';
import { getLatestValue, getLatest, getSnapshot } from '../../../lib/market-data';

// AD-11 Seam 2: was its own direct FRED fetch (byte-identical duplicate also
// existed in app/api/rate-marketplace/route.ts) -- now reads the synced
// value from Market Data Service. Fallback only fires if MORTGAGE30US has
// genuinely never synced (cold start), not on every request as before.
const FALLBACK_PAR_RATE = 6.82;

async function fetchParRate(): Promise<number> {
  return getLatestValue('MORTGAGE30US', FALLBACK_PAR_RATE);
}

const VALID_LOAN_TYPES: LoanType[] = ['conventional', 'fha', 'va', 'jumbo', 'dscr'];

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
    ![15, 30, 45, 60].includes(lockDays) ||
    // AD-11 Seam 3b: loanType is new -- default to 'conventional' so any
    // caller that hasn't been updated to send it yet keeps working exactly
    // as before (the only current caller, RateEngineClient.tsx, now sends it).
    (body.loanType !== undefined && !VALID_LOAN_TYPES.includes(body.loanType))
  ) {
    return NextResponse.json({ error: 'Missing or invalid input fields' }, { status: 400 });
  }
  const loanType: LoanType = body.loanType ?? 'conventional';

  if (creditScore < 580 || creditScore > 850) {
    return NextResponse.json({ error: 'creditScore must be 580–850' }, { status: 400 });
  }
  if (ltv < 1 || ltv > 97) {
    return NextResponse.json({ error: 'LTV must be 1–97' }, { status: 400 });
  }
  if (loanAmount < 50_000 || loanAmount > 10_000_000) {
    return NextResponse.json({ error: 'loanAmount out of range' }, { status: 400 });
  }

  // County-aware conforming limit lookup.
  // If the client already resolved an exact county ceiling (via ZIP lookup), trust it.
  // Otherwise fall back to the state-level max ceiling.
  const stateLimitInfo = getStateLimitInfo(body.state ?? '');
  const engineInput: LLPAInput = {
    ...body,
    loanType,
    highBalanceCeiling:
      typeof body.highBalanceCeiling === 'number'
        ? body.highBalanceCeiling
        : stateLimitInfo.ceiling,
  };

  // AD-11 Seam 3b: resolve + fetch the real OBMMI segment rate for this
  // scenario. Null for dscr (not covered by OBMMI) or if this segment
  // genuinely hasn't synced yet -- computeLLPA falls back to the fully
  // synthetic parRate + LLPA-matrix path in either case. When loanType is
  // 'conventional', also batch-fetch every conforming segment so the
  // negotiation brief can quote real neighboring-segment rates.
  const obmmiSeriesId = resolveObmmiSeriesId(loanType, creditScore, ltv);
  const [parRate, marketObs, conformingSnapshot] = await Promise.all([
    fetchParRate(),
    obmmiSeriesId ? getLatest(obmmiSeriesId) : Promise.resolve(null),
    loanType === 'conventional' ? getSnapshot(CONFORMING_OBMMI_SERIES_IDS) : Promise.resolve(null),
  ]);
  const marketRate = marketObs?.value ?? null;

  const result = computeLLPA(engineInput, parRate, marketRate);

  if ('ineligible' in result && result.ineligible) {
    return NextResponse.json({ error: result.ineligible, ineligible: true }, { status: 422 });
  }

  const { index: recommendedIdx, reasoning } = recommendCurvePoint(result.rateCurve);
  const conformingSegmentRates: Record<string, number | null> | undefined = conformingSnapshot
    ? Object.fromEntries(Object.entries(conformingSnapshot).map(([id, obs]) => [id, obs?.value ?? null]))
    : undefined;
  const negotiationBrief = buildNegotiationBrief(engineInput, result, parRate, conformingSegmentRates);

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
