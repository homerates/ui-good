# BRAND.md — HomeRates.AI

> Hard brand rules. These are guardrails, not guidelines. Claude Code must alert
> Rayaan before building anything that could breach them — including subtle or
> "honestly labeled" versions. When in doubt, treat it as a breach and ask.

---

## CORE POSITIONING

HomeRates.AI is the **first AI-powered Home + Mortgage intelligence platform**
(always with the plus sign). Independent, consumer-aligned, anti-lead-generation:
no data selling, no lead forms before a realistic solution, no lender hand-offs.

**Logo rule (hard):** For all visual/design work, always use the actual approved
HomeRates.AI logo asset — never a text wordmark, recreated, or approximated logo.
If the approved file isn't available, ask Rayaan to provide it rather than
substituting.

---

## MARKETPLACE & PLACEMENT — HARD RULES (non-negotiable)

These rules govern every surface that could show a lender, a rate, or a program.
They are brand-, value-, and ethics-load-bearing. Treat them as inviolable.

### R1 — No lender identity on HomeRates (for now)
No lender name, logo, or identifying mark appears anywhere on the consumer
surface. Matched lenders surface anonymized only. Identity reveal happens solely
after the borrower explicitly opts in, downstream, never by default.

### R2 — Matches are post-scenario only
Nothing lender-specific surfaces before the user has posted a complete scenario
(L1–L5 / Decision Score). Lenders appear only as the OUTCOME of a real scenario
the user generated — never as ambient content, never on a landing or sidebar
surface before a scenario exists.

### R3 — Flat and earned, never paid
Position is earned by matching the user's actual scenario. It is NEVER bought.
No paid placement, no preferential ordering, no pay-to-be-seen, no sponsored
slots — permanently, and specifically even when a lender offers to pay for it.
Results surface order-neutral. Refusing paid position is not a limitation of the
model; it IS the model.

### R4 — No sample, illustrative, or fabricated lender/rate/program inventory
We do not populate any surface with sample lenders, illustrative rates, or
example programs to make a marketplace look populated before it is. Not in the
sidebar, not pre-scenario, not "clearly labeled as illustrative," not derived
from real public data and dressed as inventory. An empty marketplace that fills
ONLY with genuine matches is the honest state of the product, and we show the
honest state. Empty-but-honest beats populated-but-theatrical, always — because
our entire wedge is that we don't do theater.

### R5 — Rate Intelligence and DPA/AMI are SEPARATE products
They are different businesses at different scales and must read as two distinct
products in the user's mental model. Separate surfaces, separate sidebars,
separate stories. Do not merge their UIs or rails to "unify" them, even if a
shared backend registry is convenient. If the shared registry ever creates
user-facing blur, drop the sharing — there is no prize for backend unification
when the products are this different.

### Sidebar / right-rail semantics
The right rail means "mine" on consumer surfaces (My Decision Portfolio, My
Properties) — things the user scored or owns. It must NEVER silently flip to
mean "market" (lenders, rates) in the same visual slot, as that reads as
endorsement. Supply-side context, if ever shown, requires a distinct visual
treatment and label that cannot be mistaken for "My ___."

### WHY THIS HOLDS (citable to lenders, verbatim)
The same rule that excludes a lender when they'd pay protects them from a
competitor buying the top slot. Flat and earned cuts both ways. That is the
product. When a lender asks to pay for placement, the answer is no, and that
"no" is the reason they should want to be here.

---

## PRODUCT DEFENSIBILITY — HARD RULE (non-negotiable)

### The Reproducibility Test

HomeRates will not ship, or prioritize, any feature whose core value can be
substantially reproduced in under an hour by someone pasting a screenshot or
description into Claude, Grok, or a similar model and saying "reproduce this."

If the primary experience is a calculator, a static report template, a basic
what-if slider, or a generic AI chat wrapper that a competent prompt can
recreate as a toy, it fails the test. Those things are table stakes now and
will be flooded with low-quality copies. HomeRates' durable advantage is the
**system**, not any single visible widget.

**Clarification — this is not a test of surface novelty.** The interface can,
and often should, look like what a consumer or professional already expects
from a lender or the tech that supports lenders/agents — calculators, sliders,
chat, reports are familiar shapes for a reason, and familiarity is good UX.
The test is never "does this look different." It is "is the value underneath
that familiar surface reproducible by a casual prompt." The bar to clear is
depth of prompt engineering, data reach, and system intelligence beneath a
recognizable surface — not novelty for its own sake. A slider UI that looks
exactly like every competitor's slider UI can still pass the test, if what's
computing behind it is deep enough that no one recreates it in an hour.

**Why this is the right filter right now:** the barrier to shipping a
decent-looking mortgage calculator or rate tool has collapsed. Anyone can
generate one. Most will remain toys: no real-time multi-source data, no
deterministic engines with audit trails, no persistent private memory, no
compliance architecture, no living journal, no network of high-signal
professional responses, and no ongoing intelligence layer that improves with
the user's actual saved scenarios.

### What still qualifies

Hard to copy quickly because the difficulty sits in infrastructure, data
freshness, orchestration, and compounding intelligence — not the UI:

- **Rates Oracle** grounded in live FRED + property data, personalized to the
  user's actual saved scenarios and Decision Levels.
- **Living Home Intelligence Journal / Welcome Back** — private, evolving
  context that surfaces relevant changes without the user re-explaining
  everything.
- **4 Decision Levels scoring**, when it's a real multi-factor engine (not a
  simple threshold) tied to deterministic math + market context + user
  constraints.
- **Anonymous pro-response layer** with quality controls, rate limits,
  reputation, and compliance guardrails — the network and trust mechanics are
  the hard part.
- **Deep property + rate + affordability synthesis** that stays accurate
  across edge cases and updates over time.
- **Shareable Decision / Rate Reality Cards** — only if the intelligence
  underneath is non-trivial. The card is presentation; the wow must come from
  data quality, personalization, and scoring that a one-shot AI app cannot
  match.

### What gets deprioritized or treated as supporting-only

- Standalone calculators (PITI, DSCR, basic affordability, simple rate
  sensitivity).
- Generic "AI mortgage coach" chat without memory, deterministic backbone, or
  live data.
- Static or lightly templated reports that look impressive but contain no
  proprietary or hard-to-maintain intelligence.
- Any feature whose main claim is "look how fast we generated this UI."

### Operational test — run this before building anything new

1. Can a skilled person recreate 70–80% of the visible experience and core
   calculation in a single Claude/Grok session?
2. Does the lasting value require ongoing data pipelines, private state,
   multi-step reasoning with guardrails, or network effects?
3. If ten people ship a similar-looking tool next month, do we still win on
   accuracy, trust, personalization, or depth?

If the answer to (1) is yes and (2)/(3) are weak, kill or demote it. This
protects against feature inflation and keeps focus on the parts that actually
create switching costs and organic traction — depth that cannot be casually
reproduced, not speed of scaffolding.

---

## ARCHITECTURE / TOOLING COMPATIBILITY — HARD RULE (non-negotiable)

Before introducing any new technology, third-party library, framework, or
coding language/paradigm not already used in production, ask first: **does
this require a different architecture or coding approach that could impact
the existing production build?** If yes, that risk must be surfaced and
addressed BEFORE integration is attempted — not discovered afterward by
debugging why something broke.

**Citable incident (2026-08-03):** porting the viz-demo module into the
Next.js app carried over Tailwind CSS utility classes from its original,
separate Vite scaffold. Activating Tailwind's entry point to make those
classes work would have applied Tailwind's global Preflight CSS reset to
every existing page — this app's production UI is built entirely on plain CSS
custom properties and inline styles with no expectation of that reset ever
running, so doing this could have visually altered buttons, inputs, and
headings across the whole live site. This was caught before it shipped, but
it was caught reactively, mid-build, when the ported page rendered unstyled —
not proactively, before the port began. The check belongs at the front of the
task: "does the tool I'm about to bring in assume a build/runtime environment
this app doesn't have?"

This applies to any cross-cutting layer, not just CSS: a different state
manager, a different data-fetching library, a different animation engine, a
different module bundler assumption — anything that isn't purely additive and
isolated to new files risks touching shared, load-bearing infrastructure.

### Business case requirement (before any introduction)

Compatibility is necessary but not sufficient. Before introducing new
technology, a third-party tool, or a new module that expands scope, the
evaluation is a full business case, not just an architecture check:

1. What does this concretely do to support the vision — durable, hard-to-copy
   value per the Reproducibility Test above — not just "it would be useful"?
2. What is the likely impact on the existing product, users, and production
   build, and is there an explicit plan to manage that impact (not just a
   note that it exists)?

Approval requires both a clear business rationale tied to the vision AND a
managed-impact plan. "The idea sounds good" or "it's technically compatible"
is not, on its own, a reason to proceed.

---

## CLAUDE CODE ENFORCEMENT — ALERT BEFORE BUILDING

Before designing, scoping, or building ANY feature touching lenders, rates,
programs, sidebars, pre-scenario surfaces, marketplace, placement, ordering, or
monetization, check it against R1–R5. If a request, idea, or your own proposed
approach could breach any of them — including subtle or "honestly labeled"
versions — STOP and flag it to Rayaan explicitly before proceeding. Name the
rule at risk and the specific breach. Do NOT quietly implement a borderline
version. Surfacing the tension is required, not optional. When in doubt, treat
it as a breach and ask. This applies to Rayaan's own future ideas as much as to
external lender asks — the tripwire fires regardless of source.

Before proposing, scoping, or building ANY new feature at all — not just
marketplace-adjacent ones — also run it against the Reproducibility Test
above. If a skilled person could recreate 70–80% of it in a single AI session
and it doesn't lean on live data pipelines, private state, deterministic
engines, or network effects for its lasting value, flag it explicitly as
low-defensibility before building. Do not quietly build it anyway as "an easy
win" or "just a demo." This applies to Rayaan's own future ideas as much as to
inbound asks — the tripwire fires regardless of source.

Before adding any new library, framework, or tool not already in this
codebase's stack, also run the Architecture/Tooling Compatibility check above.
If it requires a different build step, styling system, state model, or
runtime assumption than what production already uses, name that risk
explicitly before writing integration code — including when the new tool is
scoped to a single new page or module, since global entry points (CSS
imports, providers, config files) can silently become shared/global even when
the feature they're for is not.

That compatibility check alone is not approval to proceed. State the business
case explicitly — what this does for the vision, per the Reproducibility Test
— and the managed-impact plan, before writing integration code. If either is
missing, say so and ask, rather than proceeding on the assumption that a
technically clean approach is automatically a justified one.
