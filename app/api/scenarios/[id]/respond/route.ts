// app/api/scenarios/[id]/respond/route.ts
// POST — LO submits a response to an anonymous scenario

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../../lib/supabaseServer";
import { emailScenarioResponse } from "../../../../../lib/sendEmail";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { rate_estimate, approach, lo_name } = body;

  if (!rate_estimate || !approach || !lo_name) {
    return NextResponse.json({ error: "rate_estimate, approach, and lo_name are required" }, { status: 400 });
  }
  if (approach.length > 800) {
    return NextResponse.json({ error: "Approach must be 800 characters or less" }, { status: 400 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Validate professional identity from DB — never trust client-supplied nmls/license/responder_type
  const [loRow, agentRow] = await Promise.all([
    sb.from("loan_officers").select("user_id, nmls").eq("user_id", userId).maybeSingle(),
    sb.from("agents").select("user_id, license").eq("user_id", userId).maybeSingle(),
  ]);

  let resolvedResponderType: "lo" | "agent";
  let resolvedCredential: string;

  if (loRow.data) {
    if (!loRow.data.nmls) {
      return NextResponse.json(
        { error: "Add your NMLS number to your profile before responding to scenarios" },
        { status: 403 }
      );
    }
    resolvedResponderType = "lo";
    resolvedCredential = loRow.data.nmls;
  } else if (agentRow.data) {
    if (!agentRow.data.license) {
      return NextResponse.json(
        { error: "Add your DRE license number to your profile before responding to scenarios" },
        { status: 403 }
      );
    }
    resolvedResponderType = "agent";
    resolvedCredential = agentRow.data.license;
  } else {
    return NextResponse.json({ error: "Professional account required to respond to scenarios" }, { status: 403 });
  }

  // Verify scenario exists and is active
  const { data: scenarioFull } = await sb
    .from("scenario_briefs")
    .select("id, borrower_id, status, response_count, max_responses, closes_at, visibility, referred_pro_id")
    .eq("id", id)
    .single();

  if (!scenarioFull) return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  if (scenarioFull.status !== "active") return NextResponse.json({ error: "This scenario is no longer accepting responses" }, { status: 400 });
  if (scenarioFull.borrower_id === userId) return NextResponse.json({ error: "You cannot respond to your own scenario" }, { status: 400 });

  // Private scenarios: only the referring professional can respond
  if (scenarioFull.visibility === "private" && scenarioFull.referred_pro_id !== userId) {
    return NextResponse.json({ error: "This scenario is private" }, { status: 403 });
  }

  // Enforce borrower's max_responses cap
  const maxResp = scenarioFull.max_responses ?? 5;
  if ((scenarioFull.response_count ?? 0) >= maxResp) {
    return NextResponse.json({ error: "This scenario has reached its response limit" }, { status: 400 });
  }

  // Enforce closes_at window
  if (scenarioFull.closes_at && new Date(scenarioFull.closes_at) < new Date()) {
    return NextResponse.json({ error: "The response window for this scenario has closed" }, { status: 400 });
  }

  // One response per LO per scenario
  const { data: existing } = await sb
    .from("scenario_responses")
    .select("id")
    .eq("scenario_id", id)
    .eq("lo_id", userId)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: "You have already responded to this scenario" }, { status: 400 });

  const { data: response, error } = await sb
    .from("scenario_responses")
    .insert({
      scenario_id: id,
      lo_id: userId,
      lo_name: lo_name.trim(),
      lo_nmls: resolvedCredential,
      rate_estimate: rate_estimate.trim(),
      approach: approach.trim(),
      responder_type: resolvedResponderType,
    })
    .select()
    .single();

  if (error) {
    console.error("[scenarios/respond] error:", error);
    return NextResponse.json({ error: "Failed to submit response" }, { status: 500 });
  }

  // Increment response count — auto-close if cap reached
  const newCount = (scenarioFull.response_count ?? 0) + 1;
  const maxReached = newCount >= (scenarioFull.max_responses ?? 5);
  await sb
    .from("scenario_briefs")
    .update({
      response_count: newCount,
      ...(maxReached ? { status: "matched" } : {}),
    })
    .eq("id", id);

  // Email the borrower — notify them a response arrived
  try {
    const clerk = await clerkClient();
    const borrowerClerk = await clerk.users.getUser(scenarioFull.borrower_id);
    const borrowerEmail = borrowerClerk.emailAddresses[0]?.emailAddress ?? null;
    const borrowerName  = [borrowerClerk.firstName, borrowerClerk.lastName].filter(Boolean).join(" ") || "there";
    if (borrowerEmail) {
      await emailScenarioResponse({
        toEmail: borrowerEmail,
        toName: borrowerName,
        loName: lo_name.trim(),
        rateEstimate: rate_estimate.trim(),
        scenarioId: id,
      });
    }
  } catch (e) {
    console.error("[scenarios/respond] emailScenarioResponse failed:", e);
  }

  return NextResponse.json({ response });
}
