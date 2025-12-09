// app/api/legal-event/route.ts

import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => null);
        const type = body?.type ?? "unknown";
        const ts = body?.ts ?? new Date().toISOString();

        // For now, just log to server console.
        // Later, you can insert this into Supabase for full audit history.
        console.log("[LegalEvent]", { type, ts });

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[LegalEvent] error", err);
        return NextResponse.json({ ok: false }, { status: 400 });
    }
}
