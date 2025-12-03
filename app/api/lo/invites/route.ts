// app/api/lo/invites/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

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

        // 3) First, try to find an existing invite_codes row for this LO
        const { data: existing, error: existingError } = await supabase
            .from("invite_codes")
            .select("id")
            .eq("user_id", userId)
            .maybeSingle();

        if (existingError) {
            console.error("Supabase invite_codes lookup error:", existingError);
        }

        let inviteId: string;

        if (existing && existing.id) {
            // Reuse existing invite for this LO
            inviteId = existing.id as string;
        } else {
            // 4) No existing row – create one new invite_codes row for this LO
            const { data: created, error: createError } = await supabase
                .from("invite_codes")
                .insert({
                    user_id: userId,
                })
                .select("id")
                .single();

            if (createError || !created) {
                console.error("Supabase invite_codes insert error:", createError);
                return NextResponse.json(
                    { error: "Failed to create invite" },
                    { status: 500 }
                );
            }

            inviteId = created.id as string;
        }

        // 5) Build onboarding URL for the borrower using the invite_codes.id
        const inviteUrl = `${baseUrl}/onboarding?invite=${encodeURIComponent(
            inviteId
        )}`;

        // We return inviteId as "code" so the UI can show something
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
