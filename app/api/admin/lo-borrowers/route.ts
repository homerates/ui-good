// app/api/admin/lo-borrowers/route.ts
// GET — admin view of all LOs with their borrower lists
// ?lo_id=X  → returns borrowers for a specific LO
// (no param) → returns all LOs with borrower counts

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/adminAuth';
import { getSupabase } from '../../../../lib/supabaseServer';

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  const loId = req.nextUrl.searchParams.get('lo_id');

  // ── Return borrowers for a specific LO ──────────────────────────────────────
  if (loId) {
    const { data, error: dbErr } = await sb
      .from('borrowers')
      .select('id, name, email, property_address, digest_enabled, actual_balance, actual_rate, actual_purchase_price, actual_purchase_date, created_at')
      .eq('loan_officer_id', loId)
      .order('created_at', { ascending: false });

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
    return NextResponse.json({ borrowers: data ?? [] });
  }

  // ── Return all LOs with borrower counts ─────────────────────────────────────
  const { data: los, error: loErr } = await sb
    .from('loan_officers')
    .select('id, user_id, email, lender')
    .order('id', { ascending: false });

  if (loErr) return NextResponse.json({ error: loErr.message }, { status: 500 });
  if (!los?.length) return NextResponse.json({ los: [] });

  // Get borrower counts per LO
  const counts = await Promise.all(
    los.map(lo =>
      sb.from('borrowers')
        .select('id', { count: 'exact', head: true })
        .eq('loan_officer_id', lo.id)
        .then(r => ({ loId: lo.id, count: r.count ?? 0 }))
    )
  );
  const countMap = Object.fromEntries(counts.map(c => [c.loId, c.count]));

  // Get names from users table
  const userIds = los.map(lo => lo.user_id).filter(Boolean);
  const { data: users } = userIds.length
    ? await sb.from('users').select('id, full_name, email').in('id', userIds)
    : { data: [] };
  const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u]));

  const result = los.map(lo => ({
    id:            lo.id,
    user_id:       lo.user_id,
    name:          userMap[lo.user_id]?.full_name ?? lo.email ?? 'Unknown',
    email:         userMap[lo.user_id]?.email ?? lo.email ?? '',
    lender:        lo.lender ?? '',
    borrower_count: countMap[lo.id] ?? 0,
  }));

  return NextResponse.json({ los: result });
}
