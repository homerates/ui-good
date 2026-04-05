// app/compare-mortgage-quotes/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'How to Compare Mortgage Quotes Without Getting Sold | HomeRates.AI',
  description: 'A practical guide to comparing mortgage quotes without entering lead-gen funnels. Side-by-side template, red flags checklist, and how to use your own Intelligence Card.',
  keywords: ['compare mortgage quotes','how to compare mortgage rates','mortgage quote comparison template','avoid mortgage lead gen','unbiased mortgage comparison'],
  openGraph: { title: 'How to Compare Mortgage Quotes Without Getting Sold', description: 'Step-by-step guide to comparing mortgage quotes on your terms — no lead forms, no callbacks, no pressure.', url: 'https://chat.homerates.ai/compare-mortgage-quotes', type: 'website' },
  alternates: { canonical: 'https://chat.homerates.ai/compare-mortgage-quotes' },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "How to Compare Mortgage Quotes Without Getting Sold",
  "description": "A step-by-step process for comparing mortgage quotes without entering lead-gen funnels or being pressured by lenders.",
  "step": [
    { "@type": "HowToStep", "name": "Run your own numbers first", "text": "Use HomeRates.AI to calculate your PITI, down payment, and loan-to-value before contacting any lender. Know your numbers before they know yours." },
    { "@type": "HowToStep", "name": "Request a Loan Estimate (LE)", "text": "Ask every lender for a standardized CFPB Loan Estimate. This is a legal document — lenders must provide it within 3 business days of application." },
    { "@type": "HowToStep", "name": "Compare APR, not just rate", "text": "The interest rate is only part of the cost. APR includes origination fees, discount points, and other lender charges. Always compare APR." },
    { "@type": "HowToStep", "name": "Check Section A on the LE", "text": "Section A of the Loan Estimate shows origination charges. This is where lenders hide fees. Compare line by line." },
    { "@type": "HowToStep", "name": "Ask the neutral checklist questions", "text": "Use HomeRates.AI's 'Questions to Ask Any Lender' checklist — rate lock period, prepayment penalty, float-down option, servicing transfer policy." },
  ]
};

export default function CompareMortgageQuotesPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style>{`
        body:has(.ps-root){display:block!important;height:auto!important;overflow:visible!important;}
        html:has(.ps-root){height:auto!important;overflow:visible!important;}
        body:has(.ps-root) .app-footer{display:none!important;}
        .ps-root{min-height:100vh;width:100%;background:#080c12;color:#e0f0e8;font-family:var(--font-dm-sans,'DM Sans',sans-serif);display:flex;flex-direction:column;align-items:center;overflow-x:hidden;box-sizing:border-box;}
        .ps-root *{box-sizing:border-box;}
        .pl-header{position:sticky;top:0;z-index:50;width:100%;background:rgba(8,12,18,0.92);backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,0.06);}
        .pl-header-inner{max-width:860px;margin:0 auto;padding:0 24px;height:56px;display:flex;align-items:center;justify-content:space-between;}
        .pl-logo-link{display:flex;align-items:center;text-decoration:none;}
        .pl-logo{height:26px;width:auto;}
        .pl-cta-link{display:inline-flex;align-items:center;gap:6px;font-size:0.82rem;font-weight:600;color:#00e87a;text-decoration:none;padding:6px 14px;border:1px solid rgba(0,232,122,0.3);border-radius:8px;transition:background 0.15s;}
        .pl-cta-link:hover{background:rgba(0,232,122,0.08);}
        .pl-main{width:100%;max-width:860px;padding:48px 24px 80px;display:flex;flex-direction:column;gap:40px;}
        .pl-eyebrow{font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#00e87a;background:rgba(0,232,122,0.1);border:1px solid rgba(0,232,122,0.2);border-radius:6px;padding:4px 10px;display:inline-block;margin-bottom:12px;}
        .pl-h1{font-size:clamp(1.8rem,4vw,2.8rem);font-weight:800;color:#f0f4ff;line-height:1.15;margin:0 0 16px;}
        .pl-answer-first{font-size:1.05rem;line-height:1.65;color:#a0c0a8;background:rgba(0,232,122,0.05);border-left:3px solid #00e87a;padding:16px 20px;border-radius:0 10px 10px 0;margin-bottom:8px;}
        .pl-h2{font-size:1.35rem;font-weight:700;color:#f0f4ff;margin:0 0 14px;}
        .pl-p{font-size:0.95rem;line-height:1.7;color:#a0c0a8;margin:0 0 12px;}
        .pl-section{display:flex;flex-direction:column;gap:12px;}
        ol.pl-steps{padding-left:0;list-style:none;display:flex;flex-direction:column;gap:10px;}
        ol.pl-steps li{display:flex;gap:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px 18px;}
        .pl-step-num{font-size:1rem;font-weight:800;color:#00e87a;flex-shrink:0;width:24px;}
        .pl-step-text{font-size:0.9rem;line-height:1.6;color:#a0c0a8;}
        .pl-step-text strong{color:#e0f0e8;}
        table{width:100%;border-collapse:collapse;font-size:0.88rem;}
        th{background:rgba(255,255,255,0.05);color:#e0f0e8;font-weight:600;padding:10px 14px;text-align:left;border-bottom:1px solid rgba(255,255,255,0.08);}
        td{padding:10px 14px;color:#a0c0a8;border-bottom:1px solid rgba(255,255,255,0.04);}
        tr:last-child td{border-bottom:none;}
        .pl-red{color:#ff5f5f;font-weight:600;}
        .pl-disruptive{background:rgba(0,232,122,0.05);border:1px solid rgba(0,232,122,0.15);border-radius:16px;padding:28px 32px;font-size:0.95rem;line-height:1.7;color:#a0c0a8;}
        .pl-disruptive strong{color:#00e87a;}
        .pl-cta-block{text-align:center;padding:32px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:16px;}
        .pl-cta-btn{display:inline-flex;align-items:center;gap:8px;background:#00e87a;color:#080c12;font-size:0.95rem;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;transition:background 0.15s;}
        .pl-cta-btn:hover{background:#00ff8a;}
        .pl-footer{width:100%;border-top:1px solid rgba(255,255,255,0.06);padding:20px 24px;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;font-size:0.78rem;color:rgba(185,208,192,0.4);}
        .pl-footer a{color:rgba(0,232,122,0.5);text-decoration:none;}
        .pl-footer a:hover{color:#00e87a;}
        .pl-footer-sep{opacity:0.4;}
      `}</style>
      <div className="ps-root">
        <header className="pl-header">
          <div className="pl-header-inner">
            <Link href="/" className="pl-logo-link">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.AI" className="pl-logo" />
            </Link>
            <Link href="/chat" className="pl-cta-link">Run your numbers free →</Link>
          </div>
        </header>
        <main className="pl-main">
          <div>
            <span className="pl-eyebrow">Consumer Guide 2026</span>
            <h1 className="pl-h1">How to Compare Mortgage Quotes Without Getting Sold</h1>
            <p className="pl-answer-first">
              <strong>To compare mortgage quotes objectively: run your own PITI calculation first, request a standardized CFPB Loan Estimate from each lender, compare APR (not just rate), and scrutinize Section A origination charges line by line.</strong> Never use a comparison site that asks for your contact information — you will be sold as a lead.
            </p>
          </div>

          <div className="pl-section">
            <h2 className="pl-h2">Step-by-Step: Compare Without the Pressure</h2>
            <ol className="pl-steps">
              {[
                ['Know your numbers before they know yours', 'Run PITI, affordability, and loan-to-value on HomeRates.AI before contacting any lender. Walk in with a fully-formed Intelligence Card — not a blank slate they can fill in.'],
                ['Request a Loan Estimate (LE) from every lender', 'The CFPB Loan Estimate is a standardized legal document. Lenders must provide it within 3 business days of application. Do not compare based on verbal quotes — get the LE.'],
                ['Compare APR, not just interest rate', 'The interest rate is one component. APR includes origination fees, points bought, and other charges. A lower rate with high fees often costs more overall.'],
                ['Read Section A of the Loan Estimate', 'Section A (Origination Charges) is where fees hide. Compare this line by line across lenders — not the total closing cost, which includes taxes and title that are the same everywhere.'],
                ['Lock rate timing and float-down options', 'Ask each lender: How long is the rate lock? Is there a float-down option if rates drop before closing? What is the fee to extend the lock?'],
                ['Ask about servicing transfer policy', 'Many lenders sell your mortgage to another servicer within 90 days. Ask: Do you retain servicing? If not, who are your typical servicers?'],
              ].map(([title, desc], i) => (
                <li key={i}>
                  <span className="pl-step-num">{i + 1}</span>
                  <span className="pl-step-text"><strong>{title}</strong><br />{desc}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="pl-section">
            <h2 className="pl-h2">Loan Estimate Comparison Template (2026)</h2>
            <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
              <table>
                <thead><tr><th>Line Item</th><th>Lender A</th><th>Lender B</th><th>Lender C</th></tr></thead>
                <tbody>
                  {[
                    'Interest Rate', 'APR', 'Section A: Origination Charges', 'Discount Points',
                    'Monthly P&I', 'Estimated Monthly PITI', 'Total Closing Costs',
                    'Lender Credits', 'Cash to Close', 'Rate Lock Period', 'Float-Down Option',
                  ].map(row => (
                    <tr key={row}><td>{row}</td><td style={{ color: 'rgba(255,255,255,0.15)' }}>—</td><td style={{ color: 'rgba(255,255,255,0.15)' }}>—</td><td style={{ color: 'rgba(255,255,255,0.15)' }}>—</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="pl-p" style={{ fontSize: '0.82rem' }}>Print this template and fill it in for each lender. Ask HomeRates.AI to pre-calculate the P&amp;I row for each scenario.</p>
          </div>

          <div className="pl-section">
            <h2 className="pl-h2">Red Flags to Watch For</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                '"Enter your info and we\'ll find you the best rate" — this is a lead-gen form, not a tool.',
                'A lender won\'t give you a Loan Estimate before you apply — they\'re hiding something.',
                'APR is not disclosed upfront — they want you focused only on the teaser rate.',
                'Section A origination charges over 1% of loan amount without a correspondingly lower rate.',
                'A "no-closing-cost" loan with a rate above market — the costs are in the rate.',
                'Pressure to "lock today or the rate disappears" — this is a sales tactic, not market reality.',
              ].map((flag, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 16px', background: 'rgba(255,95,95,0.04)', border: '1px solid rgba(255,95,95,0.12)', borderRadius: 10 }}>
                  <span className="pl-red">⚠</span>
                  <span className="pl-p" style={{ margin: 0, fontSize: '0.88rem' }}>{flag}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pl-disruptive">
            <strong>The right approach:</strong> Run your Intelligence Card on HomeRates.AI first. Walk into every lender conversation knowing your exact PITI, your loan zone (conforming / high-balance / jumbo), your DTI, and your cash-to-close. You are the informed party. They are competing for your business.
          </div>

          <div className="pl-cta-block">
            <p className="pl-p" style={{ marginBottom: 16 }}>Build your Intelligence Card before you talk to any lender.</p>
            <Link href="/chat" className="pl-cta-btn">Try free — paste any address or URL, no forms required →</Link>
          </div>
        </main>
        <footer className="pl-footer">
          <span>HomeRates.AI — educational tool, not a lender.</span>
          <span className="pl-footer-sep">•</span>
          <Link href="/disclosures">Terms</Link>
          <span className="pl-footer-sep">•</span>
          <Link href="/privacy">Privacy</Link>
        </footer>
      </div>
    </>
  );
}
