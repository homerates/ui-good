// app/property-intelligence/page.tsx
// Marketing page — how the property intelligence pipeline works
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'How Property Intelligence Cards Work | HomeRates.AI',
  description: 'How HomeRates.AI uses Grok-4, Tavily AI search, Redfin data, and FRED rates to build a full Property Intelligence Card — PITI, loan zone, comps, market snapshot — in seconds.',
  alternates: { canonical: 'https://chat.homerates.ai/property-intelligence' },
};

const PIPELINE_STEPS = [
  {
    step: '01',
    source: 'Redfin',
    icon: '🏡',
    label: 'Property Data Extraction',
    color: '#38bdf8',
    description:
      'When you paste an address or Redfin URL, our server fetches the live Redfin listing page and extracts: list price, beds/baths, square footage, year built, days on market, HOA fees, and the agent\'s remarks. No API key required — direct server-side fetch with structured parsing.',
    facts: [
      'List price extracted with $50M cap to prevent data errors',
      'HOA fee parsed from listing remarks and structured fields',
      'Days on market used to score market heat (L2 signal)',
      'Address normalized for downstream FRED and AI lookups',
    ],
  },
  {
    step: '02',
    source: 'FRED',
    icon: '📊',
    label: 'Live Rate Sourcing',
    color: '#00e87a',
    description:
      'The Federal Reserve Economic Data (FRED) API delivers the current 30-year fixed mortgage rate, 15-year fixed rate, and 5/1 ARM index — pulled fresh on every request. These are the same rates the Fed publishes. Not lender-paid placements. Not sponsored quotes.',
    facts: [
      'PMMS series: 30-yr fixed weekly national average',
      'Rate spread calculated vs 10-yr Treasury',
      'No rate locked to a cache older than 24 hours',
      'FRED data is public — reproducible by anyone',
    ],
  },
  {
    step: '03',
    source: 'PITI Engine',
    icon: '🧮',
    label: 'Deterministic PITI Math',
    color: '#a78bfa',
    description:
      'With the price and the FRED rate in hand, our deterministic calculator builds the full monthly payment: Principal + Interest (amortization formula), Property Tax (0.9% annual default, county-adjusted), Homeowners Insurance (0.3%), and PMI if down payment < 20%. No AI guesswork — pure math.',
    facts: [
      'P&I: standard 360-payment amortization formula',
      'Tax: 0.9% annual ÷ 12 (overridden by county data where available)',
      'Insurance: 0.3% annual ÷ 12',
      'PMI: 0.85% annual if LTV > 80%, drops at 78% LTV',
    ],
  },
  {
    step: '04',
    source: 'Tavily',
    icon: '🔍',
    label: 'AI-Powered Web Search',
    color: '#fb923c',
    description:
      'Tavily\'s AI search API runs targeted queries for the subject property: recent comps, neighborhood trends, school ratings, walkability, local market conditions. Unlike a plain Google search, Tavily returns structured, citation-linked excerpts — not raw HTML. These feed directly into the Grok analysis.',
    facts: [
      'Queries: "[city] [zip] home sales 2025", "[neighborhood] market report"',
      'Returns top 5–8 cited excerpts per query',
      'School scores, transit scores, crime indices sourced from web',
      'Snippet length capped to control token cost in downstream AI call',
    ],
  },
  {
    step: '05',
    source: 'Grok-4',
    icon: '🤖',
    label: 'Deep AI Reasoning',
    color: '#f472b6',
    description:
      'The Redfin data, FRED rate, PITI result, and Tavily search excerpts are assembled into a structured prompt for Grok-4 via the xAI Responses API. Grok\'s native web_search tool can run additional real-time lookups mid-analysis. The output is a strict JSON object — not freeform prose.',
    facts: [
      'xAI Responses API: /v1/responses endpoint with grok-4 model',
      'Native web_search_preview tool for live lookups during reasoning',
      'Prompt mandates: 6 comps, PITI verification, Zillow views, market score',
      'JSON schema enforced — malformed output triggers structured fallback',
    ],
  },
  {
    step: '06',
    source: 'Intelligence Card',
    icon: '🎴',
    label: 'Structured Card Output',
    color: '#00e87a',
    description:
      'The validated JSON is rendered into a Property Intelligence Card — a structured, scannable artifact saved to your private vault. Every number is traceable to a source. Every score has a formula. Nothing is "AI-generated opinion" — it\'s computed signals presented clearly.',
    facts: [
      'PITI breakdown with individual line items',
      'Loan zone classification (Conforming / High-Balance / Jumbo)',
      'Track 5 scores: Affordability, Market Heat, Value Gap, Location',
      'Up to 6 comparable sales with price-per-sqft analysis',
    ],
  },
];

const CARD_OUTPUTS = [
  { label: 'Monthly PITI', detail: 'P+I+Tax+Insurance+PMI', icon: '💰' },
  { label: 'Loan Zone', detail: 'Conforming / High-Balance / Jumbo', icon: '📐' },
  { label: 'Track 5 Score', detail: '4 signals, weighted verdict', icon: '🎯' },
  { label: 'Comparable Sales', detail: 'Up to 6 recent comps w/ $/sqft', icon: '🏘️' },
  { label: 'Market Snapshot', detail: 'DOM, list-to-sale, absorption', icon: '📈' },
  { label: 'Rate Sensitivity', detail: 'Payment at ±0.5% rate scenarios', icon: '📉' },
  { label: 'Cash to Close', detail: 'Down + closing cost estimate', icon: '🏦' },
  { label: 'Location Signals', detail: 'Schools, walkability, appreciation', icon: '📍' },
];

export default function PropertyIntelligencePage() {
  return (
    <>
      <style>{`
        body:has(.pi-root){display:block!important;height:auto!important;overflow:visible!important;}
        html:has(.pi-root){height:auto!important;overflow:visible!important;}
        body:has(.pi-root) .app-footer{display:none!important;}
        .pi-root{min-height:100vh;width:100%;background:#080c12;color:#e0f0e8;
          font-family:var(--font-dm-sans,'DM Sans',sans-serif);
          display:flex;flex-direction:column;align-items:center;overflow-x:hidden;box-sizing:border-box;}
        .pi-root *{box-sizing:border-box;}

        /* Nav */
        .pi-header{position:sticky;top:0;z-index:50;width:100%;
          background:rgba(8,12,18,0.92);backdrop-filter:blur(12px);
          border-bottom:1px solid rgba(255,255,255,0.06);}
        .pi-header-inner{max-width:900px;margin:0 auto;padding:0 24px;height:56px;
          display:flex;align-items:center;justify-content:space-between;}
        .pi-logo-link{display:flex;align-items:center;text-decoration:none;}
        .pi-logo{height:26px;width:auto;}
        .pi-nav-links{display:flex;align-items:center;gap:24px;}
        .pi-nav-link{font-size:0.82rem;color:rgba(185,208,192,0.6);text-decoration:none;transition:color 0.15s;}
        .pi-nav-link:hover{color:#e0f0e8;}
        .pi-cta-link{display:inline-flex;align-items:center;gap:6px;font-size:0.82rem;
          font-weight:600;color:#00e87a;text-decoration:none;padding:6px 14px;
          border:1px solid rgba(0,232,122,0.3);border-radius:8px;transition:background 0.15s;}
        .pi-cta-link:hover{background:rgba(0,232,122,0.08);}

        /* Main */
        .pi-main{width:100%;max-width:900px;padding:56px 24px 80px;display:flex;flex-direction:column;gap:56px;}

        /* Hero */
        .pi-hero{text-align:center;}
        .pi-eyebrow{display:inline-block;font-size:0.72rem;font-weight:700;letter-spacing:0.1em;
          text-transform:uppercase;color:#00e87a;background:rgba(0,232,122,0.1);
          border:1px solid rgba(0,232,122,0.2);border-radius:6px;padding:4px 10px;margin-bottom:16px;}
        .pi-h1{font-size:clamp(2rem,4vw,2.8rem);font-weight:800;color:#f0f4ff;
          line-height:1.12;margin:0 0 16px;}
        .pi-subtitle{font-size:1rem;color:rgba(185,208,192,0.75);max-width:620px;
          margin:0 auto;line-height:1.7;}

        /* Source badges */
        .pi-sources{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:24px;}
        .pi-badge{font-size:0.72rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;
          padding:4px 10px;border-radius:6px;border:1px solid;}

        /* Pipeline section */
        .pi-section-label{font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;
          color:rgba(185,208,192,0.4);margin-bottom:20px;}
        .pi-pipeline{display:flex;flex-direction:column;gap:0;}

        .pi-step{display:flex;gap:24px;padding:28px 0;border-bottom:1px solid rgba(255,255,255,0.05);}
        .pi-step:last-child{border-bottom:none;}
        .pi-step-left{display:flex;flex-direction:column;align-items:center;gap:8px;flex-shrink:0;width:56px;}
        .pi-step-num{font-size:0.68rem;font-weight:800;letter-spacing:0.08em;color:rgba(185,208,192,0.3);}
        .pi-step-icon{font-size:1.8rem;}
        .pi-step-line{flex:1;width:1px;background:rgba(255,255,255,0.06);min-height:24px;}

        .pi-step-body{flex:1;min-width:0;}
        .pi-step-meta{display:flex;align-items:center;gap:10px;margin-bottom:8px;}
        .pi-step-source{font-size:0.72rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;
          padding:3px 8px;border-radius:5px;border:1px solid;}
        .pi-step-label{font-size:1rem;font-weight:700;color:#f0f4ff;}
        .pi-step-desc{font-size:0.9rem;color:rgba(185,208,192,0.75);line-height:1.7;margin-bottom:16px;}
        .pi-step-facts{display:flex;flex-direction:column;gap:6px;}
        .pi-step-fact{font-size:0.82rem;color:rgba(185,208,192,0.65);line-height:1.5;
          padding-left:16px;position:relative;}
        .pi-step-fact::before{content:'·';position:absolute;left:4px;color:rgba(0,232,122,0.5);}

        /* Card output grid */
        .pi-output-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;}
        .pi-output-item{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);
          border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:6px;}
        .pi-output-icon{font-size:1.3rem;}
        .pi-output-label{font-size:0.88rem;font-weight:700;color:#f0f4ff;}
        .pi-output-detail{font-size:0.78rem;color:rgba(185,208,192,0.6);line-height:1.5;}

        /* Vault section */
        .pi-vault{background:rgba(0,232,122,0.04);border:1px solid rgba(0,232,122,0.15);
          border-radius:16px;padding:28px 32px;display:flex;flex-direction:column;gap:14px;}
        .pi-vault-h{font-size:1.1rem;font-weight:800;color:#f0f4ff;}
        .pi-vault-p{font-size:0.9rem;color:rgba(185,208,192,0.75);line-height:1.7;margin:0;}
        .pi-vault-items{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;}
        .pi-vault-tag{font-size:0.75rem;font-weight:600;color:rgba(0,232,122,0.8);
          background:rgba(0,232,122,0.08);border:1px solid rgba(0,232,122,0.2);
          border-radius:6px;padding:4px 10px;}

        /* Why section */
        .pi-why-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;}
        .pi-why-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);
          border-radius:14px;padding:20px;}
        .pi-why-h{font-size:0.92rem;font-weight:700;color:#f0f4ff;margin-bottom:8px;}
        .pi-why-p{font-size:0.83rem;color:rgba(185,208,192,0.7);line-height:1.6;margin:0;}

        /* CTA */
        .pi-cta-block{text-align:center;padding:36px 24px;
          background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:16px;}
        .pi-cta-h{font-size:1.3rem;font-weight:800;color:#f0f4ff;margin:0 0 10px;}
        .pi-cta-p{font-size:0.92rem;color:rgba(185,208,192,0.7);margin:0 0 20px;line-height:1.6;}
        .pi-cta-btn{display:inline-flex;align-items:center;gap:8px;background:#00e87a;
          color:#080c12;font-size:0.95rem;font-weight:700;padding:14px 32px;
          border-radius:10px;text-decoration:none;transition:background 0.15s;}
        .pi-cta-btn:hover{background:#00ff8a;}
        .pi-cta-sub{font-size:0.78rem;color:rgba(185,208,192,0.4);margin-top:12px;}

        /* Footer */
        .pi-footer{width:100%;border-top:1px solid rgba(255,255,255,0.06);padding:20px 24px;
          display:flex;align-items:center;justify-content:center;flex-wrap:wrap;
          gap:8px;font-size:0.78rem;color:rgba(185,208,192,0.4);}
        .pi-footer a{color:rgba(0,232,122,0.5);text-decoration:none;}
        .pi-footer a:hover{color:#00e87a;}
        .pi-footer-sep{opacity:0.4;}

        @media(max-width:600px){
          .pi-step{flex-direction:column;gap:12px;}
          .pi-step-left{flex-direction:row;width:auto;}
          .pi-step-line{display:none;}
          .pi-nav-links .pi-nav-link{display:none;}
          .pi-output-grid{grid-template-columns:1fr 1fr;}
        }
      `}</style>

      <div className="pi-root">
        <header className="pi-header">
          <div className="pi-header-inner">
            <Link href="/" className="pi-logo-link">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.AI" className="pi-logo" />
            </Link>
            <nav className="pi-nav-links">
              <Link href="/platform" className="pi-nav-link">Platform</Link>
              <Link href="/track5-intelligence" className="pi-nav-link">Track 5</Link>
              <Link href="/chat" className="pi-cta-link">Try free →</Link>
            </nav>
          </div>
        </header>

        <main className="pi-main">

          {/* Hero */}
          <div className="pi-hero">
            <span className="pi-eyebrow">Property Intelligence</span>
            <h1 className="pi-h1">How We Build a Full<br />Intelligence Card in Seconds</h1>
            <p className="pi-subtitle">
              Paste any address. Six data sources fire in parallel. A structured Property Intelligence Card arrives — PITI, comps, Track 5 score, vault-stored — before you finish reading this sentence.
            </p>
            <div className="pi-sources">
              {[
                { label: 'Redfin', color: '#38bdf8' },
                { label: 'FRED', color: '#00e87a' },
                { label: 'Tavily AI', color: '#fb923c' },
                { label: 'Grok-4', color: '#f472b6' },
                { label: 'PITI Engine', color: '#a78bfa' },
                { label: 'Private Vault', color: '#34d399' },
              ].map(s => (
                <span
                  key={s.label}
                  className="pi-badge"
                  style={{ color: s.color, borderColor: s.color + '40', background: s.color + '12' }}
                >
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          {/* Pipeline */}
          <div>
            <div className="pi-section-label">The 6-Step Pipeline</div>
            <div className="pi-pipeline">
              {PIPELINE_STEPS.map((s, i) => (
                <div key={s.step} className="pi-step">
                  <div className="pi-step-left">
                    <span className="pi-step-num">{s.step}</span>
                    <span className="pi-step-icon">{s.icon}</span>
                    {i < PIPELINE_STEPS.length - 1 && <div className="pi-step-line" />}
                  </div>
                  <div className="pi-step-body">
                    <div className="pi-step-meta">
                      <span
                        className="pi-step-source"
                        style={{ color: s.color, borderColor: s.color + '40', background: s.color + '12' }}
                      >
                        {s.source}
                      </span>
                      <span className="pi-step-label">{s.label}</span>
                    </div>
                    <p className="pi-step-desc">{s.description}</p>
                    <div className="pi-step-facts">
                      {s.facts.map(f => (
                        <div key={f} className="pi-step-fact">{f}</div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card outputs */}
          <div>
            <div className="pi-section-label">What's in Every Intelligence Card</div>
            <div className="pi-output-grid">
              {CARD_OUTPUTS.map(o => (
                <div key={o.label} className="pi-output-item">
                  <span className="pi-output-icon">{o.icon}</span>
                  <div className="pi-output-label">{o.label}</div>
                  <div className="pi-output-detail">{o.detail}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Vault */}
          <div className="pi-vault">
            <div className="pi-vault-h">🔐 Every Card Saved to Your Private Vault</div>
            <p className="pi-vault-p">
              Signed in with your free account? Every Intelligence Card you generate is stored in your personal Supabase vault, authenticated via Clerk. Your data never touches an ad platform, never gets sold to a lender, and never trains a model. You can revisit any card, compare two properties side-by-side, and export to PDF — no re-running the pipeline.
            </p>
            <div className="pi-vault-items">
              {['Clerk auth', 'Row-level security', 'No lender access', 'PDF export', 'Side-by-side compare', 'No data selling'].map(t => (
                <span key={t} className="pi-vault-tag">{t}</span>
              ))}
            </div>
          </div>

          {/* Why section */}
          <div>
            <div className="pi-section-label">Why This Approach Is Different</div>
            <div className="pi-why-grid">
              {[
                {
                  h: 'No API keys or accounts needed',
                  p: 'You paste an address. We do the work. No Zillow account, no Redfin login, no manual data entry. Our server-side fetch handles everything.',
                },
                {
                  h: 'Math first, AI second',
                  p: 'PITI is computed with a deterministic formula — not estimated by AI. Grok reasons about context and market signals, but the numbers are always reproducible math.',
                },
                {
                  h: 'Every number has a source',
                  p: 'FRED rate: citable series ID. Redfin price: the live listing. Tavily excerpts: linked citations. Nothing comes from a black box.',
                },
                {
                  h: 'Zero lead generation',
                  p: 'Traditional "mortgage calculators" exist to capture your contact info and sell it to lenders. We have no lead forms. No lender relationships. No referral revenue.',
                },
              ].map(w => (
                <div key={w.h} className="pi-why-card">
                  <div className="pi-why-h">{w.h}</div>
                  <p className="pi-why-p">{w.p}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="pi-cta-block">
            <h2 className="pi-cta-h">See It Run on Any Property</h2>
            <p className="pi-cta-p">
              Paste any address or Redfin URL. The full 6-step pipeline fires instantly. Free. No email. No forms.
            </p>
            <Link href="/property-intel" className="pi-cta-btn">
              Generate a Property Intelligence Card →
            </Link>
            <p className="pi-cta-sub">Or try the full chat experience at <Link href="/chat" style={{ color: 'rgba(0,232,122,0.6)', textDecoration: 'none' }}>/chat</Link></p>
          </div>

        </main>

        <footer className="pi-footer">
          <span>HomeRates.AI — educational tool, not a lender or broker.</span>
          <span className="pi-footer-sep">•</span>
          <Link href="/platform">Platform</Link>
          <span className="pi-footer-sep">•</span>
          <Link href="/about">About</Link>
          <span className="pi-footer-sep">•</span>
          <Link href="/disclosures">Terms</Link>
          <span className="pi-footer-sep">•</span>
          <Link href="/privacy">Privacy</Link>
        </footer>
      </div>
    </>
  );
}
