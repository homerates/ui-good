-- 059: DPA Programs — child of marketplace_lenders
-- Banks / credit unions declare their active DPA programs here.
-- Consumers matched via AMI Qualifier engage through the HomeRates marketplace.
-- Admin and lender-facing CRUD via /api/admin/dpa-programs.

CREATE TABLE IF NOT EXISTS dpa_programs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  lender_id            uuid NOT NULL REFERENCES marketplace_lenders(id) ON DELETE CASCADE,

  program_name         text NOT NULL,
  program_type         text NOT NULL DEFAULT 'grant'
                       CHECK (program_type IN ('grant','forgivable_loan','second_lien','matched_savings')),

  max_assistance       integer,          -- max $ assistance; null = no stated cap
  income_limit         integer,          -- max annual qualifying income; null = defer to AMI tool threshold

  -- Geographic coverage
  coverage_type        text NOT NULL DEFAULT 'state'
                       CHECK (coverage_type IN ('nationwide','state','county')),
  eligible_states      text[] NOT NULL DEFAULT '{}',
  eligible_county_fips text[] NOT NULL DEFAULT '{}',

  -- Borrower overlays
  min_credit_score     integer NOT NULL DEFAULT 620,
  loan_types           text[] NOT NULL DEFAULT ARRAY['conventional','fha'],

  notes                text,
  active               boolean NOT NULL DEFAULT true
);

ALTER TABLE dpa_programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access to dpa_programs" ON dpa_programs;
CREATE POLICY "Admin full access to dpa_programs" ON dpa_programs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS dpa_programs_lender_idx ON dpa_programs (lender_id);
CREATE INDEX IF NOT EXISTS dpa_programs_active_idx ON dpa_programs (active) WHERE active = true;
