-- Migration 057 — add card_fair_par_rate to buyer_evaluation_sessions
-- L5 decoded rate is written here (keyed by session id) so Track 5 can
-- read it from the same row as l1–l4 scores.
ALTER TABLE buyer_evaluation_sessions
  ADD COLUMN IF NOT EXISTS card_fair_par_rate numeric;
