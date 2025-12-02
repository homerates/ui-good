// app/api/onboarding/complete/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
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
        // 1️⃣ Verify Clerk session
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "Not authenticated" },
                { status: 401 }
            );
        }

        const supabase = getSupabaseServerClient();

        // 2️⃣ Parse body containing invite code (and optional lender)
        const body = await req.json().catch(() => ({}));
        const inviteCode = body.inviteCode as string | undefined;
        const lender = body.lender as string | undefined; // NEW: optional lender (e.g. "LoanDepot")

        if (!inviteCode) {
            return NextResponse.json(
                { error: "Missing inviteCode in request body." },
                { status: 400 }
            );
        }

        // 3️⃣ Load Clerk user using correct Clerk v5 API
        const clerk = await clerkClient();
        const clerkUser = await clerk.users.getUser(userId);

        const email =
            clerkUser.emailAddresses?.[0]?.emailAddress ||
            (clerkUser as any).email_addresses?.[0]?.email_address ||
            null;

        const firstName =
            clerkUser.firstName || (clerkUser as any).first_name || null;

        // 4️⃣ Fetch invite from Supabase
        const { data: invite, error: inviteError } = await supabase
            .from("invite_codes")
            .select("*")
            .eq("code", inviteCode)
            .maybeSingle();

        if (inviteError) {
            console.error("Error fetching invite:", inviteError);
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

        // 5️⃣ Basic expiration & usage checks
        const isUsed = (invite as any).is_used;
        const expiresAt = (invite as any).expires_at;

        if (isUsed) {
            return NextResponse.json(
                { error: "This invite code has already been used." },
                { status: 400 }
            );
        }

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

        // 6️⃣ Determine allowed borrower slots
        const allowedBorrowerSlots =
            (invite as any).allowed_borrower_slots ??
            (invite as any).max_borrowers ??
            25;

        // 7️⃣ Check if LO record already exists for this Clerk user
        const { data: existingLo, error: loLookupError } = await supabase
            .from("loan_officers")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();

        if (loLookupError) {
            console.error("Error checking existing LO:", loLookupError);
            return NextResponse.json(
                { error: "Failed to check existing loan officer record." },
                { status: 500 }
            );
        }

        // 8️⃣ Upsert LO record
        if (existingLo) {
            const { error: loUpdateError } = await supabase
                .from("loan_officers")
                .update({
                    email,
                    name: firstName,
                    user_id: userId,
                    allowed_borrower_slots: allowedBorrowerSlots,
                    lender: lender ?? (existingLo as any).lender ?? null, // NEW: update lender if provided
                })
                .eq("id", existingLo.id);

            if (loUpdateError) {
                console.error("Error updating loan_officers:", loUpdateError);
                return NextResponse.json(
                    { error: "Failed to update loan officer record." },
                    { status: 500 }
                );
            }
        } else {
            const { error: loInsertError } = await supabase
                .from("loan_officers")
                .insert({
                    email,
                    name: firstName,
                    user_id: userId,
                    allowed_borrower_slots: allowedBorrowerSlots,
                    lender: lender ?? null, // NEW: set lender on creation
                });

            if (loInsertError) {
                console.error("Error inserting loan officer:", loInsertError);
                return NextResponse.json(
                    { error: "Failed to create loan officer record." },
                    { status: 500 }
                );
            }
        }

        // 9️⃣ Mark invite code as used
        const { error: inviteUpdateError } = await supabase
            .from("invite_codes")
            .update({
                is_used: true,
                used_at: new Date().toISOString(),
                used_by_user_id: userId,
            })
            .eq("id", invite.id);

        if (inviteUpdateError) {
            console.error("Error marking invite used:", inviteUpdateError);
            return NextResponse.json(
                {
                    error:
                        "Loan officer created, but failed to update invite code status.",
                },
                { status: 500 }
            );
        }

        // 🔟 Set Clerk public metadata → "loan_officer"
        await clerk.users.updateUser(userId, {
            publicMetadata: {
                role: "loan_officer",
            },
        });

        // 1️⃣1️⃣ Success response
        return NextResponse.json(
            {
                ok: true,
                message: "Loan officer onboarding completed.",
                roleSet: "loan_officer",
                allowedBorrowerSlots,
            },
            { status: 200 }
        );
    } catch (err: any) {
        console.error("Onboarding complete error:", err);
        return NextResponse.json(
            { error: "Failed to complete onboarding." },
            { status: 500 }
        );
    }
}
