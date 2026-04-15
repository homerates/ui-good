// app/api/credits/redeem/route.ts
// POST — redeem credits for a product benefit
// Currently supports: type="scenario_slot" — 50 credits → 1 extra scenario post this month

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getBalance, spendCredits } from "../../../../lib/credits";
import { getSupabase } from "../../../../lib/supabaseServer";
import { getUserPlan } from "../../../../lib/subscription";

const SLOT_COST = 50;
const MAX_BONUS_SLOTS_PER_MONTH = 3; // cap to prevent abuse

function currentMonth() {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { type } = body;

  if (type !== "scenario_slot") {
    return NextResponse.json({ error: "Invalid redemption type" }, { status: 400 });
  }

  // Credits redemption requires an active paid subscription
  const userPlan = await getUserPlan(userId);
  if (userPlan.plan === "free") {
    return NextResponse.json(
      { error: "An active subscription is required to redeem credits. Credits are earned as a participation bonus and unlocked with any paid plan." },
      { status: 402 }
    );
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Check balance
  const balance = await getBalance(userId);
  if (balance < SLOT_COST) {
    return NextResponse.json(
      { error: `Not enough credits — need ${SLOT_COST}, you have ${balance}` },
      { status: 402 }
    );
  }

  // Check how many bonus slots already purchased this month
  const monthStart = `${currentMonth()}-01`;
  const { count: slotsThisMonth } = await sb
    .from("credit_transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", "scenario_slot_purchase")
    .gte("created_at", monthStart);

  if ((slotsThisMonth ?? 0) >= MAX_BONUS_SLOTS_PER_MONTH) {
    return NextResponse.json(
      { error: `Maximum ${MAX_BONUS_SLOTS_PER_MONTH} bonus slots per month reached` },
      { status: 409 }
    );
  }

  // Deduct credits
  const ok = await spendCredits(
    userId,
    SLOT_COST,
    "scenario_slot_purchase",
    "Extra scenario post slot"
  );

  if (!ok) {
    return NextResponse.json({ error: "Failed to deduct credits" }, { status: 500 });
  }

  const newBalance = balance - SLOT_COST;
  return NextResponse.json({ ok: true, balance: newBalance, slots_remaining: MAX_BONUS_SLOTS_PER_MONTH - (slotsThisMonth ?? 0) - 1 });
}
