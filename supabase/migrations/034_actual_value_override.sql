-- Migration 034: actual_value override for consumer_homeowner_properties
-- Allows LOs and borrowers to enter a verified appraised value or last known
-- good valuation, replacing the AVM estimate in all calculations.

ALTER TABLE public.consumer_homeowner_properties
  ADD COLUMN IF NOT EXISTS actual_value numeric;

-- Same pattern as actual_balance, actual_rate, actual_purchase_price.
-- NULL = use AVM estimate. Set = use this value as authoritative.
