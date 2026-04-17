// app/api/waitlist/claim/route.ts
// POST — claim a founding member spot for the logged-in user.
// Called from /welcome on mount (handles already-registered users who click an invite link).
// Safe to call multiple times — idempotent if already joined.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";
import { checkFoundingMilestone } from "../../../../lib/foundingMilestone";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, reason: "db_unavailable" }, { status: 500 });

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses.find(
    e => e.id === clerkUser.primaryEmailAddressId
  )?.emailAddress?.toLowerCase();

  if (!email) return NextResponse.json({ ok: false, reason: "no_email" });

  // Find an active (invited) waitlist entry for this email
  const { data: entry } = await sb
    .from("pro_waitlist")
    .select("id, founding_number, position, status")
    .eq("email", email)
    .in("status", ["invited", "joined"])   // also handle already-joined (idempotent)
    .maybeSingle();

  if (!entry) return NextResponse.json({ ok: false, reason: "no_invite" });

  // Already claimed — return existing founding number
  if (entry.status === "joined" && entry.founding_number) {
    return NextResponse.json({ ok: true, foundingNumber: entry.founding_number, alreadyClaimed: true });
  }

  // Assign founding number = current joined count + 1
  const { count: joinedCount } = await sb
    .from("pro_waitlist")
    .select("id", { count: "exact", head: true })
    .eq("status", "joined");
  const foundingNumber = (joinedCount ?? 0) + 1;

  // Mark waitlist entry as joined
  await sb.from("pro_waitlist").update({
    status:          "joined",
    joined_at:       new Date().toISOString(),
    founding_number: foundingNumber,
  }).eq("id", entry.id);

  // Get user's role so we can set is_founding_member on their profile table
  const { data: userRow } = await sb
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (userRow?.role === "lo") {
    await sb.from("loan_officers")
      .update({ is_founding_member: true })
      .eq("user_id", userId);
  } else if (userRow?.role === "agent") {
    await sb.from("agents")
      .update({ is_founding_member: true })
      .eq("user_id", userId);
  }

  // Non-blocking: fire urgency blast at 450 and 490
  checkFoundingMilestone(foundingNumber).catch(console.error);

  return NextResponse.json({ ok: true, foundingNumber });
}
