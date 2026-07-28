-- Migration 025: borrower loan detail overrides (LO-side)
-- Mirrors the same 4 fields on consumer_homeowners (migration 024).
-- Lets the LO store the borrower's actual loan numbers so digests show
-- real data instead of AVM/historical estimates.

ALTER TABLE public.borrowers
  ADD COLUMN IF NOT EXISTS actual_balance        numeric,        -- remaining loan balance ($)
  ADD COLUMN IF NOT EXISTS actual_rate           numeric,        -- current interest rate (%)
  ADD COLUMN IF NOT EXISTS actual_purchase_price numeric,        -- what they paid
  ADD COLUMN IF NOT EXISTS actual_purchase_date  date;           -- close date
