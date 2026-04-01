'use client';

// app/components/RefiSliderCard.tsx
// Refi analyzer — dual-rate sliders, break-even hero, payment comparison bar
// Hero: Monthly Savings | Break-Even | 5-yr Net
// Visual: old vs new payment bars + lifetime interest delta

import React, { useState, useMemo } from 'react';
import PdfDownloadButton from './PdfDownloadButton';

export interface RefiSliderParams {
    balance: number;           // current loan balance
    currentRate: number;       // current rate %
    newRate: number;           // new rate %
    termMonths: number;        // new loan term in months (default 360)
    closingCosts: number;      // closing costs $
    propertyValue?: number;    // known property value — enables LTV slider
    onRunScenario?: (seed: string, params?: Record<string, number>) => void;
}

// ── Loan tier detection (FHFA 2026 limits) ───────────────────────────────────
const CONFORMING_LIMIT  = 832_750;   // 2026 national baseline (FHFA CY2026)
const HIGH_COST_LIMIT   = 1_249_125; // 2026 high-balance ceiling (1-unit)

function loanTier(balance: number): 'conforming' | 'high_cost' | 'jumbo' | 'super_jumbo' {
    if (balance <= CONFORMING_LIMIT)  return 'conforming';
    if (balance <= HIGH_COST_LIMIT)   return 'high_cost';
    if (balance <= 3_000_000)         return 'jumbo';
    return 'super_jumbo';
}

const TIER_LABEL: Record<string, string> = {
    conforming:  'Conforming',
    high_cost:   'High-Cost Conforming',
    jumbo:       'Jumbo',
    super_jumbo: 'Super-Jumbo',
};

const TIER_COLOR: Record<string, { text: string; bg: string; border: string }> = {
    conforming:  { text: '#059669', bg: 'rgba(5,150,105,0.08)',  border: 'rgba(5,150,105,0.25)'  },
    high_cost:   { text: '#0ea5e9', bg: 'rgba(14,165,233,0.08)', border: 'rgba(14,165,233,0.25)' },
    jumbo:       { text: '#7c3aed', bg: 'rgba(124,58,237,0.08)', border: 'rgba(124,58,237,0.25)' },
    super_jumbo: { text: '#dc2626', bg: 'rgba(220,38,38,0.08)',  border: 'rgba(220,38,38,0.25)'  },
};

// Jumbo refis typically price 0.25–0.5% above conforming
const TIER_RATE_PREMIUM: Record<string, number> = {
    conforming: 0, high_cost: 0.125, jumbo: 0.375, super_jumbo: 0.5,
};

// ── Math helpers ──────────────────────────────────────────────────────────────
function calcPI(principal: number, annualRatePct: number, termMonths: number): number {
    if (annualRatePct === 0) return principal / termMonths;
    const r = annualRatePct / 100 / 12;
    return principal * r * Math.pow(1 + r, termMonths) / (Math.pow(1 + r, termMonths) - 1);
}

function fmt$(n: number) { return `$${Math.round(Math.abs(n)).toLocaleString()}`; }
function fmtRate(r: number) { return `${r.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%`; }

function trackStyle(val: number, min: number, max: number, color = '#10b981') {
    const pct = ((val - min) / (max - min)) * 100;
    return { background: `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, #e2e8f0 ${pct}%, #e2e8f0 100%)` } as React.CSSProperties;
}

function beColor(months: number | null): { text: string; bg: string; border: string } {
    if (months === null) return { text: '#dc2626', bg: '#fef2f2', border: '#fca5a5' };
    if (months === 0)    return { text: '#065f46', bg: '#f0fdf4', border: '#bbf7d0' };
    if (months <= 24)    return { text: '#059669', bg: '#f0fdf4', border: '#6ee7b7' };
    if (months <= 48)    return { text: '#d97706', bg: '#fffbeb', border: '#fcd34d' };
    return                      { text: '#dc2626', bg: '#fef2f2', border: '#fca5a5' };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function RefiSliderCard(props: RefiSliderParams) {
    const propVal                         = props.propertyValue ?? null;
    const initLtv                         = propVal ? Math.round((props.balance / propVal) * 100) : 80;
    const [ltv, setLtv]                   = useState(Math.min(97, Math.max(50, initLtv)));
    const [balance, setBalance]           = useState(props.balance);
    const [currentRate, setCurrentRate]   = useState(props.currentRate);
    const [newRate, setNewRate]           = useState(props.newRate);
    const [termMonths, setTermMonths]     = useState(props.termMonths ?? 360);
    const [closingCosts, setClosingCosts] = useState(props.closingCosts);
    const [closingInput, setClosingInput] = useState('');   // manual text input
    const [noCost, setNoCost]             = useState(false);

    // When LTV changes and property value is known, drive balance from LTV
    function handleLtvChange(newLtv: number) {
        setLtv(newLtv);
        if (propVal) setBalance(Math.round(propVal * newLtv / 100));
    }

    // Dynamic slider ranges
    const balanceMax    = Math.max(4_000_000, Math.ceil(balance * 1.5 / 500_000) * 500_000);
    const closingMax    = Math.max(30_000, Math.ceil(balance * 0.04 / 1_000) * 1_000);
    const tier          = loanTier(balance);
    const tierStyle     = TIER_COLOR[tier];
    const ratePremium   = TIER_RATE_PREMIUM[tier];

    // No-cost toggle: +0.25% to new rate, $0 closing costs
    const effNewRate  = noCost ? parseFloat((newRate + 0.25).toFixed(3)) : newRate;
    const effClosing  = noCost ? 0 : closingCosts;
    const termYears   = Math.round(termMonths / 12);

    const calc = useMemo(() => {
        // Assume current loan was originally 30yr for remaining interest calc
        const oldPI       = calcPI(balance, currentRate, 360);
        const newPI       = calcPI(balance, effNewRate, termMonths);
        const savings     = oldPI - newPI;

        const breakEvenMo: number | null =
            savings > 0 && effClosing > 0 ? Math.ceil(effClosing / savings) :
            savings > 0 ? 0 :
            null;

        const net5yr  = Math.round(savings * 60  - effClosing);
        const net10yr = Math.round(savings * 120 - effClosing);

        const oldTotalInt = Math.round(oldPI * 360 - balance);
        const newTotalInt = Math.round(newPI * termMonths - balance);
        const intSaved    = oldTotalInt - newTotalInt;

        // 20yr alternative at effNewRate
        const pi20yr    = calcPI(balance, effNewRate, 240);
        const int20yr   = Math.round(pi20yr * 240 - balance);
        const int20saved = newTotalInt - int20yr; // savings vs new 30yr

        return {
            oldPI:      Math.round(oldPI),
            newPI:      Math.round(newPI),
            savings:    Math.round(savings),
            breakEvenMo,
            net5yr,
            net10yr,
            oldTotalInt,
            newTotalInt,
            intSaved,
            pi20yr:     Math.round(pi20yr),
            int20yr,
            int20saved,
        };
    }, [balance, currentRate, effNewRate, termMonths, effClosing]);

    const isDirty =
        balance !== props.balance ||
        currentRate !== props.currentRate ||
        newRate !== props.newRate ||
        termMonths !== (props.termMonths ?? 360) ||
        closingCosts !== props.closingCosts ||
        noCost;

    function fmtBal(n: number) {
        if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
        return `$${Math.round(n / 1000)}k`;
    }

    function buildSeed() {
        // Cost string must come AFTER "closing costs" keyword so dispatcher regex matches
        const costStr = effClosing > 0
            ? `, closing costs $${Math.round(effClosing / 500) * 500}`
            : ', no closing costs';
        return `Refi ${fmtBal(balance)} balance from ${currentRate.toFixed(2)}% to ${effNewRate.toFixed(2)}% — ${termYears}yr fixed${costStr}`;
    }

    function buildParams(): Record<string, number> {
        return {
            currentBalance: balance,
            currentRatePct: currentRate,
            newRatePct:     effNewRate,
            closingCosts:   effClosing,
        };
    }

    const beC       = beColor(calc.breakEvenMo);
    const beLabel   = calc.breakEvenMo === null ? 'No savings'
                    : calc.breakEvenMo === 0    ? 'Immediate'
                    : `${calc.breakEvenMo} mo`;
    const rateDrop  = parseFloat((currentRate - effNewRate).toFixed(3));
    const maxBarPmt = Math.max(calc.oldPI, calc.newPI) * 1.08;

    return (
        <div style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16,
            padding: '20px 20px 16px', marginTop: 12, width: '100%', boxSizing: 'border-box',
            fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tier !== 'conforming' ? 8 : 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>
                    Refi Explorer
                </div>
                <button
                    onClick={() => setNoCost(v => !v)}
                    style={{
                        fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                        border: `1px solid ${noCost ? '#059669' : '#cbd5e1'}`,
                        background: noCost ? '#f0fdf4' : '#f8fafc',
                        color: noCost ? '#059669' : '#64748b',
                        cursor: 'pointer',
                    }}
                >
                    {noCost ? '✓ No-Cost Refi' : 'No-Cost Refi'}
                </button>
            </div>

            {/* ── Loan tier badge ── */}
            {tier !== 'conforming' && (
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 6, marginBottom: 14,
                    background: tierStyle.bg, border: `1px solid ${tierStyle.border}`,
                    fontSize: 11, fontWeight: 700, color: tierStyle.text,
                }}>
                    {TIER_LABEL[tier]}
                    {ratePremium > 0 && (
                        <span style={{ fontWeight: 500, opacity: 0.85 }}>
                            · rates typically +{ratePremium.toFixed(3).replace(/0+$/, '')}% vs conforming
                        </span>
                    )}
                </div>
            )}

            {/* ── Hero: 3 big numbers ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
                {/* Monthly savings */}
                <div style={{
                    background: calc.savings >= 0 ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${calc.savings >= 0 ? '#6ee7b7' : '#fca5a5'}`,
                    borderRadius: 10, padding: '10px 12px', textAlign: 'center',
                }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: calc.savings >= 0 ? '#059669' : '#dc2626', letterSpacing: '-0.03em' }}>
                        {calc.savings >= 0 ? '+' : '−'}{fmt$(calc.savings)}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, fontWeight: 500 }}>Monthly savings</div>
                </div>

                {/* Break-even */}
                <div style={{
                    background: beC.bg, border: `1px solid ${beC.border}`,
                    borderRadius: 10, padding: '10px 12px', textAlign: 'center',
                }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: beC.text, letterSpacing: '-0.03em' }}>
                        {beLabel}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, fontWeight: 500 }}>Break-even</div>
                </div>

                {/* 5-yr net */}
                <div style={{
                    background: calc.net5yr >= 0 ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${calc.net5yr >= 0 ? '#6ee7b7' : '#fca5a5'}`,
                    borderRadius: 10, padding: '10px 12px', textAlign: 'center',
                }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: calc.net5yr >= 0 ? '#059669' : '#dc2626', letterSpacing: '-0.03em' }}>
                        {calc.net5yr >= 0 ? '+' : '−'}{fmt$(calc.net5yr)}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, fontWeight: 500 }}>5-yr net</div>
                </div>
            </div>

            {/* ── Payment comparison bars ── */}
            <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    P&amp;I Payment
                </div>
                {[
                    { label: 'Now', val: calc.oldPI, color: '#64748b' },
                    { label: 'New', val: calc.newPI, color: calc.savings >= 0 ? '#10b981' : '#ef4444' },
                ].map(({ label, val, color }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <div style={{ fontSize: 11, color: '#94a3b8', width: 28, textAlign: 'right' }}>{label}</div>
                        <div style={{ flex: 1, height: 22, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{
                                height: '100%',
                                width: `${(val / maxBarPmt) * 100}%`,
                                background: color,
                                borderRadius: 4,
                                transition: 'width 0.2s ease',
                            }} />
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', width: 72, textAlign: 'right' }}>
                            {fmt$(val)}/mo
                        </div>
                    </div>
                ))}
                {calc.savings !== 0 && (
                    <div style={{ textAlign: 'right', fontSize: 11, color: calc.savings > 0 ? '#059669' : '#dc2626', fontWeight: 600, marginTop: -2 }}>
                        {calc.savings > 0 ? `↓ saves ${fmt$(calc.savings)}/mo` : `↑ costs ${fmt$(Math.abs(calc.savings))}/mo more`}
                    </div>
                )}
            </div>

            {/* ── Sliders ── */}

            {/* Balance */}
            <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Loan Balance</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{fmt$(balance)}</span>
                </div>
                <input type="range" min={50_000} max={balanceMax} step={balance >= 1_000_000 ? 25_000 : 5_000} value={balance}
                    onChange={e => setBalance(Number(e.target.value))}
                    style={{ width: '100%', ...trackStyle(balance, 50_000, balanceMax) }}
                />
            </div>

            {/* Dual rate sliders */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 28px 1fr', gap: '0 8px', marginBottom: 14, alignItems: 'end' }}>
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Current Rate</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444' }}>{fmtRate(currentRate)}</span>
                    </div>
                    <input type="range" min={3} max={12} step={0.125} value={currentRate}
                        onChange={e => setCurrentRate(Number(e.target.value))}
                        style={{ width: '100%', ...trackStyle(currentRate, 3, 12, '#ef4444') }}
                    />
                </div>
                <div style={{ textAlign: 'center', paddingBottom: 6, fontSize: 14, color: '#cbd5e1', fontWeight: 700 }}>→</div>
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                            New Rate{noCost ? ' +0.25%' : ''}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>{fmtRate(effNewRate)}</span>
                    </div>
                    <input type="range" min={3} max={12} step={0.125} value={newRate}
                        onChange={e => setNewRate(Number(e.target.value))}
                        disabled={noCost}
                        style={{
                            width: '100%', opacity: noCost ? 0.45 : 1,
                            ...trackStyle(newRate, 3, 12, '#10b981'),
                        }}
                    />
                </div>
            </div>

            {/* Closing costs + LTV — side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: propVal ? '1fr 1fr' : '1fr', gap: '0 16px', marginBottom: 14 }}>
                {/* Closing costs */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Closing Costs</span>
                        {!noCost ? (
                            <input
                                type="text"
                                inputMode="numeric"
                                value={closingInput !== '' ? closingInput : fmt$(closingCosts)}
                                onFocus={() => setClosingInput(String(closingCosts))}
                                onBlur={() => setClosingInput('')}
                                onChange={e => {
                                    const raw = e.target.value;
                                    setClosingInput(raw);
                                    const n = parseInt(raw.replace(/[^0-9]/g, ''));
                                    if (!isNaN(n) && n >= 0) setClosingCosts(Math.min(n, 999_999));
                                }}
                                style={{
                                    width: 80, fontSize: 12, fontWeight: 700,
                                    padding: '2px 6px', borderRadius: 5, textAlign: 'right',
                                    border: '1px solid #cbd5e1', background: '#f8fafc',
                                    color: '#0f172a', outline: 'none',
                                }}
                            />
                        ) : (
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>$0</span>
                        )}
                    </div>
                    <input type="range" min={0} max={closingMax} step={500} value={closingCosts}
                        onChange={e => { setClosingCosts(Number(e.target.value)); setClosingInput(''); }}
                        disabled={noCost}
                        style={{ width: '100%', opacity: noCost ? 0.4 : 1, ...trackStyle(closingCosts, 0, closingMax) }}
                    />
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, textAlign: 'center' }}>
                        1% ≈ no-cost · type to enter exact
                    </div>
                </div>

                {/* LTV slider — only when property value is known */}
                {propVal && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>LTV</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: ltv > 80 ? '#ef4444' : '#0f172a' }}>{ltv}%</span>
                        </div>
                        <input type="range" min={50} max={97} step={1} value={ltv}
                            onChange={e => handleLtvChange(Number(e.target.value))}
                            style={{ width: '100%', ...trackStyle(ltv, 50, 97, ltv > 80 ? '#ef4444' : '#10b981') }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                            <span>50%</span>
                            <span style={{ color: ltv <= 80 ? '#059669' : '#94a3b8' }}>80% = no PMI</span>
                            <span>97%</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Term toggle */}
            <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>New Term</div>
                <div style={{ display: 'flex', gap: 6 }}>
                    {[15, 20, 30].map(yr => (
                        <button key={yr}
                            onClick={() => setTermMonths(yr * 12)}
                            style={{
                                flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                cursor: 'pointer',
                                border: termYears === yr ? '2px solid #10b981' : '2px solid #e2e8f0',
                                background: termYears === yr ? '#f0fdf4' : '#f8fafc',
                                color: termYears === yr ? '#059669' : '#64748b',
                            }}
                        >{yr}yr</button>
                    ))}
                </div>
            </div>

            {/* ── Interest savings panel ── */}
            <div style={{
                background: '#f8fafc', borderRadius: 10, padding: '10px 14px',
                marginBottom: 12, fontSize: 12,
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ color: '#64748b' }}>Remaining interest (current loan)</span>
                    <span style={{ fontWeight: 700, color: '#ef4444' }}>{fmt$(calc.oldTotalInt)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ color: '#64748b' }}>Total interest (new {termYears}yr loan)</span>
                    <span style={{ fontWeight: 700, color: '#334155' }}>{fmt$(calc.newTotalInt)}</span>
                </div>
                {termYears === 30 && calc.int20saved > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ color: '#64748b' }}>20yr alt @ {fmtRate(effNewRate)} saves vs 30yr</span>
                        <span style={{ fontWeight: 700, color: '#0ea5e9' }}>+{fmt$(calc.int20saved)}</span>
                    </div>
                )}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 5, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#475569', fontWeight: 600 }}>
                        Lifetime interest {calc.intSaved >= 0 ? 'saved' : 'added'}
                    </span>
                    <span style={{ fontWeight: 800, color: calc.intSaved >= 0 ? '#059669' : '#dc2626' }}>
                        {calc.intSaved >= 0 ? '+' : '−'}{fmt$(calc.intSaved)}
                    </span>
                </div>
            </div>

            {/* ── Footer stats ── */}
            <div style={{
                display: 'flex', gap: 14, fontSize: 11, color: '#64748b',
                marginBottom: isDirty ? 12 : 0, flexWrap: 'wrap',
            }}>
                <span>Balance <strong style={{ color: '#334155' }}>{fmt$(balance)}</strong></span>
                <span>Rate drop <strong style={{ color: rateDrop > 0 ? '#059669' : '#dc2626' }}>
                    {rateDrop > 0 ? `↓` : `↑`}{Math.abs(rateDrop).toFixed(3)}%
                </strong></span>
                <span>Payoff <strong style={{ color: '#334155' }}>{termYears}yr</strong></span>
                {effClosing > 0 && (
                    <span>Closing <strong style={{ color: '#334155' }}>{fmt$(effClosing)}</strong></span>
                )}
                {tier !== 'conforming' && (
                    <span style={{ color: tierStyle.text, fontWeight: 600 }}>{TIER_LABEL[tier]}</span>
                )}
            </div>

            {/* ── Action row ── */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                {isDirty && props.onRunScenario && (
                    <button
                        onClick={() => props.onRunScenario!(buildSeed(), buildParams())}
                        style={{
                            flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                            background: '#0f172a', color: '#fff', fontSize: 13, fontWeight: 700,
                            cursor: 'pointer', letterSpacing: '-0.01em',
                        }}
                    >
                        Run adjusted scenario →
                    </button>
                )}
                <PdfDownloadButton
                    type="refi"
                    getParams={() => ({ balance, currentRate, newRate: effNewRate, termMonths, closingCosts: effClosing })}
                    style={isDirty && props.onRunScenario ? {} : { width: '100%', justifyContent: 'center' }}
                />
            </div>
        </div>
    );
}
