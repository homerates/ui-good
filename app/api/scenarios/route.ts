// app/api/scenarios/route.ts
// POST  — borrower creates an anonymous scenario brief
// GET   — LO board: list active scenarios (anonymized)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../lib/supabaseServer";
import { canPostScenario } from "../../../lib/subscription";

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
  const tagBg    = opts.isPrivate ? "#0d1e30" : "#0d2218";
  const tagColor = opts.isPrivate ? "#3d8bff" : "#00e87a";
  const tagText  = opts.isPrivate ? "YOUR REFERRAL" : "NEW ON BOARD";

  const greeting = opts.isPrivate
    ? `A borrower you referred just posted a scenario and is waiting for your response.`
    : `A new borrower scenario matching your state just posted to the board.`;

  const row = (label: string, value: string) =>
    `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #1a2e20">
        <span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#4a6e58;margin-bottom:3px">${label}</span>
        <span style="font-size:15px;font-weight:600;color:#e8f5ee">${value}</span>
      </td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>New Scenario Alert — HomeRates.ai</title>
</head>
<body style="margin:0;padding:0;background:#07100f;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">

<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#07100f" style="background:#07100f;padding:32px 16px">
<tr><td align="center">
<table width="100%" style="max-width:520px" cellpadding="0" cellspacing="0">

  <!-- Logo -->
  <tr>
    <td style="padding:0 0 28px">
      <img src="https://chat.homerates.ai/assets/HomeRates-Logo%20Green.png"
           alt="HomeRates.ai" height="28" style="display:block"/>
    </td>
  </tr>

  <!-- Tag + greeting -->
  <tr>
    <td style="padding:0 0 24px">
      <span style="display:inline-block;background:${tagBg};color:${tagColor};font-size:11px;font-weight:700;padding:4px 10px;border-radius:4px;letter-spacing:.08em">${tagText}</span>
      <div style="font-size:22px;font-weight:700;color:#e8f5ee;margin-top:14px">Hi ${opts.loName},</div>
      <div style="font-size:14px;color:#7a9e8a;margin-top:6px;line-height:1.5">${greeting}</div>
    </td>
  </tr>

  <!-- Scenario details card -->
  <tr>
    <td style="padding:0 0 24px">
      <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d1a12" style="background:#0d1a12;border:1px solid #1a2e20;border-radius:12px">
        <tr><td style="padding:4px 20px 0">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${row("Loan type",   opts.loanType)}
            ${row("Price range", opts.priceRange)}
            ${row("Credit",      opts.creditTier)}
            ${row("State",       opts.state)}
            <tr>
              <td style="padding:10px 0">
                <span style="display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#4a6e58;margin-bottom:3px">Timeline</span>
                <span style="font-size:15px;font-weight:600;color:#e8f5ee">${opts.timeline}</span>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td>
  </tr>

  <!-- CTA button -->
  <tr>
    <td style="padding:0 0 28px">
      <a href="${opts.boardUrl}"
         style="display:block;text-align:center;background:#00e87a;color:#07100f;font-size:15px;font-weight:700;padding:15px 20px;border-radius:10px;text-decoration:none">
        View &amp; Respond on Board →
      </a>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="border-top:1px solid #1a2e20;padding:20px 0 0">
      <div style="font-size:12px;color:#3a5a48;line-height:1.7">
        Sent by <strong style="color:#4a6e58">HomeRates.ai</strong> — Borrower identities are kept
        anonymous until contact is shared in a conversation thread.
      </div>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
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
  if (!RESEND_API_KEY) return;

  const sb = getSupabase();
  if (!sb) return;

  const boardUrl = `https://chat.homerates.ai/lo/scenarios`;

  interface LoRow { user_id: string; email: string | null; lender: string | null; }
  let targets: LoRow[] = [];

  if (scenario.visibility === "private" && scenario.referred_pro_id) {
    const { data } = await sb
      .from("loan_officers")
      .select("user_id, email, lender")
      .eq("user_id", scenario.referred_pro_id)
      .maybeSingle();
    if (data) targets = [data];
  } else {
    const { data } = await sb
      .from("loan_officers")
      .select("user_id, email, lender")
      .eq("license_state", scenario.state)
      .not("email", "is", null)
      .limit(20);
    targets = data ?? [];
  }

  // Fire emails concurrently (no await on individual — fire-and-forget)
  const sends = targets
    .filter(lo => lo.email)
    .map(lo => {
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

      return fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "HomeRates.ai <digest@homerates.ai>",
          to: [lo.email!],
          subject: scenario.visibility === "private"
            ? `Your referral posted a scenario — respond now`
            : `New ${scenario.loan_type} scenario in ${scenario.state}`,
          html,
        }),
      }).catch(e => console.error("[scenario-alert] email failed:", e));
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
  const { data: existing, error: existingErr } = await sb
    .from("scenario_briefs")
    .select("id")
    .eq("borrower_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (existingErr) console.error("[scenarios] existing check error:", existingErr);
  if (existing) {
    return NextResponse.json({ error: "You already have an active scenario. Close it before posting a new one.", existing_id: existing.id }, { status: 400 });
  }

  const { data, error } = await sb
    .from("scenario_briefs")
    .insert({
      borrower_id: userId,
      loan_type,
      loan_purpose: (loan_purpose ?? "purchase").toLowerCase(),
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

  // Fire-and-forget: notify matching LOs
  sendScenarioAlerts({
    id: data.id,
    loan_type: data.loan_type,
    state: data.state,
    price_range: data.price_range,
    credit_tier: data.credit_tier,
    timeline: data.timeline,
    visibility: data.visibility,
    referred_pro_id: data.referred_pro_id ?? null,
  }).catch(e => console.error("[scenario-alert] send failed:", e));

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
