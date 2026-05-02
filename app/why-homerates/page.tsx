// app/why-homerates/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Why HomeRates.ai vs ChatGPT for Mortgage Questions',
    description:
        'ChatGPT gives confident mortgage answers — often wrong. HomeRates.ai uses live FRED rates and real mortgage math. See the difference before you make a $400,000 decision.',
    openGraph: {
        title: 'Why HomeRates.ai vs ChatGPT for Mortgage Questions',
        description:
            'ChatGPT uses stale data and guesses at mortgage math. HomeRates.ai is built specifically for borrowers — live rates, real calculations, no sales pitch.',
        url: 'https://chat.homerates.ai/why-homerates',
        siteName: 'HomeRates.ai',
        type: 'website',
        images: [{ url: 'https://chat.homerates.ai/assets/share/og/homerates-brand-default-og-1200x630-v1.png', width: 1200, height: 630 }],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Why HomeRates.ai vs ChatGPT',
        description: 'Real mortgage math. Live rates. Built for borrowers — not lenders.',
    },
    alternates: { canonical: 'https://chat.homerates.ai/why-homerates' },
};

const COMPARISONS = [
    {
        question: 'What is my real monthly payment?',
        chatgpt: 'Estimates principal + interest only. Forgets taxes, insurance, and PMI — the numbers that actually determine if you can afford it.',
        homerates: 'Calculates full PITI — Principal, Interest, Taxes, Insurance, and PMI — using your actual numbers and live rates.',
        impact: 'The difference can be $400–$800/mo on a $400k home.',
    },
    {
        question: 'What are mortgage rates today?',
        chatgpt: 'Quotes rates from its training data — often 12–24 months out of date. Has no access to live market data.',
        homerates: 'Pulls live rates from FRED (Freddie Mac weekly average) every time you ask. What you see is what the market actually says today.',
        impact: 'A 1% rate difference on $400k = $240/mo and $86k over 30 years.',
    },
    {
        question: 'How much house can I afford?',
        chatgpt: 'Uses national average rules of thumb. Does not know your DTI, debt load, or actual loan limits for 2026.',
        homerates: 'Works backward from your income and debts using current DTI guidelines and 2026 conforming loan limits.',
        impact: 'Generic rules can over- or underestimate your ceiling by $50–$100k.',
    },
    {
        question: 'Do I need PMI and when does it go away?',
        chatgpt: 'Often confuses PMI (conventional) with MIP (FHA). Gets the cancellation rules wrong — a common source of misinformation.',
        homerates: 'Knows the difference. Calculates your exact PMI cost, the LTV threshold to cancel it, and how long you\'ll pay it.',
        impact: 'PMI is $100–$300/mo. Knowing when it ends changes your long-term plan.',
    },
    {
        question: 'Should I do 15-year or 30-year?',
        chatgpt: 'Gives a general answer. Cannot show you a live side-by-side with your actual numbers and today\'s rates.',
        homerates: 'Runs both scenarios with live rates and your loan amount. Shows monthly payment difference and total interest saved — your actual tradeoff.',
        impact: '15yr saves $150k+ in interest but costs $600+/mo more. You need real numbers to decide.',
    },
    {
        question: 'Does this rental property cash flow? (DSCR)',
        chatgpt: 'May not know current DSCR lender requirements. Will approximate — and get it wrong in ways that matter.',
        homerates: 'Calculates DSCR ratio, monthly cash flow, and lender qualification using live rates and 2026 investor loan guidelines.',
        impact: 'Wrong DSCR analysis on a $500k investment property is a very expensive mistake.',
    },
    {
        question: 'What are my total costs to close?',
        chatgpt: 'Generic estimate. No awareness of your state, loan type, or current lender fee trends.',
        homerates: 'Breaks down closing cost categories — origination, title, escrow, prepaid items — and what to expect based on your loan type.',
        impact: 'Closing costs average $6,800. Being surprised by this at the table is avoidable.',
    },
];

const PILLARS = [
    {
        icon: '📡',
        title: 'Live Market Data',
        body: 'Rates pulled from FRED (Federal Reserve Economic Data) weekly. Not last year\'s training data — today\'s actual mortgage market.',
        color: '#00e87a',
    },
    {
        icon: '🧮',
        title: 'Real Mortgage Math',
        body: 'PITI calculations, DTI analysis, DSCR ratios, PMI costs, amortization — built on the same formulas lenders use, not approximations.',
        color: '#3d8bff',
    },
    {
        icon: '🎯',
        title: 'Built for Borrowers',
        body: 'The mortgage industry built AI for lenders. We built this for the person sitting at the kitchen table trying to figure out if they can afford a house.',
        color: '#a78bfa',
    },
    {
        icon: '🔒',
        title: 'No Sales Funnel',
        body: 'No lead forms. No rate quote pages that capture your number before giving you an answer. No lender partnerships. No commission.',
        color: '#ff8c42',
    },
    {
        icon: '📚',
        title: 'Stays on Topic',
        body: 'ChatGPT will drift. Ask a mortgage question and it will go wherever the conversation takes it. HomeRates.ai stays focused on mortgage — every answer, every time.',
        color: '#00e87a',
    },
    {
        icon: '⚖️',
        title: 'Honest About Limits',
        body: 'This is an educational tool, not a licensed advisor. We tell you that clearly — and then give you the most accurate educational answer available anywhere.',
        color: '#3d8bff',
    },
];

export default function WhyHomeRates() {
    return (
        <>
            <style>{`
                body:has(.whr-root) {
                    display: block !important;
                    height: auto !important;
                    overflow: visible !important;
                }
                html:has(.whr-root) {
                    height: auto !important;
                    overflow: visible !important;
                }
                .whr-root {
                    --bg: #080c12;
                    --surface: #0e1420;
                    --surface2: #141b28;
                    --border: rgba(255,255,255,0.07);
                    --border-bright: rgba(255,255,255,0.13);
                    --text: #f0f4ff;
                    --text-muted: #8fa3b8;
                    --text-dim: #3a4560;
                    --green: #00e87a;
                    --blue: #3d8bff;
                    --purple: #a78bfa;
                    --orange: #ff8c42;
                    font-family: 'DM Sans', sans-serif;
                    background: var(--bg);
                    color: var(--text);
                    min-height: 100vh;
                }
                .whr-root * { box-sizing: border-box; }
                body:has(.whr-root) .app-footer { display: none; }

                /* NAV */
                .whr-nav {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 14px 40px;
                    border-bottom: 1px solid var(--border);
                    background: var(--bg);
                    position: sticky; top: 0; z-index: 10;
                }
                .whr-nav-logo { display: flex; align-items: center; text-decoration: none; }
                .whr-nav-logo img { height: 32px; width: auto; }
                .whr-nav-cta {
                    display: inline-flex; align-items: center;
                    padding: 8px 20px;
                    background: var(--green); color: #080c12;
                    border-radius: 999px; font-weight: 700; font-size: 13px;
                    text-decoration: none; transition: opacity 0.2s;
                }
                .whr-nav-cta:hover { opacity: 0.88; }

                /* HERO */
                .whr-hero {
                    max-width: 760px; margin: 0 auto;
                    padding: 72px 40px 56px;
                    text-align: center;
                }
                .whr-eyebrow {
                    display: inline-flex; align-items: center; gap: 8px;
                    font-family: 'DM Mono', monospace; font-size: 11px;
                    color: var(--green); letter-spacing: 0.1em; text-transform: uppercase;
                    margin-bottom: 24px;
                    padding: 5px 14px;
                    border: 1px solid rgba(0,232,122,0.2);
                    border-radius: 999px;
                    background: rgba(0,232,122,0.06);
                }
                .whr-hero h1 {
                    font-family: 'DM Sans', sans-serif;
                    font-size: clamp(2rem, 5vw, 3rem);
                    font-weight: 800; line-height: 1.12;
                    letter-spacing: -0.02em; margin: 0 0 20px;
                    color: var(--text);
                }
                .whr-hero h1 span { color: #ff5f5f; }
                .whr-hero p {
                    font-size: 17px; color: var(--text-muted);
                    line-height: 1.7; margin: 0 0 36px;
                    max-width: 560px; margin-left: auto; margin-right: auto;
                }
                .whr-hero-cta {
                    display: inline-flex; align-items: center; gap: 8px;
                    padding: 14px 36px;
                    background: var(--green); color: #080c12;
                    border-radius: 999px; font-weight: 700; font-size: 16px;
                    text-decoration: none; transition: opacity 0.2s, transform 0.15s;
                }
                .whr-hero-cta:hover { opacity: 0.88; transform: translateY(-1px); }

                /* PILLARS */
                .whr-pillars {
                    max-width: 960px; margin: 0 auto;
                    padding: 0 40px 72px;
                }
                .whr-pillars-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
                    gap: 16px;
                }
                .whr-pillar {
                    background: var(--surface);
                    border: 1px solid var(--border);
                    border-radius: 14px;
                    padding: 22px 24px;
                    transition: border-color 0.2s;
                }
                .whr-pillar:hover { border-color: var(--border-bright); }
                .whr-pillar-icon { font-size: 1.5rem; margin-bottom: 12px; }
                .whr-pillar-title {
                    font-family: 'DM Sans', sans-serif;
                    font-weight: 700; font-size: 15px;
                    margin-bottom: 8px; color: var(--text);
                }
                .whr-pillar-body {
                    font-size: 13px; color: var(--text-muted); line-height: 1.65;
                }

                /* COMPARISON SECTION */
                .whr-compare {
                    max-width: 960px; margin: 0 auto;
                    padding: 0 40px 80px;
                }
                .whr-compare-header {
                    text-align: center; margin-bottom: 48px;
                }
                .whr-compare-header h2 {
                    font-family: 'DM Sans', sans-serif;
                    font-size: clamp(1.4rem, 3vw, 2rem);
                    font-weight: 800; letter-spacing: -0.02em;
                    margin: 0 0 10px; color: var(--text);
                }
                .whr-compare-header p {
                    color: var(--text-muted); font-size: 15px;
                }
                .whr-compare-list { display: flex; flex-direction: column; gap: 12px; }
                .whr-compare-card {
                    background: var(--surface);
                    border: 1px solid var(--border);
                    border-radius: 14px; overflow: hidden;
                    transition: border-color 0.2s;
                }
                .whr-compare-card:hover { border-color: var(--border-bright); }
                .whr-compare-q {
                    padding: 14px 20px;
                    background: var(--surface2);
                    border-bottom: 1px solid var(--border);
                    font-family: 'DM Sans', sans-serif;
                    font-weight: 700; font-size: 14px;
                    color: var(--text);
                }
                .whr-compare-cols {
                    display: grid; grid-template-columns: 1fr 1fr;
                }
                .whr-compare-col {
                    padding: 16px 20px;
                }
                .whr-compare-col + .whr-compare-col {
                    border-left: 1px solid var(--border);
                    background: rgba(0,232,122,0.02);
                }
                .whr-compare-col-label {
                    font-family: 'DM Mono', monospace;
                    font-size: 10px; font-weight: 600;
                    letter-spacing: 0.1em; text-transform: uppercase;
                    margin-bottom: 8px;
                }
                .whr-compare-col-label.chatgpt { color: var(--text-dim); }
                .whr-compare-col-label.homerates { color: var(--green); }
                .whr-compare-col-text {
                    font-size: 13px; line-height: 1.65;
                }
                .whr-compare-col-text.chatgpt { color: var(--text-muted); }
                .whr-compare-col-text.homerates { color: var(--text); }
                .whr-compare-impact {
                    padding: 10px 20px;
                    background: rgba(61,139,255,0.05);
                    border-top: 1px solid rgba(61,139,255,0.1);
                    font-family: 'DM Mono', monospace;
                    font-size: 11px; color: #3d8bff;
                    display: flex; align-items: center; gap: 8px;
                }

                /* CTA */
                .whr-cta {
                    background: var(--surface);
                    border-top: 1px solid var(--border);
                    padding: 72px 40px;
                    text-align: center;
                }
                .whr-cta h2 {
                    font-family: 'DM Sans', sans-serif;
                    font-size: clamp(1.5rem, 4vw, 2.2rem);
                    font-weight: 800; color: var(--text);
                    letter-spacing: -0.02em; margin: 0 0 16px;
                }
                .whr-cta p {
                    color: var(--text-muted); font-size: 16px;
                    margin: 0 0 36px; line-height: 1.7;
                }
                .whr-cta-btn {
                    display: inline-flex; align-items: center; gap: 8px;
                    padding: 14px 40px;
                    background: var(--green); color: #080c12;
                    border-radius: 999px; font-weight: 700; font-size: 16px;
                    text-decoration: none; transition: opacity 0.2s, transform 0.15s;
                }
                .whr-cta-btn:hover { opacity: 0.88; transform: translateY(-1px); }
                .whr-cta-note {
                    margin-top: 24px; font-size: 12px; color: var(--text-dim);
                    font-family: 'DM Mono', monospace;
                }
                .whr-cta-note a { color: var(--text-dim); text-decoration: underline; }

                /* SECTION LABEL */
                .whr-section-label {
                    font-family: 'DM Mono', monospace;
                    font-size: 10px; font-weight: 600;
                    color: var(--text-dim); letter-spacing: 0.12em;
                    text-transform: uppercase; margin-bottom: 28px;
                }

                @media (max-width: 768px) {
                    .whr-nav { padding: 14px 20px; }
                    .whr-hero { padding: 48px 20px 40px; }
                    .whr-pillars { padding: 0 20px 48px; }
                    .whr-compare { padding: 0 20px 60px; }
                    .whr-compare-cols { grid-template-columns: 1fr; }
                    .whr-compare-col + .whr-compare-col { border-left: none; border-top: 1px solid var(--border); }
                    .whr-cta { padding: 48px 20px; }
                }
            `}</style>

            <div className="whr-root">
                {/* NAV */}
                <nav className="whr-nav">
                    <Link href="/" className="whr-nav-logo">
                        <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
                    </Link>
                    <Link href="/" className="whr-nav-cta">
                        Try it free →
                    </Link>
                </nav>

                {/* HERO */}
                <section className="whr-hero">
                    <div className="whr-eyebrow">&#9679; Built for Borrowers</div>
                    <h1>
                        ChatGPT gives confident<br />mortgage answers.
                        <span> Often wrong.</span>
                    </h1>
                    <p>
                        ChatGPT has no live rate data, no real mortgage math engine, and no idea what 2026 loan limits are.
                        HomeRates.ai was built specifically for the questions borrowers actually ask — with the accuracy they actually need.
                    </p>
                    <Link href="/" className="whr-hero-cta">
                        Ask your mortgage question →
                    </Link>
                </section>

                {/* PILLARS */}
                <section className="whr-pillars">
                    <div className="whr-section-label">Why it&apos;s different</div>
                    <div className="whr-pillars-grid">
                        {PILLARS.map((p) => (
                            <div key={p.title} className="whr-pillar">
                                <div className="whr-pillar-icon">{p.icon}</div>
                                <div className="whr-pillar-title" style={{ color: p.color }}>{p.title}</div>
                                <div className="whr-pillar-body">{p.body}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* COMPARISON */}
                <section className="whr-compare">
                    <div className="whr-compare-header">
                        <h2>Question by question</h2>
                        <p>These are the real questions borrowers ask. Here is what each tool actually delivers.</p>
                    </div>
                    <div className="whr-compare-list">
                        {COMPARISONS.map((c, i) => (
                            <div key={i} className="whr-compare-card">
                                <div className="whr-compare-q">{c.question}</div>
                                <div className="whr-compare-cols">
                                    <div className="whr-compare-col">
                                        <div className="whr-compare-col-label chatgpt">ChatGPT / General AI</div>
                                        <div className="whr-compare-col-text chatgpt">{c.chatgpt}</div>
                                    </div>
                                    <div className="whr-compare-col">
                                        <div className="whr-compare-col-label homerates">HomeRates.ai</div>
                                        <div className="whr-compare-col-text homerates">{c.homerates}</div>
                                    </div>
                                </div>
                                <div className="whr-compare-impact">
                                    <span>→</span> {c.impact}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* CTA */}
                <section className="whr-cta">
                    <h2>You deserve accurate answers<br />before you sign anything.</h2>
                    <p>
                        Free to use. No account required for your first questions.<br />
                        No lender. No sales call. No agenda.
                    </p>
                    <Link href="/" className="whr-cta-btn">
                        Start asking →
                    </Link>
                    <div className="whr-cta-note">
                        Educational purposes only — not financial advice.{' '}
                        <Link href="/disclosures">Full disclosures</Link>
                        {' · '}
                        <Link href="/platform">Platform Intelligence →</Link>
                    </div>
                </section>
            </div>
        </>
    );
}
