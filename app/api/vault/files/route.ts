// app/api/vault/files/route.ts
// Lists a signed-in user's stored PDFs from Supabase Storage user-vault bucket.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BUCKET = "user-vault";
const SIGNED_URL_TTL = 60 * 60; // 1 hour

function getSupabase() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
    });
}

export async function GET(_req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ ok: false, files: [] }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ ok: false, error: "Storage not configured" }, { status: 500 });

    // List files in user's folder
    const { data: objects, error } = await supabase.storage
        .from(BUCKET)
        .list(userId, { sortBy: { column: "created_at", order: "desc" } });

    if (error) {
        console.error("[vault/files] list error:", error.message);
        return NextResponse.json({ ok: false, files: [] });
    }

    if (!objects || objects.length === 0) {
        return NextResponse.json({ ok: true, files: [] });
    }

    // Generate signed download URLs
    const paths = objects.map((o) => `${userId}/${o.name}`);
    const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL);

    if (signErr) {
        console.error("[vault/files] signed URL error:", signErr.message);
        return NextResponse.json({ ok: false, files: [] });
    }

    const files = objects.map((o, i) => ({
        name: o.name,
        path: `${userId}/${o.name}`,
        created_at: o.created_at,
        size: o.metadata?.size ?? null,
        signedUrl: signed?.[i]?.signedUrl ?? null,
    }));

    return NextResponse.json({ ok: true, files });
}
