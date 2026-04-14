// app/api/pro-directory/invite/route.ts
// POST — invite an unclaimed pro to join and claim their listing
// Any signed-in user can send; deduped to 1 invite per pro+email per 7 days

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";
import { Resend } from "resend";
import { emailShell } from "../../../../lib/sendEmail";

const SOURCE_LABEL: Record<string, string> = {
  nmls:   "NMLS",
  ca_dre: "CA DRE",
  self:   "Self-registered",
};

const PRO_TYPE_LABEL: Record<string, string> = {
  lo:           "Loan Officer",
  lo_company:   "Mortgage Company",
  agent:        "Real Estate Agent",
  agent_broker: "Real Estate Broker",
};

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { pro_dir_id, email } = body ?? {};
  if (!pro_dir_id || !email) {
    return NextResponse.json({ error: "pro_dir_id and email are required" }, { status: 400 });
  }

  const emailTrimmed = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Fetch the pro listing
  const { data: pro } = await sb
    .from("pro_directory")
    .select("id, name, pro_type, source, source_id, city, state, claimed_by, license_type")
    .eq("id", pro_dir_id)
    .maybeSingle();

  if (!pro) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

  // Dedupe: don't spam — block if an invite was already sent to same email in last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await sb
    .from("pro_invitations")
    .select("id, created_at")
    .eq("pro_dir_id", pro_dir_id)
    .eq("email", emailTrimmed)
    .gte("created_at", sevenDaysAgo)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      ok: false,
      already_sent: true,
      message: "An invite was already sent to this email in the last 7 days.",
    });
  }

  // Create invite record (use service role so RLS insert check passes for all users)
  const { data: invite, error: insertErr } = await sb
    .from("pro_invitations")
    .insert({
      pro_dir_id,
      email: emailTrimmed,
      invited_by: userId,
    })
    .select("id, token")
    .single();

  if (insertErr || !invite) {
    console.error("[pro-invite] insert error:", insertErr);
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }

  // Stamp invited_at on the listing
  await sb
    .from("pro_directory")
    .update({ invited_at: new Date().toISOString() })
    .eq("id", pro_dir_id);

  // Get sender's name for the email footer
  let senderName = "HomeRates.ai";
  try {
    const clerk = await clerkClient();
    const sender = await clerk.users.getUser(userId);
    senderName = [sender.firstName, sender.lastName].filter(Boolean).join(" ")
      || sender.emailAddresses[0]?.emailAddress
      || "HomeRates.ai";
  } catch {
    // non-fatal
  }

  // Build claim URL
  const baseUrl = (process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai").replace(/\/+$/, "");
  const claimUrl = `${baseUrl}/professionals/claim/${pro.id}`;

  const proTypeLabel  = PRO_TYPE_LABEL[pro.pro_type] ?? pro.pro_type;
  const sourceLabel   = SOURCE_LABEL[pro.source] ?? pro.source;
  const location      = [pro.city, pro.state].filter(Boolean).join(", ");
  const licenseLabel  = pro.source === "nmls" ? "NMLS" : pro.source === "ca_dre" ? "DRE" : "ID";
  const licenseNum    = pro.source_id?.replace(/^co_/, "") ?? "";

  // Send email via Resend
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    await resend.emails.send({
      from: "HomeRates.ai <digest@homerates.ai>",
      to: emailTrimmed,
      subject: `Your profile is listed on HomeRates.ai — claim it free`,
      html: emailShell(`
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">Professional Directory</p>
        <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#080c12;line-height:1.2;">Hi ${pro.name},</p>
        <p style="margin:0 0 20px;font-size:15px;color:#6b7a8d;line-height:1.6;">Your ${proTypeLabel.toLowerCase()} profile from ${sourceLabel} is listed on HomeRates.ai — a platform where borrowers find and connect with licensed mortgage and real estate professionals.</p>
        <div style="background:#f4f6f9;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:0 0 24px;">
          <div style="font-size:16px;font-weight:700;color:#080c12;margin-bottom:4px;">${pro.name}</div>
          <div style="font-size:13px;color:#6b7a8d;margin-bottom:8px;">${proTypeLabel}${location ? ` · ${location}` : ""}</div>
          ${licenseNum ? `<div style="font-family:monospace;font-size:12px;color:#9ca3af;">${licenseLabel} # ${licenseNum}</div>` : ""}
        </div>
        <p style="margin:0 0 24px;font-size:15px;color:#6b7a8d;line-height:1.6;">Claim your free profile to add your bio, photo, phone number, and website. It takes 2 minutes, and your information stays in your control.</p>
        <a href="${claimUrl}" style="display:inline-block;background:#00e87a;color:#07100f;font-weight:700;font-size:15px;padding:14px 28px;border-radius:999px;text-decoration:none;">Claim your profile →</a>
      `, `This invitation was sent by ${senderName} via HomeRates.ai. If you believe this was sent in error, you can ignore it — no account will be created without your action.`),
    });
  } catch (emailErr) {
    console.error("[pro-invite] email send error:", emailErr);
    // Don't fail the request — the invite record was created
    return NextResponse.json({ ok: true, email_sent: false, invite_id: invite.id });
  }

  return NextResponse.json({ ok: true, email_sent: true, invite_id: invite.id });
}
