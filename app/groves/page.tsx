'use client';

import { useState, useEffect, useRef } from 'react';

const PASS = 'grovesiq2026';
const STORE_KEY = 'hr_grp_v1';

/* ─────────────────────────────────────────────────────────────
   CSS — scoped under .grv-wrap so it doesn't bleed into the
   Next.js app shell. body / html resets are minimal.
───────────────────────────────────────────────────────────── */
const DOC_CSS = `
  .grv-wrap {
    background: #f8fafc;
    color: #0f172a;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    max-width: 860px;
    margin: 0 auto;
    padding: 48px 32px 80px;
    min-height: 100vh;
    --bg: #f8fafc;
    --card: #ffffff;
    --text: #0f172a;
    --weak: #64748b;
    --dim: #94a3b8;
    --border: #e2e8f0;
    --accent: #059669;
    --accent-dim: rgba(5,150,105,0.08);
    --blue: #2563eb;
    --blue-dim: rgba(37,99,235,0.08);
    --purple: #7c3aed;
  }
  @media (max-width: 600px) { .grv-wrap { padding: 24px 16px 60px; } }

  .grv-wrap * { box-sizing: border-box; margin: 0; padding: 0; }
  .grv-wrap p { font-size: 0.9rem; color: var(--weak); line-height: 1.7; margin-bottom: 12px; }
  .grv-wrap p strong { color: var(--text); }

  /* Header */
  .grv-doc-header { border-bottom: 2px solid var(--text); padding-bottom: 24px; margin-bottom: 40px; }
  @media (max-width:600px){ .grv-doc-header { margin-bottom: 28px; } }
  .grv-doc-meta { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .grv-doc-brand { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .grv-brand-hr { display: flex; align-items: center; gap: 8px; }
  .grv-brand-mark { width: 32px; height: 32px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 14px; color: #fff; flex-shrink: 0; }
  .grv-hr-mark { background: #059669; }
  .grv-gi-mark { background: #1e40af; }
  .grv-brand-name { font-size: 0.85rem; font-weight: 800; color: var(--text); }
  .grv-brand-divider { font-size: 1.2rem; color: var(--dim); padding: 0 4px; }
  .grv-doc-status { text-align: right; }
  .grv-status-pill { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; margin-bottom: 4px; }
  .grv-doc-date { font-size: 0.7rem; color: var(--dim); }
  .grv-doc-title { font-size: clamp(1.6rem, 4vw, 2rem); font-weight: 900; color: var(--text); letter-spacing: -0.04em; line-height: 1.1; margin-bottom: 8px; }
  .grv-doc-subtitle { font-size: 0.9rem; color: var(--weak); line-height: 1.7; }

  /* TOC */
  .grv-toc { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; margin-bottom: 40px; }
  .grv-toc-title { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); margin-bottom: 10px; }
  .grv-toc-list { display: flex; flex-direction: column; gap: 4px; }
  .grv-toc-item { display: flex; align-items: baseline; gap: 8px; font-size: 0.8rem; color: var(--weak); text-decoration: none; }
  .grv-toc-item:hover { color: var(--blue); }
  .grv-toc-num { font-size: 0.62rem; font-weight: 700; color: var(--dim); width: 18px; flex-shrink: 0; }
  .grv-toc-new { font-size: 0.58rem; font-weight: 700; padding: 1px 5px; background: #eff6ff; border: 1px solid #bfdbfe; color: var(--blue); border-radius: 3px; margin-left: 4px; }

  /* Sections */
  .grv-section { margin-bottom: 40px; }
  @media (max-width:600px){ .grv-section { margin-bottom: 32px; } }
  .grv-section-num { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--dim); margin-bottom: 6px; }
  .grv-section-title { font-size: 1.1rem; font-weight: 800; color: var(--text); letter-spacing: -0.02em; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }

  /* Journey */
  .grv-journey { display: flex; align-items: stretch; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin: 20px 0; }
  @media (max-width:640px){ .grv-journey { flex-direction: column; } }
  .grv-journey-lane { flex: 1; padding: 20px; display: flex; flex-direction: column; gap: 8px; }
  .grv-lane-hr { background: var(--accent-dim); border-right: 1px solid rgba(5,150,105,0.15); }
  .grv-lane-gi { background: var(--blue-dim); }
  @media (max-width:640px){ .grv-lane-hr { border-right: none; border-bottom: 1px solid rgba(5,150,105,0.15); } }
  .grv-lane-label { font-size: 0.62rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; }
  .grv-lane-green { color: var(--accent); }
  .grv-lane-blue { color: var(--blue); }
  .grv-journey-step { background: #fff; border-radius: 8px; padding: 10px 12px; font-size: 0.78rem; line-height: 1.5; border: 1px solid var(--border); }
  .grv-step-num { font-size: 0.6rem; font-weight: 700; color: var(--dim); margin-bottom: 2px; }
  .grv-step-text { color: var(--text); font-weight: 600; }
  .grv-step-sub { font-size: 0.7rem; color: var(--weak); margin-top: 2px; }
  .grv-journey-connector { display: flex; align-items: center; justify-content: center; padding: 20px 0; background: #f1f5f9; width: 48px; flex-shrink: 0; border-left: 1px solid var(--border); border-right: 1px solid var(--border); }
  .grv-connector-arrow { font-size: 0.7rem; color: var(--dim); writing-mode: vertical-rl; letter-spacing: 0.08em; font-weight: 700; text-transform: uppercase; }
  @media (max-width:640px){ .grv-journey-connector { width: auto; height: 36px; padding: 0 20px; border-left: none; border-right: none; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); } .grv-connector-arrow { writing-mode: horizontal-tb; } }
  .grv-handoff-box { margin: 16px 0; padding: 14px 16px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; font-size: 0.82rem; color: #78350f; line-height: 1.6; }
  .grv-handoff-box strong { color: #92400e; }

  /* Two col */
  .grv-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
  @media (max-width:600px){ .grv-two-col { grid-template-columns: 1fr; } }
  .grv-col-card { border: 1px solid var(--border); border-radius: 10px; padding: 18px; }
  .grv-col-card-green { border-color: rgba(5,150,105,0.3); background: rgba(5,150,105,0.03); }
  .grv-col-card-blue { border-color: rgba(37,99,235,0.3); background: rgba(37,99,235,0.03); }
  .grv-col-title { font-size: 0.75rem; font-weight: 800; color: var(--text); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
  .grv-dot { width: 8px; height: 8px; border-radius: 50%; }
  .grv-dot-g { background: var(--accent); }
  .grv-dot-b { background: var(--blue); }
  .grv-col-item { font-size: 0.78rem; color: var(--weak); padding: 5px 0; border-bottom: 1px solid var(--border); line-height: 1.5; display: flex; gap: 8px; }
  .grv-col-item:last-child { border-bottom: none; }
  .grv-ck { color: var(--accent); flex-shrink: 0; }
  .grv-ck-bl { color: var(--blue); flex-shrink: 0; }
  .grv-col-item strong { color: var(--text); }

  /* Dist row */
  .grv-dist-row { display: flex; gap: 16px; margin: 16px 0; align-items: stretch; }
  @media (max-width:600px){ .grv-dist-row { flex-direction: column; } }
  .grv-dist-card { flex: 1; border: 1px solid var(--border); border-radius: 10px; padding: 18px; position: relative; overflow: hidden; }
  .grv-dist-card-primary { border-color: rgba(37,99,235,0.3); background: rgba(37,99,235,0.02); }
  .grv-dist-badge { position: absolute; top: 12px; right: 12px; font-size: 0.55rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 2px 8px; border-radius: 4px; }
  .grv-badge-primary { background: #dbeafe; color: #1e40af; }
  .grv-badge-secondary { background: #f1f5f9; color: #64748b; }
  .grv-dist-title { font-size: 0.8rem; font-weight: 800; color: var(--text); margin-bottom: 6px; }
  .grv-dist-sub { font-size: 0.72rem; color: var(--weak); line-height: 1.55; margin-bottom: 10px; }
  .grv-dist-detail { font-size: 0.72rem; color: var(--dim); line-height: 1.6; }

  /* Table */
  .grv-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 16px 0; }
  .grv-terms-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; min-width: 520px; }
  .grv-terms-table th { text-align: left; padding: 8px 12px; background: var(--bg); border-bottom: 2px solid var(--border); font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dim); }
  .grv-terms-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); color: var(--weak); vertical-align: top; line-height: 1.5; }
  .grv-terms-table td strong { color: var(--text); }
  .grv-terms-table tr:last-child td { border-bottom: none; }
  .grv-tbd { color: var(--dim); font-style: italic; }

  /* Steps */
  .grv-steps-list { margin: 12px 0; }
  .grv-step-item { display: flex; gap: 14px; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .grv-step-item:last-child { border-bottom: none; }
  .grv-step-circle { width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 800; color: var(--dim); flex-shrink: 0; }
  .grv-step-done { border-color: var(--accent); background: var(--accent-dim); color: var(--accent); }
  .grv-step-active { border-color: var(--blue); background: var(--blue-dim); color: var(--blue); }
  .grv-step-body { flex: 1; }
  .grv-step-title { font-size: 0.82rem; font-weight: 700; color: var(--text); margin-bottom: 2px; }
  .grv-step-desc { font-size: 0.75rem; color: var(--weak); line-height: 1.5; }
  .grv-step-owner { font-size: 0.65rem; color: var(--dim); margin-top: 3px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }

  /* Sig */
  .grv-sig-block { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); }
  @media (max-width:500px){ .grv-sig-block { grid-template-columns: 1fr; gap: 28px; } }
  .grv-sig-company { font-size: 0.85rem; font-weight: 800; color: var(--text); }
  .grv-sig-name { font-size: 0.78rem; color: var(--weak); margin-top: 4px; }
  .grv-sig-line { height: 1px; background: var(--text); margin: 24px 0 6px; }
  .grv-sig-label { font-size: 0.65rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.06em; }

  /* Callouts */
  .grv-callout { background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 3px solid var(--accent); border-radius: 0 8px 8px 0; padding: 14px 16px; margin: 16px 0; font-size: 0.82rem; color: #166534; line-height: 1.6; }
  .grv-callout strong { color: #14532d; }
  .grv-callout-blue { background: #eff6ff; border: 1px solid #bfdbfe; border-left: 3px solid var(--blue); border-radius: 0 8px 8px 0; padding: 14px 16px; margin: 16px 0; font-size: 0.82rem; color: #1e3a8a; line-height: 1.6; }
  .grv-callout-blue strong { color: #1e3a8a; }

  /* UX section */
  .grv-ux-summary { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 16px 18px; margin: 20px 0; }
  .grv-ux-summary-title { font-size: 0.72rem; font-weight: 800; color: #14532d; margin-bottom: 8px; }
  .grv-ux-summary-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; }
  @media (max-width:600px){ .grv-ux-summary-grid { grid-template-columns: 1fr 1fr; } }
  .grv-ux-item { font-size: 0.72rem; color: #166534; display: flex; gap: 5px; }

  /* Proto cards */
  .grv-proto-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 20px 0; }
  @media (max-width:600px){ .grv-proto-grid { grid-template-columns: 1fr; } }
  .grv-proto-card { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
  .grv-proto-card-featured { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; display: flex; flex-direction: row; grid-column: span 2; }
  @media (max-width:600px){ .grv-proto-card-featured { grid-column: span 1; flex-direction: column; } }
  .grv-proto-preview { background: #080c12; padding: 16px; display: flex; flex-direction: column; gap: 6px; min-width: 180px; flex-shrink: 0; justify-content: center; }
  .grv-proto-card-featured .grv-proto-preview { min-width: 220px; }
  .grv-proto-body { padding: 16px 18px; flex: 1; display: flex; flex-direction: column; gap: 8px; background: #fff; }
  .grv-proto-tag { font-size: 0.58rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
  .grv-proto-name { font-size: 0.88rem; font-weight: 800; color: var(--text); line-height: 1.2; }
  .grv-proto-desc { font-size: 0.75rem; color: var(--weak); line-height: 1.55; flex: 1; }
  .grv-proto-principles { margin-top: 4px; display: flex; flex-direction: column; gap: 3px; }
  .grv-proto-principle { font-size: 0.68rem; color: var(--dim); display: flex; gap: 5px; }
  .grv-proto-cta { display: inline-flex; align-items: center; gap: 5px; margin-top: 8px; padding: 7px 14px; border-radius: 7px; font-size: 0.72rem; font-weight: 700; text-decoration: none; border: 1px solid; cursor: pointer; align-self: flex-start; }
  .grv-cta-green { color: #059669; border-color: rgba(5,150,105,0.25); background: rgba(5,150,105,0.05); }
  .grv-cta-blue { color: #2563eb; border-color: rgba(37,99,235,0.25); background: rgba(37,99,235,0.05); }
  .grv-cta-purple { color: #7c3aed; border-color: rgba(124,58,237,0.25); background: rgba(124,58,237,0.05); }

  /* Mini preview elements */
  .grv-mini-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(0,232,122,0.5); }
  .grv-mini-nav { font-size: 0.52rem; color: rgba(0,232,122,0.6); font-weight: 700; letter-spacing: 0.06em; }
  .grv-mini-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 7px 9px; }
  .grv-mini-label { font-size: 0.5rem; color: rgba(0,232,122,0.5); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 3px; }
  .grv-mini-num { font-size: 1rem; font-weight: 900; color: #f0f4ff; letter-spacing: -0.04em; }
  .grv-green { color: #00e87a; }
  .grv-mini-row { display: flex; gap: 4px; margin-top: 4px; }
  .grv-mini-fact { flex: 1; background: rgba(255,255,255,0.03); border-radius: 3px; padding: 4px 5px; }
  .grv-mini-fact-val { font-size: 0.58rem; font-weight: 700; color: #f0f4ff; }
  .grv-mini-fact-lbl { font-size: 0.42rem; color: rgba(255,255,255,0.3); }
  .grv-mini-chip { display: inline-block; padding: 2px 6px; background: rgba(0,232,122,0.1); border: 1px solid rgba(0,232,122,0.2); border-radius: 99px; font-size: 0.48rem; color: #00e87a; font-weight: 600; margin-top: 5px; }
  .grv-mini-score-ring { width: 28px; height: 28px; border-radius: 50%; border: 3px solid #00e87a; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 900; color: #00e87a; }
  .grv-mini-bar-row { display: flex; align-items: center; gap: 5px; margin-top: 3px; }
  .grv-mini-bar-lbl { font-size: 0.45rem; color: rgba(255,255,255,0.4); width: 28px; }
  .grv-mini-bar-wrap { flex: 1; height: 3px; background: rgba(255,255,255,0.07); border-radius: 2px; overflow: hidden; }
  .grv-mini-bar-fill { height: 100%; border-radius: 2px; }
  .grv-mini-addr { display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.05); border: 1px solid rgba(0,232,122,0.2); border-radius: 5px; padding: 5px 7px; margin-bottom: 6px; }
  .grv-mini-addr-text { font-size: 0.5rem; color: rgba(255,255,255,0.4); }
  .grv-mini-sidebar { display: flex; gap: 5px; align-items: center; margin-bottom: 5px; }
  .grv-lo-strip { background: rgba(61,139,255,0.15); border: 1px solid rgba(61,139,255,0.25); border-radius: 6px; padding: 6px 8px; display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  .grv-lo-ava { width: 18px; height: 18px; border-radius: 50%; background: linear-gradient(135deg,#3d8bff,#00e87a); display: flex; align-items: center; justify-content: center; font-size: 0.45rem; font-weight: 800; color: #fff; flex-shrink: 0; }
  .grv-lo-label { font-size: 0.45rem; color: #3d8bff; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  .grv-lo-name { font-size: 0.6rem; font-weight: 700; color: #f0f4ff; }
  .grv-mini-unlock-row { display: flex; gap: 4px; }
  .grv-mini-unlock-tile { flex: 1; background: rgba(61,139,255,0.1); border: 1px solid rgba(61,139,255,0.2); border-radius: 3px; padding: 3px 5px; font-size: 0.5rem; color: #3d8bff; font-weight: 700; }

  /* Footer note */
  .grv-footer-note { margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border); font-size: 0.68rem; color: var(--dim); line-height: 1.6; }
`;

/* ─────────────────────────────────────────────────────────────
   LOCK SCREEN
───────────────────────────────────────────────────────────── */
function LockScreen({
  val, setVal, shake, onSubmit,
}: {
  val: string;
  setVal: (v: string) => void;
  shake: boolean;
  onSubmit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div style={{
      minHeight: '100vh', background: '#080c12',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', -apple-system, sans-serif", padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '360px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: 36, height: 36, background: '#00e87a', borderRadius: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 16, color: '#000',
          }}>H</div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f0f4ff' }}>
            Home<span style={{ color: '#00e87a' }}>Rates</span>
            <span style={{ color: 'rgba(255,255,255,0.25)', margin: '0 6px' }}>×</span>
            <span style={{ color: '#3d8bff' }}>Groves IQ</span>
          </div>
        </div>

        {/* Card */}
        <div style={{
          width: '100%',
          background: '#0e1420', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, padding: '28px 24px',
          display: 'flex', flexDirection: 'column', gap: '16px',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f0f4ff', marginBottom: 6 }}>
              Partnership Framework
            </div>
            <div style={{ fontSize: '0.78rem', color: '#8fa3b8', lineHeight: 1.5 }}>
              This document is confidential.<br />Enter the access code to continue.
            </div>
          </div>

          <div style={{
            animation: shake ? 'grv-shake 0.5s ease' : 'none',
            display: 'flex', flexDirection: 'column', gap: '10px',
          }}>
            <input
              ref={inputRef}
              type="password"
              value={val}
              onChange={e => setVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onSubmit()}
              placeholder="Access code"
              autoComplete="off"
              style={{
                width: '100%', padding: '11px 14px',
                background: '#141b28', border: `1px solid ${shake ? '#ff5f5f' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 10, color: '#f0f4ff',
                fontFamily: "'Inter', sans-serif", fontSize: '0.88rem',
                outline: 'none', letterSpacing: '0.1em',
                transition: 'border-color 0.15s',
              }}
            />
            <button
              onClick={onSubmit}
              style={{
                width: '100%', padding: '11px',
                background: '#00e87a', border: 'none', borderRadius: 10,
                color: '#000', fontFamily: "'Inter', sans-serif",
                fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer',
              }}
            >
              View document →
            </button>
            {shake && (
              <div style={{ fontSize: '0.72rem', color: '#ff5f5f', textAlign: 'center' }}>
                Incorrect access code
              </div>
            )}
          </div>
        </div>

        <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
          June 2026 · Confidential · HomeRates.ai
        </div>
      </div>

      <style>{`
        @keyframes grv-shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   FRAMEWORK DOCUMENT
───────────────────────────────────────────────────────────── */
function FrameworkDoc() {
  return (
    <div className="grv-wrap">

      {/* HEADER */}
      <div className="grv-doc-header">
        <div className="grv-doc-meta">
          <div className="grv-doc-brand">
            <div className="grv-brand-hr">
              <div className="grv-brand-mark grv-hr-mark">H</div>
              <div className="grv-brand-name">HomeRates.ai</div>
            </div>
            <div className="grv-brand-divider">×</div>
            <div className="grv-brand-hr">
              <div className="grv-brand-mark grv-gi-mark">G</div>
              <div className="grv-brand-name">Groves IQ</div>
            </div>
          </div>
          <div className="grv-doc-status">
            <div className="grv-status-pill">Draft for Discussion</div>
            <div className="grv-doc-date">June 2026 · Confidential</div>
          </div>
        </div>
        <div className="grv-doc-title">Partnership Framework</div>
        <div className="grv-doc-subtitle">A proposed distribution and referral arrangement between HomeRates.ai and Groves IQ — two complementary platforms serving the same mortgage professional network at different stages of the loan lifecycle.</div>
      </div>

      {/* TOC */}
      <div className="grv-toc">
        <div className="grv-toc-title">Contents</div>
        <div className="grv-toc-list">
          {[
            ['1', 'What Each Platform Does', false],
            ['2', 'Where Each Platform Lives on the Loan Journey', false],
            ['3', 'Proposed Arrangement', false],
            ['4', 'Planned UX/UI Changes — Consumer Experience', true],
            ['5', 'Commercial Terms', false],
            ['6', 'What Each Party Gets', false],
            ['7', 'Next Steps', false],
          ].map(([num, label, isNew]) => (
            <a key={num as string} href={`#grv-s${num}`} className="grv-toc-item">
              <span className="grv-toc-num">{num}</span>
              {label}
              {isNew && <span className="grv-toc-new">New</span>}
            </a>
          ))}
        </div>
      </div>

      {/* S1 */}
      <div className="grv-section" id="grv-s1">
        <div className="grv-section-num">Section 1</div>
        <div className="grv-section-title">What Each Platform Does</div>
        <p>HomeRates.ai and Groves IQ serve the same professional network — mortgage loan officers — but at entirely different points in the loan lifecycle. <strong>There is no overlap.</strong></p>
        <div className="grv-two-col">
          <div className="grv-col-card grv-col-card-green">
            <div className="grv-col-title"><div className="grv-dot grv-dot-g"></div>HomeRates.ai — Front of Journey</div>
            {[
              'Consumer intelligence platform: AI-powered mortgage scenarios, affordability analysis, property intelligence, rate monitoring',
              <span>Operates <strong>before</strong> application: consumer is exploring, qualifying, comparing options</span>,
              'LO-sponsored model: loan officers invite borrowers, whose experience is branded to the LO',
              'Revenue: LO subscription (per borrower or flat monthly)',
            ].map((t, i) => <div key={i} className="grv-col-item"><span className="grv-ck">→</span><div>{t}</div></div>)}
          </div>
          <div className="grv-col-card grv-col-card-blue">
            <div className="grv-col-title"><div className="grv-dot grv-dot-b"></div>Groves IQ — Back of Journey</div>
            {[
              'AI-powered loan operations: takes underwritten files and manages conditions, stipulations through to funding',
              <span>Operates <strong>after</strong> approval: file is in-process, conditions being satisfied, CTC in progress</span>,
              'ICE/Encompass integration: enterprise connection to 500+ broker network',
              'Revenue: LO/broker subscription through Groves IQ platform',
            ].map((t, i) => <div key={i} className="grv-col-item"><span className="grv-ck-bl">→</span><div>{t}</div></div>)}
          </div>
        </div>
        <div className="grv-callout">
          <strong>Key insight:</strong> A consumer who finds a home and qualifies through HomeRates becomes the application that Groves IQ processes. HomeRates creates the borrower; Groves IQ closes the file. The two products are bookends of the same transaction.
        </div>
      </div>

      {/* S2 */}
      <div className="grv-section" id="grv-s2">
        <div className="grv-section-num">Section 2</div>
        <div className="grv-section-title">Where Each Platform Lives on the Loan Journey</div>
        <div className="grv-journey">
          <div className="grv-journey-lane grv-lane-hr">
            <div className="grv-lane-label grv-lane-green">HomeRates.ai territory</div>
            {[
              ['Stage 1', 'Consumer discovery', 'Affordability, scenarios, property intel, rate monitoring'],
              ['Stage 2', 'Qualification analysis', 'Decision Score, income qualifying, DTI analysis'],
              ['Stage 3', 'LO match / referral', 'Consumer connects with LO — application begins'],
            ].map(([num, text, sub]) => (
              <div key={num} className="grv-journey-step">
                <div className="grv-step-num">{num}</div>
                <div className="grv-step-text">{text}</div>
                <div className="grv-step-sub">{sub}</div>
              </div>
            ))}
          </div>
          <div className="grv-journey-connector">
            <div className="grv-connector-arrow">Handoff point</div>
          </div>
          <div className="grv-journey-lane grv-lane-gi">
            <div className="grv-lane-label grv-lane-blue">Groves IQ territory</div>
            {[
              ['Stage 4', 'Application submitted', 'File enters Groves IQ / Encompass pipeline'],
              ['Stage 5', 'Conditional approval', 'AI manages conditions, stips, borrower docs'],
              ['Stage 6', 'Clear to close → Funded', 'Groves IQ drives file to CTC and funding'],
            ].map(([num, text, sub]) => (
              <div key={num} className="grv-journey-step">
                <div className="grv-step-num">{num}</div>
                <div className="grv-step-text">{text}</div>
                <div className="grv-step-sub">{sub}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="grv-handoff-box">
          ⚡ <strong>The handoff:</strong> When a HomeRates consumer reaches Stage 3 — they have a property, a scenario, and a Decision Score — they are an application-ready borrower. A Groves IQ LO who receives that referral already has the full financial picture. The loan moves faster because HomeRates did the pre-work.
        </div>
      </div>

      {/* S3 */}
      <div className="grv-section" id="grv-s3">
        <div className="grv-section-num">Section 3</div>
        <div className="grv-section-title">Proposed Arrangement</div>
        <p>This is a <strong>distribution partnership</strong>, not a technical integration. No shared infrastructure is required at launch. The arrangement has two components:</p>
        <div className="grv-dist-row">
          <div className="grv-dist-card grv-dist-card-primary">
            <div className="grv-dist-badge grv-badge-primary">Primary</div>
            <div className="grv-dist-title">Component A — Distribution</div>
            <div className="grv-dist-sub">Groves IQ distributes HomeRates to its 500+ LO network as a value-added tool. LOs get HomeRates bundled into their Groves IQ subscription, or at a negotiated group rate.</div>
            <div className="grv-dist-detail">
              <strong>What Groves IQ LOs get:</strong> HomeRates Pro LO access — ability to invite borrowers, view their scenarios, and have their branding on the consumer experience.<br /><br />
              <strong>What Groves IQ gets:</strong> Stronger LO retention (additional value in the platform), and a differentiated offering vs competitors.
            </div>
          </div>
          <div className="grv-dist-card">
            <div className="grv-dist-badge grv-badge-secondary">Secondary</div>
            <div className="grv-dist-title">Component B — Referral Pipeline</div>
            <div className="grv-dist-sub">HomeRates consumer base — borrowers who are application-ready — can be referred to Groves IQ LOs as a pipeline channel.</div>
            <div className="grv-dist-detail">
              <strong>What Groves IQ LOs get:</strong> Referrals of pre-qualified, scenario-ready borrowers who have been through the full HomeRates discovery process.<br /><br />
              <strong>What HomeRates gets:</strong> A professional network to refer consumers into — completing the end-to-end journey.
            </div>
          </div>
        </div>
        <div className="grv-callout-blue">
          <strong>Why this is clean:</strong> Neither party is dependent on the other&apos;s core product. HomeRates runs with or without Groves IQ. Groves IQ runs with or without HomeRates. The arrangement adds value without creating risk for either side.
        </div>
      </div>

      {/* S4 — UX/UI */}
      <div className="grv-section" id="grv-s4">
        <div className="grv-section-num">Section 4 — New</div>
        <div className="grv-section-title">Planned UX/UI Changes — Consumer Experience</div>
        <p>In parallel with this partnership discussion, HomeRates is building a dedicated consumer surface — a <strong>lighter, property-first experience</strong> designed for borrowers who arrive without a loan officer. This is directly relevant to the Groves IQ partnership because it defines the product their LOs will be sponsoring for their borrowers.</p>
        <p>The consumer experience follows a single design principle: <strong>same data as the Pro platform, rendered through a consumer lens.</strong> Simpler language, fewer controls, faster path from question to answer. No mortgage jargon. No page navigation — everything flows inside a single chat thread.</p>

        <div className="grv-ux-summary">
          <div className="grv-ux-summary-title">Core design principles across all consumer surfaces</div>
          <div className="grv-ux-summary-grid">
            {[
              'Address search as the hero entry point',
              'Zero page navigation — all in chat',
              'Hero number first, context second',
              '2 adjusters max, not a slider forest',
              'Plain-English verdict, not raw data',
              'One primary CTA per card',
            ].map((t, i) => (
              <div key={i} className="grv-ux-item"><span>→</span>{t}</div>
            ))}
          </div>
        </div>

        <p>Four interactive prototypes have been built and are linked below. These represent the planned consumer UI — not speculative designs. They are the basis for the React implementation that follows.</p>

        <div className="grv-proto-grid">

          {/* Proto 1 — Consumer Experience (featured) */}
          <div className="grv-proto-card-featured">
            <div className="grv-proto-preview">
              <div className="grv-mini-sidebar">
                <div className="grv-mini-dot"></div>
                <div className="grv-mini-nav">CHECK A PROPERTY</div>
              </div>
              <div className="grv-mini-addr">
                <span style={{ fontSize: '0.6rem' }}>📍</span>
                <span className="grv-mini-addr-text">123 Sunset Blvd, Los Angeles CA…</span>
              </div>
              <div className="grv-mini-card">
                <div className="grv-mini-label">For Sale · Active</div>
                <div className="grv-mini-num"><span className="grv-green">$</span>1,249,000</div>
                <div className="grv-mini-row">
                  <div className="grv-mini-fact"><div className="grv-mini-fact-val">$6,840</div><div className="grv-mini-fact-lbl">Est. monthly</div></div>
                  <div className="grv-mini-fact"><div className="grv-mini-fact-val" style={{ color: '#00e87a' }}>74</div><div className="grv-mini-fact-lbl">Value score</div></div>
                  <div className="grv-mini-fact"><div className="grv-mini-fact-val">$249k</div><div className="grv-mini-fact-lbl">Down needed</div></div>
                </div>
              </div>
              <div className="grv-mini-chip">Can I afford this? →</div>
            </div>
            <div className="grv-proto-body">
              <div className="grv-proto-tag" style={{ color: '#059669' }}>Consumer Chat Experience</div>
              <div className="grv-proto-name">Property-First Home — 6-Screen Journey</div>
              <div className="grv-proto-desc">The complete consumer chat experience from first address entry through property result, off-market detection, My Home inline, scenario + Decision Score in chat, and the soft pro gate after 3 lookups. No page navigation at any point — every card renders as a chat message in the same thread.</div>
              <div className="grv-proto-principles">
                <div className="grv-proto-principle"><span>→</span>Address search is the hero (Zillow-style but with financial intelligence)</div>
                <div className="grv-proto-principle"><span>→</span>Off-market detection: &quot;Is this your home?&quot; inline — no redirect</div>
                <div className="grv-proto-principle"><span>→</span>Free counter in sidebar — 3 lookups → soft LO connection gate</div>
                <div className="grv-proto-principle"><span>→</span>Scenarios remain free even after gate — LO connection is the unlock</div>
              </div>
              <a href="/prototypes/consumer-experience-prototype.html" className="grv-proto-cta grv-cta-green" target="_blank" rel="noreferrer">Open prototype →</a>
            </div>
          </div>

          {/* Proto 2 — My Scenarios */}
          <div className="grv-proto-card">
            <div className="grv-proto-preview">
              <div className="grv-mini-sidebar">
                <div className="grv-mini-dot"></div>
                <div className="grv-mini-nav">MY SCENARIOS</div>
              </div>
              <div className="grv-mini-card" style={{ marginBottom: 5 }}>
                <div className="grv-mini-label">Affordability</div>
                <div className="grv-mini-num"><span className="grv-green">$</span>847k</div>
                <div style={{ fontSize: '0.45rem', color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>Max comfortable purchase</div>
              </div>
              <div className="grv-mini-card">
                <div className="grv-mini-label" style={{ color: 'rgba(245,158,11,0.6)' }}>Refinance</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 2 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#00e87a' }}>$230</div>
                  <div style={{ fontSize: '0.45rem', color: 'rgba(255,255,255,0.3)' }}>/mo saved</div>
                </div>
              </div>
            </div>
            <div className="grv-proto-body">
              <div className="grv-proto-tag" style={{ color: '#2563eb' }}>Consumer Scenario Surface</div>
              <div className="grv-proto-name">My Scenarios — Consumer Lab</div>
              <div className="grv-proto-desc">The consumer-facing version of HomeRates Lab. 5 scenarios, plain-English names, no DSCR or investor tools. Each card: hero number → 3 facts → plain-English verdict → 2 adjusters max → 1 CTA. Pro users still see the full Lab with all 8 modules.</div>
              <div className="grv-proto-principles">
                <div className="grv-proto-principle"><span>→</span>Affordability, Purchase, Refi, FHA vs Conv, VA Loan</div>
                <div className="grv-proto-principle"><span>→</span>Consumer card = chat card pattern, not the Pro slider</div>
                <div className="grv-proto-principle"><span>→</span>Pro note at bottom links to full Lab for professionals</div>
              </div>
              <a href="/prototypes/consumer-scenario-prototype.html" className="grv-proto-cta grv-cta-blue" target="_blank" rel="noreferrer">Open prototype →</a>
            </div>
          </div>

          {/* Proto 3 — Decision Score */}
          <div className="grv-proto-card">
            <div className="grv-proto-preview">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div className="grv-mini-score-ring">76</div>
                <div>
                  <div style={{ fontSize: '0.52rem', color: '#00e87a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Decision Score</div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#f0f4ff' }}>Strong Candidate</div>
                </div>
              </div>
              {[['L1 Financial', 82, '#00e87a'], ['L2 Property', 65, '#fbbf24'], ['L3 Market', 78, '#00e87a'], ['L4 Location', 71, '#00e87a']].map(([lbl, val, color]) => (
                <div key={lbl as string} className="grv-mini-bar-row">
                  <div className="grv-mini-bar-lbl">{lbl}</div>
                  <div className="grv-mini-bar-wrap"><div className="grv-mini-bar-fill" style={{ width: `${val}%`, background: color as string }}></div></div>
                  <div style={{ fontSize: '0.5rem', fontWeight: 700, color: '#f0f4ff', width: 20, textAlign: 'right' }}>{val}</div>
                </div>
              ))}
            </div>
            <div className="grv-proto-body">
              <div className="grv-proto-tag" style={{ color: '#7c3aed' }}>Track 5 · Decision Score</div>
              <div className="grv-proto-name">Decision Score Card</div>
              <div className="grv-proto-desc">The autonomous score that fires at the bottom of any chat thread once a property and 2+ inputs are present. Computing state (shimmer on L3/L4 while Grok runs) → Complete state with animated bar fill. The &quot;Get Matched&quot; CTA is the monetisation moment.</div>
              <div className="grv-proto-principles">
                <div className="grv-proto-principle"><span>→</span>Auto-fires — consumer never has to ask for it</div>
                <div className="grv-proto-principle"><span>→</span>L1+L2 instant · L3+L4 shimmer ~20s (Grok)</div>
                <div className="grv-proto-principle"><span>→</span>Score ring + 4 level bars animate in on complete</div>
              </div>
              <a href="/prototypes/decision-score-card-prototype.html" className="grv-proto-cta grv-cta-purple" target="_blank" rel="noreferrer">Open prototype →</a>
            </div>
          </div>

          {/* Proto 4 — LO-Sponsored (featured) */}
          <div className="grv-proto-card-featured">
            <div className="grv-proto-preview">
              <div className="grv-lo-strip">
                <div className="grv-lo-ava">RA</div>
                <div>
                  <div className="grv-lo-label">Your loan officer</div>
                  <div className="grv-lo-name">Rayaan Arif</div>
                </div>
              </div>
              <div className="grv-mini-card">
                <div className="grv-mini-label">Conventional · 20% Down</div>
                <div className="grv-mini-num"><span className="grv-green">$</span>5,240<span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)' }}>/mo</span></div>
                <div className="grv-mini-unlock-row" style={{ marginTop: 5 }}>
                  <div className="grv-mini-unlock-tile">🏘️ Report</div>
                  <div className="grv-mini-unlock-tile">📈 Score</div>
                  <div className="grv-mini-unlock-tile">🔁 Refi</div>
                </div>
              </div>
            </div>
            <div className="grv-proto-body">
              <div className="grv-proto-tag" style={{ color: '#2563eb' }}>LO-Sponsored Tier</div>
              <div className="grv-proto-name">What a Groves IQ LO&apos;s Borrower Sees</div>
              <div className="grv-proto-desc">When a Groves IQ LO invites a borrower to HomeRates, the consumer sees the LO&apos;s name and company throughout — and their full professional-grade features unlock automatically. Property reports, Decision Score, Refi Monitor, and direct messaging all activate via the LO&apos;s subscription. The consumer never pays.</div>
              <div className="grv-proto-principles">
                <div className="grv-proto-principle"><span>→</span>LO name + NMLS in sidebar throughout the session</div>
                <div className="grv-proto-principle"><span>→</span>&quot;Unlocked by [LO name]&quot; — explicit value attribution</div>
                <div className="grv-proto-principle"><span>→</span>Free vs LO-sponsored comparison shows the unlock delta</div>
                <div className="grv-proto-principle"><span>→</span>This is the Homebot model — but with live mortgage intelligence</div>
              </div>
              <a href="/prototypes/groves-iq-consumer-mockup.html" className="grv-proto-cta grv-cta-blue" target="_blank" rel="noreferrer">Open prototype →</a>
            </div>
          </div>

        </div>

        <div className="grv-callout">
          <strong>For Groves IQ:</strong> Every one of these screens is what a Groves IQ LO&apos;s borrower will experience when that LO is on HomeRates. The consumer sees the LO&apos;s name from first address search through to &quot;Get Matched&quot; — meaning HomeRates keeps the LO present throughout the entire pre-application journey, not just at the referral moment.
        </div>
      </div>

      {/* S5 — Commercial Terms */}
      <div className="grv-section" id="grv-s5">
        <div className="grv-section-num">Section 5</div>
        <div className="grv-section-title">Commercial Terms — Draft Framework</div>
        <div className="grv-table-scroll">
          <table className="grv-terms-table">
            <thead>
              <tr>
                <th>Term</th>
                <th>Proposed Structure</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Distribution model', 'Groves IQ bundles HomeRates LO access into their LO subscription', 'Either at cost or at a negotiated group rate per active LO'],
                ['Pricing to Groves IQ', 'tbd:To be negotiated — volume pricing', 'Suggested: flat per-LO/mo or revenue share on LOs who activate borrowers'],
                ['Referral component', 'tbd:To be defined', 'Could be referral fee per funded loan, or simply goodwill / LO availability'],
                ['Branding', "LO's name/company on consumer experience. \"Powered by HomeRates\" attribution.", 'Groves IQ branding optional — consumer sees their LO, not the platform'],
                ['Data', 'Consumer data stays in HomeRates. Scenario data shared with LO only (their own borrower).', 'No consumer behavioral data shared with Groves IQ platform per HomeRates privacy model'],
                ['Integration', 'None required at launch. Future: optional Encompass/ICE data bridge.', 'Phase 1 is purely distribution — no technical dependencies'],
                ['Term', 'tbd:12 months initial, auto-renewing', 'Either party can exit with 60 days notice'],
              ].map(([term, proposed, notes]) => (
                <tr key={term as string}>
                  <td><strong>{term}</strong></td>
                  <td className={(proposed as string).startsWith('tbd:') ? 'grv-tbd' : ''}>{(proposed as string).replace('tbd:', '')}</td>
                  <td>{notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* S6 — Mutual Value */}
      <div className="grv-section" id="grv-s6">
        <div className="grv-section-num">Section 6</div>
        <div className="grv-section-title">What Each Party Gets</div>
        <div className="grv-two-col">
          <div className="grv-col-card grv-col-card-green">
            <div className="grv-col-title"><div className="grv-dot grv-dot-g"></div>HomeRates gains</div>
            {[
              <span><strong>Instant distribution</strong> to 500+ active LOs without individual sales effort</span>,
              'LO-activated consumer base — borrowers who come in through a professional relationship convert better',
              <span><strong>ICE/Encompass credibility</strong> — association with an enterprise-connected platform signals professional legitimacy</span>,
              'Proof of the LO partner model at scale — 500+ LOs is a strong reference case for future lender distribution deals',
            ].map((t, i) => <div key={i} className="grv-col-item"><span className="grv-ck">✓</span><div>{t}</div></div>)}
          </div>
          <div className="grv-col-card grv-col-card-blue">
            <div className="grv-col-title"><div className="grv-dot grv-dot-b"></div>Groves IQ gains</div>
            {[
              <span><strong>LO retention tool</strong> — HomeRates gives their LOs something to offer borrowers between transactions</span>,
              'Consumer pipeline: HomeRates-ready borrowers who reach application stage can be referred to Groves IQ LOs',
              <span><strong>No product investment</strong> — they offer HomeRates to their LOs without building anything themselves</span>,
              "Differentiator vs competing LO workflow platforms — most don't offer a consumer-facing intelligence layer",
            ].map((t, i) => <div key={i} className="grv-col-item"><span className="grv-ck-bl">✓</span><div>{t}</div></div>)}
          </div>
        </div>
      </div>

      {/* S7 — Next Steps */}
      <div className="grv-section" id="grv-s7">
        <div className="grv-section-num">Section 7</div>
        <div className="grv-section-title">Proposed Next Steps</div>
        <div className="grv-steps-list">
          {[
            { done: true, label: 'Initial conversations — alignment on vision', desc: 'Both parties understand the product positioning and see the opportunity. No overlap confirmed.', owner: 'Completed · June 2026' },
            { done: true, label: 'Consumer UX prototypes delivered', desc: 'Four interactive prototypes built: consumer chat experience, My Scenarios, Decision Score card, and LO-sponsored UI. These represent the planned product — not speculative mockups.', owner: 'Completed · June 2026' },
            { active: true, label: 'Share this framework — get agreement on structure', desc: 'Groves IQ reviews the proposed distribution + referral model and the consumer UX direction. Agree on which components to pursue at launch.', owner: 'HomeRates → Groves IQ' },
            { label: 'Pilot with 20–30 Groves IQ LOs', desc: 'Select a cohort of active Groves IQ LOs to get early HomeRates access. Measure borrower activation rate and LO engagement. Validate the model before full rollout.', owner: 'Groves IQ selects · HomeRates onboards' },
            { label: 'Negotiate commercial terms', desc: 'Based on pilot results, agree on pricing model, referral structure, and 12-month contract terms.', owner: 'Both parties' },
            { label: 'Full rollout to Groves IQ LO network', desc: 'All 500+ Groves IQ LOs get HomeRates access. Consumer React implementation ships. Explore ICE/Encompass data bridge for Phase 2.', owner: 'Q3 2026 target' },
          ].map((s, i) => (
            <div key={i} className="grv-step-item">
              <div className={`grv-step-circle ${s.done ? 'grv-step-done' : s.active ? 'grv-step-active' : ''}`}>
                {s.done ? '✓' : i + 1}
              </div>
              <div className="grv-step-body">
                <div className="grv-step-title">{s.label}</div>
                <div className="grv-step-desc">{s.desc}</div>
                <div className="grv-step-owner">{s.owner}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SIGNATURE */}
      <div className="grv-sig-block">
        <div>
          <div className="grv-sig-company">HomeRates.ai</div>
          <div className="grv-sig-name">Rayaan Arif, Founder<br />HomeRatesAi LLC · Delaware</div>
          <div className="grv-sig-line"></div>
          <div className="grv-sig-label">Signature · Date</div>
        </div>
        <div>
          <div className="grv-sig-company">Groves IQ / Groves Capital</div>
          <div className="grv-sig-name">Name, Title<br />Company · State</div>
          <div className="grv-sig-line"></div>
          <div className="grv-sig-label">Signature · Date</div>
        </div>
      </div>

      <div className="grv-footer-note">
        This document is a proposed framework for discussion purposes only. It does not constitute a binding agreement. All commercial terms are subject to negotiation and execution of a formal agreement between the parties.
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   PAGE EXPORT
───────────────────────────────────────────────────────────── */
export default function GrovesPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [val, setVal] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORE_KEY) === '1') setUnlocked(true);
    setReady(true);
  }, []);

  function attempt() {
    if (val.toLowerCase().trim() === PASS) {
      localStorage.setItem(STORE_KEY, '1');
      setUnlocked(true);
    } else {
      setShake(true);
      setVal('');
      setTimeout(() => setShake(false), 600);
    }
  }

  if (!ready) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: DOC_CSS }} />
      {unlocked
        ? <FrameworkDoc />
        : <LockScreen val={val} setVal={setVal} shake={shake} onSubmit={attempt} />
      }
    </>
  );
}
