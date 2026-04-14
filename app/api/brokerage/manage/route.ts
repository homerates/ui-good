// app/api/brokerage/manage/route.ts
// GET  — return brokerage details + member list (owner only)
// POST — reset invite token (owner only)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";
import { randomBytes } from "crypto";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { data: brokerage } = await sb
    .from("brokerages")
    .select("id, name, invite_token, created_at")
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (!brokerage) return NextResponse.json({ error: "No brokerage found for this user" }, { status: 404 });

  const { data: members } = await sb
    .from("brokerage_members")
    .select("user_id, role, joined_at")
    .eq("brokerage_id", brokerage.id)
    .order("joined_at", { ascending: true });

  // Enrich member names from Clerk
  const clerk = await clerkClient();
  const enriched = await Promise.all(
    (members ?? []).map(async m => {
      try {
        const cu = await clerk.users.getUser(m.user_id);
        return {
          ...m,
          name: [cu.firstName, cu.lastName].filter(Boolean).join(" ") || cu.emailAddresses[0]?.emailAddress || m.user_id,
          email: cu.emailAddresses[0]?.emailAddress ?? null,
        };
      } catch {
        return { ...m, name: m.user_id, email: null };
      }
    })
  );

  return NextResponse.json({
    id: brokerage.id,
    name: brokerage.name,
    invite_token: brokerage.invite_token,
    invite_link: `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://chat.homerates.ai"}/join/${brokerage.invite_token}`,
    created_at: brokerage.created_at,
    members: enriched,
  });
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const newToken = randomBytes(16).toString("hex");

  const { data } = await sb
    .from("brokerages")
    .update({ invite_token: newToken })
    .eq("owner_user_id", userId)
    .select("id")
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "No brokerage found" }, { status: 404 });

  return NextResponse.json({ ok: true, invite_token: newToken });
}
