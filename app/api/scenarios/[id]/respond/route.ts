// app/api/scenarios/[id]/respond/route.ts
// POST — LO submits a response to an anonymous scenario

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../../lib/supabaseServer";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { rate_estimate, approach, lo_name, lo_nmls } = body;

  if (!rate_estimate || !approach || !lo_name || !lo_nmls) {
    return NextResponse.json({ error: "rate_estimate, approach, lo_name, and lo_nmls are required" }, { status: 400 });
  }
  if (approach.length > 500) {
    return NextResponse.json({ error: "Approach must be 500 characters or less" }, { status: 400 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Verify scenario exists and is active
  const { data: scenario } = await sb
    .from("scenario_briefs")
    .select("id, borrower_id, status")
    .eq("id", id)
    .single();

  if (!scenario) return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  if (scenario.status !== "active") return NextResponse.json({ error: "This scenario is no longer accepting responses" }, { status: 400 });
  if (scenario.borrower_id === userId) return NextResponse.json({ error: "You cannot respond to your own scenario" }, { status: 400 });

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
      lo_nmls: lo_nmls.trim(),
      rate_estimate: rate_estimate.trim(),
      approach: approach.trim(),
    })
    .select()
    .single();

  if (error) {
    console.error("[scenarios/respond] error:", error);
    return NextResponse.json({ error: "Failed to submit response" }, { status: 500 });
  }

  // Increment response count on the scenario
  await sb
    .from("scenario_briefs")
    .update({ response_count: scenario.response_count + 1 })
    .eq("id", id);

  return NextResponse.json({ response });
}
