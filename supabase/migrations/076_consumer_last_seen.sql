-- 076_consumer_last_seen.sql
-- The missing "last visit" primitive for the consumer-memory "since you were
-- last here" feature (lib/crm/consumer-memory.ts). One row per consumer,
-- upserted to now() every time app/api/consumer-memory's GET handler runs
-- (i.e. every /activity page load) -- deliberately NOT updated by the
-- /api/answers chat-injection call site, so chatting doesn't reset it.
--
-- Same RLS pattern as consumer_activity (070_consumer_activity.sql): deny
-- all direct access, service-role API routes only.

CREATE TABLE IF NOT EXISTS consumer_last_seen (
  user_id      text        PRIMARY KEY,   -- Clerk user id of the consumer
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE consumer_last_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_direct_access_consumer_last_seen" ON consumer_last_seen
  AS RESTRICTIVE
  USING (false);
