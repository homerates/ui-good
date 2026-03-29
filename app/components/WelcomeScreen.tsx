'use client';
// app/components/WelcomeScreen.tsx
// Phase-2 welcome screen — value-first scenario previews + live rate hero

import React, { useEffect, useState } from 'react';

// Quick scenario chips — fires immediately into chat
const QUICK_CHIPS = [
    { label: '$400k · 20% down · conventional', seed: 'Conventional loan on a $400,000 home with 20% down at current rates' },
    { label: 'FHA vs conventional on $400k', seed: 'Compare FHA 3.5% down vs conventional 5% down on a $400,000 home' },
    { label: 'What income for $500k home?', seed: 'What income do I need to qualify for a $500,000 home?' },
    { label: 'DSCR on $450k rental · $3,200 rent', seed: 'DSCR loan on a $450,000 rental property, $3,200/mo rent, 25% down' },
    { label: 'VA loan · $550k · no down payment', seed: 'VA loan on a $550,000 home with no down payment at current rates' },
    { label: 'Jumbo · $1.5M · 20% down', seed: 'Jumbo loan on a $1,500,000 home with 20% down at current rates' },
    { label: 'CA loan limits · LA County 2026', seed: 'California loan limits for Los Angeles County — show me the 2026 conforming, high balance, and jumbo thresholds' },
    { label: 'Refi: $400k at 7% → breakeven?', seed: 'I have a $400,000 mortgage at 7% — what rate do I need for a 3-year breakeven?' },
    { label: 'How much house on $120k salary?', seed: 'I make $120,000 a year and have $42,000 saved — how much house can I afford?' },
    { label: 'HomeRates vs ChatGPT', seed: 'About HomeRates: chatgpt — how is HomeRates.ai different from ChatGPT for mortgage questions?' },
];

// Scenario preview cards — show icon + title + teaser numbers
const SCENARIOS = [
    {
        icon: '🏠',
        label: 'Can I afford it?',
        accent: '#3b82f6',
        line1: '~$460k max home',
        line2: '~$2,800/mo on $120k salary',
        seed: 'I make $120,000 a year and have $42,000 saved — how much house can I afford?',
    },
    {
        icon: '🔁',
        label: 'Should I refi?',
        accent: '#10b981',
        line1: '~$340/mo savings',
        line2: 'Break even in ~26 months',
        seed: 'What would refinancing look like on a $450,000 mortgage at 7.25%? Show me breakeven and monthly savings.',
    },
    {
        icon: '📐',
        label: 'Cash flow check',
        accent: '#f59e0b',
        line1: 'DSCR 1.12 — cash flows',
        line2: '$400k rental · $2,800/mo rent',
        seed: 'DSCR loan on a $400,000 rental property with $2,800/mo rent and 25% down — does it cash flow?',
    },
    {
        icon: '🗝️',
        label: 'FHA low down',
        accent: '#8b5cf6',
        line1: '3.5% down · $13,860 to close',
        line2: '$2,540/mo incl. MIP on $400k',
        seed: 'FHA loan on a $400,000 home with 3.5% down — show me the full payment breakdown including MIP.',
    },
    {
        icon: '🎖️',
        label: 'VA — $0 down',
        accent: '#dc2626',
        line1: 'No down · no PMI',
        line2: '$500k home · full breakdown',
        seed: 'VA loan on a $500,000 home with no down payment — show me the full breakdown including funding fee.',
    },
    {
        icon: '🏛️',
        label: 'Jumbo $1.5M',
        accent: '#7c3aed',
        line1: '20% down · ~$8,900/mo',
        line2: 'Reserves & qualification guide',
        seed: 'Jumbo loan on a $1,500,000 home with 20% down — show me the full payment breakdown and reserve requirements.',
    },
];


interface WelcomeScreenProps {
    onSend: (seed: string) => void;
    onMount?: () => void;
    onPriceCheck?: () => void;
}

export default function WelcomeScreen({ onSend, onMount, onPriceCheck }: WelcomeScreenProps) {
    const [visible, setVisible] = useState(false);
    const [pcUrl, setPcUrl] = useState('');
    // Live 30Y rate for the Rate Alert
    const [heroRate, setHeroRate] = useState<string | null>(null);
    const [heroSub, setHeroSub] = useState<string | null>(null);

    function submitPriceCheck() {
        const url = pcUrl.trim();
        if (!url) return;
        setPcUrl('');
        onSend(url);
    }

    // Fetch live 30Y rate for Rate Alert
    useEffect(() => {
        let cancelled = false;
        fetch('/api/ticker', { cache: 'no-store' })
            .then((r) => r.json())
            .then((json) => {
                if (!cancelled && json?.ok && Array.isArray(json.items)) {
                    const thirtyY = json.items.find((it: any) =>
                        it.label?.includes('30Y') || it.label?.includes('30-Year')
                    );
                    if (thirtyY && thirtyY.value !== '—') {
                        setHeroRate(thirtyY.value);
                        setHeroSub(thirtyY.sub ?? 'today\'s rate');
                    }
                }
            })
            .catch(() => { /* keep fallback */ });
        return () => { cancelled = true; };
    }, []);

    // Scroll to top reliably — fire immediately then again after two paint frames
    useEffect(() => {
        onMount?.();

        function doScroll() {
            const scrollEl = document.querySelector('.scroll') as HTMLElement | null;
            if (scrollEl) {
                scrollEl.scrollTop = 0;
            } else {
                window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
            }
        }

        doScroll();
        requestAnimationFrame(() => {
            doScroll();
            requestAnimationFrame(doScroll);
        });

        const centerEl = document.querySelector('.center') as HTMLElement | null;
        if (centerEl) centerEl.style.paddingTop = '4px';

        const t = setTimeout(() => setVisible(true), 60);
        return () => {
            clearTimeout(t);
            const el = document.querySelector('.center') as HTMLElement | null;
            if (el) el.style.paddingTop = '';
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className={`hr-welcome ${visible ? 'hr-welcome--visible' : ''}`}>

            {/* ── Headline ── */}
            <div className="hr-hero">
                <div className="hr-hero__text">
                    <h1 className="hr-headline__title">
                        What's your<br className="hr-headline__br--mobile" /> mortgage question?
                    </h1>
                    <p className="hr-headline__sub">
                        Real math. Live rates. No sales. No gatekeepers.
                    </p>
                </div>
            </div>

            {/* ── Rate Alert (replaces ticker) ── */}
            {heroRate && (
                <div className="hr-rate-alert">
                    <div className="hr-rate-alert__dot" />
                    <div className="hr-rate-alert__text">
                        <strong>Rate alert:</strong> 30Y fixed is at <strong>{heroRate}</strong> — {heroSub}. Paste a listing URL below to see your real monthly payment.
                    </div>
                </div>
            )}

            {/* ── Property Lookup (matches landing page) ── */}
            <div className="hr-price-check">
                <div className="hr-price-check__label">Property Lookup</div>
                <div className="hr-price-check__bar">
                    <div className="hr-price-check__icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                            <polyline points="9 22 9 12 15 12 15 22" />
                        </svg>
                    </div>
                    <form
                        className="hr-price-check__form"
                        onSubmit={(e) => { e.preventDefault(); submitPriceCheck(); }}
                        style={{ flex: 1, minWidth: 0 }}
                    >
                        <input
                            className="hr-price-check__input"
                            type="url"
                            placeholder="Paste a Redfin URL or enter an address — get instant refi analysis"
                            value={pcUrl}
                            onChange={(e) => setPcUrl(e.target.value)}
                            onPaste={(e) => {
                                const text = e.clipboardData.getData('text').trim();
                                if (text.startsWith('http')) {
                                    e.preventDefault();
                                    setPcUrl(text);
                                    setTimeout(() => { onSend(text); setPcUrl(''); }, 50);
                                }
                            }}
                        />
                    </form>
                    <button className="hr-price-check__go" type="button" onClick={submitPriceCheck}>
                        Analyze Property
                    </button>
                </div>
                <div className="hr-price-check__hint">Works on sold, pending, and off-market properties · Instant refi readiness · No account needed</div>
            </div>

            {/* ── Scenario preview cards ── */}
            <div className="hr-scenarios-wrap">
                <div className="hr-scenarios-label">Live Scenarios</div>
                <div className="hr-scenarios">
                    {SCENARIOS.map((s, i) => (
                        <button
                            key={s.label}
                            className="hr-scenario"
                            onClick={() => onSend(s.seed)}
                            style={{
                                animationDelay: `${100 + i * 55}ms`,
                                ['--scenario-accent' as any]: s.accent,
                            }}
                        >
                            <span className="hr-scenario__icon" style={{ color: s.accent }}>{s.icon}</span>
                            <span className="hr-scenario__label">{s.label}</span>
                            <span className="hr-scenario__line1">{s.line1}</span>
                            <span className="hr-scenario__line2">{s.line2}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Quick chips (horizontal scroll) ── */}
            <div className="hr-quick">
                <span className="hr-quick__label">Quick scenarios</span>
                <div className="hr-quick__chips">
                    {onPriceCheck && (
                        <button
                            className="hr-chip hr-chip--price-check"
                            onClick={onPriceCheck}
                            type="button"
                            style={{ animationDelay: '280ms' }}
                        >
                            Price Check — paste your Zillow or Redfin URL
                        </button>
                    )}
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
                    padding: 24px 8px 32px;
                    max-width: 720px;
                    margin: 0 auto;
                    opacity: 0;
                    transform: translateY(8px);
                    transition: opacity 0.35s ease, transform 0.35s ease;
                }
                .hr-welcome--visible {
                    opacity: 1;
                    transform: translateY(0);
                }

                /* ── Rate Alert (replaces ticker) ── */
                .hr-rate-alert {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    background: var(--surface, #0e1420);
                    border: 1px solid var(--border, rgba(255,255,255,0.07));
                    border-left: 3px solid var(--accent, #00e87a);
                    border-radius: 10px;
                    padding: 14px 20px;
                    margin-bottom: 20px;
                    animation: chipIn 0.4s ease 0.1s both;
                }
                .hr-rate-alert__dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: var(--accent, #00e87a);
                    flex-shrink: 0;
                    animation: pulse 2s ease-in-out infinite;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(0.8); }
                }
                .hr-rate-alert__text {
                    font-family: var(--font-dm-sans, 'DM Sans', sans-serif);
                    font-size: 13px;
                    color: var(--text-weak, #6b7a99);
                    line-height: 1.5;
                }
                .hr-rate-alert__text strong {
                    color: var(--text, #f0f4ff);
                    font-weight: 500;
                }

                /* ── Hero (headline + live rate badge) ── */
                .hr-hero {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 16px;
                    margin-bottom: 20px;
                }
                .hr-hero__text {
                    flex: 1;
                    min-width: 0;
                }
                .hr-headline__title {
                    font-size: clamp(1.75rem, 4.5vw, 2.4rem);
                    font-weight: 800;
                    font-family: var(--font-syne, 'Syne', sans-serif);
                    color: var(--text, #f0f4ff);
                    line-height: 1.1;
                    letter-spacing: -0.03em;
                    margin: 0 0 10px;
                }
                .hr-headline__sub {
                    font-size: 0.875rem;
                    font-family: var(--font-dm-sans, 'DM Sans', sans-serif);
                    color: var(--text-weak, #6b7a99);
                    line-height: 1.5;
                    margin: 0;
                    letter-spacing: 0.01em;
                }
                .hr-headline__br--mobile { display: none; }
                @media (max-width: 480px) {
                    .hr-headline__br--mobile { display: block; }
                }

                /* ── Scenario section label ── */
                .hr-scenarios-label {
                    font-family: var(--font-dm-mono, 'DM Mono', monospace);
                    font-size: 10px;
                    font-weight: 500;
                    color: var(--text-dim, #3a4560);
                    letter-spacing: 0.16em;
                    text-transform: uppercase;
                    margin-bottom: 16px;
                }

                /* ── Scenario cards — matches lp-card exactly ── */
                .hr-scenarios-wrap { margin-bottom: 20px; }
                .hr-scenarios {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 14px;
                }
                @media (min-width: 640px) {
                    .hr-scenarios { grid-template-columns: repeat(3, 1fr); }
                }
                .hr-scenario {
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
                    animation: scenarioIn 0.4s ease forwards;
                }
                .hr-scenario::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0;
                    height: 2px;
                    background: var(--scenario-accent, #00e87a);
                    opacity: 0;
                    transition: opacity 0.2s;
                }
                @keyframes scenarioIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .hr-scenario:hover {
                    border-color: var(--border-bright, rgba(255,255,255,0.13));
                    box-shadow: 0 12px 40px rgba(0,0,0,0.3);
                    transform: translateY(-2px);
                }
                .hr-scenario:hover::before { opacity: 1; }
                .hr-scenario:active { transform: translateY(0); }
                .hr-scenario__icon {
                    font-size: 22px;
                    margin-bottom: 14px;
                    display: block;
                    line-height: 1;
                }
                .hr-scenario__label {
                    font-family: var(--font-syne, 'Syne', sans-serif);
                    font-size: 15px;
                    font-weight: 600;
                    color: var(--text, #f0f4ff);
                    margin-bottom: 6px;
                    line-height: 1.2;
                }
                .hr-scenario__line1 {
                    font-size: 12px;
                    font-weight: 500;
                    color: var(--scenario-accent, #00e87a);
                    line-height: 1.4;
                    margin-bottom: 6px;
                }
                .hr-scenario__line2 {
                    font-size: 12px;
                    color: var(--text-weak, #6b7a99);
                    line-height: 1.5;
                }

                /* ── Quick chips (horizontal scroll on mobile, wrap on desktop) ── */
                .hr-quick {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .hr-quick__label {
                    font-size: 11px;
                    font-weight: 600;
                    color: var(--text-weak, #94a3b8);
                    text-transform: uppercase;
                    letter-spacing: 0.07em;
                }
                .hr-quick__chips {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }
                .hr-chip {
                    padding: 8px 16px;
                    background: var(--card, #ffffff);
                    border: 1px solid var(--border, #e2e8f0);
                    border-radius: 99px;
                    font-size: 0.82rem;
                    font-weight: 500;
                    color: var(--text, #1e293b);
                    cursor: pointer;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
                    transition: border-color 0.15s, background 0.15s, color 0.15s, box-shadow 0.15s;
                    white-space: nowrap;
                    opacity: 0;
                    animation: chipIn 0.35s ease forwards;
                }
                @keyframes chipIn {
                    from { opacity: 0; transform: translateY(4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .hr-chip:hover {
                    border-color: var(--accent, #00e87a);
                    background: rgba(0, 232, 122, 0.07);
                    color: var(--accent, #00e87a);
                    box-shadow: 0 2px 8px rgba(0, 232, 122, 0.1);
                }
                .hr-chip--price-check {
                    border-color: rgba(96, 165, 250, 0.25);
                    background: rgba(96, 165, 250, 0.05);
                    color: rgba(147, 197, 253, 0.9);
                    font-weight: 600;
                }
                .hr-chip--price-check:hover {
                    border-color: rgba(96, 165, 250, 0.5);
                    background: rgba(96, 165, 250, 0.1);
                    color: rgb(147, 197, 253);
                    box-shadow: 0 2px 8px rgba(96, 165, 250, 0.12);
                }

                /* ── Property Lookup (matches landing page lp-prop-* exactly) ── */
                .hr-price-check {
                    width: 100%;
                    margin-bottom: 20px;
                    opacity: 0;
                    animation: chipIn 0.4s ease 80ms forwards;
                    box-sizing: border-box;
                }
                .hr-price-check__label {
                    font-family: var(--font-dm-mono, 'DM Mono', monospace);
                    font-size: 9px;
                    font-weight: 500;
                    color: var(--text-dim, #3a4560);
                    letter-spacing: 0.16em;
                    text-transform: uppercase;
                    margin-bottom: 10px;
                }
                .hr-price-check__bar {
                    display: flex;
                    align-items: center;
                    background: var(--surface2, #141b28);
                    border: 1px solid var(--border-bright, rgba(255,255,255,0.13));
                    border-radius: 12px;
                    padding: 4px 4px 4px 16px;
                    gap: 12px;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }
                .hr-price-check__bar:focus-within {
                    border-color: rgba(61, 139, 255, 0.4);
                    box-shadow: 0 0 0 4px rgba(61, 139, 255, 0.1);
                }
                .hr-price-check__icon {
                    color: var(--text-dim, #3a4560);
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                }
                .hr-price-check__form {
                    display: flex;
                    align-items: center;
                    flex: 1;
                    min-width: 0;
                }
                .hr-price-check__input {
                    flex: 1;
                    min-width: 0;
                    padding: 13px 0;
                    border: none;
                    background: transparent;
                    font-family: var(--font-dm-sans, 'DM Sans', sans-serif);
                    font-size: 14px;
                    color: var(--text, #f0f4ff);
                    outline: none;
                }
                .hr-price-check__input::placeholder {
                    color: var(--text-dim, #3a4560);
                }
                .hr-price-check__go {
                    flex-shrink: 0;
                    font-family: var(--font-dm-sans, 'DM Sans', sans-serif);
                    font-size: 12px;
                    font-weight: 500;
                    color: rgba(61, 139, 255, 0.9);
                    background: rgba(61, 139, 255, 0.1);
                    border: 1px solid rgba(61, 139, 255, 0.2);
                    border-radius: 8px;
                    padding: 9px 16px;
                    cursor: pointer;
                    white-space: nowrap;
                    transition: background 0.15s, border-color 0.15s;
                }
                .hr-price-check__go:hover {
                    background: rgba(61, 139, 255, 0.18);
                    border-color: rgba(61, 139, 255, 0.4);
                }
                .hr-price-check__hint {
                    font-family: var(--font-dm-mono, 'DM Mono', monospace);
                    font-size: 10px;
                    color: var(--text-dim, #3a4560);
                    letter-spacing: 0.06em;
                    margin-top: 8px;
                }
            `}</style>
        </div>
    );
}
