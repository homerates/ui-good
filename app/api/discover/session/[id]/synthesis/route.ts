// app/api/discover/session/[id]/synthesis/route.ts
// PATCH /api/discover/session/:id/synthesis — persist the final session-level
// AI synthesis (strengths/concerns/missing_information/market_context/
// market_commentary/questions_worth_asking/alternatives_or_tradeoffs).
//
// Deliberately a SEPARATE endpoint from the per-domain Finding PATCH: the
// deterministic Findings must persist independently of this, so a failure
// here (or before this is ever called) never affects Findings already saved.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { synthesis } = await req.json();

    if (!synthesis || typeof synthesis !== 'object') {
      return NextResponse.json({ error: 'synthesis object required' }, { status: 400 });
    }
    // No decision_score or any numeric verdict is permitted in this contract.
    if ('decision_score' in synthesis) {
      return NextResponse.json({ error: 'decision_score is not a valid field' }, { status: 400 });
    }

    const { error } = await db()
      .from('discover_sessions')
      .update({ ai_synthesis: synthesis, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[discover/session/[id]/synthesis PATCH]', error);
      return NextResponse.json({ error: 'db error' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[discover/session/[id]/synthesis PATCH]', err);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
