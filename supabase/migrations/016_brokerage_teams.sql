-- 016_brokerage_teams.sql
-- Brokerage team tables: brokerages, brokerage_members, and FK on loan_officers

-- ── 1. Brokerages ─────────────────────────────────────────────────────────────
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

-- ── 2. Members ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.brokerage_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brokerage_id  UUID NOT NULL REFERENCES public.brokerages(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member',   -- 'owner' | 'member'
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brokerage_id, user_id)
);

-- ── 3. FK on loan_officers ────────────────────────────────────────────────────
ALTER TABLE public.loan_officers
  ADD COLUMN IF NOT EXISTS brokerage_id UUID REFERENCES public.brokerages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lo_brokerage_id
  ON public.loan_officers (brokerage_id)
  WHERE brokerage_id IS NOT NULL;
