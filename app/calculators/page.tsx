// app/calculators/page.tsx
// Hub page — fixes 404 on /calculators route referenced in breadcrumbs
// across /affordability-calculator, /fha-calculator, /dscr-calculator

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Mortgage Calculators 2026 — FHA, DSCR, Affordability & Refi | HomeRates.ai',
    description:
        'Free mortgage calculators for 2026. FHA loan calculator, DSCR rental property calculator, affordability calculator, and refinance calculator. Live FRED rates, 2026 HUD and FHFA limits.',
    openGraph: {
        title: 'Mortgage Calculators 2026 | HomeRates.ai',
        description: 'FHA, DSCR, affordability, and refinance calculators. Live rates. 2026 guidelines.',
        url: 'https://chat.homerates.ai/calculators',
        siteName: 'HomeRates.ai',
        type: 'website',
    },
    alternates: {
        canonical: 'https://chat.homerates.ai/calculators',
    },
};

const schemaBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'HomeRates.ai', item: 'https://chat.homerates.ai' },
        { '@type': 'ListItem', position: 2, name: 'Calculators', item: 'https://chat.homerates.ai/calculators' },
    ],
};

const calculators = [
    {
        href: '/affordability-calculator',
        icon: '🏠',
        title: 'Affordability Calculator',
        desc: 'How much house can you afford? Enter your income and savings — get three real scenarios (FHA, 3% down, 20% down) with monthly payment, cash needed, and DTI analysis.',
        tags: ['First-time buyers', 'Income-based', 'FHA + Conventional'],
    },
    {
        href: '/fha-calculator',
        icon: '📋',
        title: 'FHA Loan Calculator',
        desc: 'Full FHA payment breakdown including UFMIP (1.75%), monthly MIP (0.55%/yr), property taxes, and insurance. MIP duration logic and FHA vs conventional comparison.',
        tags: ['2026 HUD limits', 'MIP breakdown', 'FHA vs Conv'],
    },
    {
        href: '/dscr-calculator',
        icon: '📐',
        title: 'DSCR Calculator',
        desc: 'Rental property cash flow and debt service coverage ratio. Full PITIA breakdown, lender qualification status, and cash-on-cash return. No income docs required.',
        tags: ['Investment property', 'No income docs', 'Non-QM'],
    },
    {
        href: '/refinance-calculator',
        icon: '🔁',
        title: 'Refinance Calculator',
        desc: 'Breakeven analysis, monthly savings, and rate-watch trigger points for your refi decision. Includes FHA-to-conventional refi math and no-cost refi comparison.',
        tags: ['Breakeven analysis', 'Rate triggers', 'FHA-to-Conv refi'],
    },
    {
        href: '/conventional-loan-calculator',
        icon: '🏡',
        title: 'Conventional Loan Calculator',
        desc: 'Full conventional payment with PMI, exact PMI cancellation year, DTI analysis, and FHA vs conventional comparison. 2026 FHFA limits.',
        tags: ['PMI cancellation', 'DTI analysis', 'Fannie Mae'],
    },
];

const incomePages = [
    { href: '/how-much-house-can-i-afford-on-80k-salary', label: '$80k salary' },
    { href: '/how-much-house-can-i-afford-on-95k-salary', label: '$95k salary' },
    { href: '/how-much-house-can-i-afford-on-100k-salary', label: '$100k salary' },
    { href: '/how-much-house-can-i-afford-on-120k-salary', label: '$120k salary' },
    { href: '/how-much-house-can-i-afford-on-150k-salary', label: '$150k salary' },
];

export default function CalculatorsPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaBreadcrumb) }}
            />

            <main className="calculators-page">

                <nav className="breadcrumb" aria-label="Breadcrumb">
                    <ol>
                        <li><Link href="/">HomeRates.ai</Link></li>
                        <li aria-hidden="true">›</li>
                        <li aria-current="page">Calculators</li>
                    </ol>
                </nav>

                <section className="hero">
                    <h1>Mortgage Calculators</h1>
                    <p className="hero-lead">
                        Free mortgage calculators built on 2026 HUD and FHFA guidelines,
                        live FRED rate data, and deterministic math — no AI guesswork in the numbers.
                        Built by Rayaan Arif, NMLS #366082.
                    </p>
                </section>

                <section className="calc-grid-section">
                    <div className="calc-grid">
                        {calculators.map((calc) => (
                            <Link key={calc.href} href={calc.href} className="calc-card">
                                <div className="calc-icon">{calc.icon}</div>
                                <div className="calc-title">{calc.title}</div>
                                <div className="calc-desc">{calc.desc}</div>
                                <div className="calc-tags">
                                    {calc.tags.map((tag) => (
                                        <span key={tag} className="calc-tag">{tag}</span>
                                    ))}
                                </div>
                                <div className="calc-cta">Open calculator →</div>
                            </Link>
                        ))}
                    </div>
                </section>

                <section className="income-section">
                    <h2>Affordability by salary</h2>
                    <p className="section-lead">
                        See how much house you can afford at specific income levels — with real payment
                        breakdowns, debt impact analysis, and savings requirements.
                    </p>
                    <div className="income-grid">
                        {incomePages.map((page) => (
                            <Link key={page.href} href={page.href} className="income-card">
                                {page.label}
                            </Link>
                        ))}
                    </div>
                </section>

                <section className="about-section">
                    <h2>How these calculators work</h2>
                    <p>
                        Every calculator on HomeRates.ai uses a deterministic calculation engine —
                        the same inputs always produce the same output, with no AI estimation in the math.
                        Results match what a licensed loan officer would calculate using the same inputs.
                    </p>
                    <p>
                        Rate data is pulled live from FRED (Freddie Mac PMMS, updated weekly).
                        Loan limits reflect 2026 FHFA conforming limits and 2026 HUD FHA limits
                        per HUD Mortgagee Letter No. 25-145.
                    </p>
                    <p className="disclaimer">
                        <strong>Educational purposes only.</strong> HomeRates.ai is not a lender,
                        broker, or mortgage advisor. Results are estimates based on your inputs.
                        Consult an NMLS-licensed loan officer for a formal pre-approval.
                        Equal Housing Opportunity. NMLS #366082.
                    </p>
                </section>

            </main>

            <style>{`
                .calculators-page {
                    max-width: 860px; margin: 0 auto;
                    padding: 2rem 1.5rem 4rem;
                    font-family: var(--font-sans, system-ui, sans-serif);
                    color: var(--fg, #111827); line-height: 1.6;
                }
                .calculators-page .breadcrumb ol {
                    display: flex; gap: 6px; list-style: none;
                    padding: 0; margin: 0 0 2rem; font-size: 13px;
                    color: var(--muted, #6b7280);
                }
                .calculators-page .breadcrumb a { color: inherit; text-decoration: none; }
                .calculators-page .breadcrumb a:hover { text-decoration: underline; }
                .calculators-page .breadcrumb li[aria-current] { color: var(--fg, #111827); font-weight: 500; }
                .calculators-page .hero { margin-bottom: 3rem; }
                .calculators-page h1 {
                    font-size: clamp(1.75rem, 4vw, 2.5rem);
                    font-weight: 700; line-height: 1.15;
                    margin: 0 0 1rem; letter-spacing: -0.02em;
                }
                .calculators-page .hero-lead {
                    font-size: 1.1rem; max-width: 640px;
                    color: var(--muted2, #374151); margin: 0;
                }
                .calculators-page .calc-grid-section { margin-bottom: 3rem; }
                .calculators-page .calc-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 16px;
                }
                .calculators-page .calc-card {
                    display: flex; flex-direction: column;
                    padding: 1.5rem; border: 1px solid rgba(0,0,0,0.1);
                    border-radius: 14px; text-decoration: none;
                    color: var(--fg, #111827); background: white;
                    transition: border-color 0.15s, box-shadow 0.15s;
                }
                .calculators-page .calc-card:hover {
                    border-color: rgba(34,197,94,0.5);
                    box-shadow: 0 4px 16px rgba(34,197,94,0.08);
                }
                .calculators-page .calc-icon { font-size: 1.75rem; margin-bottom: 0.75rem; }
                .calculators-page .calc-title { font-weight: 700; font-size: 1.05rem; margin-bottom: 0.5rem; }
                .calculators-page .calc-desc {
                    font-size: 0.88rem; color: var(--muted2, #374151);
                    line-height: 1.55; margin-bottom: 1rem; flex: 1;
                }
                .calculators-page .calc-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 1rem; }
                .calculators-page .calc-tag {
                    font-size: 11px; padding: 2px 8px;
                    background: rgba(0,0,0,0.04); border-radius: 99px;
                    border: 1px solid rgba(0,0,0,0.08);
                    color: var(--muted2, #374151);
                }
                .calculators-page .calc-cta {
                    font-size: 0.88rem; font-weight: 600;
                    color: var(--accent, #22c55e);
                }
                .calculators-page .income-section { margin-bottom: 3rem; }
                .calculators-page h2 {
                    font-size: clamp(1.2rem, 2.5vw, 1.6rem);
                    font-weight: 600; margin: 0 0 0.75rem; letter-spacing: -0.01em;
                }
                .calculators-page .section-lead {
                    font-size: 1rem; color: var(--muted2, #374151);
                    margin: 0 0 1.25rem; max-width: 680px; line-height: 1.65;
                }
                .calculators-page .income-grid {
                    display: flex; flex-wrap: wrap; gap: 10px;
                }
                .calculators-page .income-card {
                    padding: 8px 18px; border: 1px solid rgba(0,0,0,0.1);
                    border-radius: 99px; text-decoration: none;
                    color: var(--fg, #111827); font-size: 0.9rem;
                    background: white; font-weight: 500;
                    transition: border-color 0.15s, box-shadow 0.15s;
                }
                .calculators-page .income-card:hover {
                    border-color: rgba(34,197,94,0.5);
                    box-shadow: 0 2px 8px rgba(34,197,94,0.08);
                }
                .calculators-page .about-section {
                    background: var(--surface, #f9fafb);
                    border-radius: 12px; padding: 1.5rem;
                    border: 1px solid rgba(0,0,0,0.07);
                }
                .calculators-page .about-section p {
                    font-size: 0.9rem; color: var(--muted2, #374151);
                    margin: 0 0 0.75rem; line-height: 1.65;
                }
                .calculators-page .about-section p:last-child { margin-bottom: 0; }
                .calculators-page .disclaimer { font-size: 0.8rem !important; color: var(--muted, #6b7280) !important; }
                @media (max-width: 600px) {
                    .calculators-page { padding: 1.25rem 1rem 3rem; }
                    .calculators-page .calc-grid { grid-template-columns: 1fr; }
                }
            `}</style>
        </>
    );
}
