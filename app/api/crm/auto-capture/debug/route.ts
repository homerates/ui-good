// GET /api/crm/auto-capture/debug
// Diagnostic: traces the full identity chain for the current consumer.
// Returns JSON describing every step so we can see where capture breaks.
// REMOVE after debugging is complete.

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
}

export async function GET() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'not signed in' });

    const sb = db();
    const steps: Record<string, unknown> = { userId };

    // Step 1: resolve email from Clerk
    let email: string | null = null;
    try {
        const client = await clerkClient();
        const user   = await client.users.getUser(userId);
        email = user.emailAddresses[0]?.emailAddress ?? null;
        steps.clerkEmail = email;
    } catch (err) {
        steps.clerkEmailError = (err as Error)?.message ?? String(err);
    }

    // Step 2: borrower lookup by user_id
    const { data: byUserId, error: e1 } = await sb
        .from('borrowers')
        .select('id, email, loan_officer_id, agent_id, user_id')
        .eq('user_id', userId);
    steps.borrowersByUserId = byUserId ?? [];
    if (e1) steps.borrowersByUserIdError = e1.message;

    // Step 3: borrower lookup by email
    let emailMatches: Array<{ id: string; loan_officer_id: string | null; agent_id: string | null }> = [];
    if (!byUserId?.length && email) {
        const { data: em, error: e2 } = await sb
            .from('borrowers')
            .select('id, email, loan_officer_id, agent_id, user_id')
            .ilike('email', email.trim())
            .or('loan_officer_id.not.is.null,agent_id.not.is.null');
        emailMatches = em ?? [];
        steps.borrowersByEmail = emailMatches;
        if (e2) steps.borrowersByEmailError = e2.message;
    }

    const borrowers = byUserId?.length ? byUserId : emailMatches;
    steps.resolvedBorrowers = borrowers;

    // Step 4: LO user_id resolution
    const loChecks: Record<string, unknown>[] = [];
    for (const b of borrowers) {
        const check: Record<string, unknown> = { borrower_id: b.id };
        if (b.loan_officer_id) {
            const { data: lo, error: loErr } = await sb
                .from('loan_officers')
                .select('id, user_id')
                .eq('id', b.loan_officer_id)
                .maybeSingle();
            check.loan_officer_id = b.loan_officer_id;
            check.lo_row = lo;
            if (loErr) check.lo_error = loErr.message;
        } else if (b.agent_id) {
            const { data: ag, error: agErr } = await sb
                .from('agents')
                .select('id, user_id')
                .eq('id', b.agent_id)
                .maybeSingle();
            check.agent_id = b.agent_id;
            check.agent_row = ag;
            if (agErr) check.agent_error = agErr.message;
        } else {
            check.note = 'no loan_officer_id or agent_id';
        }
        loChecks.push(check);
    }
    steps.loResolution = loChecks;

    // Step 5: check person_activity table exists + recent rows
    const { data: recent, error: e3 } = await sb
        .from('person_activity')
        .select('id, touchpoint_type, subject, created_at')
        .eq('touchpoint_type', 'platform_event')
        .order('created_at', { ascending: false })
        .limit(5);
    steps.recentPlatformEvents = recent ?? [];
    if (e3) steps.personActivityError = e3.message;

    return NextResponse.json(steps, { status: 200 });
}
