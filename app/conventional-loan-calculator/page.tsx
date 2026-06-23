// app/conventional-loan-calculator/page.tsx
// SEO landing page — /conventional-loan-calculator
// Target keyword: "conventional loan calculator" (KD 30, 14k/mo)
// Structure mirrors /fha-calculator, /dscr-calculator, /refinance-calculator exactly

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Conventional Loan Calculator 2026 — Payment, PMI & DTI Breakdown | HomeRates.ai',
    description:
        'Calculate your conventional mortgage payment in 2026. See monthly P&I, PMI (cancels at 80% LTV), property taxes, DTI analysis, and conventional vs FHA comparison. Live FRED rates and 2026 FHFA limits.',
    keywords: [
        'conventional loan calculator',
        'conventional mortgage calculator',
        'conventional loan calculator 2026',
        'conventional loan pmi calculator',
        'conventional vs fha calculator',
        'conforming loan calculator',
        'conventional mortgage payment calculator',
    ],
    openGraph: {
        title: 'Conventional Loan Calculator 2026 — Payment, PMI & DTI | HomeRates.ai',
        description: 'Conventional mortgage payment with PMI, PMI cancellation timeline, DTI analysis, and FHA comparison. Live FRED rates. 2026 FHFA limits.',
        url: 'https://chat.homerates.ai/conventional-loan-calculator',
        siteName: 'HomeRates.ai',
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Conventional Loan Calculator 2026 | HomeRates.ai',
        description: 'Monthly payment, PMI cancellation timeline, DTI — 2026 FHFA limits.',
    },
    alternates: { canonical: 'https://chat.homerates.ai/conventional-loan-calculator' },
};

const schemaFAQ = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
        {
            '@type': 'Question',
            name: 'What is a conventional loan calculator?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'A conventional loan calculator computes your monthly mortgage payment on a Fannie Mae or Freddie Mac conforming loan, including principal & interest, PMI (if less than 20% down), property taxes, and homeowners insurance. Unlike FHA loans, conventional loans have no upfront MIP — but PMI is required until you reach 20% equity. HomeRates.ai uses 2026 FHFA loan limits and live FRED mortgage rate data.',
            },
        },
        {
            '@type': 'Question',
            name: 'What is the minimum down payment for a conventional loan in 2026?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'The minimum down payment for a conventional loan is 3% for first-time buyers under Fannie Mae HomeReady or Freddie Mac Home Possible, and 5% for standard conventional loans. Investment properties require 15–25% down. No PMI is required with 20% or more down. The 2026 conforming loan limit is $832,750 for a single-unit property in standard counties per FHFA.',
            },
        },
        {
            '@type': 'Question',
            name: 'When does PMI cancel on a conventional loan?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'PMI on a conventional loan automatically cancels when your loan balance reaches 80% of the original purchase price — typically around year 10–11 with a 5% down payment at current rates. You can request cancellation at 80% LTV. It automatically terminates at 78% LTV per the Homeowners Protection Act. Unlike FHA MIP, conventional PMI does not last the life of the loan.',
            },
        },
        {
            '@type': 'Question',
            name: 'What are the 2026 conventional loan limits?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'For 2026, the conforming loan limit for a single-family home is $832,750 in standard counties and up to $1,249,125 in high-cost areas (most of California, New York, Seattle, etc.) per FHFA. Loans above the conforming limit require jumbo financing. Source: FHFA CY2026, effective January 1, 2026.',
            },
        },
        {
            '@type': 'Question',
            name: 'Conventional vs FHA loan — which is better?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Conventional is better if your credit score is 680+ and you have 5%+ saved — PMI cancels automatically at 80% LTV, whereas FHA MIP lasts the life of the loan with under 10% down. FHA is better if your credit score is 580–679 or your DTI is above 45% — FHA allows up to 50% DTI with compensating factors and a lower minimum credit score.',
            },
        },
        {
            '@type': 'Question',
            name: 'What credit score do I need for a conventional loan?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'The minimum credit score for a conventional loan is 620. Best rates and PMI pricing require 740+. Between 620–679, expect a significant rate premium and higher PMI. Between 680–739, rates are good and PMI is moderate. At 740+, you qualify for best conventional pricing. Below 620, FHA is typically the only conforming option.',
            },
        },
        {
            '@type': 'Question',
            name: 'How accurate is the HomeRates.ai conventional loan calculator?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'HomeRates.ai uses a deterministic calculation engine — same inputs always produce the same output. It applies 2026 FHFA conforming loan limits, Fannie Mae 45% DTI guidelines, live FRED 30-year rate data, and calculates the exact month PMI cancels using actual amortization. For educational purposes only — not a commitment to lend.',
            },
        },
    ],
};

const schemaSoftwareApp = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'HomeRates.ai Conventional Loan Calculator',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    url: 'https://chat.homerates.ai/conventional-loan-calculator',
    description: 'Free conventional loan calculator. Monthly payment with PMI breakdown, PMI cancellation timeline, DTI analysis, conventional vs FHA comparison, and 2026 FHFA loan limit check.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    author: { '@type': 'Organization', name: 'HomeRates.ai', url: 'https://chat.homerates.ai' },
    featureList: [
        'Full monthly payment: P&I, PMI, taxes, insurance',
        'PMI cancellation year via actual amortization',
        'DTI analysis per Fannie Mae 45% guideline',
        'Conventional vs FHA side-by-side comparison',
        '2026 FHFA conforming loan limits',
        'Live FRED 30-year mortgage rate data',
    ],
};

const schemaBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'HomeRates.ai', item: 'https://chat.homerates.ai' },
        { '@type': 'ListItem', position: 2, name: 'Calculators', item: 'https://chat.homerates.ai/calculators' },
        { '@type': 'ListItem', position: 3, name: 'Conventional Loan Calculator', item: 'https://chat.homerates.ai/conventional-loan-calculator' },
    ],
};

const table20 = [
    { price: 300000, down: 60000, loan: 240000, pi: 1557, taxIns: 362, total: 1919 },
    { price: 350000, down: 70000, loan: 280000, pi: 1816, taxIns: 423, total: 2239 },
    { price: 400000, down: 80000, loan: 320000, pi: 2076, taxIns: 483, total: 2559 },
    { price: 450000, down: 90000, loan: 360000, pi: 2335, taxIns: 544, total: 2879 },
    { price: 500000, down: 100000, loan: 400000, pi: 2594, taxIns: 604, total: 3199 },
    { price: 600000, down: 120000, loan: 480000, pi: 3113, taxIns: 725, total: 3838 },
    { price: 700000, down: 140000, loan: 560000, pi: 3632, taxIns: 846, total: 4478 },
];

const table5 = [
    { price: 300000, down: 15000, loan: 285000, pi: 1849, pmi: 119, taxIns: 362, total: 2330 },
    { price: 350000, down: 17500, loan: 332500, pi: 2157, pmi: 139, taxIns: 423, total: 2719 },
    { price: 400000, down: 20000, loan: 380000, pi: 2465, pmi: 158, taxIns: 483, total: 3106 },
    { price: 450000, down: 22500, loan: 427500, pi: 2773, pmi: 178, taxIns: 544, total: 3495 },
    { price: 500000, down: 25000, loan: 475000, pi: 3081, pmi: 198, taxIns: 604, total: 3883 },
    { price: 600000, down: 30000, loan: 570000, pi: 3697, pmi: 238, taxIns: 725, total: 4660 },
    { price: 700000, down: 35000, loan: 665000, pi: 4313, pmi: 277, taxIns: 846, total: 5436 },
];

const faqs = [
    {
        q: 'What is a conventional loan calculator?',
        a: "A conventional loan calculator computes monthly P&I, PMI (if under 20% down), taxes, and insurance on a Fannie Mae/Freddie Mac conforming loan. Unlike FHA, there's no upfront MIP — but PMI is required until 20% equity. HomeRates.ai uses 2026 FHFA limits and live FRED rate data.",
    },
    {
        q: 'What is the minimum down payment for a conventional loan in 2026?',
        a: '3% for first-time buyers under HomeReady/Home Possible. 5% for standard conventional. 20% to avoid PMI entirely. Investment properties: 15–25%. The 2026 conforming limit is $832,750 standard county per FHFA.',
    },
    {
        q: 'When does PMI cancel on a conventional loan?',
        a: 'PMI cancels automatically at 78% LTV per the Homeowners Protection Act, or you can request removal at 80% LTV. At 5% down and 6.75%, that\'s around year 10.6. Unlike FHA MIP, conventional PMI never lasts the life of the loan.',
    },
    {
        q: 'What are the 2026 conventional loan limits?',
        a: '$832,750 standard county, up to $1,249,125 in high-cost areas (most of California, NYC, Seattle, etc.). Above these limits requires jumbo financing. Source: FHFA CY2026, effective Jan 1, 2026.',
    },
    {
        q: 'Conventional vs FHA — which is better?',
        a: 'Conventional wins with 680+ credit and 5%+ down — PMI cancels at 80% LTV while FHA MIP lasts the life of the loan with under 10% down. FHA wins with 580–679 credit or DTI above 45%. The crossover is usually around 680 credit score with 5% down.',
    },
    {
        q: 'What credit score do I need for a conventional loan?',
        a: 'Minimum 620. Best pricing at 740+. Between 620–679 you pay a significant rate premium. Between 680–739 rates are good. At 740+ you qualify for the best conventional pricing and lowest PMI rates.',
    },
    {
        q: 'How accurate is the HomeRates.ai conventional calculator?',
        a: 'Deterministic calculation engine — same inputs, same output. Applies 2026 FHFA limits, Fannie Mae 45% DTI, live FRED rates, and calculates PMI cancellation using actual amortization. For educational purposes only — not a pre-approval.',
    },
];

export default function ConventionalLoanCalculatorPage() {
    const f$ = (n: number) => `$${n.toLocaleString()}`;

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaFAQ) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaSoftwareApp) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaBreadcrumb) }} />

            {/* ── LOGO NAV ── */}
            <nav className="calc-nav">
                <Link href="/" className="calc-nav-logo">
                    <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
                </Link>
                <Link href="/chat" className="calc-nav-cta">Try the AI →</Link>
            </nav>

            <main className="conv-page">

                <nav className="breadcrumb" aria-label="Breadcrumb">
                    <ol>
                        <li><Link href="/">HomeRates.ai</Link></li>
                        <li aria-hidden="true">›</li>
                        <li><Link href="/calculators">Calculators</Link></li>
                        <li aria-hidden="true">›</li>
                        <li aria-current="page">Conventional Loan Calculator</li>
                    </ol>
                </nav>

                <section className="hero">
                    <h1>Conventional Loan Calculator<br /><span className="hero-sub">Monthly Payment, PMI & DTI Breakdown — 2026</span></h1>
                    <p className="hero-lead">
                        Enter your home price and down payment — get a full conventional mortgage
                        payment breakdown including PMI, the exact year PMI cancels, DTI analysis,
                        and a side-by-side FHA comparison. Powered by live FRED rates and 2026 FHFA limits.
                    </p>
                    <div className="trust-bar">
                        <span className="trust-item">📡 Live FRED rates</span>
                        <span className="trust-item">✅ 2026 FHFA loan limits</span>
                        <span className="trust-item">🏦 Fannie Mae DTI guidelines</span>
                        <span className="trust-item">🔒 No login required</span>
                    </div>
                </section>

                <section className="calculator-embed" id="calculator">
                    <div className="embed-header">
                        <h2>Your Conventional Loan Analysis</h2>
                        <p>Click a scenario or type your home price to get a full payment breakdown — including PMI, DTI, and a comparison to FHA.</p>
                    </div>
                    <div className="seed-chips">
                        <span className="seed-label">Try an example:</span>
                        <a href="/chat?sq=Conventional+loan+on+a+%24400%2C000+home+with+20%25+down+at+current+rates" className="seed-chip">$400k · 20% down</a>
                        <a href="/chat?sq=Conventional+loan+on+a+%24450%2C000+home+with+5%25+down+%E2%80%94+show+PMI+and+when+it+cancels" className="seed-chip">$450k · 5% down + PMI</a>
                        <a href="/chat?sq=Conventional+loan+on+a+%24500%2C000+home+with+10%25+down+at+current+rates" className="seed-chip">$500k · 10% down</a>
                        <a href="/chat?sq=Compare+conventional+5%25+down+vs+FHA+3.5%25+down+on+a+%24400%2C000+home" className="seed-chip">Conventional vs FHA</a>
                    </div>
                    <div className="cta-block">
                        <a href="/chat?sq=Conventional+loan+on+a+%24450%2C000+home+with+10%25+down+%E2%80%94+show+full+payment+breakdown+including+PMI+and+when+it+cancels" className="cta-button">
                            Calculate my conventional payment →
                        </a>
                        <p className="cta-sub">Free · No login required · Result in seconds</p>
                        <p className="cta-sub" style={{ marginTop: 4 }}>
                            Want saved scenarios and session memory?{' '}
                            <Link href="/sign-up">Create a free account</Link>
                        </p>
                    </div>
                </section>

                <section className="what-you-get">
                    <h2>What the conventional calculator shows you</h2>
                    <p className="section-lead">
                        PMI cancellation is the defining advantage of conventional over FHA — and most
                        calculators don't tell you when it happens. HomeRates.ai calculates the exact
                        month PMI cancels using actual amortization, not a rule-of-thumb estimate.
                    </p>
                    <div className="features-grid">
                        <div className="feature-card">
                            <div className="feature-icon">💰</div>
                            <h3>Full monthly payment</h3>
                            <p>Principal & interest, PMI (if applicable), property taxes, and homeowners insurance — every component broken out clearly.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">📅</div>
                            <h3>PMI cancellation date</h3>
                            <p>The exact year PMI cancels based on your actual amortization schedule. Shows total PMI paid and the monthly savings after removal.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">📊</div>
                            <h3>DTI analysis</h3>
                            <p>Front-end and back-end debt-to-income per Fannie Mae 45% guideline (50% with DU/LP). Shows where you stand and income needed to qualify.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">⚖️</div>
                            <h3>Conventional vs FHA</h3>
                            <p>Side-by-side on the same price. Which is cheaper monthly, which costs less upfront, and when PMI/MIP makes conventional the winner.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">📡</div>
                            <h3>Live 2026 rates</h3>
                            <p>Pulls the live 30-year average from FRED (Freddie Mac PMMS) weekly. Your payment uses the actual current market rate.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">🗺️</div>
                            <h3>Loan limit check</h3>
                            <p>Checks your loan against the 2026 FHFA conforming limit ($832,750 standard, up to $1,249,125 high-cost) and flags if you need jumbo financing.</p>
                        </div>
                    </div>
                </section>

                <section className="example-table-section">
                    <h2>Conventional payment — 20% down (no PMI) · 2026</h2>
                    <p className="section-lead">Assumes 20% down · 6.75% rate · 30-year fixed · Taxes 1.1%/yr · Insurance 0.35%/yr.</p>
                    <div className="example-table-wrapper">
                        <table className="example-table">
                            <thead>
                                <tr>
                                    <th>Home Price</th>
                                    <th>Down (20%)</th>
                                    <th>Loan</th>
                                    <th>P&amp;I</th>
                                    <th>Tax + Ins</th>
                                    <th>Total/mo</th>
                                    <th>PMI</th>
                                </tr>
                            </thead>
                            <tbody>
                                {table20.map((row, i) => (
                                    <tr key={i}>
                                        <td className="income-cell">{f$(row.price)}</td>
                                        <td>{f$(row.down)}</td>
                                        <td>{f$(row.loan)}</td>
                                        <td>{f$(row.pi)}</td>
                                        <td>{f$(row.taxIns)}</td>
                                        <td className="price-cell">{f$(row.total)}/mo</td>
                                        <td className="no-pmi">✅ None</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="table-note">For educational purposes only. Actual payment varies by county tax rate and insurance.</p>
                </section>

                <section className="example-table-section">
                    <h2>Conventional payment — 5% down (with PMI) · 2026</h2>
                    <p className="section-lead">
                        Assumes 5% down · 6.75% rate · 30-year fixed · PMI ~0.5%/yr · Taxes 1.1%/yr · Insurance 0.35%/yr.
                        PMI cancels at 80% LTV — approximately year 10.6 at these inputs.
                    </p>
                    <div className="example-table-wrapper">
                        <table className="example-table">
                            <thead>
                                <tr>
                                    <th>Home Price</th>
                                    <th>Down (5%)</th>
                                    <th>Loan</th>
                                    <th>P&amp;I</th>
                                    <th>PMI/mo</th>
                                    <th>Tax + Ins</th>
                                    <th>Total/mo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {table5.map((row, i) => (
                                    <tr key={i}>
                                        <td className="income-cell">{f$(row.price)}</td>
                                        <td>{f$(row.down)}</td>
                                        <td>{f$(row.loan)}</td>
                                        <td>{f$(row.pi)}</td>
                                        <td className="pmi-cell">{f$(row.pmi)}</td>
                                        <td>{f$(row.taxIns)}</td>
                                        <td className="price-cell">{f$(row.total)}/mo</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="table-note">PMI rate varies by credit score and lender. Estimate assumes ~0.5%/yr on loan balance. For educational purposes only.</p>
                </section>

                <section className="example-table-section">
                    <h2>Conventional vs FHA — side by side</h2>
                    <p className="section-lead">$400,000 purchase · Conventional 5% down vs FHA 3.5% down · 6.75% rate · 30-year fixed.</p>
                    <div className="example-table-wrapper">
                        <table className="example-table">
                            <thead>
                                <tr>
                                    <th>Feature</th>
                                    <th>Conventional (5% down)</th>
                                    <th>FHA (3.5% down)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    ['Down payment', '$20,000', '$14,000'],
                                    ['Upfront fee', 'None', '$6,755 UFMIP (financed)'],
                                    ['Total loan amount', '$380,000', '$392,755'],
                                    ['P&I payment', '$2,464/mo', '$2,547/mo'],
                                    ['Mortgage insurance', '$158/mo (PMI)', '$177/mo (MIP)'],
                                    ['Insurance removes?', 'Auto at ~yr 10.6 (80% LTV)', 'Life of loan (under 10% down)'],
                                    ['Min. credit score', '620 (740+ for best pricing)', '580'],
                                    ['Max DTI (standard)', '45% (50% with DU approval)', '43% (50% with factors)'],
                                    ['Total monthly (PITI)', '$3,089/mo', '$3,208/mo'],
                                    ['Better when', 'Credit 680+, 5%+ saved', 'Credit 580–679, under 5% saved'],
                                ].map(([feat, conv, fha], i) => (
                                    <tr key={i}>
                                        <td className="income-cell">{feat}</td>
                                        <td className="price-cell">{conv}</td>
                                        <td>{fha}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="table-note">
                        <a href="/chat?sq=Compare+conventional+5%25+down+vs+FHA+3.5%25+down+on+a+%24400%2C000+home+at+6.75%25">
                            Run this comparison in the calculator →
                        </a>
                    </p>
                </section>

                <section className="how-it-works">
                    <h2>How HomeRates.ai calculates your conventional payment</h2>
                    <p className="section-lead">Deterministic — not AI-estimated. Same inputs always produce the same output.</p>
                    <ol className="steps-list">
                        <li><strong>P&I on loan amount</strong> — computed on the loan balance at the current FRED 30-year rate. No upfront fees added — conventional has no UFMIP.</li>
                        <li><strong>PMI calculated</strong> — if down payment is under 20%, PMI is estimated at ~0.5%/yr of the loan balance. Actual PMI varies by credit score, LTV, and lender.</li>
                        <li><strong>PMI cancellation date</strong> — actual amortization run month-by-month to find the exact month the balance drops to 80% of purchase price. Not an estimate.</li>
                        <li><strong>DTI analysis</strong> — front-end and back-end ratios per Fannie Mae 45% back-end guideline (50% with DU/LP and compensating factors).</li>
                        <li><strong>2026 loan limit check</strong> — loan amount compared against the 2026 FHFA conforming limit ($832,750 standard, up to $1,249,125 high-cost) per FHFA CY2026.</li>
                    </ol>
                </section>

                <section className="author-section">
                    <div className="author-card">
                        <p className="author-bio">HomeRates.ai was built to give borrowers the same conventional loan analysis that loan officers run — including the exact PMI cancellation date and FHA comparison that most calculators skip.</p>
                    </div>
                    <p className="last-updated">Content last reviewed: March 2026 · Loan limits: FHFA CY2026 · Rate data: FRED Freddie Mac PMMS (weekly) · Guidelines: Fannie Mae Selling Guide B3-6</p>
                    <p className="disclaimer"><strong>Educational purposes only.</strong> HomeRates.ai is not a lender, broker, or mortgage advisor. Results are estimates. Consult a licensed mortgage professional for a formal pre-approval. Equal Housing Opportunity.</p>
                </section>

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

                <section className="related-section">
                    <h2>Related calculators</h2>
                    <div className="related-grid">
                        <Link href="/fha-calculator" className="related-card">
                            <div className="related-title">FHA Loan Calculator</div>
                            <div className="related-desc">Full FHA payment — UFMIP, monthly MIP, MIP duration, and FHA vs conventional comparison.</div>
                        </Link>
                        <Link href="/affordability-calculator" className="related-card">
                            <div className="related-title">Affordability Calculator</div>
                            <div className="related-desc">How much house can you afford? Three scenarios with monthly payment, cash needed, and savings gap.</div>
                        </Link>
                        <Link href="/refinance-calculator" className="related-card">
                            <div className="related-title">Refinance Calculator</div>
                            <div className="related-desc">Breakeven analysis, monthly savings, and trigger rate for your refi decision.</div>
                        </Link>
                    </div>
                </section>

            </main>

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

                .conv-page { max-width: 860px; margin: 0 auto; padding: 2rem 1.5rem 4rem; font-family: var(--font-sans, system-ui, sans-serif); color: #f0f4ff; line-height: 1.6; }
                .conv-page .breadcrumb ol { display: flex; gap: 6px; list-style: none; padding: 0; margin: 0 0 2rem; font-size: 13px; color: #8fa3b8; }
                .conv-page .breadcrumb a { color: inherit; text-decoration: none; }
                .conv-page .breadcrumb a:hover { text-decoration: underline; }
                .conv-page .breadcrumb li[aria-current] { color: #f0f4ff; font-weight: 500; }
                .conv-page .hero { margin-bottom: 3rem; }
                .conv-page h1 { font-size: clamp(1.75rem, 4vw, 2.5rem); font-weight: 700; line-height: 1.15; margin: 0 0 1rem; letter-spacing: -0.02em; font-family: 'DM Sans', sans-serif; }
                .conv-page .hero-sub { display: block; font-size: clamp(1.1rem, 2.5vw, 1.5rem); font-weight: 400; color: #8fa3b8; margin-top: 0.25rem; }
                .conv-page .hero-lead { font-size: 1.1rem; max-width: 640px; color: #8fa3b8; margin: 0 0 1.25rem; }
                .conv-page .trust-bar { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 0.75rem; }
                .conv-page .trust-item { font-size: 13px; padding: 4px 12px; background: rgba(255,255,255,0.05); border-radius: 99px; border: 1px solid rgba(255,255,255,0.07); color: #8fa3b8; }
                .conv-page .calculator-embed { background: #0e1420; border-radius: 16px; border: 1px solid rgba(255,255,255,0.07); padding: 2rem; margin-bottom: 3rem; }
                .conv-page .embed-header h2 { margin: 0 0 0.5rem; font-size: 1.35rem; }
                .conv-page .embed-header p { margin: 0 0 1.25rem; color: #8fa3b8; font-size: 0.95rem; }
                .conv-page .seed-chips { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 1rem; }
                .conv-page .seed-label { font-size: 13px; color: #8fa3b8; }
                .conv-page .seed-chip { font-size: 13px; padding: 5px 13px; background: #0e1420; border-radius: 99px; border: 1px solid rgba(255,255,255,0.10); color: #f0f4ff; text-decoration: none; transition: border-color 0.15s; }
                .conv-page .seed-chip:hover { border-color: rgba(255,255,255,0.3); }
                .conv-page .cta-block { text-align: center; padding: 1.5rem 0 0.5rem; }
                .conv-page .cta-button { display: inline-block; padding: 14px 32px; background: #00e87a; color: #080c12; border-radius: 999px; font-size: 1rem; font-weight: 600; text-decoration: none; transition: opacity 0.15s; }
                .conv-page .cta-button:hover { opacity: 0.85; }
                .conv-page .cta-sub { margin: 10px 0 0; font-size: 13px; color: #8fa3b8; }
                .conv-page .cta-sub a { color: #00e87a; }
                .conv-page h2 { font-size: clamp(1.2rem, 2.5vw, 1.6rem); font-weight: 600; margin: 0 0 0.75rem; letter-spacing: -0.01em; font-family: 'DM Sans', sans-serif; }
                .conv-page .section-lead { font-size: 1rem; color: #8fa3b8; margin: 0 0 1.5rem; max-width: 680px; line-height: 1.65; }
                .conv-page .what-you-get { margin-bottom: 3rem; }
                .conv-page .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
                .conv-page .feature-card { background: #0e1420; border-radius: 12px; padding: 1.25rem; border: 1px solid rgba(0,0,0,0.07); }
                .conv-page .feature-icon { font-size: 1.5rem; margin-bottom: 0.5rem; }
                .conv-page .feature-card h3 { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.4rem; }
                .conv-page .feature-card p { font-size: 0.88rem; color: #8fa3b8; margin: 0; line-height: 1.55; }
                .conv-page .example-table-section { margin-bottom: 3rem; }
                .conv-page .example-table-wrapper { overflow-x: auto; margin-bottom: 0.75rem; }
                .conv-page .example-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; min-width: 560px; }
                .conv-page .example-table th { text-align: left; font-size: 0.78rem; font-weight: 600; color: #8fa3b8; padding: 8px 12px; border-bottom: 1.5px solid rgba(255,255,255,0.08); background: #0e1420; text-transform: uppercase; letter-spacing: 0.04em; }
                .conv-page .example-table td { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); }
                .conv-page .example-table tr:last-child td { border-bottom: none; }
                .conv-page .income-cell { font-weight: 600; }
                .conv-page .price-cell { font-weight: 500; color: #00e87a; }
                .conv-page .pmi-cell { font-weight: 500; color: #ff8c42; }
                .conv-page .no-pmi { font-size: 0.82rem; color: #00e87a; }
                .conv-page .table-note { font-size: 0.8rem; color: #8fa3b8; margin: 0; line-height: 1.5; }
                .conv-page .table-note a { color: #00e87a; }
                .conv-page .how-it-works { margin-bottom: 3rem; }
                .conv-page .steps-list { padding-left: 1.25rem; margin: 0; }
                .conv-page .steps-list li { margin-bottom: 0.9rem; font-size: 0.95rem; line-height: 1.6; color: #8fa3b8; }
                .conv-page .steps-list strong { color: #f0f4ff; }
                .conv-page .author-section { background: #0e1420; border-radius: 12px; padding: 1.5rem; border: 1px solid rgba(0,0,0,0.07); margin-bottom: 3rem; }
                .conv-page .author-card { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 1rem; }
                .conv-page .author-avatar { width: 44px; height: 44px; border-radius: 50%; background: rgba(0,232,122,0.15); display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; color: #00e87a; flex-shrink: 0; }
                .conv-page .author-name { font-weight: 600; font-size: 0.95rem; margin-bottom: 2px; }
                .conv-page .author-cred { font-size: 0.82rem; color: #8fa3b8; margin-bottom: 0.4rem; }
                .conv-page .author-bio { font-size: 0.88rem; color: #8fa3b8; margin: 0; line-height: 1.55; }
                .conv-page .last-updated { font-size: 0.8rem; color: #8fa3b8; margin: 0 0 0.5rem; }
                .conv-page .disclaimer { font-size: 0.8rem; color: #8fa3b8; margin: 0; line-height: 1.55; }
                .conv-page .faq-section { margin-bottom: 3rem; }
                .conv-page .faq-list { display: flex; flex-direction: column; gap: 8px; }
                .conv-page .faq-item { border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; overflow: hidden; background: #0e1420; }
                .conv-page .faq-question { padding: 1rem 1.25rem; font-weight: 500; font-size: 0.95rem; cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; color: #f0f4ff; }
                .conv-page .faq-question::after { content: '+'; font-size: 1.2rem; color: #8fa3b8; }
                .conv-page details[open] .faq-question::after { content: '−'; }
                .conv-page .faq-answer { padding: 0.75rem 1.25rem 1rem; margin: 0; font-size: 0.9rem; color: #8fa3b8; line-height: 1.65; border-top: 1px solid rgba(255,255,255,0.06); }
                .conv-page .related-section { margin-bottom: 2rem; }
                .conv-page .related-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 1rem; }
                .conv-page .related-card { display: block; padding: 1.1rem 1.25rem; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; text-decoration: none; color: #f0f4ff; background: #0e1420; transition: border-color 0.15s, box-shadow 0.15s; }
                .conv-page .related-card:hover { border-color: rgba(0,232,122,0.4); box-shadow: 0 2px 12px rgba(34,197,94,0.08); }
                .conv-page .related-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 5px; }
                .conv-page .related-desc { font-size: 0.83rem; color: #8fa3b8; line-height: 1.5; }
                @media (max-width: 600px) { .conv-page { padding: 1.25rem 1rem 3rem; } .conv-page .trust-bar { gap: 6px; } .conv-page .trust-item { font-size: 12px; padding: 3px 10px; } .conv-page .calculator-embed { padding: 1.25rem; } .conv-page .features-grid { grid-template-columns: 1fr; } }
            `}</style>
        </>
    );
}
