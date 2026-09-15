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
import { Resend } from "resend";
import { runSync, getSnapshot } from "../../../../lib/market-data";

function isAuthorized(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;

    const authHeader = req.headers.get("authorization");
    if (authHeader === `Bearer ${secret}`) return true;

    const cronHeader = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
    return cronHeader === secret;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";
// Matches the alertAdmin() convention in app/api/content/cron/route.ts.
const ADMIN_EMAIL = "legatum2005@gmail.com";

// Staleness alert (2026-09-16) -- separate from alertAdmin() above, and for
// a deliberately different failure mode. A real, live incident showed the
// gap this closes: two marketing pages had a fully hardcoded, months-stale
// ticker that no sync failure here would ever have caught (this cron's own
// data was fine the whole time -- the bug was entirely in the consuming
// pages, never calling any live endpoint at all; see ARCHITECTURE_DECISIONS.md
// AD-46). This check exists for the OTHER way staleness can happen: this
// sync job itself keeps reporting `ok: true` every day (FRED responds, a row
// gets written) while the underlying observation date silently stops
// advancing -- FRED discontinues/renames a series, a market holiday gap
// exceeds what's normal, or FRED serves a cached/stale value on their end.
// alertAdmin() above only fires on an outright fetch/write error, which is
// exactly the failure mode its own email text says this does NOT catch
// ("no user-facing error, so this won't otherwise be noticed").
const CORE_SERIES: string[] = ["MORTGAGE30US", "DGS10", "EFFR"];
const STALE_THRESHOLD_DAYS = 10;

async function alertStaleData(stale: { seriesId: string; observationDate: string; ageDays: number }[]) {
    const key = process.env.RESEND_API_KEY;
    if (!key) return;
    const from = process.env.RESEND_FROM_EMAIL ?? "digest@mail.homerates.ai";
    const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    try {
        const resend = new Resend(key);
        await resend.emails.send({
            from,
            to: ADMIN_EMAIL,
            subject: `⚠️ Market data STALE: ${stale.length} core series over ${STALE_THRESHOLD_DAYS} days old — ${dateStr}`,
            html: `<p>Today's market-data sync ran without a reported error, but ${stale.length} core series
(the ones the public ticker and rate displays actually read) haven't produced a new observation
in over ${STALE_THRESHOLD_DAYS} days:</p>
<ul>
${stale.map(s => `  <li>${s.seriesId}: last observation ${s.observationDate} (${s.ageDays} days old)</li>`).join("\n")}
</ul>
<p>This is the failure mode a per-run sync-error alert can't catch: the sync itself keeps
"succeeding" (FRED responds, a row gets written) while the actual observation date stops
advancing. Common causes: FRED discontinued/renamed a series_id, an unusually long market
holiday gap, or FRED is serving a cached value on their end. Check
lib/market-data/registry.ts's series_id for each series above against FRED's own site.</p>`,
        });
    } catch (e) {
        console.error("[market-data-sync] stale-data alert email failed:", e instanceof Error ? e.message : String(e));
    }
}

async function alertAdmin(failed: { seriesId: string; error?: string }[], totalCount: number) {
    const key = process.env.RESEND_API_KEY;
    if (!key) return;
    const from = process.env.RESEND_FROM_EMAIL ?? "digest@mail.homerates.ai";
    const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    try {
        const resend = new Resend(key);
        await resend.emails.send({
            from,
            to: ADMIN_EMAIL,
            subject: `⚠️ Market data sync: ${failed.length}/${totalCount} series failed — ${dateStr}`,
            html: `<p>Daily FRED sync (app/api/cron/market-data-sync) had failures:</p>
<ul>
${failed.map(f => `  <li>${f.seriesId}: ${f.error ?? "unknown error"}</li>`).join("\n")}
</ul>
<p>Failed series keep serving their last successfully synced value (or the hardcoded fallback if never synced) until the next successful run — no user-facing error, so this won't otherwise be noticed.</p>
<p>Common causes: FRED_API_KEY expired/rate-limited, a series_id renamed/discontinued by FRED, or Supabase write rejected. Check Vercel function logs for [market-data-sync].</p>`,
        });
    } catch (e) {
        console.error("[market-data-sync] alert email failed:", e instanceof Error ? e.message : String(e));
    }
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

    if (failed.length > 0) {
        await alertAdmin(failed, result.results.length);
    }

    // Staleness check -- runs regardless of whether the sync itself reported
    // failures, since this catches a different problem (see alertStaleData's
    // own header note): a series can keep syncing "successfully" while its
    // real-world observation date silently stops advancing.
    const now = Date.now();
    const snapshot = await getSnapshot([...CORE_SERIES]);
    const stale = CORE_SERIES
        .map((seriesId) => {
            const obs = snapshot[seriesId];
            if (!obs?.observationDate) return null;
            const ageDays = Math.floor((now - new Date(obs.observationDate).getTime()) / 86_400_000);
            return ageDays > STALE_THRESHOLD_DAYS ? { seriesId, observationDate: obs.observationDate, ageDays } : null;
        })
        .filter((s): s is { seriesId: string; observationDate: string; ageDays: number } => s !== null);

    if (stale.length > 0) {
        console.warn(`[market-data-sync] STALE: ${stale.map(s => `${s.seriesId} (${s.ageDays}d old)`).join('; ')}`);
        await alertStaleData(stale);
    }

    return NextResponse.json({ ok: failed.length === 0 && stale.length === 0, ...result, stale });
}

// Vercel sends GET for scheduled cron triggers.
export async function GET(req: NextRequest) {
    return POST(req);
}
