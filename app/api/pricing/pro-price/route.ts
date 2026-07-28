// app/api/pricing/pro-price/route.ts
// Public, unauthenticated — returns the current real Pro price so the
// pricing page never displays a number that disagrees with what
// checkout actually charges (see lib/stripe.ts's getCurrentProPricing).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentProPricing } from "../../../../lib/stripe";

export async function GET() {
  return NextResponse.json(getCurrentProPricing());
}
