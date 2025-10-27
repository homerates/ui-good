// lib/calculators/payment.ts

export type PaymentInput = {
  loanAmount?: number;       // direct loan amount (overrides purchase/down if present)
  purchasePrice?: number;    // if provided with downPercent, derives loanAmount
  downPercent?: number;      // 20 -> 20%
  annualRatePct?: number;    // 6.5 -> 6.5%
  termYears?: number;        // 30
};

type CalcAnswer = {
  loanAmount: number;        // always a finite number
  monthlyPI: number;         // always a finite number
  sensitivities: Array<{ rate: number; pi: number }>;
};

export function payment(input: PaymentInput): CalcAnswer {
  // Normalize / derive principal
  const derivedLoan =
    typeof input.loanAmount === "number" && isFinite(input.loanAmount) && input.loanAmount > 0
      ? input.loanAmount
      : (typeof input.purchasePrice === "number" &&
         typeof input.downPercent === "number" &&
         isFinite(input.purchasePrice) &&
         isFinite(input.downPercent))
        ? input.purchasePrice * (1 - input.downPercent / 100)
        : 0;

  // Normalize rate and nper
  const annual = typeof input.annualRatePct === "number" && isFinite(input.annualRatePct)
    ? input.annualRatePct / 100
    : 0;
  const nper = typeof input.termYears === "number" && isFinite(input.termYears)
    ? input.termYears * 12
    : 0;

  // If missing pieces, return zeros (never NaN)
  if (!(derivedLoan > 0) || !(annual > 0) || !(nper > 0)) {
    const base = annual || 0.065; // harmless placeholder for sensitivity labels
    return {
      loanAmount: Math.max(0, Math.round(derivedLoan)),
      monthlyPI: 0,
      sensitivities: [
        { rate: base - 0.0025, pi: 0 },
        { rate: base + 0.0025, pi: 0 },
      ],
    };
  }

  // Standard fixed-rate mortgage formula
  const r = annual / 12;
  const pow = Math.pow(1 + r, nper);
  const pi = derivedLoan * (r * pow) / (pow - 1);

  const piAt = (annualRate: number) => {
    const rr = annualRate / 12;
    const pw = Math.pow(1 + rr, nper);
    return derivedLoan * (rr * pw) / (pw - 1);
  };

  const base = annual;
  const monthlyPI = Math.round(pi * 100) / 100;

  return {
    loanAmount: Math.round(derivedLoan),
    monthlyPI,
    sensitivities: [
      { rate: base - 0.0025, pi: Math.round(piAt(base - 0.0025) * 100) / 100 },
      { rate: base + 0.0025, pi: Math.round(piAt(base + 0.0025) * 100) / 100 },
    ],
  };
}
