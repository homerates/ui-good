// app/knowledge-hub/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { knowledgeHubArticles } from './articles';

export const metadata: Metadata = {
  title: 'Knowledge Hub | HomeRates.ai',
  description: 'In-depth mortgage education: loan types, qualification guides, rate education, and first-time buyer resources.',
  alternates: { canonical: 'https://chat.homerates.ai/knowledge-hub' },
};

const CATEGORY_COLORS: Record<string, string> = {
  'Getting Started': '#00e87a',
  'Rate Education': '#3d8bff',
  'Loan Types': '#a78bfa',
  'Programs': '#ff8c42',
};

export default function KnowledgeHubPage() {
  const topics = [
    'Conventional Loans', 'FHA Loans', 'VA Loans', 'Jumbo Loans', 'DSCR Loans',
    'ARM Loans', 'Bank Statement Loans', 'Down Payment Assistance', 'Rate Buydowns',
    'DTI Explained', 'PMI vs MIP', 'Mortgage Roadmap', 'Pre-Approval Guide',
    'Loan Limits 2026', 'PITI Breakdown', 'Affordability Calculator',
    'Refinance Guide', 'Closing Costs', 'Escrow Explained', 'Credit Score Impact',
  ];
  // duplicate for seamless loop
  const marqueeItems = [...topics, ...topics];

  return (
    <>
      <style>{`
        body:has(.kh-root) {
          display: block !important;
          height: auto !important;
          overflow: visible !important;
        }
        html:has(.kh-root) {
          height: auto !important;
          overflow: visible !important;
        }
        .kh-root {
          --bg: #080c12;
          --surface: #0e1420;
          --surface2: #141b28;
          --border: rgba(255,255,255,0.07);
          --border-bright: rgba(255,255,255,0.13);
          --text: #f0f4ff;
          --text-muted: #6b7a99;
          --text-dim: #3a4560;
          --green: #00e87a;
          --green-dim: rgba(0,232,122,0.10);
          --blue: #3d8bff;
          --purple: #a78bfa;
          --orange: #ff8c42;
          font-family: 'DM Sans', sans-serif;
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
        }
        .kh-root * { box-sizing: border-box; }
        body:has(.kh-root) .app-footer { display: none; }

        /* TICKER */
        .kh-ticker {
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          height: 40px;
          display: flex;
          align-items: center;
          overflow: hidden;
          position: relative;
        }
        .kh-ticker-label {
          flex-shrink: 0;
          padding: 0 16px;
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          font-weight: 600;
          color: var(--green);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          border-right: 1px solid var(--border);
          height: 100%;
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--surface);
          z-index: 2;
        }
        .kh-ticker-label::before {
          content: '';
          width: 6px; height: 6px;
          background: var(--green);
          border-radius: 50%;
          animation: kh-pulse 2s infinite;
        }
        .kh-ticker-wrap { overflow: hidden; flex: 1; }
        .kh-ticker-track {
          display: flex;
          animation: kh-ticker 32s linear infinite;
          width: max-content;
        }
        .kh-ticker-item {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 0 24px;
          font-family: 'DM Mono', monospace;
          font-size: 11px;
          color: var(--text-muted);
          white-space: nowrap;
          border-right: 1px solid var(--border);
          height: 40px;
          transition: color 0.2s;
        }
        .kh-ticker-item::before {
          content: '→';
          color: var(--green);
          font-size: 10px;
        }

        @keyframes kh-ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes kh-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes kh-fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }


        /* NAV */
        .kh-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 40px;
          border-bottom: 1px solid var(--border);
          background: var(--bg);
        }
        .kh-nav-logo { display: flex; align-items: center; text-decoration: none; }
        .kh-nav-logo img { height: 32px; width: auto; }
        .kh-nav-links { display: flex; gap: 24px; list-style: none; padding: 0; margin: 0; }
        .kh-nav-links a {
          font-size: 13px; color: var(--text-muted);
          text-decoration: none; transition: color 0.2s;
        }
        .kh-nav-links a:hover { color: var(--text); }
        .kh-nav-links a.active { color: var(--green); }
        .kh-nav-back {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 13px; color: var(--text-muted);
          text-decoration: none; transition: color 0.2s;
        }
        .kh-nav-back:hover { color: var(--text); }

        /* HERO */
        .kh-hero {
          max-width: 1100px;
          margin: 0 auto;
          padding: 64px 40px 48px;
        }
        .kh-eyebrow {
          display: inline-flex; align-items: center; gap: 8px;
          font-family: 'DM Mono', monospace; font-size: 11px;
          color: var(--green); letter-spacing: 0.1em; text-transform: uppercase;
          margin-bottom: 20px;
        }
        .kh-hero h1 {
          font-family: 'Syne', sans-serif;
          font-size: 48px; font-weight: 800;
          line-height: 1.1; margin: 0 0 16px;
        }
        .kh-hero h1 span { color: var(--green); }
        .kh-hero p {
          font-size: 17px; color: var(--text-muted);
          max-width: 580px; line-height: 1.7; margin: 0;
        }

        /* SECOND TICKER (article titles) */
        .kh-ticker2 {
          background: linear-gradient(135deg, rgba(0,232,122,0.04), transparent);
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          height: 40px;
          display: flex;
          align-items: center;
          overflow: hidden;
          margin-bottom: 64px;
        }
        .kh-ticker2-label {
          flex-shrink: 0;
          padding: 0 16px;
          font-family: 'DM Mono', monospace;
          font-size: 10px; font-weight: 600;
          color: var(--purple); letter-spacing: 0.12em;
          text-transform: uppercase;
          border-right: 1px solid var(--border);
          height: 100%;
          display: flex; align-items: center;
          background: var(--bg);
        }
        .kh-ticker2-track {
          display: flex;
          animation: kh-ticker 40s linear infinite reverse;
          width: max-content;
        }
        .kh-ticker2-item {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 0 24px;
          font-family: 'DM Mono', monospace; font-size: 11px;
          color: var(--text-dim); white-space: nowrap;
          border-right: 1px solid var(--border); height: 40px;
        }

        /* ARTICLE GRID */
        .kh-grid-wrap {
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 40px 80px;
        }
        .kh-section-label {
          font-family: 'DM Mono', monospace;
          font-size: 10px; font-weight: 600;
          color: var(--text-dim); letter-spacing: 0.12em;
          text-transform: uppercase; margin-bottom: 28px;
        }
        .kh-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }
        .kh-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 28px;
          text-decoration: none;
          display: flex; flex-direction: column;
          transition: border-color 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .kh-card:hover {
          border-color: var(--border-bright);
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        .kh-card-cat {
          font-family: 'DM Mono', monospace;
          font-size: 10px; font-weight: 600;
          letter-spacing: 0.1em; text-transform: uppercase;
          margin-bottom: 12px;
        }
        .kh-card h2 {
          font-family: 'Syne', sans-serif;
          font-size: 18px; font-weight: 700;
          color: var(--text); line-height: 1.3;
          margin: 0 0 10px;
        }
        .kh-card p {
          font-size: 13px; color: var(--text-muted);
          line-height: 1.6; margin: 0 0 20px;
          flex: 1;
        }
        .kh-card-meta {
          display: flex; align-items: center; gap: 12px;
          font-family: 'DM Mono', monospace;
          font-size: 10px; color: var(--text-dim);
        }
        .kh-card-meta span { white-space: nowrap; }
        .kh-card-arrow {
          margin-left: auto;
          color: var(--text-dim);
          font-size: 14px;
          transition: transform 0.2s, color 0.2s;
        }
        .kh-card:hover .kh-card-arrow {
          transform: translateX(4px);
          color: var(--green);
        }

        /* FOOTER */
        .kh-footer {
          max-width: 1100px; margin: 0 auto;
          padding: 32px 40px;
          display: flex; align-items: center; justify-content: space-between;
          border-top: 1px solid var(--border);
        }
        .kh-footer-left { font-size: 12px; color: var(--text-dim); }
        .kh-footer-links { display: flex; gap: 20px; }
        .kh-footer-links a {
          font-size: 12px; color: var(--text-dim);
          text-decoration: none; transition: color 0.2s;
        }
        .kh-footer-links a:hover { color: var(--text-muted); }

        @media (max-width: 900px) {
          .kh-hero { padding: 40px 20px 32px; }
          .kh-hero h1 { font-size: 32px; }
          .kh-grid { grid-template-columns: 1fr 1fr; }
          .kh-grid-wrap { padding: 0 20px 60px; }
          .kh-nav { padding: 14px 20px; }
          .kh-nav-links { display: none; }
        }
        @media (max-width: 600px) {
          .kh-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="kh-root">
        {/* NAV */}
        <nav className="kh-nav">
          <Link href="/" className="kh-nav-logo">
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" />
          </Link>
          <ul className="kh-nav-links">
            <li><Link href="/chat">Calculator</Link></li>
            <li><Link href="/market-news">Market News</Link></li>
            <li><Link href="/knowledge-hub" className="active">Knowledge Hub</Link></li>
          </ul>
          <Link href="/" className="kh-nav-back">
            ← Home
          </Link>
        </nav>

        {/* TOP TICKER */}
        <div className="kh-ticker">
          <div className="kh-ticker-label">TOPICS</div>
          <div className="kh-ticker-wrap">
            <div className="kh-ticker-track">
              {marqueeItems.map((topic, i) => (
                <div key={i} className="kh-ticker-item">{topic}</div>
              ))}
            </div>
          </div>
        </div>

        {/* HERO */}
        <div className="kh-hero">
          <div className="kh-eyebrow">&#9679; Mortgage Education</div>
          <h1>The <span>Knowledge Hub</span></h1>
          <p>In-depth guides on every loan type, qualification criteria, rate dynamics, and first-time buyer strategy — written for clarity, not for clicks.</p>
        </div>

        {/* SECOND TICKER (article titles) */}
        <div className="kh-ticker2">
          <div className="kh-ticker2-label">ARTICLES</div>
          <div className="kh-ticker-wrap">
            <div className="kh-ticker2-track">
              {[...knowledgeHubArticles, ...knowledgeHubArticles].map((a, i) => (
                <div key={i} className="kh-ticker2-item">✦ {a.title}</div>
              ))}
            </div>
          </div>
        </div>

        {/* ARTICLE GRID */}
        <div className="kh-grid-wrap">
          <div className="kh-section-label">All Articles — {knowledgeHubArticles.length} guides</div>
          <div className="kh-grid">
            {knowledgeHubArticles.map((article) => {
              const catColor = CATEGORY_COLORS[article.category] ?? '#6b7a99';
              return (
                <Link key={article.slug} href={`/knowledge-hub/${article.slug}`} className="kh-card">
                  <div className="kh-card-cat" style={{ color: catColor }}>{article.category}</div>
                  <h2>{article.title}</h2>
                  <p>{article.excerpt}</p>
                  <div className="kh-card-meta">
                    <span>{article.date}</span>
                    <span>·</span>
                    <span>{article.readTime}</span>
                    <span className="kh-card-arrow">→</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* FOOTER */}
        <footer className="kh-footer">
          <div className="kh-footer-left">HomeRates.ai · Educational content only · Not financial advice</div>
          <div className="kh-footer-links">
            <Link href="/market-news">Market News</Link>
            <Link href="/disclosures">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/chat">Ask a question</Link>
          </div>
        </footer>
      </div>
    </>
  );
}
