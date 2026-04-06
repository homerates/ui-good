-- ============================================================
-- 006_scenario_card_data.sql
-- Store the borrower's actual calculated card data on scenario_briefs
-- so LOs see real numbers (rate, monthly payment, loan amount, term)
-- not just the intake form buckets.
-- ============================================================

ALTER TABLE public.scenario_briefs
  ADD COLUMN IF NOT EXISTS card_price      numeric,        -- exact purchase price from card
  ADD COLUMN IF NOT EXISTS card_loan_amt   numeric,        -- calculated loan amount
  ADD COLUMN IF NOT EXISTS card_rate       numeric,        -- estimated rate from AI analysis
  ADD COLUMN IF NOT EXISTS card_monthly    numeric,        -- P&I monthly payment
  ADD COLUMN IF NOT EXISTS card_term       integer,        -- loan term (years)
  ADD COLUMN IF NOT EXISTS card_dp_pct     numeric,        -- exact down % from card
  ADD COLUMN IF NOT EXISTS has_card_data   boolean DEFAULT false;  -- flag: Path A post
