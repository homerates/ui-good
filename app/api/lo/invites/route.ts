// app/api/lo/invites/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export async function POST(_req: NextRequest) {
    try {
        // 1) Who is the current Clerk user (LO)?
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
        const appBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL; // e.g. https://chat.homerates.ai

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

        // 3) Find this loan officer's row by Clerk userId
        const { data: lo, error: loError } = await supabase
            .from("loan_officers")
            .select("id")
            .eq("user_id", userId)
            .maybeSingle();

        if (loError) {
            console.error("loan_officers lookup error:", loError, {
                clerkUserId: userId,
            });
            return NextResponse.json(
                { error: "Failed to create invite" },
                { status: 500 }
            );
        }

        if (!lo) {
            return NextResponse.json(
                {
                    error: "No loan officer record found for this user",
                    debug: { clerkUserId: userId },
                },
                { status: 403 }
            );
        }

        const loanOfficerId = lo.id as string;

        // 4) Generate a unique invite code (text)
        const code = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();

        // 5) Insert into invite_codes using your actual schema:
        // id (auto), code, created_by_loan_officer, target_plan, max_uses, used_count, etc.
        const { data: invite, error: inviteError } = await supabase
            .from("invite_codes")
            .insert({
                code,
                created_by_loan_officer: loanOfficerId,
                target_plan: "borrower-onboarding", // any non-null text is valid
                max_uses: 1, // single-use; adjust if you want multi-use later
            })
            .select("code")
            .single();

        if (inviteError || !invite) {
            console.error("invite_codes insert error:", inviteError);
            return NextResponse.json(
                {
                    error: "Failed to create invite",
                    debug: inviteError?.message ?? null,
                },
                { status: 500 }
            );
        }

        const finalCode = invite.code as string;

        // 6) Build onboarding URL using the *code* field
        const inviteUrl = `${baseUrl}/onboarding?invite=${encodeURIComponent(
            finalCode
        )}`;

        return NextResponse.json(
            {
                ok: true,
                code: finalCode,
                inviteUrl,
            },
            { status: 200 }
        );
    } catch (err) {
        console.error("Create LO invite error:", err);
        return NextResponse.json(
            { error: "Failed to create invite" },
            { status: 500 }
        );
    }
}
