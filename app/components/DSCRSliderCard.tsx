'use client';

// app/components/DSCRSliderCard.tsx
// DSCR investment property analyzer
// Shows both DSCR (lender qualification) AND cash flow (investor view) — clearly distinct
// DSCR = Effective Rent ÷ PITIA    Cash Flow = Effective Rent - PITIA - Maintenance - Mgmt

import React, { useState, useMemo } from 'react';
import PdfDownloadButton from './PdfDownloadButton';

export interface DSCRSliderParams {
    price: number;
    rent: number;
    downPct: number;
    rate: number;
    term?: number;          // default 30 — DSCR loans are always 30yr fixed
    vacancyRate: number;   // 0–1 decimal (e.g. 0.05 = 5%)
    taxRate: number;       // annual % of price as decimal
    insRate: number;       // annual % of price as decimal
    onRunScenario?: (seed: string) => void;
}

const MAINT_RATE = 0.01;   // 1% of price annually — shown in cash flow, NOT in DSCR calc
const VACANCY_OPTIONS = [0, 5, 8, 10];
const MGMT_OPTIONS    = [0, 8];

// ── Math ──────────────────────────────────────────────────────────────────────

function calcPI(principal: number, annualRate: number, termYears: number): number {
    if (annualRate <= 0 || principal <= 0) return 0;
    const r = annualRate / 100 / 12;
    const n = termYears * 12;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function fmt$(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(n));
}
function fmtSigned(n: number) {
    return (n >= 0 ? '+' : '−') + fmt$(n);
}
function fmtRate(r: number) { return parseFloat(r.toFixed(3)) + '%'; }

function trackStyle(val: number, min: number, max: number): React.CSSProperties {
    const pct = Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
    return { background: `linear-gradient(to right,#10b981 0%,#10b981 ${pct}%,#e2e8f0 ${pct}%,#e2e8f0 100%)` };
}

function dscrInfo(dscr: number): { label: string; color: string; bg: string; border: string } {
    if (dscr >= 1.5)  return { label: 'Excellent  ≥1.5x',         color: '#065f46', bg: '#f0fdf4', border: '#bbf7d0' };
    if (dscr >= 1.25) return { label: 'Qualifies  ≥1.25x',        color: '#059669', bg: '#f0fdf4', border: '#6ee7b7' };
    if (dscr >= 1.0)  return { label: 'Borderline  1.0–1.24x',    color: '#d97706', bg: '#fffbeb', border: '#fcd34d' };
    return                    { label: 'Does Not Qualify  <1.0x', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DSCRSliderCard(props: DSCRSliderParams) {
    const [price, setPrice]       = useState(props.price);
    const [rent, setRent]         = useState(props.rent);
    const [downPct, setDownPct]   = useState(props.downPct);
    const [rate, setRate]         = useState(props.rate);
    const [term]                  = useState(props.term ?? 30);   // 30yr fixed — term toggle can be added later
    const [vacancy, setVacancy]   = useState(Math.round(props.vacancyRate * 100)); // store as integer %
    const [mgmtPct, setMgmtPct]   = useState(0);

    const calc = useMemo(() => {
        const vacRate = vacancy / 100;
        const mgmtRate = mgmtPct / 100;

        const downAmt      = price * downPct / 100;
        const loanAmt      = price - downAmt;
        const ltv          = (loanAmt / price) * 100;
        const pi           = calcPI(loanAmt, rate, term);
        const tax          = (price * props.taxRate) / 12;
        const ins          = (price * props.insRate) / 12;
        const pitia        = pi + tax + ins;

        const effectiveRent = rent * (1 - vacRate);
        const dscr          = pitia > 0 ? effectiveRent / pitia : 0;

        const maint        = (price * MAINT_RATE) / 12;
        const mgmt         = rent * mgmtRate;
        const cashFlow     = effectiveRent - pitia - maint - mgmt;
        const annualCF     = cashFlow * 12;

        // What rent is needed for thresholds?
        const rentFor100   = pitia > 0 ? Math.ceil(pitia / (1 - vacRate)) : 0;
        const rentFor125   = pitia > 0 ? Math.ceil(pitia * 1.25 / (1 - vacRate)) : 0;

        const totalInterest = Math.max(0, pi * term * 12 - loanAmt);

        return { downAmt, loanAmt, ltv, pi, tax, ins, pitia, effectiveRent, dscr, maint, mgmt, cashFlow, annualCF, rentFor100, rentFor125, totalInterest };
    }, [price, rent, downPct, rate, term, vacancy, mgmtPct, props.taxRate, props.insRate]);

    const status = dscrInfo(calc.dscr);

    // Ratio bar: PITIA as % of effective rent (inverted — if DSCR=1.41, PITIA=71% of rent)
    const pitiaPct  = calc.effectiveRent > 0 ? Math.min(100, (calc.pitia  / calc.effectiveRent) * 100) : 100;
    // Threshold marker position: 1.25x means PITIA is 80% of rent (1/1.25)
    const threshPct = 100 / 1.25; // = 80%

    const isDirty = price !== props.price || rent !== props.rent || downPct !== props.downPct ||
        Math.abs(rate - props.rate) > 0.001 || vacancy !== Math.round(props.vacancyRate * 100);

    function buildSeed(): string {
        const vacClause = vacancy > 0 ? ` with ${vacancy}% vacancy` : '';
        return `DSCR loan on a $${price.toLocaleString()} investment property, $${rent.toLocaleString()}/mo rent, ${downPct}% down at ${fmtRate(rate)}${vacClause}`;
    }

    return (
        <div className="dsc">

            {/* ── Header ── */}
            <div className="dsc__hdr">
                <span className="dsc__hdr-label">DSCR Investment Analyzer</span>
                <span className="dsc__hdr-sub">Lender ratio · Cash flow · Thresholds</span>
            </div>

            {/* ── Hero ── */}
            <div className="dsc__hero" style={{ background: status.bg, borderBottom: `1px solid ${status.border}` }}>
                <div className="dsc__hero-top">
                    {/* DSCR big number */}
                    <div>
                        <div className="dsc__dscr-num" style={{ color: status.color }}>
                            {calc.dscr.toFixed(2)}<span className="dsc__dscr-x">x</span>
                        </div>
                        <div className="dsc__status" style={{ color: status.color }}>
                            {calc.dscr >= 1.25 ? '✓' : calc.dscr >= 1.0 ? '⚠' : '✗'} {status.label}
                        </div>
                        <div className="dsc__formula">
                            {fmt$(calc.effectiveRent)} rent ÷ {fmt$(calc.pitia)} PITIA
                        </div>
                    </div>

                    {/* Cash flow */}
                    <div className="dsc__cf-box">
                        <div className="dsc__cf-label">Monthly Cash Flow</div>
                        <div className="dsc__cf-val" style={{ color: calc.cashFlow >= 0 ? '#059669' : '#dc2626' }}>
                            {fmtSigned(calc.cashFlow)}/mo
                        </div>
                        <div className="dsc__cf-annual" style={{ color: calc.annualCF >= 0 ? '#059669' : '#dc2626' }}>
                            {fmtSigned(calc.annualCF)}/yr
                        </div>
                        <div className="dsc__cf-note">after PITIA + maint{mgmtPct > 0 ? ' + mgmt' : ''}</div>
                    </div>
                </div>

                {/* Ratio bar — visual DSCR */}
                <div className="dsc__ratio-wrap">
                    <div className="dsc__ratio-bar">
                        {/* Rent = full width (green) */}
                        <div className="dsc__ratio-rent" />
                        {/* PITIA overlay */}
                        <div className="dsc__ratio-pitia" style={{ width: `${pitiaPct}%` }} />
                        {/* 1.25x threshold marker */}
                        <div className="dsc__ratio-marker" style={{ left: `${threshPct}%` }}>
                            <div className="dsc__ratio-marker-line" />
                            <div className="dsc__ratio-marker-label">1.25x</div>
                        </div>
                    </div>
                    <div className="dsc__ratio-legend">
                        <span><span className="dsc__dot" style={{ background: '#10b981' }} />Effective Rent {fmt$(calc.effectiveRent)}</span>
                        <span><span className="dsc__dot" style={{ background: '#3b82f6' }} />PITIA {fmt$(calc.pitia)}</span>
                    </div>
                </div>

                {/* Threshold hints */}
                {calc.dscr < 1.25 && (
                    <div className="dsc__thresh">
                        {calc.dscr < 1.0 && <span>Rent for 1.0x: <strong>{fmt$(calc.rentFor100)}/mo</strong></span>}
                        <span>Rent for 1.25x: <strong>{fmt$(calc.rentFor125)}/mo</strong></span>
                    </div>
                )}
            </div>

            {/* ── Sliders ── */}
            <div className="dsc__sliders">

                {/* Purchase Price */}
                <div className="dsc__row">
                    <div className="dsc__row-hdr">
                        <span className="dsc__row-name">Purchase Price</span>
                        <span className="dsc__row-val">${price.toLocaleString()}</span>
                    </div>
                    <input type="range" className="dsc__range"
                        min={100000} max={2000000} step={5000} value={price}
                        onChange={e => setPrice(+e.target.value)}
                        style={trackStyle(price, 100000, 2000000)} />
                    <div className="dsc__minmax"><span>$100k</span><span>$2M</span></div>
                </div>

                {/* Monthly Rent */}
                <div className="dsc__row">
                    <div className="dsc__row-hdr">
                        <span className="dsc__row-name">Monthly Rent</span>
                        <span className="dsc__row-val">${rent.toLocaleString()}/mo</span>
                    </div>
                    <input type="range" className="dsc__range"
                        min={500} max={15000} step={50} value={rent}
                        onChange={e => setRent(+e.target.value)}
                        style={trackStyle(rent, 500, 15000)} />
                    <div className="dsc__minmax"><span>$500</span><span>$15k</span></div>
                </div>

                {/* Down Payment */}
                <div className="dsc__row">
                    <div className="dsc__row-hdr">
                        <span className="dsc__row-name">Down Payment</span>
                        <span className="dsc__row-val">{downPct}% · ${calc.downAmt.toLocaleString()}</span>
                    </div>
                    <input type="range" className="dsc__range"
                        min={15} max={40} step={1} value={downPct}
                        onChange={e => setDownPct(+e.target.value)}
                        style={trackStyle(downPct, 15, 40)} />
                    <div className="dsc__minmax"><span>15%</span><span>40%</span></div>
                </div>

                {/* Interest Rate */}
                <div className="dsc__row">
                    <div className="dsc__row-hdr">
                        <span className="dsc__row-name">Interest Rate</span>
                        <span className="dsc__row-val">{fmtRate(rate)}</span>
                    </div>
                    <input type="range" className="dsc__range"
                        min={5} max={12} step={0.125} value={rate}
                        onChange={e => setRate(+e.target.value)}
                        style={trackStyle(rate, 5, 12)} />
                    <div className="dsc__minmax"><span>5%</span><span>12%</span></div>
                </div>

                {/* Vacancy + Management toggles */}
                <div className="dsc__toggles">
                    <div className="dsc__toggle-group">
                        <span className="dsc__toggle-label">Vacancy</span>
                        <div className="dsc__toggle-btns">
                            {VACANCY_OPTIONS.map(v => (
                                <button key={v}
                                    className={`dsc__toggle-btn${vacancy === v ? ' dsc__toggle-btn--on' : ''}`}
                                    onClick={() => setVacancy(v)}
                                >{v}%</button>
                            ))}
                        </div>
                    </div>
                    <div className="dsc__toggle-group">
                        <span className="dsc__toggle-label">Management</span>
                        <div className="dsc__toggle-btns">
                            {MGMT_OPTIONS.map(m => (
                                <button key={m}
                                    className={`dsc__toggle-btn${mgmtPct === m ? ' dsc__toggle-btn--on' : ''}`}
                                    onClick={() => setMgmtPct(m)}
                                >{m === 0 ? 'None' : `${m}%`}</button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Fixed assumptions note */}
                <div className="dsc__assumptions">
                    Assumptions: Tax {(props.taxRate * 100).toFixed(1)}%/yr · Insurance {(props.insRate * 100).toFixed(1)}%/yr · Maintenance 1%/yr (cash flow only, not DSCR)
                </div>

            </div>

            {/* ── Footer ── */}
            <div className="dsc__foot">
                <div className="dsc__foot-stats">
                    <div className="dsc__stat">
                        <span className="dsc__stat-label">Loan Amount</span>
                        <span className="dsc__stat-val">${Math.round(calc.loanAmt).toLocaleString()}</span>
                    </div>
                    <div className="dsc__stat">
                        <span className="dsc__stat-label">LTV</span>
                        <span className="dsc__stat-val">{calc.ltv.toFixed(1)}%</span>
                    </div>
                    <div className="dsc__stat">
                        <span className="dsc__stat-label">Total Interest (30yr)</span>
                        <span className="dsc__stat-val">${Math.round(calc.totalInterest).toLocaleString()}</span>
                    </div>
                    <div className="dsc__stat">
                        <span className="dsc__stat-label">Gross Yield</span>
                        <span className="dsc__stat-val">{price > 0 ? ((rent * 12 / price) * 100).toFixed(1) : '—'}%</span>
                    </div>
                </div>
                <div className="dsc__actions">
                    {props.onRunScenario && isDirty && (
                        <button className="dsc__rerun" onClick={() => props.onRunScenario!(buildSeed())}>
                            Run adjusted scenario →
                        </button>
                    )}
                    <PdfDownloadButton
                        type="dscr"
                        getParams={() => ({ price, rent, downPct, rate, vacancyRate: vacancy / 100, taxRate: props.taxRate, insRate: props.insRate, mgmtPct })}
                    />
                </div>
            </div>

            {/* ── Styles ── */}
            <style>{`
                .dsc {
                    border: 1px solid #e2e8f0;
                    border-radius: 16px;
                    overflow: hidden;
                    background: #fff;
                    margin-top: 14px;
                    font-family: system-ui, -apple-system, sans-serif;
                    color: #0f172a;
                }
                .dsc__hdr {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 18px;
                    border-bottom: 1px solid #f1f5f9;
                }
                .dsc__hdr-label {
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: .08em;
                    color: #94a3b8;
                }
                .dsc__hdr-sub {
                    font-size: 10px;
                    color: #cbd5e1;
                    font-weight: 500;
                }
                /* Hero */
                .dsc__hero {
                    padding: 18px 18px 14px;
                }
                .dsc__hero-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 12px;
                    flex-wrap: wrap;
                    margin-bottom: 16px;
                }
                .dsc__dscr-num {
                    font-size: clamp(2.4rem, 6vw, 3rem);
                    font-weight: 800;
                    letter-spacing: -.05em;
                    font-variant-numeric: tabular-nums;
                    line-height: 1;
                    margin-bottom: 4px;
                }
                .dsc__dscr-x {
                    font-size: 1.4rem;
                    font-weight: 700;
                    letter-spacing: 0;
                }
                .dsc__status {
                    font-size: 13px;
                    font-weight: 700;
                    margin-bottom: 4px;
                }
                .dsc__formula {
                    font-size: 11px;
                    color: #64748b;
                    font-variant-numeric: tabular-nums;
                }
                /* Cash flow box */
                .dsc__cf-box {
                    background: rgba(255,255,255,.7);
                    border: 1px solid rgba(0,0,0,.07);
                    border-radius: 10px;
                    padding: 10px 14px;
                    text-align: right;
                    flex-shrink: 0;
                }
                .dsc__cf-label {
                    font-size: 10px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: .06em;
                    color: #94a3b8;
                    margin-bottom: 3px;
                }
                .dsc__cf-val {
                    font-size: 1.3rem;
                    font-weight: 800;
                    font-variant-numeric: tabular-nums;
                    letter-spacing: -.02em;
                    line-height: 1;
                }
                .dsc__cf-annual {
                    font-size: 12px;
                    font-weight: 700;
                    font-variant-numeric: tabular-nums;
                    margin-top: 2px;
                }
                .dsc__cf-note {
                    font-size: 9px;
                    color: #94a3b8;
                    margin-top: 3px;
                }
                /* Ratio bar */
                .dsc__ratio-wrap {
                    margin-bottom: 10px;
                }
                .dsc__ratio-bar {
                    position: relative;
                    height: 14px;
                    border-radius: 9999px;
                    overflow: visible;
                    margin-bottom: 8px;
                    background: #e2e8f0;
                }
                .dsc__ratio-rent {
                    position: absolute;
                    inset: 0;
                    background: #10b981;
                    border-radius: 9999px;
                    opacity: .25;
                }
                .dsc__ratio-pitia {
                    position: absolute;
                    top: 0; left: 0; bottom: 0;
                    background: #3b82f6;
                    border-radius: 9999px;
                    transition: width .2s ease;
                    opacity: .75;
                }
                .dsc__ratio-marker {
                    position: absolute;
                    top: -4px;
                    bottom: -4px;
                    transform: translateX(-50%);
                }
                .dsc__ratio-marker-line {
                    width: 2px;
                    height: 100%;
                    background: #f59e0b;
                    border-radius: 1px;
                    margin: 0 auto;
                }
                .dsc__ratio-marker-label {
                    position: absolute;
                    top: -18px;
                    left: 50%;
                    transform: translateX(-50%);
                    font-size: 9px;
                    font-weight: 700;
                    color: #d97706;
                    white-space: nowrap;
                    background: #fffbeb;
                    padding: 1px 4px;
                    border-radius: 4px;
                }
                .dsc__ratio-legend {
                    display: flex;
                    gap: 16px;
                    font-size: 11px;
                    color: #64748b;
                }
                .dsc__ratio-legend span {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                .dsc__dot {
                    display: inline-block;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }
                /* Threshold hints */
                .dsc__thresh {
                    display: flex;
                    gap: 16px;
                    flex-wrap: wrap;
                    font-size: 11px;
                    color: #64748b;
                    margin-top: 8px;
                    padding-top: 8px;
                    border-top: 1px solid rgba(0,0,0,.06);
                }
                /* Sliders */
                .dsc__sliders {
                    padding: 16px 18px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    border-top: 1px solid #e2e8f0;
                }
                .dsc__row {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .dsc__row-hdr {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .dsc__row-name {
                    font-size: 13px;
                    font-weight: 600;
                    color: #374151;
                }
                .dsc__row-val {
                    font-size: 13px;
                    font-weight: 700;
                    color: #0f172a;
                    font-variant-numeric: tabular-nums;
                }
                .dsc__minmax {
                    display: flex;
                    justify-content: space-between;
                    font-size: 10px;
                    color: #94a3b8;
                    font-weight: 500;
                }
                .dsc__range {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 100%;
                    height: 6px;
                    border-radius: 9999px;
                    outline: none;
                    cursor: pointer;
                }
                .dsc__range::-webkit-slider-thumb {
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
                .dsc__range::-webkit-slider-thumb:hover {
                    box-shadow: 0 0 0 3px rgba(16,185,129,.25), 0 3px 10px rgba(16,185,129,.4);
                }
                .dsc__range::-moz-range-thumb {
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    background: #10b981;
                    border: 3px solid #fff;
                    box-shadow: 0 0 0 1.5px #10b981;
                    cursor: pointer;
                }
                /* Vacancy + management toggles */
                .dsc__toggles {
                    display: flex;
                    gap: 16px;
                    flex-wrap: wrap;
                }
                .dsc__toggle-group {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    flex: 1;
                    min-width: 140px;
                }
                .dsc__toggle-label {
                    font-size: 13px;
                    font-weight: 600;
                    color: #374151;
                }
                .dsc__toggle-btns {
                    display: flex;
                    gap: 6px;
                }
                .dsc__toggle-btn {
                    flex: 1;
                    padding: 6px 0;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    color: #64748b;
                    background: #fff;
                    transition: all .15s;
                }
                .dsc__toggle-btn--on {
                    border-color: #10b981;
                    color: #065f46;
                    background: #f0fdf4;
                }
                .dsc__toggle-btn:hover:not(.dsc__toggle-btn--on) {
                    border-color: #94a3b8;
                    color: #374151;
                }
                /* Assumptions */
                .dsc__assumptions {
                    font-size: 10px;
                    color: #94a3b8;
                    line-height: 1.5;
                    padding: 8px 12px;
                    background: #f8fafc;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                }
                /* Footer */
                .dsc__foot {
                    padding: 12px 18px;
                    background: #f8fafc;
                    border-top: 1px solid #e2e8f0;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    flex-wrap: wrap;
                }
                .dsc__foot-stats {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px 24px;
                }
                .dsc__stat {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .dsc__stat-label {
                    font-size: 10px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: .06em;
                    color: #94a3b8;
                }
                .dsc__stat-val {
                    font-size: 13px;
                    font-weight: 700;
                    color: #0f172a;
                    font-variant-numeric: tabular-nums;
                }
                .dsc__actions {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                    flex-wrap: wrap;
                    margin-top: 4px;
                }
                .dsc__rerun {
                    padding: 8px 16px;
                    background: #0f172a;
                    color: #fff;
                    border: none;
                    border-radius: 9999px;
                    font-size: 12px;
                    font-weight: 700;
                    cursor: pointer;
                    white-space: nowrap;
                    transition: background .15s, transform .1s;
                    letter-spacing: .01em;
                }
                .dsc__rerun:hover { background: #1e293b; }
                .dsc__rerun:active { transform: scale(.97); }

                @media (max-width: 480px) {
                    .dsc__dscr-num { font-size: 2.2rem; }
                    .dsc__cf-box { text-align: left; }
                }
            `}</style>
        </div>
    );
}
