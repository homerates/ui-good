// app/api/onboarding/complete/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
        "Missing SUPABASE env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

type OnboardingPayload = {
    inviteCode: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    state?: string;
    postalCode?: string;
};

export async function POST(req: NextRequest) {
    try {
        // 1) Clerk user (borrower) – we don't store this yet, just require login
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "Not authenticated" },
                { status: 401 }
            );
        }

        // 2) Parse body from onboarding form
        const body = (await req.json()) as Partial<OnboardingPayload>;
        const { inviteCode, firstName, lastName, email, phone, state, postalCode } =
            body;

        if (!inviteCode) {
            return NextResponse.json(
                { error: "Missing inviteCode" },
                { status: 400 }
            );
        }

        if (!firstName || !lastName || !email) {
            return NextResponse.json(
                { error: "Missing required borrower fields" },
                { status: 400 }
            );
        }

        const fullName = `${firstName} ${lastName}`.trim();

        // 3) Look up invite in invite_codes using `code`
        const { data: invite, error: inviteError } = await supabase
            .from("invite_codes")
            .select(
                "id, code, created_by_loan_officer, max_uses, used_count, expires_at"
            )
            .eq("code", inviteCode)
            .eq("target_plan", "borrower-onboarding")
            .maybeSingle();

        if (inviteError) {
            console.error("invite_codes lookup error:", inviteError);
            return NextResponse.json(
                {
                    error: "Invalid invite code",
                    debug: inviteError.message ?? null,
                },
                { status: 404 }
            );
        }

        if (!invite) {
            return NextResponse.json(
                { error: "Invalid invite code" },
                { status: 404 }
            );
        }

        // Basic expiry / usage rules
        if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
            return NextResponse.json(
                { error: "Invite code has expired" },
                { status: 410 }
            );
        }

        const usedCount = invite.used_count ?? 0;
        const maxUses = invite.max_uses ?? 1;

        if (usedCount >= maxUses) {
            return NextResponse.json(
                { error: "Invite code already used" },
                { status: 409 }
            );
        }

        const loanOfficerId = invite.created_by_loan_officer as string | null;

        if (!loanOfficerId) {
            return NextResponse.json(
                { error: "Invite is not linked to a loan officer" },
                { status: 422 }
            );
        }

        // 4) Create borrower row using your actual schema
        const { data: newBorrower, error: insertBorrowerError } = await supabase
            .from("borrowers")
            .insert({
                loan_officer_id: loanOfficerId, // NOT NULL
                name: fullName,                 // NOT NULL
                email,
                first_name: firstName,
                last_name: lastName,
                phone: phone ?? null,
                state: state ?? null,
                postal_code: postalCode ?? null,
                source: "invite-link",
                // status defaults to 'lead'
                // created_at / updated_at handled by defaults + trigger
                external_ref: userId, // store Clerk user id here if you like
            })
            .select("id")
            .single();

        if (insertBorrowerError || !newBorrower) {
            console.error("Insert borrower error:", insertBorrowerError);
            return NextResponse.json(
                {
                    error: "Failed to create borrower",
                    debug: insertBorrowerError?.message ?? null,
                },
                { status: 500 }
            );
        }

        const borrowerId = newBorrower.id as string;

        // 5) Increment used_count on invite
        const { error: updateInviteError } = await supabase
            .from("invite_codes")
            .update({
                used_count: usedCount + 1,
            })
            .eq("id", invite.id);

        if (updateInviteError) {
            console.error("Update invite error:", updateInviteError);
            return NextResponse.json(
                {
                    error: "Failed to update invite",
                    debug: updateInviteError.message ?? null,
                },
                { status: 500 }
            );
        }

        // 6) Done – client can redirect to success/dashboard
        return NextResponse.json(
            {
                ok: true,
                borrowerId,
            },
            { status: 200 }
        );
    } catch (err) {
        console.error("Onboarding complete error:", err);
        return NextResponse.json(
            { error: "Unexpected error completing onboarding" },
            { status: 500 }
        );
    }
}
