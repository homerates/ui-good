// app/va-calculator/page.tsx
// SEO landing page — /va-calculator
// Target keywords: "VA loan calculator", "VA entitlement calculator", "VA subsequent use calculator"

import type { Metadata } from 'next';
import Link from 'next/link';
import VAEntitlementCalc from '../components/VAEntitlementCalc';

// ─────────────────────────────────────────────
// META
// ─────────────────────────────────────────────
export const metadata: Metadata = {
    title: 'VA Loan Calculator 2026 — Entitlement, Funding Fee & Subsequent Use | HomeRates.ai',
    description:
        'Free VA loan calculator. Calculate your monthly payment, VA funding fee, and down payment required for subsequent use. Includes entitlement breakdown — how much is left, how much you need, and whether your loan is VA Jumbo.',
    keywords: [
        'VA loan calculator',
        'VA entitlement calculator',
        'VA subsequent use calculator',
        'VA loan calculator 2026',
        'VA funding fee calculator',
        'VA jumbo loan calculator',
        'VA down payment calculator',
        'VA loan with prior VA loan',
        'VA remaining entitlement',
    ],
    openGraph: {
        title: 'VA Loan & Entitlement Calculator 2026 | HomeRates.ai',
        description:
            'Monthly payment, funding fee, remaining entitlement, and down payment for first use and subsequent use. Built on 2026 VA circular 26-23-21 funding fee tables.',
        url: 'https://chat.homerates.ai/va-calculator',
        siteName: 'HomeRates.ai',
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'VA Loan Calculator 2026 | HomeRates.ai',
        description: 'Free VA entitlement and payment calculator. First use, subsequent use, VA Jumbo — all in one tool.',
    },
    alternates: {
        canonical: 'https://chat.homerates.ai/va-calculator',
    },
};

// ─────────────────────────────────────────────
// JSON-LD
// ─────────────────────────────────────────────
const schemaFAQ = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
        {
            '@type': 'Question',
            name: 'How does VA entitlement work for a second VA loan?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'VA entitlement is the amount the VA guarantees on your loan — 25% of the county conforming limit (e.g., $208,187 in a standard county, up to $312,625 in high-cost CA counties). When you use a VA loan, 25% of that loan amount is "charged" against your entitlement. For a second VA loan with an active first loan, the remaining entitlement determines whether you need a down payment: if the new loan exceeds 4x your remaining entitlement, you owe 25% of the difference as a down payment.',
            },
        },
        {
            '@type': 'Question',
            name: 'What is the VA funding fee for subsequent use in 2026?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'For subsequent use with less than 5% down, the VA funding fee is 3.3% (vs 2.15% for first use). With 5–9.99% down it drops to 1.5%, and with 10%+ down it is 1.25%. Service-connected disability rated veterans are exempt from the funding fee entirely. Source: VA Circular 26-23-21.',
            },
        },
        {
            '@type': 'Question',
            name: 'Can I use a VA loan if I still have an active VA mortgage?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Yes. Since the Blue Water Navy Veterans Act of 2019 (effective Jan 1, 2020), veterans with full entitlement have no VA loan limit. If you have an active VA loan, you have "partial entitlement" — you can still buy a second home with VA financing, but you may need a down payment if the new loan exceeds your remaining entitlement coverage. The entitlement from your first VA loan restores fully once you sell the home and pay off the loan, or via a one-time restoration.',
            },
        },
        {
            '@type': 'Question',
            name: 'What is a VA Jumbo loan?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'A VA Jumbo loan is any VA loan where the base loan amount exceeds the county\'s 2026 conforming limit ($832,750 in standard counties, up to $1,249,125 in high-cost CA counties). Veterans with full entitlement (restored or first use) can get VA Jumbo loans with $0 down — no county loan limit cap since Jan 2020. Veterans with reduced entitlement may owe a down payment calculated from their remaining entitlement shortfall.',
            },
        },
        {
            '@type': 'Question',
            name: 'How is the VA down payment calculated for subsequent use?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Down payment = max(0, (purchase price × 25%) − remaining entitlement). Example: $700k purchase in a standard county ($832,750 limit). Total entitlement = $208,187. Prior VA loan balance $400k → entitlement used = $100k → remaining = $108,187. Required guaranty = $175,000. Shortfall = $175,000 − $108,187 = $66,813 down payment (9.5% of purchase price).',
            },
        },
    ],
};

const schemaSoftwareApp = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'HomeRates.ai VA Loan & Entitlement Calculator',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    url: 'https://chat.homerates.ai/va-calculator',
    description:
        'VA loan payment calculator with entitlement tracking. Handles first use, subsequent use, partial entitlement, VA Jumbo, and funding fee exemptions. Uses 2026 VA funding fee tables.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    author: { '@type': 'Person', name: 'Rayaan Arif', jobTitle: 'Licensed Loan Consultant' },
    featureList: [
        'First use and subsequent use modes',
        'Remaining entitlement calculation (25% of county limit − 25% of prior balance)',
        'Down payment required for subsequent use',
        'VA funding fee by usage and down payment tier (VA Circular 26-23-21)',
        'VA Jumbo detection vs county conforming limit',
        '2026 county conforming limits (standard + high-cost)',
        'Monthly P&I, taxes, insurance, total PITI',
        'No PMI — VA benefit shown vs conventional',
    ],
};

const schemaBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'HomeRates.ai', item: 'https://chat.homerates.ai' },
        { '@type': 'ListItem', position: 2, name: 'Calculators', item: 'https://chat.homerates.ai/calculators' },
        { '@type': 'ListItem', position: 3, name: 'VA Loan Calculator', item: 'https://chat.homerates.ai/va-calculator' },
    ],
};

// ─────────────────────────────────────────────
// PAYMENT TABLE — first use, $0 down, 6.75%, 30yr
// ─────────────────────────────────────────────
const paymentTable = [
    { price: 300000, ff: 6450,  loan: 306450,  pi: 1987, taxIns: 469, total: 2456 },
    { price: 400000, ff: 8600,  loan: 408600,  pi: 2649, taxIns: 625, total: 3274 },
    { price: 500000, ff: 10750, loan: 510750,  pi: 3311, taxIns: 781, total: 4092 },
    { price: 600000, ff: 12900, loan: 612900,  pi: 3974, taxIns: 938, total: 4912 },
    { price: 700000, ff: 15050, loan: 715050,  pi: 4636, taxIns: 1094, total: 5730 },
    { price: 800000, ff: 17200, loan: 817200,  pi: 5298, taxIns: 1250, total: 6548 },
];

const faqs = [
    {
        q: 'How does VA entitlement work for a second VA loan?',
        a: 'VA entitlement is 25% of the county conforming limit — the amount the VA guarantees on your loan. When you use a VA loan, 25% of that balance is charged against your entitlement. To use VA again with an active first loan: remaining entitlement = total − used. If the new loan exceeds 4× remaining, the shortfall is your down payment (25% of the difference).',
    },
    {
        q: 'What is the VA funding fee for subsequent use in 2026?',
        a: '3.3% with less than 5% down (vs 2.15% first use). Drops to 1.5% with 5–9.99% down and 1.25% with 10%+. Service-connected disability veterans are fully exempt. Source: VA Circular 26-23-21.',
    },
    {
        q: 'Can I use a VA loan if I still have an active VA mortgage?',
        a: 'Yes. Since the Blue Water Navy Act (Jan 2020), there is no VA loan limit for full entitlement. With partial entitlement (active first VA loan), you can still buy — but a down payment may be needed based on remaining entitlement. Entitlement fully restores once the prior loan is paid off.',
    },
    {
        q: 'What is a VA Jumbo loan?',
        a: 'Any VA loan where the base loan exceeds the county 2026 conforming limit ($832,750 standard; up to $1,249,125 in high-cost CA counties). With full entitlement, $0 down on VA Jumbo is allowed. With partial entitlement, the down payment is calculated from the entitlement shortfall.',
    },
    {
        q: 'How is the VA down payment calculated for subsequent use?',
        a: 'Down payment = max(0, (price × 25%) − remaining entitlement). Example: $700k purchase, standard county. Total entitlement $208,187. Prior $400k VA loan → used $100k → remaining $108,187. Required = $175,000. Down payment = $175,000 − $108,187 = $66,813.',
    },
    {
        q: 'Does the VA entitlement restore after I sell my first home?',
        a: 'Yes — once the prior VA loan is paid in full and the property is sold (or in some cases just paid off), you can apply for entitlement restoration at VA.gov. You can also get a one-time restoration to buy a new primary residence even without selling. Veterans may also have two active VA loans simultaneously if both are primary residences and entitlement covers both.',
    },
];

// ─────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────
export default function VACalculatorPage() {
    const f$ = (n: number) => `$${n.toLocaleString()}`;

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaFAQ) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaSoftwareApp) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaBreadcrumb) }} />

            {/* ── NAV ── */}
            <nav className="calc-nav">
                <Link href="/" className="calc-nav-logo">
                    <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
                </Link>
                <Link href="/chat" className="calc-nav-cta">Try the AI →</Link>
            </nav>

            <main className="va-page">

                {/* ── BREADCRUMB ── */}
                <nav className="breadcrumb" aria-label="Breadcrumb">
                    <ol>
                        <li><Link href="/">HomeRates.ai</Link></li>
                        <li aria-hidden="true">›</li>
                        <li><Link href="/calculators">Calculators</Link></li>
                        <li aria-hidden="true">›</li>
                        <li aria-current="page">VA Loan Calculator</li>
                    </ol>
                </nav>

                {/* ── HERO ── */}
                <section className="hero">
                    <h1>VA Loan Calculator<br /><span className="hero-sub">Entitlement, Funding Fee & Subsequent Use — 2026</span></h1>
                    <p className="hero-lead">
                        Calculate your VA loan payment, remaining entitlement, and exact down payment required for subsequent use.
                        Handles first use, second VA loan, partial entitlement, and VA Jumbo — all in one tool.
                    </p>
                    <div className="trust-bar">
                        <span className="trust-item">✅ 2026 VA funding fee tables</span>
                        <span className="trust-item">🏦 Blue Water Navy Act (Jan 2020)</span>
                        <span className="trust-item">📍 County conforming limits</span>
                        <span className="trust-item">🔒 No login required</span>
                    </div>
                </section>

                {/* ── INTERACTIVE CALCULATOR ── */}
                <section className="calculator-embed" id="calculator">
                    <div className="embed-header">
                        <h2>VA Loan & Entitlement Calculator</h2>
                        <p>
                            Toggle between <strong>First Use</strong> (full entitlement, $0 down) and{' '}
                            <strong>Subsequent Use</strong> (enter your prior VA loan balance to see remaining
                            entitlement and required down payment).
                        </p>
                    </div>

                    <VAEntitlementCalc />

                    <div className="seed-chips" style={{ marginTop: 20 }}>
                        <span className="seed-label">Ask the AI instead:</span>
                        <a href="/chat?sq=VA+loan+on+a+%24650%2C000+home+%E2%80%94+first+use%2C+no+down+payment%2C+show+full+breakdown&from=%2Fva-calculator&fromLabel=VA+Calculator" className="seed-chip" target="_blank" rel="noopener noreferrer">
                            First use · $650k · $0 down
                        </a>
                        <a href="/chat?sq=I+still+have+a+VA+loan+with+a+%24400%2C000+balance.+I+want+to+buy+a+%24700%2C000+home+%E2%80%94+what+down+payment+do+I+need%3F&from=%2Fva-calculator&fromLabel=VA+Calculator" className="seed-chip" target="_blank" rel="noopener noreferrer">
                            Subsequent use · $700k · prior $400k
                        </a>
                        <a href="/chat?sq=VA+loan+on+a+%241%2C200%2C000+home+in+San+Luis+Obispo+%E2%80%94+is+this+VA+Jumbo%3F&from=%2Fva-calculator&fromLabel=VA+Calculator" className="seed-chip" target="_blank" rel="noopener noreferrer">
                            VA Jumbo · SLO · $1.2M
                        </a>
                        <a href="/chat?sq=VA+loan+second+use+%E2%80%94+prior+balance+%24350k%2C+buying+%24550k+home+in+California&from=%2Fva-calculator&fromLabel=VA+Calculator" className="seed-chip" target="_blank" rel="noopener noreferrer">
                            Subsequent use · CA · $550k
                        </a>
                    </div>
                </section>

                {/* ── PAYMENT TABLE ── */}
                <section className="data-table-section">
                    <h2>VA Loan Payments by Home Price — 2026</h2>
                    <p className="section-lead">
                        First use · $0 down · 6.75% rate · 30-year fixed · 2.15% funding fee rolled in.
                        Tax 1.2%/yr · Insurance 0.35%/yr. No PMI.
                    </p>
                    <div className="table-wrap">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Home Price</th>
                                    <th>Funding Fee (2.15%)</th>
                                    <th>Total Loan</th>
                                    <th>P&amp;I</th>
                                    <th>Tax + Ins</th>
                                    <th>Total PITI</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paymentTable.map(r => (
                                    <tr key={r.price}>
                                        <td>{f$(r.price)}</td>
                                        <td>{f$(r.ff)}</td>
                                        <td>{f$(r.loan)}</td>
                                        <td>{f$(r.pi)}/mo</td>
                                        <td>{f$(r.taxIns)}/mo</td>
                                        <td><strong>{f$(r.total)}/mo</strong></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* ── HOW IT WORKS ── */}
                <section className="what-you-get">
                    <h2>What this calculator covers</h2>
                    <p className="section-lead">
                        Most VA calculators only handle first use. This one handles both — including
                        the entitlement math that determines whether you need a down payment on your second VA purchase.
                    </p>
                    <div className="features-grid">
                        <div className="feature-card">
                            <div className="feature-icon">🏠</div>
                            <h3>First use — $0 down</h3>
                            <p>Full entitlement since Jan 2020 means no county loan limit and no required down payment. See exact payment with 2.15% funding fee rolled into your loan.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">🔁</div>
                            <h3>Subsequent use entitlement</h3>
                            <p>Enter your prior VA loan balance. See remaining entitlement, max loan at $0 down, and the exact dollar amount of down payment required for any purchase price.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">📍</div>
                            <h3>County conforming limits</h3>
                            <p>Adjust the county limit for high-cost areas. Standard counties: $832,750. High-cost CA (e.g. SLO, Santa Barbara, Marin): up to $1,249,125. Determines total entitlement and VA Jumbo status.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">💰</div>
                            <h3>Funding fee tiers</h3>
                            <p>Automatically applies the correct 2026 funding fee: 2.15% (first use, &lt;5% down), 3.3% (subsequent, &lt;5%), 1.5% (5%+), 1.25% (10%+), or exempt for disability.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">⚡</div>
                            <h3>VA Jumbo detection</h3>
                            <p>Flags when your loan exceeds the county limit — and explains how full entitlement still allows $0 down even on VA Jumbo loans under the Blue Water Navy Act.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">🤖</div>
                            <h3>Ask the AI instead</h3>
                            <p>Type your scenario in plain English — "I have a $400k VA balance and want to buy a $700k home in SLO" — and get a full entitlement breakdown with chips to explore scenarios.</p>
                        </div>
                    </div>
                </section>

                {/* ── CTA ── */}
                <section className="cta-section">
                    <h2>Want a full analysis with scenarios?</h2>
                    <p>The HomeRates.ai chat engine handles VA entitlement, subsequent use, county limits, and VA Jumbo in one conversation.</p>
                    <a href="/chat?sq=I+have+an+active+VA+loan+with+a+%24350%2C000+balance+and+want+to+buy+a+%24650%2C000+home+%E2%80%94+what+do+I+need+for+a+down+payment%3F&from=%2Fva-calculator&fromLabel=VA+Calculator" className="cta-button" target="_blank" rel="noopener noreferrer">
                        Calculate my VA entitlement →
                    </a>
                    <p className="cta-sub">Free · No login required · Results in seconds</p>
                </section>

                {/* ── FAQ ── */}
                <section className="faq-section">
                    <h2>VA Loan & Entitlement FAQ</h2>
                    <dl className="faq-list">
                        {faqs.map((item, i) => (
                            <div key={i} className="faq-item">
                                <dt>{item.q}</dt>
                                <dd>{item.a}</dd>
                            </div>
                        ))}
                    </dl>
                </section>

                {/* ── FOOTER ── */}
                <footer className="calc-footer">
                    <p>
                        <Link href="/calculators">All Calculators</Link> ·{' '}
                        <Link href="/chat">AI Chat</Link> ·{' '}
                        <Link href="/disclosures">Disclosures</Link>
                    </p>
                    <p className="calc-footer-disc">
                        Educational only — not a pre-approval or commitment to lend.
                        VA entitlement figures are estimates based on 2026 FHFA conforming limits and VA Circular 26-23-21 funding fee tables.
                        Actual entitlement, restoration eligibility, and funding fee exemptions must be verified through your VA Certificate of Eligibility (COE).
                        Consult a licensed mortgage professional for a loan estimate.
                    </p>
                </footer>

            </main>

            <style>{`
            body:has(.calc-nav){display:block!important;height:auto!important;overflow-y:auto!important;overflow-x:hidden!important;background:#f8fafc!important;}
            html:has(.calc-nav){height:auto!important;overflow-y:auto!important;overflow-x:hidden!important;}
            body:has(.calc-nav) .app-footer{display:none!important;}
            .va-page { max-width:860px; margin:0 auto; padding:0 20px 60px; font-family:system-ui,sans-serif; color:#1e293b; }
            .breadcrumb ol { display:flex; gap:6px; list-style:none; padding:16px 0 0; margin:0; font-size:.8rem; color:#64748b; }
            .breadcrumb a { color:#64748b; text-decoration:none; } .breadcrumb a:hover { color:#1e40af; }
            .hero { text-align:center; padding:40px 0 32px; }
            .hero h1 { font-size:clamp(1.6rem,4vw,2.4rem); font-weight:800; color:#0f172a; line-height:1.2; margin-bottom:16px; }
            .hero-sub { display:block; font-size:.65em; font-weight:600; color:#3b82f6; margin-top:4px; }
            .hero-lead { max-width:640px; margin:0 auto 20px; color:#475569; font-size:.95rem; line-height:1.6; }
            .trust-bar { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
            .trust-item { background:#f1f5f9; border:1px solid #e2e8f0; border-radius:20px; padding:4px 12px; font-size:.78rem; color:#475569; }
            .calculator-embed { background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:28px; margin:20px 0; }
            .embed-header h2 { font-size:1.15rem; font-weight:700; color:#0f172a; margin:0 0 6px; }
            .embed-header p { font-size:.85rem; color:#64748b; margin:0 0 20px; line-height:1.5; }
            .seed-chips { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
            .seed-label { font-size:.78rem; color:#94a3b8; }
            .seed-chip { background:#fff; border:1.5px solid #e2e8f0; border-radius:20px; padding:6px 14px; font-size:.8rem; color:#1e40af; text-decoration:none; transition:.15s; }
            .seed-chip:hover { border-color:#3b82f6; background:#eff6ff; }
            .data-table-section { margin:32px 0; }
            .data-table-section h2 { font-size:1.1rem; font-weight:700; color:#0f172a; margin-bottom:6px; }
            .section-lead { font-size:.85rem; color:#64748b; margin-bottom:16px; line-height:1.5; }
            .table-wrap { overflow-x:auto; }
            .data-table { width:100%; border-collapse:collapse; font-size:.85rem; }
            .data-table th { background:#f1f5f9; color:#475569; font-weight:600; padding:10px 12px; text-align:left; border-bottom:2px solid #e2e8f0; white-space:nowrap; }
            .data-table td { padding:9px 12px; border-bottom:1px solid #f1f5f9; color:#1e293b; }
            .data-table tr:hover td { background:#f8fafc; }
            .what-you-get { margin:32px 0; }
            .what-you-get h2 { font-size:1.1rem; font-weight:700; color:#0f172a; margin-bottom:6px; }
            .features-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px; margin-top:16px; }
            .feature-card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:18px; }
            .feature-icon { font-size:1.4rem; margin-bottom:8px; }
            .feature-card h3 { font-size:.9rem; font-weight:700; color:#0f172a; margin:0 0 6px; }
            .feature-card p { font-size:.82rem; color:#475569; margin:0; line-height:1.5; }
            .cta-section { background:#0f172a; border-radius:16px; padding:32px; text-align:center; margin:32px 0; color:#f1f5f9; }
            .cta-section h2 { font-size:1.2rem; font-weight:700; margin-bottom:8px; }
            .cta-section p { font-size:.88rem; color:#94a3b8; margin-bottom:20px; }
            .cta-button { display:inline-block; background:#3b82f6; color:#fff; padding:12px 28px; border-radius:10px; text-decoration:none; font-weight:700; font-size:.9rem; transition:.15s; }
            .cta-button:hover { background:#2563eb; }
            .cta-sub { font-size:.78rem; color:#64748b; margin-top:10px; }
            .faq-section { margin:32px 0; }
            .faq-section h2 { font-size:1.1rem; font-weight:700; color:#0f172a; margin-bottom:16px; }
            .faq-list { display:flex; flex-direction:column; gap:16px; }
            .faq-item { border:1px solid #e2e8f0; border-radius:10px; padding:16px; }
            .faq-item dt { font-weight:700; font-size:.9rem; color:#0f172a; margin-bottom:6px; }
            .faq-item dd { font-size:.85rem; color:#475569; margin:0; line-height:1.6; }
            .calc-footer { border-top:1px solid #e2e8f0; padding-top:20px; margin-top:32px; font-size:.78rem; color:#94a3b8; text-align:center; }
            .calc-footer a { color:#64748b; text-decoration:none; }
            .calc-footer-disc { margin-top:8px; max-width:700px; margin-left:auto; margin-right:auto; line-height:1.5; }
            `}</style>
        </>
    );
}
