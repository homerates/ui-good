// ==== REPLACE ENTIRE FILE: app/api/library/route.ts ====
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
// Relative import to match your repo structure
import { getSupabase } from "../../../lib/supabaseServer";

const TABLE = "user_answers";

function noStore(json: unknown, status = 200) {
    const res = NextResponse.json(json, { status });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
}

/**
 * GET: return last 20 saved answers for this user
 */
export async function GET(_req: NextRequest) {
    try {
        // --- Stage 1: Clerk auth ---
        let userId: string | null = null;
        try {
            const a = await auth();
            userId = a.userId;
        } catch (err) {
            console.error("Clerk auth error in GET /api/library:", err);
            return noStore(
                {
                    ok: false,
                    reason: "clerk_auth_error",
                    stage: "auth_get",
                    message: err instanceof Error ? err.message : String(err),
                },
                500
            );
        }

        if (!userId) {
            return noStore({ ok: true, entries: [] });
        }

        // --- Stage 2: Supabase client ---
        const supabase = getSupabase();
        if (!supabase) {
            console.error("Supabase not configured in GET /api/library");
            return noStore(
                {
                    ok: false,
                    reason: "supabase_not_configured",
                    stage: "get_supabase_get",
                },
                200
            );
        }

        // --- Stage 3: Supabase query ---
        const { data, error } = await supabase
            .from(TABLE)
            .select("id, created_at, question, answer")
            .eq("clerk_user_id", userId)
            .order("created_at", { ascending: false })
            .limit(20);

        if (error) {
            console.error("Supabase GET error in /api/library:", error);
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

        return noStore({ ok: true, entries: data ?? [] });
    } catch (err) {
        console.error("Unhandled GET /api/library error:", err);
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
 * POST: save a user question + answer
 */
export async function POST(req: NextRequest) {
    try {
        // --- Stage 1: Clerk auth ---
        let userId: string | null = null;
        try {
            const a = await auth();
            userId = a.userId;
        } catch (err) {
            console.error("Clerk auth error in POST /api/library:", err);
            return noStore(
                {
                    ok: false,
                    reason: "clerk_auth_error",
                    stage: "auth_post",
                    message: err instanceof Error ? err.message : String(err),
                },
                500
            );
        }

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

        // --- Stage 2: parse body ---
        let body: any;
        try {
            body = await req.json();
        } catch (err) {
            console.error("JSON parse error in POST /api/library:", err);
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

        const { question, answer } = body;
        if (!question || !answer) {
            return noStore(
                {
                    ok: false,
                    reason: "missing_fields",
                    stage: "validate_body",
                    details: "question + answer required",
                },
                400
            );
        }

        // --- Stage 3: Supabase client ---
        const supabase = getSupabase();
        if (!supabase) {
            console.error("Supabase not configured in POST /api/library");
            return noStore(
                {
                    ok: false,
                    reason: "supabase_not_configured",
                    stage: "get_supabase_post",
                },
                200
            );
        }

        // --- Stage 4: Supabase insert ---
        const { data, error } = await supabase
            .from(TABLE)
            .insert({
                clerk_user_id: userId,
                question,
                // Stored as jsonb in your table
                answer,
            })
            .select()
            .single();

        if (error) {
            console.error("Supabase POST error in /api/library:", error);
            return noStore(
                {
                    ok: false,
                    reason: "supabase_error",
                    stage: "insert_post",
                    error: error.message,
                },
                500
            );
        }

        return noStore({ ok: true, entry: data }, 201);
    } catch (err) {
        console.error("Unhandled POST /api/library error:", err);
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
