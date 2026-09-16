-- ============================================================
-- 062_backfill_chats.sql
-- Seam 2: Backfill chat_threads → chats
-- Run in production Supabase SQL Editor AFTER confirming
-- the pre-check query matches expected numbers.
--
-- Safe to re-run: ON CONFLICT DO NOTHING makes it idempotent.
-- Does NOT modify or delete any chat_threads rows.
-- Rollback: TRUNCATE public.chats; (empties the new table only)
-- ============================================================

-- ── Step 1: Primary rows (chat_id IS NOT NULL) ────────────────────────────────
-- These are the 2399 rows written by PUT /api/chat-threads.
-- chat_id is the canonical identity; use it as chats.id.

INSERT INTO public.chats (
  id,
  clerk_user_id,
  project_id,
  title,
  messages,
  memory_thread_id,
  created_at,
  updated_at
)
SELECT
  chat_id,
  clerk_user_id,
  project_id,
  title,
  COALESCE(messages, '[]'::jsonb),
  memory_thread_id,
  created_at,
  updated_at
FROM public.chat_threads
WHERE chat_id IS NOT NULL
ON CONFLICT (id, clerk_user_id) DO NOTHING;

-- ── Step 2: Thread-id-only orphan rows (chat_id IS NULL, thread_id IS NOT NULL) ──
-- These are the ~8-10 rows written by the old POST /api/projects path
-- that were never updated by PUT /api/chat-threads.
-- Use thread_id as the id. ON CONFLICT skips any that collide with Step 1.

INSERT INTO public.chats (
  id,
  clerk_user_id,
  project_id,
  title,
  messages,
  memory_thread_id,
  created_at,
  updated_at
)
SELECT
  thread_id,
  clerk_user_id,
  project_id,
  title,
  COALESCE(messages, '[]'::jsonb),
  memory_thread_id,
  created_at,
  updated_at
FROM public.chat_threads
WHERE chat_id IS NULL
  AND thread_id IS NOT NULL
ON CONFLICT (id, clerk_user_id) DO NOTHING;

-- ── Post-run verification (read the output and compare to pre-check) ──────────
SELECT
  (SELECT COUNT(*)                                  FROM public.chats)             AS chats_total,
  (SELECT COUNT(*) FROM public.chats WHERE project_id IS NOT NULL)                AS chats_with_project,
  (SELECT COUNT(*) FROM public.chats WHERE memory_thread_id IS NOT NULL)          AS chats_with_memory,
  (SELECT COUNT(*) FROM public.chat_threads WHERE chat_id IS NOT NULL)            AS source_chat_id_rows,
  (SELECT COUNT(*) FROM public.chat_threads WHERE chat_id IS NULL
                                               AND thread_id IS NOT NULL)         AS source_orphan_rows,
  (SELECT COUNT(*) FROM public.chat_threads WHERE project_id IS NOT NULL)         AS source_with_project;
