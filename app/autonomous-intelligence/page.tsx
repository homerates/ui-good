// app/autonomous-intelligence/page.tsx
// Marketing explainer for the Autonomous Decision Score Engine
import type { Metadata } from 'next';
import Link from 'next/link';
import AppNav from '../components/AppNav';

export const metadata: Metadata = {
  title: 'Autonomous Decision Score — One URL, Full Intelligence Report | HomeRates.ai',
  description: 'Paste any Redfin or Zillow listing URL into chat. HomeRates automatically fires all four Track 5 levels — affordability, property value gap, market conditions, and location intelligence — in parallel. No buttons. No forms. One input, full Decision Score.',
  alternates: { canonical: 'https://chat.homerates.ai/autonomous-intelligence' },
};

const STEPS = [
  {
    num: '01',
    title: 'Paste any listing URL or address',
    body: 'Drop a Redfin link, a Zillow URL, or a plain street address into the chat. The engine recognises it instantly — no special command required.',
    accent: '#00e87a',
    icon: '🔗',
  },
  {
    num: '02',
    title: 'L1 + L2 compute in under 1 second',
    body: 'Your down payment and loan type are already in the session. The Financial Readiness score (L1) is calculated client-side from an LTV formula. The Property Value score (L2) compares the list price against the Redfin AVM — both resolve instantly.',
    accent: '#60a5fa',
    icon: '⚡',
  },
  {
    num: '03',
    title: 'L3 + L4 fire in the background — non-blocking',
    body: "Grok deep analysis runs in a background thread. It pulls live market conditions (days on market, sale-to-list ratio) and location intelligence (schools, walkability, transit, safety, wildfire risk). Your PITI card and affordability sliders appear at full speed — the background analysis doesn't slow anything down.",
    accent: '#a78bfa',
    icon: '🧠',
  },
  {
    num: '04',
    title: 'Decision Score assembles automatically',
    body: 'When all four levels resolve, the composite score (L1×35% + L2×25% + L3×25% + L4×15%) is computed and the card transitions from computing to complete — animated score ring, all four level bars, and a plain-language verdict.',
    accent: '#f59e0b',
    icon: '🎯',
  },
  {
    num: '05',
    title: '"Get Matched" unlocks with full context',
    body: 'Your session is saved with all L1–L4 scores attached. When you tap Get Matched, loan officers receive your complete analysis — not just a name and a price, but a full buying intelligence profile.',
    accent: '#00e87a',
    icon: '🤝',
  },
];

const VERDICTS = [
  { label: 'Strong Buy', range: '≥ 85', color: '#00e87a', desc: 'Excellent affordability, priced at or below market, strong location fundamentals.' },
  { label: 'Ready to Offer', range: '≥ 70', color: '#3d8bff', desc: 'Good across all levels — proceed with confidence.' },
  { label: 'Buy with Caution', range: '≥ 55', color: '#f59e0b', desc: 'One or two levels need attention. Negotiate on price or review the location factors.' },
  { label: 'Watch the Market', range: '≥ 40', color: '#ff8c42', desc: 'Multiple signals are weak. Consider waiting for a price reduction or a better market moment.' },
  { label: 'Hold Off', range: '< 40', color: '#ff5f5f', desc: 'The data recommends against this property at this price and in these conditions.' },
];

export default function AutonomousIntelligencePage() {
  return (
    <>
      <style>{`
        body:has(.ai-root){display:block!important;height:auto!important;overflow:visible!important;}
        html:has(.ai-root){height:auto!important;overflow:visible!important;}
        body:has(.ai-root) .app-footer{display:none!important;}
        .ai-root{min-height:100vh;width:100%;background:#080c12;color:#e0f0e8;
          font-family:var(--font-dm-sans,'DM Sans',sans-serif);
          display:flex;flex-direction:column;align-items:center;overflow-x:hidden;box-sizing:border-box;}
        .ai-root *{box-sizing:border-box;}

        /* Nav */
        .ai-header{position:sticky;top:0;z-index:50;width:100%;
          background:rgba(8,12,18,0.94);backdrop-filter:blur(12px);
          border-bottom:1px solid rgba(255,255,255,0.06);}
        .ai-header-inner{max-width:900px;margin:0 auto;padding:0 24px;height:56px;
          display:flex;align-items:center;justify-content:space-between;}
        .ai-logo-link{display:flex;align-items:center;text-decoration:none;}
        .ai-logo{height:26px;width:auto;}
        .ai-nav{display:flex;align-items:center;gap:20px;}
        .ai-nav-link{font-size:0.82rem;color:rgba(185,208,192,0.6);text-decoration:none;transition:color 0.15s;}
        .ai-nav-link:hover{color:#e0f0e8;}
        .ai-nav-cta{display:inline-flex;align-items:center;gap:6px;font-size:0.82rem;
          font-weight:600;color:#00e87a;text-decoration:none;padding:6px 14px;
          border:1px solid rgba(0,232,122,0.3);border-radius:8px;transition:background 0.15s;}
        .ai-nav-cta:hover{background:rgba(0,232,122,0.08);}

        /* Layout */
        .ai-main{width:100%;max-width:900px;padding:60px 24px 100px;display:flex;flex-direction:column;gap:60px;}

        /* Hero */
        .ai-hero{text-align:center;}
        .ai-eyebrow{display:inline-block;font-size:0.72rem;font-weight:700;letter-spacing:0.1em;
          text-transform:uppercase;color:#00e87a;background:rgba(0,232,122,0.08);
          border:1px solid rgba(0,232,122,0.2);border-radius:6px;padding:4px 10px;margin-bottom:16px;}
        .ai-h1{font-size:clamp(2rem,4.5vw,3.2rem);font-weight:900;color:#f0f4ff;
          line-height:1.08;margin:0 0 20px;letter-spacing:-0.02em;}
        .ai-subtitle{font-size:1.05rem;color:rgba(185,208,192,0.75);max-width:640px;
          margin:0 auto 28px;line-height:1.65;}
        .ai-hero-cta{display:inline-flex;align-items:center;gap:8px;background:#00e87a;
          color:#07100f;font-size:0.95rem;font-weight:800;padding:13px 28px;
          border-radius:10px;text-decoration:none;transition:background 0.15s;}
        .ai-hero-cta:hover{background:#00ff8a;}

        /* Pipeline diagram */
        .ai-pipeline{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;}
        .ai-pipeline-step{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);
          border-radius:12px;padding:14px 18px;text-align:center;min-width:120px;flex:1;max-width:160px;}
        .ai-pipeline-step.highlight{background:rgba(0,232,122,0.07);border-color:rgba(0,232,122,0.2);}
        .ai-pipeline-icon{font-size:1.4rem;margin-bottom:6px;}
        .ai-pipeline-label{font-size:0.75rem;font-weight:700;color:#f0f4ff;margin-bottom:3px;}
        .ai-pipeline-sub{font-size:0.68rem;color:rgba(185,208,192,0.55);line-height:1.4;}
        .ai-pipeline-arrow{font-size:1.2rem;color:rgba(0,232,122,0.35);flex-shrink:0;}

        /* Section labels */
        .ai-section-label{font-size:0.72rem;font-weight:700;letter-spacing:0.1em;
          text-transform:uppercase;color:#00e87a;margin-bottom:10px;}
        .ai-section-h2{font-size:clamp(1.4rem,3vw,2rem);font-weight:800;color:#f0f4ff;
          margin:0 0 14px;letter-spacing:-0.015em;line-height:1.2;}
        .ai-section-body{font-size:0.95rem;color:rgba(185,208,192,0.8);line-height:1.7;}

        /* Steps */
        .ai-steps{display:flex;flex-direction:column;gap:0;}
        .ai-step{display:flex;gap:20px;padding:24px 0;border-bottom:1px solid rgba(255,255,255,0.05);}
        .ai-step:last-child{border-bottom:none;}
        .ai-step-left{flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:0;}
        .ai-step-num{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;
          justify-content:center;font-size:0.75rem;font-weight:900;letter-spacing:0.04em;
          background:rgba(0,232,122,0.08);border:1px solid rgba(0,232,122,0.2);color:#00e87a;}
        .ai-step-icon{font-size:1.5rem;margin-top:8px;}
        .ai-step-right{flex:1;min-width:0;padding-top:8px;}
        .ai-step-title{font-size:1rem;font-weight:800;color:#f0f4ff;margin-bottom:6px;}
        .ai-step-body{font-size:0.88rem;color:rgba(185,208,192,0.8);line-height:1.7;}

        /* Verdict tiers */
        .ai-verdicts{display:flex;flex-direction:column;gap:10px;}
        .ai-verdict{display:flex;align-items:center;gap:14px;padding:12px 16px;
          background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);
          border-radius:12px;}
        .ai-verdict-badge{flex-shrink:0;width:44px;height:44px;border-radius:9px;
          display:flex;align-items:center;justify-content:center;
          font-size:0.72rem;font-weight:900;letter-spacing:0.04em;text-align:center;line-height:1.2;}
        .ai-verdict-info{flex:1;min-width:0;}
        .ai-verdict-label{font-size:0.9rem;font-weight:800;color:#f0f4ff;margin-bottom:2px;}
        .ai-verdict-range{font-size:0.72rem;font-weight:700;text-transform:uppercase;
          letter-spacing:0.07em;color:#94a3b8;margin-bottom:4px;}
        .ai-verdict-desc{font-size:0.82rem;color:rgba(185,208,192,0.7);line-height:1.5;}

        /* AI models */
        .ai-models-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;}
        .ai-model-card{background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);
          border-radius:12px;padding:18px;}
        .ai-model-icon{font-size:1.3rem;margin-bottom:8px;}
        .ai-model-name{font-size:0.85rem;font-weight:800;color:#f0f4ff;margin-bottom:2px;}
        .ai-model-role{font-size:0.7rem;font-weight:700;color:#00e87a;text-transform:uppercase;
          letter-spacing:0.07em;margin-bottom:6px;}
        .ai-model-detail{font-size:0.78rem;color:rgba(185,208,192,0.7);line-height:1.5;}

        /* Scoring weight bar */
        .ai-weights{display:flex;flex-direction:column;gap:8px;}
        .ai-weight-row{display:flex;align-items:center;gap:12px;}
        .ai-weight-label{font-size:0.8rem;font-weight:700;color:#f0f4ff;width:180px;flex-shrink:0;}
        .ai-weight-bar-bg{flex:1;height:8px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;}
        .ai-weight-bar-fill{height:100%;border-radius:4px;}
        .ai-weight-pct{font-size:0.78rem;font-weight:700;color:#94a3b8;width:36px;text-align:right;flex-shrink:0;}

        /* CTA */
        .ai-cta{text-align:center;padding:44px;
          background:rgba(0,232,122,0.04);border:1px solid rgba(0,232,122,0.15);border-radius:18px;}
        .ai-cta-h{font-size:1.4rem;font-weight:800;color:#f0f4ff;margin:0 0 10px;}
        .ai-cta-sub{font-size:0.92rem;color:rgba(185,208,192,0.7);margin:0 0 24px;line-height:1.6;}
        .ai-cta-btn{display:inline-flex;align-items:center;gap:8px;background:#00e87a;
          color:#07100f;font-size:0.95rem;font-weight:800;padding:14px 32px;
          border-radius:10px;text-decoration:none;transition:background 0.15s;}
        .ai-cta-btn:hover{background:#00ff8a;}
        .ai-cta-secondary{display:inline-flex;align-items:center;gap:6px;
          font-size:0.88rem;font-weight:600;color:rgba(185,208,192,0.6);text-decoration:none;
          margin-top:14px;transition:color 0.15s;}
        .ai-cta-secondary:hover{color:#e0f0e8;}

        /* Footer */
        .ai-footer{width:100%;border-top:1px solid rgba(255,255,255,0.06);padding:20px 24px;
          display:flex;align-items:center;justify-content:center;flex-wrap:wrap;
          gap:8px;font-size:0.78rem;color:rgba(185,208,192,0.4);}
        .ai-footer a{color:rgba(0,232,122,0.5);text-decoration:none;}
        .ai-footer a:hover{color:#00e87a;}

        @media(max-width:600px){
          .ai-nav .ai-nav-link{display:none;}
          .ai-pipeline{gap:4px;}
          .ai-pipeline-arrow{font-size:0.9rem;}
          .ai-pipeline-step{min-width:70px;padding:10px 10px;}
          .ai-models-grid{grid-template-columns:1fr 1fr;}
        }
      `}</style>

      <div className="ai-root">

        {/* Nav */}
        <header className="ai-header">
          <div className="ai-header-inner">
            <Link href="/" className="ai-logo-link">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" className="ai-logo" />
            </Link>
            <nav className="ai-nav">
              <Link href="/platform" className="ai-nav-link">Platform Intelligence</Link>
              <Link href="/track5-intelligence" className="ai-nav-link">Track 5</Link>
              <Link href="/chat" className="ai-nav-cta">Try it now →</Link>
              <AppNav drawerOnly />
            </nav>
          </div>
        </header>

        <main className="ai-main">

          {/* Hero */}
          <div className="ai-hero">
            <span className="ai-eyebrow">Autonomous Decision Score Engine</span>
            <h1 className="ai-h1">Paste a URL.<br />Get a full<br />buying intelligence report.</h1>
            <p className="ai-subtitle">
              Drop any Redfin or Zillow listing URL into the HomeRates chat. All four Track 5 levels fire automatically — affordability, property value, market conditions, and location intelligence. No forms. No buttons. No manual steps.
            </p>
            <Link href="/chat" className="ai-hero-cta">
              Try it — paste any listing URL →
            </Link>
          </div>

          {/* Pipeline visual */}
          <div>
            <div className="ai-section-label">How it works</div>
            <h2 className="ai-section-h2">URL → Four levels → One score</h2>
            <div className="ai-pipeline" style={{ marginTop: 24 }}>
              <div className="ai-pipeline-step highlight">
                <div className="ai-pipeline-icon">🔗</div>
                <div className="ai-pipeline-label">1 input</div>
                <div className="ai-pipeline-sub">Any listing URL or address</div>
              </div>
              <div className="ai-pipeline-arrow">→</div>
              <div className="ai-pipeline-step">
                <div className="ai-pipeline-icon">⚡</div>
                <div className="ai-pipeline-label">L1 + L2</div>
                <div className="ai-pipeline-sub">Instant — &lt;1 second</div>
              </div>
              <div className="ai-pipeline-arrow">+</div>
              <div className="ai-pipeline-step">
                <div className="ai-pipeline-icon">🧠</div>
                <div className="ai-pipeline-label">L3 + L4</div>
                <div className="ai-pipeline-sub">Background — 20–40s</div>
              </div>
              <div className="ai-pipeline-arrow">→</div>
              <div className="ai-pipeline-step highlight">
                <div className="ai-pipeline-icon">🎯</div>
                <div className="ai-pipeline-label">Decision Score</div>
                <div className="ai-pipeline-sub">0–100 composite verdict</div>
              </div>
            </div>
          </div>

          {/* Step-by-step */}
          <div>
            <div className="ai-section-label">The Sequence</div>
            <h2 className="ai-section-h2">What happens after you paste that URL</h2>
            <div className="ai-steps" style={{ marginTop: 24 }}>
              {STEPS.map(s => (
                <div key={s.num} className="ai-step">
                  <div className="ai-step-left">
                    <div className="ai-step-num">{s.num}</div>
                    <div className="ai-step-icon">{s.icon}</div>
                  </div>
                  <div className="ai-step-right">
                    <div className="ai-step-title">{s.title}</div>
                    <p className="ai-step-body">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scoring weights */}
          <div>
            <div className="ai-section-label">Composite Score</div>
            <h2 className="ai-section-h2">Weighted formula — same as Track 5</h2>
            <p className="ai-section-body" style={{ marginBottom: 24 }}>
              The autonomous engine uses the same four-level formula as the full Track 5 portal — just fired automatically instead of manually.
            </p>
            <div className="ai-weights">
              {[
                { label: 'L1 — Financial Readiness', pct: 35, color: '#00e87a' },
                { label: 'L2 — Property vs. Market', pct: 25, color: '#60a5fa' },
                { label: 'L3 — Market Conditions', pct: 25, color: '#a78bfa' },
                { label: 'L4 — Location Intelligence', pct: 15, color: '#f59e0b' },
              ].map(w => (
                <div key={w.label} className="ai-weight-row">
                  <div className="ai-weight-label">{w.label}</div>
                  <div className="ai-weight-bar-bg">
                    <div className="ai-weight-bar-fill" style={{ width: `${w.pct * 2.5}%`, background: w.color }} />
                  </div>
                  <div className="ai-weight-pct" style={{ color: w.color }}>{w.pct}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Verdict tiers */}
          <div>
            <div className="ai-section-label">Verdict Tiers</div>
            <h2 className="ai-section-h2">What the score actually tells you</h2>
            <div className="ai-verdicts" style={{ marginTop: 20 }}>
              {VERDICTS.map(v => (
                <div key={v.label} className="ai-verdict">
                  <div className="ai-verdict-badge" style={{ background: `${v.color}15`, border: `1px solid ${v.color}30`, color: v.color }}>
                    {v.range}
                  </div>
                  <div className="ai-verdict-info">
                    <div className="ai-verdict-label" style={{ color: v.color }}>{v.label}</div>
                    <div className="ai-verdict-desc">{v.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI models */}
          <div>
            <div className="ai-section-label">Intelligence Pipeline</div>
            <h2 className="ai-section-h2">Three AI models. One composite output.</h2>
            <p className="ai-section-body" style={{ marginBottom: 20 }}>
              No single model handles everything. The platform routes each level to the model best suited for it — then cross-validates before surfacing the score.
            </p>
            <div className="ai-models-grid">
              {[
                {
                  icon: '🏦',
                  name: 'FRED® Economic Data',
                  role: 'Live rate data',
                  detail: 'Federal Reserve H.15 release — the same 30-year conforming rate the market trades on. Injected into every L1 affordability calculation.',
                },
                {
                  icon: '🏠',
                  name: 'Redfin',
                  role: 'Property intelligence',
                  detail: 'List price, AVM (automated valuation), days on market, sale-to-list ratio, comparable sales. The source of truth for L2 and part of L3.',
                },
                {
                  icon: '🤖',
                  name: 'OpenAI',
                  role: 'Affordability + routing',
                  detail: 'PITI computation, scenario routing, natural language parameter extraction. Deterministic mortgage math at production scale.',
                },
                {
                  icon: '🧠',
                  name: 'Grok 4 by xAI',
                  role: 'Market + location synthesis',
                  detail: 'Deep analysis of L3 market conditions and L4 location factors — schools, crime, walkability, transit, wildfire, flood. Live web search via Grok Responses API.',
                },
              ].map(m => (
                <div key={m.name} className="ai-model-card">
                  <div className="ai-model-icon">{m.icon}</div>
                  <div className="ai-model-name">{m.name}</div>
                  <div className="ai-model-role">{m.role}</div>
                  <div className="ai-model-detail">{m.detail}</div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="ai-cta">
            <h2 className="ai-cta-h">Your next offer starts with one paste</h2>
            <p className="ai-cta-sub">
              No account required for the first search. Paste any Redfin or Zillow listing URL into the chat and watch the score assemble in real time.
            </p>
            <Link href="/chat" className="ai-cta-btn">
              Open the chat →
            </Link>
            <div>
              <Link href="/track5" className="ai-cta-secondary">
                Explore the full Track 5 portal ↗
              </Link>
            </div>
          </div>

        </main>

        {/* Footer */}
        <footer className="ai-footer">
          <span>© 2026 HomeRates.ai</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <Link href="/terms">Terms</Link>
          <span style={{ opacity: 0.4 }}>·</span>
          <Link href="/privacy">Privacy</Link>
          <span style={{ opacity: 0.4 }}>·</span>
          <Link href="/disclosures">Disclosures</Link>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>
            Powered by{' '}
            <a href="https://fred.stlouisfed.org" target="_blank" rel="noopener noreferrer">FRED® Data</a>
            {' '}— Federal Reserve Bank of St. Louis.{' '}
            Intelligence pipeline built on multi-model AI orchestration: OpenAI · Grok by xAI · Claude by Anthropic.
          </span>
        </footer>

      </div>
    </>
  );
}
