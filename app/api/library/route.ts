// ==== REPLACE ENTIRE FILE: app/api/library/route.ts ====
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getSupabase } from "../../../lib/supabaseServer";

const TABLE = "user_answers";
const THREADS_TABLE = "memory_threads";

function noStore(json: unknown, status = 200) {
    const res = NextResponse.json(json, { status });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
}

function isUuid(v: unknown): v is string {
    if (typeof v !== "string") return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        v.trim()
    );
}

async function ensureMemoryThreadId(opts: {
    supabase: any;
    clerkUserId: string;
    incomingThreadId?: unknown;
    incomingProjectId?: unknown;
    incomingTitle?: unknown;
}) {
    const { supabase, clerkUserId, incomingThreadId, incomingProjectId, incomingTitle } = opts;

    // 1) Use incoming valid UUID if provided
    if (isUuid(incomingThreadId)) return incomingThreadId;

    // 2) Otherwise create a new memory thread row
    // Title/project are optional. Keep it minimal & resilient.
    try {
        const payload: any = { clerk_user_id: clerkUserId };

        if (isUuid(incomingProjectId)) payload.project_id = incomingProjectId;
        if (typeof incomingTitle === "string" && incomingTitle.trim()) payload.title = incomingTitle.trim();

        const { data, error } = await supabase
            .from(THREADS_TABLE)
            .insert(payload)
            .select("id")
            .single();

        if (error) throw error;
        if (data?.id && isUuid(data.id)) return data.id;

        return null;
    } catch (e: any) {
        console.error("LIBRARY: memory thread create failed:", e?.message || e);
        return null;
    }
}

/**
 * GET: return last 20 saved answers for this signed-in user
 * Optional filter: ?memory_thread_id=<uuid>
 */
export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) return noStore({ ok: true, entries: [] });

        const supabase = getSupabase();
        if (!supabase) {
            console.error("Supabase not configured in GET /api/library");
            return noStore(
                { ok: false, reason: "supabase_not_configured", stage: "get_supabase_get" },
                200
            );
        }

        const threadIdParam = req.nextUrl.searchParams.get("memory_thread_id");
        const threadId = isUuid(threadIdParam) ? threadIdParam : null;

        let q = supabase
            .from(TABLE)
            .select(
                "id, created_at, clerk_user_id, email, full_name, question, answer, answer_summary, app_version, model, tool_id, role, memory_thread_id"
            )
            .eq("clerk_user_id", userId)
            .order("created_at", { ascending: false })
            .limit(20);

        if (threadId) q = q.eq("memory_thread_id", threadId);

        const { data, error } = await q;

        if (error) {
            console.error("Supabase GET error in /api/library:", error);
            return noStore(
                { ok: false, reason: "supabase_error", stage: "query_get", error: error.message },
                500
            );
        }

        return noStore({ ok: true, entries: data ?? [], memory_thread_id: threadId });
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
 * POST: save a question + answer for this signed-in user
 *
 * Accepts optional fields:
 * - memory_thread_id (uuid) OR memoryThreadId
 * - project_id (uuid)
 * - title (string) to label the thread (optional)
 * - tool_id (string)
 * - role ("user" | "assistant")
 * - model (string)
 * - answer_summary (string)
 */
export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return noStore({ ok: false, reason: "not_authenticated", stage: "auth_post" }, 401);
        }

        // Pull profile info from Clerk
        const user = await currentUser().catch((err) => {
            console.error("currentUser() error in POST /api/library:", err);
            return null;
        });

        const primaryEmail =
            user?.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
            user?.emailAddresses?.[0]?.emailAddress ??
            null;

        const fullName =
            user?.firstName || user?.lastName
                ? `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim()
                : user?.username ?? null;

        // app version, if available
        const appVersion =
            process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
            process.env.NEXT_PUBLIC_APP_VERSION ??
            null;

        // Parse body
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
                { ok: false, reason: "missing_fields", stage: "validate_body", details: "question + answer required" },
                400
            );
        }

        const supabase = getSupabase();
        if (!supabase) {
            console.error("Supabase not configured in POST /api/library");
            return noStore({ ok: false, reason: "supabase_not_configured", stage: "get_supabase_post" }, 200);
        }

        // Memory thread id: accept from body/header/query OR create new
        const incomingThreadId =
            body?.memory_thread_id ??
            body?.memoryThreadId ??
            req.headers.get("x-memory-thread-id") ??
            req.nextUrl.searchParams.get("memory_thread_id") ??
            null;

        const incomingProjectId = body?.project_id ?? body?.projectId ?? null;
        const incomingTitle = body?.title ?? null;

        const memoryThreadId = await ensureMemoryThreadId({
            supabase,
            clerkUserId: userId,
            incomingThreadId,
            incomingProjectId,
            incomingTitle,
        });

        // Normalize optional fields
        const toolId = typeof body?.tool_id === "string" && body.tool_id.trim() ? body.tool_id.trim() : "library_route";
        const role =
            body?.role === "user" || body?.role === "assistant"
                ? body.role
                : "assistant";

        const model = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : null;

        const answerSummary =
            typeof body?.answer_summary === "string" && body.answer_summary.trim()
                ? body.answer_summary.trim()
                : null;

        // IMPORTANT:
        // - Your DB column is jsonb. Do NOT stringify here.
        // - If caller passes a string, we attempt to parse JSON; otherwise store as-is.
        let answerJson: any = answer;
        if (typeof answer === "string") {
            try {
                const parsed = JSON.parse(answer);
                answerJson = parsed;
            } catch {
                // keep string as-is (still valid jsonb)
                answerJson = answer;
            }
        }

        const insertPayload: any = {
            clerk_user_id: userId,
            email: primaryEmail,
            full_name: fullName,
            app_version: appVersion,
            question,
            answer: answerJson,
            tool_id: toolId,
            role,
            model,
        };

        // Only add nullable fields if present (prevents accidental overwrite)
        if (answerSummary) insertPayload.answer_summary = answerSummary;
        if (memoryThreadId) insertPayload.memory_thread_id = memoryThreadId;
        if (isUuid(incomingProjectId)) insertPayload.project_id = incomingProjectId;

        const { data, error } = await supabase.from(TABLE).insert(insertPayload).select().single();

        if (error) {
            console.error("Supabase POST error in /api/library:", error);
            return noStore(
                { ok: false, reason: "supabase_error", stage: "insert_post", error: error.message },
                500
            );
        }

        return noStore({ ok: true, entry: data, memory_thread_id: memoryThreadId }, 201);
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
