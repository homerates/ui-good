-- ============================================================
-- 061_chat_projects_rebuild.sql
-- Seam 1: New `chats` table + projects index/column additions.
-- See docs/audits/chat-project-archiving-findings.md for context.
--
-- Pre-flight confirmed (2026-07-01):
--   - uid() produces 8-char base-36 text strings, NOT UUIDs → id is text
--   - 0 duplicate (clerk_user_id, chat_id) pairs in production
--   - 18 "Unsorted" project rows exist (one per user, from old prompt() path)
--   - 500 chat_threads rows carry project_id; 8 are thread_id-only orphans
--
-- This migration ONLY creates the new table and adds indexes/columns.
-- Backfill from chat_threads → chats is Seam 2.
-- API route and frontend changes are Seam 3.
-- ============================================================

-- ── 1. New unified chats table ────────────────────────────────────────────────
--
-- id: text (not uuid) — frontend generates via uid() = Math.random().toString(36).slice(2,10)
-- PRIMARY KEY (id, clerk_user_id): composite so RLS policies are enforced at
--   the PK level and partition pruning works when filtering by clerk_user_id.
-- project_id: FK with ON DELETE SET NULL — deleting a project sends its chats
--   to null (logical "Unsorted") without breaking the chat record.
-- memory_thread_id: FK to memory_threads; ON DELETE SET NULL preserves chats
--   if the AI memory record is ever pruned.

CREATE TABLE IF NOT EXISTS public.chats (
  id               text        NOT NULL,
  clerk_user_id    text        NOT NULL,
  project_id       uuid        REFERENCES public.projects(id)        ON DELETE SET NULL,
  title            text,
  messages         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  memory_thread_id uuid        REFERENCES public.memory_threads(id)  ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, clerk_user_id)
);

-- Index: list chats for a user ordered by most-recently-updated (sidebar query)
CREATE INDEX IF NOT EXISTS chats_user_idx
  ON public.chats (clerk_user_id, updated_at DESC);

-- Index: filter chats by project (project view query)
CREATE INDEX IF NOT EXISTS chats_project_idx
  ON public.chats (clerk_user_id, project_id);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

-- Single policy covers SELECT, INSERT, UPDATE, DELETE.
-- Service role key bypasses this for all API routes (same pattern as other tables).
DROP POLICY IF EXISTS chats_owner_only ON public.chats;
CREATE POLICY chats_owner_only ON public.chats
  USING     (clerk_user_id = auth.uid()::text)
  WITH CHECK (clerk_user_id = auth.uid()::text);

-- ── 3. projects — add updated_at column ──────────────────────────────────────
-- The current `projects` table has no updated_at column (confirmed from staging DDL).
-- Needed for future sort/cache-invalidation patterns.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ── 4. projects — unique index on (clerk_user_id, name) ──────────────────────
-- Prevents duplicate project names per user.
-- Also enables the "find or create" upsert pattern used in POST /api/projects
-- to work as an actual UPSERT rather than a scan-then-insert race.

CREATE UNIQUE INDEX IF NOT EXISTS projects_user_name_uq
  ON public.projects (clerk_user_id, name);
