// app/api/onboarding/complete/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

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
        // 1️⃣ Ensure user is authenticated via Clerk
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "Not authenticated" },
                { status: 401 }
            );
        }

        const supabase = getSupabaseServerClient();

        // 2️⃣ Read invite code from request body
        const body = await req.json().catch(() => ({}));
        const inviteCode = body.inviteCode as string | undefined;

        if (!inviteCode) {
            return NextResponse.json(
                { error: "Missing inviteCode in request body." },
                { status: 400 }
            );
        }

        // 3️⃣ Load Clerk user (for email + name)
        const clerkUser = await clerkClient.users.getUser(userId);

        const email =
            (clerkUser.emailAddresses &&
                clerkUser.emailAddresses[0]?.emailAddress) ||
            (clerkUser as any).email_addresses?.[0]?.email_address ||
            null;

        const firstName =
            clerkUser.firstName || (clerkUser as any).first_name || null;

        // 4️⃣ Fetch invite from invite_codes table
        const { data: invite, error: inviteError } = await supabase
            .from("invite_codes")
            .select("*")
            .eq("code", inviteCode)
            .maybeSingle();

        if (inviteError) {
            console.error("Error loading invite code:", inviteError);
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

        // Optional: basic "used / expired" checks if your schema has these fields
        const isUsed = (invite as any).is_used as boolean | undefined;
        const expiresAt = (invite as any).expires_at as string | null;

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

        // 5️⃣ Decide allowed borrower slots from invite (fallback to 25)
        const allowedBorrowerSlots =
            (invite as any).allowed_borrower_slots ??
            (invite as any).max_borrowers ??
            25;

        // 6️⃣ Upsert into loan_officers table keyed by user_id
        //    If there's already a row for this Clerk user, update it, otherwise insert a new one.
        const { data: existingLo, error: loSelectError } = await supabase
            .from("loan_officers")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();

        if (loSelectError) {
            console.error("Error checking existing loan_officer:", loSelectError);
            return NextResponse.json(
                { error: "Failed to check existing loan officer record." },
                { status: 500 }
            );
        }

        if (existingLo) {
            const { error: loUpdateError } = await supabase
                .from("loan_officers")
                .update({
                    email,
                    name: firstName,
                    user_id: userId,
                    allowed_borrower_slots: allowedBorrowerSlots
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
                    allowed_borrower_slots: allowedBorrowerSlots
                });

            if (loInsertError) {
                console.error("Error inserting loan_officer:", loInsertError);
                return NextResponse.json(
                    { error: "Failed to create loan officer record." },
                    { status: 500 }
                );
            }
        }

        // 7️⃣ Mark invite code as used
        const { error: inviteUpdateError } = await supabase
            .from("invite_codes")
            .update({
                is_used: true,
                used_by_user_id: userId,
                used_at: new Date().toISOString()
            })
            .eq("id", invite.id);

        if (inviteUpdateError) {
            console.error("Error updating invite_codes:", inviteUpdateError);
            // Not fatal for the LO record, but worth returning
            return NextResponse.json(
                { error: "Loan officer created, but failed to update invite code." },
                { status: 500 }
            );
        }

        // 8️⃣ Tag Clerk user as a loan officer
        await clerkClient.users.updateUser(userId, {
            publicMetadata: {
                role: "loan_officer"
            }
        });

        // 9️⃣ Respond with success + basic LO info
        return NextResponse.json(
            {
                ok: true,
                message: "Loan officer onboarding completed.",
                roleSet: "loan_officer",
                allowedBorrowerSlots
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
