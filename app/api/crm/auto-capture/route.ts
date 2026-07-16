// app/api/crm/auto-capture/route.ts
// POST /api/crm/auto-capture
// Body: { event: 'property_viewed' | 'affordability_run', data: {...} }
//
// Client-side auto-capture endpoint. Called fire-and-forget from consumer pages
// when a meaningful platform event occurs. Always returns 200 — the caller does
// not need to wait for or inspect the response.
//
// Writes to consumer_activity keyed on the signed-in user's Clerk id. No
// borrower or LO dependency — any signed-in user's events are captured.
//
// Server-side events (AMI qualifier save) call lib/crm/platform-capture.ts
// directly without going through this route.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { emitPlatformEvent } from '../../../../lib/crm/platform-capture';
import type { CrmKeyFact, LoanTypePref } from '../../../../lib/crm/types';

export const runtime    = 'nodejs';
export const maxDuration = 15;

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
}

export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ ok: true }); // not signed in — skip silently

    const body = await req.json().catch(() => null);
    if (!body?.event) return NextResponse.json({ ok: true });

    const sb = db();

    try {
        if (body.event === 'property_viewed') {
            const { address } = body.data as { address?: string };
            if (!address?.trim()) return NextResponse.json({ ok: true });
            const fact: CrmKeyFact = { key: 'property_of_interest', address: address.trim() };
            await emitPlatformEvent(sb, userId, 'property_viewed',
                `Viewed property: ${address.trim().slice(0, 80)}`,
                [fact],
            );
        }

        else if (body.event === 'affordability_run') {
            const { loan_type, purchase_price, down_pct, monthly_piti } = body.data as {
                loan_type:      LoanTypePref;
                purchase_price: number;
                down_pct:       number;
                monthly_piti:   number;
            };
            if (!loan_type || !purchase_price) return NextResponse.json({ ok: true });
            const fact: CrmKeyFact = { key: 'affordability_run', loan_type, purchase_price, down_pct, monthly_piti };
            const label = loan_type.toUpperCase();
            await emitPlatformEvent(sb, userId, 'affordability_run',
                `Ran ${label} scenario: $${Math.round(purchase_price / 1000)}k · $${monthly_piti}/mo PITI`,
                [fact],
            );
        }
    } catch (err) {
        console.error('[auto-capture route]', (err as Error)?.message ?? err);
    }

    return NextResponse.json({ ok: true });
}
