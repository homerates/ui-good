// app/api/scenarios/[id]/invite/route.ts
// POST — borrower invites a specific LO to connect
// This is the moment identity is exchanged — both parties get each other's contact info

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../../lib/supabaseServer";
import { Resend } from "resend";

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
    .select("id, lo_id, lo_name, lo_nmls, rate_estimate, approach")
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

  // Notify LO — they earned the introduction
  if (loEmail) {
    await resend.emails.send({
      from: "HomeRates.ai <digest@homerates.ai>",
      to: loEmail,
      subject: `You earned a connection — ${scenario.loan_type} in ${scenario.state}`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; background: #080c12; color: #f0f4ff; padding: 32px; border-radius: 12px;">
          <img src="https://chat.homerates.ai/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" style="height: 28px; margin-bottom: 24px;" />
          <h2 style="color: #00e87a; font-size: 1.4rem; margin: 0 0 12px;">You earned a connection.</h2>
          <p style="color: #6b7a99; margin: 0 0 20px;">A borrower reviewed your response and chose you. Here's their contact:</p>
          <div style="background: #0e1420; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 20px; margin-bottom: 20px;">
            <div style="font-weight: 600; font-size: 1.05rem; margin-bottom: 4px;">${borrowerName}</div>
            <div style="color: #6b7a99; font-size: 0.9rem; margin-bottom: 12px;">${borrowerEmail}</div>
            <div style="font-size: 0.85rem; color: #6b7a99;">Scenario: <strong style="color: #f0f4ff;">${scenario.loan_type.toUpperCase()} · ${scenario.price_range} · ${scenario.state}</strong></div>
          </div>
          <p style="color: #6b7a99; font-size: 0.85rem;">They chose you based on your response. Reach out with the same context you provided — no surprises.</p>
          <p style="color: #3a4560; font-size: 0.78rem; margin-top: 24px;">HomeRates.ai · This connection was borrower-initiated.</p>
        </div>
      `,
    });
  }

  // Notify borrower — confirm the intro
  if (borrowerEmail) {
    await resend.emails.send({
      from: "HomeRates.ai <digest@homerates.ai>",
      to: borrowerEmail,
      subject: `Your introduction to ${response.lo_name} is confirmed`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; background: #080c12; color: #f0f4ff; padding: 32px; border-radius: 12px;">
          <img src="https://chat.homerates.ai/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" style="height: 28px; margin-bottom: 24px;" />
          <h2 style="color: #00e87a; font-size: 1.4rem; margin: 0 0 12px;">Introduction confirmed.</h2>
          <p style="color: #6b7a99; margin: 0 0 20px;">${response.lo_name} has been notified and has your contact info. They'll reach out directly.</p>
          <div style="background: #0e1420; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 20px; margin-bottom: 20px;">
            <div style="font-weight: 600; margin-bottom: 4px;">${response.lo_name}</div>
            <div style="color: #6b7a99; font-size: 0.85rem; margin-bottom: 8px;">NMLS #${response.lo_nmls}</div>
            <div style="font-size: 0.85rem; color: #6b7a99;">Their rate estimate: <strong style="color: #00e87a;">${response.rate_estimate}</strong></div>
          </div>
          <p style="color: #6b7a99; font-size: 0.85rem;">Remember: you chose them because their response matched what HomeRates.ai showed you. Hold them to it.</p>
          <p style="color: #3a4560; font-size: 0.78rem; margin-top: 24px;">HomeRates.ai · You stay in control.</p>
        </div>
      `,
    });
  }

  return NextResponse.json({ ok: true, lo_name: response.lo_name, lo_nmls: response.lo_nmls });
}
