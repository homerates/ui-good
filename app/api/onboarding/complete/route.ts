// app/api/onboarding/complete/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth, currentUser } from "@clerk/nextjs/server";

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
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "Not authenticated" },
                { status: 401 }
            );
        }

        const user = await currentUser();
        if (!user) {
            return NextResponse.json(
                { error: "Unable to load current user" },
                { status: 401 }
            );
        }

        const primaryEmail =
            user.emailAddresses?.[0]?.emailAddress ?? "no-email@homerates.ai";

        const body = await req.json().catch(() => null);

        if (!body || typeof body.inviteCode !== "string") {
            return NextResponse.json(
                { error: "Missing inviteCode in request body" },
                { status: 400 }
            );
        }

        const inviteCode = body.inviteCode.trim();

        if (!inviteCode) {
            return NextResponse.json(
                { error: "Invite code cannot be empty" },
                { status: 400 }
            );
        }

        const supabase = getSupabaseServerClient();

        // 3️⃣ Look up invite in invite_codes
        const { data: invite, error: inviteError } = await supabase
            .from("invite_codes")
            .select("*")
            .eq("code", inviteCode)
            .single();

        if (inviteError || !invite) {
            return NextResponse.json(
                { error: "Invalid invite code" },
                { status: 400 }
            );
        }

        // Check expiry
        if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
            return NextResponse.json(
                { error: "This invite code has expired" },
                { status: 400 }
            );
        }

        // Check usage limit
        if (invite.used_count >= invite.max_uses) {
            return NextResponse.json(
                { error: "This invite code has already been used" },
                { status: 400 }
            );
        }

        // 4️⃣ Check if LO row already exists for this user
        const { data: existingLo, error: loSelectError } = await supabase
            .from("loan_officers")
            .select("id, invite_code_id")
            .eq("user_id", userId)
            .maybeSingle();

        let loanOfficerId: string | null = null;

        if (loSelectError) {
            console.error("Error looking up existing LO:", loSelectError);
            return NextResponse.json(
                { error: "Database error" },
                { status: 500 }
            );
        }

        if (existingLo) {
            loanOfficerId = existingLo.id;

            if (!existingLo.invite_code_id) {
                const { error: loUpdateError } = await supabase
                    .from("loan_officers")
                    .update({ invite_code_id: invite.id })
                    .eq("id", existingLo.id);

                if (loUpdateError) {
                    console.error(
                        "Error updating LO invite_code_id:",
                        loUpdateError
                    );
                    return NextResponse.json(
                        { error: "Failed to complete onboarding" },
                        { status: 500 }
                    );
                }
            }
        } else {
            // 5️⃣ No LO yet – create one
            const { data: newLo, error: loInsertError } = await supabase
                .from("loan_officers")
                .insert({
                    user_id: userId,
                    email: primaryEmail,
                    invite_code_id: invite.id,
                    allowed_borrower_slots: 0
                })
                .select("id")
                .single();

            if (loInsertError || !newLo) {
                console.error("Error inserting loan_officers row:", loInsertError);
                return NextResponse.json(
                    { error: "Failed to complete onboarding" },
                    { status: 500 }
                );
            }

            loanOfficerId = newLo.id;
        }

        // 6️⃣ Increment used_count on this invite
        const { error: inviteUpdateError } = await supabase
            .from("invite_codes")
            .update({ used_count: invite.used_count + 1 })
            .eq("id", invite.id);

        if (inviteUpdateError) {
            console.error("Error incrementing invite used_count:", inviteUpdateError);
        }

        return NextResponse.json(
            {
                status: "ok",
                message: "Onboarding completed. Loan officer profile is ready.",
                loanOfficerId
            },
            { status: 200 }
        );
    } catch (err: any) {
        console.error("Onboarding /complete error:", err);
        return NextResponse.json(
            { error: "Server error while completing onboarding" },
            { status: 500 }
        );
    }
}
