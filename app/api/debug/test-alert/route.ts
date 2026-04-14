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
import { emailShell } from "../../../../lib/sendEmail";

async function runTestAlert(to: string) {

  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "digest@homerates.ai";
  const base = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";

  if (!key) return NextResponse.json({ error: "RESEND_API_KEY not set" }, { status: 500 });

  const resend = new Resend(key);
  const boardUrl = `${base}/lo/scenarios`;

  // Uses the same emailShell as production scenario alerts
  const html = emailShell(`
    <span style="display:inline-block;background:#dcfce7;color:#166534;font-size:11px;font-weight:700;padding:4px 10px;border-radius:4px;letter-spacing:.08em">TEST ALERT</span>
    <div style="font-size:22px;font-weight:700;color:#080c12;margin-top:14px">Hi there,</div>
    <div style="font-size:14px;color:#6b7a8d;margin-top:6px;margin-bottom:24px;line-height:1.5">This is a diagnostic test of the scenario alert email template.</div>

    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f6f9" style="background:#f4f6f9;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px">
      <tr><td style="padding:4px 20px 0">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:10px 0;border-bottom:1px solid #e8ecf0"><span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px">Loan type</span><span style="font-size:15px;font-weight:600;color:#1a2530">Conventional</span></td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #e8ecf0"><span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px">Price range</span><span style="font-size:15px;font-weight:600;color:#1a2530">$700K–$800K</span></td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #e8ecf0"><span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px">Credit</span><span style="font-size:15px;font-weight:600;color:#1a2530">740+</span></td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #e8ecf0"><span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px">State</span><span style="font-size:15px;font-weight:600;color:#1a2530">CA</span></td></tr>
          <tr><td style="padding:10px 0"><span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px">Timeline</span><span style="font-size:15px;font-weight:600;color:#1a2530">30–60 days</span></td></tr>
        </table>
      </td></tr>
    </table>

    <a href="${boardUrl}" style="display:block;text-align:center;background:#00e87a;color:#07100f;font-size:15px;font-weight:700;padding:15px 20px;border-radius:999px;text-decoration:none">
      View &amp; Respond on Board →
    </a>
    <p style="margin:16px 0 0;text-align:center;font-size:11px;color:#9ca3af;">DIAGNOSTIC — ${new Date().toISOString()}</p>
  `, "HomeRates.ai · Borrower identities are kept anonymous until contact is shared.");

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

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdminId(userId))) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const to = req.nextUrl.searchParams.get("to") ?? "rayaanarif57@gmail.com";
  return runTestAlert(to);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdminId(userId))) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const to: string = body.to ?? "rayaanarif57@gmail.com";
  return runTestAlert(to);
}
