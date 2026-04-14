// app/api/brokerage/create/route.ts
// POST — create a new brokerage team (owner must be an LO)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Brokerage name is required" }, { status: 400 });

  // Must be an LO
  const { data: lo } = await sb
    .from("loan_officers")
    .select("id, brokerage_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!lo) return NextResponse.json({ error: "Only loan officers can create a brokerage team" }, { status: 403 });
  if (lo.brokerage_id) return NextResponse.json({ error: "You are already part of a brokerage team" }, { status: 409 });

  // Check they don't already own one
  const { data: existing } = await sb
    .from("brokerages")
    .select("id")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "You already own a brokerage team" }, { status: 409 });

  // Create brokerage
  const { data: brokerage, error: createErr } = await sb
    .from("brokerages")
    .insert({ name: name.trim(), owner_user_id: userId })
    .select("id, invite_token")
    .single();

  if (createErr || !brokerage) {
    console.error("[brokerage/create]", createErr);
    return NextResponse.json({ error: "Failed to create brokerage" }, { status: 500 });
  }

  // Add owner as member
  await sb.from("brokerage_members").insert({
    brokerage_id: brokerage.id,
    user_id: userId,
    role: "owner",
  });

  // Link LO to brokerage
  await sb.from("loan_officers").update({ brokerage_id: brokerage.id }).eq("user_id", userId);

  return NextResponse.json({ ok: true, id: brokerage.id, invite_token: brokerage.invite_token });
}
