'use client';
// app/components/WelcomeScreen.tsx
// Blank state welcome screen — replaces "New chat. What do you want to figure out?"
// Renders inside the existing message bubble flow when messages[0] is the placeholder
// Props: send(seed: string) — fires the question directly into the chat

import React, { useEffect, useState } from 'react';


// Persona → seed mapping
const PERSONAS = [
    {
        icon: '🏠',
        label: 'Buying a Home',
        desc: 'Affordability, payments, loan types',
        seed: 'I make $95,000 a year and have $35,000 saved — how much house can I afford?',
    },
    {
        icon: '🔁',
        label: 'Refinancing',
        desc: 'Breakeven, savings, trigger rate',
        seed: 'I have a $450,000 mortgage at 7.25% — should I refinance? Show me breakeven and monthly savings.',
    },
    {
        icon: '📐',
        label: 'Investment Property',
        desc: 'DSCR, cash flow, rental analysis',
        seed: 'DSCR loan on a $400,000 rental property with $2,800/mo rent and 25% down — does it cash flow?',
    },
    {
        icon: '🗝️',
        label: 'FHA Loan',
        desc: 'Low down payment, MIP, qualification',
        seed: 'FHA loan on a $400,000 home with 3.5% down — show me the full payment breakdown including MIP.',
    },
];

// Quick scenario chips — fires immediately into chat
const QUICK_CHIPS = [
    { label: '$400k · 20% down · conventional', seed: 'Conventional loan on a $400,000 home with 20% down at current rates' },
    { label: 'FHA vs conventional on $400k', seed: 'Compare FHA 3.5% down vs conventional 5% down on a $400,000 home' },
    { label: 'What income for $500k home?', seed: 'What income do I need to qualify for a $500,000 home?' },
    { label: 'DSCR on $450k rental · $3,200 rent', seed: 'DSCR loan on a $450,000 rental property, $3,200/mo rent, 25% down' },
    { label: 'Refi: $400k at 7% → breakeven?', seed: 'I have a $400,000 mortgage at 7% — what rate do I need for a 3-year breakeven?' },
    { label: 'How much house on $120k salary?', seed: 'I make $120,000 a year and have $42,000 saved — how much house can I afford?' },
];

// Static FRED display values — updated to match current data
// These are display-only signals; actual calculations use live FRED
const FRED_DISPLAY = [
    { label: '30Y FIXED', value: '6.22%', sub: 'FRED avg' },
    { label: '10Y TREASURY', value: '4.25%', sub: 'yield' },
    { label: 'SPREAD', value: '1.97%', sub: 'mtg vs T10' },
    { label: 'FED FUNDS', value: '3.64%', sub: 'target rate' },
];

interface WelcomeScreenProps {
    onSend: (seed: string) => void;
    onMount?: () => void;
}

export default function WelcomeScreen({ onSend, onMount }: WelcomeScreenProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Close sidebar on mobile
        onMount?.();
        // Scroll to top — delay ensures DOM is painted first
        const centerEl = document.querySelector('.center') as HTMLElement | null;
        setTimeout(() => {
            const scrollEl = document.querySelector('.scroll') as HTMLElement | null;
            if (scrollEl) scrollEl.scrollTop = 0;
            if (centerEl) centerEl.style.paddingTop = '4px';
        }, 0);
        // Stagger reveal
        const t = setTimeout(() => setVisible(true), 60);
        return () => {
            clearTimeout(t);
            if (centerEl) centerEl.style.paddingTop = '';
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className={`hr-welcome ${visible ? 'hr-welcome--visible' : ''}`}>

            {/* ── Rate ticker ── */}
            <div className="hr-ticker">
                <div className="hr-ticker__track">
                    {[...FRED_DISPLAY, ...FRED_DISPLAY].map((item, i) => (
                        <div key={`${item.label}-${i}`} className="hr-ticker__item">
                            <span className="hr-ticker__label">{item.label}</span>
                            <span className="hr-ticker__value">{item.value}</span>
                            <span className="hr-ticker__sub">{item.sub}</span>
                        </div>
                    ))}
                </div>
                <div className="hr-ticker__live">
                    <span className="hr-ticker__dot" />
                    FRED live
                </div>
            </div>

            {/* ── Headline ── */}
            <div className="hr-headline">
                <h1 className="hr-headline__title">
                    Your mortgage<br />intelligence platform
                </h1>
                <p className="hr-headline__sub">
                    Real math. Live rates. No sales pitch.<br />
                    Ask anything about buying, refinancing, or investing.
                </p>
            </div>

            {/* ── Persona cards ── */}
            <div className="hr-personas">
                {PERSONAS.map((p, i) => (
                    <button
                        key={p.label}
                        className="hr-persona"
                        onClick={() => onSend(p.seed)}
                        style={{ animationDelay: `${120 + i * 60}ms` }}
                    >
                        <span className="hr-persona__icon">{p.icon}</span>
                        <span className="hr-persona__label">{p.label}</span>
                        <span className="hr-persona__desc">{p.desc}</span>
                    </button>
                ))}
            </div>

            {/* ── Quick chips ── */}
            <div className="hr-quick">
                <span className="hr-quick__label">Quick scenarios</span>
                <div className="hr-quick__chips">
                    {QUICK_CHIPS.map((chip, i) => (
                        <button
                            key={chip.label}
                            className="hr-chip"
                            onClick={() => onSend(chip.seed)}
                            style={{ animationDelay: `${300 + i * 40}ms` }}
                        >
                            {chip.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Styles ── */}
            <style>{`
                .hr-welcome {
                    padding: 0 8px 32px;
                    max-width: 680px;
                    margin: -16px auto 0;
                    opacity: 0;
                    transform: translateY(8px);
                    transition: opacity 0.35s ease, transform 0.35s ease;
                }
                .hr-welcome--visible {
                    opacity: 1;
                    transform: translateY(0);
                }

                /* ── Ticker ── */
                .hr-ticker {
                    display: flex;
                    align-items: center;
                    background: #f0f4f8;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    padding: 10px 14px;
                    margin-bottom: 20px;
                    overflow: hidden;
                    gap: 0;
                }
                /* Scrolling track — holds 2 identical sets for seamless loop */
                .hr-ticker__track {
                    display: flex;
                    align-items: center;
                    flex: 1;
                    min-width: 0;
                    animation: tickerScroll 24s linear infinite;
                }
                .hr-ticker__track:hover {
                    animation-play-state: paused;
                }
                @keyframes tickerScroll {
                    from { transform: translateX(0); }
                    to   { transform: translateX(-50%); }
                }
                .hr-ticker__item {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    padding: 0 16px 0 0;
                    margin-right: 16px;
                    border-right: 1px solid #e2e8f0;
                    min-width: max-content;
                    flex-shrink: 0;
                }
                .hr-ticker__label {
                    font-size: 9px;
                    font-weight: 700;
                    letter-spacing: 0.08em;
                    color: #94a3b8;
                    text-transform: uppercase;
                    margin-bottom: 2px;
                }
                .hr-ticker__value {
                    font-size: 15px;
                    font-weight: 700;
                    color: #0f172a;
                    font-variant-numeric: tabular-nums;
                    letter-spacing: -0.01em;
                }
                .hr-ticker__sub {
                    font-size: 10px;
                    color: #94a3b8;
                    margin-top: 1px;
                }
                .hr-ticker__live {
                    margin-left: auto;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 10px;
                    font-weight: 600;
                    color: #22c55e;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    white-space: nowrap;
                    padding-left: 16px;
                }
                .hr-ticker__dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: #22c55e;
                    animation: pulse 2s ease-in-out infinite;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(0.8); }
                }

                /* ── Headline ── */
                .hr-headline {
                    margin-bottom: 20px;
                }
                .hr-headline__title {
                    font-size: clamp(1.6rem, 4vw, 2.2rem);
                    font-weight: 800;
                    color: #0f172a;
                    line-height: 1.15;
                    letter-spacing: -0.03em;
                    margin: 0 0 10px;
                }
                .hr-headline__sub {
                    font-size: 0.95rem;
                    color: #64748b;
                    line-height: 1.6;
                    margin: 0;
                }

                /* ── Persona cards ── */
                .hr-personas {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 8px;
                    margin-bottom: 16px;
                }
                @media (max-width: 480px) {
                    .hr-personas { grid-template-columns: 1fr 1fr; }
                }
                .hr-persona {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    padding: 14px 16px;
                    background: var(--surface, white);
                    border: 1.5px solid #e2e8f0;
                    border-radius: 12px;
                    cursor: pointer;
                    text-align: left;
                    transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
                    opacity: 0;
                    animation: personaIn 0.4s ease forwards;
                }
                @keyframes personaIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .hr-persona:hover {
                    border-color: #22c55e;
                    box-shadow: 0 4px 16px rgba(34,197,94,0.1);
                    transform: translateY(-1px);
                }
                .hr-persona:active { transform: translateY(0); }
                .hr-persona__icon {
                    font-size: 1.4rem;
                    margin-bottom: 8px;
                }
                .hr-persona__label {
                    font-size: 0.88rem;
                    font-weight: 700;
                    color: #0f172a;
                    margin-bottom: 3px;
                }
                .hr-persona__desc {
                    font-size: 0.78rem;
                    color: #94a3b8;
                    line-height: 1.4;
                }

                /* ── Quick chips ── */
                .hr-quick {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .hr-quick__label {
                    font-size: 11px;
                    font-weight: 600;
                    color: #94a3b8;
                    text-transform: uppercase;
                    letter-spacing: 0.07em;
                }
                .hr-quick__chips {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }
                .hr-chip {
                    padding: 7px 14px;
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 99px;
                    font-size: 0.8rem;
                    color: #334155;
                    cursor: pointer;
                    transition: border-color 0.15s, background 0.15s, color 0.15s;
                    white-space: nowrap;
                    opacity: 0;
                    animation: chipIn 0.35s ease forwards;
                }
                @keyframes chipIn {
                    from { opacity: 0; transform: translateY(4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .hr-chip:hover {
                    border-color: #22c55e;
                    background: #f0fdf4;
                    color: #166534;
                }
            `}</style>
        </div>
    );
}