'use client';
// app/loan-limits/page.tsx
// Nationwide 2026 Conforming Loan Limits explorer — /loan-limits
// ps-root pattern: inline CSS + body:has(.ps-root) override

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import ConsumerNav from '../components/ConsumerNav';
import {
  STATE_NAMES,
  HIGH_COST_COUNTIES,
  HIGH_COST_STATES,
  NATIONAL_CONFORMING_BASELINE,
  getLimits,
  type NationalCountyLimits,
} from '@/loanLimitsNational2026';
import { CA_LOAN_LIMITS_2026 } from '@/loanLimits2026';

// CA_LOAN_LIMITS_2026 already matches NationalCountyLimits shape (conforming.units1-4 + isHighBalance)
const CA_NATIONAL: NationalCountyLimits[] = CA_LOAN_LIMITS_2026 as NationalCountyLimits[];

const ALL_STATES = Object.entries(STATE_NAMES).sort((a, b) => a[1].localeCompare(b[1]));

const STANDARD_OPTION = '-- Standard (all other counties)';

function fmt(n: number) {
  return '$' + n.toLocaleString();
}

export default function LoanLimitsPage() {
  const [state, setState] = useState('CA');
  const [county, setCounty] = useState(CA_NATIONAL[0]?.county ?? STANDARD_OPTION);

  const countyOptions = useMemo(() => {
    if (state === 'CA') return CA_NATIONAL.map(c => c.county);
    const list = HIGH_COST_COUNTIES[state] ?? [];
    if (list.length === 0) return [];
    return list.map(c => c.county);
  }, [state]);

  const hasHighCost = HIGH_COST_STATES.has(state);

  const limits: NationalCountyLimits = useMemo(() => {
    if (state === 'CA') {
      const match = CA_NATIONAL.find(c => c.county === county);
      return match ?? { county, conforming: NATIONAL_CONFORMING_BASELINE, isHighBalance: false };
    }
    if (county === STANDARD_OPTION || !county) {
      return { county: 'Standard', conforming: NATIONAL_CONFORMING_BASELINE, isHighBalance: false };
    }
    return getLimits(state, county);
  }, [state, county]);

  function handleStateChange(s: string) {
    setState(s);
    if (s === 'CA') {
      setCounty(CA_NATIONAL[0]?.county ?? STANDARD_OPTION);
    } else {
      const list = HIGH_COST_COUNTIES[s] ?? [];
      setCounty(list.length > 0 ? list[0].county : STANDARD_OPTION);
    }
  }

  const isAboveBaseline = limits.isHighBalance;
  const accent = isAboveBaseline ? '#ff8c42' : '#00e87a';
  const accentBg = isAboveBaseline ? 'rgba(255,140,66,0.08)' : 'rgba(0,232,122,0.08)';
  const accentBorder = isAboveBaseline ? 'rgba(255,140,66,0.25)' : 'rgba(0,232,122,0.25)';
  const zoneBadge = isAboveBaseline ? 'HIGH-BALANCE ZONE' : 'STANDARD CONFORMING';

  const rows = [
    { label: '1-Unit (Single Family)', value: limits.conforming.units1 },
    { label: '2-Unit (Duplex)',         value: limits.conforming.units2 },
    { label: '3-Unit (Triplex)',        value: limits.conforming.units3 },
    { label: '4-Unit (Fourplex)',       value: limits.conforming.units4 },
  ];

  return (
    <>
      <style>{`
        body:has(.ps-root){display:block!important;height:auto!important;overflow:visible!important;}
        html:has(.ps-root){height:auto!important;overflow:visible!important;}
        body:has(.ps-root) .app-footer{display:none!important;}

        .ps-root{
          min-height:100vh;width:100%;
          background:#080c12;color:#e0f0e8;
          font-family:var(--font-dm-sans,'DM Sans',sans-serif);
          display:flex;flex-direction:column;align-items:center;
          overflow-x:hidden;box-sizing:border-box;
        }
        .ps-root *{box-sizing:border-box;}

        /* ─── Nav ─── */
        .ll-header{
          position:sticky;top:0;z-index:50;width:100%;
          background:rgba(8,12,18,0.92);
          backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
          border-bottom:1px solid rgba(255,255,255,0.06);
        }
        .ll-header-inner{
          max-width:820px;margin:0 auto;padding:0 24px;
          height:56px;display:flex;align-items:center;justify-content:space-between;
        }
        .ll-logo-link{display:flex;align-items:center;text-decoration:none;}
        .ll-logo{height:26px;width:auto;display:block;}
        .ll-chat-link{
          display:inline-flex;align-items:center;gap:6px;
          font-size:0.82rem;font-weight:600;color:#00e87a;
          text-decoration:none;padding:6px 14px;
          border:1px solid rgba(0,232,122,0.3);border-radius:8px;
          transition:background 0.15s,color 0.15s;
        }
        .ll-chat-link:hover{background:rgba(0,232,122,0.08);color:#00ff8a;}

        /* ─── Main ─── */
        .ll-main{
          width:100%;max-width:820px;
          padding:40px 16px 60px;
          display:flex;flex-direction:column;align-items:center;gap:28px;
        }

        /* ─── Hero ─── */
        .ll-hero{width:100%;text-align:center;}
        .ll-eyebrow{
          display:inline-block;
          font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;
          color:#00e87a;background:rgba(0,232,122,0.1);
          border:1px solid rgba(0,232,122,0.2);border-radius:6px;
          padding:4px 10px;margin-bottom:14px;
        }
        .ll-title{
          font-size:clamp(1.7rem,4vw,2.4rem);font-weight:800;
          color:#f0f4ff;margin:0 0 12px;line-height:1.2;
        }
        .ll-subtitle{
          font-size:0.95rem;color:rgba(185,208,192,0.7);
          max-width:580px;margin:0 auto;line-height:1.6;
        }

        /* ─── Selector card ─── */
        .ll-selector-card{
          width:100%;
          background:rgba(255,255,255,0.03);
          border:1px solid rgba(255,255,255,0.08);
          border-radius:16px;padding:24px;
          display:flex;flex-direction:column;gap:16px;
        }
        .ll-selector-row{
          display:grid;grid-template-columns:1fr 1fr;gap:16px;
        }
        @media(max-width:540px){
          .ll-selector-row{grid-template-columns:1fr;}
        }
        .ll-field{display:flex;flex-direction:column;gap:6px;}
        .ll-label{font-size:0.75rem;font-weight:600;color:rgba(185,208,192,0.6);text-transform:uppercase;letter-spacing:0.06em;}
        .ll-select{
          appearance:none;-webkit-appearance:none;
          background:rgba(255,255,255,0.05);
          border:1px solid rgba(255,255,255,0.1);
          border-radius:10px;
          color:#e0f0e8;font-size:0.9rem;font-weight:500;
          padding:10px 36px 10px 14px;
          cursor:pointer;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2300e87a' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat:no-repeat;background-position:right 12px center;
          font-family:var(--font-dm-sans,'DM Sans',sans-serif);
          transition:border-color 0.15s;
        }
        .ll-select:focus{outline:none;border-color:rgba(0,232,122,0.5);}
        .ll-select option{background:#0e1520;color:#e0f0e8;}

        /* ─── Results card ─── */
        .ll-result-card{
          width:100%;border-radius:18px;padding:28px;
          transition:background 0.3s,border-color 0.3s;
        }
        .ll-result-header{
          display:flex;align-items:center;justify-content:space-between;
          margin-bottom:20px;flex-wrap:wrap;gap:10px;
        }
        .ll-result-location{
          display:flex;flex-direction:column;gap:4px;
        }
        .ll-result-county{
          font-size:1.1rem;font-weight:700;color:#f0f4ff;
          text-transform:capitalize;
        }
        .ll-result-state{font-size:0.8rem;color:rgba(185,208,192,0.5);}
        .ll-zone-badge{
          font-size:0.7rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;
          padding:5px 12px;border-radius:8px;white-space:nowrap;
        }

        .ll-limits-grid{
          display:grid;grid-template-columns:1fr 1fr;gap:12px;
        }
        @media(max-width:480px){.ll-limits-grid{grid-template-columns:1fr;}}

        .ll-unit-row{
          background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);
          border-radius:12px;padding:16px;
          display:flex;flex-direction:column;gap:6px;
        }
        .ll-unit-label{font-size:0.75rem;color:rgba(185,208,192,0.55);font-weight:500;}
        .ll-unit-value{font-size:1.25rem;font-weight:700;color:#f0f4ff;}

        .ll-note{
          margin-top:16px;padding:12px 16px;
          background:rgba(255,255,255,0.02);border-radius:10px;
          font-size:0.78rem;color:rgba(185,208,192,0.5);line-height:1.5;
        }

        /* ─── CTA ─── */
        .ll-cta{
          width:100%;text-align:center;
          padding:24px;
          background:rgba(0,232,122,0.04);
          border:1px solid rgba(0,232,122,0.12);
          border-radius:16px;
        }
        .ll-cta-text{font-size:0.95rem;color:rgba(185,208,192,0.7);margin-bottom:14px;}
        .ll-cta-btn{
          display:inline-flex;align-items:center;gap:8px;
          background:#00e87a;color:#080c12;
          font-size:0.9rem;font-weight:700;
          padding:12px 28px;border-radius:10px;
          text-decoration:none;
          transition:background 0.15s,transform 0.1s;
        }
        .ll-cta-btn:hover{background:#00ff8a;transform:translateY(-1px);}

        /* ─── Info row ─── */
        .ll-info-row{
          width:100%;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;
        }
        @media(max-width:600px){.ll-info-row{grid-template-columns:1fr;}}
        .ll-info-tile{
          background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);
          border-radius:12px;padding:16px;
        }
        .ll-info-tile-label{font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;color:rgba(185,208,192,0.45);margin-bottom:6px;}
        .ll-info-tile-val{font-size:1rem;font-weight:700;color:#e0f0e8;}
        .ll-info-tile-sub{font-size:0.75rem;color:rgba(185,208,192,0.45);margin-top:3px;}

        /* ─── Footer ─── */
        .ll-footer{
          width:100%;border-top:1px solid rgba(255,255,255,0.06);
          margin-top:20px;padding:20px 24px;
          display:flex;align-items:center;justify-content:center;flex-wrap:wrap;
          gap:8px;font-size:0.78rem;color:rgba(185,208,192,0.4);
        }
        .ll-footer-link{color:rgba(0,232,122,0.5);text-decoration:none;transition:color 0.15s;}
        .ll-footer-link:hover{color:#00e87a;}
        .ll-sep{opacity:0.4;}
      `}</style>

      <div className="ps-root">
        {/* Header */}
        <header className="ll-header">
          <div className="ll-header-inner">
            <Link href="/" className="ll-logo-link">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" className="ll-logo" />
            </Link>
            <Link href="/chat" className="ll-chat-link">Get personalized rates →</Link>
            <ConsumerNav />
          </div>
        </header>

        <main className="ll-main">
          {/* Hero */}
          <div className="ll-hero">
            <span className="ll-eyebrow">2026 FHFA — Updated</span>
            <h1 className="ll-title">Conforming Loan Limits</h1>
            <p className="ll-subtitle">
              Find the 2026 FHFA conforming loan limits for any county in the United States.
              Know your zone before you shop — conforming, high-balance, or jumbo.
            </p>
          </div>

          {/* Info tiles */}
          <div className="ll-info-row">
            <div className="ll-info-tile">
              <div className="ll-info-tile-label">National Baseline</div>
              <div className="ll-info-tile-val">{fmt(NATIONAL_CONFORMING_BASELINE.units1)}</div>
              <div className="ll-info-tile-sub">1-unit · most U.S. counties</div>
            </div>
            <div className="ll-info-tile">
              <div className="ll-info-tile-label">High-Cost Ceiling</div>
              <div className="ll-info-tile-val">$1,249,125</div>
              <div className="ll-info-tile-sub">1-unit · AK, HI, DC + more</div>
            </div>
            <div className="ll-info-tile">
              <div className="ll-info-tile-label">Effective Date</div>
              <div className="ll-info-tile-val">Jan 1, 2026</div>
              <div className="ll-info-tile-sub">FHFA HERA-Based Final</div>
            </div>
          </div>

          {/* State + County selectors */}
          <div className="ll-selector-card">
            <div className="ll-selector-row">
              <div className="ll-field">
                <label className="ll-label" htmlFor="ll-state">State</label>
                <select
                  id="ll-state"
                  className="ll-select"
                  value={state}
                  onChange={e => handleStateChange(e.target.value)}
                >
                  {ALL_STATES.map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="ll-field">
                <label className="ll-label" htmlFor="ll-county">County</label>
                <select
                  id="ll-county"
                  className="ll-select"
                  value={county}
                  onChange={e => setCounty(e.target.value)}
                >
                  {countyOptions.length > 0 ? (
                    <>
                      {countyOptions.map(c => (
                        <option key={c} value={c}>{c.split(' ').map((w: string) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')}</option>
                      ))}
                      {state !== 'CA' && (
                        <option value={STANDARD_OPTION}>All other counties (standard)</option>
                      )}
                    </>
                  ) : (
                    <option value={STANDARD_OPTION}>All counties — standard conforming</option>
                  )}
                </select>
              </div>
            </div>
            {!hasHighCost && (
              <p style={{ fontSize: '0.8rem', color: 'rgba(185,208,192,0.45)', margin: 0 }}>
                {STATE_NAMES[state]} has no high-cost counties — standard national baseline applies statewide.
              </p>
            )}
          </div>

          {/* Results */}
          <div
            className="ll-result-card"
            style={{ background: accentBg, border: `1px solid ${accentBorder}` }}
          >
            <div className="ll-result-header">
              <div className="ll-result-location">
                <div className="ll-result-county">
                  {county === STANDARD_OPTION
                    ? `${STATE_NAMES[state]} — Standard Counties`
                    : county.split(' ').map((w: string) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')}
                </div>
                <div className="ll-result-state">{STATE_NAMES[state]} · 2026 FHFA Limits</div>
              </div>
              <span
                className="ll-zone-badge"
                style={{ background: accent, color: '#080c12' }}
              >
                {zoneBadge}
              </span>
            </div>

            <div className="ll-limits-grid">
              {rows.map(r => (
                <div key={r.label} className="ll-unit-row">
                  <div className="ll-unit-label">{r.label}</div>
                  <div className="ll-unit-value" style={{ color: accent }}>{fmt(r.value)}</div>
                </div>
              ))}
            </div>

            <div className="ll-note">
              {isAboveBaseline
                ? `This county qualifies for high-balance (super-conforming) financing. Loans up to ${fmt(limits.conforming.units1)} (1-unit) get agency backing with a modest rate premium vs. standard conforming.`
                : `This county uses the national conforming baseline. Loans up to ${fmt(NATIONAL_CONFORMING_BASELINE.units1)} qualify for standard Fannie/Freddie pricing. Above this threshold = jumbo.`
              }
            </div>
          </div>

          {/* CTA */}
          <div className="ll-cta">
            <p className="ll-cta-text">
              Know your limit — now get a real rate. Our AI runs the numbers on your actual scenario.
            </p>
            <Link href="/chat" className="ll-cta-btn">
              Chat with our AI mortgage expert →
            </Link>
          </div>
        </main>

        <footer className="ll-footer">
          <span>HomeRates.ai — educational tool only, not a lender or broker.</span>
          <span className="ll-sep">•</span>
          <Link href="/disclosures" className="ll-footer-link">Terms</Link>
          <span className="ll-sep">•</span>
          <Link href="/privacy" className="ll-footer-link">Privacy</Link>
          <span className="ll-sep">•</span>
          <span>Source: FHFA 2026 HERA-Based Final</span>
        </footer>
      </div>
    </>
  );
}
