// lib/calculators/payment.ts
// Backward-compatible: exports both `calculatePayment` and `payment`.
// Adds MI auto-off via amortization and exposes `miDropsMonth`.

export type PaymentInput = {
  purchasePrice: number;       // e.g., 650000
  downPercent: number;         // e.g., 10
  annualRatePct: number;       // e.g., 6.75
  termYears: number;           // e.g., 30
  taxesPct?: number;           // annual % of purchase price, e.g., 1.1
  insPerYear?: number;         // annual insurance dollars, e.g., 1500
  hoaPerMonth?: number;        // monthly HOA dollars, e.g., 125
  miPct?: number;              // annual % of loan amount; include only if MI applies
};

export type PaymentResult = {
  meta: {
    tag: string;               // keep stable for UI: "calc-v2-piti"
    version: string;           // additive info, e.g., "mi-autooff-1"
  };
  purchasePrice: number;
  downPercent: number;
  loanAmount: number;
  annualRatePct: number;
  termYears: number;
  monthlyPI: number;

  // PITI components at month 1
  monthlyTax: number;
  monthlyIns: number;
  monthlyHOA: number;
  monthlyMI: number;
  monthlyTotalPITI: number;

  // Sensitivity (PI-only)
  sensitivity: {
    up025: number;
    down025: number;
  };

  // Month MI drops (1-indexed) when balance reaches 80% LTV; null if N/A
  miDropsMonth: number | null;
};

export function calculatePayment(input: PaymentInput): PaymentResult {
  const price = asNum(input.purchasePrice);
  const downPct = asNum(input.downPercent);
  const ratePct = asNum(input.annualRatePct);
  const years = Math.max(1, Math.floor(asNum(input.termYears) || 30));

  const loanAmount = round2(price * (1 - downPct / 100));
  const monthlyRate = ratePct > 0 ? (ratePct / 100) / 12 : 0;
  const n = years * 12;

  const monthlyPI =
    monthlyRate === 0
      ? round2(loanAmount / n)
      : round2(loanAmount * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -n))));

  // PITI pieces
  const monthlyTax = round2(((asNum(input.taxesPct) || 0) / 100) * price / 12);
  const monthlyIns = round2((asNum(input.insPerYear) || 0) / 12);
  const monthlyHOA = round2(asNum(input.hoaPerMonth) || 0);

  const initialLTV = price > 0 ? (loanAmount / price) * 100 : 0;
  const hasMIInput = (asNum(input.miPct) || 0) > 0;
  const monthlyMIStart = (initialLTV > 80 && hasMIInput)
    ? round2(loanAmount * ((asNum(input.miPct) || 0) / 100) / 12)
    : 0;

  const miDropsMonth = (initialLTV > 80 && hasMIInput)
    ? monthToReachBalance(loanAmount, price * 0.80, monthlyPI, monthlyRate, n)
    : null;

  const monthlyTotalPITI = round2(monthlyPI + monthlyTax + monthlyIns + monthlyHOA + monthlyMIStart);

  const sensitivity = {
    up025: round2(piAt(ratePct + 0.25, loanAmount, years)),
    down025: round2(piAt(Math.max(ratePct - 0.25, 0), loanAmount, years)),
  };

  return {
    meta: { tag: "calc-v2-piti", version: "mi-autooff-1" },
    purchasePrice: price,
    downPercent: downPct,
    loanAmount,
    annualRatePct: ratePct,
    termYears: years,
    monthlyPI,
    monthlyTax,
    monthlyIns,
    monthlyHOA,
    monthlyMI: monthlyMIStart,
    monthlyTotalPITI,
    sensitivity,
    miDropsMonth,
  };
}

// Back-compat alias so routes that import { payment } keep working.
export function payment(input: PaymentInput): PaymentResult {
  return calculatePayment(input);
}

// --- helpers ---

function asNum(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (typeof v === "number" ? v : 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function piAt(annualRatePct: number, loanAmount: number, years: number): number {
  const r = annualRatePct > 0 ? (annualRatePct / 100) / 12 : 0;
  const n = years * 12;
  if (r === 0) return loanAmount / n;
  return loanAmount * (r / (1 - Math.pow(1 + r, -n)));
}

/** Find the 1-indexed month where balance <= targetBalance; null if never. */
function monthToReachBalance(
  startBalance: number,
  targetBalance: number,
  monthlyPI: number,
  monthlyRate: number,
  maxMonths: number
): number | null {
  if (monthlyRate === 0) {
    const months = Math.ceil((startBalance - targetBalance) / monthlyPI);
    return months > 0 && months <= maxMonths ? months : null;
  }
  let bal = startBalance;
  for (let m = 1; m <= maxMonths; m++) {
    const interest = bal * monthlyRate;
    const principal = monthlyPI - interest;
    bal -= principal;
    if (bal <= targetBalance) return m;
    if (bal <= 0) return m;
  }
  return null;
}
