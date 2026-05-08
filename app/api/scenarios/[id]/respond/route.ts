// app/api/scenarios/[id]/respond/route.ts
// POST — LO submits a response to an anonymous scenario

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../../lib/supabaseServer";
import { emailScenarioResponse } from "../../../../../lib/sendEmail";
import { getQuestions, type LoanTypeKey, type ScenarioSnapshot } from "../../../../../lib/discoverQuestions";

function buildDiscoverSnapshot(s: {
  loan_type: string;
  card_price: number | null;
  card_dp_pct: number | null;
  card_rate: number | null;
  card_monthly: number | null;
  card_term: number | null;
}): ScenarioSnapshot | null {
  if (!s.card_price || !s.card_rate) return null;
  const term = s.card_term ?? 30;
  const downPct = s.card_dp_pct ?? 0;
  const price = s.card_price;
  const down = price * downPct / 100;
  const baseLoan = price - down;
  const loanAmount = s.loan_type === 'fha' ? baseLoan * 1.0175 : baseLoan;
  const ltv = baseLoan / price;
  const rate = s.card_rate;
  const r = rate / 100 / 12;
  const n = term * 12;
  const pi = r > 0 ? (loanAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : loanAmount / n;
  const monthlyMIP = s.loan_type === 'fha' && ltv > 0.90 ? loanAmount * 0.0055 / 12
    : s.loan_type === 'fha' ? loanAmount * 0.0050 / 12 : undefined;
  const monthlyPMI = s.loan_type === 'conventional' && ltv > 0.80 ? loanAmount * 0.005 / 12 : undefined;
  return {
    price, loanAmount, downPct, rate, term, ltv,
    monthlyPayment: s.card_monthly ?? (pi + (monthlyMIP ?? 0) + (monthlyPMI ?? 0)),
    monthlyMIP, monthlyPMI,
  };
}

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
    .select("id, borrower_id, status, response_count, max_responses, closes_at, visibility, referred_pro_id, loan_type, has_card_data, card_price, card_dp_pct, card_rate, card_monthly, card_term")
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

  // Auto-create (or find existing) conversation thread + insert LO's approach as first message
  let threadId: string | null = null;
  try {
    const { data: existingThread } = await sb
      .from("conversation_threads")
      .select("id, unread_borrower")
      .eq("borrower_id", scenarioFull.borrower_id)
      .eq("professional_id", userId)
      .maybeSingle();

    if (existingThread) {
      threadId = existingThread.id;
      // Always keep scenario_id current so the Discover dock loads the right card data
      await sb.from("conversation_threads")
        .update({ scenario_id: id })
        .eq("id", existingThread.id);
    } else {
      const { data: newThread } = await sb
        .from("conversation_threads")
        .insert({
          borrower_id: scenarioFull.borrower_id,
          professional_id: userId,
          professional_type: resolvedResponderType,
          scenario_id: id,
          status: "open",
        })
        .select("id")
        .single();
      if (newThread) threadId = newThread.id;
    }

    if (threadId) {
      // Inject discover Q+A pairs first (borrower questions + AI benchmarks)
      // — only when scenario has card data and thread has no discover messages yet
      if (scenarioFull.card_price && scenarioFull.card_rate) {
        const { data: existingDiscover } = await sb
          .from("messages")
          .select("id")
          .eq("thread_id", threadId)
          .eq("metadata->>type", "discover_question")
          .limit(1)
          .maybeSingle();

        if (!existingDiscover) {
          const snap = buildDiscoverSnapshot(scenarioFull);
          if (snap) {
            const loanType = (scenarioFull.loan_type || "conventional") as LoanTypeKey;
            const questions = getQuestions(loanType);
            for (const q of questions) {
              await sb.from("messages").insert({
                thread_id: threadId,
                sender_role: "borrower",
                content: q.prompt(snap),
                metadata: { type: "discover_question", question_id: q.id, title: q.title, icon: q.icon, ai_value: q.aiValue(snap), ai_sub: q.aiSub(snap) },
              });
              await sb.from("messages").insert({
                thread_id: threadId,
                sender_role: "system",
                content: q.aiValue(snap),
                metadata: { type: "ai_benchmark", question_id: q.id, ai_value: q.aiValue(snap), ai_sub: q.aiSub(snap), title: q.title },
              });
            }
          }
        }
      }

      // Insert LO's approach as the professional's first message
      const { data: msg } = await sb
        .from("messages")
        .insert({ thread_id: threadId, sender_role: "professional", content: approach.trim() })
        .select("created_at")
        .single();

      const prevUnread = existingThread?.unread_borrower ?? 0;
      await sb
        .from("conversation_threads")
        .update({
          last_message_at: msg?.created_at ?? new Date().toISOString(),
          unread_borrower: prevUnread + 1,
        })
        .eq("id", threadId);
    }
  } catch (e) {
    console.error("[scenarios/respond] thread/message creation failed:", e);
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

  return NextResponse.json({ response, thread_id: threadId });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { data: response } = await sb
    .from("scenario_responses")
    .select("id")
    .eq("scenario_id", id)
    .eq("lo_id", userId)
    .maybeSingle();

  if (!response) return NextResponse.json({ error: "Response not found" }, { status: 404 });

  const { data: scenario } = await sb
    .from("scenario_briefs")
    .select("id, status, response_count")
    .eq("id", id)
    .single();

  if (!scenario) return NextResponse.json({ error: "Scenario not found" }, { status: 404 });

  await sb.from("scenario_responses").delete().eq("id", response.id);

  const newCount = Math.max(0, (scenario.response_count ?? 1) - 1);
  await sb.from("scenario_briefs").update({
    response_count: newCount,
    ...(scenario.status === "matched" ? { status: "active" } : {}),
  }).eq("id", id);

  console.log(`[scenarios/respond] user=${userId} withdrew response from scenario=${id}`);
  return NextResponse.json({ ok: true });
}
