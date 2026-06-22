// app/api/admin/agent-pilots/route.ts
// GET  — list all agent pilots
// POST — create a new agent pilot record
// PATCH — toggle is_active
// DELETE — remove a pilot record

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";

const PILOT_TYPE = "agent";

async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("users").select("role").eq("id", userId).maybeSingle();
  return data?.role === "admin" ? userId : null;
}

function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function GET() {
  const uid = await requireAdmin();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase()!;
  const { data, error } = await sb
    .from("company_pilots")
    .select("id, company_name, slug, contact_name, contact_email, credits_per_lo, is_active, notes, created_at, invite_sent_at")
    .eq("pilot_type", PILOT_TYPE)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Activation counts
  const ids = (data ?? []).map((p: any) => p.id);
  let counts: Record<string, number> = {};
  if (ids.length) {
    const { data: activations } = await sb
      .from("loan_officers")
      .select("company_pilot_id")
      .in("company_pilot_id", ids);
    for (const a of activations ?? []) {
      counts[a.company_pilot_id] = (counts[a.company_pilot_id] ?? 0) + 1;
    }
  }

  return NextResponse.json((data ?? []).map((p: any) => ({ ...p, activations: counts[p.id] ?? 0 })));
}

export async function POST(req: NextRequest) {
  const uid = await requireAdmin();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { company_name, slug: rawSlug, contact_name, contact_email, credits_per_lo, notes } = body;
  if (!company_name?.trim()) return NextResponse.json({ error: "company_name required" }, { status: 400 });

  const slug = rawSlug?.trim() ? rawSlug.trim().toLowerCase() : toSlug(company_name);
  const sb = getSupabase()!;

  const { data, error } = await sb
    .from("company_pilots")
    .insert({
      company_name: company_name.trim(),
      slug,
      pilot_type: PILOT_TYPE,
      contact_name: contact_name?.trim() || null,
      contact_email: contact_email?.trim() || null,
      credits_per_lo: credits_per_lo ?? 1000,
      notes: notes?.trim() || null,
    })
    .select("id, company_name, slug")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, pilot: data });
}

export async function PATCH(req: NextRequest) {
  const uid = await requireAdmin();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, is_active } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const sb = getSupabase()!;
  const { error } = await sb
    .from("company_pilots")
    .update({ is_active })
    .eq("id", id)
    .eq("pilot_type", PILOT_TYPE);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const uid = await requireAdmin();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const sb = getSupabase()!;
  const { error } = await sb
    .from("company_pilots")
    .delete()
    .eq("id", id)
    .eq("pilot_type", PILOT_TYPE);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
