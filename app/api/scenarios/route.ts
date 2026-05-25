// app/api/scenarios/route.ts
// POST  — borrower creates an anonymous scenario brief
// GET   — LO board: list active scenarios (anonymized)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../lib/supabaseServer";
import { canPostScenario } from "../../../lib/subscription";
import { sendScenarioAlerts } from "../../../lib/sendScenarioAlerts";

// ─── Scenario alerts → lib/sendScenarioAlerts.ts ─────────────────────────────

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
    posted_by_role: rawPostedByRole,
  } = body;
  const posted_by_role = rawPostedByRole === 'agent' ? 'agent' : 'borrower';

  const hasCardData = !!(card_price && card_rate);

  // DEBUG — log what card fields arrived (remove after confirming creation path)
  console.log('[scenarios/POST] card_data_received:', { card_price, card_dp_pct, card_rate, card_monthly, card_term, hasCardData, body_keys: Object.keys(body) });

  if (!loan_type || !price_range || down_payment_pct == null || !income_range || !credit_tier || !timeline || !state) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Validate matching controls
  const maxResp = Math.min(Math.max(parseInt(max_responses ?? "3") || 3, 1), 5);
  const windowHours = [24, 48, 72].includes(parseInt(response_window_hours ?? "48")) ? parseInt(response_window_hours) : 48;
  // down_payment_pct may arrive as a decimal string ("3.5") — column is integer, so round it
  const dpPct = Math.round(parseFloat(String(down_payment_pct)) || 0);
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

  // Fetch all active scenarios for this borrower
  const { data: activeScenarios, error: existingErr } = await sb
    .from("scenario_briefs")
    .select("id, loan_type, loan_purpose, state, closes_at")
    .eq("borrower_id", userId)
    .eq("status", "active");

  if (existingErr) console.error("[scenarios] existing check error:", existingErr);

  const active = activeScenarios ?? [];

  // Auto-close any expired ones so they don't count against the cap
  const now = new Date();
  const expired = active.filter(s => s.closes_at && new Date(s.closes_at) < now);
  for (const s of expired) {
    await sb.from("scenario_briefs").update({ status: "closed" }).eq("id", s.id);
    console.log("[scenarios] auto-closed expired scenario:", s.id);
  }
  const live = active.filter(s => !s.closes_at || new Date(s.closes_at) >= now);

  // Max 3 active scenarios per borrower
  if (live.length >= 3) {
    return NextResponse.json({
      error: "You have 3 active scenarios open. Close one before posting a new one.",
      active_count: live.length,
    }, { status: 400 });
  }

  // Note: duplicate detection removed — users may legitimately post similar scenarios
  // for different properties. Cap of 3 active is the only gate.

  const { data, error } = await sb
    .from("scenario_briefs")
    .insert({
      borrower_id: userId,
      loan_type,
      loan_purpose: (loan_purpose ?? "purchase").toLowerCase(),
      price_range,
      down_payment_pct: dpPct,
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
      card_price:      card_price   ?? null,
      card_dp_pct:     card_dp_pct  ?? null,
      card_rate:       card_rate    ?? null,
      card_monthly:    card_monthly ?? null,
      card_term:       card_term    ?? null,
      posted_by_role,
    })
    .select()
    .single();

  if (error) {
    console.error("[scenarios] insert error:", error);
    return NextResponse.json({ error: "Failed to create scenario" }, { status: 500 });
  }

  // Await before returning — Vercel kills the function the moment response is sent
  await sendScenarioAlerts({
    id: data.id,
    loan_type: data.loan_type,
    state: data.state,
    price_range: data.price_range,
    credit_tier: data.credit_tier,
    timeline: data.timeline,
    visibility: data.visibility,
    referred_pro_id: data.referred_pro_id ?? null,
  });

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
      .select("id, loan_type, loan_purpose, price_range, down_payment_pct, income_range, credit_tier, timeline, state, notes, status, response_count, created_at, closes_at, response_window_hours")
      .eq("borrower_id", userId)
      .in("status", ["active", "matched"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return NextResponse.json({ error: "Failed to load scenario" }, { status: 500 });

    const scenarios = data ?? [];
    const now = new Date();

    // Synchronously auto-close any expired scenarios before returning
    const expired = scenarios.filter(s => s.closes_at && new Date(s.closes_at) < now);
    if (expired.length > 0) {
      await sb.from("scenario_briefs")
        .update({ status: "closed" })
        .in("id", expired.map(s => s.id));
      console.log("[scenarios/mine] auto-closed expired:", expired.map(s => s.id));
    }

    const live = scenarios.filter(s => !s.closes_at || new Date(s.closes_at) >= now);
    return NextResponse.json({ scenarios: live, expired_count: expired.length });
  }

  // LO or agent board (anonymized — no borrower_id exposed)
  const myResponses = url.searchParams.get("my_responses") === "1";
  const state = url.searchParams.get("state");
  const loan_type = url.searchParams.get("loan_type");
  const myReferrals = url.searchParams.get("my_referrals") === "1";

  // Derive responder_type from DB — never trust the client-supplied param
  const [loDbRow, agentDbRow, planRow] = await Promise.all([
    sb.from("loan_officers").select("user_id").eq("user_id", userId).maybeSingle(),
    sb.from("agents").select("user_id").eq("user_id", userId).maybeSingle(),
    sb.from("users").select("plan").eq("id", userId).maybeSingle(),
  ]);
  const responder_type = loDbRow.data ? "lo" : agentDbRow.data ? "agent" : null;
  if (!responder_type) {
    return NextResponse.json({ error: "Professional account required", scenarios: [] }, { status: 403 });
  }

  // Hard gate: Pro or Founding plan required to access the borrower board
  const userPlan = planRow.data?.plan ?? "free";
  if (!["pro", "founding"].includes(userPlan)) {
    return NextResponse.json({ error: "Pro plan required to access the borrower board", scenarios: [] }, { status: 403 });
  }

  // My responses history — LO's own submitted responses with joined scenario data
  if (myResponses) {
    const { data } = await sb
      .from("scenario_responses")
      .select("id, rate_estimate, approach, responder_type, status, created_at, scenario_id, scenario_briefs(id, loan_type, loan_purpose, price_range, state, status, response_count, max_responses, closes_at, created_at)")
      .eq("lo_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return NextResponse.json({ responses: data ?? [] });
  }

  // Short-circuit: LO fetching scenarios to import into Deal Room
  // Includes: (1) borrower scenarios privately referred to this LO, and
  //           (2) scenarios the LO posted themselves (borrower_id = userId)
  if (myReferrals) {
    const SCEN_SELECT = "id, loan_type, loan_purpose, price_range, down_payment_pct, income_range, credit_tier, timeline, state, notes, needs_professional, response_count, max_responses, closes_at, created_at, has_card_data, card_price, card_dp_pct, card_rate, card_monthly, card_term, visibility, referred_pro_id";

    const [{ data: refs }, { data: ownPosts }] = await Promise.all([
      // Borrower scenarios referred privately to this LO
      sb.from("scenario_briefs")
        .select(SCEN_SELECT)
        .eq("referred_pro_id", userId)
        .eq("visibility", "private")
        .eq("status", "active")
        .order("created_at", { ascending: false }),
      // Scenarios the LO posted directly (on behalf of their borrowers)
      sb.from("scenario_briefs")
        .select(SCEN_SELECT)
        .eq("borrower_id", userId)
        .eq("status", "active")
        .not("card_price", "is", null)
        .not("card_rate", "is", null)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    // Merge, deduplicate by id, referred scenarios first
    const seen = new Set<string>();
    const all = [...(refs ?? []), ...(ownPosts ?? [])].filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

    const allIds = all.map(s => s.id);
    let respondedRefIds: string[] = [];
    if (allIds.length > 0) {
      const { data: myR } = await sb.from("scenario_responses").select("scenario_id").eq("lo_id", userId).in("scenario_id", allIds);
      respondedRefIds = (myR ?? []).map(r => r.scenario_id);
    }
    return NextResponse.json({
      scenarios: all.map(s => ({ ...s, already_responded: respondedRefIds.includes(s.id) })),
    });
  }

  // Filter scenarios to ones relevant for this professional type
  const profFilter = responder_type === "agent" ? ["agent", "both"] : ["lender", "both"];

  // borrower_id included only to compute is_mine — stripped before returning
  const BOARD_SELECT = "id, loan_type, loan_purpose, price_range, down_payment_pct, income_range, credit_tier, timeline, state, notes, needs_professional, response_count, max_responses, response_window_hours, closes_at, created_at, has_card_data, card_price, card_dp_pct, card_rate, card_monthly, card_term, visibility, referred_pro_id, borrower_id";

  const sort = url.searchParams.get("sort") ?? "newest";

  // Two queries merged in JS — avoids .or() parser issues:
  // 1) Public scenarios on the board
  // 2) Private scenarios where I am the referred professional
  let publicQ = sb.from("scenario_briefs").select(BOARD_SELECT)
    .eq("status", "active").eq("visibility", "public")
    .in("needs_professional", profFilter).limit(50);
  let privateQ = sb.from("scenario_briefs").select(BOARD_SELECT)
    .eq("status", "active").eq("visibility", "private").eq("referred_pro_id", userId)
    .in("needs_professional", profFilter).limit(20);

  if (state) { publicQ = publicQ.eq("state", state); privateQ = privateQ.eq("state", state); }
  if (loan_type) { publicQ = publicQ.eq("loan_type", loan_type); privateQ = privateQ.eq("loan_type", loan_type); }

  if (sort === "closing_soon") {
    publicQ = publicQ.order("closes_at", { ascending: true, nullsFirst: false });
    privateQ = privateQ.order("closes_at", { ascending: true, nullsFirst: false });
  } else if (sort === "most_active") {
    publicQ = publicQ.order("response_count", { ascending: false });
    privateQ = privateQ.order("response_count", { ascending: false });
  } else {
    publicQ = publicQ.order("created_at", { ascending: false });
    privateQ = privateQ.order("created_at", { ascending: false });
  }

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
  // Partition: still-open vs expired (filter expired out of board display)
  const active = (data ?? []).filter(s => !s.closes_at || new Date(s.closes_at).getTime() > now);
  const expiredIds = (data ?? [])
    .filter(s => s.closes_at && new Date(s.closes_at).getTime() <= now)
    .map(s => s.id);
  // Background: auto-close expired scenarios so borrowers can re-post
  if (expiredIds.length > 0) {
    void sb.from("scenario_briefs").update({ status: "closed" }).in("id", expiredIds)
      .then(() => console.log("[scenarios] auto-closed expired:", expiredIds));
  }

  const scenarios = active.map(s => {
    // Compute is_mine then strip borrower_id — never expose it to the client
    const { borrower_id, ...rest } = s;
    const base = {
      ...rest,
      is_mine: borrower_id === userId,
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
