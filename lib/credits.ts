// lib/credits.ts
// Credit ledger helpers — never throw, never block the main request path.

import { getSupabase } from "./supabaseServer";

export type CreditType =
  | "plan_free_monthly"
  | "plan_plus_monthly"
  | "plan_plus_annual"
  | "plan_pro_monthly"
  | "plan_pro_annual"
  | "referral_bonus"
  | "founding_bonus"
  | "admin_grant"
  | "lo_gift"
  | "query_spend"
  | "analysis_spend";

/**
 * Award credits to a user. Idempotent when referenceId is provided.
 * Returns true on success, false silently on failure — never throws.
 */
export async function awardCredits(
  userId: string,
  amount: number,
  type: CreditType,
  description: string,
  referenceId?: string
): Promise<boolean> {
  try {
    const sb = getSupabase();
    if (!sb || amount <= 0) return false;

    // Dedup: skip if this referenceId was already processed for this user
    if (referenceId) {
      const { count } = await sb
        .from("credit_transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("reference_id", referenceId);
      if ((count ?? 0) > 0) {
        console.log(`[credits] dedup skip — ref=${referenceId} user=${userId}`);
        return false;
      }
    }

    await sb.from("credit_transactions").insert({
      user_id: userId,
      amount,
      type,
      description,
      reference_id: referenceId ?? null,
    });

    // Atomic balance update via DB function (GREATEST(0, balance + delta))
    await sb.rpc("adjust_credits", { p_user_id: userId, p_delta: amount });
    console.log(`[credits] awarded ${amount} (${type}) to user=${userId}`);
    return true;
  } catch (e) {
    console.error("[credits] awardCredits error:", e);
    return false;
  }
}

/**
 * Spend credits. Balance floors at 0 via DB function.
 * Non-blocking — failure never interrupts the calling request.
 */
export async function spendCredits(
  userId: string,
  amount: number,
  type: CreditType,
  description: string,
  referenceId?: string
): Promise<boolean> {
  try {
    const sb = getSupabase();
    if (!sb || amount <= 0) return false;
    await sb.from("credit_transactions").insert({
      user_id: userId,
      amount: -amount,
      type,
      description,
      reference_id: referenceId ?? null,
    });
    await sb.rpc("adjust_credits", { p_user_id: userId, p_delta: -amount });
    return true;
  } catch (e) {
    console.error("[credits] spendCredits error:", e);
    return false;
  }
}

export async function getBalance(userId: string): Promise<number> {
  try {
    const sb = getSupabase();
    if (!sb) return 0;
    const { data } = await sb
      .from("users")
      .select("credits_balance")
      .eq("id", userId)
      .maybeSingle();
    return data?.credits_balance ?? 0;
  } catch {
    return 0;
  }
}

export async function getHistory(userId: string, limit = 10) {
  try {
    const sb = getSupabase();
    if (!sb) return [];
    const { data } = await sb
      .from("credit_transactions")
      .select("id, amount, type, description, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as {
      id: string;
      amount: number;
      type: string;
      description: string | null;
      created_at: string;
    }[];
  } catch {
    return [];
  }
}
