// src/lib/fred.ts
export type FredSnapshot = {
  asOf: string;
  tenYearYield: number | null;
  mort30Avg: number | null;
  spread: number | null;
  source: "fred" | "internal" | "mock";
  stale?: boolean;
};

function baseUrl() {
  // Prefer explicit public URL in prod; fall back to Vercel URL; else localhost
  const pub = process.env.NEXT_PUBLIC_SITE_URL;
  const vercel = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  return pub || vercel || "http://localhost:3000";
}

/**
 * Try internal API first (/api/fred). If missing, hit FRED directly (needs FRED_API_KEY).
 * If both fail, return a safe mock so the app still renders.
 */
export async function getFredSnapshot(): Promise<FredSnapshot> {
  // 1) Internal API (your known-good endpoint)
  try {
    const res = await fetch(`${baseUrl()}/api/fred`, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json().catch(() => ({} as any));
      // Expect either { fred: {...} } or the fields at root
      const src = (json.fred ?? json) as Partial<FredSnapshot>;
      const asOf = String(src.asOf ?? "");
      const ten = src.tenYearYield ?? null;
      const m30 = src.mort30Avg ?? null;
      const spr =
        src.spread ?? (ten != null && m30 != null ? Number(m30) - Number(ten) : null);

      return {
        asOf,
        tenYearYield: ten as number | null,
        mort30Avg: m30 as number | null,
        spread: spr as number | null,
        source: "internal",
        stale: Boolean((json as any)?.cache?.stale ?? src.stale),
      };
    }
  } catch {
    // fall through
  }

  // 2) Direct FRED (last resort)
  try {
    const key = process.env.FRED_API_KEY;
    if (key) {
      const last = async (seriesId: string) => {
        const url =
          `https://api.stlouisfed.org/fred/series/observations` +
          `?series_id=${seriesId}&api_key=${key}&file_type=json&sort_order=desc&limit=10`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return { value: null as number | null, date: "" };
        const j = await r.json();
        const obs = (j?.observations ?? []).find((o: any) => o?.value && o.value !== ".");
        return {
          value: obs ? Number(obs.value) : null,
          date: obs?.date ?? "",
        };
      };
      const [ten, m30] = await Promise.all([last("DGS10"), last("MORTGAGE30US")]);
      const spr =
        ten.value != null && m30.value != null ? m30.value - ten.value : null;
      return {
        asOf: m30.date || ten.date || new Date().toISOString().slice(0, 10),
        tenYearYield: ten.value,
        mort30Avg: m30.value,
        spread: spr,
        source: "fred",
        stale: false,
      };
    }
  } catch {
    // fall through
  }

  // 3) Safe mock (never block render)
  const asOf = new Date().toISOString().slice(0, 10);
  return {
    asOf,
    tenYearYield: null,
    mort30Avg: null,
    spread: null,
    source: "mock",
    stale: true,
  };
}
