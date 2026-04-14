// app/api/admin/founding-stats/route.ts
// GET — live count of founding members for admin dashboard

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/adminAuth";
import { getSupabase } from "../../../../lib/supabaseServer";

const FOUNDING_CAP = 500;

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const [{ count: loCount }, { count: agentCount }] = await Promise.all([
    sb.from("loan_officers").select("user_id", { count: "exact", head: true }),
    sb.from("agents").select("user_id", { count: "exact", head: true }),
  ]);

  const claimed   = (loCount ?? 0) + (agentCount ?? 0);
  const remaining = Math.max(FOUNDING_CAP - claimed, 0);

  return NextResponse.json({ claimed, remaining });
}
