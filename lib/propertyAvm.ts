// lib/propertyAvm.ts
// Single source of truth for "what is this property worth right now" — shared between
// app/api/homeowner/analysis/route.ts (wealth-building journey: equity/HELOC/refi for an
// owned/sold property) and app/api/property/lookup/route.ts (buying journey: comps/social
// proof for a for-sale listing, but ALSO needs a current value once a listing goes
// SOLD/OFF_MARKET — e.g. a buyer glancing at a sold comp).
//
// Extracted 2026-07-30 after an audit found the two pipelines computed "current value" for
// a SOLD/OFF_MARKET property two different ways — homeowner/analysis with a rigorous 4-tier
// system (live Redfin estimate → cached DB estimate → FHFA appreciation model → list-price
// fallback, each sanity-checked against the known sale price), property/lookup with a single
// "estimatedValue ?? lastSalePrice" shortcut. Same property, same status, two different
// numbers depending on which page you were on. The two pipelines still branch on
// listingStatus for everything that's genuinely journey-specific (buying-journey social
// proof/comps vs wealth-journey HELOC/refi/payoff) — this module only unifies the one number
// that has to agree everywhere: the property's current value.
//
// No I/O, no imports at all — safe to import from either API route, and trivially testable
// standalone. The FHFA state-appreciation rate lookup is injected by the caller (both API
// routes already import it from lib/homeownerCalc.ts) rather than imported here, so this
// module has zero dependencies of its own.

export const AVM_MAX = 50_000_000; // $50M residential cap

export type AvmSource = 'redfin_estimate' | 'fhfa' | 'ai_estimate';

export interface AvmTierInput {
  /** Historical/last-known sale price — the FHFA tier's baseline and every tier's sanity-check anchor. */
  salePrice: number | null;
  /** Parsed sale date — drives the FHFA appreciation model's years-elapsed. */
  saleDate: Date | null;
  /** 2-letter state code, for the FHFA state-level appreciation rate. */
  stateCode: string | null;
  /** A live "current value" reading — a scraped Redfin Estimate, Zestimate, etc. Highest-confidence tier. */
  liveAvmCandidate: number | null;
  /** A previously-stored "current value" reading (e.g. a cached DB column). Same confidence tier as liveAvmCandidate — used only when no fresher live reading exists. */
  dbEstCandidate: number | null;
  /** List/last-known asking price — lowest-confidence tier, used only when nothing else produced a value. */
  listPriceCandidate: number | null;
  /** User/LO-entered override — always wins outright, no sanity check. */
  actualValueOverride: number | null;
  /**
   * Whether liveAvmCandidate/dbEstCandidate/listPriceCandidate should be trusted at all.
   * False when the caller already has LO-entered financials on file — a live-scraped estimate
   * must never silently override data an LO already confirmed.
   */
  trustScrapedEstimates: boolean;
}

export interface AvmTierResult {
  estimatedValue: number | null;
  estimatedValueLow: number | null;
  estimatedValueHigh: number | null;
  avmSource: AvmSource;
}

/**
 * FHFA appreciation model: salePrice × (1 + stateAnnualRate)^yearsElapsed.
 * Capped at 50 years elapsed — compounding beyond that produces nonsensical residential AVMs.
 * Returns null when there's no sale price or no parseable sale date to anchor the model.
 */
function fhfaAppreciatedValue(salePrice: number | null, saleDate: Date | null, annualRate: number): number | null {
  if (!salePrice || !saleDate) return null;
  const yearsElapsed = Math.min(50, Math.max(0, (Date.now() - saleDate.getTime()) / (365.25 * 24 * 3600 * 1000)));
  return Math.round(salePrice * Math.pow(1 + annualRate, yearsElapsed));
}

/**
 * @param getFhfaRate State-level annual appreciation rate lookup, as a percentage (e.g. 5.8 for
 *   5.8%/yr), given a 2-letter state code. Both call sites pass lib/homeownerCalc.ts's fhfaRate —
 *   injected here (rather than imported directly) so this module stays dependency-free.
 */
export function computeAvmTier(input: AvmTierInput, getFhfaRate: (state: string | null) => number): AvmTierResult {
  const {
    salePrice, saleDate, stateCode,
    liveAvmCandidate, dbEstCandidate, listPriceCandidate,
    actualValueOverride, trustScrapedEstimates,
  } = input;

  // Tier: FHFA appreciation model — the baseline whenever we have sale price + date, regardless
  // of whether a live/cached estimate exists (a live estimate tier below still wins if sane).
  const annualRate = getFhfaRate(stateCode) / 100;
  let estimatedValue = fhfaAppreciatedValue(salePrice, saleDate, annualRate);
  let estimatedValueLow  = estimatedValue ? Math.round(estimatedValue * 0.92) : null;
  let estimatedValueHigh = estimatedValue ? Math.round(estimatedValue * 1.08) : null;

  // Sanity check shared by every scraped/cached tier below: any automated estimate under 75%
  // of the known sale price means the source was the wrong page/listing, not a real current value.
  const passesFloor = (v: number | null) => !!(v && salePrice ? v >= salePrice * 0.75 : v != null);

  const rawLiveAvm = (trustScrapedEstimates && liveAvmCandidate && liveAvmCandidate > 50_000 && liveAvmCandidate <= AVM_MAX)
    ? liveAvmCandidate : null;
  const liveAvm = passesFloor(rawLiveAvm) ? rawLiveAvm : null;

  const rawDbEst = (trustScrapedEstimates && !liveAvm && dbEstCandidate && dbEstCandidate > 50_000 && dbEstCandidate <= AVM_MAX)
    ? dbEstCandidate : null;
  // A DB estimate that ≈ the sale price means the Redfin Estimate was never correctly
  // extracted and the purchase price leaked into the AVM field — not a real current value.
  const dbEstIsOldSalePrice = !!(rawDbEst && salePrice && Math.abs(rawDbEst - salePrice) / salePrice < 0.02);
  const dbEst = (!passesFloor(rawDbEst) || dbEstIsOldSalePrice) ? null : rawDbEst;

  const rawListPriceEst = (trustScrapedEstimates && !liveAvm && !dbEst && listPriceCandidate && listPriceCandidate > 50_000 && listPriceCandidate <= AVM_MAX)
    ? listPriceCandidate : null;
  const listPriceEst = passesFloor(rawListPriceEst) ? rawListPriceEst : null;

  const avmSource: AvmSource =
    actualValueOverride ? 'redfin_estimate'
    : (liveAvm || dbEst) ? 'redfin_estimate'
    : estimatedValue ? 'fhfa'
    : 'ai_estimate';

  if (actualValueOverride && actualValueOverride > 50_000) {
    estimatedValue     = actualValueOverride;
    estimatedValueLow  = Math.round(estimatedValue * 0.95);
    estimatedValueHigh = Math.round(estimatedValue * 1.05);
  } else if (liveAvm) {
    estimatedValue     = liveAvm;
    estimatedValueLow  = Math.round(liveAvm * 0.93);
    estimatedValueHigh = Math.round(liveAvm * 1.07);
  } else if (dbEst) {
    estimatedValue     = dbEst;
    estimatedValueLow  = Math.round(dbEst * 0.93);
    estimatedValueHigh = Math.round(dbEst * 1.07);
  } else if (!estimatedValue && listPriceEst) {
    estimatedValue     = listPriceEst;
    estimatedValueLow  = Math.round(listPriceEst * 0.90);
    estimatedValueHigh = Math.round(listPriceEst * 1.10);
  }

  return { estimatedValue, estimatedValueLow, estimatedValueHigh, avmSource };
}
