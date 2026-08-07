// lib/pricing/jumboEstimate.ts
//
// Jumbo has exactly one real OBMMI data point (OBMMIJUMBO30YF, a flat
// national average) — unlike conventional's 10 real credit/LTV-segmented
// series. That means jumbo borrowers historically got zero credit/LTV
// differentiation even when the real average was available (llpa-engine.ts's
// `usingObmmi` gate excludes any adjustment once an OBMMI anchor exists).
// A large share of California loans are jumbo, so this module adds a
// deterministic, auditable credit/LTV/occupancy adjustment layered on top of
// the real jumbo anchor whenever it's available — the "real-jumbo" case,
// which the sync cron keeps current, so this is the everyday path. Only when
// jumbo's own series is genuinely unsynced does this fall back to
// conforming + an observed trailing spread. Never a model-guessed number —
// every input is either a real synced observation or a fixed, documented
// coefficient.

import { getLatest, getRange } from '../market-data';

export interface JumboAdjustmentInput {
  creditScore: number;
  ltv: number; // 0-100
  occupancy: 'primary' | 'second' | 'investment';
  loanPurpose: 'purchase' | 'rate_term_refi' | 'cash_out_refi';
}

export interface JumboAnchorResult {
  anchorRate: number;
  baseAnchor: number;
  baseSource: 'real-jumbo' | 'conforming-plus-spread';
  spreadUsed: number | null;
  spreadSource: 'live-trailing' | 'hardcoded-fallback' | null;
  adjustmentDelta: number;
  conformingRate: number | null;
  clamped: boolean;
}

const FALLBACK_SPREAD = 0.25;
const CLAMP_BELOW = 0.50;
const CLAMP_ABOVE = 0.75;

// ── Credit/LTV/occupancy/purpose adjustment (rate-percent delta, not LLPA points) ──
export function computeAdjustmentDelta({ creditScore, ltv, occupancy, loanPurpose }: JumboAdjustmentInput): number {
  let delta: number;
  if (creditScore >= 740 && ltv <= 80) delta = -0.125;
  else if ((creditScore >= 700 && creditScore <= 739) || (ltv > 80 && ltv <= 90)) delta = 0;
  else if ((creditScore >= 680 && creditScore <= 699) || (ltv > 90 && ltv <= 95)) delta = 0.125;
  else delta = 0.375; // creditScore < 680 or ltv > 95

  if (occupancy === 'second') delta += 0.125;
  if (occupancy === 'investment') delta += 0.25;
  if (loanPurpose === 'cash_out_refi') delta += 0.125;

  return parseFloat(delta.toFixed(3));
}

function clampToConforming(rate: number, conformingRate: number | null): { rate: number; clamped: boolean } {
  if (conformingRate == null) return { rate, clamped: false };
  const lo = conformingRate - CLAMP_BELOW;
  const hi = conformingRate + CLAMP_ABOVE;
  if (rate < lo) return { rate: parseFloat(lo.toFixed(3)), clamped: true };
  if (rate > hi) return { rate: parseFloat(hi.toFixed(3)), clamped: true };
  return { rate, clamped: false };
}

// ── Trailing spread — only reached when OBMMIJUMBO30YF itself hasn't synced ──
async function computeTrailingSpread(): Promise<{ value: number; source: 'live-trailing' | 'hardcoded-fallback' }> {
  const start = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const [jumboRange, conformingRange] = await Promise.all([
    getRange('OBMMIJUMBO30YF', { start }),
    getRange('OBMMIC30YF', { start }),
  ]);
  const jVals = jumboRange.slice(-10).map(o => o.value).filter((v): v is number => v != null);
  const cVals = conformingRange.slice(-10).map(o => o.value).filter((v): v is number => v != null);
  if (jVals.length < 5 || cVals.length < 5) return { value: FALLBACK_SPREAD, source: 'hardcoded-fallback' };
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  return { value: parseFloat((avg(jVals) - avg(cVals)).toFixed(3)), source: 'live-trailing' };
}

export async function estimateJumboAnchor(input: JumboAdjustmentInput): Promise<JumboAnchorResult | null> {
  const [jumboLatest, conformingLatest] = await Promise.all([
    getLatest('OBMMIJUMBO30YF'),
    getLatest('OBMMIC30YF'),
  ]);
  const conformingRate = conformingLatest?.value ?? null;
  const adjustmentDelta = computeAdjustmentDelta(input);

  let baseAnchor: number;
  let baseSource: JumboAnchorResult['baseSource'];
  let spreadUsed: number | null = null;
  let spreadSource: JumboAnchorResult['spreadSource'] = null;

  if (jumboLatest?.value != null) {
    baseAnchor = jumboLatest.value;
    baseSource = 'real-jumbo';
  } else if (conformingRate != null) {
    const spread = await computeTrailingSpread();
    spreadUsed = spread.value;
    spreadSource = spread.source;
    baseAnchor = conformingRate + spread.value;
    baseSource = 'conforming-plus-spread';
  } else {
    // Neither series has ever synced — true cold start. Caller keeps its
    // existing parRate-only synthetic fallback unchanged in this case.
    return null;
  }

  const { rate: anchorRate, clamped } = clampToConforming(
    parseFloat((baseAnchor + adjustmentDelta).toFixed(3)),
    conformingRate,
  );

  return { anchorRate, baseAnchor, baseSource, spreadUsed, spreadSource, adjustmentDelta, conformingRate, clamped };
}

// ── Illustrative 10-segment table (5 FICO tiers × 2 LTV bands), mirroring the
// shape of conventional's real 10-series array so the chart/L5 scoring can
// treat them identically — always estimated, never a real per-segment series. ──
const FICO_TIERS: { credit: number; label: string }[] = [
  { credit: 660, label: 'FICO<680' },
  { credit: 690, label: 'FICO 680-699' },
  { credit: 710, label: 'FICO 700-719' },
  { credit: 730, label: 'FICO 720-739' },
  { credit: 760, label: 'FICO>=740' },
];
const LTV_BANDS: { ltv: number; label: string }[] = [
  { ltv: 75, label: 'LTV<=80' },
  { ltv: 90, label: 'LTV>80' },
];

/** Mirrors resolveObmmiSeriesId's conventional bucketing so callers can find "my segment" among buildEstimatedJumboSegments' output. */
export function resolveJumboSegmentId(creditScore: number, ltv: number): string {
  const band = ltv <= 80 ? LTV_BANDS[0] : LTV_BANDS[1];
  const tier =
    creditScore < 680 ? FICO_TIERS[0] :
    creditScore <= 699 ? FICO_TIERS[1] :
    creditScore <= 719 ? FICO_TIERS[2] :
    creditScore <= 739 ? FICO_TIERS[3] :
    FICO_TIERS[4];
  return `JUMBO_EST_${band.label.replace(/[^A-Z0-9]/gi, '')}_${tier.label.replace(/[^A-Z0-9]/gi, '')}`;
}

export function buildEstimatedJumboSegments(baseAnchor: number): { label: string; seriesId: string; rate: number }[] {
  const segments: { label: string; seriesId: string; rate: number }[] = [];
  for (const band of LTV_BANDS) {
    for (const tier of FICO_TIERS) {
      const delta = computeAdjustmentDelta({
        creditScore: tier.credit, ltv: band.ltv, occupancy: 'primary', loanPurpose: 'purchase',
      });
      segments.push({
        label: `Jumbo (estimated): ${band.label}, ${tier.label}`,
        seriesId: `JUMBO_EST_${band.label.replace(/[^A-Z0-9]/gi, '')}_${tier.label.replace(/[^A-Z0-9]/gi, '')}`,
        rate: parseFloat((baseAnchor + delta).toFixed(3)),
      });
    }
  }
  return segments;
}
