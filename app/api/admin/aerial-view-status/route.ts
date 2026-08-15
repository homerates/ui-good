// app/api/admin/aerial-view-status/route.ts
// Read-only status feed for the Google Aerial View integration -- lets Rayaan
// evaluate real-world hit rate / stability data without needing a one-off script
// each time. See app/admin/aerial-view-status/page.tsx for the UI.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/adminAuth';
import { getSupabase } from '../../../../lib/supabaseServer';

export async function GET() {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  const { data, error } = await sb
    .from('aerial_view_cache')
    .select('address_raw, state, video_id, http_status, error_detail, created_at, checked_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const entries = data ?? [];
  const total = entries.length;
  const active = entries.filter(e => e.state === 'ACTIVE').length;
  const processing = entries.filter(e => e.state === 'PROCESSING').length;
  const errored = entries.filter(e => e.state === 'ERROR' || e.state === 'UNAVAILABLE').length;

  const now = Date.now();
  const processingAges = entries
    .filter(e => e.state === 'PROCESSING')
    .map(e => (now - new Date(e.created_at).getTime()) / 60_000); // minutes
  const oldestProcessingMinutes = processingAges.length ? Math.max(...processingAges) : null;

  return NextResponse.json({
    entries,
    stats: {
      total,
      active,
      processing,
      errored,
      activeRate: total ? Math.round((active / total) * 100) : null,
      oldestProcessingMinutes: oldestProcessingMinutes != null ? Math.round(oldestProcessingMinutes) : null,
    },
  });
}
