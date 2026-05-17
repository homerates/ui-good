'use client';
// app/lab/page.tsx — HomeRates Lab: 8 live mortgage scenario modules

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppNav from '../components/AppNav';

const MODULES = [
  {
    id: 'm1', accent: '#60a5fa', badge: 'QUALIFY',
    name: 'Affordability', tag: 'INCOME → MAX PRICE',
    desc: '$200k income · $100k saved', sub: 'Max home range + DTI table',
    seed: 'How much home can I afford on $200,000 income $100,000 savings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 2v14M5 6h5.5a2.5 2.5 0 010 5H5M5 11h7"/>
      </svg>
    ),
  },
  {
    id: 'm2', accent: '#4ade80', badge: 'CONV',
    name: 'Home Purchase', tag: 'CONVENTIONAL · CONFORMING',
    desc: '$832,750 loan · 10% down', sub: 'Full PITI · PMI · income table',
    seed: 'Conventional loan with a $832,750 loan amount and 10% down at current rates',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 8.5L9 2l7 6.5"/><path d="M4.5 7V15h3v-3.5h3V15h3V7"/>
      </svg>
    ),
  },
  {
    id: 'm3', accent: '#fb923c', badge: 'HB',
    name: 'High Balance', tag: 'CONV · CA HIGH-COST ZONE',
    desc: '$935k loan · 15% down', sub: 'LA County · up to $1,249,125',
    seed: 'Conventional High Balance $1,100,000 home 15% down in Los Angeles California',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 14l4-5.5 3 3.5 5-8"/><circle cx="15" cy="4" r="1.2" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  {
    id: 'm4', accent: '#a78bfa', badge: 'FHA',
    name: 'FHA Loan', tag: 'GOV-BACKED · 3.5% DOWN',
    desc: '$580k home · 3.5% down', sub: 'MIP included · income qualify',
    seed: 'FHA loan $580,000 home 3.5% down',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 1.5L3 4.5v5c0 3.8 2.6 6.5 6 7.5 3.4-1 6-3.7 6-7.5v-5L9 1.5z"/>
        <path d="M6.5 9.5l2 2 3-3"/>
      </svg>
    ),
  },
  {
    id: 'm5', accent: '#f87171', badge: 'VA',
    name: 'VA Loan', tag: '$0 DOWN · NO PMI',
    desc: '$850k home · 0% down', sub: 'Funding fee · full breakdown',
    seed: 'VA loan $850,000 home 0% down',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 2l2 4.5h4.5l-3.6 2.7 1.4 4.5L9 11.2l-4.3 2.5 1.4-4.5L2.5 6.5H7L9 2z"/>
      </svg>
    ),
  },
  {
    id: 'm6', accent: '#fbbf24', badge: 'JUMBO',
    name: 'Jumbo Loan', tag: 'ABOVE $1,249,125',
    desc: '$1.4M home · 20% down', sub: 'Portfolio · reserves · qualify',
    seed: 'Jumbo loan $1,400,000 home 20% down',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 2l2.5 4.5h5l-4 3.5 1.5 5.5L9 13l-5 2.5 1.5-5.5-4-3.5h5L9 2z"/>
      </svg>
    ),
  },
  {
    id: 'm7', accent: '#22d3ee', badge: 'DSCR',
    name: 'Rental Property', tag: 'DSCR · NO INCOME DOCS',
    desc: '$750k · $4,800/mo rent', sub: 'Cash flow · DSCR ratio',
    seed: 'DSCR loan $750,000 rental property 25% down rent $4,800/mo',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="5.5" height="5.5" rx="1"/>
        <rect x="10.5" y="2" width="5.5" height="5.5" rx="1"/>
        <rect x="2" y="10.5" width="5.5" height="5.5" rx="1"/>
        <path d="M10.5 13.25h5M13.25 10.5v5"/>
      </svg>
    ),
  },
  {
    id: 'm8', accent: '#34d399', badge: 'REFI',
    name: 'Refinance', tag: 'RATE & TERM',
    desc: '$750k · 7.75% → 6.75%', sub: 'Savings · break-even months',
    seed: 'Refinance $750,000 balance from 7.75% down to 6.75%',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 9A5.5 5.5 0 0114 5.5"/><path d="M14.5 9A5.5 5.5 0 014 12.5"/>
        <path d="M12.5 4l2 1.5-1.5 2"/><path d="M5.5 14l-2-1.5 1.5-2"/>
      </svg>
    ),
  },
];

export default function LabPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);

  function run(seed: string) {
    router.push('/chat?sq=' + encodeURIComponent(seed));
  }

  function handleQuery(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) run(query.trim());
  }

  return (
    <div className="page-standalone lab-root">
      <style>{`
        body:has(.lab-root){display:block!important;height:auto!important;overflow:visible!important;}
        html:has(.lab-root){height:auto!important;overflow:visible!important;}

        .lab-root{
          min-height:100vh;
          background:#07090d;
          color:#f0f2f7;
          font-family:var(--font-dm-sans,'DM Sans','Inter',system-ui,sans-serif);
        }

        .lab-page{
          max-width:1160px;
          margin:0 auto;
          padding:56px 40px 80px;
        }

        /* ── Hero ── */
        .lab-hero{ margin-bottom:44px; }
        .lab-eyebrow{
          font-size:10px; font-weight:700; letter-spacing:.22em;
          color:#00e676; opacity:.7; margin-bottom:14px;
        }
        .lab-title{
          font-size:clamp(28px,4vw,46px); font-weight:800;
          letter-spacing:-.03em; line-height:1.08; color:#fff; margin-bottom:10px;
        }
        .lab-title-green{ color:#00e676; }
        .lab-sub{
          font-size:14px; color:#9aa3b5; max-width:480px; line-height:1.65;
        }

        /* ── Section row ── */
        .lab-section-row{
          display:flex; align-items:center; justify-content:space-between; margin-bottom:13px;
        }
        .lab-section-label{ font-size:10px; font-weight:700; letter-spacing:.18em; color:#5c6575; }
        .lab-section-count{ font-size:10px; color:#5c6575; font-variant-numeric:tabular-nums; }

        /* ── 4×2 grid ── */
        .lab-grid{
          display:grid;
          grid-template-columns:repeat(4,1fr);
          gap:10px;
        }

        /* ── Card ── */
        .lab-card{
          position:relative;
          background:#0f1420;
          border:1px solid rgba(255,255,255,0.07);
          border-radius:12px;
          padding:18px 18px 16px;
          cursor:pointer;
          display:flex; flex-direction:column;
          transition:background .18s, box-shadow .18s;
          overflow:hidden;
          text-align:left;
          font-family:inherit;
          color:inherit;
          outline:none;
        }
        .lab-card:hover{
          background:#141926;
        }
        /* left accent bar */
        .lab-card::before{
          content:'';
          position:absolute; left:0; top:16px; bottom:16px;
          width:2px; border-radius:0 2px 2px 0;
          background:var(--c,#00e676);
          opacity:0; transition:opacity .2s;
        }
        .lab-card:hover::before{ opacity:.8; }
        /* top glow */
        .lab-card::after{
          content:'';
          position:absolute; top:0; left:0; right:0; height:56px;
          background:linear-gradient(to bottom,var(--c,#00e676),transparent);
          opacity:0; transition:opacity .25s; pointer-events:none;
        }
        .lab-card:hover::after{ opacity:.06; }

        /* Card top row */
        .lab-card-top{
          display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:12px;
        }
        .lab-card-icon{
          width:34px; height:34px; border-radius:8px;
          display:flex; align-items:center; justify-content:center;
          background:color-mix(in srgb,var(--c,#00e676) 10%,transparent);
          border:1px solid color-mix(in srgb,var(--c,#00e676) 20%,transparent);
          color:var(--c,#00e676);
          flex-shrink:0;
          transition:background .2s;
        }
        .lab-card:hover .lab-card-icon{
          background:color-mix(in srgb,var(--c,#00e676) 16%,transparent);
        }
        .lab-card-badge{
          font-size:9px; font-weight:700; letter-spacing:.1em;
          padding:3px 8px; border-radius:4px;
          background:color-mix(in srgb,var(--c,#00e676) 10%,transparent);
          color:var(--c,#00e676);
          border:1px solid color-mix(in srgb,var(--c,#00e676) 22%,transparent);
        }

        /* Card body */
        .lab-card-name{ font-size:14px; font-weight:700; color:#fff; margin-bottom:3px; line-height:1.2; }
        .lab-card-tag { font-size:10px; font-weight:600; letter-spacing:.07em; color:#5c6575; margin-bottom:10px; }
        .lab-card-desc{ font-size:12px; color:#9aa3b5; line-height:1.5; flex:1; margin-bottom:14px; }
        .lab-card-desc b{ color:#f0f2f7; font-weight:600; }

        /* Card footer */
        .lab-card-footer{
          display:flex; align-items:center; justify-content:space-between;
          border-top:1px solid rgba(255,255,255,.055);
          padding-top:11px; margin-top:auto;
        }
        .lab-card-run{
          font-size:11px; font-weight:700; letter-spacing:.06em;
          color:#5c6575;
          display:flex; align-items:center; gap:5px;
          transition:color .15s;
        }
        .lab-card:hover .lab-card-run{ color:var(--c,#00e676); }
        .lab-card-run svg{ transition:transform .15s; }
        .lab-card:hover .lab-card-run svg{ transform:translateX(3px); }
        .lab-card-type{
          font-size:9px; padding:2px 7px; border-radius:4px; font-weight:700; letter-spacing:.08em;
          background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.07); color:#5c6575;
        }

        /* ── Query bar ── */
        .lab-query-wrap{ margin-top:28px; }
        .lab-query-bar{ display:flex; gap:10px; }
        .lab-query-input{
          flex:1; background:#0f1420; border:1px solid rgba(255,255,255,0.07); border-radius:10px;
          padding:13px 18px; font-size:13.5px; color:#f0f2f7; outline:none; font-family:inherit;
          transition:border-color .15s, box-shadow .15s;
        }
        .lab-query-input::placeholder{ color:#5c6575; }
        .lab-query-input:focus{
          border-color:rgba(0,230,118,.3);
          box-shadow:0 0 0 3px rgba(0,230,118,.06);
        }
        .lab-query-btn{
          padding:13px 22px; background:#00e676; color:#000;
          font-size:12px; font-weight:800; letter-spacing:.08em;
          border:none; border-radius:10px; cursor:pointer; white-space:nowrap;
          display:flex; align-items:center; gap:7px; transition:opacity .15s, transform .1s;
          font-family:inherit;
        }
        .lab-query-btn:hover{ opacity:.88; transform:translateY(-1px); }
        .lab-query-hint{ margin-top:9px; font-size:11px; color:#5c6575; }
        .lab-query-hint span{ color:#9aa3b5; }

        /* ── Disclaimer ── */
        .lab-disclaimer{
          margin-top:52px; padding-top:18px; border-top:1px solid rgba(255,255,255,.07);
          font-size:11px; color:#5c6575; line-height:1.6;
        }

        /* ── Mobile ── */
        @media(max-width:860px){
          .lab-page{ padding:32px 20px 48px; }
          .lab-hero{ margin-bottom:28px; }
          .lab-title{ font-size:24px; }
          .lab-sub{ display:none; }
          .lab-grid{ grid-template-columns:repeat(2,1fr); gap:7px; }
          .lab-card{ padding:12px 13px 11px; border-radius:10px; }
          .lab-card-top{ margin-bottom:8px; }
          .lab-card-icon{ width:28px; height:28px; border-radius:6px; }
          .lab-card-icon svg{ width:14px; height:14px; }
          .lab-card-badge{ font-size:8px; padding:2px 6px; }
          .lab-card-name{ font-size:12px; margin-bottom:2px; }
          .lab-card-tag{ font-size:9px; margin-bottom:6px; }
          .lab-card-desc{ font-size:10.5px; margin-bottom:10px; }
          .lab-card-footer{ padding-top:8px; }
          .lab-card-run{ font-size:10px; }
        }
        @media(max-width:400px){
          .lab-card-badge{ display:none; }
        }
      `}</style>

      <AppNav />

      <div className="lab-page">
        {/* Hero */}
        <div className="lab-hero">
          <div className="lab-eyebrow">HOMERATES LAB</div>
          <h1 className="lab-title">
            Instant mortgage<br/>
            <span className="lab-title-green">scenarios. Live rates.</span>
          </h1>
          <p className="lab-sub">
            Select any module to fire a fully calculated scenario seeded with today's market data — or type your own below.
          </p>
        </div>

        {/* Section header */}
        <div className="lab-section-row">
          <span className="lab-section-label">ACTIVE MODULES</span>
          <span className="lab-section-count">8 / 8</span>
        </div>

        {/* 4×2 Module grid */}
        <div className="lab-grid">
          {MODULES.map(m => (
            <button
              key={m.id}
              className="lab-card"
              style={{ '--c': m.accent } as React.CSSProperties}
              onClick={() => run(m.seed)}
              onMouseEnter={() => setHovered(m.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="lab-card-top">
                <div className="lab-card-icon">{m.icon}</div>
                <span className="lab-card-badge">{m.badge}</span>
              </div>
              <div className="lab-card-name">{m.name}</div>
              <div className="lab-card-tag">{m.tag}</div>
              <div className="lab-card-desc">
                <b>{m.desc}</b><br/>{m.sub}
              </div>
              <div className="lab-card-footer">
                <span className="lab-card-run">
                  Run&nbsp;
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M2 6h8M7 3l3 3-3 3"/>
                  </svg>
                </span>
                <span className="lab-card-type">LIVE</span>
              </div>
            </button>
          ))}
        </div>

        {/* Custom query */}
        <div className="lab-query-wrap">
          <form className="lab-query-bar" onSubmit={handleQuery}>
            <input
              className="lab-query-input"
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type your own — e.g. $1.1M LA home, 15% down, High Balance or Jumbo?"
            />
            <button type="submit" className="lab-query-btn">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 7h10M8 3l4 4-4 4"/>
              </svg>
              RUN
            </button>
          </form>
          <p className="lab-query-hint">
            Any loan type · any county · any income structure.{' '}
            <span>Results in under 3 seconds.</span>
          </p>
        </div>

        <p className="lab-disclaimer">
          HomeRates Lab is an educational tool — not financial advice or a commitment to lend. Rates reflect FRED market data. Verify with a licensed lender before making financial decisions.
        </p>
      </div>
    </div>
  );
}
