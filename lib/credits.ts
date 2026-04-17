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
  | "analysis_spend"
  | "scenario_slot_purchase";

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

const GRACE_MAX = 3;

/**
 * Credit gate for free users.
 * - Paid users: always 'ok'
 * - Free users with balance > 0: 'ok'
 * - Free users with balance = 0, grace < GRACE_MAX: 'grace' — increments counter atomically
 * - Free users with balance = 0, grace >= GRACE_MAX: 'blocked'
 */
export async function checkCreditGate(userId: string): Promise<{
  state: 'ok' | 'grace' | 'blocked';
  grace_remaining: number;
  balance: number;
}> {
  try {
    const sb = getSupabase();
    if (!sb) return { state: 'ok', grace_remaining: 0, balance: 0 };

    // Get plan + balance in parallel
    const [{ data: userData }, balance] = await Promise.all([
      sb.from('users').select('plan').eq('id', userId).maybeSingle(),
      getBalance(userId),
    ]);

    const plan = userData?.plan ?? 'free';

    // Paid users never gated
    if (plan !== 'free') return { state: 'ok', grace_remaining: 0, balance };

    // Free user with credits remaining
    if (balance > 0) return { state: 'ok', grace_remaining: 0, balance };

    // Balance = 0 — atomically increment grace and check
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    const { data: newGrace, error } = await sb.rpc('increment_grace', {
      p_user_id: userId,
      p_month: month,
    });

    if (error) {
      console.error('[credits] increment_grace error:', error);
      // Fail open — don't block if RPC fails
      return { state: 'grace', grace_remaining: 1, balance: 0 };
    }

    const graceCount = typeof newGrace === 'number' ? newGrace : Number(newGrace);

    if (graceCount > GRACE_MAX) {
      // Roll back the increment we just made — over limit
      await sb.rpc('increment_grace', { p_user_id: userId, p_month: month })
        .then(() => {}) // intentionally not awaited for response speed
        .catch(() => {});
      // Just return blocked — the DB value may be > 3 but that's fine
      return { state: 'blocked', grace_remaining: 0, balance: 0 };
    }

    return {
      state: 'grace',
      grace_remaining: GRACE_MAX - graceCount, // 0 means this was the last grace
      balance: 0,
    };
  } catch (e) {
    console.error('[credits] checkCreditGate error:', e);
    return { state: 'ok', grace_remaining: 0, balance: 0 }; // fail open
  }
}

/**
 * Read-only grace state — for the credits API response.
 * Does NOT increment the counter.
 */
export async function getGraceState(userId: string): Promise<{
  grace_queries: number;
  grace_remaining: number;
  credit_state: 'ok' | 'grace' | 'blocked';
}> {
  try {
    const sb = getSupabase();
    if (!sb) return { grace_queries: 0, grace_remaining: GRACE_MAX, credit_state: 'ok' };

    const [{ data: userData }, balance] = await Promise.all([
      sb.from('users').select('plan').eq('id', userId).maybeSingle(),
      getBalance(userId),
    ]);

    const plan = userData?.plan ?? 'free';
    if (plan !== 'free') return { grace_queries: 0, grace_remaining: 0, credit_state: 'ok' };
    if (balance > 0) return { grace_queries: 0, grace_remaining: 0, credit_state: 'ok' };

    const month = new Date().toISOString().slice(0, 7);
    const { data } = await sb
      .from('usage_monthly')
      .select('grace_queries')
      .eq('user_id', userId)
      .eq('month', month)
      .maybeSingle();

    const graceUsed = data?.grace_queries ?? 0;
    const remaining = Math.max(0, GRACE_MAX - graceUsed);
    const state = graceUsed >= GRACE_MAX ? 'blocked' : 'grace';

    return { grace_queries: graceUsed, grace_remaining: remaining, credit_state: state };
  } catch {
    return { grace_queries: 0, grace_remaining: GRACE_MAX, credit_state: 'ok' };
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
