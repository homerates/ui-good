// app/calculators/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import AppNav from "../components/AppNav";

export const metadata: Metadata = {
    title: 'Mortgage Calculators 2026 — FHA, DSCR, Affordability & Refi | HomeRates.ai',
    description:
        'Free mortgage calculators for 2026. Conventional, FHA, DSCR, jumbo affordability, and refinance calculators. Live FRED rates, 2026 HUD and FHFA limits.',
    openGraph: {
        title: 'Mortgage Calculators 2026 | HomeRates.ai',
        description: 'FHA, DSCR, jumbo, affordability, and refinance calculators. Live rates. 2026 guidelines.',
        url: 'https://chat.homerates.ai/calculators',
        siteName: 'HomeRates.ai',
        type: 'website',
    },
    alternates: { canonical: 'https://chat.homerates.ai/calculators' },
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
        chatSeed: 'How much house can I afford? I want to see FHA, 3% down, and 20% down scenarios with monthly payment and cash needed.',
    },
    {
        href: '/fha-calculator',
        icon: '📋',
        title: 'FHA Loan Calculator',
        desc: 'Full FHA payment breakdown including UFMIP (1.75%), monthly MIP (0.55%/yr), property taxes, and insurance. MIP duration logic and FHA vs conventional comparison.',
        tags: ['2026 HUD limits', 'MIP breakdown', 'FHA vs Conv'],
        chatSeed: 'Calculate an FHA loan — show me UFMIP, monthly MIP, total payment, and compare to conventional.',
    },
    {
        href: '/dscr-calculator',
        icon: '📐',
        title: 'DSCR Calculator',
        desc: 'Rental property cash flow and debt service coverage ratio. Full PITIA breakdown, lender qualification status, and cash-on-cash return. No income docs required.',
        tags: ['Investment property', 'No income docs', 'Non-QM'],
        chatSeed: 'Calculate DSCR for a rental property — show PITIA breakdown, debt service coverage ratio, and cash-on-cash return.',
    },
    {
        href: '/refinance-calculator',
        icon: '🔁',
        title: 'Refinance Calculator',
        desc: 'Breakeven analysis, monthly savings, and rate-watch trigger points for your refi decision. Includes FHA-to-conventional refi math and no-cost refi comparison.',
        tags: ['Breakeven analysis', 'Rate triggers', 'FHA-to-Conv refi'],
        chatSeed: 'Should I refinance? Show me breakeven months, monthly savings, and rate triggers for my refi decision.',
    },
    {
        href: '/conventional-loan-calculator',
        icon: '🏡',
        title: 'Conventional Loan Calculator',
        desc: 'Full conventional payment with PMI, exact PMI cancellation year, DTI analysis, and FHA vs conventional comparison. 2026 FHFA limits.',
        tags: ['PMI cancellation', 'DTI analysis', 'Fannie Mae'],
        chatSeed: 'Calculate a conventional loan — include PMI, show when PMI cancels, DTI analysis, and compare to FHA.',
    },
    {
        href: '/jumbo-calculator',
        icon: '💎',
        title: 'Jumbo Loan Calculator',
        desc: 'Jumbo affordability calculator for properties above $832,750. Adjustable price, down payment, and rate sliders with conforming zone crossover callouts and reserve estimates.',
        tags: ['Above $832k', 'Jumbo zone', 'Reserve calc'],
        chatSeed: 'Calculate a jumbo loan on a home above $832,750 — show payment, reserves needed, and conforming zone comparison.',
    },
    {
        href: '/va-calculator',
        icon: '🎖️',
        title: 'VA Loan Calculator',
        desc: 'Full VA loan payment with funding fee (0%–3.3%), subsequent-use entitlement, no-PMI savings, and 2026 county limits. Includes funding fee exemption and rate buydown scenarios.',
        tags: ['$0 down', 'No PMI', 'Funding fee', 'VA entitlement'],
        chatSeed: 'Calculate a VA loan — show funding fee, no-down-payment payment, PMI savings vs conventional, and VA entitlement.',
    },
];

const incomePages = [
    { href: '/how-much-house-can-i-afford-on-80k-salary',  label: '$80k salary' },
    { href: '/how-much-house-can-i-afford-on-95k-salary',  label: '$95k salary' },
    { href: '/how-much-house-can-i-afford-on-100k-salary', label: '$100k salary' },
    { href: '/how-much-house-can-i-afford-on-120k-salary', label: '$120k salary' },
    { href: '/how-much-house-can-i-afford-on-150k-salary', label: '$150k salary' },
];

export default function CalculatorsPage() {
    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaBreadcrumb) }} />
            <style>{`
                body:has(.calc-root){display:block!important;height:auto!important;overflow-y:auto!important;background:#080c12!important}
                html:has(.calc-root){height:auto!important;overflow:visible!important;}
                .calc-root{min-height:100vh;background:#080c12;color:#f0f4ff;font-family:'DM Sans',system-ui,sans-serif;}
                .calc-root *{box-sizing:border-box;}

                .calc-nav{position:sticky;top:0;z-index:100;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 24px;height:56px;background:rgba(8,12,18,0.97);border-bottom:1px solid rgba(255,255,255,0.07);backdrop-filter:blur(8px);}
                .calc-logo{justify-self:start;}
                .calc-logo img{height:26px;display:block;}
                .calc-nav-cta{justify-self:end;display:flex;align-items:center;gap:10px;}
                .calc-try-link{font-size:0.82rem;font-weight:600;color:#00e87a;text-decoration:none;padding:6px 14px;border:1px solid rgba(0,232,122,0.3);border-radius:8px;transition:background 0.15s;}
                .calc-try-link:hover{background:rgba(0,232,122,0.08);}

                .calc-shell{max-width:900px;margin:0 auto;padding:48px 24px 80px;}

                .calc-breadcrumb ol{display:flex;gap:6px;list-style:none;padding:0;margin:0 0 2.5rem;font-size:13px;color:#8fa3b8;}
                .calc-breadcrumb a{color:#8fa3b8;text-decoration:none;}
                .calc-breadcrumb a:hover{color:#8fa3b8;}
                .calc-breadcrumb li[aria-current]{color:#8fa3b8;}

                .calc-eyebrow{font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#3d8bff;margin-bottom:0.5rem;}
                .calc-h1{font-size:clamp(1.75rem,4vw,2.6rem);font-weight:800;letter-spacing:-0.03em;color:#f0f4ff;margin:0 0 1rem;line-height:1.15;}
                .calc-lead{font-size:1rem;color: #94a3b8;max-width:640px;margin:0 0 3rem;line-height:1.65;}

                .calc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:3.5rem;}
                .calc-card{display:flex;flex-direction:column;padding:1.5rem;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;text-decoration:none;color:#f0f4ff;transition:border-color 0.15s,background 0.15s;}
                .calc-card:hover{border-color:rgba(0,232,122,0.3);background:rgba(0,232,122,0.03);}
                .calc-card-icon{font-size:1.75rem;margin-bottom:0.75rem;}
                .calc-card-title{font-weight:700;font-size:1rem;margin-bottom:0.5rem;}
                .calc-card-desc{font-size:0.85rem;color: #94a3b8;line-height:1.6;margin-bottom:1rem;flex:1;}
                .calc-card-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:1rem;}
                .calc-card-tag{font-size:11px;padding:2px 8px;background:rgba(255,255,255,0.05);border-radius:99px;border:1px solid rgba(255,255,255,0.08);color: #94a3b8;}
                .calc-card-cta{font-size:0.85rem;font-weight:600;color:#00e87a;}

                .calc-section-title{font-size:0.78rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#8fa3b8;margin-bottom:1rem;padding-bottom:0.5rem;border-bottom:1px solid rgba(255,255,255,0.06);}
                .calc-h2{font-size:clamp(1.1rem,2.5vw,1.5rem);font-weight:700;color:#f0f4ff;margin:0 0 0.5rem;letter-spacing:-0.02em;}
                .calc-section-lead{font-size:0.92rem;color: #94a3b8;margin:0 0 1.25rem;max-width:640px;line-height:1.65;}

                .calc-income-grid{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:3.5rem;}
                .calc-income-card{padding:8px 18px;border:1px solid rgba(255,255,255,0.08);border-radius:99px;text-decoration:none;color:#8fa3b8;font-size:0.88rem;background:rgba(255,255,255,0.03);font-weight:500;transition:border-color 0.15s,color 0.15s;}
                .calc-income-card:hover{border-color:rgba(0,232,122,0.3);color:#00e87a;}

                .calc-about{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:1.5rem;}
                .calc-about p{font-size:0.88rem;color: #94a3b8;margin:0 0 0.75rem;line-height:1.65;}
                .calc-about p:last-child{margin-bottom:0;}
                .calc-disclaimer{font-size:0.8rem!important;color:#8fa3b8!important;}

                @media(max-width:600px){.calc-shell{padding:1.25rem 1rem 3rem;}.calc-grid{grid-template-columns:1fr;}}
            `}</style>

            <div className="calc-root">
                <nav className="calc-nav">
                    <Link href="/" className="calc-logo">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
                    </Link>
                    <div />
                    <div className="calc-nav-cta">
                        <Link href="/chat" className="calc-try-link">Try free →</Link>
                        <AppNav drawerOnly />
                    </div>
                </nav>

                <div className="calc-shell">
                    <nav className="calc-breadcrumb" aria-label="Breadcrumb">
                        <ol>
                            <li><Link href="/">HomeRates.ai</Link></li>
                            <li aria-hidden="true">›</li>
                            <li aria-current="page">Calculators</li>
                        </ol>
                    </nav>

                    <div className="calc-eyebrow">2026 Guidelines</div>
                    <h1 className="calc-h1">Mortgage Calculators</h1>
                    <p className="calc-lead">
                        Free calculators built on 2026 HUD and FHFA guidelines, live FRED rate data,
                        and deterministic math — no AI guesswork in the numbers. Built by HomeRates.ai.
                    </p>

                    <div className="calc-grid">
                        {calculators.map((calc) => (
                            <div key={calc.href} className="calc-card" style={{ textDecoration: 'none' }}>
                                <div className="calc-card-icon">{calc.icon}</div>
                                <div className="calc-card-title">{calc.title}</div>
                                <div className="calc-card-desc">{calc.desc}</div>
                                <div className="calc-card-tags">
                                    {calc.tags.map((tag) => (
                                        <span key={tag} className="calc-card-tag">{tag}</span>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 12 }}>
                                    <Link href={calc.href} className="calc-card-cta" style={{ flex: 1 }}>Open calculator →</Link>
                                    <Link href={`/chat?sq=${encodeURIComponent(calc.chatSeed)}`} style={{ fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8', textDecoration: 'none' }}>Chat →</Link>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginBottom: "2rem" }}>
                        <div className="calc-section-title">Affordability by salary</div>
                        <h2 className="calc-h2">How much house on your income?</h2>
                        <p className="calc-section-lead">
                            Real payment breakdowns, debt impact analysis, and savings requirements at specific income levels.
                        </p>
                        <div className="calc-income-grid">
                            {incomePages.map((page) => (
                                <Link key={page.href} href={page.href} className="calc-income-card">
                                    {page.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div className="calc-about">
                        <div className="calc-section-title">How these calculators work</div>
                        <p>
                            Every calculator uses a deterministic calculation engine — the same inputs always produce
                            the same output, with no AI estimation in the math. Results match what a licensed loan
                            officer would calculate using the same inputs.
                        </p>
                        <p>
                            Rate data is pulled live from FRED (Freddie Mac PMMS, updated weekly).
                            Loan limits reflect 2026 FHFA conforming limits ($832,750) and 2026 HUD FHA limits
                            per HUD Mortgagee Letter No. 25-145.
                        </p>
                        <p className="calc-disclaimer">
                            <strong>Educational purposes only.</strong> HomeRates.ai is not a lender, broker,
                            or mortgage advisor. Results are estimates based on your inputs. Consult a licensed
                            mortgage professional for a formal pre-approval. Equal Housing Opportunity.
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}
