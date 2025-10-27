// app/api/calc/payment/route.ts
import { NextResponse } from "next/server";
// Relative path so we don't depend on tsconfig/jsconfig aliases
import { payment, type PaymentInput } from "../../../../lib/calculators/payment";

// Explicit meta type with tag: string (not a literal)
type Meta = {
  tag: string;
  path?: string;
  error?: string;
  [key: string]: unknown;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = Object.fromEntries(searchParams.entries()) as Record<string, string>;

  const input: PaymentInput = {
    purchasePrice: num(q.purchasePrice),
    downPercent: num(q.downPercent),
    annualRatePct: num(q.annualRatePct),
    termYears: num(q.termYears) || 30,
    taxesPct: num(q.taxesPct),
    insPerYear: num(q.insPerYear),
    hoaPerMonth: num(q.hoaPerMonth),
    miPct: num(q.miPct),
  };

  // Friendly guardrails (no throws)
  if (!input.purchasePrice || !input.annualRatePct) {
    const meta: Meta = {
      tag: "calc-v2-piti", // runtime value, type is string (not a literal)
      path: "calc",
      error: "Missing required parameters: purchasePrice & annualRatePct",
    };
    return NextResponse.json(
      {
        meta,
        required: ["purchasePrice", "annualRatePct"],
        received: input,
      },
      { status: 200 }
    );
  }

  const result = payment(input);
  const meta: Meta = { ...result.meta, path: "calc" };

  return NextResponse.json({ ...result, meta }, { status: 200 });
}

function num(v?: string) {
  const n = v ? Number(v) : 0;
  return Number.isFinite(n) ? n : 0;
}
