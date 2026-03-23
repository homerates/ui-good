// app/how-much-house-can-i-afford-on-95k-salary/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'How Much House Can I Afford on a $95k Salary? | HomeRates.ai',
    description:
        'On a $95,000 salary you can typically afford a home between $362,000–$532,000 depending on down payment and debts. Three real scenarios with monthly payment breakdown. 2026 rates.',
    keywords: [
        'how much house can i afford on 95k salary',
        'how much house can i afford on 95000 salary',
        'mortgage on 95k salary',
        '95k salary home affordability',
    ],
    openGraph: {
        title: 'How Much House Can I Afford on a $95k Salary? | HomeRates.ai',
        description: 'See exactly how much home $95,000/year qualifies you for — three scenarios, live rates, monthly payment breakdown.',
        url: 'https://chat.homerates.ai/how-much-house-can-i-afford-on-95k-salary',
        siteName: 'HomeRates.ai',
        type: 'website',
    },
    alternates: { canonical: 'https://chat.homerates.ai/how-much-house-can-i-afford-on-95k-salary' },
};

const schemaFAQ = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
        {
            '@type': 'Question',
            name: 'How much house can I afford on a $95,000 salary?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'On a $95,000 salary with no existing debts, you can typically afford up to $425,000 with FHA (3.5% down) or $532,000 with conventional 20% down at 2026 rates (~6.75%). With $500/month in debts, your range drops to $362,000–$454,000. These figures apply Fannie Mae\'s 43% back-end DTI guideline.',
            },
        },
        {
            '@type': 'Question',
            name: 'What is the monthly mortgage payment on a $95k salary?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'At 43% DTI on a $95,000 salary, your maximum monthly housing payment is approximately $3,408. On a $425,000 FHA purchase with 3.5% down at 6.75%, the monthly PITI is about $3,408. A comfortable 28–31% housing ratio on $95k is $2,217–$2,454/month — leaving substantial room for savings and other expenses.',
            },
        },
        {
            '@type': 'Question',
            name: 'How much do I need saved to buy a house on a $95k salary?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'For FHA on a $425,000 home: 3.5% down ($14,875) + 3% closing costs (~$12,750) = about $27,625 needed. For conventional 3% down on $431,000: ~$23,000. For conventional 20% down on $532,000: ~$119,700. A savings of $33,000 comfortably covers FHA with a buffer.',
            },
        },
        {
            '@type': 'Question',
            name: 'Should I use FHA or conventional on a $95k salary?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'On $95k with typical savings of $30,000–$40,000, FHA (3.5% down) or conventional 3% down are both viable. If your credit score is 680+, conventional 3% is often better because PMI cancels at 80% LTV — unlike FHA MIP which lasts the life of the loan with under 10% down. Use the HomeRates.ai calculator to compare total cost over 7 years.',
            },
        },
    ],
};

const schemaBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'HomeRates.ai', item: 'https://chat.homerates.ai' },
        { '@type': 'ListItem', position: 2, name: 'Affordability Calculator', item: 'https://chat.homerates.ai/affordability-calculator' },
        { '@type': 'ListItem', position: 3, name: 'How Much House on $95k Salary', item: 'https://chat.homerates.ai/how-much-house-can-i-afford-on-95k-salary' },
    ],
};

const scenarios = [
    { debt: '$0/mo', fha: '$425k', fhaPmt: '$3,408', conv3: '$431k', conv3Pmt: '$3,407', conv20: '$532k', conv20Pmt: '$3,403' },
    { debt: '$300/mo', fha: '$387k', fhaPmt: '$3,103', conv3: '$393k', conv3Pmt: '$3,106', conv20: '$485k', conv20Pmt: '$3,103' },
    { debt: '$500/mo', fha: '$362k', fhaPmt: '$2,903', conv3: '$367k', conv3Pmt: '$2,901', conv20: '$454k', conv20Pmt: '$2,904' },
];

const faqs = [
    {
        q: 'How much house can I afford on a $95,000 salary?',
        a: 'With no existing debts: $425,000 FHA (3.5% down) or $532,000 conventional 20% down at 2026 rates. With $500/month debts: $362,000–$454,000. Uses Fannie Mae 43% back-end DTI. Enter your actual numbers for a precise figure.',
    },
    {
        q: 'What is the monthly payment on a $95k salary?',
        a: 'Maximum at 43% DTI: ~$3,408/month. On a $425k FHA purchase at 6.75% that\'s about $3,408 including MIP, taxes, and insurance. A comfortable 28–31% housing ratio is $2,217–$2,454/month — most advisors recommend staying closer to that range.',
    },
    {
        q: 'How much do I need saved to buy on a $95k salary?',
        a: 'FHA on $425k: ~$27,600 total. Conventional 3% on $431k: ~$23,000. Conventional 20% on $532k: ~$119,700. Savings of $33,000 covers FHA with a buffer. Most $95k earners find FHA or conventional 3% down most accessible.',
    },
    {
        q: 'FHA or conventional on a $95k salary?',
        a: 'With 680+ credit and $30k+ saved, conventional 3% down is usually better — PMI cancels at 80% LTV while FHA MIP lasts the life of the loan with under 10% down. Below 680 credit or with less than 5% saved, FHA is typically the better path.',
    },
];

export default function Income95kPage() {
    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaFAQ) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaBreadcrumb) }} />
            <main className="income-page">
                <nav className="breadcrumb" aria-label="Breadcrumb">
                    <ol>
                        <li><Link href="/">HomeRates.ai</Link></li>
                        <li aria-hidden="true">›</li>
                        <li><Link href="/affordability-calculator">Affordability Calculator</Link></li>
                        <li aria-hidden="true">›</li>
                        <li aria-current="page">$95k Salary</li>
                    </ol>
                </nav>
                <section className="hero">
                    <h1>How Much House Can I Afford on a $95k Salary?</h1>
                    <p className="hero-lead">On a $95,000 annual income, you can typically qualify for a home between <strong>$362,000 and $532,000</strong> depending on your down payment, debts, and loan type. Here are the real numbers at 2026 rates.</p>
                    <div className="trust-bar">
                        <span className="trust-item">📡 Live FRED rates</span>
                        <span className="trust-item">✅ 43% DTI guideline</span>
                        <span className="trust-item">🔒 No login required</span>
                    </div>
                </section>
                <section className="calculator-embed" id="calculator">
                    <div className="embed-header">
                        <h2>Get your exact number</h2>
                        <p>Enter your actual savings and debts for a precise three-scenario breakdown.</p>
                    </div>
                    <div className="seed-chips">
                        <span className="seed-label">Quick start:</span>
                        <a href="/?sq=I+make+%2495k+and+have+%2433k+saved%2C+no+debts" className="seed-chip">$33k saved, no debts</a>
                        <a href="/?sq=I+make+%2495k+and+have+%2433k+saved+with+a+%24300+car+payment" className="seed-chip">$33k saved, $300/mo car</a>
                        <a href="/?sq=I+make+%2495k+and+have+%2450k+saved%2C+no+debts" className="seed-chip">$50k saved, no debts</a>
                    </div>
                    <div className="cta-block">
                        <a href="/?sq=I+make+%2495%2C000+a+year+and+have+%2433%2C000+saved+%E2%80%94+how+much+house+can+I+afford%3F" className="cta-button">Calculate my affordability →</a>
                        <p className="cta-sub">Free · No login · Result in seconds</p>
                    </div>
                </section>
                <section className="example-table-section">
                    <h2>$95k salary — home affordability by debt load</h2>
                    <p className="section-lead">Assumes 6.75% rate · 30-year fixed · 43% back-end DTI · Taxes 1.1%/yr · Insurance 0.35%/yr.</p>
                    <div className="example-table-wrapper">
                        <table className="example-table">
                            <thead>
                                <tr>
                                    <th>Monthly Debts</th>
                                    <th>FHA (3.5% down)</th>
                                    <th>Payment</th>
                                    <th>Conv. 3% down</th>
                                    <th>Payment</th>
                                    <th>Conv. 20% down</th>
                                    <th>Payment</th>
                                </tr>
                            </thead>
                            <tbody>
                                {scenarios.map((row, i) => (
                                    <tr key={i}>
                                        <td className="income-cell">{row.debt}</td>
                                        <td className="price-cell">{row.fha}</td>
                                        <td>{row.fhaPmt}/mo</td>
                                        <td className="price-cell">{row.conv3}</td>
                                        <td>{row.conv3Pmt}/mo</td>
                                        <td className="price-cell">{row.conv20}</td>
                                        <td>{row.conv20Pmt}/mo</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="table-note">Monthly payment includes principal, interest, taxes, insurance, and MIP/PMI where applicable. For educational purposes only.</p>
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
                <section className="author-section">
                    <div className="author-card">
                        <div className="author-avatar">RA</div>
                        <div className="author-info">
                            <div className="author-name">Rayaan Arif</div>
                            <div className="author-cred">Licensed Loan Consultant</div>
                            <p className="author-bio">Numbers calculated using Fannie Mae 43% DTI guidelines, live FRED 30-year rate data, and 2026 FHA/conforming loan limits.</p>
                        </div>
                    </div>
                    <p className="disclaimer"><strong>Educational purposes only.</strong> Not a lender or pre-approval. Consult a licensed mortgage professional. Equal Housing Opportunity.</p>
                </section>
                <section className="related-section">
                    <h2>Related pages</h2>
                    <div className="related-grid">
                        <Link href="/affordability-calculator" className="related-card">
                            <div className="related-title">Affordability Calculator</div>
                            <div className="related-desc">Enter your exact income, savings, and debts for a full three-scenario breakdown.</div>
                        </Link>
                        <Link href="/how-much-house-can-i-afford-on-80k-salary" className="related-card">
                            <div className="related-title">$80k Salary</div>
                            <div className="related-desc">How much house can you afford on an $80,000 annual income?</div>
                        </Link>
                        <Link href="/how-much-house-can-i-afford-on-100k-salary" className="related-card">
                            <div className="related-title">$100k Salary</div>
                            <div className="related-desc">How much house can you afford on a $100,000 annual income?</div>
                        </Link>
                    </div>
                </section>
            </main>
            <style>{INCOME_PAGE_STYLES}</style>
        </>
    );
}

const INCOME_PAGE_STYLES = `
    .income-page { max-width: 860px; margin: 0 auto; padding: 2rem 1.5rem 4rem; font-family: var(--font-sans, system-ui, sans-serif); color: var(--fg, #111827); line-height: 1.6; }
    .income-page .breadcrumb ol { display: flex; gap: 6px; list-style: none; padding: 0; margin: 0 0 2rem; font-size: 13px; color: var(--muted, #6b7280); }
    .income-page .breadcrumb a { color: inherit; text-decoration: none; }
    .income-page .breadcrumb a:hover { text-decoration: underline; }
    .income-page .breadcrumb li[aria-current] { color: var(--fg, #111827); font-weight: 500; }
    .income-page .hero { margin-bottom: 3rem; }
    .income-page h1 { font-size: clamp(1.75rem, 4vw, 2.5rem); font-weight: 700; line-height: 1.15; margin: 0 0 1rem; letter-spacing: -0.02em; }
    .income-page .hero-lead { font-size: 1.1rem; max-width: 640px; color: var(--muted2, #374151); margin: 0 0 1.25rem; }
    .income-page .trust-bar { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 0.75rem; }
    .income-page .trust-item { font-size: 13px; padding: 4px 12px; background: rgba(0,0,0,0.04); border-radius: 99px; border: 1px solid rgba(0,0,0,0.08); color: var(--muted2, #374151); }
    .income-page .calculator-embed { background: var(--surface, #f9fafb); border-radius: 16px; border: 1px solid rgba(0,0,0,0.08); padding: 2rem; margin-bottom: 3rem; }
    .income-page .embed-header h2 { margin: 0 0 0.5rem; font-size: 1.35rem; }
    .income-page .embed-header p { margin: 0 0 1.25rem; color: var(--muted, #6b7280); font-size: 0.95rem; }
    .income-page .seed-chips { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 1rem; }
    .income-page .seed-label { font-size: 13px; color: var(--muted, #6b7280); }
    .income-page .seed-chip { font-size: 13px; padding: 5px 13px; background: white; border-radius: 99px; border: 1px solid rgba(0,0,0,0.12); color: var(--fg, #111827); text-decoration: none; transition: border-color 0.15s; }
    .income-page .seed-chip:hover { border-color: rgba(0,0,0,0.3); }
    .income-page .cta-block { text-align: center; padding: 1.5rem 0 0.5rem; }
    .income-page .cta-button { display: inline-block; padding: 14px 32px; background: #111827; color: #ffffff; border-radius: 999px; font-size: 1rem; font-weight: 600; text-decoration: none; transition: opacity 0.15s; }
    .income-page .cta-button:hover { opacity: 0.85; }
    .income-page .cta-sub { margin: 10px 0 0; font-size: 13px; color: var(--muted, #6b7280); }
    .income-page h2 { font-size: clamp(1.2rem, 2.5vw, 1.6rem); font-weight: 600; margin: 0 0 0.75rem; letter-spacing: -0.01em; }
    .income-page .section-lead { font-size: 1rem; color: var(--muted2, #374151); margin: 0 0 1.5rem; max-width: 680px; line-height: 1.65; }
    .income-page .example-table-section { margin-bottom: 3rem; }
    .income-page .example-table-wrapper { overflow-x: auto; margin-bottom: 0.75rem; }
    .income-page .example-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; min-width: 560px; }
    .income-page .example-table th { text-align: left; font-size: 0.78rem; font-weight: 600; color: var(--muted, #6b7280); padding: 8px 12px; border-bottom: 1.5px solid rgba(0,0,0,0.1); background: var(--surface, #f9fafb); text-transform: uppercase; letter-spacing: 0.04em; }
    .income-page .example-table td { padding: 10px 12px; border-bottom: 1px solid rgba(0,0,0,0.06); }
    .income-page .example-table tr:last-child td { border-bottom: none; }
    .income-page .income-cell { font-weight: 600; }
    .income-page .price-cell { font-weight: 500; color: var(--accent2, #059669); }
    .income-page .table-note { font-size: 0.8rem; color: var(--muted, #6b7280); margin: 0; line-height: 1.5; }
    .income-page .faq-section { margin-bottom: 3rem; }
    .income-page .faq-list { display: flex; flex-direction: column; gap: 8px; }
    .income-page .faq-item { border: 1px solid rgba(0,0,0,0.08); border-radius: 10px; overflow: hidden; background: white; }
    .income-page .faq-question { padding: 1rem 1.25rem; font-weight: 500; font-size: 0.95rem; cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; color: var(--fg, #111827); }
    .income-page .faq-question::after { content: '+'; font-size: 1.2rem; color: var(--muted, #6b7280); }
    .income-page details[open] .faq-question::after { content: '−'; }
    .income-page .faq-answer { padding: 0.75rem 1.25rem 1rem; margin: 0; font-size: 0.9rem; color: var(--muted2, #374151); line-height: 1.65; border-top: 1px solid rgba(0,0,0,0.06); }
    .income-page .author-section { background: var(--surface, #f9fafb); border-radius: 12px; padding: 1.5rem; border: 1px solid rgba(0,0,0,0.07); margin-bottom: 3rem; }
    .income-page .author-card { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 1rem; }
    .income-page .author-avatar { width: 44px; height: 44px; border-radius: 50%; background: #dcfce7; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; color: #166534; flex-shrink: 0; }
    .income-page .author-name { font-weight: 600; font-size: 0.95rem; margin-bottom: 2px; }
    .income-page .author-cred { font-size: 0.82rem; color: var(--muted, #6b7280); margin-bottom: 0.4rem; }
    .income-page .author-bio { font-size: 0.88rem; color: var(--muted2, #374151); margin: 0; line-height: 1.55; }
    .income-page .disclaimer { font-size: 0.8rem; color: var(--muted, #6b7280); margin: 0; line-height: 1.55; }
    .income-page .related-section { margin-bottom: 2rem; }
    .income-page .related-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 1rem; }
    .income-page .related-card { display: block; padding: 1.1rem 1.25rem; border: 1px solid rgba(0,0,0,0.1); border-radius: 12px; text-decoration: none; color: var(--fg, #111827); background: white; transition: border-color 0.15s, box-shadow 0.15s; }
    .income-page .related-card:hover { border-color: rgba(34,197,94,0.5); box-shadow: 0 2px 12px rgba(34,197,94,0.08); }
    .income-page .related-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 5px; }
    .income-page .related-desc { font-size: 0.83rem; color: var(--muted, #6b7280); line-height: 1.5; }
    @media (max-width: 600px) { .income-page { padding: 1.25rem 1rem 3rem; } .income-page .calculator-embed { padding: 1.25rem; } }
`;
