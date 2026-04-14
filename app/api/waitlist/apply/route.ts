// app/api/waitlist/apply/route.ts
// POST — submit a Founding 500 waitlist application
// No auth required — open to anyone

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "../../../../lib/supabaseServer";
import { emailWaitlistConfirm } from "../../../../lib/sendEmail";

const VALID_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
]);

export async function POST(req: NextRequest) {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const body = await req.json();
  const { fullName, email, proType, state, nmls, licenseNumber, brokerage } = body;

  // Validate
  if (!fullName?.trim())            return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  if (!email?.trim())               return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (!["lo", "agent"].includes(proType)) return NextResponse.json({ error: "Invalid pro type" }, { status: 400 });
  if (!state || !VALID_STATES.has(state)) return NextResponse.json({ error: "Valid state is required" }, { status: 400 });

  const normalEmail = email.trim().toLowerCase();

  // Check for duplicate
  const { data: existing } = await sb
    .from("pro_waitlist")
    .select("id, position, status")
    .eq("email", normalEmail)
    .maybeSingle();

  if (existing) {
    // Return their existing position — idempotent
    return NextResponse.json({ position: existing.position, alreadyApplied: true });
  }

  // Assign next position
  const { count } = await sb
    .from("pro_waitlist")
    .select("id", { count: "exact", head: true });
  const position = (count ?? 0) + 1;

  const { error: insertErr } = await sb.from("pro_waitlist").insert({
    email:         normalEmail,
    full_name:     fullName.trim(),
    pro_type:      proType,
    state,
    nmls:          nmls || null,
    license_number: licenseNumber || null,
    brokerage:     brokerage || null,
    position,
  });

  if (insertErr) {
    // Race condition: someone else took the slot — retry read
    if (insertErr.code === "23505") {
      const { data: raceRow } = await sb
        .from("pro_waitlist")
        .select("position")
        .eq("email", normalEmail)
        .maybeSingle();
      return NextResponse.json({ position: raceRow?.position ?? position, alreadyApplied: true });
    }
    console.error("[waitlist/apply]", insertErr);
    return NextResponse.json({ error: "Failed to save application — please try again" }, { status: 500 });
  }

  // Fire confirmation email — non-blocking
  emailWaitlistConfirm({
    toEmail:   normalEmail,
    firstName: fullName.trim().split(" ")[0],
    position,
    proType,
    state,
  });

  return NextResponse.json({ ok: true, position });
}
