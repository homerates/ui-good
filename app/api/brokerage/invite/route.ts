// app/api/brokerage/invite/route.ts
// POST — owner sends a direct email invite to join their brokerage team
// Body: { email: string }

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";
import { Resend } from "resend";
import { emailShell } from "../../../../lib/sendEmail";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const email: string = (body?.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Verify requester owns a brokerage
  const { data: brokerage } = await sb
    .from("brokerages")
    .select("id, name, invite_token")
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (!brokerage) {
    return NextResponse.json({ error: "You don't own a brokerage team" }, { status: 403 });
  }

  // Get inviter's name from Clerk
  let inviterName = "Your team admin";
  try {
    const clerk = await clerkClient();
    const cu = await clerk.users.getUser(userId);
    inviterName = [cu.firstName, cu.lastName].filter(Boolean).join(" ") || inviterName;
  } catch { /* non-blocking */ }

  const BASE = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";
  const joinLink = `${BASE}/join/${brokerage.invite_token}`;

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ error: "Email not configured" }, { status: 500 });

  const resend = new Resend(resendKey);
  const FROM = process.env.RESEND_FROM_EMAIL ?? "digest@mail.homerates.ai";

  const html = emailShell(`
    <h2 style="margin:0 0 12px;font-size:1.25rem;font-weight:700;color:#e6edf3;">
      You're invited to join ${brokerage.name} on HomeRates.ai
    </h2>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#8b949e;line-height:1.6;">
      ${inviterName} has invited you to join the <strong style="color:#e6edf3;">${brokerage.name}</strong> team on HomeRates.ai — the AI mortgage intelligence platform built for loan officers.
    </p>
    <p style="margin:0 0 8px;font-size:0.875rem;color:#8b949e;">Click below to accept and create your account (or sign in if you already have one):</p>
    <div style="margin:20px 0;">
      <a href="${joinLink}"
         style="display:inline-block;padding:12px 28px;background:#00e87a;color:#080c12;
                font-weight:700;font-size:0.95rem;border-radius:999px;text-decoration:none;">
        Join ${brokerage.name} →
      </a>
    </div>
    <p style="margin:20px 0 0;font-size:0.78rem;color:#4a5568;line-height:1.5;">
      Or copy this link: <a href="${joinLink}" style="color:#8b949e;">${joinLink}</a><br>
      This invite link can be reused by multiple team members.
    </p>
  `);

  const { error: sendErr } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${inviterName} invited you to join ${brokerage.name} on HomeRates.ai`,
    html,
  });

  if (sendErr) {
    console.error("[brokerage/invite] Resend error:", sendErr);
    return NextResponse.json({ error: "Failed to send invite email" }, { status: 500 });
  }

  console.log(`[brokerage/invite] Sent invite to ${email} for brokerage=${brokerage.id}`);
  return NextResponse.json({ ok: true });
}
