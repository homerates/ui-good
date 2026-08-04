// Pure amortization math — no React, no chart library, fully unit-testable on its own.
// Every function here operates on a LoanScenario and returns plain data; components decide
// how to render it.
import type { LoanScenario } from '../types';

export interface AmortizationPeriod {
  /** 1-based month index. */
  period: number;
  principalPaid: number;
  interestPaid: number;
  extraPrincipalPaid: number;
  remainingBalance: number;
}

export interface YearlyComposition {
  /** 1-based year index. */
  year: number;
  principal: number;
  interest: number;
  taxes: number;
  insurance: number;
  hoa: number;
  /** Flat monthly PMI × months — see LoanScenario.monthlyPMI for why this doesn't auto-drop at 78% LTV yet. */
  pmi: number;
  totalPayment: number;
}

/** Standard fixed-rate monthly principal+interest payment. */
export function monthlyPI(principal: number, annualRatePct: number, termMonths: number): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / termMonths;
  return (principal * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}

/**
 * Full month-by-month schedule. Extra principal payments shorten the schedule (the loop exits
 * once the balance hits zero, which happens before `termMonths` when extraMonthlyPrincipal > 0).
 * `period * 2` is a hard safety cap only — a well-formed scenario always finishes well before it;
 * it exists so a pathological input (e.g. rate high enough that the scheduled payment doesn't
 * cover interest) can't spin the loop forever.
 */
export function computeAmortizationSchedule(scenario: LoanScenario): AmortizationPeriod[] {
  const { principal, annualRatePct, termMonths, extraMonthlyPrincipal = 0 } = scenario;
  const r = annualRatePct / 100 / 12;
  const basePayment = monthlyPI(principal, annualRatePct, termMonths);

  const schedule: AmortizationPeriod[] = [];
  let balance = principal;
  let period = 0;
  const safetyCap = termMonths * 2;

  while (balance > 0.01 && period < safetyCap) {
    period++;
    const interestPaid = balance * r;
    let principalPaid = basePayment - interestPaid;
    let extra = extraMonthlyPrincipal;

    if (principalPaid < 0) principalPaid = 0; // scheduled payment doesn't even cover interest — extreme edge case, don't go negative

    if (principalPaid + extra >= balance) {
      // Final payment — pay off exactly the remaining balance, no more.
      if (principalPaid >= balance) {
        principalPaid = balance;
        extra = 0;
      } else {
        extra = balance - principalPaid;
      }
    }

    balance = Math.max(0, balance - principalPaid - extra);
    schedule.push({ period, principalPaid, interestPaid, extraPrincipalPaid: extra, remainingBalance: balance });
  }

  return schedule;
}

/**
 * First month where (principal + extra principal) exceeds interest — the "your payment now
 * goes mostly toward equity" moment the crossover chart annotates. Returns null only if the
 * schedule never crosses (shouldn't happen for a real amortizing loan, but a scenario with an
 * absurd extraMonthlyPrincipal relative to principal could front-load past it before month 1).
 */
export function findCrossoverMonth(schedule: AmortizationPeriod[]): number | null {
  const found = schedule.find(p => p.principalPaid + p.extraPrincipalPaid > p.interestPaid);
  return found?.period ?? null;
}

/** Converts a 1-based month index into "Year N, Month M" for plain-language display. */
export function monthToYearMonth(period: number): { year: number; monthOfYear: number } {
  return { year: Math.ceil(period / 12), monthOfYear: ((period - 1) % 12) + 1 };
}

/**
 * Aggregates the monthly schedule into yearly totals for the stacked composition chart — 360
 * monthly bars is too dense to read as discrete stacks, so the main chart shows one stack per
 * year while the crossover chart (finer-grained) shows the month-level curve.
 */
export function aggregateToYearly(schedule: AmortizationPeriod[], scenario: LoanScenario): YearlyComposition[] {
  const monthlyTax = scenario.annualPropertyTax / 12;
  const monthlyInsurance = scenario.annualHomeownersInsurance / 12;
  const monthlyHOA = scenario.monthlyHOA ?? 0;
  const monthlyPMI = scenario.monthlyPMI ?? 0;

  const years: YearlyComposition[] = [];
  for (let i = 0; i < schedule.length; i += 12) {
    const yearPeriods = schedule.slice(i, i + 12);
    const monthsInYear = yearPeriods.length; // last year may be a partial 1-11 months
    years.push({
      year: Math.floor(i / 12) + 1,
      principal: sum(yearPeriods, p => p.principalPaid + p.extraPrincipalPaid),
      interest: sum(yearPeriods, p => p.interestPaid),
      taxes: monthlyTax * monthsInYear,
      insurance: monthlyInsurance * monthsInYear,
      hoa: monthlyHOA * monthsInYear,
      pmi: monthlyPMI * monthsInYear,
      totalPayment:
        sum(yearPeriods, p => p.principalPaid + p.extraPrincipalPaid + p.interestPaid) +
        (monthlyTax + monthlyInsurance + monthlyHOA + monthlyPMI) * monthsInYear,
    });
  }
  return years;
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}
