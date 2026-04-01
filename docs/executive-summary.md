# HomeRates.ai — Executive Summary
**April 2026 — Updated with Digest Engine, Borrower Intelligence, and Property Lookup Expansion**

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

### Property Intelligence — Any Listing Site, Any Address
Paste a Redfin, Zillow, Realtor.com, or Trulia URL — or type a plain street address — and instantly get a full property intelligence report: PITI breakdown, income required, estimated equity and balance, CMA highlights, market snapshot, and decision trade-offs. For sold/off-market properties, includes a refi readiness analysis with an interactive LTV + closing cost slider. Realtor.com and Trulia are handled via Tavily extraction when those sites block direct access.

### Monthly Homeowner Digest
LOs can enroll borrowers in an automated monthly email — sent on the 1st of each month — with their property's current AVM value, estimated equity, prevailing rate, and a refi window indicator. Data comes from Rentcast's AVM. LOs manage addresses and digest settings from the Borrowers page; manual sends are also available at any time.

### Borrowers Dashboard (`/lo/borrowers`)
LOs see their full borrower list, set or update each borrower's property address, toggle digest enrollment, and trigger one-click manual digests. When a borrower shares a chat thread, the LO automatically receives a notification email with the borrower's name, a preview of their question, and a link to the shared conversation.

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
- Property Intelligence — Redfin, Zillow, Realtor.com, Trulia, plain address input; sold/off-market refi analysis
- Monthly Homeowner Digest — Rentcast AVM snapshots, equity tracking, refi window detection, automated Resend email, Vercel cron
- Borrowers Dashboard — inline address editor, Send Digest button, LO notification on borrower share
- Unified Refi Slider — LTV + closing cost sliders on all refi scenarios
- PDF export live and auth-gated across all modules
- Conversational AI routing: conventional, FHA, DSCR, VA, jumbo, refi, affordability, loan limits, property intelligence
- Insurance rate: 0.3%/yr of home price across all calc cards (consistent, price-scaled)
- Mobile-optimized: responsive layout, touch-optimized sliders, full-width cards
- Full legal compliance posture: no NMLS, educational-only disclaimers on all outputs
- Dark mode: full theme support including Clerk auth modals and legal pages

---

## Revenue Model — Five Streams

HomeRates.ai monetizes the same core platform across five distinct buyer personas, each with independent pricing, sales motion, and retention dynamics.

| Stream | Model | Status | Y1 Target ARR |
|---|---|---|---|
| **1. Direct to Consumer** | Free / Plus $7/mo / Pro $19/mo | **Live** | $72k |
| **2. Direct to Loan Officer** | $49–99/mo per LO seat | **Live** | $41k |
| **3. Direct to Agent** | $19/mo per agent | Q3 2026 | — |
| **4. Broker Firm Licensing** | $4,800–$36,000/yr per firm | Q4 2026 | $15k |
| **5. Lender / Bank Enterprise** | $24,000–$120,000+/yr | H1 2027 | $24k |

**Y1 Total ARR target: $152k**

### Why Five Streams Is a Strength, Not Complexity

Each stream is independent. B2C builds brand trust. LO/agent adoption creates borrower-side virality. Broker deals are one sales motion that unlocks 20–200 LO seats instantly. Enterprise lender deals are high-value and relationship-driven. The same product powers all five — the platform is already built.

### Gross Margin

The calc-first architecture is a structural cost advantage: 80%+ of queries never reach a paid LLM API. At scale:
- Infrastructure + LLM + payments ≈ 8–12% of revenue
- **Gross margin: 85–92% on paid tiers**

### 3-Year ARR Projection

| | Y1 (2026) | Y2 (2027) | Y3 (2028) |
|---|---|---|---|
| Total ARR | $152k | $1.10M | $5.93M |

*Full model with stream-by-stream assumptions: [docs/revenue-model.md](revenue-model.md)*

---

## Revenue Infrastructure (Fully Live)

- Clerk authentication — user accounts, sign-up/sign-in, session management
- Stripe billing — Free/Plus/Pro subscriptions, monthly and annual, Customer Portal
- Supabase subscription sync — plan and usage tracking via Stripe + Clerk webhooks
- LO Portal — borrower slots, invite links, billing dashboard
- Rate and property watch alerts — email notifications for refi and rate targets
- In-app Settings panel — account, plan, billing, and navigation in one place
- Monthly digest engine — Rentcast AVM, Resend email, Vercel cron (1st of month)
- Borrowers dashboard — address management, digest enrollment, manual send
- LO notification on share — automatic email when a borrower shares a chat thread

---

## What's Next

**Q2–Q3 2026**
- Property address collection during borrower onboarding (currently set by LO on borrowers page)
- Borrower engagement metrics — last active, chat count, digest open rate
- Direct to Agent product launch
- National loan limits expansion beyond California
- HELOC and commercial DSCR modules

**Q4 2026 – H1 2027**
- Broker firm licensing product
- First enterprise lender deals
- Warm lead routing — opt-in hand-off to verified lenders when user is ready

---

## Summary

HomeRates.ai has built what didn't exist: a fast, accurate, consumer-first mortgage intelligence layer that works like a financial co-pilot. Five fully interactive calculators, live FRED data, 2026 loan limits for all CA counties, and sold-property refi analysis — all deterministic, all instant, all without touching a paid LLM for calculable questions.

The full revenue stack is live: authentication, subscriptions, billing, the LO portal, rate alerts, and a Settings panel. Five revenue streams are identified with independent unit economics and sales motions. The core product is production-grade. The path to $1M ARR does not require a single enterprise deal.
