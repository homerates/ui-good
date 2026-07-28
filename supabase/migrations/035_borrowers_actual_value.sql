-- Migration 035: actual_value override for borrowers table
-- Mirrors the same field on consumer_homeowner_properties.
-- NULL = use AVM estimate. Set = authoritative verified/appraised value.

ALTER TABLE public.borrowers
  ADD COLUMN IF NOT EXISTS actual_value numeric;
