-- migration: 068_crm_compliance_events.sql
-- Audit log for CRM server-side fair-lending blocklist triggers.
-- Written when the POST /api/crm/touchpoints handler rejects a save because a
-- key_facts freeform string or subject matched the protected-characteristics blocklist.
--
-- Compliance reference: COMPLIANCE_DECISIONS.md Decision 7 (AI Content Safety on
-- Freeform CRM Fields — server-side blocklist component added 2026-07-13).
--
-- Access model: service role writes; no LO or end-user read access (RLS denies all).
-- Admin review via Supabase dashboard or HomeRates ops tooling.

CREATE TABLE IF NOT EXISTS crm_compliance_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type     text        NOT NULL CHECK (event_type IN ('blocklist_triggered')),
  lo_user_id     text        NOT NULL,          -- Clerk user id of the LO who submitted
  borrower_id    text,                          -- borrower_id from request body, if present
  blocked_field  text        NOT NULL,          -- e.g. 'life_event.event', 'subject'
  matched_term   text        NOT NULL,          -- the label of the pattern that matched (NOT the LO input)
  matched_category text      NOT NULL,          -- e.g. 'religion', 'marital_status'
  -- truncated_value is the first 120 chars of the blocked string only.
  -- Storing the full value here would itself be a data minimization concern.
  truncated_value text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- RLS: deny all direct access. Only service role (used in API routes) can write/read.
-- Admin review happens via Supabase dashboard (service role is used there as well).
ALTER TABLE crm_compliance_events ENABLE ROW LEVEL SECURITY;

-- Explicit deny-all policy. Service role bypasses RLS entirely — no policy needed for it.
CREATE POLICY "no_direct_access" ON crm_compliance_events
  AS RESTRICTIVE
  USING (false);

-- Index for review queries: by LO, by date, by category
CREATE INDEX IF NOT EXISTS crm_compliance_events_lo_user_id_idx  ON crm_compliance_events (lo_user_id);
CREATE INDEX IF NOT EXISTS crm_compliance_events_created_at_idx  ON crm_compliance_events (created_at DESC);
CREATE INDEX IF NOT EXISTS crm_compliance_events_category_idx    ON crm_compliance_events (matched_category);
