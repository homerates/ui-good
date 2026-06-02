'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminCardBadge from './AdminCardBadge';

// ── Math ──────────────────────────────────────────────────────────────────────

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
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(3).replace(/\.?0+$/, '')}M`;
    if (n >= 100_000)   return `$${Math.round(n / 1_000)}k`;
    return fmt$(n);
}

// ── Interface ─────────────────────────────────────────────────────────────────

export interface IncomeQualifySliderParams {
    price: number;
    downPct: number;
    rate: number;
    term: number;
    taxRate: number;
    insRate: number;
    loanType?: 'conventional' | 'fha' | 'jumbo' | 'va';
    annualIncome?: number;
    monthlyDebt?: number;
    /** G4: DSC computing state — disable CTA until L2/L3/L4 resolve */
    decisionScoreState?: 'computing' | 'complete';
    onRunScenario?: (seed: string, overrides: Record<string, any>) => void;
    journeyAddress?: string;
}

function iqNormKey(a: string) { return a.trim().toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').slice(0,100); }
function iqGetSid(a: string): string | null { try { return localStorage.getItem(`pi_sid_${iqNormKey(a)}`); } catch { return null; } }

// ── Component ─────────────────────────────────────────────────────────────────

export default function IncomeQualifySliderCard(props: IncomeQualifySliderParams) {
    const [price,        setPrice]        = useState(props.price);
    const [downPct,      setDownPct]      = useState(props.downPct);
    const [rate,         setRate]         = useState(props.rate);
    const [termYrs,      setTermYrs]      = useState(props.term);
    const [monthlyDebt,  setMonthlyDebt]  = useState(props.monthlyDebt ?? 0);
    const [annualIncome, setAnnualIncome] = useState(props.annualIncome ?? 0);
    const [drawerOpen,   setDrawerOpen]   = useState(false);
    const [moreOpen,     setMoreOpen]     = useState(false);
    const [drawerPhase,  setDrawerPhase]  = useState<'idle'|'running'|'done'>('idle');
    const [editingField, setEditingField] = useState<'price'|'rate'|'income'|'debt'|'down'|null>(null);
    const [editText,     setEditText]     = useState('');

    const [loanTypeState, setLoanTypeState] = useState<'conventional'|'fha'|'va'|'jumbo'>(
        props.loanType ?? 'conventional'
    );

    // Committed baseline — updated when "Update Analysis" runs
    const [commitPrice,    setCommitPrice]    = useState(props.price);
    const [commitDown,     setCommitDown]     = useState(props.downPct);
    const [commitRate,     setCommitRate]     = useState(props.rate);
    const [commitTerm,     setCommitTerm]     = useState(props.term);
    const [commitDebt,     setCommitDebt]     = useState(props.monthlyDebt ?? 0);
    const [commitIncome,   setCommitIncome]   = useState(props.annualIncome ?? 0);
    const [commitLoanType, setCommitLoanType] = useState<'conventional'|'fha'|'va'|'jumbo'>(
        props.loanType ?? 'conventional'
    );

    const router = useRouter();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_journeySid] = useState<string | null>(
        props.journeyAddress ? iqGetSid(props.journeyAddress) : null,
    );

    // ── Derived ──────────────────────────────────────────────────────────────

    const isFHA   = loanTypeState === 'fha';
    const isJumbo = loanTypeState === 'jumbo';
    const isVA    = loanTypeState === 'va';

    const downAmt    = price * downPct / 100;
    const baseLoan   = price - downAmt;
    const ufmip      = isFHA ? Math.round(baseLoan * 0.0175) : 0;
    const loanAmt    = baseLoan + ufmip;
    const ltv        = (baseLoan / price) * 100;
    const pi         = calcPI(loanAmt, rate, termYrs);
    const tax        = (price * props.taxRate) / 12;
    const ins        = (price * props.insRate) / 12;
    const pmi        = (!isFHA && !isJumbo && !isVA && ltv > 80) ? (baseLoan * 0.008) / 12 : 0;
    const monthlyMIP = isFHA ? Math.round((baseLoan * (ltv > 90 ? 0.0055 : 0.0050)) / 12) : 0;
    const piti       = pi + tax + ins + pmi + monthlyMIP;
    const totalMo    = piti + monthlyDebt;

    const primaryDTI = isVA ? 0.41 : 0.43;
    const incomePri  = Math.round((totalMo / primaryDTI) * 12);
    const income43   = Math.round((totalMo / 0.43) * 12);
    const income36   = Math.round((totalMo / 0.36) * 12);
    const income38   = Math.round((totalMo / 0.38) * 12);
    const income28   = Math.round((totalMo / 0.28) * 12);
    const reserves6mo  = Math.round(piti * 6);
    const reserves12mo = Math.round(piti * 12);

    const monthlyIncome = annualIncome > 0 ? annualIncome / 12 : null;
    const backEndDTI    = monthlyIncome ? (totalMo / monthlyIncome) * 100 : null;
    const dtiColor  = backEndDTI == null ? '#3d8bff' : backEndDTI <= 36 ? '#00e87a' : backEndDTI <= 43 ? '#60a5fa' : backEndDTI <= 49 ? '#f59e0b' : '#ef4444';
    const dtiStatus = backEndDTI == null ? '' : backEndDTI <= 28 ? 'Exceptional' : backEndDTI <= 36 ? 'Strong — conservative debt load' : backEndDTI <= 43 ? 'At guideline limit' : backEndDTI <= 49 ? 'Elevated — approaching max' : 'High — compensating factors needed';
    const dtiPillCls = backEndDTI == null ? '' : backEndDTI <= 36 ? 'green' : backEndDTI <= 43 ? 'blue' : backEndDTI <= 49 ? 'yellow' : 'red';

    const DP_CHIPS  = isJumbo ? [20, 25, 30, 40] : isFHA ? [3.5, 5, 10, 20] : isVA ? [0, 5, 10, 20] : [3, 5, 10, 20];
    const minDown   = isJumbo ? 20 : isFHA ? 3.5 : isVA ? 0 : 3;
    const priceMax  = isJumbo ? 15_000_000 : 3_000_000;
    const priceStep = isJumbo ? 25_000 : 5_000;
    const TERMS     = (isFHA || isVA) ? ([15, 30] as const) : ([15, 20, 30] as const);

    const ltAccent = isFHA ? '#f59e0b' : isVA ? '#14b8a6' : isJumbo ? '#8b5cf6' : '#00e87a';
    const ltLabel  = isFHA ? 'FHA' : isVA ? 'VA' : isJumbo ? 'Jumbo' : 'Conv.';
    const ltBtnColor = isFHA ? '#1c0d00' : isVA ? '#001a18' : isJumbo ? '#0e0022' : '#060d0a';

    // Chip modification detection vs committed baseline
    const ltMod     = loanTypeState !== commitLoanType;
    const downMod   = Math.abs(downPct - commitDown) > 0.01;
    const rateMod   = Math.abs(rate - commitRate) > 0.001;
    const termMod   = termYrs !== commitTerm;
    const debtMod   = monthlyDebt !== commitDebt;
    const incomeMod = annualIncome !== commitIncome;
    const isDirty   = ltMod || downMod || rateMod || termMod || debtMod || incomeMod ||
                      Math.abs(price - commitPrice) > 1;

    // ── Handlers ─────────────────────────────────────────────────────────────

    function handleLoanType(lt: 'conventional'|'fha'|'va'|'jumbo') {
        setLoanTypeState(lt);
        const newMin = lt === 'jumbo' ? 20 : lt === 'fha' ? 3.5 : lt === 'va' ? 0 : 3;
        if (downPct < newMin) setDownPct(newMin);
        if ((lt === 'fha' || lt === 'va') && termYrs === 20) setTermYrs(30);
    }

    function handleCommit() {
        setCommitPrice(price);
        setCommitDown(downPct);
        setCommitRate(rate);
        setCommitTerm(termYrs);
        setCommitDebt(monthlyDebt);
        setCommitIncome(annualIncome);
        setCommitLoanType(loanTypeState);
    }

    async function handleDrawerRun() {
        setDrawerPhase('running');

        // Only fire onRunScenario (chat round-trip) when LOAN SCENARIO params changed.
        // Income and debt are local display context — they never generate a chat message
        // because their values would be misrouted as a purchase price by intent detection.
        const scenarioChanged = ltMod || downMod || rateMod || termMod ||
                                Math.abs(price - commitPrice) > 1;

        handleCommit();

        if (scenarioChanged && props.onRunScenario) {
            const ltLbl = isJumbo ? 'Jumbo' : isFHA ? 'FHA' : isVA ? 'VA' : 'Conv.';
            const overrides = {
                downPaymentPct: downPct,
                rate,
                term:         termYrs,
                loanType:     loanTypeState,
                monthlyDebt,
                annualIncome: annualIncome > 0 ? annualIncome : undefined,
                totalMonthly: Math.round(totalMo),
            };
            // Seed contains only loan scenario params — no income appended
            // (income in the seed causes intent routing to misread it as a purchase price)
            props.onRunScenario(
                `Run my numbers: ${ltLbl} · ${downPct}% down · ${rate.toFixed(2)}% · ${termYrs}yr`,
                overrides,
            );
        }
        // If only income/debt changed: numbers have already recalculated in state above.
        // Just commit, animate, and close — no chat message needed.

        await new Promise<void>(r => setTimeout(r, 700));
        setDrawerPhase('done');
        await new Promise<void>(r => setTimeout(r, 1600));
        setDrawerOpen(false);
        setDrawerPhase('idle');
    }

    // ── Field inline-edit helpers ─────────────────────────────────────────────

    function parseFieldInput(text: string): number {
        const t = text.trim().replace(/[$,%\s]/g, '');
        const m = t.match(/^([\d.]+)([kKmM]?)$/);
        if (!m) return NaN;
        let n = parseFloat(m[1]);
        if (m[2].toLowerCase() === 'k') n *= 1_000;
        if (m[2].toLowerCase() === 'm') n *= 1_000_000;
        return n;
    }

    function openEdit(field: 'price'|'rate'|'income'|'debt'|'down', rawText: string) {
        setEditText(rawText);
        setEditingField(field);
    }

    function commitFieldEdit(field: 'price'|'rate'|'income'|'debt'|'down') {
        const n = parseFieldInput(editText);
        if (!isNaN(n)) {
            if (field === 'price')  setPrice(Math.max(100_000, Math.min(priceMax, Math.round(n))));
            if (field === 'rate')   setRate(Math.max(3, Math.min(12, Math.round(n * 1000) / 1000)));
            if (field === 'income') setAnnualIncome(Math.max(0, Math.min(isJumbo ? 2_000_000 : 600_000, Math.round(n))));
            if (field === 'debt')   setMonthlyDebt(Math.max(0, Math.min(3_000, Math.round(n))));
            if (field === 'down')   setDownPct(Math.max(minDown, Math.min(50, Math.round(n * 10) / 10)));
        }
        setEditingField(null);
    }

    function FieldEditInput({ field, extra }: { field: 'price'|'rate'|'income'|'debt'|'down'; extra?: string }) {
        return (
            <input type="text" className={`iq2-field-inp${extra ? ` ${extra}` : ''}`}
                value={editText} autoFocus
                onChange={e => setEditText(e.target.value)}
                onBlur={() => commitFieldEdit(field)}
                onKeyDown={e => { if (e.key === 'Enter') commitFieldEdit(field); if (e.key === 'Escape') setEditingField(null); }}
            />
        );
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="iq2" style={{ position: 'relative' }}>
            <AdminCardBadge code="IQC-003" />

            {/* Topbar */}
            <div className="iq2-topbar">
                <div className="iq2-topbar-l">
                    <div className="iq2-dot" style={{ background: ltAccent }} />
                    <span className="iq2-tl">Income to Qualify</span>
                    <span className="iq2-lt-badge" style={{ color: ltAccent, background: `${ltAccent}18`, border: `1px solid ${ltAccent}38` }}>
                        {ltLabel}
                    </span>
                </div>
                <span className="iq2-tr">Live · CalcEngine</span>
            </div>

            {/* Hero (compact) */}
            <div className="iq2-hero">
                <div className="iq2-hero-label">Minimum Annual Income ({isVA ? '41% DTI' : '43% DTI'})</div>
                <div className="iq2-hero-row">
                    <div className="iq2-hero-amount" style={{ color: ltAccent }}>
                        {fmt$(incomePri)}<span className="iq2-hero-yr">/yr</span>
                    </div>
                    {backEndDTI != null && (
                        <div className={`iq2-dti-pill iq2-dti-pill--${dtiPillCls}`}>
                            <span>DTI {backEndDTI.toFixed(0)}%</span>
                            <span className="iq2-dti-sep">·</span>
                            <span>{dtiPillCls === 'green' ? 'Strong' : dtiPillCls === 'blue' ? 'At guideline' : dtiPillCls === 'yellow' ? 'Elevated' : 'High'}</span>
                        </div>
                    )}
                </div>
                <div className="iq2-hero-sub">
                    Based on {fmt$(Math.round(piti))}/mo {isFHA ? 'PITI+MIP' : 'PITI'}
                    {monthlyDebt > 0 ? ` + ${fmt$(monthlyDebt)}/mo debts` : ' — no debts entered'}
                </div>
                <div className="iq2-hero-stats">
                    <div className="iq2-hero-stat">
                        <div className="iq2-hero-sl">PITI</div>
                        <div className="iq2-hero-sv">{fmt$(Math.round(piti))}</div>
                    </div>
                    <div className="iq2-hero-stat">
                        <div className="iq2-hero-sl">Loan Amount</div>
                        <div className="iq2-hero-sv">{fmtK(loanAmt)}</div>
                    </div>
                    <div className="iq2-hero-stat">
                        <div className="iq2-hero-sl">LTV</div>
                        <div className="iq2-hero-sv">{ltv.toFixed(1)}%</div>
                    </div>
                </div>
            </div>

            {/* Prominent drawer trigger */}
            <button
                className={`iq2-adjust-btn${drawerOpen ? ' open' : ''}`}
                style={drawerOpen ? { borderColor: `${ltAccent}50`, background: `${ltAccent}07` } : {}}
                onClick={() => setDrawerOpen(o => !o)}
            >
                <span className="iq2-adjust-icon">⚙</span>
                <span className="iq2-chips">
                    <span className={`iq2-chip${ltMod ? ' mod' : ''}`}>{ltLabel}</span>
                    <span className={`iq2-chip${downMod ? ' mod' : ''}`}>{downPct}% down</span>
                    <span className={`iq2-chip${rateMod ? ' mod' : ''}`}>{rate.toFixed(3)}%</span>
                    <span className={`iq2-chip${termMod ? ' mod' : ''}`}>{termYrs}yr</span>
                    {monthlyDebt > 0 && <span className={`iq2-chip${debtMod ? ' mod' : ''}`}>{fmt$(monthlyDebt)}/mo debts</span>}
                    {annualIncome > 0 && <span className={`iq2-chip${incomeMod ? ' mod' : ''}`}>{fmtK(annualIncome)}/yr</span>}
                </span>
                <span className="iq2-adjust-lbl">{drawerOpen ? 'Close' : 'Adjust'}</span>
                <span className={`iq2-arrow${drawerOpen ? ' open' : ''}`}>▾</span>
            </button>

            {/* Unified Drawer — all adjusters including income + debt */}
            <div className={`iq2-drawer${drawerOpen ? ' open' : ''}`}>
                <div className="iq2-drawer-inner">

                    {/* Loan Type */}
                    <div className="iq2-lt-grid">
                        {(['conventional','fha','va','jumbo'] as const).map(lt => {
                            const c = lt === 'fha' ? '#f59e0b' : lt === 'va' ? '#14b8a6' : lt === 'jumbo' ? '#8b5cf6' : '#00e87a';
                            const on = loanTypeState === lt;
                            return (
                                <button key={lt} className="iq2-lt-chip"
                                    style={on ? { borderColor: `${c}55`, color: c, background: `${c}12` } : {}}
                                    onClick={() => handleLoanType(lt)}
                                >
                                    {lt === 'conventional' ? 'Conv.' : lt.toUpperCase()}
                                </button>
                            );
                        })}
                    </div>
                    <div className="iq2-divider" />

                    {/* Sliders — 2-column grid */}
                    <div className="iq2-grid">

                        {/* Home Price */}
                        <div className="iq2-field">
                            <div className="iq2-field-top">
                                <span className="iq2-field-lbl">Home Price</span>
                                {editingField === 'price'
                                    ? <FieldEditInput field="price" />
                                    : <span className="iq2-field-val iq2-field-val--edit" title="Click to type a value" onClick={() => openEdit('price', String(price))}>{fmtK(price)}</span>}
                            </div>
                            <input type="range" className="iq2-slider"
                                style={{ '--tc': ltAccent } as React.CSSProperties}
                                min={100000} max={priceMax} step={priceStep}
                                value={price} onChange={e => setPrice(Number(e.target.value))} />
                            <div className="iq2-range-lbls"><span>$100k</span><span>{isJumbo ? '$15M' : '$3M'}</span></div>
                        </div>

                        {/* Down Payment */}
                        <div className="iq2-field">
                            <div className="iq2-field-top">
                                <span className="iq2-field-lbl">Down Payment</span>
                                {editingField === 'down'
                                    ? <FieldEditInput field="down" />
                                    : <span className="iq2-field-val iq2-field-val--edit" title="Click to type %" onClick={() => openEdit('down', String(downPct))}>{downPct}% · {fmtK(downAmt)}</span>}
                            </div>
                            <input type="range" className="iq2-slider"
                                style={{ '--tc': ltAccent } as React.CSSProperties}
                                min={minDown} max={50} step={isFHA ? 0.5 : 1}
                                value={downPct} onChange={e => setDownPct(Math.max(minDown, Number(e.target.value)))} />
                            <div className="iq2-range-lbls"><span>{minDown}%</span><span>50%</span></div>
                            <div className="iq2-dp-chips">
                                {DP_CHIPS.map(p => (
                                    <button key={p}
                                        className={`iq2-dp-chip${Math.abs(downPct - p) < 0.1 ? ' active' : ''}`}
                                        style={Math.abs(downPct - p) < 0.1 ? { borderColor: `${ltAccent}45`, color: ltAccent, background: `${ltAccent}12` } : {}}
                                        onClick={() => setDownPct(p)}
                                    >{p}%</button>
                                ))}
                            </div>
                        </div>

                        {/* Interest Rate */}
                        <div className="iq2-field">
                            <div className="iq2-field-top">
                                <span className="iq2-field-lbl">Interest Rate</span>
                                {editingField === 'rate'
                                    ? <FieldEditInput field="rate" />
                                    : <span className="iq2-field-val iq2-field-val--edit" title="Click to type %" onClick={() => openEdit('rate', rate.toFixed(3))}>{rate.toFixed(3)}%</span>}
                            </div>
                            <input type="range" className="iq2-slider"
                                style={{ '--tc': ltAccent } as React.CSSProperties}
                                min={3} max={12} step={0.125}
                                value={rate} onChange={e => setRate(Number(e.target.value))} />
                            <div className="iq2-range-lbls"><span>3%</span><span>12%</span></div>
                        </div>

                        {/* Loan Term */}
                        <div className="iq2-field">
                            <div className="iq2-field-top">
                                <span className="iq2-field-lbl">Loan Term</span>
                            </div>
                            <div className="iq2-terms">
                                {TERMS.map(yr => (
                                    <button key={yr} className="iq2-term"
                                        style={termYrs === yr ? { borderColor: `${ltAccent}55`, color: ltAccent, background: `${ltAccent}12` } : {}}
                                        onClick={() => setTermYrs(yr)}
                                    >{yr}yr</button>
                                ))}
                            </div>
                        </div>

                        {/* Monthly Debts */}
                        <div className="iq2-field">
                            <div className="iq2-field-top">
                                <span className="iq2-field-lbl">Monthly Debts</span>
                                {editingField === 'debt'
                                    ? <FieldEditInput field="debt" extra="iq2-field-inp--debt" />
                                    : <span className="iq2-field-val iq2-field-val--debt iq2-field-val--edit" title="Click to type amount" onClick={() => openEdit('debt', monthlyDebt === 0 ? '' : String(monthlyDebt))}>{monthlyDebt === 0 ? 'None' : fmt$(monthlyDebt)}</span>}
                            </div>
                            <input type="range" className="iq2-slider iq2-slider--debt"
                                min={0} max={3000} step={50}
                                value={monthlyDebt} onChange={e => setMonthlyDebt(Number(e.target.value))} />
                            <div className="iq2-range-lbls"><span>$0</span><span>$3k/mo</span></div>
                            <div className="iq2-field-hint">Cars, loans, cards</div>
                        </div>

                        {/* Annual Income */}
                        <div className="iq2-field">
                            <div className="iq2-field-top">
                                <span className="iq2-field-lbl">Annual Income</span>
                                {editingField === 'income'
                                    ? <FieldEditInput field="income" />
                                    : <span className="iq2-field-val iq2-field-val--edit" title="Click to type amount" onClick={() => openEdit('income', annualIncome === 0 ? '' : String(annualIncome))}>{annualIncome === 0 ? '—' : fmtK(annualIncome)}</span>}
                            </div>
                            <input type="range" className="iq2-slider"
                                style={{ '--tc': ltAccent } as React.CSSProperties}
                                min={0} max={isJumbo ? 2_000_000 : 600_000} step={isJumbo ? 10_000 : 5_000}
                                value={annualIncome} onChange={e => setAnnualIncome(Number(e.target.value))} />
                            <div className="iq2-range-lbls"><span>$0</span><span>{isJumbo ? '$2M' : '$600k'}</span></div>
                            {annualIncome === 0 && <div className="iq2-field-hint">Optional — shows your DTI</div>}
                        </div>

                    </div>{/* /grid */}

                    {/* Live DTI bar — full width, only when income entered */}
                    {backEndDTI != null && (
                        <div className="iq2-live-dti">
                            <div className="iq2-live-dti-row">
                                <span className="iq2-live-dti-lbl">Your Back-End DTI</span>
                                <span className="iq2-live-dti-val" style={{ color: dtiColor }}>{backEndDTI.toFixed(1)}%</span>
                            </div>
                            <div className="iq2-live-dti-track">
                                <div className="iq2-live-dti-fill" style={{ width: `${Math.min(100, (backEndDTI / 60) * 100)}%`, background: dtiColor }} />
                            </div>
                            <div className="iq2-live-dti-marks">
                                <span>0%</span><span>36%</span><span>43%</span><span>50%</span><span>60%+</span>
                            </div>
                            <div className="iq2-live-dti-status" style={{ color: dtiColor }}>{dtiStatus}</div>
                        </div>
                    )}

                    {/* CTA */}
                    <button
                        className="iq2-run-btn"
                        style={{ background: ltAccent, color: ltBtnColor }}
                        onClick={handleDrawerRun}
                        disabled={drawerPhase !== 'idle' || props.decisionScoreState === 'computing'}
                    >
                        {drawerPhase === 'running' ? 'Calculating…'
                            : drawerPhase === 'done' ? '✓ Updated'
                            : props.decisionScoreState === 'computing' ? '⏳ Score Computing…'
                            : '▶ Update Analysis'}
                    </button>
                    {isDirty && drawerPhase === 'idle' && (
                        <div className="iq2-dirty-hint">● Numbers changed — tap to update</div>
                    )}

                </div>
            </div>

            {/* DTI threshold table */}
            <div className="iq2-dti-section">
                <div className="iq2-dti-head">Income required by DTI threshold</div>
                {isJumbo ? (
                    <>
                        <div className="iq2-dti-row">
                            <span className="iq2-dti-pct">43%</span>
                            <span className="iq2-dti-lbl">Some jumbo lenders</span>
                            <span className="iq2-dti-val">{fmt$(income43)}/yr</span>
                            <span />
                        </div>
                        <div className="iq2-dti-row iq2-dti-row--active" style={{ background: `${ltAccent}0c`, borderColor: `${ltAccent}28` }}>
                            <span className="iq2-dti-pct" style={{ color: ltAccent }}>38%</span>
                            <span className="iq2-dti-lbl">Typical jumbo cap</span>
                            <span className="iq2-dti-val">{fmt$(income38)}/yr</span>
                            <span className="iq2-dti-badge" style={{ background: `${ltAccent}20`, color: ltAccent }}>Std</span>
                        </div>
                        <div className="iq2-dti-row">
                            <span className="iq2-dti-pct">36%</span>
                            <span className="iq2-dti-lbl">Conservative</span>
                            <span className="iq2-dti-val">{fmt$(income36)}/yr</span>
                            <span />
                        </div>
                    </>
                ) : isVA ? (
                    <>
                        <div className="iq2-dti-row iq2-dti-row--active" style={{ background: `${ltAccent}0c`, borderColor: `${ltAccent}28` }}>
                            <span className="iq2-dti-pct" style={{ color: ltAccent }}>41%</span>
                            <span className="iq2-dti-lbl">VA guideline (primary)</span>
                            <span className="iq2-dti-val">{fmt$(incomePri)}/yr</span>
                            <span className="iq2-dti-badge" style={{ background: `${ltAccent}20`, color: ltAccent }}>Std</span>
                        </div>
                        <div className="iq2-dti-row">
                            <span className="iq2-dti-pct">43%</span>
                            <span className="iq2-dti-lbl">Allowed w/ strong residual</span>
                            <span className="iq2-dti-val">{fmt$(income43)}/yr</span>
                            <span />
                        </div>
                        <div className="iq2-dti-row">
                            <span className="iq2-dti-pct">36%</span>
                            <span className="iq2-dti-lbl">Conservative</span>
                            <span className="iq2-dti-val">{fmt$(income36)}/yr</span>
                            <span />
                        </div>
                    </>
                ) : (
                    <>
                        <div className="iq2-dti-row iq2-dti-row--active" style={{ background: `${ltAccent}0c`, borderColor: `${ltAccent}28` }}>
                            <span className="iq2-dti-pct" style={{ color: ltAccent }}>43%</span>
                            <span className="iq2-dti-lbl">{isFHA ? 'FHA max (strong file)' : 'Standard max (Fannie/Freddie)'}</span>
                            <span className="iq2-dti-val">{fmt$(income43)}/yr</span>
                            <span className="iq2-dti-badge" style={{ background: `${ltAccent}20`, color: ltAccent }}>Std</span>
                        </div>
                        <div className="iq2-dti-row">
                            <span className="iq2-dti-pct">36%</span>
                            <span className="iq2-dti-lbl">Conservative</span>
                            <span className="iq2-dti-val">{fmt$(income36)}/yr</span>
                            <span />
                        </div>
                        <div className="iq2-dti-row">
                            <span className="iq2-dti-pct">28%</span>
                            <span className="iq2-dti-lbl">Front-end only</span>
                            <span className="iq2-dti-val">{fmt$(income28)}/yr</span>
                            <span />
                        </div>
                    </>
                )}
            </div>

            {/* More (FHA MIP / VA note / Jumbo reserves) */}
            <div className="iq2-more">
                <button className="iq2-more-btn" onClick={() => setMoreOpen(o => !o)}>
                    <span>{moreOpen ? '↑ Less' : `↓ More${isFHA ? ' — FHA MIP details' : isVA ? ' — VA loan details' : isJumbo ? ' — Jumbo reserves' : ''}`}</span>
                    <span className={`iq2-more-chev${moreOpen ? ' open' : ''}`}>▴</span>
                </button>
                {moreOpen && (
                    <div className="iq2-more-body">

                        {isFHA && (
                            <div className="iq2-more-block">
                                <div className="iq2-more-head" style={{ color: '#f59e0b' }}>🛡️ FHA Mortgage Insurance (MIP)</div>
                                <div className="iq2-kv">
                                    <span>Upfront MIP (1.75%, financed)</span>
                                    <span style={{ color: '#fbbf24', fontWeight: 700 }}>{fmt$(ufmip)} added to loan</span>
                                </div>
                                <div className="iq2-kv">
                                    <span>Monthly MIP ({ltv > 90 ? '0.55' : '0.50'}%/yr)</span>
                                    <span style={{ color: '#fbbf24', fontWeight: 700 }}>{fmt$(monthlyMIP)}/mo</span>
                                </div>
                                <div className={`iq2-mip-note${downPct >= 10 ? ' good' : ' warn'}`}>
                                    {downPct >= 10
                                        ? `✅ ${downPct}% down — MIP cancels after 11 years (saves ${fmt$(Math.round((monthlyMIP / 0.43) * 12))}/yr in required income).`
                                        : `⚠️ ${downPct}% down — MIP is life-of-loan, adds ${fmt$(Math.round((monthlyMIP / 0.43) * 12))}/yr to your income requirement permanently.`
                                    }
                                </div>
                            </div>
                        )}

                        {isVA && (
                            <div className="iq2-more-block">
                                <div className="iq2-more-head" style={{ color: '#14b8a6' }}>🎖️ VA Loan Benefits</div>
                                <div style={{ fontSize: '0.68rem', color: '#5eead4', lineHeight: 1.55 }}>
                                    No PMI ever · Residual income test applies in addition to DTI · 41% DTI as primary guideline · Funding fee 1.25–3.3% (can be waived for disability) · Rates often at or below conventional for qualified borrowers.
                                </div>
                            </div>
                        )}

                        {isJumbo && (
                            <div className="iq2-more-block">
                                <div className="iq2-more-head" style={{ color: '#a78bfa' }}>🏦 Jumbo Reserve Requirements</div>
                                <div className="iq2-reserves-grid">
                                    <div className="iq2-reserve-item">
                                        <div className="iq2-reserve-lbl">6-Month Reserves</div>
                                        <div className="iq2-reserve-val" style={{ color: '#c4b5fd' }}>{fmtK(reserves6mo)}</div>
                                        <div className="iq2-reserve-note">Required for most jumbo ≤ $2M</div>
                                    </div>
                                    <div className="iq2-reserve-item">
                                        <div className="iq2-reserve-lbl">12-Month Reserves</div>
                                        <div className="iq2-reserve-val" style={{ color: '#c4b5fd' }}>{fmtK(reserves12mo)}</div>
                                        <div className="iq2-reserve-note">Common for loans &gt; $2M</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!isFHA && !isVA && !isJumbo && (
                            <div className="iq2-more-block">
                                <div style={{ fontSize: '0.65rem', color: '#8fa3b8', lineHeight: 1.55 }}>
                                    Conventional max DTI is 43–50% (DU/LP approval). PMI required when LTV &gt; 80% — typically 0.5–1% annually, cancels at 80% LTV. Conforming limit: <strong style={{ color: '#d0dcea' }}>$832,750</strong> (2025 baseline). Rates vary by credit score and lender overlays.
                                </div>
                            </div>
                        )}

                        {!props.journeyAddress && (
                            <button className="iq2-check-btn"
                                onClick={() => {
                                    const lt = isJumbo ? 'jumbo' : isFHA ? 'fha' : isVA ? 'va' : 'conventional';
                                    const p = new URLSearchParams({
                                        price: String(Math.round(price)), dp: String(downPct),
                                        rate: rate.toFixed(3), term: String(termYrs), lt,
                                        taxRate: props.taxRate.toFixed(5), insRate: props.insRate.toFixed(5),
                                        ...(monthlyDebt > 0 ? { monthlyDebt: String(Math.round(monthlyDebt)) } : {}),
                                    });
                                    router.push(`/check-property?${p.toString()}`);
                                }}
                            >Check a property →</button>
                        )}

                    </div>
                )}
            </div>

            {/* Rate note */}
            <div className="iq2-rate-note">
                <strong>Assumption:</strong> Rate seeded at <strong>{props.rate.toFixed(2)}%</strong> (FRED 30-yr fixed, live).
                {isJumbo ? ' Jumbo lenders typically require 38–43% DTI, 720+ credit, 20%+ down.' : isFHA ? ' FHA MIP per HUD 2024 Mortgagee Letter. UFMIP 1.75% financed.' : isVA ? ' VA uses 41% back-end DTI + residual income test. No PMI.' : ' DTI thresholds per Fannie Mae/Freddie Mac guidelines.'} Estimates only — not a loan offer.
            </div>

            {/* ── Styles ── */}
            <style>{`
                .iq2 {
                    background: #0d1117;
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 16px;
                    overflow: clip;
                    margin-top: 14px;
                    font-family: system-ui, -apple-system, sans-serif;
                    color: #d0dcea;
                }

                /* topbar */
                .iq2-topbar { display:flex; align-items:center; justify-content:space-between; padding:9px 16px; border-bottom:1px solid rgba(255,255,255,0.06); }
                .iq2-topbar-l { display:flex; align-items:center; gap:7px; }
                .iq2-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
                .iq2-tl { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#8fa3b8; }
                .iq2-tr { font-size:10px; color:#4b6080; }
                .iq2-lt-badge { font-size:9px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; padding:2px 8px; border-radius:4px; }

                /* hero */
                .iq2-hero { padding:14px 18px 12px; border-bottom:1px solid rgba(255,255,255,0.06); }
                .iq2-hero-label { font-size:0.58rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#4b6080; margin-bottom:4px; }
                .iq2-hero-row { display:flex; align-items:baseline; gap:10px; margin-bottom:5px; flex-wrap:wrap; }
                .iq2-hero-amount { font-size:1.75rem; font-weight:900; letter-spacing:-0.03em; line-height:1; font-variant-numeric:tabular-nums; }
                .iq2-hero-yr { font-size:0.82rem; font-weight:500; color:#6b80a0; margin-left:1px; }
                .iq2-hero-sub { font-size:0.68rem; color:#6b80a0; margin-bottom:9px; line-height:1.4; }
                .iq2-hero-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:7px; }
                .iq2-hero-stat { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:7px; padding:7px 9px; }
                .iq2-hero-sl { font-size:8.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#4b6080; margin-bottom:2px; }
                .iq2-hero-sv { font-size:0.78rem; font-weight:700; color:#d8e4f4; font-variant-numeric:tabular-nums; }

                /* DTI pill */
                .iq2-dti-pill { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:20px; font-size:0.65rem; font-weight:700; }
                .iq2-dti-pill--green  { background:rgba(0,232,122,0.12); color:#4ade80;  border:1px solid rgba(74,222,128,0.3); }
                .iq2-dti-pill--blue   { background:rgba(61,139,255,0.12); color:#60a5fa;  border:1px solid rgba(96,165,250,0.3); }
                .iq2-dti-pill--yellow { background:rgba(251,191,36,0.12); color:#fbbf24;  border:1px solid rgba(251,191,36,0.3); }
                .iq2-dti-pill--red    { background:rgba(239,68,68,0.12);  color:#f87171;  border:1px solid rgba(248,113,113,0.3); }
                .iq2-dti-sep { opacity:0.4; font-weight:400; }

                /* Adjust button */
                .iq2-adjust-btn {
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
                .iq2-adjust-btn:hover { background:rgba(255,255,255,0.07); border-color:rgba(255,255,255,0.22); }
                .iq2-adjust-icon { font-size:0.85rem; color:#6b80a0; flex-shrink:0; }
                .iq2-chips { display:flex; flex-wrap:wrap; gap:4px; flex:1; align-items:center; }
                .iq2-chip { font-size:0.6rem; font-weight:700; padding:3px 7px; border-radius:10px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:#94a3b8; white-space:nowrap; }
                .iq2-chip.mod { background:rgba(0,232,122,0.12); border-color:rgba(0,232,122,0.3); color:#4ade80; }
                .iq2-adjust-lbl { font-size:0.62rem; font-weight:600; color:#4b6080; flex-shrink:0; white-space:nowrap; }
                .iq2-arrow { font-size:0.62rem; color:#4b6080; flex-shrink:0; transition:transform .2s; }
                .iq2-arrow.open { transform:rotate(180deg); }

                /* Drawer */
                .iq2-drawer { max-height:0; overflow:hidden; transition:max-height 0.38s cubic-bezier(0.4,0,0.2,1); }
                .iq2-drawer.open { max-height:1100px; }
                .iq2-drawer-inner {
                    margin:0 16px 14px;
                    padding:12px 14px 8px;
                    background:rgba(0,0,0,0.2);
                    border:1px solid rgba(255,255,255,0.08);
                    border-radius:11px;
                }

                /* loan type chips */
                .iq2-lt-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; padding:2px 0 10px; }
                .iq2-lt-chip { padding:7px 0; border-radius:8px; font-size:0.68rem; font-weight:700; cursor:pointer; text-align:center; border:1.5px solid rgba(255,255,255,0.1); background:transparent; color:#6b80a0; font-family:inherit; transition:all .15s; }
                .iq2-lt-chip:hover { border-color:rgba(255,255,255,0.22); color:#c4cfe0; }
                .iq2-divider { height:1px; background:rgba(255,255,255,0.07); margin:0 0 10px; }

                /* 2-col slider grid */
                .iq2-grid { display:grid; grid-template-columns:1fr 1fr; gap:0 14px; }
                .iq2-field { margin-bottom:13px; }
                .iq2-field-top { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:5px; }
                .iq2-field-lbl { font-size:0.62rem; font-weight:600; color:#94a3b8; }
                .iq2-field-val { font-size:0.68rem; font-weight:800; color:#e2eaf8; font-variant-numeric:tabular-nums; }
                .iq2-field-val--debt { color:#60a5fa; }
                .iq2-field-val--edit { cursor:pointer; border-bottom:1px dashed transparent; transition:border-color .15s; }
                .iq2-field-val--edit:hover { border-bottom-color:rgba(255,255,255,0.35); }
                .iq2-field-inp { font-size:0.68rem; font-weight:800; color:#e2eaf8; font-variant-numeric:tabular-nums; background:rgba(255,255,255,0.09); border:1.5px solid rgba(0,232,122,0.55); border-radius:5px; outline:none; text-align:right; width:72px; padding:1px 5px; }
                .iq2-field-inp--debt { border-color:rgba(61,139,255,0.55); }
                .iq2-field-hint { font-size:0.55rem; color:#3a4560; margin-top:3px; }
                .iq2-range-lbls { display:flex; justify-content:space-between; margin-top:3px; font-size:8.5px; color:#3a4560; }

                /* sliders */
                .iq2-slider {
                    -webkit-appearance:none; width:100%; height:3px;
                    border-radius:2px; background:rgba(255,255,255,0.1);
                    outline:none; cursor:pointer;
                }
                .iq2-slider::-webkit-slider-thumb {
                    -webkit-appearance:none; width:14px; height:14px;
                    border-radius:50%; background:var(--tc,#00e87a); cursor:pointer;
                    box-shadow:0 0 0 3px color-mix(in srgb,var(--tc,#00e87a) 22%,transparent);
                    transition:box-shadow .15s;
                }
                .iq2-slider::-webkit-slider-thumb:hover {
                    box-shadow:0 0 0 5px color-mix(in srgb,var(--tc,#00e87a) 30%,transparent);
                }
                .iq2-slider--debt { --tc:#3d8bff; }
                .iq2-slider--debt::-webkit-slider-thumb { background:#3d8bff; box-shadow:0 0 0 3px rgba(61,139,255,0.25); }

                /* down payment quick picks */
                .iq2-dp-chips { display:flex; gap:4px; margin-top:6px; flex-wrap:wrap; }
                .iq2-dp-chip { padding:3px 7px; border-radius:10px; font-size:0.58rem; font-weight:700; cursor:pointer; border:1px solid rgba(255,255,255,0.09); background:transparent; color:#6b80a0; font-family:inherit; transition:all .12s; }
                .iq2-dp-chip:hover { border-color:rgba(255,255,255,0.22); color:#c4cfe0; }

                /* term buttons */
                .iq2-terms { display:flex; gap:5px; }
                .iq2-term { flex:1; padding:7px 0; border-radius:7px; font-size:0.65rem; font-weight:700; cursor:pointer; border:1.5px solid rgba(255,255,255,0.1); background:transparent; color:#6b80a0; font-family:inherit; text-align:center; transition:all .12s; }
                .iq2-term:hover { border-color:rgba(255,255,255,0.22); color:#c4cfe0; }

                /* live DTI bar */
                .iq2-live-dti { margin:4px 0 10px; padding:10px 12px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:8px; }
                .iq2-live-dti-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
                .iq2-live-dti-lbl { font-size:0.62rem; font-weight:600; color:#8fa3b8; }
                .iq2-live-dti-val { font-size:0.75rem; font-weight:800; }
                .iq2-live-dti-track { height:5px; border-radius:3px; background:rgba(255,255,255,0.09); overflow:hidden; }
                .iq2-live-dti-fill { height:100%; border-radius:3px; transition:width .2s, background .2s; }
                .iq2-live-dti-marks { display:flex; justify-content:space-between; margin-top:3px; font-size:7.5px; color:#3a4560; }
                .iq2-live-dti-status { font-size:0.6rem; font-weight:600; margin-top:4px; }

                /* run CTA */
                .iq2-run-btn { width:100%; padding:12px; border:none; border-radius:9px; font-size:0.85rem; font-weight:800; cursor:pointer; font-family:inherit; letter-spacing:-.01em; margin:10px 0 14px; transition:opacity .15s; }
                .iq2-run-btn:hover:not(:disabled) { opacity:.88; }
                .iq2-run-btn:disabled { opacity:.45; cursor:not-allowed; }
                .iq2-dirty-hint { font-size:0.58rem; font-weight:600; color:#4ade80; text-align:center; margin-top:-12px; margin-bottom:10px; }

                /* DTI threshold table */
                .iq2-dti-section { padding:12px 18px; border-top:1px solid rgba(255,255,255,0.06); }
                .iq2-dti-head { font-size:0.58rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#4b6080; margin-bottom:8px; }
                .iq2-dti-row { display:grid; grid-template-columns:38px 1fr auto 44px; align-items:center; gap:7px; padding:6px 9px; border-radius:7px; margin-bottom:3px; border:1px solid transparent; }
                .iq2-dti-pct { font-size:0.7rem; font-weight:800; color:#60a5fa; }
                .iq2-dti-lbl { font-size:0.62rem; color:#6b80a0; }
                .iq2-dti-val { font-size:0.7rem; font-weight:700; color:#d8e4f4; font-variant-numeric:tabular-nums; text-align:right; }
                .iq2-dti-badge { font-size:0.5rem; font-weight:700; letter-spacing:.07em; text-transform:uppercase; padding:2px 5px; border-radius:4px; text-align:center; }

                /* More section */
                .iq2-more { border-top:1px solid rgba(255,255,255,0.06); }
                .iq2-more-btn { display:flex; align-items:center; justify-content:space-between; width:100%; padding:10px 18px; background:none; border:none; cursor:pointer; font-family:inherit; color:#4b6080; font-size:0.65rem; font-weight:600; transition:color .15s; }
                .iq2-more-btn:hover { color:#94a3b8; }
                .iq2-more-chev { transition:transform .2s; display:inline-block; transform:rotate(180deg); }
                .iq2-more-chev.open { transform:rotate(0deg); }
                .iq2-more-body { padding:4px 18px 14px; }
                .iq2-more-block { margin-bottom:14px; }
                .iq2-more-block:last-child { margin-bottom:0; }
                .iq2-more-head { font-size:0.68rem; font-weight:700; margin-bottom:8px; display:flex; align-items:center; gap:5px; }
                .iq2-kv { display:flex; justify-content:space-between; align-items:center; font-size:0.65rem; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.04); color:#8fa3b8; }
                .iq2-kv:last-of-type { border-bottom:none; }
                .iq2-mip-note { margin-top:8px; font-size:0.62rem; line-height:1.5; padding:8px 10px; border-radius:7px; }
                .iq2-mip-note.warn { background:rgba(245,158,11,0.08); color:#fbbf24; border:1px solid rgba(245,158,11,0.22); }
                .iq2-mip-note.good { background:rgba(74,222,128,0.08); color:#4ade80;  border:1px solid rgba(74,222,128,0.22); }
                .iq2-reserves-grid { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
                .iq2-reserve-item { padding:9px 11px; background:rgba(139,92,246,0.08); border:1px solid rgba(139,92,246,0.2); border-radius:8px; }
                .iq2-reserve-lbl { font-size:0.55rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#7c6ab0; margin-bottom:2px; }
                .iq2-reserve-val { font-size:0.88rem; font-weight:800; font-variant-numeric:tabular-nums; }
                .iq2-reserve-note { font-size:0.55rem; color:#6b5fa0; margin-top:2px; }
                .iq2-check-btn { width:100%; margin-top:12px; padding:9px; background:rgba(0,232,122,0.08); color:#00e87a; border:1.5px solid rgba(0,232,122,0.28); border-radius:9px; font-size:0.72rem; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; text-align:center; }
                .iq2-check-btn:hover { background:rgba(0,232,122,0.14); border-color:rgba(0,232,122,0.45); }

                /* rate note */
                .iq2-rate-note { padding:8px 18px 13px; font-size:0.58rem; color:#3a4560; line-height:1.5; border-top:1px solid rgba(255,255,255,0.04); }

                @media (max-width:480px) {
                    .iq2-grid { grid-template-columns:1fr; }
                    .iq2-hero-amount { font-size:1.5rem; }
                }
            `}</style>
        </div>
    );
}
