// lib/pricing/llpa-engine.ts
// Fannie Mae LLPA (Loan-Level Price Adjustment) engine.
//
// Matrix source: https://singlefamily.fanniemae.com/media/9391/display
// (LLPA Matrix, incorporated by reference into the Selling Guide).
// Effective 01/28/2026. This is the version live at the cited URL as of the
// Workstream 1 LLPA correction (2026-08-19) -- re-verify against that same
// URL before assuming these tables are still current; Fannie republishes
// this document periodically and it "supersedes any earlier dated version."
//
// Base credit-score/LTV tables (BASE_LLPA_PURCHASE/LCOR/CASHOUT below) are a
// direct transcription of the Matrix's Tables 1-3 (Purchase Money,
// Limited Cash-out Refinance, Cash-out Refinance), each keyed by its own
// credit-score x LTV grid -- these are NOT the same numbers with a purpose
// surcharge layered on top; Fannie prices each purpose on a structurally
// different grid, most visibly for cash-out (steeper, and LTV-capped at 80%
// -- there is no cash-out pricing above 80% LTV in this Matrix at all).
//
// All values are in price POINTS (1 point = 1% of loan amount).
//
// DTI-based LLPAs do NOT exist in the current Matrix. They were introduced
// in Lender Letter LL-2023-01 (2023) and then explicitly REMOVED effective
// 01/24/24 per LL-2023-06 ("Removed all DTI ratio-based LLPAs from this
// Matrix") -- confirmed directly from the Matrix's own Change Tracking Log
// (page 9 of the source PDF). No DTI input belongs in this engine.

export const LLPA_MATRIX_EFFECTIVE_DATE = '2026-01-28';

export const LLPA_DATA_SOURCE =
  "Fannie Mae Loan-Level Price Adjustment (LLPA) Matrix, effective 01/28/2026 — singlefamily.fanniemae.com/media/9391/display (publicly available). This Matrix supersedes any earlier dated version; re-verify before relying on it for a lending decision.";

// Boundary, resolved as a domain decision (2026-08-19): this engine
// calculates PRICE, not eligibility. It must never be read as an approval,
// underwriting, or eligibility determination -- Fannie's own Matrix prices
// every credit score it lists (including its lowest published band) with no
// implication that a given score is or isn't approvable. Eligibility is a
// separate underwriting question this engine does not answer. This
// disclaimer is the one piece of output-semantics boundary that reaches
// every LLPAOutput regardless of input -- see LLPAOutput.disclaimer.
export const LLPA_DISCLAIMER =
  "LLPA estimates are a pricing calculation only — they do not represent or imply loan eligibility, underwriting approval, or a commitment to lend. Based on the publicly posted Fannie Mae matrix. Actual lender pricing varies by loan program, lender margin, and market conditions. Consult a licensed mortgage professional to determine eligibility.";

// AD-11 Seam 3b: short form for LLPAOutput.dataSource when OBMMI anchors the
// rate. Full citation text lives in lib/market-data/registry.ts
// (OBMMI_CITATION) -- import that constant directly rather than
// hand-duplicating its wording here, so the two can never drift apart.
import { OBMMI_CITATION } from '../market-data/registry';
const OBMMI_CITATION_SHORT = OBMMI_CITATION;

// Market convention: 1 price point ≈ 0.25% rate change.
// This ratio shifts with market conditions — update when the market moves significantly.
export const POINTS_PER_QUARTER_PERCENT = 1.0;

// 2026 FHFA standard conforming baseline (all non-high-cost counties)
// High-cost county ceilings vary by county — passed in via input.highBalanceCeiling
export const CONFORMING_BASELINE = 832_750;

// ─── Input / Output types ──────────────────────────────────────────────────────

// Moved here from marketplace-engine.ts (AD-11 Seam 3b) now that loanType
// drives the rate anchor for every caller, not just the marketplace table.
// marketplace-engine.ts re-exports this for import-path compatibility.
export type LoanType = 'conventional' | 'fha' | 'va' | 'jumbo' | 'dscr';

export type LLPAInput = {
  creditScore: number;
  ltv: number;                  // 0–100
  occupancy: 'primary' | 'second' | 'investment';
  loanPurpose: 'purchase' | 'rate_term_refi' | 'cash_out_refi';
  propertyType: 'sfr' | '2unit' | '3_4unit' | 'condo' | 'manufactured';
  loanAmount: number;
  lockDays: 15 | 30 | 45 | 60;
  loanType: LoanType;
  /**
   * Highest conforming 1-unit limit for the borrower's area.
   * Provided by the API route after a state lookup.
   * Defaults to CONFORMING_BASELINE ($832,750) when omitted.
   * Loans above this ceiling are non-conforming — LLPA results are indicative only.
   */
  highBalanceCeiling?: number;
};

/**
 * Maps (loanType, creditScore, ltv) to the OBMMI series ID that anchors this
 * scenario's rate in real observed market data. Returns null for 'dscr' --
 * OBMMI doesn't cover DSCR (a rental-coverage underwriting model, not a
 * credit/LTV-priced product) -- those scenarios keep the fully synthetic
 * parRate + LLPA-matrix path unchanged.
 *
 * FICO/LTV bucket boundaries are read directly from each OBMMI series' own
 * FRED title (e.g. "FICO Score Between 700 and 719"), not inferred.
 */
export function resolveObmmiSeriesId(
  loanType: LoanType,
  creditScore: number,
  ltv: number,
): string | null {
  switch (loanType) {
    case 'fha':   return 'OBMMIFHA30YF';
    case 'va':    return 'OBMMIVA30YF';
    case 'jumbo': return 'OBMMIJUMBO30YF';
    case 'dscr':  return null;
    case 'conventional': {
      const ltvSeg = ltv <= 80 ? 'LE80' : 'GT80';
      const ficoSeg =
        creditScore < 680 ? 'FLT680' :
        creditScore <= 699 ? 'FB680A699' :
        creditScore <= 719 ? 'FB700A719' :
        creditScore <= 739 ? 'FB720A739' :
        'FGE740';
      return `OBMMIC30YFLV${ltvSeg}${ficoSeg}`;
    }
  }
}

export type RateCurvePoint = {
  rate: number;              // e.g. 6.875
  points: number;            // positive = discount (you pay), negative = lender credit (you receive)
  dollarCost: number;        // points * loanAmount / 100 — negative = credit to borrower
  label: 'credit' | 'par' | 'discount';
  breakEvenMonths: number | null; // null for credit (no break-even concept)
};

export type LLPAOutput = {
  totalLLPA: number;           // total price points
  totalLLPADollars: number;    // totalLLPA * loanAmount / 100
  rateEquivalent: number;      // approx rate impact: totalLLPA / 4 in %
  breakdown: { label: string; points: number }[];
  rateCurve: RateCurvePoint[]; // 5 points: +0.5 credit → par → -0.5/-1.0 discount
  /** Loan classification against the conforming limit for the borrower's area */
  conformingStatus: 'standard' | 'high_balance' | 'above_limit';
  dataSource: string;
  disclaimer: string;
  /**
   * 'obmmi' when the headline rate is anchored to a real observed OBMMI
   * segment rate (credit/LTV pricing already baked in, so `breakdown` omits
   * the synthetic "Credit score / LTV (base)" row). 'synthetic' when using
   * the fully synthetic parRate + Fannie LLPA matrix path (dscr, or OBMMI
   * data unavailable).
   */
  rateAnchorSource: 'obmmi' | 'synthetic';
  /** e.g. "Conforming, LTV<=80%, FICO 700-719" -- only set when rateAnchorSource is 'obmmi'. */
  obmmiSegmentLabel?: string;
  /**
   * The resolved anchor (marketRate ?? parRate) plus rateEquivalent -- the
   * single source of truth for "the borrower's par rate," matching
   * rateCurve's own 'par' point exactly. Callers must read this rather than
   * recomputing parRate + rateEquivalent themselves: that formula silently
   * drops the OBMMI anchor and was the root cause of a production bug where
   * the headline rate disagreed with rateCurve on the same page.
   */
  lenderParRate: number;
  /**
   * Transparency data for jumbo scenarios only — echoes lib/pricing/
   * jumboEstimate.ts's estimateJumboAnchor() result so callers can render an
   * "estimated, adjusted for your credit/LTV" disclaimer. Absent for every
   * other loan type. `rateAnchorSource` stays 'obmmi' when baseSource is
   * 'real-jumbo' (still grounded in a real observed number), so this field
   * is the only signal that a credit/LTV adjustment was layered on top.
   */
  jumboEstimate?: {
    baseSource: 'real-jumbo' | 'conforming-plus-spread';
    spreadUsed: number | null;
    spreadSource: 'live-trailing' | 'hardcoded-fallback' | null;
    adjustmentDelta: number;
    conformingRate: number | null;
    clamped: boolean;
  };
};

// ─── Bucket helpers ────────────────────────────────────────────────────────────
// Boundaries match the Matrix's actual published bands exactly (verified
// against Tables 1-3 directly, not assumed). Two corrections from the prior
// implementation: the Matrix's bottom credit row is a single "<= 639" band
// (no further split below that -- the old code's separate "<620" band, and
// its use of a null cell to signal ineligibility at high LTV, did not come
// from this Matrix; see the ineligibility note in computeLLPA below), and
// the Matrix's low-LTV band is a single "60.01-70.00%" row (the old code's
// 60-65 / 65-70 split does not exist in the source).
//
// The Matrix's own "< 30.00%" column is folded into the "<=60%" bucket here:
// its values are identical to the "30.01-60.00%" column in every row except
// the bottom credit tier (<=639), where "<30%" is 0.000% vs "30.01-60%"'s
// 0.125% -- a real but negligible difference (sub-30%-LTV purchases at
// sub-639 credit are a vanishingly rare combination). Using the 30.01-60%
// column's value for the whole "<=60%" bucket is the closest single-value
// representation of that column pair.

function creditBucket(score: number): number {
  if (score <= 639) return 0;
  if (score <= 659) return 1;
  if (score <= 679) return 2;
  if (score <= 699) return 3;
  if (score <= 719) return 4;
  if (score <= 739) return 5;
  if (score <= 759) return 6;
  if (score <= 779) return 7;
  return 8; // >= 780
}

function ltvBucket(ltv: number): number {
  if (ltv <= 60)  return 0;
  if (ltv <= 70)  return 1;
  if (ltv <= 75)  return 2;
  if (ltv <= 80)  return 3;
  if (ltv <= 85)  return 4;
  if (ltv <= 90)  return 5;
  if (ltv <= 95)  return 6;
  return 7; // > 95%, up to 97%
}

// ─── Base LLPA matrices — one per loan purpose ─────────────────────────────────
// Indexed [ltvBucket][creditBucket]. Transcribed directly from the Matrix's
// Tables 1-3 (XLSX version, for exact values -- the PDF's text layout
// mangles several merged cells under naive extraction).
//
// Unlike the prior single-table implementation, Fannie's real matrix has no
// null/ineligible cells anywhere in these three tables -- every credit x LTV
// combination has a real published price, including <=639 credit at >95%
// LTV (1.750% for purchase). The prior code's null cell at "<620, 95-97%
// LTV" (used to trigger an "ineligible" response) was not sourced from this
// document. See the DOMAIN DECISION note on the minimum-credit-score guard
// in computeLLPA.

// Table 1 — Purchase Money Loans
const BASE_LLPA_PURCHASE: number[][] = [
//  credit:  <=639  640-59 660-79 680-99 700-19 720-39 740-59 760-79 >=780
/* <=60  */ [0.125, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000],
/* 60-70 */ [1.500, 1.125, 0.750, 0.625, 0.375, 0.250, 0.125, 0.000, 0.000],
/* 70-75 */ [2.125, 1.500, 1.375, 1.125, 0.875, 0.750, 0.375, 0.250, 0.000],
/* 75-80 */ [2.750, 2.250, 1.875, 1.750, 1.375, 1.250, 0.875, 0.625, 0.375],
/* 80-85 */ [2.875, 2.500, 2.125, 1.875, 1.500, 1.250, 1.000, 0.625, 0.375],
/* 85-90 */ [2.625, 2.000, 1.750, 1.500, 1.250, 1.000, 0.750, 0.500, 0.250],
/* 90-95 */ [2.250, 1.875, 1.625, 1.375, 1.125, 0.875, 0.625, 0.500, 0.250],
/* >95   */ [1.750, 1.500, 1.250, 1.125, 0.875, 0.750, 0.500, 0.250, 0.125],
];

// Table 2 — Limited Cash-out Refinance Loans (i.e. HomeRates' 'rate_term_refi')
const BASE_LLPA_LCOR: number[][] = [
//  credit:  <=639  640-59 660-79 680-99 700-19 720-39 740-59 760-79 >=780
/* <=60  */ [0.375, 0.250, 0.125, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000],
/* 60-70 */ [1.750, 1.375, 1.125, 0.875, 0.625, 0.500, 0.250, 0.125, 0.000],
/* 70-75 */ [2.500, 2.125, 1.875, 1.625, 1.250, 1.000, 0.750, 0.375, 0.125],
/* 75-80 */ [3.500, 2.875, 2.500, 2.250, 1.875, 1.625, 1.125, 0.875, 0.500],
/* 80-85 */ [3.875, 3.375, 3.000, 2.500, 2.125, 1.750, 1.375, 1.000, 0.625],
/* 85-90 */ [3.625, 2.875, 2.375, 2.125, 1.750, 1.500, 1.125, 0.750, 0.500],
/* 90-95 */ [2.500, 2.500, 2.125, 1.750, 1.625, 1.250, 1.000, 0.625, 0.375],
/* >95   */ [2.500, 2.500, 2.125, 1.750, 1.625, 1.250, 1.000, 0.625, 0.375],
];

// Table 3 — Cash-out Refinance Loans. Fannie's cash-out grid does not extend
// past 80% LTV at all -- there is no published cash-out pricing above 80%
// LTV in this Matrix (not "expensive," genuinely absent). computeLLPA()
// treats cash-out above 80% LTV as ineligible via this matrix, matching the
// existing ineligible-response shape used for other out-of-grid scenarios.
const BASE_LLPA_CASHOUT: number[][] = [
//  credit:  <=639  640-59 660-79 680-99 700-19 720-39 740-59 760-79 >=780
/* <=60  */ [1.375, 1.375, 0.875, 0.625, 0.500, 0.500, 0.375, 0.375, 0.375],
/* 60-70 */ [3.375, 3.125, 2.750, 2.000, 1.625, 1.375, 1.000, 0.875, 0.625],
/* 70-75 */ [4.875, 4.625, 4.000, 2.875, 2.625, 2.000, 1.625, 1.250, 0.875],
/* 75-80 */ [5.125, 5.125, 4.750, 3.750, 3.250, 2.750, 2.375, 1.875, 1.375],
];

function baseLLPAFor(purpose: LLPAInput['loanPurpose'], ltv: number, creditScore: number): number | null {
  const cb = creditBucket(creditScore);
  if (purpose === 'cash_out_refi') {
    if (ltv > 80) return null; // out of grid — Fannie does not price cash-out above 80% LTV
    return BASE_LLPA_CASHOUT[ltvBucket(ltv)]?.[cb] ?? null;
  }
  const table = purpose === 'rate_term_refi' ? BASE_LLPA_LCOR : BASE_LLPA_PURCHASE;
  return table[ltvBucket(ltv)]?.[cb] ?? null;
}

// ─── Occupancy surcharge ──────────────────────────────────────────────────────
// Table 1/2's "Investment property" and "Second home" rows are numerically
// IDENTICAL to each other in the current Matrix (verified directly, all
// three loan-purpose tables) -- Fannie currently prices investment and
// second-home occupancy the same. The prior implementation charged
// investment noticeably more than second-home; that distinction is not in
// the current source and has been removed. Primary residence remains 0.
// Indexed by ltvBucket (same 8-band scheme as the base tables).

const OCCUPANCY_SURCHARGE_PURCHASE_LCOR = [1.125, 1.625, 2.125, 3.375, 4.125, 4.125, 4.125, 4.125];
const OCCUPANCY_SURCHARGE_CASHOUT       = [1.125, 1.625, 2.125, 3.375]; // LTV capped at 80% for cash-out

function occupancySurcharge(ltv: number, occupancy: LLPAInput['occupancy'], purpose: LLPAInput['loanPurpose']): number {
  if (occupancy === 'primary') return 0;
  const table = purpose === 'cash_out_refi' ? OCCUPANCY_SURCHARGE_CASHOUT : OCCUPANCY_SURCHARGE_PURCHASE_LCOR;
  return table[ltvBucket(ltv)] ?? table[table.length - 1];
}

// ─── Property type surcharge ──────────────────────────────────────────────────
// Condo and "two- to four-unit property" surcharges are LTV-graduated per
// the Matrix (previously flat 2-tier approximations). The Matrix does not
// distinguish 2-unit from 3-4-unit properties -- both fall under a single
// "Two- to four-unit property" row; the prior code's separate flat values
// for '2unit' (0.500) vs '3_4unit' (1.000) did not come from this source
// and have been merged into one schedule. Manufactured home is a flat
// 0.500% across all LTVs in every table (unchanged from before -- this one
// was already correct).

const CONDO_SURCHARGE_PURCHASE_LCOR = [0.000, 0.125, 0.125, 0.750, 0.750, 0.750, 0.750, 0.750];
const CONDO_SURCHARGE_CASHOUT       = [0.000, 0.125, 0.125, 0.750];
const TWOTOFOUR_SURCHARGE_PURCHASE_LCOR = [0.000, 0.375, 0.375, 0.625, 0.625, 0.625, 0.625, 0.625];
const TWOTOFOUR_SURCHARGE_CASHOUT       = [0.000, 0.375, 0.375, 0.625];

function propertyTypeSurcharge(ltv: number, type: LLPAInput['propertyType'], purpose: LLPAInput['loanPurpose']): number {
  const isCashOut = purpose === 'cash_out_refi';
  const lb = ltvBucket(ltv);
  switch (type) {
    case 'sfr':          return 0;
    case 'manufactured':  return 0.500;
    case 'condo': {
      const t = isCashOut ? CONDO_SURCHARGE_CASHOUT : CONDO_SURCHARGE_PURCHASE_LCOR;
      return t[lb] ?? t[t.length - 1];
    }
    case '2unit':
    case '3_4unit': {
      const t = isCashOut ? TWOTOFOUR_SURCHARGE_CASHOUT : TWOTOFOUR_SURCHARGE_PURCHASE_LCOR;
      return t[lb] ?? t[t.length - 1];
    }
  }
}

// ─── High-balance surcharge ───────────────────────────────────────────────────
// Uses the Matrix's "High-balance fixed-rate" row (fixed-rate assumed --
// HomeRates does not currently collect an ARM-vs-fixed input, so the
// separate, generally higher "High-balance ARM" row cannot be selected;
// see DEFERRED notes). Standard conforming (<= $832,750): no surcharge.
// High-balance / above-ceiling: Matrix surcharge applied either way; the
// above-ceiling case is flagged separately via conformingStatus, same as
// before.

const HIGHBALANCE_FIXED_PURCHASE_LCOR = [0.500, 0.750, 0.750, 1.000, 1.000, 1.000, 1.000, 1.000];
const HIGHBALANCE_FIXED_CASHOUT       = [1.250, 1.500, 1.500, 1.750];

function highBalanceSurcharge(loanAmount: number, ltv: number, purpose: LLPAInput['loanPurpose']): number {
  if (loanAmount <= CONFORMING_BASELINE) return 0;
  const t = purpose === 'cash_out_refi' ? HIGHBALANCE_FIXED_CASHOUT : HIGHBALANCE_FIXED_PURCHASE_LCOR;
  const lb = ltvBucket(ltv);
  return t[lb] ?? t[t.length - 1];
}

// ─── Lock period adjustment ───────────────────────────────────────────────────
// Not a Fannie LLPA -- this is HomeRates' own lender-margin-style lock-day
// convention, unrelated to the Matrix. Left unchanged; out of scope for this
// workstream (the Matrix does not price rate locks at all).

function lockAdjustment(lockDays: LLPAInput['lockDays']): number {
  switch (lockDays) {
    case 15: return -0.125;
    case 30: return 0;
    case 45: return 0.125;
    case 60: return 0.250;
  }
}

// ─── Monthly P&I helper ───────────────────────────────────────────────────────

function monthlyPayment(principal: number, annualRate: number, months = 360): number {
  const r = annualRate / 100 / 12;
  if (r < 0.00001) return principal / months;
  return principal * r / (1 - Math.pow(1 + r, -months));
}

function totalInterest30y(principal: number, annualRate: number): number {
  return monthlyPayment(principal, annualRate) * 360 - principal;
}

// ─── Rate curve generator ─────────────────────────────────────────────────────
// Anchored at lenderParRate = fredParRate + rateEquivalent.
// 5 steps: +0.50%, +0.25%, PAR, -0.25%, -0.50% (relative to lender par).
// Each 0.25% step costs/credits POINTS_PER_QUARTER_PERCENT price points.

function buildRateCurve(lenderParRate: number, loanAmount: number): RateCurvePoint[] {
  const steps = [+0.50, +0.25, 0, -0.25, -0.50]; // rate offset from par
  return steps.map((delta) => {
    const rate = Math.round((lenderParRate + delta) * 1000) / 1000;
    // delta > 0 → higher rate → lender credits you → points < 0
    // delta < 0 → lower rate → you pay discount → points > 0
    const points = -(delta / 0.25) * POINTS_PER_QUARTER_PERCENT;
    const dollarCost = (points * loanAmount) / 100;
    const label: RateCurvePoint['label'] =
      delta > 0.001 ? 'credit' : delta < -0.001 ? 'discount' : 'par';

    let breakEvenMonths: number | null = null;
    if (label === 'discount' && dollarCost > 0) {
      // Monthly savings from lower rate vs lender par
      const mpPar = monthlyPayment(loanAmount, lenderParRate);
      const mpDiscount = monthlyPayment(loanAmount, rate);
      const saving = mpPar - mpDiscount;
      breakEvenMonths = saving > 0 ? Math.round(dollarCost / saving) : null;
    }

    return { rate, points: Math.round(points * 1000) / 1000, dollarCost: Math.round(dollarCost), label, breakEvenMonths };
  });
}

// ─── Recommended curve point ──────────────────────────────────────────────────
// Returns the index of the recommended point + programmatic reasoning.

export function recommendCurvePoint(curve: RateCurvePoint[]): { index: number; reasoning: string } {
  const parIdx = curve.findIndex(p => p.label === 'par');
  const discountPoints = curve.filter(p => p.label === 'discount');

  // Find the first discount point with break-even < 48 months
  const goodDiscount = discountPoints.find(
    p => p.breakEvenMonths !== null && p.breakEvenMonths < 48,
  );

  if (goodDiscount) {
    const idx = curve.indexOf(goodDiscount);
    const saving = Math.abs(goodDiscount.dollarCost);
    return {
      index: idx,
      reasoning: `Break-even on 1 discount point is ${goodDiscount.breakEvenMonths} months. If you hold this loan 5+ years, paying $${saving.toLocaleString()} upfront saves you more over the break-even period.`,
    };
  }

  // Check if first discount has break-even in the 48–84 month range → recommend PAR
  const firstDiscount = discountPoints[0];
  if (firstDiscount?.breakEvenMonths && firstDiscount.breakEvenMonths > 84) {
    const idx = parIdx >= 0 ? parIdx : 2;
    // credit option might make sense
    const creditIdx = curve.findIndex(p => p.label === 'credit');
    return {
      index: creditIdx >= 0 ? creditIdx : idx,
      reasoning: `Break-even on discount points is ${firstDiscount.breakEvenMonths} months (${Math.round(firstDiscount.breakEvenMonths / 12)} years). Most borrowers sell or refinance within 7 years — taking the lender credit reduces your upfront cost today.`,
    };
  }

  return {
    index: parIdx >= 0 ? parIdx : 2,
    reasoning: `PAR rate is likely optimal. Break-even on discount points is ${firstDiscount?.breakEvenMonths ?? 'N/A'} months. Pay points only if you plan to hold this exact loan longer than 4–5 years.`,
  };
}

// ─── OBMMI segment label helper (for breakdown/negotiation-brief copy) ───────

function obmmiSegmentLabel(input: LLPAInput): string {
  switch (input.loanType) {
    case 'fha':   return 'FHA';
    case 'va':    return 'VA';
    case 'jumbo': return 'Jumbo';
    case 'dscr':  return 'DSCR';
    case 'conventional': {
      const ltvLabel = input.ltv <= 80 ? 'LTV<=80%' : 'LTV>80%';
      const ficoLabel =
        input.creditScore < 680 ? 'FICO<680' :
        input.creditScore <= 699 ? 'FICO 680-699' :
        input.creditScore <= 719 ? 'FICO 700-719' :
        input.creditScore <= 739 ? 'FICO 720-739' :
        'FICO>=740';
      return `Conforming, ${ltvLabel}, ${ficoLabel}`;
    }
  }
}

// ─── Main computation function ────────────────────────────────────────────────
// parRate: the FRED 30-year national average (e.g., 6.82) -- always required,
//   used as the anchor for dscr scenarios and as the fallback when marketRate
//   is unavailable (OBMMI not yet synced for this segment).
// marketRate: the real OBMMI segment rate for this scenario's loanType/credit/
//   LTV, resolved via resolveObmmiSeriesId() and fetched by the caller. When
//   present, it replaces parRate as the anchor and baseLLPA (the synthetic
//   credit/LTV matrix lookup) is excluded from totalLLPA -- that pricing is
//   already embedded in the real observed rate, so re-adding it would
//   double-count it.

export function computeLLPA(
  input: LLPAInput,
  parRate: number,
  marketRate?: number | null,
  jumboEstimateMeta?: LLPAOutput['jumboEstimate'],
): LLPAOutput & { ineligible?: string } {
  const baseLLPA = baseLLPAFor(input.loanPurpose, input.ltv, input.creditScore);

  // Out-of-grid scenarios per the Matrix itself (currently: cash-out refi
  // above 80% LTV -- Fannie simply does not publish pricing for that
  // combination in this document).
  if (baseLLPA === null) {
    return {
      totalLLPA: 0,
      totalLLPADollars: 0,
      rateEquivalent: 0,
      breakdown: [],
      rateCurve: [],
      conformingStatus: 'standard' as const,
      dataSource: LLPA_DATA_SOURCE,
      disclaimer: LLPA_DISCLAIMER,
      rateAnchorSource: 'synthetic',
      lenderParRate: parRate,
      ineligible: `Cash-out refinances above 80% LTV are not priced in Fannie Mae's current LLPA Matrix for conventional financing. Consider FHA financing or a lower cash-out amount.`,
    };
  }

  // Domain decision resolved 2026-08-19: no minimum-credit-score gate here.
  // This engine prices; it does not underwrite. Every credit score the
  // Matrix publishes -- including its lowest band, <=639 -- gets that
  // band's real published price, with no implication that the resulting
  // number means the loan is approvable. That boundary is carried in
  // LLPA_DISCLAIMER (attached to every output below), not as a computation
  // gate. Eligibility/approval is a separate underwriting determination
  // this engine does not make.

  // Area ceiling — defaults to national baseline if caller didn't look up county
  const ceiling = input.highBalanceCeiling ?? CONFORMING_BASELINE;

  // Conforming classification
  const conformingStatus: LLPAOutput['conformingStatus'] =
    input.loanAmount <= CONFORMING_BASELINE ? 'standard' :
    input.loanAmount <= ceiling             ? 'high_balance' : 'above_limit';

  // Surcharges — stay synthetic regardless of anchor source; OBMMI has no
  // equivalent for occupancy/property-type/lock-day pricing. Loan purpose is
  // no longer a separate additive surcharge -- it's baked into which base
  // grid was selected above (Purchase / LCOR / Cash-out each have genuinely
  // different pricing, not a shared base plus a purpose delta).
  const occupancy = occupancySurcharge(input.ltv, input.occupancy, input.loanPurpose);
  const propType  = propertyTypeSurcharge(input.ltv, input.propertyType, input.loanPurpose);
  const highBal   = highBalanceSurcharge(input.loanAmount, input.ltv, input.loanPurpose);
  const lock      = lockAdjustment(input.lockDays);

  const usingObmmi = marketRate != null;

  // When OBMMI anchors the rate, baseLLPA is excluded -- it's already priced
  // into marketRate. Surcharges still apply on top either way.
  const totalLLPA = parseFloat(
    ((usingObmmi ? 0 : baseLLPA) + occupancy + propType + highBal + lock).toFixed(3),
  );
  const totalLLPADollars = Math.round((totalLLPA * input.loanAmount) / 100);
  const rateEquivalent   = parseFloat((totalLLPA / 4).toFixed(3));

  // Breakdown — omit zero-value rows for clarity. The credit/LTV base row
  // only appears on the synthetic path; OBMMI already reflects that pricing
  // in the anchor rate itself, not as a separate disclosed adjustment.
  const breakdown: { label: string; points: number }[] = [
    ...(usingObmmi ? [] : [{ label: 'Credit score / LTV (base)', points: baseLLPA }]),
    { label: 'Occupancy',                   points: occupancy },
    { label: 'Property type',               points: propType },
    { label: 'High-balance loan',           points: highBal },
    { label: `${input.lockDays}-day lock`,  points: lock },
  ].filter(r => r.points !== 0);

  // Rate curve anchor: real OBMMI segment rate when available, else the
  // fully synthetic FRED-par + LLPA-matrix path.
  const anchor = usingObmmi ? (marketRate as number) : parRate;
  const lenderPar = parseFloat((anchor + rateEquivalent).toFixed(3));
  const rateCurve = buildRateCurve(lenderPar, input.loanAmount);

  return {
    totalLLPA,
    totalLLPADollars,
    rateEquivalent,
    breakdown,
    rateCurve,
    conformingStatus,
    dataSource: usingObmmi
      ? `${OBMMI_CITATION_SHORT}. Surcharges (occupancy, property type, high-balance, lock) from ${LLPA_DATA_SOURCE}${
          input.loanType === 'jumbo' ? ' — used as a conforming-market proxy for relative sensitivity; no published jumbo-specific surcharge grid exists' : ''
        }`
      : LLPA_DATA_SOURCE,
    disclaimer: LLPA_DISCLAIMER,
    rateAnchorSource: usingObmmi ? 'obmmi' : 'synthetic',
    ...(usingObmmi ? { obmmiSegmentLabel: obmmiSegmentLabel(input) } : {}),
    ...(jumboEstimateMeta ? { jumboEstimate: jumboEstimateMeta } : {}),
    lenderParRate: lenderPar,
  };
}

// AD-11 Seam 4b: moved to lib/market-data/registry.ts (a market-data catalog
// concern, not pricing logic) -- re-exported here so existing
// `from '../../../lib/pricing/llpa-engine'` import sites don't need to change.
export { CONFORMING_OBMMI_SERIES_IDS } from '../market-data/registry';

// ─── Negotiation brief generator ─────────────────────────────────────────────
// Returns up to 4 consumer-facing talking points based on the input + output.
//
// obmmiSegments: latest value for each of CONFORMING_OBMMI_SERIES_IDS, keyed
// by series ID. Only used (and only needed) when output.rateAnchorSource is
// 'obmmi' and input.loanType is 'conventional' -- lets the credit/LTV tips
// quote a real neighboring-segment rate instead of a synthetic matrix delta.
// Omit it (or pass undefined) for fha/va/jumbo/dscr scenarios, where no
// credit/LTV-segmented comparison exists to make.

export function buildNegotiationBrief(
  input: LLPAInput,
  output: LLPAOutput,
  // AD-11 Seam 3 hotfix: no longer used to derive the rate range below --
  // output.lenderParRate already resolves the correct anchor (marketRate ??
  // parRate) + rateEquivalent. Recomputing parRate + output.rateEquivalent
  // here was a third instance of the same bug fixed in rate-intelligence-
  // engine/route.ts and marketplace-engine.ts. Kept in the signature for
  // call-site compatibility.
  parRate: number,
  obmmiSegments?: Record<string, number | null>,
): string[] {
  const lenderPar = output.lenderParRate;
  const rangeLow  = Math.max(0, lenderPar - 0.375).toFixed(3);
  const rangeHigh = (lenderPar + 0.25).toFixed(3);
  const llpaDollars = output.totalLLPADollars.toLocaleString();
  const usingObmmi = output.rateAnchorSource === 'obmmi';

  const points: string[] = [];

  points.push(
    `Your rate range is ${rangeLow}% – ${rangeHigh}%. The spread reflects lender margin variation — the bottom is competitive, the top is what you get if you don't shop.`,
  );

  if (usingObmmi) {
    points.push(
      output.totalLLPA > 0
        ? `Your base rate already reflects real market pricing for your ${output.obmmiSegmentLabel} segment (OBMMI) — not an estimate. On top of that, your scenario carries ${output.totalLLPA} points ($${llpaDollars}) in additional adjustments (occupancy, property type, lock period). Lender margin (0.50–1.50 points) is what's left to negotiate.`
        : `Your base rate already reflects real market pricing for your ${output.obmmiSegmentLabel} segment (OBMMI) — not an estimate, and no additional adjustments apply to your scenario. Lender margin (0.50–1.50 points) is the only variable left. Get at least 3 Loan Estimates and compare Line A on the fee sheet.`,
    );
  } else if (output.totalLLPA > 0) {
    points.push(
      `Your price adjustments total ${output.totalLLPA} points ($${llpaDollars}). These are set by Fannie Mae's public matrix — every conforming lender pays the same base. What lenders control is their own margin on top, typically 0.50–1.50 points. That's where negotiation lives.`,
    );
  } else {
    points.push(
      `Your LLPA is at or near zero — you're in the best pricing tier. Lender margin (0.50–1.50 points) is the only variable left. Get at least 3 Loan Estimates and compare Line A on the fee sheet.`,
    );
  }

  if (usingObmmi && input.loanType === 'conventional' && obmmiSegments) {
    // Credit tier tip -- compare current OBMMI segment to the next real band up.
    const nextBandFico =
      input.creditScore < 680 ? 680 :
      input.creditScore < 700 ? 700 :
      input.creditScore < 720 ? 720 :
      input.creditScore < 740 ? 740 :
      null; // already in the top band (>=740)
    if (nextBandFico) {
      const currentId = resolveObmmiSeriesId('conventional', input.creditScore, input.ltv);
      const nextId    = resolveObmmiSeriesId('conventional', nextBandFico, input.ltv);
      const currentRate = currentId ? obmmiSegments[currentId] : null;
      const nextRate    = nextId ? obmmiSegments[nextId] : null;
      if (currentRate != null && nextRate != null && nextRate < currentRate) {
        const rateDrop = parseFloat((currentRate - nextRate).toFixed(3));
        const monthlySaving = Math.round(monthlyPayment(input.loanAmount, currentRate) - monthlyPayment(input.loanAmount, nextRate));
        points.push(
          `Getting your score to ${nextBandFico}+ would move you into a lower OBMMI pricing segment — real lenders are averaging ${nextRate}% there today vs ${currentRate}% for your current segment, a ${rateDrop}-point rate difference worth roughly $${monthlySaving.toLocaleString()}/month on this loan amount. Pay down revolving balances first — that moves scores fastest.`,
        );
      }
    }

    // LTV tip -- the only real OBMMI threshold is 80%.
    if (input.ltv > 80) {
      const currentId = resolveObmmiSeriesId('conventional', input.creditScore, input.ltv);
      const le80Id     = resolveObmmiSeriesId('conventional', input.creditScore, 80);
      const currentRate = currentId ? obmmiSegments[currentId] : null;
      const le80Rate    = le80Id ? obmmiSegments[le80Id] : null;
      if (currentRate != null && le80Rate != null && le80Rate < currentRate) {
        const rateDrop = parseFloat((currentRate - le80Rate).toFixed(3));
        const extraDown = Math.round((input.ltv - 80) / 100 * (input.loanAmount / (1 - input.ltv / 100)));
        const monthlySaving = Math.round(monthlyPayment(input.loanAmount, currentRate) - monthlyPayment(input.loanAmount, le80Rate));
        points.push(
          `Adding $${extraDown.toLocaleString()} to your down payment would drop your LTV to 80% or below, moving you into a lower OBMMI pricing segment: ${le80Rate}% vs ${currentRate}% today (${rateDrop} points), worth roughly $${monthlySaving.toLocaleString()}/month.`,
        );
      }
    }
  } else if (!usingObmmi) {
    // Synthetic-path tips (dscr, or OBMMI unavailable) -- unchanged from the
    // pre-Seam-3b Fannie-matrix-delta approach, now reading the correct
    // per-purpose grid instead of a single shared table.
    const nextBucket = input.creditScore < 760
      ? input.creditScore < 620 ? null : Math.ceil(input.creditScore / 20) * 20
      : null;
    if (nextBucket && nextBucket > input.creditScore && nextBucket <= 760) {
      const upperBucket = [639, 659, 679, 699, 719, 739, 759, 760].find(b => b >= input.creditScore);
      if (upperBucket) {
        const currentBase = baseLLPAFor(input.loanPurpose, input.ltv, input.creditScore) ?? 0;
        const nextBase    = baseLLPAFor(input.loanPurpose, input.ltv, upperBucket + 1) ?? 0;
        const diff = parseFloat((currentBase - nextBase).toFixed(3));
        if (diff > 0) {
          const saving = Math.round((diff * input.loanAmount) / 100);
          points.push(
            `Getting your score from ${input.creditScore} to the next tier (${upperBucket + 1}+) would drop your LLPA by ${diff} points, saving $${saving.toLocaleString()} on this loan. Pay down revolving balances first — that moves scores fastest.`,
          );
        }
      }
    }

    if (input.ltv > 75 && input.ltv <= 95) {
      const ltvLower = Math.floor(input.ltv / 5) * 5;
      const currentBase = baseLLPAFor(input.loanPurpose, input.ltv, input.creditScore) ?? 0;
      const lowerBase   = baseLLPAFor(input.loanPurpose, ltvLower - 0.01, input.creditScore) ?? 0;
      const diff = parseFloat((currentBase - lowerBase).toFixed(3));
      if (diff > 0) {
        const extraDown = Math.round((input.ltv - ltvLower) / 100 * (input.loanAmount / (1 - input.ltv / 100)));
        points.push(
          `Adding $${extraDown.toLocaleString()} to your down payment would drop your LTV from ${input.ltv}% to ${ltvLower}%, saving ${diff} points ($${Math.round((diff * input.loanAmount) / 100).toLocaleString()}) in LLPAs. Ask your lender for the exact breakeven.`,
        );
      }
    }
  }

  // Always include: what to ask the lender
  points.push(
    usingObmmi
      ? `Ask your lender for the "lock confirmation" or "pricing sheet" — it shows their rate and margin separately. If their quoted rate is well above today's OBMMI average for your segment, ask them to explain the difference.`
      : `Ask your lender for the "lock confirmation" or "pricing sheet" — it shows your LLPA total and origination fee separately. If the numbers don't match today's matrix for your scenario, ask them to explain the difference.`,
  );

  return points.slice(0, 4);
}
