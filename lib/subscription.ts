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

  // Fetch user row + current month usage in parallel
  const [userResult, usageResult] = await Promise.all([
    sb.from("users").select("plan, stripe_customer_id, billing_period_end").eq("id", userId).single(),
    sb.from("usage_monthly").select("chat_messages, pdf_exports").eq("user_id", userId).eq("month", currentMonth()).single(),
  ]);

  const plan = (userResult.data?.plan ?? "free") as PlanKey;
  const planConfig = PLANS[plan] ?? PLANS.free;

  return {
    plan,
    stripeCustomerId: userResult.data?.stripe_customer_id ?? null,
    billingPeriodEnd: userResult.data?.billing_period_end
      ? new Date(userResult.data.billing_period_end)
      : null,
    chatMessages: usageResult.data?.chat_messages ?? 0,
    chatLimit: planConfig.chatMessages === Infinity ? null : planConfig.chatMessages,
    pdfExports: usageResult.data?.pdf_exports ?? 0,
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
