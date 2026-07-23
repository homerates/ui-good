// src/lib/fred.ts
// AD-11 Seam 2: compatibility shim over lib/market-data. Preserves the exact
// public API this file has always exported -- getFredSnapshot(),
// getFredCacheInfo(), warmFredCache(), the FredSnapshot type -- because it's
// directly imported by 14 files (lib/crm/consumer-memory.ts, lib/crm/pro-memory.ts,
// api/digest/rate-alert, api/digest/run, api/newsletter/send, api/alerts/check,
// api/homeowner/analysis, api/ticker, api/health, api/fred, api/deal-rooms/[id]/score,
// api/deal-rooms/[id]/ai, api/borrowers, src/lib/composeMarket.ts) -- none of
// which are in scope for this migration. They get the new Supabase-backed
// data source transparently; internals below are the only thing that changed.

import { getRange } from "../../lib/market-data/query";

const TEN_YEAR = "DGS10";
const MORTG_30US = "MORTGAGE30US";

export type FredSnapshot = {
  tenYearYield: number | null;
  mort30Avg: number | null;
  spread: number | null;
  asOf: string | null;
  stale: boolean;
  source: "fred" | "stub";
  prevTenYearYield?: number | null;
  prevMort30Avg?: number | null;
};

/* ------- 5-minute in-memory cache (per process) -------
   Kept local to this shim (rather than relying solely on lib/market-data/
   query.ts's own 60s cache) so getFredCacheInfo()'s existing contract --
   consumed by app/api/health/route.ts -- keeps meaning the same thing. */
let _cache: { key: string; at: number; data: FredSnapshot | null } | null = null;
const TTL_MS = 5 * 60 * 1000;

export function getFredCacheInfo() {
  if (!_cache) {
    return {
      cached: false,
      ageMs: null as number | null,
      asOf: null as string | null,
      source: null as string | null,
    };
  }
  return {
    cached: !!_cache.data,
    ageMs: Date.now() - _cache.at,
    asOf: _cache.data?.asOf ?? null,
    source: _cache.data?.source ?? null,
  };
}

export async function warmFredCache(msTimeout = 1500) {
  try {
    await getFredSnapshot({ timeoutMs: msTimeout });
  } catch {
    // best-effort; ignore
  }
}

export async function getFredSnapshot(opts?: {
  maxAgeDays?: number;
  /** Retained for call-site compatibility; unused. A Supabase read doesn't
   *  need the timeout budget a live FRED call did. */
  timeoutMs?: number;
}): Promise<FredSnapshot | null> {
  const maxAgeDays = opts?.maxAgeDays ?? 7;
  const now = Date.now();
  const cacheKey = `v2:${maxAgeDays}`;

  if (_cache && _cache.key === cacheKey && now - _cache.at < TTL_MS) {
    return _cache.data;
  }

  try {
    // Same "latest + previous, within a 120-day window" contract as before,
    // now read from persisted history instead of a live FRED call.
    const since = new Date(now - 120 * 86400_000).toISOString().slice(0, 10);
    const [tenSeries, mortSeries] = await Promise.all([
      getRange(TEN_YEAR, { start: since }),
      getRange(MORTG_30US, { start: since }),
    ]);

    const tenLast = tenSeries.at(-1) ?? null;
    const tenPrev = tenSeries.at(-2) ?? null;
    const mortLast = mortSeries.at(-1) ?? null;
    const mortPrev = mortSeries.at(-2) ?? null;

    if (!tenLast && !mortLast) {
      // Neither core series has synced data yet -- same "stub" contract callers
      // already handle (e.g. app/api/fred/route.ts checks source === "stub").
      const stub: FredSnapshot = {
        tenYearYield: null, mort30Avg: null, spread: null, asOf: null,
        stale: true, source: "stub",
      };
      _cache = { key: cacheKey, at: now, data: stub };
      return stub;
    }

    const tenYearYield = tenLast?.value ?? null;
    const mort30Avg = mortLast?.value ?? null;
    const spread = tenYearYield != null && mort30Avg != null
      ? +(mort30Avg - tenYearYield).toFixed(2) : null;
    const asOf = [tenLast?.observationDate, mortLast?.observationDate]
      .filter(Boolean).sort().slice(-1)[0] ?? null;
    const stale = asOf ? now - new Date(asOf).getTime() > maxAgeDays * 86400_000 : true;

    const out: FredSnapshot = {
      tenYearYield, mort30Avg, spread, asOf, stale, source: "fred",
      prevTenYearYield: tenPrev?.value ?? null,
      prevMort30Avg: mortPrev?.value ?? null,
    };

    _cache = { key: cacheKey, at: now, data: out };
    return out;
  } catch {
    _cache = { key: cacheKey, at: now, data: null };
    return null;
  }
}
