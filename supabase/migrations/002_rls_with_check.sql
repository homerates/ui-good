-- ============================================================
-- 002_rls_with_check.sql
-- Defense-in-depth: add WITH CHECK (INSERT guard) to all user-
-- facing tables. Service-role key still bypasses these for API
-- routes. These policies activate for future client-side queries
-- once Clerk JWT is wired to Supabase JWKS.
-- ============================================================

-- ---------------------------------------------------------------
-- memory_threads
-- ---------------------------------------------------------------
ALTER TABLE public.memory_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memory_threads: read own"  ON public.memory_threads;
DROP POLICY IF EXISTS "memory_threads: insert own" ON public.memory_threads;
DROP POLICY IF EXISTS "memory_threads: update own" ON public.memory_threads;
DROP POLICY IF EXISTS "memory_threads: delete own" ON public.memory_threads;

CREATE POLICY "memory_threads: read own"
  ON public.memory_threads FOR SELECT
  USING (clerk_user_id = auth.uid()::text);

CREATE POLICY "memory_threads: insert own"
  ON public.memory_threads FOR INSERT
  WITH CHECK (clerk_user_id = auth.uid()::text);

CREATE POLICY "memory_threads: update own"
  ON public.memory_threads FOR UPDATE
  USING (clerk_user_id = auth.uid()::text)
  WITH CHECK (clerk_user_id = auth.uid()::text);

CREATE POLICY "memory_threads: delete own"
  ON public.memory_threads FOR DELETE
  USING (clerk_user_id = auth.uid()::text);

-- ---------------------------------------------------------------
-- library_events
-- ---------------------------------------------------------------
ALTER TABLE public.library_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "library_events: read own"   ON public.library_events;
DROP POLICY IF EXISTS "library_events: insert own"  ON public.library_events;

CREATE POLICY "library_events: read own"
  ON public.library_events FOR SELECT
  USING (clerk_user_id = auth.uid()::text);

CREATE POLICY "library_events: insert own"
  ON public.library_events FOR INSERT
  WITH CHECK (clerk_user_id = auth.uid()::text);

-- ---------------------------------------------------------------
-- chat_threads
-- ---------------------------------------------------------------
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_threads: read own"   ON public.chat_threads;
DROP POLICY IF EXISTS "chat_threads: insert own"  ON public.chat_threads;
DROP POLICY IF EXISTS "chat_threads: update own"  ON public.chat_threads;
DROP POLICY IF EXISTS "chat_threads: delete own"  ON public.chat_threads;

CREATE POLICY "chat_threads: read own"
  ON public.chat_threads FOR SELECT
  USING (clerk_user_id = auth.uid()::text);

CREATE POLICY "chat_threads: insert own"
  ON public.chat_threads FOR INSERT
  WITH CHECK (clerk_user_id = auth.uid()::text);

CREATE POLICY "chat_threads: update own"
  ON public.chat_threads FOR UPDATE
  USING (clerk_user_id = auth.uid()::text)
  WITH CHECK (clerk_user_id = auth.uid()::text);

CREATE POLICY "chat_threads: delete own"
  ON public.chat_threads FOR DELETE
  USING (clerk_user_id = auth.uid()::text);

-- ---------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects: read own"   ON public.projects;
DROP POLICY IF EXISTS "projects: insert own"  ON public.projects;
DROP POLICY IF EXISTS "projects: update own"  ON public.projects;
DROP POLICY IF EXISTS "projects: delete own"  ON public.projects;

CREATE POLICY "projects: read own"
  ON public.projects FOR SELECT
  USING (clerk_user_id = auth.uid()::text);

CREATE POLICY "projects: insert own"
  ON public.projects FOR INSERT
  WITH CHECK (clerk_user_id = auth.uid()::text);

CREATE POLICY "projects: update own"
  ON public.projects FOR UPDATE
  USING (clerk_user_id = auth.uid()::text)
  WITH CHECK (clerk_user_id = auth.uid()::text);

CREATE POLICY "projects: delete own"
  ON public.projects FOR DELETE
  USING (clerk_user_id = auth.uid()::text);

-- ---------------------------------------------------------------
-- user_answers — upgrade FOR ALL to explicit CRUD with WITH CHECK
-- (replaces the "for all" in setup-supabase.sql)
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "user can manage own answers" ON public.user_answers;

CREATE POLICY "user_answers: read own"
  ON public.user_answers FOR SELECT
  USING (clerk_user_id = auth.uid()::text);

CREATE POLICY "user_answers: insert own"
  ON public.user_answers FOR INSERT
  WITH CHECK (clerk_user_id = auth.uid()::text);

CREATE POLICY "user_answers: update own"
  ON public.user_answers FOR UPDATE
  USING (clerk_user_id = auth.uid()::text)
  WITH CHECK (clerk_user_id = auth.uid()::text);

CREATE POLICY "user_answers: delete own"
  ON public.user_answers FOR DELETE
  USING (clerk_user_id = auth.uid()::text);
