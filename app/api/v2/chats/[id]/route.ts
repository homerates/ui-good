export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../../lib/supabaseServer";

function noStore(json: unknown, status = 200) {
  const res = NextResponse.json(json, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

// GET /api/v2/chats/[id]
// Fetch one chat including full messages. Filters by id AND clerk_user_id.
export async function GET(_req: NextRequest, ctx: any) {
  try {
    const { userId } = await auth();
    if (!userId) return noStore({ ok: false, error: "unauthenticated" }, 401);

    const id: string | undefined = ctx?.params?.id;
    if (!id) return noStore({ ok: false, error: "id required" }, 400);

    const supabase = getSupabase();
    if (!supabase) return noStore({ ok: false, error: "supabase_not_configured" }, 503);

    const { data, error } = await supabase
      .from("chats")
      .select("id, title, project_id, messages, memory_thread_id, updated_at, created_at")
      .eq("id", id)
      .eq("clerk_user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("[v2/chats/:id GET]", error.message);
      return noStore({ ok: false, error: error.message }, 500);
    }
    if (!data) return noStore({ ok: false, error: "not_found" }, 404);

    return noStore({ ok: true, chat: data });
  } catch (e: any) {
    console.error("[v2/chats/:id GET] exception:", e?.message);
    return noStore({ ok: false, error: "internal" }, 500);
  }
}

// PUT /api/v2/chats/[id]
// Upsert a chat. Body: { title?, messages?, project_id?, memory_thread_id? }
// Single endpoint for creation, content updates, and project reassignment.
export async function PUT(req: NextRequest, ctx: any) {
  try {
    const { userId } = await auth();
    if (!userId) return noStore({ ok: false, error: "unauthenticated" }, 401);

    const id: string | undefined = ctx?.params?.id;
    if (!id) return noStore({ ok: false, error: "id required" }, 400);

    const supabase = getSupabase();
    if (!supabase) return noStore({ ok: false, error: "supabase_not_configured" }, 503);

    const body = await req.json().catch(() => ({}));
    const { title, messages, project_id, memory_thread_id } = body ?? {};

    const payload: Record<string, unknown> = {
      id,
      clerk_user_id: userId,
      updated_at: new Date().toISOString(),
    };
    if (title !== undefined) payload.title = typeof title === "string" ? title.slice(0, 200) : null;
    if (messages !== undefined) payload.messages = Array.isArray(messages) ? messages : [];
    if (project_id !== undefined) payload.project_id = project_id ?? null;
    if (memory_thread_id !== undefined) payload.memory_thread_id = memory_thread_id ?? null;

    const { error } = await supabase
      .from("chats")
      .upsert(payload, { onConflict: "id,clerk_user_id" });

    if (error) {
      console.warn("[v2/chats/:id PUT]", error.message);
      return noStore({ ok: false, error: error.message }, 500);
    }

    return noStore({ ok: true });
  } catch (e: any) {
    console.error("[v2/chats/:id PUT] exception:", e?.message);
    return noStore({ ok: false, error: "internal" }, 500);
  }
}

// DELETE /api/v2/chats/[id]
// Hard delete a chat owned by the authenticated user.
export async function DELETE(_req: NextRequest, ctx: any) {
  try {
    const { userId } = await auth();
    if (!userId) return noStore({ ok: false, error: "unauthenticated" }, 401);

    const id: string | undefined = ctx?.params?.id;
    if (!id) return noStore({ ok: false, error: "id required" }, 400);

    const supabase = getSupabase();
    if (!supabase) return noStore({ ok: false, error: "supabase_not_configured" }, 503);

    const { error } = await supabase
      .from("chats")
      .delete()
      .eq("id", id)
      .eq("clerk_user_id", userId);

    if (error) {
      console.warn("[v2/chats/:id DELETE]", error.message);
      return noStore({ ok: false, error: error.message }, 500);
    }

    return noStore({ ok: true });
  } catch (e: any) {
    console.error("[v2/chats/:id DELETE] exception:", e?.message);
    return noStore({ ok: false, error: "internal" }, 500);
  }
}
