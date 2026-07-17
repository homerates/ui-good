// app/api/crm/pro-welcome/route.ts
// GET /api/crm/pro-welcome — the signed-in professional's OWN welcome data.
//
// Sources (the only three permitted — see lib/crm/pro-memory.ts header):
//   1. person_activity rows the professional themselves wrote, filtered by
//      lo_user_id = their Clerk id (Decision 4 — the filter is not optional),
//      EXCLUDING touchpoint_type='platform_event' (behavioral rows written
//      by an abandoned early design; never legitimate here).
//   2. Their own pipeline records (borrowers.status / actual_rate).
//   3. Public market data (FRED, inside buildProWelcome).
//
// consumer_activity is NEVER queried here — establishing a relationship
// grants zero behavioral intelligence about the client (Decision 10 posture).
// key_facts are never selected, so NoteFact text cannot reach synthesis
// (Decision 2, enforced structurally).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { buildProWelcome, type ProRelationship } from '../../../../lib/crm/pro-memory';

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
}

function noStore(json: unknown, status = 200) {
    const res = NextResponse.json(json, { status });
    res.headers.set('Cache-Control', 'no-store');
    return res;
}

export async function GET() {
    const { userId } = await auth();
    if (!userId) return noStore({ ok: true, isPro: false, hasRelationships: false });

    const sb = db();

    // Resolve professional record — LO first, then agent (same order as getProContext).
    const [loRes, agentRes] = await Promise.all([
        sb.from('loan_officers').select('id').eq('user_id', userId).maybeSingle(),
        sb.from('agents').select('id').eq('user_id', userId).maybeSingle(),
    ]);
    const role: 'lo' | 'agent' | null = loRes.data ? 'lo' : agentRes.data ? 'agent' : null;
    const proId = loRes.data?.id ?? agentRes.data?.id ?? null;
    if (!role || !proId) return noStore({ ok: true, isPro: false, hasRelationships: false });

    // Pipeline records — the professional's own book.
    const col = role === 'lo' ? 'loan_officer_id' : 'agent_id';
    const { data: borrowers } = await sb
        .from('borrowers')
        .select('id, name, status, actual_rate')
        .eq(col, proId)
        .order('created_at', { ascending: false })
        .limit(100);

    if (!borrowers?.length) return noStore({ ok: true, isPro: true, role, hasRelationships: false });

    // The professional's own logged conversations. Decision 4 filter +
    // platform_event exclusion — see header comment.
    const { data: touches } = await sb
        .from('person_activity')
        .select('borrower_id, touchpoint_type, touchpoint_date, subject')
        .eq('lo_user_id', userId)
        .eq('is_superseded', false)
        .neq('touchpoint_type', 'platform_event')
        .order('touchpoint_date', { ascending: false })
        .limit(200);

    const newestByBorrower = new Map<string, { touchpoint_type: string; touchpoint_date: string; subject: string }>();
    for (const t of touches ?? []) {
        if (!newestByBorrower.has(t.borrower_id)) newestByBorrower.set(t.borrower_id, t);
    }

    const relationships: ProRelationship[] = borrowers.map(b => {
        const t = newestByBorrower.get(b.id);
        const days = t
            ? Math.max(0, Math.floor((Date.now() - new Date(t.touchpoint_date).getTime()) / 86_400_000))
            : null;
        return {
            borrower_id: b.id,
            name:        b.name ?? 'Unnamed client',
            status:      b.status ?? null,
            days_since_touch: days,
            last_subject: t?.subject ?? null,
            last_type:    t?.touchpoint_type ?? null,
            actual_rate:  typeof b.actual_rate === 'number' ? b.actual_rate : null,
        };
    });

    const summary = await buildProWelcome(userId, relationships, role);
    return noStore({ ok: true, isPro: true, role, ...summary });
}
