// app/api/discover/session/[id]/fire-to-pe/route.ts
// POST — inject Discover questions as a system message into a PE thread.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getQuestions, type LoanTypeKey } from '../../../../../../lib/discoverQuestions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { threadId } = await req.json();

    if (!threadId) {
      return NextResponse.json({ error: 'threadId required' }, { status: 400 });
    }

    // Fetch session
    const { data: session, error: sessErr } = await supabase
      .from('discover_sessions')
      .select('loan_type, scenario_snapshot')
      .eq('id', id)
      .single();

    if (sessErr || !session) {
      return NextResponse.json({ error: 'session not found' }, { status: 404 });
    }

    const loanType = session.loan_type as LoanTypeKey;
    const snap = session.scenario_snapshot;
    const questions = getQuestions(loanType);

    // Format questions as structured text for the PE thread
    const loanLabel = { fha: 'FHA', conventional: 'Conventional', va: 'VA', jumbo: 'Jumbo' }[loanType] ?? loanType.toUpperCase();
    const price = snap.price ? `$${Math.round(snap.price).toLocaleString()}` : '';
    const rate  = snap.rate  ? `${snap.rate.toFixed(3)}%` : '';

    const header = `🔍 Discover · ${loanLabel} Loan${price ? ` · ${price}` : ''}${rate ? ` · AI benchmark ${rate}` : ''}\n\nPlease answer the following questions so we can compare your quote to current market benchmarks:\n`;

    const body = questions.map((q, i) =>
      `${i + 1}. ${q.icon} ${q.title}\n   ${q.prompt(snap)}`
    ).join('\n\n');

    const footer = '\n\n─\nResponses are used by HomeRates AI anonymously to verify loan accuracy and improve market intelligence. Lender answers are never shared publicly.';

    const content = header + '\n' + body + footer;

    // Insert system message into thread
    const { error: msgErr } = await supabase
      .from('messages')
      .insert({
        thread_id: threadId,
        sender_role: 'system',
        content,
        metadata: { type: 'discover', session_id: id, loan_type: loanType },
      });

    if (msgErr) {
      console.error('[discover/fire-to-pe]', msgErr);
      return NextResponse.json({ error: 'db error' }, { status: 500 });
    }

    // Link session to thread if not already linked
    await supabase
      .from('discover_sessions')
      .update({ thread_id: threadId })
      .eq('id', id)
      .is('thread_id', null);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[discover/fire-to-pe]', err);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
