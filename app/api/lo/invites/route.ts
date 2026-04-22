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

        // 3) Resolve professional — LO or Agent
        const [loRes, agentRes] = await Promise.all([
            supabase.from("loan_officers").select("id").eq("user_id", userId).maybeSingle(),
            supabase.from("agents").select("id").eq("user_id", userId).maybeSingle(),
        ]);

        if (!loRes.data && !agentRes.data) {
            return NextResponse.json(
                { error: "No professional profile found for this user" },
                { status: 403 }
            );
        }

        const loanOfficerId = loRes.data?.id ?? null;

        // 4) Generate a unique invite code
        const code = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();

        // 5) Insert invite code — created_by_loan_officer is null for agents (nullable)
        const { data: invite, error: inviteError } = await supabase
            .from("invite_codes")
            .insert({
                code,
                created_by_loan_officer: loanOfficerId,
                target_plan: "borrower-onboarding",
                max_uses: 1,
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
