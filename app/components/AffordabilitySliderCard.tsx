'use client';

// app/components/AffordabilitySliderCard.tsx
// Affordability explorer — income + debt sliders → live max home price
// Works backwards: gross income × 43% DTI − debts − tax − ins − PMI → max loan → max price

import React, { useState, useMemo } from 'react';

export interface AffordabilitySliderParams {
    annualIncome: number;
    monthlyDebts: number;
    savings: number;
    downPct: number;
    rate: number;
    term: number;
    taxRate: number;    // annual % of price as decimal
    insRate: number;    // annual % of price as decimal
    loanType: 'conventional' | 'fha';
}

// ── Math ──────────────────────────────────────────────────────────────────────

function calcPI(principal: number, annualRate: number, termYears: number): number {
    if (annualRate <= 0 || principal <= 0) return 0;
    const r = annualRate / 100 / 12;
    const n = termYears * 12;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// Binary search: find max home price where total PITIA ≤ 43% DTI budget
function calcMaxPrice(
    annualIncome: number,
    monthlyDebts: number,
    downPct: number,
    annualRate: number,
    termYears: number,
    taxRate: number,
    insRate: number,
    loanType: 'conventional' | 'fha',
): number {
    const grossMonthly = annualIncome / 12;
    const budget = grossMonthly * 0.43 - monthlyDebts;
    if (budget <= 50) return 0;

    function totalAt(p: number): number {
        if (p <= 0) return 0;
        const down = p * downPct / 100;
        const baseLoan = p - down;
        const loan = loanType === 'fha' ? baseLoan * 1.0175 : baseLoan;
        const ltv = p > 0 ? (baseLoan / p) * 100 : 100;
        const tax = (p * taxRate) / 12;
        const ins = (p * insRate) / 12;
        let pmi = 0;
        if (loanType === 'conventional' && ltv > 80) pmi = (loan * 0.008) / 12;
        else if (loanType === 'fha') pmi = (loan * 0.0055) / 12;
        return calcPI(loan, annualRate, termYears) + tax + ins + pmi;
    }

    let lo = 10000, hi = 6000000;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (totalAt(mid) < budget) lo = mid; else hi = mid;
    }
    return Math.floor((lo + hi) / 2 / 1000) * 1000;
}

// ── Formatting ─────────────────────────────────────────────────────────────

function fmt$(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtK(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 100_000)   return `$${Math.round(n / 1_000)}k`;
    return fmt$(n);
}
function fmtRate(r: number) { return parseFloat(r.toFixed(3)) + '%'; }

function trackStyle(val: number, min: number, max: number): React.CSSProperties {
    const pct = Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
    return { background: `linear-gradient(to right,#10b981 0%,#10b981 ${pct}%,#e2e8f0 ${pct}%,#e2e8f0 100%)` };
}

// DTI color
function dtiColor(dti: number, isBackEnd: boolean): string {
    if (isBackEnd) return dti <= 36 ? '#10b981' : dti <= 43 ? '#f59e0b' : '#ef4444';
    return dti <= 28 ? '#10b981' : dti <= 36 ? '#f59e0b' : '#ef4444';
}

const C = { pi: '#3b82f6', tax: '#f59e0b', ins: '#10b981', pmi: '#ef4444' };

// ── Component ─────────────────────────────────────────────────────────────────

export default function AffordabilitySliderCard(props: AffordabilitySliderParams) {
    const [income, setIncome]       = useState(props.annualIncome);
    const [debts, setDebts]         = useState(props.monthlyDebts);
    const [downPct, setDownPct]     = useState(props.downPct);
    const [rate, setRate]           = useState(props.rate);
    const [term, setTerm]           = useState(props.term);
    const [loanType, setLoanType]   = useState<'conventional' | 'fha'>(props.loanType);

    const calc = useMemo(() => {
        const maxPrice = calcMaxPrice(income, debts, downPct, rate, term, props.taxRate, props.insRate, loanType);

        if (maxPrice <= 0) return null;

        const down     = maxPrice * downPct / 100;
        const baseLoan = maxPrice - down;
        const loan     = loanType === 'fha' ? baseLoan * 1.0175 : baseLoan;
        const ltv      = (baseLoan / maxPrice) * 100;
        const tax      = (maxPrice * props.taxRate) / 12;
        const ins      = (maxPrice * props.insRate) / 12;
        let pmi = 0;
        if (loanType === 'conventional' && ltv > 80) pmi = (loan * 0.008) / 12;
        else if (loanType === 'fha') pmi = (loan * 0.0055) / 12;
        const pi    = calcPI(loan, rate, term);
        const total = pi + tax + ins + pmi;

        const grossMonthly  = income / 12;
        const frontEndDTI   = total / grossMonthly * 100;
        const backEndDTI    = (total + debts) / grossMonthly * 100;

        const closing       = maxPrice * (loanType === 'fha' ? 0.03 : 0.025);
        const totalCash     = down + closing;
        const savingsGap    = Math.max(0, totalCash - props.savings);

        return { maxPrice, down, loan, ltv, pi, tax, ins, pmi, total, frontEndDTI, backEndDTI, closing, totalCash, savingsGap };
    }, [income, debts, downPct, rate, term, loanType, props.taxRate, props.insRate, props.savings]);

    const pmiLabel  = loanType === 'fha' ? 'MIP' : 'PMI';
    const minDown   = loanType === 'fha' ? 3.5 : 3;

    // Enforce FHA min down if switching type
    const effectiveDown = downPct < minDown ? minDown : downPct;

    const piPct  = calc ? (calc.pi  / calc.total) * 100 : 0;
    const taxPct = calc ? (calc.tax / calc.total) * 100 : 0;
    const insPct = calc ? (calc.ins / calc.total) * 100 : 0;
    const pmiPct = calc?.pmi ? (calc.pmi / calc.total) * 100 : 0;

    return (
        <div className="asc">

            {/* ── Header ── */}
            <div className="asc__hdr">
                <span className="asc__hdr-label">Affordability Explorer</span>
                <div className="asc__type">
                    <button className={`asc__type-btn${loanType === 'conventional' ? ' asc__type-btn--on' : ''}`}
                        onClick={() => { setLoanType('conventional'); }}>Conventional</button>
                    <button className={`asc__type-btn${loanType === 'fha' ? ' asc__type-btn--on' : ''}`}
                        onClick={() => { setLoanType('fha'); if (downPct < 3.5) setDownPct(3.5); }}>FHA</button>
                </div>
            </div>

            {/* ── Hero ── */}
            <div className="asc__hero">
                {calc ? (
                    <>
                        <div className="asc__hero-top">
                            <div>
                                <div className="asc__max-label">Max Home Price</div>
                                <div className="asc__max-price">{fmt$(calc.maxPrice)}</div>
                                <div className="asc__max-sub">at 43% DTI &nbsp;·&nbsp; {fmt$(calc.total)}/mo</div>
                            </div>
                            {/* DTI pills */}
                            <div className="asc__dti-wrap">
                                <div className="asc__dti-item">
                                    <span className="asc__dti-label">Housing DTI</span>
                                    <span className="asc__dti-val" style={{ color: dtiColor(calc.frontEndDTI, false) }}>
                                        {calc.frontEndDTI.toFixed(1)}%
                                    </span>
                                    <span className="asc__dti-guide">≤28% ideal</span>
                                </div>
                                <div className="asc__dti-sep" />
                                <div className="asc__dti-item">
                                    <span className="asc__dti-label">Total DTI</span>
                                    <span className="asc__dti-val" style={{ color: dtiColor(calc.backEndDTI, true) }}>
                                        {calc.backEndDTI.toFixed(1)}%
                                    </span>
                                    <span className="asc__dti-guide">≤43% max</span>
                                </div>
                            </div>
                        </div>

                        {/* Stacked bar */}
                        <div className="asc__bar">
                            <div style={{ width: `${piPct}%`,  background: C.pi,  height: '100%', minWidth: 2, transition: 'width .2s' }} />
                            <div style={{ width: `${taxPct}%`, background: C.tax, height: '100%', minWidth: 2, transition: 'width .2s' }} />
                            <div style={{ width: `${insPct}%`, background: C.ins, height: '100%', minWidth: 2, transition: 'width .2s' }} />
                            {calc.pmi > 0 && <div style={{ width: `${pmiPct}%`, background: C.pmi, height: '100%', minWidth: 2, transition: 'width .2s' }} />}
                        </div>

                        {/* Legend */}
                        <div className="asc__legend">
                            {([
                                { color: C.pi,  name: 'P&I',       val: calc.pi  },
                                { color: C.tax, name: 'Tax',        val: calc.tax },
                                { color: C.ins, name: 'Insurance',  val: calc.ins },
                                ...(calc.pmi > 0 ? [{ color: C.pmi, name: pmiLabel, val: calc.pmi }] : []),
                            ] as { color: string; name: string; val: number }[]).map(item => (
                                <div key={item.name} className="asc__legend-item">
                                    <span className="asc__dot" style={{ background: item.color }} />
                                    <span className="asc__legend-name">{item.name}</span>
                                    <span className="asc__legend-val">{fmt$(item.val)}</span>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="asc__zero">Income too low or debt too high to qualify at current rates.</div>
                )}
            </div>

            {/* ── Sliders ── */}
            <div className="asc__sliders">

                {/* Annual Income */}
                <div className="asc__row">
                    <div className="asc__row-hdr">
                        <span className="asc__row-name">Annual Income</span>
                        <span className="asc__row-val">{fmtK(income)}</span>
                    </div>
                    <input type="range" className="asc__range"
                        min={30000} max={500000} step={1000} value={income}
                        onChange={e => setIncome(+e.target.value)}
                        style={trackStyle(income, 30000, 500000)} />
                    <div className="asc__minmax"><span>$30k</span><span>$500k</span></div>
                </div>

                {/* Monthly Debts */}
                <div className="asc__row">
                    <div className="asc__row-hdr">
                        <span className="asc__row-name">Monthly Debts</span>
                        <span className="asc__row-val">{debts === 0 ? 'None' : fmt$(debts) + '/mo'}</span>
                    </div>
                    <input type="range" className="asc__range"
                        min={0} max={5000} step={50} value={debts}
                        onChange={e => setDebts(+e.target.value)}
                        style={trackStyle(debts, 0, 5000)} />
                    <div className="asc__minmax"><span>$0</span><span>$5k/mo</span></div>
                </div>

                {/* Down Payment */}
                <div className="asc__row">
                    <div className="asc__row-hdr">
                        <span className="asc__row-name">Down Payment</span>
                        <span className="asc__row-val">
                            {effectiveDown}%
                            {calc ? ` · ${fmt$(calc.down)}` : ''}
                        </span>
                    </div>
                    <input type="range" className="asc__range"
                        min={minDown} max={30} step={0.5} value={effectiveDown}
                        onChange={e => setDownPct(+e.target.value)}
                        style={trackStyle(effectiveDown, minDown, 30)} />
                    <div className="asc__minmax"><span>{minDown}%</span><span>30%</span></div>
                </div>

                {/* Rate */}
                <div className="asc__row">
                    <div className="asc__row-hdr">
                        <span className="asc__row-name">Interest Rate</span>
                        <span className="asc__row-val">{fmtRate(rate)}</span>
                    </div>
                    <input type="range" className="asc__range"
                        min={3} max={12} step={0.125} value={rate}
                        onChange={e => setRate(+e.target.value)}
                        style={trackStyle(rate, 3, 12)} />
                    <div className="asc__minmax"><span>3%</span><span>12%</span></div>
                </div>

                {/* Term */}
                <div className="asc__row">
                    <div className="asc__row-hdr">
                        <span className="asc__row-name">Loan Term</span>
                    </div>
                    <div className="asc__terms">
                        {([15, 20, 30] as const).map(t => (
                            <button key={t}
                                className={`asc__term${term === t ? ' asc__term--on' : ''}`}
                                onClick={() => setTerm(t)}
                            >{t}yr</button>
                        ))}
                    </div>
                </div>

            </div>

            {/* ── Footer ── */}
            {calc && (
                <div className="asc__foot">
                    <div className="asc__stat">
                        <span className="asc__stat-label">Down Payment</span>
                        <span className="asc__stat-val">{fmt$(calc.down)}</span>
                    </div>
                    <div className="asc__stat">
                        <span className="asc__stat-label">Closing Costs</span>
                        <span className="asc__stat-val">~{fmt$(calc.closing)}</span>
                    </div>
                    <div className="asc__stat">
                        <span className="asc__stat-label">Total Cash Needed</span>
                        <span className="asc__stat-val">{fmt$(calc.totalCash)}</span>
                    </div>
                    <div className="asc__stat">
                        <span className="asc__stat-label">
                            {calc.savingsGap > 0 ? '⚠ Savings Gap' : '✓ Savings OK'}
                        </span>
                        <span className="asc__stat-val" style={{ color: calc.savingsGap > 0 ? '#ef4444' : '#10b981' }}>
                            {calc.savingsGap > 0 ? `Need ${fmt$(calc.savingsGap)} more` : `${fmt$(props.savings - calc.totalCash)} left after close`}
                        </span>
                    </div>
                </div>
            )}

            {/* ── Styles ── */}
            <style>{`
                .asc {
                    border: 1px solid #e2e8f0;
                    border-radius: 16px;
                    overflow: hidden;
                    background: #fff;
                    margin-top: 14px;
                    font-family: system-ui, -apple-system, sans-serif;
                    color: #0f172a;
                }
                .asc__hdr {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 18px;
                    border-bottom: 1px solid #f1f5f9;
                }
                .asc__hdr-label {
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: .08em;
                    color: #94a3b8;
                }
                .asc__type {
                    display: flex;
                    gap: 3px;
                    background: #f1f5f9;
                    border-radius: 8px;
                    padding: 3px;
                }
                .asc__type-btn {
                    padding: 4px 11px;
                    border: none;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    color: #64748b;
                    background: transparent;
                    transition: all .15s;
                }
                .asc__type-btn--on {
                    background: #fff;
                    color: #0f172a;
                    box-shadow: 0 1px 4px rgba(0,0,0,.12);
                }
                .asc__hero {
                    background: #f8fafc;
                    padding: 18px 18px 14px;
                    border-bottom: 1px solid #e2e8f0;
                }
                .asc__zero {
                    font-size: 13px;
                    color: #ef4444;
                    font-weight: 600;
                    padding: 4px 0;
                }
                .asc__hero-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 12px;
                    margin-bottom: 14px;
                    flex-wrap: wrap;
                }
                .asc__max-label {
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: .06em;
                    color: #64748b;
                    margin-bottom: 3px;
                }
                .asc__max-price {
                    font-size: clamp(1.8rem, 5vw, 2.4rem);
                    font-weight: 800;
                    color: #0f172a;
                    letter-spacing: -.04em;
                    font-variant-numeric: tabular-nums;
                    line-height: 1;
                    margin-bottom: 4px;
                }
                .asc__max-sub {
                    font-size: 12px;
                    color: #64748b;
                    font-weight: 500;
                }
                .asc__dti-wrap {
                    display: flex;
                    gap: 8px;
                    align-items: stretch;
                    background: #fff;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    padding: 8px 12px;
                    flex-shrink: 0;
                }
                .asc__dti-sep {
                    width: 1px;
                    background: #e2e8f0;
                    align-self: stretch;
                }
                .asc__dti-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 2px;
                    min-width: 64px;
                }
                .asc__dti-label {
                    font-size: 10px;
                    font-weight: 600;
                    color: #94a3b8;
                    text-transform: uppercase;
                    letter-spacing: .04em;
                }
                .asc__dti-val {
                    font-size: 18px;
                    font-weight: 800;
                    font-variant-numeric: tabular-nums;
                    letter-spacing: -.02em;
                    transition: color .2s;
                }
                .asc__dti-guide {
                    font-size: 9px;
                    color: #94a3b8;
                }
                .asc__bar {
                    display: flex;
                    height: 10px;
                    border-radius: 9999px;
                    overflow: hidden;
                    background: #e2e8f0;
                    margin-bottom: 12px;
                    gap: 1px;
                }
                .asc__legend {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px 14px;
                }
                .asc__legend-item {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                .asc__dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }
                .asc__legend-name {
                    font-size: 11px;
                    font-weight: 600;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: .04em;
                }
                .asc__legend-val {
                    font-size: 12px;
                    font-weight: 700;
                    color: #0f172a;
                    font-variant-numeric: tabular-nums;
                }
                .asc__sliders {
                    padding: 16px 18px;
                    display: flex;
                    flex-direction: column;
                    gap: 18px;
                }
                .asc__row {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .asc__row-hdr {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .asc__row-name {
                    font-size: 13px;
                    font-weight: 600;
                    color: #374151;
                }
                .asc__row-val {
                    font-size: 13px;
                    font-weight: 700;
                    color: #0f172a;
                    font-variant-numeric: tabular-nums;
                }
                .asc__minmax {
                    display: flex;
                    justify-content: space-between;
                    font-size: 10px;
                    color: #94a3b8;
                    font-weight: 500;
                }
                .asc__range {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 100%;
                    height: 6px;
                    border-radius: 9999px;
                    outline: none;
                    cursor: pointer;
                }
                .asc__range::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    background: #10b981;
                    border: 3px solid #fff;
                    box-shadow: 0 0 0 1.5px #10b981, 0 2px 6px rgba(16,185,129,.3);
                    cursor: pointer;
                    transition: box-shadow .15s;
                }
                .asc__range::-webkit-slider-thumb:hover {
                    box-shadow: 0 0 0 3px rgba(16,185,129,.25), 0 3px 10px rgba(16,185,129,.4);
                }
                .asc__range::-moz-range-thumb {
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    background: #10b981;
                    border: 3px solid #fff;
                    box-shadow: 0 0 0 1.5px #10b981;
                    cursor: pointer;
                }
                .asc__range:active::-webkit-slider-thumb {
                    box-shadow: 0 0 0 5px rgba(16,185,129,.2), 0 3px 10px rgba(16,185,129,.5);
                }
                .asc__terms {
                    display: flex;
                    gap: 8px;
                }
                .asc__term {
                    flex: 1;
                    padding: 9px 0;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 10px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    color: #64748b;
                    background: #fff;
                    transition: all .15s;
                }
                .asc__term--on {
                    border-color: #10b981;
                    color: #065f46;
                    background: #f0fdf4;
                }
                .asc__term:hover:not(.asc__term--on) {
                    border-color: #94a3b8;
                    color: #374151;
                }
                .asc__foot {
                    padding: 12px 18px;
                    background: #f8fafc;
                    border-top: 1px solid #e2e8f0;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px 24px;
                }
                .asc__stat {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .asc__stat-label {
                    font-size: 10px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: .06em;
                    color: #94a3b8;
                }
                .asc__stat-val {
                    font-size: 13px;
                    font-weight: 700;
                    color: #0f172a;
                    font-variant-numeric: tabular-nums;
                }
                @media (max-width: 480px) {
                    .asc__max-price { font-size: 1.8rem; }
                    .asc__dti-wrap { padding: 6px 10px; }
                    .asc__dti-val { font-size: 15px; }
                }
            `}</style>
        </div>
    );
}
