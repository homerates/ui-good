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
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Why HomeRates.ai vs ChatGPT',
        description: 'Real mortgage math. Live rates. Built for borrowers — not lenders.',
    },
    alternates: { canonical: 'https://chat.homerates.ai/why-homerates' },
};

const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
        {
            "@type": "Question",
            "name": "Why use HomeRates.AI instead of ChatGPT for mortgage questions?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "ChatGPT has no live rate data and relies on training data that can be 12–24 months out of date. HomeRates.AI pulls live mortgage rates from FRED (Freddie Mac weekly averages), runs deterministic mortgage math for PITI, DTI, DSCR, and PMI calculations, and never captures your data for lead generation. A 1% rate error on a $400,000 loan costs $86,000 over 30 years."
            }
        },
        {
            "@type": "Question",
            "name": "What are today's mortgage rates?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "HomeRates.AI pulls live rates from FRED (Federal Reserve Economic Data / Freddie Mac weekly averages) every time you ask. ChatGPT and other general AI tools quote rates from their training data, which is often 12–24 months stale. For accurate 2026 mortgage rates, use a platform connected to live market data."
            }
        },
        {
            "@type": "Question",
            "name": "How much house can I afford on my salary?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "HomeRates.AI calculates affordability by working backward from your actual income and debts using current DTI (Debt-to-Income) guidelines and 2026 conforming loan limits. General AI tools use national average rules of thumb that can over- or underestimate your actual ceiling by $50,000–$100,000."
            }
        },
        {
            "@type": "Question",
            "name": "What is my real monthly mortgage payment including taxes and insurance?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "Your true monthly cost is PITI — Principal, Interest, Taxes, Insurance, and PMI if applicable. HomeRates.AI calculates your full PITI using your actual numbers and live rates. Most AI tools estimate principal and interest only, missing $400–$800/month in real costs on a $400,000 home."
            }
        },
        {
            "@type": "Question",
            "name": "What is an unbiased mortgage AI platform?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "An unbiased mortgage AI platform provides mortgage calculations and education without capturing user data for lead generation or handing users off to lenders. HomeRates.AI is specifically designed with zero lead forms, zero data harvesting, and zero lender hand-offs. Every conversation is stored in the user's private vault — not sold to mortgage companies."
            }
        },
        {
            "@type": "Question",
            "name": "What is a private vault mortgage intelligence platform?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "HomeRates.AI stores every conversation and Property Intelligence Card in a personal Supabase vault secured by Clerk authentication. Unlike lead-gen mortgage sites that capture your data and sell it to lenders, your HomeRates.AI vault is privately owned — only you can access it."
            }
        },
        {
            "@type": "Question",
            "name": "Does HomeRates.AI sell my information to mortgage lenders?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "No. HomeRates.AI has zero lead forms, zero data harvesting, and zero lender hand-offs. The platform is explicitly built as the anti-lead-gen mortgage tool. Your conversations are stored in your private Supabase vault and are never sold, shared, or used to generate mortgage leads."
            }
        },
        {
            "@type": "Question",
            "name": "How do I calculate DSCR for a rental property?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "DSCR (Debt-Service Coverage Ratio) is calculated by dividing the property's gross rental income by its total monthly debt obligations. HomeRates.AI's DSCR calculator uses live FRED rates and 2026 investor loan guidelines to show your DSCR ratio, monthly cash flow, and lender qualification status. A DSCR above 1.25 typically qualifies for investment property loans."
            }
        }
    ]
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
    },
    {
        icon: '🧮',
        title: 'Real Mortgage Math',
        body: 'PITI calculations, DTI analysis, DSCR ratios, PMI costs, amortization — built on the same formulas lenders use, not approximations.',
    },
    {
        icon: '🎯',
        title: 'Built for Borrowers',
        body: 'The mortgage industry built AI for lenders. We built this for the person sitting at the kitchen table trying to figure out if they can afford a house.',
    },
    {
        icon: '🔒',
        title: 'No Sales Funnel',
        body: 'No lead forms. No rate quote pages that capture your number before giving you an answer. No lender partnerships. No commission.',
    },
    {
        icon: '📚',
        title: 'Stays on Topic',
        body: 'ChatGPT will drift. Ask a mortgage question and it will go wherever the conversation takes it. HomeRates.ai stays focused on mortgage — every answer, every time.',
    },
    {
        icon: '⚖️',
        title: 'Honest About Limits',
        body: 'This is an educational tool, not a licensed advisor. We tell you that clearly — and then give you the most accurate educational answer available anywhere.',
    },
];

export default function WhyHomeRates() {
    return (
        <>
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
        <main style={{ fontFamily: 'system-ui, -apple-system, sans-serif', color: '#0f172a', background: '#f8fafc', minHeight: '100dvh' }}>

            {/* ── Nav ── */}
            <nav style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
                <Link href="/" style={{ fontWeight: 800, fontSize: '1.1rem', color: '#0f172a', textDecoration: 'none', letterSpacing: '-0.02em' }}>
                    HomeRates.ai
                </Link>
                <Link href="/" style={{ padding: '8px 20px', background: '#10b981', color: '#fff', borderRadius: '9999px', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none' }}>
                    Try it free →
                </Link>
            </nav>

            {/* ── Hero ── */}
            <section style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px 48px', textAlign: 'center' }}>
                <div style={{ display: 'inline-block', padding: '5px 14px', background: '#ecfdf5', color: '#065f46', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 600, marginBottom: 20, letterSpacing: '0.03em' }}>
                    BUILT FOR BORROWERS
                </div>
                <h1 style={{ fontSize: 'clamp(1.8rem, 5vw, 2.8rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.03em', margin: '0 0 20px' }}>
                    ChatGPT gives confident<br />mortgage answers.
                    <span style={{ color: '#ef4444' }}> Often wrong.</span>
                </h1>
                <p style={{ fontSize: '1.1rem', color: '#475569', lineHeight: 1.7, margin: '0 0 32px', maxWidth: 580, marginLeft: 'auto', marginRight: 'auto' }}>
                    ChatGPT has no live rate data, no real mortgage math engine, and no idea what 2026 loan limits are.
                    HomeRates.ai was built specifically for the questions borrowers actually ask — with the accuracy they actually need.
                </p>
                <Link href="/" style={{ display: 'inline-block', padding: '14px 32px', background: '#10b981', color: '#fff', borderRadius: '9999px', fontWeight: 700, fontSize: '1rem', textDecoration: 'none' }}>
                    Ask your mortgage question →
                </Link>
            </section>

            {/* ── Why Pillars ── */}
            <section style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 64px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                    {PILLARS.map((p) => (
                        <div key={p.title} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px 22px' }}>
                            <div style={{ fontSize: '1.6rem', marginBottom: 10 }}>{p.icon}</div>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 6 }}>{p.title}</div>
                            <div style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>{p.body}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Head-to-head comparison ── */}
            <section style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 80px' }}>
                <h2 style={{ fontSize: 'clamp(1.3rem, 3vw, 1.8rem)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8, textAlign: 'center' }}>
                    Question by question
                </h2>
                <p style={{ textAlign: 'center', color: '#64748b', marginBottom: 40, fontSize: '0.95rem' }}>
                    These are the real questions borrowers ask. Here is what each tool actually delivers.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {COMPARISONS.map((c, i) => (
                        <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
                            {/* Question header */}
                            <div style={{ padding: '14px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: '0.95rem' }}>
                                {c.question}
                            </div>
                            {/* Two columns */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                                {/* ChatGPT */}
                                <div style={{ padding: '16px 20px', borderRight: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', marginBottom: 8, textTransform: 'uppercase' }}>
                                        ChatGPT / General AI
                                    </div>
                                    <div style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>
                                        {c.chatgpt}
                                    </div>
                                </div>
                                {/* HomeRates */}
                                <div style={{ padding: '16px 20px', background: '#f0fdf4' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669', letterSpacing: '0.06em', marginBottom: 8, textTransform: 'uppercase' }}>
                                        HomeRates.ai
                                    </div>
                                    <div style={{ fontSize: '0.875rem', color: '#0f172a', lineHeight: 1.6 }}>
                                        {c.homerates}
                                    </div>
                                </div>
                            </div>
                            {/* Impact bar */}
                            <div style={{ padding: '10px 20px', background: '#fffbeb', borderTop: '1px solid #fef3c7', fontSize: '0.8rem', color: '#92400e', fontWeight: 500 }}>
                                💡 {c.impact}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── CTA ── */}
            <section style={{ background: '#0f172a', padding: '64px 24px', textAlign: 'center' }}>
                <h2 style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', margin: '0 0 16px' }}>
                    You deserve accurate answers<br />before you sign anything.
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '1rem', margin: '0 0 32px', lineHeight: 1.6 }}>
                    Free to use. No account required for your first 10 questions.<br />No lender. No sales call. No agenda.
                </p>
                <Link href="/" style={{ display: 'inline-block', padding: '14px 36px', background: '#10b981', color: '#fff', borderRadius: '9999px', fontWeight: 700, fontSize: '1rem', textDecoration: 'none' }}>
                    Start asking →
                </Link>
                <div style={{ marginTop: 24, fontSize: '0.8rem', color: '#475569' }}>
                    Educational purposes only — not financial advice.{' '}
                    <Link href="/disclosures" style={{ color: '#64748b' }}>Full disclosures</Link>
                </div>
            </section>

        </main>
        </>
    );
}
