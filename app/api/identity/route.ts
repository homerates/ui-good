// app/api/identity/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function GET(_req: NextRequest) {
    try {
        const { userId, sessionClaims } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "Not authenticated" },
                { status: 401 }
            );
        }

        // If we later store role in session claims / metadata,
        // we can read it here. For now, just show what's available.
        const rawClaims = sessionClaims || {};

        return NextResponse.json(
            {
                clerk: {
                    userId,
                    sessionClaims: rawClaims,
                },
                supabase: {
                    note:
                        "Supabase lookup intentionally omitted for now to keep this endpoint stable."
                }
            },
            { status: 200 }
        );
    } catch (err: any) {
        console.error("Minimal identity route error:", err);
        return NextResponse.json(
            { error: "Failed to load identity snapshot (minimal)" },
            { status: 500 }
        );
    }
}
