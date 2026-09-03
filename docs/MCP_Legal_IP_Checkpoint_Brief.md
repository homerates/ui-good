# HomeRates MCP Server — Legal / IP Checkpoint Brief

**Prepared:** 2026-09-02, by Claude (AI, at Rayaan Arif's direction) as an engineering-authored risk-scoping
document — **not legal advice.** Purpose: give an actual attorney (or Rayaan, acting on his own judgment)
a concrete, specific document to review before any MCP implementation work begins, rather than the risk
being scattered across a design conversation. Verify and expand every point below with qualified counsel
before relying on it.

**Sequence context:** this is step 1 of an agreed six-step plan — *Legal/IP checkpoint → External Contract V1
→ Auth/Request Policy → Cost & Abuse Controls → Gateway implementation → Platform adapters.* No code has
been written. No MCP protocol integration exists yet. This brief is the input to step 1, not its output.

---

## GOVERNANCE STATUS (2026-09-02, Rayaan)

**LEGAL/IP REVIEW REQUIRED — PARALLEL, NON-BLOCKING FOR DEVELOPMENT.**

The questions in this brief remain open and require subsequent legal review by the owner/counsel. This is
intentional, not an oversight: patent filing status, NDA strategy, trade-secret review, terms of use, and
the other open questions above are **not** treated as prerequisites to continuing architecture and
specification work. The business decision is that HomeRates needs to build and validate the external AI
intelligence capability to establish its actual technical and commercial value; legal protection proceeds
in parallel and must be completed before broader production distribution, where appropriate. **No legal
review has occurred as of this writing** — nothing above should be read as implying otherwise.

---

## 1. What's being proposed, in one paragraph

A gateway ("HomeRates Intelligence Gateway") that lets external AI platforms — ChatGPT, Grok, Microsoft
Copilot, and any other MCP-compatible client — call into HomeRates' Property Intelligence and Rate
Intelligence as tools, on behalf of *their own* end users, who are not HomeRates accounts. A response-shaping
layer sits between the existing engines and anything sent externally, intended to strip proprietary internals
before a response leaves HomeRates' control. Full technical architecture (gateway layers, cache reuse, cost
containment) was assessed separately in-session; this brief is scoped to the IP/legal dimension only.

---

## 2. Locked trade secrets, and how each one is actually touched

Per `trade_secrets.md` (locked 2026-05-24): four systems are HomeRates' core defensible IP. Below is a
concrete disclosure-risk read on each, specific to the MCP proposal — not a restatement of the trade secret
itself.

### Trade Secret #1 — Track 5 Decision Score Algorithm
**What's exposed if this ships as designed:** a callable `get_decision_score`-type tool. The genuine risk
here isn't a human reading the output — it's that an AI *agent* given a callable tool will run systematic
what-if variations for its user (change price, change down payment, change loan type) far more thoroughly
and quickly than any human clicking through the chat UI. That query pattern is close to a textbook
**oracle attack**: enough varied input/output pairs from a scoring function can make the function itself
inferable — specifically the level weights (L1 35% / L2 25% / L3 25% / L4 15%) and the verdict thresholds
(85/70/55/40).
**Open question for counsel:** does exposing *only* the composite score + verdict + a qualitative driver
summary (no per-level numeric breakdown) reduce this to an acceptable residual risk, or does the algorithm
need a formal IP protection step (see §4) before any externally-queryable version exists at all?

### Trade Secret #2 — Autonomous Decision Score Engine
**What's exposed:** the *orchestration* itself — the fact that L1/L2 compute instantly and L3/L4 resolve
asynchronously via a background AI call. If an MCP tool's response timing or structure mirrors this exact
pattern (e.g., a "computing" partial response followed by a delayed "complete" response), that timing
signature could itself hint at the multi-stage pipeline architecture, independent of whether any score
value leaks.
**Open question for counsel:** is a response-timing pattern that mirrors internal architecture a
meaningful disclosure risk, or is this overcautious relative to real trade-secret-misappropriation
standards? (Genuinely unsure — flagging rather than assuming either way.)

### Trade Secret #3 — AI Prompt Library & Orchestration Methodology
**Highest risk of the four.** This secret is specifically the *combination* of three named AI vendors
(OpenAI, Grok/xAI, Claude/Anthropic) in a cross-validation pattern, plus the scenario-routing and
parameter-extraction rules. Two distinct leak vectors:
- **Field-name/structure leakage:** if the gateway reuses the same internal response objects the web app
  uses, those objects likely carry field names or metadata (e.g. a field implying which named vendor
  produced which piece, or cache-provenance metadata) that reveal *that* a specific multi-model
  cross-validation pattern exists, even if the shaping layer redacts all *values*.
- **Behavioral probing:** an external agent could systematically vary its phrasing/scenario framing and
  observe which of the 15+ card types or routing paths fire, potentially reconstructing the routing logic's
  decision boundaries over many queries — a risk that scales with how many queries an external platform's
  entire user base can generate, which HomeRates cannot bound the way it can bound its own first-party
  traffic.
**Open question for counsel:** does this system currently qualify for trade-secret protection in a way
that survives being *queryable* (even indirectly, even shaped) by third parties at scale? Trade secret
status generally depends on reasonable efforts to maintain secrecy — does operating a queryable external
interface undermine that status even with output shaping in place, or is output shaping itself a
sufficient "reasonable effort"?

### Trade Secret #4 — Anonymous Private Messaging Architecture
**Not directly touched** by the current proposal — "Offer/Discover" intelligence (the piece that would
eventually touch matching/messaging) is explicitly marked "Future" and deferred in the current architecture.
**Flag for later, not now:** if Offer Intelligence is ever added to the MCP surface, this trade secret and
the R1–R5 marketplace hard rules (no lender identity, post-scenario-only matching, never paid placement)
become directly relevant and would need their own dedicated legal review at that time — not folded into
this one.

---

## 3. Disclosure risk by architectural layer (mapped to the agreed gateway design)

| Layer | IP/legal relevance |
|---|---|
| Platform Adapter / MCP | Low direct trade-secret risk — protocol choice itself isn't secret. But this is the layer that establishes an *ongoing, programmatic, third-party-scale* query surface where none existed before. |
| Gateway (Auth / Policy / Rate Limit / Cost Breaker) | Not a trade-secret exposure point, but a **compliance/liability** surface — this is where RESPA/GLBA/TRID obligations (per `COMPLIANCE_DECISIONS.md` Decision 8) get enforced, or fail to be enforced, for a distribution channel that didn't exist when those decisions were written. Worth an explicit compliance-counsel read on whether the existing hard stops (no SSN, no credit bureau data, no person-committed locked rate, mandatory educational disclaimer) are sufficient as currently worded to cover a request originating from a third-party AI platform rather than a signed-in HomeRates user. |
| Existing HomeRates Intelligence / Raw Result | **Highest-risk point in the pipeline.** This is where the full, unshaped output of the proprietary engines exists, however briefly, before any shaping happens. An unhandled exception, a verbose error message, or a debug/logging path that leaks to the external caller at this stage would be a direct, literal trade-secret disclosure — not a policy judgment call, an actual leak. |
| Output Shaping | This layer's adequacy is the thing that actually needs sign-off before launch. "How much detail is safe to reveal" is a legal/IP judgment, not a pure engineering guess — recommend counsel review the *specific shaped-response schema* once §Contract V1 (step 2 of the plan) is drafted, not just this brief in the abstract. |

---

## 4. Adjacent legal questions this proposal raises (beyond direct trade-secret leakage)

1. **Patent filing status is unknown to me and should be confirmed before proceeding.** `trade_secrets.md`
   lists "patent applications (provisional or utility)" as a citation context these trade secrets *should*
   appear in — it does not confirm any have actually been filed. If Track 5 and/or the Autonomous DSC Engine
   are patent-pending-but-not-yet-filed, publicly exposing algorithm *behavior* (even in shaped form) through
   a queryable external interface could have prior-art / disclosure-timing consequences under patent law,
   which has strict rules about public disclosure before filing. **This should be confirmed as a first step,
   independent of everything else in this brief** — if nothing has been filed yet, that may reorder the whole
   six-step sequence (filing before, not after, any external-facing surface goes live).
2. **No existing partner/developer API terms.** HomeRates has consumer ToS and LO/Pro agreements, but nothing
   scoped to "an AI platform company (OpenAI, Microsoft, xAI) querying our data on behalf of their own end
   users." A new agreement class is likely needed — usage limits, IP ownership/license grant for what the
   platform is allowed to do with a response, indemnification, and termination terms specific to this
   integration type.
3. **Downstream data handling once a response leaves HomeRates' control.** If a calling platform logs, caches,
   or trains on responses from HomeRates' gateway, that may functionally be a data-sharing arrangement.
   Given `feedback_consumer_privacy_hard_rule.md`'s standing "the consumer must feel safe... without that data
   being weaponized against them" principle, worth confirming whether any data-processing-agreement-style terms
   are needed with integration partners, even though the *end users* in this flow are the platform's own
   users, not HomeRates accounts.
4. **Attribution/citation obligations, both directions.** If ChatGPT (for example) cites HomeRates data in an
   answer to its own user, does HomeRates have any attribution requirement it wants to assert contractually
   (brand protection, not just IP), and conversely, could that platform's own terms claim broad rights over
   content that flows through their system in a way that conflicts with HomeRates' trade-secret posture?

---

## 5. Concrete questions this checkpoint needs to answer

For whoever conducts the actual review (Rayaan directly, or outside counsel):

- [ ] Has a patent application been filed for Track 5 and/or the Autonomous DSC Engine? If not, should filing happen before any external-facing MCP surface exists?
- [ ] Does the proposed output-shaping approach (outcomes only, no per-level scores, no raw prompt/reasoning text) preserve trade-secret status for Track 5 and the AI Prompt Library, or is a different/additional protection step needed?
- [ ] Is a new partner/developer API terms agreement required before connecting the first external platform, and if so, does it need to be platform-specific (one per ChatGPT/Grok/Copilot) or can one template cover all?
- [ ] Do the existing RESPA/GLBA/TRID hard stops in `COMPLIANCE_DECISIONS.md` need updated language to explicitly cover requests originating from a third-party AI platform on behalf of its own end user, rather than a signed-in HomeRates user?
- [ ] Is there a data-processing-agreement obligation given responses may be logged/cached/trained-on by the calling platform?

---

## 6. What this document is not

This is not legal advice, and it was not prepared by an attorney. It is an engineering-side scoping document
intended to make an actual legal review efficient and specific, prepared at Rayaan Arif's direction during
architecture planning for a not-yet-built system. Every risk and question above should be independently
verified, and likely expanded, by qualified IP/technology counsel before being relied on for any decision.
