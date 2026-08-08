-- 077_decision_score_history.sql
-- Real, persisted audit trail for Decision Score (L1-L5 + composite) over
-- time — the missing primitive flagged during PropertyJourneyHub's polish
-- pass: buyer_evaluation_sessions only ever holds the LATEST score, so
-- nothing in this codebase could compute a real trend/delta without either
-- fabricating one or building this table first. This is that table.
--
-- Append-only, one row per successful score write. Written from the two
-- authoritative composite writers (app/api/buyer-sessions/route.ts POST and
-- app/api/buyer-sessions/[id]/route.ts PATCH — see lib/scoring/decisionScore.ts
-- for the canonical scoring functions those routes call), best-effort and
-- non-blocking, matching the existing "session save is best-effort" pattern
-- used throughout this codebase's write paths. No retention/pruning logic —
-- same append-only, no-cleanup shape as consumer_activity (070).
--
-- Same RLS pattern as consumer_activity/consumer_last_seen: deny all direct
-- access, service-role API routes only.

CREATE TABLE IF NOT EXISTS decision_score_history (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid        NOT NULL REFERENCES buyer_evaluation_sessions(id) ON DELETE CASCADE,
  user_id          text        NOT NULL,          -- denormalized (Clerk user id) for query convenience, matching consumer_activity's pattern
  l1_score         smallint,
  l2_score         smallint,
  l3_score         smallint,
  l4_score         smallint,
  l5_score         smallint,
  composite_score  smallint,
  recorded_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE decision_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_direct_access_decision_score_history" ON decision_score_history
  AS RESTRICTIVE
  USING (false);

-- Primary access pattern: a session's score history, newest first.
CREATE INDEX IF NOT EXISTS decision_score_history_session_idx
  ON decision_score_history (session_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS decision_score_history_user_idx
  ON decision_score_history (user_id, recorded_at DESC);
