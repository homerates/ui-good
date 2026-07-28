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
import { awardCredits, type CreditType } from "../../../../lib/credits";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------
async function updateUserPlan(userId: string, plan: PlanKey, customerId: string, periodEnd: Date | null) {
  const sb = getSupabase();
  if (!sb) return;

  // Update users table
  const { error: userErr } = await sb.from("users").upsert(
    {
      id: userId,
      plan,
      stripe_customer_id: customerId,
      billing_period_end: periodEnd?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id", ignoreDuplicates: false }
  );
  if (userErr) console.error(`[stripe/webhook] updateUserPlan upsert failed for user=${userId}:`, userErr);

  // Keep loan_officers.allowed_borrower_slots in sync
  await sb
    .from("loan_officers")
    .update({ plan, allowed_borrower_slots: getBorrowerSlots(plan) })
    .eq("user_id", userId);
}

// Newer Stripe API versions (clover+) moved period fields — guard against undefined
function safeTs(ts: unknown): string | null {
  const n = typeof ts === 'number' ? ts : null;
  if (!n) return null;
  const d = new Date(n * 1000);
  return isNaN(d.getTime()) ? null : d.toISOString();
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

  // current_period_* may be on items in newer API versions
  const item0 = sub.items.data[0] as any;
  const periodStart = (sub as any).current_period_start ?? item0?.current_period?.start ?? item0?.period?.start ?? null;
  const periodEnd   = (sub as any).current_period_end   ?? item0?.current_period?.end   ?? item0?.period?.end   ?? null;

  await sb.from("subscriptions").upsert(
    {
      id: subId,
      user_id: userId,
      status: sub.status,
      price_id: priceId,
      plan,
      current_period_start: safeTs(periodStart),
      current_period_end:   safeTs(periodEnd),
      cancel_at_period_end: sub.cancel_at_period_end,
      canceled_at: safeTs(sub.canceled_at),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id", ignoreDuplicates: false }
  );

  return plan;
}

// ---------------------------------------------------------------------------
// Map plan + price interval to credit award
// ---------------------------------------------------------------------------
function getPlanCreditAward(plan: PlanKey, priceId: string): { type: CreditType; amount: number } | null {
  const isAnnual =
    priceId === process.env.STRIPE_PLUS_ANNUAL_PRICE_ID ||
    priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID ||
    priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID_V2;

  const map: Record<string, { type: CreditType; amount: number }> = {
    "plus:monthly": { type: "plan_plus_monthly", amount: 500 },
    "plus:annual":  { type: "plan_plus_annual",  amount: 6000 },
    "pro:monthly":  { type: "plan_pro_monthly",  amount: 1000 },
    "pro:annual":   { type: "plan_pro_annual",   amount: 12000 },
  };
  if (plan === "free") return null;
  return map[`${plan}:${isAnnual ? "annual" : "monthly"}`] ?? null;
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
  if (!WEBHOOK_SECRET) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const body = await req.text();
  const sig  = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
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
      const item0 = sub.items.data[0] as any;
      const _periodEnd = (sub as any).current_period_end ?? item0?.current_period?.end ?? item0?.period?.end ?? null;
      await updateUserPlan(
        userId,
        plan ?? "free",
        customerId,
        _periodEnd ? new Date(_periodEnd * 1000) : null
      );
      console.log(`[stripe/webhook] provisioned plan=${plan} for user=${userId}`);

      // Award plan credits on new subscription
      const priceId = sub.items.data[0]?.price?.id ?? "";
      const award = getPlanCreditAward(plan ?? "free", priceId);
      if (award) {
        await awardCredits(userId, award.amount, award.type,
          `${plan} plan subscription — welcome credits`, sub.id);
      }
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

    const _item0 = sub.items.data[0] as any;
    const _pe = (sub as any).current_period_end ?? _item0?.current_period?.end ?? _item0?.period?.end ?? null;
    await updateUserPlan(
      userId,
      activePlan,
      customerId,
      _pe ? new Date(_pe * 1000) : null
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
  // invoice.payment_succeeded / invoice.paid — subscription renewals
  // Award credits on each billing cycle. Uses invoice.id as reference_id
  // so re-deliveries and duplicate events are safely deduped by awardCredits.
  // Handles both event names (invoice.paid is the current preferred name).
  // -------------------------------------------------------------------------
  if (event.type === "invoice.payment_succeeded" || event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const billingReason = (invoice as any).billing_reason as string | undefined;
    const invoiceAny = invoice as any;

    // Accepted billing reasons for credit award:
    //   subscription_cycle   = standard monthly/annual renewal
    //   subscription_update  = renewal after a plan upgrade/downgrade
    //   subscription_create  = skipped — checkout.session.completed already grants credits
    const CREDIT_REASONS = new Set(["subscription_cycle", "subscription_update"]);

    console.log(`[stripe/webhook] ${event.type} billing_reason=${billingReason} invoice=${invoice.id}`);

    if (CREDIT_REASONS.has(billingReason ?? "") && invoiceAny.subscription) {
      const customerId = invoice.customer as string;
      const userId = await getUserIdFromCustomer(customerId);
      console.log(`[stripe/webhook] renewal lookup customer=${customerId} → userId=${userId}`);

      if (userId) {
        const sub = await getStripe().subscriptions.retrieve(invoiceAny.subscription as string);
        const priceId = sub.items.data[0]?.price?.id ?? "";
        const plan = getPlanFromPriceId(priceId);
        const award = getPlanCreditAward(plan, priceId);
        console.log(`[stripe/webhook] renewal plan=${plan} priceId=${priceId} award=${JSON.stringify(award)}`);
        if (award) {
          await awardCredits(userId, award.amount, award.type,
            `${plan} plan renewal credits`, invoice.id);
          console.log(`[stripe/webhook] renewal credits ${award.amount} → user=${userId}`);
        }
      }
    } else {
      console.log(`[stripe/webhook] skipping ${event.type} — billing_reason=${billingReason} (not a renewal)`);
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
