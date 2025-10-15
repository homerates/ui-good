// src/lib/fred.ts
const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const TEN_YEAR = "DGS10";
const MORTG_30US = "MORTGAGE30US";

type Obs = { date: string; value: string };
export type FredSnapshot = {
  tenYearYield: number | null;
  mort30Avg: number | null;
  spread: number | null;
  asOf: string | null;
  stale: boolean;
  source: "fred" | "stub";
};

function toNum(v?: string | null) {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchSeries(series_id: string, apiKey: string, signal: AbortSignal) {
  const url = new URL(FRED_BASE);
  url.searchParams.set("series_id", series_id);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("observation_start", new Date(Date.now() - 120 * 86400_000).toISOString().slice(0,10));
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`FRED ${series_id} HTTP ${res.status}`);
  const json = await res.json() as { observations?: Obs[] };
  const latest = [...(json.observations ?? [])].reverse().find(o => o.value && o.value !== ".");
  if (!latest) return { value: null, date: null };
  return { value: toNum(latest.value), date: latest.date };
}

/* ------- 5-minute in-memory cache (per process) ------- */
let _cache: { key: string; at: number; data: FredSnapshot | null } | null = null;
const TTL_MS = 5 * 60 * 1000;

export function getFredCacheInfo() {
  if (!_cache) return { cached: false, ageMs: null as number|null, asOf: null as string|null, source: null as string|null };
  return {
    cached: !!_cache.data,
    ageMs: Date.now() - _cache.at,
    asOf: _cache.data?.asOf ?? null,
    source: _cache.data?.source ?? null
  };
}

export async function warmFredCache(msTimeout = 1500) {
  // best-effort, short timeout, ignore errors
  try { await getFredSnapshot({ timeoutMs: msTimeout }); } catch {}
}

export async function getFredSnapshot(opts?: { maxAgeDays?: number; timeoutMs?: number }): Promise<FredSnapshot | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return { tenYearYield: null, mort30Avg: null, spread: null, asOf: null, stale: true, source: "stub" };
  }

  const timeoutMs = opts?.timeoutMs ?? 6000;
  const maxAgeDays = opts?.maxAgeDays ?? 7;
  const now = Date.now();
  const cacheKey = `${apiKey}:${maxAgeDays}`;

  if (_cache && _cache.key === cacheKey && now - _cache.at < TTL_MS) {
    return _cache.data;
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const [ten, mort] = await Promise.all([
      fetchSeries(TEN_YEAR, apiKey, ctrl.signal),
      fetchSeries(MORTG_30US, apiKey, ctrl.signal),
    ]);
    clearTimeout(t);

    const tenYearYield = toNum(ten.value);
    const mort30Avg = toNum(mort.value);
    const spread = tenYearYield != null && mort30Avg != null ? +(mort30Avg - tenYearYield).toFixed(2) : null;

    const asOf = [ten.date, mort.date].filter(Boolean).sort().slice(-1)[0] ?? null;
    const stale = asOf ? (now - new Date(asOf).getTime()) > maxAgeDays * 86400_000 : true;

    const out: FredSnapshot = { tenYearYield, mort30Avg, spread, asOf, stale, source: "fred" };
    _cache = { key: cacheKey, at: now, data: out };
    return out;
  } catch {
    clearTimeout(t);
    _cache = { key: cacheKey, at: now, data: null };
    return null;
  }
}
