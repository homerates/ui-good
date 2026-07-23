// app/api/cron/market-data-sync/route.ts
// AD-11 Market Data Service — daily sync of every registered series from
// FRED into Supabase. See vercel.json for schedule.
//
// Auth checks BOTH mechanisms seen elsewhere in this codebase's cron routes:
// the `Authorization: Bearer $CRON_SECRET` header (Vercel's documented
// automatic cron auth) and the `x-cron-secret` header / `?secret=` query
// param (the pattern app/api/cron/consumer-invite-reminder/route.ts uses for
// manual/external triggering). Covers both without guessing which one this
// project's Vercel cron config actually relies on.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { runSync } from "../../../../lib/market-data";

function isAuthorized(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;

    const authHeader = req.headers.get("authorization");
    if (authHeader === `Bearer ${secret}`) return true;

    const cronHeader = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
    return cronHeader === secret;
}

export async function POST(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runSync();
    const failed = result.results.filter(r => !r.ok);
    const totalRows = result.results.reduce((sum, r) => sum + r.rowsWritten, 0);

    console.log(
        `[market-data-sync] ${result.results.length} series, ${totalRows} rows written, ${failed.length} failed` +
        (failed.length ? ` — failed: ${failed.map(f => `${f.seriesId} (${f.error})`).join('; ')}` : ''),
    );

    return NextResponse.json({ ok: failed.length === 0, ...result });
}

// Vercel sends GET for scheduled cron triggers.
export async function GET(req: NextRequest) {
    return POST(req);
}
