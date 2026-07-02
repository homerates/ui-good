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

// GET /api/v2/projects
// List all projects for the authenticated user, with a chat count per project.
export async function GET(_req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return noStore({ ok: false, error: "unauthenticated" }, 401);

    const supabase = getSupabase();
    if (!supabase) return noStore({ ok: false, error: "supabase_not_configured" }, 503);

    const { data, error } = await supabase
      .from("projects")
      .select("id, name, description, created_at, updated_at, chats(count)")
      .eq("clerk_user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.warn("[v2/projects GET]", error.message);
      return noStore({ ok: false, error: error.message }, 500);
    }

    const projects = (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      chat_count: row.chats?.[0]?.count ?? 0,
    }));

    return noStore({ ok: true, projects });
  } catch (e: any) {
    console.error("[v2/projects GET] exception:", e?.message);
    return noStore({ ok: false, error: "internal" }, 500);
  }
}

// POST /api/v2/projects
// Create a new project. Body: { name, description? }
// Returns 409 if a project with that name already exists for this user.
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return noStore({ ok: false, error: "unauthenticated" }, 401);

    const supabase = getSupabase();
    if (!supabase) return noStore({ ok: false, error: "supabase_not_configured" }, 503);

    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const description = typeof body?.description === "string" ? body.description.trim() || null : null;

    if (!name) return noStore({ ok: false, error: "name is required" }, 400);

    // Pre-check for duplicate to return a clear error rather than a raw Postgres exception
    const { data: existing } = await supabase
      .from("projects")
      .select("id")
      .eq("clerk_user_id", userId)
      .eq("name", name)
      .maybeSingle();

    if (existing) {
      return noStore({ ok: false, error: "A project with that name already exists" }, 409);
    }

    const { data, error } = await supabase
      .from("projects")
      .insert({ clerk_user_id: userId, name, description })
      .select("id, name, description, created_at, updated_at")
      .single();

    if (error) {
      // 23505 = unique_violation — race-condition guard if two tabs submit simultaneously
      if (error.code === "23505") {
        return noStore({ ok: false, error: "A project with that name already exists" }, 409);
      }
      console.warn("[v2/projects POST]", error.message);
      return noStore({ ok: false, error: error.message }, 500);
    }

    return noStore({ ok: true, project: data }, 201);
  } catch (e: any) {
    console.error("[v2/projects POST] exception:", e?.message);
    return noStore({ ok: false, error: "internal" }, 500);
  }
}
