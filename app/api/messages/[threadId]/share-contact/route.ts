// app/api/messages/[threadId]/share-contact/route.ts
// POST — borrower triggers mutual contact share (email + phone)
// Pulls both parties' contacts from Clerk + users table, stores in contact_shares,
// marks thread status as 'contact_shared', sends system message in thread.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../../lib/supabaseServer";
import { emailContactShare, type ProCard } from "../../../../../lib/sendEmail";

export async function POST(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Must be the borrower (only borrower can initiate contact share)
  const { data: thread } = await sb
    .from("conversation_threads")
    .select("id, borrower_id, professional_id, status")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.borrower_id !== userId) {
    return NextResponse.json({ error: "Only the borrower can initiate contact sharing" }, { status: 403 });
  }
  if (thread.status === "contact_shared") {
    return NextResponse.json({ error: "Contact has already been shared for this conversation" }, { status: 400 });
  }

  // Fetch both parties from Clerk for email
  const clerk = await clerkClient();
  const [borrowerClerk, proClerk] = await Promise.all([
    clerk.users.getUser(userId),
    clerk.users.getUser(thread.professional_id),
  ]);

  const borrowerEmail = borrowerClerk.emailAddresses[0]?.emailAddress ?? null;
  const proEmail = proClerk.emailAddresses[0]?.emailAddress ?? null;

  // Fetch phones + role from users table
  const { data: borrowerRow } = await sb.from("users").select("phone").eq("id", userId).maybeSingle();
  const { data: proRow } = await sb.from("users").select("phone, role").eq("id", thread.professional_id).maybeSingle();

  // Store contact share record
  const { error: shareErr } = await sb
    .from("contact_shares")
    .insert({
      thread_id: threadId,
      borrower_email: borrowerEmail,
      borrower_phone: borrowerRow?.phone ?? null,
      pro_email: proEmail,
      pro_phone: proRow?.phone ?? null,
    });

  if (shareErr) {
    console.error("[share-contact] error:", shareErr);
    return NextResponse.json({ error: "Failed to share contact" }, { status: 500 });
  }

  // Mark thread as contact_shared
  await sb
    .from("conversation_threads")
    .update({ status: "contact_shared" })
    .eq("id", threadId);

  // Inject system message into thread
  const systemMsg = `✅ Contact information has been exchanged.\n\nYou now have each other's email and phone number to continue directly.\n\n*Ready to move forward? Continue your full application in your lender's secure portal.*`;

  await sb.from("messages").insert({
    thread_id: threadId,
    sender_role: "system",
    content: systemMsg,
  });

  // Build full professional card from DB profile
  const borrowerName = [borrowerClerk.firstName, borrowerClerk.lastName].filter(Boolean).join(" ") || "Borrower";
  const proName      = [proClerk.firstName, proClerk.lastName].filter(Boolean).join(" ") || "Your professional";

  // Fetch LO or agent profile for the card
  const proRole = proRow?.role ?? "lo";
  let proCard: ProCard = {
    name: proName,
    email: proEmail,
    phone: proRow?.phone ?? null,
    photoUrl: proClerk.imageUrl ?? null,
    role: proRole,
  };
  try {
    if (proRole === "lo") {
      const { data: loRow } = await sb
        .from("loan_officers")
        .select("lender, nmls, company_nmls, license_state, title, bio, phone, website, office_address")
        .eq("user_id", thread.professional_id)
        .maybeSingle();
      if (loRow) {
        proCard = {
          ...proCard,
          phone:         loRow.phone        ?? proCard.phone,
          title:         loRow.title        ?? null,
          bio:           loRow.bio          ?? null,
          company:       loRow.lender       ?? null,
          nmls:          loRow.nmls         ?? null,
          companyNmls:   loRow.company_nmls ?? null,
          licenseState:  loRow.license_state ?? null,
          website:       loRow.website      ?? null,
          officeAddress: loRow.office_address ?? null,
        };
      }
    } else {
      const { data: agentRow } = await sb
        .from("agents")
        .select("brokerage, license, title, bio, phone, website, office_address")
        .eq("user_id", thread.professional_id)
        .maybeSingle();
      if (agentRow) {
        proCard = {
          ...proCard,
          phone:         agentRow.phone        ?? proCard.phone,
          title:         agentRow.title        ?? null,
          bio:           agentRow.bio          ?? null,
          company:       agentRow.brokerage    ?? null,
          nmls:          agentRow.license      ?? null,
          website:       agentRow.website      ?? null,
          officeAddress: agentRow.office_address ?? null,
        };
      }
    }
  } catch (e) {
    console.error("[share-contact] pro profile fetch failed:", e);
  }

  emailContactShare({
    borrowerEmail,
    borrowerName,
    borrowerPhone: borrowerRow?.phone ?? null,
    pro: proCard,
    threadId,
  });

  return NextResponse.json({
    ok: true,
    borrower_email: borrowerEmail,
    borrower_phone: borrowerRow?.phone ?? null,
    pro_email: proEmail,
    pro_phone: proRow?.phone ?? null,
  });
}
