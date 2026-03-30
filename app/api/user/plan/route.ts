// app/api/user/plan/route.ts
// Returns the current user's plan and usage for the Settings panel.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserPlan } from "../../../../lib/subscription";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = await getUserPlan(userId);

  return NextResponse.json({
    plan: plan.plan,
    billingPeriodEnd: plan.billingPeriodEnd?.toISOString() ?? null,
    chatMessages: plan.chatMessages,
    chatLimit: plan.chatLimit,
    pdfExports: plan.pdfExports,
    borrowerSlots: plan.borrowerSlots,
    alertsEnabled: plan.alertsEnabled,
  });
}
