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
  // NEW (optional; safe when null)
  prevTenYearYield?: number | null;
  prevMort30Avg?: number | null;
};

/** Safe numeric coercion from string | number | null | undefined */
function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Fetch latest and previous non-missing values for a series (within ~120d window) */
async function fetchLatestAndPrev(
  series_id: string,
  apiKey: string,
  signal: AbortSignal
): Promise<{
  curr: { value: number | null; date: string | null };
  prev: { value: number | null; date: string | null };
}> {
  const url = new URL(FRED_BASE);
  url.searchParams.set("series_id", series_id);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  // pull last ~120 days so we always have a recent point
  url.searchParams.set(
    "observation_start",
    new Date(Date.now() - 120 * 86400_000).toISOString().slice(0, 10)
  );

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`FRED ${series_id} HTTP ${res.status}`);

  const json = (await res.json()) as { observations?: Obs[] };
  const valid = (json.observations ?? []).filter(
    (o) => o.value && o.value !== "."
  );

  const last = valid.at(-1);
  const secondLast = valid.at(-2);

  return {
    curr: {
      value: last ? toNum(last.value) : null,
      date: last?.date ?? null,
    },
    prev: {
      value: secondLast ? toNum(secondLast.value) : null,
      date: secondLast?.date ?? null,
    },
  };
}

/* ------- 5-minute in-memory cache (per process) ------- */
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
  timeoutMs?: number;
}): Promise<FredSnapshot | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    // no key = stubbed snapshot
    return {
      tenYearYield: null,
      mort30Avg: null,
      spread: null,
      asOf: null,
      stale: true,
      source: "stub",
    };
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
      fetchLatestAndPrev(TEN_YEAR, apiKey, ctrl.signal),
      fetchLatestAndPrev(MORTG_30US, apiKey, ctrl.signal),
    ]);
    clearTimeout(t);

    const tenYearYield = ten.curr.value;
    const mort30Avg = mort.curr.value;

    const spread =
      tenYearYield != null && mort30Avg != null
        ? +(mort30Avg - tenYearYield).toFixed(2)
        : null;

    const asOf = [ten.curr.date, mort.curr.date].filter(Boolean).sort().slice(-1)[0] ?? null;

    const stale = asOf
      ? now - new Date(asOf).getTime() > maxAgeDays * 86400_000
      : true;

    const out: FredSnapshot = {
      tenYearYield,
      mort30Avg,
      spread,
      asOf,
      stale,
      source: "fred",
      // NEW: previous values (may be null if not present in window)
      prevTenYearYield: ten.prev.value ?? null,
      prevMort30Avg: mort.prev.value ?? null,
    };

    _cache = { key: cacheKey, at: now, data: out };
    return out;
  } catch {
    clearTimeout(t);
    _cache = { key: cacheKey, at: now, data: null };
    return null;
  }
}
