// app/api/scenarios/route.ts
// POST  — borrower creates an anonymous scenario brief
// GET   — LO board: list active scenarios (anonymized)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../lib/supabaseServer";
import { canPostScenario } from "../../../lib/subscription";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    loan_type, loan_purpose, price_range, down_payment_pct, income_range,
    credit_tier, timeline, state, notes, needs_professional,
    max_responses, response_window_hours, anonymity_level,
    card_price, card_dp_pct, card_rate, card_monthly, card_term,
    visibility: requestedVisibility, // 'public' | 'private' — borrower's explicit choice
  } = body;

  const hasCardData = !!(card_price && card_rate && card_monthly);

  if (!loan_type || !price_range || !down_payment_pct || !income_range || !credit_tier || !timeline || !state) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Validate matching controls
  const maxResp = Math.min(Math.max(parseInt(max_responses ?? "3") || 3, 1), 5);
  const windowHours = [24, 48, 72].includes(parseInt(response_window_hours ?? "48")) ? parseInt(response_window_hours) : 48;
  const closesAt = new Date(Date.now() + windowHours * 3600 * 1000).toISOString();

  // Check monthly scenario post limit
  const quota = await canPostScenario(userId);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: "You've used your free scenario posts this month. Upgrade to post more.", upgrade: true },
      { status: 403 }
    );
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Look up whether this borrower was referred by a professional
  const { data: userRow } = await sb.from("users").select("referred_by").eq("id", userId).maybeSingle();
  const referredBy = userRow?.referred_by ?? null;

  // Visibility: borrower can explicitly choose 'public', otherwise default to
  // 'private' if they were referred (protecting the referring professional's lead).
  const visibility = requestedVisibility === "public" ? "public" : (referredBy ? "private" : "public");
  const referredProId = visibility === "private" ? referredBy : null;

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
      max_responses: maxResp,
      response_window_hours: windowHours,
      closes_at: closesAt,
      anonymity_level: anonymity_level ?? "full",
      visibility,
      referred_pro_id: referredProId,
      has_card_data: hasCardData,
      card_price:   card_price   ?? null,
      card_dp_pct:  card_dp_pct  ?? null,
      card_rate:    card_rate    ?? null,
      card_monthly: card_monthly ?? null,
      card_term:    card_term    ?? null,
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
  const myReferrals = url.searchParams.get("my_referrals") === "1";

  // Short-circuit: LO fetching only their private referred scenarios
  if (myReferrals) {
    const { data: refs } = await sb
      .from("scenario_briefs")
      .select("id, loan_type, loan_purpose, price_range, down_payment_pct, income_range, credit_tier, timeline, state, notes, needs_professional, response_count, max_responses, closes_at, created_at, has_card_data, card_price, card_dp_pct, card_rate, card_monthly, card_term, visibility, referred_pro_id")
      .eq("referred_pro_id", userId)
      .eq("visibility", "private")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    const refIds = (refs ?? []).map(s => s.id);
    let respondedRefIds: string[] = [];
    if (refIds.length > 0) {
      const { data: myR } = await sb.from("scenario_responses").select("scenario_id").eq("lo_id", userId).in("scenario_id", refIds);
      respondedRefIds = (myR ?? []).map(r => r.scenario_id);
    }
    return NextResponse.json({
      scenarios: (refs ?? []).map(s => ({ ...s, already_responded: respondedRefIds.includes(s.id) })),
    });
  }

  // Filter scenarios to ones relevant for this professional type
  const profFilter = responder_type === "agent" ? ["agent", "both"] : ["lender", "both"];

  const BOARD_SELECT = "id, loan_type, loan_purpose, price_range, down_payment_pct, income_range, credit_tier, timeline, state, notes, needs_professional, response_count, max_responses, response_window_hours, closes_at, created_at, has_card_data, card_price, card_dp_pct, card_rate, card_monthly, card_term, visibility, referred_pro_id";

  // Two queries merged in JS — avoids .or() parser issues:
  // 1) Public scenarios on the board
  // 2) Private scenarios where I am the referred professional
  let publicQ = sb.from("scenario_briefs").select(BOARD_SELECT)
    .eq("status", "active").eq("visibility", "public")
    .in("needs_professional", profFilter)
    .order("created_at", { ascending: false }).limit(50);
  let privateQ = sb.from("scenario_briefs").select(BOARD_SELECT)
    .eq("status", "active").eq("visibility", "private").eq("referred_pro_id", userId)
    .in("needs_professional", profFilter)
    .order("created_at", { ascending: false }).limit(20);

  if (state) { publicQ = publicQ.eq("state", state); privateQ = privateQ.eq("state", state); }
  if (loan_type) { publicQ = publicQ.eq("loan_type", loan_type); privateQ = privateQ.eq("loan_type", loan_type); }

  const [publicRes, privateRes] = await Promise.all([publicQ, privateQ]);
  if (publicRes.error) return NextResponse.json({ error: "Failed to load board" }, { status: 500 });

  // Merge: private referrals first (top of board), then public
  const seen = new Set<string>();
  const data: NonNullable<typeof publicRes.data> = [];
  for (const s of [...(privateRes.data ?? []), ...(publicRes.data ?? [])]) {
    if (!seen.has(s.id)) { seen.add(s.id); data.push(s); }
  }

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

  const now = Date.now();
  // Filter expired scenarios in JS (avoids Supabase .or() timestamp syntax issues)
  const active = (data ?? []).filter(s => !s.closes_at || new Date(s.closes_at).getTime() > now);

  const scenarios = active.map(s => {
    const base = {
      ...s,
      already_responded: respondedIds.includes(s.id),
    };

    // Agents must not see financial/loan fields — strip them server-side
    if (responder_type === "agent") {
      const {
        credit_tier, income_range, down_payment_pct, loan_type,
        card_rate, card_monthly, card_dp_pct, card_price, card_term,
        has_card_data,
        ...agentSafe
      } = base;
      void credit_tier; void income_range; void down_payment_pct; void loan_type;
      void card_rate; void card_monthly; void card_dp_pct; void card_price;
      void card_term; void has_card_data;
      return agentSafe;
    }

    return base;
  });

  return NextResponse.json({ scenarios });
}
