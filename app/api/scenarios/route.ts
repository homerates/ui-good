// app/api/scenarios/route.ts
// POST  — borrower creates an anonymous scenario brief
// GET   — LO board: list active scenarios (anonymized)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../lib/supabaseServer";
import { canPostScenario } from "../../../lib/subscription";
import { Resend } from "resend";
import { emailShell } from "../../../lib/sendEmail";

// ─── Scenario alert emails ────────────────────────────────────────────────────

function scenarioAlertHtml(opts: {
  loName: string;
  loanType: string;
  state: string;
  priceRange: string;
  creditTier: string;
  timeline: string;
  boardUrl: string;
  isPrivate: boolean;
}): string {
  // All solid hex — no rgba() so Gmail/Outlook render correctly
  const tagBg    = opts.isPrivate ? "#dbeafe" : "#dcfce7";
  const tagColor = opts.isPrivate ? "#1d4ed8" : "#166534";
  const tagText  = opts.isPrivate ? "YOUR REFERRAL" : "NEW ON BOARD";

  const greeting = opts.isPrivate
    ? `A borrower you referred just posted a scenario and is waiting for your response.`
    : `A new borrower scenario matching your state just posted to the board.`;

  const row = (label: string, value: string) =>
    `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #e8ecf0">
        <span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px">${label}</span>
        <span style="font-size:15px;font-weight:600;color:#1a2530">${value}</span>
      </td>
    </tr>`;

  return emailShell(`
    <span style="display:inline-block;background:${tagBg};color:${tagColor};font-size:11px;font-weight:700;padding:4px 10px;border-radius:4px;letter-spacing:.08em">${tagText}</span>
    <div style="font-size:22px;font-weight:700;color:#080c12;margin-top:14px">Hi ${opts.loName},</div>
    <div style="font-size:14px;color:#6b7a8d;margin-top:6px;margin-bottom:24px;line-height:1.5">${greeting}</div>

    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f6f9" style="background:#f4f6f9;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px">
      <tr><td style="padding:4px 20px 0">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row("Loan type",   opts.loanType)}
          ${row("Price range", opts.priceRange)}
          ${row("Credit",      opts.creditTier)}
          ${row("State",       opts.state)}
          <tr>
            <td style="padding:10px 0">
              <span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px">Timeline</span>
              <span style="font-size:15px;font-weight:600;color:#1a2530">${opts.timeline}</span>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>

    <a href="${opts.boardUrl}" style="display:block;text-align:center;background:#00e87a;color:#07100f;font-size:15px;font-weight:700;padding:15px 20px;border-radius:999px;text-decoration:none">
      View &amp; Respond on Board →
    </a>
  `, "HomeRates.ai · Borrower identities are kept anonymous until contact is shared.");
}

async function sendScenarioAlerts(scenario: {
  id: string;
  loan_type: string;
  state: string;
  price_range: string;
  credit_tier: string;
  timeline: string;
  visibility: string;
  referred_pro_id: string | null;
}): Promise<void> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) { console.error("[scenario-alert] RESEND_API_KEY not set"); return; }

  const sb = getSupabase();
  if (!sb) { console.error("[scenario-alert] DB unavailable"); return; }

  console.log("[scenario-alert] starting for scenario", scenario.id, "visibility:", scenario.visibility, "state:", scenario.state, "referred_pro_id:", scenario.referred_pro_id);

  const boardUrl = `https://chat.homerates.ai/lo/scenarios`;

  interface LoRow { user_id: string; email: string | null; lender: string | null; }
  let targets: LoRow[] = [];

  // Helper: resolve email for a user_id — DB first, Clerk fallback
  async function resolveEmail(userId: string): Promise<string | null> {
    const { data } = await sb!.from("users").select("email").eq("id", userId).maybeSingle();
    if (data?.email) return data.email;
    try {
      const clerk = await clerkClient();
      const u = await clerk.users.getUser(userId);
      return u.emailAddresses[0]?.emailAddress ?? null;
    } catch { return null; }
  }

  if (scenario.visibility === "private" && scenario.referred_pro_id) {
    const [{ data: loRow }, email] = await Promise.all([
      sb.from("loan_officers").select("user_id, lender").eq("user_id", scenario.referred_pro_id).maybeSingle(),
      resolveEmail(scenario.referred_pro_id),
    ]);
    console.log("[scenario-alert] private — loRow:", loRow, "email:", email);
    if (loRow && email) {
      targets = [{ user_id: loRow.user_id, email, lender: loRow.lender }];
    }
  } else {
    // Public: alert all registered LOs
    const { data: loRows, error: loErr } = await sb
      .from("loan_officers")
      .select("user_id, lender")
      .limit(50);

    console.log("[scenario-alert] public — loRows count:", loRows?.length, "loErr:", loErr);

    if (loRows && loRows.length > 0) {
      const ids = loRows.map(r => r.user_id);

      // DB emails first
      const { data: userRows } = await sb.from("users").select("id, email").in("id", ids);
      const emailMap: Record<string, string> = {};
      for (const u of userRows ?? []) { if (u.email) emailMap[u.id] = u.email; }

      // Clerk fallback for any IDs still missing
      const missing = ids.filter(id => !emailMap[id]);
      if (missing.length > 0) {
        try {
          const clerk = await clerkClient();
          const clerkUsers = await clerk.users.getUserList({ userId: missing, limit: 100 });
          for (const u of clerkUsers.data) {
            const e = u.emailAddresses[0]?.emailAddress;
            if (e) emailMap[u.id] = e;
          }
        } catch (e) { console.error("[scenario-alert] Clerk fallback failed:", e); }
      }

      targets = loRows
        .filter(lo => emailMap[lo.user_id])
        .map(lo => ({ user_id: lo.user_id, email: emailMap[lo.user_id], lender: lo.lender }));

      console.log("[scenario-alert] final targets:", targets.map(t => t.email));
    }
  }

  // Fire emails via Resend SDK (same path as all other transactional emails)
  const resend = new Resend(RESEND_API_KEY);
  const FROM = process.env.RESEND_FROM_EMAIL ?? "digest@homerates.ai";

  const sends = targets
    .filter(lo => lo.email)
    .map(async lo => {
      const loName = lo.lender ?? "there";
      const html = scenarioAlertHtml({
        loName,
        loanType: scenario.loan_type,
        state: scenario.state,
        priceRange: scenario.price_range,
        creditTier: scenario.credit_tier,
        timeline: scenario.timeline,
        boardUrl,
        isPrivate: scenario.visibility === "private",
      });
      const subject = scenario.visibility === "private"
        ? `Your referral posted a scenario — respond now`
        : `New ${scenario.loan_type} scenario in ${scenario.state}`;

      try {
        const result = await resend.emails.send({
          from: `HomeRates.ai <${FROM}>`,
          to: lo.email!,
          subject,
          html,
        });
        console.log("[scenario-alert] sent to:", lo.email, "id:", result.data?.id, "error:", result.error);
      } catch (e) {
        console.error("[scenario-alert] SDK send failed to:", lo.email, e);
      }
    });

  await Promise.allSettled(sends);
}

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

  // Duplicate detection: same loan_type + loan_purpose + state already active
  const duplicate = live.find(
    s => s.loan_type === loan_type && s.loan_purpose === (loan_purpose ?? "purchase").toLowerCase() && s.state === state
  );
  if (duplicate) {
    return NextResponse.json({
      error: "You already have an active scenario with the same loan type, purpose, and state. Close or update that one instead.",
      existing_id: duplicate.id,
    }, { status: 400 });
  }

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
      .select("id, loan_type, loan_purpose, price_range, down_payment_pct, income_range, credit_tier, timeline, state, notes, status, response_count, created_at")
      .eq("borrower_id", userId)
      .in("status", ["active", "matched"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return NextResponse.json({ error: "Failed to load scenario" }, { status: 500 });
    return NextResponse.json({ scenarios: data ?? [] });
  }

  // LO or agent board (anonymized — no borrower_id exposed)
  const myResponses = url.searchParams.get("my_responses") === "1";
  const state = url.searchParams.get("state");
  const loan_type = url.searchParams.get("loan_type");
  const myReferrals = url.searchParams.get("my_referrals") === "1";

  // Derive responder_type from DB — never trust the client-supplied param
  const [loDbRow, agentDbRow] = await Promise.all([
    sb.from("loan_officers").select("user_id").eq("user_id", userId).maybeSingle(),
    sb.from("agents").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  const responder_type = loDbRow.data ? "lo" : agentDbRow.data ? "agent" : null;
  if (!responder_type) {
    return NextResponse.json({ error: "Professional account required", scenarios: [] }, { status: 403 });
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
