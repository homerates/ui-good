-- ============================================================
-- 005_lo_profile_and_matching.sql
-- 1. LO profile fields (nmls, license_state)
-- 2. Borrower-controlled matching fields on scenario_briefs
-- ============================================================

-- ---------------------------------------------------------------
-- 1. LOAN OFFICERS — profile fields
-- ---------------------------------------------------------------
ALTER TABLE public.loan_officers
  ADD COLUMN IF NOT EXISTS nmls           text,
  ADD COLUMN IF NOT EXISTS license_state  text;

-- ---------------------------------------------------------------
-- 2. USERS — display name
-- ---------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS role      text DEFAULT 'borrower';

-- ---------------------------------------------------------------
-- 3. SCENARIO BRIEFS — borrower-controlled matching
--    max_responses  : how many LO responses the borrower wants (3–5)
--    response_window_hours : how long the post stays open (24/48/72)
--    closes_at      : computed on insert (created_at + window)
--    anonymity_level: 'full' (state+loan type only) | 'detailed' (all fields)
-- ---------------------------------------------------------------
ALTER TABLE public.scenario_briefs
  ADD COLUMN IF NOT EXISTS max_responses         integer     DEFAULT 3,
  ADD COLUMN IF NOT EXISTS response_window_hours integer     DEFAULT 48,
  ADD COLUMN IF NOT EXISTS closes_at             timestamptz,
  ADD COLUMN IF NOT EXISTS anonymity_level       text        DEFAULT 'full';

-- Backfill closes_at for existing rows that don't have it
UPDATE public.scenario_briefs
   SET closes_at = created_at + INTERVAL '48 hours'
 WHERE closes_at IS NULL AND status = 'active';

-- ---------------------------------------------------------------
-- 4. Auto-close expired scenarios — run this periodically or
--    rely on the API to filter them out. This index helps:
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_scenario_briefs_closes_at
  ON public.scenario_briefs (closes_at)
  WHERE status = 'active';
