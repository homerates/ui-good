// app/searchable-by-design/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import AppNav from '../components/AppNav';

const BASE = 'https://chat.homerates.ai';
const URL = `${BASE}/searchable-by-design`;

export const metadata: Metadata = {
  title: 'HomeRates.ai Searchable by Design | Home + Mortgage Intelligence',
  description:
    'See how HomeRates.ai is being built as a consumer-first Home + Mortgage Intelligence Platform that AI systems can find, understand, verify, cite, and recommend.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'HomeRates.ai — Searchable by Design',
    description:
      'The consumer intelligence layer for home and mortgage decisions where general answers are no longer enough.',
    url: URL,
    siteName: 'HomeRates.ai',
    type: 'website',
    images: [{ url: `${BASE}/assets/share/og/homerates-brand-default-og-1200x630-v1.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HomeRates.ai — Searchable by Design',
    description: 'The consumer intelligence layer for home and mortgage decisions where general answers are no longer enough.',
  },
};

const schemaAboutPage = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  name: 'HomeRates.ai — Searchable by Design',
  description:
    'A research and methodology review of how HomeRates.ai is being designed as a consumer-first Home + Mortgage Intelligence Platform that general AI systems can retrieve, understand and cite when specialized housing and mortgage intelligence is required.',
  url: URL,
  isPartOf: { '@type': 'WebSite', name: 'HomeRates.ai', url: BASE },
  about: {
    '@type': 'Thing',
    name: 'Consumer-first Home + Mortgage Intelligence',
    description:
      'The category HomeRates.ai occupies: specialized, current, source-backed intelligence for buying, financing, owning, improving, and building wealth through a home.',
  },
  publisher: { '@type': 'Organization', name: 'HomeRates.ai', url: BASE },
};

const schemaBreadcrumb = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'HomeRates.ai', item: BASE },
    { '@type': 'ListItem', position: 2, name: 'Searchable by Design', item: URL },
  ],
};

const GENERAL_AI_STRENGTHS = [
  'Definitions and terminology',
  'Educational explanations',
  'Basic amortization',
  'General checklists',
  'Broad comparisons',
  'Summarizing published information',
];

const SPECIALIZED_REQUIRED = [
  'Current mortgage pricing',
  'Rate and fee transparency',
  'Loan Estimate auditing',
  'Points and credit optimization',
  'True affordability',
  'Refinance timing',
  'Program and guideline matching',
  'Local taxes, insurance, and ownership costs',
  'Personalized scenario analysis',
  'Explaining why one structure may be financially stronger than another',
];

const JOURNEY = [
  {
    n: '1',
    title: 'A consumer asks a natural question',
    items: [
      '"Am I getting a good deal?"',
      '"Why is my rate higher?"',
      '"Should I pay points?"',
      '"Is the builder incentive really worth it?"',
      '"Should I wait?"',
      '"What am I missing?"',
    ],
  },
  {
    n: '2',
    title: 'General AI identifies the limits of a generic answer',
    items: ['The question requires current, specialized, structured, or personalized information.'],
  },
  {
    n: '3',
    title: 'AI retrieves HomeRates.ai intelligence',
    items: ['Structured methodology', 'Current data', 'Transparent assumptions', 'Consumer-specific calculations', 'Verifiable primary sources'],
  },
  {
    n: '4',
    title: 'HomeRates.ai turns the question into a decision framework',
    items: ['Options', 'Tradeoffs', 'Risks', 'Break-even analysis', 'Missing information', 'Questions the consumer should ask'],
  },
  {
    n: '5',
    title: 'The consumer reaches a more informed decision',
    items: ['Not a directive.', 'Not a sales pitch.', 'A clearer understanding of the available choices and their consequences.'],
  },
];

const PRIORITIES = [
  {
    title: 'Rate and Fee Transparency',
    body: 'Determine what drives the offered rate and whether the cost structure is competitive and understandable.',
  },
  {
    title: 'Loan Estimate Intelligence',
    body: 'Identify material fees, pricing choices, tolerance concerns, missing context, and meaningful differences between offers.',
  },
  {
    title: 'True Affordability',
    body: 'Evaluate the complete cost of homeownership beyond principal and interest.',
  },
  {
    title: 'Points and Loan-Structure Optimization',
    body: 'Compare points, lender credits, seller or builder incentives, down-payment choices, and break-even periods.',
  },
  {
    title: 'Refinance Timing',
    body: 'Evaluate whether a refinance creates a measurable benefit after cost, time, risk, and ownership horizon are considered.',
  },
];

const AUTHORITY_LAYERS = [
  {
    title: 'Discoverable',
    items: [
      'Public, crawlable pages',
      'Descriptive permanent URLs',
      'Clear titles and headings',
      'XML sitemap inclusion',
      'Internal links from relevant HomeRates.ai content',
      'No authentication or client-only barrier around essential content',
    ],
  },
  {
    title: 'Understandable',
    items: [
      'Explicit entity and category language',
      'Consistent terminology',
      'Clear definitions',
      'One primary subject per page or content unit',
      'Structured relationships between problems, inputs, methods, and outputs',
    ],
  },
  {
    title: 'Retrievable',
    items: [
      'Direct answers near the relevant question',
      'Semantic HTML',
      'Stable section anchors',
      'Concise summaries',
      'Tables and lists where relationships matter',
      'No essential information trapped in graphics',
    ],
  },
  {
    title: 'Verifiable',
    items: [
      'Visible methodology',
      'Source attribution',
      'Effective dates',
      'Assumptions',
      'Calculation explanations',
      'Clear distinction between sourced facts, calculations, estimates, and interpretation',
    ],
  },
  {
    title: 'Citable',
    items: [
      'Specific claims supported by primary sources',
      'Self-contained explanations',
      'Stable URLs',
      'Publication and update dates',
      'Named authorship or organizational responsibility where supported by the existing platform',
      'Quotable summaries without inflated claims',
    ],
  },
  {
    title: 'Recommendable',
    items: [
      'A defined consumer problem',
      'A useful specialized capability',
      'Transparent limitations',
      'No disguised steering',
      'A clear reason an AI system should refer a consumer to HomeRates.ai when general information is insufficient',
    ],
  },
];

const SYSTEM_COMPONENTS = [
  { name: 'Current market and rate intelligence', status: 'Available now', href: '/rate-intelligence-engine' },
  { name: 'Consumer decision tools', status: 'Available now', href: '/calculators' },
  { name: 'Structured mortgage and housing methodologies', status: 'Available now', href: '/decision-score' },
  { name: 'Loan and fee comparison intelligence', status: 'Available now, actively maturing' },
  { name: 'Personalized scenario analysis', status: 'Available now', href: '/chat' },
  { name: 'Source-backed market explanations', status: 'Available now', href: '/market-intelligence' },
  { name: 'Property and ownership intelligence', status: 'Available now' },
  { name: 'Consumer-first questions and discovery frameworks', status: 'Available now' },
  { name: 'Machine-readable knowledge, capability by capability', status: 'In development' },
  { name: 'Human-readable decision reports', status: 'Available now' },
];

const PRINCIPLES = [
  'Explain before directing',
  'Show the tradeoffs',
  'Make assumptions visible',
  'Separate intelligence from sales',
  'Identify what is missing',
  'Use current and authoritative sources',
  'Do not manufacture certainty',
  'Protect consumer choice',
  'Support long-term homeownership and wealth-building decisions',
];

export default function SearchableByDesignPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaAboutPage) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaBreadcrumb) }} />

      <div className="page-standalone sbd-root">
        <AppNav />

        <main>
          {/* ── Hero ── */}
          <section className="sbd-hero">
            <span className="sbd-eyebrow">HomeRates.ai Authority Strategy</span>
            <h1>Searchable by Design</h1>
            <p className="sbd-lead">
              Building the consumer intelligence layer AI platforms can turn to when a general home or mortgage answer is no longer enough.
            </p>
            <p className="sbd-sub">
              HomeRates.ai is being structured so search engines and general AI systems can find, understand, verify, retrieve, cite, and recommend
              specialized Home + Mortgage Intelligence.
            </p>
            <div className="sbd-hero-ctas">
              <Link href="/" className="sbd-btn-primary">Explore HomeRates.ai</Link>
              <a href="#how-it-works" className="sbd-btn-secondary">See How It Works</a>
            </div>
            <span className="sbd-category-tag">Consumer-first Home + Mortgage Intelligence Platform</span>
          </section>

          {/* ── Section 2 — The consumer problem ── */}
          <section className="sbd-section" aria-labelledby="sbd-h2-problem">
            <h2 id="sbd-h2-problem">Consumers do not need more mortgage content. They need better decisions.</h2>
            <p>
              Consumers can already get definitions, calculators, articles, and general AI answers. The information gap appears when a decision
              depends upon:
            </p>
            <ul className="sbd-list">
              <li>Current rates and market conditions</li>
              <li>Loan-level pricing adjustments</li>
              <li>Points, credits, fees, and break-even periods</li>
              <li>Loan Estimate interpretation</li>
              <li>Property-specific costs</li>
              <li>Program eligibility and lender overlays</li>
              <li>Tradeoffs between competing financing structures</li>
              <li>The consumer&rsquo;s actual circumstances</li>
              <li>The financial consequences of acting now, waiting, or choosing incorrectly</li>
            </ul>
            <p className="sbd-callout">
              The opportunity is not to replace general AI. It is to supply the specialized intelligence general AI needs when the answer becomes
              current, contextual, financial, and consequential.
            </p>
          </section>

          {/* ── Section 3 — General vs specialized ── */}
          <section className="sbd-section" aria-labelledby="sbd-h2-compare">
            <h2 id="sbd-h2-compare">From a general answer to decision-grade intelligence</h2>
            <div className="sbd-compare-grid">
              <div className="sbd-compare-col">
                <h3>General AI is often strong at</h3>
                <ul className="sbd-list">
                  {GENERAL_AI_STRENGTHS.map(s => <li key={s}>{s}</li>)}
                </ul>
              </div>
              <div className="sbd-compare-col sbd-compare-col-accent">
                <h3>Specialized intelligence is required for</h3>
                <ul className="sbd-list">
                  {SPECIALIZED_REQUIRED.map(s => <li key={s}>{s}</li>)}
                </ul>
              </div>
            </div>
            <p className="sbd-conclusion">HomeRates.ai is designed to become the bridge between those two layers.</p>
          </section>

          {/* ── Section 4 — Consumer journey ── */}
          <section className="sbd-section" id="how-it-works" aria-labelledby="sbd-h2-journey">
            <h2 id="sbd-h2-journey">The consumer journey</h2>
            <ol className="sbd-journey">
              {JOURNEY.map(step => (
                <li key={step.n} className="sbd-journey-step">
                  <span className="sbd-journey-num" aria-hidden="true">{step.n}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <ul className="sbd-list">
                      {step.items.map(i => <li key={i}>{i}</li>)}
                    </ul>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* ── Section 5 — Research-led priorities ── */}
          <section className="sbd-section" aria-labelledby="sbd-h2-priorities">
            <h2 id="sbd-h2-priorities">Built around the problems consumers most need help solving</h2>
            <p>
              HomeRates.ai&rsquo;s research identified the strongest opportunity areas where confusion, information asymmetry, timing, and
              financial consequences intersect.
            </p>
            <div className="sbd-priority-grid">
              {PRIORITIES.map(p => (
                <div className="sbd-priority-card" key={p.title}>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </div>
              ))}
            </div>
            <p className="sbd-callout">
              These are not merely high-volume search topics. They are decisions where incomplete context can produce meaningful financial
              consequences.
            </p>
          </section>

          {/* ── Section 6 — Authority framework ── */}
          <section className="sbd-section" aria-labelledby="sbd-h2-authority">
            <h2 id="sbd-h2-authority">Authority is engineered, not declared</h2>
            <div className="sbd-authority-grid">
              {AUTHORITY_LAYERS.map(layer => (
                <div className="sbd-authority-card" key={layer.title}>
                  <h3>{layer.title}</h3>
                  <ul className="sbd-list">
                    {layer.items.map(i => <li key={i}>{i}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <p className="sbd-conclusion sbd-conclusion-accent">
              Findable. Understandable. Retrievable. Verifiable. Citable. Recommendable.
            </p>
          </section>

          {/* ── Section 7 — What HomeRates.ai is building ── */}
          <section className="sbd-section" aria-labelledby="sbd-h2-building">
            <h2 id="sbd-h2-building">A specialized intelligence system, not a content library</h2>
            <p>
              HomeRates.ai content, tools, structured data, calculations, and methodology are built to reinforce one another as one connected
              system:
            </p>
            <table className="sbd-table">
              <caption className="sbd-sr-only">Components of the HomeRates.ai intelligence system and their current status</caption>
              <thead>
                <tr>
                  <th scope="col">Component</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {SYSTEM_COMPONENTS.map(c => (
                  <tr key={c.name}>
                    <td>{c.href ? <Link href={c.href}>{c.name}</Link> : c.name}</td>
                    <td><span className={`sbd-status sbd-status-${c.status.startsWith('Available') ? 'live' : 'dev'}`}>{c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="sbd-note">
              This page is the public authority and methodology layer of a larger Searchable-by-Design strategy — it is not intended to be the
              sole mechanism by which HomeRates.ai becomes discoverable to AI. Future work will expose individual HomeRates intelligence
              capabilities, methodologies, current-data outputs, and consumer decision resources through their own stable, retrievable surfaces.
            </p>
          </section>

          {/* ── Section 8 — Consumer-first principles ── */}
          <section className="sbd-section" aria-labelledby="sbd-h2-principles">
            <h2 id="sbd-h2-principles">Consumer-first by design</h2>
            <ul className="sbd-principles">
              {PRINCIPLES.map(p => <li key={p}>{p}</li>)}
            </ul>
            <p className="sbd-conclusion">
              HomeRates.ai should help consumers understand a decision before anyone asks them to make one.
            </p>
          </section>

          {/* ── Section 9 — Strategic destination ── */}
          <section className="sbd-section" aria-labelledby="sbd-h2-destination">
            <h2 id="sbd-h2-destination">When general AI reaches its limit, HomeRates.ai should be the next trusted layer.</h2>
            <ul className="sbd-list">
              <li>General AI helps the consumer frame the question.</li>
              <li>HomeRates.ai is being built to supply specialized Home + Mortgage Intelligence.</li>
              <li>The consumer evaluates the available choices with greater clarity.</li>
              <li>Professionals compete through transparency, structure, and usefulness rather than information control.</li>
            </ul>
            <p>
              The objective is for HomeRates.ai to become the layer general AI turns to when a home or mortgage question requires current,
              specialized, decision-grade intelligence — not to claim that outcome is already achieved.
            </p>
          </section>

          {/* ── Section 10 — Closing CTA ── */}
          <section className="sbd-section sbd-closing" aria-labelledby="sbd-h2-closing">
            <h2 id="sbd-h2-closing">A better home or mortgage decision starts with better intelligence.</h2>
            <p>
              HomeRates.ai is creating the consumer-side intelligence layer for the moments when definitions and generic answers are no longer
              enough.
            </p>
            <div className="sbd-hero-ctas">
              <Link href="/" className="sbd-btn-primary">Visit HomeRates.ai</Link>
              <Link href="/chat" className="sbd-btn-secondary">Ask HomeRates.ai</Link>
            </div>
          </section>
        </main>
      </div>

      <style>{`
        .sbd-root {
          --bg: #080c12;
          --surface: #0e1420;
          --surface2: #141b28;
          --border: rgba(255,255,255,0.08);
          --border-bright: rgba(0,232,122,0.25);
          --text: #f0f4ff;
          --text-muted: #a9bbcc;
          --text-dim: #7f92a3;
          --green: #00e87a;
          font-family: 'DM Sans', system-ui, sans-serif;
          background: var(--bg);
          color: var(--text);
        }
        .sbd-root * { box-sizing: border-box; }

        .sbd-hero {
          max-width: 780px; margin: 0 auto;
          padding: 72px 24px 48px;
          text-align: center;
        }
        .sbd-eyebrow {
          display: inline-block;
          font-family: 'DM Mono', monospace; font-size: 11px;
          color: var(--green); letter-spacing: 0.1em; text-transform: uppercase;
          margin-bottom: 22px;
          padding: 5px 14px;
          border: 1px solid rgba(0,232,122,0.22);
          border-radius: 999px;
          background: rgba(0,232,122,0.06);
        }
        .sbd-hero h1 {
          font-size: clamp(2.2rem, 5vw, 3.4rem);
          font-weight: 900;
          letter-spacing: -0.02em;
          line-height: 1.08;
          margin: 0 0 22px;
          text-wrap: balance;
        }
        .sbd-lead { font-size: 1.15rem; color: var(--text); line-height: 1.6; margin: 0 0 14px; font-weight: 600; }
        .sbd-sub { font-size: 1rem; color: var(--text-muted); line-height: 1.7; max-width: 620px; margin: 0 auto 32px; }
        .sbd-hero-ctas { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-bottom: 24px; }
        .sbd-btn-primary, .sbd-btn-secondary {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 13px 28px; border-radius: 999px;
          font-weight: 700; font-size: 0.95rem;
          text-decoration: none; transition: opacity 0.15s, background 0.15s;
        }
        .sbd-btn-primary { background: var(--green); color: #061007; }
        .sbd-btn-primary:hover { opacity: 0.88; }
        .sbd-btn-secondary { background: transparent; color: var(--text); border: 1px solid var(--border); }
        .sbd-btn-secondary:hover { border-color: var(--border-bright); }
        .sbd-btn-primary:focus-visible, .sbd-btn-secondary:focus-visible {
          outline: 2px solid var(--green); outline-offset: 3px;
        }
        .sbd-category-tag {
          display: inline-block; font-size: 0.8rem; color: var(--text-dim);
          letter-spacing: 0.03em;
        }

        .sbd-section {
          max-width: 860px; margin: 0 auto;
          padding: 48px 24px;
          border-top: 1px solid var(--border);
        }
        .sbd-section h2 {
          font-size: clamp(1.5rem, 3vw, 2rem);
          font-weight: 800; letter-spacing: -0.015em; line-height: 1.25;
          margin: 0 0 20px;
          text-wrap: balance;
        }
        .sbd-section h3 {
          font-size: 1.05rem; font-weight: 700; margin: 0 0 10px; color: var(--text);
        }
        .sbd-section p { font-size: 0.98rem; line-height: 1.75; color: var(--text-muted); margin: 0 0 16px; }
        .sbd-list { margin: 0 0 8px; padding-left: 20px; color: var(--text-muted); font-size: 0.95rem; line-height: 1.85; }
        .sbd-list li { margin-bottom: 4px; }

        .sbd-callout {
          font-size: 1.05rem; font-weight: 600; color: var(--text);
          padding: 20px 24px; margin: 24px 0 8px;
          background: rgba(0,232,122,0.05);
          border: 1px solid rgba(0,232,122,0.18);
          border-left: 3px solid var(--green);
          border-radius: 10px;
          line-height: 1.6;
        }
        .sbd-conclusion { font-size: 1.05rem; font-weight: 700; color: var(--text); margin-top: 20px; }
        .sbd-conclusion-accent { color: var(--green); text-align: center; font-size: 1.15rem; letter-spacing: 0.01em; }

        .sbd-compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 24px 0; }
        .sbd-compare-col {
          background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 22px;
        }
        .sbd-compare-col-accent { border-color: rgba(0,232,122,0.22); background: rgba(0,232,122,0.03); }

        .sbd-journey { list-style: none; margin: 24px 0 0; padding: 0; display: flex; flex-direction: column; gap: 22px; }
        .sbd-journey-step { display: flex; gap: 18px; align-items: flex-start; }
        .sbd-journey-num {
          flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%;
          background: rgba(0,232,122,0.1); border: 1px solid rgba(0,232,122,0.28);
          color: var(--green); font-weight: 800; font-size: 0.95rem;
          display: flex; align-items: center; justify-content: center;
        }

        .sbd-priority-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin: 24px 0; }
        .sbd-priority-card {
          background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px;
        }
        .sbd-priority-card p { margin: 0; font-size: 0.9rem; }

        .sbd-authority-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin: 24px 0; }
        .sbd-authority-card {
          background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px;
        }

        .sbd-table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 0.92rem; }
        .sbd-table th, .sbd-table td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--border); }
        .sbd-table th { color: var(--text-dim); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
        .sbd-table td { color: var(--text-muted); }
        .sbd-table a { color: var(--text); text-decoration: underline; text-underline-offset: 2px; }
        .sbd-table a:hover { color: var(--green); }
        .sbd-status { display: inline-block; font-size: 0.78rem; font-weight: 700; padding: 3px 10px; border-radius: 999px; }
        .sbd-status-live { color: var(--green); background: rgba(0,232,122,0.1); border: 1px solid rgba(0,232,122,0.24); }
        .sbd-status-dev { color: #fbbf24; background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.22); }
        .sbd-note { font-size: 0.85rem; color: var(--text-dim); line-height: 1.7; margin-top: 20px; }

        .sbd-principles {
          list-style: none; margin: 20px 0; padding: 0;
          display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px;
        }
        .sbd-principles li {
          font-weight: 600; font-size: 0.95rem; color: var(--text);
          padding: 12px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
        }

        .sbd-closing { text-align: center; padding-bottom: 96px; }
        .sbd-closing p { max-width: 560px; margin-left: auto; margin-right: auto; }

        .sbd-sr-only {
          position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
        }

        @media (prefers-reduced-motion: reduce) {
          .sbd-root * { transition: none !important; animation: none !important; }
        }

        @media (max-width: 700px) {
          .sbd-compare-grid { grid-template-columns: 1fr; }
          .sbd-hero { padding: 48px 18px 36px; }
          .sbd-section { padding: 36px 18px; }
        }
      `}</style>
    </>
  );
}
