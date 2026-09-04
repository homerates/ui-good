-- 083_gateway_usage_counters_config.sql
-- HomeRates Intelligence Gateway V1, Phase D: rate-limit/quota counters and
-- circuit-breaker/kill-switch config. Additive only -- no existing table
-- (including Phase C's gateway_partners/gateway_credentials) modified.
--
-- NOT APPLIED BY THIS SESSION. Drafted and statically validated only -- the
-- owner applies this migration manually after review.
--
-- ATOMICITY (see gateway_increment_counter() below, not application code):
-- lib/anonGate.ts's existing pattern -- a SELECT of the current count,
-- followed by a separate application-side UPSERT of count+1 -- is NOT atomic.
-- Two concurrent requests can both read the same pre-increment count, both
-- compute the same "next" value, and both write it back: a genuine lost
-- update under real concurrency, not a hypothetical concern (confirmed by
-- inspecting the real file during this migration's design). Phase D cannot
-- inherit that pattern. gateway_increment_counter() below performs the
-- read-and-increment as a single atomic SQL statement
-- (INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING), which Postgres
-- serializes correctly at the row level under concurrent callers targeting
-- the same counter key -- this is the standard, textbook-correct atomic
-- upsert-increment pattern, not something novel to this migration.
--
-- RLS (audited, not copied blindly, matching the same discipline applied to
-- 082's tables): both tables are Gateway-internal operational/security
-- state -- gateway_usage_counters could be abused for a request-forgery/
-- enumeration signal if writable by anon/authenticated, and gateway_config
-- gates whether the entire Gateway is live, so both explicitly scope their
-- policy `TO service_role`, the same corrected pattern used in
-- 082_gateway_partners_credentials.sql (not the older, unscoped
-- "service_role_all" pattern in 079_aerial_view_cache.sql, which is
-- permissive to anon/authenticated too -- acceptable only for that table's
-- non-sensitive content, not for this one).

CREATE TABLE IF NOT EXISTS gateway_usage_counters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type  text NOT NULL CHECK (scope_type IN ('credential','partner','ip')),
  scope_key   text NOT NULL,
  window_type text NOT NULL CHECK (window_type IN ('minute','day','month')),
  window_key  text NOT NULL,
  count       integer NOT NULL DEFAULT 0,
  UNIQUE (scope_type, scope_key, window_type, window_key)
);
-- No additional index: the UNIQUE constraint above already indexes exactly
-- the (scope_type, scope_key, window_type, window_key) tuple every real
-- query pattern here looks up by -- a second index would be unused weight.

CREATE TABLE IF NOT EXISTS gateway_config (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);

-- Seed exactly the two Phase D control rows the locked architecture calls
-- for -- both default to the non-blocking state so applying this migration
-- does not itself interrupt anything (there is nothing live to interrupt
-- yet -- zero external Gateway routes exist -- but the default is chosen
-- for correctness, not convenience).
INSERT INTO gateway_config (key, value) VALUES
  ('circuit_state', '{"open": false}'),
  ('kill_switch', '{"enabled": false}')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE gateway_usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON gateway_usage_counters
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON gateway_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Narrowly scoped atomic increment. Does exactly one thing -- increments (or
-- initializes) a single counter row for the given key and returns the
-- resulting count -- nothing generic, no arbitrary table mutation. Callers
-- get the atomicity guarantee for free; no client-side transaction or
-- locking logic needed.
CREATE OR REPLACE FUNCTION gateway_increment_counter(
  p_scope_type  text,
  p_scope_key   text,
  p_window_type text,
  p_window_key  text
) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO gateway_usage_counters (scope_type, scope_key, window_type, window_key, count)
  VALUES (p_scope_type, p_scope_key, p_window_type, p_window_key, 1)
  ON CONFLICT (scope_type, scope_key, window_type, window_key)
  DO UPDATE SET count = gateway_usage_counters.count + 1
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

-- Explicit EXECUTE scoping -- Postgres grants EXECUTE on a new function to
-- PUBLIC by default; revoke that and grant only to service_role, the same
-- discipline as the table RLS above. SECURITY INVOKER (the default, not
-- overridden here) is intentional: the only real caller is already the
-- service_role connection the Gateway itself uses, which already bypasses
-- RLS -- there is no privilege gap for SECURITY DEFINER to close here, and
-- INVOKER is the simpler, more auditable choice when it's sufficient.
REVOKE ALL ON FUNCTION gateway_increment_counter(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gateway_increment_counter(text, text, text, text) TO service_role;
