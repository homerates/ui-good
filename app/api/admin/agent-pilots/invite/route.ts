// app/api/admin/agent-pilots/invite/route.ts
// POST — send a branded agent pilot invite email to the contact on a pilot record.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../../../../lib/supabaseServer";
import { emailAgentPilotInvite } from "../../../../../lib/sendEmail";
import { requireAdmin } from "../../../../../lib/adminAuth";

const BASE = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";

export async function POST(req: NextRequest) {
  const { error: adminError } = await requireAdmin();
  if (adminError) return adminError;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { pilotId } = await req.json();
  if (!pilotId) return NextResponse.json({ error: "pilotId required" }, { status: 400 });

  const { data: pilot } = await sb
    .from("company_pilots")
    .select("id, company_name, slug, contact_name, contact_email, credits_per_lo, is_active, pilot_type")
    .eq("id", pilotId)
    .eq("pilot_type", "agent")
    .maybeSingle();

  if (!pilot) return NextResponse.json({ error: "Agent pilot not found" }, { status: 404 });
  if (!pilot.contact_email) return NextResponse.json({ error: "No contact email on this pilot" }, { status: 400 });
  if (!pilot.is_active) return NextResponse.json({ error: "Pilot is inactive" }, { status: 400 });

  await emailAgentPilotInvite({
    toEmail:        pilot.contact_email,
    contactName:    pilot.contact_name,
    companyName:    pilot.company_name,
    pilotUrl:       `${BASE}/agent-pilot/${pilot.slug}`,
    creditsPerAgent: pilot.credits_per_lo,
  });

  await sb
    .from("company_pilots")
    .update({ invite_sent_at: new Date().toISOString() })
    .eq("id", pilotId);

  return NextResponse.json({ ok: true });
}
