// app/api/debug/resend-logs/route.ts
// Admin-only: fetches recent email delivery logs from the Resend API
// GET /api/debug/resend-logs
// Shows delivery status, bounces, spam complaints for recent emails.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdminId } from "../../../../lib/adminAuth";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdminId(userId))) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ error: "RESEND_API_KEY not set" }, { status: 500 });

  // Resend REST API — list recent emails
  // https://resend.com/docs/api-reference/emails/list-emails
  const response = await fetch("https://api.resend.com/emails?limit=20", {
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json({
      error: "Resend API error",
      status: response.status,
      body: text,
    }, { status: 500 });
  }

  const data = await response.json();

  // Normalize for readability
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emails = (data?.data ?? []).map((e: any) => ({
    id: e.id,
    to: e.to,
    from: e.from,
    subject: e.subject,
    status: e.last_event,       // delivered | bounced | complained | opened | clicked
    created_at: e.created_at,
    last_click: e.last_click ?? null,
    last_open: e.last_open ?? null,
  }));

  return NextResponse.json({
    total: emails.length,
    emails,
    raw_sample: data?.data?.[0] ?? null,   // full first record for field inspection
    timestamp: new Date().toISOString(),
  });
}
