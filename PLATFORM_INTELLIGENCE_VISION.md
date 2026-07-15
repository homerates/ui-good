# Platform Intelligence — Architecture Vision

*Same tier as `COMPLIANCE_DECISIONS.md`. Do not delete or override without founder sign-off.*

---

## What "HomeRates has memory" means

HomeRates is not a form. It is a platform that learns — for each person who touches it —
and surfaces that learning at the right moment.

**Memory for an LO means:** When an LO opens a client's brief, the AI already knows what
has been said, what changed, and what matters right now. The LO types naturally — exactly
as they would relay a call to a colleague — and the platform captures it.

**Memory for a consumer means (Phase 2):** When a buyer returns to the platform, their
prior searches, scenarios, and decisions are waiting for them. They do not start over.

---

## Architecture in one paragraph

Every conversation on the platform — LO-facing or consumer-facing — is a `chats` row.
A chat row keyed to a `borrower_id` becomes a person-scoped thread: the LO's working
memory for a specific client, powered by the same AI that drives the main platform.
Structured facts (budget changes, property interest, concerns) are extracted
asynchronously from the conversation and written to `person_activity` — the audit-grade
record of what is known. The blocklist and compliance safeguards run in the message
pipeline, not in a separate form. Chat is the capture surface.

---

## Phase 1 (this build) — Scope

| Done | Item |
|------|------|
| ✅ | Retire the freeform-note form and `POST /api/crm/notes` route entirely |
| ✅ | Rename storage table `crm_touchpoints` → `person_activity`; get `crm_` prefix out |
| ✅ | Add `borrower_id` column to `chats` table to support person-scoped threads |
| ✅ | Brief page: Memory section → PersonChat embedded component |
| ✅ | Blocklist (Decision 7) wired into the chat pipeline, not the form |
| ✅ | Async extraction from chat messages → `person_activity` inserts |

---

## Phase 2 (out of scope for this build)

- Auto-capture: AMI Qualifier runs, affordability scenarios, property lookups → emit to `person_activity` automatically (platform events, no LO required)
- Consumer-facing context loading: when a buyer opens chat, their prior platform activity surfaces in the session
- Anonymous-to-claimed session merge: pre-sign-in activity stitched to the borrower record on claim
- Vault: structured borrower data (goals, constraints, preferences) assembled from accumulated activity and displayed back to the consumer

---

## Compliance integration

Every person-scoped chat message passes through:

1. **D7 blocklist** (`lib/crm/blocklist.ts`) — protected-characteristic terms blocked before the message reaches AI generation. Blocked messages are logged to `compliance_events` and returned to the LO as a 422 with a clear explanation.
2. **Async extraction** (`POST /api/crm/person-message`) — after blocklist passes, Grok extraction fires in the background and writes structured facts to `person_activity`. The raw chat is always the source of truth; extraction is enrichment.
3. **Decision 1 denylist** — extraction prompt and `person_activity.key_facts` type system permanently bar income, credit, and debt-ratio identifiers.
4. **Decision 2 note exclusion** — raw user messages stored as `NoteFact` in `person_activity` are excluded from AI generation context by `CrmGenerationFact = Exclude<CrmKeyFact, NoteFact>`.

---

## Unified person identity

`borrowers.user_id` = `consumer_homeowner_properties.user_id` = Clerk user ID.
There is intentionally no FK constraint — many borrowers are not yet claimed by a consumer
account. The identity link forms when the consumer signs in and is matched to a borrower
record. All `person_activity` rows carry `borrower_id`; consumer context lookup uses
`user_id` (once claimed) as a secondary key.

---

## What does NOT change

- `crm_outreach_consents` — naming and schema unchanged (not CRM-prefixed in spirit; it controls consent for outreach, not memory)
- `borrowers` table — unchanged
- `lib/crm/types.ts` key_facts union — unchanged (it defines facts, not CRM branding)
- `CrmKeyFact`, `CrmGenerationFact`, `toGenerationTouchpoint()` — unchanged (these are compliance enforcement types; renaming creates churn with no benefit)
- `/api/crm/touchpoints` route path — unchanged (internal API, path rename is churn)
- `lib/crm/blocklist.ts` — unchanged except updated comment references

---

## Personal memory vs. shared knowledge

Not everything the platform knows belongs in a person's individual record. Two distinct categories:

**Personal memory** — facts specific to one individual: their budget, timeline, concerns, activity history. This is what `person_activity` holds. Compliance-sensitive, needs the audit trail (Decision 1 exclusions, the blocklist), generated per person as they use the platform.

**Shared knowledge** — facts that apply identically to every person in a given context: MSA/county-level market conditions, AMI bands and program eligibility rules, loan program parameters (FHA limits, VA funding fees, conforming loan limits), general rate environment. None of this is personal data, so it doesn't carry the same compliance risk, and it's naturally reusable — the Austin market snapshot for one consumer is the same for every consumer looking at Austin. This layer is keyed by dimension (MSA, county, loan program) rather than by person, generated once, cached, and safe to keep in a more human-editable form (an analyst should be able to update "Austin conditions changed" once and have it apply everywhere) rather than something each person's memory independently re-derives.

**Existing precedents — this pattern is already in the codebase, not a new concept:**

Migrations 058 and 065 together establish a shared-knowledge layer keyed by geography:

| Table | Key | Content | Updated |
|-------|-----|---------|---------|
| `gse_ami` | `county_fips` | FHFA AMI threshold (Fannie/Freddie HomeReady eligibility) | Annually via `tools/etl-gse-ami.mjs` |
| `ffiec_census_tracts` | `census_tract_geoid` | Tract income level, MFI %, distressed/underserved flag | Per FFIEC data release |
| `ffiec_mfi` | `msa_md + state_fips + data_year` | Area median family income estimate per MSA | Per FFIEC data release |

Correction from the spec: the table is named `gse_ami`, not `gse_ami_table` — that is the migration filename, not the table name.

All three share the same properties: keyed by geographic dimension (not by person), same value for every consumer in a given area, updated in batch by an ETL process, no PII, no compliance audit trail required. `geo_crosswalk` and `hud_features` (migration 009) serve the same layer in the address-resolution role.

**How they combine:** context assembly (chat, brief, any future personalization surface) pulls both — the person's own derived summary from `person_activity`, plus whichever shared-knowledge documents match their actual situation (their location, their loan type) — and merges them before the AI sees anything. Personalization comes from the combination, not from either layer alone. This is a direct keyed lookup (a person's known MSA/county/program maps to the matching shared doc), not a search or retrieval problem.

This addendum describes the target shape for Phase 2 context-assembly work; it does not require any implementation now.
