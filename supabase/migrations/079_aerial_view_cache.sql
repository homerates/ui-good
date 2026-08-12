-- 079_aerial_view_cache.sql
-- Tracks whether an address has a rendered Google Aerial View flyover video available.
-- Stores STATE ONLY -- never the signed video URIs, which are short-lived and
-- re-fetching them (lookupVideo) is itself a new billable event per viewer/session.
-- Populated by app/api/property/aerial-view/route.ts.

CREATE TABLE IF NOT EXISTS aerial_view_cache (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  address_normalized TEXT        NOT NULL UNIQUE,
  address_raw        TEXT        NOT NULL,
  state              TEXT        NOT NULL,        -- 'ACTIVE' | 'PROCESSING' | 'ERROR' | 'UNAVAILABLE'
  checked_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aerial_view_cache_address_idx ON aerial_view_cache (address_normalized);

-- Service role can read/write; no RLS needed (no user PII stored)
ALTER TABLE aerial_view_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON aerial_view_cache
  USING (true) WITH CHECK (true);
