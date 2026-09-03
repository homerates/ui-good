# HomeRates Intelligence Gateway — External Property Intelligence Contract V1

**Status: LOCKED V1 (2026-09-02, Rayaan).** This contract is the approved baseline for all Gateway,
auth, cost-control, and platform-adapter design that follows. Nothing in this document has been
implemented — no endpoint, no Gateway, no MCP integration exists yet. Locking the contract means the
*shape and semantics* below are fixed for implementation planning purposes; it is not itself an
implementation and does not authorize building one. Any change to this contract after this point is a
deliberate revision (bump `contract_version`, per §16), not a silent edit.

**LEGAL/IP REVIEW REQUIRED — PARALLEL, NON-BLOCKING FOR DEVELOPMENT.** See
`docs/MCP_Legal_IP_Checkpoint_Brief.md`. No legal review of this contract has occurred as of this writing.
Locking V1 for implementation-planning purposes does not substitute for that review, particularly on the
open patent-filing-timing question the brief raises.

**Prepared:** 2026-09-02, audited directly against the real `lib/propertyIntelligence.ts` /
`app/property-intelligence/[id]/page.tsx` implementation — every internal field name, label, and code
path cited below was read from the live source, not assumed.

---

## 1. Purpose

Define the exact, platform-neutral contract through which an authorized external AI system (ChatGPT,
Claude, Grok, Copilot, or any other MCP-compatible client) could request **existing** HomeRates Property
Intelligence for an address and receive a response another AI can use to construct a useful, accurate
consumer answer — without receiving the proprietary methodology that produced it.

## 2. Scope

V1 is:
- **Read only.**
- **Property Intelligence only** — the five-card system audited in §4 below. No Rate Intelligence engine
  beyond what already flows into a property's Financing card. No Offer/Discover (deferred entirely, per the
  architecture already agreed).
- **Existing/cached HomeRates intelligence only.** V1 must never be capable of triggering Grok, Tavily, a
  fresh Redfin lookup, deep enrichment, new property acquisition, or any paid AI generation. If qualified
  intelligence doesn't already exist for an address, V1 returns an explicit not-available result — it never
  generates one on demand.

V1 must not expose: Track 5 internals, Autonomous DSC internals, Discover, borrower-specific Decision
Score, private scenarios, LO conversations, prompt libraries, model orchestration, raw provider responses,
raw database records, or any force-refresh/live-enrichment capability.

## 3. Hard boundaries (non-negotiable for V1)

1. **No live/paid calls, ever.** Enforced structurally, not by convention — see §15.
2. **Allowlist-based response construction only** — see §5 and §7. Never serialize the raw internal result
   and then remove sensitive properties; always construct the external object field-by-field from an
   explicit allowlist.
3. **No internal identifiers as the primary interface** — address in, not `properties.id`.
4. **No field names that reveal methodology**, independent of whether the field's *value* is sensitive.
5. **No borrower-specific or cross-user data of any kind** — see §13.

---

## 4. Existing-system audit

Audited directly from `lib/propertyIntelligence.ts`'s `PropertyIntelligenceData` (the literal return type
of `getPropertyIntelligenceData(propertyId)`, the function that already powers all five cards on
`app/property-intelligence/[id]/page.tsx`) and the page's own card structure. This is the complete real
internal shape — nothing below is invented.

The system already has a claim-classification primitive built in: every meaningful value is wrapped as
`LabeledValue<T> = { label: FactLabel, value: T, source?, asOf? }`, where
`FactLabel = 'PROPERTY FACT' | 'MARKET FACT' | 'ILLUSTRATIVE ASSUMPTION' | 'DERIVED CALCULATION' |
'ESTIMATE' | 'AI INTERPRETATION'`. This is not something V1 needs to invent (§8) — it needs to decide how
much of it survives the Gateway.

**Card 1 — Property & Value Intelligence** (`propertyFacts`, `valuation`):
`address` (PROPERTY FACT), `city`/`state`/`zip` (plain), `propertyType`/`beds`/`baths`/`sqft` (PROPERTY
FACT), `avm` (ESTIMATE, with `avmSources: string[]` — literal source labels like "Zillow estimate",
"Redfin estimate (Grok)"), `listPrice` (PROPERTY FACT), `lastSalePrice`/`lastSaleDate` (plain), `comparables`
(array of `{address, soldPrice, soldDate, sqft, pricePerSqft}`), `freshness` (a timestamp string).

**Card 2 — Financing Intelligence** (`financing`, nullable):
`scenario` (`{creditScore: 740, downPaymentPct: 20, loanType, occupancy: 'primary', termYears: 30}` — a
single hardcoded illustrative buyer profile, not derived from any real user), `loanAmount` (DERIVED
CALCULATION), `ltv` (ILLUSTRATIVE ASSUMPTION), `conformingStatus`, `conformingCeiling` (MARKET FACT, FHFA
sourced), `marketRate` (MARKET FACT, OBMMI/FRED sourced, with `seriesLabel` and `observationDate`),
`lenderParRate`/`monthlyPI` (DERIVED CALCULATION), `totalLLPAPoints`, `llpaDataSource`,
`llpaEffectiveDate`, `llpaDisclaimer` (the engine's own real disclaimer text).

**Card 3 — Ownership Cost Intelligence** (`ownershipCost`, nullable):
`taxRate` (PROPERTY FACT if from an actual tax bill, else MARKET FACT/ESTIMATE by county/state/national
level — the label itself already encodes data quality), `monthlyTax`/`estimatedMonthlyPITI` (DERIVED
CALCULATION), `monthlyInsurance` (ESTIMATE, "HomeRates.ai default: 0.3% of price annually" — a real,
disclosed illustrative assumption), `monthlyHoa` (PROPERTY FACT or null).

**Card 4 — Market & Location Intelligence** (`market`, `locationIntelligence`):
`medianDom`/`medianPrice`/`saleToListPct` (MARKET FACT). `locationIntelligence.narrative` (AI
INTERPRETATION — literal Grok-generated prose) and `subScores: {metric, rating, description}[]` (e.g.
Walk/Transit/Schools/Safety/Wildfire ratings — this is Track 5's L4 sub-component structure).

**Card 5 — Decision Intelligence** (`decisionIntelligence`, nullable):
`l2`/`l3`/`l4`: `{score: number, summary: string} | null` — **these are literal Track 5 level scores**.
`source: 'featured_properties' | 'computed'`, `methodologyVersion` (literal string: `"Decision Score L1-L4
(locked 2026-08-19), L2-L4 property-centered subset"` — names the proprietary system outright),
`computedAt`, `strengths: string[]`, `concerns: string[]`, `missing: string[]`.

**Cross-cutting, not tied to one card:**
`eligibility: 'index' | 'noindex' | 'unavailable'` and `ineligibleReasons: string[]` (real strings: "No
usable AVM available.", "No comparable sale on record.", "Location (city/state) not resolved.", "No
enrichment timestamp available."). `lifecycleStatus: 'active'|'pending'|'sold'|'off_market'|'unknown'`.
`provenance: {propertyEnrichedAt, propertyEnrichmentSource, intelligenceComputedAt, snapshotFetchedAt,
grokCacheFetchedAt}` — `propertyEnrichmentSource` is a literal internal pipeline-source string (e.g.
`'redfin'`, `'web_search'`, `'featured_properties_organic_backfill'`).

Not visible on the card but present in the underlying corpus and explicitly named as exclusions by scope:
`featured_properties.search_count` (organic-interest signal, never rendered publicly today either).

---

## 5. Field classification matrix

`EXPOSE` = safe as-is (possibly renamed). `TRANSFORM` = safe in concept, unsafe in current shape/detail —
needs a different external representation. `INTERNAL ONLY` = never leaves the Gateway. `DEFER` = out of V1
scope, revisit for a later contract version.

| Internal field | Classification | Why |
|---|---|---|
| `address`, `city`, `state`, `zip` | **EXPOSE** | Public record. This is the subject of the query. |
| `propertyFacts.{propertyType,beds,baths,sqft}` | **EXPOSE** | Public listing facts, no methodology attached. |
| `valuation.avm` (value only) | **EXPOSE** | The number itself is a normal public-style estimate (comparable to a Zestimate). |
| `valuation.avmSources` (e.g. "Redfin estimate (Grok)") | **TRANSFORM** | The *value* is fine; the literal string names the internal blending method and that Grok was involved in producing an AVM number. Collapse to a generic provenance category (§11), not a source list. |
| `valuation.listPrice`, `lastSalePrice`, `lastSaleDate` | **EXPOSE** | Public record. |
| `valuation.comparables` | **EXPOSE** | Public sale data, same category as any comps a listing site shows. |
| `valuation.freshness` | **TRANSFORM** | Rename/reshape into the freshness contract in §11, not a raw internal timestamp field name. |
| `financing.scenario` | **TRANSFORM** | See §9 — the *values* are fine to disclose as the assumption set, but the labeling requirement is extensive enough to need its own dedicated section. |
| `financing.loanAmount`, `ltv`, `lenderParRate`, `monthlyPI` | **EXPOSE**, relabeled | Real, disclosed derived numbers already labeled DERIVED CALCULATION/ILLUSTRATIVE ASSUMPTION internally — carry the label externally too (§8), don't strip it. |
| `financing.conformingCeiling`, `marketRate` | **EXPOSE** | Public FHFA/FRED/OBMMI-sourced facts, already citable per existing site-wide OBMMI citation rule. |
| `financing.totalLLPAPoints`, `llpaDataSource`, `llpaEffectiveDate`, `llpaDisclaimer` | **EXPOSE** | Already-public engine metadata and the engine's own disclaimer — this is disclosure, not exposure risk. |
| `ownershipCost.*` | **EXPOSE**, with labels preserved | Same reasoning as financing — already-labeled, already-disclosed assumptions. |
| `market.medianDom`, `medianPrice`, `saleToListPct` | **EXPOSE** | Public market facts. |
| `locationIntelligence.narrative` | **TRANSFORM** | The prose itself is fine (already written for a human reader) — but must be clearly labeled AI-generated interpretation, and reviewed for phrasing that leaks *how* it was generated before exposure. |
| `locationIntelligence.subScores` | **EXPOSE** | Walk/Transit/Schools/Safety/Wildfire ratings are a normal category of location data (comparable to WalkScore) — the *rating* isn't proprietary, only the L4 mechanism that combined them into a level score is. |
| `decisionIntelligence.l2/l3/l4` (raw scores) | **INTERNAL ONLY** | See §10 — the single highest-risk field in the entire system. |
| `decisionIntelligence.methodologyVersion` | **INTERNAL ONLY** | Literally names "Decision Score L1-L4" by string. Must never appear externally under any field name. |
| `decisionIntelligence.source` (`featured_properties`\|`computed`) | **INTERNAL ONLY** | Names an internal table/cache-path distinction with zero external meaning. |
| `decisionIntelligence.strengths/concerns/missing` | **TRANSFORM** | See §10 — the content is right, the packaging needs to change. |
| `eligibility` (`index`\|`noindex`\|`unavailable`) | **TRANSFORM** | Real, useful three-state signal — but the internal names leak SEO/publish methodology (`index`/`noindex` are literal sitemap-indexing terms). Rename for external availability semantics (§12). |
| `ineligibleReasons` | **TRANSFORM** | The individual reason strings are fine and genuinely useful — repackage under the external availability contract, don't pass the internal array verbatim. |
| `lifecycleStatus` | **EXPOSE** | Public listing-status concept (active/pending/sold/off-market), not proprietary. |
| `provenance.propertyEnrichmentSource` (raw: `'redfin'`, `'web_search'`, `'featured_properties_organic_backfill'`) | **TRANSFORM** | Collapse to a generic source *category* (§11) — the literal internal pipeline name is acquisition-methodology detail, explicitly named in scope as something not to expose. |
| `provenance.*FetchedAt`, `intelligenceComputedAt` | **TRANSFORM** | Real, needed freshness data — reshape into a single external `as_of`/staleness contract (§11), don't expose four separate internal timestamp field names. |
| `featured_properties.search_count` | **INTERNAL ONLY** | Explicitly named in scope as excluded; also a `feedback_consumer_privacy_hard_rule.md`-adjacent organic-interest signal never rendered publicly even today. |
| `properties.id` (Supabase UUID) | **INTERNAL ONLY** | Never the primary interface (§6); may appear only as an opaque, unguessable external reference token if a future version needs one — not in V1. |

---

## 6. Request contract

```
get_property_intelligence({
  address: string   // required
})
```

**Required:** `address` — a free-text US postal address string. No separate city/state/zip fields in V1;
splitting them adds surface area without solving a real problem the single-string form doesn't already
solve, and the existing internal normalization (`normAddr`/`normAddrStrict`, already used throughout the
corpus) is built around a single address string.

**Optional inputs:** none in V1. No `force_refresh`, no `include_financing` toggle, no scenario overrides
(credit score, down payment) — accepting caller-supplied financing assumptions would turn a disclosed
illustrative default into something that reads as a personalized quote, which §9 explicitly rules out.

**Validation / normalization:** reuse the existing strict normalization already used for corpus matching
(lowercase, strip punctuation, collapse whitespace) — same function class already used by
`grok_property_cache` and the deep-enrich pipeline, not a new normalization scheme.

**Maximum length:** a generous fixed cap (e.g. 300 characters) purely as an abuse/DoS guard at the Gateway
layer — not a business rule.

**Unsupported input:** non-US addresses are out of scope for V1 (the whole platform is US-only today) —
return the same `NOT_AVAILABLE` shape as an address with no corpus match, not a distinct error type.

**Ambiguous address:** V1 does not attempt fuzzy/partial matching or return multiple candidates — an
address that doesn't resolve to an exact normalized match against the corpus is `NOT_AVAILABLE`. Building
disambiguation (suggest-a-match) is a reasonable V2 idea, explicitly deferred here.

**Property not found vs. exists-but-not-qualified:** these are different real states (`unavailable` vs.
`noindex` internally, per §4) and must remain distinguishable externally — collapsing them would make
`NOT_AVAILABLE` an uninformative dead end for the calling AI. See §12.

**Authentication is explicitly out of scope for this contract.** Per the existing architecture agreement,
identity/auth lives at the Gateway layer, not in the request payload — this contract assumes the caller is
already authenticated by the time it reaches this function.

---

## 7. Response contract

Top-level shape (names illustrative — see the note on vocabulary below):

```json
{
  "contract_version": "property-intelligence-v1",
  "query": { "address_requested": "..." },
  "availability": { "status": "AVAILABLE", "reason": null },
  "property": { "address": "...", "city": "...", "state": "...", "zip": "...",
                "property_type": "...", "beds": 3, "baths": 2, "sqft": 1450 },
  "value_intelligence": { "avm": {...}, "list_price": {...}, "last_sale": {...}, "comparables": [...] },
  "financing_intelligence": { "assumption_profile": {...}, "loan": {...}, "market_rate": {...} },
  "ownership_cost_intelligence": { "tax": {...}, "insurance": {...}, "hoa": {...}, "estimated_piti": {...} },
  "market_location_intelligence": { "market": {...}, "location": {...} },
  "decision_intelligence": { "verdict": "...", "drivers": [...], "limitations": [...] },
  "freshness": { "as_of": "...", "staleness": "CURRENT" },
  "provenance": { "source_category": "...", "citation": "..." },
  "limitations": ["..."],
  "disclaimer": "HomeRates.ai is an independent educational tool — not a financial advisor, mortgage lender, or broker. ..."
}
```

**On vocabulary:** the section names above (`value_intelligence`, `financing_intelligence`, etc.) are
recommended, not mandated by this spec — they map directly and legibly to the five existing card names
(§4) so a reviewer can trace every external field back to its internal source, which matters for the
extraction-resistance review in §14. Do not adopt them uncritically without a final naming pass once this
contract is actually implemented — but do not invent a materially different vocabulary either without a
reason.

The response must let an external AI construct a useful answer to "what does HomeRates know about this
property, and how sure is it" without ever receiving the L2-L4 machinery, the methodology version string,
or raw internal source/table names — every field in the shape above traces to an `EXPOSE` or `TRANSFORM`
row in §5's matrix, never to an `INTERNAL ONLY` one.

---

## 8. Claim classification

The internal `FactLabel` system already exists and already does the classification work this section
would otherwise need to invent (`PROPERTY FACT` / `MARKET FACT` / `ILLUSTRATIVE ASSUMPTION` / `DERIVED
CALCULATION` / `ESTIMATE` / `AI INTERPRETATION`). **Recommendation: carry this taxonomy externally
essentially as-is** — it's already methodology-neutral (none of the six labels name a vendor, a formula,
or a proprietary system), it's already exactly the "fact vs. estimate vs. assumption vs. calculation vs.
interpretation" distinction the architecture conversation asked for, and reusing it means the external
contract and the internal system never drift into two different claim-classification schemes that could
silently disagree.

Every value-bearing field in the response contract (§7) should carry its label as a sibling field, e.g.:
```json
"avm": { "value": 742000, "claim_type": "ESTIMATE" }
```
This preserves the single most strategically valuable property of the internal system — that a consuming
AI can tell a fact from a guess — without requiring the external caller to know anything about *how*
HomeRates decided which label applied.

---

## 9. Financing semantics

Public Property Intelligence today already uses a disclosed illustrative financing assumption set — this
is not new to the external contract, but it needs materially stricter labeling once it leaves HomeRates'
own UI, where surrounding page context (headings, the existing card layout, the site's own disclaimer
footer) does a lot of the "this isn't a real quote" work implicitly. An external AI receiving just the
JSON has none of that surrounding context — the labeling has to carry the entire weight on its own.

**What's exposed:** the real internal `financing.scenario` object — a **single fixed illustrative buyer
profile** (740 credit score, 20% down payment, conventional-or-jumbo depending on loan amount, primary
occupancy, 30-year term). This profile does not vary per caller and is not derived from any real user in
any request. The loan amount, LTV, lender par rate, and monthly P&I that follow from it are real,
disclosed `DERIVED CALCULATION`/`ILLUSTRATIVE ASSUMPTION`-labeled values (§8), not fabricated.

**What must never happen:** the consuming AI must have no reasonable way to mistake this for a
personalized quote, a locked rate, an approval, or a borrower-specific recommendation. Concretely:
- No request-side override of the assumption profile (§6) — allowing a caller to supply their own credit
  score/down payment would let external content combine "HomeRates data" with caller-chosen numbers in a
  way that *reads* as a personalized quote even though HomeRates never personalized anything.
- The assumption profile should carry its own explicit `is_personalized: false` (or equivalent) marker
  *within* the `financing_intelligence` block itself, not only via the top-level response disclaimer — an
  agent that extracts just this sub-object (a realistic pattern, since agents often pull only the piece
  relevant to their user's question) should still see the illustrative-only signal without needing the
  rest of the response for context.
- LLPA/Rate Intelligence methodology itself is unchanged by this contract — V1 exposes the *output* of the
  existing engine (§4's `llpaDataSource`/`llpaEffectiveDate`/`llpaDisclaimer`, already real and already
  disclosed), never a modified or simplified version of the calculation.

---

## 10. Decision Intelligence semantics

This card requires the most deliberate design of the five, because the underlying system (Track 5) is
Trade Secret #1 and its raw output is the single highest-value extraction target in the entire proposal
(see the Legal/IP brief and §14 below).

**What can safely be returned:** a categorical verdict (the same 5-bucket public tier already used
elsewhere: Strong Buy / Ready to Offer / Buy with Caution / Watch the Market / Hold Off), a short list of
consumer-relevant drivers in plain language (re-derived from the real internal `strengths`/`concerns`
content, but repackaged as a standalone summary — not passed through as a field literally named
`decisionIntelligence.strengths`), and a `limitations` list (from the real internal `missing` array — e.g.
"HOA fee not confirmed").

**What must never be returned, in any form or at any precision:** the raw `l2`/`l3`/`l4` numeric scores;
anything resembling the level weights or verdict thresholds; `methodologyVersion`'s literal string;
`source` (`featured_properties`\|`computed`); or any reasoning trace/prompt-derived text that shows how a
score was assembled rather than just what HomeRates concluded.

**Preference ordering, stated explicitly:** outcome over mechanism, verdict over calculation breakdown,
consumer-relevant driver over internal score component. This is the same "outcomes, not mechanisms"
principle from the earlier architecture assessment, applied concretely to this one card.

**Why the categorical verdict is materially safer than it might look:** §14 finds that even a large,
systematic query set against a 5-bucket categorical output yields far coarser information than the same
attack against a continuous numeric score would — there's no gradient to regress a formula against. This
doesn't make the verdict field risk-free (§14 names it as a real, if low-severity, residual risk), but it's
the reason a categorical outcome is the right shape here rather than a compromise.

---

## 11. Provenance and freshness

**What must survive:** enough for a consuming AI to cite HomeRates responsibly and know how current the
data is — an `as_of` timestamp, a coarse staleness signal, and a source *category* general enough to be
citation-quality without being an architecture diagram.

**What must not survive:** `provenance.propertyEnrichmentSource`'s literal values (`'redfin'`,
`'web_search'`, `'featured_properties_organic_backfill'`) name specific acquisition pipelines, and the
four separate internal `*FetchedAt` timestamps expose that data is assembled from multiple distinct
backend tables/caches (snapshot, grok cache, featured_properties) — collapse to one `as_of` value (the
most recent of whichever internal timestamps apply) and one generic `source_category` value from a small
fixed enum, e.g. `PUBLIC_LISTING_DATA`, `AI_ASSISTED_ANALYSIS`, `MARKET_DATA` — never the raw pipeline
name.

**Staleness:** there is no existing internal "STALE" flag to inherit — freshness today is a continuous
timestamp, not a discrete state (confirmed in §4's audit). A `STALE` designation in the external contract
would be a **new derived concept**, computed from `as_of` against a threshold this contract would need to
define (e.g., AVM/comps data older than 30 days). Flagging this explicitly as new, not inherited — the
threshold itself is a product decision, not something audited off existing code.

**Provider-level detail** (which AI model, which specific API, internal confidence scores) must never
appear — citation-quality provenance is "this is public listing data" or "this is AI-assisted location
analysis," not "this came from Grok-4.3-search via the deep-enrichment cron."

---

## 12. Availability states

Recommended external states, mapped directly from the real internal `eligibility` field (§4) plus one
newly-derived concept:

| External state | Maps from | Meaning |
|---|---|---|
| `AVAILABLE` | internal `eligibility === 'index'` | Full five-card intelligence exists and meets the data bar. |
| `PARTIAL` | internal `eligibility === 'noindex'` | Property exists in the corpus with *some* real data (an AVM or a comp), but doesn't meet the full data bar (per the real `ineligibleReasons` list — missing comps, unresolved location, etc.). Return whatever fields genuinely have data; omit or null the rest — never fabricate to fill a `PARTIAL` response. |
| `NOT_AVAILABLE` | internal `eligibility === 'unavailable'`, or address has no corpus match at all | HomeRates does not currently have qualified intelligence for this property. **Critically: this must never trigger live generation** (§15) — the external AI receives enough information to tell its user "HomeRates doesn't have this yet," not a fabricated placeholder. |
| `STALE` | derived, not inherited (§11) | A new, additive signal layered on top of `AVAILABLE`/`PARTIAL` (e.g. `{status: "AVAILABLE", staleness: "STALE"}`) rather than a fourth mutually-exclusive state — a property can be fully available *and* old. |

`NOT_AVAILABLE`'s response body should still include enough structure (e.g. `availability.reason`) for the
calling AI to explain *why* — "not in HomeRates' corpus" reads very differently to an end user than
"HomeRates has this property but couldn't verify enough about it," and collapsing that distinction throws
away real information the internal system already tracks via `ineligibleReasons`.

---

## 13. Privacy boundary

Confirmed structurally against the actual `PropertyIntelligenceData` shape (§4): it contains **no**
borrower identity, Clerk ID, email, phone, income, assets, credit profile, DTI, budget, personal financing
assumptions, Discover output, LO information, conversation content, private scenario history, or any other
user's activity. The entire object is property-centered by construction — there is no field in the real
internal type that could carry any of the above even accidentally.

The one item requiring active exclusion rather than passive absence: `featured_properties.search_count`
(§5) — an organic-interest signal that, while not personally identifying, is a behavioral aggregate the
existing privacy hard rule's spirit argues against surfacing to any external consumer of the data, per the
same reasoning that already keeps it out of the public-facing cards today.

**Recommendation:** this section needs no new mechanism — the boundary is already structural in the
existing data model. The only discipline required is not accidentally widening the request/response
contract later to pull in anything from `buyer_evaluation_sessions`, `crm_touchpoints`, or any
consumer-linked table, none of which this contract touches in V1.

---

## 14. Extraction-resistance review

Evaluated from the perspective of a highly curious or hostile AI agent with unlimited query budget.

**After 1 query:** learns the property-level facts (beds/baths/AVM/comps) for one address — no different
in kind from what a human gets from the existing public property-intelligence page today. No new exposure.

**After 100 queries (varied addresses):** could start noticing patterns in which properties return
`AVAILABLE` vs. `PARTIAL` vs. `NOT_AVAILABLE`, and could infer HomeRates' rough acquisition-coverage
footprint (which metros/property types are covered). This is a real but low-severity leak — it reveals
*coverage*, not *methodology*. Acceptable for V1; worth monitoring if coverage strategy itself becomes
sensitive later.

**After 10,000 systematically varied queries:** this is exactly the oracle-attack scenario the Legal/IP
brief flags for Track 5. The response contract in §7 is specifically designed so this attack has *nothing
to extract* — no raw L2/L3/L4 values exist anywhere in the response at any precision, so there is no
numeric signal to regress against varied inputs. The one remaining soft spot: `decision_intelligence`'s
`verdict`/`drivers` are still *derived from* the real score internally, and a large enough query set could
in principle build a coarse map of "what verdict does HomeRates give this type of scenario" — but since
verdict is already a 5-bucket categorical (§10) rather than a continuous score, the achievable resolution
of any such extraction is inherently far coarser than recovering the actual weighted formula. This is a
materially different (and much lower) risk than exposing the raw scores would be, but it is not zero —
worth naming explicitly rather than claiming full immunity.

**Fields excluded specifically because they'd make extraction meaningfully easier:** `decisionIntelligence
.l2/l3/l4` (raw scores — the single highest-value target), `methodologyVersion` (tells an attacker exactly
which system version to target), `avmSources` in its current list form (reveals the AVM-blending method,
not just that an estimate exists), the four raw provenance timestamps (reveal internal cache/table
topology).

**Explicit position on rate limiting:** per the earlier architecture assessment, rate limiting alone was
already flagged as insufficient protection for proprietary methodology — this section confirms that
position. The response *shape* itself, not request throttling, is what prevents oracle-style extraction of
Track 5's actual formula; rate limiting only slows down attacks the shape doesn't already prevent (coverage
mapping, verdict-pattern mapping), it doesn't stop them.

---

## 15. Internal reuse boundary

**The safest existing entry point is `getPropertyIntelligenceData(propertyId)`** in
`lib/propertyIntelligence.ts` — and it already satisfies the "corpus/cache only, no live paid fallback"
requirement *by its own existing design*, not by anything this contract needs to add. Its own file header
states this outright: "Renders ONLY already-enriched HomeRates intelligence; no Grok/Tavily/enrichment call
is ever made from this module." Confirmed directly in the code read for this audit — `assembleRaw()` only
reads from `properties`, `property_snapshots`, `grok_property_cache`, and `featured_properties`; the only
live network call anywhere in the function is the FRED/OBMMI rate lookup inside the financing engine
(`getLatest(...)`), which is free, cached, public market data — not a paid or provider-metered call. This
is exactly the function the Gateway should call, not reimplement.

**What genuinely doesn't exist yet and would need to be built** (not now — flagged for the design that
follows this contract, once locked):
1. **Address → `properties.id` resolution.** The request contract (§6) is address-first by design; the
   existing safe entry point takes a `propertyId`. A lookup step (normalize the address, match against
   `properties.address_full` using the same case-insensitive matching pattern already established
   elsewhere in this corpus) sits between the two — additive, not a methodology change.
2. **The Output Shaping layer itself** (§5's matrix, §7's response contract) — this doesn't exist as code
   anywhere yet; it's the entire subject of this specification.

**Where the boundary must sit:** the future Gateway must call `getPropertyIntelligenceData()` (or the
address-resolution step immediately before it) and nothing else — it must never construct a parallel path
to `/api/property/lookup`, `/api/beta/grok-property`, or any Tavily/Redfin call directly. Because the
reused function already excludes all paid live calls internally, the "stop before live fallback" boundary
the architecture requires is inherited automatically by calling this specific function and no other.

---

## 16. Contract versioning

`contract_version: "property-intelligence-v1"` as a top-level response field (already shown in §7).

Internal methodology version (`METHODOLOGY_VERSION`, currently `"Decision Score L1-L4 (locked
2026-08-19)..."`) and external contract version are **explicitly separate** — the internal string must
never appear in an external response at all (§5), so there is no risk of them being conflated in the
response itself, but the *versioning discipline* still matters: HomeRates can change Track 5's internal
methodology (already has, per the locked-date in the string) without that requiring a new external contract
version, as long as the *shape and semantics* of the external response are unchanged. A new external
contract version is only needed when the response *shape or meaning* changes for external consumers — not
every time the internal scoring formula is tuned.

---

## 17. Example responses

Illustrative only — no endpoint exists to serve these.

**A. Fully available, INDEX-quality property**
```json
{
  "contract_version": "property-intelligence-v1",
  "query": { "address_requested": "123 Main St, Anytown, CA 90001" },
  "availability": { "status": "AVAILABLE", "reason": null },
  "property": { "address": "123 Main St, Anytown, CA 90001", "city": "Anytown", "state": "CA",
                "zip": "90001", "property_type": "single_family", "beds": 3, "baths": 2, "sqft": 1450 },
  "value_intelligence": {
    "avm": { "value": 742000, "claim_type": "ESTIMATE" },
    "list_price": { "value": 725000, "claim_type": "PROPERTY FACT" },
    "comparables": [{ "address": "127 Main St", "sold_price": 718000, "sold_date": "2026-07-14" }]
  },
  "financing_intelligence": {
    "assumption_profile": { "credit_score": 740, "down_payment_pct": 20, "loan_type": "conventional",
                             "occupancy": "primary", "term_years": 30, "claim_type": "ILLUSTRATIVE ASSUMPTION",
                             "is_personalized": false },
    "loan": { "amount": { "value": 580000, "claim_type": "DERIVED CALCULATION" },
              "monthly_pi": { "value": 3712, "claim_type": "DERIVED CALCULATION" } },
    "market_rate": { "value": 6.42, "series_label": "OBMMI Conventional 30yr Fixed", "claim_type": "MARKET FACT" }
  },
  "decision_intelligence": {
    "verdict": "Ready to Offer",
    "drivers": ["Comps support the current list price", "Below-median days on market for this area"],
    "limitations": ["HOA fee not confirmed"]
  },
  "freshness": { "as_of": "2026-08-30T10:05:00Z", "staleness": "CURRENT" },
  "provenance": { "source_category": "PUBLIC_LISTING_DATA", "citation": "Public listing and market data" },
  "disclaimer": "HomeRates.ai is an independent educational tool — not a financial advisor, mortgage lender, or broker. All estimates are statistical models and may differ from actual outcomes. Not a loan offer, pre-approval, or commitment to lend."
}
```

**B. Partial intelligence**
```json
{
  "availability": { "status": "PARTIAL", "reason": "Comparable sale data not yet confirmed for this property." },
  "property": { "address": "...", "beds": 4, "baths": 2, "sqft": null },
  "value_intelligence": { "avm": { "value": 615000, "claim_type": "ESTIMATE" }, "comparables": [] },
  "financing_intelligence": null,
  "decision_intelligence": null
}
```

**C. Known to HomeRates but not qualified**
```json
{
  "availability": { "status": "NOT_AVAILABLE", "reason": "HomeRates has this address on record but does not yet have enough verified data to provide intelligence." }
}
```

**D. Not present in the corpus at all**
```json
{
  "availability": { "status": "NOT_AVAILABLE", "reason": "HomeRates does not currently have intelligence for this address." }
}
```
Note: C and D are deliberately similar in shape (both `NOT_AVAILABLE`) but carry different `reason` text —
the internal system can distinguish "exists, unqualified" from "no record at all" (§12), and the external
contract should preserve that distinction in the reason string even though the top-level status matches.

**E. Stale intelligence**
```json
{
  "availability": { "status": "AVAILABLE", "reason": null },
  "freshness": { "as_of": "2026-06-02T00:00:00Z", "staleness": "STALE" },
  "value_intelligence": { "avm": { "value": 598000, "claim_type": "ESTIMATE" } }
}
```

---

## 18. Business-value assessment

**Can another AI produce a materially better consumer answer with this contract than from generic web
search alone?** Yes, on the dimensions that matter most for a real estate/mortgage question: (1) a single
blended AVM with disclosed sourcing, rather than an agent having to reconcile several different public
estimates itself; (2) real comparable sales already matched and structured; (3) financing math (loan
amount, monthly P&I, LLPA-adjusted rate) computed against current OBMMI/FRED data rather than a generic
rate an agent might otherwise guess or hallucinate; (4) a categorical decision verdict with plain-language
drivers, which is qualitatively different from an agent trying to synthesize "should I offer on this" from
raw listing data alone. The claim-classification labels (§8) are themselves a real differentiator — most
web sources don't tell a consuming AI which numbers are fact versus estimate versus assumption.

**What HomeRates specifically contributes:** the AVM blend, the comps matching, the financing/LLPA
calculation, the categorical decision verdict, and the fact/estimate/assumption labeling — none of which
generic web search reliably provides pre-assembled.

**What should not be exposed merely because it exists:** the raw L2/L3/L4 numeric scores add no
*additional* consumer value beyond what the verdict + drivers already convey (a number without the formula
that produced it isn't actionable to an external consumer anyway) — they're pure leakage risk with no
offsetting business value in external form. Same logic applies to `avmSources`' literal source list (the
blended `avm` value already carries the value; the source list only adds *methodology* detail, not
*consumer* value) and to the four raw provenance timestamps (one `as_of` value carries all the consumer
value; the other three only reveal internal architecture).

---

## 19. Open questions

1. Should `PARTIAL` responses omit missing fields entirely, or include them as explicit `null` with a
   reason? (Recommendation: explicit null + reason, so the calling AI doesn't have to infer absence from
   missing keys — but this is a real design choice, not decided here.)
2. Does `decision_intelligence.verdict` need its own extraction-resistance monitoring in production (e.g.
   flagging unusually systematic query patterns against it) once real usage exists, given §14's finding
   that it's low-risk but not zero-risk?
3. Should property-not-found (`D` in §17) and property-not-in-Redfin-coverage-area be distinguished, or is
   collapsing them into one `NOT_AVAILABLE` reason acceptable for V1? (Currently: collapsed, per §12.)
4. Who owns the `staleness` threshold definition (§11) — is 30 days the right cutoff for AVM/comps data,
   and should different field types (market stats vs. AVM vs. location narrative) have different staleness
   windows?
5. Contract V1 has no `include`/`exclude` field-selection mechanism — every `AVAILABLE` response returns
   the full shape. Worth reconsidering once real external partners have real use cases, or premature to
   design now?

---

## 20. Recommendation

Contract V1 as specified above is buildable without violating any of the hard boundaries in §3: it never
exposes Track 5's raw scores or methodology name, it never triggers a live/paid call (by construction,
since it reuses `getPropertyIntelligenceData()` unchanged), it carries no borrower or cross-user data, and
its extraction-resistance profile is materially better than a naive "serialize the raw result" approach
would have produced. The claim-classification taxonomy already existing in the codebase (§8) is a genuine
asset worth carrying forward rather than reinventing.

Recommend: lock this contract (or a reviewed revision of it) before any Gateway/auth/rate-limiting
implementation work begins, per the agreed sequence. The address→propertyId resolution step and the
Output Shaping layer itself (§15) are the only two pieces of genuinely new code this contract implies —
everything else is either already-existing internal logic being reused, or a specification with nothing to
build yet.

**Per the governing instruction: stop after this specification.** No MCP server, Gateway, auth, API keys,
OAuth, rate limiting, circuit breaker, platform adapters, public endpoint, or any platform integration
(ChatGPT, Claude, Grok, Copilot) has been implemented or should be implemented until this contract is
reviewed and explicitly locked.
