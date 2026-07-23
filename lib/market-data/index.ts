// lib/market-data/index.ts
// AD-11 Market Data Service — public exports.
//
// Read-side (what request-time consumers will use once migrated, Seam 2):
export { getLatest, getSnapshot, getRange, getLatestValue, clearMarketDataCache } from './query';

// Write-side (cron only — see app/api/cron/market-data-sync/route.ts):
export { runSync } from './sync';

// Registry (read-only reference — e.g. to enumerate categories/labels):
export { REGISTRY, getSeriesDefinition } from './registry';

export type {
    SeriesDefinition,
    SeriesCategory,
    SeriesFrequency,
    FredUnitsParam,
    Observation,
    Snapshot,
    SyncSeriesResult,
    SyncRunResult,
} from './types';
