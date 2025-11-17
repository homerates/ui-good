// app/api/library/route.ts

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * Lazy Supabase client creator.
 * - Works with SUPABASE_URL / SUPABASE_ANON_KEY from Vercel or .env.local
 * - Returns null instead of throwing if not configured
 */
function getSupabaseClient(): SupabaseClient | null {
    const url =
        process.env.SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        '';

    const key =
        process.env.SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        '';

    if (!url || !key) {
        console.warn('[library] Supabase not configured (missing URL or ANON KEY)');
        return null;
    }

    return createClient(url, key);
}

export async function POST(req: Request) {
    try {
        const { clerkUserId, question, answer } = await req.json();

        if (!clerkUserId || !question || !answer) {
            return NextResponse.json(
                { error: 'missing data', missing: { clerkUserId: !clerkUserId, question: !question, answer: !answer } },
                { status: 400 }
            );
        }

        const supabase = getSupabaseClient();

        if (!supabase) {
            // Do NOT crash build / runtime just because Supabase is not wired
            return NextResponse.json(
                { error: 'Supabase not configured', saved: false },
                { status: 500 }
            );
        }

        const { error } = await supabase
            .from('user_answers')
            .insert({
                clerk_user_id: clerkUserId,
                question,
                answer,
            });

        if (error) {
            console.error('[library] Supabase insert error:', error);
            return NextResponse.json(
                { error: error.message, saved: false },
                { status: 500 }
            );
        }

        return NextResponse.json({ saved: true });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[library] POST handler failed:', msg);
        return NextResponse.json(
            { error: 'Unexpected error', details: msg },
            { status: 500 }
        );
    }
}
