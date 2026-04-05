// app/fha-calculator/page.tsx
// SEO landing page — /fha-calculator
// Target keyword: "fha loan calculator" (KD 36, 22k/mo)
// Structure mirrors /affordability-calculator exactly

import type { Metadata } from 'next';
import Link from 'next/link';

// ─────────────────────────────────────────────
// META — title tag + meta description
// ─────────────────────────────────────────────
export const metadata: Metadata = {
    title: 'FHA Loan Calculator 2026 — Payment, MIP & UFMIP Breakdown | HomeRates.ai',
    description:
        'Calculate your FHA loan payment in 2026. See monthly P&I, MIP (0.55%/yr), UFMIP (1.75%), property taxes, and total cost — plus FHA vs conventional comparison. Uses live FRED rates and 2026 HUD limits.',
    keywords: [
        'fha loan calculator',
        'fha mortgage calculator',
        'fha payment calculator 2026',
        'fha loan calculator with MIP',
        'fha vs conventional calculator',
        'fha loan limits 2026',
        'fha monthly payment calculator',
    ],
    openGraph: {
        title: 'FHA Loan Calculator 2026 — MIP, UFMIP & Full Payment Breakdown | HomeRates.ai',
        description:
            'See your exact FHA monthly payment including MIP, UFMIP, taxes, and insurance. FHA vs conventional comparison. Live FRED rates. 2026 HUD limits.',
        url: 'https://chat.homerates.ai/fha-calculator',
        siteName: 'HomeRates.ai',
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'FHA Loan Calculator 2026 | HomeRates.ai',
        description:
            'Free FHA calculator. Monthly payment, MIP breakdown, UFMIP, FHA vs conventional — 2026 HUD guidelines.',
    },
    alternates: {
        canonical: 'https://chat.homerates.ai/fha-calculator',
    },
};

// ─────────────────────────────────────────────
// JSON-LD SCHEMA — three types stacked:
// FAQPage → rich results (accordion in SERP)
// SoftwareApplication → signals interactive tool
// BreadcrumbList → SERP breadcrumb display
// ─────────────────────────────────────────────
const schemaFAQ = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
        {
            '@type': 'Question',
            name: 'What is an FHA loan calculator?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'An FHA loan calculator computes your full monthly payment on an FHA-insured mortgage, including principal & interest, monthly MIP (mortgage insurance premium at 0.55%/yr), property taxes, and homeowners insurance. It also shows the 1.75% upfront MIP (UFMIP) that gets financed into your loan — a cost most basic calculators omit. HomeRates.ai uses 2026 HUD guidelines and live FRED mortgage rate data for accurate results.',
            },
        },
        {
            '@type': 'Question',
            name: 'What is the minimum down payment for an FHA loan in 2026?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'The minimum down payment for an FHA loan is 3.5% of the purchase price for borrowers with a credit score of 580 or higher. For credit scores between 500 and 579, the minimum down payment increases to 10%. Scores below 500 are not eligible. On a $400,000 home, 3.5% down equals $14,000. Gift funds from family are allowed for 100% of the down payment.',
            },
        },
        {
            '@type': 'Question',
            name: 'How much is FHA mortgage insurance in 2026?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'FHA mortgage insurance has two components: (1) Upfront MIP (UFMIP) of 1.75% of the base loan amount, financed into your loan. (2) Annual MIP of 0.55%/yr billed monthly. On a $400,000 purchase with 3.5% down, UFMIP adds approximately $6,755 to your loan and annual MIP costs about $177/month. Source: HUD Mortgagee Letter 2023-05.',
            },
        },
        {
            '@type': 'Question',
            name: 'What are the FHA loan limits for 2026?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'For 2026, the FHA loan limit for a single-family home is $541,287 in standard counties (national floor) and up to $1,249,125 in high-cost areas like most of California, New York City, and Seattle. If your loan would exceed the limit for your county, you need a jumbo or conventional loan instead. Source: HUD Mortgagee Letter No. 25-145, effective January 1, 2026.',
            },
        },
        {
            '@type': 'Question',
            name: 'FHA vs conventional loan — which is better?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'FHA is better if your credit score is 580–679, you have less than 5% saved, or your DTI is above 43%. Conventional is better if your credit score is 680+ and you have 5%+ down — you pay lower mortgage insurance that cancels automatically at 80% equity, unlike FHA MIP which lasts the life of the loan if you put less than 10% down. HomeRates.ai shows both side-by-side with a 7-year cost comparison.',
            },
        },
        {
            '@type': 'Question',
            name: 'Can I remove FHA mortgage insurance (MIP)?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Yes — two ways. (1) Put 10% or more down: FHA MIP automatically cancels after 11 years. (2) Put less than 10% down: MIP lasts the life of the loan. The only exit is refinancing to conventional once you reach 20% equity — usually 5–8 years after purchase depending on appreciation. This is the most common reason borrowers refinance out of FHA.',
            },
        },
        {
            '@type': 'Question',
            name: 'How accurate is the HomeRates.ai FHA calculator?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'HomeRates.ai uses a deterministic calculation engine — the same inputs always produce the same output, with no AI guesswork in the math. It applies 2026 HUD FHA guidelines (Mortgagee Letter 2023-05 for MIP rates, HUD No. 25-145 for loan limits), live FRED 30-year mortgage rate averages updated weekly, and adds UFMIP to the loan balance before computing P&I — exactly as a loan officer would. For educational purposes only and not a commitment to lend.',
            },
        },
    ],
};

const schemaSoftwareApp = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'HomeRates.ai FHA Loan Calculator',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    url: 'https://chat.homerates.ai/fha-calculator',
    description:
        'Free FHA loan calculator. Enter home price and down payment to instantly get monthly payment with MIP breakdown, UFMIP, DTI analysis, FHA vs conventional comparison, and 2026 loan limit check.',
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
        'Full FHA monthly payment: P&I, MIP, taxes, insurance',
        'UFMIP (1.75%) added to loan before P&I calculation',
        'MIP duration logic: life of loan vs 11-year removal',
        'FHA vs conventional side-by-side comparison',
        'DTI analysis: front-end and back-end per HUD guidelines',
        'Income needed to qualify table',
        '2026 FHA loan limits per HUD No. 25-145',
        'Live FRED 30-year mortgage rate data',
    ],
};

const schemaBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'HomeRates.ai', item: 'https://chat.homerates.ai' },
        { '@type': 'ListItem', position: 2, name: 'Calculators', item: 'https://chat.homerates.ai/calculators' },
        { '@type': 'ListItem', position: 3, name: 'FHA Loan Calculator', item: 'https://chat.homerates.ai/fha-calculator' },
    ],
};

// ─────────────────────────────────────────────
// FHA PAYMENT TABLE — pre-computed
// 3.5% down · 6.75% rate · 30yr
// MIP 0.55%/yr · Taxes 1.1%/yr · Ins 0.35%/yr
// UFMIP (1.75% of base loan) financed into total loan
// ─────────────────────────────────────────────
const fhaPaymentTable = [
    { price: 250000, down: 8750, loan: 245472, pi: 1591, mip: 111, taxIns: 302, total: 2004 },
    { price: 300000, down: 10500, loan: 294566, pi: 1910, mip: 133, taxIns: 363, total: 2406 },
    { price: 350000, down: 12250, loan: 343661, pi: 2228, mip: 155, taxIns: 423, total: 2806 },
    { price: 400000, down: 14000, loan: 392755, pi: 2547, mip: 177, taxIns: 484, total: 3208 },
    { price: 450000, down: 15750, loan: 441849, pi: 2865, mip: 199, taxIns: 544, total: 3608 },
    { price: 500000, down: 17500, loan: 490944, pi: 3183, mip: 221, taxIns: 604, total: 4008 },
    { price: 550000, down: 19250, loan: 540038, pi: 3502, mip: 243, taxIns: 664, total: 4409 },
];

// ─────────────────────────────────────────────
// INCOME QUALIFICATION TABLE
// 43% back-end DTI · $500/mo existing debts
// ─────────────────────────────────────────────
const incomeTable = [
    { price: 250000, piti: 2004, inc43: '$62,942', inc50: '$54,096' },
    { price: 300000, piti: 2406, inc43: '$81,843', inc50: '$70,344' },
    { price: 350000, piti: 2806, inc43: '$96,000', inc50: '$82,344' },
    { price: 400000, piti: 3208, inc43: '$106,588', inc50: '$91,392' },
    { price: 450000, piti: 3608, inc43: '$119,693', inc50: '$102,792' },
    { price: 500000, piti: 4008, inc43: '$132,886', inc50: '$114,192' },
];

// ─────────────────────────────────────────────
// FAQ DATA — rendered visibly AND matched to JSON-LD
// ─────────────────────────────────────────────
const faqs = [
    {
        q: 'What is an FHA loan calculator?',
        a: 'An FHA loan calculator computes your full monthly payment including P&I, monthly MIP (0.55%/yr), property taxes, and homeowners insurance. It also shows the 1.75% upfront fee (UFMIP) financed into your loan — a detail most calculators omit. HomeRates.ai uses 2026 HUD guidelines and live FRED mortgage rate data.',
    },
    {
        q: 'What is the minimum down payment for an FHA loan in 2026?',
        a: '3.5% with a credit score of 580+. 10% for scores 500–579. Below 500 is ineligible. On a $400,000 home, 3.5% down = $14,000. Gift funds from family are allowed for 100% of the down payment — FHA is uniquely flexible on this.',
    },
    {
        q: 'How much is FHA mortgage insurance in 2026?',
        a: 'Two parts: (1) Upfront MIP (UFMIP) = 1.75% of base loan, financed into your mortgage. (2) Annual MIP = 0.55%/yr billed monthly. On a $400k purchase with 3.5% down, UFMIP adds ~$6,755 to your loan and annual MIP costs ~$177/month. Source: HUD Mortgagee Letter 2023-05.',
    },
    {
        q: 'What are the FHA loan limits for 2026?',
        a: 'Standard counties: $541,287 for a single-family home. High-cost areas (most of California, NYC, Seattle, etc.): up to $1,249,125. If your loan exceeds your county limit, you need a jumbo or conventional loan. Source: HUD No. 25-145, effective Jan 1, 2026.',
    },
    {
        q: 'FHA vs conventional loan — which is better?',
        a: 'FHA wins if: credit score is 580–679, down payment is under 5%, or DTI is above 43%. Conventional wins if: credit is 680+, down payment is 5%+, and you want PMI that cancels automatically at 80% LTV. Key difference: FHA MIP lasts the life of the loan with less than 10% down — conventional PMI does not.',
    },
    {
        q: 'Can I remove FHA mortgage insurance (MIP)?',
        a: 'Yes — two ways. (1) Put 10%+ down: MIP automatically cancels after 11 years. (2) Put less than 10% down: MIP lasts forever until you refinance to conventional. Once you hit 20% equity, refinancing to conventional eliminates MIP. Most borrowers do this 5–7 years after purchase.',
    },
    {
        q: 'How accurate is the HomeRates.ai FHA calculator?',
        a: 'HomeRates.ai uses a deterministic calculation engine — same inputs, same output, no AI guesswork. It adds UFMIP to the base loan before computing P&I, applies HUD 2023-05 MIP rates, checks 2026 loan limits, and uses live FRED 30-year averages. Results match what a loan officer would calculate. For educational purposes only — not a pre-approval.',
    },
];

// ─────────────────────────────────────────────
// PAGE COMPONENT — Server Component (no "use client")
// ─────────────────────────────────────────────
export default function FHACalculatorPage() {
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

            <main className="fha-page">

                {/* ── BREADCRUMB ── */}
                <nav className="breadcrumb" aria-label="Breadcrumb">
                    <ol>
                        <li><Link href="/">HomeRates.ai</Link></li>
                        <li aria-hidden="true">›</li>
                        <li><Link href="/calculators">Calculators</Link></li>
                        <li aria-hidden="true">›</li>
                        <li aria-current="page">FHA Loan Calculator</li>
                    </ol>
                </nav>

                {/* ── HERO ── */}
                <section className="hero">
                    <h1>FHA Loan Calculator<br /><span className="hero-sub">Monthly Payment, MIP & UFMIP Breakdown — 2026</span></h1>
                    <p className="hero-lead">
                        Enter your home price and down payment — get a full FHA payment breakdown in seconds.
                        Monthly MIP, UFMIP, DTI analysis, and FHA vs conventional comparison.
                        Powered by live FRED rate data and 2026 HUD guidelines.
                    </p>
                    <div className="trust-bar">
                        <span className="trust-item">📡 Live FRED rates</span>
                        <span className="trust-item">✅ 2026 HUD loan limits</span>
                        <span className="trust-item">🏦 HUD Mortgagee Letter 2023-05</span>
                        <span className="trust-item">🔒 No login required</span>
                    </div>
                </section>

                {/* ── CALCULATOR EMBED ── */}
                <section className="calculator-embed" id="calculator">
                    <div className="embed-header">
                        <h2>Your FHA Loan Analysis</h2>
                        <p>
                            Click a scenario below or type your home price to get a full FHA
                            payment breakdown — including MIP, UFMIP, and DTI qualification.
                        </p>
                    </div>

                    <div className="seed-chips">
                        <span className="seed-label">Try an example:</span>
                        <a href="/?sq=FHA+loan+on+a+%24350%2C000+home+with+3.5%25+down+at+current+rates" className="seed-chip">
                            $350k · 3.5% down
                        </a>
                        <a href="/?sq=FHA+loan+on+a+%24450%2C000+home+with+3.5%25+down+%E2%80%94+show+full+MIP+breakdown" className="seed-chip">
                            $450k · 3.5% down
                        </a>
                        <a href="/?sq=FHA+loan+on+a+%24600%2C000+home+with+10%25+down+%E2%80%94+does+MIP+cancel+after+11+years%3F" className="seed-chip">
                            $600k · 10% down
                        </a>
                        <a href="/?sq=Compare+FHA+3.5%25+down+vs+conventional+5%25+down+on+a+%24400%2C000+home" className="seed-chip">
                            FHA vs conventional
                        </a>
                    </div>

                    <div className="cta-block">
                        <a
                            href="/?sq=FHA+loan+on+a+%24450%2C000+home+with+3.5%25+down+%E2%80%94+show+me+the+full+payment+breakdown+including+MIP+and+UFMIP"
                            className="cta-button"
                        >
                            Calculate my FHA payment →
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
                    <h2>What the FHA calculator shows you</h2>
                    <p className="section-lead">
                        Most calculators understate your FHA payment because they skip the UFMIP.
                        HomeRates.ai adds the 1.75% upfront fee to your loan balance before
                        computing P&I — so you see the real number a loan officer would show you.
                    </p>
                    <div className="features-grid">
                        <div className="feature-card">
                            <div className="feature-icon">🏠</div>
                            <h3>Full monthly payment</h3>
                            <p>Principal & interest on the full financed amount (including UFMIP), monthly MIP, property taxes, and homeowners insurance — every component broken out.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">📋</div>
                            <h3>MIP duration logic</h3>
                            <p>Tells you whether MIP lasts the life of the loan (less than 10% down) or cancels after 11 years (10%+ down) — and what the total MIP cost is either way.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">⚖️</div>
                            <h3>FHA vs conventional</h3>
                            <p>Side-by-side on the same purchase price. See which is cheaper at closing, which is cheaper monthly, and when conventional's PMI cancellation tips the math.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">📊</div>
                            <h3>DTI analysis</h3>
                            <p>Front-end and back-end debt-to-income ratio per HUD FHA guidelines (31%/43% standard, up to 50% with compensating factors). Shows exactly where you stand.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">📡</div>
                            <h3>Live 2026 rates</h3>
                            <p>Pulls the live 30-year average from FRED (Freddie Mac PMMS) weekly. Your payment estimate uses the actual current market rate, not a static default.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">🗺️</div>
                            <h3>Loan limit check</h3>
                            <p>Checks your loan amount against 2026 FHA limits ($541,287 standard, up to $1,249,125 high-cost) and flags whether you're within range for your county.</p>
                        </div>
                    </div>
                </section>

                {/* ── FHA PAYMENT TABLE ── */}
                <section className="example-table-section">
                    <h2>FHA monthly payment by home price — 2026</h2>
                    <p className="section-lead">
                        Assumes 3.5% down · 6.75% rate · 30-year fixed · Annual MIP 0.55% · Taxes 1.1%/yr · Insurance 0.35%/yr.
                        UFMIP (1.75% of base loan) is financed into the total loan amount shown.
                    </p>
                    <div className="example-table-wrapper">
                        <table className="example-table">
                            <thead>
                                <tr>
                                    <th>Home Price</th>
                                    <th>Down (3.5%)</th>
                                    <th>Total Loan (w/ UFMIP)</th>
                                    <th>P&amp;I</th>
                                    <th>MIP/mo</th>
                                    <th>Tax + Ins</th>
                                    <th>Total/mo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {fhaPaymentTable.map((row, i) => (
                                    <tr key={i}>
                                        <td className="income-cell">{f$(row.price)}</td>
                                        <td>{f$(row.down)}</td>
                                        <td>{f$(row.loan)}</td>
                                        <td>{f$(row.pi)}</td>
                                        <td>{f$(row.mip)}</td>
                                        <td>{f$(row.taxIns)}</td>
                                        <td className="price-cell">{f$(row.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="table-note">
                        Actual payment varies by county tax rate, HOA, and lender fees.
                        For educational purposes only.
                    </p>
                </section>

                {/* ── FHA VS CONVENTIONAL TABLE ── */}
                <section className="example-table-section">
                    <h2>FHA vs conventional — side by side</h2>
                    <p className="section-lead">
                        $400,000 purchase price · FHA at 3.5% down vs conventional at 5% down · 6.75% rate · 30-year fixed.
                    </p>
                    <div className="example-table-wrapper">
                        <table className="example-table">
                            <thead>
                                <tr>
                                    <th>Feature</th>
                                    <th>FHA (3.5% down)</th>
                                    <th>Conventional (5% down)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    ['Down payment', '$14,000', '$20,000'],
                                    ['UFMIP / PMI upfront', '$6,755 financed', 'None'],
                                    ['Total loan amount', '$392,755', '$380,000'],
                                    ['P&I payment', '$2,547/mo', '$2,464/mo'],
                                    ['Mortgage insurance', '$177/mo (MIP)', '$158/mo (PMI)'],
                                    ['Insurance removes?', '11 yrs (10%+ down) or refi', 'Auto at 80% LTV (~yr 9)'],
                                    ['Min. credit score', '580', '620'],
                                    ['Max DTI (standard)', '43% (50% w/ factors)', '45% (50% w/ DU)'],
                                    ['Gift funds for down', '100% allowed', 'Primary/2nd home only'],
                                    ['Total monthly (PITI)', '$3,208/mo', '$3,089/mo'],
                                ].map(([feat, fha, conv], i) => (
                                    <tr key={i}>
                                        <td className="income-cell">{feat}</td>
                                        <td className="price-cell">{fha}</td>
                                        <td>{conv}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="table-note">
                        <a href="/?sq=Compare+FHA+3.5%25+down+vs+conventional+5%25+down+on+a+%24400%2C000+home+at+6.75%25">
                            Run this comparison in the calculator →
                        </a>
                    </p>
                </section>

                {/* ── INCOME QUALIFICATION TABLE ── */}
                <section className="example-table-section">
                    <h2>Income needed to qualify for an FHA loan</h2>
                    <p className="section-lead">
                        Based on FHA's 43% back-end DTI guideline · 3.5% down · 6.75% rate · $500/mo in existing debts.
                        50% DTI requires compensating factors per HUD guidelines.
                    </p>
                    <div className="example-table-wrapper">
                        <table className="example-table">
                            <thead>
                                <tr>
                                    <th>Home Price</th>
                                    <th>Total Monthly (PITI)</th>
                                    <th>Min. Income (43% DTI)</th>
                                    <th>Min. Income (50% DTI)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {incomeTable.map((row, i) => (
                                    <tr key={i}>
                                        <td className="income-cell">{f$(row.price)}</td>
                                        <td>{f$(row.piti)}/mo</td>
                                        <td className="price-cell">{row.inc43}/yr</td>
                                        <td>{row.inc50}/yr</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="table-note">
                        Estimates assume standard property tax (1.1%) and homeowners insurance (0.35%).
                        Actual qualification depends on credit score, lender overlay, and local tax rate.
                        For educational purposes only.
                    </p>
                </section>

                {/* ── HOW IT WORKS ── */}
                <section className="how-it-works">
                    <h2>How HomeRates.ai calculates your FHA payment</h2>
                    <p className="section-lead">
                        The calculation is deterministic — not AI-estimated. The same inputs always
                        produce the same output, using the same math a loan officer uses.
                    </p>
                    <ol className="steps-list">
                        <li>
                            <strong>UFMIP added to loan</strong> — 1.75% of the base loan amount is
                            financed into your mortgage. This increases your loan balance before P&I
                            is calculated — the step most online calculators skip.
                        </li>
                        <li>
                            <strong>P&I on full financed amount</strong> — monthly principal and interest
                            is computed on the total loan (base + UFMIP) at the current FRED 30-year rate.
                        </li>
                        <li>
                            <strong>Monthly MIP</strong> — annual MIP of 0.55% is applied to the base
                            loan balance and billed monthly per HUD Mortgagee Letter 2023-05.
                        </li>
                        <li>
                            <strong>MIP duration logic</strong> — if down payment is under 10%, MIP lasts
                            the life of the loan. If 10%+, MIP cancels after 11 years. The total cost
                            of each scenario is shown.
                        </li>
                        <li>
                            <strong>2026 loan limit check</strong> — loan amount is compared against
                            the 2026 FHA limit for your county ($541,287–$1,249,125) per HUD No. 25-145.
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
                                HomeRates.ai was built to give borrowers the same FHA analysis
                                that loan officers use — without the sales pressure. Every number
                                in this calculator reflects real HUD guidelines and live market data,
                                not rounded estimates or hidden assumptions.
                            </p>
                        </div>
                    </div>
                    <p className="last-updated">
                        Content last reviewed: March 2026 · FHA MIP rates: HUD ML 2023-05 ·
                        Loan limits: HUD No. 25-145 (2026) · Rate data: FRED Freddie Mac PMMS (weekly)
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
                        <Link href="/dscr-calculator" className="related-card">
                            <div className="related-title">DSCR Calculator</div>
                            <div className="related-desc">Investment property cash flow, DSCR ratio, monthly PITIA, and amortization snapshot for rental analysis.</div>
                        </Link>
                        <Link href="/refinance-calculator" className="related-card">
                            <div className="related-title">Refinance Calculator</div>
                            <div className="related-desc">Breakeven analysis, monthly savings, and rate-watch trigger points. Includes FHA-to-conventional refi math.</div>
                        </Link>
                    </div>
                </section>

            </main>

            {/* ── INLINE STYLES ──
                Scoped to .fha-page to avoid bleed into main chat layout.
                Mirrors .affordability-page styles exactly.
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

                .fha-page {
                    max-width: 860px;
                    margin: 0 auto;
                    padding: 2rem 1.5rem 4rem;
                    font-family: var(--font-sans, system-ui, sans-serif);
                    color: #f0f4ff;
                    line-height: 1.6;
                }

                /* Breadcrumb */
                .fha-page .breadcrumb ol {
                    display: flex; gap: 6px; list-style: none;
                    padding: 0; margin: 0 0 2rem; font-size: 13px;
                    color: #8fa3b8;
                }
                .fha-page .breadcrumb a { color: inherit; text-decoration: none; }
                .fha-page .breadcrumb a:hover { text-decoration: underline; }
                .fha-page .breadcrumb li[aria-current] { color: #f0f4ff; font-weight: 500; }

                /* Hero */
                .fha-page .hero { margin-bottom: 3rem; }
                .fha-page h1 {
                    font-size: clamp(1.75rem, 4vw, 2.5rem);
                    font-weight: 700; line-height: 1.15;
                    margin: 0 0 1rem; letter-spacing: -0.02em;
                    font-family: 'DM Sans', sans-serif;
                }
                .fha-page .hero-sub {
                    display: block; font-size: clamp(1.1rem, 2.5vw, 1.5rem);
                    font-weight: 400; color: #8fa3b8;
                    margin-top: 0.25rem;
                }
                .fha-page .hero-lead {
                    font-size: 1.1rem; max-width: 640px;
                    color: #8fa3b8; margin: 0 0 1.25rem;
                }
                .fha-page .trust-bar {
                    display: flex; flex-wrap: wrap; gap: 10px;
                    margin-top: 0.75rem;
                }
                .fha-page .trust-item {
                    font-size: 13px; padding: 4px 12px;
                    background: rgba(255,255,255,0.05);
                    border-radius: 99px; border: 1px solid rgba(255,255,255,0.07);
                    color: #8fa3b8;
                }

                /* Calculator embed */
                .fha-page .calculator-embed {
                    background: #0e1420;
                    border-radius: 16px; border: 1px solid rgba(255,255,255,0.07);
                    padding: 2rem; margin-bottom: 3rem;
                }
                .fha-page .embed-header h2 { margin: 0 0 0.5rem; font-size: 1.35rem; }
                .fha-page .embed-header p { margin: 0 0 1.25rem; color: #8fa3b8; font-size: 0.95rem; }
                .fha-page .seed-chips {
                    display: flex; flex-wrap: wrap; gap: 8px;
                    align-items: center; margin-bottom: 1rem;
                }
                .fha-page .seed-label { font-size: 13px; color: #8fa3b8; }
                .fha-page .seed-chip {
                    font-size: 13px; padding: 5px 13px;
                    background: #0e1420; border-radius: 99px;
                    border: 1px solid rgba(255,255,255,0.10);
                    color: #f0f4ff; text-decoration: none;
                    transition: border-color 0.15s;
                }
                .fha-page .seed-chip:hover { border-color: rgba(255,255,255,0.3); }
                .fha-page .cta-block {
                    text-align: center; padding: 1.5rem 0 0.5rem;
                }
                .fha-page .cta-button {
                    display: inline-block; padding: 14px 32px;
                    background: #00e87a; color: #080c12;
                    border-radius: 999px; font-size: 1rem;
                    font-weight: 600; text-decoration: none;
                    transition: opacity 0.15s;
                }
                .fha-page .cta-button:hover { opacity: 0.85; }
                .fha-page .cta-sub {
                    margin: 10px 0 0; font-size: 13px;
                    color: #8fa3b8;
                }
                .fha-page .cta-sub a { color: #00e87a; }

                /* Sections */
                .fha-page h2 {
                    font-size: clamp(1.2rem, 2.5vw, 1.6rem);
                    font-weight: 600; margin: 0 0 0.75rem;
                    letter-spacing: -0.01em;
                    font-family: 'DM Sans', sans-serif;
                }
                .fha-page .section-lead {
                    font-size: 1rem; color: #8fa3b8;
                    margin: 0 0 1.5rem; max-width: 680px; line-height: 1.65;
                }

                /* Features grid */
                .fha-page .what-you-get { margin-bottom: 3rem; }
                .fha-page .features-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
                    gap: 14px;
                }
                .fha-page .feature-card {
                    background: #0e1420;
                    border-radius: 12px; padding: 1.25rem;
                    border: 1px solid rgba(0,0,0,0.07);
                }
                .fha-page .feature-icon { font-size: 1.5rem; margin-bottom: 0.5rem; }
                .fha-page .feature-card h3 { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.4rem; }
                .fha-page .feature-card p { font-size: 0.88rem; color: #8fa3b8; margin: 0; line-height: 1.55; }

                /* Tables */
                .fha-page .example-table-section { margin-bottom: 3rem; }
                .fha-page .example-table-wrapper { overflow-x: auto; margin-bottom: 0.75rem; }
                .fha-page .example-table {
                    width: 100%; border-collapse: collapse;
                    font-size: 0.9rem; min-width: 560px;
                }
                .fha-page .example-table th {
                    text-align: left; font-size: 0.78rem; font-weight: 600;
                    color: #8fa3b8; padding: 8px 12px;
                    border-bottom: 1.5px solid rgba(255,255,255,0.08);
                    background: #0e1420;
                    text-transform: uppercase; letter-spacing: 0.04em;
                }
                .fha-page .example-table td { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); }
                .fha-page .example-table tr:last-child td { border-bottom: none; }
                .fha-page .income-cell { font-weight: 600; }
                .fha-page .price-cell { font-weight: 500; color: #00e87a; }
                .fha-page .table-note { font-size: 0.8rem; color: #8fa3b8; margin: 0; line-height: 1.5; }
                .fha-page .table-note a { color: #00e87a; }

                /* How it works */
                .fha-page .how-it-works { margin-bottom: 3rem; }
                .fha-page .steps-list { padding-left: 1.25rem; margin: 0; }
                .fha-page .steps-list li { margin-bottom: 0.9rem; font-size: 0.95rem; line-height: 1.6; color: #8fa3b8; }
                .fha-page .steps-list strong { color: #f0f4ff; }

                /* Author / E-E-A-T */
                .fha-page .author-section {
                    background: #0e1420;
                    border-radius: 12px; padding: 1.5rem;
                    border: 1px solid rgba(0,0,0,0.07);
                    margin-bottom: 3rem;
                }
                .fha-page .author-card { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 1rem; }
                .fha-page .author-avatar {
                    width: 44px; height: 44px; border-radius: 50%;
                    background: rgba(0,232,122,0.15); display: flex;
                    align-items: center; justify-content: center;
                    font-weight: 600; font-size: 14px; color: #00e87a;
                    flex-shrink: 0;
                }
                .fha-page .author-name { font-weight: 600; font-size: 0.95rem; margin-bottom: 2px; }
                .fha-page .author-cred { font-size: 0.82rem; color: #8fa3b8; margin-bottom: 0.4rem; }
                .fha-page .author-bio { font-size: 0.88rem; color: #8fa3b8; margin: 0; line-height: 1.55; }
                .fha-page .last-updated { font-size: 0.8rem; color: #8fa3b8; margin: 0 0 0.5rem; }
                .fha-page .disclaimer { font-size: 0.8rem; color: #8fa3b8; margin: 0; line-height: 1.55; }

                /* FAQ */
                .fha-page .faq-section { margin-bottom: 3rem; }
                .fha-page .faq-list { display: flex; flex-direction: column; gap: 8px; }
                .fha-page .faq-item {
                    border: 1px solid rgba(255,255,255,0.07);
                    border-radius: 10px; overflow: hidden;
                    background: #0e1420;
                }
                .fha-page .faq-question {
                    padding: 1rem 1.25rem; font-weight: 500;
                    font-size: 0.95rem; cursor: pointer;
                    list-style: none; display: flex;
                    justify-content: space-between; align-items: center;
                    color: #f0f4ff;
                }
                .fha-page .faq-question::after { content: '+'; font-size: 1.2rem; color: #8fa3b8; }
                .fha-page details[open] .faq-question::after { content: '−'; }
                .fha-page .faq-answer {
                    padding: 0.75rem 1.25rem 1rem; margin: 0;
                    font-size: 0.9rem; color: #8fa3b8;
                    line-height: 1.65;
                    border-top: 1px solid rgba(255,255,255,0.06);
                }

                /* Related */
                .fha-page .related-section { margin-bottom: 2rem; }
                .fha-page .related-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 12px; margin-top: 1rem;
                }
                .fha-page .related-card {
                    display: block; padding: 1.1rem 1.25rem;
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 12px; text-decoration: none;
                    color: #f0f4ff; background: #0e1420;
                    transition: border-color 0.15s, box-shadow 0.15s;
                }
                .fha-page .related-card:hover {
                    border-color: rgba(0,232,122,0.4);
                    box-shadow: 0 2px 12px rgba(34,197,94,0.08);
                }
                .fha-page .related-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 5px; }
                .fha-page .related-desc { font-size: 0.83rem; color: #8fa3b8; line-height: 1.5; }

                /* Responsive */
                @media (max-width: 600px) {
                    .fha-page { padding: 1.25rem 1rem 3rem; }
                    .fha-page .trust-bar { gap: 6px; }
                    .fha-page .trust-item { font-size: 12px; padding: 3px 10px; }
                    .fha-page .calculator-embed { padding: 1.25rem; }
                    .fha-page .features-grid { grid-template-columns: 1fr; }
                }
            `}</style>
        </>
    );
}
