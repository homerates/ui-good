-- Migration 056 — add card_fair_par_rate to scenario_briefs
-- Stores the L5-decoded fair par rate when a borrower runs Rate Intelligence before matching.
-- The column is nullable: existing rows have no decoded rate and that's fine.
ALTER TABLE scenario_briefs
  ADD COLUMN IF NOT EXISTS card_fair_par_rate numeric;
