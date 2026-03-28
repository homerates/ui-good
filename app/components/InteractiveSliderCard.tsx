'use client';

// app/components/InteractiveSliderCard.tsx
// Interactive mortgage payment explorer — Conventional · FHA · VA · Jumbo tabs
// All math is local (no API calls on slider move); re-run sends to API.

import React, { useState, useMemo } from 'react';
import PdfDownloadButton from './PdfDownloadButton';

export interface SliderCardParams {
    price: number;
    downPct: number;
    rate: number;
    term: number;
    taxRate: number;          // annual % of price as decimal — e.g. 0.012
    insRate: number;          // annual % of price as decimal — e.g. 0.005
    loanType: 'conventional' | 'fha' | 'va' | 'jumbo';
    vaFundingFeePct?: number; // VA only — 0 = exempt, else 1.25 / 1.5 / 2.15
    onRunScenario?: (seed: string, paramOverrides: Record<string, any>) => void;
}

// VA funding-fee presets
const VA_FF_OPTIONS = [
    { label: 'Exempt', pct: 0 },
    { label: '1.25%',  pct: 1.25 },
    { label: '1.50%',  pct: 1.50 },
    { label: '2.15%',  pct: 2.15 },
];

// ── Math helpers ──────────────────────────────────────────────────────────────

function calcPI(principal: number, annualRate: number, termYears: number): number {
    if (principal <= 0) return 0;
    if (annualRate <= 0) return principal / (termYears * 12);
    const r = annualRate / 100 / 12;
    const n = termYears * 12;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function fmtDollar(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtRate(r: number) {
    return parseFloat(r.toFixed(3)) + '%';
}

function trackStyle(val: number, min: number, max: number): React.CSSProperties {
    const pct = ((val - min) / (max - min)) * 100;
    return {
        background: `linear-gradient(to right, #10b981 0%, #10b981 ${pct}%, #e2e8f0 ${pct}%, #e2e8f0 100%)`,
    };
}

const C = { pi: '#3b82f6', tax: '#f59e0b', ins: '#10b981', pmi: '#ef4444', ff: '#dc2626' };

// ── Component ─────────────────────────────────────────────────────────────────

export default function InteractiveSliderCard(props: SliderCardParams) {
    const [price,    setPrice]    = useState(props.price);
    const [downPct,  setDownPct]  = useState(props.downPct);
    const [rate,     setRate]     = useState(props.rate);
    const [term,     setTerm]     = useState(props.term);
    const [loanType, setLoanType] = useState<'conventional' | 'fha' | 'va' | 'jumbo'>(props.loanType);
    // VA funding fee — initialise from prop (0 = exempt)
    const initFfPct = props.vaFundingFeePct ?? 2.15;
    const [vaFfPct, setVaFfPct]  = useState<number>(initFfPct);

    const priceMax      = loanType === 'jumbo' ? 5000000 : props.price > 2000000 ? 4000000 : 2000000;
    const priceMaxLabel = priceMax === 5000000 ? '$5M' : priceMax === 4000000 ? '$4M' : '$2M';

    const calc = useMemo(() => {
        const downAmt  = price * downPct / 100;
        const baseLoan = price - downAmt;
        const ltv      = baseLoan > 0 ? (baseLoan / price) * 100 : 0;

        let loanAmt = baseLoan;
        let fundingFee = 0;

        if (loanType === 'fha') {
            loanAmt = baseLoan * 1.0175; // 1.75% UFMIP rolled in
        } else if (loanType === 'va') {
            fundingFee = baseLoan * (vaFfPct / 100);
            loanAmt    = baseLoan + fundingFee;
        }

        const pi  = calcPI(loanAmt, rate, term);
        const tax = (price * props.taxRate) / 12;
        const ins = (price * props.insRate) / 12;

        // PMI / MIP — VA has neither
        let pmi = 0;
        if      (loanType === 'conventional' && ltv > 80) pmi = (loanAmt * 0.008) / 12;
        else if (loanType === 'fha')                       pmi = (loanAmt * 0.0055) / 12;

        const total         = pi + tax + ins + pmi;
        const totalInterest = Math.max(0, pi * term * 12 - baseLoan);

        return { downAmt, baseLoan, loanAmt, fundingFee, ltv, pi, tax, ins, pmi, total, totalInterest };
    }, [price, downPct, rate, term, loanType, vaFfPct, props.taxRate, props.insRate]);

    const { downAmt, baseLoan, loanAmt, fundingFee, ltv, pi, tax, ins, pmi, total, totalInterest } = calc;

    const isDirty = price !== props.price || downPct !== props.downPct ||
        Math.abs(rate - props.rate) > 0.001 || term !== props.term ||
        loanType !== props.loanType || (loanType === 'va' && vaFfPct !== initFfPct);

    function buildSeed(): string {
        if (loanType === 'fha')   return `FHA loan on a $${price.toLocaleString()} home with ${downPct}% down at ${fmtRate(rate)} — ${term} year fixed`;
        if (loanType === 'va')    return `VA loan on a $${price.toLocaleString()} home with ${downPct}% down at ${fmtRate(rate)}${vaFfPct === 0 ? ', funding fee exempt' : ''}`;
        if (loanType === 'jumbo') return `Jumbo loan on a $${price.toLocaleString()} home with ${downPct}% down at ${fmtRate(rate)} — ${term} year fixed`;
        return `Conventional loan on a $${price.toLocaleString()} home with ${downPct}% down at ${fmtRate(rate)} — ${term} year fixed`;
    }

    function getRunOverrides(): Record<string, any> {
        if (loanType === 'va') {
            return {
                purchasePrice:      price,
                downPaymentPct:     downPct,
                annualRatePct:      rate,
                loanType:           'va',
                vaFundingFeeExempt: vaFfPct === 0,
                ...(vaFfPct > 0 ? { customFundingFeePct: vaFfPct } : {}),
            };
        }
        if (loanType === 'fha') {
            return { purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate, isFHA: true };
        }
        if (loanType === 'jumbo') {
            return { purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate, loanType: 'jumbo' };
        }
        return { purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate };
    }

    // Bar widths
    const piPct  = total > 0 ? (pi  / total) * 100 : 0;
    const taxPct = total > 0 ? (tax / total) * 100 : 0;
    const insPct = total > 0 ? (ins / total) * 100 : 0;
    const pmiPct = pmi > 0 && total > 0 ? (pmi / total) * 100 : 0;
    const pmiLabel = loanType === 'fha' ? 'MIP' : 'PMI';

    const minDown = loanType === 'fha' ? 3.5 : loanType === 'va' ? 0 : loanType === 'jumbo' ? 20 : 3;

    // When switching tabs — enforce min down and reset VA FF default
    function switchTab(next: 'conventional' | 'fha' | 'va' | 'jumbo') {
        setLoanType(next);
        if (next === 'fha'   && downPct < 3.5)  setDownPct(3.5);
        if (next === 'conventional' && downPct < 3) setDownPct(3);
        if (next === 'jumbo' && downPct < 20)   setDownPct(20);
        if (next === 'va') setVaFfPct(initFfPct);
    }

    return (
        <div className="isc">

            {/* ── Header ── */}
            <div className="isc__hdr">
                <span className="isc__hdr-label">Adjust &amp; Explore</span>
                <div className="isc__type">
                    <button
                        className={`isc__type-btn${loanType === 'conventional' ? ' isc__type-btn--on' : ''}`}
                        onClick={() => switchTab('conventional')}
                    >Conventional</button>
                    <button
                        className={`isc__type-btn${loanType === 'fha' ? ' isc__type-btn--on' : ''}`}
                        onClick={() => switchTab('fha')}
                    >FHA</button>
                    <button
                        className={`isc__type-btn isc__type-btn--va${loanType === 'va' ? ' isc__type-btn--on' : ''}`}
                        onClick={() => switchTab('va')}
                    >VA</button>
                    <button
                        className={`isc__type-btn isc__type-btn--jumbo${loanType === 'jumbo' ? ' isc__type-btn--on' : ''}`}
                        onClick={() => switchTab('jumbo')}
                    >Jumbo</button>
                </div>
            </div>

            {/* ── Payment hero ── */}
            <div className="isc__hero">
                <div className="isc__payment">
                    <span className="isc__amount">{fmtDollar(total)}</span>
                    <span className="isc__per">/mo</span>
                </div>

                {loanType === 'va' && (
                    <div className="isc__va-badge">🎖️ No PMI · Funding fee {vaFfPct === 0 ? 'exempt' : `${vaFfPct}%`} ({vaFfPct === 0 ? '$0' : fmtDollar(fundingFee)}) rolled in</div>
                )}
                {loanType === 'jumbo' && (
                    <div className="isc__jumbo-badge">🏛️ Jumbo · No PMI · 20% min down · Up to $5M</div>
                )}

                {/* Stacked bar */}
                <div className="isc__bar">
                    <div style={{ width: `${piPct}%`,  background: C.pi,  height: '100%', minWidth: 2, transition: 'width .2s' }} />
                    <div style={{ width: `${taxPct}%`, background: C.tax, height: '100%', minWidth: 2, transition: 'width .2s' }} />
                    <div style={{ width: `${insPct}%`, background: C.ins, height: '100%', minWidth: 2, transition: 'width .2s' }} />
                    {pmi > 0 && <div style={{ width: `${pmiPct}%`, background: C.pmi, height: '100%', minWidth: 2, transition: 'width .2s' }} />}
                </div>

                {/* Legend */}
                <div className="isc__legend">
                    {([
                        { color: C.pi,  name: 'P&I',      val: pi  },
                        { color: C.tax, name: 'Tax',       val: tax },
                        { color: C.ins, name: 'Insurance', val: ins },
                        ...(pmi > 0 ? [{ color: C.pmi, name: pmiLabel, val: pmi }] : []),
                    ] as { color: string; name: string; val: number }[]).map(item => (
                        <div key={item.name} className="isc__legend-item">
                            <span className="isc__dot" style={{ background: item.color }} />
                            <span className="isc__legend-name">{item.name}</span>
                            <span className="isc__legend-val">{fmtDollar(item.val)}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Sliders ── */}
            <div className="isc__sliders">

                {/* Home Price */}
                <div className="isc__row">
                    <div className="isc__row-hdr">
                        <span className="isc__row-name">Home Price</span>
                        <span className="isc__row-val">{fmtDollar(price)}</span>
                    </div>
                    <input type="range" className="isc__range"
                        min={100000} max={priceMax} step={5000} value={price}
                        onChange={e => setPrice(+e.target.value)}
                        style={trackStyle(price, 100000, priceMax)} />
                    <div className="isc__minmax"><span>$100k</span><span>{priceMaxLabel}</span></div>
                </div>

                {/* Down Payment */}
                <div className="isc__row">
                    <div className="isc__row-hdr">
                        <span className="isc__row-name">Down Payment</span>
                        <span className="isc__row-val">{downPct}% · {fmtDollar(downAmt)}</span>
                    </div>
                    <input type="range" className="isc__range"
                        min={minDown} max={50} step={loanType === 'va' ? 1 : 0.5} value={downPct}
                        onChange={e => setDownPct(+e.target.value)}
                        style={trackStyle(downPct, minDown, 50)} />
                    <div className="isc__minmax">
                        <span>{loanType === 'va' ? '0%' : loanType === 'jumbo' ? '20%' : `${minDown}%`}</span>
                        <span>50%</span>
                    </div>
                </div>

                {/* VA Funding Fee toggle — only when VA tab active */}
                {loanType === 'va' && (
                    <div className="isc__row">
                        <div className="isc__row-hdr">
                            <span className="isc__row-name">Funding Fee</span>
                            <span className="isc__row-val">
                                {vaFfPct === 0 ? 'Exempt · $0' : `${vaFfPct}% · ${fmtDollar(fundingFee)}`}
                            </span>
                        </div>
                        <div className="isc__terms">
                            {VA_FF_OPTIONS.map(opt => (
                                <button key={opt.pct}
                                    className={`isc__term${vaFfPct === opt.pct ? ' isc__term--on isc__term--va' : ''}`}
                                    onClick={() => setVaFfPct(opt.pct)}
                                >{opt.label}</button>
                            ))}
                        </div>
                        <div className="isc__ff-hint">First use: 0% down=2.15% · 5%+ down=1.50% · 10%+ down=1.25% · Disability=Exempt</div>
                    </div>
                )}

                {/* Interest Rate */}
                <div className="isc__row">
                    <div className="isc__row-hdr">
                        <span className="isc__row-name">Interest Rate</span>
                        <span className="isc__row-val">{fmtRate(rate)}</span>
                    </div>
                    <input type="range" className="isc__range"
                        min={3} max={12} step={0.125} value={rate}
                        onChange={e => setRate(+e.target.value)}
                        style={trackStyle(rate, 3, 12)} />
                    <div className="isc__minmax"><span>3%</span><span>12%</span></div>
                </div>

                {/* Loan Term */}
                <div className="isc__row">
                    <div className="isc__row-hdr">
                        <span className="isc__row-name">Loan Term</span>
                    </div>
                    <div className="isc__terms">
                        {([15, 20, 30] as const).map(t => (
                            <button key={t}
                                className={`isc__term${term === t ? ' isc__term--on' : ''}`}
                                onClick={() => setTerm(t)}
                            >{t}yr</button>
                        ))}
                    </div>
                </div>

            </div>

            {/* ── Footer stats ── */}
            <div className="isc__foot">
                <div className="isc__foot-stats">
                    <div className="isc__stat">
                        <span className="isc__stat-label">Loan Amount</span>
                        <span className="isc__stat-val">{fmtDollar(loanAmt)}</span>
                    </div>
                    {loanType === 'va' && fundingFee > 0 && (
                        <div className="isc__stat">
                            <span className="isc__stat-label">Base Loan</span>
                            <span className="isc__stat-val">{fmtDollar(baseLoan)}</span>
                        </div>
                    )}
                    <div className="isc__stat">
                        <span className="isc__stat-label">LTV</span>
                        <span className="isc__stat-val">{ltv.toFixed(1)}%{ltv <= 80 ? ' ✓' : ''}</span>
                    </div>
                    <div className="isc__stat">
                        <span className="isc__stat-label">Total Interest ({term}yr)</span>
                        <span className="isc__stat-val">{fmtDollar(totalInterest)}</span>
                    </div>
                </div>
                <div className="isc__actions">
                    {props.onRunScenario && isDirty && (
                        <button
                            className="isc__rerun"
                            onClick={() => props.onRunScenario!(buildSeed(), getRunOverrides())}
                        >
                            Run adjusted scenario →
                        </button>
                    )}
                    <PdfDownloadButton
                        type={loanType === 'va' ? 'va' : loanType === 'jumbo' ? 'jumbo' : loanType}
                        getParams={() => ({ price, downPct, rate, term, taxRate: props.taxRate, insRate: props.insRate, loanType, vaFundingFeePct: vaFfPct })}
                    />
                </div>
            </div>

            {/* ── Styles ── */}
            <style>{`
                .isc {
                    border: 1px solid #e2e8f0;
                    border-radius: 16px;
                    overflow: hidden;
                    background: #fff;
                    margin-top: 14px;
                    font-family: system-ui, -apple-system, sans-serif;
                    color: #0f172a;
                }

                /* Header */
                .isc__hdr {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 18px;
                    border-bottom: 1px solid #f1f5f9;
                }
                .isc__hdr-label {
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    color: #94a3b8;
                }
                .isc__type {
                    display: flex;
                    gap: 3px;
                    background: #f1f5f9;
                    border-radius: 8px;
                    padding: 3px;
                }
                .isc__type-btn {
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
                .isc__type-btn--on {
                    background: #fff;
                    color: #0f172a;
                    box-shadow: 0 1px 4px rgba(0,0,0,.12);
                }
                .isc__type-btn--va.isc__type-btn--on {
                    color: #dc2626;
                }
                .isc__type-btn--jumbo.isc__type-btn--on {
                    color: #7c3aed;
                }

                /* VA badge */
                .isc__va-badge {
                    font-size: 11px;
                    font-weight: 600;
                    color: #dc2626;
                    background: #fff5f5;
                    border: 1px solid #fecaca;
                    border-radius: 6px;
                    padding: 5px 10px;
                    margin-bottom: 12px;
                    letter-spacing: 0.01em;
                }

                /* Jumbo badge */
                .isc__jumbo-badge {
                    font-size: 11px;
                    font-weight: 600;
                    color: #7c3aed;
                    background: #f5f3ff;
                    border: 1px solid #ddd6fe;
                    border-radius: 6px;
                    padding: 5px 10px;
                    margin-bottom: 12px;
                    letter-spacing: 0.01em;
                }

                /* Hero */
                .isc__hero {
                    background: #f8fafc;
                    padding: 18px 18px 14px;
                    border-bottom: 1px solid #e2e8f0;
                }
                .isc__payment {
                    display: flex;
                    align-items: baseline;
                    gap: 6px;
                    margin-bottom: 14px;
                }
                .isc__amount {
                    font-size: clamp(2rem, 5vw, 2.6rem);
                    font-weight: 800;
                    color: #0f172a;
                    letter-spacing: -0.04em;
                    font-variant-numeric: tabular-nums;
                    transition: color .15s;
                }
                .isc__per {
                    font-size: .9rem;
                    color: #64748b;
                    font-weight: 500;
                }

                /* Stacked bar */
                .isc__bar {
                    display: flex;
                    height: 10px;
                    border-radius: 9999px;
                    overflow: hidden;
                    background: #e2e8f0;
                    margin-bottom: 12px;
                    gap: 1px;
                }

                /* Legend */
                .isc__legend {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px 14px;
                }
                .isc__legend-item {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                .isc__dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }
                .isc__legend-name {
                    font-size: 11px;
                    font-weight: 600;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: .04em;
                }
                .isc__legend-val {
                    font-size: 12px;
                    font-weight: 700;
                    color: #0f172a;
                    font-variant-numeric: tabular-nums;
                }

                /* Sliders section */
                .isc__sliders {
                    padding: 16px 18px;
                    display: flex;
                    flex-direction: column;
                    gap: 18px;
                }
                .isc__row {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .isc__row-hdr {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .isc__row-name {
                    font-size: 13px;
                    font-weight: 600;
                    color: #374151;
                }
                .isc__row-val {
                    font-size: 13px;
                    font-weight: 700;
                    color: #0f172a;
                    font-variant-numeric: tabular-nums;
                }
                .isc__minmax {
                    display: flex;
                    justify-content: space-between;
                    font-size: 10px;
                    color: #94a3b8;
                    font-weight: 500;
                }
                .isc__ff-hint {
                    font-size: 10px;
                    color: #94a3b8;
                    line-height: 1.4;
                }

                /* Custom range input */
                .isc__range {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 100%;
                    height: 6px;
                    border-radius: 9999px;
                    outline: none;
                    cursor: pointer;
                }
                .isc__range::-webkit-slider-thumb {
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
                .isc__range::-webkit-slider-thumb:hover {
                    box-shadow: 0 0 0 3px rgba(16,185,129,.25), 0 3px 10px rgba(16,185,129,.4);
                }
                .isc__range::-moz-range-thumb {
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    background: #10b981;
                    border: 3px solid #fff;
                    box-shadow: 0 0 0 1.5px #10b981;
                    cursor: pointer;
                }
                .isc__range:active::-webkit-slider-thumb {
                    box-shadow: 0 0 0 5px rgba(16,185,129,.2), 0 3px 10px rgba(16,185,129,.5);
                }

                /* Term / FF toggle */
                .isc__terms {
                    display: flex;
                    gap: 8px;
                }
                .isc__term {
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
                .isc__term--on {
                    border-color: #10b981;
                    color: #065f46;
                    background: #f0fdf4;
                }
                .isc__term--va.isc__term--on {
                    border-color: #dc2626;
                    color: #7f1d1d;
                    background: #fff5f5;
                }
                .isc__term:hover:not(.isc__term--on) {
                    border-color: #94a3b8;
                    color: #374151;
                }

                /* Footer */
                .isc__foot {
                    padding: 12px 18px;
                    background: #f8fafc;
                    border-top: 1px solid #e2e8f0;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    flex-wrap: wrap;
                }
                .isc__foot-stats {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px 28px;
                }
                .isc__stat {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .isc__stat-label {
                    font-size: 10px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: .06em;
                    color: #94a3b8;
                }
                .isc__stat-val {
                    font-size: 13px;
                    font-weight: 700;
                    color: #0f172a;
                    font-variant-numeric: tabular-nums;
                }
                .isc__actions {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                    flex-wrap: wrap;
                }
                .isc__rerun {
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
                .isc__rerun:hover { background: #1e293b; }
                .isc__rerun:active { transform: scale(.97); }

                @media (max-width: 480px) {
                    .isc__amount { font-size: 1.9rem; }
                    .isc__legend { gap: 5px 10px; }
                    .isc__legend-name { font-size: 10px; }
                    .isc__terms { gap: 5px; }
                    .isc__term { font-size: 11px; padding: 8px 0; }
                }
            `}</style>
        </div>
    );
}
