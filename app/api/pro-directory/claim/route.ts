// app/api/pro-directory/claim/route.ts
// POST — claim a pro_directory record for the signed-in user
//
// On claim:
// 1. Links pro_directory.claimed_by → Clerk user_id
// 2. Upserts a loan_officers or agents row so the user can use
//    the full LO/agent portal immediately after claiming

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const { id } = body ?? {};
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // 1. Fetch the directory record
  const { data: pro, error: fetchErr } = await sb
    .from("pro_directory")
    .select("id, source, source_id, pro_type, name, company_name, license_type, claimed_by")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!pro)     return NextResponse.json({ error: "Not found" }, { status: 404 });

  // 2. Guard: already claimed by someone else
  if (pro.claimed_by && pro.claimed_by !== userId) {
    return NextResponse.json({ error: "This listing has already been claimed." }, { status: 409 });
  }

  // 3. Guard: user already claimed something else
  const { data: existingClaim } = await sb
    .from("pro_directory")
    .select("id")
    .eq("claimed_by", userId)
    .not("id", "eq", id)
    .maybeSingle();

  if (existingClaim) {
    return NextResponse.json(
      { error: "You have already claimed a listing. Contact support to change it." },
      { status: 409 }
    );
  }

  // 4. Claim the directory record
  const { error: claimErr } = await sb
    .from("pro_directory")
    .update({ claimed_by: userId, claimed_at: new Date().toISOString() })
    .eq("id", id);

  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 });

  // 5. Get Clerk user info for profile seeding
  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";
  const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ");

  // 6. Upsert into the appropriate role table and set the user's role
  const isLoType = pro.pro_type === "lo" || pro.pro_type === "lo_company";

  if (isLoType) {
    // Upsert loan_officers row
    const { data: existingLo } = await sb
      .from("loan_officers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingLo) {
      await sb.from("loan_officers").insert({
        user_id: userId,
        email,
        nmls: pro.source === "nmls" ? pro.source_id.replace(/^co_/, "") : null,
        license_state: "CA",
        lender: pro.company_name ?? pro.name,
      });
    }
  } else {
    // Upsert agents row
    const { data: existingAgent } = await sb
      .from("agents")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingAgent) {
      await sb.from("agents").insert({
        user_id: userId,
        license: pro.source === "ca_dre" ? pro.source_id : null,
        brokerage: pro.company_name ?? null,
      });
    }
  }

  // 7. Set user role
  await sb
    .from("users")
    .upsert(
      { id: userId, role: isLoType ? "lo" : "agent", full_name: fullName },
      { onConflict: "id" }
    );

  return NextResponse.json({ ok: true, claimed: true, pro_type: pro.pro_type });
}
