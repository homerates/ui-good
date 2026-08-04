// Scenario-level helpers that don't need a full amortization schedule — LTV, down payment %,
// and the "current" monthly payment figure shown above the composition chart.
import type { LoanScenario } from '../types';
import { monthlyPI } from './amortization';

export function loanToValuePct(scenario: LoanScenario): number {
  if (scenario.homePrice <= 0) return 0;
  return (scenario.principal / scenario.homePrice) * 100;
}

export function downPaymentPct(scenario: LoanScenario): number {
  if (scenario.homePrice <= 0) return 0;
  return (scenario.downPayment / scenario.homePrice) * 100;
}

/** Total month-1 payment (P&I + escrow) — the "sticker number" shown above the chart, before the consumer explores how it decomposes over time. */
export function totalMonthlyPayment(scenario: LoanScenario): number {
  const pi = monthlyPI(scenario.principal, scenario.annualRatePct, scenario.termMonths);
  const escrow =
    scenario.annualPropertyTax / 12 +
    scenario.annualHomeownersInsurance / 12 +
    (scenario.monthlyHOA ?? 0) +
    (scenario.monthlyPMI ?? 0);
  return pi + escrow + (scenario.extraMonthlyPrincipal ?? 0);
}
