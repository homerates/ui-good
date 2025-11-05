import { NextResponse } from "next/server";
import { parseCalcQuery } from "../field-aware-parser";
import { payment, type PaymentInput } from "../../../../lib/calculators/payment";

/** Lightweight numeric helper (trims $ and commas). */
function toNum(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/[\$,]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/** Legacy V1 builder (your original behavior). */
function buildInputFromSearchV1(sp: URLSearchParams): Partial<PaymentInput> {
  return {
    purchasePrice: toNum(sp.get("purchasePrice")),
    downPercent: toNum(sp.get("downPercent")),
    annualRatePct: toNum(sp.get("annualRatePct")) ?? toNum(sp.get("rate")),
    termYears: toNum(sp.get("termYears")) ?? toNum(sp.get("term")),
    loanAmount: toNum(sp.get("loanAmount")) ?? toNum(sp.get("amount")) ?? toNum(sp.get("price")),
    // optional PITI inputs
    taxesPct: toNum(sp.get("taxesPct")),
    insPerYear: toNum(sp.get("insPerYear")),
    hoaPerMonth: toNum(sp.get("hoaPerMonth")) ?? toNum(sp.get("hoaMonthly")),
    miPct: toNum(sp.get("miPct")),
  };
}

/** Minimal sanity validator for what payment() needs. */
function isValidCore(x: Partial<PaymentInput>): x is PaymentInput {
  const loanAmount = x.loanAmount;
  const annualRatePct = x.annualRatePct;
  const termYears = x.termYears;
  if (!loanAmount || loanAmount < 10000) return false;
  if (!annualRatePct || annualRatePct < 0.5 || annualRatePct > 25) return false;
  if (!termYears || termYears < 5 || termYears > 40) return false;
  return true;
}

/** Build V2 (natural language first, with legacy numeric augment + derivations). */
function buildInputV2(searchParams: URLSearchParams, q: string | null): Partial<PaymentInput> & { _debug?: any } {
  // Parse from free-form text if present
  let pLoan: number | undefined;
  let pRate: number | undefined;
  let pYears: number | undefined;
  let pTaxPct: number | undefined;
  let pInsMonthly: number | undefined;
  let pHoaMonthly: number | undefined;

  if (q) {
    const parsed = parseCalcQuery(q);
    pLoan = parsed.loanAmount;
    pRate = parsed.annualRatePct;
    pYears = parsed.termYears;
    pTaxPct = parsed.taxesPct;
    pInsMonthly = parsed.insuranceMonthly;
    pHoaMonthly = parsed.hoaMonthly;
  }

  // Legacy numeric overlays (don’t break old links)
  const months = toNum(searchParams.get("months"));
  const fallbackTermYears = toNum(searchParams.get("termYears")) ?? toNum(searchParams.get("term")) ?? (months ? months / 12 : undefined);
  const legacyLoanAmount = toNum(searchParams.get("loanAmount")) ?? toNum(searchParams.get("amount")) ?? toNum(searchParams.get("price"));
  const legacyRatePct = toNum(searchParams.get("annualRatePct")) ?? toNum(searchParams.get("rate"));
  const legacyTaxesPct = toNum(searchParams.get("taxesPct"));
  const insPerYear = toNum(searchParams.get("insPerYear"));
  const insPerMonthLegacy = toNum(searchParams.get("insPerMonth")) ?? toNum(searchParams.get("insuranceMonthly"));
  const legacyHoaMonthly = toNum(searchParams.get("hoaPerMonth")) ?? toNum(searchParams.get("hoaMonthly"));

  // Prefer parsed, overlay legacy if missing
  let loanAmount = pLoan ?? legacyLoanAmount;
  let annualRatePct = pRate ?? legacyRatePct;
  let termYears = pYears ?? fallbackTermYears;
  let taxesPct = pTaxPct ?? legacyTaxesPct;
  let insuranceMonthly = pInsMonthly ?? (insPerMonthLegacy ?? (insPerYear != null ? insPerYear / 12 : undefined));
  let hoaPerMonth = pHoaMonthly ?? legacyHoaMonthly;

  // Derive from price/down% if needed
  const purchasePrice = toNum(searchParams.get("purchasePrice"));
  const downPercent = toNum(searchParams.get("downPercent"));
  if ((!loanAmount || loanAmount === 0) && purchasePrice != null) {
    const dp = downPercent ?? 0;
    const derived = purchasePrice * (1 - dp / 100);
    if (derived > 0) loanAmount = derived;
  }

  // Map to payment() expected keys
  const v2: Partial<PaymentInput> & { _debug?: any } = {
    loanAmount,
    annualRatePct,
    termYears,
    taxesPct,
    insPerYear: insuranceMonthly != null ? insuranceMonthly * 12 : undefined, // normalize monthly -> annual
    hoaPerMonth,
    _debug: { q, purchasePrice, downPercent, insuranceMonthly }, // harmless echo
  };
  return v2;
}

// WIDEN tag to string so version bumps never fail builds
type CalcPayload = {
  meta: { path: "calc"; tag: string; usedFRED: false; at: string };
  tldr: string;
  answer: ReturnType<typeof payment>;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || searchParams.get("query") || "";
  const mode = (searchParams.get("parser") || process.env.NEXT_PUBLIC_CALC_PARSER_MODE || "auto").toLowerCase() as "auto" | "v2" | "legacy";

  // Build candidates
  const v2 = buildInputV2(searchParams, q);
  const v1 = buildInputFromSearchV1(searchParams);

  // Choose input based on mode + validity
  let used: "v2" | "legacy";
  let loose: Partial<PaymentInput>;

  if (mode === "legacy") {
    loose = v1;
    used = "legacy";
  } else if (mode === "v2") {
    loose = v2;
    used = "v2";
    if (!isValidCore(loose)) {
      // hard fail in v2 mode to expose issues
      return NextResponse.json({ error: "Invalid inputs in v2 mode", inputEcho: { mode, q, v2, v1 } }, { status: 400 });
    }
  } else {
    // AUTO: prefer v2, fallback to legacy if invalid
    if (isValidCore(v2)) {
      loose = v2;
      used = "v2";
    } else if (isValidCore(v1)) {
      loose = v1;
      used = "legacy";
    } else {
      return NextResponse.json({ error: "Missing or invalid inputs", inputEcho: { mode, q, v2, v1 } }, { status: 400 });
    }
  }

  // Compute
  const result = payment(loose as PaymentInput);

  const payload: CalcPayload = {
    meta: { path: "calc", tag: "calc-v2-piti", usedFRED: false, at: new Date().toISOString() },
    tldr: "Principal & Interest with ±0.25% rate sensitivity.",
    answer: result,
  };

  // Light echo (helps you verify, harmless to clients)
  (payload as any).inputEcho = {
    modeUsed: used,
    q,
    loanAmount: (loose as any).loanAmount,
    annualRatePct: (loose as any).annualRatePct,
    termYears: (loose as any).termYears,
    taxesPct: (loose as any).taxesPct,
    insPerYear: (loose as any).insPerYear,
    hoaPerMonth: (loose as any).hoaPerMonth,
    _debug: (loose as any)._debug,
  };

  return NextResponse.json(payload);
}
