// app/api/cron/consumer-invite-reminder/route.ts
// Weekly cron: find non-responding consumer invites → send reminder → refresh expiry
// Runs every Monday at 9:03am Pacific (see vercel.json)
// Protected by CRON_SECRET header

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../../../lib/supabaseServer";
import { emailConsumerInviteReminder } from "../../../../lib/sendEmail";

const MAX_REMINDERS  = 3;
const EXPIRES_HOURS  = 7 * 24;
const BASE           = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";
const DELAY_MS       = 120;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Find pending invites eligible for a reminder:
  // - not yet claimed
  // - reminder_count < MAX_REMINDERS
  // - last_reminded_at is NULL (never reminded) or > 6 days ago
  const sixDaysAgo = new Date(Date.now() - 6 * 24 * 3_600_000).toISOString();

  const { data: invites, error } = await sb
    .from("consumer_invites")
    .select("id, email, full_name, token, credits, reminder_count, last_reminded_at")
    .eq("status", "pending")
    .lt("reminder_count", MAX_REMINDERS)
    .or(`last_reminded_at.is.null,last_reminded_at.lt.${sixDaysAgo}`);

  if (error) {
    console.error("[invite-reminder] fetch error:", error);
    return NextResponse.json({ error: "DB fetch failed" }, { status: 500 });
  }

  const eligible = invites ?? [];
  console.log(`[invite-reminder] ${eligible.length} invites eligible for reminder`);

  let sent = 0, failed = 0;
  const newExpiry = new Date(Date.now() + EXPIRES_HOURS * 3_600_000).toISOString();

  for (const invite of eligible) {
    const firstName = (invite.full_name as string).split(/\s+/)[0].replace(/[^a-zA-Z]/g, "") || "there";
    const inviteUrl = `${BASE}/chat?invite=${invite.token}`;
    const reminderNum = ((invite.reminder_count as number) ?? 0) + 1;

    // Refresh expiry + increment counter
    await sb.from("consumer_invites")
      .update({
        expires_at:       newExpiry,
        reminder_count:   reminderNum,
        last_reminded_at: new Date().toISOString(),
      })
      .eq("id", invite.id);

    // Send reminder email
    try {
      await emailConsumerInviteReminder({
        toEmail:     invite.email as string,
        firstName,
        credits:     invite.credits as number,
        inviteUrl,
        reminderNum,
        senderName:  "Rayaan",
      });
      sent++;
    } catch (err) {
      console.error(`[invite-reminder] email failed for ${invite.email}:`, err);
      failed++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`[invite-reminder] done — sent:${sent} failed:${failed}`);
  return NextResponse.json({ ok: true, eligible: eligible.length, sent, failed });
}

// Allow GET for manual Vercel cron trigger (Vercel sends GET)
export async function GET(req: NextRequest) {
  return POST(req);
}
