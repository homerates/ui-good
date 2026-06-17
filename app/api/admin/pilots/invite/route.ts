// app/api/admin/pilots/invite/route.ts
// POST — send a branded pilot invite email to the contact on a pilot record.
// Requires admin role. Updates invite_sent_at on success.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../../lib/supabaseServer";
import { emailPilotInvite } from "../../../../../lib/sendEmail";

const BASE = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Admin check
  const { data: user } = await sb.from("users").select("is_admin").eq("id", userId).maybeSingle();
  if (!user?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { pilotId } = await req.json();
  if (!pilotId) return NextResponse.json({ error: "pilotId required" }, { status: 400 });

  const { data: pilot } = await sb
    .from("company_pilots")
    .select("id, company_name, slug, contact_name, contact_email, credits_per_lo, is_active")
    .eq("id", pilotId)
    .maybeSingle();

  if (!pilot) return NextResponse.json({ error: "Pilot not found" }, { status: 404 });
  if (!pilot.contact_email) return NextResponse.json({ error: "No contact email on this pilot" }, { status: 400 });
  if (!pilot.is_active) return NextResponse.json({ error: "Pilot is inactive" }, { status: 400 });

  const pilotUrl = `${BASE}/pilot/${pilot.slug}`;

  await emailPilotInvite({
    toEmail: pilot.contact_email,
    contactName: pilot.contact_name,
    companyName: pilot.company_name,
    pilotUrl,
    creditsPerLo: pilot.credits_per_lo,
  });

  // Record send time
  await sb
    .from("company_pilots")
    .update({ invite_sent_at: new Date().toISOString() })
    .eq("id", pilotId);

  return NextResponse.json({ ok: true });
}
