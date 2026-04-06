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
