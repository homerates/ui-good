'use client';
// app/components/ConsumerWelcomeCard.tsx
// Consumer-first chat landing — property search as hero, 4 consumer scenarios, trust strip.
// Shown to signed-out users instead of the Pro WelcomeScreen.

import React, { useEffect, useRef, useState } from 'react';

const CONSUMER_SCENARIOS = [
  {
    icon: '💰',
    label: 'What can I afford?',
    seed: 'How much home can I afford? I want to understand my max purchase price based on my income.',
  },
  {
    icon: '🔁',
    label: 'Should I refinance?',
    seed: 'Should I refinance my mortgage? Help me understand if refinancing makes sense right now.',
  },
  {
    icon: '📊',
    label: 'FHA vs Conventional',
    seed: 'What is the difference between FHA and Conventional loans? Which one is better for me?',
  },
  {
    icon: '🎖️',
    label: 'VA loan estimate',
    seed: 'I am a veteran. Show me a VA loan estimate — I want to understand the $0 down option.',
  },
];

interface Props {
  onSend: (seed: string) => void;
  onMount?: () => void;
}

export default function ConsumerWelcomeCard({ onSend, onMount }: Props) {
  const [visible, setVisible] = useState(false);
  const [address, setAddress] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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

      {/* ── Property hero card ── */}
      <div className="cwc-hero">
        <div className="cwc-hero__label">Check any property · Free</div>
        <h1 className="cwc-hero__title">
          The financial picture<br />Zillow doesn&apos;t give you
        </h1>
        <p className="cwc-hero__sub">
          Enter any address. Get your monthly payment, affordability score, market position, and decision intelligence — in seconds.
        </p>

        {/* Address search */}
        <div className="cwc-addr">
          <span className="cwc-addr__icon">📍</span>
          <input
            ref={inputRef}
            className="cwc-addr__input"
            type="text"
            placeholder="123 Main St, Los Angeles CA 90001"
            value={address}
            onChange={e => setAddress(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitAddress()}
            autoComplete="off"
          />
          <button className="cwc-addr__btn" onClick={submitAddress} type="button">
            Check property →
          </button>
        </div>

        {/* Divider */}
        <div className="cwc-or">
          <div className="cwc-or__line" />
          <span className="cwc-or__text">or run a scenario</span>
          <div className="cwc-or__line" />
        </div>

        {/* Consumer scenario chips */}
        <div className="cwc-scenarios">
          {CONSUMER_SCENARIOS.map((s) => (
            <button
              key={s.label}
              className="cwc-scenario-chip"
              onClick={() => onSend(s.seed)}
              type="button"
            >
              <span className="cwc-scenario-chip__icon">{s.icon}</span>
              {s.label}
            </button>
          ))}
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

      <style>{`
        .cwc-root {
          padding: 20px 8px 32px;
          max-width: 680px;
          margin: 0 auto;
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 0.35s ease, transform 0.35s ease;
        }
        .cwc-root--visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* Hero card */
        .cwc-hero {
          background: linear-gradient(135deg, rgba(0,232,122,0.06), rgba(61,139,255,0.04));
          border: 1px solid rgba(0,232,122,0.18);
          border-radius: 18px;
          padding: 28px 24px 22px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .cwc-hero__label {
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--accent, #00e87a);
        }
        .cwc-hero__title {
          font-size: clamp(1.3rem, 4vw, 1.65rem);
          font-weight: 800;
          color: var(--text, #f0f4ff);
          letter-spacing: -0.03em;
          line-height: 1.2;
          margin: 0;
        }
        .cwc-hero__sub {
          font-size: 0.84rem;
          color: var(--text-weak, #8fa3b8);
          line-height: 1.6;
          margin: 0;
        }

        /* Address bar */
        .cwc-addr {
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--surface, #0e1420);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          padding: 10px 10px 10px 14px;
          transition: border-color 0.2s;
        }
        .cwc-addr:focus-within {
          border-color: rgba(0,232,122,0.4);
          box-shadow: 0 0 0 3px rgba(0,232,122,0.07);
        }
        .cwc-addr__icon {
          font-size: 1.1rem;
          flex-shrink: 0;
          line-height: 1;
        }
        .cwc-addr__input {
          flex: 1;
          min-width: 0;
          background: none;
          border: none;
          outline: none;
          color: var(--text, #f0f4ff);
          font-family: inherit;
          font-size: 0.9rem;
        }
        .cwc-addr__input::placeholder {
          color: rgba(255,255,255,0.25);
        }
        .cwc-addr__btn {
          flex-shrink: 0;
          background: var(--accent, #00e87a);
          border: none;
          border-radius: 8px;
          padding: 8px 16px;
          color: #000;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          white-space: nowrap;
          transition: opacity 0.15s;
        }
        .cwc-addr__btn:hover { opacity: 0.85; }
        @media (max-width: 440px) {
          .cwc-addr__btn { padding: 8px 11px; font-size: 0.72rem; }
        }

        /* Or divider */
        .cwc-or {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .cwc-or__line {
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.07);
        }
        .cwc-or__text {
          font-size: 0.65rem;
          color: rgba(255,255,255,0.25);
          font-weight: 500;
          white-space: nowrap;
        }

        /* Scenario chips */
        .cwc-scenarios {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .cwc-scenario-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          background: var(--surface2, #141b28);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 99px;
          font-size: 0.78rem;
          font-weight: 500;
          color: var(--text-weak, #8fa3b8);
          cursor: pointer;
          font-family: inherit;
          transition: border-color 0.15s, color 0.15s, background 0.15s;
          white-space: nowrap;
        }
        .cwc-scenario-chip:hover {
          color: var(--text, #f0f4ff);
          border-color: rgba(255,255,255,0.22);
          background: rgba(255,255,255,0.04);
        }
        .cwc-scenario-chip__icon {
          font-size: 0.85rem;
          line-height: 1;
        }

        /* Trust strip */
        .cwc-trust {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 20px;
          padding-top: 4px;
        }
        .cwc-trust__item {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 0.68rem;
          color: rgba(255,255,255,0.3);
        }
        .cwc-trust__check {
          color: var(--accent, #00e87a);
          font-size: 0.7rem;
        }

        @media (max-width: 500px) {
          .cwc-hero { padding: 22px 18px 18px; }
          .cwc-hero__title { font-size: 1.25rem; }
        }
      `}</style>
    </div>
  );
}
