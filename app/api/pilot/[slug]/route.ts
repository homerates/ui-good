// app/api/pilot/[slug]/route.ts
// Public — fetch pilot company data for the /pilot/[slug] landing page.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../../../lib/supabaseServer";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { slug } = params;
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { data: pilot } = await sb
    .from("company_pilots")
    .select("id, company_name, slug, credits_per_lo, is_active")
    .eq("slug", slug.toLowerCase())
    .eq("is_active", true)
    .maybeSingle();

  if (!pilot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Activation count
  const { count } = await sb
    .from("loan_officers")
    .select("user_id", { count: "exact", head: true })
    .eq("company_pilot_id", pilot.id);

  return NextResponse.json({ ...pilot, activations: count ?? 0 });
}
