// POST /api/admin/marketplace-lenders/invite
// Generates a unique token for the lender, stores it, sends invite email via Resend.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { Resend } from "resend";
import { requireAdmin } from "../../../../../lib/adminAuth";
import { getSupabase } from "../../../../../lib/supabaseServer";
import { emailShell } from "../../../../../lib/sendEmail";

const BASE = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";

export async function POST(req: NextRequest) {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const { lender_id } = await req.json();
  if (!lender_id) return NextResponse.json({ error: "lender_id required" }, { status: 400 });

  const sb = getSupabase()!;

  // Fetch lender
  const { data: lender, error: fetchErr } = await sb
    .from("marketplace_lenders")
    .select("id, lender_name, contact_email, contact_name, invite_token")
    .eq("id", lender_id)
    .single();

  if (fetchErr || !lender) return NextResponse.json({ error: "Lender not found" }, { status: 404 });

  // Generate token if not already set
  const token = (lender.invite_token as string | null) ?? randomBytes(20).toString("hex");
  const portalUrl = `${BASE}/lender-portal/${token}`;

  // Save token + invited_at
  const { error: updateErr } = await sb
    .from("marketplace_lenders")
    .update({ invite_token: token, invited_at: new Date().toISOString() })
    .eq("id", lender_id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Send email
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const resend = new Resend(resendKey);
    const firstName = (lender.contact_name as string | null)?.split(" ")[0] ?? "there";
    const lenderName = lender.lender_name as string;

    const bodyHtml = `
<h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#f0f4ff;">
  You're listed on HomeRates.ai
</h2>
<p style="margin:0 0 20px;font-size:15px;color:rgba(185,208,192,0.7);line-height:1.6;">
  Hi ${firstName}, ${lenderName} has been added to the HomeRates marketplace — a platform that matches mortgage borrowers
  with lenders offering real, declared Down Payment Assistance programs.
</p>

<div style="background:rgba(0,232,122,0.06);border:1px solid rgba(0,232,122,0.15);border-radius:12px;padding:20px 22px;margin-bottom:24px;">
  <div style="font-size:11px;font-weight:700;color:rgba(0,232,122,0.6);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">
    Your lender portal
  </div>
  <p style="margin:0 0 14px;font-size:14px;color:rgba(185,208,192,0.7);line-height:1.6;">
    View your listing, manage your DPA programs, and track how many borrowers are being matched to your institution.
  </p>
  <a href="${portalUrl}"
     style="display:inline-block;background:rgba(0,232,122,0.12);border:1px solid rgba(0,232,122,0.3);color:#00e87a;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;text-decoration:none;">
    Open my portal →
  </a>
</div>

<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:16px 18px;margin-bottom:24px;">
  <div style="font-size:11px;font-weight:700;color:rgba(185,208,192,0.35);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">
    How it works
  </div>
  <table cellpadding="0" cellspacing="0" style="width:100%;">
    ${[
      ["AMI Qualifier", "Borrowers run an income eligibility check against FHFA AMI thresholds."],
      ["Program match", "When income qualifies and your program covers the borrower's county or state, they see a match count — no lender names shown."],
      ["Opt-in", "Borrowers who want to connect initiate contact. You receive the introduction."],
    ].map(([title, desc]) => `
    <tr>
      <td style="padding:6px 0;vertical-align:top;">
        <div style="font-size:13px;font-weight:700;color:#f0f4ff;">${title}</div>
        <div style="font-size:12px;color:rgba(185,208,192,0.5);margin-top:2px;">${desc}</div>
      </td>
    </tr>`).join("")}
  </table>
</div>

<p style="margin:0;font-size:12px;color:rgba(185,208,192,0.35);line-height:1.6;">
  Keep this link private — it gives access to your lender portal. Reply to this email if you have questions.
</p>`;

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "noreply@mail.homerates.ai",
      to: lender.contact_email as string,
      subject: `${lenderName} is now listed on HomeRates.ai`,
      html: emailShell(bodyHtml, "HomeRates.ai · Lender Partner Program"),
    });
  }

  return NextResponse.json({ ok: true, portalUrl, token });
}
