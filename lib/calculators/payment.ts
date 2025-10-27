// lib/calculators/payment.ts

export type PaymentInput = {
  purchasePrice: number;       // e.g., 650000
  downPercent: number;         // e.g., 10  (percentage of purchase price)
  annualRatePct: number;       // e.g., 6.75
  termYears: number;           // e.g., 30
  taxesPct?: number;           // e.g., 1.1 (annual % of purchase price)
  insPerYear?: number;         // e.g., 1500
  hoaPerMonth?: number;        // e.g., 125
  miPct?: number;              // e.g., 0.5 (annual % of loan amount; set only if MI applies)
};

export type PaymentResult = {
  meta: {
    tag: string;               // keep stable: "calc-v2-piti"
    version: string;           // additive info (e.g., "mi-autooff-1")
  };
  purchasePrice: number;
  downPercent: number;
  loanAmount: number;
  annualRatePct: number;
  termYears: number;
  monthlyPI: number;

  // PITI components (start-of-loan)
  monthlyTax: number;
  monthlyIns: number;
  monthlyHOA: number;
  monthlyMI: number;
  monthlyTotalPITI: number;

  // Sensitivity on PI only (±0.25%)
  sensitivity: {
    up025: number;
    down025: number;
  };

  // New, optional: month when MI drops based on amortization to 80% LTV (1-indexed)
  miDropsMonth: number | null;
};

export function calculatePayment(input: PaymentInput): PaymentResult {
  const price = asNumber(input.purchasePrice);
  const downPct = asNumber(input.downPercent);
  const ratePct = asNumber(input.annualRatePct);
  const years = Math.max(1, Math.floor(asNumber(input.termYears) || 30));

  const loanAmount = round2(price * (1 - downPct / 100));
  const monthlyRate = ratePct > 0 ? (ratePct / 100) / 12 : 0;
  const n = years * 12;

  const monthlyPI =
    monthlyRate === 0
      ? round2(loanAmount / n)
      : round2(loanAmount * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -n))));

  // PITI components (defaults safe to zero)
  const monthlyTax = round2(((asNumber(input.taxesPct) || 0) / 100) * price / 12);
  const monthlyIns = round2((asNumber(input.insPerYear) || 0) / 12);
  const monthlyHOA = round2(asNumber(input.hoaPerMonth) || 0);

  const initialLTV = price > 0 ? (loanAmount / price) * 100 : 0;
  const hasMIInput = (asNumber(input.miPct) || 0) > 0;

  // MI at start only applies if initial LTV > 80 and borrower provided an MI percent
  const monthlyMIStart = (initialLTV > 80 && hasMIInput)
    ? round2(loanAmount * ((asNumber(input.miPct) || 0) / 100) / 12)
    : 0;

  // Compute month where balance reaches 80% LTV (only if MI is applicable)
  const miDropsMonth = (initialLTV > 80 && hasMIInput && monthlyRate >= 0)
    ? calcMIDropMonth(loanAmount, price * 0.80, monthlyPI, monthlyRate, n)
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

// --- helpers ---

function asNumber(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (typeof v === "number" ? v : 0);
  return isFinite(n) ? n : 0;
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

/**
 * Returns the 1-indexed month when unpaid balance <= targetBalance.
 * If never reaches, returns null. Uses standard fixed-rate amortization.
 */
function calcMIDropMonth(
  startBalance: number,
  targetBalance: number,
  monthlyPI: number,
  monthlyRate: number,
  maxMonths: number
): number | null {
  if (monthlyRate === 0) {
    // Zero-rate edge case: purely linear paydown
    const months = Math.ceil((startBalance - targetBalance) / monthlyPI);
    return months > 0 && months <= maxMonths ? months : null;
  }

  let bal = startBalance;
  for (let m = 1; m <= maxMonths; m++) {
    const interest = bal * monthlyRate;
    const principal = monthlyPI - interest;
    bal = bal - principal;
    if (bal <= targetBalance) return m;
    if (bal <= 0) return m; // safety
  }
  return null;
}
