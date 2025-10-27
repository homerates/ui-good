// app/api/calc/payment/route.ts
import { NextResponse } from "next/server";
import { payment, type PaymentInput } from "../../../../lib/calculators/payment";

// ---------- helpers ----------
function toNum(v: unknown): number | undefined {
  if (v == null) return undefined;
  const s = String(v).trim().replace(/[$,]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function pctToDecimal(v: unknown): number | undefined {
  const n = toNum(v);
  return n == null ? undefined : n / 100;
}

function buildInputFromSearch(search: URLSearchParams): PaymentInput {
  // Accept either loanAmount OR (purchasePrice + downPercent)
  const loanAmount    = toNum(search.get("loanAmount"));
  const purchasePrice = toNum(search.get("purchasePrice"));
  const downPctDec    = pctToDecimal(search.get("downPercent"));   // e.g. 20 -> 0.20
  const termYears     = toNum(search.get("termYears"));
  const annualRateDec =
    pctToDecimal(search.get("annualRatePct")) ??
    toNum(search.get("annualRate")); // allow decimal (e.g., 0.065)

  if (annualRateDec == null || termYears == null) {
    throw new Error("annualRatePct (or annualRate) and termYears are required");
  }

  const hasLoan = loanAmount != null;
  const hasPP   = purchasePrice != null && downPctDec != null;
  if (!hasLoan && !hasPP) {
    throw new Error("Provide loanAmount OR purchasePrice + downPercent");
  }

  return {
    loanAmount,
    purchasePrice,
    downPercent: downPctDec ?? undefined,
    annualRate: annualRateDec, // already decimal
    termYears
  };
}

// ---------- handlers ----------
export async function GET(req: Request) {
  try {
    const input = buildInputFromSearch(new URL(req.url).searchParams);
    return NextResponse.json(payment(input));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Bad request" }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<PaymentInput & {
      downPercentPct?: number;  // e.g. 20
      annualRatePct?: number;   // e.g. 6.5
    }>;

    const annualRate =
      typeof body.annualRate === "number"
        ? body.annualRate
        : typeof body.annualRatePct === "number"
          ? body.annualRatePct / 100
          : undefined;

    const downPercent =
      typeof body.downPercent === "number"
        ? body.downPercent
        : typeof body.downPercentPct === "number"
          ? body.downPercentPct / 100
          : undefined;

    const input: PaymentInput = {
      loanAmount: body.loanAmount,
      purchasePrice: body.purchasePrice,
      downPercent,
      annualRate: annualRate as number,
      termYears: body.termYears as number
    };

    if (!input.annualRate || !input.termYears) {
      throw new Error("annualRate (or annualRatePct) and termYears are required");
    }
    if (!input.loanAmount && !(input.purchasePrice && input.downPercent != null)) {
      throw new Error("Provide loanAmount OR purchasePrice + downPercent");
    }

    return NextResponse.json(payment(input));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Bad request" }, { status: 400 });
  }
}
