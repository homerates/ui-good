-- ============================================================
-- 001_stripe_schema.sql
-- Run in Supabase SQL editor (Dashboard → SQL Editor → New query)
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
-- 4. RLS — service role key bypasses all policies (webhooks use it)
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
