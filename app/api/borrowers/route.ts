// app/api/borrowers/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import { emailBorrowerWelcome } from "../../../lib/sendEmail";
import { clerkClient } from "@clerk/nextjs/server";
import { getFredSnapshot } from "@/lib/fred";
import { randomUUID } from "crypto";

type ProContext =
    | { type: "lo";    id: string; email?: string; lender?: string }
    | { type: "agent"; id: string; email?: string; brokerage?: string };

async function getProContext(supabase: ReturnType<typeof getSupabaseServerClient>, userId: string): Promise<ProContext | null> {
    const [loRes, agentRes] = await Promise.all([
        supabase.from("loan_officers").select("id, email, lender").eq("user_id", userId).maybeSingle(),
        supabase.from("agents").select("id, brokerage").eq("user_id", userId).maybeSingle(),
    ]);
    if (loRes.data) return { type: "lo",    id: loRes.data.id,    email: loRes.data.email,     lender: loRes.data.lender };
    if (agentRes.data) return { type: "agent", id: agentRes.data.id, brokerage: agentRes.data.brokerage };

    // Auto-create agents row if users.role = "agent" but no agents row exists yet
    const { data: userRow } = await supabase.from("users").select("role").eq("id", userId).maybeSingle();
    if (userRow?.role === "agent") {
        const { data: newAgent } = await supabase.from("agents").insert({ user_id: userId }).select("id, brokerage").single();
        if (newAgent) return { type: "agent", id: newAgent.id, brokerage: newAgent.brokerage };
    }
    return null;
}

export async function GET() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getSupabaseServerClient();
    const pro = await getProContext(supabase, userId);
    // For GET, return empty list gracefully if no profile yet (profile not saved yet)
    if (!pro) return NextResponse.json({ borrowers: [] });

    const col = pro.type === "lo" ? "loan_officer_id" : "agent_id";
    const { data, error } = await supabase
        .from("borrowers")
        .select("id, name, email, user_id, property_address, digest_enabled, created_at, actual_balance, actual_rate, actual_purchase_price, actual_purchase_date, actual_value")
        .eq(col, pro.id)
        .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ borrowers: data ?? [] });
}

export async function PATCH(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getSupabaseServerClient();
    const pro = await getProContext(supabase, userId);
    if (!pro) return NextResponse.json({ error: "Professional profile not found" }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body?.id) return NextResponse.json({ error: "borrower id required" }, { status: 400 });

    const updates: Record<string, any> = {};
    if (body.property_address !== undefined) updates.property_address = body.property_address;
    if (body.digest_enabled   !== undefined) updates.digest_enabled   = body.digest_enabled;
    if (body.email            !== undefined) updates.email            = body.email;
    if ('actual_balance'        in body) updates.actual_balance        = body.actual_balance        ? Number(body.actual_balance)        : null;
    if ('actual_rate'           in body) updates.actual_rate           = body.actual_rate           ? Number(body.actual_rate)           : null;
    if ('actual_purchase_price' in body) updates.actual_purchase_price = body.actual_purchase_price ? Number(body.actual_purchase_price) : null;
    if ('actual_purchase_date'  in body) updates.actual_purchase_date  = body.actual_purchase_date  ?? null;
    if ('actual_value'          in body) updates.actual_value          = body.actual_value          ? Number(body.actual_value)          : null;

    const col = pro.type === "lo" ? "loan_officer_id" : "agent_id";
    const { data, error } = await supabase
        .from("borrowers")
        .update(updates)
        .eq("id", body.id)
        .eq(col, pro.id)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ borrower: data });
}

export async function DELETE(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getSupabaseServerClient();
    const pro = await getProContext(supabase, userId);
    if (!pro) return NextResponse.json({ error: "Professional profile not found" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "borrower id required" }, { status: 400 });

    const col = pro.type === "lo" ? "loan_officer_id" : "agent_id";
    const { error } = await supabase
        .from("borrowers")
        .delete()
        .eq("id", id)
        .eq(col, pro.id);

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
        if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

        const supabase = getSupabaseServerClient();
        const pro = await getProContext(supabase, userId);
        if (!pro) return NextResponse.json({ error: "Professional profile not found" }, { status: 400 });

        // Count existing borrowers
        const col = pro.type === "lo" ? "loan_officer_id" : "agent_id";
        const { count, error: countError } = await supabase
            .from("borrowers")
            .select("*", { count: "exact", head: true })
            .eq(col, pro.id);

        if (countError) {
            console.error("Error counting borrowers:", countError);
            return NextResponse.json({ error: "Could not verify borrower count" }, { status: 500 });
        }

        const currentCount = count ?? 0;

        const body = await req.json().catch(() => null);
        if (!body || !body.name) return NextResponse.json({ error: "Missing borrower name in request body" }, { status: 400 });

        const name: string = body.name;
        const email: string | null = body.email ?? null;
        const propertyAddress: string | null = body.property_address ?? null;
        const sendWelcome: boolean = body.send_welcome === true && !!email;

        const insertPayload: Record<string, any> = {
            name,
            email,
            property_address: propertyAddress,
            source: "lo_quick_add",
        };
        if (pro.type === "lo")    insertPayload.loan_officer_id = pro.id;
        else                      insertPayload.agent_id        = pro.id;

        const { data: newBorrower, error: insertError } = await supabase
            .from("borrowers")
            .insert(insertPayload)
            .select()
            .single();

        if (insertError) {
            console.error("Error inserting borrower:", insertError);
            return NextResponse.json({ error: "Failed to create borrower" }, { status: 500 });
        }

        if (sendWelcome && email) {
            try {
                const clerk = await clerkClient();
                const proClerk = await clerk.users.getUser(userId);
                const proName = [proClerk.firstName, proClerk.lastName].filter(Boolean).join(" ") || pro.email || "Your agent";
                const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";

                let inviteUrl: string;
                try {
                    const firstName = name.split(" ")[0] || "";
                    const clerkUsers = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
                    if (clerkUsers.totalCount > 0 && clerkUsers.data[0]) {
                        const token = await clerk.signInTokens.createSignInToken({
                            userId: clerkUsers.data[0].id,
                            expiresInSeconds: 7 * 24 * 60 * 60,
                        });
                        inviteUrl = `${baseUrl}/sign-in#/?sign_in_token=${token.token}`;
                    } else {
                        const code = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
                        await supabase.from("invite_codes").insert({
                            code,
                            created_by_loan_officer: pro.type === "lo" ? pro.id : null,
                            target_plan: "borrower-onboarding",
                            max_uses: 1,
                        });
                        inviteUrl = `${baseUrl}/onboarding?invite=${encodeURIComponent(code)}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(firstName)}`;
                    }
                } catch {
                    inviteUrl = `${baseUrl}/sign-up?email=${encodeURIComponent(email)}`;
                }

                let liveRate: number | null = null;
                try {
                    const snap = await getFredSnapshot({ timeoutMs: 5000 });
                    if (snap?.mort30Avg && Number.isFinite(snap.mort30Avg)) liveRate = snap.mort30Avg;
                } catch { /* non-fatal */ }

                const firmName = pro.type === "lo" ? (pro.lender ?? null) : (pro.brokerage ?? null);
                emailBorrowerWelcome({
                    toEmail: email,
                    firstName: name.split(" ")[0] || null,
                    loName: proName,
                    loLender: firmName,
                    inviteUrl,
                    liveRate,
                    propertyAddress,
                });
            } catch (e) {
                console.error("Welcome email error (non-fatal):", e);
            }
        }

        return NextResponse.json(
            { borrower: newBorrower, message: `Client created successfully. You now have ${currentCount + 1} clients.` },
            { status: 201 }
        );
    } catch (err: any) {
        console.error("Borrower create route error:", err);
        return NextResponse.json({ error: "Server error while creating borrower" }, { status: 500 });
    }
}
