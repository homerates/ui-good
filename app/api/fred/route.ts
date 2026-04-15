// app/api/fred/route.ts
// Live FRED data endpoint — returns 30Y fixed, 10Y treasury, spread, and asOf date.
// Used by the content engine, borrowers welcome email, and any server that needs
// a quick FRED snapshot without importing the library directly.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getFredSnapshot } from "@/lib/fred";

const CACHE_S = 600; // 10 minutes CDN cache

export async function GET() {
  const snap = await getFredSnapshot({ timeoutMs: 6000 });

  if (!snap || snap.source === "stub" || !snap.mort30Avg) {
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

  const res = NextResponse.json({
    ok: true,
    rate: snap.mort30Avg,          // convenience alias used by borrowers route
    mort30Avg: snap.mort30Avg,
    mort15Avg: null,               // not fetched from FRED directly
    tenYearYield: snap.tenYearYield,
    spread: snap.spread,
    asOf: snap.asOf,
    stale: snap.stale,
    source: snap.source,
  });

  res.headers.set(
    "Cache-Control",
    `public, s-maxage=${CACHE_S}, stale-while-revalidate=60`
  );
  return res;
}
