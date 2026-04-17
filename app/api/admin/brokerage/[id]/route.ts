// app/api/admin/brokerage/[id]/route.ts
// GET — admin-only: fetch any brokerage by ID with full enriched member data

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../../lib/supabaseServer";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

async function isAdmin(userId: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data } = await sb
    .from("admin_users")
    .select("clerk_user_id")
    .eq("clerk_user_id", userId)
    .maybeSingle();
  return !!data;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: brokerageId } = await params;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { data: brokerage } = await sb
    .from("brokerages")
    .select("id, name, org_type, website, invite_token, created_at, owner_user_id")
    .eq("id", brokerageId)
    .maybeSingle();

  if (!brokerage) return NextResponse.json({ error: "Brokerage not found" }, { status: 404 });

  const { data: members } = await sb
    .from("brokerage_members")
    .select("user_id, role, joined_at")
    .eq("brokerage_id", brokerageId)
    .order("joined_at", { ascending: true });

  const memberIds = (members ?? []).map(m => m.user_id);

  const [clerkResult, usersResult, loResult, usageResult, scenariosResult] = await Promise.allSettled([
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
    sb.from("users").select("id, plan").in("id", memberIds),
    sb.from("loan_officers").select("id, user_id").in("user_id", memberIds),
    sb.from("usage_monthly").select("user_id, chat_messages").in("user_id", memberIds).eq("month", currentMonth()),
    sb.from("scenario_briefs").select("user_id").in("user_id", memberIds).gte("created_at", `${currentMonth()}-01`),
  ]);

  const clerkMap: Record<string, { name: string; email: string | null }> = {};
  if (clerkResult.status === "fulfilled") {
    for (const c of clerkResult.value) clerkMap[c.user_id] = { name: c.name, email: c.email };
  }

  const planMap: Record<string, string> = {};
  if (usersResult.status === "fulfilled" && usersResult.value.data) {
    for (const u of usersResult.value.data) planMap[u.id] = u.plan ?? "free";
  }

  const loMap: Record<string, string> = {};
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
    invite_link: `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://chat.homerates.ai"}/join/${brokerage.invite_token}`,
    created_at: brokerage.created_at,
    owner_user_id: brokerage.owner_user_id,
    members: enriched,
  });
}
