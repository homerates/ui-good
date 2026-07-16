// app/api/invite/claim/route.ts
// POST — authenticated user claims a consumer invite token → credits granted

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";
import { awardCredits } from "../../../../lib/credits";
import { linkBorrowerAccount } from "../../../../lib/crm/link-borrower-account";

export async function POST(req: NextRequest) {
  const { userId } = getAuth(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const { data: invite } = await sb
    .from("consumer_invites")
    .select("id, credits, status, expires_at, email")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  if (invite.status === "claimed") return NextResponse.json({ ok: true, alreadyClaimed: true, credits: 0 });
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }

  // Mark claimed
  await sb.from("consumer_invites")
    .update({ status: "claimed", claimed_at: new Date().toISOString(), claimed_by_user_id: userId })
    .eq("id", invite.id);

  // Link any borrower rows for this email to the claiming account.
  // Token possession proves control of the invite email. Identity link only —
  // see lib/crm/link-borrower-account.ts and Decision 10.
  if (invite.email) {
    await linkBorrowerAccount(sb, userId, invite.email);
  }

  // Grant credits (idempotent via referenceId)
  const ok = await awardCredits(userId, invite.credits, "admin_grant", "Consumer invite credit grant", `consumer_invite_${invite.id}`);

  return NextResponse.json({ ok, credits: invite.credits });
}
