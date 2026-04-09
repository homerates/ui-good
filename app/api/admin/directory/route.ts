// app/api/admin/directory/route.ts
// GET  — paginated directory search with admin-level fields
// PATCH — update a listing (license_status, notes)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/adminAuth";
import { getSupabase } from "../../../../lib/supabaseServer";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const sp      = new URL(req.url).searchParams;
  const q       = sp.get("q") ?? "";
  const status  = sp.get("status") ?? "";   // 'claimed' | 'unclaimed' | 'flagged' | ''
  const source  = sp.get("source") ?? "";   // 'ca_dre' | 'nmls' | 'self' | ''
  const type    = sp.get("type") ?? "";
  const page    = Math.max(0, parseInt(sp.get("page") ?? "0", 10));
  const perPage = 25;

  let query = sb
    .from("pro_directory")
    .select(
      "id, source, source_id, pro_type, name, company_name, city, state, zip, license_type, license_status, claimed_by, claimed_at, phone, website, bio, photo_url, invited_at",
      { count: "exact" }
    )
    .order("name", { ascending: true })
    .range(page * perPage, (page + 1) * perPage - 1);

  if (type)   query = query.eq("pro_type", type);
  if (source) query = query.eq("source", source);

  if (status === "claimed")   query = query.not("claimed_by", "is", null);
  if (status === "unclaimed") query = query.is("claimed_by", null);
  if (status === "flagged")   query = query.eq("license_status", "Flagged");

  if (q) query = query.textSearch("name", q, { config: "english", type: "websearch" });

  const { data, error: dbError, count } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({
    listings: data ?? [],
    total: count ?? 0,
    page,
    pages: Math.ceil((count ?? 0) / perPage),
  });
}

export async function PATCH(req: NextRequest) {
  const { userId, error } = await requireAdmin();
  if (error) return error;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const allowed = ["license_status", "bio", "phone", "website", "city", "zip", "company_name"];
  const updates: Record<string, string> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { error: updateErr } = await sb
    .from("pro_directory")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", body.id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Log the action
  const { data: pro } = await sb
    .from("pro_directory")
    .select("name")
    .eq("id", body.id)
    .maybeSingle();

  await sb.from("admin_activity_log").insert({
    actor_id:    userId,
    action:      body.action ?? "edit",
    target_id:   body.id,
    target_name: pro?.name ?? body.id,
    notes:       body.notes ?? JSON.stringify(updates),
  });

  return NextResponse.json({ ok: true });
}
