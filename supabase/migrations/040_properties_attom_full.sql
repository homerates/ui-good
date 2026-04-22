-- 040_properties_attom_full.sql
-- Adds ATTOM enrichment columns: AVM, mortgage, lot size, ATTOM identifier.

ALTER TABLE properties
  -- Physical (missing from original schema)
  ADD COLUMN IF NOT EXISTS lot_size_sqft            integer,
  ADD COLUMN IF NOT EXISTS attom_id                 text,
  -- Automated Valuation Model (ATTOM AVM)
  ADD COLUMN IF NOT EXISTS avm_value                numeric,
  ADD COLUMN IF NOT EXISTS avm_value_low            numeric,
  ADD COLUMN IF NOT EXISTS avm_value_high           numeric,
  ADD COLUMN IF NOT EXISTS avm_confidence           numeric,
  ADD COLUMN IF NOT EXISTS avm_date                 text,
  -- First mortgage / lien on public record
  ADD COLUMN IF NOT EXISTS mortgage_lender          text,
  ADD COLUMN IF NOT EXISTS mortgage_original_amount numeric,
  ADD COLUMN IF NOT EXISTS mortgage_open_balance    numeric,
  ADD COLUMN IF NOT EXISTS mortgage_interest_rate   numeric,
  ADD COLUMN IF NOT EXISTS mortgage_loan_type       text,
  ADD COLUMN IF NOT EXISTS mortgage_origination_date text;
