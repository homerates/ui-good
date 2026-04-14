// app/api/admin/waitlist/route.ts
// GET  — paginated waitlist list with optional status filter
// POST — trigger an invite wave (top N waiting → invited)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/adminAuth";
import { getSupabase } from "../../../../lib/supabaseServer";
import { emailWaitlistInvite } from "../../../../lib/sendEmail";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "all";
  const page   = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const limit  = 50;

  let query = sb
    .from("pro_waitlist")
    .select("id, position, full_name, email, pro_type, state, nmls, license_number, brokerage, status, referral_points, invited_at, invite_expires_at, joined_at, founding_number, created_at", { count: "exact" })
    .order("position", { ascending: true })
    .range(page * limit, page * limit + limit - 1);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, count, error: dbErr } = await query;
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  // Also return summary counts
  const [
    { count: waitingCount },
    { count: invitedCount },
    { count: joinedCount },
    { count: expiredCount },
  ] = await Promise.all([
    sb.from("pro_waitlist").select("id", { count: "exact", head: true }).eq("status", "waiting"),
    sb.from("pro_waitlist").select("id", { count: "exact", head: true }).eq("status", "invited"),
    sb.from("pro_waitlist").select("id", { count: "exact", head: true }).eq("status", "joined"),
    sb.from("pro_waitlist").select("id", { count: "exact", head: true }).eq("status", "expired"),
  ]);

  return NextResponse.json({
    entries: data ?? [],
    total: count ?? 0,
    page,
    limit,
    summary: {
      waiting: waitingCount ?? 0,
      invited: invitedCount ?? 0,
      joined:  joinedCount  ?? 0,
      expired: expiredCount ?? 0,
    },
  });
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { action, count: waveCount, entryId } = await req.json();

  // ── Expire stale invites ─────────────────────────────────────────────────
  if (action === "expire") {
    const { error: expErr } = await sb
      .from("pro_waitlist")
      .update({ status: "expired" })
      .eq("status", "invited")
      .lt("invite_expires_at", new Date().toISOString());
    if (expErr) return NextResponse.json({ error: expErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Single-entry re-invite ───────────────────────────────────────────────
  if (action === "reinvite" && entryId) {
    const { data: entry } = await sb
      .from("pro_waitlist")
      .select("email, full_name, position")
      .eq("id", entryId)
      .maybeSingle();
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    await sb.from("pro_waitlist")
      .update({ status: "invited", invited_at: new Date().toISOString(), invite_expires_at: expiresAt.toISOString() })
      .eq("id", entryId);

    emailWaitlistInvite({
      toEmail:   entry.email,
      firstName: entry.full_name.split(" ")[0],
      position:  entry.position,
      expiresAt,
    });
    return NextResponse.json({ ok: true });
  }

  // ── Invite wave — top N waiting by effective position ───────────────────
  if (action === "invite_wave") {
    const n = Math.max(1, Math.min(parseInt(waveCount ?? "10", 10), 200));

    // Get top N waiting, ordered by (position - referral_points) ascending
    const { data: candidates } = await sb
      .from("pro_waitlist")
      .select("id, email, full_name, position, referral_points")
      .eq("status", "waiting")
      .order("position", { ascending: true })
      .limit(n);

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, message: "No waiting applicants" });
    }

    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const ids = candidates.map(c => c.id);

    // Mark invited
    await sb.from("pro_waitlist")
      .update({
        status: "invited",
        invited_at: new Date().toISOString(),
        invite_expires_at: expiresAt.toISOString(),
      })
      .in("id", ids);

    // Send invite emails in parallel
    let sent = 0;
    await Promise.all(candidates.map(async (c) => {
      try {
        await emailWaitlistInvite({
          toEmail:   c.email,
          firstName: c.full_name.split(" ")[0],
          position:  c.position,
          expiresAt,
        });
        sent++;
      } catch { /* non-fatal */ }
    }));

    return NextResponse.json({ ok: true, sent, total: candidates.length, expiresAt: expiresAt.toISOString() });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
