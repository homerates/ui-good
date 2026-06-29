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
