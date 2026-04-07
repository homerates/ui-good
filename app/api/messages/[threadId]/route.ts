// app/api/messages/[threadId]/route.ts
// GET  — fetch all messages in a thread (auth check: must be a party)
// POST — send a message in a thread (borrower or professional)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";
import { emailNewReply } from "../../../../lib/sendEmail";

// PII patterns to block from being sent
const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/,               // SSN XXX-XX-XXXX
  /\b\d{9}\b/,                             // SSN no dashes
  /\b(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}\b/, // DOB MM/DD/YYYY
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,  // Credit/debit card 16 digits
];

function containsPII(text: string): boolean {
  return PII_PATTERNS.some(p => p.test(text));
}

// Auto-append rate disclosure to any message containing a % (LO side)
function appendRateDisclosure(content: string, senderRole: string): string {
  if (senderRole === "professional" && /\d[\s.]?%/.test(content)) {
    return content + "\n\n*Rate indication only — not a Loan Estimate or commitment to lend. Rates subject to change based on credit, property, and market conditions.*";
  }
  return content;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Verify user is a party to this thread
  const { data: thread } = await sb
    .from("conversation_threads")
    .select("id, borrower_id, professional_id, professional_type, status, unread_borrower, unread_professional, last_message_at, created_at, scenario_id")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.borrower_id !== userId && thread.professional_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isBorrower = thread.borrower_id === userId;

  // Fetch messages
  const { data: messages, error } = await sb
    .from("messages")
    .select("id, sender_role, content, read_at, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[messages/threadId] GET error:", error);
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }

  // Mark unread messages as read for this user
  const unreadField = isBorrower ? "unread_borrower" : "unread_professional";
  if ((isBorrower ? thread.unread_borrower : thread.unread_professional) > 0) {
    await sb
      .from("conversation_threads")
      .update({ [unreadField]: 0 })
      .eq("id", threadId);
  }

  // Check if contact has been shared
  const { data: contactShare } = await sb
    .from("contact_shares")
    .select("borrower_email, borrower_phone, pro_email, pro_phone, shared_at")
    .eq("thread_id", threadId)
    .maybeSingle();

  return NextResponse.json({
    thread: {
      ...thread,
      is_borrower: isBorrower,
    },
    messages: messages ?? [],
    contact_share: contactShare ?? null,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await params;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Verify user is a party to this thread
  const { data: thread } = await sb
    .from("conversation_threads")
    .select("id, borrower_id, professional_id, status, unread_borrower, unread_professional")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.borrower_id !== userId && thread.professional_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (thread.status === "closed") {
    return NextResponse.json({ error: "This conversation is closed" }, { status: 400 });
  }

  const body = await req.json();
  const { message } = body;

  if (!message?.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }
  if (message.trim().length > 1000) {
    return NextResponse.json({ error: "Message must be 1000 characters or less" }, { status: 400 });
  }

  // PII guard
  if (containsPII(message)) {
    return NextResponse.json({
      error: "Your message appears to contain sensitive information (SSN, date of birth, or card numbers). Please do not share this over chat.",
      pii_blocked: true,
    }, { status: 400 });
  }

  const isBorrower = thread.borrower_id === userId;
  const senderRole = isBorrower ? "borrower" : "professional";

  // Auto-append rate disclosure if professional mentions a rate
  const finalContent = appendRateDisclosure(message.trim(), senderRole);

  const { data: msg, error: msgErr } = await sb
    .from("messages")
    .insert({
      thread_id: threadId,
      sender_role: senderRole,
      content: finalContent,
    })
    .select()
    .single();

  if (msgErr || !msg) {
    console.error("[messages/threadId] POST error:", msgErr);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }

  // Update thread last_message_at + increment other party's unread
  const unreadField = isBorrower ? "unread_professional" : "unread_borrower";
  const currentUnread = isBorrower ? thread.unread_professional : thread.unread_borrower;
  await sb
    .from("conversation_threads")
    .update({
      last_message_at: msg.created_at,
      [unreadField]: (currentUnread ?? 0) + 1,
    })
    .eq("id", threadId);

  // Email the other party — only when they had 0 unread (were caught up), to avoid spam
  if ((currentUnread ?? 0) === 0) {
    try {
      const clerk = await clerkClient();
      const recipientId = isBorrower ? thread.professional_id : thread.borrower_id;
      const [recipientClerk, senderClerk] = await Promise.all([
        clerk.users.getUser(recipientId),
        clerk.users.getUser(userId),
      ]);
      const recipientEmail = recipientClerk.emailAddresses[0]?.emailAddress ?? null;
      const recipientName  = [recipientClerk.firstName, recipientClerk.lastName].filter(Boolean).join(" ") || "there";
      const senderName     = [senderClerk.firstName, senderClerk.lastName].filter(Boolean).join(" ") || "Someone";
      if (recipientEmail) {
        emailNewReply({ toEmail: recipientEmail, toName: recipientName, fromName: senderName, threadId, preview: finalContent });
      }
    } catch (e) {
      console.error("[messages/threadId] emailNewReply lookup failed:", e);
    }
  }

  return NextResponse.json({ message: msg });
}
