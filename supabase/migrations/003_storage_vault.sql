-- ============================================================
-- 003_storage_vault.sql
-- Creates the user-vault storage bucket and RLS policies.
-- Run in Supabase Dashboard → SQL Editor
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
-- 2. RLS policies — path must start with user's own clerk_user_id
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
