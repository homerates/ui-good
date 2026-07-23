// lib/market-data/query.ts
// AD-11 Market Data Service — the consumer-facing read API. Pure Supabase
// reads, never calls FRED. This is what request-time code will import once
// consumers migrate (Seam 2) — nothing calls this yet in Seam 1.
//
// getLatest/getSnapshot carry a short (60s) in-memory cache purely to reduce
// redundant DB round-trips within a burst of requests on a hot path (e.g.
// app/api/answers/route.ts in Seam 2). 60s, not the 5-10min TTLs the old
// per-route FRED caches used -- those existed to avoid slow/rate-limited
// external calls, which no longer applies once reads are DB-only. getRange
// is not cached: range queries are infrequent (charts, not every chat turn)
// and a Postgres range scan over a few thousand rows is cheap enough that
// caching isn't worth the staleness tradeoff.

import { getSupabase } from '../supabaseServer';
import type { Observation, Snapshot } from './types';

const CACHE_TTL_MS = 60_000;
const _latestCache = new Map<string, { at: number; obs: Observation | null }>();

function rowToObservation(row: { series_id: string; observation_date: string; value: number | null; fetched_at: string }): Observation {
    return {
        seriesId: row.series_id,
        observationDate: row.observation_date,
        value: row.value,
        fetchedAt: row.fetched_at,
    };
}

/** Clears the in-memory cache. Exposed for tests/manual invalidation, not used by normal request flow. */
export function clearMarketDataCache(): void {
    _latestCache.clear();
}

/**
 * getLatest(seriesId), unwrapped to a plain number with a fallback -- the
 * common "give me today's par rate or a hardcoded default" shape multiple
 * Seam 2 consumers need (rate-intelligence-engine, rate-marketplace both had
 * their own copy of this exact pattern before migrating). The fallback only
 * fires if the series has genuinely never synced (cold start); once
 * Supabase has data for it, this always returns the real value.
 */
export async function getLatestValue(seriesId: string, fallback: number): Promise<number> {
    const obs = await getLatest(seriesId);
    return obs?.value ?? fallback;
}

/** Most recent observation for one series, or null if none exists / DB unavailable. */
export async function getLatest(seriesId: string): Promise<Observation | null> {
    const cached = _latestCache.get(seriesId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.obs;

    const sb = getSupabase();
    if (!sb) return null;

    const { data, error } = await sb
        .from('market_data_observations')
        .select('series_id, observation_date, value, fetched_at')
        .eq('series_id', seriesId)
        .order('observation_date', { ascending: false })
        .limit(1)
        .maybeSingle();

    const obs = !error && data ? rowToObservation(data) : null;
    _latestCache.set(seriesId, { at: Date.now(), obs });
    return obs;
}

/** Most recent observation for each of several series in one call. Shares getLatest's cache per-series. */
export async function getSnapshot(seriesIds: string[]): Promise<Snapshot> {
    const entries = await Promise.all(
        seriesIds.map(async (id): Promise<[string, Observation | null]> => [id, await getLatest(id)]),
    );
    return Object.fromEntries(entries);
}

/**
 * Full observation history for one series within an optional date range.
 * Ascending order (oldest first) -- matches what a chart/time-series
 * consumer needs directly, no reshaping required downstream.
 */
export async function getRange(
    seriesId: string,
    opts: { start?: string; end?: string } = {},
): Promise<Observation[]> {
    const sb = getSupabase();
    if (!sb) return [];

    let q = sb
        .from('market_data_observations')
        .select('series_id, observation_date, value, fetched_at')
        .eq('series_id', seriesId)
        .order('observation_date', { ascending: true });

    if (opts.start) q = q.gte('observation_date', opts.start);
    if (opts.end) q = q.lte('observation_date', opts.end);

    const { data, error } = await q;
    if (error || !data) return [];
    return data.map(rowToObservation);
}
