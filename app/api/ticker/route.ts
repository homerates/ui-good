// app/api/ticker/route.ts
// Lightweight endpoint the WelcomeScreen polls for live FRED ticker values.
// Returns 4 items: 30Y FIXED, 10Y TREASURY, SPREAD, FED FUNDS.
// Cached 10 min at the CDN via s-maxage; stale-while-revalidate keeps it snappy.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSnapshot } from "../../../lib/market-data";

const CACHE_S = 600; // 10 minutes

function fmt(n: number | null, decimals = 2): string {
  return n != null ? `${n.toFixed(decimals)}%` : "—";
}

export async function GET() {
  // AD-11 Seam 2: was getFredSnapshot() (live FRED call) + its own direct
  // EFFR fetch; now a single Market Data Service read. FRED_API_KEY is no
  // longer relevant to this request path -- availability now depends on
  // whether the sync cron has populated data, not a live external call.
  const snap = await getSnapshot(['MORTGAGE30US', 'DGS10', 'EFFR']);
  const mort30 = snap['MORTGAGE30US'];
  const dgs10 = snap['DGS10'];
  const effrObs = snap['EFFR'];

  if (!mort30 && !dgs10) {
    // No synced data yet (e.g. before the sync cron's first run) — same
    // placeholder contract the old "no FRED_API_KEY" branch returned.
    return NextResponse.json({
      ok: true,
      live: false,
      items: [
        { label: "30Y FIXED", value: "—", sub: "FRED avg" },
        { label: "10Y TREASURY", value: "—", sub: "yield" },
        { label: "SPREAD", value: "—", sub: "mtg vs T10" },
        { label: "FED FUNDS", value: "—", sub: "effective rate" },
      ],
    });
  }

  const mort30Avg = mort30?.value ?? null;
  const tenYearYield = dgs10?.value ?? null;
  const spread = mort30Avg != null && tenYearYield != null
    ? +(mort30Avg - tenYearYield).toFixed(2) : null;
  const effr = effrObs?.value ?? null;
  const asOf = mort30?.observationDate ?? dgs10?.observationDate ?? null;
  const subDate = asOf ? `wk of ${asOf.slice(0, 7)}` : "FRED avg";

  const items = [
    { label: "30Y FIXED", value: fmt(mort30Avg), sub: subDate },
    { label: "10Y TREASURY", value: fmt(tenYearYield), sub: "yield" },
    { label: "SPREAD", value: fmt(spread), sub: "mtg vs T10" },
    { label: "FED FUNDS", value: fmt(effr), sub: "effective rate" },
  ];

  const res = NextResponse.json({ ok: true, live: true, items, asOf });
  res.headers.set(
    "Cache-Control",
    `public, s-maxage=${CACHE_S}, stale-while-revalidate=60`
  );
  return res;
}
