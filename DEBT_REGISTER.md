# Technical Debt Register — HomeRates.Ai

**Date:** 2026-06-11
**Scope:** Calc pipeline (calcEngine / calcDispatcher / cardBuilders / answers route), dead code, legacy branding, half-migrations, stale config.
**Status:** REPORT ONLY — nothing fixed yet.

## How the calc stack actually looks today

There are **five** mortgage-math implementations in the live codebase, not one:

| # | Engine | Status | Used by |
|---|--------|--------|---------|
| 1 | `lib/calcEngine.ts` + `lib/calcDispatcher.ts` + `lib/cardBuilders/` | Canonical (intended) | `/api/answers` dispatch path |
| 2 | `lib/mortgageCalculator.ts` + `lib/fhaCalculator.ts` | Legacy — **partially live** | `/api/answers` legacy blocks (Mortgage→FHA reroute is live; mortgage block executes then discards) |
| 3 | `lib/scenarioMath.ts` + `lib/ai-providers/` | Legacy — **fully live** | `/api/answers/scenario` (chat routes "compare/vs/cash-out/projection" questions + sticky follow-ups here) |
| 4 | `app/api/calc/` ("calc-v4.0.0-grammar") + `lib/payment.ts` ×2 | **Dead** (zero callers) | Nothing — but routes are publicly exposed |
| 5 | `lib/math.ts` (`calcPI` etc.) | Live, duplicate primitives | All 9 slider card components (client-side) |

Engines 1, 2, 3 and 5 can each produce a monthly payment for the same question, with different PMI rates, insurance assumptions, and FHA MIP rules. **This is the structural cause of the drift you see in daily use.**

---

## Findings — ranked by risk-adjusted value of fixing

### DEBT-01 — Legacy FHA calculator (2024 rules) still answers live questions
**Severity: Critical** · **Causes runtime drift: YES, directly**

- **Files:** [app/api/answers/route.ts](app/api/answers/route.ts) (Mortgage→FHA reroute ~L6699–6743, FHA block ~L6795–6900), [lib/fhaCalculator.ts](lib/fhaCalculator.ts)
- **What:** The Mortgage→FHA reroute path (`mortgageRerouteToFHA`, fires when a "$X home" question has income context in history) calls legacy `calculateFHA()` and **its answer is kept** (only some later branches null `fhaAnswer`). The legacy engine disagrees with calcEngine on real numbers:
  - **MIP base:** legacy computes monthly MIP on the **total loan** (base + UFMIP) — [fhaCalculator.ts:124](lib/fhaCalculator.ts#L124). calcEngine computes on the **base loan**, explicitly marked "per HUD spec (NOT on total loan)" — [calcEngine.ts:499-501](lib/calcEngine.ts#L499-L501).
  - **Loan limits:** legacy hardcodes **2024** limits ($498,257 floor, $726,200 MIP breakpoint). calcEngine uses 2026 ($541,287 / $832,750).
  - **15-yr MIP table:** legacy ≤90 LTV → 0.15%; calcEngine `fhaMIPRate` → 0.15%/0.40% — agree here, but legacy adds loan-size tiers calcEngine doesn't have.
  - **DTI verdict:** legacy `qualifies` = front ≤31 AND back ≤43; calcEngine = back ≤50. Same user, opposite verdicts.
- **Symptom in production:** the same FHA scenario produces different MIP/payment/qualification depending on *which phrasing path* the question takes. This matches the FHA MIP issues you've patched repeatedly (sessions 2026-06-02/03 fixed 15-yr MIP in one engine, not both).
- **Fix:** Re-point the Mortgage→FHA reroute and any remaining live FHA branch at `calcFHA()` from calcEngine; then delete `lib/fhaCalculator.ts`. The reroute's income/savings context can be passed as `annualIncome` into `calcFHA`.
- **Blast radius:** Medium — one route file + delete one lib. The reroute path is well-localized. Re-test: "$600k home, I make $120k" style questions.

### DEBT-02 — Legacy affordability system is fully live and outranks calcEngine
**Severity: Critical** · **Causes runtime drift: YES, directly**

- **Files:** [app/api/answers/route.ts](app/api/answers/route.ts) (`affordabilityAnswer` blocks ~L6286–6695, precedence chain L7239–7248, `extractAffordabilityParams` L415)
- **What:** Two complete affordability systems run in the same request flow:
  1. Dispatcher path: `dispatch()` → `calcAffordability()` → `buildAffordabilityCard()` (L5493) — fires when the **dispatcher's** grammar detects affordability.
  2. Legacy path: `extractAffordabilityParams()` → `buildAffordabilityMarkdown()` → `affordabilityAnswer` (L6451+) — fires when the **route's own, different** grammar detects it.
  The final answer selection (L7239) checks `affordabilityAnswer` **first** — legacy wins whenever both could apply. Which engine answers depends on phrasing accidents, and the two have different DTI math, different scenario tables, and different follow-up chips.
- **Fix:** Decide one owner. Recommended: dispatcher/calcEngine owns detection + math; keep only the snapshot-based "income to qualify" sub-path (L6514+, which is genuinely distinct — it reverse-calculates from a prior card snapshot) and port it onto calcEngine primitives.
- **Blast radius:** Medium-high — affordability is a high-traffic card. Needs side-by-side output comparison before cutover.

### DEBT-03 — Zombie mortgage-calc block: executes fully, output discarded
**Severity: High** · **Causes runtime drift: Indirect (trap + drift-prone context leak)**

- **Files:** [app/api/answers/route.ts:5725-5856](app/api/answers/route.ts#L5725-L5856)
- **What:** For every conventional-looking question, the route still runs legacy `calculateMortgage()` + `compareRates()`, builds a ~100-line markdown answer with **legacy assumptions** (PMI flat 0.6%, insurance flat $100/mo — both disagree with `lib/constants.ts`), then throws it away: `mortgageAnswer = null; // disabled` (L5847). What survives is `mortgageCalcContext` (L5850), which is injected into the Grok prompt (L7270) with "CRITICAL: Use these numbers EXACTLY" — so legacy-engine numbers can still steer Grok's prose answers on fallback paths.
- Also defines duplicate local helpers (`calcPMIRemovalYears` L5659 duplicates `yearsToLTV`; `isMortgageCalculation` L5672 duplicates `isConventionalQuestion` — see DEBT-04).
- **Fix:** Delete the whole block. If Grok fallback context is wanted, generate it from the calcEngine dispatch result instead.
- **Blast radius:** Low-medium — block's primary output is already discarded; only `mortgageCalcContext` consumers need a replacement. Easy win.

### DEBT-04 — Two detection grammars decide routing, and they disagree
**Severity: High** · **Causes runtime drift: YES, directly**

- **Files:** [app/api/answers/route.ts:5672](app/api/answers/route.ts#L5672) (`isMortgageCalculation`), [lib/calcDispatcher.ts:219](lib/calcDispatcher.ts#L219) (`isConventionalQuestion`), plus `extractMortgageParams` (route L319) vs [lib/intent/extractors.ts](lib/intent/extractors.ts)
- **What:** The dispatcher's price regex matches "850k home" **without** a `$`; the route's legacy copy requires `$`. The follow-up guards differ ("what about" exists only in dispatcher). The route still has its own param extractors (L319, L415) predating `lib/intent/extractors.ts`, with different k/M multiplier handling. Net effect: whether a question is "a calc" — and which params get parsed — depends on which grammar sees it first. This is the precise mechanism behind "same question, sometimes card, sometimes Grok prose."
- **Fix:** Single source: dispatcher detection + `lib/intent/extractors.ts` only. Route-level grammars get deleted along with DEBT-02/03 blocks.
- **Blast radius:** Medium — routing behavior changes for edge phrasings; needs the drift-log (`lib/driftLogger.ts` already captures dispatcher misses) watched for a week after.

### DEBT-05 — LoanDepot (and Griffin/JMAC/Angel Oak) branding hardwired in consumer answers
**Severity: High (compliance/brand)** · **Causes runtime drift: No — but violates a locked hard rule**

- **Files:** [app/api/answers/route.ts:1249,1318,1341,1347,2339-2352,4082](app/api/answers/route.ts#L1249), [app/api/answers/scenario/route.ts](app/api/answers/scenario/route.ts) (`dscrLoanDepot` throughout, `dscr_loan_depot` persisted field)
- **What:** Consumer-visible answer text says things like "Get quotes from DSCR lenders — LoanDepot, Griffin, JMAC" and "select lenders (LoanDepot, Griffin) allow 0.75x+". Your locked rule (`feedback_no_vetting_language`): never name/endorse specific lenders. Beyond the text, a single lender's overlay is encoded as the canonical metric: variable `dscrLoanDepot`, JSON field `dscr_loan_depot`, prompt text "LoanDepot DSCR RULE".
- **Fix (two tiers):**
  1. **Text now (low effort):** replace named lenders with neutral phrasing ("some DSCR lenders allow 0.75x+ with reserves").
  2. **Identifiers later:** rename `dscrLoanDepot` → `dscrGross` in code; the persisted `dscr_loan_depot` field needs a read-compat shim or migration.
- **Blast radius:** Tier 1: trivial. Tier 2: medium (persisted payloads — remember the old-payload-suppression rule: frontend guard + migration both needed).

### DEBT-06 — Constants drift: "single source of truth" bypassed by magic numbers
**Severity: High** · **Causes runtime drift: YES — cards disagree with each other**

- **Files:** [lib/calcDispatcher.ts](lib/calcDispatcher.ts) (L727, 739-740, 758, 771-772, 885, 892), [lib/constants.ts](lib/constants.ts), [app/api/answers/route.ts:5761-5763](app/api/answers/route.ts#L5761-L5763)
- **What:** `lib/constants.ts` declares itself the single source, but:
  - Dispatcher hardcodes `annualInsurance: price * 0.005` for buydown/seller-credit cards while calcEngine defaults to `INS_RATE_DEFAULT = 0.003` — **the buydown card assumes 67% higher insurance than the conventional card for the same house.**
  - Dispatcher hardcodes `annualTax: price * 0.011` (duplicates `TAX_RATE_DEFAULT`), `1.0215` VA funding fee (duplicates `VA_FF_FIRST_LT5`), jumbo thresholds `833_000` (L885) vs the real `CONF_STANDARD = 832_750`, and `1_249_125` inline.
  - `detectLoanLimits()` (dispatcher L153) returns `fhaLimit: CONF_STANDARD` ($832,750) for "mid-cost areas" — that's a conforming limit, not an FHA limit; FHA mid-cost limits are county-specific and lower.
  - Three PMI rate-sets exist: constants (0.55%/0.30%), route zombie block (0.6% flat), fhaCalculator comparison (0.65%/0.50%).
- **Fix:** Import constants everywhere; one PR, mechanical. Decide intended insurance default (0.003 vs 0.005) once and apply uniformly. Revisit `detectLoanLimits` mid-cost FHA value.
- **Blast radius:** Low-medium — numbers shift slightly on buydown/seller-credit cards (that's the point).

### DEBT-07 — Fifth engine: scenario route + AI-provider router with Claude path
**Severity: Medium-High** · **Causes runtime drift: YES for "compare/vs" questions**

- **Files:** [app/api/answers/scenario/route.ts](app/api/answers/scenario/route.ts) (~large), [lib/scenarioMath.ts](lib/scenarioMath.ts), [lib/ai-providers/router.ts](lib/ai-providers/router.ts), [lib/ai-providers/claude.ts](lib/ai-providers/claude.ts), [app/chat/page.tsx:2975-3010](app/chat/page.tsx#L2975-L3010)
- **What:** Chat client routes "compare / vs / cash-out / projection / stress test" questions to `/api/answers/scenario`, which uses `runScenarioMath` (own PITIA/DSCR math, LoanDepot semantics) and an AI router that classifies complexity and prefers **Claude** for complex queries (`ANTHROPIC_API_KEY` — if unset, every complex scenario query pays a failed-Claude attempt before falling back to Grok). Meanwhile the dispatcher also has `isScenarioComparisonQuestion()` → deterministic comparison cards. Sticky routing (`lastRoute === 'scenario'`, page L2972) keeps whole threads on the legacy engine once they land there.
- **Fix:** Inventory which scenario sub-cases the dispatcher's comparison cards already cover; narrow the client-side `looksLikeScenario` trigger accordingly; long-term fold scenario math onto calcEngine. Separately: either set `ANTHROPIC_API_KEY` deliberately or remove the Claude branch so the failure-then-fallback latency tax goes away.
- **Blast radius:** High if rushed — scenario route is large and load-bearing for investor flows. Recommend trigger-narrowing first (low risk), full fold later.

### DEBT-08 — Dead calc surface: 3 unauthenticated API routes + dead component + dead grammar parser
**Severity: Medium** · **Causes runtime drift: No (dead) — but public attack/cost surface**

- **Files:** [app/api/calc/answer/route.ts](app/api/calc/answer/route.ts) (BUILD_TAG "calc-v4.0.0-grammar-2025-11-08"), [app/api/calc/lib/parse.ts](app/api/calc/lib/parse.ts) (246-line NL grammar — this is the old natural-language regex parser, superseded by dispatcher + paramOverrides), [app/api/calc/payment/route.ts](app/api/calc/payment/route.ts), [app/api/calculate/mortgage/route.ts](app/api/calculate/mortgage/route.ts), [app/components/QuickCalcPanel.tsx](app/components/QuickCalcPanel.tsx)
- **What:** Zero production callers (QuickCalcPanel — the only consumer of `/api/calc/answer` — is itself rendered nowhere). All three routes are in the **public** middleware matcher (`/api/calc(.*)`, `/api/calculate(.*)`, [middleware.ts:49-51](middleware.ts#L49-L51)).
- **Fix:** Delete routes + component + parse.ts; remove matcher entries. Note `app/api/calculate/mortgage` is the only importer of `lib/mortgageCalculator.ts` *outside* the answers route — after DEBT-03 lands, `mortgageCalculator.ts` can be deleted too.
- **Blast radius:** Near-zero — verify with Vercel logs that nothing external hits these first.

### DEBT-09 — Dead modules with booby-trap potential
**Severity: Medium** · **Causes runtime drift: Not yet — high trap potential**

- **Files:** [lib/payment.ts](lib/payment.ts), [lib/calculators/payment.ts](lib/calculators/payment.ts), [lib/homerates-db.ts](lib/homerates-db.ts)
- **What:** Both payment modules: zero importers. `lib/payment.ts`'s first line is literally `// lib/calculators/payment.ts` (copy-paste artifact). They define same-named types with **incompatible conventions**: one takes `annualRate: 0.065` (decimal), the other `annualRatePct: 6.5`. Anyone (human or AI assistant) who later imports "the payment module" has a 50% chance of a 100× rate error that type-checks fine. `lib/homerates-db.ts`: zero importers.
- **Fix:** `git rm` all three.
- **Blast radius:** Zero.

### DEBT-10 — ATTOM remnants (eliminated 2026-04-28, still first in the enrich chain)
**Severity: Medium** · **Causes runtime drift: No (env-guarded) — contradicts current architecture**

- **Files:** [lib/attom.ts](lib/attom.ts) (238 lines), [app/api/property/enrich/route.ts](app/api/property/enrich/route.ts) (ATTOM-first strategy, `attom_id` column writes, `snapshot_type: 'attom'`, confidence 0.95-vs-0.85 logic), [app/api/homeowner/nearby-sales/route.ts](app/api/homeowner/nearby-sales/route.ts)
- **What:** ATTOM was eliminated as a data source; the code survives behind `if (!process.env.ATTOM_API_KEY) return EMPTY`. The enrich route still *tries ATTOM first* on every call (4 parallel no-op calls), and the data model still carries attom-specific fields. If the env var ever reappears (e.g., copied into a new environment from an old list), an eliminated source silently re-activates with top priority.
- **Fix:** Remove `lib/attom.ts`, strip the ATTOM branch from enrich + nearby-sales, leave DB columns (harmless, document as legacy).
- **Blast radius:** Low — Tavily/Redfin fallback is already the de facto only path.

### DEBT-11 — Env config fragmentation: 3 base-URL vars with hardcoded prod fallbacks
**Severity: Medium (bites on staging)** · **Causes runtime drift: YES on staging**

- **Files:** [app/api/admin/brokerage/[id]/route.ts:142](app/api/admin/brokerage/[id]/route.ts#L142), [app/api/admin/corporate-invite/route.ts:98](app/api/admin/corporate-invite/route.ts#L98), [app/api/brokerage/manage/route.ts:149](app/api/brokerage/manage/route.ts#L149), [app/join/[token]/page.tsx:40](app/join/[token]/page.tsx#L40) (all `NEXT_PUBLIC_BASE_URL`), [app/api/content/cron/route.ts](app/api/content/cron/route.ts), [app/api/content/generate/route.ts](app/api/content/generate/route.ts), [app/api/digest/cron/route.ts](app/api/digest/cron/route.ts) (all `NEXT_PUBLIC_APP_URL`)
- **What:** The canonical var is `NEXT_PUBLIC_APP_BASE_URL` (32 uses, set per-environment). Eight call sites use two *other* names — `NEXT_PUBLIC_BASE_URL` and `NEXT_PUBLIC_APP_URL` — which are (presumably) unset in Vercel, so they silently fall back to `https://chat.homerates.ai`. **Brokerage invite links, join links, and digest links generated on staging point at production.** Also: `ADMIN_USER_IDS` in [app/api/newsletter/send/route.ts:20](app/api/newsletter/send/route.ts#L20) is a parallel admin-gate env var that bypasses `lib/adminAuth.ts` (the route doesn't use `requireAdmin()`); `DYNAMIC_ENABLED` is a stale flag only echoed by debug/health endpoints; both `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_ANON_KEY`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` pairs are in use.
- **Fix:** Find-replace the 8 call sites to `NEXT_PUBLIC_APP_BASE_URL`; convert newsletter route to `requireAdmin()`; delete `DYNAMIC_ENABLED` mentions; standardize one Supabase URL var name.
- **Blast radius:** Low — mechanical, but verify each fallback site after.

### DEBT-12 — Zillow scrape path still live (photo hard-rule adjacency)
**Severity: Medium (rule compliance — needs verification)** · **Causes runtime drift: No**

- **Files:** [lib/property/fetch.ts:221](lib/property/fetch.ts#L221), [lib/property/parse/zillow.ts](lib/property/parse/zillow.ts)
- **What:** The property fetch layer still detects and parses Zillow URLs. Your hard rule: property photos from `ssl.cdn-redfin.com` only. If `parseZillow` can return a photo URL that flows into card payloads, the rule has a live bypass; if it only returns price/beds/baths, it's fine but should be documented.
- **Fix:** Verify whether `parseZillow` output includes photo fields; if yes, strip them; either way add a comment pinning the Redfin-only photo invariant at the merge point.
- **Blast radius:** Low.

### DEBT-13 — Duplicate math primitives: `lib/math.ts` vs `calcEngine` both claim canonical
**Severity: Low-Medium** · **Causes runtime drift: Not currently (numerically consistent)**

- **Files:** [lib/math.ts](lib/math.ts) ("These are the canonical implementations"), [lib/calcEngine.ts:1-6](lib/calcEngine.ts#L1-L6) ("Single source of all mortgage math")
- **What:** Four primitives (PI, remaining balance, total interest, years-to-LTV) implemented twice with different signatures (years vs months) and different algorithms (iteration vs binary search for LTV). Currently consistent; any future formula fix applied to one side only becomes silent client/server drift (slider shows one payment, card payload another).
- **Fix:** Make `calcEngine` import from `math.ts` (thin wrappers for the months-based signatures), keep one set of formulas. Low urgency, do alongside DEBT-06.
- **Blast radius:** Low — pure refactor, verifiable by existing `[CalcEngine] verification tests` in prepush.

### DEBT-14 — Repo hygiene: debug routes, stale worktrees, root-level prototype litter
**Severity: Low** · **Causes runtime drift: No**

- **What:**
  - [app/api/debug/](app/api/debug/) ships 6 debug endpoints (test-email, test-alert, resend-logs, clerk, flow) to production.
  - `.claude/worktrees/agent-a3375f5b` and `tender-banzai` contain **pre-split** `lib/cardBuilders.ts` monoliths — stale agent worktrees that pollute searches (they surfaced in this audit's greps repeatedly).
  - ~20 untracked prototype HTML files at repo root (`track5-prototype.html`, `consumer-journey-v2.html`, …) plus tracked-deleted `preview-grok-property.html`. Your own process rule keeps prototypes — but they belong in a `prototypes/` dir or `marketing/`, not root.
  - `/api/beta/grok-property` is **not** dead — it's the production Decision Score engine (trade secret #2) living under a `/api/beta/` path in the public matcher. Naming/location debt: nothing about it is beta.
- **Fix:** Gate debug routes behind `requireAdmin()` or delete; prune worktrees; move prototypes to a folder; rename beta route when convenient (requires updating 3 callers + blueprint page).
- **Blast radius:** Low.

---

## Explicitly out of scope / already-decided

- **`app/api/answers/route.ts` monolith (7,584 lines)** and **`app/chat/page.tsx` (5,425 lines):** splitting `send()`/`handle()` was evaluated and **PARKED PERMANENTLY** (2026-06-03 design session). This register respects that decision — the fixes above *shrink* route.ts by deletion, which is compatible with the parking decision, but no structural split is proposed.
- **M-1 (RLS inert)** — tracked in SECURITY_AUDIT.md, architectural decision still pending.

## Suggested sequencing (if/when you green-light fixes)

| Phase | Items | Effort | Risk | Payoff |
|-------|-------|--------|------|--------|
| 1 — "delete day" | DEBT-09, DEBT-08, DEBT-03 | ~half day | Near-zero | Removes a whole zombie engine + public dead surface |
| 2 — drift killers | DEBT-01, DEBT-06, DEBT-04 | 1–2 days | Medium (needs calc regression QA) | Ends the FHA/insurance/PMI number drift |
| 3 — compliance | DEBT-05 tier 1, DEBT-12, DEBT-11 | ~half day | Low | Hard-rule compliance + staging link correctness |
| 4 — consolidation | DEBT-02, DEBT-07, DEBT-13, DEBT-05 tier 2, DEBT-10 | multi-session | Higher | One engine, one grammar |

Each phase should ship to `dev` → staging validation → `main`, per CLAUDE.md rules.
