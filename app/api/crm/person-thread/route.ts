// app/api/crm/person-thread/route.ts
// Find-or-create a chats row scoped to a specific borrower.
// Used by PersonChat to resolve the thread ID on mount.
//
// GET /api/crm/person-thread?borrower_id=<uuid>
//   → { id: string, messages: array } if found
//   → { id: null } if not yet created

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';

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

export async function GET(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return noStore({ error: 'Not authenticated' }, 401);

    const borrowerId = new URL(req.url).searchParams.get('borrower_id');
    if (!borrowerId) return noStore({ error: 'borrower_id required' }, 400);

    const supabase = db();

    // Ownership check — borrower must belong to this LO
    const { data: borrower } = await supabase
        .from('borrowers')
        .select('id, loan_officer_id, agent_id')
        .eq('id', borrowerId)
        .maybeSingle();

    if (!borrower) return noStore({ error: 'Borrower not found' }, 404);

    const [loRow, agentRow] = await Promise.all([
        supabase.from('loan_officers').select('id').eq('user_id', userId).maybeSingle(),
        supabase.from('agents').select('id').eq('user_id', userId).maybeSingle(),
    ]);
    const loId    = loRow.data?.id    ?? null;
    const agentId = agentRow.data?.id ?? null;

    if (!(loId && borrower.loan_officer_id === loId) &&
        !(agentId && borrower.agent_id === agentId)) {
        return noStore({ error: 'Forbidden' }, 403);
    }

    // Look up existing borrower-scoped thread owned by this LO
    const { data: existing } = await supabase
        .from('chats')
        .select('id, messages')
        .eq('clerk_user_id', userId)
        .eq('borrower_id', borrowerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (existing) {
        return noStore({ id: existing.id, messages: existing.messages ?? [] });
    }

    return noStore({ id: null, messages: [] });
}
