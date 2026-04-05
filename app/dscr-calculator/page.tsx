// app/dscr-calculator/page.tsx
// SEO landing page — /dscr-calculator
// Target keyword: "dscr loan calculator" (KD 28, 8.2k/mo)
// Structure mirrors /affordability-calculator and /fha-calculator exactly

import type { Metadata } from 'next';
import Link from 'next/link';

// ─────────────────────────────────────────────
// META — title tag + meta description
// ─────────────────────────────────────────────
export const metadata: Metadata = {
    title: 'DSCR Loan Calculator 2026 — Rental Cash Flow & DSCR Ratio | HomeRates.ai',
    description:
        'Calculate your DSCR ratio for an investment property in 2026. Enter rent and purchase price — get cash flow, DSCR, monthly PITIA, and lender qualification status instantly. No income docs required.',
    keywords: [
        'dscr loan calculator',
        'dscr calculator',
        'dscr mortgage calculator',
        'debt service coverage ratio calculator',
        'investment property dscr calculator',
        'rental property loan calculator',
        'no income verification mortgage calculator',
    ],
    openGraph: {
        title: 'DSCR Loan Calculator 2026 — Rental Cash Flow & DSCR Ratio | HomeRates.ai',
        description:
            'Calculate DSCR ratio, monthly cash flow, and lender qualification for your rental property. Uses live FRED rates and 2026 loan limits. No income docs required.',
        url: 'https://chat.homerates.ai/dscr-calculator',
        siteName: 'HomeRates.ai',
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'DSCR Loan Calculator 2026 | HomeRates.ai',
        description:
            'Free DSCR calculator. Rental cash flow, DSCR ratio, PITIA breakdown — 2026 lender guidelines.',
    },
    alternates: {
        canonical: 'https://chat.homerates.ai/dscr-calculator',
    },
};

// ─────────────────────────────────────────────
// JSON-LD SCHEMA
// ─────────────────────────────────────────────
const schemaFAQ = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
        {
            '@type': 'Question',
            name: 'What is a DSCR loan calculator?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'A DSCR loan calculator computes the Debt Service Coverage Ratio for a rental property — the ratio of gross monthly rent to the full monthly mortgage payment (PITIA: principal, interest, taxes, insurance, and HOA). Lenders use DSCR to qualify investors without requiring personal income documentation. A DSCR of 1.0 means the property breaks even; 1.25 is the most common minimum lender requirement. HomeRates.ai uses live FRED rates and 2026 lender guidelines.',
            },
        },
        {
            '@type': 'Question',
            name: 'What DSCR do lenders require in 2026?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Most DSCR lenders in 2026 require a minimum DSCR of 1.0 to 1.25. A DSCR of 1.0 means rent exactly covers the mortgage payment — some lenders allow this with a higher down payment (25–30%). A DSCR of 1.25 means rent is 25% more than the payment — this is the standard threshold for the best rates and terms. Some lenders offer "no-ratio" DSCR loans at 0.75+ with compensating factors.',
            },
        },
        {
            '@type': 'Question',
            name: 'What is a good DSCR ratio for an investment property?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'A DSCR above 1.25 is considered good — the property generates 25% more income than the debt obligation. Above 1.5 is strong. Below 1.0 means the property is cash-flow negative and most lenders will decline without significant compensating factors. The higher your DSCR, the better your rate, LTV, and approval odds with most non-QM lenders.',
            },
        },
        {
            '@type': 'Question',
            name: 'How is DSCR calculated?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'DSCR = Gross Monthly Rent ÷ Monthly PITIA. PITIA is the full monthly payment including principal & interest, property taxes, homeowners insurance, and any HOA dues. Example: $2,800 rent on a property with $2,100 PITIA = DSCR of 1.33. HomeRates.ai computes the full PITIA including all components — not just the P&I payment that most basic calculators use.',
            },
        },
        {
            '@type': 'Question',
            name: 'What is the minimum down payment for a DSCR loan?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Most DSCR lenders require 20–25% down for single-family investment properties. Some lenders allow 15% down with strong DSCR (1.25+) and credit score (700+). 2–4 unit properties typically require 25% down. The conforming loan limit for investment properties in standard counties is $832,750 for 2026 per FHFA guidelines.',
            },
        },
        {
            '@type': 'Question',
            name: 'Do DSCR loans require income verification?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'No — DSCR loans are a type of non-QM mortgage that qualifies the property, not the borrower\'s personal income. Instead of W-2s or tax returns, lenders use a market rent analysis (1007 appraisal form) or existing lease to verify the rental income. This makes DSCR loans popular with self-employed investors and those with complex income structures.',
            },
        },
        {
            '@type': 'Question',
            name: 'How accurate is the HomeRates.ai DSCR calculator?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'HomeRates.ai uses a deterministic calculation engine — same inputs always produce the same output. It computes full PITIA (not just P&I), applies live FRED 30-year rate data, and uses 2026 FHFA conforming loan limits. Results match what a non-QM lender would calculate. For educational purposes only — not a commitment to lend.',
            },
        },
    ],
};

const schemaSoftwareApp = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'HomeRates.ai DSCR Loan Calculator',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    url: 'https://chat.homerates.ai/dscr-calculator',
    description:
        'Free DSCR loan calculator for investment properties. Enter rent and purchase price to instantly get DSCR ratio, monthly cash flow, full PITIA breakdown, and lender qualification status.',
    offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
    },
    author: {
        '@type': 'Person',
        name: 'Rayaan Arif',
        jobTitle: 'Licensed Loan Consultant',
    },
    featureList: [
        'DSCR ratio calculation (rent ÷ full PITIA)',
        'Full PITIA breakdown: P&I, taxes, insurance, HOA',
        'Cash flow analysis: monthly and annual',
        'Lender qualification status (1.0 / 1.25 / 1.5 thresholds)',
        'Live FRED 30-year mortgage rate data',
        '2026 FHFA conforming loan limits',
        'Vacancy and expense sensitivity analysis',
    ],
};

const schemaBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'HomeRates.ai', item: 'https://chat.homerates.ai' },
        { '@type': 'ListItem', position: 2, name: 'Calculators', item: 'https://chat.homerates.ai/calculators' },
        { '@type': 'ListItem', position: 3, name: 'DSCR Calculator', item: 'https://chat.homerates.ai/dscr-calculator' },
    ],
};

// ─────────────────────────────────────────────
// DSCR TABLE — pre-computed
// 25% down · 7.25% rate (DSCR premium) · 30yr
// Taxes 1.1%/yr · Insurance 0.35%/yr · No HOA
// DSCR = Gross Rent ÷ PITIA
// ─────────────────────────────────────────────
const dscrTable = [
    { price: 250000, rent: 2000, down: 62500, loan: 187500, pitia: 1661, cashflow: 339, dscr: '1.20' },
    { price: 300000, rent: 2400, down: 75000, loan: 225000, pitia: 1993, cashflow: 407, dscr: '1.20' },
    { price: 350000, rent: 2800, down: 87500, loan: 262500, pitia: 2326, cashflow: 474, dscr: '1.20' },
    { price: 400000, rent: 3200, down: 100000, loan: 300000, pitia: 2658, cashflow: 542, dscr: '1.20' },
    { price: 450000, rent: 3400, down: 112500, loan: 337500, pitia: 2990, cashflow: 410, dscr: '1.14' },
    { price: 500000, rent: 3600, down: 125000, loan: 375000, pitia: 3323, cashflow: 277, dscr: '1.08' },
    { price: 600000, rent: 4200, down: 150000, loan: 450000, pitia: 3987, cashflow: 213, dscr: '1.05' },
];

// ─────────────────────────────────────────────
// DSCR THRESHOLD TABLE
// ─────────────────────────────────────────────
const dscrThresholds = [
    { dscr: 'Below 0.75', status: '❌ Most lenders decline', ltv: 'N/A', rate: 'N/A', notes: 'Property cash flows negative — needs large down payment or rent increase' },
    { dscr: '0.75 – 1.00', status: '⚠️ No-ratio programs only', ltv: '65–70% max', rate: '+1.5–2.0%', notes: 'Some specialty lenders; higher rate, lower LTV required' },
    { dscr: '1.00 – 1.24', status: '🟡 Some lenders OK', ltv: '70–75% max', rate: '+0.5–1.0%', notes: 'Breakeven or near-breakeven; requires strong credit (700+)' },
    { dscr: '1.25 – 1.49', status: '✅ Standard approval', ltv: 'Up to 80%', rate: 'Market rate', notes: 'Most non-QM lenders approve at standard terms' },
    { dscr: '1.50+', status: '✅ Strong — best pricing', ltv: 'Up to 80%', rate: 'Best pricing', notes: 'Strong cash flow; may qualify for lowest DSCR rates available' },
];

// ─────────────────────────────────────────────
// FAQ DATA
// ─────────────────────────────────────────────
const faqs = [
    {
        q: 'What is a DSCR loan calculator?',
        a: 'A DSCR loan calculator computes the Debt Service Coverage Ratio — gross monthly rent divided by full monthly PITIA (principal, interest, taxes, insurance, HOA). Lenders use DSCR to qualify investors without personal income docs. A DSCR of 1.25 means rent is 25% above the payment — the standard minimum for most non-QM lenders.',
    },
    {
        q: 'What DSCR do lenders require in 2026?',
        a: 'Most DSCR lenders require 1.0 minimum (some allow it with 25–30% down) and prefer 1.25+ for standard terms. At 1.25 you get market rate and up to 80% LTV. Below 1.0, most lenders decline. Some specialty lenders offer "no-ratio" programs at 0.75+ with compensating factors and reduced LTV.',
    },
    {
        q: 'What is a good DSCR ratio for an investment property?',
        a: 'Above 1.25 is good — the property covers its debt with 25% margin. Above 1.5 is strong and qualifies for the best rates. Below 1.0 is cash-flow negative and most lenders will decline. The higher the DSCR, the better your rate, LTV, and approval odds.',
    },
    {
        q: 'How is DSCR calculated?',
        a: 'DSCR = Gross Monthly Rent ÷ Monthly PITIA. Example: $2,800 rent ÷ $2,100 PITIA = 1.33 DSCR. HomeRates.ai computes full PITIA — not just P&I — for an accurate ratio. Most basic calculators understate PITIA by omitting taxes, insurance, or HOA.',
    },
    {
        q: 'What is the minimum down payment for a DSCR loan?',
        a: '20–25% for single-family investment properties at most non-QM lenders. Some allow 15% with DSCR 1.25+ and 700+ credit. 2–4 unit properties typically require 25%. The 2026 conforming limit for investment properties is $832,750 standard county per FHFA guidelines.',
    },
    {
        q: 'Do DSCR loans require income verification?',
        a: 'No — DSCR loans qualify the property, not your personal income. Lenders use a 1007 rent appraisal or existing lease instead of W-2s or tax returns. This makes them popular with self-employed investors and those with complex income. You still need a credit score (usually 640+) and reserves (typically 6 months PITIA).',
    },
    {
        q: 'How accurate is the HomeRates.ai DSCR calculator?',
        a: 'HomeRates.ai uses a deterministic calculation engine — same inputs, same output, no AI guesswork. It computes full PITIA (not just P&I), uses live FRED rate data, and applies 2026 FHFA limits. Results match what a non-QM lender would calculate. For educational purposes only — not a commitment to lend.',
    },
];

// ─────────────────────────────────────────────
// PAGE COMPONENT — Server Component (no "use client")
// ─────────────────────────────────────────────
export default function DSCRCalculatorPage() {
    const f$ = (n: number) => `$${n.toLocaleString()}`;

    return (
        <>
            {/* ── JSON-LD Schema injection ── */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaFAQ) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaSoftwareApp) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaBreadcrumb) }}
            />

            {/* ── LOGO NAV ── */}
            <nav className="calc-nav">
                <Link href="/" className="calc-nav-logo">
                    <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
                </Link>
                <Link href="/chat" className="calc-nav-cta">Try the AI →</Link>
            </nav>

            <main className="dscr-page">

                {/* ── BREADCRUMB ── */}
                <nav className="breadcrumb" aria-label="Breadcrumb">
                    <ol>
                        <li><Link href="/">HomeRates.ai</Link></li>
                        <li aria-hidden="true">›</li>
                        <li><Link href="/calculators">Calculators</Link></li>
                        <li aria-hidden="true">›</li>
                        <li aria-current="page">DSCR Calculator</li>
                    </ol>
                </nav>

                {/* ── HERO ── */}
                <section className="hero">
                    <h1>DSCR Loan Calculator<br /><span className="hero-sub">Rental Cash Flow & Debt Service Coverage Ratio — 2026</span></h1>
                    <p className="hero-lead">
                        Enter your rental property price and expected rent — get DSCR ratio,
                        monthly cash flow, full PITIA breakdown, and lender qualification status.
                        No income docs required. Powered by live FRED rates and 2026 guidelines.
                    </p>
                    <div className="trust-bar">
                        <span className="trust-item">📡 Live FRED rates</span>
                        <span className="trust-item">✅ 2026 FHFA loan limits</span>
                        <span className="trust-item">🏦 Non-QM lender guidelines</span>
                        <span className="trust-item">🔒 No login required</span>
                    </div>
                </section>

                {/* ── CALCULATOR EMBED ── */}
                <section className="calculator-embed" id="calculator">
                    <div className="embed-header">
                        <h2>Your DSCR Analysis</h2>
                        <p>
                            Click a scenario below or describe your rental property to get a full
                            DSCR breakdown — cash flow, ratio, and lender qualification status.
                        </p>
                    </div>

                    <div className="seed-chips">
                        <span className="seed-label">Try an example:</span>
                        <a href="/?sq=DSCR+loan+on+a+%24400%2C000+rental+property+with+%242%2C800%2Fmo+rent+and+25%25+down" className="seed-chip">
                            $400k · $2,800 rent
                        </a>
                        <a href="/?sq=DSCR+loan+on+a+%24500%2C000+rental+property+with+%243%2C400%2Fmo+rent+and+25%25+down" className="seed-chip">
                            $500k · $3,400 rent
                        </a>
                        <a href="/?sq=DSCR+on+a+%24350%2C000+rental+property+with+%242%2C400%2Fmo+rent+%E2%80%94+does+it+cash+flow%3F" className="seed-chip">
                            Does it cash flow?
                        </a>
                        <a href="/?sq=What+rent+do+I+need+for+a+1.25+DSCR+on+a+%24450%2C000+investment+property%3F" className="seed-chip">
                            What rent for 1.25 DSCR?
                        </a>
                    </div>

                    <div className="cta-block">
                        <a
                            href="/?sq=DSCR+loan+on+a+%24400%2C000+rental+property+with+%242%2C800%2Fmo+rent+and+25%25+down+%E2%80%94+show+full+cash+flow+and+DSCR+analysis"
                            className="cta-button"
                        >
                            Calculate my DSCR →
                        </a>
                        <p className="cta-sub">Free · No login required · Result in seconds</p>
                        <p className="cta-sub" style={{ marginTop: 4 }}>
                            Want saved scenarios and session memory?{' '}
                            <Link href="/sign-up">Create a free account</Link>
                        </p>
                    </div>
                </section>

                {/* ── WHAT YOU GET ── */}
                <section className="what-you-get">
                    <h2>What the DSCR calculator shows you</h2>
                    <p className="section-lead">
                        Most calculators show only P&I. HomeRates.ai computes full PITIA —
                        principal, interest, taxes, insurance, and HOA — so the DSCR ratio
                        matches what a non-QM lender actually sees, not an optimistic estimate.
                    </p>
                    <div className="features-grid">
                        <div className="feature-card">
                            <div className="feature-icon">📐</div>
                            <h3>Accurate DSCR ratio</h3>
                            <p>Rent ÷ full PITIA — not just P&I. The number that matters to lenders, calculated the same way they calculate it.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">💵</div>
                            <h3>Monthly cash flow</h3>
                            <p>Gross rent minus full PITIA. See your actual monthly surplus (or deficit) before vacancy and maintenance reserves.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">🏦</div>
                            <h3>Lender qualification status</h3>
                            <p>Instant verdict: strong approval, standard approval, borderline, or likely decline — based on your DSCR against 2026 non-QM thresholds.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">📊</div>
                            <h3>Full PITIA breakdown</h3>
                            <p>Principal & interest, estimated property taxes, homeowners insurance, and HOA — every component shown separately so nothing is hidden.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">📡</div>
                            <h3>Live DSCR rates</h3>
                            <p>DSCR loans price at a premium to conventional. HomeRates.ai applies the current spread over the FRED 30-year average for a realistic rate estimate.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">🔄</div>
                            <h3>Scenario comparisons</h3>
                            <p>What if rent drops $200? What if rates fall 0.5%? What rent do you need to hit 1.25 DSCR? Run any follow-up instantly in the chat.</p>
                        </div>
                    </div>
                </section>

                {/* ── DSCR PAYMENT TABLE ── */}
                <section className="example-table-section">
                    <h2>DSCR by home price and rent — 2026</h2>
                    <p className="section-lead">
                        Assumes 25% down · 7.25% rate · 30-year fixed · Taxes 1.1%/yr · Insurance 0.35%/yr · No HOA.
                        Rent estimates based on typical 0.8% rent-to-price ratio.
                    </p>
                    <div className="example-table-wrapper">
                        <table className="example-table">
                            <thead>
                                <tr>
                                    <th>Price</th>
                                    <th>Down (25%)</th>
                                    <th>Gross Rent</th>
                                    <th>Full PITIA</th>
                                    <th>Cash Flow</th>
                                    <th>DSCR</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dscrTable.map((row, i) => {
                                    const dscr = parseFloat(row.dscr);
                                    const status = dscr >= 1.25 ? '✅ Approve' : dscr >= 1.0 ? '🟡 Borderline' : '❌ Decline';
                                    return (
                                        <tr key={i}>
                                            <td className="income-cell">{f$(row.price)}</td>
                                            <td>{f$(row.down)}</td>
                                            <td>{f$(row.rent)}/mo</td>
                                            <td>{f$(row.pitia)}/mo</td>
                                            <td className={row.cashflow >= 0 ? 'price-cell' : 'negative-cell'}>{row.cashflow >= 0 ? '+' : ''}{f$(row.cashflow)}/mo</td>
                                            <td className="income-cell">{row.dscr}</td>
                                            <td>{status}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <p className="table-note">
                        Rent estimates are illustrative. Your actual rent, local taxes, and HOA will change the DSCR.
                        For educational purposes only.
                    </p>
                </section>

                {/* ── DSCR THRESHOLD TABLE ── */}
                <section className="example-table-section">
                    <h2>DSCR lender thresholds — what each ratio means</h2>
                    <p className="section-lead">
                        Non-QM lenders use DSCR tiers to set approval, rate, and LTV. Here is what
                        each threshold means in practice for a 2026 DSCR loan.
                    </p>
                    <div className="example-table-wrapper">
                        <table className="example-table">
                            <thead>
                                <tr>
                                    <th>DSCR Range</th>
                                    <th>Approval Status</th>
                                    <th>Max LTV</th>
                                    <th>Rate Impact</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dscrThresholds.map((row, i) => (
                                    <tr key={i}>
                                        <td className="income-cell">{row.dscr}</td>
                                        <td>{row.status}</td>
                                        <td>{row.ltv}</td>
                                        <td>{row.rate}</td>
                                        <td style={{ fontSize: '0.82rem', color: '#8fa3b8' }}>{row.notes}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="table-note">
                        Thresholds vary by lender. Some specialty lenders offer more flexible terms.{' '}
                        <a href="/?sq=What+DSCR+do+lenders+require+for+investment+property+loans+in+2026%3F">
                            Ask HomeRates.ai about current DSCR lender requirements →
                        </a>
                    </p>
                </section>

                {/* ── HOW IT WORKS ── */}
                <section className="how-it-works">
                    <h2>How HomeRates.ai calculates your DSCR</h2>
                    <p className="section-lead">
                        The calculation is deterministic — not AI-estimated. The same inputs always
                        produce the same output, using the same math a non-QM lender uses.
                    </p>
                    <ol className="steps-list">
                        <li>
                            <strong>Full PITIA calculated</strong> — monthly principal & interest at
                            the current DSCR loan rate, plus estimated property taxes (1.1%/yr),
                            homeowners insurance (0.35%/yr), and any HOA dues entered.
                        </li>
                        <li>
                            <strong>DSCR ratio computed</strong> — gross monthly rent divided by
                            full PITIA. This is the ratio lenders pull from the 1007 rent appraisal
                            or existing lease, compared against their minimum threshold.
                        </li>
                        <li>
                            <strong>Cash flow shown</strong> — gross rent minus PITIA gives your
                            monthly surplus before vacancy (typically 5–8%) and maintenance reserves.
                            Annual cash-on-cash return is also computed.
                        </li>
                        <li>
                            <strong>Lender qualification status</strong> — your DSCR is compared
                            against the 1.0, 1.25, and 1.5 thresholds to show approval odds,
                            expected rate tier, and maximum LTV.
                        </li>
                        <li>
                            <strong>2026 loan limits applied</strong> — loan amount is checked against
                            the 2026 FHFA conforming limit ($832,750 standard, up to $1,249,125
                            high-cost) to flag jumbo territory.
                        </li>
                    </ol>
                </section>

                {/* ── E-E-A-T / AUTHOR ── */}
                <section className="author-section">
                    <div className="author-card">
                        <div className="author-avatar">RA</div>
                        <div className="author-info">
                            <div className="author-name">Rayaan Arif</div>
                            <div className="author-cred">Licensed Loan Consultant</div>
                            <p className="author-bio">
                                HomeRates.ai was built to give real estate investors the same
                                DSCR analysis that non-QM lenders run — before you pay for an
                                appraisal or submit a full application. Every number reflects
                                real lender guidelines and live market data.
                            </p>
                        </div>
                    </div>
                    <p className="last-updated">
                        Content last reviewed: March 2026 · DSCR guidelines: non-QM lender standards ·
                        Loan limits: FHFA CY2026 · Rate data: FRED Freddie Mac PMMS (weekly)
                    </p>
                    <p className="disclaimer">
                        <strong>Educational purposes only.</strong> HomeRates.ai is not a lender,
                        broker, or mortgage advisor. Results are estimates based on your inputs and
                        current market data. Consult a licensed mortgage professional for a formal
                        pre-approval. Equal Housing Opportunity.
                    </p>
                </section>

                {/* ── FAQ SECTION ── */}
                <section className="faq-section">
                    <h2>Frequently asked questions</h2>
                    <div className="faq-list">
                        {faqs.map((faq, i) => (
                            <details key={i} className="faq-item">
                                <summary className="faq-question">{faq.q}</summary>
                                <p className="faq-answer">{faq.a}</p>
                            </details>
                        ))}
                    </div>
                </section>

                {/* ── RELATED CALCULATORS ── */}
                <section className="related-section">
                    <h2>Related calculators</h2>
                    <div className="related-grid">
                        <Link href="/affordability-calculator" className="related-card">
                            <div className="related-title">Affordability Calculator</div>
                            <div className="related-desc">How much house can you afford? Three scenarios — FHA, 3% down, 20% down — with monthly payment, cash needed, and savings gap.</div>
                        </Link>
                        <Link href="/fha-calculator" className="related-card">
                            <div className="related-title">FHA Loan Calculator</div>
                            <div className="related-desc">Full FHA payment — UFMIP, monthly MIP, MIP duration, DTI analysis, and FHA vs conventional comparison.</div>
                        </Link>
                        <Link href="/refinance-calculator" className="related-card">
                            <div className="related-title">Refinance Calculator</div>
                            <div className="related-desc">Breakeven analysis, monthly savings, and rate-watch trigger points for your refi decision.</div>
                        </Link>
                    </div>
                </section>

            </main>

            {/* ── INLINE STYLES ──
                Scoped to .dscr-page — mirrors .affordability-page and .fha-page exactly.
            ── */}
            <style>{`
                body:has(.calc-nav) {
                    display: block !important; height: auto !important;
                    overflow: visible !important; background: #080c12 !important;
                }
                html:has(.calc-nav) { background: #080c12 !important; }
                body:has(.calc-nav) .app-footer { display: none; }
                .calc-nav {
                    position: sticky; top: 0; z-index: 100;
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 16px 24px;
                    background: rgba(8,12,18,0.95); backdrop-filter: blur(8px);
                    border-bottom: 1px solid rgba(255,255,255,0.07);
                }
                .calc-nav-logo { display: flex; align-items: center; text-decoration: none; }
                .calc-nav-logo img { height: 32px; width: auto; }
                .calc-nav-cta {
                    padding: 8px 18px;
                    background: #00e87a; color: #080c12;
                    border-radius: 999px; font-size: 0.875rem;
                    font-weight: 600; text-decoration: none;
                    transition: opacity 0.15s;
                }
                .calc-nav-cta:hover { opacity: 0.88; }
                @media (max-width: 600px) { .calc-nav { padding: 14px 20px; } }

                .dscr-page {
                    max-width: 860px;
                    margin: 0 auto;
                    padding: 2rem 1.5rem 4rem;
                    font-family: var(--font-sans, system-ui, sans-serif);
                    color: #f0f4ff;
                    line-height: 1.6;
                }

                /* Breadcrumb */
                .dscr-page .breadcrumb ol {
                    display: flex; gap: 6px; list-style: none;
                    padding: 0; margin: 0 0 2rem; font-size: 13px;
                    color: #8fa3b8;
                }
                .dscr-page .breadcrumb a { color: inherit; text-decoration: none; }
                .dscr-page .breadcrumb a:hover { text-decoration: underline; }
                .dscr-page .breadcrumb li[aria-current] { color: #f0f4ff; font-weight: 500; }

                /* Hero */
                .dscr-page .hero { margin-bottom: 3rem; }
                .dscr-page h1 {
                    font-size: clamp(1.75rem, 4vw, 2.5rem);
                    font-weight: 700; line-height: 1.15;
                    margin: 0 0 1rem; letter-spacing: -0.02em;
                    font-family: 'DM Sans', sans-serif;
                }
                .dscr-page .hero-sub {
                    display: block; font-size: clamp(1.1rem, 2.5vw, 1.5rem);
                    font-weight: 400; color: #8fa3b8;
                    margin-top: 0.25rem;
                }
                .dscr-page .hero-lead {
                    font-size: 1.1rem; max-width: 640px;
                    color: #8fa3b8; margin: 0 0 1.25rem;
                }
                .dscr-page .trust-bar {
                    display: flex; flex-wrap: wrap; gap: 10px;
                    margin-top: 0.75rem;
                }
                .dscr-page .trust-item {
                    font-size: 13px; padding: 4px 12px;
                    background: rgba(255,255,255,0.05);
                    border-radius: 99px; border: 1px solid rgba(255,255,255,0.07);
                    color: #8fa3b8;
                }

                /* Calculator embed */
                .dscr-page .calculator-embed {
                    background: #0e1420;
                    border-radius: 16px; border: 1px solid rgba(255,255,255,0.07);
                    padding: 2rem; margin-bottom: 3rem;
                }
                .dscr-page .embed-header h2 { margin: 0 0 0.5rem; font-size: 1.35rem; }
                .dscr-page .embed-header p { margin: 0 0 1.25rem; color: #8fa3b8; font-size: 0.95rem; }
                .dscr-page .seed-chips {
                    display: flex; flex-wrap: wrap; gap: 8px;
                    align-items: center; margin-bottom: 1rem;
                }
                .dscr-page .seed-label { font-size: 13px; color: #8fa3b8; }
                .dscr-page .seed-chip {
                    font-size: 13px; padding: 5px 13px;
                    background: #0e1420; border-radius: 99px;
                    border: 1px solid rgba(255,255,255,0.10);
                    color: #f0f4ff; text-decoration: none;
                    transition: border-color 0.15s;
                }
                .dscr-page .seed-chip:hover { border-color: rgba(255,255,255,0.3); }
                .dscr-page .cta-block {
                    text-align: center; padding: 1.5rem 0 0.5rem;
                }
                .dscr-page .cta-button {
                    display: inline-block; padding: 14px 32px;
                    background: #00e87a; color: #080c12;
                    border-radius: 999px; font-size: 1rem;
                    font-weight: 600; text-decoration: none;
                    transition: opacity 0.15s;
                }
                .dscr-page .cta-button:hover { opacity: 0.85; }
                .dscr-page .cta-sub {
                    margin: 10px 0 0; font-size: 13px;
                    color: #8fa3b8;
                }
                .dscr-page .cta-sub a { color: #00e87a; }

                /* Sections */
                .dscr-page h2 {
                    font-size: clamp(1.2rem, 2.5vw, 1.6rem);
                    font-weight: 600; margin: 0 0 0.75rem;
                    letter-spacing: -0.01em;
                    font-family: 'DM Sans', sans-serif;
                }
                .dscr-page .section-lead {
                    font-size: 1rem; color: #8fa3b8;
                    margin: 0 0 1.5rem; max-width: 680px; line-height: 1.65;
                }

                /* Features grid */
                .dscr-page .what-you-get { margin-bottom: 3rem; }
                .dscr-page .features-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
                    gap: 14px;
                }
                .dscr-page .feature-card {
                    background: #0e1420;
                    border-radius: 12px; padding: 1.25rem;
                    border: 1px solid rgba(0,0,0,0.07);
                }
                .dscr-page .feature-icon { font-size: 1.5rem; margin-bottom: 0.5rem; }
                .dscr-page .feature-card h3 { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.4rem; }
                .dscr-page .feature-card p { font-size: 0.88rem; color: #8fa3b8; margin: 0; line-height: 1.55; }

                /* Tables */
                .dscr-page .example-table-section { margin-bottom: 3rem; }
                .dscr-page .example-table-wrapper { overflow-x: auto; margin-bottom: 0.75rem; }
                .dscr-page .example-table {
                    width: 100%; border-collapse: collapse;
                    font-size: 0.9rem; min-width: 560px;
                }
                .dscr-page .example-table th {
                    text-align: left; font-size: 0.78rem; font-weight: 600;
                    color: #8fa3b8; padding: 8px 12px;
                    border-bottom: 1.5px solid rgba(255,255,255,0.08);
                    background: #0e1420;
                    text-transform: uppercase; letter-spacing: 0.04em;
                }
                .dscr-page .example-table td { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); }
                .dscr-page .example-table tr:last-child td { border-bottom: none; }
                .dscr-page .income-cell { font-weight: 600; }
                .dscr-page .price-cell { font-weight: 500; color: #00e87a; }
                .dscr-page .negative-cell { font-weight: 500; color: #ff5f5f; }
                .dscr-page .table-note { font-size: 0.8rem; color: #8fa3b8; margin: 0; line-height: 1.5; }
                .dscr-page .table-note a { color: #00e87a; }

                /* How it works */
                .dscr-page .how-it-works { margin-bottom: 3rem; }
                .dscr-page .steps-list { padding-left: 1.25rem; margin: 0; }
                .dscr-page .steps-list li { margin-bottom: 0.9rem; font-size: 0.95rem; line-height: 1.6; color: #8fa3b8; }
                .dscr-page .steps-list strong { color: #f0f4ff; }

                /* Author / E-E-A-T */
                .dscr-page .author-section {
                    background: #0e1420;
                    border-radius: 12px; padding: 1.5rem;
                    border: 1px solid rgba(0,0,0,0.07);
                    margin-bottom: 3rem;
                }
                .dscr-page .author-card { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 1rem; }
                .dscr-page .author-avatar {
                    width: 44px; height: 44px; border-radius: 50%;
                    background: rgba(0,232,122,0.15); display: flex;
                    align-items: center; justify-content: center;
                    font-weight: 600; font-size: 14px; color: #00e87a;
                    flex-shrink: 0;
                }
                .dscr-page .author-name { font-weight: 600; font-size: 0.95rem; margin-bottom: 2px; }
                .dscr-page .author-cred { font-size: 0.82rem; color: #8fa3b8; margin-bottom: 0.4rem; }
                .dscr-page .author-bio { font-size: 0.88rem; color: #8fa3b8; margin: 0; line-height: 1.55; }
                .dscr-page .last-updated { font-size: 0.8rem; color: #8fa3b8; margin: 0 0 0.5rem; }
                .dscr-page .disclaimer { font-size: 0.8rem; color: #8fa3b8; margin: 0; line-height: 1.55; }

                /* FAQ */
                .dscr-page .faq-section { margin-bottom: 3rem; }
                .dscr-page .faq-list { display: flex; flex-direction: column; gap: 8px; }
                .dscr-page .faq-item {
                    border: 1px solid rgba(255,255,255,0.07);
                    border-radius: 10px; overflow: hidden;
                    background: #0e1420;
                }
                .dscr-page .faq-question {
                    padding: 1rem 1.25rem; font-weight: 500;
                    font-size: 0.95rem; cursor: pointer;
                    list-style: none; display: flex;
                    justify-content: space-between; align-items: center;
                    color: #f0f4ff;
                }
                .dscr-page .faq-question::after { content: '+'; font-size: 1.2rem; color: #8fa3b8; }
                .dscr-page details[open] .faq-question::after { content: '−'; }
                .dscr-page .faq-answer {
                    padding: 0.75rem 1.25rem 1rem; margin: 0;
                    font-size: 0.9rem; color: #8fa3b8;
                    line-height: 1.65;
                    border-top: 1px solid rgba(255,255,255,0.06);
                }

                /* Related */
                .dscr-page .related-section { margin-bottom: 2rem; }
                .dscr-page .related-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 12px; margin-top: 1rem;
                }
                .dscr-page .related-card {
                    display: block; padding: 1.1rem 1.25rem;
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 12px; text-decoration: none;
                    color: #f0f4ff; background: #0e1420;
                    transition: border-color 0.15s, box-shadow 0.15s;
                }
                .dscr-page .related-card:hover {
                    border-color: rgba(0,232,122,0.4);
                    box-shadow: 0 2px 12px rgba(34,197,94,0.08);
                }
                .dscr-page .related-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 5px; }
                .dscr-page .related-desc { font-size: 0.83rem; color: #8fa3b8; line-height: 1.5; }

                /* Responsive */
                @media (max-width: 600px) {
                    .dscr-page { padding: 1.25rem 1rem 3rem; }
                    .dscr-page .trust-bar { gap: 6px; }
                    .dscr-page .trust-item { font-size: 12px; padding: 3px 10px; }
                    .dscr-page .calculator-embed { padding: 1.25rem; }
                    .dscr-page .features-grid { grid-template-columns: 1fr; }
                }
            `}</style>
        </>
    );
}
