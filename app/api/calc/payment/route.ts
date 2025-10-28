// app/api/calc/payment/route.ts

// Import VALUES from lib (functions/classes/etc.)
import { payment } from "../../../../lib/calculators/payment";
// Import TYPES separately so our preflight doesn't treat them like values
import type { PaymentInput } from "../../../../lib/calculators/payment";

import { NextResponse } from "next/server";

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

  if (!input.purchasePrice || !input.annualRatePct) {
    const meta: Meta = {
      tag: "calc-v2-piti",
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

  return NextResponse.json(
    {
      ...result,
      meta: { ...(result.meta as Meta), path: "calc" },
    },
    { status: 200 }
  );
}

function num(v?: string) {
  const n = v ? Number(v) : 0;
  return Number.isFinite(n) ? n : 0;
}
