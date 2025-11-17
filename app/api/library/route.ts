// ==== REPLACE ENTIRE FILE: app/api/library/route.ts ====
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "@/lib/supabaseServer";

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
    const { userId } = auth();

    if (!userId) {
        return noStore({ ok: true, entries: [] });
    }

    const supabase = getSupabase();
    if (!supabase) {
        return noStore(
            { ok: false, reason: "supabase_not_configured", entries: [] },
            200
        );
    }

    const { data, error } = await supabase
        .from(TABLE)
        .select("id, created_at, question, answer")
        .eq("clerk_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);

    if (error) {
        console.error("Supabase GET error:", error);
        return noStore(
            { ok: false, reason: "supabase_error", error: error.message },
            500
        );
    }

    return noStore({ ok: true, entries: data ?? [] });
}

/**
 * POST: save a user question + answer
 */
export async function POST(req: NextRequest) {
    const { userId } = auth();

    if (!userId) {
        return noStore({ ok: false, reason: "not_authenticated" }, 401);
    }

    const supabase = getSupabase();
    if (!supabase) {
        return noStore({ ok: false, reason: "supabase_not_configured" }, 200);
    }

    let body: any;
    try {
        body = await req.json();
    } catch {
        return noStore({ ok: false, reason: "invalid_json" }, 400);
    }

    const { question, answer } = body;
    if (!question || !answer) {
        return noStore(
            { ok: false, reason: "missing_fields", details: "question + answer required" },
            400
        );
    }

    const { data, error } = await supabase
        .from(TABLE)
        .insert({
            clerk_user_id: userId,
            question,
            answer, // JSONB — ok to store raw structured answer
        })
        .select()
        .single();

    if (error) {
        console.error("Supabase POST error:", error);
        return noStore(
            { ok: false, reason: "supabase_error", error: error.message },
            500
        );
    }

    return noStore({ ok: true, entry: data }, 201);
}
