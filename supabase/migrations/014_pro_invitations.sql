-- ============================================================
-- 014_pro_invitations.sql
-- Pro directory invitation system.
-- Allows platform users (LOs, admins) to invite unclaimed pros
-- to join and claim their listing.
-- Also adds email + invited_at to pro_directory for future
-- bulk email import merge.
-- ============================================================

-- ── Add email + invited_at to pro_directory ──────────────────
ALTER TABLE public.pro_directory
  ADD COLUMN IF NOT EXISTS email       text,
  ADD COLUMN IF NOT EXISTS invited_at  timestamptz;

-- ── Pro invitations log ──────────────────────────────────────
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
