// ==== CREATE / REPLACE FILE: app/api/projects/threads-map/route.ts ====
// Returns a simple mapping of project_id -> [thread_id, ...] for the signed-in user.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
// NOTE: this path is 4 levels up (same as move-chat route)
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
 * GET /api/projects/threads-map
 *
 * Response:
 * {
 *   ok: true,
 *   map: {
 *     "<project_id>": ["threadId1", "threadId2", ...],
 *     ...
 *   }
 * }
 */
export async function GET(_req: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            // Not signed in → empty map
            return noStore({ ok: true, map: {} });
        }

        const supabase = getSupabase();
        if (!supabase) {
            console.error("Supabase not configured in GET /api/projects/threads-map");
            return noStore(
                {
                    ok: false,
                    reason: "supabase_not_configured",
                    stage: "get_supabase_threads_map",
                },
                200
            );
        }

        const { data, error } = await supabase
            .from(THREADS_TABLE)
            .select("project_id, thread_id")
            .eq("clerk_user_id", userId);

        if (error) {
            console.error(
                "Supabase GET error in /api/projects/threads-map:",
                error
            );
            return noStore(
                {
                    ok: false,
                    reason: "supabase_error",
                    stage: "query_threads_map",
                    error: error.message,
                },
                500
            );
        }

        const map: Record<string, string[]> = {};

        for (const row of data ?? []) {
            const pid = (row as any).project_id as string | null;
            const tid = (row as any).thread_id as string | null;
            if (!pid || !tid) continue;

            if (!map[pid]) map[pid] = [];
            map[pid].push(tid);
        }

        return noStore({ ok: true, map }, 200);
    } catch (err) {
        console.error("Unhandled GET /api/projects/threads-map error:", err);
        return noStore(
            {
                ok: false,
                reason: "unhandled_error",
                stage: "threads_map_outer",
                message: err instanceof Error ? err.message : String(err),
            },
            500
        );
    }
}
