-- FFIEC Census Tract Reference Data (Seam 1)
-- Applied: staging first, then production (Rayaan runs manually).
--
-- MSA/MD mapping note: geo_crosswalk.cbsa_code and hud_features.cbsa_code columns exist
-- (migration 009) but contain null in all rows — the current ETL never populates them.
-- No separate county→MSA/MD crosswalk table is needed here: ffiec_census_tracts.msa_md
-- provides the county→MSA/MD join key for this feature (via county_fips on the same row).

CREATE TABLE IF NOT EXISTS ffiec_census_tracts (
  census_tract_geoid    text PRIMARY KEY,
  state_fips            text NOT NULL,
  county_fips           text NOT NULL,
  msa_md                text,
  tract_income_level    text NOT NULL,
  tract_mfi_pct         numeric,
  distressed_underserved boolean NOT NULL DEFAULT false,
  data_year             integer NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ffiec_tracts_county_idx ON ffiec_census_tracts(county_fips);

ALTER TABLE ffiec_census_tracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public ffiec tract data readable"
  ON ffiec_census_tracts FOR SELECT TO public USING (true);

-- ── MFI estimates per MSA/MD ──────────────────────────────────────────────────
-- One row per area per year. msa_md is null for statewide non-metro areas.
CREATE TABLE IF NOT EXISTS ffiec_mfi (
  msa_md        text,
  state_fips    text NOT NULL,
  area_name     text NOT NULL,
  mfi_estimate  numeric NOT NULL,
  data_year     integer NOT NULL,
  PRIMARY KEY (msa_md, state_fips, data_year)
);

ALTER TABLE ffiec_mfi ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public ffiec mfi data readable"
  ON ffiec_mfi FOR SELECT TO public USING (true);

-- ── Geocode cache (address → census tract) ───────────────────────────────────
-- No public read policy — addresses are user-submitted and should not be exposed.
CREATE TABLE IF NOT EXISTS address_geocode_cache (
  normalized_address  text PRIMARY KEY,
  census_tract_geoid  text NOT NULL,
  latitude            numeric,
  longitude           numeric,
  geocoded_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE address_geocode_cache ENABLE ROW LEVEL SECURITY;
