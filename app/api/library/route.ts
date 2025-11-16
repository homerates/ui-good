// app/api/library/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
    const { clerkUserId, question, answer } = await req.json();

    if (!clerkUserId || !question || !answer) {
        return NextResponse.json({ error: 'missing data' }, { status: 400 });
    }

    const { error } = await supabase
        .from('user_answers')
        .insert({
            clerk_user_id: clerkUserId,
            question,
            answer,
        });

    return error
        ? NextResponse.json({ error: error.message }, { status: 500 })
        : NextResponse.json({ saved: true });
}