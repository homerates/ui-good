// lib/market-data/types.ts
// AD-11 Market Data Service — shared types.
// Mirrors supabase/migrations/072_market_data_service.sql — keep in sync if
// the schema changes.

export type SeriesCategory = 'rate' | 'treasury' | 'macro' | 'housing' | 'obmmi';
export type SeriesFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly';

/** FRED 'units' query param. 'lin' = raw level (default). 'pc1' = year-over-year % change. */
export type FredUnitsParam = 'lin' | 'pc1';

/**
 * Static definition of a tracked series — the shape registry.ts entries take.
 * Segmentation/citation fields exist here (not just in the DB) so a future
 * OBMMI registry entry (Seam 3) can carry the same fields as a standalone one.
 */
export interface SeriesDefinition {
    seriesId: string;
    label: string;
    category: SeriesCategory;
    unit: string;                 // display unit: 'percent' | 'index' | 'thousands' | 'dollars' | 'millions' | 'months'
    frequency: SeriesFrequency;
    seasonallyAdjusted: boolean;
    /** Defaults to 'lin' if omitted — only PCEPILFE/CUSR0000SAH1 in this seam use 'pc1'. */
    fetchUnits?: FredUnitsParam;
    source: 'fred' | 'fred_release';
    fredReleaseId?: number;
    // Loan-segmentation metadata — unused in Seam 1 (all standalone series), present for Seam 3 parity.
    loanType?: 'conforming' | 'jumbo' | 'fha' | 'va' | 'usda';
    ltvMax?: number;
    ficoMin?: number;
    ficoMax?: number;
    termYears?: number;
    requiresCitation?: boolean;
    citationText?: string;
    notes?: string;
}

/** One row from market_data_observations. */
export interface Observation {
    seriesId: string;
    observationDate: string;   // YYYY-MM-DD
    value: number | null;
    fetchedAt: string;
}

/** Result of getSnapshot() — keyed by series ID, null if that series has no data yet. */
export type Snapshot = Record<string, Observation | null>;

export interface SyncSeriesResult {
    seriesId: string;
    ok: boolean;
    mode: 'backfill' | 'incremental';
    rowsWritten: number;
    error?: string;
}

export interface SyncRunResult {
    startedAt: string;
    finishedAt: string;
    results: SyncSeriesResult[];
}
