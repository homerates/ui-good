// app/decision-score/page.tsx
// Marketing / explainer page — the full end-to-end buyer journey: Scenario → Check Property → Property Intelligence → Decision Score
import type { Metadata } from 'next';
import Link from 'next/link';
import AppNav from '../components/AppNav';

export const metadata: Metadata = {
  title: 'Decision Score — From First Number to Final Verdict | HomeRates.AI',
  description: 'How HomeRates.AI takes you from a single loan scenario all the way to a data-grounded buying decision. Four scored intelligence layers — affordability, market conditions, value gap, and location — converge into one verdict: Buy, Wait, or Walk Away.',
  alternates: { canonical: 'https://chat.homerates.ai/decision-score' },
};

const STEPS = [
  {
    level: 'L1',
    seq: 'Step 1 — Scenario Card',
    weight: '35% weight',
    title: 'Affordability Signal',
    question: 'Can you actually afford this at today\'s rate?',
    description: 'You start by telling the AI your income, existing debts, target price, and down payment. HomeRates.AI pulls the live 30-year conforming rate directly from the Federal Reserve (FRED) and runs a deterministic PITI calculation — principal, interest, taxes, and insurance — against your gross income and existing debts. Your L1 score tells you exactly how comfortably the payment fits your finances at the rate available today, not the promotional rate on a lender\'s website.',
    sources: ['FRED live mortgage rates', 'Income & debts (from chat)', 'PITI engine — P+I+T+I', 'DTI calculation'],
    signal: 'Score above 75 = strong capacity, multiple loan options. Score below 50 = the payment breaks your budget at today\'s rates.',
    accent: '#00e87a',
    icon: '💬',
  },
  {
    level: 'L2',
    seq: 'Step 2 — Check Property',
    weight: '25% weight',
    title: 'Market Conditions',
    question: 'Is this a buyer\'s or seller\'s market right now?',
    description: 'Paste any address or Zillow/Redfin listing URL into your Scenario Card and tap Check Property. The system scrapes live Redfin data — days on market (DOM) and sale-to-list ratio — and scores the local market in real time. A DOM above 60 days with sale-to-list below 98% means negotiating room. A DOM under 15 days with sale-to-list above 102% means competing offers and waived contingencies.',
    sources: ['Redfin — days on market', 'Redfin — sale-to-list ratio', 'Live listing activity', 'Local market trend'],
    signal: 'Score above 70 = market favours buyers. Score below 40 = active seller\'s market, premium pricing likely.',
    accent: '#60a5fa',
    icon: '🏠',
  },
  {
    level: 'L3',
    seq: 'Step 3 — Property Intelligence',
    weight: '25% weight',
    title: 'Value Gap',
    question: 'Is the list price fair, cheap, or overpriced vs. the market?',
    description: 'Clicking the Track 5 badge in your Scenario Card opens the full Property Intelligence report. Redfin\'s Automated Valuation Model — built from recent comp sales within 0.5 miles — is compared directly against the listing price. A gap more than 5% in your favour is genuine value. More than 12% against you means the seller is anchoring high and comps don\'t support it. Zillow\'s estimate is cross-checked as a second reference point.',
    sources: ['Redfin AVM (automated valuation)', 'Live listing price', 'Recent comp sales within 0.5 mi', 'Zillow estimate cross-check'],
    signal: 'Score above 80 = priced below or at market value. Score below 40 = significantly overpriced vs. recent comps.',
    accent: '#a78bfa',
    icon: '📊',
  },
  {
    level: 'L4',
    seq: 'Step 4 — Full Market Analysis (deep mode)',
    weight: '15% weight',
    title: 'Location Intelligence',
    question: 'Will this neighbourhood support the investment long-term?',
    description: 'Tapping Run Full Market Analysis inside the Property Intelligence card triggers Grok-4 deep analysis via the xAI Responses API. Tavily searches the live web across Walk Score, Transit Score, school ratings, safety data, commute patterns, 3-year appreciation trends, and wildfire risk. Grok synthesises all seven sub-factors into a composite Location Intelligence score. This is the signal most buyers skip — and the one that most determines resale value, insurance cost, and quality of life over time.',
    sources: ['Grok-4 via xAI Responses API', 'Tavily live web search', 'Walk Score / Transit Score', 'School ratings (GreatSchools)', 'Wildfire risk factor', '3-year appreciation trend'],
    signal: 'Score above 75 = strong fundamentals, appreciating location. Score below 40 = wildfire exposure, long commute, or declining school district.',
    accent: '#f59e0b',
    icon: '🧠',
  },
];

const WHY = [
  {
    icon: '📡',
    title: 'Live data — not averages',
    body: 'Federal Reserve rates, Redfin market stats, and live Tavily web search. Every figure is pulled at the moment you run the analysis — not from a database that was last refreshed last quarter.',
  },
  {
    icon: '⚖️',
    title: 'No opinion, no incentive',
    body: 'No agent commission skews the comp selection. No lender margin inflates the rate. The score is what the data says — nothing more, nothing less.',
  },
  {
    icon: '🔗',
    title: 'Every step connects',
    body: 'Your L1 affordability scenario flows directly into the property check. The property check unlocks the deep analysis. The deep analysis feeds the composite verdict. Nothing resets between steps.',
  },
  {
    icon: '🧠',
    title: 'Grok explains the score',
    body: 'Every level comes with a plain-language summary of what the data found and what it means — not just a number, but the reasoning you can actually use in a negotiation.',
  },
];

export default function DecisionScorePage() {
  return (
    <>
      <style>{`
        body:has(.ds-root){display:block!important;height:auto!important;overflow:visible!important;}
        html:has(.ds-root){height:auto!important;overflow:visible!important;}
        body:has(.ds-root) .app-footer{display:none!important;}
        .ds-root{min-height:100vh;width:100%;background:#080c12;color:#e0f0e8;
          font-family:var(--font-dm-sans,'DM Sans',sans-serif);
          display:flex;flex-direction:column;align-items:center;overflow-x:hidden;box-sizing:border-box;}
        .ds-root *{box-sizing:border-box;}

        /* Nav */
        .ds-header{position:sticky;top:0;z-index:50;width:100%;
          background:rgba(8,12,18,0.94);backdrop-filter:blur(12px);
          border-bottom:1px solid rgba(255,255,255,0.06);}
        .ds-header-inner{max-width:900px;margin:0 auto;padding:0 24px;height:56px;
          display:flex;align-items:center;justify-content:space-between;}
        .ds-logo-link{display:flex;align-items:center;text-decoration:none;}
        .ds-logo{height:26px;width:auto;}
        .ds-nav{display:flex;align-items:center;gap:20px;}
        .ds-nav-link{font-size:0.82rem;color:rgba(185,208,192,0.6);text-decoration:none;transition:color 0.15s;}
        .ds-nav-link:hover{color:#e0f0e8;}
        .ds-nav-cta{display:inline-flex;align-items:center;gap:6px;font-size:0.82rem;
          font-weight:600;color:#00e87a;text-decoration:none;padding:6px 14px;
          border:1px solid rgba(0,232,122,0.3);border-radius:8px;transition:background 0.15s;}
        .ds-nav-cta:hover{background:rgba(0,232,122,0.08);}

        /* Layout */
        .ds-main{width:100%;max-width:900px;padding:60px 24px 100px;display:flex;flex-direction:column;gap:56px;}

        /* Hero */
        .ds-hero{text-align:center;}
        .ds-eyebrow{display:inline-block;font-size:0.72rem;font-weight:700;letter-spacing:0.1em;
          text-transform:uppercase;color:#00e87a;background:rgba(0,232,122,0.08);
          border:1px solid rgba(0,232,122,0.2);border-radius:6px;padding:4px 10px;margin-bottom:16px;}
        .ds-h1{font-size:clamp(2rem,4.5vw,3.2rem);font-weight:900;color:#f0f4ff;
          line-height:1.08;margin:0 0 20px;letter-spacing:-0.02em;}
        .ds-subtitle{font-size:1.05rem;color:rgba(185,208,192,0.75);max-width:600px;
          margin:0 auto 28px;line-height:1.65;}
        .ds-hero-cta{display:inline-flex;align-items:center;gap:8px;background:#00e87a;
          color:#07100f;font-size:0.95rem;font-weight:800;padding:13px 28px;
          border-radius:10px;text-decoration:none;transition:background 0.15s;}
        .ds-hero-cta:hover{background:#00ff8a;}

        /* Section */
        .ds-section-label{font-size:0.72rem;font-weight:700;letter-spacing:0.1em;
          text-transform:uppercase;color:#00e87a;margin-bottom:10px;}
        .ds-section-h2{font-size:clamp(1.4rem,3vw,2rem);font-weight:800;color:#f0f4ff;
          margin:0 0 14px;letter-spacing:-0.015em;line-height:1.2;}
        .ds-section-body{font-size:0.95rem;color:rgba(185,208,192,0.8);line-height:1.7;}

        /* Journey steps */
        .ds-steps{display:flex;flex-direction:column;gap:20px;margin-top:24px;}
        .ds-step{background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);
          border-radius:16px;padding:28px;transition:border-color 0.2s;}
        .ds-step:hover{border-color:rgba(255,255,255,0.13);}

        .ds-step-header{display:flex;align-items:flex-start;gap:16px;margin-bottom:16px;}
        .ds-step-badge{flex-shrink:0;width:44px;height:44px;border-radius:10px;
          display:flex;align-items:center;justify-content:center;font-size:1.2rem;}
        .ds-step-meta{flex:1;min-width:0;}
        .ds-step-seq{font-size:0.65rem;font-weight:700;letter-spacing:0.08em;
          text-transform:uppercase;color:#94a3b8;margin-bottom:3px;}
        .ds-step-weight{font-size:0.65rem;font-weight:700;letter-spacing:0.06em;
          text-transform:uppercase;margin-bottom:4px;}
        .ds-step-title{font-size:1.05rem;font-weight:800;color:#f0f4ff;margin-bottom:4px;}
        .ds-step-q{font-size:0.88rem;color:rgba(185,208,192,0.7);font-style:italic;}

        .ds-step-body{font-size:0.88rem;color:rgba(185,208,192,0.8);line-height:1.7;margin-bottom:16px;}

        .ds-step-sources{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;}
        .ds-source-chip{font-size:0.7rem;font-weight:600;padding:3px 10px;border-radius:20px;
          background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);color:#94a3b8;}

        .ds-step-signal{font-size:0.82rem;line-height:1.6;
          background:rgba(255,255,255,0.02);border-radius:8px;padding:10px 14px;
          border-left:3px solid;}

        /* Why grid */
        .ds-why-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-top:24px;}
        .ds-why-card{background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);
          border-radius:12px;padding:20px;}
        .ds-why-icon{font-size:1.4rem;margin-bottom:10px;}
        .ds-why-title{font-size:0.85rem;font-weight:800;color:#f0f4ff;margin-bottom:6px;}
        .ds-why-body{font-size:0.8rem;color:rgba(185,208,192,0.7);line-height:1.55;}

        /* Verdict preview */
        .ds-verdict{background:rgba(0,232,122,0.04);border:1px solid rgba(0,232,122,0.15);
          border-radius:18px;padding:28px;}
        .ds-verdict-eyebrow{font-size:0.72rem;font-weight:700;letter-spacing:0.1em;
          text-transform:uppercase;color:#00e87a;margin-bottom:18px;}
        .ds-verdict-body{font-size:0.92rem;color:rgba(185,208,192,0.8);line-height:1.7;margin-bottom:20px;}
        .ds-verdict-levels{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
        .ds-vl{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);
          border-radius:10px;padding:12px;text-align:center;}
        .ds-vl-num{font-size:0.65rem;font-weight:800;letter-spacing:0.06em;
          text-transform:uppercase;margin-bottom:4px;}
        .ds-vl-name{font-size:0.65rem;color:rgba(185,208,192,0.5);margin-top:2px;}

        /* CTA */
        .ds-cta{text-align:center;padding:40px;
          background:rgba(0,232,122,0.04);border:1px solid rgba(0,232,122,0.15);border-radius:18px;}
        .ds-cta-h{font-size:1.4rem;font-weight:800;color:#f0f4ff;margin:0 0 10px;}
        .ds-cta-sub{font-size:0.92rem;color:rgba(185,208,192,0.7);margin:0 0 24px;line-height:1.6;}
        .ds-cta-btn{display:inline-flex;align-items:center;gap:8px;background:#00e87a;
          color:#07100f;font-size:0.95rem;font-weight:800;padding:14px 32px;
          border-radius:10px;text-decoration:none;transition:background 0.15s;}
        .ds-cta-btn:hover{background:#00ff8a;}

        /* Footer */
        .ds-footer{width:100%;border-top:1px solid rgba(255,255,255,0.06);padding:20px 24px;
          display:flex;align-items:center;justify-content:center;flex-wrap:wrap;
          gap:8px;font-size:0.78rem;color:rgba(185,208,192,0.4);}
        .ds-footer a{color:rgba(0,232,122,0.5);text-decoration:none;}
        .ds-footer a:hover{color:#00e87a;}
        .ds-footer-sep{opacity:0.4;}

        @media(max-width:600px){
          .ds-nav .ds-nav-link{display:none;}
          .ds-why-grid{grid-template-columns:1fr 1fr;}
          .ds-step-header{flex-direction:column;gap:10px;}
          .ds-verdict-levels{grid-template-columns:repeat(2,1fr);}
        }
      `}</style>

      <div className="ds-root">
        {/* Nav */}
        <header className="ds-header">
          <div className="ds-header-inner">
            <Link href="/" className="ds-logo-link">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.AI" className="ds-logo" />
            </Link>
            <nav className="ds-nav">
              <Link href="/platform" className="ds-nav-link">Platform Intelligence</Link>
              <Link href="/track5-intelligence" className="ds-nav-link">Track 5</Link>
              <Link href="/property-intel" className="ds-nav-cta">Try it free →</Link>
              <AppNav drawerOnly />
            </nav>
          </div>
        </header>

        <main className="ds-main">

          {/* Hero */}
          <div className="ds-hero">
            <span className="ds-eyebrow">Full Buyer Journey — Decision Intelligence</span>
            <h1 className="ds-h1">From First Number<br />to Final Score.</h1>
            <p className="ds-subtitle">
              Most home buyers check one thing — the monthly payment. HomeRates.AI runs four scored intelligence layers across affordability, market conditions, value gap, and location before you make an offer. This is how the full journey works.
            </p>
            <Link href="/property-intel" className="ds-hero-cta">
              Run the full analysis on any address →
            </Link>
          </div>

          {/* What it is */}
          <div>
            <div className="ds-section-label">How the Journey Works</div>
            <h2 className="ds-section-h2">Four levels. One verdict. No gut-feel required.</h2>
            <p className="ds-section-body">
              The journey begins the moment you enter a loan scenario in the AI chat — your income, target price, and down payment. From there, each step deepens the analysis: a property address unlocks market and value scoring; a single tap triggers the full deep analysis across location, wildfire risk, and school quality. By the time you see a Track 5 score, four independent data sources have been synthesised into a single, honest verdict.
              <br /><br />
              There is no opinion here. No agent incentive. No lender margin. The score is what the data says.
            </p>
          </div>

          {/* The 4 Steps */}
          <div>
            <div className="ds-section-label">The Four Steps</div>
            <h2 className="ds-section-h2">What each step scores — and where the data comes from</h2>
            <div className="ds-steps">
              {STEPS.map((s, i) => (
                <div key={s.level} className="ds-step" style={{ borderLeftColor: s.accent, borderLeftWidth: 3 }}>
                  <div className="ds-step-header">
                    <div className="ds-step-badge" style={{ background: `${s.accent}18`, border: `1px solid ${s.accent}30` }}>
                      {s.icon}
                    </div>
                    <div className="ds-step-meta">
                      <div className="ds-step-seq">{s.seq}</div>
                      <div className="ds-step-weight" style={{ color: s.accent }}>{s.weight} of total score</div>
                      <div className="ds-step-title">{s.title}</div>
                      <div className="ds-step-q">{s.question}</div>
                    </div>
                  </div>
                  <p className="ds-step-body">{s.description}</p>
                  <div className="ds-step-sources">
                    {s.sources.map(src => <span key={src} className="ds-source-chip">{src}</span>)}
                  </div>
                  <div className="ds-step-signal" style={{ borderLeftColor: s.accent, color: 'rgba(185,208,192,0.8)' }}>
                    <strong style={{ color: s.accent }}>What the score tells you: </strong>{s.signal}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Verdict preview */}
          <div>
            <div className="ds-section-label">The Decision Score</div>
            <h2 className="ds-section-h2">Four levels converge into one verdict</h2>
            <div className="ds-verdict" style={{ marginTop: 24 }}>
              <div className="ds-verdict-eyebrow">Track 5 — Composite Score Output</div>
              <p className="ds-verdict-body">
                Once all four levels are scored, Track 5 calculates a weighted composite and issues a plain-language verdict. This is the number you bring to your agent when you discuss price, contingencies, and negotiating strategy. A score above 70 across all levels is a strong buy signal. A score below 45 on any single level is a red flag worth understanding before you make an offer.
              </p>
              <div className="ds-verdict-levels">
                {[
                  { level: 'L1', name: 'Affordability', color: '#00e87a' },
                  { level: 'L2', name: 'Market', color: '#60a5fa' },
                  { level: 'L3', name: 'Value Gap', color: '#a78bfa' },
                  { level: 'L4', name: 'Location', color: '#f59e0b' },
                ].map(l => (
                  <div key={l.level} className="ds-vl">
                    <div className="ds-vl-num" style={{ color: l.color }}>{l.level}</div>
                    <div className="ds-vl-name">{l.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Why it matters */}
          <div>
            <div className="ds-section-label">Why It Went to a Whole New Level</div>
            <h2 className="ds-section-h2">What makes this different from any other home buying tool</h2>
            <div className="ds-why-grid">
              {WHY.map(w => (
                <div key={w.title} className="ds-why-card">
                  <div className="ds-why-icon">{w.icon}</div>
                  <div className="ds-why-title">{w.title}</div>
                  <div className="ds-why-body">{w.body}</div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="ds-cta">
            <h2 className="ds-cta-h">Start your full decision analysis</h2>
            <p className="ds-cta-sub">
              Paste any address or listing URL. Get a four-level scored verdict in under 90 seconds.<br />No email. No forms. No lender hand-off.
            </p>
            <Link href="/property-intel" className="ds-cta-btn">
              Run your full analysis now →
            </Link>
          </div>

        </main>

        <footer className="ds-footer">
          <span>HomeRates.AI — educational tool, not a lender or broker.</span>
          <span className="ds-footer-sep">•</span>
          <Link href="/platform">Platform Intelligence</Link>
          <span className="ds-footer-sep">•</span>
          <Link href="/track5-intelligence">Track 5</Link>
          <span className="ds-footer-sep">•</span>
          <Link href="/disclosures">Terms</Link>
          <span className="ds-footer-sep">•</span>
          <Link href="/privacy">Privacy</Link>
        </footer>
      </div>
    </>
  );
}
