-- Migration 078: 2nd-lien HELOC override fields (1st mortgage stays the
-- existing actual_* columns; this adds an additive, optional 2nd slot).
-- Cap is exactly 2 loans per property — 1st (actual_*) + 2nd (heloc_*).
-- NULL heloc_limit = no 2nd lien on file (the default for every existing
-- row — zero backfill needed, existing single-loan data already reads
-- correctly as "loan #1" with no 2nd lien).

ALTER TABLE public.consumer_homeowner_properties
  ADD COLUMN IF NOT EXISTS heloc_limit            numeric,
  ADD COLUMN IF NOT EXISTS heloc_balance           numeric,
  ADD COLUMN IF NOT EXISTS heloc_rate              numeric,
  ADD COLUMN IF NOT EXISTS heloc_origination_date  date;

ALTER TABLE public.borrowers
  ADD COLUMN IF NOT EXISTS heloc_limit            numeric,
  ADD COLUMN IF NOT EXISTS heloc_balance           numeric,
  ADD COLUMN IF NOT EXISTS heloc_rate              numeric,
  ADD COLUMN IF NOT EXISTS heloc_origination_date  date;

-- No CHECK constraints — consistent with the existing actual_* columns,
-- which impose none either (025/034/035 precedent).
