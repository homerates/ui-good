// GET /api/admin/gateway-usage — Phase E1 operational visibility.
//
// Read-only. Aggregates over gateway_request_log (migration 084) and
// gateway_partners -- never selects key_hash, never joins gateway_credentials
// for anything beyond a count, never surfaces an address, IP, or Property
// Intelligence content, because none of those exist as columns on
// gateway_request_log at all (structurally absent, not merely unselected).
// One cohesive route for both "usage" (section 12) and "recent errors"
// (section 13) of the Phase E1 instruction, rather than two near-duplicate
// routes over the same table.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/adminAuth';
import { getSupabase } from '../../../../lib/supabaseServer';

// Simple recency cap, not a time-window query -- keeps this a plain
// "recent activity" view (per instruction: operational, not analytical) and
// bounds query cost as the table grows, without needing a date-range UI.
const RECENT_ROWS_LIMIT = 500;
const RECENT_ERRORS_LIMIT = 25;

export async function GET() {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'Supabase unavailable' }, { status: 500 });

  const [{ data: rows, error: rowsErr }, { data: partners, error: partnersErr }] = await Promise.all([
    sb
      .from('gateway_request_log')
      .select('partner_id, credential_id, outcome, error_code, latency_ms, created_at')
      .order('created_at', { ascending: false })
      .limit(RECENT_ROWS_LIMIT),
    sb.from('gateway_partners').select('id, name'),
  ]);

  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  if (partnersErr) return NextResponse.json({ error: partnersErr.message }, { status: 500 });

  const partnerName = new Map((partners ?? []).map((p) => [p.id, p.name]));

  const outcomeCounts: Record<string, number> = {};
  const byPartner = new Map<string, { partnerId: string | null; name: string; count: number; lastRequestAt: string }>();

  for (const r of rows ?? []) {
    outcomeCounts[r.outcome] = (outcomeCounts[r.outcome] ?? 0) + 1;

    const key = r.partner_id ?? '__unattributed__';
    const existing = byPartner.get(key);
    if (existing) {
      existing.count += 1;
      if (r.created_at > existing.lastRequestAt) existing.lastRequestAt = r.created_at;
    } else {
      byPartner.set(key, {
        partnerId: r.partner_id,
        name: r.partner_id ? (partnerName.get(r.partner_id) ?? '(unknown partner)') : 'Rejected before identity established',
        count: 1,
        lastRequestAt: r.created_at,
      });
    }
  }

  const recentErrors = (rows ?? [])
    .filter((r) => r.outcome === 'ERROR')
    .slice(0, RECENT_ERRORS_LIMIT)
    .map((r) => ({
      createdAt: r.created_at,
      partnerName: r.partner_id ? (partnerName.get(r.partner_id) ?? '(unknown partner)') : null,
      errorCode: r.error_code,
      latencyMs: r.latency_ms,
    }));

  return NextResponse.json({
    sampledRows: rows?.length ?? 0,
    sampleCapped: (rows?.length ?? 0) >= RECENT_ROWS_LIMIT,
    outcomeCounts,
    byPartner: Array.from(byPartner.values()).sort((a, b) => b.count - a.count),
    recentErrors,
  });
}
