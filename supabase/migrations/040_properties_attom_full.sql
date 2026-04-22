-- 040_properties_attom_full.sql
-- Adds AVM and mortgage columns to properties table for full ATTOM intelligence.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS avm_value                numeric,
  ADD COLUMN IF NOT EXISTS avm_value_low            numeric,
  ADD COLUMN IF NOT EXISTS avm_value_high           numeric,
  ADD COLUMN IF NOT EXISTS avm_confidence           numeric,
  ADD COLUMN IF NOT EXISTS avm_date                 text,
  ADD COLUMN IF NOT EXISTS mortgage_lender          text,
  ADD COLUMN IF NOT EXISTS mortgage_original_amount numeric,
  ADD COLUMN IF NOT EXISTS mortgage_open_balance    numeric,
  ADD COLUMN IF NOT EXISTS mortgage_interest_rate   numeric,
  ADD COLUMN IF NOT EXISTS mortgage_loan_type       text,
  ADD COLUMN IF NOT EXISTS mortgage_origination_date text;
