// app/api/share/load/route.ts
// Public endpoint - no auth required - loads shared thread messages
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase =
    SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false },
        })
        : null;

export async function GET(req: NextRequest) {
    try {
        const slug = req.nextUrl.searchParams.get("slug");

        if (!slug) {
            return NextResponse.json({ error: "slug required" }, { status: 400 });
        }

        if (!supabase) {
            return NextResponse.json({ error: "Database not configured" }, { status: 500 });
        }

        const { data, error } = await supabase
            .from("shared_threads")
            .select("slug, messages, created_at")
            .eq("slug", slug)
            .maybeSingle();

        if (error || !data) {
            console.warn("[Share Load] Not found:", slug, error?.message);
            return NextResponse.json({ error: "Shared thread not found" }, { status: 404 });
        }

        console.log("[Share Load] Loaded thread:", slug, "messages:", data.messages?.length);

        return NextResponse.json({
            ok: true,
            messages: data.messages,
            created_at: data.created_at,
        });

    } catch (err: any) {
        console.error("[Share Load] Error:", err?.message || err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
