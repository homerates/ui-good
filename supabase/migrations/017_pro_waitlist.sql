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
