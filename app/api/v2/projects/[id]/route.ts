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

// PATCH /api/v2/projects/[id]
// Update name and/or description for a project owned by the authenticated user.
export async function PATCH(req: NextRequest, ctx: any) {
  try {
    const { userId } = await auth();
    if (!userId) return noStore({ ok: false, error: "unauthenticated" }, 401);

    const id: string | undefined = ctx?.params?.id;
    if (!id) return noStore({ ok: false, error: "id required" }, 400);

    const supabase = getSupabase();
    if (!supabase) return noStore({ ok: false, error: "supabase_not_configured" }, 503);

    const body = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body?.name !== undefined) {
      updates.name = typeof body.name === "string" ? body.name.trim() : null;
    }
    if (body?.description !== undefined) {
      updates.description = typeof body.description === "string" ? body.description.trim() || null : null;
    }

    const { error } = await supabase
      .from("projects")
      .update(updates)
      .eq("id", id)
      .eq("clerk_user_id", userId);

    if (error) {
      if (error.code === "23505") {
        return noStore({ ok: false, error: "A project with that name already exists" }, 409);
      }
      console.warn("[v2/projects/:id PATCH]", error.message);
      return noStore({ ok: false, error: error.message }, 500);
    }

    return noStore({ ok: true });
  } catch (e: any) {
    console.error("[v2/projects/:id PATCH] exception:", e?.message);
    return noStore({ ok: false, error: "internal" }, 500);
  }
}

// DELETE /api/v2/projects/[id]
// Delete a project owned by the authenticated user.
// chats.project_id has ON DELETE SET NULL — orphaning is handled by the DB automatically.
export async function DELETE(_req: NextRequest, ctx: any) {
  try {
    const { userId } = await auth();
    if (!userId) return noStore({ ok: false, error: "unauthenticated" }, 401);

    const id: string | undefined = ctx?.params?.id;
    if (!id) return noStore({ ok: false, error: "id required" }, 400);

    const supabase = getSupabase();
    if (!supabase) return noStore({ ok: false, error: "supabase_not_configured" }, 503);

    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", id)
      .eq("clerk_user_id", userId);

    if (error) {
      console.warn("[v2/projects/:id DELETE]", error.message);
      return noStore({ ok: false, error: error.message }, 500);
    }

    return noStore({ ok: true });
  } catch (e: any) {
    console.error("[v2/projects/:id DELETE] exception:", e?.message);
    return noStore({ ok: false, error: "internal" }, 500);
  }
}
