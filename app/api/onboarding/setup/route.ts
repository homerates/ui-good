// app/api/onboarding/setup/route.ts
// GET  — check if user already has a role set (used to skip /welcome)
// POST — save role + professional details, redirect to /dashboard

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { getSupabase } from "../../../../lib/supabaseServer";
import { awardCredits } from "../../../../lib/credits";

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
  const { role, nmls, lender, license, brokerage, pilotSlug } = body;

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

  // ── Referral attribution ─────────────────────────────────────────────────
  // hr_ref cookie holds the referrer's Clerk user_id
  const jar = await cookies();
  const refSlug = jar.get("hr_ref")?.value ?? null;
  let referrerId: string | null = null;

  if (refSlug && refSlug !== userId) {
    // The cookie value is always the referrer's Clerk user_id (set by /r/[slug])
    const { data: refUser } = await sb
      .from("users")
      .select("id")
      .eq("id", refSlug)
      .maybeSingle();
    if (refUser) referrerId = refUser.id;
  }

  if (referrerId) {
    await sb.from("users").update({ referred_by: referrerId }).eq("id", userId).is("referred_by", null);
    jar.delete("hr_ref");
  }

  // ── Founding member badge ─────────────────────────────────────────────────
  // Primary path: check pro_waitlist for an active invite matching this email.
  // Fallback: award if total pros (LOs + agents) <= 500 at time of registration.
  let foundingNumber: number | null = null;
  if (role === "lo" || role === "agent") {
    const { data: invite } = await sb
      .from("pro_waitlist")
      .select("id, founding_number, status")
      .eq("email", email.toLowerCase())
      .in("status", ["invited", "joined"])
      .maybeSingle();

    if (invite) {
      // Claim the waitlist invite
      if (invite.status === "joined" && invite.founding_number) {
        foundingNumber = invite.founding_number;
      } else {
        const { count: joinedCount } = await sb
          .from("pro_waitlist")
          .select("id", { count: "exact", head: true })
          .eq("status", "joined");
        foundingNumber = (joinedCount ?? 0) + 1;
        await sb.from("pro_waitlist").update({
          status:          "joined",
          joined_at:       new Date().toISOString(),
          founding_number: foundingNumber,
        }).eq("id", invite.id);
      }
      if (role === "lo") {
        await sb.from("loan_officers").update({ is_founding_member: true }).eq("user_id", userId);
      } else {
        await sb.from("agents").update({ is_founding_member: true }).eq("user_id", userId);
      }
    } else {
      // Fallback: first 500 pros to organically register also get the badge
      const [{ count: loCount }, { count: agentCount }] = await Promise.all([
        sb.from("loan_officers").select("user_id", { count: "exact", head: true }),
        sb.from("agents").select("user_id", { count: "exact", head: true }),
      ]);
      if ((loCount ?? 0) + (agentCount ?? 0) <= 500) {
        if (role === "lo") {
          await sb.from("loan_officers").update({ is_founding_member: true }).eq("user_id", userId);
        } else {
          await sb.from("agents").update({ is_founding_member: true }).eq("user_id", userId);
        }
      }
    }
  }

  // ── Company pilot attribution ─────────────────────────────────────────────
  // If the LO/agent came via /pilot/[slug] or /agent-pilot/[slug], link them
  // to the company pilot and grant founding member status + custom credit
  // amount. company_pilots holds both programs distinguished by pilot_type
  // (same slug can exist as both 'lo' and 'agent' — must filter by role or
  // the lookup can match the wrong program's row, or fail outright if both
  // exist for this slug). Linkage table also differs by role: loan_officers
  // vs agents each carry their own company_pilot_id column.
  let pilotCredits = 0;
  let pilotCompanyName: string | null = null;
  if (pilotSlug && (role === "lo" || role === "agent")) {
    const { data: pilot } = await sb
      .from("company_pilots")
      .select("id, company_name, credits_per_lo, is_active")
      .eq("slug", pilotSlug.toLowerCase())
      .eq("pilot_type", role)
      .eq("is_active", true)
      .maybeSingle();

    if (pilot) {
      pilotCredits = pilot.credits_per_lo;
      pilotCompanyName = pilot.company_name;
      // Link to pilot and set founding member on the role-appropriate table
      const linkTable = role === "lo" ? "loan_officers" : "agents";
      await sb.from(linkTable)
        .update({ company_pilot_id: pilot.id, is_founding_member: true })
        .eq("user_id", userId);
    }
  }

  // ── Credits ──────────────────────────────────────────────────────────────
  // Pilot credits (if applicable) — uses pilot's custom amount
  if (pilotCredits > 0) {
    await awardCredits(userId, pilotCredits, "founding_bonus",
      `${pilotCompanyName ?? "Company"} pilot access — welcome!`, `pilot_${pilotSlug}_${userId}`);
  } else {
    // Standard founding bonus — 1,000 credits, once per user
    await awardCredits(userId, 1000, "founding_bonus", "Welcome! Founding member bonus", `founding_${userId}`);
  }

  // Free plan starter credits — 100, once per user
  await awardCredits(userId, 100, "plan_free_monthly", "Free plan starter credits", `free_start_${userId}`);

  // Referral bonus to the referrer — 500 credits per person they bring in
  if (referrerId) {
    await awardCredits(referrerId, 500, "referral_bonus", "Referral bonus — new member joined", `referral_${userId}`);
  }

  return NextResponse.json({ ok: true, role, foundingNumber, isPilot: pilotCredits > 0, pilotCompanyName });
}
