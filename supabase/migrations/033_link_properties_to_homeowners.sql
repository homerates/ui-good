-- Migration 033: link consumer_homeowner_properties → canonical properties
-- Adds property_id FK so each saved home resolves to the shared canonical record.
-- Column is nullable to allow backfill without breaking existing rows.

ALTER TABLE public.consumer_homeowner_properties
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id);

CREATE INDEX IF NOT EXISTS chp_property_id_idx
  ON public.consumer_homeowner_properties (property_id);
