// app/api/profile/route.ts
// GET  — fetch the signed-in user's profile (LO or borrower)
// PATCH — update editable fields

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../lib/supabaseServer";

const LO_SELECT = "id, email, lender, nmls, license_state, company_nmls, title, bio, phone, website, office_address";
const AGENT_SELECT = "id, brokerage, license, title, bio, phone, website, office_address";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";
  const clerkName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ");
  const photoUrl = clerkUser.imageUrl ?? null;

  // Run all queries in parallel
  const [loResult, agentResult, userResult] = await Promise.all([
    sb.from("loan_officers").select(LO_SELECT).eq("user_id", userId).maybeSingle(),
    sb.from("agents").select(AGENT_SELECT).eq("user_id", userId).maybeSingle(),
    sb.from("users").select("role, full_name, referred_by").eq("id", userId).maybeSingle(),
  ]);

  const loRow    = loResult.data;
  const agentRow = agentResult.data;
  const userRow  = userResult.data;

  const role = userRow?.role ?? (loRow ? "lo" : agentRow ? "agent" : "borrower");
  const isLO = !!loRow || userRow?.role === "lo";

  // Resolve the referring professional's display name if this user was referred
  let referredByName: string | null = null;
  const referredById = userRow?.referred_by ?? null;
  if (referredById) {
    try {
      const referringUser = await clerk.users.getUser(referredById);
      referredByName = [referringUser.firstName, referringUser.lastName].filter(Boolean).join(" ")
        || referringUser.emailAddresses[0]?.emailAddress
        || null;
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({
    userId,
    email,
    clerkName,
    photoUrl,
    full_name: userRow?.full_name ?? clerkName,
    role,
    isLO,
    lo: loRow ?? null,
    agent: agentRow ?? null,
    referred_by: referredById,
    referred_by_name: referredByName,
  });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const body = await req.json();
  const {
    full_name, role,
    // LO / agent shared professional fields
    lender, nmls, license_state, company_nmls,
    title, bio, phone, website, office_address,
    // Agent-specific
    brokerage, license,
    // Borrower-specific
    borrower_phone, property_address, current_loan_balance,
  } = body;

  // Get email from Clerk for row creation
  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";

  // Update users table
  const userUpdates: Record<string, string> = {};
  if (full_name   !== undefined) userUpdates.full_name   = full_name.trim();
  if (role        !== undefined) userUpdates.role        = role;
  if (borrower_phone !== undefined) userUpdates.phone    = borrower_phone.trim();
  if (property_address !== undefined) userUpdates.property_address = property_address.trim();
  if (current_loan_balance !== undefined) userUpdates.current_loan_balance = current_loan_balance.trim();
  if (Object.keys(userUpdates).length > 0) {
    await sb.from("users").update(userUpdates).eq("id", userId);
  }

  // Professional field update helper
  const proFields = (src: Record<string, unknown>) => {
    const u: Record<string, string | null> = {};
    const set = (k: string, v: unknown) => { if (v !== undefined) u[k] = typeof v === "string" ? v.trim() || null : null; };
    set("title",          src.title);
    set("bio",            src.bio);
    set("phone",          src.phone);
    set("website",        src.website);
    set("office_address", src.office_address);
    return u;
  };

  const proBody = { title, bio, phone, website, office_address };

  // LO row
  if (role === "lo") {
    const { data: existing } = await sb.from("loan_officers").select("id").eq("user_id", userId).maybeSingle();
    if (!existing) {
      await sb.from("loan_officers").insert({
        user_id: userId, email,
        lender: lender?.trim() ?? null,
        nmls: nmls?.trim() ?? null,
        license_state: license_state?.trim() ?? null,
        company_nmls: company_nmls?.trim() ?? null,
        allowed_borrower_slots: 0,
        ...proFields(proBody),
      });
    } else {
      const updates: Record<string, string | null> = { ...proFields(proBody) };
      if (lender        !== undefined) updates.lender        = lender?.trim() || null;
      if (nmls          !== undefined) updates.nmls          = nmls?.trim() || null;
      if (license_state !== undefined) updates.license_state = license_state?.trim() || null;
      if (company_nmls  !== undefined) updates.company_nmls  = company_nmls?.trim() || null;
      if (Object.keys(updates).length > 0) {
        await sb.from("loan_officers").update(updates).eq("id", existing.id);
      }
    }
  }

  // Agent row
  if (role === "agent") {
    const { data: existing } = await sb.from("agents").select("id").eq("user_id", userId).maybeSingle();
    if (!existing) {
      await sb.from("agents").insert({
        user_id: userId,
        brokerage: brokerage?.trim() ?? null,
        license: license?.trim() ?? null,
        ...proFields(proBody),
      });
    } else {
      const updates: Record<string, string | null> = { ...proFields(proBody) };
      if (brokerage !== undefined) updates.brokerage = brokerage?.trim() || null;
      if (license   !== undefined) updates.license   = license?.trim()   || null;
      if (Object.keys(updates).length > 0) {
        await sb.from("agents").update(updates).eq("id", existing.id);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
