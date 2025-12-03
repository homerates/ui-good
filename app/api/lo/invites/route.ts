// app/api/lo/invites/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(_req: NextRequest) {
    try {
        // 1) Identify current Clerk user (the LO)
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "Not authenticated" },
                { status: 401 }
            );
        }

        // 2) Env vars – for this app they should be:
        // NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_APP_BASE_URL=https://chat.homerates.ai
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const appBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL;

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

        // 3) One invite_codes row per LO, keyed by user_id
        // First, see if one already exists for this LO
        const { data: existing, error: existingError } = await supabase
            .from("invite_codes")
            .select("id")
            .eq("user_id", userId)
            .maybeSingle();

        if (existingError) {
            console.error("invite_codes lookup error:", existingError);
        }

        let inviteId: string;

        if (existing && existing.id) {
            // Reuse existing invite for this LO
            inviteId = existing.id as string;
        } else {
            // 4) No existing invite row – create exactly one for this LO
            const { data: created, error: createError } = await supabase
                .from("invite_codes")
                .insert({
                    user_id: userId, // matches your screenshot
                })
                .select("id")
                .single();

            if (createError || !created) {
                console.error("invite_codes insert error:", createError);
                return NextResponse.json(
                    {
                        error: "Failed to create invite",
                        debug: createError?.message ?? null,
                    },
                    { status: 500 }
                );
            }

            inviteId = created.id as string;
        }

        // 5) Build onboarding URL using invite_codes.id as the token
        const inviteUrl = `${baseUrl}/onboarding?invite=${encodeURIComponent(
            inviteId
        )}`;

        return NextResponse.json(
            {
                ok: true,
                code: inviteId,
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
