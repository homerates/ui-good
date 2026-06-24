// lib/pricing/llpa-engine.ts
// Fannie Mae LLPA (Loan-Level Price Adjustment) engine.
//
// Matrix source: singlefamily.fanniemae.com/media/9391/display (public document).
// Effective 2024. Verify against the current published matrix before any lending decisions.
//
// All values are in price POINTS (1 point = 1% of loan amount).

export const LLPA_DATA_SOURCE =
  "Fannie Mae LLPA Matrix, 2024 — singlefamily.fanniemae.com (publicly available). Verify current matrix.";

export const LLPA_DISCLAIMER =
  "LLPA estimates are educational and based on the publicly posted Fannie Mae matrix. Actual lender pricing varies by loan program, lender margin, and market conditions. Not a commitment to lend. Consult a licensed mortgage professional.";

// Market convention: 1 price point ≈ 0.25% rate change.
// This ratio shifts with market conditions — update when the market moves significantly.
export const POINTS_PER_QUARTER_PERCENT = 1.0;

// 2026 FHFA standard conforming baseline (all non-high-cost counties)
// High-cost county ceilings vary by county — passed in via input.highBalanceCeiling
export const CONFORMING_BASELINE = 832_750;

// ─── Input / Output types ──────────────────────────────────────────────────────

export type LLPAInput = {
  creditScore: number;
  ltv: number;                  // 0–100
  occupancy: 'primary' | 'second' | 'investment';
  loanPurpose: 'purchase' | 'rate_term_refi' | 'cash_out_refi';
  propertyType: 'sfr' | '2unit' | '3_4unit' | 'condo' | 'manufactured';
  loanAmount: number;
  lockDays: 15 | 30 | 45 | 60;
  /**
   * Highest conforming 1-unit limit for the borrower's area.
   * Provided by the API route after a state lookup.
   * Defaults to CONFORMING_BASELINE ($832,750) when omitted.
   * Loans above this ceiling are non-conforming — LLPA results are indicative only.
   */
  highBalanceCeiling?: number;
};

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
};

// ─── Bucket helpers ────────────────────────────────────────────────────────────

function creditBucket(score: number): number {
  if (score < 620)  return 0;
  if (score <= 639) return 1;
  if (score <= 659) return 2;
  if (score <= 679) return 3;
  if (score <= 699) return 4;
  if (score <= 719) return 5;
  if (score <= 739) return 6;
  if (score <= 759) return 7;
  return 8; // 760+
}

function ltvBucket(ltv: number): number {
  if (ltv <= 60)  return 0;
  if (ltv <= 65)  return 1;
  if (ltv <= 70)  return 2;
  if (ltv <= 75)  return 3;
  if (ltv <= 80)  return 4;
  if (ltv <= 85)  return 5;
  if (ltv <= 90)  return 6;
  if (ltv <= 95)  return 7;
  return 8; // 95.01–97
}

// ─── Base LLPA matrix ─────────────────────────────────────────────────────────
// Indexed [ltvBucket][creditBucket].
// Source: Fannie Mae Standard Eligible Mortgages — Credit Score / LTV table.
// null = combination not eligible (e.g., <620 FICO at 95–97% LTV).

const BASE_LLPA: (number | null)[][] = [
//  credit:   <620   620-39  640-59  660-79  680-99  700-19  720-39  740-59  760+
/* ltv≤60  */[2.750, 1.875, 1.500, 1.000, 0.625, 0.375, 0.250, 0.125, 0.000],
/* 60-65   */[3.000, 2.125, 1.750, 1.250, 0.875, 0.625, 0.375, 0.250, 0.000],
/* 65-70   */[3.250, 2.375, 2.000, 1.500, 1.125, 0.875, 0.625, 0.375, 0.000],
/* 70-75   */[3.500, 2.625, 2.250, 1.750, 1.375, 1.125, 0.875, 0.500, 0.000],
/* 75-80   */[3.750, 2.875, 2.500, 2.000, 1.625, 1.375, 1.125, 0.625, 0.000],
/* 80-85   */[4.000, 3.125, 2.750, 2.250, 1.875, 1.625, 1.375, 0.875, 0.250],
/* 85-90   */[4.250, 3.375, 3.000, 2.500, 2.125, 1.875, 1.625, 1.125, 0.500],
/* 90-95   */[4.750, 3.875, 3.500, 3.000, 2.625, 2.375, 2.125, 1.625, 1.000],
/* 95-97   */[null,  4.125, 3.750, 3.250, 2.875, 2.625, 2.375, 1.875, 1.250],
];

// ─── Occupancy surcharge ──────────────────────────────────────────────────────
// Primary = 0. Second home and investment add to base LLPA.

function occupancySurcharge(ltv: number, occupancy: LLPAInput['occupancy']): number {
  if (occupancy === 'primary') return 0;
  if (occupancy === 'second') {
    if (ltv <= 75) return 0.125;
    if (ltv <= 85) return 0.250;
    return 0.375;
  }
  // investment
  if (ltv <= 65) return 0.375;
  if (ltv <= 75) return 0.500;
  if (ltv <= 80) return 0.625;
  if (ltv <= 85) return 0.750;
  if (ltv <= 90) return 0.875;
  return 1.000;
}

// ─── Loan purpose surcharge ───────────────────────────────────────────────────
// Purchase = 0. Rate/term refi is modest. Cash-out refi varies significantly.

function loanPurposeSurcharge(
  ltv: number,
  creditScore: number,
  purpose: LLPAInput['loanPurpose'],
): number {
  if (purpose === 'purchase') return 0;
  if (purpose === 'rate_term_refi') {
    return ltv <= 80 ? 0.125 : 0.250;
  }
  // cash-out refi — surcharge table by LTV and credit tier
  if (ltv > 80) return 2.875; // high-LTV cash-out has steep pricing
  if (creditScore >= 760) {
    if (ltv <= 60) return 0.375;
    if (ltv <= 70) return 0.625;
    return 1.125;
  }
  if (creditScore >= 720) {
    if (ltv <= 60) return 0.625;
    if (ltv <= 70) return 1.125;
    return 1.625;
  }
  if (creditScore >= 680) {
    if (ltv <= 60) return 0.875;
    if (ltv <= 70) return 1.375;
    return 2.000;
  }
  // <680
  if (ltv <= 60) return 1.250;
  if (ltv <= 70) return 1.875;
  return 2.625;
}

// ─── Property type surcharge ──────────────────────────────────────────────────

function propertyTypeSurcharge(ltv: number, type: LLPAInput['propertyType']): number {
  switch (type) {
    case 'sfr':          return 0;
    case 'condo':        return ltv <= 75 ? 0.375 : 0.750;
    case '2unit':        return 0.500;
    case '3_4unit':      return 1.000;
    case 'manufactured': return 0.500;
  }
}

// ─── High-balance surcharge ───────────────────────────────────────────────────
// Standard conforming (≤ $832,750):       no surcharge
// High-balance conforming (> baseline, ≤ area ceiling): Fannie HB surcharge
// Above area ceiling (jumbo territory):   max HB surcharge applied; results flagged

function highBalanceSurcharge(loanAmount: number, ltv: number, ceiling: number): number {
  if (loanAmount <= CONFORMING_BASELINE) return 0;
  // Both high-balance and above-ceiling cases apply the surcharge —
  // above-ceiling results are flagged separately via conformingStatus.
  if (ltv <= 80)  return 0.250;
  if (ltv <= 90)  return 0.500;
  return 0.750;
}

// ─── Lock period adjustment ───────────────────────────────────────────────────

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

// ─── Main computation function ────────────────────────────────────────────────
// parRate: the FRED 30-year national average (e.g., 6.82).

export function computeLLPA(input: LLPAInput, parRate: number): LLPAOutput & { ineligible?: string } {
  const cb = creditBucket(input.creditScore);
  const lb = ltvBucket(input.ltv);

  // Base LLPA lookup
  const baseLLPA = BASE_LLPA[lb]?.[cb];
  if (baseLLPA === null || baseLLPA === undefined) {
    return {
      totalLLPA: 0,
      totalLLPADollars: 0,
      rateEquivalent: 0,
      breakdown: [],
      rateCurve: [],
      conformingStatus: 'standard' as const,
      dataSource: LLPA_DATA_SOURCE,
      disclaimer: LLPA_DISCLAIMER,
      ineligible: `Credit score < 620 is not eligible for conventional financing at ${input.ltv}% LTV. Consider FHA financing.`,
    };
  }

  // Area ceiling — defaults to national baseline if caller didn't look up county
  const ceiling = input.highBalanceCeiling ?? CONFORMING_BASELINE;

  // Conforming classification
  const conformingStatus: LLPAOutput['conformingStatus'] =
    input.loanAmount <= CONFORMING_BASELINE ? 'standard' :
    input.loanAmount <= ceiling             ? 'high_balance' : 'above_limit';

  // Surcharges
  const occupancy = occupancySurcharge(input.ltv, input.occupancy);
  const purpose   = loanPurposeSurcharge(input.ltv, input.creditScore, input.loanPurpose);
  const propType  = propertyTypeSurcharge(input.ltv, input.propertyType);
  const highBal   = highBalanceSurcharge(input.loanAmount, input.ltv, ceiling);
  const lock      = lockAdjustment(input.lockDays);

  const totalLLPA = parseFloat(
    (baseLLPA + occupancy + purpose + propType + highBal + lock).toFixed(3),
  );
  const totalLLPADollars = Math.round((totalLLPA * input.loanAmount) / 100);
  const rateEquivalent   = parseFloat((totalLLPA / 4).toFixed(3));

  // Breakdown — omit zero-value rows for clarity
  const breakdown: { label: string; points: number }[] = [
    { label: 'Credit score / LTV (base)',   points: baseLLPA },
    { label: 'Occupancy',                   points: occupancy },
    { label: 'Loan purpose',                points: purpose },
    { label: 'Property type',               points: propType },
    { label: 'High-balance loan',           points: highBal },
    { label: `${input.lockDays}-day lock`,  points: lock },
  ].filter(r => r.points !== 0);

  // Rate curve: lender par = FRED par + LLPA rate equivalent
  const lenderPar = parseFloat((parRate + rateEquivalent).toFixed(3));
  const rateCurve = buildRateCurve(lenderPar, input.loanAmount);

  return {
    totalLLPA,
    totalLLPADollars,
    rateEquivalent,
    breakdown,
    rateCurve,
    conformingStatus,
    dataSource: LLPA_DATA_SOURCE,
    disclaimer: LLPA_DISCLAIMER,
  };
}

// ─── Negotiation brief generator ─────────────────────────────────────────────
// Returns 4 consumer-facing talking points based on the input + output.

export function buildNegotiationBrief(
  input: LLPAInput,
  output: LLPAOutput,
  parRate: number,
): string[] {
  const lenderPar = parRate + output.rateEquivalent;
  const rangeLow  = Math.max(0, lenderPar - 0.375).toFixed(3);
  const rangeHigh = (lenderPar + 0.25).toFixed(3);
  const llpaDollars = output.totalLLPADollars.toLocaleString();

  const points: string[] = [];

  points.push(
    `Your LLPA-adjusted rate range is ${rangeLow}% – ${rangeHigh}%. The spread reflects lender margin variation — the bottom is competitive, the top is what you get if you don't shop.`,
  );

  if (output.totalLLPA > 0) {
    points.push(
      `Your price adjustments total ${output.totalLLPA} points ($${llpaDollars}). These are set by Fannie Mae's public matrix — every conforming lender pays the same base. What lenders control is their own margin on top, typically 0.50–1.50 points. That's where negotiation lives.`,
    );
  } else {
    points.push(
      `Your LLPA is at or near zero — you're in the best pricing tier. Lender margin (0.50–1.50 points) is the only variable left. Get at least 3 Loan Estimates and compare Line A on the fee sheet.`,
    );
  }

  // Credit score bucket upgrade tip
  const nextBucket = input.creditScore < 760
    ? input.creditScore < 620 ? null : Math.ceil(input.creditScore / 20) * 20
    : null;
  if (nextBucket && nextBucket > input.creditScore && nextBucket <= 760) {
    const upperBucket = [639, 659, 679, 699, 719, 739, 759, 760].find(b => b >= input.creditScore);
    if (upperBucket) {
      const currentBase = BASE_LLPA[ltvBucket(input.ltv)]?.[creditBucket(input.creditScore)] ?? 0;
      const nextBase    = BASE_LLPA[ltvBucket(input.ltv)]?.[creditBucket(upperBucket + 1)] ?? 0;
      if (typeof currentBase === 'number' && typeof nextBase === 'number') {
        const diff = parseFloat((currentBase - nextBase).toFixed(3));
        if (diff > 0) {
          const saving = Math.round((diff * input.loanAmount) / 100);
          points.push(
            `Getting your score from ${input.creditScore} to the next tier (${upperBucket + 1}+) would drop your LLPA by ${diff} points, saving $${saving.toLocaleString()} on this loan. Pay down revolving balances first — that moves scores fastest.`,
          );
        }
      }
    }
  }

  // LTV tip
  if (input.ltv > 75 && input.ltv <= 95) {
    const ltvLower = Math.floor(input.ltv / 5) * 5;
    const currentBase = BASE_LLPA[ltvBucket(input.ltv)]?.[creditBucket(input.creditScore)] ?? 0;
    const lowerBase   = BASE_LLPA[ltvBucket(ltvLower - 0.01)]?.[creditBucket(input.creditScore)] ?? 0;
    if (typeof currentBase === 'number' && typeof lowerBase === 'number') {
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
    `Ask your lender for the "lock confirmation" or "pricing sheet" — it shows your LLPA total and origination fee separately. If the numbers don't match today's matrix for your scenario, ask them to explain the difference.`,
  );

  return points.slice(0, 4);
}
