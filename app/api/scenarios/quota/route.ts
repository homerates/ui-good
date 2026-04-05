// app/api/scenarios/quota/route.ts
// Returns the current user's scenario post quota for the current month.
// Used by /connect/post to show usage badge and gate before the form.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { canPostScenario } from "../../../../lib/subscription";
import { getUserPlan } from "../../../../lib/subscription";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [quota, plan] = await Promise.all([
    canPostScenario(userId),
    getUserPlan(userId),
  ]);

  return NextResponse.json({
    allowed: quota.allowed,
    used: quota.used,
    limit: quota.limit,   // null = unlimited
    plan: plan.plan,
  });
}
