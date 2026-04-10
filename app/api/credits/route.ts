// app/api/credits/route.ts
// GET — current user's credit balance, earned this month, recent history

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getBalance, getHistory } from "../../../lib/credits";
import { getSupabase } from "../../../lib/supabaseServer";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();

  // Earned this month (positive transactions only)
  let earnedThisMonth = 0;
  if (sb) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const { data } = await sb
      .from("credit_transactions")
      .select("amount")
      .eq("user_id", userId)
      .gte("created_at", startOfMonth.toISOString())
      .gt("amount", 0);
    earnedThisMonth = (data ?? []).reduce((s, r) => s + r.amount, 0);
  }

  const [balance, recent] = await Promise.all([
    getBalance(userId),
    getHistory(userId, 5),
  ]);

  return NextResponse.json({ balance, earned_this_month: earnedThisMonth, recent });
}
