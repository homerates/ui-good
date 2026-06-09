-- 049_portfolio_items.sql
-- Generic living portfolio — persists any built card/journey as a sidebar thumbnail.
-- One row per user per item. Items are upserted on card completion, never deleted by the app.

CREATE TABLE IF NOT EXISTS portfolio_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT        NOT NULL,           -- Clerk user_id
  type            TEXT        NOT NULL,           -- 'buyer_journey' | 'snapshot' | 'lo_scenario' | 'comparison'
  title           TEXT,                           -- display label e.g. "4521 Maple Ave"
  address         TEXT,                           -- normalised address (for dedup)
  photo_url       TEXT,                           -- ssl.cdn-redfin.com only
  data            JSONB       NOT NULL DEFAULT '{}',  -- full card payload / stage scores
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- One item per user + type + address (address may be null for non-property items — use id bucket)
CREATE UNIQUE INDEX IF NOT EXISTS portfolio_items_user_type_address
  ON portfolio_items (user_id, type, lower(address))
  WHERE address IS NOT NULL;

-- Fast fetch: all items for a user ordered by last accessed
CREATE INDEX IF NOT EXISTS portfolio_items_user_accessed
  ON portfolio_items (user_id, last_accessed_at DESC);

-- RLS: users can only see their own items
ALTER TABLE portfolio_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolio_items_own" ON portfolio_items
  FOR ALL USING (auth.uid()::text = user_id);

-- Service-role bypass (server-side upserts)
CREATE POLICY "portfolio_items_service" ON portfolio_items
  FOR ALL TO service_role USING (true);
