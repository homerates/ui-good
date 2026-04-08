// app/api/pro-directory/register/route.ts
// POST — self-register in the professional directory (no seed data required)
// Creates a new pro_directory row with source='self' and links to the user.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Guard: user already has a listing
  const { data: existing } = await sb
    .from("pro_directory")
    .select("id")
    .eq("claimed_by", userId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "You already have a listing.", id: existing.id }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { pro_type, name, company_name, city, nmls, dre_license, phone, website, bio } = body;

  if (!pro_type || !name?.trim()) {
    return NextResponse.json({ error: "pro_type and name are required." }, { status: 400 });
  }

  const validTypes = ["lo", "lo_company", "agent", "agent_broker"];
  if (!validTypes.includes(pro_type)) {
    return NextResponse.json({ error: "Invalid pro_type." }, { status: 400 });
  }

  const isLoType = pro_type === "lo" || pro_type === "lo_company";

  // Determine source_id — use NMLS/DRE if provided, else fall back to userId
  const source    = "self";
  const source_id = userId; // unique per user, always available

  // Insert the directory record
  const { data: created, error: insertErr } = await sb
    .from("pro_directory")
    .insert({
      source,
      source_id,
      pro_type,
      name:          name.trim(),
      company_name:  company_name?.trim() || null,
      city:          city?.trim() || null,
      state:         "CA",
      license_type:  isLoType ? "Mortgage Loan Originator" : "Real Estate Salesperson",
      license_status: "Active",
      claimed_by:    userId,
      claimed_at:    new Date().toISOString(),
      bio:           bio?.trim() || null,
      phone:         phone?.trim() || null,
      website:       website?.trim() || null,
    })
    .select("id")
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Get Clerk user info for profile seeding
  const clerk    = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const email    = clerkUser.emailAddresses[0]?.emailAddress ?? "";
  const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || name.trim();

  // Upsert role-specific table
  if (isLoType) {
    const { data: existingLo } = await sb
      .from("loan_officers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingLo) {
      await sb.from("loan_officers").insert({
        user_id: userId,
        email,
        nmls:          nmls?.trim() || null,
        license_state: "CA",
        lender:        company_name?.trim() || null,
      });
    }
  } else {
    const { data: existingAgent } = await sb
      .from("agents")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingAgent) {
      await sb.from("agents").insert({
        user_id: userId,
        license:   dre_license?.trim() || null,
        brokerage: company_name?.trim() || null,
      });
    }
  }

  // Set user role
  await sb
    .from("users")
    .upsert(
      { id: userId, role: isLoType ? "lo" : "agent", full_name: fullName },
      { onConflict: "id" }
    );

  return NextResponse.json({ ok: true, id: created.id });
}
