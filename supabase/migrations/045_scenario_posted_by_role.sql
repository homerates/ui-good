-- 045_scenario_posted_by_role.sql
-- Tracks whether a scenario was posted by the buyer themselves or by an agent on behalf of a client.
-- Defaults to 'borrower' so all existing rows are unaffected.

ALTER TABLE scenario_briefs
  ADD COLUMN IF NOT EXISTS posted_by_role VARCHAR(16) NOT NULL DEFAULT 'borrower'
  CHECK (posted_by_role IN ('borrower', 'agent'));
