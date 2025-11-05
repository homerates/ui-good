import { NextResponse } from "next/server";
import { parseCalcQuery } from "../field-aware-parser";
import { payment, type PaymentInput } from "../../../../lib/calculators/payment";
import { parseCalcQuery } from "../field-aware-parser";

type LoosePaymentInput = Partial<PaymentInput>;

function toNum(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function buildInputFromSearch(sp: URLSearchParams): LoosePaymentInput {
  return {
    purchasePrice: toNum(sp.get("purchasePrice")),
    downPercent: toNum(sp.get("downPercent")),
    annualRatePct: toNum(sp.get("annualRatePct")),
    termYears: toNum(sp.get("termYears")),
    loanAmount: toNum(sp.get("loanAmount")),
    // optional PITI inputs
    taxesPct: toNum(sp.get("taxesPct")),
    insPerYear: toNum(sp.get("insPerYear")),
    hoaPerMonth: toNum(sp.get("hoaPerMonth")),
    miPct: toNum(sp.get("miPct")),
  };
}

// WIDEN tag to string so version bumps never fail builds
type CalcPayload = {
  meta: { path: "calc"; tag: string; usedFRED: false; at: string };
  tldr: string;
  answer: ReturnType<typeof payment>;
};

export async function GET(req: Request) {
  // === NEW PARSER START ===
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || searchParams.get("query") || "";

  const toNum = (v: string | null) => (v ? Number(String(v).replace(/[\$,]/g, "")) : undefined);
  const months = toNum(searchParams.get("months"));
  const fallbackTermYears =
    toNum(searchParams.get("termYears")) ??
    toNum(searchParams.get("term")) ??
    (months ? months / 12 : undefined);

  let loanAmount: number | undefined;
  let annualRatePct: number | undefined;
  let termYears: number | undefined;
  let taxesPct: number | undefined;
  let insuranceMonthly: number | undefined;
  let hoaMonthly: number | undefined;

  if (q) {
    const parsed = parseCalcQuery(q);
    loanAmount = parsed.loanAmount;
    annualRatePct = parsed.annualRatePct;
    termYears = parsed.termYears ?? fallbackTermYears;
    taxesPct = parsed.taxesPct;
    insuranceMonthly = parsed.insuranceMonthly;
    hoaMonthly = parsed.hoaMonthly;
    console.log("Parsed (GET):", parsed);
  } else {
    loanAmount =
      toNum(searchParams.get("loanAmount")) ??
      toNum(searchParams.get("amount")) ??
      toNum(searchParams.get("price"));
    annualRatePct =
      toNum(searchParams.get("annualRatePct")) ??
      toNum(searchParams.get("rate"));
    termYears = fallbackTermYears;
    taxesPct = toNum(searchParams.get("taxesPct"));
    insuranceMonthly = toNum(searchParams.get("insuranceMonthly"));
    hoaMonthly = toNum(searchParams.get("hoaMonthly"));
  }

  if (!loanAmount || loanAmount < 10000) {
    return NextResponse.json({ error: "Missing or invalid loanAmount" }, { status: 400 });
  }
  if (!annualRatePct || annualRatePct < 0.5 || annualRatePct > 25) {
    return NextResponse.json({ error: "Missing or invalid annualRatePct" }, { status: 400 });
  }
  if (!termYears || termYears < 5 || termYears > 40) {
    return NextResponse.json({ error: "Missing or invalid termYears" }, { status: 400 });
  }

  const loose = {
    loanAmount,
    annualRatePct,
    termYears,
    taxesPct,
    insuranceMonthly,
    hoaMonthly,
  };

  const result = payment(loose as PaymentInput);
  // === NEW PARSER END ===


  // Lib guards bad inputs; no NaN returns
  const result = payment(loose as PaymentInput);

  const payload: CalcPayload = {
    meta: { path: "calc", tag: "calc-v2-piti", usedFRED: false, at: new Date().toISOString() },
    tldr: "Principal & Interest with ±0.25% rate sensitivity.",
    answer: result,
  };

  return NextResponse.json(payload);
}
