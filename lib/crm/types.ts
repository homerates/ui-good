// lib/crm/types.ts
// CRM type system for the Memory-Driven, Trust-First CRM.
//
// COMPLIANCE REFERENCES (see COMPLIANCE_DECISIONS.md):
//   Decision 1: Denylist — income, credit, debt-ratio identifiers are PERMANENTLY
//               barred. They must not appear anywhere in this file or any downstream
//               type that extends these interfaces.
//   Decision 2: NoteFact is visible in the pre-call brief UI but MUST NOT be passed
//               to any generation prompt. Use CrmGenerationFact (not CrmKeyFact) and
//               toGenerationTouchpoint() at every API route that builds generation context.

// ── Seed context enums ───────────────────────────────────────────────────────

export type BuyerType =
  | 'first_time'
  | 'move_up'
  | 'investor'
  | 'refinance'
  | 'homeowner';

export type DownPaymentType = 'amount' | 'pct';

export type LoanTypePref =
  | 'conventional'
  | 'fha'
  | 'va'
  | 'jumbo'
  | 'dscr'
  | 'usda'
  | 'nonqm';

export type LeadSource = 'referral' | 'platform' | 'direct' | 'pilot' | 'other';

// ── Touchpoint meta ──────────────────────────────────────────────────────────

export type TouchpointType =
  | 'call'
  | 'email'
  | 'in_app_message'
  | 'manual_note'
  | 'platform_event';

// ── key_facts discriminated union ────────────────────────────────────────────
//
// ALLOWED KEYS ONLY. The union is closed — no string index signature.
// To add a key: open a PR, check it against the Decision 1 denylist and the
// Decision 2 prohibited-characteristics list in COMPLIANCE_DECISIONS.md, and
// get explicit sign-off before merging.
//
// DO NOT ADD: annual_income, monthly_income, gross_income, net_income, income,
//   household_income, stated_income, credit_score, fico_score, fico,
//   credit_range, credit_bucket, credit_band, vantage_score, credit_score_range,
//   dti, debt_to_income, front_end_dti, back_end_dti, monthly_debt, total_debt
//
// DO NOT ADD (protected characteristics): family_status, familial_status,
//   children, marital_status, religion, national_origin, race, ethnicity,
//   age, disability, public_assistance

export type BudgetUpdatedFact = {
  key: 'budget_updated';
  from: number;
  to: number;
};

export type TimelineUpdatedFact = {
  key: 'timeline_updated';
  from_months: number;
  to_months: number;
};

export type ConcernRaisedFact = {
  key: 'concern_raised';
  concern: string;
  concern_id?: string; // uuid — for matching against a future ConcernResolvedFact
};

export type ConcernResolvedFact = {
  key: 'concern_resolved';
  concern: string;
  resolves_concern_id?: string; // uuid — references ConcernRaisedFact.concern_id
};

export type LifeEventFact = {
  key: 'life_event';
  event: string;
};

export type PreferenceExpressedFact = {
  key: 'preference_expressed';
  preference: string;
};

export type PropertyOfInterestFact = {
  key: 'property_of_interest';
  address: string;
};

export type CompetitorMentionedFact = {
  key: 'competitor_mentioned';
  competitor: string;
};

// LO-visible only. Excluded from generation by CrmGenerationFact.
// Decision 2 enforcement: NoteFact must never appear in a prompt context object.
export type NoteFact = {
  key: 'note';
  text: string;
};

// ── Union types ──────────────────────────────────────────────────────────────

/** Full set of allowed fact types. Use in the pre-call brief UI (read-only). */
export type CrmKeyFact =
  | BudgetUpdatedFact
  | TimelineUpdatedFact
  | ConcernRaisedFact
  | ConcernResolvedFact
  | LifeEventFact
  | PreferenceExpressedFact
  | PropertyOfInterestFact
  | CompetitorMentionedFact
  | NoteFact;

/**
 * Fact types permitted in AI generation context.
 * Decision 2 enforcement: NoteFact is structurally excluded.
 * Passing a CrmKeyFact[] where CrmGenerationFact[] is expected is a type error.
 */
export type CrmGenerationFact = Exclude<CrmKeyFact, NoteFact>;

// ── Table interfaces ─────────────────────────────────────────────────────────

/** Seed context fields added to the borrowers table in migration 066. */
export interface BorrowerSeedContext {
  buyer_type: BuyerType | null;
  target_price_min: number | null;
  target_price_max: number | null;
  down_payment_target: number | null;
  down_payment_type: DownPaymentType | null;
  timeline_months: number | null;
  loan_type_pref: LoanTypePref[] | null;
  state_of_focus: string | null;
  lead_source: LeadSource | null;
  lead_source_detail: string | null;
  seed_notes: string | null;
  // ── Permanently absent (Decision 1 denylist) ──────────────────────────────
  // credit_score_range, annual_income, monthly_income, gross_income,
  // net_income, income, household_income, stated_income, credit_score,
  // fico_score, fico, credit_range, credit_bucket, credit_band, vantage_score,
  // dti, debt_to_income, front_end_dti, back_end_dti, monthly_debt, total_debt
}

/** Full crm_touchpoints row as returned from the database. */
export interface CrmTouchpoint {
  id: string;
  borrower_id: string;
  lo_user_id: string;
  touchpoint_type: TouchpointType;
  touchpoint_date: string; // ISO 8601 timestamptz
  subject: string;
  key_facts: CrmKeyFact[];
  is_superseded: boolean;
  superseded_by: string | null;
  created_at: string;
}

/**
 * Touchpoint shape safe to pass to the generation API.
 * key_facts is narrowed to CrmGenerationFact[] — NoteFact is absent at the type level.
 * Build this exclusively via toGenerationTouchpoint(); never cast manually.
 */
export interface CrmTouchpointForGeneration {
  id: string;
  touchpoint_date: string;
  subject: string;
  key_facts: CrmGenerationFact[];
}

// ── Decision 2 enforcement function ─────────────────────────────────────────

/**
 * Converts a CrmTouchpoint to a CrmTouchpointForGeneration by filtering out
 * all NoteFacts. This is the single entry point for building generation context
 * from a touchpoint — call it at the API route level, not inside prompt strings.
 *
 * Decision 2 (COMPLIANCE_DECISIONS.md): note facts are visible in the LO brief
 * UI but must never reach a generation prompt. This function is the enforcement
 * mechanism — not a prompt instruction, not a convention to remember.
 */
export function toGenerationTouchpoint(t: CrmTouchpoint): CrmTouchpointForGeneration {
  return {
    id: t.id,
    touchpoint_date: t.touchpoint_date,
    subject: t.subject,
    key_facts: t.key_facts.filter((f): f is CrmGenerationFact => f.key !== 'note'),
  };
}
