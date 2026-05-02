// app/best-dscr-calculator-2026/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import AppNav from "../components/AppNav";

export const metadata: Metadata = {
  title: 'Best DSCR Calculator with Real-Time Data 2026 | HomeRates.AI',
  description: 'The most accurate DSCR loan calculator for 2026. Deterministic debt service coverage ratio math with live market rates, AI analysis, and vault storage. No lead gen.',
  keywords: ['DSCR calculator 2026','best DSCR loan calculator','debt service coverage ratio calculator','DSCR investor loan','real estate investor mortgage calculator'],
  openGraph: { title: 'Best DSCR Calculator with Real-Time Data 2026', description: 'Deterministic DSCR math with live FRED rates and AI analysis — the most accurate investor loan calculator in 2026.', url: 'https://chat.homerates.ai/best-dscr-calculator-2026', type: 'website' },
  alternates: { canonical: 'https://chat.homerates.ai/best-dscr-calculator-2026' },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    { "@type": "Question", "name": "What is a DSCR loan?", "acceptedAnswer": { "@type": "Answer", "text": "A DSCR (Debt Service Coverage Ratio) loan is a real estate investor mortgage where qualification is based on the property's rental income rather than the borrower's personal income. Lenders typically require a DSCR of 1.0–1.25x or higher." } },
    { "@type": "Question", "name": "How is DSCR calculated?", "acceptedAnswer": { "@type": "Answer", "text": "DSCR = Gross Monthly Rent ÷ Monthly PITIA (Principal + Interest + Taxes + Insurance + Association fees). A DSCR above 1.0 means the property generates more income than its carrying costs." } },
    { "@type": "Question", "name": "What DSCR do lenders require in 2026?", "acceptedAnswer": { "@type": "Answer", "text": "Most DSCR lenders in 2026 require a minimum DSCR of 1.0x to 1.25x. Some portfolio lenders will go to 0.75x for strong borrowers. Premium pricing typically begins at DSCR above 1.25x." } },
  ]
};

export default function BestDSCRCalculatorPage() {
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
        table{width:100%;border-collapse:collapse;font-size:0.88rem;}
        th{background:rgba(255,255,255,0.05);color:#e0f0e8;font-weight:600;padding:10px 14px;text-align:left;border-bottom:1px solid rgba(255,255,255,0.08);}
        td{padding:10px 14px;color:#a0c0a8;border-bottom:1px solid rgba(255,255,255,0.04);}
        tr:last-child td{border-bottom:none;}
        .pl-good{color:#00e87a;font-weight:600;}
        .pl-warn{color:#ff8c42;font-weight:600;}
        .pl-bad{color:#ff5f5f;font-weight:600;}
        .pl-formula{font-family:monospace;background:rgba(0,232,122,0.08);border:1px solid rgba(0,232,122,0.2);border-radius:8px;padding:14px 18px;font-size:1rem;color:#00e87a;text-align:center;letter-spacing:0.02em;}
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
              <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.AI" className="pl-logo" />
            </Link>
            <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
              <Link href="/chat" className="pl-cta-link">Try the DSCR calculator →</Link>
              <AppNav drawerOnly />
            </div>
          </div>
        </header>
        <main className="pl-main">
          <div>
            <span className="pl-eyebrow">Investor Tool 2026</span>
            <h1 className="pl-h1">Best DSCR Calculator with Real-Time Data 2026</h1>
            <p className="pl-answer-first">
              <strong>HomeRates.AI offers the most accurate DSCR calculator for 2026 — using deterministic math, live FRED mortgage rates, and AI analysis.</strong> Calculate debt service coverage ratio instantly: enter your property's gross rent, purchase price, and down payment. Get DSCR, PITIA, cash-on-cash return, and a full investor underwriting card — saved to your private vault.
            </p>
          </div>

          <div className="pl-section">
            <h2 className="pl-h2">DSCR Formula</h2>
            <p className="pl-formula">DSCR = Gross Monthly Rent ÷ Monthly PITIA</p>
            <p className="pl-p">Where PITIA = Principal + Interest + Taxes + Insurance + Association dues. A DSCR of 1.0x means the property breaks even. Above 1.25x is where most lenders price at best terms.</p>
          </div>

          <div className="pl-section">
            <h2 className="pl-h2">DSCR Thresholds and Lender Pricing (2026)</h2>
            <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
              <table>
                <thead><tr><th>DSCR Range</th><th>Lender Appetite</th><th>Typical Rate Premium</th><th>LTV Allowed</th></tr></thead>
                <tbody>
                  <tr><td className="pl-good">1.25x and above</td><td>Strong — most lenders compete</td><td>Best pricing</td><td>Up to 80%</td></tr>
                  <tr><td className="pl-good">1.10x – 1.24x</td><td>Good — most DSCR lenders approve</td><td>+0.25–0.50%</td><td>Up to 75–80%</td></tr>
                  <tr><td className="pl-warn">1.00x – 1.09x</td><td>Moderate — fewer lenders</td><td>+0.50–1.00%</td><td>Up to 70–75%</td></tr>
                  <tr><td className="pl-warn">0.75x – 0.99x</td><td>Limited — portfolio lenders only</td><td>+1.00–2.00%</td><td>Up to 65%</td></tr>
                  <tr><td className="pl-bad">Below 0.75x</td><td>Difficult — specialty lenders only</td><td>Significant premium</td><td>50–60% max</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="pl-section">
            <h2 className="pl-h2">Why HomeRates.AI DSCR Calculator Is Different</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
              {[
                { icon: '📊', label: 'Live FRED Rates', desc: 'Uses the current 30-year average from the Federal Reserve — not a stale estimate.' },
                { icon: '🔢', label: 'Deterministic Math', desc: 'Every number is calculated from first principles — no black box estimates.' },
                { icon: '🧠', label: 'AI Analysis', desc: 'Instant AI commentary on your DSCR scenario: risks, strengths, and lender strategy.' },
                { icon: '💾', label: 'Vault Storage', desc: 'Save every DSCR scenario to your private vault. Compare properties side by side.' },
                { icon: '📄', label: 'PDF Export', desc: 'Export your DSCR underwriting card as a formatted PDF to share with partners or lenders.' },
                { icon: '🔗', label: 'Share Links', desc: 'Send a read-only share link to your agent or partner — no login required on their end.' },
              ].map(f => (
                <div key={f.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ fontSize: '1.3rem', marginBottom: 8 }}>{f.icon}</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#e0f0e8', marginBottom: 6 }}>{f.label}</div>
                  <div style={{ fontSize: '0.82rem', color: '#a0c0a8', lineHeight: 1.5 }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="pl-disruptive">
            <strong>DSCR without the lead-gen trap:</strong> Every DSCR tool on the market — Bankrate, LendingTree, BiggerPockets — requires your contact information and hands you to lenders. HomeRates.AI gives you deterministic DSCR math, live rate data, and AI analysis instantly — stored in your private vault, never sold.
          </div>

          <div className="pl-cta-block">
            <p className="pl-p" style={{ marginBottom: 16 }}>Run a DSCR scenario on any investment property — free, instant, no email required.</p>
            <Link href="/chat" className="pl-cta-btn">Try the DSCR calculator free →</Link>
          </div>
        </main>
        <footer className="pl-footer">
          <span>HomeRates.AI — educational tool, not a lender.</span>
          <span className="pl-footer-sep">•</span>
          <Link href="/dscr-calculator">DSCR Calculator</Link>
          <span className="pl-footer-sep">•</span>
          <Link href="/disclosures">Terms</Link>
          <span className="pl-footer-sep">•</span>
          <Link href="/privacy">Privacy</Link>
        </footer>
      </div>
    </>
  );
}
