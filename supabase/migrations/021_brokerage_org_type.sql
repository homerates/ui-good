-- 021_brokerage_org_type.sql
-- Add org_type and website to brokerages table.
-- org_type: 'brokerage' | 'lender' | 'credit_union' | 're_brokerage'

ALTER TABLE public.brokerages
  ADD COLUMN IF NOT EXISTS org_type TEXT NOT NULL DEFAULT 'brokerage',
  ADD COLUMN IF NOT EXISTS website  TEXT;
