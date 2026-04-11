// app/api/debug/test-alert/route.ts
// Admin-only: fires a real scenario alert email (same code path as production)
// POST /api/debug/test-alert  { "to": "email@example.com" }
// Returns the Resend delivery ID so you can look it up in the Resend dashboard.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdminId } from "../../../../lib/adminAuth";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdminId(userId))) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const to: string = body.to ?? "rayaanarif57@gmail.com";

  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "digest@homerates.ai";
  const base = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";

  if (!key) return NextResponse.json({ error: "RESEND_API_KEY not set" }, { status: 500 });

  const resend = new Resend(key);
  const boardUrl = `${base}/lo/scenarios`;

  // Exact same HTML template as production scenario alerts
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>New Scenario Alert — HomeRates.ai</title>
</head>
<body style="margin:0;padding:0;background:#07100f;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">

<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#07100f" style="background:#07100f;padding:32px 16px">
<tr><td align="center">
<table width="100%" style="max-width:520px" cellpadding="0" cellspacing="0">

  <!-- Logo -->
  <tr>
    <td style="padding:0 0 28px">
      <img src="${base}/assets/HomeRates-Logo%20Green.png"
           alt="HomeRates.ai" height="28" style="display:block"/>
    </td>
  </tr>

  <!-- Tag + greeting -->
  <tr>
    <td style="padding:0 0 24px">
      <span style="display:inline-block;background:#0d2218;color:#00e87a;font-size:11px;font-weight:700;padding:4px 10px;border-radius:4px;letter-spacing:.08em">TEST ALERT</span>
      <div style="font-size:22px;font-weight:700;color:#e8f5ee;margin-top:14px">Hi there,</div>
      <div style="font-size:14px;color:#7a9e8a;margin-top:6px;line-height:1.5">This is a diagnostic test of the scenario alert email template.</div>
    </td>
  </tr>

  <!-- Scenario details card -->
  <tr>
    <td style="padding:0 0 24px">
      <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d1a12" style="background:#0d1a12;border:1px solid #1a2e20;border-radius:12px">
        <tr><td style="padding:4px 20px 0">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #1a2e20">
                <span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#4a6e58;margin-bottom:3px">Loan type</span>
                <span style="font-size:15px;font-weight:600;color:#e8f5ee">Conventional</span>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #1a2e20">
                <span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#4a6e58;margin-bottom:3px">Price range</span>
                <span style="font-size:15px;font-weight:600;color:#e8f5ee">$700K–$800K</span>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #1a2e20">
                <span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#4a6e58;margin-bottom:3px">Credit</span>
                <span style="font-size:15px;font-weight:600;color:#e8f5ee">740+</span>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #1a2e20">
                <span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#4a6e58;margin-bottom:3px">State</span>
                <span style="font-size:15px;font-weight:600;color:#e8f5ee">CA</span>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 0">
                <span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#4a6e58;margin-bottom:3px">Timeline</span>
                <span style="font-size:15px;font-weight:600;color:#e8f5ee">30–60 days</span>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td>
  </tr>

  <!-- CTA button -->
  <tr>
    <td style="padding:0 0 28px">
      <a href="${boardUrl}"
         style="display:block;text-align:center;background:#00e87a;color:#07100f;font-size:15px;font-weight:700;padding:15px 20px;border-radius:10px;text-decoration:none">
        View &amp; Respond on Board →
      </a>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="border-top:1px solid #1a2e20;padding:20px 0 0">
      <div style="font-size:12px;color:#3a5a48;line-height:1.7">
        Sent by <strong style="color:#4a6e58">HomeRates.ai</strong> — Borrower identities are kept
        anonymous until contact is shared in a conversation thread.
        <br><em style="color:#2a3a30">DIAGNOSTIC EMAIL — ${new Date().toISOString()}</em>
      </div>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const result = await resend.emails.send({
    from: `HomeRates.ai <${from}>`,
    to,
    subject: `[TEST] New Conventional scenario in CA — HomeRates.ai`,
    html,
  });

  console.log("[debug/test-alert] result:", JSON.stringify(result));

  return NextResponse.json({
    resend_result: result,
    sent_from: from,
    sent_to: to,
    delivered_id: result.data?.id ?? null,
    has_error: !!result.error,
    error_detail: result.error ?? null,
    timestamp: new Date().toISOString(),
    note: "If delivered_id is set and has_error is false, Resend accepted the email. Check Resend dashboard logs for delivery status.",
  });
}
