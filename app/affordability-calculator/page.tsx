// app/affordability-calculator/page.tsx
// SEO landing page — /affordability-calculator
// Target keyword: "mortgage affordability calculator" (18,000/mo) + "how much house can I afford" (27,000/mo)
// KD: 40 | CPC: $12 | Audience: first-time buyers, research stage

import type { Metadata } from 'next';
import Link from 'next/link';

// ─────────────────────────────────────────────
// META — title tag + meta description optimized
// for click-through on the target SERP
// ─────────────────────────────────────────────
export const metadata: Metadata = {
    title: 'Mortgage Affordability Calculator — How Much House Can I Afford? | HomeRates.ai',
    description:
        'Find out exactly how much house you can afford in 2026. Enter your income and savings — get three real scenarios (FHA, 3% down, 20% down) with monthly payment, cash needed, and DTI in seconds.',
    keywords: [
        'mortgage affordability calculator',
        'how much house can I afford',
        'home affordability calculator 2026',
        'how much mortgage can I afford',
        'FHA affordability calculator',
        'home buying calculator',
        'mortgage payment calculator by income',
    ],
    openGraph: {
        title: 'How Much House Can I Afford? — Free Calculator | HomeRates.ai',
        description:
            'Get three real affordability scenarios in seconds. FHA, 3% down, 20% down — with live FRED rates, monthly payment breakdown, and savings gap.',
        url: 'https://chat.homerates.ai/affordability-calculator',
        siteName: 'HomeRates.ai',
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'How Much House Can I Afford? | HomeRates.ai',
        description:
            'Free mortgage affordability calculator. Three scenarios, live rates, monthly payment + cash needed.',
    },
    alternates: {
        canonical: 'https://chat.homerates.ai/affordability-calculator',
    },
};

// ─────────────────────────────────────────────
// JSON-LD SCHEMA — three types stacked:
// FAQPage → rich results (accordion in SERP)
// SoftwareApplication → signals interactive tool
// FinancialProduct → E-E-A-T for YMYL content
// ─────────────────────────────────────────────
const schemaFAQ = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
        {
            '@type': 'Question',
            name: 'How much house can I afford on a $80,000 salary?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'On an $80,000 salary with $30,000 saved, you can typically afford a home up to $285,000–$310,000 using FHA (3.5% down) or conventional 3% down financing at current 2026 rates. With 20% down and no existing debts, your qualifying range extends to roughly $340,000. These figures assume a 43% back-end DTI, 2026 FRED mortgage rate of ~6.1%, and standard property tax estimates. Use the HomeRates.ai affordability calculator above for a precise figure based on your actual income, savings, and debts.',
            },
        },
        {
            '@type': 'Question',
            name: 'How much house can I afford on a $100,000 salary?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'On a $100,000 annual income with $40,000 in savings and no other debts, you can typically qualify for a home up to $360,000–$390,000 with FHA or 3% down conventional financing. With 20% down, the range extends to $420,000+. Your exact number depends on your monthly debts (car payment, student loans), property tax rate in your area, and the current mortgage rate. Enter your real numbers above for a precise three-scenario breakdown.',
            },
        },
        {
            '@type': 'Question',
            name: 'What is the 28/36 rule for mortgage affordability?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'The 28/36 rule states that your monthly housing payment should not exceed 28% of your gross monthly income (front-end DTI), and your total monthly debt payments — including housing — should not exceed 36% of gross income (back-end DTI). In practice, conventional lenders allow up to 43% back-end DTI, FHA allows up to 50% with compensating factors, and some lenders go higher with strong credit or reserves. HomeRates.ai uses the 43% back-end DTI standard to calculate your maximum qualifying home price.',
            },
        },
        {
            '@type': 'Question',
            name: 'How much do I need saved to buy a house?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'The minimum saved depends on the loan type: FHA requires 3.5% down + ~3% closing costs (total ~6.5% of purchase price). Conventional 3% down requires 3% down + ~2.5% closing costs (total ~5.5%). Conventional 20% down requires 20% + ~2.5% closing costs (total ~22.5%). On a $350,000 home, that means roughly $22,750 minimum for FHA, $19,250 for conventional 3%, or $78,750 for 20% down. HomeRates.ai shows your exact cash needed and savings gap for each scenario.',
            },
        },
        {
            '@type': 'Question',
            name: 'Does my debt affect how much house I can afford?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Yes — significantly. Monthly debt payments (car loans, student loans, credit card minimums) reduce your qualifying home price dollar-for-dollar because they consume DTI headroom. A $400/month car payment on a $95,000 income can reduce your maximum home price by $50,000–$80,000 depending on rates and down payment. Use the HomeRates.ai calculator and enter your monthly debts to see the exact impact on your qualifying range.',
            },
        },
        {
            '@type': 'Question',
            name: 'Is FHA or conventional better for a first-time buyer?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'It depends on your credit score and savings. FHA is typically better if your credit score is below 680 or you have less than 5% saved, because it offers a lower down payment (3.5%), flexible credit requirements (580+), and allows gift funds for the entire down payment. Conventional 3% down is better if your credit is 700+ because you avoid FHA\'s MIP (which lasts the life of the loan with less than 10% down), and PMI on conventional loans automatically cancels when you reach 80% LTV. HomeRates.ai shows both side-by-side so you can compare the real total cost over 7 years.',
            },
        },
        {
            '@type': 'Question',
            name: 'How accurate is the HomeRates.ai affordability calculator?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'HomeRates.ai uses a deterministic calculation engine — the same inputs always produce the same output, with no AI guesswork in the math. It applies Fannie Mae 43% DTI guidelines, live FRED 30-year mortgage rate averages (updated weekly), FHA guidelines per HUD, and 2026 FHFA loan limits. Results match what a loan officer would calculate using the same inputs. The tool is for educational purposes only and is not a pre-approval or commitment to lend.',
            },
        },
    ],
};

const schemaSoftwareApp = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'HomeRates.ai Mortgage Affordability Calculator',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    url: 'https://chat.homerates.ai/affordability-calculator',
    description:
        'Free mortgage affordability calculator. Enter income and savings to instantly get three scenarios: FHA, 3% down conventional, and 20% down conventional — with monthly payment, cash needed, DTI analysis, and savings gap.',
    offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
    },
    author: {
        '@type': 'Person',
        name: 'Rayaan Arif',
        jobTitle: 'NMLS Licensed Loan Consultant',
        identifier: 'NMLS #366082',
    },
    featureList: [
        'Three affordability scenarios: FHA, Conventional 3%, Conventional 20%',
        'Live FRED mortgage rate data',
        'Monthly PITI payment breakdown',
        'Cash-to-close and savings gap calculation',
        'DTI analysis per Fannie Mae guidelines',
        'Debt impact on buying power',
        '2026 FHA and conforming loan limits',
    ],
};

const schemaBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'HomeRates.ai', item: 'https://chat.homerates.ai' },
        { '@type': 'ListItem', position: 2, name: 'Calculators', item: 'https://chat.homerates.ai/calculators' },
        { '@type': 'ListItem', position: 3, name: 'Affordability Calculator', item: 'https://chat.homerates.ai/affordability-calculator' },
    ],
};

// ─────────────────────────────────────────────
// INCOME EXAMPLES — used for long-tail cluster
// targeting + social proof in the UI
// ─────────────────────────────────────────────
const incomeExamples = [
    { income: '$75k', savings: '$25k', debts: 'none', fha: '$268k', conv: '$252k', conv20: '$294k' },
    { income: '$95k', savings: '$40k', debts: 'none', fha: '$339k', conv: '$319k', conv20: '$372k' },
    { income: '$120k', savings: '$50k', debts: '$400/mo', fha: '$381k', conv: '$358k', conv20: '$421k' },
    { income: '$150k', savings: '$80k', debts: 'none', fha: '$535k', conv: '$503k', conv20: '$587k' },
];

// ─────────────────────────────────────────────
// FAQ DATA — rendered as visible accordions on page
// AND injected into JSON-LD above for rich results
// ─────────────────────────────────────────────
const faqs = [
    {
        q: 'How much house can I afford on a $80,000 salary?',
        a: 'On $80,000/year with $30,000 saved, you typically qualify for $285,000–$310,000 using FHA or conventional 3% down at 2026 rates. With 20% down, your range extends to ~$340,000. Enter your exact income above for a precise three-scenario breakdown.',
    },
    {
        q: 'How much house can I afford on a $100,000 salary?',
        a: 'On $100,000/year with $40,000 saved and no other debts, you typically qualify for $360,000–$390,000 with FHA or 3% conventional, or $420,000+ with 20% down. Your monthly debts and property tax rate will move this number — enter them above for your real figure.',
    },
    {
        q: 'What is the 28/36 rule for mortgage affordability?',
        a: 'The 28/36 rule means your housing payment should be ≤28% of gross monthly income, and total debts ≤36%. In practice, conventional lenders allow up to 43% back-end DTI and FHA up to 50% with compensating factors. HomeRates.ai uses the 43% standard to calculate your maximum qualifying price.',
    },
    {
        q: 'How much do I need saved to buy a house?',
        a: 'Minimum cash needed: FHA requires ~6.5% of purchase price (3.5% down + 3% closing costs). Conventional 3% down requires ~5.5%. Conventional 20% down requires ~22.5%. On a $350,000 home: $22,750 for FHA, $19,250 for conventional 3%, or $78,750 for 20% down. The calculator shows your exact savings gap for each scenario.',
    },
    {
        q: 'Does my debt affect how much house I can afford?',
        a: 'Yes — significantly. A $400/month car payment on a $95,000 income can reduce your maximum home price by $50,000–$80,000. This is because monthly debts eat into your DTI allowance. Enter your monthly debts above to see the exact impact on your qualifying range.',
    },
    {
        q: 'Is FHA or conventional better for a first-time buyer?',
        a: 'FHA is typically better if your credit score is below 680 or you have less than 5% saved. Conventional 3% down is better if your credit is 700+ because PMI cancels automatically at 80% LTV, whereas FHA MIP lasts the life of the loan with less than 10% down. HomeRates.ai shows both side-by-side with real cost comparison.',
    },
    {
        q: 'How accurate is the HomeRates.ai affordability calculator?',
        a: 'HomeRates.ai uses a deterministic calc engine — same inputs always produce the same output. It applies Fannie Mae 43% DTI guidelines, live FRED rate data (updated weekly), FHA HUD guidelines, and 2026 FHFA loan limits. Results match what a loan officer would calculate. For educational purposes only — not a pre-approval.',
    },
];

// ─────────────────────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────────────────────
export default function AffordabilityCalculatorPage() {
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

            <main className="affordability-page">

                {/* ── BREADCRUMB ── */}
                <nav className="breadcrumb" aria-label="Breadcrumb">
                    <ol>
                        <li><Link href="/">HomeRates.ai</Link></li>
                        <li aria-hidden="true">›</li>
                        <li><Link href="/calculators">Calculators</Link></li>
                        <li aria-hidden="true">›</li>
                        <li aria-current="page">Affordability Calculator</li>
                    </ol>
                </nav>

                {/* ── HERO ── */}
                <section className="hero">
                    {/* H1 — exact match to primary keyword */}
                    <h1>Mortgage Affordability Calculator<br /><span className="hero-sub">How Much House Can I Afford in 2026?</span></h1>
                    <p className="hero-lead">
                        Enter your income and savings — get three real scenarios in seconds.
                        FHA, 3% down, and 20% down, with monthly payment, cash needed,
                        and DTI analysis. Powered by live FRED rate data.
                    </p>

                    {/* Trust signals */}
                    <div className="trust-bar">
                        <span className="trust-item">📡 Live FRED rates</span>
                        <span className="trust-item">✅ 2026 loan limits</span>
                        <span className="trust-item">🏦 Fannie Mae DTI guidelines</span>
                        <span className="trust-item">🔒 No login required</span>
                    </div>
                </section>

                {/* ── CALCULATOR EMBED ──
                    The actual HomeRates.ai chat interface, pre-seeded
                    with the affordability prompt. User gets a live result
                    immediately without typing anything.
                ── */}
                <section className="calculator-embed" id="calculator">
                    <div className="embed-header">
                        <h2>Your Affordability Analysis</h2>
                        <p>
                            Type your income and savings below — or click an example to
                            see a full three-scenario breakdown instantly.
                        </p>
                    </div>

                    {/* Quick-start seed chips */}
                    <div className="seed-chips">
                        <span className="seed-label">Try an example:</span>
                        <a href="/?sq=I+make+%2475k+and+have+%2425k+saved" className="seed-chip">
                            $75k income, $25k saved
                        </a>
                        <a href="/?sq=I+make+%2495k+and+have+%2440k+saved" className="seed-chip">
                            $95k income, $40k saved
                        </a>
                        <a href="/?sq=I+make+%24120k%2C+%2450k+saved%2C+%24400+car+payment" className="seed-chip">
                            $120k income, $400/mo car
                        </a>
                        <a href="/?sq=I+make+%24150k+and+have+%2480k+saved" className="seed-chip">
                            $150k income, $80k saved
                        </a>
                    </div>

                    {/* Iframe embed of the live calculator */}
                    <div className="chat-embed-wrapper">
                        <iframe
                            src="/?seed=affordability&embed=1"
                            title="HomeRates.ai Mortgage Affordability Calculator"
                            loading="lazy"
                            allow="clipboard-write"
                            className="chat-iframe"
                        />
                    </div>

                    <p className="embed-cta">
                        Want full session memory and saved scenarios?{' '}
                        <Link href="/sign-up">Create a free account →</Link>
                    </p>
                </section>

                {/* ── WHAT YOU GET ── */}
                <section className="what-you-get">
                    <h2>What the calculator shows you</h2>
                    <p className="section-lead">
                        Most affordability calculators give you one number. HomeRates.ai gives
                        you three real loan scenarios side-by-side, so you can see exactly
                        what each path costs — and which one you can actually close on today.
                    </p>
                    <div className="features-grid">
                        <div className="feature-card">
                            <div className="feature-icon">🏠</div>
                            <h3>Three real scenarios</h3>
                            <p>FHA 3.5% down, conventional 3% down, and conventional 20% down — with the exact home price you qualify for on each path.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">💰</div>
                            <h3>Full monthly payment</h3>
                            <p>Principal & interest, property taxes, insurance, PMI or FHA MIP — every component broken out so there are no payment surprises at closing.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">💵</div>
                            <h3>Cash needed to close</h3>
                            <p>Down payment + closing costs, compared against what you have saved. Shows your exact savings gap — or tells you you're ready today.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">📊</div>
                            <h3>DTI analysis</h3>
                            <p>Front-end and back-end debt-to-income ratio per Fannie Mae 43% guidelines. Shows exactly where you stand and what a loan officer will see.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">📡</div>
                            <h3>Live 2026 rates</h3>
                            <p>Pulls live 30-year average from FRED (Freddie Mac PMMS) weekly. Your payment estimate uses the actual current market rate, not a guess.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">💳</div>
                            <h3>Debt impact analysis</h3>
                            <p>Add your monthly car, student loan, or credit card payments — see exactly how much buying power they cost you and whether paying them off first makes sense.</p>
                        </div>
                    </div>
                </section>

                {/* ── INCOME EXAMPLE TABLE ──
                    Long-tail SEO: "how much house on $Xk salary"
                    Each row targets a specific income query
                ── */}
                <section className="example-table-section">
                    <h2>How much house can I afford? — by income</h2>
                    <p className="section-lead">
                        These are approximate qualifying ranges at current 2026 rates (~6.1% 30-year fixed)
                        using Fannie Mae 43% back-end DTI guidelines. Your actual number depends on
                        your savings, debts, and local property taxes — use the calculator above for
                        a precise figure.
                    </p>
                    <div className="example-table-wrapper">
                        <table className="example-table">
                            <thead>
                                <tr>
                                    <th>Annual income</th>
                                    <th>Savings</th>
                                    <th>Monthly debts</th>
                                    <th>FHA (3.5% down)</th>
                                    <th>Conv. 3% down</th>
                                    <th>Conv. 20% down</th>
                                </tr>
                            </thead>
                            <tbody>
                                {incomeExamples.map((ex, i) => (
                                    <tr key={i}>
                                        <td className="income-cell">{ex.income}</td>
                                        <td>{ex.savings}</td>
                                        <td>{ex.debts}</td>
                                        <td className="price-cell">{ex.fha}</td>
                                        <td className="price-cell">{ex.conv}</td>
                                        <td className="price-cell">{ex.conv20}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="table-note">
                        Estimates assume 2026 FRED 30-year rate, standard property tax (1.2%), and
                        homeowner insurance. Actual results may vary by county, credit score, and lender.
                        For educational purposes only.
                    </p>
                </section>

                {/* ── HOW IT WORKS ── */}
                <section className="how-it-works">
                    <h2>How HomeRates.ai calculates affordability</h2>
                    <p className="section-lead">
                        The calculation is deterministic — not AI-estimated. The same inputs always
                        produce the same output, using the same math a loan officer would use.
                    </p>
                    <ol className="steps-list">
                        <li>
                            <strong>Maximum qualifying payment</strong> — your gross monthly income × 43%
                            back-end DTI, minus your monthly debts. This is the most you can spend
                            on housing including taxes and insurance.
                        </li>
                        <li>
                            <strong>Maximum home price</strong> — solved backwards from the qualifying
                            payment using the current FRED 30-year rate, estimated tax (1.2%), and
                            insurance, for each down payment scenario.
                        </li>
                        <li>
                            <strong>Cash to close</strong> — down payment + closing cost estimate
                            (3% FHA, 2.5% conventional), compared against your savings input.
                        </li>
                        <li>
                            <strong>MIP and PMI</strong> — FHA MIP calculated per current HUD rates
                            (0.55%/yr on loan balance). PMI estimated at 0.5%/yr, with automatic
                            removal at 80% LTV flagged.
                        </li>
                        <li>
                            <strong>2026 loan limits</strong> — FHA floor ($524,225) and conforming
                            limits ($806,500 standard, up to $1,209,750 high-cost) applied per FHFA.
                        </li>
                    </ol>
                </section>

                {/* ── E-E-A-T / AUTHOR ──
                    Required for Google YMYL scoring on financial content.
                    NMLS number, credentials, and last updated date.
                ── */}
                <section className="author-section">
                    <div className="author-card">
                        <div className="author-avatar">RA</div>
                        <div className="author-info">
                            <div className="author-name">Rayaan Arif</div>
                            <div className="author-cred">NMLS #366082 · Licensed Loan Consultant</div>
                            <p className="author-bio">
                                HomeRates.ai was built to give consumers the same analysis that loan
                                officers use — without the sales pressure. Every calculation in this
                                tool reflects real agency guidelines and live market data.
                            </p>
                        </div>
                    </div>
                    <p className="last-updated">
                        Content last reviewed: March 2026 · Loan limits: 2026 FHFA ·
                        Rate data: FRED Freddie Mac PMMS (updated weekly)
                    </p>
                    <p className="disclaimer">
                        <strong>Educational purposes only.</strong> HomeRates.ai is not a lender,
                        broker, or mortgage advisor. Results are estimates based on your inputs and
                        current market data. Consult an NMLS-licensed loan officer for a formal
                        pre-approval. Equal Housing Opportunity.
                    </p>
                </section>

                {/* ── FAQ SECTION ──
                    Rendered visibly AND in JSON-LD above.
                    Visible FAQ = onpage content + time-on-page.
                    JSON-LD FAQ = rich results in SERP (accordion).
                ── */}
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

                {/* ── RELATED CALCULATORS ──
                    Internal linking — passes PageRank to other
                    SEO pages and keeps users in the tool
                ── */}
                <section className="related-section">
                    <h2>Related calculators</h2>
                    <div className="related-grid">
                        <Link href="/fha-calculator" className="related-card">
                            <div className="related-title">FHA Loan Calculator</div>
                            <div className="related-desc">Full FHA analysis — UFMIP, MIP duration, DTI qualification, and FHA vs conventional comparison.</div>
                        </Link>
                        <Link href="/dscr-calculator" className="related-card">
                            <div className="related-title">DSCR Calculator</div>
                            <div className="related-desc">Investment property cash flow, DSCR ratio, monthly PITIA, and amortization snapshot.</div>
                        </Link>
                        <Link href="/refinance-calculator" className="related-card">
                            <div className="related-title">Refinance Calculator</div>
                            <div className="related-desc">Breakeven analysis, monthly savings, and rate-watch trigger points for your refi decision.</div>
                        </Link>
                    </div>
                </section>

            </main>

            {/* ── INLINE STYLES ──
                Scoped to .affordability-page to avoid
                bleed into the main chat layout
            ── */}
            <style>{`
                .affordability-page {
                    max-width: 860px;
                    margin: 0 auto;
                    padding: 2rem 1.5rem 4rem;
                    font-family: var(--font-sans, system-ui, sans-serif);
                    color: var(--fg, #111827);
                    line-height: 1.6;
                }

                /* Breadcrumb */
                .breadcrumb ol {
                    display: flex; gap: 6px; list-style: none;
                    padding: 0; margin: 0 0 2rem; font-size: 13px;
                    color: var(--muted, #6b7280);
                }
                .breadcrumb a { color: inherit; text-decoration: none; }
                .breadcrumb a:hover { text-decoration: underline; }
                .breadcrumb li[aria-current] { color: var(--fg, #111827); font-weight: 500; }

                /* Hero */
                .hero { margin-bottom: 3rem; }
                h1 {
                    font-size: clamp(1.75rem, 4vw, 2.5rem);
                    font-weight: 700; line-height: 1.15;
                    margin: 0 0 1rem; letter-spacing: -0.02em;
                }
                .hero-sub {
                    display: block; font-size: clamp(1.1rem, 2.5vw, 1.5rem);
                    font-weight: 400; color: var(--muted, #6b7280);
                    margin-top: 0.25rem;
                }
                .hero-lead {
                    font-size: 1.1rem; max-width: 640px;
                    color: var(--muted2, #374151); margin: 0 0 1.25rem;
                }
                .trust-bar {
                    display: flex; flex-wrap: wrap; gap: 10px;
                    margin-top: 0.75rem;
                }
                .trust-item {
                    font-size: 13px; padding: 4px 12px;
                    background: rgba(0,0,0,0.04);
                    border-radius: 99px; border: 1px solid rgba(0,0,0,0.08);
                    color: var(--muted2, #374151);
                }

                /* Calculator embed */
                .calculator-embed {
                    background: var(--surface, #f9fafb);
                    border-radius: 16px; border: 1px solid rgba(0,0,0,0.08);
                    padding: 2rem; margin-bottom: 3rem;
                }
                .embed-header h2 { margin: 0 0 0.5rem; font-size: 1.35rem; }
                .embed-header p { margin: 0 0 1.25rem; color: var(--muted, #6b7280); font-size: 0.95rem; }
                .seed-chips {
                    display: flex; flex-wrap: wrap; gap: 8px;
                    align-items: center; margin-bottom: 1rem;
                }
                .seed-label { font-size: 13px; color: var(--muted, #6b7280); }
                .seed-chip {
                    font-size: 13px; padding: 5px 13px;
                    background: white; border-radius: 99px;
                    border: 1px solid rgba(0,0,0,0.12);
                    color: var(--fg, #111827); text-decoration: none;
                    transition: border-color 0.15s;
                }
                .seed-chip:hover { border-color: rgba(0,0,0,0.3); }
                .chat-embed-wrapper {
                    border-radius: 12px; overflow: hidden;
                    border: 1px solid rgba(0,0,0,0.08);
                    background: white; min-height: 480px;
                }
                .chat-iframe {
                    width: 100%; height: 480px; border: none; display: block;
                }
                .embed-cta {
                    margin: 1rem 0 0; font-size: 13px;
                    color: var(--muted, #6b7280); text-align: center;
                }
                .embed-cta a { color: var(--accent, #22c55e); }

                /* Sections */
                h2 {
                    font-size: clamp(1.2rem, 2.5vw, 1.6rem);
                    font-weight: 600; margin: 0 0 0.75rem;
                    letter-spacing: -0.01em;
                }
                .section-lead {
                    font-size: 1rem; color: var(--muted2, #374151);
                    margin: 0 0 1.5rem; max-width: 680px; line-height: 1.65;
                }

                /* Features grid */
                .what-you-get { margin-bottom: 3rem; }
                .features-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
                    gap: 14px;
                }
                .feature-card {
                    background: var(--surface, #f9fafb);
                    border-radius: 12px; padding: 1.25rem;
                    border: 1px solid rgba(0,0,0,0.07);
                }
                .feature-icon { font-size: 1.5rem; margin-bottom: 0.5rem; }
                .feature-card h3 { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.4rem; }
                .feature-card p { font-size: 0.88rem; color: var(--muted2, #374151); margin: 0; line-height: 1.55; }

                /* Example table */
                .example-table-section { margin-bottom: 3rem; }
                .example-table-wrapper { overflow-x: auto; margin-bottom: 0.75rem; }
                .example-table {
                    width: 100%; border-collapse: collapse;
                    font-size: 0.9rem; min-width: 560px;
                }
                .example-table th {
                    text-align: left; font-size: 0.78rem; font-weight: 600;
                    color: var(--muted, #6b7280); padding: 8px 12px;
                    border-bottom: 1.5px solid rgba(0,0,0,0.1);
                    background: var(--surface, #f9fafb);
                    text-transform: uppercase; letter-spacing: 0.04em;
                }
                .example-table td { padding: 10px 12px; border-bottom: 1px solid rgba(0,0,0,0.06); }
                .example-table tr:last-child td { border-bottom: none; }
                .income-cell { font-weight: 600; }
                .price-cell { font-weight: 500; color: var(--accent2, #059669); }
                .table-note { font-size: 0.8rem; color: var(--muted, #6b7280); margin: 0; line-height: 1.5; }

                /* How it works */
                .how-it-works { margin-bottom: 3rem; }
                .steps-list { padding-left: 1.25rem; margin: 0; }
                .steps-list li { margin-bottom: 0.9rem; font-size: 0.95rem; line-height: 1.6; color: var(--muted2, #374151); }
                .steps-list strong { color: var(--fg, #111827); }

                /* Author / E-E-A-T */
                .author-section {
                    background: var(--surface, #f9fafb);
                    border-radius: 12px; padding: 1.5rem;
                    border: 1px solid rgba(0,0,0,0.07);
                    margin-bottom: 3rem;
                }
                .author-card { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 1rem; }
                .author-avatar {
                    width: 44px; height: 44px; border-radius: 50%;
                    background: #dcfce7; display: flex;
                    align-items: center; justify-content: center;
                    font-weight: 600; font-size: 14px; color: #166534;
                    flex-shrink: 0;
                }
                .author-name { font-weight: 600; font-size: 0.95rem; margin-bottom: 2px; }
                .author-cred { font-size: 0.82rem; color: var(--muted, #6b7280); margin-bottom: 0.4rem; }
                .author-bio { font-size: 0.88rem; color: var(--muted2, #374151); margin: 0; line-height: 1.55; }
                .last-updated { font-size: 0.8rem; color: var(--muted, #6b7280); margin: 0 0 0.5rem; }
                .disclaimer { font-size: 0.8rem; color: var(--muted, #6b7280); margin: 0; line-height: 1.55; }

                /* FAQ */
                .faq-section { margin-bottom: 3rem; }
                .faq-list { display: flex; flex-direction: column; gap: 8px; }
                .faq-item {
                    border: 1px solid rgba(0,0,0,0.08);
                    border-radius: 10px; overflow: hidden;
                    background: white;
                }
                .faq-question {
                    padding: 1rem 1.25rem; font-weight: 500;
                    font-size: 0.95rem; cursor: pointer;
                    list-style: none; display: flex;
                    justify-content: space-between; align-items: center;
                    color: var(--fg, #111827);
                }
                .faq-question::after { content: '+'; font-size: 1.2rem; color: var(--muted, #6b7280); }
                details[open] .faq-question::after { content: '−'; }
                .faq-answer {
                    padding: 0 1.25rem 1rem; margin: 0;
                    font-size: 0.9rem; color: var(--muted2, #374151);
                    line-height: 1.65;
                    border-top: 1px solid rgba(0,0,0,0.06);
                    padding-top: 0.75rem;
                }

                /* Related */
                .related-section { margin-bottom: 2rem; }
                .related-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 12px; margin-top: 1rem;
                }
                .related-card {
                    display: block; padding: 1.1rem 1.25rem;
                    border: 1px solid rgba(0,0,0,0.1);
                    border-radius: 12px; text-decoration: none;
                    color: var(--fg, #111827); background: white;
                    transition: border-color 0.15s, box-shadow 0.15s;
                }
                .related-card:hover {
                    border-color: rgba(34,197,94,0.5);
                    box-shadow: 0 2px 12px rgba(34,197,94,0.08);
                }
                .related-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 5px; }
                .related-desc { font-size: 0.83rem; color: var(--muted, #6b7280); line-height: 1.5; }

                /* Responsive */
                @media (max-width: 600px) {
                    .affordability-page { padding: 1.25rem 1rem 3rem; }
                    .trust-bar { gap: 6px; }
                    .trust-item { font-size: 12px; padding: 3px 10px; }
                    .calculator-embed { padding: 1.25rem; }
                    .features-grid { grid-template-columns: 1fr; }
                    .chat-iframe { height: 400px; }
                }
            `}</style>
        </>
    );
}
