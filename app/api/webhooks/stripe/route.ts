// app/api/webhooks/stripe/route.ts
// Handles Stripe subscription lifecycle events.
// Configure in Stripe Dashboard → Developers → Webhooks → Add endpoint:
//   URL: https://chat.homerates.ai/api/webhooks/stripe
//   Events: checkout.session.completed, customer.subscription.updated,
//           customer.subscription.deleted, invoice.payment_failed

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, getPlanFromPriceId, getBorrowerSlots, type PlanKey } from "../../../../lib/stripe";
import { getSupabase } from "../../../../lib/supabaseServer";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is not set");

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------
async function updateUserPlan(userId: string, plan: PlanKey, customerId: string, periodEnd: Date | null) {
  const sb = getSupabase();
  if (!sb) return;

  // Update users table
  await sb.from("users").upsert(
    {
      id: userId,
      plan,
      stripe_customer_id: customerId,
      billing_period_end: periodEnd?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id", ignoreDuplicates: false }
  );

  // Keep loan_officers.allowed_borrower_slots in sync
  await sb
    .from("loan_officers")
    .update({ plan, allowed_borrower_slots: getBorrowerSlots(plan) })
    .eq("user_id", userId);
}

async function upsertSubscription(
  subId: string,
  userId: string,
  sub: Stripe.Subscription
) {
  const sb = getSupabase();
  if (!sb) return;

  const priceId = sub.items.data[0]?.price?.id ?? "";
  const plan = getPlanFromPriceId(priceId);

  await sb.from("subscriptions").upsert(
    {
      id: subId,
      user_id: userId,
      status: sub.status,
      price_id: priceId,
      plan,
      current_period_start: new Date((sub as unknown as { current_period_start: number }).current_period_start * 1000).toISOString(),
      current_period_end:   new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000).toISOString(),
      cancel_at_period_end: sub.cancel_at_period_end,
      canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id", ignoreDuplicates: false }
  );

  return plan;
}

// ---------------------------------------------------------------------------
// Resolve Stripe customer → Clerk userId via our users table
// ---------------------------------------------------------------------------
async function getUserIdFromCustomer(customerId: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("users")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();
  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(body, sig, WEBHOOK_SECRET!);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe/webhook] signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log(`[stripe/webhook] ${event.type}`);

  // -------------------------------------------------------------------------
  // checkout.session.completed
  // First payment — link customer to user, provision plan
  // -------------------------------------------------------------------------
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId  = session.metadata?.userId;
    const customerId = session.customer as string;

    if (!userId) {
      console.error("[stripe/webhook] checkout.session.completed missing userId metadata");
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Fetch full subscription
    if (session.subscription) {
      const sub = await getStripe().subscriptions.retrieve(session.subscription as string);
      const plan = await upsertSubscription(sub.id, userId, sub);
      await updateUserPlan(
        userId,
        plan ?? "free",
        customerId,
        new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000)
      );
      console.log(`[stripe/webhook] provisioned plan=${plan} for user=${userId}`);
    }
  }

  // -------------------------------------------------------------------------
  // customer.subscription.updated
  // Plan change, renewal, cancellation toggle
  // -------------------------------------------------------------------------
  if (event.type === "customer.subscription.updated") {
    const sub        = event.data.object as Stripe.Subscription;
    const customerId = sub.customer as string;
    const userId     = await getUserIdFromCustomer(customerId);

    if (!userId) {
      console.warn("[stripe/webhook] no user found for customer", customerId);
      return NextResponse.json({ ok: true });
    }

    const plan = await upsertSubscription(sub.id, userId, sub);
    const activePlan: PlanKey = (sub.status === "active" || sub.status === "trialing")
      ? (plan ?? "free")
      : "free";

    await updateUserPlan(
      userId,
      activePlan,
      customerId,
      new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000)
    );
    console.log(`[stripe/webhook] subscription updated → plan=${activePlan} user=${userId}`);
  }

  // -------------------------------------------------------------------------
  // customer.subscription.deleted
  // Subscription ended — downgrade to free
  // -------------------------------------------------------------------------
  if (event.type === "customer.subscription.deleted") {
    const sub        = event.data.object as Stripe.Subscription;
    const customerId = sub.customer as string;
    const userId     = await getUserIdFromCustomer(customerId);

    if (userId) {
      await upsertSubscription(sub.id, userId, sub);
      await updateUserPlan(userId, "free", customerId, null);
      console.log(`[stripe/webhook] subscription deleted → downgraded user=${userId}`);
    }
  }

  // -------------------------------------------------------------------------
  // invoice.payment_failed
  // Log it — Stripe retries automatically; we keep plan active until sub deletes
  // -------------------------------------------------------------------------
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    console.warn(`[stripe/webhook] payment failed for customer=${invoice.customer} amount=${invoice.amount_due}`);
    // Optionally: send email notification via Resend here
  }

  return NextResponse.json({ ok: true });
}
