// lib/calculators/payment.ts

export type PaymentInput = {
  // Either supply loanAmount, or purchasePrice + downPercent to derive it
  loanAmount?: number;
  purchasePrice?: number;
  downPercent?: number;    // 20 -> 20%
  annualRatePct?: number;  // 6.5 -> 6.5
  termYears?: number;      // 30

  // Optional add-ons for PITI
  taxesPct?: number;       // annual property tax as % of price (e.g., 1.2)
  insPerYear?: number;     // homeowner's insurance per year (USD)
  hoaPerMonth?: number;    // HOA dues per month (USD)
  miPct?: number;          // annual MI % of loan (e.g., 0.6)
};

export type CalcAnswer = {
  loanAmount: number;        // always finite
  monthlyPI: number;         // always finite
  sensitivities: Array<{ rate: number; pi: number }>;
  monthlyTax: number;
  monthlyIns: number;
  monthlyHOA: number;
  monthlyMI: number;
  monthlyTotalPITI: number;
};

function isPos(n: unknown): n is number {
  return typeof n === "number" && isFinite(n) && n > 0;
}

export function payment(input: PaymentInput): CalcAnswer {
  // 1) Loan principal
  const principal = isPos(input.loanAmount)
    ? input.loanAmount!
    : (isPos(input.purchasePrice) && typeof input.downPercent === "number")
      ? input.purchasePrice! * (1 - (input.downPercent! / 100))
      : 0;

  // 2) Rate & term
  const annual = isPos(input.annualRatePct) ? (input.annualRatePct! / 100) : 0;
  const nper   = isPos(input.termYears)     ? (input.termYears! * 12)      : 0;

  // 3) PI (or safe zero)
  let monthlyPI = 0;
  if (principal > 0 && annual > 0 && nper > 0) {
    const r   = annual / 12;
    const pow = Math.pow(1 + r, nper);
    monthlyPI = principal * (r * pow) / (pow - 1);
  }

  // 4) Add-ons
  const taxBase = isPos(input.purchasePrice) ? input.purchasePrice! : principal;

  const monthlyTax = (typeof input.taxesPct === "number" && isFinite(input.taxesPct) && taxBase > 0)
    ? (taxBase * (input.taxesPct / 100)) / 12
    : 0;

  const monthlyIns = (typeof input.insPerYear === "number" && isFinite(input.insPerYear) && input.insPerYear! > 0)
    ? input.insPerYear! / 12
    : 0;

  const monthlyHOA = (typeof input.hoaPerMonth === "number" && isFinite(input.hoaPerMonth) && input.hoaPerMonth! > 0)
    ? input.hoaPerMonth!
    : 0;

  const monthlyMI = (typeof input.miPct === "number" && isFinite(input.miPct) && principal > 0)
    ? (principal * (input.miPct / 100)) / 12
    : 0;

  const monthlyTotalPITI = monthlyPI + monthlyTax + monthlyIns + monthlyHOA + monthlyMI;

  // 5) Sensitivities (±0.25%)
  const piAt = (annualRate: number) => {
    if (!(principal > 0 && nper > 0 && annualRate > 0)) return 0;
    const rr = annualRate / 12;
    const pw = Math.pow(1 + rr, nper);
    return principal * (rr * pw) / (pw - 1);
  };

  const base = annual || 0.065;

  return {
    loanAmount: Math.round(principal),
    monthlyPI: Math.round(monthlyPI * 100) / 100,
    sensitivities: [
      { rate: base - 0.0025, pi: Math.round(piAt(base - 0.0025) * 100) / 100 },
      { rate: base + 0.0025, pi: Math.round(piAt(base + 0.0025) * 100) / 100 },
    ],
    monthlyTax: Math.round(monthlyTax * 100) / 100,
    monthlyIns: Math.round(monthlyIns * 100) / 100,
    monthlyHOA: Math.round(monthlyHOA * 100) / 100,
    monthlyMI:  Math.round(monthlyMI  * 100) / 100,
    monthlyTotalPITI: Math.round(monthlyTotalPITI * 100) / 100,
  };
}
