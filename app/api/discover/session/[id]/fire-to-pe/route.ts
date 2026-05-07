// app/api/discover/session/[id]/fire-to-pe/route.ts
// POST — inject Discover question/benchmark pairs as structured messages into a PE thread.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getQuestions, type LoanTypeKey } from '../../../../../../lib/discoverQuestions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Guard: don't fire twice into same thread
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('thread_id', threadId)
      .eq('metadata->>type', 'discover_question')
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, already_fired: true });
    }

    const loanType = session.loan_type as LoanTypeKey;
    const snap = session.scenario_snapshot;
    const questions = getQuestions(loanType);

    // Insert one question + one AI benchmark message per question, sequentially
    for (const q of questions) {
      const questionText = q.prompt(snap);
      const aiValue = q.aiValue(snap);
      const aiSub = q.aiSub(snap);

      // 1. Discover question — appears as "YOU · VIA DISCOVER" in thread
      await supabase.from('messages').insert({
        thread_id: threadId,
        sender_role: 'borrower',
        content: questionText,
        metadata: {
          type: 'discover_question',
          question_id: q.id,
          title: q.title,
          icon: q.icon,
          ai_value: aiValue,
          ai_sub: aiSub,
        },
      });

      // 2. AI benchmark — appears as "HOMERATES AI" green block in thread
      await supabase.from('messages').insert({
        thread_id: threadId,
        sender_role: 'system',
        content: aiValue,
        metadata: {
          type: 'ai_benchmark',
          question_id: q.id,
          ai_value: aiValue,
          ai_sub: aiSub,
          title: q.title,
        },
      });
    }

    // Update thread: last_message_at + mark unread for professional
    const { data: thread } = await supabase
      .from('conversation_threads')
      .select('unread_professional')
      .eq('id', threadId)
      .maybeSingle();

    await supabase
      .from('conversation_threads')
      .update({
        last_message_at: new Date().toISOString(),
        unread_professional: (thread?.unread_professional ?? 0) + questions.length,
      })
      .eq('id', threadId);

    // Link session to thread
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
