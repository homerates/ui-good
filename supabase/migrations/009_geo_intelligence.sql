-- ──────────────────────────────────────────────────────────────────────────────
-- 009_geo_intelligence.sql
-- Geographic intelligence layer: HUD + FEMA data keyed by geography
-- ──────────────────────────────────────────────────────────────────────────────

-- ZIP → county → CBSA crosswalk (sourced from HUD USPS crosswalk quarterly)
CREATE TABLE IF NOT EXISTS public.geo_crosswalk (
  zip           text        NOT NULL,
  county_fips   text        NOT NULL,  -- 5-digit FIPS e.g. '12086'
  state_fips    text        NOT NULL,  -- 2-digit FIPS e.g. '12'
  cbsa_code     text,                  -- Core-Based Statistical Area code
  cbsa_name     text,
  county_name   text,
  state_abbr    text,
  res_ratio     numeric,               -- residential address ratio (HUD weight)
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (zip, county_fips)
);

CREATE INDEX IF NOT EXISTS geo_crosswalk_zip_idx ON public.geo_crosswalk (zip);
CREATE INDEX IF NOT EXISTS geo_crosswalk_county_idx ON public.geo_crosswalk (county_fips);

-- HUD Income Limits + Fair Market Rents keyed by county FIPS
-- Source: HUD FY2025 Income Limits + FY2025 Fair Market Rents
CREATE TABLE IF NOT EXISTS public.hud_features (
  county_fips   text        NOT NULL,
  fiscal_year   int         NOT NULL DEFAULT 2025,
  county_name   text,
  state_abbr    text,
  cbsa_code     text,
  -- Area Median Income by household size
  ami_1person   int,
  ami_2person   int,
  ami_3person   int,
  ami_4person   int,
  ami_5person   int,
  -- Key AMI thresholds (4-person household)
  ami_80pct     int,         -- Low Income limit
  ami_50pct     int,         -- Very Low Income limit
  ami_120pct    int,         -- Moderate Income (many DPA programs)
  -- Fair Market Rents by bedroom count
  fmr_0br       int,
  fmr_1br       int,
  fmr_2br       int,
  fmr_3br       int,
  fmr_4br       int,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (county_fips, fiscal_year)
);

CREATE INDEX IF NOT EXISTS hud_features_county_idx ON public.hud_features (county_fips);

-- FEMA National Risk Index keyed by county FIPS
-- Source: FEMA NRI 2024 release
CREATE TABLE IF NOT EXISTS public.fema_risk (
  county_fips        text        NOT NULL PRIMARY KEY,
  county_name        text,
  state_abbr         text,
  -- Composite score 0–100
  composite_score    numeric,
  risk_label         text,       -- 'Very Low' | 'Low' | 'Relatively Low' | 'Relatively Moderate' | 'Relatively High' | 'High' | 'Very High'
  -- Individual hazard scores 0–100 (null if not applicable)
  hurricane_score    numeric,
  wildfire_score     numeric,
  flood_score        numeric,
  earthquake_score   numeric,
  tornado_score      numeric,
  hail_score         numeric,
  winter_score       numeric,    -- winter weather
  drought_score      numeric,
  heat_score         numeric,    -- extreme heat
  -- Dominant hazard (highest individual score)
  dominant_hazard    text,
  -- Insurance pressure signal derived from composite + hazard mix
  insurance_pressure text,       -- 'low' | 'moderate' | 'elevated' | 'high' | 'very_high'
  insurance_est_low  int,        -- estimated monthly premium delta vs national avg ($)
  insurance_est_high int,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fema_risk_state_idx ON public.fema_risk (state_abbr);
CREATE INDEX IF NOT EXISTS fema_risk_composite_idx ON public.fema_risk (composite_score);

-- Enable RLS (service role bypasses — ETL and API use service role)
ALTER TABLE public.geo_crosswalk  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hud_features   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fema_risk      ENABLE ROW LEVEL SECURITY;

-- Public read — these are public government datasets
CREATE POLICY "public_read_geo_crosswalk"
  ON public.geo_crosswalk FOR SELECT USING (true);

CREATE POLICY "public_read_hud_features"
  ON public.hud_features FOR SELECT USING (true);

CREATE POLICY "public_read_fema_risk"
  ON public.fema_risk FOR SELECT USING (true);
