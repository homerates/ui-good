// app/api/borrower/onboard/route.ts
// Borrower onboarding via invite code.
// Links borrower -> loan_officer via invite_codes.created_by_loan_officer.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Helper to initialize Supabase server client
function getSupabaseServerClient() {
    const supabaseUrl =
        process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error("Supabase env vars are missing (URL or key).");
    }

    return createClient(supabaseUrl, supabaseKey);
}

export async function POST(req: NextRequest) {
    try {
        const supabase = getSupabaseServerClient();

        const body = await req.json().catch(() => ({}));
        const inviteCode = body.inviteCode as string | undefined;
        const name = (body.name as string | undefined) ?? "";
        const email = (body.email as string | undefined) ?? "";
        const phone = (body.phone as string | undefined) ?? "";

        if (!inviteCode) {
            return NextResponse.json(
                { error: "Missing inviteCode in request body." },
                { status: 400 }
            );
        }

        if (!email.trim()) {
            return NextResponse.json(
                { error: "Email is required to create a borrower profile." },
                { status: 400 }
            );
        }

        // 1️⃣ Look up invite
        const { data: invite, error: inviteError } = await supabase
            .from("invite_codes")
            .select("*")
            .eq("code", inviteCode)
            .maybeSingle();

        if (inviteError) {
            console.error("Borrower invite lookup error:", inviteError);
            return NextResponse.json(
                { error: "Failed to load invite code." },
                { status: 500 }
            );
        }

        if (!invite) {
            return NextResponse.json(
                { error: "Invalid invite code." },
                { status: 400 }
            );
        }

        // If target_role is set, enforce 'borrower'; if null, treat as compatible.
        const targetRole = (invite as any).target_role as string | null;
        if (targetRole && targetRole !== "borrower") {
            return NextResponse.json(
                { error: "This invite code is not valid for borrower onboarding." },
                { status: 400 }
            );
        }

        // 2️⃣ Basic expiration & usage checks
        const expiresAt = (invite as any).expires_at as string | null;
        const maxUses = (invite as any).max_uses as number | null;
        const usedCount = ((invite as any).used_count as number | null) ?? 0;

        if (expiresAt) {
            const now = new Date();
            const exp = new Date(expiresAt);
            if (exp.getTime() < now.getTime()) {
                return NextResponse.json(
                    { error: "This invite code has expired." },
                    { status: 400 }
                );
            }
        }

        if (maxUses !== null && usedCount >= maxUses) {
            return NextResponse.json(
                { error: "This invite code has reached its maximum uses." },
                { status: 400 }
            );
        }

        // 3️⃣ Determine loan officer this borrower belongs to
        const loanOfficerId = (invite as any).created_by_loan_officer as string | null;

        if (!loanOfficerId) {
            return NextResponse.json(
                {
                    error:
                        "This invite is not linked to a loan officer. Please contact your lender.",
                },
                { status: 400 }
            );
        }

        // 4️⃣ Upsert borrower linked to this LO
        const trimmedEmail = email.trim();
        const trimmedName = name.trim() || null;
        const trimmedPhone = phone.trim() || null;

        // Try to find existing borrower for this LO + email
        const { data: existingBorrower, error: borrowerLookupError } =
            await supabase
                .from("borrowers")
                .select("*")
                .eq("loan_officer_id", loanOfficerId)
                .eq("email", trimmedEmail)
                .maybeSingle();

        if (borrowerLookupError) {
            console.error("Borrower lookup error:", borrowerLookupError);
            return NextResponse.json(
                { error: "Failed to check existing borrower record." },
                { status: 500 }
            );
        }

        const nowIso = new Date().toISOString();
        let borrowerId: string | null = null;

        if (existingBorrower) {
            const { data: updatedBorrower, error: updateError } = await supabase
                .from("borrowers")
                .update({
                    name: trimmedName,
                    email: trimmedEmail,
                    phone: trimmedPhone,
                    status: "invited",
                    source: "invite_code",
                    updated_at: nowIso,
                })
                .eq("id", existingBorrower.id)
                .select("id")
                .single();

            if (updateError) {
                console.error("Borrower update error:", updateError);
                return NextResponse.json(
                    { error: "Failed to update borrower record." },
                    { status: 500 }
                );
            }

            borrowerId = updatedBorrower.id as string;
        } else {
            const { data: insertedBorrower, error: insertError } = await supabase
                .from("borrowers")
                .insert({
                    loan_officer_id: loanOfficerId,
                    name: trimmedName,
                    email: trimmedEmail,
                    phone: trimmedPhone,
                    status: "invited",
                    source: "invite_code",
                    created_at: nowIso,
                    updated_at: nowIso,
                    tags: ["sponsored"],
                })
                .select("id")
                .single();

            if (insertError) {
                console.error("Borrower insert error:", insertError);
                return NextResponse.json(
                    { error: "Failed to create borrower record." },
                    { status: 500 }
                );
            }

            borrowerId = insertedBorrower.id as string;
        }

        // 5️⃣ Increment invite usage
        const newUsedCount = usedCount + 1;
        const inviteUpdatePayload: Record<string, any> = {
            used_count: newUsedCount,
        };

        // If you use is_used in your LO flow, keep behavior consistent.
        if (maxUses !== null && newUsedCount >= maxUses) {
            inviteUpdatePayload.is_used = true;
        }

        const { error: inviteUpdateError } = await supabase
            .from("invite_codes")
            .update(inviteUpdatePayload)
            .eq("id", (invite as any).id);

        if (inviteUpdateError) {
            console.error(
                "Borrower invite usage update error:",
                inviteUpdateError
            );
            // We still consider onboarding successful even if usage counter update fails.
        }

        return NextResponse.json(
            {
                ok: true,
                message: "Borrower onboarding completed.",
                borrowerId,
                loanOfficerId,
            },
            { status: 200 }
        );
    } catch (err: any) {
        console.error("Borrower onboarding error:", err);
        return NextResponse.json(
            { error: "Failed to complete borrower onboarding." },
            { status: 500 }
        );
    }
}
