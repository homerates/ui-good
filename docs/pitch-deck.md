# HomeRates.ai — Pitch Deck
**March 2026**

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

## SLIDE 10 — Business Model

### Consumer (B2C)
- **Free tier:** Full conversation, all calculators, unlimited questions
- **Registered accounts:** PDF export, saved analyses, history
- **Premium (future):** Scenario comparisons, rate watch alerts, market intelligence

### Lender / LO (B2B) — roadmap
- White-label homerates.ai for loan officers to share with clients
- Warm lead routing — user opts in to connect with a verified LO
- Analytics dashboard — what are buyers in your market asking?

**Unit economics:** Low LLM cost per query (calc-first routing) = favorable margins as volume scales.

---

## SLIDE 11 — Traction

### Live in production. All core modules shipped.

✅ Conversational AI routing — all question types
✅ **Five** interactive calculator modules (including CA Loan Limits Explorer)
✅ Property Intelligence — sold/off-market Redfin analysis → instant refi card
✅ PDF export — auth-gated, all modules, fully disclosed
✅ Mobile-optimized — responsive, touch-first, full-width cards
✅ Smart follow-up chips — contextual, per-module
✅ Rate ticker — live FRED mortgage rate data on every response
✅ 2026 FHFA loan limits ($832,750 / $1,249,125) — all 58 CA counties
✅ Dark mode — full theme support
✅ Full compliance posture — educational disclosures, no NMLS required

**Deployed on Vercel. Zero infrastructure overhead. Ready to scale.**

---

## SLIDE 12 — Team / Positioning

HomeRates.ai is built by people who understand that the mortgage industry's information asymmetry hurts consumers — and that AI can fix it, if it's built on real math.

**Philosophy:**
- The platform works **for the borrower**, not for the lender
- Every answer is **verifiable** — show the math, cite the inputs
- **Education first** — we don't sell loans, we help people understand them

This is not a lead-gen tool dressed up as AI. It's a new category: **mortgage intelligence infrastructure**.

---

## SLIDE 13 — Ask / Next Steps

### What we're building toward:

**Near term:**
- User account history and saved analyses
- Rate watch alerts — notify when refi breakeven target is hit
- A/B testing on question routing accuracy

**Fundraise / Partnership use cases:**
- Scale marketing to the 44M+ renter audience
- Build the LO white-label product
- Expand to HELOC, construction, commercial DSCR
- National loan limits expansion (beyond CA)

**The ask:**
We're looking for partners who understand that the next generation of mortgage consumers will expect an AI-first experience — and that the platform serving them needs to be built on **their** side of the table.

---

*HomeRates.ai — For educational use only — homerates.ai/disclosures*
