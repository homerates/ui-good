// app/api/messages/unread/route.ts
// GET — returns total unread message count for the signed-in user
// Used by AppNav bell notification polling

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ total: 0 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ total: 0 });

  // Sum unread_borrower for threads where user is borrower
  // Sum unread_professional for threads where user is professional
  const [asBorrower, asPro] = await Promise.all([
    sb
      .from("conversation_threads")
      .select("unread_borrower")
      .eq("borrower_id", userId),
    sb
      .from("conversation_threads")
      .select("unread_professional")
      .eq("professional_id", userId),
  ]);

  const total =
    (asBorrower.data ?? []).reduce((s, t) => s + (t.unread_borrower ?? 0), 0) +
    (asPro.data ?? []).reduce((s, t) => s + (t.unread_professional ?? 0), 0);

  return NextResponse.json({ total });
}
