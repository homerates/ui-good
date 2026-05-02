// app/refinance-calculator/page.tsx
// SEO landing page — /refinance-calculator
// Target keyword: "mortgage refinance calculator" (KD 32, 18k/mo)
// Structure mirrors /affordability-calculator, /fha-calculator, /dscr-calculator exactly

import type { Metadata } from 'next';
import Link from 'next/link';

// ─────────────────────────────────────────────
// META
// ─────────────────────────────────────────────
export const metadata: Metadata = {
    title: 'Mortgage Refinance Calculator 2026 — Breakeven, Savings & Rate Analysis | HomeRates.ai',
    description:
        'Calculate your refi breakeven, monthly savings, and trigger rate in 2026. Enter your balance and current rate — get a full analysis including no-cost refi, FHA-to-conventional, and rate-drop scenarios. Live FRED rates.',
    keywords: [
        'mortgage refinance calculator',
        'refinance calculator 2026',
        'refi breakeven calculator',
        'should i refinance calculator',
        'refinance savings calculator',
        'mortgage refi calculator',
        'fha to conventional refinance calculator',
    ],
    openGraph: {
        title: 'Mortgage Refinance Calculator 2026 — Breakeven & Savings | HomeRates.ai',
        description:
            'Should you refinance? Get breakeven months, monthly savings, trigger rate, and no-cost refi analysis. Live FRED rates. 2026 guidelines.',
        url: 'https://chat.homerates.ai/refinance-calculator',
        siteName: 'HomeRates.ai',
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Mortgage Refinance Calculator 2026 | HomeRates.ai',
        description: 'Refi breakeven, monthly savings, trigger rate, no-cost refi. Live FRED rates.',
    },
    alternates: {
        canonical: 'https://chat.homerates.ai/refinance-calculator',
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
            name: 'How do I calculate if refinancing is worth it?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Refinancing is worth it if the monthly savings exceed the closing costs before you plan to sell or pay off the home. The formula is: breakeven months = closing costs ÷ monthly savings. If you plan to stay longer than the breakeven period, refinancing saves money. Example: $8,000 in closing costs ÷ $200/month savings = 40 months (3.3 years) to break even. If you\'ll stay 5+ years, refinancing at that spread makes sense.',
            },
        },
        {
            '@type': 'Question',
            name: 'How much does refinancing save per month?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Monthly savings depend on your loan balance and rate drop. On a $400,000 balance, refinancing from 7.25% to 6.25% saves approximately $266/month. Refinancing from 7.25% to 6.75% saves $134/month. On a $500,000 balance, dropping from 7.0% to 6.5% saves about $166/month. Use the HomeRates.ai calculator to get your exact monthly savings based on your balance and target rate.',
            },
        },
        {
            '@type': 'Question',
            name: 'What are typical refinance closing costs in 2026?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Refinance closing costs typically run 1.5–2.5% of the loan balance. On a $400,000 loan that\'s $6,000–$10,000. Costs include lender origination fee (0–1%), appraisal ($500–$800), title insurance, and escrow fees. A no-cost refi rolls the closing costs into a slightly higher rate — typically 0.125–0.375% above the standard rate. HomeRates.ai shows whether no-cost or paying costs upfront is better for your timeline.',
            },
        },
        {
            '@type': 'Question',
            name: 'What is a good rate drop to justify refinancing?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'The old rule of thumb was "wait for 1% drop" but the real answer depends on your balance and how long you\'ll stay. A 0.5% rate drop on a $600,000 balance saves $199/month and breaks even in ~5 years. A 1.0% drop on the same balance saves $400+/month and breaks even in ~2.5 years. Smaller drops need longer timelines or no-cost refi to make sense. HomeRates.ai calculates your specific trigger rate for a 3-year breakeven.',
            },
        },
        {
            '@type': 'Question',
            name: 'Should I refinance from FHA to conventional?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'If you have 20% equity and a 680+ credit score, refinancing from FHA to conventional eliminates MIP — which costs 0.55%/yr on your loan balance for the life of the loan with under 10% down. On a $350,000 FHA loan, MIP costs about $160/month. Eliminating that plus getting a better rate can save $300+/month. HomeRates.ai models the FHA-to-conventional refi and shows the combined MIP + rate savings.',
            },
        },
        {
            '@type': 'Question',
            name: 'What is a no-cost refinance?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'A no-cost refinance uses lender credit to cover closing costs in exchange for a slightly higher interest rate — typically 0.125–0.375% above the standard rate. The benefit: zero upfront cash and immediate positive monthly savings from day one, with no breakeven risk. The tradeoff: you pay slightly more in interest over the life of the loan. No-cost refis make the most sense when you\'re unsure how long you\'ll stay, or when rates are likely to drop further.',
            },
        },
        {
            '@type': 'Question',
            name: 'How accurate is the HomeRates.ai refinance calculator?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'HomeRates.ai uses a deterministic calculation engine — same inputs always produce the same output. It computes actual amortization on your remaining balance, uses live FRED 30-year rate data, and models no-cost refi breakeven, FHA-to-conventional MIP savings, and rate-watch trigger points. For educational purposes only — not a commitment to lend.',
            },
        },
    ],
};

const schemaSoftwareApp = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'HomeRates.ai Mortgage Refinance Calculator',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    url: 'https://chat.homerates.ai/refinance-calculator',
    description:
        'Free mortgage refinance calculator. Enter your balance and rates to get breakeven months, monthly savings, trigger rate for 3-year breakeven, no-cost refi analysis, and FHA-to-conventional refi math.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    author: {
        '@type': 'Person',
        name: 'Rayaan Arif',
        jobTitle: 'Licensed Loan Consultant',
    },
    featureList: [
        'Breakeven months calculation',
        'Monthly P&I savings',
        'Trigger rate for 3-year breakeven',
        'No-cost refi vs paying costs upfront comparison',
        'FHA-to-conventional refi with MIP savings',
        'Rate-watch scenarios (wait 0.5% vs refi now)',
        'Live FRED 30-year mortgage rate data',
    ],
};

const schemaBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'HomeRates.ai', item: 'https://chat.homerates.ai' },
        { '@type': 'ListItem', position: 2, name: 'Calculators', item: 'https://chat.homerates.ai/calculators' },
        { '@type': 'ListItem', position: 3, name: 'Refinance Calculator', item: 'https://chat.homerates.ai/refinance-calculator' },
    ],
};

// ─────────────────────────────────────────────
// REFI SAVINGS TABLE — pre-computed
// Closing costs = 2% of balance
// ─────────────────────────────────────────────
const refiTable = [
    { balance: '$300k', from: '7.50%', to: '6.75%', save: '$152', costs: '$6,000', breakeven: '40 mo (3.3 yr)' },
    { balance: '$300k', from: '7.50%', to: '6.25%', save: '$250', costs: '$6,000', breakeven: '24 mo (2.0 yr)' },
    { balance: '$400k', from: '7.25%', to: '6.75%', save: '$134', costs: '$8,000', breakeven: '60 mo (5.0 yr)' },
    { balance: '$400k', from: '7.25%', to: '6.25%', save: '$266', costs: '$8,000', breakeven: '31 mo (2.6 yr)' },
    { balance: '$500k', from: '7.00%', to: '6.50%', save: '$166', costs: '$10,000', breakeven: '61 mo (5.1 yr)' },
    { balance: '$500k', from: '7.00%', to: '6.25%', save: '$248', costs: '$10,000', breakeven: '41 mo (3.4 yr)' },
    { balance: '$600k', from: '7.00%', to: '6.50%', save: '$199', costs: '$12,000', breakeven: '61 mo (5.1 yr)' },
];

// ─────────────────────────────────────────────
// VERDICT TABLE
// ─────────────────────────────────────────────
const verdictTable = [
    { breakeven: 'Under 24 months', verdict: '✅ Strong — refi now', notes: 'Savings far exceed costs. Pull the trigger.' },
    { breakeven: '24–36 months', verdict: '✅ Good — solid if staying 4+ years', notes: 'Worthwhile if you plan to stay.' },
    { breakeven: '37–48 months', verdict: '🟡 Marginal — depends on timeline', notes: 'Pencils if staying 5+ years; consider no-cost refi.' },
    { breakeven: '49–72 months', verdict: '🔴 Poor — wait for better rate', notes: 'Spread too thin. Calculate your trigger rate.' },
    { breakeven: 'Over 72 months', verdict: '⛔ Hold — not worth it', notes: 'No-cost refi only path that makes sense.' },
];

// ─────────────────────────────────────────────
// FAQ DATA
// ─────────────────────────────────────────────
const faqs = [
    {
        q: 'How do I calculate if refinancing is worth it?',
        a: 'Breakeven months = closing costs ÷ monthly savings. If you plan to stay longer than the breakeven, refinancing saves money. Example: $8,000 costs ÷ $200/month savings = 40 months. If you\'ll stay 5+ years, that refi makes sense. HomeRates.ai calculates your exact breakeven and compares it against your expected timeline.',
    },
    {
        q: 'How much does refinancing save per month?',
        a: 'On a $400k balance, 7.25% → 6.25% saves $266/month. 7.25% → 6.75% saves $134/month. On a $500k balance, 7.0% → 6.5% saves $166/month. The calculator shows your exact number — and how many months until you\'ve recovered the closing costs.',
    },
    {
        q: 'What are typical refinance closing costs in 2026?',
        a: '1.5–2.5% of loan balance. On $400k that\'s $6,000–$10,000. Includes origination (0–1%), appraisal (~$650), title insurance, and escrow. A no-cost refi rolls these into a slightly higher rate (typically +0.125–0.375%) — zero upfront cash, immediate monthly savings, no breakeven risk.',
    },
    {
        q: 'What rate drop is needed to justify refinancing?',
        a: 'The 1% rule of thumb is outdated. The real answer depends on your balance and timeline. A 0.5% drop on $600k breaks even in ~5 years. A 1.0% drop breaks even in ~2.5 years. HomeRates.ai calculates your specific trigger rate for a 3-year breakeven — the number to watch for.',
    },
    {
        q: 'Should I refinance from FHA to conventional?',
        a: 'If you have 20% equity and 680+ credit, yes — eliminating FHA MIP (0.55%/yr, life of loan with under 10% down) saves $160+/month on a $350k balance. Combined with a rate drop, FHA-to-conventional refi can save $300+/month. HomeRates.ai models the full MIP + rate savings in one calculation.',
    },
    {
        q: 'What is a no-cost refinance?',
        a: 'The lender covers closing costs in exchange for a slightly higher rate (+0.125–0.375%). Benefit: zero upfront cash, immediate savings from day one, no breakeven risk. Best when you\'re unsure how long you\'ll stay or expect rates to drop further. HomeRates.ai shows whether no-cost or paying upfront is better for your specific timeline.',
    },
    {
        q: 'How accurate is the HomeRates.ai refinance calculator?',
        a: 'Deterministic calculation engine — same inputs, same output. Computes actual amortization on your remaining balance, uses live FRED 30-year data, and models no-cost refi, FHA-to-conventional, and rate-watch scenarios. For educational purposes only — not a commitment to lend.',
    },
];

// ─────────────────────────────────────────────
// PAGE COMPONENT — Server Component
// ─────────────────────────────────────────────
export default function RefinanceCalculatorPage() {
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

            <main className="refi-page">

                {/* ── BREADCRUMB ── */}
                <nav className="breadcrumb" aria-label="Breadcrumb">
                    <ol>
                        <li><Link href="/">HomeRates.ai</Link></li>
                        <li aria-hidden="true">›</li>
                        <li><Link href="/calculators">Calculators</Link></li>
                        <li aria-hidden="true">›</li>
                        <li aria-current="page">Refinance Calculator</li>
                    </ol>
                </nav>

                {/* ── HERO ── */}
                <section className="hero">
                    <h1>Mortgage Refinance Calculator<br /><span className="hero-sub">Breakeven, Savings & Trigger Rate — 2026</span></h1>
                    <p className="hero-lead">
                        Enter your balance and current rate — get breakeven months, monthly savings,
                        your trigger rate for a 3-year payback, and a no-cost refi comparison.
                        Powered by live FRED rate data.
                    </p>
                    <div className="trust-bar">
                        <span className="trust-item">📡 Live FRED rates</span>
                        <span className="trust-item">✅ Actual amortization math</span>
                        <span className="trust-item">🏦 FHA-to-conv refi included</span>
                        <span className="trust-item">🔒 No login required</span>
                    </div>
                </section>

                {/* ── CALCULATOR EMBED ── */}
                <section className="calculator-embed" id="calculator">
                    <div className="embed-header">
                        <h2>Your Refinance Analysis</h2>
                        <p>
                            Click a scenario or describe your loan — get breakeven, monthly savings,
                            and a verdict on whether to refi now or wait.
                        </p>
                    </div>
                    <div className="seed-chips">
                        <span className="seed-label">Try an example:</span>
                        <a href="/?sq=I+have+a+%24400%2C000+mortgage+at+7.25%25+%E2%80%94+should+I+refinance+to+6.5%25%3F" className="seed-chip">
                            $400k at 7.25% → 6.5%
                        </a>
                        <a href="/?sq=I+have+a+%24500%2C000+mortgage+at+7%25+%E2%80%94+what+rate+do+I+need+to+refi+with+a+3-year+breakeven%3F" className="seed-chip">
                            $500k — what's my trigger rate?
                        </a>
                        <a href="/?sq=Should+I+do+a+no-cost+refi+on+my+%24450%2C000+mortgage+at+7%25+to+6.5%25%3F" className="seed-chip">
                            No-cost refi on $450k
                        </a>
                        <a href="/?sq=I+have+an+FHA+loan+at+%24350%2C000+and+7%25+%E2%80%94+should+I+refinance+to+conventional+to+eliminate+MIP%3F" className="seed-chip">
                            FHA → conventional refi
                        </a>
                    </div>
                    <div className="cta-block">
                        <a
                            href="/?sq=I+have+a+%24400%2C000+mortgage+at+7.25%25+with+25+years+remaining+%E2%80%94+should+I+refinance%3F+Show+me+breakeven%2C+monthly+savings%2C+and+trigger+rate."
                            className="cta-button"
                        >
                            Calculate my refi savings →
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
                    <h2>What the refinance calculator shows you</h2>
                    <p className="section-lead">
                        Most refi calculators show one number — monthly savings. HomeRates.ai shows the
                        full decision: breakeven, trigger rate, no-cost vs paying costs, and a clear
                        verdict on whether to act now or wait.
                    </p>
                    <div className="features-grid">
                        <div className="feature-card">
                            <div className="feature-icon">⏱️</div>
                            <h3>Breakeven analysis</h3>
                            <p>Closing costs divided by monthly savings — the month at which you've fully recovered the cost of refinancing. With a timeline comparison: "strong", "good", "marginal", or "hold".</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">🎯</div>
                            <h3>Trigger rate</h3>
                            <p>The exact rate you need to see for a 3-year breakeven on your specific balance and closing cost estimate. The number to watch for — not a guess.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">💸</div>
                            <h3>No-cost refi comparison</h3>
                            <p>Lender credit covers closing costs in exchange for a higher rate. HomeRates.ai shows whether no-cost or paying upfront wins on your timeline.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">🏠</div>
                            <h3>FHA-to-conventional</h3>
                            <p>Eliminates FHA MIP (0.55%/yr life of loan) plus gets a better rate. The combined MIP + interest savings often exceed a straight rate-and-term refi.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">📡</div>
                            <h3>Live rate data</h3>
                            <p>Pulls the live 30-year average from FRED (Freddie Mac PMMS) weekly. Your analysis uses the actual current market rate as the baseline.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">📊</div>
                            <h3>Wait vs refi now</h3>
                            <p>What if rates drop another 0.5%? Is it worth waiting? HomeRates.ai models both scenarios and shows the opportunity cost of waiting.</p>
                        </div>
                    </div>
                </section>

                {/* ── REFI SAVINGS TABLE ── */}
                <section className="example-table-section">
                    <h2>Refinance savings by balance and rate — 2026</h2>
                    <p className="section-lead">
                        Assumes 2% closing costs · 30-year refi · P&I savings only (taxes and insurance unchanged).
                    </p>
                    <div className="example-table-wrapper">
                        <table className="example-table">
                            <thead>
                                <tr>
                                    <th>Balance</th>
                                    <th>Rate Change</th>
                                    <th>Monthly Savings</th>
                                    <th>Est. Closing Costs</th>
                                    <th>Breakeven</th>
                                </tr>
                            </thead>
                            <tbody>
                                {refiTable.map((row, i) => (
                                    <tr key={i}>
                                        <td className="income-cell">{row.balance}</td>
                                        <td>{row.from} → {row.to}</td>
                                        <td className="price-cell">{row.save}/mo</td>
                                        <td>{row.costs}</td>
                                        <td>{row.breakeven}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="table-note">
                        Savings are P&I only. Actual closing costs vary by lender and state.
                        For educational purposes only.
                    </p>
                </section>

                {/* ── VERDICT TABLE ── */}
                <section className="example-table-section">
                    <h2>How to read your breakeven — the verdict guide</h2>
                    <p className="section-lead">
                        Once you know your breakeven months, use this to interpret the result.
                    </p>
                    <div className="example-table-wrapper">
                        <table className="example-table">
                            <thead>
                                <tr>
                                    <th>Breakeven Period</th>
                                    <th>Verdict</th>
                                    <th>What to do</th>
                                </tr>
                            </thead>
                            <tbody>
                                {verdictTable.map((row, i) => (
                                    <tr key={i}>
                                        <td className="income-cell">{row.breakeven}</td>
                                        <td>{row.verdict}</td>
                                        <td style={{ fontSize: '0.85rem', color: '#8fa3b8' }}>{row.notes}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="table-note">
                        <a href="/?sq=What+rate+do+I+need+for+a+3-year+breakeven+on+my+%24400%2C000+mortgage+at+7.25%25%3F">
                            Calculate your trigger rate in the calculator →
                        </a>
                    </p>
                </section>

                {/* ── HOW IT WORKS ── */}
                <section className="how-it-works">
                    <h2>How HomeRates.ai calculates your refi</h2>
                    <p className="section-lead">
                        The calculation is deterministic — not AI-estimated. The same inputs always
                        produce the same output, using actual amortization math on your remaining balance.
                    </p>
                    <ol className="steps-list">
                        <li>
                            <strong>Monthly savings calculated</strong> — P&I on your current balance
                            at your current rate minus P&I at the new rate. Both computed on a full
                            30-year amortization (or your remaining term if specified).
                        </li>
                        <li>
                            <strong>Breakeven computed</strong> — estimated closing costs (default 2%
                            of balance, adjustable) divided by monthly savings. The exact month at
                            which cumulative savings exceed costs.
                        </li>
                        <li>
                            <strong>Trigger rate calculated</strong> — works backwards from a
                            3-year breakeven target to find the exact rate you need. The number
                            to set a rate alert for.
                        </li>
                        <li>
                            <strong>No-cost refi modeled</strong> — adds the closing cost equivalent
                            as lender credit to the rate (typically +0.25%) and compares 10-year
                            total cost vs paying upfront.
                        </li>
                        <li>
                            <strong>FHA-to-conventional analyzed</strong> — if FHA, adds MIP savings
                            (0.55%/yr on remaining balance) to the rate savings for a combined
                            monthly benefit figure.
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
                                HomeRates.ai was built to give borrowers the same refi analysis
                                that loan officers run — including the trigger rate and no-cost
                                comparison that most calculators skip. Every number reflects
                                actual amortization math and live market data.
                            </p>
                        </div>
                    </div>
                    <p className="last-updated">
                        Content last reviewed: March 2026 · Rate data: FRED Freddie Mac PMMS (weekly) ·
                        Closing cost estimates: industry standard 1.5–2.5% of balance
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
                            <div className="related-desc">How much house can you afford? Three scenarios with monthly payment, cash needed, and DTI analysis.</div>
                        </Link>
                        <Link href="/fha-calculator" className="related-card">
                            <div className="related-title">FHA Loan Calculator</div>
                            <div className="related-desc">Full FHA payment — UFMIP, monthly MIP, MIP duration, and FHA vs conventional comparison.</div>
                        </Link>
                        <Link href="/dscr-calculator" className="related-card">
                            <div className="related-title">DSCR Calculator</div>
                            <div className="related-desc">Investment property cash flow, DSCR ratio, and lender qualification status.</div>
                        </Link>
                    </div>
                </section>

            </main>

            {/* ── INLINE STYLES — scoped to .refi-page ── */}
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

                .refi-page {
                    max-width: 860px; margin: 0 auto;
                    padding: 2rem 1.5rem 4rem;
                    font-family: var(--font-sans, system-ui, sans-serif);
                    color: #f0f4ff; line-height: 1.6;
                }
                .refi-page .breadcrumb ol { display: flex; gap: 6px; list-style: none; padding: 0; margin: 0 0 2rem; font-size: 13px; color: #8fa3b8; }
                .refi-page .breadcrumb a { color: inherit; text-decoration: none; }
                .refi-page .breadcrumb a:hover { text-decoration: underline; }
                .refi-page .breadcrumb li[aria-current] { color: #f0f4ff; font-weight: 500; }
                .refi-page .hero { margin-bottom: 3rem; }
                .refi-page h1 { font-size: clamp(1.75rem, 4vw, 2.5rem); font-weight: 700; line-height: 1.15; margin: 0 0 1rem; letter-spacing: -0.02em; font-family: 'DM Sans', sans-serif; }
                .refi-page .hero-sub { display: block; font-size: clamp(1.1rem, 2.5vw, 1.5rem); font-weight: 400; color: #8fa3b8; margin-top: 0.25rem; }
                .refi-page .hero-lead { font-size: 1.1rem; max-width: 640px; color: #8fa3b8; margin: 0 0 1.25rem; }
                .refi-page .trust-bar { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 0.75rem; }
                .refi-page .trust-item { font-size: 13px; padding: 4px 12px; background: rgba(255,255,255,0.05); border-radius: 99px; border: 1px solid rgba(255,255,255,0.07); color: #8fa3b8; }
                .refi-page .calculator-embed { background: #0e1420; border-radius: 16px; border: 1px solid rgba(255,255,255,0.07); padding: 2rem; margin-bottom: 3rem; }
                .refi-page .embed-header h2 { margin: 0 0 0.5rem; font-size: 1.35rem; }
                .refi-page .embed-header p { margin: 0 0 1.25rem; color: #8fa3b8; font-size: 0.95rem; }
                .refi-page .seed-chips { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 1rem; }
                .refi-page .seed-label { font-size: 13px; color: #8fa3b8; }
                .refi-page .seed-chip { font-size: 13px; padding: 5px 13px; background: #0e1420; border-radius: 99px; border: 1px solid rgba(255,255,255,0.10); color: #f0f4ff; text-decoration: none; transition: border-color 0.15s; }
                .refi-page .seed-chip:hover { border-color: rgba(255,255,255,0.3); }
                .refi-page .cta-block { text-align: center; padding: 1.5rem 0 0.5rem; }
                .refi-page .cta-button { display: inline-block; padding: 14px 32px; background: #00e87a; color: #080c12; border-radius: 999px; font-size: 1rem; font-weight: 600; text-decoration: none; transition: opacity 0.15s; }
                .refi-page .cta-button:hover { opacity: 0.85; }
                .refi-page .cta-sub { margin: 10px 0 0; font-size: 13px; color: #8fa3b8; }
                .refi-page .cta-sub a { color: #00e87a; }
                .refi-page h2 { font-size: clamp(1.2rem, 2.5vw, 1.6rem); font-weight: 600; margin: 0 0 0.75rem; letter-spacing: -0.01em; font-family: 'DM Sans', sans-serif; }
                .refi-page .section-lead { font-size: 1rem; color: #8fa3b8; margin: 0 0 1.5rem; max-width: 680px; line-height: 1.65; }
                .refi-page .what-you-get { margin-bottom: 3rem; }
                .refi-page .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
                .refi-page .feature-card { background: #0e1420; border-radius: 12px; padding: 1.25rem; border: 1px solid rgba(0,0,0,0.07); }
                .refi-page .feature-icon { font-size: 1.5rem; margin-bottom: 0.5rem; }
                .refi-page .feature-card h3 { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.4rem; }
                .refi-page .feature-card p { font-size: 0.88rem; color: #8fa3b8; margin: 0; line-height: 1.55; }
                .refi-page .example-table-section { margin-bottom: 3rem; }
                .refi-page .example-table-wrapper { overflow-x: auto; margin-bottom: 0.75rem; }
                .refi-page .example-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; min-width: 560px; }
                .refi-page .example-table th { text-align: left; font-size: 0.78rem; font-weight: 600; color: #8fa3b8; padding: 8px 12px; border-bottom: 1.5px solid rgba(255,255,255,0.08); background: #0e1420; text-transform: uppercase; letter-spacing: 0.04em; }
                .refi-page .example-table td { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); }
                .refi-page .example-table tr:last-child td { border-bottom: none; }
                .refi-page .income-cell { font-weight: 600; }
                .refi-page .price-cell { font-weight: 500; color: #00e87a; }
                .refi-page .table-note { font-size: 0.8rem; color: #8fa3b8; margin: 0; line-height: 1.5; }
                .refi-page .table-note a { color: #00e87a; }
                .refi-page .how-it-works { margin-bottom: 3rem; }
                .refi-page .steps-list { padding-left: 1.25rem; margin: 0; }
                .refi-page .steps-list li { margin-bottom: 0.9rem; font-size: 0.95rem; line-height: 1.6; color: #8fa3b8; }
                .refi-page .steps-list strong { color: #f0f4ff; }
                .refi-page .author-section { background: #0e1420; border-radius: 12px; padding: 1.5rem; border: 1px solid rgba(0,0,0,0.07); margin-bottom: 3rem; }
                .refi-page .author-card { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 1rem; }
                .refi-page .author-avatar { width: 44px; height: 44px; border-radius: 50%; background: rgba(0,232,122,0.15); display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; color: #00e87a; flex-shrink: 0; }
                .refi-page .author-name { font-weight: 600; font-size: 0.95rem; margin-bottom: 2px; }
                .refi-page .author-cred { font-size: 0.82rem; color: #8fa3b8; margin-bottom: 0.4rem; }
                .refi-page .author-bio { font-size: 0.88rem; color: #8fa3b8; margin: 0; line-height: 1.55; }
                .refi-page .last-updated { font-size: 0.8rem; color: #8fa3b8; margin: 0 0 0.5rem; }
                .refi-page .disclaimer { font-size: 0.8rem; color: #8fa3b8; margin: 0; line-height: 1.55; }
                .refi-page .faq-section { margin-bottom: 3rem; }
                .refi-page .faq-list { display: flex; flex-direction: column; gap: 8px; }
                .refi-page .faq-item { border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; overflow: hidden; background: #0e1420; }
                .refi-page .faq-question { padding: 1rem 1.25rem; font-weight: 500; font-size: 0.95rem; cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; color: #f0f4ff; }
                .refi-page .faq-question::after { content: '+'; font-size: 1.2rem; color: #8fa3b8; }
                .refi-page details[open] .faq-question::after { content: '−'; }
                .refi-page .faq-answer { padding: 0.75rem 1.25rem 1rem; margin: 0; font-size: 0.9rem; color: #8fa3b8; line-height: 1.65; border-top: 1px solid rgba(255,255,255,0.06); }
                .refi-page .related-section { margin-bottom: 2rem; }
                .refi-page .related-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 1rem; }
                .refi-page .related-card { display: block; padding: 1.1rem 1.25rem; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; text-decoration: none; color: #f0f4ff; background: #0e1420; transition: border-color 0.15s, box-shadow 0.15s; }
                .refi-page .related-card:hover { border-color: rgba(0,232,122,0.4); box-shadow: 0 2px 12px rgba(34,197,94,0.08); }
                .refi-page .related-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 5px; }
                .refi-page .related-desc { font-size: 0.83rem; color: #8fa3b8; line-height: 1.5; }
                @media (max-width: 600px) {
                    .refi-page { padding: 1.25rem 1rem 3rem; }
                    .refi-page .trust-bar { gap: 6px; }
                    .refi-page .trust-item { font-size: 12px; padding: 3px 10px; }
                    .refi-page .calculator-embed { padding: 1.25rem; }
                    .refi-page .features-grid { grid-template-columns: 1fr; }
                }
            `}</style>
        </>
    );
}
