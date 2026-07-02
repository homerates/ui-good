-- ============================================================
-- 063_rollback_chats.sql
-- Rollback Seam 1 + Seam 2: drop the chats table entirely.
--
-- Safe: every row in chats has a matching row in chat_threads
-- (confirmed by orphan check 2026-07-02 — 2402 chats, 0 orphans).
-- All live reads/writes are back on chat_threads after Seam 3 revert.
--
-- CASCADE drops chats_user_idx, chats_project_idx, and the
-- chats_owner_only RLS policy automatically.
--
-- The projects.updated_at column and projects_user_name_uq index
-- added in 061 are benign and intentionally kept.
-- ============================================================

DROP TABLE IF EXISTS public.chats CASCADE;
