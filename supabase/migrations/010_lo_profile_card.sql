-- ============================================================
-- 010_lo_profile_card.sql
-- Add professional card fields to loan_officers and agents
-- so the contact share email can render a full signature card.
-- ============================================================

ALTER TABLE public.loan_officers
  ADD COLUMN IF NOT EXISTS title          text,   -- e.g. "Senior Loan Officer"
  ADD COLUMN IF NOT EXISTS bio            text,   -- short personal statement (≤280 chars)
  ADD COLUMN IF NOT EXISTS phone          text,   -- professional phone
  ADD COLUMN IF NOT EXISTS website        text,   -- personal or company site / LinkedIn
  ADD COLUMN IF NOT EXISTS office_address text;   -- company / branch address

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS title          text,
  ADD COLUMN IF NOT EXISTS bio            text,
  ADD COLUMN IF NOT EXISTS phone          text,
  ADD COLUMN IF NOT EXISTS website        text,
  ADD COLUMN IF NOT EXISTS office_address text;
