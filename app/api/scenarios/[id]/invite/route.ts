// app/api/scenarios/[id]/invite/route.ts
// POST — borrower invites a specific LO to connect
// This is the moment identity is exchanged — both parties get each other's contact info

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../../lib/supabaseServer";
import { Resend } from "resend";
import { emailShell } from "../../../../../lib/sendEmail";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { response_id } = body;

  if (!response_id) return NextResponse.json({ error: "Missing response_id" }, { status: 400 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Verify scenario belongs to this borrower
  const { data: scenario } = await sb
    .from("scenario_briefs")
    .select("id, borrower_id, status, loan_type, price_range, state")
    .eq("id", id)
    .single();

  if (!scenario) return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  if (scenario.borrower_id !== userId) return NextResponse.json({ error: "Not your scenario" }, { status: 403 });

  // Get the LO's response
  const { data: response } = await sb
    .from("scenario_responses")
    .select("id, lo_id, lo_name, lo_nmls, rate_estimate, approach, responder_type")
    .eq("id", response_id)
    .eq("scenario_id", id)
    .single();

  if (!response) return NextResponse.json({ error: "Response not found" }, { status: 404 });

  // Create invite record
  const { error: inviteError } = await sb.from("scenario_invites").insert({
    scenario_id: id,
    response_id,
    borrower_id: userId,
    lo_id: response.lo_id,
  });

  if (inviteError && inviteError.code !== "23505") {
    // 23505 = duplicate key (already invited) — allow idempotent
    console.error("[invite] error:", inviteError);
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }

  // Update response status to invited
  await sb.from("scenario_responses").update({ status: "invited" }).eq("id", response_id);

  // Update scenario status to matched
  await sb.from("scenario_briefs").update({ status: "matched" }).eq("id", id);

  // ── Email exchange ───────────────────────────────────────────────────────
  // Get borrower's Clerk profile for their email
  let borrowerEmail = "";
  let borrowerName = "HomeRates.ai User";
  try {
    const clerk = await clerkClient();
    const borrowerUser = await clerk.users.getUser(userId);
    borrowerEmail = borrowerUser.emailAddresses[0]?.emailAddress ?? "";
    borrowerName = [borrowerUser.firstName, borrowerUser.lastName].filter(Boolean).join(" ") || "HomeRates.ai User";
  } catch (e) {
    console.error("[invite] clerk lookup failed:", e);
  }

  // Get LO's email
  let loEmail = "";
  try {
    const clerk = await clerkClient();
    const loUser = await clerk.users.getUser(response.lo_id);
    loEmail = loUser.emailAddresses[0]?.emailAddress ?? "";
  } catch (e) {
    console.error("[invite] lo clerk lookup failed:", e);
  }

  const isAgent = response.responder_type === "agent";
  const profLabel = isAgent ? "agent" : "loan officer";
  const licenseLabel = isAgent ? "License" : "NMLS";
  const valueLabel = isAgent ? "Buyer rep fee" : "Rate estimate";

  // Notify professional — they earned the introduction
  if (loEmail) {
    await resend.emails.send({
      from: "HomeRates.ai <digest@homerates.ai>",
      to: loEmail,
      subject: `You earned a connection — ${scenario.loan_type} in ${scenario.state}`,
      html: emailShell(`
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">New Connection</p>
        <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#080c12;line-height:1.2;">You earned a connection.</p>
        <p style="margin:0 0 20px;font-size:15px;color:#6b7a8d;">A borrower reviewed your response and chose you as their ${profLabel}. Here's their contact:</p>
        <div style="background:#f4f6f9;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:0 0 24px;">
          <div style="font-size:16px;font-weight:700;color:#080c12;margin-bottom:4px;">${borrowerName}</div>
          <div style="font-size:14px;color:#6b7a8d;margin-bottom:12px;">${borrowerEmail}</div>
          <div style="font-size:13px;color:#6b7a8d;">Scenario: <strong style="color:#1a2530;">${scenario.loan_type.toUpperCase()} · ${scenario.price_range} · ${scenario.state}</strong></div>
        </div>
        <p style="margin:0;font-size:14px;color:#6b7a8d;">They chose you based on your response. Reach out with the same context you provided — no surprises.</p>
      `, "HomeRates.ai · This connection was borrower-initiated."),
    });
  }

  // Notify borrower — confirm the intro
  if (borrowerEmail) {
    await resend.emails.send({
      from: "HomeRates.ai <digest@homerates.ai>",
      to: borrowerEmail,
      subject: `Your introduction to ${response.lo_name} is confirmed`,
      html: emailShell(`
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00e87a;">Introduction Confirmed</p>
        <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#080c12;line-height:1.2;">You're connected.</p>
        <p style="margin:0 0 20px;font-size:15px;color:#6b7a8d;"><strong style="color:#1a2530;">${response.lo_name}</strong> has been notified and has your contact info. They'll reach out directly.</p>
        <div style="background:#f4f6f9;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:0 0 24px;">
          <div style="font-size:16px;font-weight:700;color:#080c12;margin-bottom:4px;">${response.lo_name}</div>
          <div style="font-size:13px;color:#6b7a8d;margin-bottom:8px;">${licenseLabel} #${response.lo_nmls}</div>
          <div style="font-size:13px;color:#6b7a8d;">${valueLabel}: <strong style="color:#008a48;">${response.rate_estimate}</strong></div>
        </div>
        <p style="margin:0;font-size:14px;color:#6b7a8d;">You chose them because their response matched what HomeRates.ai showed you. Hold them to it.</p>
      `, "HomeRates.ai · You stay in control."),
    });
  }

  return NextResponse.json({ ok: true, lo_name: response.lo_name, lo_nmls: response.lo_nmls });
}
