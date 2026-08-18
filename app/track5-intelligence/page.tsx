// app/track5-intelligence/page.tsx
// Marketing / explainer page for Track 5 — the 5-signal buying decision framework
import type { Metadata } from 'next';
import Link from 'next/link';
import AppNav from '../components/AppNav';

export const metadata: Metadata = {
  title: 'Track 5 — The 5 Signals That Tell You Whether to Buy, Wait, or Walk Away | HomeRates.AI',
  description: 'Track 5 is a data-driven buying decision framework. Five scored signals — affordability, market conditions, value gap, location intelligence, and rate intelligence — tell you exactly where you stand before you make an offer.',
  alternates: { canonical: 'https://chat.homerates.ai/track5-intelligence' },
};

const LEVELS = [
  {
    num: 'L1',
    weight: '30%',
    title: 'Affordability Signal',
    question: 'Can you actually afford this at today\'s rate?',
    description: 'The foundational gate. Deterministic PITI calculation — principal, interest, taxes, insurance — stacked against your gross income and existing debts. Pulls live 30-year conforming rates from the Federal Reserve (FRED) so the number is real, not a lender\'s marketing rate.',
    sources: ['FRED live mortgage rates', 'Your income & debts (from chat)', 'PITI calculator engine'],
    signal: 'Score below 50 = the payment breaks your budget at today\'s rates. Score above 80 = strong capacity, multiple loan options available.',
    accent: '#00e87a',
  },
  {
    num: 'L2',
    weight: '20%',
    title: 'Market Conditions',
    question: 'Is this a buyer\'s or seller\'s market right now?',
    description: 'Two live data points from Redfin tell the full story: days on market (DOM) and sale-to-list ratio. A DOM above 60 days with sale-to-list below 98% is a buyer\'s market — you have negotiating room. A DOM under 15 days with sale-to-list above 102% means bidding wars and no contingencies.',
    sources: ['Redfin market data — DOM', 'Redfin sale-to-list ratio', 'Local market trend analysis'],
    signal: 'Score above 70 = market favours buyers. Score below 40 = seller\'s market, premium pricing likely.',
    accent: '#60a5fa',
  },
  {
    num: 'L3',
    weight: '20%',
    title: 'Value Gap',
    question: 'Is the list price fair, cheap, or overpriced?',
    description: 'Compares the listing price against the Redfin Automated Valuation Model (AVM) — an independent estimate built from recent comp sales, square footage, and local market data. A list price more than 5% below AVM signals genuine value. More than 12% above AVM signals the seller is fishing.',
    sources: ['Redfin AVM (automated valuation)', 'Live listing price', 'Recent comp sales within 0.5 mi'],
    signal: 'Score above 80 = priced below or at market value. Score below 40 = significantly overpriced vs. comps.',
    accent: '#a78bfa',
  },
  {
    num: 'L4',
    weight: '15%',
    title: 'Location Intelligence',
    question: 'Will this neighbourhood support the investment long-term?',
    description: 'Four factors sourced from live web data: school district ratings, walk score, commute time to major employment centres, and 3-year neighbourhood appreciation. This is the signal most buyers skip — and the one that most determines resale value and quality of life.',
    sources: ['School ratings (GreatSchools/Niche)', 'Walk Score', 'Commute distance to employment hubs', '3-year neighbourhood appreciation trend'],
    signal: 'Score above 75 = strong fundamentals, appreciating location. Score below 40 = single-employer dependency, long commute, or declining schools.',
    accent: '#f59e0b',
  },
  {
    num: 'L5',
    weight: '15%',
    title: 'Rate Intelligence',
    question: 'What\'s your real, decoded mortgage rate — not a marketing teaser?',
    description: 'Runs your credit profile and loan scenario through the Rate Engine — a full Loan-Level Price Adjustment (LLPA) breakdown against the public Fannie Mae matrix, benchmarked against real OBMMI market rate segments and live FRED data. The result is a decoded lender par rate, not an estimate: what a lender would actually price your loan at today, and how it compares to the market.',
    sources: ['Fannie Mae LLPA matrix (public)', 'OBMMI market rate segments', 'FRED live par rate', 'Your credit profile & loan scenario'],
    signal: 'Score above 70 = your decoded rate beats most of the market. Score below 40 = you\'re paying a real premium — worth shopping or restructuring before you lock.',
    accent: '#f472b6',
  },
];

const DATA_SOURCES = [
  {
    name: 'Federal Reserve (FRED)',
    role: 'Live mortgage rate data',
    detail: 'All rate calculations use the Federal Reserve\'s H.15 release — the same data the market trades on. Never a lender\'s promotional rate.',
    icon: '🏦',
  },
  {
    name: 'Redfin',
    role: 'AVM, market stats, comps',
    detail: 'Days on market, sale-to-list ratio, automated valuation model, and recent comparable sales within a half-mile radius of the subject property.',
    icon: '🏠',
  },
  {
    name: 'Tavily AI Web Search',
    role: 'Schools, walkability, commute, appreciation',
    detail: 'Real-time web search across GreatSchools, Walk Score, commute data, and neighbourhood trend sources. No stale database — live results at query time.',
    icon: '🔍',
  },
  {
    name: 'Grok-4 Deep Analysis',
    role: 'Synthesis and scoring',
    detail: 'xAI\'s Grok-4 model via the Responses API synthesises all data streams, resolves conflicts, and produces the final scored output with a plain-language verdict.',
    icon: '🧠',
  },
  {
    name: 'Rate Engine',
    role: 'Decoded lender par rate (L5)',
    detail: 'Full LLPA breakdown against the public Fannie Mae matrix, benchmarked against real OBMMI market segments — a calculated rate, not an estimate.',
    icon: '📉',
  },
];

export default function Track5IntelligencePage() {
  return (
    <>
      <style>{`
        body:has(.t5i-root){display:block!important;height:auto!important;overflow:visible!important;}
        html:has(.t5i-root){height:auto!important;overflow:visible!important;}
        body:has(.t5i-root) .app-footer{display:none!important;}
        .t5i-root{min-height:100vh;width:100%;background:#080c12;color:#e0f0e8;
          font-family:var(--font-dm-sans,'DM Sans',sans-serif);
          display:flex;flex-direction:column;align-items:center;overflow-x:hidden;box-sizing:border-box;}
        .t5i-root *{box-sizing:border-box;}

        .t5i-header{position:sticky;top:0;z-index:50;width:100%;
          background:rgba(8,12,18,0.94);backdrop-filter:blur(12px);
          border-bottom:1px solid rgba(255,255,255,0.06);}
        .t5i-header-inner{max-width:900px;margin:0 auto;padding:0 24px;height:56px;
          display:flex;align-items:center;justify-content:space-between;}
        .t5i-logo-link{display:flex;align-items:center;text-decoration:none;}
        .t5i-logo{height:26px;width:auto;}
        .t5i-nav{display:flex;align-items:center;gap:20px;}
        .t5i-nav-link{font-size:0.82rem;color:rgba(185,208,192,0.6);text-decoration:none;transition:color 0.15s;}
        .t5i-nav-link:hover{color:#e0f0e8;}
        .t5i-nav-cta{display:inline-flex;align-items:center;gap:6px;font-size:0.82rem;
          font-weight:600;color:#00e87a;text-decoration:none;padding:6px 14px;
          border:1px solid rgba(0,232,122,0.3);border-radius:8px;transition:background 0.15s;}
        .t5i-nav-cta:hover{background:rgba(0,232,122,0.08);}

        .t5i-main{width:100%;max-width:900px;padding:60px 24px 100px;display:flex;flex-direction:column;gap:56px;}

        /* Hero */
        .t5i-hero{text-align:center;}
        .t5i-eyebrow{display:inline-block;font-size:0.72rem;font-weight:700;letter-spacing:0.1em;
          text-transform:uppercase;color:#00e87a;background:rgba(0,232,122,0.08);
          border:1px solid rgba(0,232,122,0.2);border-radius:6px;padding:4px 10px;margin-bottom:16px;}
        .t5i-h1{font-size:clamp(2rem,4.5vw,3.2rem);font-weight:900;color:#f0f4ff;
          line-height:1.08;margin:0 0 20px;letter-spacing:-0.02em;}
        .t5i-subtitle{font-size:1.05rem;color:rgba(185,208,192,0.75);max-width:600px;
          margin:0 auto 28px;line-height:1.65;}
        .t5i-hero-cta{display:inline-flex;align-items:center;gap:8px;background:#00e87a;
          color:#07100f;font-size:0.95rem;font-weight:800;padding:13px 28px;
          border-radius:10px;text-decoration:none;transition:background 0.15s;}
        .t5i-hero-cta:hover{background:#00ff8a;}

        /* What it is */
        .t5i-section-label{font-size:0.72rem;font-weight:700;letter-spacing:0.1em;
          text-transform:uppercase;color:#00e87a;margin-bottom:10px;}
        .t5i-section-h2{font-size:clamp(1.4rem,3vw,2rem);font-weight:800;color:#f0f4ff;
          margin:0 0 14px;letter-spacing:-0.015em;line-height:1.2;}
        .t5i-section-body{font-size:0.95rem;color:rgba(185,208,192,0.8);line-height:1.7;}

        /* Level cards */
        .t5i-levels{display:flex;flex-direction:column;gap:20px;}
        .t5i-level{background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);
          border-radius:16px;padding:28px;transition:border-color 0.2s;}
        .t5i-level:hover{border-color:rgba(255,255,255,0.13);}
        .t5i-level-header{display:flex;align-items:flex-start;gap:16px;margin-bottom:16px;}
        .t5i-level-badge{flex-shrink:0;width:44px;height:44px;border-radius:10px;
          display:flex;align-items:center;justify-content:center;
          font-size:0.75rem;font-weight:900;letter-spacing:0.04em;}
        .t5i-level-meta{flex:1;min-width:0;}
        .t5i-level-weight{font-size:0.65rem;font-weight:700;letter-spacing:0.08em;
          text-transform:uppercase;color:#94a3b8;margin-bottom:4px;}
        .t5i-level-title{font-size:1.05rem;font-weight:800;color:#f0f4ff;margin-bottom:4px;}
        .t5i-level-question{font-size:0.88rem;color:rgba(185,208,192,0.7);font-style:italic;}
        .t5i-level-body{font-size:0.88rem;color:rgba(185,208,192,0.8);line-height:1.7;margin-bottom:16px;}
        .t5i-level-sources{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;}
        .t5i-source-chip{font-size:0.7rem;font-weight:600;padding:3px 10px;border-radius:20px;
          background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);color:#94a3b8;}
        .t5i-level-signal{font-size:0.82rem;line-height:1.6;
          background:rgba(255,255,255,0.02);border-radius:8px;padding:10px 14px;
          border-left:3px solid;}

        /* Data sources */
        .t5i-sources-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;}
        .t5i-src-card{background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);
          border-radius:12px;padding:20px;}
        .t5i-src-icon{font-size:1.4rem;margin-bottom:10px;}
        .t5i-src-name{font-size:0.85rem;font-weight:800;color:#f0f4ff;margin-bottom:3px;}
        .t5i-src-role{font-size:0.72rem;font-weight:700;color:#00e87a;text-transform:uppercase;
          letter-spacing:0.07em;margin-bottom:8px;}
        .t5i-src-detail{font-size:0.8rem;color:rgba(185,208,192,0.7);line-height:1.55;}

        /* How to use */
        .t5i-steps{display:flex;flex-direction:column;gap:12px;}
        .t5i-step{display:flex;gap:16px;align-items:flex-start;}
        .t5i-step-num{width:28px;height:28px;border-radius:50%;background:rgba(0,232,122,0.1);
          border:1px solid rgba(0,232,122,0.2);color:#00e87a;font-size:0.8rem;font-weight:800;
          display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;}
        .t5i-step-body{flex:1;}
        .t5i-step-title{font-size:0.92rem;font-weight:700;color:#f0f4ff;margin-bottom:3px;}
        .t5i-step-desc{font-size:0.85rem;color:rgba(185,208,192,0.7);line-height:1.6;}

        /* CTA block */
        .t5i-cta{text-align:center;padding:40px;
          background:rgba(0,232,122,0.04);border:1px solid rgba(0,232,122,0.15);border-radius:18px;}
        .t5i-cta-h{font-size:1.4rem;font-weight:800;color:#f0f4ff;margin:0 0 10px;}
        .t5i-cta-sub{font-size:0.92rem;color:rgba(185,208,192,0.7);margin:0 0 24px;line-height:1.6;}
        .t5i-cta-btn{display:inline-flex;align-items:center;gap:8px;background:#00e87a;
          color:#07100f;font-size:0.95rem;font-weight:800;padding:14px 32px;
          border-radius:10px;text-decoration:none;transition:background 0.15s;}
        .t5i-cta-btn:hover{background:#00ff8a;}

        .t5i-footer{width:100%;border-top:1px solid rgba(255,255,255,0.06);padding:20px 24px;
          display:flex;align-items:center;justify-content:center;flex-wrap:wrap;
          gap:8px;font-size:0.78rem;color:rgba(185,208,192,0.4);}
        .t5i-footer a{color:rgba(0,232,122,0.5);text-decoration:none;}
        .t5i-footer a:hover{color:#00e87a;}
        .t5i-footer-sep{opacity:0.4;}

        @media(max-width:600px){
          .t5i-nav .t5i-nav-link{display:none;}
          .t5i-sources-grid{grid-template-columns:1fr 1fr;}
          .t5i-level-header{flex-direction:column;gap:10px;}
        }
      `}</style>

      <div className="t5i-root">
        {/* Nav */}
        <header className="t5i-header">
          <div className="t5i-header-inner">
            <Link href="/" className="t5i-logo-link">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.AI" className="t5i-logo" />
            </Link>
            <nav className="t5i-nav">
              <Link href="/platform" className="t5i-nav-link">Platform Intelligence</Link>
              <Link href="/why-homerates" className="t5i-nav-link">Why HomeRates</Link>
              <Link href="/property-intel" className="t5i-nav-cta">Try Track 5 →</Link>
              <AppNav drawerOnly />
            </nav>
          </div>
        </header>

        <main className="t5i-main">

          {/* Hero */}
          <div className="t5i-hero">
            <span className="t5i-eyebrow">Track 5 — Decision Intelligence</span>
            <h1 className="t5i-h1">Five Signals.<br />One Verdict.<br />Buy, Wait, or Walk Away.</h1>
            <p className="t5i-subtitle">
              Most home buyers rely on feeling. Track 5 replaces emotion with five scored data signals — affordability, market conditions, value gap, location intelligence, and rate intelligence — and shows you where this property stands before you make an offer.
            </p>
            <Link href="/property-intel" className="t5i-hero-cta">
              Run Track 5 on an address →
            </Link>
          </div>

          {/* What it is */}
          <div>
            <div className="t5i-section-label">What Track 5 Is</div>
            <h2 className="t5i-section-h2">A buying decision framework powered by live data, not opinions</h2>
            <p className="t5i-section-body">
              Track 5 aggregates five independent data streams — Federal Reserve rate data, Redfin market statistics, AI-powered web research, live lender rate pricing via the Rate Engine, and your own affordability numbers — into five scored levels. Each level answers one critical question. Together they give you a complete, data-grounded picture of whether this property is a smart purchase at this price in this market right now.
              <br /><br />
              There is no opinion here. No agent incentive. No lender commission. The score is what the data says.
            </p>
          </div>

          {/* The 5 levels */}
          <div>
            <div className="t5i-section-label">The Five Levels</div>
            <h2 className="t5i-section-h2">What each signal measures — and where the data comes from</h2>
            <div className="t5i-levels" style={{ marginTop: 24 }}>
              {LEVELS.map(l => (
                <div key={l.num} className="t5i-level" style={{ borderLeftColor: l.accent, borderLeftWidth: 3 }}>
                  <div className="t5i-level-header">
                    <div className="t5i-level-badge" style={{ background: `${l.accent}18`, color: l.accent, border: `1px solid ${l.accent}30` }}>
                      {l.num}
                    </div>
                    <div className="t5i-level-meta">
                      <div className="t5i-level-weight">Weight: {l.weight} of total score</div>
                      <div className="t5i-level-title">{l.title}</div>
                      <div className="t5i-level-question">{l.question}</div>
                    </div>
                  </div>
                  <p className="t5i-level-body">{l.description}</p>
                  <div className="t5i-level-sources">
                    {l.sources.map(s => <span key={s} className="t5i-source-chip">{s}</span>)}
                  </div>
                  <div className="t5i-level-signal" style={{ borderLeftColor: l.accent, color: 'rgba(185,208,192,0.8)' }}>
                    <strong style={{ color: l.accent }}>What the score tells you: </strong>{l.signal}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Data sources */}
          <div>
            <div className="t5i-section-label">Intelligence Sources</div>
            <h2 className="t5i-section-h2">Where the data comes from</h2>
            <p className="t5i-section-body" style={{ marginBottom: 24 }}>
              Every data point in Track 5 is sourced from independent, non-lender sources. No promotional rates. No agent-curated comps. No sponsored results.
            </p>
            <div className="t5i-sources-grid">
              {DATA_SOURCES.map(s => (
                <div key={s.name} className="t5i-src-card">
                  <div className="t5i-src-icon">{s.icon}</div>
                  <div className="t5i-src-name">{s.name}</div>
                  <div className="t5i-src-role">{s.role}</div>
                  <div className="t5i-src-detail">{s.detail}</div>
                </div>
              ))}
            </div>
          </div>

          {/* How to use */}
          <div>
            <div className="t5i-section-label">How to Use It</div>
            <h2 className="t5i-section-h2">From address to verdict in under 60 seconds</h2>
            <div className="t5i-steps" style={{ marginTop: 24 }}>
              {[
                {
                  title: 'Paste any address or listing URL into Property Intel',
                  desc: 'Works with any property address, Zillow URL, or Redfin listing. No signup required for the first search.',
                },
                {
                  title: 'Run the Full Market Analysis (deep mode)',
                  desc: 'This triggers the AI deep analysis — five parallel data pulls across FRED, Redfin, and live web search. Takes 15–25 seconds.',
                },
                {
                  title: 'Review your Track 5 score',
                  desc: 'Each level gets a score out of 100 and a plain-language summary. The overall verdict — Buy, Caution, or Wait — is displayed at the top.',
                },
                {
                  title: 'Drill into any level',
                  desc: 'Tap any level card to open the underlying data — the specific DOM figure, the AVM vs. list gap, the school rating. The score is explained, not just displayed.',
                },
                {
                  title: 'Use L1 Affordability to complete the picture',
                  desc: 'Run the Affordability Slider in chat first to generate your L1 score, then link it to Track 5 for a complete five-level verdict.',
                },
              ].map((step, i) => (
                <div key={i} className="t5i-step">
                  <div className="t5i-step-num">{i + 1}</div>
                  <div className="t5i-step-body">
                    <div className="t5i-step-title">{step.title}</div>
                    <div className="t5i-step-desc">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Why it matters */}
          <div>
            <div className="t5i-section-label">Why It Matters</div>
            <h2 className="t5i-section-h2">The average buyer has no idea if they're overpaying</h2>
            <p className="t5i-section-body">
              In a typical transaction, the buyer relies on the agent's opinion, the lender's rate sheet, and their own gut feeling. None of those are objective. The agent earns more on a higher price. The lender earns more on a larger loan. The gut is vulnerable to FOMO.
              <br /><br />
              Track 5 is designed to answer a single question with data: <strong style={{ color: '#f0f4ff' }}>Is this a good buy at this price in this market?</strong> Not "can I get approved" — that's the minimum bar. The question is whether the economics make sense, whether the location supports appreciation, and whether the market timing works in your favour.
              <br /><br />
              A score above 70 across all five levels is a strong buy signal. A score below 45 on any single level is a red flag worth understanding before you proceed.
            </p>
          </div>

          {/* CTA */}
          <div className="t5i-cta">
            <h2 className="t5i-cta-h">Run Track 5 on any property</h2>
            <p className="t5i-cta-sub">
              Paste an address or listing URL. Get a scored verdict across all five buying signals in under 60 seconds. No email. No forms. No lender hand-off.
            </p>
            <Link href="/property-intel" className="t5i-cta-btn">
              Analyse a property now →
            </Link>
          </div>

        </main>

        <footer className="t5i-footer">
          <span>HomeRates.AI — educational tool, not a lender or broker.</span>
          <span className="t5i-footer-sep">•</span>
          <Link href="/platform">Platform Intelligence</Link>
          <span className="t5i-footer-sep">•</span>
          <Link href="/about">About</Link>
          <span className="t5i-footer-sep">•</span>
          <Link href="/disclosures">Terms</Link>
          <span className="t5i-footer-sep">•</span>
          <Link href="/privacy">Privacy</Link>
        </footer>
      </div>
    </>
  );
}
