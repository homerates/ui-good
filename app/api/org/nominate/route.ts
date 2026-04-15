// app/api/org/nominate/route.ts
// POST — logged-in pro nominates their employer for a corporate account

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";

const VALID_ORG_TYPES = ["brokerage", "lender", "credit_union", "re_brokerage"];

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const { org_name, org_type = "brokerage", contact_email, website, notes } = body;

  if (!org_name?.trim()) return NextResponse.json({ error: "Organization name required" }, { status: 400 });
  const orgType = VALID_ORG_TYPES.includes(org_type) ? org_type : "brokerage";

  const { error } = await sb.from("org_nominations").insert({
    nominated_by: userId,
    org_name: org_name.trim(),
    org_type: orgType,
    contact_email: contact_email?.trim().toLowerCase() || null,
    website: website?.trim() || null,
    notes: notes?.trim() || null,
  });

  if (error) {
    console.error("[org/nominate]", error);
    return NextResponse.json({ error: "Failed to submit nomination" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
