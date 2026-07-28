-- Migration 031: canonical properties table
-- One shared record per property address across all users.
-- This is the anchor for all property intelligence, enrichment, and caching.
-- Users are linked to this via consumer_homeowner_properties.property_id (migration 033).

CREATE TABLE IF NOT EXISTS public.properties (
  id                     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Normalized address (full is the unique key)
  address_full           text         NOT NULL,   -- "8 Peachtree, Coto De Caza, CA 92679"
  address_line           text,                    -- "8 Peachtree"
  city                   text,
  state                  char(2),
  zip                    text,
  county                 text,

  -- Physical attributes from enrichment
  beds                   smallint,
  baths                  numeric(4,1),
  sqft                   integer,
  year_built             smallint,
  property_type          text,                    -- 'single_family','condo','multi_family','townhouse'

  -- Location
  lat                    numeric(9,6),
  lng                    numeric(9,6),
  apn                    text,

  -- Latest known valuations (denormalized for fast reads — kept in sync by snapshot upsert)
  latest_value           numeric,
  latest_value_low       numeric,
  latest_value_high      numeric,
  latest_rent            numeric,
  latest_last_sale_price numeric,
  latest_last_sale_date  date,
  latest_listing_status  text,

  -- Freshness and confidence
  enriched_at            timestamptz,             -- when last successfully enriched
  enrichment_source      text,                    -- 'redfin_via_tavily','tavily','manual'
  confidence             numeric(3,2),            -- 0.00–1.00

  created_at             timestamptz  NOT NULL DEFAULT now(),
  updated_at             timestamptz  NOT NULL DEFAULT now(),

  UNIQUE (address_full)
);

CREATE INDEX IF NOT EXISTS properties_zip_idx   ON public.properties (zip);
CREATE INDEX IF NOT EXISTS properties_state_idx ON public.properties (state);
