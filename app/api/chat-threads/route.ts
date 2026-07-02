// app/api/chat-threads/route.ts
// Cross-session persistence for chat history + memory thread IDs.
// GET  → returns sidebar history + memoryThreadId map for the signed-in user
// PUT  → upserts a single chat thread (title, messages, memory_thread_id)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabase } from "../../../lib/supabaseServer";

function noStore(body: any, init?: ResponseInit) {
    return NextResponse.json(body, {
        ...init,
        headers: {
            "Cache-Control": "no-store",
            ...(init?.headers ?? {}),
        },
    });
}

// ── GET /api/chat-threads ─────────────────────────────────────────────────────
// Returns: { threads: [{ chat_id, title, memory_thread_id, updated_at }] }
// Used by page.tsx on mount (signed-in) to restore sidebar + memory map.
export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return noStore({ ok: false, error: "unauthenticated" }, { status: 401 });
        }

        const chatIdParam = req.nextUrl.searchParams.get("chat_id");

        const supabase = getSupabase();
        if (!supabase) {
            return noStore({ ok: false, error: "supabase_not_configured" }, { status: 503 });
        }

        let query = supabase
            .from("chat_threads")
            .select("chat_id, title, memory_thread_id, messages, updated_at, created_at")
            .eq("clerk_user_id", userId)
            .not("chat_id", "is", null);

        if (chatIdParam) {
            query = query.eq("chat_id", chatIdParam).limit(1);
        } else {
            query = query.order("created_at", { ascending: false }).limit(50);
        }

        const { data, error } = await (query as any);

        if (error) {
            console.warn("[chat-threads GET] Supabase error:", error.message);
            return noStore({ ok: false, error: error.message }, { status: 500 });
        }

        return noStore({ ok: true, threads: data ?? [] });
    } catch (e: any) {
        console.error("[chat-threads GET] Exception:", e?.message || e);
        return noStore({ ok: false, error: "internal" }, { status: 500 });
    }
}

// ── PUT /api/chat-threads ─────────────────────────────────────────────────────
// Body: { chat_id, title, memory_thread_id, messages? }
// Upserts the row — safe to fire-and-forget from the client.
export async function PUT(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return noStore({ ok: false, error: "unauthenticated" }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const { chat_id, title, memory_thread_id, messages } = body ?? {};

        if (!chat_id || typeof chat_id !== "string") {
            return noStore({ ok: false, error: "chat_id required" }, { status: 400 });
        }

        const supabase = getSupabase();
        if (!supabase) {
            return noStore({ ok: false, error: "supabase_not_configured" }, { status: 503 });
        }

        const upsertPayload: any = {
            clerk_user_id: userId,
            chat_id,
            updated_at: new Date().toISOString(),
        };

        if (title && typeof title === "string") upsertPayload.title = title.slice(0, 200);
        if (memory_thread_id && typeof memory_thread_id === "string") upsertPayload.memory_thread_id = memory_thread_id;
        if (Array.isArray(messages)) upsertPayload.messages = messages;

        // Upsert on (clerk_user_id, chat_id) — this unique constraint must exist.
        // If the table uses a different conflict target adjust onConflict below.
        const { error } = await supabase
            .from("chat_threads")
            .upsert(upsertPayload, { onConflict: "clerk_user_id,chat_id" })

        if (error) {
            // Non-fatal: log and return so client doesn't crash
            console.warn("[chat-threads PUT] Supabase error:", error.message);
            return noStore({ ok: false, error: error.message }, { status: 500 });
        }

        return noStore({ ok: true });
    } catch (e: any) {
        console.error("[chat-threads PUT] Exception:", e?.message || e);
        return noStore({ ok: false, error: "internal" }, { status: 500 });
    }
}

// version: 2026-03-08-02