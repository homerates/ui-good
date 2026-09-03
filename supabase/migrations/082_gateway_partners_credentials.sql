-- 082_gateway_partners_credentials.sql
-- HomeRates Intelligence Gateway V1, Phase C: partner identity + API credentials.
-- Additive only -- no existing table modified. Admin-managed only; no consumer
-- or LO-facing surface reads or writes these tables. See
-- docs/HOMERATES_INTELLIGENCE_GATEWAY_V1_ARCHITECTURE.md sections 7/8/18.
--
-- NOT APPLIED BY THIS SESSION. Drafted and statically validated only, per
-- explicit instruction -- the owner applies this migration manually after
-- review.
--
-- RLS note (audited, not copied blindly): this repo's existing "service_role_all"
-- policy pattern (e.g. 079_aerial_view_cache.sql) has no `TO service_role`
-- clause. In Postgres, a CREATE POLICY with no TO clause applies to PUBLIC --
-- meaning that pattern is not actually restricted to the service role; it's
-- permissive to anon/authenticated too, which is an acceptable simplification
-- only because those tables store no sensitive data (that migration's own
-- comment says exactly this). gateway_credentials stores hashed secret
-- material and gateway_partners stores business contact data, so both
-- policies here explicitly add `TO service_role` -- the actually-restricted
-- version of what the "service_role_all" name already implied. This also
-- means a misconfigured environment where SUPABASE_SERVICE_ROLE_KEY is unset
-- (lib/supabaseServer.ts falls back to SUPABASE_ANON_KEY in that case) fails
-- closed here -- an anon-role connection gets zero matching policy and zero
-- access, rather than silently working with the wrong privilege level.

CREATE TABLE IF NOT EXISTS gateway_partners (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  contact_email    text NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','active','suspended','cancelled')),
  rate_limit_tier  text NOT NULL DEFAULT 'pilot',
  quota_tier       text NOT NULL DEFAULT 'pilot',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gateway_credentials (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id     uuid NOT NULL REFERENCES gateway_partners(id),
  key_prefix     text NOT NULL UNIQUE,
  key_hash       text NOT NULL,
  scopes         text[] NOT NULL DEFAULT ARRAY['property_intelligence:read'],
  status         text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','revoked','disabled')),
  expires_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_used_at   timestamptz,
  revoked_at     timestamptz
);

CREATE INDEX IF NOT EXISTS gateway_credentials_partner_idx ON gateway_credentials (partner_id);

ALTER TABLE gateway_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON gateway_partners
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON gateway_credentials
  FOR ALL TO service_role USING (true) WITH CHECK (true);
