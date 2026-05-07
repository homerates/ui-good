// app/api/discover/session/[id]/route.ts
// PATCH /api/discover/session/:id — save one lender response + gap result.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { questionId, raw, gapStatus, gapNote } = body;

    if (!questionId || !raw) {
      return NextResponse.json({ error: 'questionId and raw required' }, { status: 400 });
    }

    // Fetch current session
    const { data: session, error: fetchErr } = await supabase
      .from('discover_sessions')
      .select('lender_responses, gap_analysis')
      .eq('id', id)
      .single();

    if (fetchErr || !session) {
      return NextResponse.json({ error: 'session not found' }, { status: 404 });
    }

    const lenderResponses = {
      ...(session.lender_responses ?? {}),
      [questionId]: { raw, evaluated_at: new Date().toISOString() },
    };
    const gapAnalysis = {
      ...(session.gap_analysis ?? {}),
      [questionId]: { status: gapStatus, note: gapNote },
    };

    const { error: updateErr } = await supabase
      .from('discover_sessions')
      .update({ lender_responses: lenderResponses, gap_analysis: gapAnalysis })
      .eq('id', id);

    if (updateErr) {
      console.error('[discover/session PATCH]', updateErr);
      return NextResponse.json({ error: 'db error' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[discover/session PATCH]', err);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
