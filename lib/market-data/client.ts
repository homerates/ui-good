// lib/market-data/client.ts
// AD-11 Market Data Service — the ONE raw FRED HTTP client. Only sync.ts
// should import this; request-time consumers read from Supabase via
// query.ts, never call FRED directly (that's the point of this seam).

const FRED_OBSERVATIONS_URL = 'https://api.stlouisfed.org/fred/series/observations';

export interface FredObservation {
    date: string;
    value: string; // FRED returns values as strings, including "." for missing
}

export interface FetchObservationsOptions {
    /** FRED 'units' param. Omit for raw level ('lin'). */
    units?: 'lin' | 'pc1';
    /** ISO date (YYYY-MM-DD) — only return observations on/after this date. */
    observationStart?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    timeoutMs?: number;
}

class FredApiKeyMissingError extends Error {
    constructor() {
        super('FRED_API_KEY not set');
        this.name = 'FredApiKeyMissingError';
    }
}

function buildUrl(seriesId: string, apiKey: string, opts: FetchObservationsOptions): string {
    const url = new URL(FRED_OBSERVATIONS_URL);
    url.searchParams.set('series_id', seriesId);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('file_type', 'json');
    url.searchParams.set('sort_order', opts.sortOrder ?? 'asc');
    if (opts.units) url.searchParams.set('units', opts.units);
    if (opts.observationStart) url.searchParams.set('observation_start', opts.observationStart);
    if (opts.limit) url.searchParams.set('limit', String(opts.limit));
    return url.toString();
}

async function fetchOnce(url: string, timeoutMs: number): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    } finally {
        clearTimeout(t);
    }
}

/**
 * Fetch observations for one FRED series. Retries once on a transient
 * failure (network error, timeout, or 5xx) with a short fixed backoff —
 * FRED's own rate limit is generous enough that a single retry is plenty for
 * the volume this module deals with (dozens of series, not thousands).
 * Throws on: missing API key, or two consecutive failures (including a
 * non-2xx response after the retry). Callers (sync.ts) decide how to
 * degrade a single series' failure without aborting the whole sync run.
 */
export async function fetchFredObservations(
    seriesId: string,
    opts: FetchObservationsOptions = {},
): Promise<FredObservation[]> {
    const apiKey = process.env.FRED_API_KEY;
    if (!apiKey) throw new FredApiKeyMissingError();

    const timeoutMs = opts.timeoutMs ?? 10_000;
    const url = buildUrl(seriesId, apiKey, opts);

    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetchOnce(url, timeoutMs);
            if (!res.ok) {
                const body = await res.text().catch(() => '(unreadable)');
                throw new Error(`FRED ${seriesId} HTTP ${res.status}: ${body.slice(0, 300)}`);
            }
            const json = await res.json() as { observations?: FredObservation[]; error_message?: string };
            if (json.error_message) throw new Error(`FRED ${seriesId} API error: ${json.error_message}`);
            return json.observations ?? [];
        } catch (err) {
            lastErr = err;
            if (attempt === 0) await new Promise(r => setTimeout(r, 500));
        }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export { FredApiKeyMissingError };
