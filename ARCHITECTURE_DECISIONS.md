# ARCHITECTURE_DECISIONS.md — HomeRates.AI

> Decision log. Each entry is a settled call with its reasoning, so the *why*
> survives any code revert. Append-only; supersede with a dated note rather than
> deleting.

---

## AD-1 — AMI Qualifier → property_lookup handoff (SHIPPED)

**Decision:** The `/ami-qualifier` "Start My Scenario" CTA is renamed to the
canonical **"Run My Numbers"** and routes via the address-seed convention
`/chat?sq=<full address>` so `extractPlainAddress` fires the normal
`property_lookup` flow. The old `/chat?dpaCheck=1&zip=...` route is removed.

**Reasoning:** The CTA convention is a URL pattern (`?sq=` → `pendingSeedRef`
fires `send()` on mount), not a shared component. The qualifier already holds the
full address; the old route degraded it to a ZIP and misrouted into the DPA-check
block, which is what was firing a stray "Grok card." Seeding the full address
fires property_lookup cleanly. `extractPlainAddress` was trace-verified to parse
the qualifier's full `street, city, ST ZIP` format.

**Status:** Built, verified on preview, pushed to production.

### AD-1a — LANDMINE: `paramOverrides.annualIncome` is poisoned
`paramOverrides.annualIncome` is a LIVE TRIGGER that forces
`calcDispatch.type = 'affordability'` and renders an AffordabilitySliderCard,
destroying the property_lookup flow. Borrower **actual** household income must
NEVER ride on `paramOverrides.annualIncome`. There is no display field for
"borrower actual household income" on any property_lookup card today; carrying it
later requires a NEW dedicated field, never reuse of that key. (V1 handoff
deliberately carries NO income — lean handoff.)

---

## AD-2 — Income field semantics (never merge)

The qualifier's **"Annual Household Income"** is the borrower's ACTUAL income
(used for AMI %). The scenario card's **"Income to Qualify"** is a COMPUTED
REQUIRED income (reverse-engineered from PITI to a DTI ratio). These are
structurally inverse — "what you earn" vs "what you need to earn" — and must
never be piped into each other.

---

## AD-3 — Rate Intelligence and DPA/AMI are separate products

**Decision:** Distinct products in the user's mental model. Separate surfaces,
sidebars, and stories. Backend registry MAY be shared where convenient, but UI
must not be unified. (See BRAND.md R5.)

**Reasoning:** The two are different businesses at different scales; conflating
them in UI flattens the higher-value product to the lower. Sidebar grammar:
chat → My Decision Portfolio; My Home → My Properties; Rate Intelligence →
(future) anon matched lenders. All "mine," post-scenario only.

---

## AD-4 — Marketplace surfacing is a future build, not an existing seam

**Finding (audited):** The anonymized match seam exists ONLY on
`/rate-intelligence-engine`, bound to `MarketplaceInput`, and is NOT rendered in
chat. There is no "post completed scenario → marketplace fires" trigger in
`chat/page.tsx`. The in-chat marketplace is a genuine new build, deferred.

**Registry note:** `marketplace_lenders` is modeled with RATE fields only
(margin_over_par, lock adjustments, LTV, credit). It has NO DPA-program columns.
"Same registry" holds at the LENDER level; DPA program specifics are a data shape
that table can't hold today — a future schema decision (extend table vs separate
`dpa_programs` keyed to lender id).

---

## AD-5 — No sample/illustrative marketplace surfaces (DECIDED: do not build)

We will NOT build a sample/illustrative anon lender or rate rail, even honestly
labeled. Considered and rejected on brand + value + ethics grounds. Empty-but-
honest over populated-but-theatrical. (See BRAND.md R4 + the lender-citable
"why this holds" rationale.) Refusing paid placement is the product, not a
limitation.

---

## AD-6 — Consumer ≠ Pro is a structural boundary (route groups)

**Decision:** Consumer and Pro are different products, not one product with a
toggle. The split becomes a **route-group boundary** (`(consumer)` / `(pro)`
shells), not a per-component runtime flag. Consumer = simple, no left sidebar,
minimal hamburger. Pro = left sidebar, full nav, complexity.

**Current state (audited):** Mode resolves at runtime via `lib/useConsumerMode.ts`
— two signals: `window.location.hostname` (homerates.ai = consumer) and a
Supabase `role` from `/api/profile` (borrower/lo/agent). NOT a Clerk claim. The
shell migration will formalize this into route groups.

---

## AD-7 — Single tagged nav config (consolidate 4–6 menu definitions)

**Decision:** One nav config array is the single source of truth. Each item
tagged with `{ label, href, icon, group, modes, roles, surfaces }`. Every menu —
desktop center, drawers, chat panels, consumer + pro — renders by FILTERING that
array, never by re-listing. Same config-over-fork principle as the registry.

**Current state (audited):** Nav lives in SIX hand-maintained definitions —
`NAV_LINKS` + `CONSUMER_NAV_LINKS` arrays (AppNav.tsx desktop center), AppNav pro
drawer (Tools section, hardcoded JSX), AppNav consumer drawer (Resources section,
hardcoded JSX), and two inline panels in `chat/page.tsx` (pro + consumer). No
shared source → this is the root cause of menu drift and bare pages.

**Proposed IA (five intent groups):**
- DECIDE — Chat · Property Lookup/Scenario · My Home
- TOOLS — Rate Intelligence · AMI Qualifier · Loan Limits · Calculators
- MINE — My Properties · Decision Portfolio · Vault/Library · Messages
- LEARN — Knowledge Hub · Platform Intelligence · Lab
- PRO — Investor Portal · Connect · (lender portal)

Rate Intelligence + AMI land in TOOLS. "Resources" label is retired in favor of
one "Tools" group defined once.

---

## AD-9 — Consumer Dashboard = same surface, filtered by mode (AMENDS AD-6)

**Decision:** The "consumer Dashboard" is NOT a separate page from the Pro Dashboard.
It is `/dashboard` filtered by `userType` at the server. Borrowers see their scenario
status, credit balance, and quick-links. LOs/agents see pipeline stats, borrower slots,
and marketplace. Same URL (`/dashboard`), same file, different rendered content.

**Route group assignment:** `/dashboard` sits in `(consumer)` so borrowers arriving
after sign-up get the consumer AppShell (logo + My Home · Chat · Market Rates · Dashboard
top bar + full drawer). Pro users visiting `/dashboard` will also see consumer chrome
for now — acceptable because the page content is still role-differentiated server-side.

**Post-login routing:** `welcome/page.tsx` routes borrowers to `/my-home` and
LOs/agents to `/dashboard`. `/my-home` is the borrower's primary intelligence hub;
`/dashboard` is the LO pipeline. Once the consumer Dashboard surface is fully fleshed out,
borrowers can be routed there instead.

**Amends AD-6:** AD-6 declared consumer/pro a structural route-group boundary.
This decision establishes the single pragmatic exception: one page (`/dashboard`)
serves both modes via server-side role detection, not a client-side toggle or two
separate page files. All other pages follow the AD-6 boundary.

---

## AD-8 — Shell migration: staging boundary CONFIRMED isolated

Vercel has separate `NEXT_PUBLIC_SUPABASE_URL` values scoped to Preview vs
Production (verified in dashboard, Jun 25 / Jun 10) → dev/preview runs against a
SEPARATE staging Supabase project from production. Code-only revert is fully safe
for a shell/nav migration (no schema, no auth, no env changes). Production revert
anchor: commit `303a90f` (PR #62), tagged `pre-shell-migration`.

Open watch item (non-blocking): confirm Preview-scoped Clerk key is a dev
instance; local `.env.local` (development env) shows `pk_live_`, which is expected
for local but should be verified separately for Preview. Mode resolution does not
depend on Clerk claims (resolves from Supabase role), so not migration-blocking.

---

## AD-10 — /chat keeps standalone chrome permanently (AppShell structurally incompatible)

**Decision:** `/chat` will never be wrapped in AppShell and will never be moved
into the `(consumer)` or `(pro)` route groups. This is a permanent architectural
boundary, not a deferred migration.

**Root cause — two hard incompatibilities (audited 2026-06-30):**

1. **Body-overflow override.** AppShell injects
   `body:has(.ash-root){display:block!important;height:auto!important;overflow:visible!important;}`.
   Chat's scroll model depends on `globals.css` keeping `html,body{height:100%;overflow:hidden}`
   so only the `.scroll` flex child scrolls. AppShell's override releases body overflow, which
   collapses the constrained scroll container and breaks auto-scroll-to-bottom.

2. **Double full-height nesting.** AppShell's `.ash-root{min-height:100vh}` wraps
   chat's `<section.main style={{minHeight:'100dvh'}}>`. The two stack to ~200dvh,
   the page becomes document-scrollable, and the mobile fixed composer unpins.

**Status quo is correct:** chat owns its own chrome — sticky `.header`, flex scroll
column, fixed mobile composer. `useConsumerMode()` is already imported and resolves
at runtime (hostname + Supabase role) to branch consumer vs pro rendering. The
consumer hamburger (`ConsumerNav → AppNav drawerOnly`) already reads from nav-config.

**What was migrated:** The pro right-panel item list was replaced with a
nav-config-driven render (same groups/items as AppShell pro drawer, no hardcoded
drift). Layout structure is untouched.

**Do not retry:** Any future session that proposes wrapping `/chat` in AppShell or
moving it into a route group should be rejected and pointed to this entry.

---

## Documentation gap — AD-11 referenced in code but not logged here

`AD-11` is referenced by name in code comments across roughly two dozen files
(`lib/market-data/*`, several API routes, and `CLAUDE.md` rule 7's own text about a
"Seam 1" that was reported committed/pushed while still untracked). No `## AD-11`
entry exists in this file — confirmed via direct search. The decision itself was never
lost (the code comments describe its effect inline), but its formal entry here is
missing. Flagging rather than fabricating: do not write an AD-11 entry from
reconstruction; if the original author confirms its content, add it retroactively in
its correct chronological place. New entries below resume at AD-12 deliberately, to
avoid implying AD-11 never existed.

---

## AD-12 — Address Identity Hardening: deterministic property-identity gate (SHIPPED)

**Decision:** `lib/addressIdentity.ts`'s `validatePropertyIdentity()` — a deterministic,
non-fuzzy, non-LLM comparison of house number / street / city / state / ZIP (with a
fixed, documented list of street-type and directional abbreviation synonyms) — gates
both persistence points in `app/api/property/lookup/route.ts`'s `handleAddress()`
(the Redfin-URL branch and the `broadSearchFallback()` branch). A candidate that fails
the check is never cached and never returned as that address's result.

**Reasoning:** A live-usage audit found `broadSearchFallback()` could accept the first
Tavily result matching a recognized real-estate domain, with no check that the
candidate was actually the requested property — a real data-integrity risk, now load-
bearing given demand-driven external resolution (AD-14) can trigger this path on
behalf of an external caller. Deterministic matching was chosen over fuzzy/LLM matching
specifically so the gate's behavior is auditable and reproducible.

**Status:** Built, tested (`scripts/test-address-identity.ts`,
`scripts/test-address-identity-integration.ts`), pushed to `dev` (commit `38712a2b`).

---

## AD-13 — Canonical Property Intelligence: one shared builder for first-party and external (SHIPPED)

**Decision:** `lib/canonicalPropertyIntelligence.ts`'s
`buildCanonicalPropertyIntelligence(propertyId)` is the single source both the external
Gateway (`lib/gateway/intelligenceGateway.ts`, `lib/externalPropertyResolution.ts`) and
first-party (`app/api/property/intelligence/route.ts`, via AD-15) consume for
valuation, financing, and ownership-cost figures. It wraps the existing
`getPropertyIntelligenceCorpusOnly()` call — no new query, no new AVM merge.

**Reasoning:** A live-usage audit found the same property producing materially
different rate/insurance/valuation/PITI figures between the first-party chat card and
the external MCP contract, traced to the first-party surface client-assembling its own
answer from three independent backend calls plus inline math (ticker rate, a hardcoded
0.005 insurance constant, a two-call-site tax fallback) that never went through this
engine's own already-correct financing logic. Centralizing the calculation in one typed
object makes cross-surface drift structurally impossible rather than something each
surface must remember to keep in sync.

**Canonical payment rules locked by this decision:** point valuation
(`CanonicalValuation.pointEstimate`) is a real merged point AVM, structurally separate
from `low`/`high` — a range floor/ceiling must never stand in for a missing point
estimate. Insurance uses one centralized flat assumption,
`CANONICAL_INSURANCE_ANNUAL_RATE = 0.003` (this repo has no state/property-type/condo-
specific insurance methodology — confirmed via audit). HOA `null` means unknown and is
never coerced to zero; a confirmed `$0` stays exactly `$0`. PITI excludes HOA; PITIA =
PITI + confirmed HOA, or `null` when HOA is unconfirmed — never silently equal to PITI.

**Status:** Built (Stages A+D of a staged rollout — Stage E is AD-15; a planned "Stage
E first-party UI migration" was the explicit scope boundary for this stage), pushed to
`dev` (commit `81da254e`).

---

## AD-14 — Demand-driven external property resolution (SHIPPED)

**Decision:** `lib/externalPropertyResolution.ts`'s
`resolveExternalPropertyIntelligence()` is the MCP route's entry point. It calls the
unchanged Gateway pipeline first; only on a genuinely-never-seen `NOT_AVAILABLE`
(distinguished from "known but incomplete" via `resolvePropertyId()`) does it self-
fetch the existing, unmodified `/api/property/lookup` route exactly once, gated by
AD-12's identity check before any persistence.

**Reasoning:** Without this, an external caller asking about a real address HomeRates
had simply never looked up before got a flat `NOT_AVAILABLE` with no path to recovery.
Reusing the existing first-party lookup pipeline (rather than building a second,
external-specific acquisition path) keeps exactly one acquisition mechanism in the
codebase. Existing Gateway rate limits are the accepted bound on worst-case cost
exposure from external-triggered resolution — a deliberate decision, not an oversight.
No new acquisition cron was added; a freshly-resolved property becomes eligible for the
existing deep-enrichment cron automatically, with no new flag.

**Known limitation, not yet resolved:** the underlying Tavily search
(`broadSearchFallback()`) is non-deterministic — the identical address has been
observed to return `RESOLUTION_FAILED` on one attempt and resolve successfully on an
immediate retry. AD-12 makes a *wrong* match fail closed instead of persisting, but
does not make the search itself deterministic.

**Open, unresolved diagnostic:** `2030 N Hobart Blvd, Los Angeles, CA 90027` returned
`NOT_AVAILABLE` via a live ChatGPT call. Not yet diagnosed with real evidence — logged
here as open, not attributed to any specific cause, per
`docs/HOMERATES_STRATEGIC_OBJECTIVE.md` §4a's "next highest-impact step."

**Status:** Built, pushed to `dev` (commit `38712a2b`, same commit as AD-12 — the
identity gate and demand-driven resolution shipped together).

---

## AD-15 — Property Intelligence vs. Rate Intelligence: separate, non-overlapping rate roles (SHIPPED)

**Decision:** Property Intelligence's rate (`CanonicalFinancing.propertyMarketRate`) is
the neutral national FRED `MORTGAGE30US` rate — no credit score, no LTV, no LLPA —
sourced via `lib/propertyIntelligence.ts`'s `getPropertyMarketReferenceRate()`, the same
underlying `lib/market-data` `getLatest()` path `/api/ticker` reads. It drives
`principalInterestMonthly` and therefore PITI/PITIA for both first-party (AD-16) and
external (AD-13) Property Intelligence. Rate Intelligence's existing OBMMI-segment-
selected, LLPA-adjusted rate (`CanonicalFinancing.rateIntelligence` — `740` credit
score / 20% down illustrative assumptions, unchanged) is relocated to its own clearly
separate sub-object, but its computation, its consumers
(`/rate-intelligence-engine`, "Where Your Rate Ranks"), and Decision Score L5 are
unchanged.

**Reasoning:** Product decision, made explicitly to stop the two concepts from being
confused with each other — Property Intelligence answers "what does financing this
home look like against today's market," Rate Intelligence answers "where does this
specific borrower/scenario rank." These are intentionally different products, allowed
to show different rate values for the same property at the same moment. Collapsing
them into one number was the direct cause of the rate discrepancy a live cross-surface
audit found (6.71% vs 6.673% for the same property).

**Status:** Built, pushed to `dev` (commit `b17e8ce1`).

---

## AD-16 — Stage E: first-party Property Lookup migrated onto canonical (SHIPPED)

**Decision:** `app/chat/page.tsx`'s property_lookup branch and
`AffordabilityPurchaseCard.tsx` now read from a new first-party-only endpoint,
`app/api/property/intelligence/route.ts` (address-keyed via `resolvePropertyId()`),
which returns a curated subset of `buildCanonicalPropertyIntelligence()`'s output —
replacing inline PITI/rate/tax/insurance math and three hardcoded constants that had
drifted from the Gateway's own correct financing logic (see AD-13). Also fixes a real
pre-existing bug: Decision Score L2's AVM input read
`d.estimatedValue ?? d.estimatedValueLow`, silently substituting the AVM range floor as
a point estimate when the point value was absent — now reads
`canonical.valuation.pointEstimate` exclusively (see AD-13's payment rules). Rate
Intelligence (`fetchCompactRateChart`, `/api/rate-intelligence-engine`, "Where Your
Rate Ranks", Decision Score L5) is untouched by this migration.

**Reasoning:** Completes the cross-surface consistency fix AD-13 started — first-party
and external now compute from the identical canonical object rather than two
independently-maintained calculations that could (and did) drift apart. Live-verified
end to end (browser screenshot + automated cross-surface consistency assertions):
first-party, canonical, and external return identical `propertyMarketRate`/PITI/HOA/
point-valuation for the same property at the same moment.

**Status:** Built, pushed to `dev` (commit `020e97d7`). Per the originating task's
explicit scope, first-party UI migration onto canonical stopped here — this covers
only the Property Lookup card, not a broader first-party migration.

---

## AD-17 — External contract v1.2: remove credit_score, correct HOA-unconfirmed semantics (SHIPPED)

**Decision:** `lib/gateway/outputSchema.ts` / `outputShaping.ts` bumped
`contract_version` to `property-intelligence-v1.2`. Removed
`financing_intelligence.assumption_profile.credit_score` entirely (Property
Intelligence's rate never used it — see AD-15 — so exposing it was actively
misleading). Reworded the unconfirmed-HOA limitation string in
`lib/propertyIntelligence.ts` to state only the true, narrower consequence ("HOA dues
have not been confirmed, so PITIA and the complete monthly housing obligation cannot
yet be determined") rather than implying the payment will be higher. Fixed an adjacent
bug found while touching that line: a confirmed `$0` HOA was incorrectly flagged as
"unconfirmed" by a falsy (`!snapshot?.hoaMonthly`) check instead of a null
(`snapshot?.hoaMonthly == null`) check.

**Reasoning:** A live ChatGPT response revealed three semantic issues traced back to
this contract: (1) 740-credit framing implying the neutral rate was credit-based —
fixed at the data layer by removing the field; (2) an unconfirmed HOA turned into "the
payment will be higher" (an UNKNOWN → NEGATIVE inference) — fixed at the data layer by
narrowing the claim; (3) a "condominium project health" narrative asserted with no
HomeRates data behind it — traced to pure LLM synthesis (confirmed via repo-wide grep:
zero matches for that phrase anywhere in this codebase) rather than a HomeRates-authored
string, so addressed instead via a claim-discipline paragraph added to the MCP tool's
own `TOOL_DESCRIPTION` (read as tool metadata, not a contract field) rather than a
brittle string-matching hack — per explicit task instruction to prefer model guidance
over string hacks for content this codebase never emitted in the first place. This last
fix cannot be verified by an automated test, only by observing a future live response.

**Status:** Built, tested (`scripts/test-response-semantics-cleanup.ts`), pushed to
`dev` (commit `211b288f`).

---

## AD-18 — Demand-driven resolution: await cachePropertyResult() instead of firing it and forgetting it (SHIPPED — PARTIAL FIX, root cause not fully closed)

**Decision:** `app/api/property/lookup/route.ts`'s `handleAddress()` now `await`s
`cachePropertyResult()` at both call sites (the `redfin_url` branch and the
`broad_search` branch) instead of firing it with `void` and returning the HTTP response
immediately. `cachePropertyResult()` itself already swallows every internal error and
resolves to `void`, so awaiting it cannot turn a persistence failure into a request
failure — it only removes the window where the response can claim success before the
write has committed. `lib/externalPropertyResolution.ts`'s internal outcome logging was
also split: a single `RESOLUTION_FAILED` used to conflate "the self-fetch itself came
back `ok:false`" (no persistence was ever attempted) with "the self-fetch said `ok:true`
but the immediate `resolvePropertyId()` re-check still found nothing" (the race this fix
targets) — now `RESOLUTION_FAILED_PROVIDER`, `RESOLUTION_FAILED_POST_PERSISTENCE`, and
`RESOLUTION_FAILED_SHAPING` are logged as distinct internal outcomes (the external
contract's `NOT_AVAILABLE` text is unchanged — this split is internal-observability only).

**Reasoning:** Direct timing reproduction (not inferred — a real address, `1344 Carroll
Ave, Los Angeles, CA 90026`, confirmed absent from the corpus beforehand) proved the
fire-and-forget write was a genuine, observable race: the self-fetch reported `ok:true`,
the immediate follow-up `resolvePropertyId()` call (run milliseconds later, same
process) found nothing, and the row eventually appeared under the exact expected
`address_full` key roughly ten minutes later with no intervening request. This directly
produces a false `NOT_AVAILABLE` to an external caller for a property HomeRates actually
went on to acquire successfully.

**Known limitation — do not read this as fully solved:** a retest against 4 fresh real
addresses AFTER the fix (`2919 N Main St`, `3800 Lincoln High Pl`, `2103 Johnston St`,
`2246 Duvall St`, all Los Angeles CA 90031, all confirmed absent from the corpus
beforehand) still showed the identical *observable* symptom
(`RESOLUTION_FAILED_POST_PERSISTENCE`) for 3 of 4 — one (Main St) was a genuine, correct
provider failure (no Redfin/broad-search candidate ever found, nothing persisted,
consistent). Of the other three, two (Lincoln High Pl, Johnston St) eventually appeared
in the corpus under the correct key anyway; one (Duvall St) never appeared at all even
after extended elapsed time. A same-process write-then-immediate-read control (a direct
Supabase insert + read in a single script) was confirmed instant and fully consistent,
ruling out generic Supabase eventual-consistency as the explanation. The awaited-write
fix is correct and necessary and eliminates the specific mechanism proven above, but a
second, NOT YET ISOLATED contributor to the same-looking symptom clearly remains. Two
unproven candidates worth a dedicated follow-up (do not implement from this note alone):
(1) in the `redfin_url` branch, `result.clone().json()` is wrapped in a try/catch whose
catch only logs a warning — if that parse throws, `identityFailed` never gets set and
`handleAddress()` returns the original response completely ungated, with the identity
check and `cachePropertyResult()` never running at all; (2) if `handleUrl(redfinUrl)`
itself returns `ok:false`, `handleAddress()` returns that failure immediately and never
attempts `broadSearchFallback()` at all — a distinct, separately-discovered defect in the
same function, not yet confirmed to explain the observations above but worth checking.
This session's local Windows dev-server logging could not reliably capture server-side
console output to isolate further within this workstream's scope — a real environment
limitation, not a decision to stop investigating.

**Status:** Built, verified via direct timing reproduction (proves the fixed mechanism)
and a post-fix retest (proves the fix is necessary but not sufficient — see limitation
above), NOT pushed to `dev` yet at the time this entry was written — pending the commit
this entry accompanies. No test file was added (see the limitation note — a real,
reliable regression test for this class of race needs server-side timing visibility this
session could not establish; a naive test would either be flaky or would not actually
exercise the timing window).

**Addendum (2026-09-09, production verification):** the residual noted above did NOT
reproduce against real production infrastructure — 9 real, corpus-absent addresses
tested directly against `chat.homerates.ai` after this fix reached production (commit
`aa63e170`) showed zero instances of the false-negative symptom (8/9 succeeded and were
reported correctly on the first or an immediate retry; the one failure was genuine,
transient provider variability, confirmed by a plain retry succeeding cleanly). The most
evidence-consistent explanation: the local retest above ran on a Windows `next dev`
server sharing CPU/event-loop with the diagnostic script itself — a materially different
environment from Vercel's isolated serverless functions — not a persistent defect in the
fix. Demand-driven resolution is considered sufficiently trustworthy as of this
addendum; see the North Star Workstream 3 report for the full evidence.

---

## AD-19 — Demand-Triggered Intelligence: decouple financing/ownership-cost from AVM/comps, gate on price basis instead (SHIPPED)

**Decision:** `lib/propertyIntelligence.ts`'s `getPropertyIntelligenceData()` no longer
returns `financing: null, ownershipCost: null` whenever `eligibility === 'unavailable'`
(no AVM AND no comps). It now gates on the actual dependency instead: a usable purchase
price (`listPrice ?? avm`) — the SAME price-selection rule this engine's financing block
already used internally for eligible properties, now just no longer blocked from running
by a broader gate that conflated "not enough data to publicly index" with "no price to
compute financing from." A new `financing.purchasePriceBasis` field
(`{value, source: 'list_price' | 'avm', label}`) discloses which one was used, threaded
through `lib/canonicalPropertyIntelligence.ts`'s `CanonicalFinancing.purchasePriceBasis`
and out to the external contract as `financing_intelligence.purchase_price_basis`
(external contract bumped to `property-intelligence-v1.3` — see
`docs/HOMERATES_EXTERNAL_PROPERTY_INTELLIGENCE_V1.md` §16). `lib/gateway/outputShaping.ts`'s
`mapAvailability()` now reports `PARTIAL` (not `NOT_AVAILABLE`) whenever `financing`/
`ownershipCosts` are populated despite `eligibility === 'unavailable'` — avoiding the
internal contradiction of saying "not available" while returning a populated financing
block. A genuinely price-less property (no list price, no AVM) is completely unaffected
and still reports `NOT_AVAILABLE` with both blocks `null`.

**Reasoning:** Real production evidence (Hobart Blvd and others, North Star Workstreams
1-3) repeatedly showed properties HomeRates had already resolved — real beds/baths/sqft,
real listing status, real list price — collapsing into a bare `NOT_AVAILABLE` purely
because no AVM/comps existed yet, even though the engine's own existing price-selection
rule (`listPrice ?? avm`) was sitting right there, just gated shut. This is not new
valuation methodology: list price is never treated as an AVM, market value, or
HomeRates estimate anywhere in this change — `value_intelligence.avm` stays exactly null
whenever no real AVM exists, structurally separate from financing math, and the new
`purchase_price_basis` field (plus a TOOL_DESCRIPTION addition) makes the distinction
explicit to any external caller. This directly targets the bottleneck North Star
Workstreams 1-3 proved: demand-driven resolution is now trustworthy (Workstream 3), but
a resolved property routinely produced nothing useful. Comparable sales remain a
separate, unresolved problem (require Grok/deep-enrichment, deliberately not addressed
here) — `decision_intelligence`/comps continue to reflect their real absence.

**What was NOT changed:** `eligibility` computation itself (`index`/`noindex`/
`unavailable`) is byte-identical to before. AVM merge logic, LLPA/OBMMI, Rate
Intelligence, Decision Score, `validatePropertyIdentity()`, Gateway/OAuth/MCP
architecture, and the `AVAILABLE`/`PARTIAL`/`NOT_AVAILABLE` status enum are all
unchanged — only which properties map to which status value changed for one specific
case (a price-only, AVM/comps-less property).

**Status:** Built. Regression-verified: `test-response-semantics-cleanup.ts` (9/9),
`test-intelligence-gateway.ts` (58/58 + 2 pre-existing LIMITED), `test-rate-role-correction.ts`
(7/7), `test-first-party-canonical-consistency.ts` (10/10), `test-external-adapter.ts`
(55/55), `test-oauth-flow.ts` (45/45 + 2 pre-existing LIMITED) — the last two initially
showed 2 unrelated failures traced to pre-existing test-corpus pollution (two literal
sentinel addresses had been wrong-matched to an unrelated Kansas property in a past run,
predating Address Identity Hardening; cleaned up, both suites then passed cleanly).
Validated live against 7 real properties spanning every documented case (Hobart-shaped
KNOWN+INCOMPLETE with list price only, AVM-no-comps, AVM+comps AVAILABLE, jumbo,
genuinely price-less). `tsc --noEmit` and full `next build` clean. Pushed to `dev`.
