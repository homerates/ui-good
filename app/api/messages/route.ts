// app/api/messages/route.ts
// GET  — list all threads for the signed-in user (borrower or professional)
// POST — borrower opens a new thread with a professional (after receiving a response)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../lib/supabaseServer";
import { emailNewThread } from "../../../lib/sendEmail";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Fetch threads where this user is borrower OR professional
  // Two separate queries + merge — avoids .or() parser issues with Clerk IDs
  const SELECT = "id, scenario_id, borrower_id, professional_id, professional_type, status, unread_borrower, unread_professional, last_message_at, created_at";

  const [asBorrower, asPro] = await Promise.all([
    sb.from("conversation_threads").select(SELECT).eq("borrower_id", userId),
    sb.from("conversation_threads").select(SELECT).eq("professional_id", userId),
  ]);

  if (asBorrower.error) console.error("[messages] GET asBorrower error:", asBorrower.error);
  if (asPro.error) console.error("[messages] GET asPro error:", asPro.error);

  // Merge and deduplicate, then sort by last_message_at desc
  const seen = new Set<string>();
  const merged = [...(asBorrower.data ?? []), ...(asPro.data ?? [])].filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
  merged.sort((a, b) => {
    const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return tb - ta;
  });

  const threads = merged;

  // Before resolving any names: for threads where this viewer is the professional,
  // the borrower's identity must not be resolved from Clerk at all unless contact
  // has already been explicitly shared for that specific thread.
  const proThreadIds = threads.filter(t => t.professional_id === userId).map(t => t.id);
  let sharedThreadIds = new Set<string>();
  if (proThreadIds.length > 0) {
    const { data: shares } = await sb.from("contact_shares").select("thread_id").in("thread_id", proThreadIds);
    sharedThreadIds = new Set((shares ?? []).map(s => s.thread_id));
  }

  // Resolve display names -- but only for parties we're actually allowed to reveal:
  // the professional's name (never anonymous) when this viewer is the borrower, or
  // the borrower's name only for threads where contact has already been shared.
  const resolvableIds = threads
    .filter(t => t.borrower_id === userId || sharedThreadIds.has(t.id))
    .map(t => (t.borrower_id === userId ? t.professional_id : t.borrower_id));
  const uniqueIds = [...new Set(resolvableIds)];

  let nameMap: Record<string, string> = {};
  if (uniqueIds.length > 0) {
    try {
      const clerk = await clerkClient();
      const users = await clerk.users.getUserList({ userId: uniqueIds, limit: 100 });
      for (const u of users.data) {
        const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses[0]?.emailAddress || "Unknown";
        nameMap[u.id] = name;
      }
    } catch {
      // non-fatal — names just won't resolve
    }
  }

  const enriched = threads.map(t => {
    const isBorrower = t.borrower_id === userId;
    const otherId = isBorrower ? t.professional_id : t.borrower_id;
    const canReveal = isBorrower || sharedThreadIds.has(t.id);
    const { borrower_id, ...tRest } = t;
    return {
      ...tRest,
      ...(canReveal ? { borrower_id } : {}),
      other_name: canReveal ? (nameMap[otherId] ?? "Unknown") : "Borrower",
      other_role: isBorrower ? t.professional_type : "borrower",
      unread: isBorrower ? t.unread_borrower : t.unread_professional,
    };
  });

  return NextResponse.json({ threads: enriched });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const body = await req.json();
  const { professional_id, scenario_id, message } = body;

  if (!professional_id || !message?.trim()) {
    return NextResponse.json({ error: "professional_id and message are required" }, { status: 400 });
  }
  if (message.trim().length > 1000) {
    return NextResponse.json({ error: "Message must be 1000 characters or less" }, { status: 400 });
  }

  // Look up professional type from users table
  const { data: proUser } = await sb
    .from("users")
    .select("role")
    .eq("id", professional_id)
    .maybeSingle();
  const professionalType = proUser?.role === "agent" ? "agent" : "lo";

  // Get or create thread (upsert on unique pair index)
  let thread: { id: string; unread_professional: number } | null = null;

  const { data: existing } = await sb
    .from("conversation_threads")
    .select("id, unread_professional")
    .eq("borrower_id", userId)
    .eq("professional_id", professional_id)
    .maybeSingle();

  if (existing) {
    // Thread already exists — return it without re-sending the opening message
    return NextResponse.json({ thread_id: existing.id });
  } else {
    const { data: created, error: createErr } = await sb
      .from("conversation_threads")
      .insert({
        borrower_id: userId,
        professional_id,
        professional_type: professionalType,
        scenario_id: scenario_id ?? null,
      })
      .select("id, unread_professional")
      .single();

    if (createErr || !created) {
      console.error("[messages] create thread error:", createErr);
      return NextResponse.json({ error: "Failed to create thread" }, { status: 500 });
    }
    thread = created;
  }

  // Insert message
  const { data: msg, error: msgErr } = await sb
    .from("messages")
    .insert({
      thread_id: thread.id,
      sender_role: "borrower",
      content: message.trim(),
    })
    .select()
    .single();

  if (msgErr || !msg) {
    console.error("[messages] insert message error:", msgErr);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }

  // Update thread: last_message_at + increment professional's unread
  await sb
    .from("conversation_threads")
    .update({
      last_message_at: msg.created_at,
      unread_professional: (thread.unread_professional ?? 0) + 1,
    })
    .eq("id", thread.id);

  // Email the professional on new thread (fire-and-forget). A brand-new thread
  // is always pre-consent (contact sharing requires an existing thread), so the
  // LO must never learn the borrower's real name here -- no Clerk lookup for
  // the borrower happens in this path at all.
  if (!existing) {
    try {
      const clerk = await clerkClient();
      const proClerk = await clerk.users.getUser(professional_id);
      const proName  = [proClerk.firstName, proClerk.lastName].filter(Boolean).join(" ") || "there";
      const proEmail = proClerk.emailAddresses[0]?.emailAddress ?? null;
      const { data: scenario } = scenario_id
        ? await sb.from("scenario_briefs").select("loan_type").eq("id", scenario_id).maybeSingle()
        : { data: null };
      if (proEmail) {
        await emailNewThread({ toEmail: proEmail, toName: proName, fromName: "Borrower", threadId: thread.id, loanType: scenario?.loan_type });
      }
    } catch (e) {
      console.error("[messages] emailNewThread lookup failed:", e);
    }
  }

  return NextResponse.json({ thread_id: thread.id, message: msg });
}
