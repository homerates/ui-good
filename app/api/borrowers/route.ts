// app/api/borrowers/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

export async function GET() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getSupabaseServerClient();
    const { data: lo } = await supabase.from("loan_officers").select("id").eq("user_id", userId).single();
    if (!lo) return NextResponse.json({ error: "LO profile not found" }, { status: 400 });

    const { data, error } = await supabase
        .from("borrowers")
        .select("id, name, email, property_address, digest_enabled, created_at")
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
            .select("id, allowed_borrower_slots")
            .eq("user_id", userId)
            .single();

        if (loError || !lo) {
            console.error("loan_officers lookup error:", loError);
            return NextResponse.json(
                { error: "Loan officer profile not found" },
                { status: 400 }
            );
        }

        const allowedSlots = lo.allowed_borrower_slots ?? 0;

        if (allowedSlots === 0) {
            return NextResponse.json(
                {
                    error:
                        "No active subscription or plan. Please subscribe to a plan to add borrowers."
                },
                { status: 403 }
            );
        }

        // 3️⃣ Count existing borrowers for this LO
        const { count, error: countError } = await supabase
            .from("borrowers")
            .select("*", { count: "exact", head: true })
            .eq("loan_officer_id", lo.id);

        if (countError) {
            console.error("Error counting borrowers:", countError);
            return NextResponse.json(
                { error: "Could not verify borrower limit" },
                { status: 500 }
            );
        }

        const currentCount = count ?? 0;

        if (currentCount >= allowedSlots) {
            return NextResponse.json(
                {
                    error:
                        "You have reached your borrower limit for this plan. Please upgrade your plan to add more borrowers."
                },
                { status: 403 }
            );
        }

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

        // 5️⃣ Create the borrower
        const { data: newBorrower, error: insertError } = await supabase
            .from("borrowers")
            .insert({
                loan_officer_id: lo.id,
                name,
                email
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

        return NextResponse.json(
            {
                borrower: newBorrower,
                message: `Borrower created successfully. You are now using ${currentCount + 1
                    } of ${allowedSlots} slots.`
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
