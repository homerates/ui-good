import { NextResponse } from "next/server";
import { payment, type PaymentInput } from "../../../../lib/calculators/payment";

type LoosePaymentInput = Partial<PaymentInput>;

function toNum(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function buildInputFromSearch(sp: URLSearchParams): LoosePaymentInput {
  return {
    purchasePrice: toNum(sp.get("purchasePrice")),
    downPercent:   toNum(sp.get("downPercent")),
    annualRatePct: toNum(sp.get("annualRatePct")),
    termYears:     toNum(sp.get("termYears")),
    loanAmount:    toNum(sp.get("loanAmount")),
    // optional PITI inputs
    taxesPct:      toNum(sp.get("taxesPct")),
    insPerYear:    toNum(sp.get("insPerYear")),
    hoaPerMonth:   toNum(sp.get("hoaPerMonth")),
    miPct:         toNum(sp.get("miPct")),
  };
}

// WIDEN tag to string so version bumps never fail builds
type CalcPayload = {
  meta: { path: "calc"; tag: string; usedFRED: false; at: string };
  tldr: string;
  answer: ReturnType<typeof payment>;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const loose = buildInputFromSearch(searchParams);

  // Lib guards bad inputs; no NaN returns
  const result = payment(loose as PaymentInput);

  const payload: CalcPayload = {
    meta: { path: "calc", tag: "calc-v2-piti", usedFRED: false, at: new Date().toISOString() },
    tldr: "Principal & Interest with ±0.25% rate sensitivity.",
    answer: result,
  };

  return NextResponse.json(payload);
}
