// app/api/discover/session/route.ts
// POST /api/discover/session — create a new anonymous discover session.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    const { data, error } = await supabase
      .from('discover_sessions')
      .insert({
        loan_type: loanType,
        scenario_snapshot: scenarioSnapshot,
        thread_id: threadId ?? null,
        lender_responses: {},
        gap_analysis: {},
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
