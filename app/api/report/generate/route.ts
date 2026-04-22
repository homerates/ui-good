// app/api/report/generate/route.ts
// POST — generate a shareable report token for a borrower
// Auth: LO session only

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
}

function generateToken(len = 10): string {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    let t = '';
    for (let i = 0; i < len; i++) t += chars[Math.floor(Math.random() * chars.length)];
    return t;
}

export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const supabase = db();

    const [loRes, agentRes] = await Promise.all([
        supabase.from('loan_officers').select('id').eq('user_id', userId).maybeSingle(),
        supabase.from('agents').select('id').eq('user_id', userId).maybeSingle(),
    ]);
    const proId = loRes.data?.id ?? agentRes.data?.id ?? null;
    if (!proId) return NextResponse.json({ error: 'Professional profile not found' }, { status: 400 });

    const ownerCol = loRes.data ? 'loan_officer_id' : 'agent_id';

    const body = await req.json().catch(() => null);
    const borrowerId: string = body?.borrower_id ?? '';
    if (!borrowerId) return NextResponse.json({ error: 'borrower_id required' }, { status: 400 });

    // Verify borrower belongs to this professional
    const { data: borrower } = await supabase
        .from('borrowers')
        .select('id')
        .eq('id', borrowerId)
        .eq(ownerCol, proId)
        .single();
    if (!borrower) return NextResponse.json({ error: 'Borrower not found' }, { status: 404 });

    // Reuse existing token if one exists
    const { data: existing } = await supabase
        .from('borrower_reports')
        .select('token')
        .eq('borrower_id', borrowerId)
        .eq('lo_id', proId)
        .single();
    if (existing) return NextResponse.json({ ok: true, token: existing.token });

    // Generate unique token
    let token = generateToken();
    for (let i = 0; i < 5; i++) {
        const { data: clash } = await supabase
            .from('borrower_reports')
            .select('token')
            .eq('token', token)
            .single();
        if (!clash) break;
        token = generateToken();
    }

    const { error } = await supabase
        .from('borrower_reports')
        .insert({ token, borrower_id: borrowerId, lo_id: proId });
    if (error) return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });

    return NextResponse.json({ ok: true, token });
}
