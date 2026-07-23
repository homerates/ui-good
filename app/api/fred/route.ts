// app/api/fred/route.ts
// Live FRED data endpoint — returns 30Y fixed, 15Y fixed, 10Y treasury,
// spread, and asOf date. Confirmed external callers: app/api/content/generate,
// app/api/discover/full-analysis.
//
// AD-11 Seam 2: was a thin wrapper over src/lib/fred.ts's getFredSnapshot()
// (which only ever fetched DGS10 + MORTGAGE30US); now reads Market Data
// Service directly. mort15Avg was hardcoded null here before ("not fetched
// from FRED directly") -- MORTGAGE15US is synced now, so this returns a real
// value. Response shape is otherwise unchanged for the confirmed callers.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSnapshot } from "../../../lib/market-data";

const CACHE_S = 600; // 10 minutes CDN cache

export async function GET() {
  const snap = await getSnapshot(['MORTGAGE30US', 'MORTGAGE15US', 'DGS10']);
  const mort30 = snap['MORTGAGE30US'];
  const mort15 = snap['MORTGAGE15US'];
  const dgs10 = snap['DGS10'];

  if (!mort30) {
    return NextResponse.json({
      ok: false,
      rate: null,
      mort30Avg: null,
      mort15Avg: null,
      tenYearYield: null,
      spread: null,
      asOf: null,
      stale: true,
      source: "stub",
    });
  }

  const mort30Avg = mort30.value;
  const tenYearYield = dgs10?.value ?? null;
  const spread = mort30Avg != null && tenYearYield != null
    ? +(mort30Avg - tenYearYield).toFixed(2) : null;
  const asOf = mort30.observationDate;
  const stale = Date.now() - new Date(asOf).getTime() > 7 * 86_400_000;

  const res = NextResponse.json({
    ok: true,
    rate: mort30Avg,          // convenience alias used by borrowers route
    mort30Avg,
    mort15Avg: mort15?.value ?? null,
    tenYearYield,
    spread,
    asOf,
    stale,
    source: "fred",
  });

  res.headers.set(
    "Cache-Control",
    `public, s-maxage=${CACHE_S}, stale-while-revalidate=60`
  );
  return res;
}
