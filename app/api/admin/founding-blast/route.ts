// app/api/admin/founding-blast/route.ts
// POST — admin-triggered urgency email to all founding members
// Sends once manually; designed to be called when pros count hits ~450

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/adminAuth";
import { getSupabase } from "../../../../lib/supabaseServer";
import { clerkClient } from "@clerk/nextjs/server";
import { emailFoundingUrgency } from "../../../../lib/sendEmail";

const FOUNDING_CAP = 500;

export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Count total founding pros
  const [{ count: loCount }, { count: agentCount }] = await Promise.all([
    sb.from("loan_officers").select("user_id", { count: "exact", head: true }),
    sb.from("agents").select("user_id", { count: "exact", head: true }),
  ]);
  const claimed   = (loCount ?? 0) + (agentCount ?? 0);
  const remaining = Math.max(FOUNDING_CAP - claimed, 0);

  // Fetch all founding LOs
  const { data: loRows } = await sb
    .from("loan_officers")
    .select("user_id")
    .eq("is_founding_member", true);

  // Fetch all founding agents
  const { data: agentRows } = await sb
    .from("agents")
    .select("user_id")
    .eq("is_founding_member", true);

  const userIds = [
    ...(loRows ?? []).map(r => r.user_id),
    ...(agentRows ?? []).map(r => r.user_id),
  ];

  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "No founding members found" });
  }

  // Resolve emails from Clerk in batches of 10
  const clerk = await clerkClient();
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < userIds.length; i += 10) {
    const batch = userIds.slice(i, i + 10);
    await Promise.all(batch.map(async (uid) => {
      try {
        const u = await clerk.users.getUser(uid);
        const email     = u.emailAddresses[0]?.emailAddress;
        const firstName = u.firstName ?? null;
        if (!email) return;
        await emailFoundingUrgency({ toEmail: email, firstName, claimed, remaining });
        sent++;
      } catch {
        failed++;
      }
    }));
  }

  return NextResponse.json({ ok: true, sent, failed, claimed, remaining, total: userIds.length });
}
