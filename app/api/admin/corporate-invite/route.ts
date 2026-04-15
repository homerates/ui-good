// app/api/admin/corporate-invite/route.ts
// GET  — list all corporate invitations + org nominations
// POST — create a new corporate invitation and send email
// PATCH — update a nomination status

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";
import { emailCorporateInvite } from "../../../../lib/sendEmail";

const ORG_LABELS: Record<string, string> = {
  brokerage:   "Mortgage Brokerage",
  lender:      "Lender / Bank",
  credit_union: "Credit Union",
  re_brokerage: "Real Estate Brokerage",
};

async function isAdmin(userId: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data } = await sb
    .from("admin_users")
    .select("clerk_user_id")
    .eq("clerk_user_id", userId)
    .maybeSingle();
  return !!data;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const [{ data: invites }, { data: nominations }] = await Promise.all([
    sb.from("corporate_invitations")
      .select("id, org_name, org_type, contact_name, contact_email, status, notes, brokerage_id, created_at")
      .order("created_at", { ascending: false }),
    sb.from("org_nominations")
      .select("id, nominated_by, org_name, org_type, contact_email, website, notes, status, created_at")
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    invitations: invites ?? [],
    nominations: nominations ?? [],
  });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const { org_name, org_type = "brokerage", contact_name, contact_email, notes } = body;

  if (!org_name?.trim()) return NextResponse.json({ error: "Organization name required" }, { status: 400 });
  if (!contact_email?.trim()) return NextResponse.json({ error: "Contact email required" }, { status: 400 });

  const { data: invite, error } = await sb
    .from("corporate_invitations")
    .insert({
      org_name: org_name.trim(),
      org_type,
      contact_name: contact_name?.trim() || null,
      contact_email: contact_email.trim().toLowerCase(),
      invited_by: userId,
      notes: notes?.trim() || null,
    })
    .select("id, token")
    .single();

  if (error || !invite) {
    console.error("[corporate-invite POST]", error);
    return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 });
  }

  // Get admin name from Clerk
  let invitedByName = "HomeRates.ai Team";
  try {
    const clerk = await clerkClient();
    const adminUser = await clerk.users.getUser(userId);
    invitedByName = [adminUser.firstName, adminUser.lastName].filter(Boolean).join(" ") || invitedByName;
  } catch { /* non-fatal */ }

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://chat.homerates.ai";
  const claimUrl = `${base}/org/claim/${invite.token}`;

  await emailCorporateInvite({
    toEmail: contact_email.trim().toLowerCase(),
    contactName: contact_name?.trim() || null,
    orgName: org_name.trim(),
    orgTypeLabel: ORG_LABELS[org_type] ?? "Organization",
    claimUrl,
    invitedByName,
    notes: notes?.trim() || null,
  });

  return NextResponse.json({ ok: true, id: invite.id, token: invite.token, claim_url: claimUrl });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const { id, type, status } = body; // type: 'nomination' | 'invitation'

  const VALID_NOM_STATUSES = ["pending", "contacted", "converted", "dismissed"];
  const VALID_INV_STATUSES = ["pending", "accepted", "declined"];

  if (type === "nomination") {
    if (!VALID_NOM_STATUSES.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    const { error } = await sb.from("org_nominations").update({ status }).eq("id", id);
    if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  } else if (type === "invitation") {
    if (!VALID_INV_STATUSES.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    const { error } = await sb.from("corporate_invitations").update({ status }).eq("id", id);
    if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  } else {
    return NextResponse.json({ error: "type must be nomination or invitation" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
