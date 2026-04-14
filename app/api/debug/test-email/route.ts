// app/api/debug/test-email/route.ts
// Admin-only: sends a test email via Resend SDK and returns the full API response
// POST /api/debug/test-email  { "to": "email@example.com" }

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdminId } from "../../../../lib/adminAuth";
import { Resend } from "resend";
import { emailShell } from "../../../../lib/sendEmail";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdminId(userId))) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const to: string = body.to ?? "rayaanarif57@gmail.com";

  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "digest@homerates.ai";

  if (!key) return NextResponse.json({ error: "RESEND_API_KEY not set" }, { status: 500 });

  const resend = new Resend(key);

  const result = await resend.emails.send({
    from: `HomeRates.ai <${from}>`,
    to,
    subject: "HomeRates.ai — Email delivery test",
    html: emailShell(`
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">Delivery Test</p>
      <p style="margin:0 0 16px;font-size:22px;font-weight:800;color:#080c12;line-height:1.2;">Email delivery confirmed</p>
      <p style="margin:0 0 12px;font-size:15px;color:#6b7a8d;">Resend is correctly delivering email from <strong style="color:#1a2530;">${from}</strong> to <strong style="color:#1a2530;">${to}</strong>.</p>
      <p style="margin:0;font-size:12px;color:#9ca3af;">Sent: ${new Date().toISOString()}</p>
    `, "HomeRates.ai · Diagnostic only"),
  });

  return NextResponse.json({
    resend_result: result,
    sent_from: from,
    sent_to: to,
    api_key_prefix: key.slice(0, 10) + "...",
    timestamp: new Date().toISOString(),
  });
}
