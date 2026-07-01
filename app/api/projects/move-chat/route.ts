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

        // IMPORTANT: We only update project_id — never delete or re-insert the row.
        // The chat_threads row also holds memory_thread_id which links to the full
        // conversation memory. Deleting it would orphan the memory history permanently.
        //
        // Strategy:
        // 1) Update by thread_id (legacy identifier used by move-chat)
        // 2) If 0 rows matched, try by chat_id (newer identifier, same value as thread_id in most cases)
        // 3) If still 0 rows, insert a new minimal row (no memory yet — will be created on next chat turn)

        // Step 1: update by thread_id
        const { data: updatedByThread, error: updateThreadError } = await supabase
            .from(THREADS_TABLE)
            .update({ project_id: projectId, updated_at: new Date().toISOString() })
            .eq("clerk_user_id", userId)
            .eq("thread_id", threadId)
            .select("id, project_id, thread_id, chat_id, memory_thread_id, created_at");

        if (updateThreadError) {
            console.error("move-chat: update by thread_id error:", updateThreadError);
            return noStore({ ok: false, reason: "supabase_error", stage: "update_by_thread_id", error: updateThreadError.message }, 500);
        }

        if (updatedByThread && updatedByThread.length > 0) {
            await supabase.from("chats").update({ project_id: projectId, updated_at: new Date().toISOString() }).eq("clerk_user_id", userId).eq("id", threadId);
            return noStore({ ok: true, mapping: updatedByThread[0], mode: "updated_by_thread_id" }, 200);
        }

        // Step 2: update by chat_id (thread_id and chat_id are often the same value)
        const { data: updatedByChat, error: updateChatError } = await supabase
            .from(THREADS_TABLE)
            .update({ project_id: projectId, updated_at: new Date().toISOString() })
            .eq("clerk_user_id", userId)
            .eq("chat_id", threadId)
            .select("id, project_id, thread_id, chat_id, memory_thread_id, created_at");

        if (updateChatError) {
            console.error("move-chat: update by chat_id error:", updateChatError);
            return noStore({ ok: false, reason: "supabase_error", stage: "update_by_chat_id", error: updateChatError.message }, 500);
        }

        if (updatedByChat && updatedByChat.length > 0) {
            await supabase.from("chats").update({ project_id: projectId, updated_at: new Date().toISOString() }).eq("clerk_user_id", userId).eq("id", threadId);
            return noStore({ ok: true, mapping: updatedByChat[0], mode: "updated_by_chat_id" }, 200);
        }

        // Step 3: no existing row — insert minimal row. memory_thread_id will be
        // created automatically on the next chat turn by answers/route.ts.
        // Use ON CONFLICT DO NOTHING to safely handle any race conditions.
        const { data: inserted, error: insertError } = await supabase
            .from(THREADS_TABLE)
            .insert({
                clerk_user_id: userId,
                project_id: projectId,
                thread_id: threadId,
                chat_id: threadId, // thread_id and chat_id are the same for new rows
                updated_at: new Date().toISOString(),
            })
            .select("id, project_id, thread_id, chat_id, memory_thread_id, created_at")
            .single();

        if (insertError) {
            // If we still hit a duplicate, it means a concurrent request beat us.
            // Retry update by chat_id one more time to return the current state.
            if (insertError.code === "23505") {
                const { data: retryData } = await supabase
                    .from(THREADS_TABLE)
                    .update({ project_id: projectId, updated_at: new Date().toISOString() })
                    .eq("clerk_user_id", userId)
                    .eq("chat_id", threadId)
                    .select("id, project_id, thread_id, chat_id, memory_thread_id, created_at");
                await supabase.from("chats").update({ project_id: projectId, updated_at: new Date().toISOString() }).eq("clerk_user_id", userId).eq("id", threadId);
                return noStore({ ok: true, mapping: retryData?.[0] ?? null, mode: "retry_after_conflict" }, 200);
            }
            console.error("move-chat: insert error:", insertError);
            return noStore({ ok: false, reason: "supabase_error", stage: "insert_mapping", error: insertError.message }, 500);
        }

        await supabase.from("chats").update({ project_id: projectId, updated_at: new Date().toISOString() }).eq("clerk_user_id", userId).eq("id", threadId);
        return noStore({ ok: true, mapping: inserted, mode: "inserted" }, 200);
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