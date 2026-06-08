// app/api/admin/consumer-invite/route.ts
// POST — admin creates a consumer invite: stores token in DB, sends branded email

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/adminAuth";
import { getSupabase } from "../../../../lib/supabaseServer";
import { emailConsumerInvite } from "../../../../lib/sendEmail";
import { randomBytes } from "crypto";

const BASE = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";
const EXPIRES_HOURS = 7 * 24; // 7 days

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const body = await req.json();
  const { email, fullName, phone, credits = 25, personalNote, senderName = "Rayaan" } = body;

  const cleanEmail = (email ?? "").trim().toLowerCase();
  const cleanName  = (fullName ?? "").trim();
  const cleanPhone = (phone ?? "").trim() || null;

  if (!cleanEmail || !cleanName) {
    return NextResponse.json({ error: "email and fullName required" }, { status: 400 });
  }
  if (typeof credits !== "number" || credits < 1 || credits > 10_000) {
    return NextResponse.json({ error: "credits must be 1–10,000" }, { status: 400 });
  }

  // Check for existing pending invite for this email — re-use token
  const { data: existing } = await sb
    .from("consumer_invites")
    .select("id, token, status")
    .eq("email", cleanEmail)
    .eq("status", "pending")
    .maybeSingle();

  let token: string;

  if (existing) {
    token = existing.token;
    // Refresh expiry
    const expiresAt = new Date(Date.now() + EXPIRES_HOURS * 3_600_000).toISOString();
    await sb.from("consumer_invites")
      .update({ credits, personal_note: personalNote ?? null, expires_at: expiresAt, full_name: cleanName, phone: cleanPhone })
      .eq("id", existing.id);
  } else {
    token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + EXPIRES_HOURS * 3_600_000).toISOString();

    const { error: insertErr } = await sb.from("consumer_invites").insert({
      email:         cleanEmail,
      full_name:     cleanName,
      phone:         cleanPhone,
      token,
      credits,
      personal_note: personalNote?.trim() || null,
      status:        "pending",
      expires_at:    expiresAt,
    });

    if (insertErr) {
      console.error("[consumer-invite] insert error:", insertErr);
      return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
    }
  }

  const inviteUrl = `${BASE}/chat?invite=${token}`;
  const firstName = cleanName.split(" ")[0];

  await emailConsumerInvite({
    toEmail:      cleanEmail,
    firstName,
    credits,
    inviteUrl,
    senderName,
    personalNote: personalNote?.trim() || undefined,
  });

  return NextResponse.json({ ok: true, inviteUrl, token });
}
