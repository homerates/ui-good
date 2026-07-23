// lib/pricing/marketplace-engine.ts
// Anonymous rate marketplace engine.
//
// Formula: borrowerRate = fredParRate + llpaRateEquivalent + lenderMargin
//
// All lender identity is stripped from output. The anonymousId is the lender's
// DB uuid — only used server-side when a borrower initiates an opt-in.

import { computeLLPA, type LLPAInput, type LLPAOutput } from './llpa-engine';
// AD-11 Seam 3b: LoanType now lives on LLPAInput itself (loanType drives the
// OBMMI rate anchor for every caller, not just the marketplace table) --
// re-exported here so existing `from '../../lib/pricing/marketplace-engine'`
// import sites don't need to change.
export type { LoanType } from './llpa-engine';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type MarketplaceInput = LLPAInput & {
  state: string;      // 2-letter state code, e.g. 'CA'
};

// Shape that matches marketplace_lenders DB row (only pricing + overlay fields)
export type MarketplaceLender = {
  id: string;
  margin_over_par: number;
  loan_types: string[];
  eligible_states: string[];
  min_loan_amount: number;
  max_loan_amount: number;
  min_credit_score: number;
  max_ltv: number;
  lock_15_adj: number;
  lock_45_adj: number;
  lock_60_adj: number;
};

export type RateTableRow = {
  anonymousId: string;     // lender DB id — used only in opt-in flow, never displayed
  label: string;           // "Lender A", "Lender B", … — only visible identifier
  rate: number;            // borrower-specific rate at PAR (no points)
  apr: number;             // est. APR including $3,200 third-party closing costs
  monthlyPayment: number;
  estClosingCosts: number; // third-party estimate used in APR calculation
};

export type MarketplaceOutput = {
  rows: RateTableRow[];
  llpa: LLPAOutput & { ineligible?: string };
  parRate: number;
  matchedCount: number;   // lenders eligible for this exact scenario
  totalActive: number;    // total active lenders in DB
};

// ─── Constants ─────────────────────────────────────────────────────────────────

// CFPB 2024 average for title, escrow, appraisal, recording.
// Used to compute a consistent APR comparison — not a lender charge.
const EST_THIRD_PARTY_COSTS = 3_200;

const ROW_LABELS = ['A','B','C','D','E','F','G','H','I','J'];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function monthlyPmt(principal: number, annualRatePct: number, months = 360): number {
  const r = annualRatePct / 100 / 12;
  if (r < 0.00001) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

// Newton-Raphson APR: find monthly rate R such that
// PMT × (1 − (1+R)^−360) / R = loanAmount − closingCosts
function computeAPR(loanAmount: number, noteRate: number, closingCosts: number): number {
  const pmt = monthlyPmt(loanAmount, noteRate);
  const amtFinanced = loanAmount - closingCosts;
  if (amtFinanced <= 0) return noteRate;

  const n = 360;
  let r = noteRate / 100 / 12;

  for (let i = 0; i < 200; i++) {
    const pow = Math.pow(1 + r, -n);
    const pv  = pmt * (1 - pow) / r;
    const dpv = pmt * (n * Math.pow(1 + r, -n - 1) / r - (1 - pow) / (r * r));
    const delta = (pv - amtFinanced) / dpv;
    r -= delta;
    if (r < 1e-6) r = 1e-6;
    if (Math.abs(delta) < 1e-10) break;
  }

  return Math.round(r * 12 * 100_000) / 1_000; // annual % to 3 dp
}

// Lock period rate adjustment the lender applies on top of their 30-day margin.
// Separate from the LLPA lock adjustment (already baked into llpaRateEquivalent).
function lenderLockAdj(lender: MarketplaceLender, lockDays: LLPAInput['lockDays']): number {
  switch (lockDays) {
    case 15: return lender.lock_15_adj;
    case 45: return lender.lock_45_adj;
    case 60: return lender.lock_60_adj;
    default: return 0; // 30-day is the baseline
  }
}

function isEligible(lender: MarketplaceLender, input: MarketplaceInput): boolean {
  if (!lender.eligible_states.includes(input.state.toUpperCase())) return false;
  if (!lender.loan_types.includes(input.loanType)) return false;
  if (input.loanAmount < lender.min_loan_amount) return false;
  if (input.loanAmount > lender.max_loan_amount) return false;
  if (input.creditScore < lender.min_credit_score) return false;
  if (input.ltv > lender.max_ltv) return false;
  return true;
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function buildRateTable(
  input: MarketplaceInput,
  lenders: MarketplaceLender[],
  parRate: number,
  marketRate?: number | null,
): MarketplaceOutput {
  const llpa = computeLLPA(input, parRate, marketRate);

  // If borrower profile is ineligible for conventional (e.g. credit < 620 at high LTV),
  // return early with the ineligible explanation.
  if ('ineligible' in llpa && llpa.ineligible) {
    return {
      rows: [],
      llpa,
      parRate,
      matchedCount: 0,
      totalActive: lenders.length,
    };
  }

  const eligible = lenders.filter(l => isEligible(l, input));

  const unsorted: (RateTableRow & { _sortKey: number })[] = eligible.map(lender => {
    // Borrower-specific rate:
    //   FRED par + LLPA rate equivalent + lender margin + lender lock adjustment
    const rate = parseFloat(
      (parRate + llpa.rateEquivalent + lender.margin_over_par + lenderLockAdj(lender, input.lockDays))
        .toFixed(3),
    );
    const pmt = monthlyPmt(input.loanAmount, rate);
    const apr = computeAPR(input.loanAmount, rate, EST_THIRD_PARTY_COSTS);

    return {
      anonymousId: lender.id,
      label: '',                                 // assigned post-sort
      rate,
      apr,
      monthlyPayment: Math.round(pmt),
      estClosingCosts: EST_THIRD_PARTY_COSTS,
      _sortKey: apr,
    };
  });

  // Sort by APR ascending — lowest total cost first
  unsorted.sort((a, b) => a._sortKey - b._sortKey);

  const rows: RateTableRow[] = unsorted.map(({ _sortKey: _, ...row }, i) => ({
    ...row,
    label: `Lender ${ROW_LABELS[i] ?? String(i + 1)}`,
  }));

  return {
    rows,
    llpa,
    parRate,
    matchedCount: eligible.length,
    totalActive: lenders.length,
  };
}
