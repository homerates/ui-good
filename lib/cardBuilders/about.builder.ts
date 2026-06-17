import { f$, fPct } from '../formatting';
import { BuiltCard } from './types';

// version: cardBuilders-2026-03-08-01
// version: cardBuilders-2026-03-08-02

export function buildLabCard(): BuiltCard {
    const labModules = [
        { icon: '🏠', label: 'Home Purchase',   tag: 'Conventional',     desc: '$832,750 · 10% down · live rate',          seed: 'Conventional loan: $832,750 purchase price, 10% down payment' },
        { icon: '📋', label: 'FHA Loan',         tag: 'Gov-backed',       desc: '$580,000 · 3.5% down · live rate',         seed: 'FHA loan $580,000 home 3.5% down' },
        { icon: '🎖️', label: 'VA Loan',          tag: '$0 down · no PMI', desc: '$850,000 · 0% down · live rate',           seed: 'VA loan $850,000 home 0% down' },
        { icon: '💎', label: 'Jumbo Loan',        tag: 'Above conforming', desc: '$1.4M · 20% down · live rate',              seed: 'Jumbo loan $1,400,000 home 20% down' },
        { icon: '📐', label: 'Rental Property',  tag: 'DSCR · No income', desc: '$750k · 25% down · rent $4,800/mo',        seed: 'DSCR loan $750,000 rental property 25% down rent $4,800/mo' },
        { icon: '🔁', label: 'Refinance',         tag: 'Rate & term',      desc: '$750k balance · 7.75% → 6.75%',           seed: 'Refinance $750,000 balance from 7.75% down to 6.75%' },
        { icon: '💰', label: 'Affordability',     tag: 'Income-based',     desc: '$200k income · $100k savings',             seed: 'How much home can I afford on $200,000 income $100,000 savings' },
    ];

    return {
        answer: '',
        next_step: 'Select a module to run an instant scenario.',
        follow_up: labModules[0].label,
        follow_up_chips: [],
        confidence: '1.00 (HomeRates Lab — module picker)',
        labModules,
    } as unknown as BuiltCard;
}

export function buildAboutCard(): BuiltCard {
    const answer = `## 🏦 About HomeRates.ai

**The first of its kind.** HomeRates.ai is the first AI-powered mortgage intelligence platform built specifically to empower homeowners, first-time home buyers, renters, and home investors — not lenders.

**The problem.** Buying a home is the biggest financial decision most people make — yet the system is stacked against them. Lenders quote selectively, rates are opaque, and every "advisor" has a product to sell. Borrowers end up confused, overpaying, or paralyzed.

**The solution.** HomeRates.ai is zero-sales, real-time mortgage intelligence built to fix lending confusion. No commissions. No affiliate links. No products to push. Just transparent data on rates, guidelines, and market signals so you can negotiate from strength.

**How it works.** Every answer draws from live FRED data (Freddie Mac PMMS, 10Y Treasury, Fed funds rate), official agency underwriting guidelines (Fannie Mae, Freddie Mac, FHA, VA, USDA), and lender overlays — updated continuously.

**Who built it.** Rayaan Arif — serial entrepreneur and mortgage industry veteran who watched borrowers repeatedly get burned by a system designed for lenders, not buyers. He built HomeRates.ai to give every borrower access to the same quality of analysis that institutional players have.

> *"Borrowers deserve the same clarity institutional investors get. We built HomeRates.ai to close that gap."*
> — Rayaan Arif, Founder

---
*Educational only — not financial or legal advice. Eligibility and rates vary by profile and lender.*`;

    const follow_up_chips = [
        {
            label: 'Why is mortgage info so hard to trust?',
            seed: 'About HomeRates: why is mortgage information so hard to trust — why do borrowers get conflicting quotes and advice from lenders?',
        },
        {
            label: 'What does HomeRates.ai do differently?',
            seed: 'About HomeRates: how is HomeRates.ai different from a lender, broker, or generic AI tool like ChatGPT for mortgage questions?',
        },
        {
            label: 'What live data does HomeRates.ai use?',
            seed: 'About HomeRates: what live data sources does HomeRates.ai use — FRED, Freddie Mac, underwriting guidelines — and how does it stay current?',
        },
        {
            label: 'Who built this and why?',
            seed: 'About HomeRates: who is the founder and what problem were they trying to solve for borrowers?',
        },
        {
            label: 'Show me what it can do',
            seed: 'Show me the HomeRates Lab',
        },
    ];

    return {
        answer,
        next_step: 'Try a scenario — ask about your home purchase, refi, or affordability.',
        follow_up: follow_up_chips[0].label,
        follow_up_chips,
        confidence: '1.00 (HomeRates.ai — static about card)',
    };
}

const ABOUT_CHIPS = [
    {
        label: 'Why is mortgage info so hard to trust?',
        seed: 'About HomeRates: why is mortgage information so hard to trust — why do borrowers get conflicting quotes and advice from lenders?',
    },
    {
        label: 'What does HomeRates.ai do differently?',
        seed: 'About HomeRates: how is HomeRates.ai different from a lender, broker, or generic AI tool like ChatGPT for mortgage questions?',
    },
    {
        label: 'What live data does HomeRates.ai use?',
        seed: 'About HomeRates: what live data sources does HomeRates.ai use — FRED, Freddie Mac, underwriting guidelines — and how does it stay current?',
    },
    {
        label: 'Who built this and why?',
        seed: 'About HomeRates: who is the founder and what problem were they trying to solve for borrowers?',
    },
    {
        label: 'Show me what it can do',
        seed: 'Show me the HomeRates Lab',
    },
];

export function buildAboutTrustCard(): BuiltCard {
    const answer = `## ❓ Why Is Mortgage Info So Hard to Trust?

**The incentive problem.** Every lender, broker, and mortgage website has a financial incentive to get you to their product. That means the "information" you receive is filtered through a sales lens — not an objective one.

**How conflicting quotes happen.** For the exact same borrower profile, lenders can legally quote rates 0.25–0.50% apart. Here's why:

| Factor | What lenders control | Impact on your quote |
|---|---|---|
| Yield spread premium | Lender marks up rate above par | +0.125–0.375% hidden in rate |
| Lender overlays | Stricter DTI/credit rules than guidelines require | May disqualify or reprice you |
| Lock period | 30 vs 45 vs 60 day lock | +0.125–0.25% per tier |
| Points/credits | Lender buries costs in rate | Rate looks low, fees are high |

**Regulation Z (TILA)** requires lenders to disclose APR and fees — but it does not require them to show you the best rate they could offer. They show you what they want you to see.

**What this means for you.** The only defense is independent data. When you know the FRED benchmark (30Y fixed avg), the Fannie Mae/Freddie Mac guideline DTI limits, and current lender overlays — you can spot an inflated quote in 60 seconds.

---
*Educational only — not financial or legal advice. Rates and eligibility vary by lender and profile.*`;

    return {
        answer,
        next_step: 'Ask HomeRates.ai to check your scenario against current rate benchmarks.',
        follow_up: ABOUT_CHIPS[1].label,
        follow_up_chips: ABOUT_CHIPS,
        confidence: '1.00 (HomeRates.ai — static trust card)',
    };
}

export function buildAboutDifferenceCard(): BuiltCard {
    const answer = `## HomeRates.ai vs ChatGPT — What's the Real Difference?

ChatGPT gives confident mortgage answers. Often wrong. Here's why it matters.

---

**"What is my real monthly payment?"**
- **ChatGPT:** Estimates principal + interest only. Forgets taxes, insurance, and PMI.
- **HomeRates.ai:** Calculates full PITI — Principal, Interest, Taxes, Insurance, and PMI — using live rates.
- 💡 The difference can be $400–$800/mo on a $400k home.

**"What are mortgage rates today?"**
- **ChatGPT:** Quotes rates from its training data — often 12–24 months out of date.
- **HomeRates.ai:** Pulls live rates from FRED (Freddie Mac weekly average) every time you ask.
- 💡 A 1% rate difference on $400k = $240/mo and $86k over 30 years.

**"How much house can I afford?"**
- **ChatGPT:** Uses national rules of thumb. Doesn't know your DTI or 2026 loan limits.
- **HomeRates.ai:** Works backward from your income and debts using current DTI guidelines and 2026 conforming limits.
- 💡 Generic rules can over- or underestimate your ceiling by $50–$100k.

**"Do I need PMI and when does it go away?"**
- **ChatGPT:** Often confuses PMI (conventional) with MIP (FHA). Gets cancellation rules wrong.
- **HomeRates.ai:** Calculates your exact PMI cost, the LTV threshold to cancel it, and how long you'll pay it.
- 💡 PMI is $100–$300/mo. Knowing when it ends changes your long-term plan.

**"Should I do 15-year or 30-year?"**
- **ChatGPT:** Gives a general answer. Can't show a live side-by-side with your actual numbers.
- **HomeRates.ai:** Runs both scenarios with live rates and your loan amount. Shows monthly difference and total interest saved.
- 💡 15yr saves $150k+ in interest but costs $600+/mo more. You need real numbers to decide.

**"Does this rental property cash flow?"**
- **ChatGPT:** May not know current DSCR lender requirements. Will approximate.
- **HomeRates.ai:** Calculates DSCR ratio, monthly cash flow, and lender qualification using live rates.
- 💡 Wrong DSCR analysis on a $500k investment property is a very expensive mistake.

---

**Why this is built for borrowers, not lenders:**
No lead forms. No rate quote pages that capture your number before giving you an answer. No lender partnerships. No commission.

> *Ask your first question — no account required.*

---
*Educational purposes only — not financial advice. Verify all numbers with a licensed lender before making decisions.*`;

    return {
        answer,
        next_step: 'Try a scenario — see the difference in action.',
        follow_up: ABOUT_CHIPS[2].label,
        follow_up_chips: ABOUT_CHIPS,
        confidence: '1.00 (HomeRates.ai — static difference card)',
    };
}

export function buildAboutDataCard(): BuiltCard {
    const answer = `## 📡 What Live Data Does HomeRates.ai Use?

HomeRates.ai pulls from primary sources — not aggregators, not scrapers.

**Rate data (FRED — Federal Reserve Economic Data)**

| Series | What it measures | Updates |
|---|---|---|
| MORTGAGE30US | 30Y fixed avg (Freddie Mac PMMS) | Weekly (Thu) |
| MORTGAGE15US | 15Y fixed avg | Weekly (Thu) |
| MORTGAGE5US | 5/1 ARM avg | Weekly (Thu) |
| DGS10 | 10Y Treasury yield | Daily |
| DGS2 | 2Y Treasury yield | Daily |
| T10Y2Y | Yield curve (10Y minus 2Y) | Daily |
| FEDFUNDS | Federal funds rate | Monthly |
| SOFR | Secured overnight rate (ARM index) | Daily |

**Economic context (FRED)**

| Series | What it measures | Updates |
|---|---|---|
| CPIAUCSL | Consumer price index (inflation) | Monthly |
| PCEPILFE | Core PCE — Fed's inflation target | Monthly |
| UNRATE | Unemployment rate | Monthly |
| MSPUS | Median US home sales price | Quarterly |
| HOUST | Housing starts | Monthly |

**Underwriting guidelines (direct from agencies)**
- Fannie Mae Selling Guide (singlefamily.fanniemae.com)
- Freddie Mac Seller/Servicer Guide (guide.freddiemac.com)
- FHA Handbook 4000.1 (hud.gov)
- VA Lenders Handbook (benefits.va.gov)
- USDA HB-1-3555 (rd.usda.gov)

**Lender overlays** tracked from major wholesale and retail lenders' public bulletins.

---
*Educational only — not financial or legal advice. Rates and eligibility vary by lender and profile.*`;

    return {
        answer,
        next_step: 'Ask about current rates — HomeRates.ai will pull live FRED data for your answer.',
        follow_up: ABOUT_CHIPS[3].label,
        follow_up_chips: ABOUT_CHIPS,
        confidence: '1.00 (HomeRates.ai — static data card)',
    };
}

export function buildAboutFounderCard(): BuiltCard {
    const answer = `## 👤 Who Built HomeRates.ai and Why?

**Rayaan Arif** — Founder

**The problem he kept seeing.** As a serial entrepreneur and mortgage industry veteran, Rayaan watched the same story play out repeatedly: borrowers making the biggest financial decision of their lives with incomplete, biased, or conflicting information. Lenders had every incentive to obscure pricing. Borrowers had no independent anchor.

**The gap.** Institutional investors — hedge funds, REITs, private equity — have access to Bloomberg terminals, agency data feeds, and dedicated analysts to evaluate mortgage instruments. Individual borrowers get a sales call and a rate sheet.

**The mission.** Close that gap. Give every borrower — first-time buyer, seasoned investor, or anyone in between — access to the same quality of analysis that institutional players have. No commissions. No conflicts. No confusion.

> *"Borrowers deserve the same clarity institutional investors get. We built HomeRates.ai to close that gap."*
> — Rayaan Arif, Founder

**What HomeRates.ai is not.** It is not a lender, broker, or lead generation platform. It will never quote you a rate to earn a commission, refer you to a lender for a fee, or filter information to favor a product.

---
*Educational only — not financial or legal advice. Rates and eligibility vary by lender and profile.*`;

    return {
        answer,
        next_step: 'Test-drive HomeRates.ai on your own scenario.',
        follow_up: ABOUT_CHIPS[0].label,
        follow_up_chips: ABOUT_CHIPS,
        confidence: '1.00 (HomeRates.ai — static founder card)',
    };
}

export function buildHowItWorksCard(): BuiltCard {
    const answer = `## 🧭 How HomeRates.ai Works

**What it is.** A real-time mortgage intelligence tool — not a lender, not a broker, not an AI chatbot guessing at numbers. Every calculation is deterministic: same inputs always produce the same output.

**How answers are built.**

| Layer | What it does |
|---|---|
| Calc engine | Computes payments, DTI, DSCR, MIP, PMI — no LLM involved |
| FRED live data | Pulls Freddie Mac rates, 10Y Treasury, Fed funds — updated weekly |
| UW guidelines | Fannie Mae, FHA, VA, USDA agency rules — cited by source |
| Grok AI | Explains results in plain language, answers follow-up questions |

**Chips — your fastest tool.** After every answer, chips appear below. Each one is pre-loaded with your exact scenario — click to instantly run a variation without retyping anything.

**Memory.** HomeRates.ai remembers your scenario within a session. Ask "what if rate drops to 6%?" after a calc and it knows what home, what down payment, what loan — no need to repeat yourself.

**What it can't do.** It cannot pull your credit, lock a rate, or submit an application. It gives you the analysis — you negotiate with lenders from strength.

---
💡 **First-timer tips:**
- Start with a real number: *"$650k home, 15% down, 6.75%"*
- Ask your county: *"FHA loan in Irvine"* → gets county-specific limits
- Compare programs: *"FHA vs conventional on $500k"*
- Ask income: *"What income do I need to qualify?"* after any calc

---
*Educational only — not financial or legal advice. Rates and eligibility vary by lender and profile.*`;

    const follow_up_chips = [
        {
            label: 'How are payments calculated?',
            seed: 'How it works: how does HomeRates.ai calculate mortgage payments — is it using real formulas or AI guessing?',
        },
        {
            label: 'Where do the rates come from?',
            seed: 'How it works: where does HomeRates.ai get its mortgage rate data — what is FRED and Freddie Mac PMMS?',
        },
        {
            label: 'How do chips work?',
            seed: 'How it works: what are the chips that appear after each answer and how do I use them to explore scenarios?',
        },
        {
            label: 'What can I ask it?',
            seed: 'How it works: what kinds of mortgage questions can HomeRates.ai answer — give me a full list of scenarios it handles',
        },
        {
            label: 'Run my first scenario',
            seed: 'Show me the HomeRates Lab',
        },
    ];

    return {
        answer,
        next_step: 'Try a scenario — type a home price, income, or refi balance to get started.',
        follow_up: follow_up_chips[0].label,
        follow_up_chips,
        confidence: '1.00 (HomeRates.ai — static how it works card)',
    };
}
