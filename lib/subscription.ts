// lib/subscription.ts
// Server-side helper: fetch a user's current plan from Supabase.
// Use this in Server Components and API routes.

import { getSupabase } from "./supabaseServer";
import { PLANS, type PlanKey } from "./stripe";

export interface UserPlan {
  plan: PlanKey;
  stripeCustomerId: string | null;
  billingPeriodEnd: Date | null;
  chatMessages: number;      // used this month
  chatLimit: number | null;  // null = unlimited
  pdfExports: number;        // used this month
  borrowerSlots: number;
  alertsEnabled: boolean;
}

/** Current month in 'YYYY-MM' format */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * getUserPlan(userId)
 * Returns the user's plan details and current-month usage.
 * Falls back to free plan if the user row doesn't exist yet.
 */
export async function getUserPlan(userId: string): Promise<UserPlan> {
  const sb = getSupabase();

  const fallback: UserPlan = {
    plan: "free",
    stripeCustomerId: null,
    billingPeriodEnd: null,
    chatMessages: 0,
    chatLimit: PLANS.free.chatMessages,
    pdfExports: 0,
    borrowerSlots: PLANS.free.borrowerSlots,
    alertsEnabled: PLANS.free.alerts,
  };

  if (!sb) return fallback;

  // Fetch user row, current month usage, and active subscription in parallel
  const [userResult, usageResult, subResult] = await Promise.all([
    sb.from("users").select("plan, stripe_customer_id, billing_period_end").eq("id", userId).single(),
    sb.from("usage_monthly").select("chat_messages, pdf_exports").eq("user_id", userId).eq("month", currentMonth()).single(),
    sb.from("subscriptions").select("plan, current_period_end, status").eq("user_id", userId).in("status", ["active", "trialing"]).order("current_period_end", { ascending: false }).limit(1).maybeSingle(),
  ]);

  // Prefer users.plan; fall back to active subscriptions row (handles webhook delivery delays)
  const planFromUsers = (userResult.data?.plan ?? "free") as PlanKey;
  const planFromSub   = (subResult.data?.plan ?? "free") as PlanKey;
  const plan: PlanKey = planFromUsers !== "free" ? planFromUsers : planFromSub;
  const planConfig = PLANS[plan] ?? PLANS.free;

  // Billing period: prefer users table, fall back to subscription row
  const periodEnd =
    userResult.data?.billing_period_end
      ? new Date(userResult.data.billing_period_end)
      : subResult.data?.current_period_end
      ? new Date(subResult.data.current_period_end)
      : null;

  return {
    plan,
    stripeCustomerId: userResult.data?.stripe_customer_id ?? null,
    billingPeriodEnd: periodEnd,
    chatMessages: usageResult.data?.chat_messages ?? 0,
    chatLimit:    planConfig.chatMessages === Infinity ? null : planConfig.chatMessages,
    pdfExports:   usageResult.data?.pdf_exports ?? 0,
    borrowerSlots: planConfig.borrowerSlots,
    alertsEnabled: planConfig.alerts,
  };
}

/**
 * incrementUsage(userId, type)
 * Atomically increments a usage counter for the current month.
 * Call this after each billable action.
 */
export async function incrementUsage(
  userId: string,
  type: "chat_messages" | "pdf_exports"
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const month = currentMonth();

  // Upsert row, then increment
  await sb.from("usage_monthly").upsert(
    { user_id: userId, month, chat_messages: 0, pdf_exports: 0 },
    { onConflict: "user_id,month", ignoreDuplicates: true }
  );

  await sb.rpc("increment_usage", { p_user_id: userId, p_month: month, p_field: type });
}

/**
 * canPostScenario(userId)
 * Returns whether the user can post a new scenario brief this month.
 * Counts directly from scenario_briefs — no extra DB column needed.
 */
export async function canPostScenario(
  userId: string
): Promise<{ allowed: boolean; used: number; limit: number | null }> {
  const plan = await getUserPlan(userId);
  const planConfig = PLANS[plan.plan] ?? PLANS.free;
  const limit = planConfig.scenarioPosts === Infinity ? null : planConfig.scenarioPosts;

  if (limit === null) return { allowed: true, used: 0, limit: null };

  const sb = getSupabase();
  if (!sb) return { allowed: true, used: 0, limit };

  const monthStart = `${currentMonth()}-01`;
  const [{ count }, { count: bonusCount }] = await Promise.all([
    sb.from("scenario_briefs")
      .select("id", { count: "exact", head: true })
      .eq("borrower_id", userId)
      .gte("created_at", monthStart),
    sb.from("credit_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "scenario_slot_purchase")
      .gte("created_at", monthStart),
  ]);

  const used = count ?? 0;
  const effectiveLimit = limit + (bonusCount ?? 0);
  return { allowed: used < effectiveLimit, used, limit: effectiveLimit };
}

/**
 * canChat(userId)
 * Returns true if the user is allowed to send another chat message.
 */
export async function canChat(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const plan = await getUserPlan(userId);
  if (plan.chatLimit === null) return { allowed: true };
  if (plan.chatMessages >= plan.chatLimit) {
    return {
      allowed: false,
      reason: `You've used all ${plan.chatLimit} free messages this month. Upgrade to Pro for unlimited access.`,
    };
  }
  return { allowed: true };
}
