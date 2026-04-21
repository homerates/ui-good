'use client';

// app/components/VAEntitlementCalc.tsx
// Interactive VA Entitlement Calculator — first use + subsequent use toggle

import React, { useState, useMemo } from 'react';

const f$ = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fPct = (n: number) => `${n.toFixed(2)}%`;

// 2026 conforming baseline
const BASELINE = 832750;

// VA funding fee tables
const FF_FIRST: Record<string, number>     = { '0':  2.15, '5':  1.5,  '10': 1.25 };
const FF_SUBSEQUENT: Record<string, number> = { '0':  3.3,  '5':  1.5,  '10': 1.25 };

function ffPct(downPct: number, subsequent: boolean): number {
    const tbl = subsequent ? FF_SUBSEQUENT : FF_FIRST;
    if (downPct >= 10) return tbl['10'];
    if (downPct >= 5)  return tbl['5'];
    return tbl['0'];
}

function monthlyPI(loan: number, rate: number, termYrs: number): number {
    const r = rate / 100 / 12;
    const n = termYrs * 12;
    if (r === 0) return Math.round(loan / n);
    return Math.round(loan * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
}

interface Slider { label: string; min: number; max: number; step: number; value: number; set: (v: number) => void; fmt: (v: number) => string }

function SliderRow({ label, min, max, step, value, set, fmt }: Slider) {
    return (
        <div className="vac__row">
            <div className="vac__row-top">
                <span className="vac__row-label">{label}</span>
                <span className="vac__row-val">{fmt(value)}</span>
            </div>
            <input type="range" min={min} max={max} step={step} value={value}
                onChange={e => set(parseFloat(e.target.value))} className="vac__range" />
            <div className="vac__row-ends"><span>{fmt(min)}</span><span>{fmt(max)}</span></div>
        </div>
    );
}

export default function VAEntitlementCalc({ countyLimit: initLimit = BASELINE }: { countyLimit?: number }) {
    const [price,    setPrice]    = useState(600000);
    const [rate,     setRate]     = useState(6.75);
    const [term,     setTerm]     = useState(30);
    const [taxRate,  setTaxRate]  = useState(1.2);
    const [isSubseq, setIsSubseq] = useState(false);
    const [prior,    setPrior]    = useState(300000);
    const [isExempt, setIsExempt] = useState(false);
    const [countyLimitIn, setCountyLimitIn] = useState(initLimit);

    const calc = useMemo(() => {
        // Entitlement math
        const totalEnt   = Math.round(countyLimitIn * 0.25);
        const usedEnt    = isSubseq ? Math.round(prior * 0.25) : 0;
        const remaining  = Math.max(0, totalEnt - usedEnt);
        const maxZeroDn  = remaining * 4;

        // Down payment
        const required   = Math.round(price * 0.25);
        const dpNeeded   = isSubseq ? Math.max(0, required - remaining) : 0;
        const dpPct      = price > 0 ? (dpNeeded / price) * 100 : 0;
        const baseLoan   = price - dpNeeded;
        const isJumbo    = baseLoan > countyLimitIn;

        // Funding fee
        const ff         = isExempt ? 0 : ffPct(dpPct, isSubseq);
        const ffAmt      = Math.round(baseLoan * ff / 100);
        const totalLoan  = baseLoan + ffAmt;

        // Payment
        const pi         = monthlyPI(totalLoan, rate, term);
        const tax        = Math.round(price * taxRate / 100 / 12);
        const ins        = Math.round(price * 0.35 / 100 / 12);
        const total      = pi + tax + ins;

        return { totalEnt, usedEnt, remaining, maxZeroDn, dpNeeded, dpPct, baseLoan, isJumbo, ff, ffAmt, totalLoan, pi, tax, ins, total };
    }, [price, rate, term, taxRate, isSubseq, prior, isExempt, countyLimitIn]);

    const { totalEnt, usedEnt, remaining, maxZeroDn, dpNeeded, dpPct, baseLoan, isJumbo, ff, ffAmt, totalLoan, pi, tax, ins, total } = calc;

    return (
        <div className="vac">
            <style>{`
            .vac { background:#0f172a; border-radius:16px; padding:24px; color:#f1f5f9; font-family:inherit; max-width:680px; }
            .vac__title { font-size:1.05rem; font-weight:700; color:#f1f5f9; margin-bottom:4px; }
            .vac__sub { font-size:.8rem; color:#94a3b8; margin-bottom:20px; }
            .vac__tabs { display:flex; gap:6px; margin-bottom:20px; }
            .vac__tab { flex:1; padding:8px 0; border-radius:8px; border:1.5px solid #1e293b; background:transparent; color:#94a3b8; font-size:.82rem; font-weight:600; cursor:pointer; transition:.15s; }
            .vac__tab--on { background:#1e40af; border-color:#3b82f6; color:#fff; }
            .vac__section { background:#1e293b; border-radius:10px; padding:16px; margin-bottom:12px; }
            .vac__section-title { font-size:.78rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.06em; margin-bottom:12px; }
            .vac__row { margin-bottom:14px; }
            .vac__row:last-child { margin-bottom:0; }
            .vac__row-top { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:4px; }
            .vac__row-label { font-size:.82rem; color:#94a3b8; }
            .vac__row-val { font-size:.9rem; font-weight:700; color:#f1f5f9; }
            .vac__range { width:100%; accent-color:#3b82f6; height:4px; cursor:pointer; }
            .vac__row-ends { display:flex; justify-content:space-between; font-size:.72rem; color:#475569; margin-top:2px; }
            .vac__toggle-row { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
            .vac__toggle-label { font-size:.82rem; color:#94a3b8; }
            .vac__check { accent-color:#3b82f6; width:16px; height:16px; cursor:pointer; }
            .vac__results { background:#0f172a; border:1.5px solid #1e293b; border-radius:10px; padding:16px; margin-top:4px; }
            .vac__results-title { font-size:.78rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.06em; margin-bottom:12px; }
            .vac__grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
            .vac__stat { background:#1e293b; border-radius:8px; padding:10px 12px; }
            .vac__stat-label { font-size:.72rem; color:#64748b; margin-bottom:2px; }
            .vac__stat-val { font-size:.95rem; font-weight:700; color:#f1f5f9; }
            .vac__stat--highlight .vac__stat-val { color:#34d399; }
            .vac__stat--warn .vac__stat-val { color:#f59e0b; }
            .vac__stat--full { grid-column:1/-1; }
            .vac__divider { height:1px; background:#1e293b; margin:12px 0; }
            .vac__ent-table { width:100%; border-collapse:collapse; margin-top:8px; }
            .vac__ent-table td { padding:5px 0; font-size:.82rem; }
            .vac__ent-table td:first-child { color:#94a3b8; }
            .vac__ent-table td:last-child { text-align:right; font-weight:600; color:#f1f5f9; }
            .vac__ent-table tr.highlight td { color:#34d399; font-weight:700; }
            .vac__badge { display:inline-block; padding:2px 8px; border-radius:20px; font-size:.72rem; font-weight:700; }
            .vac__badge--ok { background:#064e3b; color:#34d399; }
            .vac__badge--warn { background:#451a03; color:#f59e0b; }
            .vac__note { font-size:.75rem; color:#64748b; margin-top:12px; line-height:1.5; }
            @media(max-width:480px){ .vac__grid{ grid-template-columns:1fr; } }
            `}</style>

            <div className="vac__title">VA Loan &amp; Entitlement Calculator</div>
            <div className="vac__sub">2026 • No PMI • No income limit</div>

            {/* First Use / Subsequent Use tabs */}
            <div className="vac__tabs">
                <button className={`vac__tab${!isSubseq ? ' vac__tab--on' : ''}`} onClick={() => setIsSubseq(false)}>
                    First Use
                </button>
                <button className={`vac__tab${isSubseq ? ' vac__tab--on' : ''}`} onClick={() => setIsSubseq(true)}>
                    Subsequent Use
                </button>
            </div>

            {/* Loan inputs */}
            <div className="vac__section">
                <div className="vac__section-title">Loan Parameters</div>
                <SliderRow label="Purchase Price" min={100000} max={2000000} step={10000} value={price} set={setPrice} fmt={f$} />
                <SliderRow label="Interest Rate" min={4.0} max={10.0} step={0.125} value={rate} set={setRate} fmt={v => fPct(v)} />
                <SliderRow label="Loan Term" min={15} max={30} step={15} value={term} set={setTerm} fmt={v => `${v} yr`} />
                <SliderRow label="Property Tax Rate" min={0.5} max={2.5} step={0.1} value={taxRate} set={setTaxRate} fmt={v => `${v.toFixed(1)}%/yr`} />
            </div>

            {/* County limit */}
            <div className="vac__section">
                <div className="vac__section-title">County Conforming Limit</div>
                <SliderRow label="2026 County Limit" min={BASELINE} max={1500000} step={1000} value={countyLimitIn} set={setCountyLimitIn} fmt={f$} />
                <div className="vac__note">Standard counties: $832,750 &nbsp;|&nbsp; High-cost (e.g. SLO): $1,000,500 &nbsp;|&nbsp; CA ceiling: $1,249,125</div>
            </div>

            {/* Prior loan (subsequent use only) */}
            {isSubseq && (
                <div className="vac__section">
                    <div className="vac__section-title">Prior VA Loan</div>
                    <SliderRow label="Prior VA Loan Balance" min={0} max={1500000} step={5000} value={prior} set={setPrior} fmt={f$} />
                    <div className="vac__note">Use the current payoff balance, or the entitlement charged amount from your COE.</div>
                </div>
            )}

            {/* Exempt toggle */}
            <div className="vac__section">
                <div className="vac__toggle-row">
                    <input type="checkbox" className="vac__check" id="vac-exempt" checked={isExempt} onChange={e => setIsExempt(e.target.checked)} />
                    <label htmlFor="vac-exempt" className="vac__toggle-label">Funding fee exempt (service-connected disability)</label>
                </div>
            </div>

            {/* Results */}
            <div className="vac__results">
                <div className="vac__results-title">Results</div>

                {isSubseq && (
                    <>
                        <table className="vac__ent-table">
                            <tbody>
                                <tr><td>Total Entitlement (25% of {f$(countyLimitIn)})</td><td>{f$(totalEnt)}</td></tr>
                                <tr><td>Entitlement Used (25% × {f$(prior)})</td><td>{f$(usedEnt)}</td></tr>
                                <tr className="highlight"><td>Remaining Entitlement</td><td>{f$(remaining)}</td></tr>
                                <tr><td>Max Loan at $0 Down</td><td>{f$(maxZeroDn)}</td></tr>
                            </tbody>
                        </table>
                        <div className="vac__divider" />
                    </>
                )}

                <div className="vac__grid">
                    <div className={`vac__stat${dpNeeded > 0 ? ' vac__stat--warn' : ' vac__stat--highlight'}`}>
                        <div className="vac__stat-label">Down Payment Needed</div>
                        <div className="vac__stat-val">{dpNeeded > 0 ? `${f$(dpNeeded)} (${dpPct.toFixed(1)}%)` : '$0'}</div>
                    </div>
                    <div className="vac__stat">
                        <div className="vac__stat-label">Base Loan</div>
                        <div className="vac__stat-val">
                            {f$(baseLoan)}&nbsp;
                            {isJumbo && <span className="vac__badge vac__badge--warn">VA Jumbo</span>}
                            {!isJumbo && <span className="vac__badge vac__badge--ok">Standard</span>}
                        </div>
                    </div>
                    <div className="vac__stat">
                        <div className="vac__stat-label">VA Funding Fee {isExempt ? '(exempt)' : `(${fPct(ff)})`}</div>
                        <div className="vac__stat-val">{isExempt ? 'Exempt' : f$(ffAmt)}</div>
                    </div>
                    <div className="vac__stat">
                        <div className="vac__stat-label">Total Loan (FF rolled in)</div>
                        <div className="vac__stat-val">{f$(totalLoan)}</div>
                    </div>
                    <div className="vac__stat vac__stat--full vac__stat--highlight">
                        <div className="vac__stat-label">Monthly PITI (P&amp;I + Tax + Insurance)</div>
                        <div className="vac__stat-val">{f$(total)}/mo</div>
                    </div>
                    <div className="vac__stat">
                        <div className="vac__stat-label">Principal &amp; Interest</div>
                        <div className="vac__stat-val">{f$(pi)}/mo</div>
                    </div>
                    <div className="vac__stat">
                        <div className="vac__stat-label">Tax + Insurance</div>
                        <div className="vac__stat-val">{f$(tax + ins)}/mo</div>
                    </div>
                </div>

                <div className="vac__note">
                    ✅ No PMI — VA loans never require private mortgage insurance.&nbsp;
                    {isSubseq && dpNeeded > 0 && '⚠️ Down payment required due to reduced entitlement. Paying off prior VA loan restores full entitlement.'}
                    {isSubseq && dpNeeded === 0 && '✅ Remaining entitlement covers 25% guaranty — no down payment required.'}
                    <br />Educational only — not a pre-approval or commitment to lend. Check with your lender.
                </div>
            </div>
        </div>
    );
}
