# COMPLIANCE_DECISIONS.md

**Project:** HomeRates.ai — Memory-Driven CRM  
**Document purpose:** Binding compliance decisions with concrete, enforceable guardrails. This file is the defensible record. It is not a list of things to think about — each entry below is a decided rule that code reviewers, schema designers, and the follow-up generation system must enforce literally.  
**Date recorded:** 2026-07-09  
**Decision-maker:** Rayaan Arif, Founder, HomeRates.ai  
**Counsel review status:** Internal decision — legal counsel review recommended before the TCPA consent mechanism or AI-generated outreach goes to production. All other decisions may proceed to implementation planning.

---

## Format

Each entry records:
- **Regulatory basis** — what law or principle this addresses
- **The rule** — the concrete, checkable guardrail in one or two sentences
- **What this means in code / schema** — the literal implementation requirement
- **What is explicitly permitted** — so the rule isn't over-interpreted
- **Status** — "documented decision, proceed" or "blocked: requires functional mechanism"

---

## Decision 1 — Income and Credit Score Exclusion

**Regulatory basis:** ECOA / Regulation B (income data in a marketing context can influence credit decision framing); GLBA (financial information that triggers heightened protection); general principle of CRM scope — this system is for relationship memory, not underwriting.

**The rule:** The following fields are permanently barred from every layer of the CRM data model: the `borrowers` seed context schema, the `crm_touchpoints.key_facts` JSONB type definition, freeform narrative fields, and the follow-up generation prompt. Barred at the schema level means these column names do not exist. Barred at the key_facts level means these key names are not in the TypeScript type and code review rejects any PR that adds them.

**Permanent denylist — these identifiers must never appear in the CRM system:**

| Category | Barred identifiers |
|---|---|
| Income | `annual_income`, `monthly_income`, `gross_income`, `net_income`, `income`, `household_income`, `stated_income` |
| Credit | `credit_score`, `fico_score`, `fico`, `credit_range`, `credit_bucket`, `credit_band`, `vantage_score` |
| Debt ratios | `dti`, `debt_to_income`, `front_end_dti`, `back_end_dti`, `monthly_debt`, `total_debt` |

Note: `credit_score_range` was considered for the seed context schema and explicitly rejected. No bucketed or banded form of credit score is permitted either.

**What this means in code / schema:** The `borrowers` migration that adds seed context fields must not include any identifier from the denylist. The TypeScript interface for `key_facts` fact keys must use a discriminated union of explicitly named allowed keys — it must not have a generic string index signature that would admit arbitrary keys. Code review of any migration, API route, or TypeScript type touching the CRM system checks the denylist. Add the denylist to the CLAUDE.md hard rules section.

**What is explicitly permitted:** The `scenario_briefs` table and card system already capture loan scenario parameters (price, down payment, rate). These are marketplace data, not CRM intake, and they are not being changed. The actual loan fields on `borrowers` (`actual_rate`, `actual_balance`, `actual_purchase_price`, etc.) are homeowner relationship data, not CRM intake, and are not being changed.

**Status:** Documented decision — proceed to implementation. Denylist must be added to CLAUDE.md before the first CRM migration is written.

---

## Decision 2 — ECOA / Fair Lending: Stored Facts Usage Restriction

**Regulatory basis:** Equal Credit Opportunity Act / Regulation B; 12 CFR Part 1002 — prohibits discriminatory treatment based on race, color, religion, national origin, sex, marital status, familial status, age, or receipt of public assistance.

**The rule:** Stored CRM facts (both structured `key_facts` entries and free-text notes) may influence only the **content specificity** of a follow-up message — what subject matter is referenced, what product scenario is highlighted, what market data is surfaced. They may never influence: (a) rate pricing, (b) program eligibility framing (e.g. "you should look at FHA" vs. "you should look at conventional"), (c) outreach frequency (who gets contacted more often), or (d) message tone selection, if any of these outcomes could correlate with a protected characteristic.

**What this means in code / schema:**

1. **Prohibited key_facts keys:** The `key_facts` discriminated union type must not include any key that names, implies, or can be inferred to correlate with a protected characteristic. Specifically prohibited from being typed keys: `family_status`, `familial_status`, `children`, `marital_status`, `religion`, `national_origin`, `race`, `ethnicity`, `age`, `disability`, `public_assistance`. If an LO needs to record something that falls outside the permitted typed keys, the only path is the `note` freeform field.

2. **The `note` field is excluded from AI input:** The freeform `note` key in `key_facts` is visible to the LO in the pre-call brief UI. It must never be included in the context object passed to the follow-up generation prompt. Only typed structured keys feed the generation system. This must be enforced at the API route level, not in the prompt text.

3. **No frequency or priority scoring from stored facts:** The CRM system must not implement any lead scoring, prioritization, or outreach frequency algorithm that uses `key_facts` data as an input. Rate-event triggers fire based on loan scenario parameters (from `scenario_briefs` or seed context loan parameters), not on personal characteristic facts.

4. **Audit logging:** Every automated follow-up send must log which `crm_touchpoints` records were used as context (by ID). This creates an auditable trail showing that outreach was triggered by market conditions or elapsed time, not by stored personal facts.

**What is explicitly permitted:** Using the `touchpoint_date` of the last touchpoint entry to determine elapsed time since last contact (time-based re-engagement). Using seed context loan parameters (`loan_type_pref`, `target_price_min/max`, `timeline_months`, `state_of_focus`) to determine which market data is relevant to surface. Using the subject of the last touchpoint entry and active typed facts to determine what topic to reference in a generated message.

**Status:** Documented decision — proceed to implementation. The TypeScript discriminated union type for `key_facts` must be written before the migration, to establish the permitted key set explicitly before any rows are ever written.

---

## Decision 3 — TCPA: Consent Capture Requirement

**Regulatory basis:** Telephone Consumer Protection Act, 47 U.S.C. § 227; FCC implementing rules (47 CFR § 64.1200). Email marketing consent is also governed by CAN-SPAM and state laws (CCPA, CIPA). The TCPA is most restrictive for automated communications and is the standard being applied here regardless of channel.

**The rule:** No automated outreach (time-based re-engagement, market-event trigger) may be sent to a borrower through this system unless a `crm_outreach_consents` record exists for that borrower with a non-null `consented_at` and a null `revoked_at`. The send function must check this record as a hard gate, not a soft warning. No consent record = no send, period.

**Required `crm_outreach_consents` table — minimum schema:**

| Column | Type | Constraint | Purpose |
|---|---|---|---|
| `id` | uuid | PK | |
| `borrower_id` | uuid | FK → borrowers.id, NOT NULL | The consenting person |
| `lo_user_id` | text | NOT NULL | The LO on whose behalf consent is recorded |
| `channel` | text | CHECK IN ('email','sms') NOT NULL | Separate consent per channel |
| `scope` | text | CHECK IN ('crm_followup','digest') NOT NULL | Separate consent per outreach type |
| `consented_at` | timestamptz | NOT NULL | When consent was obtained |
| `consent_source` | text | CHECK IN ('borrower_self_serve','lo_recorded','platform_signup') NOT NULL | How it was obtained |
| `consent_language` | text | NOT NULL | The exact words the borrower agreed to, or a reference to the version of platform terms in effect |
| `ip_address` | text | nullable | Required if `consent_source = 'borrower_self_serve'` |
| `revoked_at` | timestamptz | nullable | Populated on opt-out; null = active |
| `revocation_source` | text | nullable | How revocation was received |
| `created_at` | timestamptz | DEFAULT now() | |

**Send gate logic (must be in every automated send path):**

```
1. Check email_suppression table — if suppressed, skip
2. Check crm_outreach_consents for a record WHERE
     borrower_id = $borrower_id
     AND channel = 'email'
     AND scope = 'crm_followup'
     AND revoked_at IS NULL
   If no record exists or revoked_at IS NOT NULL — skip, log reason
3. Proceed to send
```

**LO-initiated sends (LO reviews + clicks Send):** The LO is the sender of record, not an automated system. However, the send UI must require the LO to confirm consent was obtained before the send button is available for a given borrower. Minimum: a checkbox state persisted per borrower indicating the LO has acknowledged obtaining consent. This is not the same as the formal `crm_outreach_consents` record — it is an interim mechanism until borrower self-serve consent capture is built. Both the formal record path (borrower opts in) and the LO-acknowledged path must eventually exist. Until the formal record path is built, LO-initiated sends with the acknowledgment checkbox are permitted; automated sends are not.

**Opt-out:** Any email sent through this system must contain a working unsubscribe link. On click, `revoked_at` is populated and `email_suppression` entry is created. Both must happen in the same transaction.

**Status:** **Blocked — requires functional mechanism.** This is the only one of the six decisions that cannot be satisfied by documentation alone. The `crm_outreach_consents` table, the send gate logic, the opt-out handler, and the LO consent acknowledgment UI must be built and functional before any automated outreach path goes live. The LO-initiated follow-up generator UI may be built in the meantime, but the send button must be conditionally rendered based on consent state.

---

## Decision 4 — GLBA: Data Surface Restriction

**Regulatory basis:** Gramm-Leach-Bliley Act, 15 U.S.C. §§ 6801–6827; Safeguards Rule (16 CFR Part 314). The CRM system expands the personal context visible through HomeRates.ai dashboards, which increases the surface area of nonpublic personal information (NPI).

**The rule:** CRM data (seed context fields on `borrowers`, `crm_touchpoints` records) is visible only to the LO whose `lo_user_id` owns the borrower record. No other LO, agent, admin, or system process may read another LO's borrower CRM data except: (a) the borrower themselves (if they have a platform account) may view their own record, (b) HomeRates operations staff may access records for support purposes via admin routes that require elevated authentication and are access-logged, and (c) HomeRates cannot use a borrower's CRM data from LO-A to prospect or market to that borrower on behalf of LO-B.

**What this means in code / schema:**

1. **Row-level filtering is mandatory:** Every API route that reads `crm_touchpoints` or seed context fields must include `WHERE lo_user_id = $clerk_user_id` in the query. This is a query-level requirement, not an application-layer filter applied after a full table scan.

2. **No cross-LO exports:** No admin UI, no CSV export, no webhook, no third-party integration may expose `crm_touchpoints` rows or seed context fields in a payload that is not scoped to the owning LO.

3. **LO account deactivation:** When an LO account is deactivated, their borrower records are archived in place with `lo_user_id` retained for the record. They are not transferred to another LO, not visible through the platform, and not used for outreach by any other LO. The borrower retains access to their own data if they have a platform account.

4. **Aggregated analytics:** HomeRates may use aggregated, non-PII signals from the CRM system (e.g., "what fraction of follow-up emails are opened") for platform analytics. Individual borrower records must not be included in analytics datasets without anonymization.

**What is explicitly permitted:** HomeRates staff reading the `borrowers` table for the purpose of running platform infrastructure (digest crons, invite crons) that serve the borrower. An LO reading their own borrower CRM records through authenticated API routes.

**Status:** Documented decision — proceed to implementation. Row-level filtering is a query design decision made at schema design time.

---

## Decision 5 — State Privacy Law: Data Retention and Deletion

**Regulatory basis:** California Consumer Privacy Act / CPRA (Cal. Civ. Code § 1798.100 et seq.); analogous state laws (Virginia CDPA, Colorado CPA, Texas TDPSA, and others). Right to deletion and data minimization principles.

**The rule:** CRM data retained for no longer than 7 years from the date of last meaningful interaction. A deletion-on-request mechanism must exist before any production CRM data is stored. PII fields on a deleted borrower record are nullified, not hard-deleted, to preserve referential integrity; all `crm_touchpoints` rows for a deleted borrower are hard-deleted.

**Retention and deletion specifics:**

1. **Retention clock:** "Last meaningful interaction" means the most recent of: last `crm_touchpoints.created_at`, last `digest_sends.sent_at`, last `messages.created_at` in any thread involving this borrower, or last platform login if `borrowers.user_id` is non-null. The clock restarts on any of these events.

2. **Automated purge:** A quarterly cron job hard-deletes `crm_touchpoints` rows where `created_at` is older than 7 years AND the borrower's retention clock has also expired. This cron must log every deletion to a `data_purge_log` table (borrower_id pseudonymized via hash, row count, run timestamp) for audit purposes.

3. **Deletion-on-request path:** When a borrower submits a deletion request (mechanism TBD — minimum: email to a designated address that triggers a manual process until a self-serve path is built):
   - All `crm_touchpoints` rows for this borrower → hard delete
   - `borrowers.name` → null
   - `borrowers.email` → null (after adding an `email_suppression` entry to prevent re-add)
   - `borrowers.property_address` → null
   - Seed context fields on `borrowers` (buyer_type, timeline, etc.) → null
   - `borrowers.actual_*` loan fields → separate legal review required before deletion (these may be subject to RESPA retention requirements that override the borrower's CCPA deletion right for the retention period)
   - A `data_deletion_log` entry is written recording the request date, completion date, and which fields were nullified vs. retained with reason.

4. **Data minimization:** Seed context fields not collected in the intake process must not be inferred or backfilled from other sources (e.g. scraping public records to guess a borrower's income). Collect only what the borrower or LO explicitly provides.

**What is explicitly permitted:** Retaining the borrower record shell (non-PII fields, foreign key relationships, `created_at`) after PII nullification for referential integrity and audit purposes.

**Status:** Documented decision — proceed to implementation. The deletion-on-request mechanism (even if manual initially) must be documented and an email address must be published before the first production CRM row is written. The automated purge cron can be built later, before the first row reaches 7 years of age.

---

## Decision 6 — AI-Generated Outreach Disclosure

**Regulatory basis:** CFPB guidance on AI in financial services consumer communications; FTC Act Section 5 (deceptive practices); emerging state disclosure requirements for AI-generated content. Also relevant: the general principle that a borrower in a regulated relationship has a right to know the nature of the communications they're receiving.

**The rule:** Borrowers must receive a one-time disclosure that their LO may use AI assistance to draft communications before they receive any AI-generated message. LO-reviewed and sent messages do not require per-message disclosure. Messages sent via automated trigger (without LO review) must include a brief standardized footer disclosure. The LO review gate is non-negotiable and may not be bypassed, auto-confirmed, or made optional — because the per-message disclosure exemption for LO-reviewed messages depends entirely on the LO being the human sender of record.

**Disclosure specifics:**

1. **One-time platform disclosure:** Added to the borrower's welcome email (already sent via Resend on borrower account creation). Disclosure language: *"Your loan officer uses HomeRates.ai, which includes AI tools that may assist in drafting messages and preparing information. Your loan officer reviews all communications before they are sent."* This language must be reviewed by counsel and versioned — the `crm_outreach_consents.consent_language` field references the disclosure version in effect at consent time.

2. **Per-automated-message footer (for sends without LO review):** If any send path exists that does not require LO review (time-based trigger, market-event trigger), the generated email must include the following footer, not hidden in fine print: *"This message was prepared automatically by HomeRates.ai based on your mortgage scenario. Questions? Reply to reach [LO name] directly."*

3. **LO review gate:** The follow-up generator UI must present the generated draft in an editable text area. The send action is a deliberate button press by the authenticated LO. There must be no "auto-send" mode, no "send if LO doesn't respond within N hours" logic, and no batch send of AI-generated drafts without individual review. These constraints are product requirements, not just principles.

4. **What the LO sees:** The generation UI displays a visible label on generated content: "AI-drafted — review before sending." This label appears in the UI only (not in the sent email) and is purely to reinforce the LO's role in the process.

**What is explicitly permitted:** Using AI to generate a draft that the LO then edits entirely and sends as their own message. Using AI to surface market data, suggest a subject line, or flag what topic to address. These are assistance functions, not automated communications.

**Status:** Documented decision — proceed to implementation. The welcome email disclosure must be added before any borrower is enrolled in the CRM system. The review gate is a UI design requirement that must be present in the initial build.

---

## Summary Table

| # | Decision | Status |
|---|---|---|
| 1 | Income/credit score exclusion denylist | ✅ Proceed |
| 2 | ECOA stored facts usage restriction + `note` exclusion from AI | ✅ Proceed |
| 3 | TCPA consent capture mechanism | 🔴 Blocked — functional mechanism required |
| 4 | GLBA row-level data surface restriction | ✅ Proceed |
| 5 | State privacy retention/deletion mechanism | ✅ Proceed (deletion path must be documented before first row) |
| 6 | AI-generated outreach disclosure | ✅ Proceed (welcome email update required before first enrollment) |

---

## Changelog

| Date | Change | Author |
|---|---|---|
| 2026-07-09 | Initial six decisions recorded following Phase 4 CRM compliance review | Rayaan Arif |
