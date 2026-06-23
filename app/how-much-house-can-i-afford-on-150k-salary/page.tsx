// app/how-much-house-can-i-afford-on-150k-salary/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'How Much House Can I Afford on a $150k Salary? | HomeRates.ai',
    description:
        'On a $150,000 salary you can typically afford a home between $608,000–$840,000 depending on down payment and debts. Three real scenarios with monthly payment breakdown. 2026 rates.',
    keywords: [
        'how much house can i afford on 150k salary',
        'how much house can i afford on 150000 salary',
        'mortgage on 150k salary',
        '150k salary home affordability',
        'home buying on 150000 income',
    ],
    openGraph: {
        title: 'How Much House Can I Afford on a $150k Salary? | HomeRates.ai',
        description: 'See exactly how much home $150,000/year qualifies you for — three scenarios, live rates, monthly payment breakdown.',
        url: 'https://chat.homerates.ai/how-much-house-can-i-afford-on-150k-salary',
        siteName: 'HomeRates.ai',
        type: 'website',
    },
    alternates: { canonical: 'https://chat.homerates.ai/how-much-house-can-i-afford-on-150k-salary' },
};

const schemaFAQ = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
        {
            '@type': 'Question',
            name: 'How much house can I afford on a $150,000 salary?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'On a $150,000 salary with no existing debts, you can typically afford up to $670,000 with FHA (3.5% down) or $840,000 with conventional 20% down at 2026 rates (~6.75%). With $500/month in debts, your range drops to $608,000–$762,000. These figures apply Fannie Mae\'s 43% back-end DTI guideline.',
            },
        },
        {
            '@type': 'Question',
            name: 'Can I afford a $750,000 house on a $150k salary?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'With conventional 20% down ($150,000) and no debts, yes — PITI on $750,000 at 6.75% with 20% down is approximately $4,795/month, which is 38.4% DTI on $150k, within the 43% guideline. Note that $750,000 exceeds the 2026 conforming loan limit of $832,750 for a single-unit property in standard counties, so this may require a jumbo loan with a larger down payment (typically 20–25%).',
            },
        },
        {
            '@type': 'Question',
            name: 'What is the monthly mortgage payment on a $150k salary?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'At 43% DTI on a $150,000 salary, your maximum monthly housing payment is approximately $5,375. A comfortable 28–31% housing ratio on $150k is $3,500–$3,875/month. On a $670,000 FHA purchase with 3.5% down at 6.75%, the monthly PITI including MIP is about $5,373.',
            },
        },
        {
            '@type': 'Question',
            name: 'Does FHA make sense on a $150k salary?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'On a $150k salary, FHA makes sense if your credit score is below 680 or you have less than 5% saved. However, the 2026 FHA loan limit is $541,287 in standard counties — so on a $670,000 home, FHA isn\'t available unless you\'re in a high-cost area (limit up to $1,249,125). For most $150k earners buying in the $600k+ range, conventional with 5–20% down is the primary path.',
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
        { '@type': 'ListItem', position: 3, name: 'How Much House on $150k Salary', item: 'https://chat.homerates.ai/how-much-house-can-i-afford-on-150k-salary' },
    ],
};

const scenarios = [
    { debt: '$0/mo', fha: '$670k', fhaPmt: '$5,373', conv3: '$680k', conv3Pmt: '$5,375', conv20: '$840k', conv20Pmt: '$5,374' },
    { debt: '$300/mo', fha: '$633k', fhaPmt: '$5,076', conv3: '$642k', conv3Pmt: '$5,074', conv20: '$793k', conv20Pmt: '$5,073' },
    { debt: '$500/mo', fha: '$608k', fhaPmt: '$4,876', conv3: '$617k', conv3Pmt: '$4,877', conv20: '$762k', conv20Pmt: '$4,875' },
];

const faqs = [
    {
        q: 'How much house can I afford on a $150,000 salary?',
        a: 'With no debts: $670,000 FHA (3.5% down, high-cost areas only at this price) or $840,000 conventional 20% down at 2026 rates. With $500/month debts: $608,000–$762,000. Uses Fannie Mae 43% back-end DTI.',
    },
    {
        q: 'Can I afford a $750,000 house on $150k?',
        a: 'With 20% down and no debts, yes — PITI is ~$4,795/month, which is 38.4% DTI. Note: $750k may require a jumbo loan in standard counties (2026 conforming limit is $832,750). In high-cost CA counties the conforming limit reaches $1,249,125, making conventional financing available.',
    },
    {
        q: 'Does FHA make sense on a $150k salary?',
        a: 'At the $600k–$840k price range typical for $150k earners, FHA only works in high-cost counties (limit up to $1,249,125). In standard counties FHA maxes out at $541,287. Most $150k earners in this price range use conventional 5–20% down.',
    },
    {
        q: 'What monthly payment is comfortable on $150k?',
        a: 'The conservative 28% guideline puts comfortable housing at $3,500/month. The 31% guideline is $3,875/month. The 43% maximum is $5,375/month. Most high-income buyers target 25–30% to maintain savings rate and investment capacity.',
    },
];

export default function Income150kPage() {
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
                        <li aria-current="page">$150k Salary</li>
                    </ol>
                </nav>
                <section className="hero">
                    <h1>How Much House Can I Afford on a $150k Salary?</h1>
                    <p className="hero-lead">On a $150,000 annual income, you can typically qualify for a home between <strong>$608,000 and $840,000</strong> depending on your down payment, debts, and loan type. Here are the real numbers at 2026 rates.</p>
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
                        <a href="/?sq=I+make+%24150k+and+have+%2453k+saved%2C+no+debts" className="seed-chip">$53k saved, no debts</a>
                        <a href="/?sq=I+make+%24150k+and+have+%2453k+saved+with+a+%24500+car+payment" className="seed-chip">$53k saved, $500/mo car</a>
                        <a href="/?sq=I+make+%24150k+and+have+%24100k+saved%2C+no+debts" className="seed-chip">$100k saved, no debts</a>
                    </div>
                    <div className="cta-block">
                        <a href="/?sq=I+make+%24150%2C000+a+year+and+have+%2453%2C000+saved+%E2%80%94+how+much+house+can+I+afford%3F" className="cta-button">Calculate my affordability →</a>
                        <p className="cta-sub">Free · No login · Result in seconds</p>
                    </div>
                </section>
                <section className="example-table-section">
                    <h2>$150k salary — home affordability by debt load</h2>
                    <p className="section-lead">Assumes 6.75% rate · 30-year fixed · 43% back-end DTI · Taxes 1.1%/yr · Insurance 0.35%/yr. FHA figures apply in high-cost counties only above $541,287.</p>
                    <div className="example-table-wrapper">
                        <table className="example-table">
                            <thead>
                                <tr>
                                    <th>Monthly Debts</th>
                                    <th>FHA (3.5% down)*</th>
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
                    <p className="table-note">* FHA at these price points requires a high-cost county (limit up to $1,249,125). Standard county FHA limit is $541,287. Monthly payment includes P&I, taxes, insurance, and MIP/PMI. For educational purposes only.</p>
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
                        <p className="author-bio">Numbers calculated using Fannie Mae 43% DTI guidelines, live FRED 30-year rate data, and 2026 FHA/conforming loan limits.</p>
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
                        <Link href="/how-much-house-can-i-afford-on-120k-salary" className="related-card">
                            <div className="related-title">$120k Salary</div>
                            <div className="related-desc">How much house can you afford on a $120,000 annual income?</div>
                        </Link>
                        <Link href="/fha-calculator" className="related-card">
                            <div className="related-title">FHA Loan Calculator</div>
                            <div className="related-desc">Full FHA payment breakdown — MIP, UFMIP, DTI, and FHA vs conventional comparison.</div>
                        </Link>
                    </div>
                </section>
            </main>
            <style>{`
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
            `}</style>
        </>
    );
}
