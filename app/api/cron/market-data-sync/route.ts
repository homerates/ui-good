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
import { runSync } from "../../../../lib/market-data";

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

    return NextResponse.json({ ok: failed.length === 0, ...result });
}

// Vercel sends GET for scheduled cron triggers.
export async function GET(req: NextRequest) {
    return POST(req);
}
