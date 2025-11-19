// ==== NEW FILE: app/api/projects/move-chat/route.ts ====
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Using the same public creds you use on the client.
// RLS is off right now so this is fine for your prototype.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
    console.error(
        '[move-chat] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
}

const supabase =
    supabaseUrl && anonKey ? createClient(supabaseUrl, anonKey) : null;

// POST /api/projects/move-chat
// Body: { threadId: string; projectId: string }
export async function POST(req: Request) {
    if (!supabase) {
        return NextResponse.json(
            { ok: false, error: 'Supabase is not configured on the server.' },
            { status: 500 },
        );
    }

    let body: { threadId?: string; projectId?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json(
            { ok: false, error: 'Invalid JSON body.' },
            { status: 400 },
        );
    }

    const threadId = body.threadId?.trim();
    const projectId = body.projectId?.trim();

    if (!threadId || !projectId) {
        return NextResponse.json(
            { ok: false, error: 'threadId and projectId are required.' },
            { status: 400 },
        );
    }

    // Your schema: project_threads(id, clerk_user_id, project_id, thread_id, created_at)
    const { error } = await supabase
        .from('project_threads')
        .update({ project_id: projectId })
        .eq('thread_id', threadId);

    if (error) {
        console.error('[move-chat] Supabase error:', error);
        return NextResponse.json(
            { ok: false, error: error.message },
            { status: 500 },
        );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
}
