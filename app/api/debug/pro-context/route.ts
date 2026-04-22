// app/api/debug/pro-context/route.ts — temporary diagnostic, remove after fix
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const [loRes, agentRes, userRes, borrowerColRes] = await Promise.all([
        sb.from("loan_officers").select("id, email, lender, nmls").eq("user_id", userId).maybeSingle(),
        sb.from("agents").select("id, brokerage, license, user_id").eq("user_id", userId).maybeSingle(),
        sb.from("users").select("id, role, plan").eq("id", userId).maybeSingle(),
        sb.from("borrowers").select("agent_id").limit(1),
    ]);

    return NextResponse.json({
        clerk_user_id: userId,
        users_row: userRes.data ?? null,
        users_error: userRes.error?.message ?? null,
        lo_row: loRes.data ?? null,
        lo_error: loRes.error?.message ?? null,
        agent_row: agentRes.data ?? null,
        agent_error: agentRes.error?.message ?? null,
        borrowers_agent_id_column_exists: !borrowerColRes.error,
        borrowers_error: borrowerColRes.error?.message ?? null,
    });
}
