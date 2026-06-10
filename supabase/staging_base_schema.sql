-- supabase/staging_base_schema.sql
-- Base tables extracted from production 2026-06-10.
-- These tables were created directly in Supabase dashboard and are NOT in the
-- numbered migration files. Run this FIRST in staging, then run staging_seed.sql.

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  email text,
  display_name text,
  added_at timestamptz DEFAULT now(),
  added_by_clerk_id text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS agents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  license text,
  brokerage text,
  created_at timestamptz DEFAULT now(),
  title text,
  bio text,
  phone text,
  website text,
  office_address text,
  is_founding_member boolean NOT NULL DEFAULT false,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS anon_chat_usage (
  ip text NOT NULL,
  date text NOT NULL,
  count integer DEFAULT 1,
  PRIMARY KEY (ip, date)
);

CREATE TABLE IF NOT EXISTS anon_investor_usage (
  ip text NOT NULL,
  date text NOT NULL,
  count integer DEFAULT 1,
  PRIMARY KEY (ip, date)
);

CREATE TABLE IF NOT EXISTS borrowers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  loan_officer_id uuid,
  name text NOT NULL,
  email text,
  state text,
  postal_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  external_ref text,
  first_name text,
  last_name text,
  phone text,
  source text,
  status text DEFAULT 'lead',
  tags text[],
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  property_address text,
  digest_enabled boolean NOT NULL DEFAULT true,
  user_id text,
  actual_balance numeric,
  actual_rate numeric,
  actual_purchase_price numeric,
  actual_purchase_date date,
  actual_value numeric,
  agent_id uuid,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS chat_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  project_id uuid,
  thread_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  chat_id text,
  memory_thread_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  title text,
  messages jsonb DEFAULT '[]'::jsonb,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS consumer_digest_sends (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  consumer_id uuid NOT NULL,
  snapshot_id uuid,
  resend_id text,
  status text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS consumer_homeowners (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text,
  email text,
  property_address text,
  digest_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  actual_balance numeric,
  actual_rate numeric,
  actual_purchase_price numeric,
  actual_purchase_date date,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS consumer_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  token text NOT NULL,
  credits integer NOT NULL DEFAULT 25,
  personal_note text,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  claimed_by_user_id text,
  created_at timestamptz DEFAULT now(),
  reminder_count integer DEFAULT 0,
  last_reminded_at timestamptz,
  source text DEFAULT 'bulk_2026-06-08',
  phone text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS consumer_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  consumer_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  estimated_value numeric,
  estimated_value_low numeric,
  estimated_value_high numeric,
  estimated_balance numeric,
  estimated_equity numeric,
  purchase_rate numeric,
  live_rate numeric,
  last_sale_price numeric,
  last_sale_date text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  amount integer NOT NULL,
  type text NOT NULL,
  description text,
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS generated_articles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  title text NOT NULL,
  excerpt text NOT NULL,
  body text NOT NULL,
  category text NOT NULL,
  tag text,
  read_time integer DEFAULT 5,
  published_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  fred_snapshot jsonb,
  is_auto boolean DEFAULT true,
  status text DEFAULT 'published',
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS hr_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  email text NOT NULL,
  type text NOT NULL,
  label text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean DEFAULT true,
  trigger_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  last_checked_at timestamptz,
  last_triggered_at timestamptz,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS investor_portfolio (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  address text NOT NULL,
  address_normalized text NOT NULL,
  avm numeric,
  beds integer,
  baths numeric,
  sqft integer,
  year_built integer,
  dscr numeric,
  cap_rate numeric,
  gross_yield numeric,
  cash_flow numeric,
  down_pct numeric DEFAULT 25,
  rate numeric,
  rent numeric,
  status text,
  notes text,
  added_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS investor_watchlist (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  address text NOT NULL,
  address_normalized text NOT NULL,
  list_price numeric,
  beds integer,
  property_type text,
  notes text,
  added_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS invite_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  created_by_loan_officer uuid,
  target_plan text NOT NULL,
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  target_role text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS library_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  email text,
  full_name text,
  app_version text,
  question text,
  answer jsonb,
  answer_summary text,
  model text,
  tool_id text,
  role text,
  memory_thread_id uuid,
  project_id uuid,
  chat_thread_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS loan_officers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  email text NOT NULL,
  stripe_customer_id text,
  allowed_borrower_slots integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  invite_code_id uuid,
  lender text,
  plan text NOT NULL DEFAULT 'free',
  nmls text,
  license_state text,
  company_nmls text,
  phone text,
  website text,
  title text,
  bio text,
  office_address text,
  is_founding_member boolean NOT NULL DEFAULT false,
  brokerage_id uuid,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS memory_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  memory_thread_id uuid NOT NULL,
  kind text NOT NULL,
  content_text text NOT NULL,
  content_json jsonb,
  tags text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS memory_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  project_id uuid,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS professionals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text,
  email text,
  name text,
  pro_type text,
  organization text,
  created_at timestamptz DEFAULT now(),
  lender text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS routing_drift_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  seed_prompt text NOT NULL,
  landed_on text NOT NULL DEFAULT 'grok',
  expected_card text,
  suggested_card text,
  signals jsonb,
  diagnosis text,
  fix_applied text,
  fix_worked boolean,
  status text DEFAULT 'open',
  user_id text,
  source text DEFAULT 'auto',
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS scenario_briefs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  borrower_id text NOT NULL,
  loan_type text NOT NULL,
  loan_purpose text NOT NULL DEFAULT 'purchase',
  price_range text NOT NULL,
  down_payment_pct integer NOT NULL,
  income_range text NOT NULL,
  credit_tier text NOT NULL,
  timeline text NOT NULL,
  state text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'active',
  response_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  needs_professional text NOT NULL DEFAULT 'both',
  max_responses integer DEFAULT 3,
  response_window_hours integer DEFAULT 48,
  closes_at timestamptz,
  anonymity_level text DEFAULT 'full',
  card_price numeric,
  card_loan_amt numeric,
  card_rate numeric,
  card_monthly numeric,
  card_term integer,
  card_dp_pct numeric,
  has_card_data boolean DEFAULT false,
  visibility text NOT NULL DEFAULT 'public',
  referred_pro_id text,
  nudge_reengage_sent_at timestamptz,
  posted_by_role varchar(16) NOT NULL DEFAULT 'borrower',
  session_id uuid,
  property_zip text,
  share_level text NOT NULL DEFAULT 'zip_only',
  composite_score integer,
  verdict_label text,
  from_track5 boolean NOT NULL DEFAULT false,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS scenario_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL,
  response_id uuid NOT NULL,
  borrower_id text NOT NULL,
  lo_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS scenario_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL,
  lo_id text NOT NULL,
  lo_name text NOT NULL,
  lo_nmls text NOT NULL,
  rate_estimate text NOT NULL,
  approach text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  responder_type text NOT NULL DEFAULT 'lo',
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS shared_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  clerk_user_id text NOT NULL,
  messages jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE SEQUENCE IF NOT EXISTS short_links_id_seq;
CREATE TABLE IF NOT EXISTS short_links (
  id bigint NOT NULL DEFAULT nextval('short_links_id_seq'),
  slug text NOT NULL,
  target_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS white_label_partners (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  logo_url text,
  tagline text,
  accent_color text DEFAULT '#00e87a',
  contact_email text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);
