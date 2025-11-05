import { NextResponse } from "next/server";
import { parseCalcQuery } from "../field-aware-parser";
import { payment, type PaymentInput } from "../../../../lib/calculators/payment";

type LoosePaymentInput = Partial<PaymentInput>;

// small helper kept for legacy numeric query params
function toNum(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/[\$,]/g, ""));
  return Number.isFinite(n) ? n : undefined;
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

  const months = toNum(searchParams.get("months"));
  const fallbackTermYears =
    toNum(searchParams.get("termYears")) ??
    toNum(searchParams.get("term")) ??
    (months ? months / 12 : undefined);

  let loanAmount: number | undefined;
  let annualRatePct: number | undefined;
  let termYears: number | undefined;
  let taxesPct: number | undefined;
  let insuranceMonthly: number | undefined; // user input as monthly $
  let hoaMonthly: number | undefined;

  if (q) {
    // Natural-language path
    const parsed = parseCalcQuery(q);
    loanAmount = parsed.loanAmount;
    annualRatePct = parsed.annualRatePct;
    termYears = parsed.termYears ?? fallbackTermYears;
    taxesPct = parsed.taxesPct;
    insuranceMonthly = parsed.insuranceMonthly;
    hoaMonthly = parsed.hoaMonthly;
    console.log("Parsed (GET):", parsed);
  } else {
    // Legacy querystring path (keeps old links working)
    loanAmount =
      toNum(searchParams.get("loanAmount")) ??
      toNum(searchParams.get("amount")) ??
      toNum(searchParams.get("price"));
    annualRatePct =
      toNum(searchParams.get("annualRatePct")) ??
      toNum(searchParams.get("rate"));
    termYears = fallbackTermYears;

    // Optional legacy extras
    taxesPct = toNum(searchParams.get("taxesPct"));
    // Support both annual and monthly insurance params if present
    const insPerYear = toNum(searchParams.get("insPerYear"));
    const insPerMonth = toNum(searchParams.get("insPerMonth")) ?? toNum(searchParams.get("insuranceMonthly"));
    insuranceMonthly = insPerMonth ?? (insPerYear != null ? insPerYear / 12 : undefined);

    hoaMonthly = toNum(searchParams.get("hoaPerMonth")) ?? toNum(searchParams.get("hoaMonthly"));
  }

  // Minimal sanity guards (prevents the "$30 loan" bug)
  if (!loanAmount || loanAmount < 10000) {
    return NextResponse.json({ error: "Missing or invalid loanAmount" }, { status: 400 });
  }
  if (!annualRatePct || annualRatePct < 0.5 || annualRatePct > 25) {
    return NextResponse.json({ error: "Missing or invalid annualRatePct" }, { status: 400 });
  }
  if (!termYears || termYears < 5 || termYears > 40) {
    return NextResponse.json({ error: "Missing or invalid termYears" }, { status: 400 });
  }

  // Map to your calculator’s expected input keys
  const loose: LoosePaymentInput = {
    loanAmount,
    annualRatePct,
    termYears,
    taxesPct,                              // %
    insPerYear: insuranceMonthly ? insuranceMonthly * 12 : undefined, // convert monthly -> annual
    hoaPerMonth: hoaMonthly,               // $
  };

  // Lib guards bad inputs; no NaN returns
  const result = payment(loose as PaymentInput);
  // === NEW PARSER END ===

  const payload: CalcPayload = {
    meta: { path: "calc", tag: "calc-v2-piti", usedFRED: false, at: new Date().toISOString() },
    tldr: "Principal & Interest with ±0.25% rate sensitivity.",
    answer: result,
  };

  return NextResponse.json(payload);
}
