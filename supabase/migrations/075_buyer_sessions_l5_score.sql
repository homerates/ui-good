-- Migration 075 — add l5_score / l5_summary to buyer_evaluation_sessions
-- L5 Rate Intelligence score, computed from card_fair_par_rate's position in
-- the OBMMI market rate distribution (see lib/scoring/decisionScore.ts scoreL5).
-- Written by RateEngineClient.tsx alongside card_fair_par_rate, and folded
-- into composite_score alongside l1-l4.
ALTER TABLE buyer_evaluation_sessions
  ADD COLUMN IF NOT EXISTS l5_score smallint,
  ADD COLUMN IF NOT EXISTS l5_summary text;
