-- 072_market_data_service.sql
-- AD-11 Seam 1: Market Data Service — consolidated FRED data layer.
-- Replaces (in later seams) 6 independent per-route FRED fetchers with one
-- synced, persisted series catalog + observation history. Schema supports
-- both the ~21 standalone series already in use across the app (this seam)
-- and FRED release_id=473 (Optimal Blue Mortgage Market Indices, OBMMI —
-- Seam 3) in one coherent shape, so no schema change is needed when OBMMI
-- is onboarded later.

-- ── 1. Series registry — catalog of every tracked FRED series ───────────────
create table if not exists market_data_series (
  series_id            text primary key,               -- FRED series ID, e.g. 'MORTGAGE30US', 'OBMMIC30YF'
  label                text not null,                   -- human-readable display name
  category             text not null,                   -- 'rate' | 'treasury' | 'macro' | 'housing' | 'obmmi'
  source               text not null default 'fred',    -- 'fred' (standalone) | 'fred_release' (part of a release)
  fred_release_id      integer,                         -- e.g. 473 for OBMMI; null for standalone series
  unit                 text,                            -- 'percent' | 'index' | 'thousands' | 'dollars' | ...
  frequency            text,                            -- 'daily' | 'weekly' | 'monthly' | 'quarterly'
  seasonally_adjusted  boolean not null default false,
  fetch_units          text not null default 'lin',     -- FRED 'units' param: 'lin' (raw level) | 'pc1' (YoY % change)

  -- Loan-segmentation metadata — populated by best-effort parsing of the
  -- series_id naming convention at sync time (OBMMI series only, Seam 3).
  -- NULL for every series in this seam (all standalone, non-segmented).
  loan_type            text,                            -- 'conforming' | 'jumbo' | 'fha' | 'va' | 'usda'
  ltv_max              numeric,
  fico_min             integer,
  fico_max             integer,
  term_years           integer,

  -- Third-party citation requirement (OBMMI is Optimal Blue-copyrighted).
  -- false/null for every series in this seam.
  requires_citation    boolean not null default false,
  citation_text        text,

  is_active            boolean not null default true,
  notes                text,
  first_synced_at      timestamptz,
  last_synced_at       timestamptz,
  created_at           timestamptz not null default now()
);

create index if not exists idx_market_data_series_category
  on market_data_series (category) where is_active = true;
create index if not exists idx_market_data_series_release
  on market_data_series (fred_release_id) where fred_release_id is not null;

-- ── 2. Observations — one row per series per observation date ───────────────
create table if not exists market_data_observations (
  series_id         text not null references market_data_series(series_id),
  observation_date  date not null,
  value             numeric,                            -- NULL preserves FRED's "." (missing), when stored
  fetched_at        timestamptz not null default now(),
  primary key (series_id, observation_date)
);

-- Powers "latest value" and "last N years" range queries without touching FRED.
create index if not exists idx_market_data_obs_series_date
  on market_data_observations (series_id, observation_date desc);

-- ── RLS — service-role only, matching this repo's existing convention
-- (admin_users, consumer_activity, etc.). All reads go through
-- lib/market-data/query.ts server-side; no direct client Supabase access.
alter table market_data_series enable row level security;
alter table market_data_observations enable row level security;

create policy "no_direct_access_market_data_series" on market_data_series
  as restrictive using (false);
create policy "no_direct_access_market_data_observations" on market_data_observations
  as restrictive using (false);
