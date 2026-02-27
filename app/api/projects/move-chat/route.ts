// ==== CREATE / REPLACE FILE: app/api/projects/move-chat/route.ts ====
// Move chat to project: updates chat_threads mapping for the signed-in user.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../../lib/supabaseServer";

const THREADS_TABLE = "chat_threads";

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

        // Upsert: if mapping exists for this user+thread (any project), update project_id.
        // If no mapping exists, create one. Handles all cases without duplicate key errors.
        const { data: upserted, error: upsertError } = await supabase
            .from(THREADS_TABLE)
            .upsert(
                {
                    clerk_user_id: userId,
                    project_id: projectId,
                    thread_id: threadId,
                },
                {
                    onConflict: "clerk_user_id, thread_id",
                    ignoreDuplicates: false, // false = update on conflict (merge)
                }
            )
            .select("id, project_id, thread_id, created_at")
            .single();

        if (upsertError) {
            console.error(
                "Supabase upsert error in POST /api/projects/move-chat:",
                upsertError
            );
            return noStore(
                {
                    ok: false,
                    reason: "supabase_error",
                    stage: "upsert_mapping",
                    error: upsertError.message,
                },
                500
            );
        }

        return noStore(
            {
                ok: true,
                mapping: upserted,
                mode: "upserted",
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