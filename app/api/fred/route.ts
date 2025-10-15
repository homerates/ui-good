import { NextResponse } from "next/server";

const USE_FRED = process.env.USE_FRED === "true";
const FRED_API_KEY = process.env.FRED_API_KEY ?? "";

// simple in-memory cache (60s)
const cache = new Map<string, { at: number; data: any }>();
const TTL_MS = 60_000;

async function fredSeries(seriesId: string) {
  const key = `fred:${seriesId}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.data;

  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", FRED_API_KEY);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("observation_start", "2020-01-01");

  const t0 = now;
  const r = await fetch(url.toString(), { cache: "no-store" });
  const dt = Date.now() - t0;
  console.log(`[FRED] ${seriesId} ${r.status} in ${dt} ms`);

  if (!r.ok) throw new Error(`FRED ${seriesId} HTTP ${r.status}`);
  const data = await r.json();
  cache.set(key, { at: now, data });
  return data;
}

export async function GET(req: Request) {
  const t0 = Date.now();
  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get("ping")) {
      return NextResponse.json({ ok: true, source: "fred", ping: true, enabled: USE_FRED });
    }
    if (!USE_FRED) return NextResponse.json({ ok: false, error: "FRED disabled" }, { status: 200 });
    if (!FRED_API_KEY) return NextResponse.json({ ok: false, error: "Missing FRED_API_KEY" }, { status: 200 });

    const dgs10 = await fredSeries("DGS10");
    const mort30 = await fredSeries("MORTGAGE30US");

    console.log(`[FRED] route ok in ${Date.now() - t0} ms`);
    return NextResponse.json({ ok: true, dgs10, mort30 });
  } catch (err: any) {
    console.log(`[FRED] route error in ${Date.now() - t0} ms: ${String(err)}`);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 200 });
  }
}
