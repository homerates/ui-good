// lib/homeownerCalc.ts
// Single source of truth for homeowner financial math — shared between
// app/api/homeowner/analysis/route.ts (server, off-market/owner path) and
// app/(consumer)/my-home/page.tsx's buyer/preview path (client).
//
// Extracted 2026-07-29 after a production bug report: the same property
// could show meaningfully different numbers depending purely on whether
// its listing status was FOR_SALE/PENDING (client-computed) or off-market
// (server-computed), because the two paths had independently-written,
// silently-diverging formulas — different appreciation models (flat 4.2%
// vs real state-level FHFA rates), different HELOC prime rate, different
// refi closing-cost %, different PITI tax/insurance assumptions, different
// next-value-target rounding. This module is the fix: both paths now call
// the exact same functions with the exact same constants.
//
// No I/O, no server-only imports — safe to import from both a Node API
// route and a 'use client' component.

// ── Historical 30yr fixed annual averages (FRED) ─────────────────────────────
export const HIST_RATES: Record<number, number> = {
  2025: 6.76, 2024: 6.87, 2023: 6.81, 2022: 5.34,
  2021: 2.96, 2020: 3.11, 2019: 3.94, 2018: 4.54,
  2017: 3.99, 2016: 3.65, 2015: 3.85, 2014: 4.17,
  2013: 3.98, 2012: 3.66, 2011: 4.45, 2010: 4.69,
  2009: 5.04, 2008: 6.03, 2007: 6.34, 2006: 6.41,
  2005: 5.87, 2004: 5.84, 2003: 5.83, 2002: 6.54,
  2001: 6.97, 2000: 8.05, 1999: 7.44, 1998: 6.94,
  1997: 7.60, 1996: 7.81, 1995: 7.93, 1994: 8.38,
  1993: 7.31, 1992: 8.39, 1991: 9.25, 1990: 10.13,
};
export function historicalRate(year: number): number {
  return HIST_RATES[year] ?? 5.5;
}

// ── FHFA state-level annual appreciation rates (5yr CAGR 2019-2024) ──────────
export const FHFA_STATE: Record<string, number> = {
  AL:4.9, AK:3.8, AZ:8.7, AR:5.6, CA:5.8, CO:5.9, CT:7.2, DE:6.4,
  FL:10.2,GA:8.4, HI:4.1, ID:9.1, IL:4.8, IN:5.9, IA:4.7, KS:5.2,
  KY:5.4, LA:4.1, ME:8.3, MD:5.7, MA:6.1, MI:6.2, MN:5.6, MS:4.6,
  MO:5.5, MT:9.4, NE:5.4, NV:7.8, NH:8.1, NJ:6.3, NM:7.2, NY:4.2,
  NC:8.1, ND:3.9, OH:5.8, OK:5.3, OR:5.4, PA:5.6, RI:7.8, SC:8.9,
  SD:5.8, TN:8.6, TX:8.9, UT:8.3, VT:7.6, VA:6.3, WA:6.5, WV:4.2,
  WI:5.5, WY:5.1, DC:3.9,
};
export function fhfaRate(state: string | null): number {
  return (state ? FHFA_STATE[state.toUpperCase()] : null) ?? 5.5;
}

/** Extract state from an address string (last 2-letter token before ZIP or at end). */
export function stateFromAddress(address: string): string | null {
  const up = address.toUpperCase();
  const m = up.match(/\b([A-Z]{2})\b\s*\d{5}/) ?? up.match(/\b([A-Z]{2})\s*$/);
  if (!m) return null;
  return m[1] in FHFA_STATE ? m[1] : null;
}

export function remainingBalance(purchasePrice: number, downPct = 0.20, ratePct: number, monthsElapsed: number): number {
  const principal = purchasePrice * (1 - downPct);
  const r = ratePct / 100 / 12;
  const n = 360;
  if (r === 0) return Math.max(0, principal - (principal / n) * monthsElapsed);
  const pmt = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return Math.max(0, principal * Math.pow(1 + r, monthsElapsed) - pmt * ((Math.pow(1 + r, monthsElapsed) - 1) / r));
}

export function monthlyPayment(principal: number, annualRate: number, months = 360): number {
  const r = annualRate / 100 / 12;
  if (r === 0 || principal <= 0) return Math.round(principal / months);
  return Math.round((principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1));
}

export function monthsAgo(d: Date): number {
  const now = new Date();
  return Math.max(0, (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()));
}

/** HELOC rate = prime + margin. Prime is a static assumption (not a live feed) —
 *  single constant here so both engines use the same 7.25%, not 7.25 vs 7.5. */
export const PRIME_RATE = 4.25 + 3;
export const HELOC_MARGIN = 0.5;

export interface HelocDraw {
  label: string;
  amount: number;
  interestOnly: number;
  amortizing: number;
}

export interface HomeownerFinancialsInput {
  estimatedValue: number | null;
  estimatedBalance: number | null;
  purchaseRate: number | null;
  liveRate: number;
  lastSalePrice: number | null;
  rentEstimate: number | null;
  /** LO/borrower-entered override of the original purchase price, if any. Null for the buyer/preview path. */
  purchasePriceOverride?: number | null;
  /** LO/borrower-entered override of current balance, if any. Null for the buyer/preview path. */
  actualBalanceOverride?: number | null;
  /** Full calendar years since purchase (server: new Date().getFullYear() - purchaseYear;
   *  client: same, from whatever date field it parsed). Null if purchase date unknown. */
  yearsElapsed: number | null;
}

export interface HomeownerFinancials {
  helocRate: number;
  helocMax: number | null;
  cashOutMax: number | null;
  helocDraws: HelocDraw[];
  refiMonthlySaving: number;
  refiClosingCost: number;
  refiBreakEven: number | null;
  paidOffPct: number;
  interestPaid: number | null;
  yearsElapsed: number | null;
  payoffYear: number | null;
  nextValueTarget: number | null;
  nextValueTargetYear: number | null;
  piti: number | null;
  rentMonthly: number | null;
  rentVsOwn: number | null;
}

/**
 * The full HELOC/PITI/refi/payoff-progress block — a verbatim port of
 * buildAnalysis()'s original inline logic (app/api/homeowner/analysis/
 * route.ts, prior to this extraction), same formulas and constants (2%
 * refi closing cost, 1.5%/yr combined tax+insurance, $250k next-value-
 * target rounding), now shared instead of independently duplicated.
 */
export function computeHomeownerFinancials(input: HomeownerFinancialsInput): HomeownerFinancials {
  const {
    estimatedValue, estimatedBalance, purchaseRate, liveRate, lastSalePrice, rentEstimate, yearsElapsed,
  } = input;
  const purchasePriceOverride = input.purchasePriceOverride ?? null;
  const actualBalanceOverride = input.actualBalanceOverride ?? null;

  const helocRate = PRIME_RATE + HELOC_MARGIN;

  const helocMax   = (estimatedValue && estimatedBalance) ? Math.max(0, Math.round(estimatedValue * 0.85 - estimatedBalance)) : null;
  const cashOutMax = (estimatedValue && estimatedBalance) ? Math.max(0, Math.round(estimatedValue * 0.80 - estimatedBalance)) : null;
  const helocDraws: HelocDraw[] = helocMax ? [
    { label: '25% draw', amount: Math.round(helocMax * 0.25) },
    { label: '50% draw', amount: Math.round(helocMax * 0.50) },
    { label: 'Full draw', amount: helocMax },
  ].map(d => ({
    ...d,
    interestOnly: Math.round((d.amount * (helocRate / 100)) / 12),
    amortizing:   monthlyPayment(d.amount, helocRate, 240),
  })) : [];

  const origPurchasePrice = purchasePriceOverride ?? lastSalePrice;
  const origBalance = actualBalanceOverride
    ? actualBalanceOverride
    : origPurchasePrice ? origPurchasePrice * 0.8 : (estimatedBalance ?? 0) * 1.5;

  const refiMonthlySaving = (purchaseRate && estimatedBalance && purchaseRate > liveRate)
    ? Math.max(0, monthlyPayment(estimatedBalance, purchaseRate) - monthlyPayment(estimatedBalance, liveRate)) : 0;
  const refiClosingCost = estimatedBalance ? Math.round(estimatedBalance * 0.02) : 0;
  const refiBreakEven   = refiMonthlySaving > 0 ? Math.round(refiClosingCost / refiMonthlySaving) : null;

  const paidOff    = origBalance > 0 && estimatedBalance ? origBalance - estimatedBalance : 0;
  const paidOffPct = origBalance > 0 ? Math.round((paidOff / origBalance) * 100) : 0;

  const origPmt    = purchaseRate ? monthlyPayment(origBalance, purchaseRate) : null;
  const totalPaid  = (origPmt && yearsElapsed) ? origPmt * yearsElapsed * 12 : null;
  const interestPaid = (totalPaid && paidOff) ? Math.max(0, Math.round(totalPaid - paidOff)) : null;

  const payoffYear = (estimatedBalance && purchaseRate) ? (() => {
    const pmt = monthlyPayment(origBalance, purchaseRate);
    const r   = purchaseRate / 100 / 12;
    const arg = 1 - (r * estimatedBalance) / pmt;
    if (arg <= 0) return new Date().getFullYear() + 30;
    const rem = Math.ceil(-Math.log(arg) / Math.log(1 + r));
    return new Date().getFullYear() + Math.ceil(rem / 12);
  })() : null;

  const nextValueTarget     = estimatedValue ? Math.ceil(estimatedValue / 250_000) * 250_000 : null;
  const yearsToTarget       = (nextValueTarget && estimatedValue) ? Math.ceil(Math.log(nextValueTarget / estimatedValue) / Math.log(1.042)) : null;
  const nextValueTargetYear = (yearsToTarget && yearsToTarget > 0 && yearsToTarget <= 15) ? new Date().getFullYear() + yearsToTarget : null;

  const piti        = (estimatedBalance && purchaseRate) ? monthlyPayment(estimatedBalance, purchaseRate) + Math.round((estimatedValue ?? 0) * 0.015 / 12) : null;
  const rentMonthly = rentEstimate ?? (estimatedValue ? Math.round(estimatedValue * 0.0055) : null);
  const rentVsOwn   = (piti && rentMonthly) ? rentMonthly - piti : null;

  return {
    helocRate, helocMax, cashOutMax, helocDraws,
    refiMonthlySaving, refiClosingCost, refiBreakEven,
    paidOffPct, interestPaid, yearsElapsed, payoffYear,
    nextValueTarget, nextValueTargetYear,
    piti, rentMonthly, rentVsOwn,
  };
}
