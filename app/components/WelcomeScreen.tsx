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

// Fallback values shown while the live fetch is in-flight
const TICKER_FALLBACK = [
    { label: '30Y FIXED', value: '—', sub: 'loading…' },
    { label: '10Y TREASURY', value: '—', sub: 'loading…' },
    { label: 'SPREAD', value: '—', sub: 'mtg vs T10' },
    { label: 'FED FUNDS', value: '—', sub: 'effective rate' },
];

interface WelcomeScreenProps {
    onSend: (seed: string) => void;
    onMount?: () => void;
    onPriceCheck?: () => void;
}

export default function WelcomeScreen({ onSend, onMount, onPriceCheck }: WelcomeScreenProps) {
    const [visible, setVisible] = useState(false);
    const [tickerItems, setTickerItems] = useState(TICKER_FALLBACK);
    const [pcUrl, setPcUrl] = useState('');
    // Hero rate — pulled from ticker once loaded
    const [heroRate, setHeroRate] = useState<string | null>(null);
    const [heroSub, setHeroSub] = useState<string | null>(null);

    function submitPriceCheck() {
        const url = pcUrl.trim();
        if (!url) return;
        setPcUrl('');
        onSend(url);
    }

    // Fetch live FRED ticker data
    useEffect(() => {
        let cancelled = false;
        fetch('/api/ticker', { cache: 'no-store' })
            .then((r) => r.json())
            .then((json) => {
                if (!cancelled && json?.ok && Array.isArray(json.items)) {
                    setTickerItems(json.items);
                    // Pull 30Y fixed for the hero
                    const thirtyY = json.items.find((it: any) =>
                        it.label?.includes('30Y') || it.label?.includes('30-Year')
                    );
                    if (thirtyY && thirtyY.value !== '—') {
                        setHeroRate(thirtyY.value);
                        setHeroSub(thirtyY.sub ?? 'today\'s rate');
                    }
                }
            })
            .catch(() => { /* keep fallback values */ });
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

            {/* ── Rate ticker ── */}
            <div className="hr-ticker">
                <div className="hr-ticker__track">
                    {[...tickerItems, ...tickerItems].map((item, i) => (
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

            {/* ── Headline + hero rate ── */}
            <div className="hr-hero">
                <div className="hr-hero__text">
                    <h1 className="hr-headline__title">
                        What's your<br className="hr-headline__br--mobile" /> mortgage question?
                    </h1>
                    <p className="hr-headline__sub">
                        Real math · Live rates · No sales pitch
                    </p>
                </div>
                {heroRate && (
                    <div className="hr-hero__rate" onClick={() => onSend('What is today\'s 30-year fixed mortgage rate and what does it mean for a $400,000 loan?')}>
                        <span className="hr-hero__rate-value">{heroRate}</span>
                        <span className="hr-hero__rate-label">30Y Fixed</span>
                        <span className="hr-hero__rate-sub">{heroSub}</span>
                    </div>
                )}
            </div>

            {/* ── Price Check featured entry — inline paste input ── */}
            <div className="hr-price-check">
                <span className="hr-price-check__icon">🔎</span>
                <span className="hr-price-check__body">
                    <span className="hr-price-check__label">Price Check</span>
                    <form
                        className="hr-price-check__form"
                        onSubmit={(e) => { e.preventDefault(); submitPriceCheck(); }}
                    >
                        <input
                            className="hr-price-check__input"
                            type="url"
                            placeholder="Paste a Zillow or Redfin listing URL…"
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
                        {pcUrl && (
                            <button className="hr-price-check__go" type="submit" aria-label="Go">→</button>
                        )}
                    </form>
                </span>
            </div>

            {/* ── Scenario preview cards (horizontal scroll) ── */}
            <div className="hr-scenarios-wrap">
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
                    padding: 0 8px 32px;
                    max-width: 720px;
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
                    background: var(--surface, #f0f4f8);
                    border: 1px solid var(--border, #e2e8f0);
                    border-radius: 10px;
                    padding: 10px 0 10px 14px;
                    margin-bottom: 20px;
                    overflow: hidden;
                    gap: 0;
                    -webkit-mask-image: linear-gradient(to right, transparent 0%, black 5%, black 80%, transparent 100%);
                    mask-image: linear-gradient(to right, transparent 0%, black 5%, black 80%, transparent 100%);
                }
                .hr-ticker__track {
                    display: flex;
                    align-items: center;
                    flex: 1;
                    min-width: 0;
                    animation: tickerScroll 28s linear infinite;
                }
                .hr-ticker__track:hover { animation-play-state: paused; }
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
                    border-right: 1px solid var(--border, #e2e8f0);
                    min-width: max-content;
                    flex-shrink: 0;
                }
                .hr-ticker__label {
                    font-size: 9px;
                    font-weight: 700;
                    letter-spacing: 0.08em;
                    color: var(--text-weak, #94a3b8);
                    text-transform: uppercase;
                    margin-bottom: 2px;
                }
                .hr-ticker__value {
                    font-size: 15px;
                    font-weight: 700;
                    color: var(--text, #0f172a);
                    font-variant-numeric: tabular-nums;
                    letter-spacing: -0.01em;
                }
                .hr-ticker__sub {
                    font-size: 10px;
                    color: var(--text-weak, #94a3b8);
                    margin-top: 1px;
                }
                .hr-ticker__live {
                    margin-left: auto;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 10px;
                    font-weight: 600;
                    color: var(--accent, #00e87a);
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    white-space: nowrap;
                    padding-left: 16px;
                    padding-right: 14px;
                }
                .hr-ticker__dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: var(--accent, #00e87a);
                    animation: pulse 2s ease-in-out infinite;
                    flex-shrink: 0;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(0.8); }
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
                    font-size: clamp(1.55rem, 4vw, 2.1rem);
                    font-weight: 800;
                    color: var(--text, #0f172a);
                    line-height: 1.15;
                    letter-spacing: -0.03em;
                    margin: 0 0 8px;
                }
                .hr-headline__sub {
                    font-size: 0.9rem;
                    color: var(--text-weak, #64748b);
                    line-height: 1.5;
                    margin: 0;
                    letter-spacing: 0.01em;
                }
                .hr-headline__br--mobile { display: none; }
                @media (max-width: 480px) {
                    .hr-headline__br--mobile { display: block; }
                }
                /* Hero rate badge */
                .hr-hero__rate {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    padding: 12px 18px;
                    background: rgba(0, 232, 122, 0.06);
                    border: 1.5px solid rgba(0, 232, 122, 0.28);
                    border-radius: 14px;
                    cursor: pointer;
                    transition: transform 0.12s, box-shadow 0.15s;
                    min-width: 90px;
                    box-shadow: 0 2px 12px rgba(0, 232, 122, 0.08);
                    text-align: center;
                    animation: fadeSlideIn 0.5s ease 0.2s both;
                }
                .hr-hero__rate:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(0, 232, 122, 0.15);
                    background: rgba(0, 232, 122, 0.09);
                }
                .hr-hero__rate-value {
                    font-size: 1.55rem;
                    font-weight: 800;
                    color: var(--accent, #00e87a);
                    font-variant-numeric: tabular-nums;
                    letter-spacing: -0.03em;
                    line-height: 1;
                }
                .hr-hero__rate-label {
                    font-size: 10px;
                    font-weight: 700;
                    color: var(--accent, #00e87a);
                    opacity: 0.75;
                    text-transform: uppercase;
                    letter-spacing: 0.07em;
                    margin-top: 5px;
                }
                .hr-hero__rate-sub {
                    font-size: 10px;
                    color: var(--text-weak, #6b7a99);
                    margin-top: 2px;
                    white-space: nowrap;
                }
                @keyframes fadeSlideIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                /* ── Scenario preview cards (2-col on mobile, 3-col on desktop) ── */
                .hr-scenarios-wrap {
                    margin-bottom: 20px;
                }
                .hr-scenarios {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                }
                @media (min-width: 640px) {
                    .hr-scenarios {
                        grid-template-columns: repeat(3, 1fr);
                    }
                }
                .hr-scenario {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    padding: 12px 14px 14px;
                    background: var(--card, #ffffff);
                    border: 1.5px solid var(--border, #e2e8f0);
                    border-top: 3px solid var(--scenario-accent, #e2e8f0);
                    border-radius: 14px;
                    cursor: pointer;
                    text-align: left;
                    transition: border-color 0.15s, box-shadow 0.15s, transform 0.12s, background 0.15s;
                    opacity: 0;
                    animation: scenarioIn 0.4s ease forwards;
                }
                @keyframes scenarioIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .hr-scenario:hover {
                    border-color: var(--scenario-accent, #e2e8f0);
                    border-top-color: var(--scenario-accent, #e2e8f0);
                    box-shadow: 0 4px 18px color-mix(in srgb, var(--scenario-accent, #10b981) 18%, transparent);
                    transform: translateY(-2px);
                    background: var(--surface, #f8fafc);
                }
                .hr-scenario:active { transform: translateY(0); }
                .hr-scenario__icon {
                    font-size: 1.5rem;
                    margin-bottom: 8px;
                    line-height: 1;
                }
                .hr-scenario__label {
                    font-size: 0.84rem;
                    font-weight: 700;
                    color: var(--text, #0f172a);
                    margin-bottom: 6px;
                    line-height: 1.2;
                }
                .hr-scenario__line1 {
                    font-size: 0.78rem;
                    font-weight: 600;
                    color: var(--scenario-accent, #10b981);
                    line-height: 1.4;
                    margin-bottom: 2px;
                }
                .hr-scenario__line2 {
                    font-size: 0.72rem;
                    color: var(--text-weak, #94a3b8);
                    line-height: 1.4;
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

                /* ── Price Check featured banner ── */
                .hr-price-check {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    width: 100%;
                    padding: 14px 18px;
                    margin-bottom: 20px;
                    background: rgba(96, 165, 250, 0.04);
                    border: 1.5px solid rgba(96, 165, 250, 0.15);
                    border-radius: 14px;
                    text-align: left;
                    box-shadow: 0 2px 8px rgba(96, 165, 250, 0.06);
                    opacity: 0;
                    animation: chipIn 0.4s ease 80ms forwards;
                    box-sizing: border-box;
                }
                .hr-price-check__icon {
                    font-size: 26px;
                    flex-shrink: 0;
                }
                .hr-price-check__body {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    flex: 1;
                    min-width: 0;
                }
                .hr-price-check__label {
                    font-size: 14px;
                    font-weight: 700;
                    color: rgba(147, 197, 253, 0.9);
                    letter-spacing: -0.01em;
                }
                .hr-price-check__form {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .hr-price-check__input {
                    flex: 1;
                    min-width: 0;
                    padding: 8px 12px;
                    border: 1.5px solid rgba(96, 165, 250, 0.2);
                    border-radius: 8px;
                    font-size: 13px;
                    font-family: inherit;
                    color: var(--text, #f0f4ff);
                    background: var(--card, #0e1420);
                    outline: none;
                    transition: border-color 0.15s, box-shadow 0.15s;
                }
                .hr-price-check__input:focus {
                    border-color: rgba(96, 165, 250, 0.5);
                    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.08);
                }
                .hr-price-check__input::placeholder { color: var(--text-dim, #3a4560); }
                .hr-price-check__go {
                    flex-shrink: 0;
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    border: none;
                    background: rgba(96, 165, 250, 0.2);
                    color: rgba(147, 197, 253, 0.95);
                    font-size: 16px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.15s;
                }
                .hr-price-check__go:hover { background: rgba(96, 165, 250, 0.32); }
            `}</style>
        </div>
    );
}
