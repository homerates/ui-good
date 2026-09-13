-- 087_gateway_oauth_refresh_tokens.sql
-- HomeRates Intelligence Gateway -- OAuth refresh_token grant (RFC 6749
-- Section 6). Additive only -- no existing gateway table modified.
--
-- NOT APPLIED BY THIS SESSION. Drafted and statically reviewed only, per
-- CLAUDE.md / DEPLOY_WORKFLOW.md: Rayaan applies every migration manually
-- in the Supabase SQL Editor after review.
--
-- Why this exists (real, live incident, not speculative): the pilot's
-- ACCESS_TOKEN_TTL_SECONDS is 1 hour with no refresh grant. Confirmed live
-- 2026-09-13: ChatGPT's access token expired at 03:52 UTC and every
-- connector call failed with a generic "Failed to connect" error for the
-- following ~14.5 hours, with zero recovery path short of the user manually
-- disconnecting and reconnecting the connector (a full re-authorization,
-- not a silent refresh). This table plus the token endpoint's new
-- grant_type=refresh_token branch (app/api/oauth/token/route.ts) lets a
-- compliant OAuth client (ChatGPT, Claude, Grok) silently mint a new access
-- token without a new consent screen.
--
-- ROTATING, single-use, per OAuth 2.1 guidance (this codebase already
-- follows OAuth 2.1 conventions throughout -- PKCE S256-only, no `plain`):
-- each redemption immediately revokes the presented token and issues a new
-- one. A second presentation of an already-consumed refresh token (e.g.
-- after theft) fails outright -- the same "atomic check-and-mark" pattern
-- gateway_oauth_codes.used_at already uses for authorization codes, applied
-- here as revoked_at.
--
-- 30-day TTL: long enough that a real client's normal usage pattern never
-- needs a fresh full re-authorization, short enough to bound exposure if a
-- refresh token is ever compromised. Independent of the 1-hour access-token
-- TTL, which is unchanged by this migration.
--
-- RLS follows the exact pattern established in 085_gateway_oauth.sql: this
-- table stores secret-adjacent material (a refresh token hash), so its
-- policy explicitly adds `TO service_role` rather than relying on
-- Postgres's PUBLIC-applies-when-no-TO-clause default.

CREATE TABLE IF NOT EXISTS gateway_oauth_refresh_tokens (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash         text NOT NULL UNIQUE,
  oauth_client_id    uuid NOT NULL REFERENCES gateway_oauth_clients(id),
  partner_id         uuid NOT NULL REFERENCES gateway_partners(id),
  scope              text NOT NULL,
  resource           text NOT NULL,
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gateway_oauth_refresh_tokens_client_idx ON gateway_oauth_refresh_tokens (oauth_client_id);

ALTER TABLE gateway_oauth_refresh_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON gateway_oauth_refresh_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);
