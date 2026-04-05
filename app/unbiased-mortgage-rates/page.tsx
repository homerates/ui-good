// app/unbiased-mortgage-rates/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Unbiased Mortgage Rates and Affordability Tool 2026 | HomeRates.AI',
  description: 'Get unbiased 2026 mortgage rates from FRED data and run real affordability scenarios — PITI, DTI, cash-to-close. No lead forms, no lender referrals, no data harvesting.',
  keywords: ['unbiased mortgage rates 2026','mortgage affordability tool','PITI calculator','mortgage rate tool no lead gen','real mortgage rates FRED'],
  openGraph: { title: 'Unbiased Mortgage Rates and Affordability Tool 2026', description: 'Live FRED mortgage rates + deterministic PITI and affordability math. No lead forms. No lender referrals.', url: 'https://chat.homerates.ai/unbiased-mortgage-rates', type: 'website' },
  alternates: { canonical: 'https://chat.homerates.ai/unbiased-mortgage-rates' },
};

export default function UnbiasedMortgageRatesPage() {
  return (
    <>
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
        table{width:100%;border-collapse:collapse;font-size:0.88rem;}
        th{background:rgba(255,255,255,0.05);color:#e0f0e8;font-weight:600;padding:10px 14px;text-align:left;border-bottom:1px solid rgba(255,255,255,0.08);}
        td{padding:10px 14px;color:#a0c0a8;border-bottom:1px solid rgba(255,255,255,0.04);}
        tr:last-child td{border-bottom:none;}
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
            <Link href="/chat" className="pl-cta-link">Get live rates →</Link>
          </div>
        </header>
        <main className="pl-main">
          <div>
            <span className="pl-eyebrow">Live FRED Data 2026</span>
            <h1 className="pl-h1">Unbiased Mortgage Rates and Affordability Tool 2026</h1>
            <p className="pl-answer-first">
              <strong>HomeRates.AI pulls live 30-year and 15-year mortgage rates directly from the Federal Reserve (FRED) and runs deterministic PITI affordability math on any scenario.</strong> No lender partnerships, no rate manipulation, no lead forms. The rate you see is the FRED weekly average — the same benchmark published by the U.S. government.
            </p>
          </div>

          <div className="pl-section">
            <h2 className="pl-h2">Why Most Mortgage Rate Tools Are Biased</h2>
            <p className="pl-p">Sites like Bankrate, NerdWallet, and LendingTree display "rates" from lenders who pay to be featured. A lender's displayed rate is often a best-case scenario that requires high credit scores, large down payments, and no points — conditions most borrowers don't meet. These sites earn revenue when you click "Get Quote" and submit your information.</p>
            <p className="pl-p">HomeRates.AI uses the FRED weekly mortgage rate average — the most authoritative, unmanipulated benchmark available. We then add scenario-specific premiums (high-balance, jumbo, investor) to give you a realistic rate for your actual loan type.</p>
          </div>

          <div className="pl-section">
            <h2 className="pl-h2">Rate Components Explained (2026)</h2>
            <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
              <table>
                <thead><tr><th>Loan Type</th><th>Base (FRED)</th><th>Typical Premium</th><th>What Drives the Spread</th></tr></thead>
                <tbody>
                  <tr><td>Standard Conforming (≤$832,750)</td><td>FRED 30yr avg</td><td>0%</td><td>Fannie/Freddie GSE backing — lowest risk</td></tr>
                  <tr><td>High-Balance Conforming</td><td>FRED 30yr avg</td><td>+0.25–0.40%</td><td>Above national baseline, still GSE-backed</td></tr>
                  <tr><td>Jumbo (above county limit)</td><td>FRED 30yr avg</td><td>+0.40–0.75%</td><td>No GSE backing, held on lender balance sheet</td></tr>
                  <tr><td>FHA 30-Year</td><td>FRED 30yr avg</td><td>+0.10–0.25%</td><td>MIP adds cost; FHA backing reduces default risk</td></tr>
                  <tr><td>DSCR Investor</td><td>FRED 30yr avg</td><td>+1.00–2.00%</td><td>Investment risk premium; no income qualification</td></tr>
                  <tr><td>15-Year Conforming</td><td>FRED 15yr avg</td><td>−0.50–0.75% vs 30yr</td><td>Shorter duration = lower rate</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="pl-section">
            <h2 className="pl-h2">What HomeRates.AI Calculates</h2>
            <p className="pl-p">For any mortgage scenario, HomeRates.AI computes:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {['Monthly P&I payment','Estimated property tax','Homeowner\'s insurance','PMI (if LTV > 80%)','Total monthly PITI','Annual income needed (28% / 36% DTI)','Cash to close (down payment + closing costs)','Rate sensitivity (±0.5% scenarios)'].map(item => (
                <div key={item} style={{ background: 'rgba(0,232,122,0.04)', border: '1px solid rgba(0,232,122,0.12)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', color: '#a0c0a8' }}>
                  ✓ {item}
                </div>
              ))}
            </div>
          </div>

          <div className="pl-disruptive">
            <strong>The FRED difference:</strong> When you ask HomeRates.AI "what is the current mortgage rate?" you get the Federal Reserve's weekly published average — not a teaser rate from a lender paying for placement. That is the only honest starting point for any mortgage conversation.
          </div>

          <div className="pl-cta-block">
            <p className="pl-p" style={{ marginBottom: 16 }}>See the current FRED rate and run your affordability scenario — free, no email required.</p>
            <Link href="/chat" className="pl-cta-btn">Try free — paste any address or URL, no forms required →</Link>
          </div>
        </main>
        <footer className="pl-footer">
          <span>HomeRates.AI — educational tool, not a lender.</span>
          <span className="pl-footer-sep">•</span>
          <Link href="/loan-limits">Loan Limits 2026</Link>
          <span className="pl-footer-sep">•</span>
          <Link href="/disclosures">Terms</Link>
          <span className="pl-footer-sep">•</span>
          <Link href="/privacy">Privacy</Link>
        </footer>
      </div>
    </>
  );
}
