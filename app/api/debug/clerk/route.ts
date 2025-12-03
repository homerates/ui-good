// app/api/debug/clerk/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function GET(_req: NextRequest) {
    try {
        const { userId, sessionId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "Not authenticated" },
                { status: 401 }
            );
        }

        return NextResponse.json(
            {
                userId,
                sessionId,
            },
            { status: 200 }
        );
    } catch (err) {
        console.error("Debug clerk route error:", err);
        return NextResponse.json(
            { error: "Unexpected error" },
            { status: 500 }
        );
    }
}
