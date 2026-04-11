// app/api/debug/flow/route.ts
// Admin-only diagnostic: traces the full scenario + email + messaging flow
// GET /api/debug/flow — returns JSON report of current system state

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";
import { isAdminId } from "../../../../lib/adminAuth";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // ── 1. Admin check ────────────────────────────────────────────────────────
  if (!(await isAdminId(userId))) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const report: Record<string, unknown> = {};

  // ── 2. Current user info ──────────────────────────────────────────────────
  const clerk = await clerkClient();
  const me = await clerk.users.getUser(userId);
  const { data: meRow } = await sb.from("users")
    .select("id, email, role, plan, credits_balance, referred_by")
    .eq("id", userId).maybeSingle();

  report.current_user = {
    clerk_id: userId,
    clerk_email: me.emailAddresses[0]?.emailAddress ?? null,
    db_email: meRow?.email ?? null,
    emails_match: me.emailAddresses[0]?.emailAddress === meRow?.email,
    role: meRow?.role ?? null,
    plan: meRow?.plan ?? null,
    credits_balance: meRow?.credits_balance ?? null,
  };

  // ── 3. Scenarios owned by current user ───────────────────────────────────
  const { data: myScenarios } = await sb
    .from("scenario_briefs")
    .select("id, status, visibility, closes_at, response_count, created_at, referred_pro_id")
    .eq("borrower_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  const now = new Date();
  report.my_scenarios = (myScenarios ?? []).map(s => ({
    ...s,
    is_expired: s.closes_at ? new Date(s.closes_at) < now : false,
    closes_at_human: s.closes_at ? new Date(s.closes_at).toISOString() : null,
  }));

  // ── 4. All active scenarios on board ─────────────────────────────────────
  const { data: boardScenarios } = await sb
    .from("scenario_briefs")
    .select("id, status, visibility, closes_at, response_count, loan_type, state, referred_pro_id, borrower_id")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(20);

  report.board_scenarios = (boardScenarios ?? []).map(s => ({
    ...s,
    is_expired: s.closes_at ? new Date(s.closes_at) < now : false,
    mine: s.borrower_id === userId,
  }));

  // ── 5. LO / professional profile check ───────────────────────────────────
  const { data: loRow } = await sb.from("loan_officers")
    .select("user_id, lender, nmls, license_state")
    .eq("user_id", userId).maybeSingle();
  const { data: agentRow } = await sb.from("agents")
    .select("user_id, brokerage, license")
    .eq("user_id", userId).maybeSingle();

  report.pro_profile = {
    is_lo: !!loRow,
    lo_data: loRow ?? null,
    is_agent: !!agentRow,
    agent_data: agentRow ?? null,
  };

  // ── 6. All LOs + email resolution ────────────────────────────────────────
  const { data: allLOs } = await sb
    .from("loan_officers")
    .select("user_id, lender")
    .limit(20);

  const loIds = (allLOs ?? []).map(l => l.user_id);
  const { data: loUsers } = loIds.length > 0
    ? await sb.from("users").select("id, email").in("id", loIds)
    : { data: [] };

  const dbEmailMap: Record<string, string | null> = {};
  for (const u of loUsers ?? []) dbEmailMap[u.id] = u.email;

  // Clerk fallback check for null emails
  const missingEmailIds = loIds.filter(id => !dbEmailMap[id]);
  const clerkEmailMap: Record<string, string | null> = {};
  if (missingEmailIds.length > 0) {
    try {
      const clerkBatch = await clerk.users.getUserList({ userId: missingEmailIds, limit: 100 });
      for (const u of clerkBatch.data) {
        clerkEmailMap[u.id] = u.emailAddresses[0]?.emailAddress ?? null;
      }
    } catch (e) {
      clerkEmailMap["_error"] = String(e);
    }
  }

  report.lo_email_check = (allLOs ?? []).map(lo => ({
    user_id: lo.user_id,
    lender: lo.lender,
    db_email: dbEmailMap[lo.user_id] ?? null,
    clerk_email: clerkEmailMap[lo.user_id] ?? null,
    would_receive_alert: !!(dbEmailMap[lo.user_id] || clerkEmailMap[lo.user_id]),
  }));

  // ── 7. Resend / env config check ─────────────────────────────────────────
  report.env_check = {
    RESEND_API_KEY: process.env.RESEND_API_KEY ? `set (${process.env.RESEND_API_KEY.slice(0, 8)}...)` : "MISSING",
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL ?? "(using default: digest@homerates.ai)",
    NEXT_PUBLIC_APP_BASE_URL: process.env.NEXT_PUBLIC_APP_BASE_URL ?? "(not set)",
  };

  // ── 8. Message threads for current user ──────────────────────────────────
  const [asBorrower, asPro] = await Promise.all([
    sb.from("conversation_threads")
      .select("id, status, unread_borrower, unread_professional, last_message_at")
      .eq("borrower_id", userId).limit(5),
    sb.from("conversation_threads")
      .select("id, status, unread_borrower, unread_professional, last_message_at")
      .eq("professional_id", userId).limit(5),
  ]);

  report.my_threads = {
    as_borrower: asBorrower.data ?? [],
    as_professional: asPro.data ?? [],
    total_unread_borrower: (asBorrower.data ?? []).reduce((s, t) => s + (t.unread_borrower ?? 0), 0),
    total_unread_pro: (asPro.data ?? []).reduce((s, t) => s + (t.unread_professional ?? 0), 0),
  };

  // ── 9. Recent scenario responses ─────────────────────────────────────────
  const { data: recentResponses } = await sb
    .from("scenario_responses")
    .select("id, scenario_id, lo_id, lo_name, rate_estimate, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  report.recent_responses = recentResponses ?? [];

  return NextResponse.json(report, { headers: { "Content-Type": "application/json" } });
}
