// app/api/discover/session/[id]/fire-to-pe/route.ts
// POST — inject ONE chip question as a borrower message into a thread.
// Called when the borrower taps a chip in the Discover dock.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getQuestions, type LoanTypeKey } from '../../../../../../lib/discoverQuestions';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { threadId, questionId } = await req.json();

    if (!threadId || !questionId) {
      return NextResponse.json({ error: 'threadId and questionId required' }, { status: 400 });
    }

    // Fetch session
    const { data: session, error: sessErr } = await db()
      .from('discover_sessions')
      .select('loan_type, scenario_snapshot')
      .eq('id', id)
      .single();

    if (sessErr || !session) {
      return NextResponse.json({ error: 'session not found' }, { status: 404 });
    }

    // Guard: don't fire the same chip twice within the same scenario context.
    // If the thread has been reused for a new scenario (scenario_reset marker present),
    // only look for duplicates AFTER the last reset — chips from prior scenarios don't count.
    const { data: lastReset } = await db()
      .from('messages')
      .select('created_at')
      .eq('thread_id', threadId)
      .eq('metadata->>type', 'scenario_reset')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let dupQuery = db()
      .from('messages')
      .select('id')
      .eq('thread_id', threadId)
      .eq('metadata->>type', 'discover_chip')
      .eq('metadata->>chipId', questionId);

    if (lastReset?.created_at) {
      dupQuery = dupQuery.gt('created_at', lastReset.created_at);
    }

    const { data: existing } = await dupQuery.limit(1).maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, already_fired: true });
    }

    const loanType  = session.loan_type as LoanTypeKey;
    const snap      = session.scenario_snapshot;
    const questions = getQuestions(loanType);
    const question  = questions.find(q => q.id === questionId);

    if (!question) {
      return NextResponse.json({ error: 'unknown questionId' }, { status: 400 });
    }

    // Insert the chip question as a borrower message.
    // For the Rate chip, include fairParRate in metadata so the thread page can render
    // the L5 comparison strip after the LO replies.
    const metadata: Record<string, unknown> = {
      type:   'discover_chip',
      chipId: questionId,
      icon:   question.icon,
      title:  question.title,
    };
    if (questionId === 'rate' && typeof snap?.fairParRate === 'number') {
      metadata.fairParRate = snap.fairParRate;
    }

    await db().from('messages').insert({
      thread_id:   threadId,
      sender_role: 'borrower',
      content:     question.prompt(snap),
      metadata,
    });

    // Update thread: last_message_at + unread for professional
    const { data: thread } = await db()
      .from('conversation_threads')
      .select('unread_professional')
      .eq('id', threadId)
      .maybeSingle();

    await db()
      .from('conversation_threads')
      .update({
        last_message_at:     new Date().toISOString(),
        unread_professional: (thread?.unread_professional ?? 0) + 1,
      })
      .eq('id', threadId);

    // Link session to thread if not already linked
    await db()
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
