// app/api/newsletter/subscribe/route.ts
// POST { email, source } — subscribe to the HomeRates.ai market update newsletter.
// Checks suppression list, upserts into newsletter_subscribers.
// No auth required — public-facing from article pages.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { isEmailSuppressed } from "../../../../lib/unsubscribe";
import { getSupabase } from "../../../../lib/supabaseServer";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email: string = (body.email ?? "").trim().toLowerCase();
  const source: string = (body.source ?? "article").trim();

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  // Don't subscribe suppressed emails
  if (await isEmailSuppressed(email)) {
    // Return success anyway — don't leak suppression status
    return NextResponse.json({ ok: true, already: false });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const { error } = await sb
    .from("newsletter_subscribers")
    .upsert({ email, source }, { onConflict: "email", ignoreDuplicates: true });

  if (error) {
    console.error("[newsletter/subscribe]", error);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
