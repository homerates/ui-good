// app/api/profile/route.ts
// GET  — fetch the signed-in user's profile (LO or borrower)
// PATCH — update editable fields

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../lib/supabaseServer";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";
  const clerkName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ");

  // Run both queries in parallel
  const [loResult, userResult] = await Promise.all([
    sb.from("loan_officers").select("id, email, lender, nmls, license_state").eq("user_id", userId).maybeSingle(),
    sb.from("users").select("role, full_name").eq("id", userId).maybeSingle(),
  ]);

  const loRow = loResult.data;
  const userRow = userResult.data;

  // isLO = has a loan_officers record OR users.role is 'lo'
  const isLO = !!loRow || userRow?.role === "lo";
  const role = userRow?.role ?? (loRow ? "lo" : "borrower");

  return NextResponse.json({
    userId,
    email,
    clerkName,
    full_name: userRow?.full_name ?? clerkName,
    role,
    isLO,
    lo: loRow ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const body = await req.json();
  const { full_name, role, lender, nmls, license_state, company_nmls,
          borrower_phone, property_address, current_loan_balance } = body;

  // Get email from Clerk for LO row creation
  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";

  // Update users table (including optional borrower fields)
  const userUpdates: Record<string, string> = {};
  if (full_name !== undefined) userUpdates.full_name = full_name.trim();
  if (role !== undefined) userUpdates.role = role;
  if (borrower_phone !== undefined) userUpdates.phone = borrower_phone.trim();
  if (property_address !== undefined) userUpdates.property_address = property_address.trim();
  if (current_loan_balance !== undefined) userUpdates.current_loan_balance = current_loan_balance.trim();
  if (Object.keys(userUpdates).length > 0) {
    await sb.from("users").update(userUpdates).eq("id", userId);
  }

  // If role is 'lo', ensure a loan_officers row exists (upsert on user_id)
  if (role === "lo") {
    const { data: existing } = await sb
      .from("loan_officers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existing) {
      await sb.from("loan_officers").insert({
        user_id: userId,
        email,
        lender: lender?.trim() ?? null,
        nmls: nmls?.trim() ?? null,
        license_state: license_state?.trim() ?? null,
        company_nmls: company_nmls?.trim() ?? null,
        allowed_borrower_slots: 0,
      });
    } else {
      // Update existing row
      const updates: Record<string, string> = {};
      if (lender !== undefined) updates.lender = lender.trim();
      if (nmls !== undefined) updates.nmls = nmls.trim();
      if (license_state !== undefined) updates.license_state = license_state.trim();
      if (company_nmls !== undefined) updates.company_nmls = company_nmls.trim();
      if (Object.keys(updates).length > 0) {
        await sb.from("loan_officers").update(updates).eq("id", existing.id);
      }
    }
  } else {
    // Not LO — still update if a row exists (agent may have one from earlier)
    const { data: loRow } = await sb
      .from("loan_officers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (loRow) {
      const updates: Record<string, string> = {};
      if (lender !== undefined) updates.lender = lender.trim();
      if (nmls !== undefined) updates.nmls = nmls.trim();
      if (license_state !== undefined) updates.license_state = license_state.trim();
      if (company_nmls !== undefined) updates.company_nmls = company_nmls.trim();
      if (Object.keys(updates).length > 0) {
        await sb.from("loan_officers").update(updates).eq("id", loRow.id);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
