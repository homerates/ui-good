-- Migration 032: property snapshots — cached intelligence by type
-- Each row is a point-in-time enrichment result for a property.
-- Avoids re-querying Rentcast for the same property within the TTL window.
--
-- snapshot_type values:
--   'full'       — complete Rentcast property + AVM + listing response
--   'valuation'  — AVM value/range only
--   'rent'       — rent estimate only
--   'market'     — market context (zip/county level)
--
-- TTL strategy:
--   Rentcast 'full' snapshots: expires_at = fetched_at + 7 days
--   Manual overrides:          expires_at = NULL (never expires)

CREATE TABLE IF NOT EXISTS public.property_snapshots (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid         NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  snapshot_type text         NOT NULL,
  source        text         NOT NULL,   -- 'rentcast','tavily','internal','manual'
  data          jsonb        NOT NULL,   -- full raw payload from the source
  fetched_at    timestamptz  NOT NULL DEFAULT now(),
  expires_at    timestamptz,             -- NULL = never expires
  confidence    numeric(3,2),
  created_at    timestamptz  NOT NULL DEFAULT now()
);

-- Fast lookup: latest valid snapshot of a given type for a property
CREATE INDEX IF NOT EXISTS property_snapshots_lookup_idx
  ON public.property_snapshots (property_id, snapshot_type, fetched_at DESC);
