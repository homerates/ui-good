// app/api/admin/pilots/route.ts
// GET  — list all company pilots with activation counts
// POST — create a new company pilot link

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../../../lib/supabaseServer";
import { requireAdmin } from "../../../../lib/adminAuth";

export async function GET() {
  const { error: adminError } = await requireAdmin();
  if (adminError) return adminError;

  const sb = getSupabase()!;

  const { data: pilots, error } = await sb
    .from("company_pilots")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Activation counts per pilot
  const { data: counts } = await sb
    .from("loan_officers")
    .select("company_pilot_id")
    .not("company_pilot_id", "is", null);

  const countMap: Record<string, number> = {};
  for (const row of counts ?? []) {
    if (row.company_pilot_id) {
      countMap[row.company_pilot_id] = (countMap[row.company_pilot_id] ?? 0) + 1;
    }
  }

  const result = (pilots ?? []).map(p => ({
    ...p,
    activations: countMap[p.id] ?? 0,
  }));

  return NextResponse.json({ ok: true, pilots: result });
}

export async function POST(req: NextRequest) {
  const { error: adminError } = await requireAdmin();
  if (adminError) return adminError;

  const body = await req.json();
  const { company_name, slug, contact_name, contact_email, credits_per_lo, notes } = body;

  if (!company_name?.trim() || !slug?.trim()) {
    return NextResponse.json({ error: "company_name and slug are required" }, { status: 400 });
  }

  const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const sb = getSupabase()!;

  const { data, error } = await sb
    .from("company_pilots")
    .insert({
      company_name: company_name.trim(),
      slug: cleanSlug,
      contact_name: contact_name?.trim() || null,
      contact_email: contact_email?.trim() || null,
      credits_per_lo: credits_per_lo ?? 1000,
      notes: notes?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A pilot with that slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pilot: data });
}

export async function PATCH(req: NextRequest) {
  const { error: adminError } = await requireAdmin();
  if (adminError) return adminError;

  const body = await req.json();
  const { id, is_active } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const sb = getSupabase()!;
  const { error } = await sb
    .from("company_pilots")
    .update({ is_active })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
