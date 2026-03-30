# HomeRates.ai — Pitch Deck
**March 2026 — Updated with Revenue Model & Projections**

---

## SLIDE 1 — Cover

# HomeRates.ai
### The AI mortgage co-pilot built for consumers, not lenders.

*Instant answers. Real math. Your numbers.*

---

## SLIDE 2 — The Problem

### Buying or refinancing a home is the biggest financial decision most people make.

**Yet:**
- 🔒 Lender tools are designed to **capture leads**, not educate you
- 🤷 Generic AI chatbots give **ballpark guesses**, not real numbers
- 📊 Calculators give numbers with **no context or conversation**
- 🕐 Getting an actual answer requires a call, a meeting, or a credit pull

**The result:** Millions of buyers, homeowners, and investors make $400k+ decisions with incomplete information.

---

## SLIDE 3 — The Solution

# Ask. Calculate. Understand. Act.

HomeRates.ai is a **conversational mortgage intelligence platform** that gives anyone instant, accurate, and educational answers — without a lender, without a sales pitch, and without giving up personal data.

> *"What's my payment on a $550k house at 6.75% with 10% down?"*
> → Answer in under a second. With full breakdown. With sliders. With a PDF.

> *"I'm looking at a sold property in Trabuco Canyon — should I refi?"*
> → Instant refi analysis with LTV slider. No loan officer required.

---

## SLIDE 4 — Product: How It Works

```
You ask a mortgage question (or paste a Redfin URL)
         ↓
System routes to precision calc engine (no LLM delay for math)
         ↓
Instant answer + interactive slider card
         ↓
Adjust variables → new answer → download PDF → send to lender
```

**The AI handles only what math can't:** nuance, edge cases, underwriting guidelines.

Everything calculable is answered **deterministically** in under 200ms.

---

## SLIDE 5 — Product: Five Modules

| Module | What It Answers |
|---|---|
| 🏠 **Home Purchase** | Full PITI payment, PMI/MIP, LTV — conventional or FHA |
| 💰 **Affordability** | Max home price at your income, DTI analysis, cash-to-close |
| 📈 **DSCR / Invest** | Cash flow, debt service coverage ratio, lender thresholds |
| 🔄 **Refinance** | Monthly savings, break-even, LTV slider, closing cost scenarios |
| 🗺️ **CA Loan Limits 2026** | Conforming vs high-balance vs jumbo — all 58 CA counties |

**Every module includes:**
- Live interactive sliders (adjust and re-calc instantly)
- Smart follow-up chips ("What if I put 20% down?")
- PDF export — branded, fully disclosed, shareable

---

## SLIDE 6 — Product: The Experience

**Step 1:** User asks a question in plain English — or pastes a Redfin listing URL

**Step 2:** System returns a precise answer with the full math

**Step 3:** Interactive slider card appears below the answer
- Move the LTV slider → balance and payment recalculate live
- Adjust closing costs → breakeven month updates instantly
- Hit "Run Adjusted Scenario" → new AI conversation with new numbers

**Step 4:** "Save as PDF" → branded report to share with spouse, realtor, lender

**Step 5:** Follow-up chips surface the next logical question automatically

---

## SLIDE 7 — The Technical Moat

### Most mortgage AI: Question → LLM → Text answer
### HomeRates.ai: Question → Calc engine → Verified answer (+LLM for the rest)

**Why this matters:**

| Dimension | LLM-only approach | HomeRates.ai |
|---|---|---|
| Speed | 2–8 seconds | < 200ms for calc answers |
| Accuracy | Probabilistic | Deterministic (exact math) |
| Cost per query | High (LLM API) | Low (most queries: no LLM) |
| Trust | "It said $2,400/mo" | "The math says $2,411/mo" |
| Data | Stale training data | Live FRED rates + 2026 FHFA limits |

**The calc engine routes 80%+ of queries without touching a paid LLM API.**

---

## SLIDE 8 — Unique Capability: CA 2026 Loan Limits Explorer

### No other mortgage AI platform has this.

- **Interactive zone explorer** — conforming ($832,750) / high-balance ($1,249,125) / jumbo for all 58 CA counties
- **ZIP or county lookup** — type "92101" or "Riverside" and instantly see your county's limits and rate premium
- **"Stay conforming" callout** — exact down payment needed to avoid jumbo pricing
- **Live rate premiums** — conforming, +0.30% HB, +0.50% jumbo — all from FRED
- **Payment comparison at every boundary** — see the exact cost of going jumbo

Fully deterministic. Zero LLM. Updates automatically with FRED rate changes.

---

## SLIDE 9 — Market Opportunity

### The U.S. mortgage market is $11 trillion in outstanding debt.

**Addressable users today:**
- **44 million renters** doing rent-vs-buy math
- **140 million homeowners** — refinance, HELOC, equity decisions
- **Millions of real estate investors** running DSCR on every deal
- **First-time buyers** — 4+ million transactions per year
- **Every buyer of a sold/off-market property** exploring refi options

**The model:** Consumer-free-tier → premium features → LO/lender tools

HomeRates.ai sits at the top of the funnel, **before** the lender conversation — the most valuable, least-served moment in the mortgage journey.

---

## SLIDE 10 — Five Revenue Streams

HomeRates.ai is not a single-product company. It monetizes the same platform across five buyer personas — each with different pricing, sales motion, and retention dynamics.

### Stream 1 — Direct to Consumer (Live)
- **Free:** 20 msgs/mo, all calculators
- **Plus:** $7/mo — unlimited messages, PDF export, rate alerts, saved analyses
- **Pro:** $19/mo — everything + 10 borrower slots, LO tools
- Gross margin: 85–92% (calc-first keeps LLM cost minimal)

### Stream 2 — Direct to Loan Officer (Live)
- $49–99/mo per LO seat
- LO gets an invite link; borrowers onboard under their profile
- Sticky: every borrower the LO adds increases switching cost

### Stream 3 — Direct to Real Estate Agents (Q3 2026)
- $19/mo individual — $15/agent/mo for teams
- Agents share HomeRates.ai links in listing presentations; "run the numbers" becomes their differentiator
- 1.5M+ licensed agents in the US

### Stream 4 — Broker Firm Licensing (Q4 2026)
- $4,800–$36,000/yr annual site license per firm
- Compliance-ready, white-label profile for every LO, firm-level analytics
- One broker deal = 20–200 LO activations immediately

### Stream 5 — Lender / Bank Enterprise (H1 2027)
- $24,000–$120,000+/yr
- Custom subdomain, unlimited LOs, API access, dedicated SLA
- Compliance framing: educational-only outputs = no NMLS exposure for the bank

---

## SLIDE 11 — Financial Projections

### ARR by Stream (3-Year)

| Stream | Y1 (2026) | Y2 (2027) | Y3 (2028) |
|---|---|---|---|
| Direct to Consumer | $72k | $432k | $2.34M |
| Direct to LO | $41k | $237k | $1.28M |
| Direct to Agent | — | $132k | $750k |
| Broker Licensing | $15k | $120k | $600k |
| Lender / Bank | $24k | $180k | $960k |
| **Total ARR** | **$152k** | **$1.10M** | **$5.93M** |

### Unit Volume

| | Y1 | Y2 | Y3 |
|---|---|---|---|
| Paid B2C users | 500 | 3,000 | 15,000 |
| Active LOs | 50 | 250 | 1,200 |
| Active Agents | — | 500 | 2,500 |
| Broker firm deals | 3 | 15 | 60 |
| Lender / bank deals | 1 | 5 | 20 |

### Gross Margin

- **Infrastructure + LLM + payments = ~8–12% of revenue** at scale
- Calc-first architecture: 80%+ of queries never touch a paid LLM API → structural cost advantage over all-LLM competitors
- **Y3 gross margin: ~92%**

### Path to $1M ARR (without enterprise deals)
- 7,000 paid B2C users × $12 blended ARPU = $1.0M ARR alone
- 10 broker firm deals × $8k avg = $80k ARR (low sales cost, high retention)
- Enterprise lender deals = significant upside once B2B credibility is established

---

## SLIDE 12 — Traction

### Live in production. Revenue system fully operational.

**Product**
✅ Conversational AI routing — all question types
✅ Five interactive calculator modules (including CA Loan Limits Explorer)
✅ Property Intelligence — sold/off-market Redfin analysis → instant refi card
✅ PDF export — auth-gated, all modules, fully disclosed
✅ Mobile-optimized — responsive, touch-first, full-width cards
✅ Smart follow-up chips — contextual, per-module
✅ Rate ticker — live FRED mortgage rate data on every response
✅ 2026 FHFA loan limits ($832,750 / $1,249,125) — all 58 CA counties
✅ Rate & property watch alerts — email notifications when targets are hit

**Revenue Infrastructure (live)**
✅ Clerk authentication — full user accounts, sign-up/sign-in flows
✅ Stripe billing — Free/Plus/Pro subscriptions, monthly and annual
✅ Stripe Customer Portal — self-serve plan management and cancellation
✅ Supabase subscription sync — real-time plan/usage tracking via webhooks
✅ LO Portal — loan officer dashboard, borrower slots, invite links
✅ Settings panel — in-app account, billing, and plan management

**Deployed on Vercel. Custom domain (db.homerates.ai). Zero infra overhead. Ready to scale.**

---

## SLIDE 13 — Team / Positioning

HomeRates.ai is built by people who understand that the mortgage industry's information asymmetry hurts consumers — and that AI can fix it, if it's built on real math.

**Philosophy:**
- The platform works **for the borrower**, not for the lender
- Every answer is **verifiable** — show the math, cite the inputs
- **Education first** — we don't sell loans, we help people understand them

This is not a lead-gen tool dressed up as AI. It's a new category: **mortgage intelligence infrastructure**.

---

## SLIDE 14 — Ask / Next Steps

### What we're building toward:

**Shipped (Q1 2026)**
- Full auth + subscription billing (Stripe Free/Plus/Pro)
- Rate and property watch alerts
- LO Portal with borrower invite links
- In-app Settings panel (account, billing, plan management)
- Uniform dark design system across all pages

**Near term (Q2–Q3 2026)**
- Borrower list view with status and engagement metrics for LOs
- Direct to Agent product launch
- National loan limits expansion (beyond CA)
- HELOC, construction, and commercial DSCR calculator modules

**Medium term (Q4 2026 – H1 2027)**
- Broker firm licensing product
- First enterprise lender deals
- Lead routing module — warm opt-in hand-off to verified LOs

**Fundraise / Partnership use cases:**
- Scale SEO + content marketing to the 44M+ renter and buyer audience
- Accelerate B2B sales motion (LO → broker → lender pipeline)
- Engineering capacity to ship Streams 3–5 on schedule

**The ask:**
We're looking for partners who understand that the next generation of mortgage consumers will expect an AI-first experience — and that the platform serving them needs to be built on **their** side of the table.

**Current ARR target: $152k (Y1 2026) → $1.1M (Y2 2027)**

---

*HomeRates.ai — For educational use only — homerates.ai/disclosures*
