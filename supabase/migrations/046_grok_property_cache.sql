-- 046_grok_property_cache.sql
-- Stores Grok property intelligence results keyed by normalized address.
-- Populated by background prefetch on check-property and my-home address entry.
-- Consumed by the Property Intelligence Card for instant (zero-wait) rendering.

CREATE TABLE IF NOT EXISTS grok_property_cache (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  address_normalized TEXT        NOT NULL UNIQUE,
  address_raw        TEXT        NOT NULL,
  grok_result        JSONB       NOT NULL,
  model              TEXT        NOT NULL DEFAULT 'grok-4',
  fetched_at         TIMESTAMPTZ NOT NULL,
  expires_at         TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS grok_property_cache_address_idx  ON grok_property_cache (address_normalized);
CREATE INDEX IF NOT EXISTS grok_property_cache_expires_idx  ON grok_property_cache (expires_at);

-- Service role can read/write; no RLS needed (no user PII stored)
ALTER TABLE grok_property_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON grok_property_cache
  USING (true) WITH CHECK (true);
