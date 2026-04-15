// app/api/org/claim/route.ts
// GET  ?token=xxx — validate invite token, return org details
// POST — accept invite, create brokerage + compliance acknowledgment

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { data: invite } = await sb
    .from("corporate_invitations")
    .select("id, org_name, org_type, contact_name, contact_email, status, notes")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 });
  if (invite.status === "accepted") return NextResponse.json({ error: "This invitation has already been claimed", already_claimed: true }, { status: 409 });
  if (invite.status === "declined") return NextResponse.json({ error: "This invitation is no longer valid" }, { status: 410 });

  return NextResponse.json({ ok: true, invite });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in required to claim your organization" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const { token, compliance_accepted, website } = body;

  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });
  if (!compliance_accepted) return NextResponse.json({ error: "Compliance acknowledgment required" }, { status: 400 });

  // Validate token
  const { data: invite } = await sb
    .from("corporate_invitations")
    .select("id, org_name, org_type, contact_name")
    .eq("token", token)
    .eq("status", "pending")
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "Invalid or already claimed invitation" }, { status: 404 });

  // Check user doesn't already own a brokerage
  const { data: existingBrokerage } = await sb
    .from("brokerages")
    .select("id")
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (existingBrokerage) {
    return NextResponse.json({ error: "You already own an organization on HomeRates.ai" }, { status: 409 });
  }

  // Check user is an LO (required to own an org)
  const { data: lo } = await sb
    .from("loan_officers")
    .select("id, brokerage_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!lo) {
    return NextResponse.json({ error: "A professional profile is required to claim an organization. Please complete your LO profile first." }, { status: 403 });
  }

  // Create brokerage
  const { data: brokerage, error: createErr } = await sb
    .from("brokerages")
    .insert({
      name: invite.org_name,
      org_type: invite.org_type,
      owner_user_id: userId,
      website: website?.trim() || null,
      admin_invited: true,
      compliance_accepted_at: new Date().toISOString(),
    })
    .select("id, invite_token")
    .single();

  if (createErr || !brokerage) {
    console.error("[org/claim POST]", createErr);
    return NextResponse.json({ error: "Failed to create organization" }, { status: 500 });
  }

  // Add owner as member
  await sb.from("brokerage_members").insert({
    brokerage_id: brokerage.id,
    user_id: userId,
    role: "owner",
  });

  // Link LO to brokerage
  await sb.from("loan_officers").update({ brokerage_id: brokerage.id }).eq("user_id", userId);

  // Mark invite accepted, link to brokerage
  await sb.from("corporate_invitations")
    .update({ status: "accepted", brokerage_id: brokerage.id })
    .eq("id", invite.id);

  return NextResponse.json({ ok: true, brokerage_id: brokerage.id });
}
