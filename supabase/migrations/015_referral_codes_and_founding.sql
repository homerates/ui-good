-- 015_referral_codes_and_founding.sql
-- 1. Short referral codes on users table (used for /r/[slug] links)
-- 2. Founding member badge on loan_officers and agents

-- ── 1. Referral codes ────────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referral_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code
  ON public.users (referral_code)
  WHERE referral_code IS NOT NULL;

-- ── 2. Founding member badge ─────────────────────────────────────────────────
ALTER TABLE public.loan_officers
  ADD COLUMN IF NOT EXISTS is_founding_member BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS is_founding_member BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: everyone currently registered gets founding status
-- (We are well under 500; runtime check in onboarding/setup handles the cap going forward)
UPDATE public.loan_officers SET is_founding_member = TRUE WHERE is_founding_member = FALSE;
UPDATE public.agents         SET is_founding_member = TRUE WHERE is_founding_member = FALSE;
