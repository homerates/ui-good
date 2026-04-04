// app/api/scenarios/[id]/route.ts
// GET  — borrower sees their full scenario + responses
//      — LO sees anonymized scenario to respond to
// DELETE — borrower closes their scenario

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { data: scenario, error } = await sb
    .from("scenario_briefs")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !scenario) return NextResponse.json({ error: "Scenario not found" }, { status: 404 });

  const isBorrower = scenario.borrower_id === userId;

  if (isBorrower) {
    // Borrower sees full scenario + all responses with LO identifiers
    const { data: responses } = await sb
      .from("scenario_responses")
      .select("id, lo_id, lo_name, lo_nmls, rate_estimate, approach, status, responder_type, created_at")
      .eq("scenario_id", id)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      scenario: { ...scenario },
      responses: responses ?? [],
    });
  } else {
    // LO sees anonymized scenario + whether they've already responded
    const { data: existing } = await sb
      .from("scenario_responses")
      .select("id")
      .eq("scenario_id", id)
      .eq("lo_id", userId)
      .maybeSingle();

    return NextResponse.json({
      scenario: {
        id: scenario.id,
        loan_type: scenario.loan_type,
        loan_purpose: scenario.loan_purpose,
        price_range: scenario.price_range,
        down_payment_pct: scenario.down_payment_pct,
        income_range: scenario.income_range,
        credit_tier: scenario.credit_tier,
        timeline: scenario.timeline,
        state: scenario.state,
        notes: scenario.notes,
        response_count: scenario.response_count,
        created_at: scenario.created_at,
        status: scenario.status,
      },
      already_responded: !!existing,
    });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { data: scenario } = await sb
    .from("scenario_briefs")
    .select("borrower_id")
    .eq("id", id)
    .single();

  if (!scenario) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (scenario.borrower_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await sb.from("scenario_briefs").update({ status: "closed" }).eq("id", id);
  return NextResponse.json({ ok: true });
}
