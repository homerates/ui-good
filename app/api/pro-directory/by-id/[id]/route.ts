// app/api/pro-directory/by-id/[id]/route.ts
// GET a single pro_directory record by UUID

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../../../../lib/supabaseServer";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { data, error } = await sb
    .from("pro_directory")
    .select("id, source, source_id, pro_type, name, company_name, city, state, zip, license_type, license_status, claimed_by, claimed_at, bio, phone, website, photo_url")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ pro: data });
}
