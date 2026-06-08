// app/api/admin/drift-log/route.ts
// GET  — list drift log entries (filterable by status)
// POST — manually create a drift log entry
// PATCH — update diagnosis / fix / status on an entry

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSupabase } from '../../../../lib/supabaseServer';

async function isAdmin(userId: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data } = await sb
    .from('admin_users')
    .select('clerk_user_id')
    .eq('clerk_user_id', userId)
    .maybeSingle();
  return !!data;
}

// GET — list all entries, optionally filtered by status
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get('status');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '300'), 500);

  let query = sb
    .from('routing_drift_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ entries: data ?? [] });
}

// POST — manually create a drift log entry from admin UI
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const { seed_prompt, landed_on = 'grok', expected_card, diagnosis } = body;

  if (!seed_prompt?.trim()) {
    return NextResponse.json({ error: 'seed_prompt required' }, { status: 400 });
  }

  const { data, error } = await sb
    .from('routing_drift_log')
    .insert({
      seed_prompt:    seed_prompt.trim(),
      landed_on:      landed_on?.trim() || 'grok',
      expected_card:  expected_card?.trim() || null,
      diagnosis:      diagnosis?.trim() || null,
      source:         'manual',
      user_id:        userId,
      status:         'open',
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: data?.id });
}

// PATCH — update any investigatable fields on an existing entry
export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const { id, expected_card, diagnosis, fix_applied, fix_worked, status } = body;

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const VALID = ['open', 'diagnosed', 'fixed', 'wont_fix'];
  if (status !== undefined && !VALID.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (expected_card !== undefined) updates.expected_card = expected_card?.trim() || null;
  if (diagnosis    !== undefined) updates.diagnosis     = diagnosis?.trim()    || null;
  if (fix_applied  !== undefined) updates.fix_applied   = fix_applied?.trim()  || null;
  if (fix_worked   !== undefined) updates.fix_worked    = fix_worked === null ? null : Boolean(fix_worked);
  if (status       !== undefined) updates.status        = status;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { error } = await sb.from('routing_drift_log').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
