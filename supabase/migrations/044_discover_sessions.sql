-- 044_discover_sessions.sql
-- Discover sessions — anonymous by design.
-- Stores scenario benchmarks + lender responses + gap analysis.
-- NO user_id. Thread linkage is operational only; analysis strips all identifiers.

CREATE TABLE IF NOT EXISTS discover_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       UUID REFERENCES conversation_threads(id) ON DELETE SET NULL,
  loan_type       TEXT NOT NULL CHECK (loan_type IN ('fha','conventional','va','jumbo','dscr')),
  scenario_snapshot JSONB NOT NULL,   -- numbers only: price, loanAmount, rate, downPct, term, ltv, monthlyPayment, etc.
  lender_responses  JSONB NOT NULL DEFAULT '{}', -- { [questionId]: { raw: string, evaluated_at: iso } }
  gap_analysis      JSONB NOT NULL DEFAULT '{}', -- { [questionId]: { status: match|check|alert, note: string } }
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','complete','expired')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION update_discover_session_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_discover_sessions_updated
  BEFORE UPDATE ON discover_sessions
  FOR EACH ROW EXECUTE FUNCTION update_discover_session_timestamp();

-- Metadata column on messages — enables discover question type rendering in PE thread
ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- Index for thread lookup (show all discover sessions for a thread)
CREATE INDEX IF NOT EXISTS idx_discover_sessions_thread ON discover_sessions(thread_id) WHERE thread_id IS NOT NULL;

-- RLS: sessions are anonymous — no row-level filtering by user
-- API routes handle auth at the application layer
ALTER TABLE discover_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON discover_sessions
  FOR ALL USING (true) WITH CHECK (true);
