-- 050_featured_properties.sql
-- Shared property intelligence cache + discovery feed.
-- One row per property (unique on address_norm).
-- Populated two ways:
--   1. User-generated: after any DSC completes, scores + raw Grok fields saved here.
--   2. Bulk import: title rep data seeded via service_role INSERT (beds/baths/price pre-filled,
--      scores computed on first user lookup then cached here forever).
--
-- Cache-hit path: before running Grok deep analysis, client checks this table.
-- If raw_data is present, scores are reconstructed locally — zero API cost.

CREATE TABLE IF NOT EXISTS featured_properties (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  address           TEXT        NOT NULL,
  address_norm      TEXT        NOT NULL,              -- lower(trim(address)) — unique lookup key
  city              TEXT,
  state_code        TEXT,
  zip               TEXT,

  -- Property details (populated from Redfin or title import)
  photo_url         TEXT,
  price             NUMERIC,
  beds              SMALLINT,
  baths             NUMERIC,
  sqft              INTEGER,
  year_built        SMALLINT,
  property_type     TEXT,

  -- Track 5 Decision Score cache (L2-L4 only — L1 is always user-specific)
  l2_score          SMALLINT,
  l2_summary        TEXT,
  l3_score          SMALLINT,
  l3_summary        TEXT,
  l4_score          SMALLINT,
  l4_summary        TEXT,
  composite_score   SMALLINT,   -- L2/L3/L4 composite (excludes L1 — shown on discovery feed)

  -- Raw Grok fields for cache-hit replay (mirrors deepResult shape in page.tsx)
  -- Subset needed: zillow_estimate, redfin_estimate, market_median_price,
  -- comparable_sales, market_median_dom, market_sale_to_list,
  -- location_intelligence, school_score, walk_score
  raw_data          JSONB,

  -- Discovery signals
  search_count      INTEGER     NOT NULL DEFAULT 0,    -- incremented on every cache-hit lookup
  is_featured       BOOLEAN     NOT NULL DEFAULT false, -- curated/pinned on discovery pages
  source            TEXT        NOT NULL DEFAULT 'user_generated',
                                                       -- 'user_generated' | 'manual' | 'title_import'

  -- Timestamps
  score_computed_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique lookup by normalized address
CREATE UNIQUE INDEX IF NOT EXISTS featured_properties_addr_norm
  ON featured_properties (address_norm);

-- Discovery feed indexes
CREATE INDEX IF NOT EXISTS featured_properties_city_zip
  ON featured_properties (city, zip);
CREATE INDEX IF NOT EXISTS featured_properties_search_count
  ON featured_properties (search_count DESC);
CREATE INDEX IF NOT EXISTS featured_properties_featured
  ON featured_properties (is_featured)
  WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS featured_properties_composite
  ON featured_properties (composite_score DESC NULLS LAST)
  WHERE composite_score IS NOT NULL;

-- RLS: public read (no PII — used for discovery feed + cache checks)
--      service_role write (user writes go through API which uses service role)
ALTER TABLE featured_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "featured_properties_public_read" ON featured_properties
  FOR SELECT USING (true);

CREATE POLICY "featured_properties_service_write" ON featured_properties
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Atomic search_count increment (avoids read-modify-write race condition)
CREATE OR REPLACE FUNCTION increment_search_count(row_id UUID)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE featured_properties
  SET    search_count = search_count + 1,
         updated_at   = NOW()
  WHERE  id = row_id;
$$;
