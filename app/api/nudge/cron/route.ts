// app/api/nudge/cron/route.ts
// Cron: runs daily at 9am PT (17:00 UTC)
// Sends two types of nudges:
//   1. Inactivity nudge — user signed up 7 days ago, never sent a chat message
//   2. Re-engagement nudge — borrower has scenario responses waiting, hasn't shared contact after 48h

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../../../lib/supabaseServer";
import { Resend } from "resend";
import { emailShell } from "../../../../lib/sendEmail";

const FROM  = process.env.RESEND_FROM_EMAIL ?? "digest@homerates.ai";
const BASE  = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";
const SECRET = process.env.CRON_SECRET ?? "";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

function inactivityHtml(name: string): string {
  return emailShell(`
    <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">Still thinking it over?</p>
    <p style="margin:0 0 16px;font-size:22px;font-weight:800;color:#080c12;line-height:1.2;">Hi ${name}, your mortgage questions are waiting</p>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7a8d;line-height:1.6;">You joined HomeRates.ai but haven't had a chance to explore yet. The AI chat gives you real rate estimates, PITI breakdowns, and lender questions — in seconds, no sign-up required for a lender call.</p>
    <table cellpadding="0" cellspacing="0" style="background:#f4f6f9;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:0 0 24px;width:100%;">
      <tr><td style="font-size:14px;color:#374151;line-height:1.8;">
        ✅ &nbsp;Real rate benchmarks for your scenario<br>
        ✅ &nbsp;PITI breakdown (principal, interest, taxes, insurance)<br>
        ✅ &nbsp;5 questions to ask any lender before you commit<br>
        ✅ &nbsp;PDF export to keep or share
      </td></tr>
    </table>
    <a href="${BASE}/chat" style="display:inline-block;background:#00e87a;color:#07100f;font-weight:700;font-size:15px;padding:14px 28px;border-radius:999px;text-decoration:none;">Try the AI Chat →</a>
  `, `HomeRates.ai · You're receiving this because you signed up. <a href="${BASE}/profile" style="color:#9aa3af;">Manage preferences</a>`);
}

function reEngagementHtml(name: string, responseCount: number, loanType: string): string {
  const plural = responseCount === 1 ? "response" : "responses";
  return emailShell(`
    <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">Lenders are waiting</p>
    <p style="margin:0 0 16px;font-size:22px;font-weight:800;color:#080c12;line-height:1.2;">${responseCount} loan officer${responseCount > 1 ? "s have" : " has"} responded to your scenario</p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7a8d;line-height:1.6;">Your ${loanType.toUpperCase()} scenario has <strong style="color:#1a2530;">${responseCount} ${plural}</strong> from verified loan officers. Review their rates and approach — no obligation, no credit check.</p>
    <a href="${BASE}/connect/my-scenario" style="display:inline-block;background:#00e87a;color:#07100f;font-weight:700;font-size:15px;padding:14px 28px;border-radius:999px;text-decoration:none;">Review Responses →</a>
  `, "HomeRates.ai · Responses expire when your scenario closes.");
}

export async function GET(req: NextRequest) {
  // Auth: Vercel cron sends Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get("authorization") ?? "";
  if (SECRET && auth !== `Bearer ${SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabase();
  const resend = getResend();

  if (!sb || !resend) {
    return NextResponse.json({ error: "Missing DB or Resend" }, { status: 500 });
  }

  const now = new Date();
  let inactivitySent = 0;
  let reEngageSent = 0;

  // ── 1. Inactivity nudge ────────────────────────────────────────────────────
  // Target: users created 7 days ago (±12h window), never sent a chat message,
  //         and who have not already received this nudge.
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const windowStart  = new Date(sevenDaysAgo.getTime() - 12 * 60 * 60 * 1000);
  const windowEnd    = new Date(sevenDaysAgo.getTime() + 12 * 60 * 60 * 1000);

  const { data: inactiveUsers } = await sb
    .from("users")
    .select("id, email")
    .gte("created_at", windowStart.toISOString())
    .lte("created_at", windowEnd.toISOString())
    .is("nudge_inactivity_sent_at", null)
    .not("email", "is", null);

  for (const user of inactiveUsers ?? []) {
    if (!user.email) continue;

    // Check they haven't sent any messages
    const { data: userThreads } = await sb
      .from("conversation_threads")
      .select("id")
      .eq("borrower_id", user.id);
    const threadIds = (userThreads ?? []).map(t => t.id);
    const { count: msgCount } = threadIds.length > 0
      ? await sb.from("messages").select("id", { count: "exact", head: true }).eq("sender_role", "borrower").in("thread_id", threadIds)
      : { count: 0 };

    // Also check chat_threads — if they have any saved chats they were active
    const { count: chatCount } = await sb
      .from("chat_threads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if ((msgCount ?? 0) > 0 || (chatCount ?? 0) > 0) continue;

    const name = user.email.split("@")[0] ?? "there";

    try {
      await resend.emails.send({
        from: `HomeRates.ai <${FROM}>`,
        to: user.email,
        subject: "Your mortgage questions are waiting — try the AI chat",
        html: inactivityHtml(name),
      });

      // Mark sent so we don't re-send
      await sb.from("users").update({ nudge_inactivity_sent_at: now.toISOString() }).eq("id", user.id);
      inactivitySent++;
      console.log(`[nudge] inactivity sent → ${user.email}`);
    } catch (e) {
      console.error("[nudge] inactivity email failed:", e);
    }
  }

  // ── 2. Re-engagement nudge ─────────────────────────────────────────────────
  // Target: active scenarios with ≥1 response, >48h old, borrower hasn't
  //         shared contact, and nudge hasn't been sent yet.
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const { data: scenarios } = await sb
    .from("scenario_briefs")
    .select("id, borrower_id, loan_type, response_count, created_at")
    .eq("status", "active")
    .gte("response_count", 1)
    .lte("created_at", fortyEightHoursAgo.toISOString())
    .is("nudge_reengage_sent_at", null);

  for (const scenario of scenarios ?? []) {
    // Check borrower hasn't already shared contact in any thread for this scenario
    const { data: scenarioThreads } = await sb
      .from("conversation_threads")
      .select("id")
      .eq("borrower_id", scenario.borrower_id)
      .eq("scenario_id", scenario.id);
    const scenarioThreadIds = (scenarioThreads ?? []).map(t => t.id);
    const { count: shareCount } = scenarioThreadIds.length > 0
      ? await sb.from("contact_shares").select("id", { count: "exact", head: true }).in("thread_id", scenarioThreadIds)
      : { count: 0 };

    if ((shareCount ?? 0) > 0) continue;

    // Get borrower email
    const { data: borrowerUser } = await sb
      .from("users")
      .select("email")
      .eq("id", scenario.borrower_id)
      .maybeSingle();

    if (!borrowerUser?.email) continue;

    const name = borrowerUser.email.split("@")[0] ?? "there";

    try {
      await resend.emails.send({
        from: `HomeRates.ai <${FROM}>`,
        to: borrowerUser.email,
        subject: `${scenario.response_count} loan officer${scenario.response_count > 1 ? "s have" : " has"} responded to your scenario`,
        html: reEngagementHtml(name, scenario.response_count, scenario.loan_type ?? "mortgage"),
      });

      await sb.from("scenario_briefs").update({ nudge_reengage_sent_at: now.toISOString() }).eq("id", scenario.id);
      reEngageSent++;
      console.log(`[nudge] re-engage sent → ${borrowerUser.email} scenario=${scenario.id}`);
    } catch (e) {
      console.error("[nudge] re-engage email failed:", e);
    }
  }

  return NextResponse.json({ ok: true, inactivity_sent: inactivitySent, re_engage_sent: reEngageSent });
}
