import type { LoanScenario, LoanScenarioBounds } from '../types';

// A representative first-time-buyer scenario — no ties to a real listing or real lender quote.
export const mockLoanScenario: LoanScenario = {
  homePrice: 425_000,
  downPayment: 42_500, // 10%
  principal: 382_500,
  annualRatePct: 6.75,
  termMonths: 360,
  extraMonthlyPrincipal: 0,
  annualPropertyTax: 4_675, // ~1.1% of home price
  annualHomeownersInsurance: 1_600,
  monthlyHOA: 0,
  monthlyPMI: 165, // flat placeholder for a <20%-down scenario — see LoanScenario.monthlyPMI doc
};

export const mockLoanScenarioBounds: LoanScenarioBounds = {
  annualRatePct: { min: 4, max: 9, step: 0.125 },
  termMonths: { options: [180, 240, 360] }, // 15 / 20 / 30 year
  downPaymentPct: { min: 3, max: 50, step: 1 },
  extraMonthlyPrincipal: { min: 0, max: 1000, step: 25 },
};
