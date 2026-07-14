-- 069_person_activity.sql
-- Platform Intelligence Phase 1:
--   1. Rename crm_touchpoints → person_activity
--   2. Rename crm_compliance_events → compliance_events
--   3. Add borrower_id to chats for person-scoped threads
--
-- All IF EXISTS guards applied. Safe to re-run.

-- ── 1. Rename crm_touchpoints → person_activity ───────────────────────────────

ALTER TABLE IF EXISTS public.crm_touchpoints RENAME TO person_activity;

-- Rename the self-referential FK constraint (superseded_by → person_activity)
-- The FK name was auto-generated; Postgres keeps it on the renamed table.
-- Rename indexes explicitly for clarity.
ALTER INDEX IF EXISTS crm_touchpoints_borrower_idx     RENAME TO person_activity_borrower_idx;
ALTER INDEX IF EXISTS crm_touchpoints_lo_active_idx    RENAME TO person_activity_lo_active_idx;
ALTER INDEX IF EXISTS crm_touchpoints_borrower_active_idx RENAME TO person_activity_borrower_active_idx;

-- Rename the RLS policy
ALTER POLICY "service_role_all_crm_touchpoints" ON public.person_activity
  RENAME TO "service_role_all_person_activity";

-- ── 2. Rename crm_compliance_events → compliance_events ──────────────────────

ALTER TABLE IF EXISTS public.crm_compliance_events RENAME TO compliance_events;

ALTER INDEX IF EXISTS crm_compliance_events_lo_user_id_idx RENAME TO compliance_events_lo_user_id_idx;
ALTER INDEX IF EXISTS crm_compliance_events_created_at_idx RENAME TO compliance_events_created_at_idx;
ALTER INDEX IF EXISTS crm_compliance_events_category_idx   RENAME TO compliance_events_category_idx;

ALTER POLICY "no_direct_access" ON public.compliance_events
  RENAME TO "no_direct_access_compliance_events";

-- ── 3. Add borrower_id to chats for person-scoped threads ────────────────────

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS borrower_id uuid REFERENCES public.borrowers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chats_borrower_id_idx
  ON public.chats (borrower_id)
  WHERE borrower_id IS NOT NULL;
