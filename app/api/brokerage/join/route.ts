// app/api/brokerage/join/route.ts
// POST — join a brokerage via invite token

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

  const { token } = await req.json();
  if (!token?.trim()) return NextResponse.json({ error: "Invite token is required" }, { status: 400 });

  // Must be an LO
  const { data: lo } = await sb
    .from("loan_officers")
    .select("id, brokerage_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!lo) return NextResponse.json({ error: "Only loan officers can join a brokerage team" }, { status: 403 });
  if (lo.brokerage_id) return NextResponse.json({ error: "You are already part of a brokerage team" }, { status: 409 });

  // Look up brokerage by token
  const { data: brokerage } = await sb
    .from("brokerages")
    .select("id, name, owner_user_id")
    .eq("invite_token", token.trim())
    .maybeSingle();

  if (!brokerage) return NextResponse.json({ error: "Invalid or expired invite link" }, { status: 404 });
  if (brokerage.owner_user_id === userId) return NextResponse.json({ error: "You own this brokerage" }, { status: 409 });

  // Add as member
  const { error: memberErr } = await sb.from("brokerage_members").insert({
    brokerage_id: brokerage.id,
    user_id: userId,
    role: "member",
  });

  if (memberErr) {
    // Duplicate = already a member
    if (memberErr.code === "23505") return NextResponse.json({ error: "Already a member" }, { status: 409 });
    console.error("[brokerage/join]", memberErr);
    return NextResponse.json({ error: "Failed to join brokerage" }, { status: 500 });
  }

  // Link LO
  await sb.from("loan_officers").update({ brokerage_id: brokerage.id }).eq("user_id", userId);

  return NextResponse.json({ ok: true, name: brokerage.name, id: brokerage.id });
}
