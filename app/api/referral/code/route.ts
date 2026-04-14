// app/api/referral/code/route.ts
// GET — return (or generate) the signed-in user's short referral code

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";
import { randomBytes } from "crypto";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Check if code already exists
  const { data: existing } = await sb
    .from("users")
    .select("referral_code")
    .eq("id", userId)
    .maybeSingle();

  if (existing?.referral_code) {
    return NextResponse.json({ code: existing.referral_code });
  }

  // Generate a new unique 8-char hex code
  let code: string | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomBytes(4).toString("hex"); // e.g. "a3f7c12b"
    const { data: conflict } = await sb
      .from("users")
      .select("id")
      .eq("referral_code", candidate)
      .maybeSingle();
    if (!conflict) { code = candidate; break; }
  }

  if (!code) return NextResponse.json({ error: "Could not generate code" }, { status: 500 });

  await sb.from("users").update({ referral_code: code }).eq("id", userId);

  return NextResponse.json({ code });
}
