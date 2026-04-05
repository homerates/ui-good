// app/api/user/plan/route.ts
// Returns the current user's plan and usage for the Settings panel.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserPlan } from "../../../../lib/subscription";
import { getSupabase } from "../../../../lib/supabaseServer";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();

  const [plan, loResult] = await Promise.all([
    getUserPlan(userId),
    sb
      ? sb.from("loan_officers").select("id").eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return NextResponse.json({
    plan: plan.plan,
    billingPeriodEnd: plan.billingPeriodEnd?.toISOString() ?? null,
    chatMessages: plan.chatMessages,
    chatLimit: plan.chatLimit,
    pdfExports: plan.pdfExports,
    borrowerSlots: plan.borrowerSlots,
    alertsEnabled: plan.alertsEnabled,
    isLO: !!((loResult as any).data),
  });
}
