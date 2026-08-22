// app/api/discover/session/route.ts
// POST /api/discover/session — create a new anonymous discover session.
// GET  /api/discover/session?threadId=X — recover the session for the
//      CURRENT scenario chapter of this thread (a thread can be reused for a
//      new scenario, marked by a scenario_reset message — recovery must not
//      resurrect a prior scenario's session).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Sessions created after Phase C shipped are explicitly tagged; historical
// rows stay NULL/unversioned rather than being backfilled to this value.
const METHODOLOGY_VERSION = 'discover-phase-b-v1';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { loanType, scenarioSnapshot, threadId } = body;

    if (!loanType || !scenarioSnapshot) {
      return NextResponse.json({ error: 'loanType and scenarioSnapshot required' }, { status: 400 });
    }

    const valid = ['fha', 'conventional', 'va', 'jumbo', 'dscr'];
    if (!valid.includes(loanType)) {
      return NextResponse.json({ error: 'invalid loanType' }, { status: 400 });
    }

    const { data, error } = await db()
      .from('discover_sessions')
      .insert({
        loan_type: loanType,
        scenario_snapshot: scenarioSnapshot,
        thread_id: threadId ?? null,
        lender_responses: {},
        gap_analysis: {},
        findings: {},
        methodology_version: METHODOLOGY_VERSION,
        status: 'active',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[discover/session POST]', error);
      return NextResponse.json({ error: 'db error' }, { status: 500 });
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (err) {
    console.error('[discover/session POST]', err);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const threadId = req.nextUrl.searchParams.get('threadId');
    if (!threadId) return NextResponse.json({ error: 'threadId required' }, { status: 400 });

    const sb = db();

    // Same scenario_reset boundary already used by fire-to-pe, full-analysis,
    // and the thread page's own message derivation -- reusing it here (rather
    // than a bare "most recent session for this thread_id") is what makes
    // recovery safe for a thread that's been reused across multiple scenarios.
    const { data: resetMsg } = await sb
      .from('messages')
      .select('created_at')
      .eq('thread_id', threadId)
      .eq('metadata->>type', 'scenario_reset')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let query = sb.from('discover_sessions').select('*').eq('thread_id', threadId);
    if (resetMsg?.created_at) query = query.gte('created_at', resetMsg.created_at);

    // ascending + limit 1: the FIRST session created within this scenario's
    // window, so recovery consistently lands on the same row across reloads
    // even if more than one was ever created for it.
    const { data, error } = await query.order('created_at', { ascending: true }).limit(1).maybeSingle();

    if (error) {
      console.error('[discover/session GET]', error);
      return NextResponse.json({ error: 'db error' }, { status: 500 });
    }

    return NextResponse.json({ session: data ?? null });
  } catch (err) {
    console.error('[discover/session GET]', err);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
