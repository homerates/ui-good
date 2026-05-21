'use client';

// app/components/RefiSliderCard.tsx
// Refi analyzer — dual-rate sliders, break-even hero, payment comparison bar
// Hero: Monthly Savings | Break-Even | 5-yr Net
// Visual: old vs new payment bars + lifetime interest delta

import React, { useState, useMemo } from 'react';
import PdfDownloadButton from './PdfDownloadButton';
import SliderField from './SliderField';

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
    conforming:  { text: '#00e87a', bg: 'rgba(0,232,122,0.08)',  border: 'rgba(0,232,122,0.25)'  },
    high_cost:   { text: '#3d8bff', bg: 'rgba(61,139,255,0.08)', border: 'rgba(61,139,255,0.25)' },
    jumbo:       { text: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.25)' },
    super_jumbo: { text: '#ff5f5f', bg: 'rgba(255,95,95,0.08)',  border: 'rgba(255,95,95,0.25)'  },
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
            background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
            padding: '20px 20px 16px', marginTop: 12, width: '100%', boxSizing: 'border-box',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            overflow: 'hidden', color: '#f0f4ff',
        }}>
        <style>{`
          .refi-hero-val{font-size:22px;font-weight:800;letter-spacing:-0.03em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
          @media(max-width:420px){.refi-hero-val{font-size:16px;}}
          .refi-rate-grid{display:grid;grid-template-columns:1fr 20px 1fr;gap:0 6px;align-items:end;}
          @media(max-width:420px){.refi-rate-grid{display:flex;flex-direction:column;gap:10px;}.refi-rate-arrow{display:none;}}
        `}</style>
            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tier !== 'conforming' ? 8 : 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f0f4ff', letterSpacing: '-0.01em' }}>
                    Refi Explorer
                </div>
                <button
                    onClick={() => setNoCost(v => !v)}
                    style={{
                        fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                        border: `1px solid ${noCost ? '#059669' : 'rgba(255,255,255,0.12)'}`,
                        background: noCost ? 'rgba(5,150,105,0.12)' : 'rgba(255,255,255,0.04)',
                        color: noCost ? '#059669' : '#94a3b8',
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
                    background: calc.savings >= 0 ? 'rgba(0,232,122,0.07)' : 'rgba(239,68,68,0.07)',
                    border: `1px solid ${calc.savings >= 0 ? 'rgba(0,232,122,0.2)' : 'rgba(239,68,68,0.2)'}`,
                    borderRadius: 10, padding: '10px 8px', textAlign: 'center', minWidth: 0, overflow: 'hidden',
                }}>
                    <div className="refi-hero-val" style={{ color: calc.savings >= 0 ? '#00e87a' : '#ef4444' }}>
                        {calc.savings >= 0 ? '+' : '−'}{fmt$(calc.savings)}
                    </div>
                    <div style={{ fontSize: 10, color: '#eaf8f7', marginTop: 2, fontWeight: 500 }}>Monthly savings</div>
                </div>

                {/* Break-even */}
                <div style={{
                    background: beC.bg, border: `1px solid ${beC.border}`,
                    borderRadius: 10, padding: '10px 8px', textAlign: 'center', minWidth: 0, overflow: 'hidden',
                }}>
                    <div className="refi-hero-val" style={{ color: beC.text }}>
                        {beLabel}
                    </div>
                    <div style={{ fontSize: 10, color: '#eaf8f7', marginTop: 2, fontWeight: 500 }}>Break-even</div>
                </div>

                {/* 5-yr net */}
                <div style={{
                    background: calc.net5yr >= 0 ? 'rgba(0,232,122,0.07)' : 'rgba(239,68,68,0.07)',
                    border: `1px solid ${calc.net5yr >= 0 ? 'rgba(0,232,122,0.2)' : 'rgba(239,68,68,0.2)'}`,
                    borderRadius: 10, padding: '10px 8px', textAlign: 'center', minWidth: 0, overflow: 'hidden',
                }}>
                    <div className="refi-hero-val" style={{ color: calc.net5yr >= 0 ? '#00e87a' : '#ef4444' }}>
                        {calc.net5yr >= 0 ? '+' : '−'}{fmt$(calc.net5yr)}
                    </div>
                    <div style={{ fontSize: 10, color: '#eaf8f7', marginTop: 2, fontWeight: 500 }}>5-yr net</div>
                </div>
            </div>

            {/* ── Payment comparison bars ── */}
            <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#eaf8f7', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    P&amp;I Payment
                </div>
                {[
                    { label: 'Now', val: calc.oldPI, color: '#94a3b8' },
                    { label: 'New', val: calc.newPI, color: calc.savings >= 0 ? '#10b981' : '#ef4444' },
                ].map(({ label, val, color }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <div style={{ fontSize: 11, color: '#94a3b8', width: 28, textAlign: 'right' }}>{label}</div>
                        <div style={{ flex: 1, height: 22, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{
                                height: '100%',
                                width: `${(val / maxBarPmt) * 100}%`,
                                background: color,
                                borderRadius: 4,
                                transition: 'width 0.2s ease',
                            }} />
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#f0f4ff', width: 72, textAlign: 'right' }}>
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
                <SliderField
                    label="Loan Balance" value={balance}
                    min={50_000} max={balanceMax} step={balance >= 1_000_000 ? 25_000 : 5_000}
                    onChange={setBalance}
                    format={fmt$}
                    trackColor="#10b981" theme="dark"
                />
            </div>

            {/* Dual rate sliders */}
            <div className="refi-rate-grid" style={{ marginBottom: 14 }}>
                <SliderField
                    label="Current Rate" value={currentRate}
                    min={3} max={12} step={0.125}
                    onChange={setCurrentRate}
                    format={fmtRate}
                    trackColor="#ef4444" theme="dark"
                    style={{ minWidth: 0 }}
                />
                <div className="refi-rate-arrow" style={{ textAlign: 'center', paddingBottom: 6, fontSize: 12, color: '#eaf8f7', fontWeight: 700 }}>→</div>
                <SliderField
                    label={`New Rate${noCost ? ' +0.25%' : ''}`} value={newRate}
                    min={3} max={12} step={0.125}
                    onChange={setNewRate}
                    format={fmtRate}
                    disabled={noCost}
                    trackColor="#059669" theme="dark"
                    style={{ minWidth: 0 }}
                />
            </div>

            {/* Closing costs + LTV — stack on mobile, side by side on wider screens */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 16px', marginBottom: 14 }}>
                {/* Closing costs */}
                <SliderField
                    label="Closing Costs" value={closingCosts}
                    min={0} max={closingMax} step={500}
                    onChange={v => { setClosingCosts(v); setClosingInput(''); }}
                    format={fmt$}
                    disabled={noCost}
                    midLabel="1% ≈ no-cost · click to type"
                    trackColor="#10b981" theme="dark"
                    style={{ flex: '1 1 200px', minWidth: 0 }}
                />

                {/* LTV slider — only when property value is known */}
                {propVal && (
                    <SliderField
                        label="LTV" value={ltv}
                        min={50} max={97} step={1}
                        onChange={handleLtvChange}
                        format={v => `${v}%`}
                        minLabel="50%" midLabel="80% = no PMI" maxLabel="97%"
                        trackColor={ltv > 80 ? '#ef4444' : '#10b981'} theme="dark"
                        style={{ flex: '1 1 200px', minWidth: 0 }}
                    />
                )}
            </div>

            {/* Term toggle */}
            <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#8fa3b8', marginBottom: 6 }}>New Term</div>
                <div style={{ display: 'flex', gap: 6 }}>
                    {[15, 20, 30].map(yr => (
                        <button key={yr}
                            onClick={() => setTermMonths(yr * 12)}
                            style={{
                                flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                cursor: 'pointer',
                                border: termYears === yr ? '2px solid #10b981' : '1.5px solid rgba(255,255,255,0.1)',
                                background: termYears === yr ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)',
                                color: termYears === yr ? '#10b981' : '#94a3b8',
                            }}
                        >{yr}yr</button>
                    ))}
                </div>
            </div>

            {/* ── Interest savings panel ── */}
            <div style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 14px',
                marginBottom: 12, fontSize: 12,
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ color: '#94a3b8' }}>Remaining interest (current loan)</span>
                    <span style={{ fontWeight: 700, color: '#ef4444' }}>{fmt$(calc.oldTotalInt)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ color: '#94a3b8' }}>Total interest (new {termYears}yr loan)</span>
                    <span style={{ fontWeight: 700, color: '#f0f4ff' }}>{fmt$(calc.newTotalInt)}</span>
                </div>
                {termYears === 30 && calc.int20saved > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ color: '#94a3b8' }}>20yr alt @ {fmtRate(effNewRate)} saves vs 30yr</span>
                        <span style={{ fontWeight: 700, color: '#0ea5e9' }}>+{fmt$(calc.int20saved)}</span>
                    </div>
                )}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 5, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8fa3b8', fontWeight: 600 }}>
                        Lifetime interest {calc.intSaved >= 0 ? 'saved' : 'added'}
                    </span>
                    <span style={{ fontWeight: 800, color: calc.intSaved >= 0 ? '#00e87a' : '#ef4444' }}>
                        {calc.intSaved >= 0 ? '+' : '−'}{fmt$(calc.intSaved)}
                    </span>
                </div>
            </div>

            {/* ── Footer stats ── */}
            <div style={{
                display: 'flex', gap: 14, fontSize: 11, color: '#94a3b8',
                marginBottom: isDirty ? 12 : 0, flexWrap: 'wrap',
            }}>
                <span>Balance <strong style={{ color: '#eaf8f7' }}>{fmt$(balance)}</strong></span>
                <span>Rate drop <strong style={{ color: rateDrop > 0 ? '#059669' : '#dc2626' }}>
                    {rateDrop > 0 ? `↓` : `↑`}{Math.abs(rateDrop).toFixed(3)}%
                </strong></span>
                <span>Payoff <strong style={{ color: '#f0f4ff' }}>{termYears}yr</strong></span>
                {effClosing > 0 && (
                    <span>Closing <strong style={{ color: '#f0f4ff' }}>{fmt$(effClosing)}</strong></span>
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
