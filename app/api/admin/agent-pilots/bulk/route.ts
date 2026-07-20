// app/api/admin/agent-pilots/bulk/route.ts
// POST — bulk-create agent pilot records from a contact list.
// Body: { contacts: [{company_name, contact_name, contact_email, credits_per_lo?, notes?}], sendInvites?: boolean }

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../../../../lib/supabaseServer";
import { emailAgentPilotInvite } from "../../../../../lib/sendEmail";
import { requireAdmin } from "../../../../../lib/adminAuth";

const BASE = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";

function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function POST(req: NextRequest) {
  const { error: adminError } = await requireAdmin();
  if (adminError) return adminError;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const body = await req.json();
  const contacts: { company_name: string; contact_name?: string; contact_email?: string; credits_per_lo?: number; notes?: string }[] = body.contacts ?? [];
  const sendInvites: boolean = body.sendInvites ?? false;

  if (!contacts.length) return NextResponse.json({ error: "No contacts provided" }, { status: 400 });

  const created: string[] = [];
  const skipped: string[] = [];
  const failed: { company: string; error: string }[] = [];

  for (const c of contacts) {
    if (!c.company_name?.trim()) continue;

    const slug = toSlug(c.company_name);
    const { data, error } = await sb
      .from("company_pilots")
      .insert({
        company_name:   c.company_name.trim(),
        slug,
        pilot_type:     "agent",
        contact_name:   c.contact_name?.trim()  || null,
        contact_email:  c.contact_email?.trim()  || null,
        credits_per_lo: c.credits_per_lo         ?? 1000,
        notes:          c.notes?.trim()          || null,
      })
      .select("id, slug, contact_email, company_name")
      .single();

    if (error) {
      if (error.code === "23505") skipped.push(c.company_name);
      else failed.push({ company: c.company_name, error: error.message });
      continue;
    }

    created.push(c.company_name);

    if (sendInvites && data.contact_email) {
      try {
        await emailAgentPilotInvite({
          toEmail:         data.contact_email,
          contactName:     c.contact_name  ?? null,
          companyName:     data.company_name,
          pilotUrl:        `${BASE}/agent-pilot/${data.slug}`,
          creditsPerAgent: c.credits_per_lo ?? 1000,
        });
        await sb.from("company_pilots").update({ invite_sent_at: new Date().toISOString() }).eq("id", data.id);
      } catch { /* invite failure is non-fatal */ }
    }
  }

  return NextResponse.json({ ok: true, created, skipped, failed });
}
