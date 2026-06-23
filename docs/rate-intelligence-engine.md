# HomeRates.ai — Rate Intelligence Engine
## Business Case, Legal Analysis & Architecture Decision Record
**Created: June 2026 | Status: Approved for Phase 1 build**

---

## Overview

The Rate Intelligence Engine decodes the mortgage industry's B2B pricing infrastructure — specifically Fannie Mae and Freddie Mac's publicly available **Loan-Level Price Adjustment (LLPA) matrices** — and translates it into consumer negotiation intelligence. It is the first consumer-facing tool of its kind. No Bankrate, NerdWallet, LendingTree, or general AI model provides this. It is a genuine market gap.

**One-sentence positioning:** Show consumers the wholesale cost basis of their mortgage so they can negotiate from facts, not fear.

---

## How Mortgage Pricing Actually Works (Research Context)

Understanding this is essential before any architectural or legal decision.

### The Pricing Chain

Every conventional conforming loan in America follows this chain:

```
Fannie Mae / Freddie Mac par rate
        │
        ▼
+ LLPA adjustments (risk-based, published publicly)
        │
        ▼
= Wholesale price (what lenders see on their rate sheets)
        │
        ▼
+ Lender overlay (additional lender-specific risk adjustments)
+ Lender margin / origination profit (0.375–0.50% typical retail markup)
+ Lock period adjustment (15-day: -0.125%, 60-day: +0.25%)
        │
        ▼
= Consumer rate (what the borrower is quoted)
```

Consumers currently see only the bottom number. The Rate Intelligence Engine shows them the structure above it.

### What LLPAs Are

Loan-Level Price Adjustments are risk-based fees mandated by Fannie Mae and Freddie Mac on every conventional conforming loan they purchase. They are:

- **Publicly available** — published at singlefamily.fanniemae.com and updated quarterly
- **Non-negotiable at the GSE level** — lenders cannot waive them
- **Expressed in price points** — e.g., 2.125 points = 2.125% of loan amount as an upfront cost
- **Convertible to rate** — approximately: every 4 price points = 1.00% in rate

**Primary LLPA factors (Fannie Mae matrix):**
| Factor | Example adjustment range |
|---|---|
| Credit score × LTV | 0 to +3.75 points |
| Occupancy (investment vs. primary) | +0.125 to +1.00 points |
| Loan purpose (cash-out refi) | +0.375 to +4.125 points |
| Property type (2–4 unit, condo) | +0.375 to +1.00 points |
| High-balance loan (above $806,500) | +0.25 to +0.75 points |
| Lock period (15 vs. 60 day) | -0.125 to +0.25 points |

**Key regulatory note:** The FHFA (Federal Housing Finance Agency) is actively reviewing the LLPA matrix as of 2025–2026 under Director Bill Pulte. The matrix can change. Any implementation must treat LLPA data as versioned, timestamped, and requiring quarterly review.

### Wholesale vs. Retail Spread

Research finding (Feb 2026 market data): wholesale mortgage rates average **0.375–0.50% lower** than retail bank rates across all conventional loan types. This is the lender markup range. It is not secret — it is the industry standard margin — but it is invisible to consumers without a transparency layer.

### Industry Pricing Engines (B2B Only)

The following platforms are what lenders actually use to price loans. **None have consumer-facing components.** This is the gap HomeRates.AI fills.

| Platform | Owner | Market role | Consumer access |
|---|---|---|---|
| Optimal Blue | Constellation Software | $1T+ in annual lock/trading | None |
| Polly | Independent | Capital markets, mid-large lenders | None |
| Mortech | Zillow | Correspondent/broker pricing | None |
| Black Knight Empower | ICE Mortgage | LOS + pricing integration | None |

---

## Business Case

### Why Build This

**1. Uncontested market position.** No consumer tool explains LLPAs or shows pricing structure. The data is public. The gap is real.

**2. Consumer stickiness.** The negotiation moment — sitting across from an LO with documented pricing intelligence — is the highest-anxiety point in a home purchase. A consumer who has saved their LLPA profile, their "competitive rate range," and their negotiation brief to their vault does not leave the platform.

**3. Professional stickiness.** Independent loan officers spend significant time explaining why a rate is what it is. An LO who shares a HomeRates.AI rate intelligence report with a client turns a defensive conversation into a transparent one. White-label to independent LOs as a B2B tier ($99–$299/month).

**4. Vault lock-in.** Saving multiple scenarios ("my profile today," "if I raise my score 40 points," "if I put 5% more down") creates a comparison set that no other platform holds. This is the moat.

**5. LLM citation flywheel.** Content pages explaining LLPAs with rich FAQ schema and accurate public data are exactly what AI models cite when users ask "why is my mortgage rate higher than advertised?" The product and the SEO strategy are the same motion.

### Revenue Implications

- **B2C:** Rate intelligence feature gates vault save to authenticated users → increases Clerk sign-ups → converts to paid vault subscribers
- **B2B/LO white-label:** Licensed LOs pay monthly for embedded rate intelligence client education tool
- **Long-term:** Anonymized, aggregated LLPA usage data reveals what profiles consumers are actually bringing — a market intelligence asset

---

## Legal & Compliance Analysis

### Regulatory Framework Overview

Five federal frameworks apply. All are navigable with correct framing. State law adds a sixth layer that requires targeted attention in CA and NY.

---

### 1. RESPA Section 8

**What it is:** Real Estate Settlement Procedures Act prohibits giving or receiving "any thing of value" in exchange for referral of settlement service business (including mortgage origination).

**The 2023 CFPB Advisory Opinion (critical precedent):**
In February 2023, the CFPB issued an advisory opinion specifically addressing digital mortgage comparison-shopping platforms. The three-part test for a RESPA violation:
1. The platform non-neutrally presents information about settlement service providers
2. That non-neutral presentation steers the consumer to specific providers
3. The operator receives payment or "thing of value" for that referral activity

**All three prongs must be present for a violation.**

**Safe harbor established:** Presenting lender information based on neutral criteria (e.g., ascending APR order) without receiving payment from ranked lenders is specifically protected.

**HomeRates.AI position:** The Rate Intelligence Engine does not display lenders, does not compare lenders, does not refer users to lenders, and accepts zero payment from lenders for any placement. This is **RESPA-clean by design** — and is actually a cleaner position than Bankrate, NerdWallet, or LendingTree, all of which operate lead-gen models that the same advisory opinion flagged as risks.

**Governing rule:** The RESPA Section 8 advisory opinion remains in effect as of June 2026 (the MBA has challenged it but it has not been withdrawn).

**Risk: Low.** Zero-lender-payment model is the legal architecture. This rule must never be broken.

---

### 2. SAFE Act (Secure and Fair Enforcement for Mortgage Licensing Act)

**What it is:** Requires individuals to be licensed mortgage loan originators (MLOs) if they engage in "the business of a residential mortgage loan originator" — defined as taking loan applications, or offering or negotiating mortgage loan terms.

**What triggers licensing:** Taking applications, offering credit, negotiating credit terms.

**What does NOT trigger licensing:** Displaying publicly available pricing information, explaining how mortgage pricing works, running educational calculations. Processors, underwriters, and assistants who don't take applications or negotiate terms are not MLOs under federal SAFE Act.

**HomeRates.AI position:** The Rate Intelligence Engine:
- Does NOT take loan applications
- Does NOT offer credit
- Does NOT negotiate or commit to loan terms
- Does NOT pull credit (users enter a score range, no bureau pull)
- Displays publicly available LLPA data with educational framing

**Risk: Low-Medium.** The distinction between "education" and "offering credit" is not precisely codified. The critical legal guardrail: never use the words "you qualify for," "you are approved for," "your rate is," or any language that implies an offer or commitment. Always frame as "educational estimate."

**Action required:** Before Phase 2 launch (full rate range display), obtain a written legal opinion from a mortgage/fintech attorney in California and New York (the two most aggressive state regulators). Budget $3,000–$8,000.

---

### 3. TILA / Regulation Z (Truth in Lending Act)

**What it is:** Regulates credit advertising. Specific "trigger terms" — if a specific rate, APR, payment amount, or down payment appears in an advertisement — require full TILA disclosures to be present.

**Key distinction — educational vs. advertisement:** Purely informational content that does not solicit customers is NOT treated as an advertisement under Reg Z. The trigger: if the "informational" content includes a call-to-action that solicits a credit application (e.g., "Apply Now"), it becomes an advertisement.

**HomeRates.AI position:**
- Results are framed as "educational estimates," not rate quotes
- No "Apply Now" or "Get Your Rate" CTA connected to any lender
- No application flow anywhere in the rate intelligence feature
- Results include a rate *range* (not a specific committed rate), which further reduces trigger term exposure

**Risk: Low.** Maintained by: never including an application CTA in the results flow, always displaying the "educational estimate" disclaimer, and avoiding combining a specific rate + specific payment + specific term in a single display that looks like a loan offer.

---

### 4. ECOA / Fair Housing Act (Fair Lending)

**What it is:** Equal Credit Opportunity Act and Fair Housing Act prohibit discrimination in credit based on protected characteristics (race, color, religion, national origin, sex, familial status, disability).

**2026 regulatory shift (critical):** The CFPB finalized a rule in April 2026 (effective July 21, 2026) eliminating disparate impact liability under ECOA — going forward, ECOA enforcement focuses on intentional discrimination only. However, **the Fair Housing Act still covers mortgage lending under disparate impact** (per *Texas Dept. of Housing v. Inclusive Communities Project*, SCOTUS). Mortgage tools that produce disparate outcomes for protected groups remain exposed under FHA.

**HomeRates.AI position:** The Rate Intelligence Engine uses only factors that appear in the actual Fannie Mae LLPA matrix:
- Credit score
- LTV ratio
- Occupancy type
- Loan purpose
- Property type
- Loan amount (conforming vs. high-balance)
- Lock period

**Inputs explicitly excluded:**
- ZIP code
- Neighborhood or census tract
- School district
- Race, ethnicity, gender, or any demographic data
- Any proxy variable that could correlate with protected class

Using the actual GSE factors is the strongest possible defense — these are the congressionally blessed risk factors that Fannie Mae itself uses. A disparate impact claim against a tool that mirrors the GSE's own public matrix would have to attack Fannie Mae's methodology simultaneously.

**State risk:** New Jersey has codified disparate impact under state law with explicit AI explainability requirements. California DFPI has signaled similar attention. Monitor.

**Risk: Low** (if LLPA-only factors maintained). **Risk: High** if any geographic or demographic variable is ever added.

---

### 5. State Mortgage Licensing

**The risk:** Some states broadly define "mortgage brokering" or "mortgage solicitation" to include activities that could arguably describe a rate transparency tool.

**Priority states:**

| State | Regulator | Known posture |
|---|---|---|
| California | DFPI | Aggressive. "Soliciting" mortgages without license = violation. |
| New York | DFS | Aggressive. Broad interpretation of "arranging" mortgages. |
| Texas | OCCC | Moderate. Educational tools generally OK with clear disclaimers. |
| Florida | OFR | Moderate. |

**Mitigation:**
1. Prominent "not a mortgage lender, broker, or loan originator" disclosure on every page of the feature
2. No application flow, no lender referral, no contact capture
3. Legal opinion letter from CA and NY counsel before Phase 2 launch
4. Display MLO NMLS recommendation: "For an actual rate quote, consult a licensed mortgage professional" with link to CFPB's mortgage resources

**Risk: Medium.** Most likely vector is not federal enforcement but a state regulator complaint triggered by a competitor who files it to slow us down. Correct framing + legal opinion = strong defense.

---

### 6. Product Liability / E&O

**Scenario:** A consumer uses the Rate Intelligence Engine, decides not to buy discount points because the tool's estimate suggested their rate was competitive, later discovers they overpaid by 0.25% over 30 years, and claims reliance damages.

**Defense:** Prominent disclaimers, "educational estimate" framing, no representation of accuracy.

**Practical mitigation:** Errors & Omissions (E&O) insurance for a fintech platform at this stage costs $2,000–$5,000/year. Recommended before Phase 2 launch.

**Risk: Low-Medium.** Disclaimers are strong. Real risk is reputational (a story about a consumer who "followed HomeRates.AI's rate estimate and got burned") more than legal.

---

## Risk Summary Table

| Risk | Severity | Probability | Status |
|---|---|---|---|
| RESPA Section 8 violation | High | Low | Mitigated by zero-lender-payment model |
| SAFE Act unlicensed origination | Medium | Low | Mitigated by educational framing + no application flow |
| TILA Reg Z trigger terms | Medium | Low | Mitigated by range display + no CTA |
| Fair Housing Act disparate impact | Medium | Low | Mitigated by LLPA-only factor set |
| State licensing (CA, NY) | Medium | Medium | **Action required: legal opinion before Phase 2** |
| E&O / product liability | Low-Medium | Low | **Action required: E&O insurance before Phase 2** |
| LLPA data staleness | Low | High (if not maintained) | Mitigated by quarterly update protocol |
| FHFA matrix restructure | Low | Medium | Mitigated by modular data layer |

---

## Architecture Decisions

### Decision 1: Use Fannie Mae public LLPA matrix, not licensed PPE data

**Decision:** Build LLPA engine from Fannie Mae's publicly available matrix, not from a licensed B2B pricing engine (Optimal Blue, Mortech, Polly).

**Rationale:** Licensed PPE access costs $50k–$200k/year, requires lender data agreements, and likely requires lender licensing to access. Public LLPA matrix covers the primary pricing variable visible to consumers (60–70% of the pricing picture). Remaining variables (lender overlay, LO comp, warehouse line costs) are disclosed in the educational layer, not computed.

**Trade-off accepted:** Results are educational estimates, not precise rate quotes. This is a feature, not a bug — it keeps the tool in the education category legally, and framing it as an estimate is more honest than presenting a false precision.

**Revisit at:** Series A funding, if lender API partnerships become available under a licensed entity.

---

### Decision 2: Phased launch (content page → full engine)

**Phase 1 (immediate):** Educational content page explaining LLPAs with interactive factor display. No computed rate range. Establishes LLM citation footprint, validates consumer interest, zero regulatory risk.

**Phase 2 (4–6 weeks, after legal review):** Full Rate Intelligence Engine with computed rate range, negotiation brief, sensitivity table, and vault save. Gated behind legal opinion letter from CA and NY counsel.

**Phase 3 (6–12 months):** B2B white-label for licensed independent LOs. LOs embed the tool in their client education flow. Monthly SaaS fee.

---

### Decision 3: Credit score input is a range, not an exact score

**Decision:** Users select a credit score range (e.g., "700–719") rather than entering an exact score.

**Rationale:** (1) Matches LLPA matrix bucket structure exactly, so no false precision. (2) No bureau pull required — no FCRA consent, no credit inquiry, no PII collection. (3) Users are more comfortable with a range and less likely to claim the tool "used their credit score."

---

### Decision 4: Zero lender connection in results flow

**Decision:** The rate intelligence results page never displays lenders, never links to a lender, and never prompts a credit application. The only CTA is vault save (Clerk auth) and chat with HomeRates.AI for deeper explanation.

**Rationale:** This is the structural RESPA protection. The moment a lender name or logo appears in proximity to a rate display, RESPA analysis changes. We never go there.

---

### Decision 5: LLPA data as versioned TypeScript constants

**Decision:** LLPA matrix values are stored as named TypeScript constants in `lib/pricing/llpa-data-2026.ts`, not in a database. A quarterly review is a product/engineering responsibility, not a database migration.

**Rationale:** The matrix changes a few times per year. TypeScript constants are auditable, diffable, and reviewable by non-engineers (a lawyer or compliance person can read the file). A database value is not auditable without a query.

**Maintenance protocol:** Calendar reminder every January, April, July, October to check singlefamily.fanniemae.com/media for matrix updates. Update the file, update the `dataVersion` constant, redeploy.

---

## Non-Negotiable Implementation Rules

These are the legal and ethical constraints that must never be overridden regardless of product pressure:

1. **Zero lender payments accepted for any placement in this feature. Ever.**
2. **Never use the words "offer," "qualify," "approval," "commitment," or "guaranteed" in any UI copy or API response.**
3. **Every results display must include the full disclaimer:** "Educational estimate based on publicly available Fannie Mae LLPA data and live FRED rate averages. Not a loan offer, pre-qualification, or commitment to lend. Consult a licensed mortgage professional for actual rate quotes."
4. **Never collect PII (name, address, SSN, phone, email) in this flow. Credit score is entered as a range by the user — no bureau pull.**
5. **Never use geographic, demographic, or proxy variables in LLPA calculations. Only use factors that appear in the actual Fannie Mae matrix.**
6. **Timestamp all results with the LLPA matrix version date. Users must be able to see when the underlying data was last updated.**
7. **The data version constant in `llpa-data-2026.ts` must be updated each quarter or the feature must be disabled.** Stale data with false precision is worse than no data.

---

## Alternatives Considered and Rejected

| Alternative | Why considered | Why rejected |
|---|---|---|
| License Optimal Blue / Mortech API | Real-time lender rate sheet accuracy | $50k–$200k/year; requires lender licensing; B2B posture change |
| LLPA education only, no rate computation | Zero regulatory risk | Insufficient stickiness; not differentiated from a blog post |
| B2B white-label to LOs only, no consumer | LO carries regulatory risk | Delays consumer moat; can be parallel track, not replacement |
| Informational copy only, no numbers | Lowest risk | Too weak to anchor a feature page or drive vault sign-ups |

---

## References & Sources

- [Fannie Mae LLPA Matrix 2026](https://singlefamily.fanniemae.com/media/9391/display)
- [CFPB RESPA Advisory Opinion — Digital Mortgage Comparison Platforms (Feb 2023)](https://files.consumerfinance.gov/f/documents/cfpb_respa-advisory-opinion-on-online-mortgage-comparison-shopping-tools_2023-02.pdf)
- [CFPB: Guidance to Protect Mortgage Borrowers from Pay-to-Play Platforms](https://www.consumerfinance.gov/about-us/newsroom/cfpb-issues-guidance-to-protect-mortgage-borrowers-from-pay-to-play-digital-comparison-shopping-platforms/)
- [CFPB RESPA Regulation X — Digital Platforms Final Rule](https://www.consumerfinance.gov/rules-policy/final-rules/real-estate-settlement-procedures-act-regulation-x-digital-mortgage-comparison-shopping-platforms-and-related-payments-to-operators/)
- [CFPB ECOA Final Rule — Disparate Impact Changes (April 2026, effective July 21, 2026)](https://www.consumerfinancemonitor.com/2026/05/04/cfpbs-final-rule-recalibrates-fair-lending-enforcement-a-return-to-clarity-and-core-statutory-principles/)
- [Ballard Spahr: CFPB Finalizes Sweeping ECOA Rule Changes (2026)](https://www.ballardspahr.com/insights/blogs/2026/05/podcast-cfpb-finalizes-sweeping-ecoa-rule-changes-what-lenders-need-to-know-about-disparate-impact-discouragement-and-spcp)
- [CFPB SAFE Act Examination Procedures](https://www.consumerfinance.gov/compliance/supervision-examinations/secure-and-fair-enforcement-for-mortgage-licensing-safe-act-examination-procedures/)
- [TILA Regulation Z Advertising §1026.24](https://www.consumerfinance.gov/rules-policy/regulations/1026/24/)
- [Milliman: Lender Choice in LLPAs](https://www.milliman.com/en/insight/lender-choice-loan-level-price-adjustments)
- [MBA White Paper: Reforms Needed to RESPA Section 8 (October 2024)](https://www.mba.org/news-and-research/newsroom/news/2024/10/24/mba-white-paper-reforms-needed-to-respa-section-8-to-better-serve-consumers-mortgage-market)
- [Wholesale vs. Retail Mortgage Rate Spreads 2026](https://www.mothebroker.com/blog/wholesale-mortgage-rate-comparison-2026)
- [Homebuyers Privacy Protection Act — effective March 4, 2026](https://www.winnow.law/news/key-2025-2026-regulatory-compliance-and-lending-law-changes)
- [Optimal Blue PPE Overview](https://www2.optimalblue.com/product-and-pricing-for-mortgage-lenders)
- [FHFA: LLPA Matrix Under Review (2025)](https://www.housingwire.com/articles/fhfa-reviews-loan-level-price-adjustments/)

---

*This document was prepared June 2026 and should be reviewed before any Phase 2 launch decision. Regulatory citations are current as of research date. Consult qualified mortgage/fintech counsel before launch.*
