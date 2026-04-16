-- Migration 024: homeowner loan detail overrides
-- Lets homeowners (or LOs) store their actual loan numbers so the
-- analysis cards and digest show real data instead of AVM estimates.

ALTER TABLE public.consumer_homeowners
  ADD COLUMN IF NOT EXISTS actual_balance       numeric,        -- remaining loan balance ($)
  ADD COLUMN IF NOT EXISTS actual_rate          numeric,        -- current interest rate (%)
  ADD COLUMN IF NOT EXISTS actual_purchase_price numeric,       -- what they paid
  ADD COLUMN IF NOT EXISTS actual_purchase_date  date;          -- close date
