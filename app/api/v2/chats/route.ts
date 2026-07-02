export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";

function noStore(json: unknown, status = 200) {
  const res = NextResponse.json(json, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

// GET /api/v2/chats
// List chats for the authenticated user, optionally filtered by ?project_id=.
// Does NOT return messages — lightweight for sidebar use.
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return noStore({ ok: false, error: "unauthenticated" }, 401);

    const supabase = getSupabase();
    if (!supabase) return noStore({ ok: false, error: "supabase_not_configured" }, 503);

    let query = supabase
      .from("chats")
      .select("id, title, project_id, updated_at, created_at")
      .eq("clerk_user_id", userId)
      .order("updated_at", { ascending: false });

    const projectId = req.nextUrl.searchParams.get("project_id");
    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query;
    if (error) {
      console.warn("[v2/chats GET]", error.message);
      return noStore({ ok: false, error: error.message }, 500);
    }

    return noStore({ ok: true, chats: data ?? [] });
  } catch (e: any) {
    console.error("[v2/chats GET] exception:", e?.message);
    return noStore({ ok: false, error: "internal" }, 500);
  }
}
