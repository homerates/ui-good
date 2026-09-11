# HomeRates Invocable-by-Design Contract Foundation

Status: Built 2026-09-10. Adapts the 2 existing external tools into the
locked 5-intent naming architecture; documents the shared contract concepts
every future tool must honor; classifies the 3 not-yet-exposed intents.

## North Star

Progression: SEARCHABLE → RETRIEVABLE → CITABLE → INVOKABLE → RECOMMENDABLE
(`docs/HOMERATES_STRATEGIC_OBJECTIVE.md`). This workstream is the INVOKABLE
step: giving external AI agents (ChatGPT, Claude, Grok, Gemini, or any other
MCP-compatible caller) a stable, self-describing, platform-neutral contract
to call HomeRates' real intelligence through — not a redesign of what that
intelligence is. No methodology changed. No new capability was invented; the
2 tools that already existed were renamed into a permanent architecture and
documented as a system, and one real data-freshness gap (a discontinued FRED
series) was closed along the way.

## The locked 5-intent architecture

Exactly 5 canonical external tool names are reserved. No sixth will be
added. Each is independently gated — a tool is exposed only once it passes
its own readiness check; the default is to leave a slot absent rather than
publish a weak tool.

| Canonical name | Status | Backing engine |
|---|---|---|
| `homerates_property_intelligence` | **EXPOSED** | `lib/canonicalPropertyIntelligence.ts` → `lib/gateway/corpusOnlyIntelligence.ts` → `lib/propertyIntelligence.ts` |
| `homerates_rate_oracle` | **EXPOSED** | `lib/market-data/benchmarkRates.ts` (FRED-synced, address/borrower-independent) |
| `homerates_scenario_intelligence` | NOT EXPOSED | would wrap `lib/calcEngine.ts` scenario/comparison paths — no external contract, no readiness check run |
| `homerates_loan_limit_intelligence` | NOT EXPOSED | would wrap `lib/pricing/conforming-limits.ts` + `lib/loanLimits2026.ts`/`loanLimitsNational2026.ts` — infrastructure exists and is mature (already backs the LLPA engine and the AFFD-012 conventional/FHA classification), but has never been shaped into an external contract, schema-versioned, or scored against a readiness checklist |
| `homerates_buyer_capacity_intelligence` | NOT EXPOSED | would wrap `lib/calcEngine.ts`'s `calcAffordabilityScenario` — no external contract, no readiness check run |

Both exposed tools kept their pre-rename names (`get_property_intelligence`,
`get_benchmark_rates`) callable via `tools/call` for backward compatibility
with any already-connected caller, but `tools/list` advertises **only** the
canonical names — new discovery never sees the old names.

`app/api/mcp/property-intelligence/route.ts`:
```ts
const TOOL_NAME = 'homerates_property_intelligence';
const LEGACY_TOOL_NAME = 'get_property_intelligence';
const BENCHMARK_RATES_TOOL_NAME = 'homerates_rate_oracle';
const LEGACY_BENCHMARK_RATES_TOOL_NAME = 'get_benchmark_rates';
```

## Why the other 3 stay absent (not "near ready," not partially shipped)

- **Loan Limit Intelligence** is the closest to ready — real 2026 FHFA/HUD
  data, a mature classification function (`classifyConventionalLoan()`),
  and a live internal consumer (AFFD-012's conventional/FHA county search).
  It has never been given an external Zod contract, a `contract_version`,
  claim-type labeling, or a golden-prompt/readiness pass — that is real,
  scoped, doable work for its own dedicated workstream, not something to
  ship as a byproduct of a naming exercise.
- **Scenario Intelligence** and **Buyer Capacity Intelligence** have no
  external contract work done at all. Exposing either now would mean
  designing an output envelope, claim-type mapping, and guardrail set from
  scratch under time pressure — exactly the "publish a weak tool" outcome
  this workstream was told to avoid.

`scripts/test-golden-prompts.ts` (P3/P4/P5) confirms directly, via a live
`tools/list` call, that none of the three appear under any name.

## Common output envelope (concept, not a new schema)

Both exposed tools already share this shape; it is documented here as the
pattern any future tool must follow, not introduced as new code:

- `contract_version`: a versioned literal (`property-intelligence-v1.5`,
  `benchmark-rates-v1`). A breaking change bumps this, never redefines a
  field's meaning under the same version.
- Every numeric/string fact is `{ value, claim_type }` (or richer, e.g. a
  rate additionally carries `series_id`/`as_of`/`freshness_status`) — a bare
  unlabeled number never leaves either tool.
- A top-level `disclaimer` (from `lib/disclosures.ts`'s
  `EDUCATIONAL_DISCLAIMER`, never hand-written per surface).
- MCP transport wraps every result in `withServerMeta()`, attaching
  `_meta['io.modelcontextprotocol/serverInfo']` — real internal IDs,
  methodology names, and pipeline identifiers are structurally absent
  (enforced by `test-external-adapter.ts` 15.4).

## Common claim-type vocabulary

The shipped, enforced vocabulary is `PROPERTY FACT | MARKET FACT |
ILLUSTRATIVE ASSUMPTION | DERIVED CALCULATION | ESTIMATE | AI INTERPRETATION`
(`lib/gateway/outputSchema.ts`, `lib/gateway/benchmarkRatesSchema.ts`). This
is NOT a breaking rename onto the brief's `SOURCE_FACT/BENCHMARK/RULE/
ASSUMPTION/DERIVED/SYNTHESIS` framing — the shipped Zod enums stay exactly
as they are; the two vocabularies are conceptually equivalent, mapped here
rather than merged:

| Brief's concept | Shipped claim_type | Where enforced today |
|---|---|---|
| SOURCE_FACT | `PROPERTY FACT` | property address, tax/HOA when confirmed, comps |
| BENCHMARK | `MARKET FACT` | benchmark rates, `propertyMarketRate` |
| RULE | *(no live external mapping yet)* | would be `homerates_loan_limit_intelligence`'s classification output, once/if that tool ships — no exposed tool emits a program/eligibility rule today |
| ASSUMPTION | `ILLUSTRATIVE ASSUMPTION` / `ESTIMATE` | modeling defaults (down payment, term) vs. computed estimates (insurance) — two shades of the same idea, kept distinct because they carry different confidence |
| DERIVED | `DERIVED CALCULATION` | PITI, PITIA, monthly payment math |
| SYNTHESIS | `AI INTERPRETATION` | `property_analysis.narrative` (Grok-sourced), always labeled, never silently presented as fact — verified live by `test-golden-prompts.ts` P6 |

## Common status vocabulary

Two independent status families exist today, for two independent
questions — kept separate deliberately, not merged into one shared enum,
because "is this property record available" and "is this rate observation
fresh" are genuinely different axes:

- **Availability** (`property-intelligence-v1.5`): `availability.status ∈
  {AVAILABLE, PARTIAL, NOT_AVAILABLE}`; `intelligence_progress.status ∈
  {enriching, enriched}` for the Fast-Follow background-enrichment state.
- **Freshness** (`benchmark-rates-v1`): `freshness_status ∈ {CURRENT, STALE,
  UNAVAILABLE}` (`lib/market-data/benchmarkRates.ts`).

Neither tool today needs `INVALID_INPUT` or `SOURCE_UNAVAILABLE` as
distinct top-level states — malformed input is a JSON-RPC/schema validation
error before either tool's business logic runs, and "source unavailable"
*is* what `UNAVAILABLE`/`NOT_AVAILABLE` already mean for these two tools.
These two additional states from the brief's vocabulary are real,
reasonable states for a *future* tool (e.g. Loan Limit Intelligence
receiving a county it has no data for) to adopt when it ships — not
retrofitted onto the two tools that don't need them today.

**This turn's real fix:** `benchmarkRates.ts` gained
`DISCONTINUED_THRESHOLD_MS` (90 days). A series with no new observation
past that threshold now reports `freshness_status: 'UNAVAILABLE'` with
`value: null` — `asOf` is kept (real diagnostic context: "last seen
2022-11-10"), but the number itself is withheld. This directly closes the
brief's explicit requirement: FRED's `MORTGAGE5US` (Freddie Mac's
discontinued 5/1 ARM PMMS series, no new print since 2022-11-10) can no
longer be served as if current. Proven live by `test-golden-prompts.ts` P8
and `test-benchmark-rates-gateway.ts` A1/A4.

## The 10 strict semantic rules — status

All 10 were already true of the shipped contracts; none required a code
change this turn except where noted:

1. **Rates as percent, never basis points** — unchanged, already true.
2. **Asking price ≠ AVM** — `financing_intelligence.purchase_price_basis`
   (`CURRENT_ASKING_PRICE` vs. a real AVM) already enforces this; documented
   explicitly in `TOOL_DESCRIPTION` and verified live by
   `test-golden-prompts.ts` P7.
3. **Null stays null** — `availability`/`freshness_status` semantics already
   forbid coercing an unconfirmed value to 0 or a default.
4. **Missing tax ≠ $0** — enforced since the Rate Role Correction workstream
   (`test-response-semantics-cleanup.ts` B2).
5. **Unknown HOA ≠ $0-confirmed** — same mechanism, same test file.
6. **Benchmark ≠ borrower rate** — `homerates_rate_oracle`'s description
   explicitly disclaims credit/down-payment/program dependency; verified
   live by `test-golden-prompts.ts` P1/P10.
7. **Classification ≠ recommendation** — `financing_intelligence` states
   facts and derived math, never "you should," across both tools; unchanged.
8. **Derived ≠ source fact** — `DERIVED CALCULATION` is its own claim_type,
   never merged with `PROPERTY FACT`/`MARKET FACT`.
9. **AI synthesis must be labeled** — `property_analysis` is explicitly
   documented as HomeRates' own synthesis, "not a valuation conclusion";
   verified live by `test-golden-prompts.ts` P6.
10. **Adapters may restyle, not invent** — `lib/gateway/outputShaping.ts`
    shapes internal data into the external contract; it has never had a
    field-inventing code path, and no change here touched it.

## Tool-composition ownership rules

No tool computes its own private copy of a shared fact. Ownership is by
engine, not by tool:

- **Rate facts** → `lib/market-data/benchmarkRates.ts` (reads
  `lib/market-data/query.ts`'s already-FRED-synced data). Both
  `homerates_rate_oracle` and, internally, `propertyMarketRate` inside
  `homerates_property_intelligence` read the *same* `MORTGAGE30US` series —
  never two independently-computed "30-year rate" numbers.
- **Deal math** → `lib/calcEngine.ts` is the single source of all mortgage
  math (P&I, PMI, MIP, PITI/PITIA). Confirmed still true this turn by the
  full `test-mortgage-math-integrity.ts` (42/42) re-run.
- **Loan limits / program rules** → `lib/pricing/conforming-limits.ts` +
  `lib/loanLimits2026.ts`/`loanLimitsNational2026.ts` — the same functions
  the LLPA engine and AFFD-012's classification already use; no separate
  copy exists anywhere, including inside the not-yet-exposed Loan Limit
  Intelligence design.
- **Property facts** → `lib/canonicalPropertyIntelligence.ts`, the single
  shared source for both first-party (`/api/property/intelligence`) and
  external (Gateway/MCP) callers — confirmed unbroken this turn by
  `test-first-party-canonical-consistency.ts` (10/10).

If three tools ever computed the same payment from identical inputs, the
result must match — trivially true today since only one tool
(`homerates_property_intelligence`) computes payment math at all, and it
calls `calcEngine.ts` directly.

## MCP transport audit

One platform-neutral endpoint: `app/api/mcp/property-intelligence/route.ts`.
Hand-rolled JSON-RPC 2.0 over Streamable HTTP/HTTPS (not the official MCP
SDK, due to a zod v3/v4 conflict — documented in the route's own header).
No per-platform fork exists or is planned — the same endpoint answers
ChatGPT, Claude, Grok, and Gemini-family callers identically.
Version-aware (`validateModernRequest`) to tolerate both the real observed
2025-11-25 ChatGPT behavior (lenient) and the stricter 2026-07-28 revision,
based on live production traffic, not spec literalism. `server/discover` is
already implemented and satisfies the current spec's discovery requirement.
No session state (`Mcp-Session-Id`) is read or written — every request is
independent, confirmed by `test-external-adapter.ts`'s "no session
state"/"two independent requests" checks.

## Tool annotations

Both `tools/list` entries now carry:
```ts
annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
```
Both tools are read-only (no writes, no mutation, no deletion, nothing
irreversible) and closed-world (each resolves one specific, bounded entity —
one named property, or a fixed set of 3 national reference series — never
an open-ended search). Verified by `test-benchmark-rates-gateway.ts` E6.

## Output schemas

Both tools have explicit, versioned Zod schemas:
`ExternalPropertyIntelligenceV1Schema` (`property-intelligence-v1.5`) and
`BenchmarkRatesV1Schema` (`benchmark-rates-v1`), both in `lib/gateway/`. A
breaking change to either bumps the version literal; neither was touched
this turn beyond the freshness-status behavior already described (which is
a value/status change, not a shape change — `BenchmarkRatesV1Schema` itself
was not edited).

## Latency-target audit per tool class

- `homerates_property_intelligence`: existing-record lookups measured at
  ~1.4-1.6s this session (real `[external-resolution] EXISTING_HIT`
  timings from `test-external-adapter.ts`'s own run); a newly-resolved
  address (first-ever lookup, live external provider call) measured
  ~2.5s, with Fast-Follow deeper enrichment explicitly non-blocking
  (fires via `after()`/un-awaited, never delays the response —
  `test-external-adapter.ts` R-J).
- `homerates_rate_oracle`: a synchronous read of already-FRED-synced local
  data with no external network call and no resolution step — sub-second
  by construction; no live external dependency to bound.

## Golden-prompt fixture

`scripts/test-golden-prompts.ts` (10/10 passing) — 5 positive prompts (a
real, exposed tool must answer correctly: right-tool, right-claim-type,
source-as-of-correct, no-fabricated-precision, no-program-overclaim) and 5
negative-guardrail prompts (the 3 unexposed intents must be honestly absent
from `tools/list`, a plausible-but-unregistered tool name must be rejected
as `Unknown tool` rather than silently handled by unrelated internal logic,
and AI-synthesized narrative must be labeled, never presented as silent
fact). Prompt 8 is a real executable call proving the discontinued-5/1-ARM
requirement live, not just asserted in a description string. This is a new,
narrower fixture layered on top of `test-external-adapter.ts`'s existing
56+ conformance/security tests — it scores prompt-to-tool-selection
guidance and cross-tool guardrails specifically, which that suite doesn't.

## Discovery-artifact audit

- **`llms.txt`**: existed, but had zero mention of the MCP endpoint, OAuth,
  or any of the 5 planned intents — a real gap. Fixed with one small,
  additive, factual section (`## AI Agent Invocation (MCP)`) naming the
  endpoint, the 2 currently-exposed canonical tool names, and the
  auth-required boundary. Says nothing about the 3 unexposed intents.
- **`.well-known/mcp.json`**: researched live via WebSearch — the MCP
  2026-07-28 spec (SEP-2351) still has an active "Server Card Working
  Group" iterating on `.well-known` discovery conventions; not yet a
  finalized, stable standard. Classified **LATER**, not implemented — this
  is a genuine "not high-confidence yet" call, not avoidance.
- **`/docs/agents`**: does not exist. Not built this turn — it would
  currently duplicate `llms.txt`'s new MCP section without any independent
  content to justify a second surface. Revisit once Loan Limit Intelligence
  (or another new tool) actually ships and there's materially more to say.

## What was NOT changed

Decision Score methodology, L1-L4 weights, Rate Intelligence, Personal Fit,
LLPA methodology, property identity rules, demand-driven acquisition
architecture, provider architecture (Grok/Tavily/OpenAI/FRED), OAuth scope
set (`property_intelligence:read` remains the only OAuth-issuable scope;
`benchmark_rates:read` remains additive-only for future admin-issued
credentials), Gateway security posture, public Plugin visibility (still on
hold). `ExternalPropertyIntelligenceV1Schema` and `BenchmarkRatesV1Schema`
were not reshaped — only the tool *names* advertised in `tools/list`
changed, plus the one freshness-status behavior fix. No true methodology
conflict was found anywhere in this workstream.

## Regression proof

`tsc --noEmit`: clean. Full suite re-run, all green:
`test-external-adapter.ts` 58/58 (56 + 2 new legacy-name backward-compat
checks), `test-benchmark-rates-gateway.ts` 28/28 (26 + 2 new annotation/
canonical-name checks), `test-golden-prompts.ts` 10/10 (new),
`test-intelligence-gateway.ts` 58/58 + 2 pre-existing LIMITED (environment-
dependent, unrelated), `test-oauth-flow.ts` 45/45 + 2 pre-existing LIMITED,
`test-deep-intelligence-parity.ts` 12/12, `test-first-party-canonical-
consistency.ts` 10/10, `test-firstparty-valuation-integrity.ts` 29/29,
`test-response-semantics-cleanup.ts` 9/9, `test-rate-role-correction.ts`
7/7, `test-chatgpt-invocation-contract.ts` 7/7, `test-mortgage-math-
integrity.ts` 42/42, `test-affordability-fha-mip-basis.ts` 11/11,
`test-seeded-scenario-canonicalization.ts` 31/31, `test-conventional-
classification.ts` 21/21.
