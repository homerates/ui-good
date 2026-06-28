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
