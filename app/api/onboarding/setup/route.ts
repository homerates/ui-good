// app/api/onboarding/setup/route.ts
// GET  — check if user already has a role set (used to skip /welcome)
// POST — save role + professional details, redirect to /dashboard

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
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

  // Upsert the users row — handles the case where the Clerk webhook hasn't
  // fired yet (delivery lag) and the row doesn't exist yet.
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses.find(
    e => e.id === clerkUser.primaryEmailAddressId
  )?.emailAddress ?? "";

  const { error: userError } = await sb
    .from("users")
    .upsert(
      { id: userId, email, role, plan: "free" },
      { onConflict: "id" }
    );

  if (userError) {
    console.error("[onboarding/setup] users upsert error:", userError);
    return NextResponse.json({ error: "Failed to save role: " + userError.message }, { status: 500 });
  }

  // Create LO record — store lender/company for dashboard display
  // NMLS is collected per scenario response (already in respond modal as default)
  if (role === "lo") {
    const loPayload: Record<string, unknown> = {
      user_id: userId,
      lender: lender?.trim() || null,
      allowed_borrower_slots: 0,
    };
    // Store NMLS if the column exists — added via:
    // alter table loan_officers add column if not exists nmls text;
    if (nmls?.trim()) loPayload.nmls = nmls.trim();

    const { error: loError } = await sb
      .from("loan_officers")
      .upsert(loPayload, { onConflict: "user_id" });
    if (loError) console.error("[onboarding/setup] loan_officers upsert error:", loError);
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

  // If visitor arrived via a referral link, record it (only if not already set)
  const jar = await cookies();
  const refSlug = jar.get("hr_ref")?.value ?? null;
  if (refSlug && refSlug !== userId) {
    await sb.from("users").update({ referred_by: refSlug }).eq("id", userId).is("referred_by", null);
    jar.delete("hr_ref");
  }

  return NextResponse.json({ ok: true, role });
}
