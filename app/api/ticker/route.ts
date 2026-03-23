// app/api/ticker/route.ts
// Lightweight endpoint the WelcomeScreen polls for live FRED ticker values.
// Returns 4 items: 30Y FIXED, 10Y TREASURY, SPREAD, FED FUNDS.
// Cached 10 min at the CDN via s-maxage; stale-while-revalidate keeps it snappy.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getFredSnapshot } from "@/lib/fred";

const CACHE_S = 600; // 10 minutes

async function fetchEffr(apiKey: string): Promise<number | null> {
  try {
    const url = new URL("https://api.stlouisfed.org/fred/series/observations");
    url.searchParams.set("series_id", "EFFR");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("sort_order", "desc");
    url.searchParams.set("limit", "5"); // grab a few so we can skip "." values
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { observations?: { value: string }[] };
    const obs = (json.observations ?? []).find((o) => o.value && o.value !== ".");
    return obs ? parseFloat(obs.value) : null;
  } catch {
    return null;
  }
}

function fmt(n: number | null, decimals = 2): string {
  return n != null ? `${n.toFixed(decimals)}%` : "—";
}

export async function GET() {
  const apiKey = process.env.FRED_API_KEY;

  if (!apiKey) {
    // No key: return placeholder so UI still renders gracefully
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

  const [snap, effr] = await Promise.all([
    getFredSnapshot({ timeoutMs: 6000 }),
    fetchEffr(apiKey),
  ]);

  const asOf = snap?.asOf ?? null;
  const subDate = asOf ? `wk of ${asOf.slice(0, 7)}` : "FRED avg";

  const items = [
    { label: "30Y FIXED", value: fmt(snap?.mort30Avg ?? null), sub: subDate },
    { label: "10Y TREASURY", value: fmt(snap?.tenYearYield ?? null), sub: "yield" },
    { label: "SPREAD", value: fmt(snap?.spread ?? null), sub: "mtg vs T10" },
    { label: "FED FUNDS", value: fmt(effr), sub: "effective rate" },
  ];

  const res = NextResponse.json({ ok: true, live: true, items, asOf });
  res.headers.set(
    "Cache-Control",
    `public, s-maxage=${CACHE_S}, stale-while-revalidate=60`
  );
  return res;
}
