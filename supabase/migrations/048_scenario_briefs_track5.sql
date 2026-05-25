-- 048_scenario_briefs_track5.sql
-- Extend scenario_briefs to support Track 5 score-driven match requests.
-- Track5 briefs are anonymous (zip_only) until the borrower accepts a pro response,
-- at which point share_level flips to 'full_address' and the property address is revealed.

ALTER TABLE public.scenario_briefs
  ADD COLUMN IF NOT EXISTS session_id      uuid REFERENCES public.buyer_evaluation_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS property_zip    text,          -- ZIP extracted from property_address (shared at match time)
  ADD COLUMN IF NOT EXISTS share_level     text NOT NULL DEFAULT 'zip_only',   -- 'zip_only' | 'full_address'
  ADD COLUMN IF NOT EXISTS composite_score integer,       -- Track 5 composite (0–100)
  ADD COLUMN IF NOT EXISTS verdict_label   text,          -- 'Strong Buy' | 'Ready to Offer' | etc.
  ADD COLUMN IF NOT EXISTS from_track5     boolean NOT NULL DEFAULT false;     -- distinguishes Track5 briefs from form briefs

-- Fast lookup: find all briefs linked to a given evaluation session
CREATE INDEX IF NOT EXISTS scenario_briefs_session_id_idx
  ON public.scenario_briefs (session_id)
  WHERE session_id IS NOT NULL;

-- Prevent duplicate Track5 match requests for the same session
CREATE UNIQUE INDEX IF NOT EXISTS scenario_briefs_session_unique
  ON public.scenario_briefs (session_id)
  WHERE session_id IS NOT NULL AND from_track5 = true;
