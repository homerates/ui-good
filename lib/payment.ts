// lib/calculators/payment.ts
export type PaymentInput = {
  purchasePrice?: number;   // e.g., 500000 when using downPercent
  downPercent?: number;     // e.g., 0.20
  loanAmount?: number;      // if provided, overrides purchasePrice/downPercent
  annualRate: number;       // e.g., 0.065 (6.5%)
  termYears: number;        // e.g., 30
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function calcPI(loan: number, annualRate: number, years: number) {
  const m = annualRate / 12;
  const n = years * 12;
  if (m === 0) return loan / n;
  return loan * (m * Math.pow(1 + m, n)) / (Math.pow(1 + m, n) - 1);
}

export function payment(input: PaymentInput) {
  const { purchasePrice, downPercent, loanAmount, annualRate, termYears } = input;
  const loan = typeof loanAmount === "number"
    ? loanAmount
    : round2((purchasePrice ?? 0) * (1 - (downPercent ?? 0)));

  const pi = calcPI(loan, annualRate, termYears);
  const step = 0.0025; // 0.25%

  return {
    meta: { path: "calc", tag: "calc-v1", usedFRED: false, at: new Date().toISOString() },
    tldr: "Principal & Interest with ±0.25% rate sensitivity.",
    answer: {
      loanAmount: round2(loan),
      monthlyPI: round2(pi),
      sensitivities: [-1, 1].map(mult => {
        const r = annualRate + mult * step;
        return { rate: r, pi: round2(calcPI(loan, r, termYears)) };
      })
    }
  };
}
