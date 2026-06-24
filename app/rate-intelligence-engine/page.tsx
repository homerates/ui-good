// app/rate-intelligence-engine/page.tsx
// SEO landing page — /rate-intelligence-engine
// Target keywords: "what affects mortgage rate" (5,400/mo) · "LLPA calculator" (720/mo)
//                  "how are mortgage rates calculated" (12,000/mo) · "mortgage rate breakdown" (2,400/mo)

import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import RateEngineClient from './RateEngineClient';

// ─────────────────────────────────────────────
// META
// ─────────────────────────────────────────────
export const metadata: Metadata = {
  title: 'Mortgage Rate Intelligence Engine — Decode Your Real Rate | HomeRates.ai',
  description:
    'See exactly why your mortgage rate is what it is. Enter your credit score, LTV, and loan type — get the Fannie Mae LLPA breakdown, full rate/cost curve, and a negotiation brief. Free, no login required.',
  keywords: [
    'what affects mortgage rate',
    'mortgage LLPA calculator',
    'loan level price adjustment calculator',
    'how are mortgage rates calculated',
    'mortgage rate breakdown',
    'why is my mortgage rate higher',
    'mortgage pricing calculator',
    'Fannie Mae LLPA matrix 2026',
  ],
  openGraph: {
    title: 'Mortgage Rate Intelligence Engine — Decode Your Real Rate | HomeRates.ai',
    description:
      'Decode exactly why your mortgage rate is what it is. LLPA breakdown, rate/cost curve, and negotiation brief — powered by live FRED data and the public Fannie Mae matrix.',
    url: 'https://chat.homerates.ai/rate-intelligence-engine',
    siteName: 'HomeRates.ai',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mortgage Rate Intelligence Engine | HomeRates.ai',
    description: 'Decode your real mortgage rate. LLPA breakdown, rate options, negotiation brief — live FRED data.',
  },
  alternates: {
    canonical: 'https://chat.homerates.ai/rate-intelligence-engine',
  },
};

// ─────────────────────────────────────────────
// JSON-LD
// ─────────────────────────────────────────────
const schemaFAQ = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What are Loan-Level Price Adjustments (LLPAs)?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Loan-Level Price Adjustments (LLPAs) are risk-based pricing fees that Fannie Mae and Freddie Mac charge on conventional conforming loans. They are set based on your credit score, LTV, occupancy type, loan purpose, and property type. LLPAs are paid as price points at closing (1 point = 1% of loan amount) or absorbed into a higher rate. They are publicly documented on singlefamily.fanniemae.com.',
      },
    },
    {
      '@type': 'Question',
      name: 'Why is my mortgage rate higher than the rate I see advertised?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Advertised rates assume the best-case scenario: 760+ credit score, 20% down payment, owner-occupied single-family home, purchase loan. Your actual rate includes Fannie Mae LLPAs (risk adjustments based on your credit score, LTV, and loan type) plus the lender\'s own margin. Use the HomeRates.ai Rate Intelligence Engine to see exactly how each factor adds to your specific rate.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do I use mortgage discount points to lower my rate?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Discount points are upfront fees that buy down your interest rate. Typically, 1 discount point (1% of loan amount) reduces your rate by approximately 0.25%. The break-even period is how many months it takes for the monthly savings to recoup the upfront cost — typically 48–72 months. If you plan to hold the loan longer than the break-even period, points are usually worth it. The HomeRates.ai Rate Intelligence Engine calculates the exact break-even for your scenario.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is a lender credit and how does it work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A lender credit is when you take a higher-than-par interest rate in exchange for a cash credit from the lender that covers part or all of your closing costs. It is the reverse of paying discount points: instead of paying more upfront for a lower rate, you accept a slightly higher monthly payment and receive money at closing. Lender credits make sense if you plan to sell or refinance before a break-even point, or if you are short on cash at closing.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do all lenders charge the same LLPAs?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes — the base LLPA matrix is set by Fannie Mae and applies to all conforming loans sold to Fannie Mae, regardless of lender. What differs between lenders is their own origination margin (typically 0.50–1.50 points) added on top of the LLPAs. This is why comparing at least 3 Loan Estimates is essential — the LLPAs are fixed, but the lender margin is negotiable.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do I get the best mortgage rate?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'To minimize your mortgage rate: (1) Maximize your credit score — 760+ earns the best LLPA tier. (2) Increase your down payment — lower LTV reduces price adjustments, especially at the 60%, 75%, and 80% thresholds. (3) Choose a 15-day lock if you can close quickly — saves 0.125 points. (4) Get at least 3 Loan Estimates and compare origination fees on Line A. (5) Ask each lender for the "pricing sheet" to verify their LLPA total matches the Fannie Mae public matrix.',
      },
    },
  ],
};

const schemaSoftwareApp = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'HomeRates.ai Rate Intelligence Engine',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  url: 'https://chat.homerates.ai/rate-intelligence-engine',
  description:
    'Decodes mortgage pricing by computing the exact Fannie Mae LLPA breakdown for any conventional loan scenario. Shows the full rate/cost curve, discount point break-even analysis, and a consumer negotiation brief. Uses live FRED par rate data.',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  author: { '@type': 'Organization', name: 'HomeRates.ai', url: 'https://chat.homerates.ai' },
  featureList: [
    'Fannie Mae LLPA matrix — credit score × LTV breakdown',
    'Occupancy, loan purpose, and property type surcharges',
    'High-balance (jumbo conforming) adjustment',
    'Lock period pricing (15/30/45/60 day)',
    'Full rate/cost curve with break-even analysis',
    'Discount point vs lender credit recommendation',
    'Consumer negotiation brief with specific talking points',
    'Live FRED 30-year par rate data',
  ],
};

const schemaBreadcrumb = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'HomeRates.ai', item: 'https://chat.homerates.ai' },
    { '@type': 'ListItem', position: 2, name: 'Calculators', item: 'https://chat.homerates.ai/calculators' },
    { '@type': 'ListItem', position: 3, name: 'Rate Intelligence Engine', item: 'https://chat.homerates.ai/rate-intelligence-engine' },
  ],
};

// ─────────────────────────────────────────────
// FAQ DATA — rendered on page + in JSON-LD
// ─────────────────────────────────────────────
const faqs = [
  {
    q: 'What are Loan-Level Price Adjustments (LLPAs)?',
    a: 'LLPAs are risk-based fees set by Fannie Mae that apply to all conventional conforming loans. They are charged based on your credit score, LTV, occupancy, loan purpose, and property type. The full matrix is publicly posted at singlefamily.fanniemae.com. HomeRates.ai encodes this public data so you can see your exact adjustment before talking to a lender.',
  },
  {
    q: 'Why is my rate higher than the advertised rate?',
    a: 'Advertised "as low as" rates assume a perfect borrower: 760+ FICO, 20% down, primary residence, purchase loan on an SFR. Your actual rate includes your LLPA total (which can add 0–4+ points to your base cost) plus the lender\'s own margin. The Rate Intelligence Engine shows exactly how each factor affects your specific rate.',
  },
  {
    q: 'How do mortgage discount points work?',
    a: 'One discount point (1% of loan amount) typically buys down your rate by ~0.25%. The break-even period is how many months until monthly savings recoup the cost — usually 48–72 months. If you keep the loan past break-even, points save money. If you sell or refi before that, skip them and take lender credits instead.',
  },
  {
    q: 'What is a lender credit?',
    a: 'A lender credit lets you take a slightly higher rate in exchange for cash at closing — the opposite of paying discount points. It makes sense if you plan to sell or refi within a few years, or need to reduce your closing costs. The Rate Options table shows the exact dollar amount for your scenario.',
  },
  {
    q: 'Do all lenders charge the same LLPAs?',
    a: 'Yes — the base LLPA matrix is fixed by Fannie Mae and applies to every lender selling conforming loans to Fannie Mae. What varies between lenders is their own origination margin on top (typically 0.50–1.50 points). This is why getting 3 Loan Estimates matters: LLPAs are the same everywhere, but lender margin is negotiable.',
  },
  {
    q: 'How do I get the best rate for my scenario?',
    a: 'The highest-impact moves: get your credit score to 760+ (best LLPA tier), put down 20% or more (drops LTV below 80%), close in 15 days if possible (-0.125 pts), and compare at least 3 Loan Estimates by origination fee (Line A). The Rate Intelligence Engine shows your break-even on each scenario.',
  },
];

// ─────────────────────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────────────────────
export default function RateIntelligenceEnginePage() {
  return (
    <>
      {/* JSON-LD */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaFAQ) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaSoftwareApp) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaBreadcrumb) }} />

      {/* Nav */}
      <nav className="rie-nav">
        <Link href="/" className="rie-nav-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" style={{ height: 30, width: 'auto' }} />
        </Link>
        <Link href="/chat" className="rie-nav-cta">Try the AI →</Link>
      </nav>

      <main className="rie-page">

        {/* Breadcrumb */}
        <nav className="rie-breadcrumb" aria-label="Breadcrumb">
          <ol>
            <li><Link href="/">HomeRates.ai</Link></li>
            <li aria-hidden="true">›</li>
            <li><Link href="/calculators">Calculators</Link></li>
            <li aria-hidden="true">›</li>
            <li aria-current="page">Rate Intelligence Engine</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="rie-hero">
          <h1>Mortgage Rate Intelligence Engine<br /><span className="rie-hero-sub">Decode exactly what your rate is — and why</span></h1>
          <p className="rie-hero-lead">
            Most borrowers never see the Fannie Mae pricing matrix that determines 60–80% of their rate.
            Enter your scenario — get the full LLPA breakdown, a rate/cost curve with break-even analysis,
            and four talking points for your lender negotiation. Powered by the public Fannie Mae matrix and live FRED data.
          </p>
          <div className="rie-trust-bar">
            <span className="rie-trust-item">📡 Live FRED par rate</span>
            <span className="rie-trust-item">📋 Public Fannie Mae LLPA matrix</span>
            <span className="rie-trust-item">⚖️ Rate/cost curve + break-even</span>
            <span className="rie-trust-item">🔒 No login required</span>
          </div>
        </section>

        {/* Interactive calculator */}
        <section id="calculator" style={{ marginBottom: '3rem' }}>
          <Suspense fallback={<div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8fa3b8', fontSize: '0.9rem' }}>Loading calculator…</div>}>
            <RateEngineClient />
          </Suspense>
        </section>

        {/* What you get */}
        <section className="rie-section">
          <h2>What the Rate Intelligence Engine shows you</h2>
          <p className="rie-section-lead">
            Most mortgage calculators show you a payment. This tool shows you the <em>cost structure</em>
            behind your rate — the same analysis a loan officer runs before they quote you.
          </p>
          <div className="rie-features-grid">
            {[
              { icon: '📋', title: 'Full LLPA breakdown', desc: 'Every Fannie Mae price adjustment itemized — credit score, LTV, occupancy, loan purpose, property type, lock period. See exactly which factor costs you most.' },
              { icon: '📊', title: 'Rate/cost curve', desc: 'Five rate options from lender credit (+points to you) to aggressive buy-down — each with the exact dollar cost, monthly savings, and break-even period.' },
              { icon: '🎯', title: 'Recommended strategy', desc: 'Programmatic recommendation based on your break-even timeline — PAR, lender credit, or discount points — with plain-English reasoning.' },
              { icon: '💬', title: 'Negotiation brief', desc: 'Four specific talking points for your lender conversation: what to ask, where margin lives, and what you can change to move the number.' },
              { icon: '📡', title: 'Live par rate', desc: 'Anchored to the FRED Freddie Mac PMMS 30-year weekly average — the same benchmark every lender prices against.' },
              { icon: '🏦', title: 'Public matrix', desc: 'Uses the Fannie Mae LLPA matrix posted at singlefamily.fanniemae.com. The same numbers your lender uses — now in your hands.' },
            ].map(f => (
              <div key={f.title} className="rie-feature-card">
                <div className="rie-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* LLPA reference table */}
        <section className="rie-section">
          <h2>LLPA by credit score & LTV — 2026 reference</h2>
          <p className="rie-section-lead">
            Approximate base LLPAs for a standard purchase loan on a primary-residence SFR with a 30-day lock.
            All values in price points (1 point = 1% of loan amount). Source: Fannie Mae public matrix.
          </p>
          <div className="rie-table-wrapper">
            <table className="rie-table">
              <thead>
                <tr>
                  <th>Credit Score</th>
                  <th>LTV ≤ 60%</th>
                  <th>LTV 70–75%</th>
                  <th>LTV 75–80%</th>
                  <th>LTV 80–85%</th>
                  <th>LTV 90–95%</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { bucket: '760+',     v: [0.000, 0.000, 0.000, 0.250, 1.000] },
                  { bucket: '740–759',  v: [0.125, 0.500, 0.625, 0.875, 1.625] },
                  { bucket: '720–739',  v: [0.250, 0.875, 1.125, 1.375, 2.125] },
                  { bucket: '700–719',  v: [0.375, 1.125, 1.375, 1.625, 2.375] },
                  { bucket: '680–699',  v: [0.625, 1.375, 1.625, 1.875, 2.625] },
                  { bucket: '660–679',  v: [1.000, 1.750, 2.000, 2.250, 3.000] },
                  { bucket: '640–659',  v: [1.500, 2.250, 2.500, 2.750, 3.500] },
                  { bucket: '620–639',  v: [1.875, 2.625, 2.875, 3.125, 3.875] },
                  { bucket: '< 620',    v: [2.750, 3.500, 3.750, 4.000, 4.750] },
                ].map(r => (
                  <tr key={r.bucket}>
                    <td className="rie-td-bold">{r.bucket}</td>
                    {r.v.map((v, i) => (
                      <td key={i} style={{ color: v === 0 ? '#00e87a' : v < 1 ? '#f0c14b' : v < 2 ? '#ff9966' : '#ff5f5f', fontWeight: 600 }}>
                        {v.toFixed(3)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="rie-table-note">
            Base adjustments only. Add occupancy (0–1.000), loan purpose (0–2.875), property type (0–1.000),
            and lock period (−0.125 to +0.250). Use the calculator above for your full total.
          </p>
        </section>

        {/* About this tool */}
        <section className="rie-author">
          <p className="rie-author-bio">
            The LLPA matrix has been public since Fannie Mae created it — but most consumers never see it.
            HomeRates.ai was built to close that gap: the same pricing intelligence loan officers use,
            available to every borrower before they ever talk to a lender.
          </p>
          <p className="rie-last-updated">
            Matrix source: Fannie Mae LLPA Matrix, 2024 · Rate data: FRED Freddie Mac PMMS (updated weekly) · Last reviewed: June 2026
          </p>
          <p className="rie-disclaimer">
            <strong>Educational purposes only.</strong> HomeRates.ai is not a lender, broker, or mortgage advisor.
            LLPA values are based on the publicly available Fannie Mae matrix and may not reflect the most current version.
            Actual lender pricing varies. Consult a licensed mortgage professional for a formal quote. Equal Housing Opportunity.
          </p>
        </section>

        {/* FAQ */}
        <section className="rie-section">
          <h2>Frequently asked questions</h2>
          <div className="rie-faq-list">
            {faqs.map((f, i) => (
              <details key={i} className="rie-faq-item">
                <summary className="rie-faq-q">{f.q}</summary>
                <p className="rie-faq-a">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Related */}
        <section className="rie-section" style={{ marginBottom: '2rem' }}>
          <h2>Related calculators</h2>
          <div className="rie-related-grid">
            <Link href="/affordability-calculator" className="rie-related-card">
              <div className="rie-related-title">Affordability Calculator</div>
              <div className="rie-related-desc">How much house can you afford? Three scenarios with monthly payment, cash needed, and DTI analysis.</div>
            </Link>
            <Link href="/dscr-calculator" className="rie-related-card">
              <div className="rie-related-title">DSCR Calculator</div>
              <div className="rie-related-desc">Investment property cash flow, DSCR ratio, and lender qualification status.</div>
            </Link>
            <Link href="/refinance-calculator" className="rie-related-card">
              <div className="rie-related-title">Refinance Calculator</div>
              <div className="rie-related-desc">Break-even analysis, monthly savings, and rate-watch triggers for your refi decision.</div>
            </Link>
          </div>
        </section>

      </main>

      <style>{`
        body:has(.rie-nav) {
          display: block !important; height: auto !important;
          overflow: visible !important; background: #080c12 !important;
        }
        html:has(.rie-nav) { height: auto !important; overflow: visible !important; background: #080c12 !important; }
        body:has(.rie-nav) .app-footer { display: none; }

        .rie-nav {
          position: sticky; top: 0; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 32px;
          background: rgba(8,12,18,0.97); backdrop-filter: blur(10px);
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .rie-nav-logo { display: flex; align-items: center; text-decoration: none; }
        .rie-nav-cta {
          padding: 8px 20px;
          background: #00e87a; color: #080c12;
          border-radius: 999px; font-size: 0.875rem;
          font-weight: 700; text-decoration: none; transition: opacity 0.15s;
          font-family: 'DM Sans', sans-serif;
        }
        .rie-nav-cta:hover { opacity: 0.88; }

        .rie-page {
          max-width: 900px; margin: 0 auto;
          padding: 2rem 1.5rem 4rem;
          font-family: 'DM Sans', system-ui, sans-serif;
          color: #f0f4ff; line-height: 1.6;
        }

        .rie-breadcrumb ol {
          display: flex; gap: 6px; list-style: none;
          padding: 0; margin: 0 0 2rem; font-size: 13px; color: #8fa3b8;
          font-family: 'DM Mono', monospace;
        }
        .rie-breadcrumb a { color: inherit; text-decoration: none; }
        .rie-breadcrumb a:hover { color: #f0f4ff; }
        .rie-breadcrumb li[aria-current] { color: #f0f4ff; font-weight: 600; }

        .rie-hero { margin-bottom: 2.5rem; }
        .rie-page h1 {
          font-size: clamp(1.75rem, 4vw, 2.5rem); font-weight: 800;
          line-height: 1.15; margin: 0 0 1rem; letter-spacing: -0.02em; color: #f0f4ff;
        }
        .rie-hero-sub {
          display: block; font-size: clamp(1rem, 2.5vw, 1.4rem);
          font-weight: 400; color: #8fa3b8; margin-top: 0.2rem;
        }
        .rie-hero-lead { font-size: 1.05rem; max-width: 700px; color: #8fa3b8; margin: 0 0 1.25rem; }
        .rie-trust-bar { display: flex; flex-wrap: wrap; gap: 8px; }
        .rie-trust-item {
          font-size: 12px; padding: 4px 12px;
          background: rgba(255,255,255,0.04);
          border-radius: 99px; border: 1px solid rgba(255,255,255,0.07); color: #8fa3b8;
        }

        .rie-section { margin-bottom: 3rem; }
        .rie-page h2 {
          font-size: clamp(1.2rem, 2.5vw, 1.55rem); font-weight: 700;
          margin: 0 0 0.75rem; letter-spacing: -0.01em; color: #f0f4ff;
        }
        .rie-section-lead { font-size: 1rem; color: #8fa3b8; margin: 0 0 1.5rem; max-width: 680px; line-height: 1.65; }

        .rie-features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
        .rie-feature-card {
          background: #0e1420; border-radius: 12px; padding: 1.25rem;
          border: 1px solid rgba(255,255,255,0.07); transition: border-color 0.2s;
        }
        .rie-feature-card:hover { border-color: rgba(255,255,255,0.14); }
        .rie-feature-icon { font-size: 1.5rem; margin-bottom: 0.5rem; }
        .rie-feature-card h3 { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.4rem; color: #f0f4ff; }
        .rie-feature-card p { font-size: 0.875rem; color: #8fa3b8; margin: 0; line-height: 1.55; }

        .rie-table-wrapper { overflow-x: auto; margin-bottom: 0.75rem; }
        .rie-table {
          width: 100%; border-collapse: collapse; font-size: 0.875rem; min-width: 540px;
        }
        .rie-table th {
          text-align: left; font-size: 0.72rem; font-weight: 700; color: #8fa3b8;
          padding: 8px 12px; border-bottom: 1.5px solid rgba(255,255,255,0.08);
          background: #0e1420; text-transform: uppercase; letter-spacing: 0.06em;
        }
        .rie-table td { padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #8fa3b8; }
        .rie-table tr:last-child td { border-bottom: none; }
        .rie-td-bold { font-weight: 700; color: #f0f4ff !important; }
        .rie-table-note { font-size: 0.78rem; color: #8fa3b8; margin: 0; line-height: 1.5; }

        .rie-author {
          background: #0e1420; border-radius: 12px; padding: 1.5rem;
          border: 1px solid rgba(255,255,255,0.07); margin-bottom: 3rem;
        }
        .rie-author-bio { font-size: 0.9rem; color: #8fa3b8; margin: 0 0 1rem; line-height: 1.65; }
        .rie-last-updated { font-size: 0.78rem; color: #8fa3b8; margin: 0 0 0.5rem; font-family: 'DM Mono', monospace; }
        .rie-disclaimer { font-size: 0.78rem; color: #8fa3b8; margin: 0; line-height: 1.55; }

        .rie-faq-list { display: flex; flex-direction: column; gap: 8px; }
        .rie-faq-item {
          border: 1px solid rgba(255,255,255,0.07); border-radius: 10px;
          overflow: hidden; background: #0e1420; transition: border-color 0.2s;
        }
        .rie-faq-item[open] { border-color: rgba(255,255,255,0.13); }
        .rie-faq-q {
          padding: 1rem 1.25rem; font-weight: 500; font-size: 0.95rem;
          cursor: pointer; list-style: none; display: flex;
          justify-content: space-between; align-items: center; color: #f0f4ff;
        }
        .rie-faq-q::-webkit-details-marker { display: none; }
        .rie-faq-q::after { content: '+'; font-size: 1.2rem; color: #8fa3b8; }
        details[open] .rie-faq-q::after { content: '−'; }
        .rie-faq-a {
          padding: 0.75rem 1.25rem 1rem; margin: 0;
          font-size: 0.9rem; color: #8fa3b8; line-height: 1.65;
          border-top: 1px solid rgba(255,255,255,0.06);
        }

        .rie-related-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 1rem; }
        .rie-related-card {
          display: block; padding: 1.1rem 1.25rem;
          border: 1px solid rgba(255,255,255,0.07); border-radius: 12px;
          text-decoration: none; color: #f0f4ff; background: #0e1420;
          transition: border-color 0.2s, transform 0.15s;
        }
        .rie-related-card:hover { border-color: rgba(0,232,122,0.35); transform: translateY(-1px); }
        .rie-related-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 5px; }
        .rie-related-desc { font-size: 0.83rem; color: #8fa3b8; line-height: 1.5; }

        @media (max-width: 600px) {
          .rie-nav { padding: 14px 20px; }
          .rie-page { padding: 1.25rem 1rem 3rem; }
          .rie-trust-bar { gap: 6px; }
          .rie-trust-item { font-size: 11px; padding: 3px 9px; }
          .rie-features-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}
