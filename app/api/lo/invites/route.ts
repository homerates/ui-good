// app/api/lo/invites/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export async function POST(_req: NextRequest) {
    try {
        // 1) Who is the current Clerk user?
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "Not authenticated" },
                { status: 401 }
            );
        }

        // 2) Env vars – must be set in this project
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const appBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL; // should be https://chat.homerates.ai

        if (!supabaseUrl || !supabaseServiceKey || !appBaseUrl) {
            console.error(
                "Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or NEXT_PUBLIC_APP_BASE_URL"
            );
            return NextResponse.json(
                { error: "Server configuration error" },
                { status: 500 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const baseUrl = appBaseUrl.replace(/\/+$/, "");

        // 3) Generate a human-shareable invite code
        const code = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();

        // 4) Insert invite row into your existing invite_codes table
        const { data: invite, error: inviteError } = await supabase
            .from("invite_codes") // <-- your actual table
            .insert({
                code,
                user_id: userId, // <-- matches the column name in your screenshot
            })
            .select("code")
            .single();

        if (inviteError || !invite) {
            console.error("Supabase invite insert error:", inviteError);
            return NextResponse.json(
                {
                    error: "Failed to create invite",
                    debug: inviteError?.message ?? null,
                },
                { status: 500 }
            );
        }

        // 5) Build onboarding URL for the borrower
        const inviteUrl = `${baseUrl}/onboarding?invite=${encodeURIComponent(
            code
        )}`;

        return NextResponse.json(
            {
                ok: true,
                code,
                inviteUrl,
            },
            { status: 200 }
        );
    } catch (err) {
        console.error("Create LO invite error:", err);
        return NextResponse.json(
            { error: "Unexpected error creating invite" },
            { status: 500 }
        );
    }
}
