// app/api/admin/users-list/route.ts
// GET  — paginated user list with role + referral_code
// POST — update role and/or generate/set referral_code for a user

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/adminAuth";
import { getSupabase } from "../../../../lib/supabaseServer";
import { randomBytes } from "crypto";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("q") ?? "";
  const page   = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const limit  = 50;

  let query = sb
    .from("users")
    .select("id, email, full_name, role, referral_code, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * limit, page * limit + limit - 1);

  if (search) {
    query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
  }

  const { data, count, error: dbErr } = await query;
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json({ users: data ?? [], total: count ?? 0, page, limit });
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { userId, role, action } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const updates: Record<string, string> = {};

  if (role && ["borrower", "lo", "agent"].includes(role)) {
    updates.role = role;
  }

  if (action === "generate_code") {
    // Generate a unique 8-char hex code
    let code: string | null = null;
    for (let i = 0; i < 10; i++) {
      const candidate = randomBytes(4).toString("hex");
      const { data: conflict } = await sb
        .from("users")
        .select("id")
        .eq("referral_code", candidate)
        .maybeSingle();
      if (!conflict) { code = candidate; break; }
    }
    if (!code) return NextResponse.json({ error: "Could not generate unique code" }, { status: 500 });
    updates.referral_code = code;
  }

  if (action === "clear_code") {
    // Use raw update to set null
    await sb.from("users").update({ referral_code: null } as never).eq("id", userId);
    return NextResponse.json({ ok: true, referral_code: null });
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error: updateErr } = await sb
    .from("users")
    .update(updates)
    .eq("id", userId)
    .select("id, email, full_name, role, referral_code")
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, user: data });
}
