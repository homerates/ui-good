// ==== CREATE / REPLACE FILE: app/api/projects/route.ts ====
// Projects API: create projects, attach threads, list projects for a Clerk user

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../lib/supabaseServer";

const PROJECTS_TABLE = "projects";
const THREADS_TABLE = "chat_threads";

function noStore(json: unknown, status = 200) {
    const res = NextResponse.json(json, { status });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
}

/**
 * GET /api/projects
 *
 * Returns all projects for the signed-in user,
 * including their linked thread ids.
 */
export async function GET(_req: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            // Not signed in → no projects
            return noStore({ ok: true, projects: [] });
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

        // Fetch projects + joined threads for this user
        const { data, error } = await supabase
            .from(PROJECTS_TABLE)
            .select(
                `
        id,
        name,
        created_at,
        chat_threads (
          id,
          thread_id,
          created_at
        )
      `
            )
            .eq("clerk_user_id", userId)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Supabase GET error in /api/projects:", error);
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

        return noStore({ ok: true, projects: data ?? [] });
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

/**
 * POST /api/projects
 *
 * Body: { threadId: string; projectName: string }
 *
 * - Ensures a project with this name exists for the user
 * - Attaches the given threadId to that project
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

        const rawThreadId = body?.threadId;
        const rawProjectName = body?.projectName;

        const threadId =
            typeof rawThreadId === "string" ? rawThreadId.trim() : "";
        const projectName =
            typeof rawProjectName === "string" ? rawProjectName.trim() : "";

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

        // 1) Find existing project for this user with the same name
        const { data: existingProject, error: existingError } = await supabase
            .from(PROJECTS_TABLE)
            .select("id, name, created_at")
            .eq("clerk_user_id", userId)
            .eq("name", projectName)
            .maybeSingle();

        if (existingError && existingError.code !== "PGRST116") {
            // PGRST116 is "Results contain 0 rows", which is fine for maybeSingle
            console.error(
                "Supabase select error in POST /api/projects (existing project):",
                existingError
            );
            return noStore(
                {
                    ok: false,
                    reason: "supabase_error",
                    stage: "select_project",
                    error: existingError.message,
                },
                500
            );
        }

        let projectId: string;
        let projectRow: any;

        if (existingProject) {
            projectId = existingProject.id;
            projectRow = existingProject;
        } else {
            // 2) Create a new project
            const { data: newProject, error: insertProjectError } = await supabase
                .from(PROJECTS_TABLE)
                .insert({
                    clerk_user_id: userId,
                    name: projectName,
                })
                .select("id, name, created_at")
                .single();

            if (insertProjectError) {
                console.error(
                    "Supabase insert error in POST /api/projects (create project):",
                    insertProjectError
                );
                return noStore(
                    {
                        ok: false,
                        reason: "supabase_error",
                        stage: "insert_project",
                        error: insertProjectError.message,
                    },
                    500
                );
            }

            projectId = newProject.id;
            projectRow = newProject;
        }

        // 3) Attach the thread to this project
        const { data: mapping, error: mappingError } = await supabase
            .from(THREADS_TABLE)
            .insert({
                clerk_user_id: userId,
                project_id: projectId,
                thread_id: threadId,
            })
            .select("id, thread_id, created_at")
            .single();

        if (mappingError) {
            console.error(
                "Supabase insert error in POST /api/projects (attach thread):",
                mappingError
            );
            return noStore(
                {
                    ok: false,
                    reason: "supabase_error",
                    stage: "insert_mapping",
                    error: mappingError.message,
                },
                500
            );
        }

        return noStore(
            {
                ok: true,
                project: projectRow,
                mapping,
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
