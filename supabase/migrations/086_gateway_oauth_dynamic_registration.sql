-- 086_gateway_oauth_dynamic_registration.sql
-- HomeRates Intelligence Gateway V1, Phase OC: Dynamic Client Registration
-- (RFC 7591) so a third-party MCP client (e.g. Grok) can self-register an
-- OAuth client instead of requiring a manually pre-registered one -- the
-- gap that blocked Grok's connector from authenticating at all (confirmed
-- live 2026-09-11: Grok's client never presented the static Gateway API
-- key, and our OAuth server had exactly one hardcoded client, the real
-- ChatGPT pilot integration, with no self-registration path).
--
-- NOT APPLIED BY THIS SESSION. Drafted and statically validated only, per
-- CLAUDE.md / DEPLOY_WORKFLOW.md: Rayaan applies every migration manually
-- in the Supabase SQL Editor after review -- same standing rule every prior
-- Gateway migration (082/083/084/085) in this file's own history followed.
--
-- This migration widens two existing constraints on gateway_oauth_clients
-- (from migration 085) rather than only adding new columns -- flagged
-- explicitly here per CLAUDE.md's guidance to call out any non-purely-
-- additive change rather than running it silently. Neither change is
-- destructive: both only ADD a previously-disallowed value/state to an
-- existing CHECK, and every existing row (today: just the one ChatGPT
-- pilot client) already satisfies the widened constraint unchanged.
--
-- 1. token_endpoint_auth_method gains 'none' -- a PUBLIC OAuth client (no
--    client_secret, PKCE-only), the shape many MCP clients (Grok included,
--    based on its connector never asking for a secret) register as by
--    default. The existing 'client_secret_post'/'client_secret_basic'
--    values and the one existing row are completely unaffected.
-- 2. client_secret_hash becomes NULLABLE -- a 'none'-method client has no
--    secret to hash. The existing ChatGPT row already has a real hash and
--    is unaffected; only NEW rows may now have a null value here, and only
--    when token_endpoint_auth_method = 'none'.
--
-- New columns (purely additive, IF NOT EXISTS):
-- - client_name: RFC 7591's standard human-readable field, shown on the
--   admin Gateway Partners page so Rayaan can tell registered clients apart.
-- - registration_type: 'admin' (today's only real client, created directly
--   in Supabase/via this migration's own precedent) vs 'dynamic'
--   (self-registered via the new /api/oauth/register endpoint) -- pure
--   audit/visibility, changes no runtime behavior.
--
-- SECURITY POSTURE (why this is safe to expose publicly, unauthenticated,
-- per RFC 7591's own design): registering a client here grants NOTHING by
-- itself. The authorization endpoint (/api/oauth/authorize) still requires
-- a real HomeRates admin Clerk session and an explicit "Allow" click on the
-- consent page (lib/adminAuth.ts's isAdminId() check, unchanged) before any
-- authorization code -- let alone an access token -- can ever be issued.
-- Separately, every self-registered client's auto-created gateway_partner
-- (lib/gateway/oauth.ts's registerOAuthClient(), not this migration) is
-- created with the table's own existing default status='pending' -- so even
-- after a full, successfully-completed OAuth dance, the resulting Gateway
-- credential still fails FORBIDDEN at every real tool call
-- (lib/gateway/auth.ts's existing partner.status !== 'active' check,
-- completely unchanged) until Rayaan manually flips that partner to
-- 'active' on the existing Gateway Partners admin page -- no new approval
-- mechanism was built; this reuses the exact gate that already existed for
-- every partner. Worst-case abuse of an open registration endpoint is
-- unused rows in gateway_oauth_clients/gateway_partners, never real access.
-- A per-IP rate limit on the registration endpoint itself was deliberately
-- NOT added in this phase (would need a new gateway_usage_counters
-- scope_type, a further constraint widening) -- the admin-consent gate
-- above is the real access-control boundary, not registration-time
-- throttling; revisit only if real abuse is observed.

-- Finds and drops whatever CHECK constraint Postgres actually auto-named
-- for this column (rather than assuming the standard <table>_<column>_check
-- name, which this session cannot verify against the real live schema) --
-- safe to run even if no such constraint is found (the loop simply does
-- nothing), and safe to re-run (IF NOT EXISTS-equivalent via the loop guard).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'gateway_oauth_clients'
      AND con.contype = 'c'
      AND att.attname = 'token_endpoint_auth_method'
  LOOP
    EXECUTE format('ALTER TABLE gateway_oauth_clients DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE gateway_oauth_clients
  ADD CONSTRAINT gateway_oauth_clients_token_endpoint_auth_method_check
  CHECK (token_endpoint_auth_method IN ('client_secret_post', 'client_secret_basic', 'none'));

ALTER TABLE gateway_oauth_clients
  ALTER COLUMN client_secret_hash DROP NOT NULL;

ALTER TABLE gateway_oauth_clients
  ADD COLUMN IF NOT EXISTS client_name text;

ALTER TABLE gateway_oauth_clients
  ADD COLUMN IF NOT EXISTS registration_type text NOT NULL DEFAULT 'admin'
  CHECK (registration_type IN ('admin', 'dynamic'));
