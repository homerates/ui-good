// app/api/admin/scenarios/route.ts
// Admin scenario management — list, archive, delete

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdminId } from "../../../../lib/adminAuth";
import { getSupabase } from "../../../../lib/supabaseServer";

export async function GET() {
  const { userId } = await auth();
  if (!await isAdminId(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { data, error } = await sb
    .from("scenario_briefs")
    .select("id, loan_type, loan_purpose, price_range, state, status, visibility, response_count, max_responses, closes_at, created_at, needs_professional")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: "DB error" }, { status: 500 });
  return NextResponse.json({ scenarios: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!await isAdminId(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { id, status } = await req.json();
  if (!id || !status) return NextResponse.json({ error: "id and status required" }, { status: 400 });

  await sb.from("scenario_briefs").update({ status }).eq("id", id);
  console.log(`[admin/scenarios] admin=${userId} set scenario=${id} status=${status}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!await isAdminId(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Delete responses first, then the scenario
  await sb.from("scenario_responses").delete().eq("scenario_id", id);
  await sb.from("scenario_briefs").delete().eq("id", id);
  console.log(`[admin/scenarios] admin=${userId} deleted scenario=${id}`);
  return NextResponse.json({ ok: true });
}
