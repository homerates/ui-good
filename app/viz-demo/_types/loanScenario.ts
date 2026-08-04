// The consumer's own inputs — never a lender quote, never ranked against another lender's
// numbers. Every field here is either something the consumer entered or a scenario adjustment
// they're exploring (the sliders in ScenarioSliderPanel mutate a LoanScenario, nothing else).
export interface LoanScenario {
  /** Full purchase price. Needed alongside `principal` for LTV/PMI math (PMI typically drops at 78-80% LTV). */
  homePrice: number;
  /** Dollar amount, not a percentage — the slider panel converts to/from % of homePrice for display. */
  downPayment: number;
  /** homePrice - downPayment. Derived, but stored explicitly so callers don't recompute it differently in different places. */
  principal: number;
  /** e.g. 6.75 for 6.75% — a rate the CONSUMER is modeling, never presented as an offer from a specific lender. */
  annualRatePct: number;
  /** e.g. 360 for a 30-year term. */
  termMonths: number;
  /** Optional extra principal paid every month, on top of the scheduled payment — drives the amortization crossover earlier. */
  extraMonthlyPrincipal?: number;
  annualPropertyTax: number;
  annualHomeownersInsurance: number;
  monthlyHOA?: number;
  /**
   * Explicit input for this scaffold. A real implementation would compute PMI from LTV and
   * drop it automatically at ~78% LTV per the Homeowners Protection Act — that's a fair
   * follow-up, not attempted here since it needs a real amortization-aware LTV lookup per
   * month, not just a flat monthly figure.
   */
  monthlyPMI?: number;
}

/** Bounds used by ScenarioSliderPanel — kept separate from the scenario itself so the same
 *  slider ranges can be reused/tuned without touching LoanScenario's shape. */
export interface LoanScenarioBounds {
  annualRatePct: { min: number; max: number; step: number };
  termMonths: { options: number[] }; // term is a discrete choice (15/20/30yr), not a continuous slider
  downPaymentPct: { min: number; max: number; step: number };
  extraMonthlyPrincipal: { min: number; max: number; step: number };
}
