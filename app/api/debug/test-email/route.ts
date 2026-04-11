// app/api/debug/test-email/route.ts
// Admin-only: sends a test email via Resend SDK and returns the full API response
// POST /api/debug/test-email  { "to": "email@example.com" }

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

  if (!key) return NextResponse.json({ error: "RESEND_API_KEY not set" }, { status: 500 });

  const resend = new Resend(key);

  const result = await resend.emails.send({
    from: `HomeRates.ai <${from}>`,
    to,
    subject: "HomeRates.ai — Email delivery test",
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:40px auto;padding:32px;background:#f9f9f9;border-radius:12px;">
      <h2 style="color:#00c896;margin:0 0 12px;">✅ Email delivery confirmed</h2>
      <p style="color:#333;">This is a diagnostic test email from HomeRates.ai.</p>
      <p style="color:#333;">If you received this, Resend is correctly delivering email from <strong>${from}</strong> to <strong>${to}</strong>.</p>
      <p style="font-size:12px;color:#888;margin-top:24px;">Sent: ${new Date().toISOString()}</p>
    </div>`,
  });

  return NextResponse.json({
    resend_result: result,
    sent_from: from,
    sent_to: to,
    api_key_prefix: key.slice(0, 10) + "...",
    timestamp: new Date().toISOString(),
  });
}
