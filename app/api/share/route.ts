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

        const { question, answer } = body;

        if (!question && !answer) {
            return NextResponse.json({ error: "question or answer required" }, { status: 400 });
        }

        if (!supabase) {
            return NextResponse.json({ error: "Database not configured" }, { status: 500 });
        }

        // Build the target URL (the /share page with Q&A encoded)
        const base = process.env.NEXT_PUBLIC_APP_BASE_URL || "https://chat.homerates.ai";
        const params = new URLSearchParams();
        if (question) params.set("q", question);
        if (answer) params.set("a", answer);
        const targetUrl = `${base}/share?${params.toString()}`;

        // Generate a unique slug
        let slug = generateSlug();
        let attempts = 0;

        while (attempts < 5) {
            const { data: existing } = await supabase
                .from("short_links")
                .select("slug")
                .eq("slug", slug)
                .maybeSingle();

            if (!existing) break; // Slug is unique!
            slug = generateSlug(); // Try again
            attempts++;
        }

        // Save to short_links table
        const { error: insertErr } = await supabase
            .from("short_links")
            .insert({
                slug,
                target_url: targetUrl,
                created_by: userId || "anon",
                created_at: new Date().toISOString(),
            });

        if (insertErr) {
            console.error("[Share] Insert error:", insertErr.message);
            return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
        }

        const shareUrl = `${base}/s/${slug}`;
        console.log("[Share] Created:", shareUrl);

        return NextResponse.json({ ok: true, url: shareUrl, slug });

    } catch (err: any) {
        console.error("[Share] Error:", err?.message || err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}