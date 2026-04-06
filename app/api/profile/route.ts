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

  // Check if LO
  const { data: loRow } = await sb
    .from("loan_officers")
    .select("id, email, lender, nmls, license_state")
    .eq("user_id", userId)
    .maybeSingle();

  // Check role from users table
  const { data: userRow } = await sb
    .from("users")
    .select("role, full_name")
    .eq("id", userId)
    .maybeSingle();

  return NextResponse.json({
    userId,
    email,
    clerkName,
    full_name: userRow?.full_name ?? clerkName,
    role: userRow?.role ?? "borrower",
    isLO: !!loRow,
    lo: loRow ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const body = await req.json();
  const { full_name, lender, nmls, license_state } = body;

  // Update users table for full_name
  if (full_name !== undefined) {
    await sb.from("users").update({ full_name: full_name.trim() }).eq("id", userId);
  }

  // Check if LO — update loan_officers row
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
    if (Object.keys(updates).length > 0) {
      await sb.from("loan_officers").update(updates).eq("id", loRow.id);
    }
  }

  return NextResponse.json({ ok: true });
}
