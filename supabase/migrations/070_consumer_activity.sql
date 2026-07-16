-- 070_consumer_activity.sql
-- Platform Intelligence Phase 2 (redesigned): consumer-first activity log.
--
-- Design: platform events (AMI runs, affordability scenarios, property views)
-- belong to the CONSUMER's own relationship with HomeRates — not to any LO or
-- agent relationship. This table is keyed on the consumer's Clerk user id and
-- has zero borrower/LO dependency in the write path. Any signed-in user's
-- events are captured, regardless of whether a professional relationship exists.
--
-- This replaces the earlier approach of writing platform events into
-- person_activity (which is per-professional-relationship and required a
-- borrower link to exist — wrong primitive for platform events).
--
-- Read-side visibility to professionals (which relationships, if any, may see
-- these rows) is a separate permission-layer decision — NOT resolved by this
-- migration. RLS below denies all direct access; only service-role API routes
-- touch this table, so the permission model can be layered on without a
-- schema change.

CREATE TABLE IF NOT EXISTS consumer_activity (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_user_id  text        NOT NULL,          -- Clerk user id of the consumer
  event_type        text        NOT NULL,          -- 'ami_run' | 'affordability_run' | 'property_viewed' | ...
  subject           text        NOT NULL,          -- human-readable label
  key_facts         jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- CrmKeyFact[] shape
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS: deny all direct access. Service role (used in API routes) bypasses RLS.
ALTER TABLE consumer_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_direct_access_consumer_activity" ON consumer_activity
  AS RESTRICTIVE
  USING (false);

-- Primary access pattern: a consumer's own timeline, newest first.
CREATE INDEX IF NOT EXISTS consumer_activity_user_created_idx
  ON consumer_activity (consumer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS consumer_activity_event_type_idx
  ON consumer_activity (event_type);
