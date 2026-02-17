// app/api/share/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

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

function generateSlug(length = 7): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let slug = "";
    for (let i = 0; i < length; i++) {
        slug += chars[Math.floor(Math.random() * chars.length)];
    }
    return slug;
}

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        const body = await req.json();
        const { messages, title } = body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json({ error: "messages array required" }, { status: 400 });
        }

        if (!supabase) {
            return NextResponse.json({ error: "Database not configured" }, { status: 500 });
        }

        // Generate a unique slug
        let slug = generateSlug();
        let attempts = 0;

        while (attempts < 5) {
            const { data: existing } = await supabase
                .from("shared_threads")
                .select("slug")
                .eq("slug", slug)
                .maybeSingle();

            if (!existing) break;
            slug = generateSlug();
            attempts++;
        }

        // Save full thread to shared_threads table
        const { error: insertErr } = await supabase
            .from("shared_threads")
            .insert({
                slug,
                clerk_user_id: userId || "anon",
                messages,
                created_at: new Date().toISOString(),
            });

        if (insertErr) {
            console.error("[Share] Insert error:", insertErr.message);
            return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
        }

        const base = process.env.NEXT_PUBLIC_APP_BASE_URL || "https://chat.homerates.ai";
        const shareUrl = `${base}/s/${slug}`;
        console.log("[Share] Created:", shareUrl, "by:", userId || "anon");

        return NextResponse.json({ ok: true, url: shareUrl, slug });

    } catch (err: any) {
        console.error("[Share] Error:", err?.message || err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}