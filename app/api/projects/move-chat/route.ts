// ==== CREATE / REPLACE FILE: app/api/projects/move-chat/route.ts ====
// Move chat to project: updates project_threads mapping for the signed-in user.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";

const THREADS_TABLE = "project_threads";

function noStore(json: unknown, status = 200) {
    const res = NextResponse.json(json, { status });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
}

/**
 * POST /api/projects/move-chat
 *
 * Body: { threadId: string; projectId: string }
 *
 * - Reassigns an existing thread mapping to a different project
 *   for the current Clerk user.
 * - If no mapping exists yet, we create one (so older chats still work).
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
            console.error("JSON parse error in POST /api/projects/move-chat:", err);
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
        const rawProjectId = body?.projectId;

        const threadId =
            typeof rawThreadId === "string" ? rawThreadId.trim() : "";
        const projectId =
            typeof rawProjectId === "string" ? rawProjectId.trim() : "";

        if (!threadId || !projectId) {
            return noStore(
                {
                    ok: false,
                    reason: "missing_fields",
                    stage: "validate_body",
                    details: "threadId and projectId are required",
                },
                400
            );
        }

        const supabase = getSupabase();
        if (!supabase) {
            console.error(
                "Supabase not configured in POST /api/projects/move-chat"
            );
            return noStore(
                {
                    ok: false,
                    reason: "supabase_not_configured",
                    stage: "get_supabase_move_chat",
                },
                200
            );
        }

        // 1) Try to update an existing mapping for this user + thread
        const { data: updated, error: updateError } = await supabase
            .from(THREADS_TABLE)
            .update({ project_id: projectId })
            .eq("clerk_user_id", userId)
            .eq("thread_id", threadId)
            .select("id, project_id, thread_id, created_at");

        if (updateError) {
            console.error(
                "Supabase update error in POST /api/projects/move-chat:",
                updateError
            );
            return noStore(
                {
                    ok: false,
                    reason: "supabase_error",
                    stage: "update_mapping",
                    error: updateError.message,
                },
                500
            );
        }

        if (updated && updated.length > 0) {
            // Happy path: mapping existed and is now reassigned
            return noStore(
                {
                    ok: true,
                    mapping: updated[0],
                    mode: "updated",
                },
                200
            );
        }

        // 2) No existing mapping: create one (this can happen for older chats)
        const { data: inserted, error: insertError } = await supabase
            .from(THREADS_TABLE)
            .insert({
                clerk_user_id: userId,
                project_id: projectId,
                thread_id: threadId,
            })
            .select("id, project_id, thread_id, created_at")
            .single();

        if (insertError) {
            console.error(
                "Supabase insert error in POST /api/projects/move-chat (create mapping):",
                insertError
            );
            return noStore(
                {
                    ok: false,
                    reason: "supabase_error",
                    stage: "insert_mapping",
                    error: insertError.message,
                },
                500
            );
        }

        return noStore(
            {
                ok: true,
                mapping: inserted,
                mode: "inserted",
            },
            200
        );
    } catch (err) {
        console.error("Unhandled POST /api/projects/move-chat error:", err);
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
