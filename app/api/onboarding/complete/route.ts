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

// Types for request body – adjust fields to match your form
type OnboardingPayload = {
    inviteCode: string;
    firstName: string;
    lastName: string;
    email: string;
    // Add any other onboarding form fields here (phone, goals, etc.)
};

export async function POST(req: NextRequest) {
    try {
        // 1) Get current Clerk user
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

        // 3) Look up invite and LO
        const { data: invite, error: inviteError } = await supabase
            .from("borrower_invites") // adjust table name if needed
            .select("id, code, loan_officer_id, used_at, borrower_id")
            .eq("code", inviteCode)
            .single();

        if (inviteError || !invite) {
            return NextResponse.json(
                { error: "Invalid invite code" },
                { status: 404 }
            );
        }

        if (invite.used_at || invite.borrower_id) {
            return NextResponse.json(
                { error: "Invite code already used" },
                { status: 409 }
            );
        }

        const loanOfficerId = invite.loan_officer_id;

        if (!loanOfficerId) {
            return NextResponse.json(
                { error: "Invite is not linked to a loan officer" },
                { status: 422 }
            );
        }

        // 4) Check if this Clerk user already has a borrower record
        const { data: existingBorrower, error: existingBorrowerError } =
            await supabase
                .from("borrowers") // adjust table name if needed
                .select("id, loan_officer_id")
                .eq("clerk_user_id", userId)
                .maybeSingle();

        if (existingBorrowerError) {
            return NextResponse.json(
                { error: "Error checking existing borrower" },
                { status: 500 }
            );
        }

        let borrowerId: string;

        if (existingBorrower) {
            // Option A: update existing borrower with LO if not set
            if (!existingBorrower.loan_officer_id) {
                const { error: updateBorrowerError } = await supabase
                    .from("borrowers")
                    .update({
                        loan_officer_id: loanOfficerId,
                        first_name: firstName,
                        last_name: lastName,
                        email: email,
                    })
                    .eq("id", existingBorrower.id);

                if (updateBorrowerError) {
                    return NextResponse.json(
                        { error: "Failed to update borrower" },
                        { status: 500 }
                    );
                }
            }

            borrowerId = existingBorrower.id as string;
        } else {
            // Option B: create new borrower
            const { data: newBorrower, error: insertBorrowerError } = await supabase
                .from("borrowers") // adjust to your table name
                .insert({
                    clerk_user_id: userId,
                    loan_officer_id: loanOfficerId,
                    first_name: firstName,
                    last_name: lastName,
                    email: email,
                })
                .select("id")
                .single();

            if (insertBorrowerError || !newBorrower) {
                return NextResponse.json(
                    { error: "Failed to create borrower" },
                    { status: 500 }
                );
            }

            borrowerId = newBorrower.id as string;
        }

        // 5) Mark invite as used and attach borrower
        const { error: updateInviteError } = await supabase
            .from("borrower_invites")
            .update({
                used_at: new Date().toISOString(),
                borrower_id: borrowerId,
            })
            .eq("id", invite.id);

        if (updateInviteError) {
            return NextResponse.json(
                { error: "Failed to update invite" },
                { status: 500 }
            );
        }

        // 6) Return borrowerId so the client can redirect to success screen
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
