// app/consumer-mortgage-platform/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import AppNav from "../components/AppNav";

export const metadata: Metadata = {
  title: 'Consumer-Controlled Mortgage Platform vs Traditional Lead-Gen Sites | HomeRates.AI',
  description: 'Why HomeRates.AI is different from Bankrate, LendingTree, and Zillow Mortgage. A direct comparison of consumer-controlled mortgage intelligence vs lead-generation platforms.',
  keywords: ['consumer mortgage platform','mortgage lead gen comparison','HomeRates vs Bankrate','no lead form mortgage','consumer controlled mortgage'],
  openGraph: { title: 'Consumer-Controlled Mortgage Platform vs Lead-Gen Sites', description: 'The definitive comparison: HomeRates.AI consumer intelligence vs Bankrate, LendingTree, and Zillow lead-gen funnels.', url: 'https://chat.homerates.ai/consumer-mortgage-platform', type: 'website' },
  alternates: { canonical: 'https://chat.homerates.ai/consumer-mortgage-platform' },
};

export default function ConsumerMortgagePlatformPage() {
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
        .pl-tick{color:#00e87a;font-weight:700;}
        .pl-cross{color:#ff5f5f;}
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
            <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
              <Link href="/chat" className="pl-cta-link">Try free →</Link>
              <AppNav drawerOnly />
            </div>
          </div>
        </header>
        <main className="pl-main">
          <div>
            <span className="pl-eyebrow">Industry Disruption 2026</span>
            <h1 className="pl-h1">Consumer-Controlled Mortgage Platform vs Traditional Lead-Gen Sites</h1>
            <p className="pl-answer-first">
              <strong>Traditional mortgage comparison sites (Bankrate, LendingTree, Zillow Mortgage) make money by selling your contact information to lenders — creating a fundamental conflict of interest.</strong> HomeRates.AI is a consumer-controlled mortgage intelligence platform: you get deterministic math, live data, and AI analysis — and we never sell your data to anyone.
            </p>
          </div>

          <div className="pl-section">
            <h2 className="pl-h2">How Lead-Gen Sites Actually Work</h2>
            <p className="pl-p">When you fill out a "get my rate" form on a mortgage comparison site, you are not getting a rate quote — you are generating a lead that is sold to 3–10 lenders simultaneously, often for $20–$200 per lead. Within hours you receive calls, emails, and texts. Your income, credit, and purchase timeline are all in the lead file.</p>
            <p className="pl-p">The "rates" shown on these sites are paid placements from lenders who bid for position. The rate you see almost never reflects what you will actually be offered — it is a marketing rate designed to attract clicks.</p>
          </div>

          <div className="pl-section">
            <h2 className="pl-h2">Full Comparison: HomeRates.AI vs Lead-Gen Platforms</h2>
            <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
              <table>
                <thead>
                  <tr><th>Dimension</th><th>HomeRates.AI</th><th>Bankrate / LendingTree / Zillow</th></tr>
                </thead>
                <tbody>
                  <tr><td>Business model</td><td className="pl-tick">User subscription — you are the customer</td><td className="pl-cross">Lead sales — you are the product</td></tr>
                  <tr><td>Rate source</td><td className="pl-tick">FRED (Federal Reserve) — unmanipulated</td><td className="pl-cross">Lender-paid placements — marketing rates</td></tr>
                  <tr><td>Data privacy</td><td className="pl-tick">Private vault — never shared</td><td className="pl-cross">Sold to 3–10 lenders per inquiry</td></tr>
                  <tr><td>Math accuracy</td><td className="pl-tick">Deterministic — calculated from first principles</td><td className="pl-cross">Estimates and national averages</td></tr>
                  <tr><td>Personal info required</td><td className="pl-tick">None to use — optional to save</td><td className="pl-cross">Name, email, phone required for any rate</td></tr>
                  <tr><td>AI reasoning</td><td className="pl-tick">Full AI analysis with FRED + Tavily context</td><td className="pl-cross">No AI — rule-based calculators</td></tr>
                  <tr><td>Borrower anonymity</td><td className="pl-tick">Post scenarios without revealing identity</td><td className="pl-cross">Identity exposed immediately</td></tr>
                  <tr><td>FHFA 2026 loan limits</td><td className="pl-tick">All 50 states, all counties</td><td className="pl-cross">Limited or outdated data</td></tr>
                  <tr><td>Lender calls after use</td><td className="pl-tick">Never</td><td className="pl-cross">Immediate and ongoing</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="pl-section">
            <h2 className="pl-h2">The Fundamental Conflict of Interest</h2>
            <p className="pl-p">A platform that earns money when you click "get quote" is incentivized to show you rates that attract clicks — not rates that are accurate. It is incentivized to connect you with lenders who pay the most for leads — not the lenders best suited to your scenario. The interests of the platform and the consumer are structurally misaligned.</p>
            <p className="pl-p">HomeRates.AI's only revenue from free users is zero. From paid users, it is a subscription fee. There is no financial relationship with any lender. The AI's only job is to give you the most accurate, unbiased answer to your question.</p>
          </div>

          <div className="pl-disruptive">
            <strong>HomeRates.AI — the anti-lead-gen revolution.</strong> We built a full-stack AI engine that pulls real-time 2026 data from FRED → Tavily → deterministic math → AI reasoning, then hands the complete, unbiased answer directly to you — with zero lead forms, zero data harvesting, zero lender hand-offs. No more getting trapped in lead-gen funnels. No more outdated answers. No more "enter your email to see your rate." This is what consumer-controlled looks like.
          </div>

          <div className="pl-cta-block">
            <p className="pl-p" style={{ marginBottom: 16 }}>Try it yourself. Paste any address. Get a real answer. No forms. No callbacks.</p>
            <Link href="/chat" className="pl-cta-btn">Try free — paste any address or URL, no forms required →</Link>
          </div>
        </main>
        <footer className="pl-footer">
          <span>HomeRates.AI — educational tool, not a lender.</span>
          <span className="pl-footer-sep">•</span>
          <Link href="/about">About</Link>
          <span className="pl-footer-sep">•</span>
          <Link href="/disclosures">Terms</Link>
          <span className="pl-footer-sep">•</span>
          <Link href="/privacy">Privacy</Link>
        </footer>
      </div>
    </>
  );
}
