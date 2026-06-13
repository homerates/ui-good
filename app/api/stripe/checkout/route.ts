// app/api/stripe/checkout/route.ts
// Creates a Stripe Checkout session and returns the URL.
// Body: { priceId: string }

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getStripe, isKnownPriceId } from "../../../../lib/stripe";
import { getSupabase } from "../../../../lib/supabaseServer";

const APP_URL = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { priceId } = body as { priceId?: string };

  if (!priceId) {
    return NextResponse.json({ error: "priceId is required" }, { status: 400 });
  }

  // Only allow the price IDs this app actually sells — never trust an arbitrary
  // price from the client.
  if (!isKnownPriceId(priceId)) {
    return NextResponse.json({ error: "Invalid priceId" }, { status: 400 });
  }

  // Get user's email from Clerk
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

  // Check if user already has a Stripe customer ID
  const sb = getSupabase();
  let stripeCustomerId: string | undefined;

  if (sb) {
    const { data: userRow } = await sb
      .from("users")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();
    stripeCustomerId = userRow?.stripe_customer_id ?? undefined;
  }

  // Create Stripe customer if they don't have one yet
  if (!stripeCustomerId) {
    const customer = await getStripe().customers.create({
      email,
      metadata: { userId },
    });
    stripeCustomerId = customer.id;

    // Store it immediately so concurrent requests don't create duplicates
    if (sb) {
      await sb
        .from("users")
        .upsert(
          { id: userId, email: email ?? "", stripe_customer_id: stripeCustomerId, updated_at: new Date().toISOString() },
          { onConflict: "id" }
        );
    }
  }

  // Create Checkout session
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { userId },
    success_url: `${APP_URL}/chat?subscription=success`,
    cancel_url:  `${APP_URL}/pricing?canceled=true`,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    subscription_data: {
      metadata: { userId },
    },
  });

  return NextResponse.json({ url: session.url });
}
