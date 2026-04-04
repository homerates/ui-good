// app/api/scenarios/route.ts
// POST  — borrower creates an anonymous scenario brief
// GET   — LO board: list active scenarios (anonymized)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../lib/supabaseServer";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { loan_type, loan_purpose, price_range, down_payment_pct, income_range, credit_tier, timeline, state, notes, needs_professional } = body;

  if (!loan_type || !price_range || !down_payment_pct || !income_range || !credit_tier || !timeline || !state) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // One active scenario per borrower at a time
  const { data: existing } = await sb
    .from("scenario_briefs")
    .select("id")
    .eq("borrower_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "You already have an active scenario. Close it before posting a new one.", existing_id: existing.id }, { status: 400 });
  }

  const { data, error } = await sb
    .from("scenario_briefs")
    .insert({
      borrower_id: userId,
      loan_type,
      loan_purpose: loan_purpose ?? "purchase",
      price_range,
      down_payment_pct,
      income_range,
      credit_tier,
      timeline,
      state,
      notes: notes ?? null,
      needs_professional: needs_professional ?? "both",
    })
    .select()
    .single();

  if (error) {
    console.error("[scenarios] insert error:", error);
    return NextResponse.json({ error: "Failed to create scenario" }, { status: 500 });
  }

  return NextResponse.json({ scenario: data });
}

// GET — borrower's own scenario (?mine=1) OR LO board (anonymized)
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const url = new URL(req.url);
  const mine = url.searchParams.get("mine");

  // Borrower fetching their own scenario
  if (mine === "1") {
    const { data, error } = await sb
      .from("scenario_briefs")
      .select("id, loan_type, loan_purpose, price_range, down_payment_pct, income_range, credit_tier, timeline, state, notes, status, response_count, created_at")
      .eq("borrower_id", userId)
      .in("status", ["active", "matched"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return NextResponse.json({ error: "Failed to load scenario" }, { status: 500 });
    return NextResponse.json({ scenarios: data ?? [] });
  }

  // LO or agent board (anonymized — no borrower_id exposed)
  const state = url.searchParams.get("state");
  const loan_type = url.searchParams.get("loan_type");
  const responder_type = url.searchParams.get("responder_type") ?? "lo"; // 'lo' or 'agent'

  // Filter scenarios to ones relevant for this professional type
  const profFilter = responder_type === "agent" ? ["agent", "both"] : ["lender", "both"];

  let query = sb
    .from("scenario_briefs")
    .select("id, loan_type, loan_purpose, price_range, down_payment_pct, credit_tier, timeline, state, notes, needs_professional, response_count, created_at")
    .eq("status", "active")
    .in("needs_professional", profFilter)
    .order("created_at", { ascending: false })
    .limit(50);

  if (state) query = query.eq("state", state);
  if (loan_type) query = query.eq("loan_type", loan_type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Failed to load board" }, { status: 500 });

  // Check which ones the current LO already responded to
  const ids = (data ?? []).map(s => s.id);
  let respondedIds: string[] = [];
  if (ids.length > 0) {
    const { data: myResponses } = await sb
      .from("scenario_responses")
      .select("scenario_id")
      .eq("lo_id", userId)
      .in("scenario_id", ids);
    respondedIds = (myResponses ?? []).map(r => r.scenario_id);
  }

  const scenarios = (data ?? []).map(s => ({
    ...s,
    already_responded: respondedIds.includes(s.id),
  }));

  return NextResponse.json({ scenarios });
}
