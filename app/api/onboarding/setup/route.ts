// app/api/onboarding/setup/route.ts
// GET  — check if user already has a role set (used to skip /welcome)
// POST — save role + professional details, redirect to /dashboard

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ role: null }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ role: null });

  const { data } = await sb
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  return NextResponse.json({ role: data?.role ?? null });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { role, nmls, lender, license, brokerage } = body;

  if (!role || !["borrower", "lo", "agent"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  if (role === "lo" && !nmls?.trim()) {
    return NextResponse.json({ error: "NMLS is required for loan officers" }, { status: 400 });
  }
  if (role === "agent" && !license?.trim()) {
    return NextResponse.json({ error: "License number is required for agents" }, { status: 400 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Upsert role on users table
  const { error: userError } = await sb
    .from("users")
    .upsert({ id: userId, role }, { onConflict: "id" });

  if (userError) {
    console.error("[onboarding/setup] users upsert error:", userError);
    return NextResponse.json({ error: "Failed to save role" }, { status: 500 });
  }

  // Create professional record if LO
  if (role === "lo") {
    const { error: loError } = await sb
      .from("loan_officers")
      .upsert(
        {
          user_id: userId,
          lo_nmls: nmls.trim(),
          lender: lender?.trim() ?? null,
          allowed_borrower_slots: 0, // default — admin can increase
        },
        { onConflict: "user_id" }
      );

    if (loError) {
      console.error("[onboarding/setup] loan_officers upsert error:", loError);
      // Non-fatal — role is already saved
    }
  }

  // Create agent record if agent
  if (role === "agent") {
    const { error: agentError } = await sb
      .from("agents")
      .upsert(
        {
          user_id: userId,
          license: license.trim(),
          brokerage: brokerage?.trim() ?? null,
        },
        { onConflict: "user_id" }
      );

    if (agentError) {
      console.error("[onboarding/setup] agents upsert error:", agentError);
      // Non-fatal — role is already saved
    }
  }

  return NextResponse.json({ ok: true, role });
}
