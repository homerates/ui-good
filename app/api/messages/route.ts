// app/api/messages/route.ts
// GET  — list all threads for the signed-in user (borrower or professional)
// POST — borrower opens a new thread with a professional (after receiving a response)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabase } from "../../../lib/supabaseServer";

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

  // Resolve display names for the other party in each thread
  const otherIds = threads.map(t =>
    t.borrower_id === userId ? t.professional_id : t.borrower_id
  );
  const uniqueIds = [...new Set(otherIds)];

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
    return {
      ...t,
      other_name: nameMap[otherId] ?? "Unknown",
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
    thread = existing;
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

  return NextResponse.json({ thread_id: thread.id, message: msg });
}
