// app/api/buyer-sessions/[id]/route.ts
// GET   — fetch a single evaluation session by ID (ownership enforced)
// PATCH — update scores / scenario for an existing session

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { computeComposite } from '../../../../lib/scoring/decisionScore';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const SEL = [
  'id', 'user_id', 'property_address', 'session_name', 'status',
  'scenario_json',
  'l1_score', 'l1_summary', 'l2_score', 'l2_summary',
  'l3_score', 'l3_summary', 'l4_score', 'l4_summary',
  'l5_score', 'l5_summary',
  'composite_score', 'card_fair_par_rate', 'created_at', 'updated_at',
].join(', ');

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const supabase = db();

  const { data, error } = await supabase
    .from('buyer_evaluation_sessions')
    .select(SEL)
    .eq('id', id)
    .eq('user_id', userId)   // ownership enforced — users can only read their own sessions
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  return NextResponse.json({ session: data });
}

// ── PATCH ──────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const body: Record<string, unknown> = await req.json().catch(() => ({}));
  const supabase = db();

  // Fetch current scores so we can recompute the composite correctly
  const { data: current, error: fetchErr } = await supabase
    .from('buyer_evaluation_sessions')
    .select('l1_score, l2_score, l3_score, l4_score, l5_score')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr || !current) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // Merge incoming scores over persisted ones
  const l1 = typeof body.l1_score === 'number' ? body.l1_score : current.l1_score;
  const l2 = typeof body.l2_score === 'number' ? body.l2_score : current.l2_score;
  const l3 = typeof body.l3_score === 'number' ? body.l3_score : current.l3_score;
  const l4 = typeof body.l4_score === 'number' ? body.l4_score : current.l4_score;

  // l5 (Rate Intelligence) intentionally excluded from the composite --
  // separate first-class output, never a composite input (locked product
  // decision, 2026-08-19). l5_score is still stored below for display.
  const patch: Record<string, unknown> = {
    updated_at:      new Date().toISOString(),
    composite_score: computeComposite({ l1, l2, l3, l4 }),
  };

  if (typeof body.l1_score === 'number') { patch.l1_score = body.l1_score; patch.l1_summary = body.l1_summary ?? null; }
  if (typeof body.l2_score === 'number') { patch.l2_score = body.l2_score; patch.l2_summary = body.l2_summary ?? null; }
  if (typeof body.l3_score === 'number') { patch.l3_score = body.l3_score; patch.l3_summary = body.l3_summary ?? null; }
  if (typeof body.l4_score === 'number') { patch.l4_score = body.l4_score; patch.l4_summary = body.l4_summary ?? null; }
  if (typeof body.l5_score === 'number') { patch.l5_score = body.l5_score; patch.l5_summary = body.l5_summary ?? null; }
  if (body.scenario_json != null)           patch.scenario_json     = body.scenario_json;
  if (typeof body.session_name     === 'string') patch.session_name     = body.session_name.trim() || null;
  if (typeof body.property_address === 'string') patch.property_address = body.property_address.trim() || null;
  if (typeof body.status           === 'string') patch.status           = body.status;
  if (typeof body.card_fair_par_rate === 'number') patch.card_fair_par_rate = body.card_fair_par_rate;

  const { data, error } = await supabase
    .from('buyer_evaluation_sessions')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select(SEL)
    .single();

  if (error) {
    console.error('[buyer-sessions PATCH]', id, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Best-effort audit trail — never blocks or fails the primary save.
  // See supabase/migrations/077_decision_score_history.sql.
  try {
    const saved = data as unknown as Record<string, unknown>;
    await supabase.from('decision_score_history').insert({
      session_id:      id,
      user_id:         userId,
      l1_score:        saved.l1_score ?? null,
      l2_score:        saved.l2_score ?? null,
      l3_score:        saved.l3_score ?? null,
      l4_score:        saved.l4_score ?? null,
      l5_score:        saved.l5_score ?? null,
      composite_score: saved.composite_score ?? null,
    });
  } catch (historyErr) {
    console.warn('[buyer-sessions PATCH] history insert failed (non-fatal)', historyErr);
  }

  return NextResponse.json({ ok: true, session: data });
}
