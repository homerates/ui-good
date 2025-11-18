// ==== NEW FILE: app/api/projects/route.ts ====
// API for saving chats into "projects" and listing projects

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../lib/supabaseServer";

const PROJECTS_TABLE = "projects";
const THREAD_LINKS_TABLE = "project_threads";

function noStore(json: unknown, status = 200) {
    const res = NextResponse.json(json, { status });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
}

/**
 * POST /api/projects
 *
 * Body: { threadId: string; projectName: string }
 *
 * Behavior:
 * - Ensures the user is signed in
 * - Finds or creates a project with that name for this user
 * - Links the given threadId into project_threads
 */
export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return noStore(
                {
                    ok: false,
                    reason: "not_authenticated",
                    stage: "auth_post",
                },
                401
            );
        }

        // Parse body
        let body: any;
        try {
            body = await req.json();
        } catch (err) {
            console.error("JSON parse error in POST /api/projects:", err);
            return noStore(
                {
                    ok: false,
                    reason: "invalid_json",
                    stage: "parse_body",
                    message: err instanceof Error ? err.message : String(err),
                },
                400
            );
        }

        const threadId = String(body.threadId ?? "").trim();
        const projectName = String(body.projectName ?? "").trim();

        if (!threadId || !projectName) {
            return noStore(
                {
                    ok: false,
                    reason: "missing_fields",
                    stage: "validate_body",
                    details: "threadId and projectName are required",
                },
                400
            );
        }

        const supabase = getSupabase();
        if (!supabase) {
            console.error("Supabase not configured in POST /api/projects");
            return noStore(
                {
                    ok: false,
                    reason: "supabase_not_configured",
                    stage: "get_supabase_post",
                },
                200
            );
        }

        // 1) Find existing project for this user with that name (exact match for now)
        const { data: existing, error: findErr } = await supabase
            .from(PROJECTS_TABLE)
            .select("id, name, created_at")
            .eq("clerk_user_id", userId)
            .eq("name", projectName)
            .limit(1);

        if (findErr) {
            console.error("Supabase find project error:", findErr);
            return noStore(
                {
                    ok: false,
                    reason: "supabase_error",
                    stage: "find_project",
                    error: findErr.message,
                },
                500
            );
        }

        let projectId: string;
        let projectRow: any;

        if (existing && existing.length > 0) {
            projectId = existing[0].id;
            projectRow = existing[0];
        } else {
            // 2) Create project
            const { data: created, error: insertErr } = await supabase
                .from(PROJECTS_TABLE)
                .insert({
                    clerk_user_id: userId,
                    name: projectName,
                })
                .select("id, name, created_at")
                .single();

            if (insertErr || !created) {
                console.error("Supabase create project error:", insertErr);
                return noStore(
                    {
                        ok: false,
                        reason: "supabase_error",
                        stage: "create_project",
                        error: insertErr?.message ?? "no data returned",
                    },
                    500
                );
            }

            projectId = created.id;
            projectRow = created;
        }

        // 3) Link thread to project
        const { data: linkRow, error: linkErr } = await supabase
            .from(THREAD_LINKS_TABLE)
            .insert({
                clerk_user_id: userId,
                project_id: projectId,
                thread_id: threadId,
            })
            .select("id, project_id, thread_id, created_at")
            .single();

        if (linkErr) {
            console.error("Supabase link thread error:", linkErr);
            return noStore(
                {
                    ok: false,
                    reason: "supabase_error",
                    stage: "link_thread",
                    error: linkErr.message,
                },
                500
            );
        }

        return noStore(
            {
                ok: true,
                project: projectRow,
                link: linkRow,
            },
            201
        );
    } catch (err) {
        console.error("Unhandled POST /api/projects error:", err);
        return noStore(
            {
                ok: false,
                reason: "unhandled_error",
                stage: "post_outer",
                message: err instanceof Error ? err.message : String(err),
            },
            500
        );
    }
}

/**
 * GET /api/projects
 *
 * Returns list of this user's projects (for a future Projects view / picker).
 */
export async function GET(_req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return noStore(
                {
                    ok: false,
                    reason: "not_authenticated",
                    stage: "auth_get",
                },
                401
            );
        }

        const supabase = getSupabase();
        if (!supabase) {
            console.error("Supabase not configured in GET /api/projects");
            return noStore(
                {
                    ok: false,
                    reason: "supabase_not_configured",
                    stage: "get_supabase_get",
                },
                200
            );
        }

        const { data, error } = await supabase
            .from(PROJECTS_TABLE)
            .select("id, name, created_at")
            .eq("clerk_user_id", userId)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Supabase GET projects error:", error);
            return noStore(
                {
                    ok: false,
                    reason: "supabase_error",
                    stage: "query_get",
                    error: error.message,
                },
                500
            );
        }

        return noStore({
            ok: true,
            projects: data ?? [],
        });
    } catch (err) {
        console.error("Unhandled GET /api/projects error:", err);
        return noStore(
            {
                ok: false,
                reason: "unhandled_error",
                stage: "get_outer",
                message: err instanceof Error ? err.message : String(err),
            },
            500
        );
    }
}
