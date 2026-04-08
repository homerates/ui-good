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
