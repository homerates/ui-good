// app/api/log-answer/route.ts
// Lightweight logger for saving Q&A turns into public.user_answers
// Does NOT touch or depend on your existing answers/route.ts "brain".

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
// Use a relative import so we don't depend on TS path aliases.
import { ensureProjectThread, logUserAnswer } from '../../../lib/homerates-db';

// If you already have a central supabase server helper, you can replace this
// inline client with an import from that file instead.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
    // This will surface early in dev if env vars are missing
    // (rather than failing silently).
    console.warn(
        '[log-answer] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY',
    );
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const {
            question,
            answer,
            projectId,        // optional: Supabase projects.id
            externalThreadId, // optional: your chat thread id from the UI
            loanOfficerId,    // optional: Supabase loan_officers.id
            borrowerId,       // optional: Supabase borrowers.id
            toolId,           // e.g. 'mortgage-solutions', 'ask-underwriting'
            metadata,         // calc inputs, guideline refs, rate data, etc.
            role,             // 'user' | 'assistant' | 'system' (optional, default assistant)
        } = body ?? {};

        if (!question && !answer) {
            return NextResponse.json(
                { ok: false, error: 'Missing question and answer payload' },
                { status: 400 },
            );
        }

        // 1) Ensure there is a project_thread row (or create one)
        // If you don't use projects/threads yet, you can pass nulls from the client.
        const thread = await ensureProjectThread(supabase, {
            projectId: projectId ?? null,
            externalThreadId: externalThreadId ?? null,
            title: (question as string | undefined)?.slice(0, 80) ?? null,
            createdByRole: 'borrower', // or 'loan_officer' depending on context
        });

        // 2) Log this Q&A turn into user_answers
        await logUserAnswer(supabase, {
            projectThreadId: thread.id,
            role: (role as 'user' | 'assistant' | 'system') ?? 'assistant',
            loanOfficerId: loanOfficerId ?? null,
            borrowerId: borrowerId ?? null,
            toolId: toolId ?? null,
            question: question ?? null,
            answer: answer ?? null,
            metadata: metadata ?? {},
        });

        return NextResponse.json({ ok: true, threadId: thread.id });
    } catch (err: unknown) {
        console.error('[log-answer] Error logging answer', err);
        return NextResponse.json(
            {
                ok: false,
                error:
                    err instanceof Error ? err.message : 'Unknown error logging answer',
            },
            { status: 500 },
        );
    }
}
