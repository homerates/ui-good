'use client';

import React, { useState, useMemo } from 'react';
import AdminCardBadge from './AdminCardBadge';
import FredRateBadge from './FredRateBadge';
import { COLORS } from '../../lib/tokens';

// ── Math ──────────────────────────────────────────────────────────────────────

function calcPI(loan: number, annualRate: number, years: number): number {
    if (loan <= 0 || annualRate <= 0) return 0;
    const r = annualRate / 100 / 12, n = years * 12;
    return (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

interface ProgramCalc {
    maxPrice: number;
    loan: number; baseLoan: number; ufmip: number;
    down: number; ltv: number;
    pi: number; tax: number; ins: number; mip: number;
    piti: number; closing: number; cashNeeded: number;
    savingsOk: boolean; savingsLeft: number;
    limitCapped: boolean;
}

function calcProgram(
    income: number, debts: number, downPct: number,
    rate: number, term: number, taxRate: number, insRate: number,
    loanType: 'conventional' | 'fha', savings: number, loanLimit?: number,
): ProgramCalc | null {
    const budget = (income / 12) * 0.43 - debts;
    if (budget <= 50) return null;

    function pitiAt(p: number): number {
        const d = p * downPct / 100;
        const bl = p - d;
        const uf = loanType === 'fha' ? bl * 0.0175 : 0;
        const ln = bl + uf;
        const ltv = (bl / p) * 100;
        const tax = (p * taxRate) / 12;
        const ins = (p * insRate) / 12;
        let mip = 0;
        if (loanType === 'fha') mip = (ln * 0.0055) / 12;
        else if (ltv > 80) mip = (bl * 0.008) / 12;
        return calcPI(ln, rate, term) + tax + ins + mip;
    }

    let lo = 10_000, hi = 6_000_000;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (pitiAt(mid) < budget) lo = mid; else hi = mid;
    }
    let maxPrice = Math.floor((lo + hi) / 2 / 1_000) * 1_000;

    let limitCapped = false;
    if (loanLimit) {
        const capPrice = Math.floor(loanLimit / (1 - downPct / 100) / 1_000) * 1_000;
        if (capPrice < maxPrice) { maxPrice = capPrice; limitCapped = true; }
    }
    if (maxPrice <= 0) return null;

    const down = maxPrice * downPct / 100;
    const baseLoan = maxPrice - down;
    const ufmip = loanType === 'fha' ? baseLoan * 0.0175 : 0;
    const loan = baseLoan + ufmip;
    const ltv = (baseLoan / maxPrice) * 100;
    const tax = (maxPrice * taxRate) / 12;
    const ins = (maxPrice * insRate) / 12;
    let mip = 0;
    if (loanType === 'fha') mip = (loan * 0.0055) / 12;
    else if (ltv > 80) mip = (baseLoan * 0.008) / 12;
    const pi = calcPI(loan, rate, term);
    const piti = pi + tax + ins + mip;
    const closing = maxPrice * (loanType === 'fha' ? 0.03 : 0.025);
    const cashNeeded = down + closing;
    const savingsOk = savings >= cashNeeded;
    const savingsLeft = Math.abs(cashNeeded - savings);

    return { maxPrice, loan, baseLoan, ufmip, down, ltv, pi, tax, ins, mip, piti, closing, cashNeeded, savingsOk, savingsLeft, limitCapped };
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmt$(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtK(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(3).replace(/\.?0+$/, '')}M`;
    if (n >= 100_000)   return `$${Math.round(n / 1_000)}k`;
    return fmt$(n);
}

// ── Interface ─────────────────────────────────────────────────────────────────

export interface AffordabilityIncomeSliderParams {
    loanType: 'conventional' | 'fha';
    annualIncome: number;
    monthlyDebts: number;
    savings: number;
    downPct: number;
    rate: number;
    term: number;
    taxRate: number;
    insRate: number;
    loanLimit?: number;
    onRunScenario?: (seed: string, overrides: Record<string, any>) => void;
    /** FRED provenance for the rate disclosure, e.g. "as of 2026-06-11 · retrieved Jun 12, 12:03 PM PT" */
    fredStamp?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AffordabilityIncomeSliderCard(props: AffordabilityIncomeSliderParams) {
    const isFHA   = props.loanType === 'fha';
    const minDown = isFHA ? 3.5 : 3;
    const TERMS   = isFHA ? ([15, 30] as const) : ([15, 20, 30] as const);
    const accent  = isFHA ? '#f59e0b' : COLORS.accent;
    const ltLabel = isFHA ? 'FHA' : 'Conv.';
    const ltBtnColor = isFHA ? '#1c0d00' : '#060d0a';
    const cardCode = isFHA ? 'AFFD-011' : 'AFFD-010';

    const initDown = Math.max(minDown, props.downPct || minDown);

    const [income,  setIncome]  = useState(props.annualIncome);
    const [debts,   setDebts]   = useState(props.monthlyDebts);
    const [downPct, setDownPct] = useState(initDown);
    const [rate,    setRate]    = useState(props.rate);
    const [term,    setTerm]    = useState(props.term || 30);

    const [commitIncome, setCommitIncome] = useState(props.annualIncome);
    const [commitDebts,  setCommitDebts]  = useState(props.monthlyDebts);
    const [commitDown,   setCommitDown]   = useState(initDown);
    const [commitRate,   setCommitRate]   = useState(props.rate);
    const [commitTerm,   setCommitTerm]   = useState(props.term || 30);

    const [drawerOpen,  setDrawerOpen]  = useState(false);
    const [moreOpen,    setMoreOpen]    = useState(false);
    const [drawerPhase, setDrawerPhase] = useState<'idle'|'running'|'done'>('idle');

    const incomeMod = income !== commitIncome;
    const debtsMod  = debts  !== commitDebts;
    const downMod   = Math.abs(downPct - commitDown) > 0.01;
    const rateMod   = Math.abs(rate - commitRate) > 0.001;
    const termMod   = term !== commitTerm;
    const isDirty   = incomeMod || debtsMod || downMod || rateMod || termMod;

    const c = useMemo(() =>
        calcProgram(income, debts, downPct, rate, term, props.taxRate, props.insRate, props.loanType, props.savings, props.loanLimit),
        [income, debts, downPct, rate, term, props.taxRate, props.insRate, props.loanType, props.savings, props.loanLimit],
    );

    const hasPMI = !isFHA && !!c && c.ltv > 80;

    async function handleRun() {
        setDrawerPhase('running');
        if (props.onRunScenario) {
            props.onRunScenario(
                `What can I afford with ${fmtK(income)}/yr income, ${downPct}% down, at ${rate.toFixed(2)}%${isFHA ? ' FHA' : ''}?`,
                { annualIncome: income, monthlyDebts: debts, downPaymentPct: downPct, annualRatePct: rate, termYears: term, ...(isFHA ? { isFHA: true } : {}) },
            );
        }
        setCommitIncome(income); setCommitDebts(debts); setCommitDown(downPct);
        setCommitRate(rate); setCommitTerm(term);
        await new Promise<void>(r => setTimeout(r, 700));
        setDrawerPhase('done');
        await new Promise<void>(r => setTimeout(r, 1600));
        setDrawerOpen(false);
        setDrawerPhase('idle');
    }

    const DP_CHIPS = isFHA ? [3.5, 5, 10, 20] : [3, 5, 10, 20];

    return (
        <div className="affi" style={{ position: 'relative' }}>
            <AdminCardBadge code={cardCode} />

            {/* Topbar */}
            <div className="affi-topbar">
                <div className="affi-topbar-l">
                    <div className="affi-dot" style={{ background: accent }} />
                    <span className="affi-tl">Affordability</span>
                    <span className="affi-lt-badge" style={{ color: accent, background: `${accent}18`, border: `1px solid ${accent}38` }}>
                        {ltLabel}
                    </span>
                </div>
                <span className="affi-tr">Live · CalcEngine</span>
            </div>

            {/* Hero */}
            <div className="affi-hero">
                <div className="affi-hero-label">Max Home You Can Afford (43% DTI)</div>
                <div className="affi-hero-row">
                    <div className="affi-hero-amount" style={{ color: accent }}>
                        {c ? fmtK(c.maxPrice) : <span style={{ color: '#f87171' }}>—</span>}
                    </div>
                </div>
                {c ? (
                    <>
                        <div className="affi-hero-sub">
                            Based on {fmt$(Math.round(c.piti))}/mo {isFHA ? 'PITI+MIP' : 'PITI'}
                            {debts > 0 ? ` + ${fmt$(debts)}/mo debts` : ' — no debts entered'}
                        </div>
                        <div className="affi-hero-stats">
                            <div className="affi-hero-stat">
                                <div className="affi-hero-sl">PITI{isFHA ? '+MIP' : hasPMI ? '+PMI' : ''}</div>
                                <div className="affi-hero-sv">{fmt$(Math.round(c.piti))}</div>
                            </div>
                            <div className="affi-hero-stat">
                                <div className="affi-hero-sl">Cash Needed</div>
                                <div className="affi-hero-sv">{fmtK(Math.round(c.cashNeeded))}</div>
                            </div>
                            <div className="affi-hero-stat">
                                <div className="affi-hero-sl">Loan Amount</div>
                                <div className="affi-hero-sv">{fmtK(Math.round(c.loan))}</div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="affi-hero-sub">Adjust income above to see your range</div>
                )}
            </div>

            {/* Adjust button — IQC standard */}
            <button
                className={`affi-adjust-btn${drawerOpen ? ' open' : ''}`}
                style={drawerOpen ? { borderColor: `${accent}50`, background: `${accent}07` } : {}}
                onClick={() => setDrawerOpen(o => !o)}
            >
                <span className="affi-adjust-icon">⚙</span>
                <span className="affi-chips">
                    <span className={`affi-chip${incomeMod ? ' mod' : ''}`}>{fmtK(income)}/yr</span>
                    <span className={`affi-chip${downMod ? ' mod' : ''}`}>{downPct}% down</span>
                    <span className={`affi-chip${rateMod ? ' mod' : ''}`}>{rate.toFixed(3)}%</span>
                    <span className={`affi-chip${termMod ? ' mod' : ''}`}>{term}yr</span>
                    {debts > 0 && <span className={`affi-chip${debtsMod ? ' mod' : ''}`}>{fmt$(debts)}/mo debts</span>}
                </span>
                <span className="affi-adjust-lbl">{drawerOpen ? 'Close' : 'Adjust My Numbers'}</span>
                <span className={`affi-arrow${drawerOpen ? ' open' : ''}`}>▾</span>
            </button>

            {/* Drawer */}
            <div className={`affi-drawer${drawerOpen ? ' open' : ''}`}>
                <div className="affi-drawer-inner">
                    <div className="affi-grid">

                        {/* Annual Income */}
                        <div className="affi-field">
                            <div className="affi-field-top">
                                <span className="affi-field-lbl">Annual Income</span>
                                <span className="affi-field-val">{fmtK(income)}/yr</span>
                            </div>
                            <input type="range" className="affi-slider"
                                style={{ '--tc': accent } as React.CSSProperties}
                                min={30_000} max={1_000_000} step={1_000}
                                value={income} onChange={e => setIncome(Number(e.target.value))} />
                            <div className="affi-range-lbls"><span>$30k</span><span>$1M</span></div>
                        </div>

                        {/* Monthly Debts */}
                        <div className="affi-field">
                            <div className="affi-field-top">
                                <span className="affi-field-lbl">Monthly Debts</span>
                                <span className="affi-field-val affi-field-val--debt">{debts === 0 ? 'None' : fmt$(debts)}</span>
                            </div>
                            <input type="range" className="affi-slider affi-slider--debt"
                                min={0} max={5_000} step={50}
                                value={debts} onChange={e => setDebts(Number(e.target.value))} />
                            <div className="affi-range-lbls"><span>$0</span><span>$5k/mo</span></div>
                            <div className="affi-field-hint">Cars, loans, cards</div>
                        </div>

                        {/* Down Payment */}
                        <div className="affi-field">
                            <div className="affi-field-top">
                                <span className="affi-field-lbl">Down Payment</span>
                                <span className="affi-field-val">{downPct}%{c ? ` · ${fmtK(c.down)}` : ''}</span>
                            </div>
                            <input type="range" className="affi-slider"
                                style={{ '--tc': accent } as React.CSSProperties}
                                min={minDown} max={isFHA ? 20 : 40} step={0.5}
                                value={downPct} onChange={e => setDownPct(Number(e.target.value))} />
                            <div className="affi-range-lbls"><span>{minDown}%</span><span>{isFHA ? '20%' : '40%'}</span></div>
                            <div className="affi-dp-chips">
                                {DP_CHIPS.map(p => (
                                    <button key={p}
                                        className={`affi-dp-chip${Math.abs(downPct - p) < 0.1 ? ' active' : ''}`}
                                        style={Math.abs(downPct - p) < 0.1 ? { borderColor: `${accent}45`, color: accent, background: `${accent}12` } : {}}
                                        onClick={() => setDownPct(p)}
                                    >{p}%</button>
                                ))}
                            </div>
                        </div>

                        {/* Interest Rate */}
                        <div className="affi-field">
                            <div className="affi-field-top">
                                <span className="affi-field-lbl">Interest Rate</span>
                                <span className="affi-field-val">{rate.toFixed(3)}%</span>
                            </div>
                            <input type="range" className="affi-slider"
                                style={{ '--tc': accent } as React.CSSProperties}
                                min={3} max={12} step={0.125}
                                value={rate} onChange={e => setRate(Number(e.target.value))} />
                            <div className="affi-range-lbls"><span>3%</span><span>12%</span></div>
                        </div>

                        {/* Loan Term */}
                        <div className="affi-field">
                            <div className="affi-field-top">
                                <span className="affi-field-lbl">Loan Term</span>
                            </div>
                            <div className="affi-terms">
                                {TERMS.map(t => (
                                    <button key={t}
                                        className="affi-term"
                                        style={term === t ? { borderColor: `${accent}55`, color: accent, background: `${accent}12` } : {}}
                                        onClick={() => setTerm(t)}
                                    >{t}yr</button>
                                ))}
                            </div>
                        </div>

                    </div>

                    {/* Run CTA */}
                    <button
                        className="affi-run-btn"
                        style={{ background: accent, color: ltBtnColor }}
                        onClick={handleRun}
                        disabled={drawerPhase !== 'idle'}
                    >
                        {drawerPhase === 'running' ? 'Calculating…'
                            : drawerPhase === 'done' ? '✓ Updated'
                            : '▶ Update Analysis'}
                    </button>
                    {isDirty && drawerPhase === 'idle' && (
                        <div className="affi-dirty-hint">● Numbers changed — tap to update</div>
                    )}
                </div>
            </div>

            {/* More */}
            <div className="affi-more">
                <button className="affi-more-btn" onClick={() => setMoreOpen(o => !o)}>
                    <span>{moreOpen ? '↑ Less' : `↓ More${isFHA ? ' — FHA MIP details' : hasPMI ? ' — PMI details' : c?.limitCapped ? ' — loan limit note' : ''}`}</span>
                    <span className={`affi-more-chev${moreOpen ? ' open' : ''}`}>▴</span>
                </button>
                {moreOpen && c && (
                    <div className="affi-more-body">

                        {/* Savings status */}
                        {props.savings > 0 && (
                            <div className="affi-more-block">
                                <div className={`affi-savings${c.savingsOk ? ' ok' : ' gap'}`}>
                                    {c.savingsOk
                                        ? `✓ Savings OK — ${fmtK(c.savingsLeft)} left after close (need ${fmtK(c.cashNeeded)})`
                                        : `⚠ Need ${fmtK(c.savingsLeft)} more — down + closing = ${fmtK(c.cashNeeded)} total`}
                                </div>
                            </div>
                        )}

                        {/* Conforming limit cap */}
                        {c.limitCapped && (
                            <div className="affi-more-block">
                                <div className="affi-more-head" style={{ color: '#f59e0b' }}>
                                    {isFHA ? 'FHA loan limit applied' : 'Conforming limit applied'}
                                </div>
                                <div style={{ fontSize: '0.65rem', color: '#8fa3b8', lineHeight: 1.55 }}>
                                    Your income qualifies for more, but the {isFHA ? 'FHA county' : 'conforming'} limit caps the program at this price.
                                    {!isFHA && ' Jumbo financing available above this threshold.'}
                                </div>
                            </div>
                        )}

                        {/* PMI — conventional */}
                        {hasPMI && (
                            <div className="affi-more-block">
                                <div className="affi-more-head" style={{ color: '#60a5fa' }}>PMI included</div>
                                <div style={{ fontSize: '0.65rem', color: '#8fa3b8', lineHeight: 1.55 }}>
                                    Estimated at ~0.8%/yr of the loan amount. PMI cancels automatically at 80% LTV — bring 20% down to eliminate it from day one.
                                </div>
                            </div>
                        )}

                        {/* FHA MIP */}
                        {isFHA && (
                            <div className="affi-more-block">
                                <div className="affi-more-head" style={{ color: '#f59e0b' }}>🛡️ FHA Mortgage Insurance (MIP)</div>
                                <div className="affi-kv">
                                    <span>Upfront MIP (1.75%, financed)</span>
                                    <span style={{ color: '#fbbf24', fontWeight: 700 }}>{fmt$(Math.round(c.ufmip))} added to loan</span>
                                </div>
                                <div className="affi-kv">
                                    <span>Monthly MIP (~0.55%/yr)</span>
                                    <span style={{ color: '#fbbf24', fontWeight: 700 }}>{fmt$(Math.round(c.mip))}/mo</span>
                                </div>
                                <div className={`affi-mip-note${downPct >= 10 ? ' good' : ' warn'}`}>
                                    {downPct >= 10
                                        ? `✅ ${downPct}% down — MIP cancels after 11 years.`
                                        : `⚠️ ${downPct}% down — MIP is life-of-loan. Refinancing to conventional once you hit 20% equity eliminates it.`}
                                </div>
                            </div>
                        )}

                    </div>
                )}
            </div>

            {/* Rate badge + note */}
            <div style={{ marginBottom: 6 }}>
                <FredRateBadge rate={props.rate} fredStamp={props.fredStamp} decimals={2} />
            </div>
            <div className="affi-rate-note">
                {isFHA ? 'FHA MIP per HUD 2024 guidelines. UFMIP 1.75% financed.' : 'DTI thresholds per Fannie Mae/Freddie Mac guidelines.'}
                {' '}Estimates only — not a loan offer.
            </div>

            {/* Styles — mirror iq2-* values exactly, affi-* prefix */}
            <style>{`
                .affi {
                    background: #0d1117;
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 16px;
                    overflow: clip;
                    margin-top: 14px;
                    font-family: system-ui, -apple-system, sans-serif;
                    color: #d0dcea;
                }

                /* topbar */
                .affi-topbar { display:flex; align-items:center; justify-content:space-between; padding:9px 16px; border-bottom:1px solid rgba(255,255,255,0.06); }
                .affi-topbar-l { display:flex; align-items:center; gap:7px; }
                .affi-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
                .affi-tl { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#8fa3b8; }
                .affi-tr { font-size:10px; color:#4b6080; }
                .affi-lt-badge { font-size:9px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; padding:2px 8px; border-radius:4px; }

                /* hero */
                .affi-hero { padding:14px 18px 12px; border-bottom:1px solid rgba(255,255,255,0.06); }
                .affi-hero-label { font-size:0.58rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#4b6080; margin-bottom:4px; }
                .affi-hero-row { display:flex; align-items:baseline; gap:10px; margin-bottom:5px; flex-wrap:wrap; }
                .affi-hero-amount { font-size:1.75rem; font-weight:900; letter-spacing:-0.03em; line-height:1; font-variant-numeric:tabular-nums; }
                .affi-hero-sub { font-size:0.68rem; color:#6b80a0; margin-bottom:9px; line-height:1.4; }
                .affi-hero-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:7px; }
                .affi-hero-stat { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:7px; padding:7px 9px; }
                .affi-hero-sl { font-size:8.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#4b6080; margin-bottom:2px; }
                .affi-hero-sv { font-size:0.78rem; font-weight:700; color:#d8e4f4; font-variant-numeric:tabular-nums; }

                /* adjust button */
                .affi-adjust-btn {
                    display:flex; align-items:center; gap:8px;
                    width:calc(100% - 32px); margin:11px 16px;
                    padding:10px 13px;
                    background:rgba(255,255,255,0.04);
                    border:1.5px solid rgba(255,255,255,0.12);
                    border-radius:11px;
                    cursor:pointer; font-family:inherit;
                    transition:border-color .15s, background .15s;
                    user-select:none; text-align:left;
                }
                .affi-adjust-btn:hover { background:rgba(255,255,255,0.07); border-color:rgba(255,255,255,0.22); }
                .affi-adjust-icon { font-size:0.85rem; color:#6b80a0; flex-shrink:0; }
                .affi-chips { display:flex; flex-wrap:wrap; gap:4px; flex:1; align-items:center; }
                .affi-chip { font-size:0.6rem; font-weight:700; padding:3px 7px; border-radius:10px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:#94a3b8; white-space:nowrap; }
                .affi-chip.mod { background:rgba(0,232,122,0.12); border-color:rgba(0,232,122,0.3); color:#4ade80; }
                .affi-adjust-lbl { font-size:0.78rem; font-weight:800; color:#8fa3b8; flex-shrink:0; white-space:nowrap; letter-spacing:-.01em; }
                .affi-arrow { font-size:0.62rem; color:#4b6080; flex-shrink:0; transition:transform .2s; }
                .affi-arrow.open { transform:rotate(180deg); }

                /* drawer */
                .affi-drawer { max-height:0; overflow:hidden; transition:max-height 0.38s cubic-bezier(0.4,0,0.2,1); }
                .affi-drawer.open { max-height:1200px; }
                .affi-drawer-inner {
                    margin:0 16px 14px;
                    padding:12px 14px 8px;
                    background:rgba(0,0,0,0.2);
                    border:1px solid rgba(255,255,255,0.08);
                    border-radius:11px;
                }

                /* 2-col grid */
                .affi-grid { display:grid; grid-template-columns:1fr 1fr; gap:0 14px; }
                .affi-field { margin-bottom:13px; }
                .affi-field-top { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:5px; }
                .affi-field-lbl { font-size:0.62rem; font-weight:600; color:#94a3b8; }
                .affi-field-val { font-size:0.68rem; font-weight:800; color:#e2eaf8; font-variant-numeric:tabular-nums; }
                .affi-field-val--debt { color:#60a5fa; }
                .affi-field-hint { font-size:0.55rem; color:#3a4560; margin-top:3px; }
                .affi-range-lbls { display:flex; justify-content:space-between; margin-top:3px; font-size:8.5px; color:#3a4560; }

                /* sliders */
                .affi-slider {
                    -webkit-appearance:none; width:100%; height:3px;
                    border-radius:2px; background:rgba(255,255,255,0.1);
                    outline:none; cursor:pointer;
                }
                .affi-slider::-webkit-slider-thumb {
                    -webkit-appearance:none; width:14px; height:14px;
                    border-radius:50%; background:var(--tc,#00e87a); cursor:pointer;
                    box-shadow:0 0 0 3px color-mix(in srgb,var(--tc,#00e87a) 22%,transparent);
                    transition:box-shadow .15s;
                }
                .affi-slider::-webkit-slider-thumb:hover {
                    box-shadow:0 0 0 5px color-mix(in srgb,var(--tc,#00e87a) 30%,transparent);
                }
                .affi-slider--debt { --tc:#3d8bff; }
                .affi-slider--debt::-webkit-slider-thumb { background:#3d8bff; box-shadow:0 0 0 3px rgba(61,139,255,0.25); }

                /* down payment quick picks */
                .affi-dp-chips { display:flex; gap:4px; margin-top:6px; flex-wrap:wrap; }
                .affi-dp-chip { padding:3px 7px; border-radius:10px; font-size:0.58rem; font-weight:700; cursor:pointer; border:1px solid rgba(255,255,255,0.09); background:transparent; color:#6b80a0; font-family:inherit; transition:all .12s; }
                .affi-dp-chip:hover { border-color:rgba(255,255,255,0.22); color:#c4cfe0; }

                /* term buttons */
                .affi-terms { display:flex; gap:5px; }
                .affi-term { flex:1; padding:7px 0; border-radius:7px; font-size:0.65rem; font-weight:700; cursor:pointer; border:1.5px solid rgba(255,255,255,0.1); background:transparent; color:#6b80a0; font-family:inherit; text-align:center; transition:all .12s; }
                .affi-term:hover { border-color:rgba(255,255,255,0.22); color:#c4cfe0; }

                /* run CTA */
                .affi-run-btn { width:100%; padding:12px; border:none; border-radius:9px; font-size:0.85rem; font-weight:800; cursor:pointer; font-family:inherit; letter-spacing:-.01em; margin:10px 0 14px; transition:opacity .15s; }
                .affi-run-btn:hover:not(:disabled) { opacity:.88; }
                .affi-run-btn:disabled { opacity:.45; cursor:not-allowed; }
                .affi-dirty-hint { font-size:0.58rem; font-weight:600; color:#4ade80; text-align:center; margin-top:-12px; margin-bottom:10px; }

                /* more section */
                .affi-more { border-top:1px solid rgba(255,255,255,0.06); }
                .affi-more-btn { display:flex; align-items:center; justify-content:space-between; width:100%; padding:10px 18px; background:none; border:none; cursor:pointer; font-family:inherit; color:#4b6080; font-size:0.65rem; font-weight:600; transition:color .15s; }
                .affi-more-btn:hover { color:#94a3b8; }
                .affi-more-chev { transition:transform .2s; display:inline-block; transform:rotate(180deg); }
                .affi-more-chev.open { transform:rotate(0deg); }
                .affi-more-body { padding:4px 18px 14px; }
                .affi-more-block { margin-bottom:12px; }
                .affi-more-block:last-child { margin-bottom:0; }
                .affi-more-head { font-size:0.68rem; font-weight:700; margin-bottom:8px; }
                .affi-kv { display:flex; justify-content:space-between; align-items:center; font-size:0.65rem; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.04); color:#8fa3b8; }
                .affi-kv:last-of-type { border-bottom:none; }
                .affi-mip-note { margin-top:8px; font-size:0.62rem; line-height:1.5; padding:8px 10px; border-radius:7px; }
                .affi-mip-note.warn { background:rgba(245,158,11,0.08); color:#fbbf24; border:1px solid rgba(245,158,11,0.22); }
                .affi-mip-note.good { background:rgba(74,222,128,0.08); color:#4ade80; border:1px solid rgba(74,222,128,0.22); }
                .affi-savings { font-size:0.65rem; font-weight:600; padding:8px 10px; border-radius:7px; line-height:1.4; }
                .affi-savings.ok  { background:rgba(0,232,122,0.07); color:#00e87a; border:1px solid rgba(0,232,122,0.18); }
                .affi-savings.gap { background:rgba(239,68,68,0.07); color:#f87171; border:1px solid rgba(239,68,68,0.18); }

                /* rate note */
                .affi-rate-note { padding:8px 18px 13px; font-size:0.58rem; color:#3a4560; line-height:1.5; border-top:1px solid rgba(255,255,255,0.04); }

                @media (max-width:480px) {
                    .affi-grid { grid-template-columns:1fr; }
                    .affi-hero-amount { font-size:1.5rem; }
                }
            `}</style>
        </div>
    );
}
