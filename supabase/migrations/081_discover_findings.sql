-- 081_discover_findings.sql
-- Discover Phase C — canonical per-domain Findings + final AI synthesis persistence.
-- Fully additive: does not drop or restructure discover_sessions (044_discover_sessions.sql).
-- lender_responses/gap_analysis remain in place, unused, not backfilled.

ALTER TABLE discover_sessions
  ADD COLUMN IF NOT EXISTS findings JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_synthesis JSONB,
  ADD COLUMN IF NOT EXISTS methodology_version TEXT;

-- methodology_version is intentionally nullable and NOT backfilled: historical
-- rows predate this methodology and must not be mislabeled as though created
-- under it. New sessions set it explicitly at creation time (see
-- app/api/discover/session/route.ts).

-- Atomic, merge-safe per-domain Finding write. A plain "SELECT findings,
-- merge in JS, UPDATE" pattern would lose data under concurrent writes (two
-- domains completing near-simultaneously, or a domain's deterministic write
-- followed shortly after by its own AI-explanation write). jsonb_set + ||
-- inside a single UPDATE statement lets Postgres serialize concurrent calls
-- on the same row via its normal row-level locking, so one domain's write
-- can never clobber another's, and a later call for the SAME domain merges
-- new keys (e.g. ai_explanation) into what's already there instead of
-- replacing the whole domain object.
CREATE OR REPLACE FUNCTION discover_merge_finding(p_session_id uuid, p_domain text, p_finding jsonb)
RETURNS void LANGUAGE sql AS $$
  UPDATE discover_sessions
  SET findings = jsonb_set(
        findings,
        ARRAY[p_domain],
        COALESCE(findings -> p_domain, '{}'::jsonb) || p_finding,
        true
      ),
      updated_at = NOW()
  WHERE id = p_session_id;
$$;

GRANT EXECUTE ON FUNCTION discover_merge_finding(uuid, text, jsonb) TO service_role;
