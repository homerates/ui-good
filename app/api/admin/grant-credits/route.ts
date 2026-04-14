// app/api/admin/grant-credits/route.ts
// POST — admin grants credits to any user (free, no balance deduction)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/adminAuth";
import { awardCredits, getBalance } from "../../../../lib/credits";
import { getSupabase } from "../../../../lib/supabaseServer";
import { emailCreditGrant } from "../../../../lib/sendEmail";

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { userId, amount, note } = await req.json();

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  if (typeof amount !== "number" || amount < 1 || amount > 100_000) {
    return NextResponse.json({ error: "Amount must be between 1 and 100,000" }, { status: 400 });
  }

  // Verify user exists
  const { data: user } = await sb
    .from("users")
    .select("id, email, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const description = note?.trim()
    ? `Admin grant: ${note.trim()}`
    : "Admin credit grant";

  const ok = await awardCredits(userId, amount, "admin_grant", description);
  if (!ok) return NextResponse.json({ error: "Failed to grant credits" }, { status: 500 });

  const newBalance = await getBalance(userId);

  // Non-blocking email notification
  emailCreditGrant({
    toEmail:    user.email,
    firstName:  user.full_name?.split(" ")[0] ?? null,
    amount,
    newBalance,
    fromName:   "HomeRates.ai",
    note:       note?.trim() || null,
  });

  return NextResponse.json({ ok: true, newBalance, user: { email: user.email, name: user.full_name } });
}
