// app/platform/page.tsx
// Hub page for all 7 Platform Intelligence pillar pages
import type { Metadata } from 'next';
import Link from 'next/link';
import AppNav from "../components/AppNav";

export const metadata: Metadata = {
  title: 'Platform Intelligence — How HomeRates.AI Works | HomeRates.AI',
  description: 'Everything that makes HomeRates.AI different — private vault, unbiased rates, DSCR calculator, property intelligence cards, and why we\'re the anti-lead-gen revolution.',
  alternates: { canonical: 'https://chat.homerates.ai/platform' },
};

const PILLARS = [
  {
    icon: '🏆',
    eyebrow: 'Platform Overview',
    title: 'Best Unbiased Mortgage AI Platform 2026',
    summary: 'How HomeRates.AI compares to Bankrate, LendingTree, and Zillow Mortgage — and why deterministic math + zero lead-gen changes everything.',
    href: '/best-mortgage-ai-platform',
    accent: '#00e87a',
  },
  {
    icon: '🔐',
    eyebrow: 'Privacy & Ownership',
    title: 'Private Vault Mortgage Intelligence — No Lead Gen',
    summary: 'Every scenario, card, and PDF stored in your personal Supabase vault secured by Clerk authentication. Your data never leaves. We never sell it.',
    href: '/private-vault-mortgage',
    accent: '#00e87a',
  },
  {
    icon: '⚖️',
    eyebrow: 'Consumer Guide',
    title: 'How to Compare Mortgage Quotes Without Getting Sold',
    summary: 'Step-by-step: Loan Estimate comparison template, red flags checklist, and the right questions to ask any lender before you share a single piece of personal information.',
    href: '/compare-mortgage-quotes',
    accent: '#00e87a',
  },
  {
    icon: '📊',
    eyebrow: 'Investor Tool',
    title: 'Best DSCR Calculator with Real-Time Data 2026',
    summary: 'Deterministic debt service coverage ratio math with live FRED rates, AI analysis, and vault storage. No lead forms, no lender referrals.',
    href: '/best-dscr-calculator-2026',
    accent: '#00e87a',
  },
  {
    icon: '📈',
    eyebrow: 'Live FRED Data',
    title: 'Unbiased Mortgage Rates and Affordability Tool',
    summary: 'Rates pulled directly from the Federal Reserve — not lender-paid placements. Deterministic PITI, DTI, and cash-to-close for any scenario.',
    href: '/unbiased-mortgage-rates',
    accent: '#00e87a',
  },
  {
    icon: '🧠',
    eyebrow: 'How It Works',
    title: 'How to Use Property Intelligence Cards',
    summary: 'Paste any address or listing URL, get a full Intelligence Card — PITI, loan zone, rate sensitivity, market snapshot — saved to your private vault.',
    href: '/property-intelligence-cards',
    accent: '#00e87a',
  },
  {
    icon: '⚡',
    eyebrow: 'Industry Disruption',
    title: 'Consumer-Controlled Mortgage Platform vs Lead-Gen Sites',
    summary: 'The definitive comparison: why every traditional mortgage site\'s business model is structurally misaligned with your interests — and what we built instead.',
    href: '/consumer-mortgage-platform',
    accent: '#ff8c42',
  },
];

export default function PlatformPage() {
  return (
    <>
      <style>{`
        body:has(.ps-root){display:block!important;height:auto!important;overflow:visible!important;}
        html:has(.ps-root){height:auto!important;overflow:visible!important;}
        body:has(.ps-root) .app-footer{display:none!important;}
        .ps-root{min-height:100vh;width:100%;background:#080c12;color:#e0f0e8;
          font-family:var(--font-dm-sans,'DM Sans',sans-serif);
          display:flex;flex-direction:column;align-items:center;overflow-x:hidden;box-sizing:border-box;}
        .ps-root *{box-sizing:border-box;}

        /* Nav */
        .ph-header{position:sticky;top:0;z-index:50;width:100%;
          background:rgba(8,12,18,0.92);backdrop-filter:blur(12px);
          border-bottom:1px solid rgba(255,255,255,0.06);}
        .ph-header-inner{max-width:900px;margin:0 auto;padding:0 24px;height:56px;
          display:flex;align-items:center;justify-content:space-between;}
        .ph-logo-link{display:flex;align-items:center;text-decoration:none;}
        .ph-logo{height:26px;width:auto;}
        .ph-nav-links{display:flex;align-items:center;gap:24px;}
        .ph-nav-link{font-size:0.82rem;color:rgba(185,208,192,0.6);text-decoration:none;transition:color 0.15s;}
        .ph-nav-link:hover{color:#e0f0e8;}
        .ph-cta-link{display:inline-flex;align-items:center;gap:6px;font-size:0.82rem;
          font-weight:600;color:#00e87a;text-decoration:none;padding:6px 14px;
          border:1px solid rgba(0,232,122,0.3);border-radius:8px;transition:background 0.15s;}
        .ph-cta-link:hover{background:rgba(0,232,122,0.08);}

        /* Hero */
        .ph-main{width:100%;max-width:900px;padding:56px 24px 80px;display:flex;flex-direction:column;gap:48px;}
        .ph-hero{text-align:center;}
        .ph-eyebrow{display:inline-block;font-size:0.72rem;font-weight:700;letter-spacing:0.1em;
          text-transform:uppercase;color:#00e87a;background:rgba(0,232,122,0.1);
          border:1px solid rgba(0,232,122,0.2);border-radius:6px;padding:4px 10px;margin-bottom:16px;}
        .ph-h1{font-size:clamp(2rem,4vw,3rem);font-weight:800;color:#f0f4ff;
          line-height:1.12;margin:0 0 16px;}
        .ph-subtitle{font-size:1rem;color:rgba(185,208,192,0.7);max-width:580px;
          margin:0 auto;line-height:1.65;}

        /* Disruptive banner */
        .ph-banner{background:rgba(0,232,122,0.05);border:1px solid rgba(0,232,122,0.15);
          border-radius:14px;padding:20px 24px;font-size:0.9rem;line-height:1.7;
          color:rgba(185,208,192,0.8);text-align:center;}
        .ph-banner strong{color:#00e87a;}

        /* Pillar grid */
        .ph-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;}

        /* Pillar card */
        .ph-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);
          border-radius:16px;padding:24px;display:flex;flex-direction:column;gap:12px;
          text-decoration:none;transition:background 0.2s,border-color 0.2s,transform 0.15s;}
        .ph-card:hover{background:rgba(255,255,255,0.05);border-color:rgba(0,232,122,0.25);
          transform:translateY(-2px);}
        .ph-card-top{display:flex;align-items:center;gap:10px;}
        .ph-card-icon{font-size:1.5rem;flex-shrink:0;}
        .ph-card-eyebrow{font-size:0.68rem;font-weight:700;letter-spacing:0.08em;
          text-transform:uppercase;color:rgba(0,232,122,0.7);}
        .ph-card-title{font-size:0.98rem;font-weight:700;color:#f0f4ff;line-height:1.3;}
        .ph-card-summary{font-size:0.85rem;color:rgba(185,208,192,0.7);line-height:1.6;flex:1;}
        .ph-card-read{font-size:0.82rem;font-weight:600;color:#00e87a;margin-top:4px;}
        .ph-card:hover .ph-card-read::after{content:' →';}
        .ph-card-read::after{content:' ›';}

        /* CTA */
        .ph-cta-block{text-align:center;padding:32px;
          background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:16px;}
        .ph-cta-p{font-size:0.95rem;color:rgba(185,208,192,0.7);margin:0 0 16px;}
        .ph-cta-btn{display:inline-flex;align-items:center;gap:8px;background:#00e87a;
          color:#080c12;font-size:0.95rem;font-weight:700;padding:14px 32px;
          border-radius:10px;text-decoration:none;transition:background 0.15s;}
        .ph-cta-btn:hover{background:#00ff8a;}

        /* Footer */
        .ph-footer{width:100%;border-top:1px solid rgba(255,255,255,0.06);padding:20px 24px;
          display:flex;align-items:center;justify-content:center;flex-wrap:wrap;
          gap:8px;font-size:0.78rem;color:rgba(185,208,192,0.4);}
        .ph-footer a{color:rgba(0,232,122,0.5);text-decoration:none;}
        .ph-footer a:hover{color:#00e87a;}
        .ph-footer-sep{opacity:0.4;}

        @media(max-width:600px){
          .ph-nav-links .ph-nav-link{display:none;}
          .ph-grid{grid-template-columns:1fr;}
        }
      `}</style>

      <div className="ps-root">
        <header className="ph-header">
          <div className="ph-header-inner">
            <Link href="/" className="ph-logo-link">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.AI" className="ph-logo" />
            </Link>
            <nav className="ph-nav-links">
              <Link href="/about" className="ph-nav-link">About</Link>
              <Link href="/why-homerates" className="ph-nav-link">Why HomeRates</Link>
              <Link href="/chat" className="ph-cta-link">Try free →</Link>
              <AppNav drawerOnly />
            </nav>
          </div>
        </header>

        <main className="ph-main">
          {/* Hero */}
          <div className="ph-hero">
            <span className="ph-eyebrow">Platform Intelligence</span>
            <h1 className="ph-h1">Everything That Makes<br />HomeRates.AI Different</h1>
            <p className="ph-subtitle">
              Seven deep-dives into what we built, why we built it, and how it puts you — the consumer — in control of the most important financial decision of your life.
            </p>
          </div>

          {/* Disruptive banner */}
          <div className="ph-banner">
            <strong>The anti-lead-gen revolution.</strong> Real-time FRED data → deterministic math → AI reasoning → your private vault. Zero lead forms. Zero data harvesting. Zero lender hand-offs. <strong>You are the customer, not the product.</strong>
          </div>

          {/* Pillar grid */}
          <div className="ph-grid">
            {PILLARS.map(p => (
              <Link key={p.href} href={p.href} className="ph-card">
                <div className="ph-card-top">
                  <span className="ph-card-icon">{p.icon}</span>
                  <span className="ph-card-eyebrow">{p.eyebrow}</span>
                </div>
                <div className="ph-card-title">{p.title}</div>
                <div className="ph-card-summary">{p.summary}</div>
                <div className="ph-card-read">Read full guide</div>
              </Link>
            ))}
          </div>

          {/* CTA */}
          <div className="ph-cta-block">
            <p className="ph-cta-p">Ready to see it in action? Paste any address — get a full Intelligence Card in seconds. No email. No forms.</p>
            <Link href="/homeowner" className="ph-cta-btn">Try free — paste any address or URL →</Link>
          </div>
        </main>

        <footer className="ph-footer">
          <span>HomeRates.AI — educational tool, not a lender or broker.</span>
          <span className="ph-footer-sep">•</span>
          <Link href="/about">About</Link>
          <span className="ph-footer-sep">•</span>
          <Link href="/disclosures">Terms</Link>
          <span className="ph-footer-sep">•</span>
          <Link href="/privacy">Privacy</Link>
        </footer>
      </div>
    </>
  );
}
