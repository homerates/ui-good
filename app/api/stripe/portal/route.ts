// app/api/stripe/portal/route.ts
// Creates a Stripe Customer Portal session for billing management.
// User must already have a Stripe customer ID (i.e. have subscribed before).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { stripe } from "../../../../lib/stripe";
import { getSupabase } from "../../../../lib/supabaseServer";

const APP_URL = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";

export async function POST(_req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const { data: userRow } = await sb
    .from("users")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  const stripeCustomerId = userRow?.stripe_customer_id;

  if (!stripeCustomerId) {
    return NextResponse.json(
      { error: "No billing account found. Please subscribe first." },
      { status: 404 }
    );
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${APP_URL}/lo/dashboard`,
  });

  return NextResponse.json({ url: portalSession.url });
}
