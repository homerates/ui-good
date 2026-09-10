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

---

## AD-20 — Progressive Intelligence for External AI: Fast-Follow enrichment trigger + progress/CTA disclosure (SHIPPED)

**Decision:** `lib/externalPropertyResolution.ts`'s `resolveExternalPropertyIntelligence()`
now calls a new `triggerFastFollowEnrichmentIfNeeded()` at every return point. Whenever
the response it's about to return has `intelligence_progress.status === 'enriching'`
(comps and location narrative both still absent), it schedules — via Next.js's `after()`,
never awaited, never blocking the response — a POST to the existing
`/api/beta/grok-property` endpoint (`deep: true`), the exact same call app/chat/page.tsx's
own background IIFE already makes after rendering a property card. This persists to the
existing `grok_property_cache` table; the very next call to
`buildCanonicalPropertyIntelligence()` for that property (a first-party page load, a
follow-up external call, or the passive deep-enrichment cron) picks the new data up
automatically — no new pipeline, no new cache, no new job/state table.

Two new external-contract fields (`property-intelligence-v1.4`, see
`docs/HOMERATES_EXTERNAL_PROPERTY_INTELLIGENCE_V1.md` §16) make this visible to a
calling AI: `intelligence_progress` (`enriching`/`enriched`, per-layer completion,
`follow_up_recommended`) and `deep_intelligence` (an address-keyed, never
internal-id-keyed, destination — `https://chat.homerates.ai/property-intel?address=...`
— plus a capability summary). Both fields are purely derived from already-computed
canonical fields.

**Reasoning:** Tracing the actual first-party product (not assuming from UI labels)
found it already behaves progressively: `app/chat/page.tsx` renders the property/
financing card immediately from L1 (financial) + whatever L2 (property/AVM) is on hand,
then a `void (async () => {...})()` background IIFE checks `featured_properties` →
`grok_property_cache` → falls back to a live POST to `/api/beta/grok-property`, and once
that resolves, updates the SAME chat message's card via `setMessages` with L3 (market)/
L4 (location). An external AI caller has no browser tab to run that follow-up itself —
without this change, a demand-driven property either got its comps/location from the
unrelated passive cron (unbounded wait) or never at all within any session a ChatGPT
user would realistically continue. This closes that gap using only infrastructure that
already existed (same endpoint, same cache, same downstream read), matching Workstream 5's
finding that comps require Grok specifically, and Grok (85s/140s timeout) can never be
part of the synchronous response itself.

**What was NOT changed:** `availability`/`financing_intelligence`/`ownership_cost_intelligence`
semantics (Workstream 4, AD-19) are untouched — this only adds two new fields alongside
them. Eligibility, canonical methodology, identity validation, Rate Intelligence,
Decision Score, and Gateway/OAuth/MCP architecture are all unchanged. No new provider —
Grok is an existing, already-shipped enrichment primitive, now also invocable
synchronously-triggered (never synchronously-awaited) from the external path.

**Known, accepted, bounded characteristic:** there is no debounce/job-state table
preventing a rapidly repeated request for the same not-yet-enriched address from firing
more than one Fast-Follow trigger before the first completes and writes the cache —
bounded by the Gateway's own existing per-credential/per-partner rate limits (10/min,
30/min), not a new limit. Building a dedicated debounce mechanism was judged unnecessary
complexity for a cost already bounded by existing infrastructure.

**Status:** Built. Regression-verified: `test-response-semantics-cleanup.ts` (9/9),
`test-intelligence-gateway.ts` (58/58 + 2 pre-existing LIMITED),
`test-rate-role-correction.ts` (7/7), `test-first-party-canonical-consistency.ts`
(10/10), `test-external-adapter.ts` (56/56 — R-J's old invariant, "never reference Grok
at all," was itself obsoleted by this decision and rewritten to check the real
invariant, "never block on Grok"; new R-K added to prove the trigger fires exactly once
per newly-resolved property), `test-oauth-flow.ts` (44/45 + 2 pre-existing LIMITED — the
one failure is the already-documented UTC-minute-boundary rate-limit test flakiness
pattern from rapid repeated suite runs, reproduced by re-running the suite back-to-back
several times in immediate succession; not a regression). Both test files gained a
`/api/beta/grok-property` fetch intercept (matching the existing `/api/property/lookup`
intercept pattern) so the regression suite never fires real Grok/xAI calls.

Live-validated end to end against a real, corpus-absent property
(`4048 Perlita Ave, Los Angeles, CA 90039`): first external call resolved and persisted
the property in 8.8s, returned `PARTIAL` with financing intelligence and
`intelligence_progress.status: 'enriching'`; the real Grok trigger landed 3 comparable
sales in `grok_property_cache` within 15s (well under the 85-140s worst-case ceiling this
run, though that ceiling is still what the design accounts for); a follow-up call for the
same address reused the identical canonical property id and returned
`intelligence_progress.status: 'enriched'` with the 3 comps and a location narrative,
with zero new code needed for that retrieval path; the `deep_intelligence.destination`
URL returned a real HTTP 200.

---

## AD-21 — ChatGPT Invocation Behavior: TOOL_DESCRIPTION refinement from real observed sessions (SHIPPED)

**Decision:** `app/api/mcp/property-intelligence/route.ts`'s `TOOL_DESCRIPTION` was
rewritten based on **real, manually-observed ChatGPT production sessions** (not
simulated) against 4 real prompts on the live OAuth-connected MCP connection — the first
time this repo has had actual third-party-model behavioral evidence to work from, as
opposed to inferring model behavior from the contract alone. Three real, specific gaps
were closed:
1. **Follow-up offer.** ChatGPT correctly recognized `intelligence_progress.status:
   'enriching'` and said so, but never offered to check again. Added an explicit
   instruction to offer a follow-up when enriching, without implying guaranteed timing.
2. **CTA genericization.** ChatGPT surfaced the correct property-specific
   `deep_intelligence.destination` link but reduced its own `capability_summary` to "view
   the property report," losing the actual content description. Added an instruction to
   relay what `capability_summary` says, not genericize it — and made `capability_summary`
   itself **dynamic** (`computeDeepIntelligenceCta()` in `lib/gateway/outputShaping.ts`),
   composed from the same `raw.comps`/`raw.location` fields `intelligence_progress` reads,
   so the two fields can never disagree about what's actually present, and never promise
   comps/location before they exist.
3. **Unsupported valuation-range synthesis.** ChatGPT correctly said no usable AVM
   existed, then independently stated a specific "$840,000-$880,000 market-supported
   zone" HomeRates never returned. Traced and confirmed (see below) this was ChatGPT's
   own synthesis over the 5 real comparable sales HomeRates did supply (their average is
   $847,600 ≈ $848K) — not a HomeRates field, not derived from a canonical range. Added an
   explicit guardrail: HomeRates evidence may be interpreted ("above the comparable
   median"), but a specific dollar figure or range must never be stated as a conclusion
   unless `value_intelligence.avm` itself carries it.

Invocation territory itself (when to call HomeRates at all) needed no change — real
evidence showed `"Tell me about [address]"` (no "analyze" keyword, no explicit request)
already correctly triggered the tool, and claim discipline for asking-price/AVM/HOA/
due-diligence framing was already working. Per this workstream's own explicit principle,
none of that was touched.

**AVM discrepancy trace (the $848K question) — CLASSIFIED, NOT A METHODOLOGY BUG:**
Test evidence separately surfaced a live first-party `featured_properties.l2_summary` of
*"Listed +6.1% vs AVM $848K"* for the same property (16424 S Denker Ave, Gardena, CA
90247) that the external contract correctly reported `value_intelligence.avm.value: null`
for. Traced directly against real data:
- `properties.latest_value`: null. Snapshot `estimatedValue`: null. `grok_property_cache`:
  `zillow_estimate`/`redfin_estimate` both **undefined** (Grok did not return either for
  this property) — only 5 real `comparable_sales` and a `market_median_price` came back.
- `buildCanonicalPropertyIntelligence()` (the single source both first-party's
  `/api/property/intelligence` and the external MCP contract read): `valuation.pointEstimate:
  null`, `valuation.sources: []` — genuinely no AVM, confirmed correct on both surfaces.
- The $848K figure is the **average of the 5 real comparable sales** ((760000+842000+
  750000+935000+951000)/5 = 847,600) — traced to `app/chat/page.tsx`'s Decision Score L2
  "deep" refresh (`const deepAvm = zillow_estimate ?? redfin_estimate ?? compsAvg; const
  l2deep = scoreL2({listPrice, avm: deepAvm})`), a client-side-only computation that has
  never been migrated onto the canonical builder (Stage E migrated the property_lookup
  card's PITI/financing display, not this separate Decision Score L2 refresh path) and
  independently blends comps into a value it then hands to `scoreL2()`, whose own summary
  text unconditionally labels its second input "AVM" regardless of what produced it.

**Classification: D — Source Semantics Divergence.** `L2` is legitimately using a value
(a comps average, a defensible fallback heuristic on its own terms) that should not be
*labeled* an AVM. This is confirmed from code and data, not assumed. Canonical
methodology, `mergeAvm()`, eligibility, and `scoreL2()`'s scoring formula are all
correctly unchanged and untouched by this decision — the external contract was already
right; ChatGPT was already right to say no usable AVM existed. The bug is real but lives
entirely in `app/chat/page.tsx`'s first-party Decision Score L2 label text, a different
surface than this workstream's scope (MCP/external contract). **Recorded here as an OPEN
TECHNICAL ISSUE, not fixed in this workstream:** `app/chat/page.tsx`'s deep-refresh L2
summary should either use a real AVM source only, or explicitly label a comps-average
fallback as such (e.g. "vs comp average $848K," not "vs AVM $848K") — a first-party UI
text fix, out of this workstream's explicit scope, for a future task to pick up.

**What was NOT changed:** canonical Property Intelligence, `mergeAvm()`, eligibility,
`scoreL2()`, Rate Intelligence, Decision Score, resolution, enrichment providers, OAuth,
Gateway security, identity validation. `contract_version` stays `property-intelligence-v1.4`
— `capability_summary`'s value became more accurate/dynamic, but its field name, type,
and meaning are unchanged, so this is not a shape/meaning change under this repo's own
versioning policy.

**Status:** Built. New `scripts/test-chatgpt-invocation-contract.ts` (7/7) proves the
TOOL_DESCRIPTION text contains the three new guardrails and that `capability_summary`/
`intelligence_progress` never disagree about what's actually present — explicitly a
**contract test**, not a ChatGPT-behavior test; it cannot and does not prove ChatGPT
actually follows this guidance, only that the guidance and derived fields exist and are
internally consistent. That proof only comes from real, manually-run ChatGPT sessions, as
this workstream's Phase 2 evidence was. Full regression: `test-response-semantics-cleanup.ts`
(9/9), `test-intelligence-gateway.ts` (58/58 + 2 pre-existing LIMITED),
`test-rate-role-correction.ts` (7/7), `test-first-party-canonical-consistency.ts` (10/10),
`test-external-adapter.ts` (56/56), `test-oauth-flow.ts` (45/45 + 2 pre-existing LIMITED).
`tsc --noEmit` and full `next build` clean. See
`docs/HOMERATES_CHATGPT_SURFACE_DESIGN_SPEC.md` for the future (unimplemented) consumer
invocation-territory/prompt-library specification this workstream's real evidence
supports.

---

## AD-22 — Deep Intelligence Parity: expose HomeRates' own narrative synthesis (property_analysis, v1.5); source-of-truth audit

**Decision:** `lib/propertyIntelligence.ts`'s `getPropertyIntelligenceData()` now also
captures `grok_property_cache.grok_result.grok_intelligence_summary` and `.key_highlights`
(the SAME row already read for comps/market/location fields — no new query, no new
provider call) as a new `propertyAnalysis: {narrative, highlights}` field, threaded
through `lib/canonicalPropertyIntelligence.ts` and out to the external contract as
`property_analysis` (contract bumped to `property-intelligence-v1.5`). Deliberately
**excludes** `grok_result.buyer_strategy` — see below. `TOOL_DESCRIPTION` gained a
paragraph explaining `property_analysis` is HomeRates' synthesis over public information,
not a valuation, and that any dollar figure inside it is subject to the same
claim-discipline as anywhere else in the response.

**Reasoning — the forensic trigger:** A real property (1123 Seaview Ave, Pacific Grove,
CA 93950) was tested live: ChatGPT correctly received facts, financing, 5 real
comparable sales, and market/location metrics, but concluded *"it is not yet enough to
conclude that the $1.15 million asking price is supported"* — an artificially
conservative answer, because the external contract gave it numbers with no HomeRates
synthesis over them, while the first-party Deep Property Intelligence report displayed
exactly that synthesis (a narrative, highlights, a buyer strategy) reading the identical
`grok_property_cache` row directly. This is the actual root of the parity gap: **not**
missing data, but missing synthesis over data both surfaces already had.

**buyer_strategy is deliberately NOT exposed, and not even captured upstream of
`property_analysis`.** The real Seaview data's `buyer_strategy` field read: *"Contact
owner directly or local agents for off-market access; verify exact sqft and condition
before pursuing, as comps suggest potential for $1.3M+ value."* That last clause is
Grok's own speculative inference over the comps, not a HomeRates-computed conclusion —
exposing it externally would reintroduce, via HomeRates' own data, exactly the
unsupported-valuation-precision problem AD-21's guardrail exists to stop ChatGPT from
inventing on its own. `grok_intelligence_summary`/`key_highlights` were audited directly
(the real Seaview values, and the synthetic test fixtures in
`scripts/test-deep-intelligence-parity.ts`) and contain no comparable invented figures —
safe to expose as `AI INTERPRETATION`.

**Two real, confirmed, first-party-only bugs found during this same audit — traced to
exact code, NOT fixed here (different surface, out of this workstream's scope):**
1. **`app/property-report/page.tsx:342`** — `const avm = resolveAvm(zillow_estimate,
   redfin_estimate) ?? price;` silently falls back to the list price and labels it "AI
   Estimate" whenever Grok returns no independent estimate (exactly the case for
   Seaview) — the precise "list price becomes AVM" anti-pattern this whole session has
   repeatedly forbidden, confirmed live on a surface the canonical-consistency work never
   reached. The same file's L2 summary text (line 999) then says "List priced below AI
   estimate — favorable entry" even when the two figures are identical by construction
   (`avmDiff >= 0` is true at exactly 0). **Confirmed NOT present in canonical or
   external** — both correctly report `avm: null` and `purchase_price_basis: {source:
   'CURRENT_ASKING_PRICE'}` for this exact property (see
   `scripts/test-deep-intelligence-parity.ts` tests A2/A3).
2. **`app/property-report/page.tsx:620,1003`** — `${(data.market_sale_to_list *
   100).toFixed(1)}%` re-multiplies a value that is already a percentage (98.4, not
   0.984), producing a displayed "9840.0%". **Confirmed NOT present in canonical or
   external** — both correctly report `98.4` (see test A5/D, regression-guarded going
   forward).

**Source-of-truth audit finding (investigated, not fixed — a real architectural fact to
document, not a defect to silently patch):** `buildCanonicalPropertyIntelligence()` IS a
genuine single source of truth for first-party's `/api/property/intelligence` route and
the external Gateway/MCP path — confirmed by `test-first-party-canonical-consistency.ts`
staying green across every workstream. It is **not** the only consumer of
`grok_property_cache`, however: `app/chat/page.tsx`'s Decision Score L2 refresh (AD-21)
and `app/property-report/page.tsx`'s AVM/L1-L4 computation (this entry) both read the
same underlying Grok row **directly**, independently, bypassing canonical entirely —
which is exactly why both diverge from canonical/external in ways this workstream's
forensic audits found. This is a real, confirmed "duplicate truth path" pattern, not
resolved by this decision (a full migration of those two first-party surfaces onto
canonical is a separate, larger effort requiring its own confidence decision — first-party
UI behavior, broader blast radius than the Gateway/external surface this session's
authority has focused on).

**Staged-intelligence wording:** `lib/propertyIntelligence.ts`'s `ineligibleReasons`/
`missing` strings were reworded from absolute phrasing ("No usable AVM available", "No
comparable sale on record") to temporal phrasing ("No usable AVM has been retrieved from
current sources yet", "Comparable sales have not yet been retrieved") — HomeRates
assembles intelligence progressively from multiple sources at different times; absence at
one moment does not mean permanent absence. No logic changed, string-only.

**Recommended next steps (documented, NOT implemented this workstream):**
- Fix `app/property-report/page.tsx`'s AVM fallback and sale-to-list multiplication to
  match canonical's already-correct behavior (a first-party UI change, own workstream).
- Consider migrating `app/property-report/page.tsx` and `app/chat/page.tsx`'s Decision
  Score L2 refresh onto `buildCanonicalPropertyIntelligence()` directly, closing the
  duplicate-truth-path pattern at its root (a larger effort, its own confidence decision).
- Consider whether `provenance.source_category` should distinguish "Grok-assisted
  synthesis contributed" from pure `PUBLIC_LISTING_DATA` once `property_analysis`/comps/
  location are present — not changed this workstream (would need its own audit of
  `mapSourceCategory()`'s current, narrower meaning).
- Consider first-party Deep Property Intelligence report disclosure language (multi-source
  assembly, staged availability, AI-synthesis framing) — a first-party UI copy change, out
  of this workstream's scope.

**What was NOT changed:** Decision Score methodology, L1-L4 weights, L2 methodology, Rate
Intelligence, LLPA, property identity rules, demand-driven acquisition architecture, Grok/
Tavily/OpenAI provider architecture, OAuth, Gateway security, public Plugin visibility.

**Status:** Built. New `scripts/test-deep-intelligence-parity.ts` (12/12), including
direct assertions against the real, live Seaview property. Full regression:
`test-chatgpt-invocation-contract.ts` (7/7), `test-response-semantics-cleanup.ts` (9/9),
`test-intelligence-gateway.ts` (58/58 + 2 pre-existing LIMITED),
`test-rate-role-correction.ts` (7/7), `test-first-party-canonical-consistency.ts` (10/10),
`test-external-adapter.ts` (56/56), `test-oauth-flow.ts` (45/45 + 2 pre-existing LIMITED).
`tsc --noEmit` and full `next build` clean. Pushed to `dev` only — NOT merged to `main`,
per explicit instruction this workstream.

---

## AD-23 — Source-of-truth audit (WS9): asking-price-as-AVM and sale-to-list bugs found on 5 more surfaces than AD-22 knew about; fixed via one shared helper, NOT a canonical-convergence rewrite

**Decision:** AD-22 traced exactly two known "duplicate truth path" bugs on
`app/property-report/page.tsx` (list price silently presented as "AI
Estimate"; `market_sale_to_list` re-multiplied into "9840.0%") and flagged,
but did not fix, either. This workstream's mandate was to inventory *every*
property-intelligence consumer by reading actual code, not filenames — that
inventory (13 files matched a grep for the shared scoring primitives; a
follow-up direct-code trace of all of them) found the identical bug class
present on **four more surfaces** nobody had audited: `app/wl-report/page.tsx`
(the exact same "AVM-as-price" + double-percentage pair), and a narrower
sale-to-list-normalization-only gap in `app/property-intel/page.tsx` (two
call sites) and `app/instant/page.tsx`. `app/chat/page.tsx`'s two Decision
Score L2/L3 refresh sites and `app/api/instant-score/route.ts` already had the
sale-to-list guard correctly in place (from AD-21/earlier work) and never had
the AVM-as-price bug to begin with — they were the reference-correct
implementation this fix brought the other five sites up to.

**The fix, in full:**
1. `resolveAvm(...)` call sites in `app/property-report/page.tsx` and
   `app/wl-report/page.tsx` no longer fall back to `?? price` — `avm` stays
   properly nullable, matching canonical's `purchase_price_basis` behavior.
   Every avm-dependent display ("AI Estimate", "vs. List", the L2 decision-row
   sub-text, the Track5 handoff URL's `l2_summary`) is now gated on
   `avm != null`.
2. When `avm` is null, both pages show `market_median_price` labeled "Market
   Median" (with an explicit "no independent valuation estimate retrieved
   yet" caption) instead of hiding the valuation section entirely — Phase 5's
   "prefer showing valuation context over hiding intelligence."
3. The "favorable entry" / "List priced below AI estimate" claim now requires
   a strictly positive `avmDiff` (`> 0`), not `>= 0` — it no longer asserts a
   favorable entry when list price and AVM are identical by construction (a
   second bug AD-22 had already named but left unfixed on this same line).
4. A new shared `normalizeSaleToList()` helper in
   `lib/scoring/decisionScore.ts` (next to `resolveAvm`) replaces what turned
   out to be **six inconsistent inline copies** of the same one-line ">2 ?
   raw/100 : raw" guard (two of which — property-report, wl-report — were
   simply missing, which is what produced "9840.0%"; two more —
   property-intel, instant — were also missing it before this fix). All eight
   call sites across the codebase that feed a Grok-sourced sale-to-list value
   into `scoreL3()` (including the two that already had it right) now call
   the one shared function. This is a formatting-helper consolidation, not a
   new truth path — it removes duplicate logic rather than adding any.

**What was deliberately NOT done, and why (the confidence-gate call for this
workstream):** The same audit found **nine** total first-party/API surfaces
that independently recompute some subset of AVM/L1-L4/composite from raw
Grok/Redfin data rather than consuming `buildCanonicalPropertyIntelligence()`
— five that recompute AVM+scores from scratch (`property-report`, `wl-report`,
`property-intel`, `instant`, `instant-score` API) and four more that
recompute only the composite from caller-supplied L1-L4 inputs
(`featured-properties`, `buyer-sessions` list + `[id]`, `track5`). Converging
all of these onto canonical output is the "large architectural rewrite" the
user's own WS8 clarification explicitly said needs a separate confidence
decision, not a byproduct of a bug-fix workstream — first-party UI blast
radius, multiple independently-evolving product surfaces (partner API,
consumer report pages, Track5 session flow), no canonical equivalent yet
exists for several of these pages' exact inputs (e.g. `instant-score`'s
partner contract shape). This workstream fixed the two specific,
low-risk, high-confidence bug patterns it was chartered to fix — asking-
price-as-AVM and the sale-to-list unit mismatch — everywhere that exact
pattern was found, and stopped there. No Decision Score methodology, weight,
or formula changed anywhere; `lib/scoring/decisionScore.ts`'s L1-L4/composite
math is untouched except for the additive `normalizeSaleToList` export.

**Full truth-path inventory (Phase 1 deliverable, for the next workstream that
picks up convergence):**

| Surface | Canonical used? | Duplicate logic? | Risk of contradiction |
|---|---|---|---|
| `lib/propertyIntelligence.ts` / `buildCanonicalPropertyIntelligence()` | — (the source) | — | — |
| `app/api/property/intelligence/route.ts` | YES | NO | LOW |
| Gateway `outputShaping.ts` / MCP route | YES | NO | LOW |
| `app/property-report/page.tsx` | NO | YES (fixed this workstream) | was HIGH, now LOW |
| `app/wl-report/page.tsx` | NO | YES (fixed this workstream) | was HIGH, now LOW |
| `app/chat/page.tsx` (L2/L3 deep refresh) | NO | YES (pre-existing, already correct) | MEDIUM |
| `app/property-intel/page.tsx` | NO | YES (sale-to-list fixed; AVM fallback chain has no price-fallback) | MEDIUM |
| `app/instant/page.tsx` | NO | YES (sale-to-list fixed) | MEDIUM |
| `app/api/instant-score/route.ts` | NO | YES (pre-existing, already correct; partner API contract) | MEDIUM |
| `app/(consumer)/check-property/page.tsx` | NO | YES (L1/L2/PersonalFit; no AVM-as-price fallback found) | LOW-MEDIUM |
| `app/api/featured-properties/route.ts`, `buyer-sessions[/[id]]/route.ts`, `track5/page.tsx` | NO | PARTIAL (composite recompute from caller-supplied L1-L4 only) | LOW |
| `app/components/DecisionScoreCard.tsx` | N/A (pure display) | NO | LOW |
| `app/api/beta/grok-property/route.ts` | N/A (upstream data source, peer to canonical, not a consumer) | NO | — |
| `app/admin/blueprint/page.tsx`, `app/autonomous-intelligence/page.tsx` | N/A (docs/marketing, no data) | NO | — |
| `app/api/investor-intel/route.ts` | N/A (distinct product domain — rental yield, not sale valuation/Decision Score) | NO | — |
| `app/api/cron/property-intelligence-deep-enrich/route.ts`, `-publish/route.ts` | N/A (orchestration/corpus-anchoring, no scoring) | NO | — |

**Live Seaview verification (real property, not synthetic):** confirmed the
property-report/wl-report-equivalent AVM computation (`resolveAvm` on the real
`grok_property_cache` row) stays `null` for this property — same truth state
canonical already reports (`valuation.pointEstimate: null`) — and that the
normalized sale-to-list is `0.984` (displays "98.4%"), matching canonical's
`market.saleToListPct: 98.4` exactly.

**What was NOT changed:** Decision Score methodology, L1-L4 weights, L2/L3/L4
formulas themselves, Rate Intelligence, LLPA, property identity rules,
demand-driven acquisition architecture, Grok/Tavily/OpenAI provider
architecture, OAuth, Gateway security, public Plugin visibility, the external
contract (still v1.5 — this workstream touched zero Gateway/MCP/schema
files).

**Status:** Built. New `scripts/test-firstparty-valuation-integrity.ts`
(29/29), including live assertions against the real Seaview property proving
first-party's fixed logic now agrees with canonical's truth state for this
exact property. Full regression: `test-chatgpt-invocation-contract.ts` (7/7),
`test-deep-intelligence-parity.ts` (12/12), `test-response-semantics-cleanup.ts`
(9/9), `test-intelligence-gateway.ts` (58/58 + 2 pre-existing LIMITED),
`test-rate-role-correction.ts` (7/7), `test-first-party-canonical-consistency.ts`
(10/10), `test-external-adapter.ts` (56/56), `test-oauth-flow.ts` (45/45 + 2
pre-existing LIMITED). `tsc --noEmit` and full `next build` clean. Pushed to
`dev` only — NOT merged to `main`, per explicit instruction this workstream.

---

## AD-24 — Intelligence Gateway Capability Architecture (WS10): full capability inventory; new `get_benchmark_rates` tool (benchmark-rates-v1)

**Decision:** A full code-traced inventory (4 parallel research passes) of every
HomeRates capability that could plausibly become a second external AI tool
found exactly one candidate that is genuinely ready today: neutral, national
FRED benchmark mortgage rates (30yr fixed / 15yr fixed / 5-1 ARM). Built and
shipped `get_benchmark_rates` as a second tool on the existing MCP server
(`app/api/mcp/property-intelligence/route.ts` — same URL, same OAuth resource,
zero new endpoint). Every other evaluated candidate (deterministic PITI
calculator, full affordability, program-rule engines) was found NOT ready and
was deliberately NOT built — see the maturity findings below.

**Why this is the right first addition:** the FRED/OBMMI market-data pipeline
(`lib/market-data/*`, AD-11) is the single most mature, consolidated piece of
infrastructure found in this entire audit — one real ingest path, daily sync,
genuine per-observation `asOf` dates, and an already-hardened boundary
(`lib/gateway/outputShaping.ts`'s existing Rate Role Correction) between the
neutral national rate (safe to expose) and the OBMMI/LLPA-segmented,
borrower-profile-assuming rate (never exposed, unchanged). The only real gap
was that the *existing* external `market_rate` field carries no as-of/
freshness metadata at all — `get_benchmark_rates` closes exactly that gap as
its own dedicated capability, rather than retrofitting the property-
intelligence contract.

**What was built:**
- `lib/market-data/benchmarkRates.ts` — pure read over `lib/market-data/query.ts`'s
  `getLatest()` for `MORTGAGE30US`/`MORTGAGE15US`/`MORTGAGE5US`. Computes
  `freshnessStatus` (`CURRENT`/`STALE`/`UNAVAILABLE`) from the real observation
  date with a 10-day threshold (tuned for these series' actual weekly
  publish cadence — a new, narrower threshold than outputShaping.ts's 30-day
  property-enrichment staleness check, a different question).
- `lib/gateway/benchmarkRatesSchema.ts` / `benchmarkRatesShaping.ts` — a second
  versioned external contract (`benchmark-rates-v1`), same explicit-allow-list
  shaping discipline as the existing contract, same `claim_type` pattern
  (`MARKET FACT` throughout), same `EDUCATIONAL_DISCLAIMER` reuse (never a
  hand-written duplicate string).
- `lib/gateway/benchmarkRatesGateway.ts` — a second Gateway capability
  function, `getBenchmarkRatesGated()`, following the IDENTICAL required
  order of operations as `getPropertyIntelligence()` (kill-switch → auth →
  scope → rate-limit → build → schema-validate → log), reusing every existing
  building block (`authenticateRequest`, `checkAllLimits`, `isCircuitOpen`/
  `isKillSwitchEnabled`, `logRequest`) verbatim. Zero changes to the existing
  property-intelligence pipeline.
- `lib/gateway/auth.ts` gained one additive export, `requireAnyScope()` (OR-
  logic scope check) — does not change `requireScope()`'s existing single-
  scope behavior at all.
- `lib/gateway/credentials.ts`'s `ALLOWED_GATEWAY_SCOPES` gained
  `'benchmark_rates:read'` (additive array extension only).
- **OAuth/security model deliberately untouched, per explicit instruction.**
  `get_benchmark_rates` accepts EITHER the existing `property_intelligence:read`
  scope (so the live ChatGPT OAuth integration — locked to
  `SUPPORTED_OAUTH_SCOPE = 'property_intelligence:read'`, unchanged — can call
  the new tool immediately, with zero re-authorization) OR the new, narrower
  `benchmark_rates:read` scope (for a future admin-issued partner credential
  that should see rates but not property data). This is the reason a new
  scope did not require any OAuth route/well-known/consent-screen change.
- `app/api/mcp/property-intelligence/route.ts` — `tools/list` now advertises
  both tools; `tools/call` dispatches by name to whichever Gateway function
  applies. The shared UNAUTHORIZED/FORBIDDEN → HTTP mapping was extracted
  into one `mapGatewayRejection()` helper (parameterized by which scope to
  advertise in a 403) rather than duplicated a second time.

**Full capability inventory (Phase 1-2 deliverable):**

| Capability | Maturity | Classification |
|---|---|---|
| Property Intelligence (canonical) | Mature, single source of truth for its own path | READY (already exposed) |
| FRED national benchmark rates (30yr/15yr/ARM) | Real ingest, daily sync, real `asOf`, hardened boundary vs. OBMMI/LLPA | **READY — built this workstream** |
| OBMMI segmented rates / LLPA-adjusted rate | Real data, but borrower-profile-assuming; already deliberately never exposed | DO NOT EXPOSE (locked, unchanged) |
| Deterministic PITI / mortgage calculator | 5+ independently-maintained engines with CONFIRMED real numeric divergence (tax 0.0125 vs 0.011 vs 0.012 vs real lookup; insurance 0.3% vs 0.5%; PMI rate 0.55% vs 0.8% in two "affordability" engines; FHA MIP computed on base loan in one engine, total loan in another) | DO NOT EXPOSE — needs canonicalization first |
| Affordability (reverse PITI) | Two independently-maintained solvers, disagreeing PMI rate | NEEDS CANONICALIZATION FIRST |
| Conforming/high-balance loan limits | Real, current (2026 FHFA/HUD), county-aware core engine (`lib/loanLimits2026.ts`/`loanLimitsNational2026.ts`/`lib/pricing/conforming-limits.ts`) — but two first-party pages (`property-report`, `wl-report`) bypass it with a stale hardcoded national threshold | NEAR READY (engine is solid; needs its own scoped follow-up before external exposure — zip/county input design not yet scoped) |
| FHA program logic | MIP math real (HUD ML 2023-05); loan-limit check inside `lib/fhaCalculator.ts` uses a stale 2024 constant, conflicting with the current county table | INTERNAL ONLY — internal drift needs fixing first |
| VA program logic | Real funding-fee table, correctly county-aware, no drift found — the most mature government-loan engine | NEAR READY (no external product built yet, but engine itself is solid) |
| USDA | Not found anywhere in the codebase | DO NOT EXPOSE (does not exist) |
| Jumbo | Anchor rate real-when-live, segment table clearly self-labeled estimated | INTERNAL ONLY |
| DSCR ratio calculation | Real, deterministic (rent/PITIA); qualification thresholds are HomeRates' own approximation, not one published rule | INTERNAL ONLY |
| AMI qualifier | Real, government-data-backed (FHFA/HUD), vintage-tracked; one flagged approximation (`ami50`) | NEAR READY (own product surface already; not evaluated as an external tool this workstream) |
| DPA program matching | Real matching logic over vendor/lender-submitted (not government-registry) program data | INTERNAL ONLY |
| Decision Score (L1-L4/composite) | Locked methodology; L1's per-program LTV curve is explicitly HomeRates' own heuristic, not an agency rule — risk of misrepresentation if ever exposed without that caveat | DO NOT EXPOSE (not evaluated for external exposure this workstream; locked methodology untouched) |
| Rate Intelligence / Personal Fit | Locked, internal-only by design | DO NOT EXPOSE (unchanged) |

**Current external surfaces (Phase 3):** exactly one MCP endpoint
(`app/api/mcp/property-intelligence/route.ts`), now two tools. OAuth 2.1 flow
(authorize/token/two well-known routes) unchanged. `/api/instant-score` (the
pre-existing non-Gateway partner API) was found to have **zero
authentication** despite its own `/developers` docs page implying an API key
is required, and blocks synchronously on the full 85-140s deep-Grok call —
flagged, not fixed this workstream (a different, pre-existing surface, its
own confidence decision). No OpenAPI spec or MCP/OAuth-facing developer docs
exist; `llms.txt` and a 14-AI-bot `robots.txt` allowlist do.

**Property Intelligence scope check (Phase 4):** APPROPRIATE — not overloaded,
not too narrow. It answers "tell me about this property"; the new tool
answers a genuinely distinct intent ("what's a current rate") that a model
can cleanly distinguish, per the Phase 4 test. Not split, not merged.

**Confidence gate:**
CAPABILITY INVENTORY 90% · CANONICAL MATURITY 65% · RATE-DATA 90% ·
CALCULATION-ENGINE 25% (genuinely not ready — real, confirmed divergence) ·
PROGRAM-RULE 60% · PROVENANCE 80% · LATENCY/DEPENDABILITY 90% ·
INVOCATION-CLARITY 80% · TECHNICAL 85% · NORTH STAR 85% · **OVERALL: MEDIUM**
(one capability clearly HIGH-confidence and shipped; the calculation engine
specifically is LOW and was correctly not forced).

**What was NOT changed:** Decision Score methodology, L1-L4 weights, Rate
Intelligence methodology, LLPA methodology, property identity rules,
demand-driven acquisition architecture, Grok provider architecture, OAuth/
security model (the new scope is additive-only; `SUPPORTED_OAUTH_SCOPE` and
every OAuth route are byte-for-byte unchanged), public Plugin visibility
(still on hold).

**Status:** Built. New `scripts/test-benchmark-rates-gateway.ts` (26/26).
Updated `scripts/test-external-adapter.ts`'s two hardcoded "exactly one tool"
assertions to expect both tools (a correct, expected update given the new
tool, not a regression). Full regression: `test-intelligence-gateway.ts`
(58/58 + 2 pre-existing LIMITED), `test-external-adapter.ts` (56/56),
`test-oauth-flow.ts` (45/45 + 2 pre-existing LIMITED),
`test-response-semantics-cleanup.ts` (9/9), `test-rate-role-correction.ts`
(7/7), `test-first-party-canonical-consistency.ts` (10/10),
`test-chatgpt-invocation-contract.ts` (7/7), `test-deep-intelligence-parity.ts`
(12/12), `test-firstparty-valuation-integrity.ts` (29/29). `tsc --noEmit` and
full `next build` clean. Pushed to `dev` only — NOT merged to `main`, no
production push, no Plugin submission work, per explicit instruction this
workstream.

---

## AD-25 — Priority Corrective Workstream: Canonical Deterministic Mortgage Math Integrity

**Decision:** WS10's calculation-engine research (see AD-24) confirmed the
codebase's own `DEBT_REGISTER.md` (2026-06-11, "REPORT ONLY — nothing fixed
yet"): **at least 5 mortgage-math implementations exist**, and had real,
confirmed numeric divergence — not merely duplicate code that happened to
agree. This workstream re-verified every DEBT_REGISTER.md citation directly
against current code (some had already been fixed independently since June;
DEBT-03's zombie block and DEBT-06's `calcDispatcher.ts` citations were both
confirmed clean), found the genuinely-still-live ones, found several NEW
occurrences of the same bug classes the register hadn't cited, and fixed the
minimum set needed to restore "same inputs + same assumptions = same result."

**Confirmed root causes, classified per the required A-G taxonomy:**

1. **(A) Formula/rule error — FHA MIP basis.** `lib/fhaCalculator.ts`'s
   `calculateFHA()` computed monthly MIP on the **total** loan (base + UFMIP);
   `lib/calcEngine.ts`'s `calcFHA()` correctly computes it on the **base**
   loan only, per HUD spec (Handbook 4000.1) — already documented as correct
   in that file's own pre-existing comment. Confirmed real, still-live: the
   Mortgage→FHA reroute in `app/api/answers/route.ts` (~L6912) was still
   calling the legacy, wrong-basis function for every live "FHA loan on a
   $X home" question with income context.
2. **(A) Formula/rule error — FHA MIP rate table, the OTHER direction.**
   `calcEngine.ts`'s `fhaMIPRate()` had the correct MIP *basis* but a
   *less complete* rate table than the legacy engine — it had no
   loan-amount-based "higher-balance" tier (HUD ML 2023-05 charges 0.70-0.75%
   above the current GSE conforming limit, vs 0.50-0.55% below it).
   `fhaCalculator.ts`'s table already had this tier correctly, keyed to a
   stale, hardcoded 2023 threshold ($726,200). Fixed by merging: the complete
   rate table, re-anchored to the real, current `CONF_STANDARD` constant
   ($832,750) instead of a frozen number — not inventing a new rule, combining
   two already-validated halves already present in the repo.
3. **(A) Formula/rule error — a second, independent FHA-MIP-on-total-loan
   bug**, found new this workstream in `app/components/
   AffordabilityIncomeSliderCard.tsx`'s `calcProgram()` (both its binary-search
   objective function and its final result computation) — same root cause as
   #1, different file, not cited in DEBT_REGISTER.md.
4. **(B) Hidden assumption — conventional PMI rate, three+ live variants.**
   Canonical `monthlyPMI()`: 0% ≤80% LTV, 0.30% (80-90%], 0.55% >90%.
   Confirmed different, live variants: `fhaCalculator.ts`'s
   `compareFHAvsConventional()` (flat 0.65%/0.50%, **never zeroed at ≤80%
   LTV** — a real bug independent of the MIP-basis issue), `app/api/answers/
   route.ts`'s two separate inline "conventional comparison" blocks (a 4th
   variant: 0%/0.5%/0.65% with a flat $100/mo insurance; a 5th variant: flat
   0.6% with a flat $150/mo insurance and a hardcoded 1.1% tax), and
   `AffordabilityIncomeSliderCard.tsx` (flat 0.8% regardless of LTV tier).
5. **(B) Hidden assumption — property tax default.** Three unrelated flat
   percentages in live use with no shared source: 1.25% (`app/property-report/
   page.tsx`, `app/wl-report/page.tsx`), 1.1% (`lib/constants.ts`'s
   `TAX_RATE_DEFAULT`, and separately hand-typed in several `app/api/answers/
   route.ts` inline blocks), 1.2% (`app/api/beta/grok-property/route.ts`'s
   `calcPITI()` fallback). `lib/constants.ts` explicitly declares itself
   "SINGLE SOURCE OF TRUTH... update this file only" — 1.25%/1.2% were
   uncontrolled drift, not a second intentional methodology; nothing in the
   repo ever declared them canonical for any purpose.
6. **(B) Hidden assumption — insurance default.** Canonical `INS_RATE_DEFAULT
   = 0.003` (already used by `lib/propertyIntelligence.ts`, itself renamed/
   exported 2026-09-08 specifically because a prior audit found `app/chat/
   page.tsx` using `0.005`). `lib/constants.ts` already labels `0.005` as
   `INS_RATE_HIGH`, explicitly commented **"used in older/legacy paths"** —
   i.e. the repo already knows this value is superseded, this workstream just
   found two more live call sites still using it (`property-report`,
   `wl-report`) plus a flat, non-percentage $1,200/yr override in the FHA
   reroute that didn't scale with purchase price at all.
7. **(F) Rounding only — none material.** The amortization formula itself
   (`lib/math.ts`'s `calcPI` vs `lib/calcEngine.ts`'s `monthlyPI`) was
   confirmed algebraically identical everywhere checked (Scenario A: both
   produce `5056.544187943722` unrounded for an identical $800,000/6.5%/30yr
   loan) — the only real-world divergence came from *assumption* differences
   (B above), never the P&I math itself. No rounding-related consistency
   defect found.
8. **(D/E) Not found as a defect.** No confirmed case of a genuine
   property-fact or program-rule difference being mishandled — `calcFHA()`'s
   real-fact-first pattern (known tax/insurance override the percentage
   default when supplied) was confirmed working correctly everywhere tested.

**The fix (minimal, targeted at the confirmed causes above — no engine
redesign, no affordability redesign):**
- `lib/calcEngine.ts`: `fhaMIPRate()` extended with an optional
  `baseLoanAmount` parameter, adding the loan-amount-tiered rate table
  (anchored to `CONF_STANDARD`, not a new hardcoded number) while keeping the
  correct base-loan-only MIP basis.
- `lib/fhaCalculator.ts`: rewritten as a thin compatibility wrapper —
  `calculateFHA()`/`compareFHAvsConventional()` keep their exact external
  function names, input fields, and output field names (`totalDTI`,
  `qualifies`, etc. — its one real caller reads these), but every number now
  comes from `calcEngine.ts`'s `calcFHA()`/`monthlyPMI()`. No new FHA math
  lives in this file anymore.
- `app/api/answers/route.ts`: the live FHA reroute no longer overrides
  insurance with a flat $1,200/yr; the two independent inline "conventional
  comparison" blocks (found during this audit, not previously catalogued as
  separate engines) now call `calcConventional()` instead of hand-rolling
  P&I/PMI/tax/insurance a 4th and 5th time.
- `app/components/AffordabilityIncomeSliderCard.tsx`: both PMI/MIP
  computations now call `calcEngine.ts`'s `monthlyPMI()`/`fhaMIPRate()`
  instead of flat, untiered rates.
- `app/property-report/page.tsx`, `app/wl-report/page.tsx`: tax/insurance now
  source from `TAX_RATE_DEFAULT`/`INS_RATE_DEFAULT` (these pages have no real
  per-property tax/insurance fact available in their data contract — no
  city/state/annual-tax field — so a real per-property lookup migration was
  not attempted; only the *assumption default* was aligned to the declared
  single source of truth). Their PITI-breakdown table's PMI line now uses
  tiered `monthlyPMI()` instead of a flat 0.8%; their "Property Tax" label no
  longer hardcodes a stale "1.25%" that would have been accuracy-wrong the
  moment the rate itself was fixed. **Their "HOA Dues" row no longer asserts
  a confirmed "$0"** (Phase 11) — it now reads "Unknown," since HOA is never
  a known fact on either page and was previously displayed as a specific,
  false confirmed value while also correctly being excluded from the actual
  PITI total (a real, live HOA-unknown-vs-zero violation, now fixed).
- `app/api/beta/grok-property/route.ts`: `calcPITI()`'s fallback constants
  fixed to the canonical values. **High-impact fix** — this function's output
  unconditionally overwrites Grok's own PITI guess in `mergeResult()` and
  becomes the cached `grok_property_cache.grok_result.estimated_piti` value
  read by every surface that displays a Grok-enriched property's PITI
  (forward-looking only; already-cached rows keep their old value until next
  natural re-enrichment).

**Confirmed NOT touched, deliberately:** `lib/calcAffordabilityScenario()`
(inside `calcEngine.ts` itself) was found to have the SAME base-vs-total-loan
FHA MIP pattern as #1/#3 above, inside its own iterative price-solving loop —
not fixed, because separating base-vs-total loan cleanly inside an iterative
affordability solver is a structural change to the solver itself, and this
workstream's explicit boundary was "DO NOT... redesign affordability."
Documented as a known, deferred finding, not silently left undiscovered.
`lib/calcDispatcher.ts`'s legacy detection-grammar duplication (DEBT-04) and
the full affordability-system consolidation (DEBT-02) are out of scope for the
same reason — this is math-integrity work, not the larger consolidation
DEBT_REGISTER.md separately recommends as its own, later "Phase 4." A
newly-discovered, fully-orphaned duplicate `calcEngine.ts`/`calcDispatcher.ts`/
`cardBuilders.ts` trio at the repo root (zero real importers, confirmed by
direct grep) was **not deleted** this workstream — flagged as a real landmine
for a future hygiene pass, consistent with DEBT-14's existing "repo hygiene"
category, but deleting files was judged unrelated-refactoring risk for a
math-integrity workstream to take on unprompted.

**Live Seaview verification (real property, controlled scenario):** same
purchase price ($1,150,000), rate (6.71%, this property's real
`propertyMarketRate`), 20% down, 30yr — P&I is bit-for-bit identical before
and after ($5,943, since the amortization formula was never the problem);
tax and insurance both changed by a fully-explained amount directly
attributable to the constant fix (tax: $1,198→$1,054/mo, −$144; insurance:
$479→$288/mo, −$191), not an unexplained drift.

**What was NOT changed:** Decision Score methodology, Rate Intelligence
methodology, LLPA methodology (LLPA's own rate math untouched — only the FHA
MIP/conventional PMI primitives), property identity rules, demand-driven
acquisition architecture, Grok provider architecture, OAuth/security model,
the external `benchmark-rates-v1`/`property-intelligence-v1.5` contracts
(unchanged, reverified). No new loan program added, no affordability redesign,
no calculate_mortgage external tool, no MCP/Gateway change.

**Status:** Built. New `scripts/test-mortgage-math-integrity.ts` (42/42) —
Scenarios A/B/C/D/E/G from the required test matrix, all 14 Phase-20
regression requirements, and the real Seaview before/after. Full regression:
`test-intelligence-gateway.ts` (58/58 + 2 pre-existing LIMITED),
`test-external-adapter.ts` (56/56), `test-oauth-flow.ts` (45/45 + 2
pre-existing LIMITED), `test-benchmark-rates-gateway.ts` (26/26),
`test-deep-intelligence-parity.ts` (12/12),
`test-first-party-canonical-consistency.ts` (10/10),
`test-firstparty-valuation-integrity.ts` (29/29),
`test-rate-role-correction.ts` (7/7), `test-response-semantics-cleanup.ts`
(9/9), `test-chatgpt-invocation-contract.ts` (7/7). `tsc --noEmit`, full
`next build`, and the build's own internal `[CalcEngine] All verification
tests passed` / `[AnswerFormat] Format rules verified` checks all clean.
Pushed to `dev` only — NOT merged to `main`, no production push, per explicit
instruction this workstream.

---

## AD-26 — Fix calcAffordabilityScenario's FHA MIP basis (the one remaining item from AD-25)

**Decision:** Closed the single deferred finding from AD-25.
`calcAffordabilityScenario()`'s 6-pass iterative price solver estimated FHA
MIP during convergence as `loan * FHA_MIP_RATE / 12`, where `loan` is the
TOTAL financed loan implied by that iteration's target P&I (`maxPI *
annuityFactor` — P&I is always on the total loan, base+UFMIP for FHA,
correctly unchanged). The function's own POST-loop `mMI` was already
computed on the base loan (matching `calcFHA()`) — only the in-loop estimate
used during convergence was on the wrong basis, nudging the solved
`homePrice` slightly below the true optimum (the inflated MIP estimate
"spent" more of the DTI budget than a correctly-based estimate would).

**Fix:** one line, inside the loop only — back out the base-loan portion
(`loan / (1 + FHA_UFMIP_RATE)`) before applying `FHA_MIP_RATE`, matching the
basis the post-loop code already used. Conventional's in-loop branch,
untouched (no base/total distinction applies — conventional has no UFMIP).
Nothing else in the function changed: DTI target, iteration count, tax/
insurance treatment, down-payment/closing-cost logic, loan-limit capping, and
the returned field shapes are all byte-for-byte unchanged.

**Controlled FHA scenario** ($120k income, $30k savings, $500 debts, 6.5%,
3.5% down, no binding loan-limit cap):

| | BEFORE | AFTER | Δ |
|---|---|---|---|
| Home price (solved) | $490,260 | $490,744 | +$484 |
| Base loan | $473,101 | $473,568 | +$467 |
| UFMIP | $8,279 | $8,287 | +$8 |
| Total financed loan | $481,380 | $481,855 | +$475 |
| Monthly P&I | $3,043 | $3,046 | +$3 |
| Monthly MIP (returned) | $217 | $217 | $0 (already correct pre-fix) |
| Total monthly payment | $3,832 | $3,836 | +$4 |
| Back-end DTI | 43.3% | 43.4% | +0.1pt |

The final *returned* `monthlyMI` field doesn't move (it was already on the
base loan) — the fix's effect is entirely in letting the solver converge to
a very slightly higher affordable home price, since the iteration no longer
over-penalizes the DTI budget with an inflated MIP estimate. Small, exactly
the second-order correction expected from an internal-only basis fix, not a
methodology change.

**What was NOT touched:** affordability solving methodology, DTI thresholds,
income methodology, the iteration algorithm itself, down-payment methodology,
tax/insurance assumptions, loan-limit behavior, rate selection, LLPA,
Decision Score, Rate Intelligence, conventional's own branch, `calcVA()`,
`calcFHA()`, `lib/fhaCalculator.ts`, or any external contract.

**Status:** Built. New `scripts/test-affordability-fha-mip-basis.ts` (11/11):
basis equivalence between `calcFHA()` and the solver across two independent
scenarios, base/UFMIP/total-loan distinctness, P&I still on the total loan,
MIP confirmed no longer matching a total-loan-basis calculation, conventional
and VA behavior unchanged, `monthlyPI()` unchanged, and both external
contracts (`benchmark-rates-v1`, `property-intelligence-v1.5`) reverified
unchanged. Full regression: `test-mortgage-math-integrity.ts` (42/42),
`test-intelligence-gateway.ts` (58/58 + 2 pre-existing LIMITED),
`test-external-adapter.ts` (56/56), `test-oauth-flow.ts` (45/45 + 2
pre-existing LIMITED), `test-benchmark-rates-gateway.ts` (26/26) — two
transient, pre-existing rate-limit/IP-counter timing failures appeared on
first run and cleared on immediate rerun (same documented flakiness class
seen throughout this session, unrelated to this change). `tsc --noEmit`,
full `next build`, and the build's own `[CalcEngine]`/`[AnswerFormat]`
self-tests all clean. Pushed to `dev` only — NOT merged to `main`, no
production push.

---

## AD-27 — Canonicalize known prebuilt scenario prompts and card entry points

**Decision:** Audited the known, user-facing seeded entry points (rather than
reopening the calculator search) — `app/lab/page.tsx`'s 9 scenario modules and
6 program-specific SEO pages' (`fha-calculator`, `va-calculator`,
`dscr-calculator`, `affordability-calculator`, `refinance-calculator`,
`conventional-loan-calculator`) ~28 seed-chip links, ~37 known entry points in
total covering all 9 real card families (Affordability, Conventional/Home
Purchase, High Balance, FHA, VA, Jumbo, DSCR, Refinance, Buydown).

**The prompts themselves were already clean.** Every seed string across all
37 entry points is natural language with no embedded numeric tax/insurance/
PMI/MIP assumption — confirmed by source-inspection regex across the Lab
page and all 6 SEO pages. "At current rates" phrasing correctly defers to
live FRED (`dispatch()`'s `fallbackRate`/`rateAssumption` mechanism, confirmed
by running all 9 Lab seeds through the actual `dispatch()` function);
`refinance-calculator`'s explicit demo rates (e.g. "7.25% → 6.5%") correctly
stay explicit scenario inputs, never silently relabeled current. Running all
9 Lab seeds through `dispatch()` confirmed every one routes to its intended
card family at confidence ≥0.95, with no misrouting found.

**The real drift was in the card-builder layer, not the prompts.** Every one
of the 7 relevant card builders (`affordability`, `conventional`, `dscr`,
`fha`, `jumbo`, `va`, `scenario`) had its own independently re-invented
fallback tax rate (`0.011`/`0.012`) and insurance rate (`0.005`, the same
stale `INS_RATE_HIGH` value the prior two workstreams already fixed
elsewhere) instead of importing `lib/constants.ts`'s
`TAX_RATE_DEFAULT`/`INS_RATE_DEFAULT` — ~16 occurrences across 7 files, all
now fixed to import and use the named constants. Two were live, reachable
defaults (not defensive-only): `lib/cardBuilders/scenario.builder.ts`'s
buydown/seller-credit math (`?? purchasePrice * 0.005`, fires whenever a
caller doesn't pre-supply insurance) and `lib/cardBuilders/fha.builder.ts`'s
FHA→conventional switch-point calculator, which had a flat `$100/mo`
insurance figure regardless of purchase price — the exact same
non-price-scaling bug class already fixed in `app/api/beta/grok-property/
route.ts` during the prior workstream, found independently here.

**Confirmed, NOT fixed (documented per Phase 2's classification, out of this
workstream's card-redesign boundary):** the Lab's "High Balance" module (m3)
and "Home Purchase" module (m2) both route to `type: 'conventional'` and are
built by the identical `buildConventionalCard()` — there is no
loan-limit-aware or county-aware branching anywhere in the conventional path
(`calcConventional()`'s own input type has no loan-limit field at all). The
"High Balance" card's promised framing ("LA County · up to $1,249,125") is
never actually reflected in the delivered card — it's numerically correct
but visually indistinguishable from a plain conventional loan of the same
size. Fixing this would mean adding new loan-limit-aware behavior to
`calcConventional()`/`buildConventionalCard()`, which is card-capability work
explicitly out of this workstream's "do not redesign the cards" boundary —
classified AMBIGUOUS, documented, not touched.

**What was NOT touched:** any calculator formula, any locked program
methodology, LLPA, Rate Intelligence, Decision Score, MCP, Gateway
architecture, the Lab page UI, any card's visual design, `app/api/answers/
route.ts`'s dispatch grammar/detection logic (unrelated to this workstream —
that's DEBT-04, routing-grammar duplication, separately catalogued and out
of scope).

**Status:** Built. New `scripts/test-seeded-scenario-canonicalization.ts`
(31/31): all 9 Lab modules route to their intended card family, FHA/
conventional seeds produce canonical-shaped params with no hard-coded PMI
field, no seed string (Lab or SEO pages) embeds a numeric tax/insurance/PMI
assumption, "current rate" seeds resolve via live FRED, explicit refi demo
rates stay explicit, all 7 card builders now share the canonical constants
with zero re-invented magic numbers, HOA renders only when confirmed
nonzero, and both external contracts reverified unchanged. Full regression:
`test-mortgage-math-integrity.ts` (42/42), `test-affordability-fha-mip-
basis.ts` (11/11), `test-intelligence-gateway.ts` (58/58 + 2 pre-existing
LIMITED), `test-external-adapter.ts` (56/56), `test-oauth-flow.ts` (45/45 + 2
pre-existing LIMITED), `test-benchmark-rates-gateway.ts` (26/26),
`test-deep-intelligence-parity.ts` (12/12),
`test-first-party-canonical-consistency.ts` (10/10),
`test-firstparty-valuation-integrity.ts` (29/29). `tsc --noEmit`, full `next
build`, and the build's own `[CalcEngine]`/`[AnswerFormat]` self-tests all
clean. Pushed to `dev` only — NOT merged to `main`, no production push.
