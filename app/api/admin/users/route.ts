// app/api/admin/users/route.ts
// GET    — list all admin users
// POST   — add an admin user  { clerk_user_id, email?, display_name? }
// DELETE — remove an admin user { clerk_user_id }  (cannot remove self)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/adminAuth";
import { getSupabase } from "../../../../lib/supabaseServer";
import { auth } from "@clerk/nextjs/server";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { data, error: dbErr } = await sb
    .from("admin_users")
    .select("clerk_user_id, email, display_name, added_at, added_by_clerk_id")
    .order("added_at", { ascending: true });

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ admins: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAdmin();
  if (error) return error;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const { clerk_user_id, email, display_name } = body;

  if (!clerk_user_id || typeof clerk_user_id !== "string") {
    return NextResponse.json({ error: "clerk_user_id required" }, { status: 400 });
  }
  if (!clerk_user_id.startsWith("user_")) {
    return NextResponse.json({ error: "Invalid Clerk user ID — must start with user_" }, { status: 400 });
  }

  const { error: dbErr } = await sb.from("admin_users").upsert(
    { clerk_user_id, email: email ?? null, display_name: display_name ?? null, added_by_clerk_id: userId },
    { onConflict: "clerk_user_id" }
  );
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { userId, error } = await requireAdmin();
  if (error) return error;

  const { userId: currentUserId } = await auth();
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const { clerk_user_id } = body;

  if (!clerk_user_id) return NextResponse.json({ error: "clerk_user_id required" }, { status: 400 });
  if (clerk_user_id === currentUserId) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
  }

  // Must always leave at least one admin
  const { count } = await sb.from("admin_users").select("*", { count: "exact", head: true });
  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: "Cannot remove the last admin" }, { status: 400 });
  }

  const { error: dbErr } = await sb.from("admin_users").delete().eq("clerk_user_id", clerk_user_id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
