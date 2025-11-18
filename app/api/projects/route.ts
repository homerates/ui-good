// ==== REPLACE ENTIRE FILE: app/api/projects/route.ts ====

// These three lines MUST appear before anything else
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
    try {
        // Clerk session (async)
        const session = await auth();
        const userId = session?.userId;

        if (!userId) {
            return NextResponse.json(
                { ok: false, error: 'Not authenticated' },
                { status: 401 }
            );
        }

        // Fetch projects
        const { data, error } = await supabase
            .from('projects')
            .select('id, name, created_at, updated_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            return NextResponse.json(
                { ok: false, error: 'Failed to load projects', details: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            ok: true,
            projects: data ?? [],
        });
    } catch (err: any) {
        return NextResponse.json(
            { ok: false, error: 'Server error', details: err?.message },
            { status: 500 }
        );
    }
}
