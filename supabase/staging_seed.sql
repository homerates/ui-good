-- ============================================================
-- 001_stripe_schema.sql
-- Run in Supabase SQL editor (Dashboard â†’ SQL Editor â†’ New query)
-- ============================================================

-- ---------------------------------------------------------------
-- 1. USERS
--    Source of truth for plan state. Synced from Clerk via webhook.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id                  text PRIMARY KEY,           -- Clerk userId (e.g. user_2abc...)
  email               text NOT NULL,
  full_name           text,
  plan                text NOT NULL DEFAULT 'free', -- 'free' | 'pro' | 'team'
  stripe_customer_id  text UNIQUE,
  billing_period_end  timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------
-- 2. SUBSCRIPTIONS
--    One row per Stripe subscription. Updated by webhook.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                    text PRIMARY KEY,           -- Stripe subscription ID (sub_...)
  user_id               text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status                text NOT NULL,              -- 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete'
  price_id              text NOT NULL,              -- Stripe price ID (price_...)
  plan                  text NOT NULL DEFAULT 'free',
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean DEFAULT false,
  canceled_at           timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------
-- 3. USAGE TRACKING
--    Monthly counters per user. Incremented on each billable action.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_monthly (
  user_id       text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  month         text NOT NULL,  -- format: 'YYYY-MM' e.g. '2026-03'
  chat_messages integer DEFAULT 0,
  pdf_exports   integer DEFAULT 0,
  PRIMARY KEY (user_id, month)
);

-- ---------------------------------------------------------------
-- 4. RLS â€” service role key bypasses all policies (webhooks use it)
--         These policies are for future client-side use
-- ---------------------------------------------------------------
ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_monthly  ENABLE ROW LEVEL SECURITY;

-- Users can read their own row
CREATE POLICY "users: read own"
  ON public.users FOR SELECT
  USING (id = auth.uid()::text);

-- Users can read their own subscriptions
CREATE POLICY "subscriptions: read own"
  ON public.subscriptions FOR SELECT
  USING (user_id = auth.uid()::text);

-- Users can read their own usage
CREATE POLICY "usage: read own"
  ON public.usage_monthly FOR SELECT
  USING (user_id = auth.uid()::text);

-- ---------------------------------------------------------------
-- 5. PATCH loan_officers
--    Add plan reference so borrower-slot logic reads from users.plan
--    (allowed_borrower_slots stays as the runtime limit; we keep it
--     in sync via the Stripe webhook)
-- ---------------------------------------------------------------
ALTER TABLE public.loan_officers
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';

-- ---------------------------------------------------------------
-- 6. RPC: increment_usage
--    Called by lib/subscription.ts to atomically bump counters
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_user_id text,
  p_month   text,
  p_field   text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_field = 'chat_messages' THEN
    UPDATE public.usage_monthly
       SET chat_messages = chat_messages + 1
     WHERE user_id = p_user_id AND month = p_month;
  ELSIF p_field = 'pdf_exports' THEN
    UPDATE public.usage_monthly
       SET pdf_exports = pdf_exports + 1
     WHERE user_id = p_user_id AND month = p_month;
  END IF;
END;
$$;

-- ---------------------------------------------------------------
-- 7. HELPER: updated_at trigger
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- ============================================================
-- 002_rls_with_check.sql
-- Defense-in-depth: add WITH CHECK (INSERT guard) to all user-
-- facing tables. Service-role key still bypasses these for API
-- routes. These policies activate for future client-side queries
-- once Clerk JWT is wired to Supabase JWKS.
-- ============================================================

-- ---------------------------------------------------------------
-- memory_threads
-- ---------------------------------------------------------------
ALTER TABLE public.memory_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memory_threads: read own"  ON public.memory_threads;
DROP POLICY IF EXISTS "memory_threads: insert own" ON public.memory_threads;
DROP POLICY IF EXISTS "memory_threads: update own" ON public.memory_threads;
DROP POLICY IF EXISTS "memory_threads: delete own" ON public.memory_threads;

CREATE POLICY "memory_threads: read own"
  ON public.memory_threads FOR SELECT
  USING (clerk_user_id = auth.uid()::text);

CREATE POLICY "memory_threads: insert own"
  ON public.memory_threads FOR INSERT
  WITH CHECK (clerk_user_id = auth.uid()::text);

CREATE POLICY "memory_threads: update own"
  ON public.memory_threads FOR UPDATE
  USING (clerk_user_id = auth.uid()::text)
  WITH CHECK (clerk_user_id = auth.uid()::text);

CREATE POLICY "memory_threads: delete own"
  ON public.memory_threads FOR DELETE
  USING (clerk_user_id = auth.uid()::text);

-- ---------------------------------------------------------------
-- library_events
-- ---------------------------------------------------------------
ALTER TABLE public.library_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "library_events: read own"   ON public.library_events;
DROP POLICY IF EXISTS "library_events: insert own"  ON public.library_events;

CREATE POLICY "library_events: read own"
  ON public.library_events FOR SELECT
  USING (clerk_user_id = auth.uid()::text);

CREATE POLICY "library_events: insert own"
  ON public.library_events FOR INSERT
  WITH CHECK (clerk_user_id = auth.uid()::text);

-- ---------------------------------------------------------------
-- chat_threads
-- ---------------------------------------------------------------
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_threads: read own"   ON public.chat_threads;
DROP POLICY IF EXISTS "chat_threads: insert own"  ON public.chat_threads;
DROP POLICY IF EXISTS "chat_threads: update own"  ON public.chat_threads;
DROP POLICY IF EXISTS "chat_threads: delete own"  ON public.chat_threads;

CREATE POLICY "chat_threads: read own"
  ON public.chat_threads FOR SELECT
  USING (clerk_user_id = auth.uid()::text);

CREATE POLICY "chat_threads: insert own"
  ON public.chat_threads FOR INSERT
  WITH CHECK (clerk_user_id = auth.uid()::text);

CREATE POLICY "chat_threads: update own"
  ON public.chat_threads FOR UPDATE
  USING (clerk_user_id = auth.uid()::text)
  WITH CHECK (clerk_user_id = auth.uid()::text);

CREATE POLICY "chat_threads: delete own"
  ON public.chat_threads FOR DELETE
  USING (clerk_user_id = auth.uid()::text);

-- ---------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects: read own"   ON public.projects;
DROP POLICY IF EXISTS "projects: insert own"  ON public.projects;
DROP POLICY IF EXISTS "projects: update own"  ON public.projects;
DROP POLICY IF EXISTS "projects: delete own"  ON public.projects;

CREATE POLICY "projects: read own"
  ON public.projects FOR SELECT
  USING (clerk_user_id = auth.uid()::text);

CREATE POLICY "projects: insert own"
  ON public.projects FOR INSERT
  WITH CHECK (clerk_user_id = auth.uid()::text);

CREATE POLICY "projects: update own"
  ON public.projects FOR UPDATE
  USING (clerk_user_id = auth.uid()::text)
  WITH CHECK (clerk_user_id = auth.uid()::text);

CREATE POLICY "projects: delete own"
  ON public.projects FOR DELETE
  USING (clerk_user_id = auth.uid()::text);

-- ---------------------------------------------------------------
-- user_answers â€” upgrade FOR ALL to explicit CRUD with WITH CHECK
-- (replaces the "for all" in setup-supabase.sql)
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "user can manage own answers" ON public.user_answers;

CREATE POLICY "user_answers: read own"
  ON public.user_answers FOR SELECT
  USING (clerk_user_id = auth.uid()::text);

CREATE POLICY "user_answers: insert own"
  ON public.user_answers FOR INSERT
  WITH CHECK (clerk_user_id = auth.uid()::text);

CREATE POLICY "user_answers: update own"
  ON public.user_answers FOR UPDATE
  USING (clerk_user_id = auth.uid()::text)
  WITH CHECK (clerk_user_id = auth.uid()::text);

CREATE POLICY "user_answers: delete own"
  ON public.user_answers FOR DELETE
  USING (clerk_user_id = auth.uid()::text);
-- ============================================================
-- 003_storage_vault.sql
-- Creates the user-vault storage bucket and RLS policies.
-- Run in Supabase Dashboard â†’ SQL Editor
-- ============================================================

-- ---------------------------------------------------------------
-- 1. Create bucket (idempotent)
-- ---------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'user-vault',
    'user-vault',
    false,                   -- private bucket, signed URLs only
    10485760,                -- 10 MB per file
    ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- 2. RLS policies â€” path must start with user's own clerk_user_id
--    e.g.  user_2abc.../refi-1714000000000.pdf
--    (storage.foldername returns 1-indexed array of path segments)
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "vault: user can upload own"    ON storage.objects;
DROP POLICY IF EXISTS "vault: user can read own"      ON storage.objects;
DROP POLICY IF EXISTS "vault: user can delete own"    ON storage.objects;

CREATE POLICY "vault: user can upload own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'user-vault'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "vault: user can read own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'user-vault'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "vault: user can delete own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'user-vault'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
-- Migration 004: homeowner digest â€” property address on borrowers + snapshot history

-- 1. Add property_address to borrowers
ALTER TABLE borrowers
  ADD COLUMN IF NOT EXISTS property_address text,
  ADD COLUMN IF NOT EXISTS digest_enabled   boolean NOT NULL DEFAULT true;

-- 2. Monthly snapshot table â€” one row per borrower per month
CREATE TABLE IF NOT EXISTS homeowner_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id         uuid NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
  snapshot_date       date NOT NULL DEFAULT current_date,
  estimated_value     integer,
  estimated_value_low integer,
  estimated_value_high integer,
  estimated_balance   integer,
  estimated_equity    integer,
  purchase_rate       numeric(5,2),
  live_rate           numeric(5,2),
  last_sale_price     integer,
  last_sale_date      text,
  listing_status      text,
  -- refi window flag: true when live_rate < purchase_rate - 0.5
  refi_window         boolean GENERATED ALWAYS AS (
    live_rate IS NOT NULL AND purchase_rate IS NOT NULL AND live_rate < purchase_rate - 0.5
  ) STORED,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (borrower_id, snapshot_date)
);

-- 3. Digest send log â€” track every email sent
CREATE TABLE IF NOT EXISTS digest_sends (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id  uuid NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
  lo_user_id   text NOT NULL,
  snapshot_id  uuid REFERENCES homeowner_snapshots(id),
  sent_at      timestamptz NOT NULL DEFAULT now(),
  resend_id    text,
  status       text NOT NULL DEFAULT 'sent'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_snapshots_borrower ON homeowner_snapshots(borrower_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_digest_sends_lo    ON digest_sends(lo_user_id, sent_at DESC);
-- ============================================================
-- 005_lo_profile_and_matching.sql
-- 1. LO profile fields (nmls, license_state)
-- 2. Borrower-controlled matching fields on scenario_briefs
-- ============================================================

-- ---------------------------------------------------------------
-- 1. LOAN OFFICERS â€” profile fields
-- ---------------------------------------------------------------
ALTER TABLE public.loan_officers
  ADD COLUMN IF NOT EXISTS nmls           text,
  ADD COLUMN IF NOT EXISTS license_state  text;

-- ---------------------------------------------------------------
-- 2. USERS â€” display name
-- ---------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS role      text DEFAULT 'borrower';

-- ---------------------------------------------------------------
-- 3. SCENARIO BRIEFS â€” borrower-controlled matching
--    max_responses  : how many LO responses the borrower wants (3â€“5)
--    response_window_hours : how long the post stays open (24/48/72)
--    closes_at      : computed on insert (created_at + window)
--    anonymity_level: 'full' (state+loan type only) | 'detailed' (all fields)
-- ---------------------------------------------------------------
ALTER TABLE public.scenario_briefs
  ADD COLUMN IF NOT EXISTS max_responses         integer     DEFAULT 3,
  ADD COLUMN IF NOT EXISTS response_window_hours integer     DEFAULT 48,
  ADD COLUMN IF NOT EXISTS closes_at             timestamptz,
  ADD COLUMN IF NOT EXISTS anonymity_level       text        DEFAULT 'full';

-- Backfill closes_at for existing rows that don't have it
UPDATE public.scenario_briefs
   SET closes_at = created_at + INTERVAL '48 hours'
 WHERE closes_at IS NULL AND status = 'active';

-- ---------------------------------------------------------------
-- 4. Auto-close expired scenarios â€” run this periodically or
--    rely on the API to filter them out. This index helps:
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_scenario_briefs_closes_at
  ON public.scenario_briefs (closes_at)
  WHERE status = 'active';
-- ============================================================
-- 006_scenario_card_data.sql
-- Store the borrower's actual calculated card data on scenario_briefs
-- so LOs see real numbers (rate, monthly payment, loan amount, term)
-- not just the intake form buckets.
-- ============================================================

ALTER TABLE public.scenario_briefs
  ADD COLUMN IF NOT EXISTS card_price      numeric,        -- exact purchase price from card
  ADD COLUMN IF NOT EXISTS card_loan_amt   numeric,        -- calculated loan amount
  ADD COLUMN IF NOT EXISTS card_rate       numeric,        -- estimated rate from AI analysis
  ADD COLUMN IF NOT EXISTS card_monthly    numeric,        -- P&I monthly payment
  ADD COLUMN IF NOT EXISTS card_term       integer,        -- loan term (years)
  ADD COLUMN IF NOT EXISTS card_dp_pct     numeric,        -- exact down % from card
  ADD COLUMN IF NOT EXISTS has_card_data   boolean DEFAULT false;  -- flag: Path A post
-- 007_messaging.sql
-- Private async messaging between borrowers and professionals
-- Two tables: conversation_threads (one per borrowerâ†”pro pair) + messages

-- Conversation threads (one per scenario_response)
CREATE TABLE IF NOT EXISTS public.conversation_threads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id         uuid REFERENCES public.scenario_briefs(id) ON DELETE SET NULL,
  borrower_id         text NOT NULL,         -- Clerk userId
  professional_id     text NOT NULL,         -- Clerk userId
  professional_type   text NOT NULL,         -- 'lo' | 'agent'
  status              text NOT NULL DEFAULT 'active',  -- 'active' | 'contact_shared' | 'closed'
  unread_borrower     integer NOT NULL DEFAULT 0,
  unread_professional integer NOT NULL DEFAULT 0,
  last_message_at     timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Unique thread per borrowerâ†”pro pair (one conversation per relationship)
CREATE UNIQUE INDEX IF NOT EXISTS conversation_threads_pair_idx
  ON public.conversation_threads (borrower_id, professional_id);

-- Messages
CREATE TABLE IF NOT EXISTS public.messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    uuid NOT NULL REFERENCES public.conversation_threads(id) ON DELETE CASCADE,
  sender_role  text NOT NULL,   -- 'borrower' | 'professional'
  content      text NOT NULL,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_thread_id_idx ON public.messages (thread_id, created_at);

-- Contact share log (borrower triggers, records mutual consent)
CREATE TABLE IF NOT EXISTS public.contact_shares (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       uuid NOT NULL REFERENCES public.conversation_threads(id) ON DELETE CASCADE,
  borrower_email  text,
  borrower_phone  text,
  pro_email       text,
  pro_phone       text,
  shared_at       timestamptz NOT NULL DEFAULT now()
);

-- RLS: users can only see threads they are a party to
ALTER TABLE public.conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_shares        ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by API routes via service key)
-- All reads/writes go through server-side API with auth check â€” no client direct access needed
-- 008_referral_privacy.sql
-- Referral firewall: private scenarios are invisible to the board.
-- Only the referring professional can see and respond to their referred borrower's scenario.

-- Track which professional referred each user (set at onboarding)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referred_by text; -- Clerk userId of the referring LO or agent

-- Scenario visibility: 'public' (Match Board) or 'private' (referred pro only)
ALTER TABLE public.scenario_briefs
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS referred_pro_id text; -- Clerk userId of the referring professional (mirrors users.referred_by at post time)

-- Index for fast board lookups (exclude private scenarios efficiently)
CREATE INDEX IF NOT EXISTS scenario_briefs_visibility_idx
  ON public.scenario_briefs (visibility, status);

CREATE INDEX IF NOT EXISTS scenario_briefs_referred_pro_idx
  ON public.scenario_briefs (referred_pro_id)
  WHERE referred_pro_id IS NOT NULL;
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 009_geo_intelligence.sql
-- Geographic intelligence layer: HUD + FEMA data keyed by geography
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

-- ZIP â†’ county â†’ CBSA crosswalk (sourced from HUD USPS crosswalk quarterly)
CREATE TABLE IF NOT EXISTS public.geo_crosswalk (
  zip           text        NOT NULL,
  county_fips   text        NOT NULL,  -- 5-digit FIPS e.g. '12086'
  state_fips    text        NOT NULL,  -- 2-digit FIPS e.g. '12'
  cbsa_code     text,                  -- Core-Based Statistical Area code
  cbsa_name     text,
  county_name   text,
  state_abbr    text,
  res_ratio     numeric,               -- residential address ratio (HUD weight)
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (zip, county_fips)
);

CREATE INDEX IF NOT EXISTS geo_crosswalk_zip_idx ON public.geo_crosswalk (zip);
CREATE INDEX IF NOT EXISTS geo_crosswalk_county_idx ON public.geo_crosswalk (county_fips);

-- HUD Income Limits + Fair Market Rents keyed by county FIPS
-- Source: HUD FY2025 Income Limits + FY2025 Fair Market Rents
CREATE TABLE IF NOT EXISTS public.hud_features (
  county_fips   text        NOT NULL,
  fiscal_year   int         NOT NULL DEFAULT 2025,
  county_name   text,
  state_abbr    text,
  cbsa_code     text,
  -- Area Median Income by household size
  ami_1person   int,
  ami_2person   int,
  ami_3person   int,
  ami_4person   int,
  ami_5person   int,
  -- Key AMI thresholds (4-person household)
  ami_80pct     int,         -- Low Income limit
  ami_50pct     int,         -- Very Low Income limit
  ami_120pct    int,         -- Moderate Income (many DPA programs)
  -- Fair Market Rents by bedroom count
  fmr_0br       int,
  fmr_1br       int,
  fmr_2br       int,
  fmr_3br       int,
  fmr_4br       int,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (county_fips, fiscal_year)
);

CREATE INDEX IF NOT EXISTS hud_features_county_idx ON public.hud_features (county_fips);

-- FEMA National Risk Index keyed by county FIPS
-- Source: FEMA NRI 2024 release
CREATE TABLE IF NOT EXISTS public.fema_risk (
  county_fips        text        NOT NULL PRIMARY KEY,
  county_name        text,
  state_abbr         text,
  -- Composite score 0â€“100
  composite_score    numeric,
  risk_label         text,       -- 'Very Low' | 'Low' | 'Relatively Low' | 'Relatively Moderate' | 'Relatively High' | 'High' | 'Very High'
  -- Individual hazard scores 0â€“100 (null if not applicable)
  hurricane_score    numeric,
  wildfire_score     numeric,
  flood_score        numeric,
  earthquake_score   numeric,
  tornado_score      numeric,
  hail_score         numeric,
  winter_score       numeric,    -- winter weather
  drought_score      numeric,
  heat_score         numeric,    -- extreme heat
  -- Dominant hazard (highest individual score)
  dominant_hazard    text,
  -- Insurance pressure signal derived from composite + hazard mix
  insurance_pressure text,       -- 'low' | 'moderate' | 'elevated' | 'high' | 'very_high'
  insurance_est_low  int,        -- estimated monthly premium delta vs national avg ($)
  insurance_est_high int,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fema_risk_state_idx ON public.fema_risk (state_abbr);
CREATE INDEX IF NOT EXISTS fema_risk_composite_idx ON public.fema_risk (composite_score);

-- Enable RLS (service role bypasses â€” ETL and API use service role)
ALTER TABLE public.geo_crosswalk  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hud_features   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fema_risk      ENABLE ROW LEVEL SECURITY;

-- Public read â€” these are public government datasets
CREATE POLICY "public_read_geo_crosswalk"
  ON public.geo_crosswalk FOR SELECT USING (true);

CREATE POLICY "public_read_hud_features"
  ON public.hud_features FOR SELECT USING (true);

CREATE POLICY "public_read_fema_risk"
  ON public.fema_risk FOR SELECT USING (true);
-- ============================================================
-- 010_lo_profile_card.sql
-- Add professional card fields to loan_officers and agents
-- so the contact share email can render a full signature card.
-- ============================================================

ALTER TABLE public.loan_officers
  ADD COLUMN IF NOT EXISTS title          text,   -- e.g. "Senior Loan Officer"
  ADD COLUMN IF NOT EXISTS bio            text,   -- short personal statement (â‰¤280 chars)
  ADD COLUMN IF NOT EXISTS phone          text,   -- professional phone
  ADD COLUMN IF NOT EXISTS website        text,   -- personal or company site / LinkedIn
  ADD COLUMN IF NOT EXISTS office_address text;   -- company / branch address

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS title          text,
  ADD COLUMN IF NOT EXISTS bio            text,
  ADD COLUMN IF NOT EXISTS phone          text,
  ADD COLUMN IF NOT EXISTS website        text,
  ADD COLUMN IF NOT EXISTS office_address text;
-- ============================================================
-- 011_pro_directory.sql
-- Public professional directory â€” seeded from NMLS and CA DRE
-- public records. Records exist before anyone signs up.
-- A claimed_by field links to a Clerk user_id when a pro
-- creates an account and claims their listing.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pro_directory (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- â”€â”€ Source identification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  source          text        NOT NULL,   -- 'nmls' | 'ca_dre'
  source_id       text        NOT NULL,   -- NMLS ID or DRE license number (as string)
  pro_type        text        NOT NULL,   -- 'lo' | 'lo_company' | 'agent' | 'agent_broker'

  -- â”€â”€ Public data (from seed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  name            text        NOT NULL,   -- full name or company name
  company_name    text,                   -- employer / parent brokerage (individuals only)
  city            text,
  state           text        NOT NULL DEFAULT 'CA',
  zip             text,
  license_type    text,                   -- e.g. "Mortgage Loan Originator", "Real Estate Salesperson"
  license_status  text,                   -- "Active", "Inactive", "Expired"

  -- â”€â”€ Claim state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  claimed_by      text,                   -- Clerk user_id (null = unclaimed)
  claimed_at      timestamptz,

  -- â”€â”€ Profile enrichment (populated after claiming) â”€â”€â”€â”€â”€â”€â”€â”€â”€
  bio             text,
  phone           text,
  website         text,
  photo_url       text,

  -- â”€â”€ Sync metadata â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  seeded_at       timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),

  UNIQUE(source, source_id)
);

-- â”€â”€ Indexes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE INDEX IF NOT EXISTS idx_pro_dir_type_state
  ON public.pro_directory (pro_type, state);

CREATE INDEX IF NOT EXISTS idx_pro_dir_city
  ON public.pro_directory (state, city);

CREATE INDEX IF NOT EXISTS idx_pro_dir_claimed
  ON public.pro_directory (claimed_by)
  WHERE claimed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pro_dir_source_id
  ON public.pro_directory (source, source_id);

-- Full-text search index on name + company
CREATE INDEX IF NOT EXISTS idx_pro_dir_name_fts
  ON public.pro_directory USING gin(to_tsvector('english', coalesce(name, '') || ' ' || coalesce(company_name, '')));

-- â”€â”€ updated_at trigger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TRIGGER pro_directory_updated_at
  BEFORE UPDATE ON public.pro_directory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- â”€â”€ RLS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE public.pro_directory ENABLE ROW LEVEL SECURITY;

-- Anyone can read the directory (it's public record data)
CREATE POLICY "pro_dir: public read"
  ON public.pro_directory FOR SELECT
  USING (true);

-- Only the claiming user can update their own record's enrichment fields
CREATE POLICY "pro_dir: owner update"
  ON public.pro_directory FOR UPDATE
  USING (claimed_by = auth.uid()::text);
-- ============================================================
-- 012_pro_directory_self_register.sql
-- Allow pros to self-register in the directory without needing
-- a pre-seeded record. source='self', source_id=clerk_user_id.
-- ============================================================

-- RLS: allow a signed-in user to insert their own listing
-- (They set claimed_by = their own user_id in the row)
CREATE POLICY "pro_dir: self insert"
  ON public.pro_directory FOR INSERT
  WITH CHECK (claimed_by = auth.uid()::text);
-- ============================================================
-- 013_admin_role.sql
-- Adds is_admin flag to users table.
-- Admin users can read all pro_directory rows and activity logs.
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Admin activity log â€” every claim, register, or removal gets a row
CREATE TABLE IF NOT EXISTS public.admin_activity_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  actor_id    text        NOT NULL,  -- Clerk user_id who took the action
  action      text        NOT NULL,  -- 'claim' | 'register' | 'unclaim' | 'flag' | 'restore' | 'etl_seed'
  target_id   uuid,                  -- pro_directory.id
  target_name text,                  -- snapshot of pro name at time of action
  notes       text                   -- optional admin notes
);

CREATE INDEX IF NOT EXISTS idx_admin_log_created
  ON public.admin_activity_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_log_actor
  ON public.admin_activity_log (actor_id);

-- RLS: only admins can read the log; service role writes it
ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_log: admin read"
  ON public.admin_activity_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()::text AND is_admin = true
    )
  );
-- ============================================================
-- 014_pro_invitations.sql
-- Pro directory invitation system.
-- Allows platform users (LOs, admins) to invite unclaimed pros
-- to join and claim their listing.
-- Also adds email + invited_at to pro_directory for future
-- bulk email import merge.
-- ============================================================

-- â”€â”€ Add email + invited_at to pro_directory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE public.pro_directory
  ADD COLUMN IF NOT EXISTS email       text,
  ADD COLUMN IF NOT EXISTS invited_at  timestamptz;

-- â”€â”€ Pro invitations log â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.pro_invitations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_dir_id   uuid        NOT NULL REFERENCES public.pro_directory(id) ON DELETE CASCADE,
  email        text        NOT NULL,
  invited_by   text        NOT NULL,        -- Clerk user_id of sender
  token        text        UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  accepted_at  timestamptz,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pro_inv_pro    ON public.pro_invitations (pro_dir_id);
CREATE INDEX IF NOT EXISTS idx_pro_inv_email  ON public.pro_invitations (email);
CREATE INDEX IF NOT EXISTS idx_pro_inv_sender ON public.pro_invitations (invited_by);

ALTER TABLE public.pro_invitations ENABLE ROW LEVEL SECURITY;

-- Sender can see their own invites; service role (ETL/admin) bypasses RLS
CREATE POLICY "pro_inv: sender read"
  ON public.pro_invitations FOR SELECT
  USING (invited_by = auth.uid()::text);

CREATE POLICY "pro_inv: sender insert"
  ON public.pro_invitations FOR INSERT
  WITH CHECK (invited_by = auth.uid()::text);
-- 015_referral_codes_and_founding.sql
-- 1. Short referral codes on users table (used for /r/[slug] links)
-- 2. Founding member badge on loan_officers and agents

-- â”€â”€ 1. Referral codes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referral_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code
  ON public.users (referral_code)
  WHERE referral_code IS NOT NULL;

-- â”€â”€ 2. Founding member badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE public.loan_officers
  ADD COLUMN IF NOT EXISTS is_founding_member BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS is_founding_member BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: everyone currently registered gets founding status
-- (We are well under 500; runtime check in onboarding/setup handles the cap going forward)
UPDATE public.loan_officers SET is_founding_member = TRUE WHERE is_founding_member = FALSE;
UPDATE public.agents         SET is_founding_member = TRUE WHERE is_founding_member = FALSE;
-- 016_brokerage_teams.sql
-- Brokerage team tables: brokerages, brokerage_members, and FK on loan_officers

-- â”€â”€ 1. Brokerages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.brokerages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  owner_user_id  TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invite_token   TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brokerages_invite_token
  ON public.brokerages (invite_token);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brokerages_owner
  ON public.brokerages (owner_user_id);

-- â”€â”€ 2. Members â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.brokerage_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brokerage_id  UUID NOT NULL REFERENCES public.brokerages(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member',   -- 'owner' | 'member'
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brokerage_id, user_id)
);

-- â”€â”€ 3. FK on loan_officers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE public.loan_officers
  ADD COLUMN IF NOT EXISTS brokerage_id UUID REFERENCES public.brokerages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lo_brokerage_id
  ON public.loan_officers (brokerage_id)
  WHERE brokerage_id IS NOT NULL;
-- 017_pro_waitlist.sql
-- Founding 500 waitlist for LOs and agents
-- Position is raw insert order; effective sort = position - referral_points (Phase 2)

CREATE TABLE IF NOT EXISTS public.pro_waitlist (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT        NOT NULL,
  full_name           TEXT        NOT NULL,
  pro_type            TEXT        NOT NULL CHECK (pro_type IN ('lo', 'agent')),
  state               TEXT        NOT NULL,
  nmls                TEXT,                    -- LOs
  license_number      TEXT,                    -- agents
  brokerage           TEXT,
  referred_by_user_id TEXT,                    -- user_id of referring founding member
  referral_points     INTEGER     NOT NULL DEFAULT 0,
  position            INTEGER     NOT NULL,    -- raw insert order (1-based)
  status              TEXT        NOT NULL DEFAULT 'waiting'
                                  CHECK (status IN ('waiting', 'invited', 'joined', 'expired')),
  invited_at          TIMESTAMPTZ,
  invite_expires_at   TIMESTAMPTZ,             -- invited_at + 72h
  joined_at           TIMESTAMPTZ,             -- set when they complete onboarding
  founding_number     INTEGER,                 -- assigned on join (their Founding Member #)
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email)
);

-- Efficient queries: invite wave (top N waiting), admin list by status
CREATE INDEX IF NOT EXISTS idx_pro_waitlist_status_position
  ON public.pro_waitlist (status, position);

CREATE INDEX IF NOT EXISTS idx_pro_waitlist_email
  ON public.pro_waitlist (email);

-- Track founding numbers separately so gaps don't occur if someone expires
CREATE SEQUENCE IF NOT EXISTS founding_number_seq START 1;
-- Migration 018: add user_id to borrowers
-- Links a borrower row to their Clerk account once they sign up via invite link.
-- Allows LO to gift credits and detect signed-up status.

ALTER TABLE public.borrowers
  ADD COLUMN IF NOT EXISTS user_id text;

-- Index for quick lookup by Clerk user_id
CREATE INDEX IF NOT EXISTS idx_borrowers_user_id ON public.borrowers (user_id);
-- Migration 019: email suppression list (CAN-SPAM compliance)
-- Stores emails that have unsubscribed from outbound LO marketing emails.
-- All outbound sends must check this table before sending.

CREATE TABLE IF NOT EXISTS public.email_suppression (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        NOT NULL,
  source     text        NOT NULL DEFAULT 'unsubscribe', -- 'unsubscribe' | 'bounce' | 'complaint'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive unique index â€” one row per email
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_suppression_email
  ON public.email_suppression (lower(email));

-- Fast lookup before every send
CREATE INDEX IF NOT EXISTS idx_email_suppression_created
  ON public.email_suppression (created_at DESC);
-- Migration 020: newsletter_subscribers
-- Stores emails from article page newsletter capture CTAs.
-- Separate from email_suppression â€” this is opt-in, not opt-out.

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL UNIQUE,
  source      text        NOT NULL DEFAULT 'article', -- 'article', 'market-news', 'knowledge-hub'
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: only service role can read/write (no public access)
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
-- 021_brokerage_org_type.sql
-- Add org_type and website to brokerages table.
-- org_type: 'brokerage' | 'lender' | 'credit_union' | 're_brokerage'

ALTER TABLE public.brokerages
  ADD COLUMN IF NOT EXISTS org_type TEXT NOT NULL DEFAULT 'brokerage',
  ADD COLUMN IF NOT EXISTS website  TEXT;
-- 022_corporate_invitations.sql
-- Enterprise onboarding: admin-sent corporate invitations + pro org nominations
-- Also adds admin_invited + compliance fields to brokerages.

-- â”€â”€ 1. Corporate invitations (admin â†’ org) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.corporate_invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name        TEXT NOT NULL,
  org_type        TEXT NOT NULL DEFAULT 'brokerage',
  contact_name    TEXT,
  contact_email   TEXT NOT NULL,
  invited_by      TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  token           TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined
  notes           TEXT,
  brokerage_id    UUID REFERENCES public.brokerages(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_corp_inv_token
  ON public.corporate_invitations (token);
CREATE INDEX IF NOT EXISTS idx_corp_inv_email
  ON public.corporate_invitations (lower(contact_email));
ALTER TABLE public.corporate_invitations ENABLE ROW LEVEL SECURITY;

-- â”€â”€ 2. Org nominations (pro â†’ nominates their employer) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.org_nominations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nominated_by    TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  org_name        TEXT NOT NULL,
  org_type        TEXT NOT NULL DEFAULT 'brokerage',
  contact_email   TEXT,
  website         TEXT,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | contacted | converted | dismissed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.org_nominations ENABLE ROW LEVEL SECURITY;

-- â”€â”€ 3. Enrich brokerages with admin-invite + compliance flag â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE public.brokerages
  ADD COLUMN IF NOT EXISTS admin_invited        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS compliance_accepted_at TIMESTAMPTZ;
-- Migration 023: newsletter_sends
-- Tracks each weekly market update batch send.

CREATE TABLE IF NOT EXISTS public.newsletter_sends (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_at      timestamptz NOT NULL DEFAULT now(),
  subject      text        NOT NULL,
  recipient_count int      NOT NULL DEFAULT 0,
  skipped_count   int      NOT NULL DEFAULT 0,  -- suppressed / already sent this week
  error_count     int      NOT NULL DEFAULT 0,
  resend_batch_id text,
  notes        text
);
-- Migration 024: homeowner loan detail overrides
-- Lets homeowners (or LOs) store their actual loan numbers so the
-- analysis cards and digest show real data instead of AVM estimates.

ALTER TABLE public.consumer_homeowners
  ADD COLUMN IF NOT EXISTS actual_balance       numeric,        -- remaining loan balance ($)
  ADD COLUMN IF NOT EXISTS actual_rate          numeric,        -- current interest rate (%)
  ADD COLUMN IF NOT EXISTS actual_purchase_price numeric,       -- what they paid
  ADD COLUMN IF NOT EXISTS actual_purchase_date  date;          -- close date
-- Migration 025: borrower loan detail overrides (LO-side)
-- Mirrors the same 4 fields on consumer_homeowners (migration 024).
-- Lets the LO store the borrower's actual loan numbers so digests show
-- real data instead of Rentcast/historical estimates.

ALTER TABLE public.borrowers
  ADD COLUMN IF NOT EXISTS actual_balance        numeric,        -- remaining loan balance ($)
  ADD COLUMN IF NOT EXISTS actual_rate           numeric,        -- current interest rate (%)
  ADD COLUMN IF NOT EXISTS actual_purchase_price numeric,        -- what they paid
  ADD COLUMN IF NOT EXISTS actual_purchase_date  date;           -- close date
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
-- Migration 027: grace_queries for credit-gate soft enforcement
-- Free users get 3 grace messages after credits hit 0, then hard block.
-- grace_queries resets monthly because it lives in usage_monthly (keyed by month).

ALTER TABLE public.usage_monthly
  ADD COLUMN IF NOT EXISTS grace_queries integer NOT NULL DEFAULT 0;

-- Atomic increment + read for grace_queries.
-- Returns the NEW value after incrementing.
-- INSERT on first use, UPDATE on subsequent calls.
CREATE OR REPLACE FUNCTION public.increment_grace(p_user_id text, p_month text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_new integer;
BEGIN
  INSERT INTO public.usage_monthly (user_id, month, grace_queries)
  VALUES (p_user_id, p_month, 1)
  ON CONFLICT (user_id, month)
  DO UPDATE SET grace_queries = public.usage_monthly.grace_queries + 1
  RETURNING public.usage_monthly.grace_queries INTO v_new;
  RETURN v_new;
END;
$$;
-- migration 028: system_flags
-- Generic key-value store for one-time system events (e.g. founding milestone blasts).
-- PRIMARY KEY on key ensures atomic dedup via INSERT (unique violation = already fired).

CREATE TABLE IF NOT EXISTS system_flags (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- 029_borrower_reports.sql
-- Shareable branded property intelligence report tokens

CREATE TABLE IF NOT EXISTS public.borrower_reports (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token         text UNIQUE NOT NULL,
    borrower_id   uuid NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
    lo_id         uuid NOT NULL REFERENCES public.loan_officers(id) ON DELETE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS borrower_reports_token_idx ON public.borrower_reports(token);
CREATE INDEX IF NOT EXISTS borrower_reports_borrower_idx ON public.borrower_reports(borrower_id);
-- Daily FRED mortgage rate snapshots â€” used to detect rate moves and trigger rate-alert digests
CREATE TABLE IF NOT EXISTS public.rate_snapshots (
    snapshot_date date PRIMARY KEY,
    rate          numeric(6,3) NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);
-- Migration 031: canonical properties table
-- One shared record per property address across all users.
-- This is the anchor for all property intelligence, enrichment, and caching.
-- Users are linked to this via consumer_homeowner_properties.property_id (migration 033).

CREATE TABLE IF NOT EXISTS public.properties (
  id                     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Normalized address (full is the unique key)
  address_full           text         NOT NULL,   -- "8 Peachtree, Coto De Caza, CA 92679"
  address_line           text,                    -- "8 Peachtree"
  city                   text,
  state                  char(2),
  zip                    text,
  county                 text,

  -- Physical attributes from enrichment
  beds                   smallint,
  baths                  numeric(4,1),
  sqft                   integer,
  year_built             smallint,
  property_type          text,                    -- 'single_family','condo','multi_family','townhouse'

  -- Location
  lat                    numeric(9,6),
  lng                    numeric(9,6),
  apn                    text,

  -- Latest known valuations (denormalized for fast reads â€” kept in sync by snapshot upsert)
  latest_value           numeric,
  latest_value_low       numeric,
  latest_value_high      numeric,
  latest_rent            numeric,
  latest_last_sale_price numeric,
  latest_last_sale_date  date,
  latest_listing_status  text,

  -- Freshness and confidence
  enriched_at            timestamptz,             -- when last successfully enriched
  enrichment_source      text,                    -- 'rentcast','tavily','manual'
  confidence             numeric(3,2),            -- 0.00â€“1.00

  created_at             timestamptz  NOT NULL DEFAULT now(),
  updated_at             timestamptz  NOT NULL DEFAULT now(),

  UNIQUE (address_full)
);

CREATE INDEX IF NOT EXISTS properties_zip_idx   ON public.properties (zip);
CREATE INDEX IF NOT EXISTS properties_state_idx ON public.properties (state);
-- Migration 032: property snapshots â€” cached intelligence by type
-- Each row is a point-in-time enrichment result for a property.
-- Avoids re-querying Rentcast for the same property within the TTL window.
--
-- snapshot_type values:
--   'full'       â€” complete Rentcast property + AVM + listing response
--   'valuation'  â€” AVM value/range only
--   'rent'       â€” rent estimate only
--   'market'     â€” market context (zip/county level)
--
-- TTL strategy:
--   Rentcast 'full' snapshots: expires_at = fetched_at + 7 days
--   Manual overrides:          expires_at = NULL (never expires)

CREATE TABLE IF NOT EXISTS public.property_snapshots (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid         NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  snapshot_type text         NOT NULL,
  source        text         NOT NULL,   -- 'rentcast','tavily','internal','manual'
  data          jsonb        NOT NULL,   -- full raw payload from the source
  fetched_at    timestamptz  NOT NULL DEFAULT now(),
  expires_at    timestamptz,             -- NULL = never expires
  confidence    numeric(3,2),
  created_at    timestamptz  NOT NULL DEFAULT now()
);

-- Fast lookup: latest valid snapshot of a given type for a property
CREATE INDEX IF NOT EXISTS property_snapshots_lookup_idx
  ON public.property_snapshots (property_id, snapshot_type, fetched_at DESC);
-- Migration 033: link consumer_homeowner_properties â†’ canonical properties
-- Adds property_id FK so each saved home resolves to the shared canonical record.
-- Column is nullable to allow backfill without breaking existing rows.

ALTER TABLE public.consumer_homeowner_properties
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id);

CREATE INDEX IF NOT EXISTS chp_property_id_idx
  ON public.consumer_homeowner_properties (property_id);
-- Migration 034: actual_value override for consumer_homeowner_properties
-- Allows LOs and borrowers to enter a verified appraised value or last known
-- good valuation, replacing the Rentcast AVM estimate in all calculations.

ALTER TABLE public.consumer_homeowner_properties
  ADD COLUMN IF NOT EXISTS actual_value numeric;

-- Same pattern as actual_balance, actual_rate, actual_purchase_price.
-- NULL = use Rentcast estimate. Set = use this value as authoritative.
-- Migration 035: actual_value override for borrowers table
-- Mirrors the same field on consumer_homeowner_properties.
-- NULL = use Rentcast AVM. Set = authoritative verified/appraised value.

ALTER TABLE public.borrowers
  ADD COLUMN IF NOT EXISTS actual_value numeric;
-- 036_homeowner_rate_alerts.sql
-- Consumer-side rate alerts: homeowner sets a threshold, gets emailed when 30Y drops to it.

CREATE TABLE IF NOT EXISTS public.homeowner_rate_alerts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text NOT NULL,
  property_id    uuid REFERENCES public.consumer_homeowner_properties(id) ON DELETE CASCADE,
  property_address text,
  email          text NOT NULL,
  threshold_rate numeric(5,3) NOT NULL,
  active         boolean DEFAULT true NOT NULL,
  created_at     timestamptz DEFAULT now(),
  triggered_at   timestamptz,
  UNIQUE(user_id, property_id)
);

CREATE INDEX IF NOT EXISTS homeowner_rate_alerts_active_idx
  ON public.homeowner_rate_alerts(active, threshold_rate)
  WHERE active = true;
-- Add agent_id FK to borrowers table for agent portal support
ALTER TABLE borrowers ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agents(id);
CREATE INDEX IF NOT EXISTS borrowers_agent_id_idx ON borrowers(agent_id);
-- Allow agent-owned borrowers: loan_officer_id is null when agent_id is set
ALTER TABLE borrowers ALTER COLUMN loan_officer_id DROP NOT NULL;
-- Allow agents to generate borrower reports
ALTER TABLE public.borrower_reports ALTER COLUMN lo_id DROP NOT NULL;
ALTER TABLE public.borrower_reports ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.agents(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS borrower_reports_agent_idx ON public.borrower_reports(agent_id);
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
-- 041_deal_rooms.sql
-- AI-powered Deal Room: multi-party (buyer + LO + agent) transaction workspace

-- Core room record â€” one per property transaction
CREATE TABLE IF NOT EXISTS public.deal_rooms (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by        text NOT NULL,                              -- Clerk user_id of creator (LO or agent)
  property_address  text NOT NULL,
  property_data     jsonb,                                      -- snapshot from property/lookup at room creation
  status            text NOT NULL DEFAULT 'shopping'
                    CHECK (status IN ('shopping','offer','contract','processing','closed','cancelled')),
  offer_price       numeric(12,2),
  target_close_date date,
  created_at        timestamptz DEFAULT now() NOT NULL,
  updated_at        timestamptz DEFAULT now() NOT NULL
);

-- Members: buyer / lo / agent â€” one row per participant
CREATE TABLE IF NOT EXISTS public.deal_room_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_room_id  uuid NOT NULL REFERENCES public.deal_rooms(id) ON DELETE CASCADE,
  user_id       text,                                           -- null until invite accepted
  role          text NOT NULL CHECK (role IN ('buyer','lo','agent')),
  display_name  text,
  email         text,
  invite_token  text UNIQUE DEFAULT gen_random_uuid()::text,
  invited_at    timestamptz DEFAULT now() NOT NULL,
  joined_at     timestamptz,
  UNIQUE (deal_room_id, role)                                  -- one of each role per room
);

-- Milestone timeline â€” pre-seeded on room creation, updated as deal progresses
CREATE TABLE IF NOT EXISTS public.deal_room_milestones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_room_id  uuid NOT NULL REFERENCES public.deal_rooms(id) ON DELETE CASCADE,
  milestone_key text NOT NULL,                                  -- e.g. 'preapproval', 'offer_submitted'
  label         text NOT NULL,
  stage         text NOT NULL CHECK (stage IN ('shopping','offer','contract','processing','closed')),
  sort_order    int NOT NULL DEFAULT 0,
  target_date   date,
  completed_at  timestamptz,
  completed_by  text,                                           -- Clerk user_id
  ai_note       text,                                           -- AI-generated context note
  UNIQUE (deal_room_id, milestone_key)
);

-- Room-scoped message thread (separate from main messaging system)
CREATE TABLE IF NOT EXISTS public.deal_room_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_room_id  uuid NOT NULL REFERENCES public.deal_rooms(id) ON DELETE CASCADE,
  sender_id     text NOT NULL,                                  -- Clerk user_id
  sender_role   text NOT NULL CHECK (sender_role IN ('buyer','lo','agent','system')),
  sender_name   text,
  content       text NOT NULL,
  created_at    timestamptz DEFAULT now() NOT NULL
);

-- Saved offer scenarios â€” any party can model offers, all parties see them
CREATE TABLE IF NOT EXISTS public.deal_room_scenarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_room_id  uuid NOT NULL REFERENCES public.deal_rooms(id) ON DELETE CASCADE,
  created_by    text NOT NULL,
  created_by_role text NOT NULL,
  label         text,                                           -- e.g. "Offer at $750k", "Counter at $780k"
  offer_price   numeric(12,2),
  down_pct      numeric(5,2),
  loan_type     text,
  rate          numeric(5,3),
  piti          numeric(10,2),
  result_json   jsonb,
  created_at    timestamptz DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS deal_rooms_created_by_idx ON public.deal_rooms(created_by);
CREATE INDEX IF NOT EXISTS deal_room_members_user_id_idx ON public.deal_room_members(user_id);
CREATE INDEX IF NOT EXISTS deal_room_members_token_idx ON public.deal_room_members(invite_token);
CREATE INDEX IF NOT EXISTS deal_room_messages_room_idx ON public.deal_room_messages(deal_room_id, created_at);
CREATE INDEX IF NOT EXISTS deal_room_milestones_room_idx ON public.deal_room_milestones(deal_room_id, sort_order);

-- RLS
ALTER TABLE public.deal_rooms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_room_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_room_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_room_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_room_scenarios ENABLE ROW LEVEL SECURITY;

-- Service role bypasses all RLS (API routes use service role key)
CREATE POLICY "service_role_all_deal_rooms"          ON public.deal_rooms          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_deal_room_members"   ON public.deal_room_members   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_deal_room_milestones" ON public.deal_room_milestones FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_deal_room_messages"  ON public.deal_room_messages  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_deal_room_scenarios" ON public.deal_room_scenarios FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Add buyer-controlled financial sharing permission to deal_rooms
ALTER TABLE deal_rooms
  ADD COLUMN IF NOT EXISTS share_financials BOOLEAN NOT NULL DEFAULT FALSE;
-- 043: track last time each member read deal room messages
ALTER TABLE deal_room_members
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;
-- 044_discover_sessions.sql
-- Discover sessions â€” anonymous by design.
-- Stores scenario benchmarks + lender responses + gap analysis.
-- NO user_id. Thread linkage is operational only; analysis strips all identifiers.

CREATE TABLE IF NOT EXISTS discover_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       UUID REFERENCES conversation_threads(id) ON DELETE SET NULL,
  loan_type       TEXT NOT NULL CHECK (loan_type IN ('fha','conventional','va','jumbo','dscr')),
  scenario_snapshot JSONB NOT NULL,   -- numbers only: price, loanAmount, rate, downPct, term, ltv, monthlyPayment, etc.
  lender_responses  JSONB NOT NULL DEFAULT '{}', -- { [questionId]: { raw: string, evaluated_at: iso } }
  gap_analysis      JSONB NOT NULL DEFAULT '{}', -- { [questionId]: { status: match|check|alert, note: string } }
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','complete','expired')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION update_discover_session_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_discover_sessions_updated
  BEFORE UPDATE ON discover_sessions
  FOR EACH ROW EXECUTE FUNCTION update_discover_session_timestamp();

-- Metadata column on messages â€” enables discover question type rendering in PE thread
ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- Index for thread lookup (show all discover sessions for a thread)
CREATE INDEX IF NOT EXISTS idx_discover_sessions_thread ON discover_sessions(thread_id) WHERE thread_id IS NOT NULL;

-- RLS: sessions are anonymous â€” no row-level filtering by user
-- API routes handle auth at the application layer
ALTER TABLE discover_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON discover_sessions
  FOR ALL USING (true) WITH CHECK (true);
-- 045_scenario_posted_by_role.sql
-- Tracks whether a scenario was posted by the buyer themselves or by an agent on behalf of a client.
-- Defaults to 'borrower' so all existing rows are unaffected.

ALTER TABLE scenario_briefs
  ADD COLUMN IF NOT EXISTS posted_by_role VARCHAR(16) NOT NULL DEFAULT 'borrower'
  CHECK (posted_by_role IN ('borrower', 'agent'));
-- 046_grok_property_cache.sql
-- Stores Grok property intelligence results keyed by normalized address.
-- Populated by background prefetch on check-property and my-home address entry.
-- Consumed by the Property Intelligence Card for instant (zero-wait) rendering.

CREATE TABLE IF NOT EXISTS grok_property_cache (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  address_normalized TEXT        NOT NULL UNIQUE,
  address_raw        TEXT        NOT NULL,
  grok_result        JSONB       NOT NULL,
  model              TEXT        NOT NULL DEFAULT 'grok-4',
  fetched_at         TIMESTAMPTZ NOT NULL,
  expires_at         TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS grok_property_cache_address_idx  ON grok_property_cache (address_normalized);
CREATE INDEX IF NOT EXISTS grok_property_cache_expires_idx  ON grok_property_cache (expires_at);

-- Service role can read/write; no RLS needed (no user PII stored)
ALTER TABLE grok_property_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON grok_property_cache
  USING (true) WITH CHECK (true);
-- 047_buyer_session_unique_address.sql
-- Enforce DB-level uniqueness on (user_id, property_address).
-- The API already does an application-level upsert by address; this makes it
-- a hard constraint so no duplicate sessions can ever exist for the same user + property.
-- Only applies to rows WITH an address (address-less scenario sessions are still allowed).

CREATE UNIQUE INDEX IF NOT EXISTS buyer_evaluation_sessions_user_address_unique
  ON buyer_evaluation_sessions (user_id, property_address)
  WHERE property_address IS NOT NULL;
-- 048_scenario_briefs_track5.sql
-- Extend scenario_briefs to support Track 5 score-driven match requests.
-- Track5 briefs are anonymous (zip_only) until the borrower accepts a pro response,
-- at which point share_level flips to 'full_address' and the property address is revealed.

ALTER TABLE public.scenario_briefs
  ADD COLUMN IF NOT EXISTS session_id      uuid REFERENCES public.buyer_evaluation_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS property_zip    text,          -- ZIP extracted from property_address (shared at match time)
  ADD COLUMN IF NOT EXISTS share_level     text NOT NULL DEFAULT 'zip_only',   -- 'zip_only' | 'full_address'
  ADD COLUMN IF NOT EXISTS composite_score integer,       -- Track 5 composite (0â€“100)
  ADD COLUMN IF NOT EXISTS verdict_label   text,          -- 'Strong Buy' | 'Ready to Offer' | etc.
  ADD COLUMN IF NOT EXISTS from_track5     boolean NOT NULL DEFAULT false;     -- distinguishes Track5 briefs from form briefs

-- Fast lookup: find all briefs linked to a given evaluation session
CREATE INDEX IF NOT EXISTS scenario_briefs_session_id_idx
  ON public.scenario_briefs (session_id)
  WHERE session_id IS NOT NULL;

-- Prevent duplicate Track5 match requests for the same session
CREATE UNIQUE INDEX IF NOT EXISTS scenario_briefs_session_unique
  ON public.scenario_briefs (session_id)
  WHERE session_id IS NOT NULL AND from_track5 = true;
-- 049_portfolio_items.sql
-- Generic living portfolio â€” persists any built card/journey as a sidebar thumbnail.
-- One row per user per item. Items are upserted on card completion, never deleted by the app.

CREATE TABLE IF NOT EXISTS portfolio_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT        NOT NULL,           -- Clerk user_id
  type            TEXT        NOT NULL,           -- 'buyer_journey' | 'snapshot' | 'lo_scenario' | 'comparison'
  title           TEXT,                           -- display label e.g. "4521 Maple Ave"
  address         TEXT,                           -- normalised address (for dedup)
  photo_url       TEXT,                           -- ssl.cdn-redfin.com only
  data            JSONB       NOT NULL DEFAULT '{}',  -- full card payload / stage scores
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- One item per user + type + address (address may be null for non-property items â€” use id bucket)
CREATE UNIQUE INDEX IF NOT EXISTS portfolio_items_user_type_address
  ON portfolio_items (user_id, type, lower(address))
  WHERE address IS NOT NULL;

-- Fast fetch: all items for a user ordered by last accessed
CREATE INDEX IF NOT EXISTS portfolio_items_user_accessed
  ON portfolio_items (user_id, last_accessed_at DESC);

-- RLS: users can only see their own items
ALTER TABLE portfolio_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolio_items_own" ON portfolio_items
  FOR ALL USING (auth.uid()::text = user_id);

-- Service-role bypass (server-side upserts)
CREATE POLICY "portfolio_items_service" ON portfolio_items
  FOR ALL TO service_role USING (true);
-- 050_featured_properties.sql
-- Shared property intelligence cache + discovery feed.
-- One row per property (unique on address_norm).
-- Populated two ways:
--   1. User-generated: after any DSC completes, scores + raw Grok fields saved here.
--   2. Bulk import: title rep data seeded via service_role INSERT (beds/baths/price pre-filled,
--      scores computed on first user lookup then cached here forever).
--
-- Cache-hit path: before running Grok deep analysis, client checks this table.
-- If raw_data is present, scores are reconstructed locally â€” zero API cost.

CREATE TABLE IF NOT EXISTS featured_properties (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  address           TEXT        NOT NULL,
  address_norm      TEXT        NOT NULL,              -- lower(trim(address)) â€” unique lookup key
  city              TEXT,
  state_code        TEXT,
  zip               TEXT,

  -- Property details (populated from Redfin or title import)
  photo_url         TEXT,
  price             NUMERIC,
  beds              SMALLINT,
  baths             NUMERIC,
  sqft              INTEGER,
  year_built        SMALLINT,
  property_type     TEXT,

  -- Track 5 Decision Score cache (L2-L4 only â€” L1 is always user-specific)
  l2_score          SMALLINT,
  l2_summary        TEXT,
  l3_score          SMALLINT,
  l3_summary        TEXT,
  l4_score          SMALLINT,
  l4_summary        TEXT,
  composite_score   SMALLINT,   -- L2/L3/L4 composite (excludes L1 â€” shown on discovery feed)

  -- Raw Grok fields for cache-hit replay (mirrors deepResult shape in page.tsx)
  -- Subset needed: zillow_estimate, redfin_estimate, market_median_price,
  -- comparable_sales, market_median_dom, market_sale_to_list,
  -- location_intelligence, school_score, walk_score
  raw_data          JSONB,

  -- Discovery signals
  search_count      INTEGER     NOT NULL DEFAULT 0,    -- incremented on every cache-hit lookup
  is_featured       BOOLEAN     NOT NULL DEFAULT false, -- curated/pinned on discovery pages
  source            TEXT        NOT NULL DEFAULT 'user_generated',
                                                       -- 'user_generated' | 'manual' | 'title_import'

  -- Timestamps
  score_computed_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique lookup by normalized address
CREATE UNIQUE INDEX IF NOT EXISTS featured_properties_addr_norm
  ON featured_properties (address_norm);

-- Discovery feed indexes
CREATE INDEX IF NOT EXISTS featured_properties_city_zip
  ON featured_properties (city, zip);
CREATE INDEX IF NOT EXISTS featured_properties_search_count
  ON featured_properties (search_count DESC);
CREATE INDEX IF NOT EXISTS featured_properties_featured
  ON featured_properties (is_featured)
  WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS featured_properties_composite
  ON featured_properties (composite_score DESC NULLS LAST)
  WHERE composite_score IS NOT NULL;

-- RLS: public read (no PII â€” used for discovery feed + cache checks)
--      service_role write (user writes go through API which uses service role)
ALTER TABLE featured_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "featured_properties_public_read" ON featured_properties
  FOR SELECT USING (true);

CREATE POLICY "featured_properties_service_write" ON featured_properties
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Atomic search_count increment (avoids read-modify-write race condition)
CREATE OR REPLACE FUNCTION increment_search_count(row_id UUID)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE featured_properties
  SET    search_count = search_count + 1,
         updated_at   = NOW()
  WHERE  id = row_id;
$$;
-- Migration 051: add messages column to portfolio_items
-- Stores the full chat message array for a buyer journey so Resume can restore the original thread.

ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS messages JSONB;
-- 052_company_pilots.sql
-- Company-level pilot links for CEO/owner direct outreach.

create table if not exists company_pilots (
  id                uuid        primary key default gen_random_uuid(),
  company_name      text        not null,
  slug              text        not null unique,
  contact_name      text,
  contact_email     text,
  credits_per_lo    integer     not null default 1000,
  is_active         boolean     not null default true,
  notes             text,
  created_at        timestamptz not null default now()
);

alter table loan_officers
  add column if not exists company_pilot_id uuid references company_pilots(id);

create index if not exists company_pilots_slug_idx on company_pilots(slug);
create index if not exists loan_officers_pilot_idx on loan_officers(company_pilot_id);
-- Migration 053: track when a pilot invite email was sent
alter table company_pilots add column if not exists invite_sent_at timestamptz;
-- 054_agent_pilots.sql
alter table company_pilots
  add column if not exists pilot_type text not null default 'lo';

alter table company_pilots
  drop constraint if exists company_pilots_slug_key;

alter table company_pilots
  add constraint if not exists company_pilots_slug_type_key unique (slug, pilot_type);

create index if not exists company_pilots_type_idx on company_pilots(pilot_type);
-- 055_marketplace_lenders.sql
-- Anonymous rate marketplace.

create table if not exists marketplace_lenders (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  lender_name             text not null,
  nmls_number             text,
  contact_email           text not null,
  contact_name            text,
  margin_over_par         numeric(5,3) not null,
  loan_types              text[] not null default array['conventional'],
  eligible_states         text[] not null default array['CA'],
  min_loan_amount         integer not null default 100000,
  max_loan_amount         integer not null default 3000000,
  min_credit_score        integer not null default 620,
  max_ltv                 numeric(5,2) not null default 97.0,
  lock_15_adj             numeric(5,3) not null default -0.125,
  lock_45_adj             numeric(5,3) not null default  0.125,
  lock_60_adj             numeric(5,3) not null default  0.250,
  status                  text not null default 'pending'
                          check (status in ('pending','active','suspended','cancelled')),
  stripe_customer_id      text,
  stripe_subscription_id  text,
  total_opt_ins           integer not null default 0,
  total_views             integer not null default 0
);

alter table marketplace_lenders enable row level security;

drop policy if exists "Admin full access to marketplace_lenders" on marketplace_lenders;
create policy "Admin full access to marketplace_lenders"
  on marketplace_lenders for all
  using (
    exists (select 1 from users where id = auth.uid()::text and role = 'admin')
  );

create index if not exists marketplace_lenders_status_idx on marketplace_lenders(status);

create table if not exists marketplace_opt_ins (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  lender_id           uuid not null references marketplace_lenders(id),
  borrower_user_id    uuid references auth.users(id),
  scenario_snapshot   jsonb not null,
  discover_session_id uuid references discover_sessions(id),
  fee_charged         boolean not null default false
);

alter table marketplace_opt_ins enable row level security;

drop policy if exists "Admin full access to marketplace_opt_ins" on marketplace_opt_ins;
create policy "Admin full access to marketplace_opt_ins"
  on marketplace_opt_ins for all
  using (
    exists (select 1 from users where id = auth.uid()::text and role = 'admin')
  );

create index if not exists marketplace_opt_ins_lender_idx on marketplace_opt_ins(lender_id);
create index if not exists marketplace_opt_ins_borrower_idx on marketplace_opt_ins(borrower_user_id);

create or replace function increment_marketplace_views(lender_ids uuid[])
returns void language sql security definer as $$
  update marketplace_lenders
  set    total_views = total_views + 1,
         updated_at  = now()
  where  id = any(lender_ids);
$$;
-- Migration 056: add card_fair_par_rate to scenario_briefs
ALTER TABLE scenario_briefs
  ADD COLUMN IF NOT EXISTS card_fair_par_rate numeric;
-- Migration 057: add card_fair_par_rate to buyer_evaluation_sessions
ALTER TABLE buyer_evaluation_sessions
  ADD COLUMN IF NOT EXISTS card_fair_par_rate numeric;
