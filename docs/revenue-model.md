# HomeRates.ai — Revenue Model & Financial Projections
**Updated: March 2026**

---

## Overview

HomeRates.ai operates across five distinct revenue streams, each targeting a different buyer persona in the mortgage ecosystem. The model is designed so each stream is independent — early traction in B2C builds credibility for B2B licensing, and LO/lender deployments expand the consumer reach flywheel.

---

## Revenue Stream 1 — Direct to Consumer (B2C Subscription)

**Who:** Homebuyers, homeowners, renters, real estate investors
**Model:** Freemium with paid tiers
**Status:** Live in production

### Pricing Tiers

| Tier | Monthly | Annual | Included |
|---|---|---|---|
| **Free** | $0 | $0 | 20 messages/mo, all calculators, basic PDF |
| **Plus** | $7/mo | $59/yr | Unlimited messages, full PDF export, rate alerts, saved analyses |
| **Pro** | $19/mo | $159/yr | Everything in Plus + LO tools, 10 borrower slots, priority support |

**Blended ARPU (paid users):** ~$12/mo

**Unit economics:**
- Infrastructure cost per active user: ~$0.20–$0.60/mo (calc-first routing keeps LLM cost minimal)
- Gross margin on paid tier: 85–92%
- Free→paid conversion target: 4–7%

**Why this works:** PDF export, rate alerts, and saved analyses are features users discover mid-session — creating natural upsell moments tied to high-intent behavior.

---

## Revenue Stream 2 — Direct to Loan Officer (B2B Seat License)

**Who:** Individual loan officers at banks, brokers, independent shops
**Model:** Monthly seat license per LO
**Status:** Portal live; self-serve billing active

### Pricing

| Tier | Price | Includes |
|---|---|---|
| **LO Starter** | $49/mo | 5 borrower slots, invite links, dashboard |
| **LO Pro** | $99/mo | 25 borrower slots, analytics, white-label profile link |
| **LO Team** (2–10 LOs) | $79/LO/mo | Shared admin, team dashboard |

**ARPU:** ~$79/LO/mo (blended)

**Acquisition path:**
1. LO discovers HomeRates.ai through a borrower sharing a PDF
2. Wants to send their own clients to the platform
3. Creates an account → gets a personalized invite link → borrowers onboard under their profile

**Value prop for LO:** Clients come better prepared, fewer basic questions, higher conversion rate. The LO doesn't pay for software they don't use — it's tied directly to borrower activity.

---

## Revenue Stream 3 — Direct to Real Estate Agents

**Who:** Buyer's agents, listing agents, brokerage teams
**Model:** Seat license, individual or team
**Status:** Roadmap Q3 2026

### Pricing

| Tier | Price | Includes |
|---|---|---|
| **Agent Individual** | $19/mo | Branded share link, unlimited client shares, calculator access |
| **Agent Team** (2–10 agents) | $15/agent/mo | Team dashboard, lead routing, custom branding |
| **Brokerage** | Custom | Per-office or per-agent pricing, analytics, API access |

**ARPU:** ~$22/agent/mo

**Acquisition path:**
- Agents send HomeRates.ai calculator links to clients in listings presentations
- "Run the numbers on this property" becomes a differentiator
- Natural upsell to team/brokerage plan as adoption spreads within a firm

**Market:** 1.5M+ licensed agents in the US; even 0.1% penetration = 1,500 accounts

---

## Revenue Stream 4 — Broker Firm Licensing

**Who:** Mortgage brokerage firms (20–200 LOs each)
**Model:** Annual site license per firm, per-seat pricing above a base tier
**Status:** Roadmap Q4 2026

### Pricing

| Firm Size | Annual License | Per-Seat Overage |
|---|---|---|
| Small (1–10 LOs) | $4,800/yr | — |
| Mid (11–50 LOs) | $14,400/yr | $120/LO/yr above 10 |
| Large (51–200 LOs) | $36,000/yr | $100/LO/yr above 50 |

**Deal ARPU:** ~$12,000/yr average across firm sizes

**Value prop:**
- Compliance-ready: all outputs are educational-only, no NMLS liability
- White-label profile links for every LO
- Firm-level analytics: which products are clients asking about most?
- Import existing LO roster via CSV

**Sales motion:** Partner with a trade association (NAMB, MBA state chapters) for bundled access. One deal = 20–200 LO activations overnight.

---

## Revenue Stream 5 — Lender / Bank Licensing (Enterprise)

**Who:** Regional banks, credit unions, retail mortgage divisions of large banks
**Model:** Annual enterprise license; custom integration, white-label deployment
**Status:** Roadmap H1 2027

### Pricing

| Tier | Annual | Includes |
|---|---|---|
| **Standard** | $24,000/yr | Hosted on homerates.ai, lender branding, up to 50 LOs |
| **Professional** | $48,000/yr | Custom subdomain, 200 LOs, API access, priority SLA |
| **Enterprise** | $120,000+/yr | Fully white-labeled, unlimited LOs, dedicated support, custom calc logic |

**Deal ARPU:** ~$48,000/yr average

**Value prop:**
- The bank's LOs get a tool that makes borrowers more educated before application — fewer abandoned apps, better DTI preparation
- Compliance: the bank's branding is on the tool, but HomeRates.ai's educational disclaimer covers the output
- No NMLS exposure since no rate quotes or loan commitments are made

**Sales motion:** Introduce via a warm referral from an early LO customer who works at a regional bank. One enterprise deal covers ~6 months of B2C infrastructure costs.

---

## Financial Projections — 3 Year

### Assumptions
- B2C: organic growth via SEO + PDF sharing virality; 4–6% free→paid conversion
- LO Direct: bottoms-up via borrower referrals + direct outreach
- Agent: partner channel + direct; launches Q3 2026
- Broker: firm deals starting Q4 2026
- Lender: first enterprise deals H1 2027

### ARR by Stream

| Stream | Y1 (2026) | Y2 (2027) | Y3 (2028) |
|---|---|---|---|
| Direct to Consumer | $72k | $432k | $2.34M |
| Direct to LO | $41k | $237k | $1.28M |
| Direct to Agent | — | $132k | $750k |
| Broker Licensing | $15k | $120k | $600k |
| Lender / Bank | $24k | $180k | $960k |
| **Total ARR** | **$152k** | **$1.10M** | **$5.93M** |

### Unit Volume Assumptions

| Stream | Y1 Units | Y2 Units | Y3 Units |
|---|---|---|---|
| Paid B2C users | 500 | 3,000 | 15,000 |
| Active LOs | 50 | 250 | 1,200 |
| Active Agents | — | 500 | 2,500 |
| Broker firm deals | 3 | 15 | 60 |
| Lender/bank deals | 1 | 5 | 20 |

### Cost Structure (estimated, annual)

| Cost | Y1 | Y2 | Y3 |
|---|---|---|---|
| Infrastructure (Vercel, Supabase, APIs) | $18k | $60k | $200k |
| LLM API costs (xAI/OpenAI) | $12k | $40k | $130k |
| Stripe/payments processing | $4k | $28k | $150k |
| Engineering (FTE or contract) | $0–$120k | $120k–$240k | $300k–$600k |
| Sales & marketing | $10k | $80k | $300k |

### Gross Margin (ex-engineering)

| | Y1 | Y2 | Y3 |
|---|---|---|---|
| Revenue | $152k | $1.10M | $5.93M |
| COGS (infra + LLM + payments) | $34k | $128k | $480k |
| **Gross Margin** | **78%** | **88%** | **92%** |

High margin is driven by the calc-first architecture: the majority of queries never reach a paid LLM API.

---

## Path to $1M ARR

The fastest path to $1M ARR is parallel traction on two streams:
1. **B2C at scale** — SEO-led organic growth to 7,000 paid users ($84k/mo ARR)
2. **10 broker firm deals** — average $8k/yr each ($80k ARR, low sales cost)

These two channels together hit $1M ARR without requiring any enterprise lender deals. Enterprise deals ($24–120k each) are upside that de-risks the model significantly once landed.

---

## Competitive Moats per Revenue Stream

| Stream | Why HomeRates.ai wins |
|---|---|
| Consumer | Speed + accuracy (calc-first) + no sales agenda = trust |
| LO | Borrower ownership — the LO's invite link creates a sticky pipeline asset |
| Agent | The PDF = a client-facing tool agents are proud to send |
| Broker | Compliance-safe + easy to deploy across any size firm |
| Lender | No NMLS exposure + educational framing = bank-safe deployment |

---

*HomeRates.ai — For educational use only — homerates.ai/disclosures*
