// app/api/lo/invites/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export async function POST(_req: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        // --- Env vars (checked at runtime, no top-level throws) ---
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

        // 1) Find loan officer record for this Clerk user
        const { data: lo, error: loError } = await supabase
            .from("loan_officers")
            .select("id")
            .eq("clerk_user_id", userId)
            .single();

        if (loError || !lo) {
            return NextResponse.json(
                { error: "No loan officer record found for this user" },
                { status: 403 }
            );
        }

        const loanOfficerId = lo.id as string;

        // 2) Generate a short, human-shareable invite code
        const rawCode = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();

        // 3) Insert invite row for this LO
        const { data: invite, error: inviteError } = await supabase
            .from("borrower_invites")
            .insert({
                code: rawCode,
                loan_officer_id: loanOfficerId,
            })
            .select("code")
            .single();

        if (inviteError || !invite) {
            console.error("Supabase invite insert error:", inviteError);
            return NextResponse.json(
                { error: "Failed to create invite" },
                { status: 500 }
            );
        }

        const code = invite.code as string;

        // 4) Build the full onboarding URL with the invite code
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
