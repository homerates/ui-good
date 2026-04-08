// app/api/pro-directory/route.ts
// GET  — search/browse the professional directory
// Public read, no auth required

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../../lib/supabaseServer";

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const type     = searchParams.get("type");          // 'lo' | 'lo_company' | 'agent' | 'agent_broker'
  const city     = searchParams.get("city");
  const zip      = searchParams.get("zip");
  const q        = searchParams.get("q");             // name / company search
  const source   = searchParams.get("source");        // 'nmls' | 'ca_dre'
  const claimed  = searchParams.get("claimed");       // 'true' | 'false' | null (all)
  const page     = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const perPage  = Math.min(50, Math.max(1, parseInt(searchParams.get("per_page") ?? "25", 10)));

  let query = sb
    .from("pro_directory")
    .select("id, source, source_id, pro_type, name, company_name, city, state, zip, license_type, license_status, claimed_by, claimed_at, bio, phone, website, photo_url", { count: "exact" })
    .eq("state", "CA")
    .order("name", { ascending: true })
    .range(page * perPage, (page + 1) * perPage - 1);

  if (type)   query = query.eq("pro_type", type);
  if (source) query = query.eq("source", source);
  if (city)   query = query.ilike("city", `%${city}%`);
  if (zip)    query = query.eq("zip", zip.trim().slice(0, 5));

  if (claimed === "true")  query = query.not("claimed_by", "is", null);
  if (claimed === "false") query = query.is("claimed_by", null);

  if (q) {
    // Use full-text search on name + company
    query = query.textSearch("name", q, { config: "english", type: "websearch" });
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    professionals: data ?? [],
    total: count ?? 0,
    page,
    per_page: perPage,
    pages: Math.ceil((count ?? 0) / perPage),
  });
}
