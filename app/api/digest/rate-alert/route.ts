// app/api/digest/rate-alert/route.ts
// GET — daily cron: if 30yr mortgage rate moved >10bps since yesterday, fire digest for all active borrowers
// Called by Vercel cron at 8am daily via x-cron-secret header

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getFredSnapshot } from '@/lib/fred';

const sb = () => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get('x-cron-secret') !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = sb();
    const today = new Date().toISOString().split('T')[0];

    // Get current FRED rate
    const snap = await getFredSnapshot({ timeoutMs: 8000 });
    const currentRate = snap?.mort30Avg;
    if (!currentRate || !Number.isFinite(currentRate)) {
        return NextResponse.json({ ok: false, reason: 'FRED unavailable' });
    }

    // Get last stored rate snapshot
    const { data: lastSnap } = await db
        .from('rate_snapshots')
        .select('rate, snapshot_date')
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single();

    // Store today's snapshot
    await db.from('rate_snapshots').upsert({ snapshot_date: today, rate: currentRate }, { onConflict: 'snapshot_date' });

    // Check if rate moved >10bps
    if (!lastSnap || lastSnap.snapshot_date === today) {
        return NextResponse.json({ ok: true, reason: 'No prior snapshot or already ran today', currentRate });
    }

    const delta = currentRate - lastSnap.rate;
    if (Math.abs(delta) < 0.10) {
        return NextResponse.json({ ok: true, reason: `Rate moved only ${Math.abs(delta).toFixed(3)}% — below 0.10% threshold`, currentRate, delta });
    }

    // Rate moved enough — find all digest-subscribed borrowers
    const { data: borrowers } = await db
        .from('borrowers')
        .select('id, email, name, property_address')
        .eq('digest_enabled', true)
        .not('email', 'is', null)
        .not('property_address', 'is', null);

    if (!borrowers?.length) {
        return NextResponse.json({ ok: true, reason: 'No eligible borrowers', delta });
    }

    const appBase = process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'https://chat.homerates.ai';
    const results: { id: string; status: string }[] = [];

    for (const b of borrowers) {
        try {
            const res = await fetch(`${appBase}/api/digest/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-cron-secret': secret ?? '',
                },
                body: JSON.stringify({
                    borrower_id:    b.id,
                    is_rate_alert:  true,
                    rate_delta:     delta,
                }),
            });
            results.push({ id: b.id, status: res.ok ? 'sent' : `error:${res.status}` });
        } catch (e) {
            results.push({ id: b.id, status: `exception:${String(e)}` });
        }
    }

    return NextResponse.json({ ok: true, currentRate, prevRate: lastSnap.rate, delta, borrowersNotified: results.length, results });
}
