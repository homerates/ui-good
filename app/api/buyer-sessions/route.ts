// app/api/buyer-sessions/route.ts
// GET  — list the signed-in user's evaluation sessions (newest first)
// POST — create or upsert an evaluation session

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { computeComposite } from '../../../lib/scoring/decisionScore';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function autoSessionName(body: Record<string, unknown>): string {
  if (typeof body.session_name === 'string' && body.session_name.trim()) {
    return body.session_name.trim();
  }
  const sj = body.scenario_json as Record<string, unknown> | null | undefined;
  if (sj?.price) {
    const p  = sj.price as number;
    const price = p >= 1_000_000
      ? `$${(p / 1_000_000).toFixed(1)}M`
      : `$${Math.round(p / 1000)}K`;
    const lt = sj.lt === 'jumbo' ? 'Jumbo' : sj.lt === 'fha' ? 'FHA' : sj.lt === 'va' ? 'VA' : 'Conv.';
    const dp = sj.dp_pct != null ? ` · ${sj.dp_pct}% down` : '';
    return `${lt} ${price}${dp}`;
  }
  if (typeof body.property_address === 'string' && body.property_address.trim()) {
    return body.property_address.trim().split(',')[0];
  }
  return `Evaluation ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

const SEL = [
  'id', 'user_id', 'property_address', 'session_name', 'status',
  'scenario_json',
  'l1_score', 'l1_summary', 'l2_score', 'l2_summary',
  'l3_score', 'l3_summary', 'l4_score', 'l4_summary',
  'l5_score', 'l5_summary',
  'composite_score', 'created_at', 'updated_at',
].join(', ');

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const supabase = db();
  const address  = new URL(req.url).searchParams.get('address')?.trim() ?? null;

  // Single-session lookup by address — used by property-intel to pull existing L1/L2
  if (address) {
    const { data, error } = await supabase
      .from('buyer_evaluation_sessions')
      .select(SEL)
      .eq('user_id', userId)
      .eq('property_address', address)
      .eq('status', 'active')
      .maybeSingle();
    if (error) {
      console.error('[buyer-sessions GET address]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ session: data ?? null });
  }

  // List all sessions (existing behaviour)
  const { data, error } = await supabase
    .from('buyer_evaluation_sessions')
    .select(SEL)
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[buyer-sessions GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sessions: data ?? [] });
}

// ── POST ───────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body: Record<string, unknown> = await req.json().catch(() => ({}));
  const supabase = db();

  // Normalise address (trim, keep original case — consistent with existing tables)
  const address = typeof body.property_address === 'string'
    ? body.property_address.trim() || null
    : null;

  // Resolve level scores from the incoming payload
  const l1 = typeof body.l1_score === 'number' ? body.l1_score : null;
  const l2 = typeof body.l2_score === 'number' ? body.l2_score : null;
  const l3 = typeof body.l3_score === 'number' ? body.l3_score : null;
  const l4 = typeof body.l4_score === 'number' ? body.l4_score : null;
  const l5 = typeof body.l5_score === 'number' ? body.l5_score : null;

  const payload: Record<string, unknown> = {
    user_id:         userId,
    property_address: address,
    session_name:    autoSessionName(body),
    status:          'active',
    updated_at:      new Date().toISOString(),
    composite_score: computeComposite({ l1, l2, l3, l4, l5 }),
  };

  if (body.scenario_json != null)            payload.scenario_json = body.scenario_json;
  if (l1 != null) { payload.l1_score = l1;  payload.l1_summary   = body.l1_summary   ?? null; }
  if (l2 != null) { payload.l2_score = l2;  payload.l2_summary   = body.l2_summary   ?? null; }
  if (l3 != null) { payload.l3_score = l3;  payload.l3_summary   = body.l3_summary   ?? null; }
  if (l4 != null) { payload.l4_score = l4;  payload.l4_summary   = body.l4_summary   ?? null; }
  if (l5 != null) { payload.l5_score = l5;  payload.l5_summary   = body.l5_summary   ?? null; }

  let data: unknown, error: unknown;

  if (address) {
    // Known address — check for existing session first, then update or insert
    const { data: existing } = await supabase
      .from('buyer_evaluation_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('property_address', address)
      .maybeSingle();

    if (existing?.id) {
      const res = await supabase
        .from('buyer_evaluation_sessions')
        .update(payload)
        .eq('id', existing.id)
        .eq('user_id', userId)
        .select(SEL)
        .single();
      data = res.data; error = res.error;
    } else {
      const res = await supabase
        .from('buyer_evaluation_sessions')
        .insert(payload)
        .select(SEL)
        .single();
      data = res.data; error = res.error;
    }
  } else {
    // No address yet — insert a new scenario-only session
    const res = await supabase
      .from('buyer_evaluation_sessions')
      .insert(payload)
      .select(SEL)
      .single();
    data = res.data; error = res.error;
  }

  if (error) {
    console.error('[buyer-sessions POST]', error);
    return NextResponse.json({ error: (error as any).message }, { status: 500 });
  }

  // Best-effort audit trail — never blocks or fails the primary save.
  // See supabase/migrations/077_decision_score_history.sql.
  try {
    const saved = data as Record<string, unknown>;
    await supabase.from('decision_score_history').insert({
      session_id:      saved.id,
      user_id:         userId,
      l1_score:        saved.l1_score ?? null,
      l2_score:        saved.l2_score ?? null,
      l3_score:        saved.l3_score ?? null,
      l4_score:        saved.l4_score ?? null,
      l5_score:        saved.l5_score ?? null,
      composite_score: saved.composite_score ?? null,
    });
  } catch (historyErr) {
    console.warn('[buyer-sessions POST] history insert failed (non-fatal)', historyErr);
  }

  return NextResponse.json({ ok: true, session: data });
}
