-- ============================================================
-- 013_admin_role.sql
-- Adds is_admin flag to users table.
-- Admin users can read all pro_directory rows and activity logs.
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Admin activity log — every claim, register, or removal gets a row
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
