'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import SliderField from './SliderField';
import { COLORS } from '../../lib/tokens';
import AdminCardBadge from './AdminCardBadge';

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
    incomeToQualify: number; qualifies: boolean;
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
    const incomeToQualify = Math.ceil(((piti + debts) / 0.43) * 12 / 100) * 100;
    const qualifies = income >= incomeToQualify - 600;
    const savingsOk = savings >= cashNeeded;
    const savingsLeft = Math.abs(cashNeeded - savings);

    return { maxPrice, loan, baseLoan, ufmip, down, ltv, pi, tax, ins, mip, piti, closing, cashNeeded, savingsOk, savingsLeft, incomeToQualify, qualifies, limitCapped };
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
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AffordabilityIncomeSliderCard(props: AffordabilityIncomeSliderParams) {
    const isFHA   = props.loanType === 'fha';
    const minDown = isFHA ? 3.5 : 3;
    const TERMS   = isFHA ? ([15, 30] as const) : ([15, 20, 30] as const);
    const accent  = isFHA ? '#f59e0b' : COLORS.accent;
    const ltLabel = isFHA ? 'FHA' : 'Conventional';
    const cardCode = isFHA ? 'AFFD-011' : 'AFFD-010';

    const initDown = Math.max(minDown, props.downPct || (isFHA ? 3.5 : 20));
    const initTerm = props.term || 30;

    const [income,  setIncome]  = useState(props.annualIncome);
    const [debts,   setDebts]   = useState(props.monthlyDebts);
    const [downPct, setDownPct] = useState(initDown);
    const [rate,    setRate]    = useState(props.rate);
    const [term,    setTerm]    = useState(initTerm);

    const [commitIncome,  setCommitIncome]  = useState(props.annualIncome);
    const [commitDebts,   setCommitDebts]   = useState(props.monthlyDebts);
    const [commitDown,    setCommitDown]    = useState(initDown);
    const [commitRate,    setCommitRate]    = useState(props.rate);
    const [commitTerm,    setCommitTerm]    = useState(initTerm);

    const [drawerOpen,  setDrawerOpen]  = useState(false);
    const [drawerPhase, setDrawerPhase] = useState<'idle'|'running'|'done'>('idle');

    const router = useRouter();

    const isDirty = income !== commitIncome || debts !== commitDebts ||
        Math.abs(downPct - commitDown) > 0.01 || Math.abs(rate - commitRate) > 0.001 || term !== commitTerm;

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

    return (
        <div className="affi" style={{ position: 'relative' }}>
            <AdminCardBadge code={cardCode} />

            {/* Topbar */}
            <div className="affi-topbar">
                <div className="affi-topbar-l">
                    <div className="affi-dot" style={{ background: accent }} />
                    <span className="affi-tl">Affordability — {ltLabel}</span>
                    <span className="affi-lt-badge" style={{ color: accent, background: `${accent}18`, border: `1px solid ${accent}38` }}>
                        {ltLabel}
                    </span>
                </div>
                <span className="affi-tr">Live · CalcEngine</span>
            </div>

            {/* Hero */}
            <div className="affi-hero">
                <div className="affi-hero-label">Max Home You Can Afford</div>
                {c ? (
                    <>
                        <div className="affi-hero-amount" style={{ color: accent }}>{fmtK(c.maxPrice)}</div>
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
                    <div className="affi-hero-amount" style={{ color: '#f87171' }}>—</div>
                )}
            </div>

            {/* Savings status */}
            {c && props.savings > 0 && (
                <div className={`affi-note${c.savingsOk ? ' affi-note--ok' : ' affi-note--gap'}`}>
                    {c.savingsOk
                        ? `✓ Savings OK — ${fmtK(c.savingsLeft)} left after close`
                        : `⚠ Need ${fmtK(c.savingsLeft)} more for down + closing (${fmtK(c.cashNeeded)} total)`}
                </div>
            )}

            {/* Loan limit cap note */}
            {c?.limitCapped && (
                <div className="affi-note affi-note--warn">
                    {isFHA ? 'FHA loan limit' : 'Conforming limit'} applied in this area — income qualifies for more but program cap applies.
                    {!isFHA && ' Jumbo available above this limit.'}
                </div>
            )}

            {/* PMI note */}
            {hasPMI && (
                <div className="affi-note affi-note--dim">
                    PMI included (~0.8%/yr, est.) — drops off at 80% LTV. Bring 20% down to eliminate it.
                </div>
            )}

            {/* Adjuster drawer trigger — IQC-standard chips style */}
            <button
                className={`affi-dtrig${drawerOpen ? ' open' : ''}`}
                style={drawerOpen ? { borderColor: `${accent}50`, background: `${accent}07` } : {}}
                onClick={() => setDrawerOpen(o => !o)}
            >
                <span style={{ fontSize: 14, flexShrink: 0 }}>⚙</span>
                <span className="affi-dtrig-chips">
                    {[
                        { label: `${fmtK(income)}/yr`,       mod: income !== commitIncome },
                        { label: `${downPct}% down`,          mod: Math.abs(downPct - commitDown) > 0.01 },
                        { label: `${rate.toFixed(2)}%`,       mod: Math.abs(rate - commitRate) > 0.001 },
                        { label: `${term}yr`,                 mod: term !== commitTerm },
                        ...(debts > 0 ? [{ label: `${fmt$(debts)}/mo debts`, mod: debts !== commitDebts }] : []),
                    ].map(({ label, mod }) => (
                        <span key={label} className="affi-dchip"
                            style={mod ? { color: accent, background: `${accent}14`, borderColor: `${accent}35` } : {}}
                        >{label}</span>
                    ))}
                </span>
                <span className="affi-dtrig-lbl">{drawerOpen ? 'Close' : 'Adjust My Numbers'}</span>
                <span className="affi-dtrig-arr">{drawerOpen ? '▴' : '▾'}</span>
            </button>

            {/* Adjuster drawer */}
            <div className={`affi-drawer${drawerOpen ? ' open' : ''}`}>
                <div style={{ padding: '16px 18px', background: '#080c12' }}>
                    <SliderField
                        label="Annual Income" value={income}
                        min={30_000} max={1_000_000} step={1_000}
                        onChange={setIncome}
                        format={v => fmtK(v) + '/yr'}
                        minLabel="$30k" maxLabel="$1M"
                        trackColor={accent} theme="dark"
                    />
                    <SliderField
                        label="Monthly Debts" value={debts}
                        min={0} max={5_000} step={50}
                        onChange={setDebts}
                        format={v => v === 0 ? 'None' : fmt$(v) + '/mo'}
                        minLabel="$0" maxLabel="$5k/mo"
                        trackColor={accent} theme="dark"
                    />
                    <SliderField
                        label={`Down Payment (min ${minDown}%)`} value={downPct}
                        min={minDown} max={isFHA ? 20 : 40} step={0.5}
                        onChange={setDownPct}
                        format={v => parseFloat(v.toFixed(1)) + '%'}
                        minLabel={`${minDown}%`} maxLabel={isFHA ? '20%' : '40%'}
                        trackColor={accent} theme="dark"
                    />
                    <SliderField
                        label="Interest Rate" value={rate}
                        min={3} max={12} step={0.125}
                        onChange={setRate}
                        format={v => parseFloat(v.toFixed(3)) + '%'}
                        minLabel="3%" maxLabel="12%"
                        trackColor={accent} theme="dark"
                    />
                    <div className="affi-term-lbl">Loan Term</div>
                    <div className="affi-terms">
                        {TERMS.map(t => (
                            <button key={t} type="button"
                                className={`affi-term${term === t ? ' on' : ''}`}
                                style={term === t ? { borderColor: accent, color: accent, background: `${accent}14` } : {}}
                                onClick={() => setTerm(t)}
                            >{t}yr</button>
                        ))}
                    </div>
                    <div className="affi-dcta">
                        {drawerPhase === 'idle' && !isDirty && <span className="affi-dcta-hint">Drag sliders to model a new scenario</span>}
                        {drawerPhase === 'idle' && isDirty && (
                            <button className="affi-dcta-run"
                                style={{ borderColor: `${accent}60`, color: accent, background: `${accent}10` }}
                                onClick={handleRun}
                            >▶ Update Analysis →</button>
                        )}
                        {drawerPhase === 'running' && <span className="affi-dcta-hint">Calculating…</span>}
                        {drawerPhase === 'done' && <span className="affi-dcta-done" style={{ color: accent }}>✓ Numbers Updated</span>}
                    </div>
                </div>
            </div>

            {/* Follow-up chip: run purchase at max price */}
            {c && c.maxPrice > 0 && props.onRunScenario && (
                <div style={{ padding: '0 18px 6px' }}>
                    <button type="button" className="affi-chip"
                        style={{ color: accent, background: `${accent}10`, borderColor: `${accent}35` }}
                        onClick={() => props.onRunScenario!(
                            `What does a ${fmtK(c!.maxPrice)} ${ltLabel} loan at ${rate.toFixed(2)}% with ${downPct}% down look like?`,
                            { purchasePrice: c!.maxPrice, downPaymentPct: downPct, annualRatePct: rate, loanType: props.loanType },
                        )}
                    >
                        Run {ltLabel} estimate at {fmtK(c.maxPrice)} →
                    </button>
                </div>
            )}

            {/* Get Matched */}
            <div style={{ padding: '6px 18px 0' }}>
                <button type="button" className="affi-match"
                    onClick={() => {
                        const p = new URLSearchParams({ from: 'affordability', lt: ltLabel, purpose: 'Purchase', income: String(Math.round(income)), ...(c ? { price: String(Math.round(c.maxPrice)) } : {}) });
                        router.push('/connect/post?' + p.toString());
                    }}
                >Get Matched with a {isFHA ? 'FHA' : 'Conventional'} Specialist →</button>
            </div>

            {/* Disclosures */}
            <div className="affi-disc">
                <p><strong>Educational estimates only.</strong> Max price based on 43% back-end DTI guideline. Actual buying power depends on credit score, reserves, property type, and lender overlays. Rate sourced from FRED — not a rate lock or commitment to lend.</p>
            </div>

            {/* Styles */}
            <style>{`
                .affi {
                    background: #0d1117;
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 16px;
                    overflow: clip;
                    margin-top: 14px;
                    font-family: system-ui, -apple-system, sans-serif;
                    color: #f0f4ff;
                }
                .affi-topbar {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 10px 16px;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    background: rgba(255,255,255,0.02);
                }
                .affi-topbar-l { display: flex; align-items: center; gap: 6px; }
                .affi-dot { width: 7px; height: 7px; border-radius: 50%; }
                .affi-tl { font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #94a3b8; }
                .affi-lt-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
                .affi-tr { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #eaf8f7; }

                .affi-hero { padding: 18px 18px 12px; }
                .affi-hero-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #94a3b8; margin-bottom: 6px; }
                .affi-hero-amount { font-size: clamp(1.9rem, 6vw, 2.8rem); font-weight: 800; line-height: 1.05; }
                .affi-hero-sub { font-size: 11px; color: #6b80a0; margin-top: 5px; margin-bottom: 10px; line-height: 1.4; }
                .affi-hero-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
                .affi-hero-stat { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 7px; padding: 7px 9px; }
                .affi-hero-sl { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #4b6080; margin-bottom: 2px; }
                .affi-hero-sv { font-size: 0.78rem; font-weight: 700; color: #d8e4f4; font-variant-numeric: tabular-nums; }

                .affi-note {
                    margin: 10px 18px 0; padding: 8px 12px; border-radius: 8px; font-size: 11px; font-weight: 600;
                }
                .affi-note--ok  { background: rgba(0,232,122,0.07); color: #00e87a; border: 1px solid rgba(0,232,122,0.18); }
                .affi-note--gap { background: rgba(239,68,68,0.07); color: #f87171; border: 1px solid rgba(239,68,68,0.18); }
                .affi-note--warn { background: rgba(245,158,11,0.07); color: #f59e0b; border: 1px solid rgba(245,158,11,0.2); }
                .affi-note--dim { background: rgba(255,255,255,0.03); color: #94a3b8; border: 1px solid rgba(255,255,255,0.07); font-weight: 400; }

                @keyframes affiRunPulse {
                    0%, 100% { box-shadow: none; }
                    50%       { box-shadow: 0 0 20px rgba(0,232,122,0.22); }
                }
                .affi-dtrig {
                    width: 100%; display: flex; align-items: center; gap: 8px;
                    padding: 11px 18px; background: transparent; border: none;
                    border-top: 1px solid rgba(0,232,122,0.12);
                    cursor: pointer; font-family: inherit; margin-top: 14px;
                    transition: background 0.2s; text-align: left;
                }
                .affi-dtrig:hover, .affi-dtrig.open {
                    background: rgba(0,232,122,0.04);
                }
                .affi-dtrig-chips { display: flex; flex-wrap: wrap; gap: 5px; flex: 1; min-width: 0; }
                .affi-dchip {
                    font-size: 11px; font-weight: 600; color: #94a3b8;
                    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 6px; padding: 2px 7px; white-space: nowrap;
                }
                .affi-dtrig-lbl { font-size: 12px; font-weight: 700; color: #00e87a; white-space: nowrap; flex-shrink: 0; }
                .affi-dtrig-arr { font-size: 11px; color: rgba(0,232,122,0.55); flex-shrink: 0; }

                .affi-drawer { max-height: 0; overflow: hidden; transition: max-height 0.4s cubic-bezier(0.4,0,0.2,1); }
                .affi-drawer.open { max-height: 900px; }

                .affi-term-lbl { font-size: 13px; font-weight: 600; color: #8fa3b8; margin: 14px 0 8px; }
                .affi-terms { display: flex; gap: 8px; margin-bottom: 16px; }
                .affi-term {
                    flex: 1; padding: 10px 0; border-radius: 8px;
                    border: 1.5px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04);
                    font-size: 13px; font-weight: 600; color: #94a3b8;
                    cursor: pointer; font-family: inherit; text-align: center; transition: all .15s;
                }
                .affi-term:hover:not(.on) { border-color: rgba(255,255,255,0.2); color: #f0f4ff; }

                .affi-dcta { padding: 10px 0; text-align: center; }
                .affi-dcta-hint { font-size: 12px; color: rgba(148,163,184,0.4); display: block; padding: 8px 0; }
                .affi-dcta-done { font-size: 13px; display: block; font-weight: 600; padding: 10px 0; }
                .affi-dcta-run {
                    width: 100%; padding: 13px 18px;
                    border: 1.5px solid; border-radius: 10px;
                    font-size: 14px; font-weight: 700;
                    cursor: pointer; font-family: inherit; transition: all 0.15s;
                    animation: affiRunPulse 1.8s ease-in-out infinite;
                }
                .affi-dcta-run:hover { animation: none; }

                .affi-chip {
                    display: block; width: 100%;
                    border: 1.5px solid; border-radius: 8px;
                    padding: 10px 18px; font-size: 13px; font-weight: 700;
                    cursor: pointer; font-family: inherit; transition: all .15s; text-align: center;
                }
                .affi-match {
                    width: 100%; padding: 11px;
                    background: rgba(255,255,255,0.06);
                    border: 1px solid rgba(255,255,255,0.12); border-radius: 10px;
                    color: #8fa3b8; font-size: 13px; font-weight: 600;
                    cursor: pointer; font-family: inherit; transition: all .15s;
                }
                .affi-match:hover { background: rgba(255,255,255,0.1); color: #f0f4ff; }

                .affi-disc {
                    margin: 14px 18px 18px; padding: 10px 12px;
                    background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
                    border-radius: 8px;
                }
                .affi-disc p { font-size: 11px; color: #94a3b8; line-height: 1.5; }
                .affi-disc strong { color: #8fa3b8; }

                @media (max-width: 480px) {
                    .affi-stats { grid-template-columns: repeat(3, 1fr); }
                }
            `}</style>
        </div>
    );
}
