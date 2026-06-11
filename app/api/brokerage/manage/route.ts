// app/api/brokerage/manage/route.ts
// GET    — return brokerage details + enriched member list (owner only)
// POST   — reset invite token (owner only)
// DELETE — remove a member { user_id } (owner only, cannot remove self)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";
import { randomBytes } from "crypto";

function currentMonth() {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { data: brokerage } = await sb
    .from("brokerages")
    .select("id, name, org_type, website, invite_token, created_at")
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (!brokerage) return NextResponse.json({ error: "No brokerage found for this user" }, { status: 404 });

  const { data: members } = await sb
    .from("brokerage_members")
    .select("user_id, role, joined_at")
    .eq("brokerage_id", brokerage.id)
    .order("joined_at", { ascending: true });

  const memberIds = (members ?? []).map(m => m.user_id);

  // ── Parallel data fetch ───────────────────────────────────────────────────
  const [clerkResult, usersResult, loResult, usageResult, scenariosResult] = await Promise.allSettled([
    // Clerk: names + emails
    (async () => {
      const clerk = await clerkClient();
      return Promise.all(
        memberIds.map(async id => {
          try {
            const cu = await clerk.users.getUser(id);
            return {
              user_id: id,
              name: [cu.firstName, cu.lastName].filter(Boolean).join(" ") || cu.emailAddresses[0]?.emailAddress || id,
              email: cu.emailAddresses[0]?.emailAddress ?? null,
            };
          } catch {
            return { user_id: id, name: id, email: null };
          }
        })
      );
    })(),

    // users.plan for each member
    sb.from("users")
      .select("id, plan")
      .in("id", memberIds),

    // loan_officers — to count borrowers
    sb.from("loan_officers")
      .select("id, user_id")
      .in("user_id", memberIds),

    // usage_monthly — chat messages this month
    sb.from("usage_monthly")
      .select("user_id, chat_messages")
      .in("user_id", memberIds)
      .eq("month", currentMonth()),

    // scenario_briefs — count posted this month
    sb.from("scenario_briefs")
      .select("user_id")
      .in("user_id", memberIds)
      .gte("created_at", `${currentMonth()}-01`),
  ]);

  const clerkMap: Record<string, { name: string; email: string | null }> = {};
  if (clerkResult.status === "fulfilled") {
    for (const c of clerkResult.value) clerkMap[c.user_id] = { name: c.name, email: c.email };
  }

  const planMap: Record<string, string> = {};
  if (usersResult.status === "fulfilled" && usersResult.value.data) {
    for (const u of usersResult.value.data) planMap[u.id] = u.plan ?? "free";
  }

  const loMap: Record<string, string> = {}; // user_id → lo.id
  if (loResult.status === "fulfilled" && loResult.value.data) {
    for (const lo of loResult.value.data) loMap[lo.user_id] = lo.id;
  }

  const usageMap: Record<string, number> = {};
  if (usageResult.status === "fulfilled" && usageResult.value.data) {
    for (const u of usageResult.value.data) usageMap[u.user_id] = u.chat_messages ?? 0;
  }

  const scenariosMap: Record<string, number> = {};
  if (scenariosResult.status === "fulfilled" && scenariosResult.value.data) {
    for (const s of scenariosResult.value.data) {
      scenariosMap[s.user_id] = (scenariosMap[s.user_id] ?? 0) + 1;
    }
  }

  // Count borrowers per LO (batch)
  const loIds = Object.values(loMap);
  let borrowerCounts: Record<string, number> = {};
  if (loIds.length > 0) {
    const { data: borrowerRows } = await sb
      .from("borrowers")
      .select("loan_officer_id")
      .in("loan_officer_id", loIds);
    if (borrowerRows) {
      for (const b of borrowerRows) {
        borrowerCounts[b.loan_officer_id] = (borrowerCounts[b.loan_officer_id] ?? 0) + 1;
      }
    }
  }

  // Assemble enriched member list
  const enriched = (members ?? []).map(m => {
    const loId = loMap[m.user_id];
    return {
      user_id: m.user_id,
      role: m.role,
      joined_at: m.joined_at,
      name: clerkMap[m.user_id]?.name ?? m.user_id,
      email: clerkMap[m.user_id]?.email ?? null,
      plan: planMap[m.user_id] ?? "free",
      borrowers: loId ? (borrowerCounts[loId] ?? 0) : 0,
      chat_messages_mo: usageMap[m.user_id] ?? 0,
      scenarios_mo: scenariosMap[m.user_id] ?? 0,
    };
  });

  return NextResponse.json({
    id: brokerage.id,
    name: brokerage.name,
    org_type: brokerage.org_type ?? "brokerage",
    website: brokerage.website ?? null,
    invite_token: brokerage.invite_token,
    invite_link: `${process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai"}/join/${brokerage.invite_token}`,
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

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const targetUserId: string = body.user_id ?? "";
  if (!targetUserId) return NextResponse.json({ error: "user_id required" }, { status: 400 });
  if (targetUserId === userId) return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });

  // Verify requester owns this brokerage
  const { data: brokerage } = await sb
    .from("brokerages")
    .select("id")
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (!brokerage) return NextResponse.json({ error: "No brokerage found" }, { status: 404 });

  // Remove from members
  const { error: delErr } = await sb
    .from("brokerage_members")
    .delete()
    .eq("brokerage_id", brokerage.id)
    .eq("user_id", targetUserId);

  if (delErr) {
    console.error("[brokerage/manage DELETE]", delErr);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }

  // Clear brokerage_id from loan_officers
  await sb
    .from("loan_officers")
    .update({ brokerage_id: null })
    .eq("user_id", targetUserId)
    .eq("brokerage_id", brokerage.id);

  return NextResponse.json({ ok: true });
}
