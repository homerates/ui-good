// app/api/digest/cron/route.ts
// GET — called by Vercel cron on the 1st of each month
// Loops every Pro LO's borrowers and fires the digest

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://chat.homerates.ai';

export async function GET(req: Request) {
    // Verify cron secret
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Fetch all borrowers with digest enabled, property address, and email
    const { data: borrowers, error } = await db
        .from('borrowers')
        .select('id, name, email, property_address, digest_enabled, loan_officers(user_id)')
        .eq('digest_enabled', true)
        .not('property_address', 'is', null)
        .not('email', 'is', null);

    if (error) {
        console.error('[digest/cron] fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results = { sent: 0, failed: 0, skipped: 0, errors: [] as string[] };

    for (const borrower of (borrowers ?? [])) {
        try {
            const res = await fetch(`${APP_URL}/api/digest/run`, {
                method:  'POST',
                headers: {
                    'Content-Type':    'application/json',
                    'x-cron-secret':   secret,
                },
                body: JSON.stringify({ borrower_id: borrower.id }),
            });
            const json = await res.json();
            if (json.ok) {
                results.sent++;
            } else {
                results.failed++;
                results.errors.push(`${borrower.name}: ${json.error}`);
            }
        } catch (e: any) {
            results.failed++;
            results.errors.push(`${borrower.name}: ${e.message}`);
        }
    }

    // Loop direct consumers — one email per tracked property
    const { data: consumers, error: consumerError } = await db
        .from('consumer_homeowner_properties')
        .select('id, name, email, property_address')
        .eq('digest_enabled', true)
        .not('property_address', 'is', null)
        .not('email', 'is', null);

    if (consumerError) {
        console.error('[digest/cron] consumer fetch error:', consumerError);
    }

    for (const consumer of (consumers ?? [])) {
        try {
            const res = await fetch(`${APP_URL}/api/digest/run`, {
                method:  'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'x-cron-secret': secret,
                },
                body: JSON.stringify({ consumer_id: consumer.id }),
            });
            const json = await res.json();
            if (json.ok) {
                results.sent++;
            } else {
                results.failed++;
                results.errors.push(`${consumer.name ?? consumer.id}: ${json.error}`);
            }
        } catch (e: any) {
            results.failed++;
            results.errors.push(`${consumer.name ?? consumer.id}: ${e.message}`);
        }
    }

    console.log('[digest/cron] complete', results);
    return NextResponse.json({ ok: true, ...results });
}
