# HomeRates.ai — Future ChatGPT/App Surface Design Spec

**Status: DESIGN SPECIFICATION, NOT IMPLEMENTED (2026-09-10, North Star Workstream 7).**
No Plugin/App listing metadata exists in this repository today — confirmed via a
repo-wide search before writing this doc. Public Plugin visibility remains deliberately
ON HOLD (`docs/HOMERATES_STRATEGIC_OBJECTIVE.md` §2). This document is a specification
for later use *if and when* that hold is lifted — it does not describe anything live,
and nothing in this document should be read as already built.

## Why this exists now

North Star Workstream 7 manually tested 4 real prompts against the live, OAuth-connected
ChatGPT/HomeRates MCP connection and observed genuinely strong invocation behavior
(4/4 appropriate invocations, correct claim discipline, correct progress-state
recognition). That real evidence is the basis for the taxonomy below — this is not a
speculative marketing exercise; it reflects what HomeRates was actually shown to do well,
organized around consumer intent rather than internal architecture (L1-L4 labels are an
internal decision-intelligence model, not user-facing navigation).

## Invocation territory (4 groups)

**1. Analyze a Property**
*Understand a specific home — facts, financing, ownership cost, comparable sales, and
market/location context, from real data, not a guess.*
Example prompt: *"Analyze 16424 S Denker Ave, Gardena, CA 90247"*
Evidence: directly tested (Test 1), strong.

**2. Evaluate Financing**
*See what financing a specific property looks like today — payment, rate context, and
the assumptions behind the numbers, clearly labeled as illustrative.*
Example prompt: *"What would it cost me monthly to buy this property with 20% down?"*
Evidence: directly tested (Test 3), strong.

**3. Make a Home Decision**
*Weigh a real decision against real evidence — is the asking price supported by nearby
sales, is this worth pursuing.*
Example prompt: *"Is the asking price for this home supported by the market?"*
Evidence: directly tested (Test 4), strong on synthesis; also the source of this
workstream's one real behavior gap (unsupported valuation-range invention — since fixed
in TOOL_DESCRIPTION, not yet re-tested live).

**4. Verify My Deal**
*An independent second opinion before committing — what to check, what's still unknown,
what a buyer should verify before an offer.*
Example prompt: *"What should I know before making an offer on this house?"*
Evidence: NOT directly tested this workstream (only 4 of the original 7 candidate prompts
were run) — included here as a reasonable, evidence-adjacent extension of what the
existing due-diligence/limitations fields already support, not a proven capability. Test
before relying on this in a real listing.

This taxonomy should replace, not sit alongside, an "L1/L2/L3/L4" framing on any future
consumer-facing surface — those labels are the internal decision-intelligence model this
document's four groups draw from, not language a user or a general AI's user-facing
narration should need to know.

## Hero message (proposed)

*"HomeRates.ai — specialized home and mortgage intelligence for any specific property:
financing, ownership cost, valuation context, and comparable sales, backed by real data."*

## Try asking HomeRates (proposed, 5 prompts)

1. "Analyze 123 Main St, Anytown, CA 90001"
2. "What would it cost me monthly to buy this with 20% down?"
3. "Is this home priced reasonably compared to nearby sales?"
4. "What should I know before making an offer on this house?"
5. "Tell me about [address]"

Kept short deliberately — the goal is teaching the pattern (a specific property, a real
question about it), not exhaustively cataloging every phrasing.

## What this spec does not cover

Visual design, card layout, and listing submission mechanics are out of scope for this
document and for this workstream — Phase 9 explicitly asked for a specification, not
implementation, and public Plugin submission work is explicitly excluded from every
North Star workstream to date. Revisit this document, and re-validate its evidence-backed
claims against then-current live behavior, before ever building against it.
