# HomeRates.ai — Strategic Objective

**Status: CURRENT (updated 2026-09-15; originally 2026-09-09, Rayaan).** This is the durable statement of *why* HomeRates
is building an external intelligence surface at all. Read this before any Gateway, MCP,
Property Intelligence, or Rate Intelligence task — it frames what a given change is *for*,
which the technical docs (linked below) deliberately don't cover.

Same tier as `PLATFORM_INTELLIGENCE_VISION.md` and `COMPLIANCE_DECISIONS.md`. Do not delete
or override without founder sign-off.

---

## 1. The end game

HomeRates is **not** primarily trying to:

- build a public ChatGPT Plugin
- get listed in a plugin directory
- become another property lookup tool
- compete on generic AI answers
- expose every internal HomeRates capability externally

**The end game is: build HomeRates.ai as a specialized home + mortgage intelligence layer
that general AI systems find valuable enough to invoke.**

HomeRates should provide intelligence that materially improves a consumer's decision when
general AI alone is insufficient, less current, less contextual, or less specialized.

The strategic progression:

```
SEARCHABLE → RETRIEVABLE → CITABLE → INVOKABLE → RECOMMENDABLE
```

Plugin distribution is only one delivery mechanism. MCP is only transport. The durable asset
is:

**HomeRates Intelligence Gateway + HomeRates Specialized Intelligence.**

Everything built under `lib/gateway/`, `lib/canonicalPropertyIntelligence.ts`,
`app/api/mcp/*`, and `app/api/oauth/*` exists to serve this progression — not to maximize
plugin-store visibility.

---

## 2. Current near-term strategy

**Public Plugin visibility is deliberately ON HOLD.** Do not optimize for public
distribution yet.

Current sequence:

1. Understand/fix unknown-property demand-driven resolution.
2. Systematically test what ChatGPT actually sees, invokes, and does with HomeRates.
3. Identify intelligence gaps from real AI behavior (not hypothetical ones).
4. Improve existing intelligence and/or add specialized tools.
5. Retest.
6. Determine whether HomeRates is materially improving AI answers.
7. Only then reconsider public Plugin visibility.

The operative question is **not** "Can users find the HomeRates Plugin?" It is:

**"Does an AI have a compelling reason to call HomeRates?"**

Every workstream on the external-facing surface should be evaluated against that question
before against distribution/growth questions.

---

## 3. Mandatory Objective Check (for future engineering tasks)

Before implementing a meaningful engineering task, work out — explicitly, even if briefly —
the following. This is now also referenced from `CLAUDE.md` so it loads every session.

1. **What immediate problem are we solving?**
2. **Which HomeRates strategic objective does this support?**
3. **Does the change improve one or more of:** authority, retrievability,
   citation-worthiness, invocation value, decision intelligence, data reliability, consumer
   usefulness, AI usefulness, or the privacy/security needed for external invocation?
4. **Classify it:** (A) strategic capability, (B) enabling infrastructure, (C) necessary
   defect correction, (D) cosmetic/local optimization.
5. **Could solving the local issue accidentally move us away from the larger architecture
   or product objective?**
6. **Are we fixing a symptom when a broader architectural issue has already been
   identified?**
7. **What should explicitly remain unchanged?**

Necessary bug fixes are never blocked for being non-strategic. But a fix must stay
context-aware: a local fix must never silently redefine product semantics, intelligence
boundaries, canonical methodology, invocation philosophy, public/private boundaries, the
Rate Intelligence vs. Property Intelligence role split, or Gateway architecture.

## 4. Mandatory Completion Check (for future substantial tasks)

Final reports for substantial engineering tasks should include:

```
OBJECTIVE CHECK:               <how this work supports the HomeRates end game>
LOCAL PROBLEM SOLVED:          <yes/no + concise explanation>
STRATEGIC OBJECTIVE ADVANCED:  <yes/no + explanation>
ARCHITECTURAL DRIFT INTRODUCED: <yes/no>
NEW STRATEGIC QUESTION CREATED: <if any>
NEXT HIGHEST-IMPACT STEP:      <one step, not a list of unrelated improvements>
```

This exists to stop future sessions from becoming absorbed in iterative local fixes while
losing sight of the larger objective — without ever blocking a fix that's actually needed.

---

## 4a. Retrospective Objective/Completion Check — Canonical Property Intelligence workstream (2026-09-08/09)

Applied retroactively to the body of work this section's own creation follows, for
continuity:

```
OBJECTIVE CHECK: A live ChatGPT invocation showed inconsistent, occasionally
  misleading numbers for the same property across surfaces, and one real data-integrity
  gap (wrong-property matching). Both directly threaten "does an AI have a compelling
  reason to call HomeRates" -- an AI (or a person) that catches HomeRates contradicting
  itself, or attaching the wrong property's data to an address, has a reason NOT to trust
  the tool, which is the opposite of invocation value.
LOCAL PROBLEM SOLVED: Yes -- address-identity hardening closed a real wrong-property
  persistence bug; the canonical-consistency work closed a real cross-surface numeric
  drift bug (rate, insurance, valuation, PITI/PITIA all disagreed between first-party and
  external for the same property).
STRATEGIC OBJECTIVE ADVANCED: Yes -- data reliability and citation-worthiness (a
  consistent, non-contradictory answer is a prerequisite for being citable at all), and
  the demand-driven resolution work is a direct experiment against sequence step 1
  ("understand/fix unknown-property demand-driven resolution").
ARCHITECTURAL DRIFT INTRODUCED: No -- Gateway/OAuth/MCP protocol/Decision Score
  weights/Rate Intelligence methodology are all confirmed unchanged by regression across
  every commit in this workstream (see §6 of the Gateway architecture doc's addendum).
NEW STRATEGIC QUESTION CREATED: Does HomeRates' current basic first-party lookup pipeline
  (Tavily search -> Redfin scrape -> broad web-search fallback) resolve a genuinely
  reachable but not-yet-cached real address reliably enough for demand-driven
  acquisition to be a good bet in practice? (2030 N Hobart Blvd, Los Angeles, CA 90027
  returning NOT_AVAILABLE via ChatGPT is the concrete open instance -- see the Gateway
  architecture doc's addendum for the unresolved diagnostic.)
NEXT HIGHEST-IMPACT STEP: Diagnose the Hobart Blvd NOT_AVAILABLE case with real evidence
  (not speculation) before doing anything else on the external surface -- per this
  document's own near-term sequence, step 2 ("systematically test what ChatGPT sees,
  invokes, and does") is the current phase, and an unresolved real failure in that testing
  is exactly what step 2 exists to surface.
```

**Resolved (2026-09-15), with evidence, not speculation:** `2030 N Hobart Blvd, Los
Angeles, CA 90027` is now in the corpus (`properties.confidence: 0.9`, `enriched_at:
2026-09-09T02:44:28Z`, direct Redfin scrape) -- confirmed via direct query, not inferred.
The original `NOT_AVAILABLE` was very likely the address-search non-determinism §31.4 of
the Gateway architecture doc's addendum already documents (a real address can legitimately
fail on one attempt and resolve on a later one) -- not a standing defect. Closed; no further
action needed on this specific instance. The general question it raised (how reliable is
demand-driven resolution at scale) is superseded by the more specific, evidence-based
findings in §4b below.

---

## 4b. Retrospective Objective/Completion Check — Real-AI-Behavior Testing Cycle (2026-09-13/15)

Applied retroactively to AD-36 through AD-45 in `ARCHITECTURE_DECISIONS.md` -- the direct
execution of this document's near-term sequence steps 2-5 (systematically test what
ChatGPT/Grok/Claude/Perplexity actually see and do with HomeRates; identify intelligence
gaps from real behavior; fix; retest). Method throughout: real property addresses run
through ChatGPT via the live MCP connector, compared side-by-side against HomeRates' own
first-party report and, for several properties, an independent third-party AI's own
research on the same address -- never a hypothetical or synthetic test case.

```
OBJECTIVE CHECK: Every fix below traces to a real, observed AI response that either
  understated HomeRates' actual capability (silent data gaps, a discouraging dead-end on a
  null AVM), overstated it (an unsupported price-reduction claim, a wrong-unit property
  match presented as fact, an implied named-agent recommendation), or reflected a genuine
  protocol-level gap (no declared MCP output schema). Each is a direct instance of "does an
  AI have a compelling reason to call HomeRates" -- either the answer would have been wrong,
  or it would have looked no better than what the AI could produce unaided.
LOCAL PROBLEM SOLVED: Yes, for each of the following, each independently verified live
  (not assumed) before shipping:
  - AD-38 sale_terms: a real cash-only/as-is/Trust-sale listing was being described as
    "turnkey" -- a materially misleading characterization now caught and disclosed.
  - AD-39 original_list_price: an unsupported "significant price reduction" claim (no
    original price on record, 5 days on market) is now only ever stated when a real,
    checkable number backs it -- verified live to escalate to a MORE convincing but still
    unverifiable claim on the first, prompt-only attempt before the structured field made it
    checkable.
  - AD-40 MCP outputSchema/structuredContent: ChatGPT's own connector settings UI was
    flagging every tool "OUTPUT SCHEMA RECOMMENDED"; all 5 tools now declare one, derived
    directly from the same Zod contract that already validates responses (cannot drift).
  - AD-41 wrong-unit resolution: a real, reproduced incident where a multi-unit condo
    address silently resolved to a different physical unit's price/specs, presented as
    verified fact -- refused outright now, on both resolution branches, with a regression
    test reproducing the exact incident deterministically.
  - AD-42 report-surface parity: discovered mid-session that the actual PDF report users
    generate (`/property-report`, reached via `/property-intel`'s own "Build Report"
    button, plus its white-label twin `/wl-report`) is a SEPARATE page from `/property-intel`
    that had never received AD-38/AD-39's fixes at all -- ported both, and fixed an
    independent hardcoded-tax-rate bug found in the same investigation.
  - AD-43 Redfin AVM: traced "HomeRates has not retrieved a usable AVM" to a real,
    100%-reproducible bug -- `fetchPropertyData()`'s final return object had never included
    `estimatedValue`/`lastSaleDate`/`lastSalePrice` since they were added to the schema on
    2026-08-11, silently dropping Redfin's own AVM on every direct scrape. Fixed, plus a
    narrowly-gated retry for the separate, confirmed-real bot-mitigation issue found while
    testing (verified via a proper multi-request probe using this repo's own
    `tools/redfin-probe.mjs` methodology, not assumed).
  - AD-44/AD-45 AVM messaging: per explicit product decision (chasing more scraping
    infrastructure was evaluated and declined previously, reaffirmed here), a null AVM is
    now framed as pending intelligence pointing to the report, and the report teaser names
    real content categories (condition/sale-terms checking, full location breakdown,
    decision-readiness scoring) to create a reason to click through -- deliberately never
    the underlying numbers, so the teaser cannot substitute for the report itself.
  - Also fixed in the same window, not separately numbered: a hard "never recommend a named
    agent/brokerage" violation found in a live AI Buyer Strategy output (extended the
    existing no-vetting-language rule, which previously covered only first-party marketing
    copy, to AI-synthesized Grok content).
STRATEGIC OBJECTIVE ADVANCED: Yes, primarily citation-worthiness and invocation value
  (every fix above closes a gap between what HomeRates actually knows and what an AI
  represented it as knowing, in both directions) and data reliability (AD-43 alone was a
  100%-reproducible defect affecting every Redfin-sourced AVM in the corpus, not just the
  one property that surfaced it).
ARCHITECTURAL DRIFT INTRODUCED: No new architecture -- all 8 fixes extend existing,
  already-locked mechanisms (claim_type discipline, intelligence_progress/deep_intelligence,
  the identity-validation gate, the canonical tax-rate/PITI engine) rather than introducing
  new ones. One deliberate, explicit precision-over-coverage tradeoff was accepted (AD-41):
  a genuinely correct single-family-home match via the broad-search fallback branch is now
  refused, same as an ambiguous multi-unit match, because the fallback cannot tell the two
  apart -- some previously-resolvable addresses will now report NOT_AVAILABLE instead.
NEW STRATEGIC QUESTION CREATED: All 5 tools (`homerates_property_intelligence`,
  `homerates_rate_oracle`, `homerates_loan_limit_intelligence`,
  `homerates_scenario_intelligence`, `homerates_buyer_capacity_intelligence`) are now
  live in `tools/list` -- a material change from this document's original §31.2 note that
  only one tool was externally exposed. This was not a decision made in this window; it
  predates it and was only confirmed as current fact while shipping AD-40. Worth an explicit
  check: was broadening from one tool to five itself evaluated against this document's own
  Mandatory Objective Check, or did it happen incrementally without that gate? Separately:
  AD-41's coverage tradeoff (fewer resolvable addresses, in exchange for zero wrong-property
  matches) has not yet been measured at real volume -- worth watching whether it meaningfully
  reduces how often HomeRates can answer at all for a genuinely new address.
NEXT HIGHEST-IMPACT STEP: NONE of AD-38 through AD-45 have been merged to `main` as of this
  writing -- every fix in this retrospective exists only on `dev`. Confirm the intended
  merge timing before drawing any conclusion from a live ChatGPT test about whether these
  fixes "worked" -- a test against `chat.homerates.ai` before the merge is a test of
  pre-fix code, not a regression.
```

---

## 5. Related documents

- `docs/HOMERATES_INTELLIGENCE_GATEWAY_V1_ARCHITECTURE.md` — the Gateway's technical
  architecture (auth, rate limits, circuit breaker, corpus-only guarantee, output shaping).
  See its own "Post-Launch Additions" addendum for everything built since the original
  Phase A-F lock.
- `docs/HOMERATES_EXTERNAL_PROPERTY_INTELLIGENCE_V1.md` — the external contract itself
  (currently v1.2), field-by-field, with the versioning history.
- `docs/HOMERATES_EXTERNAL_ADAPTER_V1.md` — the Phase G MCP adapter's own design notes.
- `docs/MCP_Legal_IP_Checkpoint_Brief.md` — parallel, non-blocking legal/IP review
  checklist. Patent filing status is explicitly **unknown/unconfirmed** there — do not
  describe patents as filed anywhere without repository evidence.
- `ARCHITECTURE_DECISIONS.md` — the project's general decision log (AD-1 onward);
  AD-12 through AD-17 cover the original canonical-consistency workstream (§4a above);
  AD-36 through AD-45 cover the real-AI-behavior testing cycle (§4b above) -- read that
  file directly for full incident-level detail, this document's §4b is the summary.
- `PLATFORM_INTELLIGENCE_VISION.md` — the separate (unrelated) "HomeRates has memory"
  personalization vision for the CRM/person-activity system. Do not confuse the two
  "platform intelligence" concepts — that one is about per-person memory, this one is
  about the external invocation layer.
