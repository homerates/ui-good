'use client';
// app/components/ConsumerWelcomeCard.tsx
// Consumer-first chat landing — property search hero + marketing intelligence previews.
// Shown to signed-out users on the homepage and in the empty chat state.

import React, { useEffect, useState } from 'react';
import AddressAutocomplete from '@/components/AddressAutocomplete';

interface Props {
  onSend: (seed: string) => void;
  onMount?: () => void;
}

export default function ConsumerWelcomeCard({ onSend, onMount }: Props) {
  const [visible, setVisible] = useState(false);
  const [address, setAddress] = useState('');

  useEffect(() => {
    onMount?.();
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitAddress() {
    const val = address.trim();
    if (!val) return;
    setAddress('');
    onSend(val);
  }

  return (
    <div className={`cwc-root ${visible ? 'cwc-root--visible' : ''}`}>

      {/* ── Hero card ── */}
      <div className="cwc-hero">
        <div className="cwc-hero__label">Check any property · Free</div>
        <h1 className="cwc-hero__title">
          Home + Mortgage Intelligence.<br className="cwc-br" /> In seconds.
        </h1>
        <p className="cwc-hero__sub">
          Enter any address, or paste a link from Zillow or Redfin — get your monthly payment, market position, and decision score instantly.
        </p>

        {/* Address search */}
        <div className="cwc-addr">
          <span className="cwc-addr__icon">📍</span>
          <AddressAutocomplete
            className="cwc-addr__input"
            placeholder="Address, or paste a Zillow / Redfin link"
            value={address}
            onChange={setAddress}
            onSelect={(val) => {
              setAddress(val);
              setTimeout(() => { onSend(val); setAddress(''); }, 50);
            }}
            onKeyDown={e => { if (e.key === 'Enter') submitAddress(); }}
          />
          <button className="cwc-addr__btn" onClick={submitAddress} type="button">
            Check →
          </button>
        </div>

        {/* Trust strip */}
        <div className="cwc-trust">
          {['No account required', '3 free lookups', 'No sales calls', 'Real FRED rates'].map((t) => (
            <div key={t} className="cwc-trust__item">
              <span className="cwc-trust__check">✓</span>
              {t}
            </div>
          ))}
        </div>
      </div>

      {/* ── Preview tiles — what you'll get ── */}
      <div className="cwc-previews">
        <div className="cwc-previews__label">Sample output · your real numbers appear instantly</div>
        <div className="cwc-previews__grid">

          {/* Tile 1 — Payment Analysis */}
          <div className="cwc-tile">
            <div className="cwc-tile__sample">Sample</div>
            <div className="cwc-tile__tag" style={{ color: '#00e87a' }}>Payment Analysis</div>
            <div className="cwc-tile__address">123 Sunset Blvd, LA</div>
            <div className="cwc-tile__hero" style={{ color: '#00e87a' }}>
              <span className="cwc-tile__dol">$</span>6,840<span className="cwc-tile__mo">/mo</span>
            </div>
            <div className="cwc-tile__sub">PITI · 20% down · 6.875%</div>
            <div className="cwc-tile__facts">
              <div className="cwc-tile__fact">
                <div className="cwc-tile__fv">$1,249,000</div>
                <div className="cwc-tile__fl">List price</div>
              </div>
              <div className="cwc-tile__fact">
                <div className="cwc-tile__fv">$249,800</div>
                <div className="cwc-tile__fl">Down payment</div>
              </div>
              <div className="cwc-tile__fact">
                <div className="cwc-tile__fv" style={{ color: '#00e87a' }}>$0</div>
                <div className="cwc-tile__fl">PMI</div>
              </div>
            </div>
            {/* Mini color bar */}
            <div className="cwc-tile__bar">
              <div style={{ width: '68%', background: '#3d8bff', height: '100%' }} />
              <div style={{ width: '16%', background: '#f59e0b', height: '100%' }} />
              <div style={{ width: '10%', background: '#00e87a', height: '100%' }} />
            </div>
          </div>

          {/* Tile 2 — Decision Score */}
          <div className="cwc-tile">
            <div className="cwc-tile__sample">Sample</div>
            <div className="cwc-tile__tag" style={{ color: '#3d8bff' }}>Track 5 · Decision Score</div>
            <div className="cwc-tile__score-wrap">
              <div className="cwc-tile__ring">
                <svg width="52" height="52" viewBox="0 0 52 52">
                  <circle cx="26" cy="26" r="21" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
                  <circle cx="26" cy="26" r="21" fill="none" stroke="#00e87a" strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray="132"
                    strokeDashoffset="33"
                    transform="rotate(-90 26 26)"
                  />
                </svg>
                <div className="cwc-tile__ring-num">74</div>
              </div>
              <div className="cwc-tile__score-right">
                <div className="cwc-tile__verdict">Strong position</div>
                <div className="cwc-tile__verdict-sub">Ready to apply</div>
              </div>
            </div>
            <div className="cwc-tile__bars">
              {[
                { lbl: 'Financial',    val: 82, color: '#00e87a' },
                { lbl: 'Property',     val: 65, color: '#f59e0b' },
                { lbl: 'Market',       val: 78, color: '#00e87a' },
                { lbl: 'Location',     val: 71, color: '#00e87a' },
              ].map(r => (
                <div key={r.lbl} className="cwc-tile__bar-row">
                  <span className="cwc-tile__bar-lbl">{r.lbl}</span>
                  <div className="cwc-tile__bar-wrap">
                    <div className="cwc-tile__bar-fill" style={{ width: `${r.val}%`, background: r.color }} />
                  </div>
                  <span className="cwc-tile__bar-num">{r.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tile 3 — Income Qualify */}
          <div className="cwc-tile">
            <div className="cwc-tile__sample">Sample</div>
            <div className="cwc-tile__tag" style={{ color: '#a78bfa' }}>Income to Qualify</div>
            <div className="cwc-tile__iq-label">Minimum annual income</div>
            <div className="cwc-tile__hero" style={{ color: '#a78bfa' }}>
              <span className="cwc-tile__dol">$</span>198,400<span className="cwc-tile__mo">/yr</span>
            </div>
            <div className="cwc-tile__sub">At 43% DTI · 30yr conventional</div>
            <div className="cwc-tile__dti-rows">
              {[
                { pct: '43%', lbl: 'Standard max', val: '$198,400', active: true },
                { pct: '36%', lbl: 'Conservative', val: '$237,100', active: false },
                { pct: '28%', lbl: 'Front-end',    val: '$304,700', active: false },
              ].map(r => (
                <div key={r.pct} className={`cwc-tile__dti-row${r.active ? ' active' : ''}`}>
                  <span className="cwc-tile__dti-pct" style={r.active ? { color: '#a78bfa' } : {}}>{r.pct}</span>
                  <span className="cwc-tile__dti-lbl">{r.lbl}</span>
                  <span className="cwc-tile__dti-val">{r.val}/yr</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      <style>{`
        .cwc-root {
          padding: 20px 8px 32px;
          max-width: 700px;
          margin: 0 auto;
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 0.35s ease, transform 0.35s ease;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .cwc-root--visible { opacity: 1; transform: translateY(0); }

        /* ── Hero card ── */
        .cwc-hero {
          background: linear-gradient(135deg, rgba(0,232,122,0.06), rgba(61,139,255,0.04));
          border: 1px solid rgba(0,232,122,0.18);
          border-radius: 18px;
          padding: 28px 24px 22px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .cwc-hero__label {
          font-size: 0.62rem; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--accent, #00e87a);
        }
        .cwc-hero__title {
          font-size: clamp(1.3rem, 4vw, 1.7rem); font-weight: 800;
          color: var(--text, #f0f4ff); letter-spacing: -0.03em; line-height: 1.2; margin: 0;
        }
        .cwc-br { display: none; }
        @media (min-width: 480px) { .cwc-br { display: block; } }
        .cwc-hero__sub {
          font-size: 0.84rem; color: var(--text-weak, #8fa3b8); line-height: 1.6; margin: 0;
        }

        /* Address bar */
        .cwc-addr {
          display: flex; align-items: center; gap: 10px;
          background: var(--surface, #0e1420);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px; padding: 10px 10px 10px 14px;
          transition: border-color 0.2s;
        }
        .cwc-addr:focus-within {
          border-color: rgba(0,232,122,0.4);
          box-shadow: 0 0 0 3px rgba(0,232,122,0.07);
        }
        .cwc-addr__icon { font-size: 1.1rem; flex-shrink: 0; line-height: 1; }
        .cwc-addr__input {
          flex: 1; min-width: 0; background: none; border: none; outline: none;
          color: var(--text, #f0f4ff); font-family: inherit; font-size: 0.9rem;
        }
        .cwc-addr__input::placeholder { color: rgba(255,255,255,0.25); }
        .cwc-addr__btn {
          flex-shrink: 0; background: var(--accent, #00e87a); border: none;
          border-radius: 8px; padding: 8px 16px; color: #000;
          font-size: 0.78rem; font-weight: 700; cursor: pointer;
          font-family: inherit; white-space: nowrap; transition: opacity 0.15s;
        }
        .cwc-addr__btn:hover { opacity: 0.85; }
        @media (max-width: 400px) { .cwc-addr__btn { padding: 8px 11px; font-size: 0.72rem; } }

        /* Trust strip */
        .cwc-trust {
          display: flex; flex-wrap: wrap; gap: 6px 18px; padding-top: 2px;
        }
        .cwc-trust__item {
          display: flex; align-items: center; gap: 5px;
          font-size: 0.67rem; color: rgba(255,255,255,0.28);
        }
        .cwc-trust__check { color: var(--accent, #00e87a); font-size: 0.68rem; }

        /* ── Preview section ── */
        .cwc-previews { display: flex; flex-direction: column; gap: 12px; }
        .cwc-previews__label {
          font-size: 0.6rem; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase; color: rgba(255,255,255,0.2);
          padding: 0 2px;
        }
        .cwc-previews__grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
        }
        @media (max-width: 580px) {
          .cwc-previews__grid { grid-template-columns: 1fr; }
        }
        @media (min-width: 581px) and (max-width: 720px) {
          .cwc-previews__grid { grid-template-columns: 1fr 1fr; }
        }

        /* Preview tile */
        .cwc-tile {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 13px;
          padding: 14px;
          display: flex; flex-direction: column; gap: 8px;
          pointer-events: none; /* purely visual */
          position: relative;
        }
        .cwc-tile__sample {
          position: absolute; top: 10px; right: 10px;
          font-size: 0.48rem; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase; color: rgba(255,255,255,0.25);
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 4px; padding: 2px 6px;
        }
        .cwc-tile__tag {
          font-size: 0.55rem; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .cwc-tile__address {
          font-size: 0.7rem; font-weight: 600; color: rgba(255,255,255,0.5);
        }
        .cwc-tile__hero {
          font-size: 1.5rem; font-weight: 900; letter-spacing: -0.04em; line-height: 1;
        }
        .cwc-tile__dol { font-size: 0.9rem; }
        .cwc-tile__mo { font-size: 0.65rem; font-weight: 600; color: rgba(255,255,255,0.3); margin-left: 1px; }
        .cwc-tile__sub { font-size: 0.58rem; color: rgba(255,255,255,0.25); }
        .cwc-tile__iq-label { font-size: 0.6rem; color: rgba(255,255,255,0.3); margin-bottom: -4px; }

        /* Facts row */
        .cwc-tile__facts {
          display: grid; grid-template-columns: repeat(3,1fr); gap: 4px;
        }
        .cwc-tile__fact {
          background: rgba(255,255,255,0.04); border-radius: 6px; padding: 5px 6px;
        }
        .cwc-tile__fv { font-size: 0.65rem; font-weight: 700; color: rgba(255,255,255,0.7); }
        .cwc-tile__fl { font-size: 0.48rem; color: rgba(255,255,255,0.25); margin-top: 1px; }

        /* Color bar */
        .cwc-tile__bar {
          display: flex; height: 4px; border-radius: 99px;
          overflow: hidden; background: rgba(255,255,255,0.06); gap: 1px;
        }

        /* Score ring */
        .cwc-tile__score-wrap {
          display: flex; align-items: center; gap: 10px;
        }
        .cwc-tile__ring { position: relative; flex-shrink: 0; }
        .cwc-tile__ring-num {
          position: absolute; inset: 0; display: flex; align-items: center;
          justify-content: center; font-size: 0.9rem; font-weight: 900; color: #00e87a;
        }
        .cwc-tile__score-right { display: flex; flex-direction: column; gap: 2px; }
        .cwc-tile__verdict { font-size: 0.72rem; font-weight: 700; color: rgba(255,255,255,0.75); }
        .cwc-tile__verdict-sub { font-size: 0.6rem; color: rgba(255,255,255,0.3); }

        /* Score level bars */
        .cwc-tile__bars { display: flex; flex-direction: column; gap: 5px; }
        .cwc-tile__bar-row { display: flex; align-items: center; gap: 6px; }
        .cwc-tile__bar-lbl { font-size: 0.55rem; color: rgba(255,255,255,0.3); width: 52px; flex-shrink: 0; }
        .cwc-tile__bar-wrap {
          flex: 1; height: 3px; background: rgba(255,255,255,0.07);
          border-radius: 2px; overflow: hidden;
        }
        .cwc-tile__bar-fill { height: 100%; border-radius: 2px; }
        .cwc-tile__bar-num { font-size: 0.55rem; font-weight: 700; color: rgba(255,255,255,0.4); width: 18px; text-align: right; }

        /* DTI rows */
        .cwc-tile__dti-rows { display: flex; flex-direction: column; gap: 3px; }
        .cwc-tile__dti-row {
          display: flex; align-items: center; gap: 6px;
          padding: 4px 7px; border-radius: 6px; border: 1px solid transparent;
        }
        .cwc-tile__dti-row.active {
          background: rgba(167,139,250,0.08); border-color: rgba(167,139,250,0.2);
        }
        .cwc-tile__dti-pct { font-size: 0.65rem; font-weight: 800; color: rgba(255,255,255,0.35); width: 28px; flex-shrink: 0; }
        .cwc-tile__dti-lbl { font-size: 0.6rem; color: rgba(255,255,255,0.3); flex: 1; }
        .cwc-tile__dti-val { font-size: 0.6rem; font-weight: 700; color: rgba(255,255,255,0.5); white-space: nowrap; }

        @media (max-width: 500px) {
          .cwc-hero { padding: 22px 18px 18px; }
          .cwc-hero__title { font-size: 1.25rem; }
        }
      `}</style>
    </div>
  );
}
