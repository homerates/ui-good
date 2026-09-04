-- 084_gateway_request_log.sql
-- HomeRates Intelligence Gateway V1, Phase E1: privacy-safe operational
-- request logging. Additive only -- no existing table (082's
-- gateway_partners/gateway_credentials, 083's gateway_usage_counters/
-- gateway_config) modified.
--
-- NOT APPLIED BY THIS SESSION. Drafted and statically validated only -- the
-- owner applies this migration manually after review.
--
-- PRIVACY-FIRST, DELIBERATELY MINIMAL. This table exists for operational
-- visibility (is the Gateway healthy, who is calling it, what's failing),
-- not surveillance. It never stores: the raw or hashed API key/secret, raw
-- request body, raw property address (or any hash of it), raw IP address,
-- the Property Intelligence response or any internal object, Track5/L1-L4
-- scores, methodologyVersion, prompts/reasoning, or any other proprietary
-- scoring internal. Every column below is one already-justified in the
-- Phase E1 instruction; no column exists "because it might be useful later."
--
-- OUTCOME / ERROR_CODE SPLIT. `outcome` answers "what did the caller get":
-- one of Contract V1's own three availability states (AVAILABLE / PARTIAL /
-- NOT_AVAILABLE, per lib/gateway/outputSchema.ts's real
-- ExternalPropertyIntelligenceV1Schema `availability.status` enum -- not
-- invented here) or the single bucket 'ERROR' for every case where the
-- Gateway itself rejected the request before or instead of producing a
-- Contract V1 response. `error_code` answers "if ERROR, specifically why":
-- one of the real GatewayResult error codes from
-- lib/gateway/intelligenceGateway.ts (SERVICE_DISABLED / UNAUTHORIZED /
-- FORBIDDEN / RATE_LIMITED / INVALID_REQUEST / INTERNAL_ERROR) -- the exact
-- existing taxonomy, not a new one. A CHECK constraint enforces that
-- error_code is present if and only if outcome = 'ERROR', so the two
-- columns can never drift out of sync with each other.
--
-- FOREIGN KEYS -- bare REFERENCES, no ON DELETE clause (Postgres default:
-- NO ACTION). Both partner_id and credential_id are nullable, since a
-- SERVICE_DISABLED (kill-switch/circuit) rejection and an UNAUTHORIZED
-- rejection both happen before a CallerContext exists -- there is no
-- partner/credential identity to attribute those rows to, and this table
-- must never be back-filled by authenticating a request purely to enrich a
-- log row (see lib/gateway/requestLog.ts). No ON DELETE CASCADE: this table
-- is the Gateway's audit history, and neither gateway_partners nor
-- gateway_credentials rows are ever actually deleted by existing code
-- (only status-updated to 'cancelled'/'revoked') -- NO ACTION is the
-- correct, protective default should a delete path ever be added later: it
-- blocks the delete rather than silently orphaning or cascading away
-- history.
--
-- RETENTION -- explicitly undecided (a real business/legal question, not
-- something this migration invents an answer to). No TTL/expiry column or
-- automatic-purge mechanism exists here; the schema is compatible with a
-- later retention/cleanup job being added without a breaking migration.

CREATE TABLE IF NOT EXISTS gateway_request_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  partner_id    uuid REFERENCES gateway_partners(id),
  credential_id uuid REFERENCES gateway_credentials(id),
  outcome       text NOT NULL
                CHECK (outcome IN ('AVAILABLE', 'PARTIAL', 'NOT_AVAILABLE', 'ERROR')),
  error_code    text
                CHECK (error_code IS NULL OR error_code IN (
                  'SERVICE_DISABLED', 'UNAUTHORIZED', 'FORBIDDEN',
                  'RATE_LIMITED', 'INVALID_REQUEST', 'INTERNAL_ERROR'
                )),
  latency_ms    integer NOT NULL,
  CHECK ((outcome = 'ERROR') = (error_code IS NOT NULL))
);

-- Both indexes exist for the admin usage/recent-errors views this same
-- phase builds (app/api/admin/gateway-usage/route.ts) -- not speculative.
-- created_at DESC: recent-errors and recent-activity queries always order
-- by this. partner_id: per-partner usage aggregation.
CREATE INDEX IF NOT EXISTS gateway_request_log_created_at_idx ON gateway_request_log (created_at DESC);
CREATE INDEX IF NOT EXISTS gateway_request_log_partner_id_idx ON gateway_request_log (partner_id);

ALTER TABLE gateway_request_log ENABLE ROW LEVEL SECURITY;

-- Explicitly scoped TO service_role only, matching the corrected pattern
-- from 082/083 (not the older unscoped "service_role_all" pattern in
-- 079_aerial_view_cache.sql) -- anon/authenticated must not be able to
-- enumerate this table under any circumstance; admin browser access is only
-- ever through requireAdmin()-protected server routes, never a direct
-- client-side Supabase read.
CREATE POLICY "service_role_all" ON gateway_request_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
