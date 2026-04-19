// app/api/borrowers/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import { emailBorrowerWelcome } from "../../../lib/sendEmail";
import { clerkClient } from "@clerk/nextjs/server";
import { getFredSnapshot } from "@/lib/fred";
import { randomUUID } from "crypto";

export async function GET() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getSupabaseServerClient();
    const { data: lo } = await supabase.from("loan_officers").select("id").eq("user_id", userId).single();
    if (!lo) return NextResponse.json({ error: "LO profile not found" }, { status: 400 });

    const { data, error } = await supabase
        .from("borrowers")
        .select("id, name, email, user_id, property_address, digest_enabled, created_at, actual_balance, actual_rate, actual_purchase_price, actual_purchase_date, actual_value")
        .eq("loan_officer_id", lo.id)
        .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ borrowers: data ?? [] });
}

export async function PATCH(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getSupabaseServerClient();
    const { data: lo } = await supabase.from("loan_officers").select("id").eq("user_id", userId).single();
    if (!lo) return NextResponse.json({ error: "LO profile not found" }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body?.id) return NextResponse.json({ error: "borrower id required" }, { status: 400 });

    const updates: Record<string, any> = {};
    if (body.property_address !== undefined) updates.property_address = body.property_address;
    if (body.digest_enabled   !== undefined) updates.digest_enabled   = body.digest_enabled;
    if (body.email            !== undefined) updates.email            = body.email;
    // Loan detail overrides — null clears a field, undefined = don't touch
    if ('actual_balance'        in body) updates.actual_balance        = body.actual_balance        ? Number(body.actual_balance)        : null;
    if ('actual_rate'           in body) updates.actual_rate           = body.actual_rate           ? Number(body.actual_rate)           : null;
    if ('actual_purchase_price' in body) updates.actual_purchase_price = body.actual_purchase_price ? Number(body.actual_purchase_price) : null;
    if ('actual_purchase_date'  in body) updates.actual_purchase_date  = body.actual_purchase_date  ?? null;
    if ('actual_value'          in body) updates.actual_value          = body.actual_value          ? Number(body.actual_value)          : null;

    const { data, error } = await supabase
        .from("borrowers")
        .update(updates)
        .eq("id", body.id)
        .eq("loan_officer_id", lo.id)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ borrower: data });
}

export async function DELETE(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getSupabaseServerClient();
    const { data: lo } = await supabase.from("loan_officers").select("id").eq("user_id", userId).single();
    if (!lo) return NextResponse.json({ error: "LO profile not found" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "borrower id required" }, { status: 400 });

    const { error } = await supabase
        .from("borrowers")
        .delete()
        .eq("id", id)
        .eq("loan_officer_id", lo.id); // ownership check

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}

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

        const supabase = getSupabaseServerClient();

        // 2️⃣ Find LO profile for this user
        const { data: lo, error: loError } = await supabase
            .from("loan_officers")
            .select("id, allowed_borrower_slots, email, lender")
            .eq("user_id", userId)
            .single();

        if (loError || !lo) {
            console.error("loan_officers lookup error:", loError);
            return NextResponse.json(
                { error: "Loan officer profile not found" },
                { status: 400 }
            );
        }

        // Count existing borrowers (no hard slot cap — borrower mgmt is unlimited for all LO plans)
        const { count, error: countError } = await supabase
            .from("borrowers")
            .select("*", { count: "exact", head: true })
            .eq("loan_officer_id", lo.id);

        if (countError) {
            console.error("Error counting borrowers:", countError);
            return NextResponse.json(
                { error: "Could not verify borrower count" },
                { status: 500 }
            );
        }

        const currentCount = count ?? 0;

        // 4️⃣ Parse request body for new borrower data
        const body = await req.json().catch(() => null);

        if (!body || !body.name) {
            return NextResponse.json(
                { error: "Missing borrower name in request body" },
                { status: 400 }
            );
        }

        const name: string = body.name;
        const email: string | null = body.email ?? null;
        const propertyAddress: string | null = body.property_address ?? null;
        const sendWelcome: boolean = body.send_welcome === true && !!email;

        // 5️⃣ Create the borrower
        const { data: newBorrower, error: insertError } = await supabase
            .from("borrowers")
            .insert({
                loan_officer_id: lo.id,
                name,
                email,
                property_address: propertyAddress,
                source: "lo_quick_add",
            })
            .select()
            .single();

        if (insertError) {
            console.error("Error inserting borrower:", insertError);
            return NextResponse.json(
                { error: "Failed to create borrower" },
                { status: 500 }
            );
        }

        // 6️⃣ Send welcome email if requested (fire-and-forget)
        if (sendWelcome && email) {
            try {
                const clerk = await clerkClient();
                const loClerk = await clerk.users.getUser(userId);
                const loName = [loClerk.firstName, loClerk.lastName].filter(Boolean).join(" ") || lo.email || "Your loan officer";
                const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";

                // ── Smart invite URL: magic link for existing users, personalised invite for new ──
                let inviteUrl: string;
                try {
                    const firstName = name.split(" ")[0] || "";
                    const clerkUsers = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
                    if (clerkUsers.totalCount > 0 && clerkUsers.data[0]) {
                        // Existing Clerk user → one-click sign-in token (magic link)
                        const token = await clerk.signInTokens.createSignInToken({
                            userId: clerkUsers.data[0].id,
                            expiresInSeconds: 7 * 24 * 60 * 60,
                        });
                        inviteUrl = `${baseUrl}/sign-in#/?sign_in_token=${token.token}`;
                    } else {
                        // New user → personalised onboarding page with email + name pre-filled
                        const code = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
                        await supabase.from("invite_codes").insert({
                            code,
                            created_by_loan_officer: lo.id,
                            target_plan: "borrower-onboarding",
                            max_uses: 1,
                        });
                        inviteUrl = `${baseUrl}/onboarding?invite=${encodeURIComponent(code)}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(firstName)}`;
                    }
                } catch {
                    // Fallback — never block the email send
                    inviteUrl = `${baseUrl}/sign-up?email=${encodeURIComponent(email)}`;
                }

                // Fetch today's live rate directly from FRED (no HTTP self-call)
                let liveRate: number | null = null;
                try {
                    const snap = await getFredSnapshot({ timeoutMs: 5000 });
                    if (snap?.mort30Avg && Number.isFinite(snap.mort30Avg)) {
                        liveRate = snap.mort30Avg;
                    }
                } catch { /* non-fatal */ }

                emailBorrowerWelcome({
                    toEmail: email,
                    firstName: name.split(" ")[0] || null,
                    loName,
                    loLender: lo.lender ?? null,
                    inviteUrl,
                    liveRate,
                    propertyAddress,
                });
            } catch (e) {
                console.error("Welcome email error (non-fatal):", e);
            }
        }

        return NextResponse.json(
            {
                borrower: newBorrower,
                message: `Borrower created successfully. You now have ${currentCount + 1} borrowers.`
            },
            { status: 201 }
        );
    } catch (err: any) {
        console.error("Borrower create route error:", err);
        return NextResponse.json(
            { error: "Server error while creating borrower" },
            { status: 500 }
        );
    }
}
