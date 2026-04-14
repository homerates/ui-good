// app/api/lo/gift-credits/route.ts
// POST — LO gifts credits to one of their borrowers; deducted from LO balance

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";
import { awardCredits, spendCredits, getBalance } from "../../../../lib/credits";
import { emailCreditGrant } from "../../../../lib/sendEmail";
import { clerkClient } from "@clerk/nextjs/server";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { borrowerUserId, amount } = await req.json();

  if (!borrowerUserId || typeof amount !== "number" || amount < 10 || amount > 5000) {
    return NextResponse.json({ error: "Amount must be between 10 and 5,000 credits" }, { status: 400 });
  }

  // Must be an LO
  const { data: lo } = await sb
    .from("loan_officers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!lo) return NextResponse.json({ error: "Only loan officers can gift credits" }, { status: 403 });

  // Borrower must be linked to this LO
  const { data: link } = await sb
    .from("borrowers")
    .select("id")
    .eq("lo_user_id", userId)
    .eq("user_id", borrowerUserId)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: "Borrower not found in your list" }, { status: 404 });

  // Check LO has enough credits
  const loBalance = await getBalance(userId);
  if (loBalance < amount) {
    return NextResponse.json(
      { error: `Insufficient credits — you have ${loBalance}, need ${amount}` },
      { status: 402 }
    );
  }

  const refId = `lo_gift_${userId}_to_${borrowerUserId}_${Date.now()}`;

  // Deduct from LO
  const deducted = await spendCredits(userId, amount, "lo_gift", `Gifted ${amount} credits to borrower`, refId);
  if (!deducted) return NextResponse.json({ error: "Failed to deduct credits" }, { status: 500 });

  // Award to borrower — if this fails, refund the LO
  const awarded = await awardCredits(borrowerUserId, amount, "lo_gift", `Credits gifted by your loan officer`, `${refId}_recv`);
  if (!awarded) {
    // Refund
    await awardCredits(userId, amount, "lo_gift", "Refund — gift delivery failed", `${refId}_refund`);
    return NextResponse.json({ error: "Failed to deliver credits to borrower" }, { status: 500 });
  }

  const newLoBalance = await getBalance(userId);

  // Email the borrower — non-blocking
  try {
    const clerk = await clerkClient();
    const [borrowerClerk, loClerk] = await Promise.all([
      clerk.users.getUser(borrowerUserId),
      clerk.users.getUser(userId),
    ]);
    const borrowerEmail = borrowerClerk.emailAddresses[0]?.emailAddress;
    const borrowerName  = [borrowerClerk.firstName, borrowerClerk.lastName].filter(Boolean).join(" ") || null;
    const loName        = [loClerk.firstName, loClerk.lastName].filter(Boolean).join(" ") || "Your loan officer";
    const borrowerBal   = await getBalance(borrowerUserId);

    if (borrowerEmail) {
      emailCreditGrant({
        toEmail:   borrowerEmail,
        firstName: borrowerName?.split(" ")[0] ?? null,
        amount,
        newBalance: borrowerBal,
        fromName:   loName,
      });
    }
  } catch {
    // non-fatal
  }

  return NextResponse.json({ ok: true, newLoBalance });
}
