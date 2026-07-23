// lib/market-data/sync.ts
// AD-11 Market Data Service — ingestion job. Invoked by the cron route
// (app/api/cron/market-data-sync/route.ts), not called from any request-time
// consumer path.
//
// Backfill vs incremental: a series with no rows yet in market_data_observations
// gets a full historical pull (BACKFILL_YEARS); a series that's already synced
// gets a short incremental pull (last INCREMENTAL_DAYS) that both catches new
// observations and re-captures any FRED revision to a recent value. Fetching
// only "the latest observation" every run (the naive reading of "fetch latest
// observation(s)") would leave the observations table empty of history for
// years -- defeating the point of persisting data for Market Rates' 5yr/52wk
// range queries (Seam 2). This backfill/incremental split is a build-time
// design call, flagged here rather than made silently.
//
// "." (FRED's missing-value marker) observations are NOT written as NULL
// rows -- they're skipped entirely. Storing a row for every non-trading day
// (weekends, holidays) across 21 series x 5 years would bloat the table for
// no query benefit; the schema still allows NULL (a future write path could
// choose differently) but this sync intentionally doesn't produce any.

import { getSupabase } from '../supabaseServer';
import { REGISTRY } from './registry';
import { fetchFredObservations } from './client';
import type { SeriesDefinition, SyncSeriesResult, SyncRunResult } from './types';

const BACKFILL_YEARS = 5;
const INCREMENTAL_DAYS = 30;

function isoDaysAgo(days: number): string {
    return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

async function upsertSeriesDefinition(sb: ReturnType<typeof getSupabase>, def: SeriesDefinition): Promise<void> {
    if (!sb) return;
    await sb.from('market_data_series').upsert({
        series_id: def.seriesId,
        label: def.label,
        category: def.category,
        source: def.source,
        fred_release_id: def.fredReleaseId ?? null,
        unit: def.unit,
        frequency: def.frequency,
        seasonally_adjusted: def.seasonallyAdjusted,
        fetch_units: def.fetchUnits ?? 'lin',
        loan_type: def.loanType ?? null,
        ltv_max: def.ltvMax ?? null,
        fico_min: def.ficoMin ?? null,
        fico_max: def.ficoMax ?? null,
        term_years: def.termYears ?? null,
        requires_citation: def.requiresCitation ?? false,
        citation_text: def.citationText ?? null,
        is_active: true,
        notes: def.notes ?? null,
    }, { onConflict: 'series_id' });
}

async function hasAnyObservations(sb: NonNullable<ReturnType<typeof getSupabase>>, seriesId: string): Promise<boolean> {
    const { count } = await sb
        .from('market_data_observations')
        .select('series_id', { count: 'exact', head: true })
        .eq('series_id', seriesId)
        .limit(1);
    return (count ?? 0) > 0;
}

async function syncOneSeries(sb: NonNullable<ReturnType<typeof getSupabase>>, def: SeriesDefinition): Promise<SyncSeriesResult> {
    try {
        await upsertSeriesDefinition(sb, def);

        const isFirstSync = !(await hasAnyObservations(sb, def.seriesId));
        const mode: 'backfill' | 'incremental' = isFirstSync ? 'backfill' : 'incremental';
        const observationStart = isFirstSync ? isoDaysAgo(BACKFILL_YEARS * 365) : isoDaysAgo(INCREMENTAL_DAYS);

        const obs = await fetchFredObservations(def.seriesId, {
            units: def.fetchUnits,
            observationStart,
            sortOrder: 'asc',
        });

        const rows = obs
            .filter(o => o.value !== '.' && o.value !== '' && !Number.isNaN(Number(o.value)))
            .map(o => ({
                series_id: def.seriesId,
                observation_date: o.date,
                value: Number(o.value),
            }));

        if (rows.length === 0) {
            return { seriesId: def.seriesId, ok: true, mode, rowsWritten: 0 };
        }

        const { error } = await sb
            .from('market_data_observations')
            .upsert(rows, { onConflict: 'series_id,observation_date' });

        if (error) {
            return { seriesId: def.seriesId, ok: false, mode, rowsWritten: 0, error: error.message };
        }

        const now = new Date().toISOString();
        await sb.from('market_data_series')
            .update({
                last_synced_at: now,
                ...(isFirstSync ? { first_synced_at: now } : {}),
            })
            .eq('series_id', def.seriesId);

        return { seriesId: def.seriesId, ok: true, mode, rowsWritten: rows.length };
    } catch (err) {
        return {
            seriesId: def.seriesId,
            ok: false,
            mode: 'incremental',
            rowsWritten: 0,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

/**
 * Syncs every active registry series. Runs series in parallel batches (not
 * all 21 at once, and not strictly sequential) — defensive pacing, matching
 * the batching pattern already used elsewhere in this codebase for external
 * API calls, even though FRED's own rate limit comfortably covers 21 series
 * fetched at once.
 */
export async function runSync(): Promise<SyncRunResult> {
    const startedAt = new Date().toISOString();
    const sb = getSupabase();

    if (!sb) {
        return {
            startedAt,
            finishedAt: new Date().toISOString(),
            results: REGISTRY.map(def => ({
                seriesId: def.seriesId, ok: false, mode: 'incremental' as const, rowsWritten: 0,
                error: 'Supabase not configured',
            })),
        };
    }

    const BATCH_SIZE = 8;
    const results: SyncSeriesResult[] = [];
    for (let i = 0; i < REGISTRY.length; i += BATCH_SIZE) {
        const batch = REGISTRY.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(def => syncOneSeries(sb, def)));
        results.push(...batchResults);
    }

    return { startedAt, finishedAt: new Date().toISOString(), results };
}
