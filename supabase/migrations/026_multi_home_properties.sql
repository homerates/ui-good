-- Migration 026: multi-home properties for consumers
-- Replaces the single-row consumer_homeowners with a one-row-per-property table.
-- Existing rows are migrated with their original IDs preserved so that
-- consumer_snapshots foreign keys continue to work without a data backfill.

CREATE TABLE IF NOT EXISTS public.consumer_homeowner_properties (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               text        NOT NULL,
  property_address      text        NOT NULL,
  is_primary            boolean     NOT NULL DEFAULT false,
  digest_enabled        boolean     NOT NULL DEFAULT true,
  actual_balance        numeric,
  actual_rate           numeric,
  actual_purchase_price numeric,
  actual_purchase_date  date,
  email                 text,
  name                  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, property_address)
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS consumer_homeowner_properties_user_idx
  ON public.consumer_homeowner_properties (user_id);

-- Migrate existing records, preserving IDs so consumer_snapshots FKs still resolve.
-- Flag each migrated record as primary (one property per user = their primary home).
INSERT INTO public.consumer_homeowner_properties (
  id,
  user_id,
  property_address,
  is_primary,
  digest_enabled,
  actual_balance,
  actual_rate,
  actual_purchase_price,
  actual_purchase_date,
  email,
  name,
  created_at,
  updated_at
)
SELECT
  id,
  user_id,
  property_address,
  true,                                    -- mark as primary
  COALESCE(digest_enabled, true),
  actual_balance,
  actual_rate,
  actual_purchase_price,
  actual_purchase_date,
  email,
  name,
  created_at,
  updated_at
FROM public.consumer_homeowners
WHERE property_address IS NOT NULL
ON CONFLICT (user_id, property_address) DO NOTHING;

-- consumer_homeowners is kept (not dropped) for safe rollback.
-- The app reads from consumer_homeowner_properties going forward.
