import { NextResponse } from "next/server";
import { payment, type PaymentInput } from "../../../../lib/calculators/payment";

function toNum(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function buildInputFromSearch(sp: URLSearchParams): PaymentInput {
  return {
    purchasePrice: toNum(sp.get("purchasePrice")),
    downPercent:   toNum(sp.get("downPercent")),
    annualRatePct: toNum(sp.get("annualRatePct")),
    termYears:     toNum(sp.get("termYears")),
    loanAmount:    toNum(sp.get("loanAmount")),
  };
}

type CalcPayload = {
  meta: { path: "calc"; tag: "calc-v1"; usedFRED: false; at: string };
  tldr: string;
  answer: ReturnType<typeof payment>;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const input = buildInputFromSearch(searchParams);
  const result = payment(input);

  const payload: CalcPayload = {
    meta: { path: "calc", tag: "calc-v1", usedFRED: false, at: new Date().toISOString() },
    tldr: "Principal & Interest with ±0.25% rate sensitivity.",
    answer: result,
  };

  return NextResponse.json(payload);
}
