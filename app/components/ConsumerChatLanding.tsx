'use client';
import { useEffect, useState } from 'react';

const CARDS = [
  {
    key: 'afford',
    icon: '🏠',
    label: 'Can I afford it?',
    line1: '~$850k–$950k CA range',
    line2: '~$4,800/mo on $150k salary',
    accent: '#60a5fa',
    seed: 'I make $150,000 a year and have $90,000 saved — how much house can I afford in California? Show me income qualification, max price range, estimated PITI and DTI.',
  },
  {
    key: 'conv',
    icon: '🏡',
    label: 'Conventional Purchase',
    line1: '~$4,950/mo · PITI · no PMI',
    line2: '$832,750 · 20% down · up to $806,500 CA',
    accent: '#00e87a',
    seed: 'Conventional loan with a $832,750 loan amount and 20% down at current rates — show me the full monthly payment breakdown including principal, interest, taxes, insurance, and no PMI.',
  },
  {
    key: 'refi',
    icon: '🔁',
    label: 'Should I refi?',
    line1: '~$510/mo savings · 3yr breakeven',
    line2: '$750k CA balance · 6.75% → today',
    accent: '#a78bfa',
    seed: 'What would refinancing look like on a $750,000 California mortgage at 6.75%? Show me breakeven, monthly savings, and what rate I need for a 3-year payback.',
  },
  {
    key: 'jumbo',
    icon: '🏛️',
    label: 'Jumbo Purchase',
    line1: '~$8,900/mo · reserves required',
    line2: '$1.5M · 20% down · above conforming limit',
    accent: '#f59e0b',
    seed: 'Jumbo loan on a $1,500,000 home with 20% down at current rates — show me the full payment breakdown, reserve requirements, and how this compares to conforming.',
  },
];

const CHIPS = [
  { label: 'FHA · $700k LA · 3.5% down',      seed: 'FHA loan on a $700,000 home in Los Angeles with 3.5% down — show me the full payment including MIP' },
  { label: 'VA loan · $0 down · $850k',         seed: 'VA loan on an $850,000 home with no down payment — full breakdown including funding fee' },
  { label: '$650k home · 10% down · with PMI?', seed: 'Conventional loan on a $650,000 home with 10% down — show me the full payment including PMI' },
  { label: '$120k income · what can I buy?',    seed: 'I make $120,000 a year and have $60,000 saved — how much house can I afford?' },
  { label: 'DSCR rental · $650k',               seed: 'DSCR loan on a $650,000 rental property with $4,200 rent and 25% down — does it cash flow?' },
  { label: '$200k income · what\'s my max?',    seed: 'I make $200,000 a year and have $150,000 saved — what is my max home price range in California?' },
];

interface Props {
  onSend: (seed: string) => void;
  onMount?: () => void;
}

export default function ConsumerChatLanding({ onSend, onMount }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    onMount?.();
    const el = document.querySelector('.center') as HTMLElement | null;
    if (el) el.style.paddingTop = '4px';
    const t = setTimeout(() => setVisible(true), 60);
    return () => {
      clearTimeout(t);
      const c = document.querySelector('.center') as HTMLElement | null;
      if (c) c.style.paddingTop = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`ccl-root ${visible ? 'ccl-root--visible' : ''}`}>

      {/* Headline */}
      <div className="ccl-hero">
        <h1 className="ccl-hero__h1">What do you want to figure out?</h1>
        <p className="ccl-hero__sub">Pick a scenario — or just ask. Real math, live rates, no gatekeepers.</p>
      </div>

      {/* 2×2 cards */}
      <div className="ccl-scenarios">
        {CARDS.map((c, i) => (
          <button
            key={c.key}
            className="ccl-card"
            onClick={() => onSend(c.seed)}
            style={{ ['--ccl-accent' as string]: c.accent, animationDelay: `${100 + i * 55}ms` }}
          >
            <span className="ccl-card__icon">{c.icon}</span>
            <span className="ccl-card__label">{c.label}</span>
            <span className="ccl-card__line1">{c.line1}</span>
            <span className="ccl-card__line2">{c.line2}</span>
          </button>
        ))}
      </div>

      {/* Chips */}
      <div className="ccl-chips-wrap">
        <div className="ccl-chips-label">Or try one of these</div>
        <div className="ccl-chips">
          {CHIPS.map((ch, i) => (
            <button
              key={ch.label}
              className="ccl-chip"
              onClick={() => onSend(ch.seed)}
              style={{ animationDelay: `${320 + i * 40}ms` }}
            >
              {ch.label}
            </button>
          ))}
        </div>
      </div>

      <style>{`
        .ccl-root {
          padding: 24px 8px 32px;
          max-width: 720px;
          margin: 0 auto;
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 0.35s ease, transform 0.35s ease;
        }
        .ccl-root--visible { opacity: 1; transform: translateY(0); }

        /* Headline */
        .ccl-hero { margin-bottom: 24px; }
        .ccl-hero__h1 {
          font-size: clamp(1.35rem, 3.5vw, 1.85rem);
          font-weight: 800;
          color: var(--text, #f0f4ff);
          line-height: 1.18;
          letter-spacing: -0.02em;
          margin-bottom: 6px;
        }
        .ccl-hero__sub {
          font-size: 0.88rem;
          color: var(--text-weak, #8fa3b8);
          line-height: 1.6;
        }

        /* 2×2 grid */
        .ccl-scenarios {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 20px;
        }
        @media (max-width: 480px) {
          .ccl-scenarios { grid-template-columns: 1fr; }
        }

        /* Card — exact hr-scenario style */
        .ccl-card {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          padding: 22px;
          background: var(--surface, #0e1420);
          border: 1px solid var(--border, rgba(255,255,255,0.07));
          border-radius: 14px;
          cursor: pointer;
          text-align: left;
          position: relative;
          overflow: hidden;
          transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
          opacity: 0;
          animation: cclCardIn 0.4s ease forwards;
        }
        .ccl-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: var(--ccl-accent, #00e87a);
          opacity: 0;
          transition: opacity 0.2s;
        }
        @keyframes cclCardIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ccl-card:hover {
          border-color: var(--border-bright, rgba(255,255,255,0.13));
          box-shadow: 0 12px 40px rgba(0,0,0,0.3);
          transform: translateY(-2px);
        }
        .ccl-card:hover::before { opacity: 1; }
        .ccl-card:active { transform: translateY(0); }

        .ccl-card__icon {
          font-size: 22px;
          margin-bottom: 14px;
          display: block;
          line-height: 1;
          color: var(--ccl-accent, #00e87a);
        }
        .ccl-card__label {
          font-family: var(--font-dm-sans, 'DM Sans', sans-serif);
          font-size: 15px;
          font-weight: 600;
          color: var(--text, #f0f4ff);
          margin-bottom: 6px;
          line-height: 1.2;
        }
        .ccl-card__line1 {
          font-size: 12px;
          font-weight: 500;
          color: var(--ccl-accent, #00e87a);
          line-height: 1.4;
          margin-bottom: 6px;
        }
        .ccl-card__line2 {
          font-size: 12px;
          color: var(--text-weak, #8fa3b8);
          line-height: 1.5;
        }

        /* Chips — exact hr-chip style */
        .ccl-chips-wrap { margin-bottom: 8px; }
        .ccl-chips-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-weak, #8fa3b8);
          text-transform: uppercase;
          letter-spacing: 0.07em;
          margin-bottom: 10px;
        }
        .ccl-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .ccl-chip {
          padding: 8px 16px;
          background: var(--card, #0e1420);
          border: 1px solid var(--border, rgba(255,255,255,0.07));
          border-radius: 99px;
          font-size: 0.82rem;
          font-weight: 500;
          color: var(--text-weak, #8fa3b8);
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s, color 0.15s;
          white-space: nowrap;
          opacity: 0;
          animation: cclCardIn 0.35s ease forwards;
          font-family: var(--font-dm-sans, 'DM Sans', sans-serif);
        }
        .ccl-chip:hover {
          border-color: var(--accent, #00e87a);
          background: rgba(0,232,122,0.07);
          color: var(--accent, #00e87a);
        }
      `}</style>
    </div>
  );
}
