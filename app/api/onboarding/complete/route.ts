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

// Match your form payload
type OnboardingPayload = {
    inviteCode: string;
    firstName: string;
    lastName: string;
    email: string;
};

export async function POST(req: NextRequest) {
    try {
        // 1) Get current Clerk user (borrower)
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "Not authenticated" },
                { status: 401 }
            );
        }

        // 2) Parse body
        const body = (await req.json()) as Partial<OnboardingPayload>;
        const { inviteCode, firstName, lastName, email } = body;

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

        // 3) Look up invite in *invite_codes* (your real schema)
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
                { error: "Invalid invite code" },
                { status: 404 }
            );
        }

        if (!invite) {
            return NextResponse.json(
                { error: "Invalid invite code" },
                { status: 404 }
            );
        }

        // Basic expiry / usage checks
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

        // 4) Check if this Clerk user already has a borrower record
        const { data: existingBorrower, error: existingBorrowerError } =
            await supabase
                .from("borrowers")
                .select("id, loan_officer_id")
                .eq("clerk_user_id", userId)
                .maybeSingle();

        if (existingBorrowerError) {
            console.error("Existing borrower lookup error:", existingBorrowerError);
            return NextResponse.json(
                { error: "Error checking existing borrower" },
                { status: 500 }
            );
        }

        let borrowerId: string;

        if (existingBorrower) {
            // Update existing borrower if they don't yet have an LO
            if (!existingBorrower.loan_officer_id) {
                const { error: updateBorrowerError } = await supabase
                    .from("borrowers")
                    .update({
                        loan_officer_id: loanOfficerId,
                        first_name: firstName,
                        last_name: lastName,
                        email,
                    })
                    .eq("id", existingBorrower.id);

                if (updateBorrowerError) {
                    console.error("Update borrower error:", updateBorrowerError);
                    return NextResponse.json(
                        { error: "Failed to update borrower" },
                        { status: 500 }
                    );
                }
            }

            borrowerId = existingBorrower.id as string;
        } else {
            // Create a new borrower
            const { data: newBorrower, error: insertBorrowerError } = await supabase
                .from("borrowers")
                .insert({
                    clerk_user_id: userId,
                    loan_officer_id: loanOfficerId,
                    first_name: firstName,
                    last_name: lastName,
                    email,
                })
                .select("id")
                .single();

            if (insertBorrowerError || !newBorrower) {
                console.error("Insert borrower error:", insertBorrowerError);
                return NextResponse.json(
                    { error: "Failed to create borrower" },
                    { status: 500 }
                );
            }

            borrowerId = newBorrower.id as string;
        }

        // 5) Mark invite as used (increment used_count)
        const { error: updateInviteError } = await supabase
            .from("invite_codes")
            .update({
                used_count: usedCount + 1,
            })
            .eq("id", invite.id);

        if (updateInviteError) {
            console.error("Update invite error:", updateInviteError);
            return NextResponse.json(
                { error: "Failed to update invite" },
                { status: 500 }
            );
        }

        // 6) Return borrowerId to the client
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
