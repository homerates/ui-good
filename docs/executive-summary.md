# HomeRates.ai — Executive Summary
**March 2026**

---

## The Problem

The mortgage process is one of the most consequential financial decisions a person makes — and one of the most opaque. Consumers lack instant access to reliable, personalized numbers. Lenders' tools are designed to capture leads, not educate borrowers. AI chatbots give generic answers. Calculators give numbers with no context.

The result: buyers walk into conversations with lenders uninformed, renters don't know when buying makes sense, and investors misread cash flow on deals.

---

## What HomeRates.ai Is

HomeRates.ai is an AI-powered mortgage intelligence platform built for the consumer side of the transaction — homeowners, first-time buyers, renters, and investors. It combines a precision mortgage calculation engine with a conversational AI to give anyone instant, accurate, and educational answers to their most important mortgage questions.

**Ask a question. Get a real answer. Adjust the numbers. Download it.**

---

## What It Does Today

### Conversational Calc Engine
Users ask questions in plain English — "What's my payment on a $450k house at 6.875%?" or "Would I qualify for FHA?" or "Does this rental cash flow?" or "Should I refi my sold home?" — and receive precise, formatted answers in seconds. The system routes calculable questions to a local deterministic engine before touching any LLM, ensuring fast, consistent, and verifiable results.

### Five Interactive Calculators

| Module | What it answers |
|---|---|
| **Conventional / FHA** | Full PITI payment, PMI/MIP, LTV, total interest over term |
| **Affordability** | Maximum home price at your income and DTI, cash-to-close gap |
| **DSCR / Investment** | Debt service coverage ratio, monthly cash flow, lender thresholds |
| **Refinance** | Monthly savings, break-even month, 5-yr net benefit, LTV & closing cost sliders |
| **CA Loan Limits 2026** | Interactive zone explorer — conforming vs high-balance vs jumbo by county |

Users move sliders, see results recalculate live, and can fire a new "adjusted scenario" into the AI conversation with one click.

### 2026 Loan Limits Explorer (market differentiator)
The only mortgage AI with a fully deterministic, interactive 2026 loan limits explorer covering all 58 California counties. Users can look up conforming/high-balance/jumbo zone thresholds, payment comparisons at each boundary, and "stay conforming" callouts — by ZIP code or county name. Uses live FRED rates. Zero LLM.

### Property Intelligence — Sold & Off-Market Analysis
Paste a Redfin URL for any sold or off-market property and instantly get a refi readiness analysis: estimated balance, current monthly payment at today's rate, breakeven, and an interactive LTV + closing cost slider. Detects listing status from the Redfin page itself (not third-party text) for accuracy.

### PDF Export (Account Feature)
Any calculator result can be saved as a branded, fully-disclosed PDF report — shareable with a spouse, a realtor, or a lender. PDF export requires a free account, creating a natural registration hook tied to user value.

### Smart Follow-Up Chips
After every answer, contextual follow-up suggestions appear — "What if I put 10% down?", "Compare 20yr vs 30yr", "What rent do I need to break even?" — enabling users to explore without having to type.

---

## The Technical Moat

Most mortgage AI tools route everything to an LLM and render a text response. HomeRates.ai's architecture inverts this: **the calc engine is primary, the LLM is secondary.** This means:

- **Speed**: Calculable answers return in under 200ms (no LLM roundtrip)
- **Accuracy**: Math is deterministic, not probabilistic — the numbers are always right
- **Auditability**: Every calculation can be traced to a formula and explained
- **Cost**: The majority of queries never touch a paid LLM API
- **Data integrity**: 2026 FHFA/HUD limits ($832,750 / $1,249,125) baked into all calculations; live FRED mortgage rates on every response

The LLM layer handles only what the calc engine cannot: open-ended advice, underwriting guidelines, edge cases, and narrative explanation. The system automatically routes between them.

---

## Market Position

HomeRates.ai is not a lender, broker, or lead-generation tool. It earns trust by being transparently on the consumer's side — providing education without a sales agenda.

**Target users:**
- First-time homebuyers trying to understand their options before talking to a lender
- Existing homeowners evaluating a refinance
- Renters doing the rent-vs-buy math
- Real estate investors running DSCR analysis on deals
- Buyers and owners of sold/off-market properties exploring refi scenarios

**Market size:** 140M+ U.S. homeowners + 44M renters + millions of active real estate investors.

---

## Current Status

- **Live in production** on Vercel
- **Five** interactive calculator modules operational end-to-end
- CA 2026 Loan Limits Explorer — all 58 counties, ZIP lookup, county adjuster
- Property Intelligence — Redfin sold/off-market detection, instant refi analysis
- Unified Refi Slider — LTV + closing cost sliders on all refi scenarios
- PDF export live and auth-gated across all modules
- Conversational AI routing: conventional, FHA, DSCR, VA, jumbo, refi, affordability, loan limits
- Mobile-optimized: responsive layout, touch-optimized sliders, full-width cards
- Full legal compliance posture: no NMLS, educational-only disclaimers on all outputs
- Dark mode: full theme support including Clerk auth modals and legal pages

---

## What's Next

- **User accounts & history** — save, name, and revisit past analyses
- **Rate watch alerts** — notify users when their refi breakeven rate is hit
- **Loan officer tools** — white-label version for LOs to share with clients
- **Lead routing (optional)** — warm hand-off to verified lenders when user opts in
- **HELOC, construction, commercial DSCR** — expand calculator coverage

---

## Summary

HomeRates.ai has built what didn't exist: a fast, accurate, consumer-first mortgage intelligence layer that works like a financial co-pilot. Five fully interactive calculators, live FRED data, 2026 loan limits for all CA counties, and sold-property refi analysis — all deterministic, all instant, all without touching a paid LLM. The core product is live. The technical foundation is production-grade. The next step is users.
