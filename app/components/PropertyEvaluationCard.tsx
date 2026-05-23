'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

// ── Math helpers ───────────────────────────────────────────────────────────────

function calcPI(principal: number, annualRate: number, termYears: number): number {
    if (principal <= 0) return 0;
    if (annualRate <= 0) return principal / (termYears * 12);
    const r = annualRate / 100 / 12;
    const n = termYears * 12;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function fmt$(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtK(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2)}M`;
    if (n >= 1_000)     return `$${Math.round(n / 1000)}K`;
    return fmt$(n);
}

function computeL1(ltv: number, loanType: string): { score: number; summary: string } {
    let score: number;
    if (loanType === 'va') {
        score = ltv <= 80 ? 88 : 78;
    } else if (loanType === 'fha') {
        score = ltv <= 90 ? 72 : ltv <= 95 ? 65 : 58;
    } else {
        // conventional / jumbo
        score = ltv <= 80 ? 85 : ltv <= 85 ? 75 : ltv <= 90 ? 65 : ltv <= 95 ? 55 : 45;
    }
    const ltvLabel = ltv <= 80 ? 'Strong equity' : ltv <= 90 ? 'Moderate equity' : 'High LTV';
    const loanLabel = loanType === 'va' ? 'VA' : loanType === 'fha' ? 'FHA' : loanType === 'jumbo' ? 'Jumbo' : 'Conv.';
    return {
        score,
        summary: `${loanLabel} ${Math.round(ltv)}% LTV · ${ltvLabel}`,
    };
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface PropertyEvaluationProps {
    purchasePrice:  number;          // Starting offer price (from scenario card)
    listPrice?:     number;          // List price if known
    downPct:        number;
    rate:           number;
    termYrs:        number;
    loanType:       'conventional' | 'fha' | 'va' | 'jumbo';
    taxRate:        number;
    insRate:        number;
    // Pre-computed from scenario (used as initial values)
    monthlyPiti:    number;
    loanAmt:        number;
    ltv:            number;
    hasPmi:         boolean;
    pmiMonthly?:    number;
    income43:       number;
    reserves6mo?:   number;
    // Context
    address?:       string;
    avm?:           number;
    onRunScenario?: (seed: string, overrides: Record<string, unknown>) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PropertyEvaluationCard(props: PropertyEvaluationProps) {
    const router = useRouter();

    const [offerPrice, setOfferPrice] = useState(props.purchasePrice);
    const [editing,    setEditing]    = useState(false);
    const [inputVal,   setInputVal]   = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // ── Live recompute on offer price change ───────────────────────────────────

    const downAmt     = offerPrice * props.downPct / 100;
    const baseLoan    = offerPrice - downAmt;
    // simplified: doesn't re-add UFMIP/VA fee on change (close enough for evaluation card)
    const curLoanAmt  = baseLoan;
    const curLtv      = (curLoanAmt / offerPrice) * 100;
    const curPI       = calcPI(curLoanAmt, props.rate, props.termYrs);
    const curTax      = (offerPrice * props.taxRate) / 12;
    const curIns      = (offerPrice * props.insRate) / 12;
    const curPmi      = curLtv > 80 && props.loanType !== 'va' && props.loanType !== 'fha'
        ? (curLoanAmt * 0.008) / 12 : (props.pmiMonthly ?? 0);
    const curMip      = props.loanType === 'fha' ? (props.pmiMonthly ?? 0) : 0; // keep MIP stable
    const curPiti     = Math.round(curPI + curTax + curIns + curPmi + curMip);
    const curIncome43 = Math.round((curPiti / 0.43) * 12);
    const curHasPmi   = curLtv > 80 && props.loanType !== 'va';
    const closingCost = Math.round(offerPrice * 0.025);
    const cashToClose = Math.round(downAmt + closingCost);

    // AVM comparison
    const avmDelta    = props.avm ? ((offerPrice - props.avm) / props.avm) * 100 : null;
    const avmLabel    = avmDelta != null
        ? (avmDelta > 0 ? `+${avmDelta.toFixed(1)}% over value` : `${avmDelta.toFixed(1)}% under value`)
        : null;

    // Offer vs list
    const listDelta   = props.listPrice ? offerPrice - props.listPrice : null;
    const listDeltaPct = props.listPrice ? ((offerPrice - props.listPrice) / props.listPrice) * 100 : null;

    // L1 score
    const l1 = computeL1(curLtv, props.loanType);


    // Loan type label
    const loanLabel = props.loanType === 'va' ? 'VA' : props.loanType === 'fha' ? 'FHA' : props.loanType === 'jumbo' ? 'Jumbo' : 'Conv.';
    const ACCENT = '#7ef4f4';
    const ACCENT_DIM = 'rgba(126,244,244,0.18)';
    const ACCENT_BORDER = 'rgba(126,244,244,0.28)';

    // ── Handlers ──────────────────────────────────────────────────────────────

    function startEdit() {
        setInputVal(String(Math.round(offerPrice)));
        setEditing(true);
        setTimeout(() => inputRef.current?.select(), 0);
    }

    function commitEdit() {
        const raw = Number(inputVal.replace(/[^0-9.]/g, ''));
        if (raw >= 100_000 && raw <= 50_000_000) setOfferPrice(raw);
        setEditing(false);
    }

    function firePayment() {
        if (!props.onRunScenario) return;
        const seed = `Show full ${loanLabel} payment breakdown for ${fmtK(offerPrice)}, ${props.downPct}% down at ${props.rate.toFixed(2)}%`;
        const overrides: Record<string, unknown> = {
            purchasePrice: offerPrice, downPaymentPct: props.downPct,
            annualRatePct: props.rate, termYears: props.termYrs,
            loanType: props.loanType,
        };
        if (props.loanType === 'jumbo') overrides.isJumbo = true;
        if (props.loanType === 'fha')   overrides.isFHA   = true;
        if (props.loanType === 'va')    overrides.loanType = 'va';
        props.onRunScenario(seed, overrides);
    }

    function fireIncome() {
        if (!props.onRunScenario) return;
        props.onRunScenario('Full Income Analysis', {
            isIncomeQualify: true,
            purchasePrice:   offerPrice,
            downPaymentPct:  props.downPct,
            annualRatePct:   props.rate,
            termYears:       props.termYrs,
            loanType:        props.loanType,
        });
    }

    function fireValue() {
        if (props.address) {
            router.push(`/property-intel?address=${encodeURIComponent(props.address)}`);
        } else if (props.onRunScenario) {
            props.onRunScenario('Run a property value analysis', { isPropertyIntel: true });
        }
    }

    function fireCompare() {
        if (!props.onRunScenario) return;
        const alt = props.loanType === 'jumbo' ? 'High Balance conventional' : 'Jumbo';
        props.onRunScenario(
            `Compare ${loanLabel} vs ${alt} for ${fmtK(offerPrice)}, ${props.downPct}% down`,
            { purchasePrice: offerPrice, downPaymentPct: props.downPct, annualRatePct: props.rate,
              termYears: props.termYrs, loanType: props.loanType === 'jumbo' ? 'conventional' : 'jumbo' },
        );
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="pec">
            <style>{`
                .pec {
                    background: #0b111e;
                    border: 1px solid ${ACCENT_BORDER};
                    border-radius: 16px;
                    overflow: hidden;
                    font-family: var(--font-dm-sans, "DM Sans", system-ui, sans-serif);
                    margin-top: 4px;
                }
                .pec-header {
                    padding: 14px 18px 10px;
                    border-bottom: 1px solid rgba(126,244,244,0.1);
                    background: rgba(126,244,244,0.04);
                }
                .pec-eyebrow {
                    font-size: 9px; font-weight: 800; letter-spacing: .1em;
                    text-transform: uppercase; color: ${ACCENT}; margin-bottom: 3px;
                }
                .pec-address {
                    font-size: 13px; font-weight: 600; color: #e2f0f0;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .pec-offer {
                    padding: 16px 18px 12px;
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                }
                .pec-offer-label {
                    font-size: 9px; font-weight: 800; letter-spacing: .09em;
                    text-transform: uppercase; color: #8fa3b8; margin-bottom: 6px;
                }
                .pec-offer-row { display: flex; align-items: center; gap: 10px; }
                .pec-offer-price {
                    font-size: 28px; font-weight: 800; color: ${ACCENT};
                    cursor: pointer; line-height: 1;
                }
                .pec-offer-input {
                    font-size: 28px; font-weight: 800; color: ${ACCENT};
                    background: rgba(126,244,244,0.08); border: 1px solid ${ACCENT_BORDER};
                    border-radius: 8px; padding: 2px 8px; width: 200px;
                    outline: none; font-family: inherit; line-height: 1;
                }
                .pec-offer-edit {
                    font-size: 11px; color: ${ACCENT}; opacity: .6;
                    cursor: pointer; padding: 4px 8px; border: 1px solid ${ACCENT_BORDER};
                    border-radius: 6px; background: none; font-family: inherit;
                    transition: opacity .15s; white-space: nowrap;
                }
                .pec-offer-edit:hover { opacity: 1; }
                .pec-offer-sub {
                    font-size: 11px; color: #8fa3b8; margin-top: 4px;
                }
                .pec-offer-sub strong { color: #c4cfe0; }
                .pec-grid {
                    display: grid; grid-template-columns: 1fr 1fr;
                    gap: 0; border-bottom: 1px solid rgba(255,255,255,0.06);
                }
                .pec-stat {
                    padding: 14px 18px;
                    border-right: 1px solid rgba(255,255,255,0.06);
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                }
                .pec-stat:nth-child(even) { border-right: none; }
                .pec-stat:nth-last-child(-n+2) { border-bottom: none; }
                .pec-stat-val {
                    font-size: 18px; font-weight: 800; color: #f0f4ff; line-height: 1.1;
                }
                .pec-stat-val--accent { color: ${ACCENT}; }
                .pec-stat-val--warn { color: #f59e0b; }
                .pec-stat-label {
                    font-size: 9px; font-weight: 700; letter-spacing: .08em;
                    text-transform: uppercase; color: #8fa3b8; margin-top: 4px;
                }
                .pec-stat-sub { font-size: 11px; color: #8fa3b8; margin-top: 2px; }
                .pec-stat-sub--good { color: #00e87a; }
                .pec-stat-sub--warn { color: #f59e0b; }
                .pec-links {
                    display: grid; grid-template-columns: 1fr 1fr;
                    gap: 8px; padding: 14px 18px;
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                }
                .pec-link-btn {
                    padding: 9px 6px; border-radius: 8px; font-size: 12px;
                    font-weight: 700; cursor: pointer; font-family: inherit;
                    text-align: center; transition: all .15s;
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.1);
                    color: #c4cfe0;
                }
                .pec-link-btn:hover { background: rgba(255,255,255,0.07); border-color: rgba(255,255,255,0.22); }
                .pec-score-cta {
                    margin: 14px 18px 18px;
                    display: block; width: calc(100% - 0px);
                    padding: 13px 0;
                    background: linear-gradient(135deg, rgba(126,244,244,0.15), rgba(126,244,244,0.08));
                    border: 1.5px solid ${ACCENT_BORDER};
                    border-radius: 10px;
                    color: ${ACCENT};
                    font-size: 14px; font-weight: 800;
                    cursor: pointer; font-family: inherit; text-align: center;
                    letter-spacing: .02em; transition: all .15s;
                }
                .pec-score-cta:hover { background: rgba(126,244,244,0.2); border-color: ${ACCENT}; }
                .pec-l1-note {
                    font-size: 11px; color: #8fa3b8; text-align: center;
                    margin: -8px 18px 14px;
                }
            `}</style>

            {/* Header */}
            <div className="pec-header">
                <div className="pec-eyebrow">Purchase Evaluation · {loanLabel} · {props.termYrs}yr Fixed</div>
                <div className="pec-address">
                    {props.address ?? 'Property Purchase Summary'}
                </div>
            </div>

            {/* Offer Price */}
            <div className="pec-offer">
                <div className="pec-offer-label">Offer Price</div>
                <div className="pec-offer-row">
                    {editing ? (
                        <input
                            ref={inputRef}
                            className="pec-offer-input"
                            value={inputVal}
                            onChange={e => setInputVal(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
                        />
                    ) : (
                        <span className="pec-offer-price" onClick={startEdit} title="Click to adjust offer price">
                            {fmt$(Math.round(offerPrice))}
                        </span>
                    )}
                    {!editing && (
                        <button className="pec-offer-edit" onClick={startEdit}>✏ Adjust</button>
                    )}
                </div>
                {props.listPrice && (
                    <div className="pec-offer-sub">
                        List <strong>{fmt$(props.listPrice)}</strong>
                        {listDelta != null && (
                            <span style={{ color: listDelta <= 0 ? '#00e87a' : '#f59e0b', marginLeft: 6 }}>
                                {listDelta <= 0 ? '↓' : '↑'} {fmt$(Math.abs(listDelta))}
                                {listDeltaPct != null && <> ({Math.abs(listDeltaPct).toFixed(1)}% {listDelta <= 0 ? 'under' : 'over'} list)</>}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* 6-stat grid */}
            <div className="pec-grid">

                {/* Monthly PITI */}
                <div className="pec-stat">
                    <div className="pec-stat-val pec-stat-val--accent">{fmt$(curPiti)}/mo</div>
                    <div className="pec-stat-label">Monthly PITI</div>
                    <div className="pec-stat-sub">{props.rate.toFixed(2)}% · {props.termYrs}yr</div>
                </div>

                {/* Income to qualify */}
                <div className="pec-stat">
                    <div className="pec-stat-val">{fmtK(curIncome43)}/yr</div>
                    <div className="pec-stat-label">Min. to Qualify</div>
                    <div className="pec-stat-sub">@ 43% DTI gross</div>
                </div>

                {/* Loan amount */}
                <div className="pec-stat">
                    <div className="pec-stat-val">{fmtK(Math.round(curLoanAmt))}</div>
                    <div className="pec-stat-label">Loan Amount</div>
                    <div className="pec-stat-sub">{props.downPct}% down · {fmtK(Math.round(downAmt))}</div>
                </div>

                {/* LTV + PMI */}
                <div className="pec-stat">
                    <div className="pec-stat-val">{curLtv.toFixed(1)}% LTV</div>
                    <div className="pec-stat-label">Equity Position</div>
                    <div className={`pec-stat-sub pec-stat-sub--${!curHasPmi || props.loanType === 'va' ? 'good' : 'warn'}`}>
                        {props.loanType === 'va' ? 'No PMI · VA' : !curHasPmi ? 'No PMI ✓' : `PMI ~${fmt$(Math.round(curPmi))}/mo`}
                    </div>
                </div>

                {/* Cash to close */}
                <div className="pec-stat">
                    <div className="pec-stat-val pec-stat-val--warn">{fmtK(cashToClose)}</div>
                    <div className="pec-stat-label">Cash to Close</div>
                    <div className="pec-stat-sub">Down + ~2.5% closing est.</div>
                </div>

                {/* AVM or reserves */}
                <div className="pec-stat">
                    {props.avm ? (
                        <>
                            <div className="pec-stat-val">{fmtK(props.avm)}</div>
                            <div className="pec-stat-label">AVM Value</div>
                            <div className={`pec-stat-sub pec-stat-sub--${avmDelta != null && avmDelta > 5 ? 'warn' : avmDelta != null && avmDelta < 0 ? 'good' : ''}`}>
                                {avmLabel ?? '—'}
                            </div>
                        </>
                    ) : props.reserves6mo ? (
                        <>
                            <div className="pec-stat-val">{fmtK(Math.round(props.reserves6mo))}</div>
                            <div className="pec-stat-label">6-mo Reserves</div>
                            <div className="pec-stat-sub">{props.loanType === 'jumbo' ? 'Jumbo requirement' : 'Recommended'}</div>
                        </>
                    ) : (
                        <>
                            <div className="pec-stat-val" style={{ color: '#8fa3b8' }}>—</div>
                            <div className="pec-stat-label">AVM / Value</div>
                            <div className="pec-stat-sub">Run Property Value ↗</div>
                        </>
                    )}
                </div>

            </div>

            {/* Link-out buttons */}
            {props.onRunScenario && (
                <div className="pec-links">
                    <button className="pec-link-btn" onClick={firePayment}>💳 Full Payment →</button>
                    <button className="pec-link-btn" onClick={fireIncome}>💰 Income Analysis →</button>
                    <button className="pec-link-btn" onClick={fireValue}>
                        {props.address ? '🏠 Property Value →' : '🏠 Value Analysis →'}
                    </button>
                    <button className="pec-link-btn" onClick={fireCompare}>⇄ Compare Loans →</button>
                </div>
            )}


        </div>
    );
}
