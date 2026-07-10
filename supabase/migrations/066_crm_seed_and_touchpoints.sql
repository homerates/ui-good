-- 066_crm_seed_and_touchpoints.sql
-- CRM Sprint 1: borrowers seed context fields + crm_touchpoints table.
-- No consent, no send paths, no UI. Schema and types only.
--
-- COMPLIANCE NOTE (see COMPLIANCE_DECISIONS.md, committed 2836059c):
--   Decision 1: The following fields are PERMANENTLY BARRED from this migration
--   and from any future ALTER TABLE on these tables:
--     Income:      annual_income, monthly_income, gross_income, net_income,
--                  income, household_income, stated_income
--     Credit:      credit_score, fico_score, fico, credit_range, credit_bucket,
--                  credit_band, vantage_score, credit_score_range
--     Debt ratios: dti, debt_to_income, front_end_dti, back_end_dti,
--                  monthly_debt, total_debt
--   credit_score_range was proposed in the CRM design doc and explicitly
--   rejected. No bucketed or banded form of credit score may ever appear here.
--
--   Decision 2: key_facts stores CrmKeyFact[] (see lib/crm/types.ts). The
--   note fact type is permitted in the DB but must never be forwarded to a
--   generation prompt — enforcement is structural via CrmGenerationFact in the
--   TypeScript layer, not via a DB constraint.

-- ── Part 1: borrowers seed context fields ────────────────────────────────────
--
-- All fields nullable — LO fills them in over time, none are required at
-- borrower creation. The intake form at /borrowers/new captures name + email
-- only; seed context is populated after first contact.
--
-- Denylist check (Decision 1): each column name confirmed absent from
-- income / credit / debt-ratio lists before inclusion.

ALTER TABLE public.borrowers
  -- Buyer profile
  ADD COLUMN IF NOT EXISTS buyer_type          text
    CHECK (buyer_type IN ('first_time','move_up','investor','refinance','homeowner')),

  -- Price range (loan purpose context, not underwriting)
  ADD COLUMN IF NOT EXISTS target_price_min    numeric,
  ADD COLUMN IF NOT EXISTS target_price_max    numeric,

  -- Down payment intent
  ADD COLUMN IF NOT EXISTS down_payment_target numeric,
  ADD COLUMN IF NOT EXISTS down_payment_type   text
    CHECK (down_payment_type IN ('amount','pct')),

  -- Timeline
  ADD COLUMN IF NOT EXISTS timeline_months     integer,

  -- Loan type preference (text array — borrower may prefer multiple)
  ADD COLUMN IF NOT EXISTS loan_type_pref      text[],

  -- Geographic focus (if buying out of state or in a specific market)
  ADD COLUMN IF NOT EXISTS state_of_focus      text,

  -- Lead attribution
  ADD COLUMN IF NOT EXISTS lead_source         text
    CHECK (lead_source IN ('referral','platform','direct','pilot','other')),
  ADD COLUMN IF NOT EXISTS lead_source_detail  text,

  -- First-contact notes (freeform, LO-entered, CRM context only)
  -- NOT forwarded to any generation prompt — stored here, shown in brief UI.
  ADD COLUMN IF NOT EXISTS seed_notes          text;

-- ── Part 2: crm_touchpoints ──────────────────────────────────────────────────
--
-- One row per LO interaction with a borrower. key_facts stores a typed JSON
-- array of fact entries (see lib/crm/types.ts: CrmKeyFact[]). The
-- is_superseded / superseded_by pair implements fact consolidation — when a
-- newer budget or timeline entry replaces an older one, the older row is
-- flagged so it is filtered from the pre-call brief.

CREATE TABLE IF NOT EXISTS public.crm_touchpoints (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id      uuid        NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  lo_user_id       text        NOT NULL,   -- Clerk user_id of the LO who entered this
  touchpoint_type  text        NOT NULL
    CHECK (touchpoint_type IN ('call','email','in_app_message','manual_note','platform_event')),
  touchpoint_date  timestamptz NOT NULL,   -- when the interaction happened, not when entered
  subject          text        NOT NULL,   -- one-line: what the touchpoint was about
  key_facts        jsonb       NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(key_facts) = 'array'),  -- always a JSON array; elements typed by lib/crm/types.ts
  is_superseded    boolean     NOT NULL DEFAULT false,
  superseded_by    uuid        REFERENCES public.crm_touchpoints(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Indexes
-- Primary lookup: all touchpoints for a borrower, newest first
CREATE INDEX IF NOT EXISTS crm_touchpoints_borrower_idx
  ON public.crm_touchpoints (borrower_id, created_at DESC);

-- Pre-call brief query: LO's non-superseded touchpoints for all their borrowers
CREATE INDEX IF NOT EXISTS crm_touchpoints_lo_active_idx
  ON public.crm_touchpoints (lo_user_id, is_superseded, created_at DESC);

-- Consolidation query: find prior non-superseded entries of a given fact type
-- (used by the consolidation logic to mark older budget/timeline entries as superseded)
CREATE INDEX IF NOT EXISTS crm_touchpoints_borrower_active_idx
  ON public.crm_touchpoints (borrower_id, is_superseded)
  WHERE is_superseded = false;

-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- Decision 4 (GLBA): CRM data is visible only to the LO who owns the
-- borrower record. Row-level filtering is enforced at the query level in
-- every API route (WHERE lo_user_id = $clerk_user_id). The service_role
-- policy below is for API routes that use the service key; it does not
-- open the table to other users.
--
-- No consumer-facing read policy at this stage — that is sprint 2 scope.

ALTER TABLE public.crm_touchpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_crm_touchpoints" ON public.crm_touchpoints;
CREATE POLICY "service_role_all_crm_touchpoints"
  ON public.crm_touchpoints
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
