-- 085_gateway_oauth.sql
-- HomeRates Intelligence Gateway V1, Phase OA: OAuth 2.1 foundation for
-- ChatGPT private-plugin authentication. Additive only -- no existing
-- gateway table modified.
--
-- NOT APPLIED BY THIS SESSION. Drafted and statically reviewed only, per
-- CLAUDE.md / DEPLOY_WORKFLOW.md: Rayaan applies every migration manually
-- in the Supabase SQL Editor after review.
--
-- These two tables are OAuth protocol scaffolding (RFC 6749 authorization
-- code grant + RFC 7636 PKCE), a different kind of thing from
-- gateway_partners/gateway_credentials (business identity, migration 082):
-- a gateway_oauth_client is a registered OAuth caller (e.g. ChatGPT's
-- connector), bound to an existing gateway_partner rather than a new
-- identity concept of its own; a gateway_oauth_code is a short-lived,
-- single-use authorization code. Neither table can mint Gateway access on
-- its own -- Phase OB's token endpoint (not built in this migration) will
-- call the EXISTING issueCredential() (lib/gateway/credentials.ts) to
-- produce a real gateway_credentials row as the OAuth access token. Gateway
-- authentication (auth.ts), scope/rate-limit/circuit/kill-switch checks,
-- and request logging are completely unchanged by this migration.
--
-- RLS follows the exact pattern established in 082_gateway_partners_credentials.sql:
-- both tables store secret-adjacent material (a client secret hash, an
-- authorization code hash) so both policies explicitly add `TO service_role`
-- rather than relying on Postgres's PUBLIC-applies-when-no-TO-clause default.

CREATE TABLE IF NOT EXISTS gateway_oauth_clients (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id                  uuid NOT NULL REFERENCES gateway_partners(id),
  client_id                   text NOT NULL UNIQUE,
  client_secret_hash          text NOT NULL,
  redirect_uri                text NOT NULL,
  token_endpoint_auth_method  text NOT NULL DEFAULT 'client_secret_post'
                              CHECK (token_endpoint_auth_method IN ('client_secret_post', 'client_secret_basic')),
  status                      text NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'disabled')),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  disabled_at                  timestamptz
);

CREATE INDEX IF NOT EXISTS gateway_oauth_clients_partner_idx ON gateway_oauth_clients (partner_id);

-- code_hash is the ONLY representation of the authorization code stored --
-- the plaintext code is generated, hashed, and returned to the caller
-- exactly once (mirroring issueCredential()'s existing plaintext-key
-- discipline in lib/gateway/credentials.ts); it is never written anywhere.
CREATE TABLE IF NOT EXISTS gateway_oauth_codes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash              text NOT NULL UNIQUE,
  oauth_client_id        uuid NOT NULL REFERENCES gateway_oauth_clients(id),
  redirect_uri           text NOT NULL,
  code_challenge         text NOT NULL,
  code_challenge_method  text NOT NULL DEFAULT 'S256' CHECK (code_challenge_method = 'S256'),
  resource               text NOT NULL,
  scope                  text NOT NULL,
  expires_at             timestamptz NOT NULL,
  used_at                timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gateway_oauth_codes_client_idx ON gateway_oauth_codes (oauth_client_id);

ALTER TABLE gateway_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_oauth_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON gateway_oauth_clients
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON gateway_oauth_codes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
