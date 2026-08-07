// app/api/consumer-memory/route.ts
// GET    /api/consumer-memory — the signed-in consumer's OWN recent-activity
//        summary (last 30 days, capped at 5 events) combined with today's rate.
// DELETE /api/consumer-memory — permanently deletes the caller's consumer_activity
//        rows. Hard delete, not a soft "stop using" flag — see reasoning below.
//
// Both always scoped to the caller's own Clerk id via auth(). This route
// intentionally accepts no target-user parameter, so it cannot be used to
// read or clear another person's activity. That's the Decision 10 boundary
// enforced at the API layer, not just by convention.
//
// Why hard delete, not a "stop personalizing" flag: consumer_activity has
// exactly one consumer today (this personalization feature) and no existing
// soft-delete precedent. A flag would mean telling someone "cleared" while
// quietly keeping their data — inconsistent with the trust-first positioning
// this whole privacy model (Decision 10) was built on. If a second feature
// ever needs this table's raw history independent of personalization, revisit.
//
// Consumed by: My Home "welcome back" card, consumer-mode chat context,
// profile settings memory control.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { buildConsumerMemorySummary, readAndBumpLastSeen } from '../../../lib/crm/consumer-memory';

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
}

// Auth-scoped, per-user, changes on every new event — must never be cached
// at the edge/CDN or by the browser. Same pattern as app/api/v2/chats/[id].
function noStore(json: unknown, status = 200) {
    const res = NextResponse.json(json, { status });
    res.headers.set('Cache-Control', 'no-store');
    return res;
}

export async function GET() {
    const { userId } = await auth();
    if (!userId) return noStore({ ok: true, hasActivity: false, summaryText: '', events: [] });

    const sb = db();
    // This GET is the real "opened /activity" moment — the one place that
    // should bump last_seen_at (as opposed to app/api/answers/route.ts's
    // separate buildConsumerMemorySummary call on every chat turn, which
    // must not).
    const { previousLastSeenAt } = await readAndBumpLastSeen(sb, userId);
    const summary = await buildConsumerMemorySummary(sb, userId, { previousLastSeenAt });

    return noStore({ ok: true, ...summary });
}

export async function DELETE() {
    const { userId } = await auth();
    if (!userId) return noStore({ ok: false, error: 'Not authenticated' }, 401);

    const sb = db();
    const { error } = await sb.from('consumer_activity').delete().eq('consumer_user_id', userId);
    if (error) return noStore({ ok: false, error: error.message }, 500);

    return noStore({ ok: true });
}
