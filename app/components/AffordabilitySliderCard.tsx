'use client';

// app/components/AffordabilitySliderCard.tsx
// Redesigned affordability card — 3 program accordions (FHA 3.5%, Conv 3%, Conv 20%)
// with live-calc drawers, side-by-side comparison, rate/term explorer, and disclosures.

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SliderField from './SliderField';
import { calcPI } from '../../lib/math';
import { COLORS } from '../../lib/tokens';
import { ShareAnswerButton } from './ShareAnswerButton';
import { FHA_FLOOR, CONF_STANDARD } from '../../lib/constants';

export interface AffordabilitySliderParams {
    annualIncome: number;
    monthlyDebts: number;
    savings: number;
    downPct: number;      // kept for backward compat — ignored (we fix 3 programs)
    rate: number;
    term: number;
    taxRate: number;
    insRate: number;
    loanType: 'conventional' | 'fha';  // kept for backward compat
    fhaLoanLimit?: number;   // FHA base-loan cap (default = national floor $541,287)
    confLoanLimit?: number;  // conforming loan cap (default = standard $832,750)
    onRunScenario?: (seed: string, overrides: Record<string, any>) => void;
}

// CONF_LIMIT local alias — imported from lib/constants.ts as CONF_STANDARD
const CONF_LIMIT = CONF_STANDARD;

// ── Math ──────────────────────────────────────────────────────────────────────

function calcMaxPrice(
    annualIncome: number, monthlyDebts: number, downPct: number,
    annualRate: number, termYears: number, taxRate: number, insRate: number,
    loanType: 'conventional' | 'fha',
): number {
    const budget = (annualIncome / 12) * 0.43 - monthlyDebts;
    if (budget <= 50) return 0;
    function totalAt(p: number): number {
        const down = p * downPct / 100;
        const baseLoan = p - down;
        const loan = loanType === 'fha' ? baseLoan * 1.0175 : baseLoan;
        const ltv = (baseLoan / p) * 100;
        const tax = (p * taxRate) / 12;
        const ins = (p * insRate) / 12;
        let pmi = 0;
        if (loanType === 'conventional' && ltv > 80) pmi = (loan * 0.008) / 12;
        else if (loanType === 'fha') pmi = (loan * 0.0055) / 12;
        return calcPI(loan, annualRate, termYears) + tax + ins + pmi;
    }
    let lo = 10_000, hi = 6_000_000;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (totalAt(mid) < budget) lo = mid; else hi = mid;
    }
    return Math.floor((lo + hi) / 2 / 1_000) * 1_000;
}

interface ProgramCalc {
    maxPrice: number; down: number; baseLoan: number; ufmip: number;
    loan: number; pi: number; tax: number; ins: number; pmi: number;
    total: number; closing: number; totalCash: number;
    savingsGap: number; incomeToQualify: number; qualifies: boolean;
    /** Price capped by loan limit (null if income-based max is already within limit) */
    limitCappedPrice: number | null;
}

function calcProgram(
    annualIncome: number, monthlyDebts: number, downPct: number,
    rate: number, term: number, taxRate: number, insRate: number,
    loanType: 'conventional' | 'fha', savings: number,
    loanLimit?: number,
): ProgramCalc | null {
    const maxPrice = calcMaxPrice(annualIncome, monthlyDebts, downPct, rate, term, taxRate, insRate, loanType);
    if (maxPrice <= 0) return null;
    const down     = maxPrice * downPct / 100;
    const baseLoan = maxPrice - down;
    const ufmip    = loanType === 'fha' ? baseLoan * 0.0175 : 0;
    const loan     = loanType === 'fha' ? baseLoan * 1.0175 : baseLoan;
    const ltv      = (baseLoan / maxPrice) * 100;
    const tax      = (maxPrice * taxRate) / 12;
    const ins      = (maxPrice * insRate) / 12;
    let pmi = 0;
    if (loanType === 'conventional' && ltv > 80) pmi = (loan * 0.0055) / 12; // 0.55%/yr — matches cardBuilders
    else if (loanType === 'fha') pmi = (loan * 0.0055) / 12;
    const pi           = calcPI(loan, rate, term);
    const total        = pi + tax + ins + pmi;
    const closing      = maxPrice * (loanType === 'fha' ? 0.03 : 0.025);
    const totalCash    = down + closing;
    const savingsGap   = Math.max(0, totalCash - savings);
    // incomeToQualify must include existing monthly debts — otherwise it
    // understates the income barrier and misleads users with high debt loads
    const incomeToQualify = Math.ceil(((total + monthlyDebts) / 0.43) * 12 / 100) * 100;
    // qualifies: use a small tolerance ($600) to absorb rounding at the edge
    const qualifies = annualIncome >= incomeToQualify - 600;
    // Show when loan limit is tighter than income-based max (e.g., FHA floor $541k)
    const limitCappedPrice = loanLimit
        ? (() => { const cap = Math.floor(loanLimit / (1 - downPct / 100) / 1_000) * 1_000; return cap < maxPrice ? cap : null; })()
        : null;
    return { maxPrice, down, baseLoan, ufmip, loan, pi, tax, ins, pmi, total, closing, totalCash, savingsGap, incomeToQualify, qualifies, limitCappedPrice };
}

// ── Formatting ──────────────────────────────────────────────────────────────

function fmt$(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtK(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(3).replace(/\.?0+$/, '')}M`;
    if (n >= 100_000)   return `$${Math.round(n / 1_000)}k`;
    return fmt$(n);
}

// ── Icons ───────────────────────────────────────────────────────────────────

const HomeIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"/>
    </svg>
);

const ShieldIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
    </svg>
);

const ChevronDown = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="10" height="10">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/>
    </svg>
);

const StarIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
        <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd"/>
    </svg>
);

// ── Drawer ───────────────────────────────────────────────────────────────────

interface DrawerProps {
    calc: ProgramCalc;
    loanType: 'fha' | 'conv3' | 'conv20';
    annualIncome: number;
    monthlyDebts: number;
}

function ProgramDrawer({ calc, loanType, annualIncome, monthlyDebts }: DrawerProps) {
    const pmiLabel = loanType === 'fha' ? 'FHA MIP' : 'PMI';

    return (
        <div className="afc-drawer">
            {/* Loan Structure */}
            <div className="afc-ds">
                <div className="afc-dl">Loan Structure</div>
                <KV k="Income-based max" v={fmt$(calc.maxPrice)} />
                {calc.limitCappedPrice && (
                    <div className="afc-limit-note">
                        {loanType === 'fha' ? 'FHA loan limit' : 'Conforming limit'}: {fmt$(calc.limitCappedPrice)} in this area — {loanType === 'fha' ? 'consider Jumbo for higher amounts' : 'Jumbo available above this'}
                    </div>
                )}
                <KV k="Down Payment"      v={fmt$(calc.down)} />
                {loanType === 'fha' ? (
                    <>
                        <KV k="Base Loan Amount"   v={fmt$(calc.baseLoan)} />
                        <KV k="FHA UFMIP Financed" v={fmt$(calc.ufmip)} />
                        <KV k="Total Loan Amount"  v={fmt$(calc.loan)} />
                    </>
                ) : (
                    <KV k="Loan Amount" v={fmt$(calc.loan)} />
                )}
            </div>

            {/* Monthly Payment */}
            <div className="afc-ds">
                <div className="afc-dl">Monthly Payment</div>
                <KV k="Principal & Interest" v={fmt$(calc.pi)} />
                <KV k="Property Taxes"       v={fmt$(calc.tax)} />
                <KV k="Home Insurance"       v={fmt$(calc.ins)} />
                {calc.pmi > 0 && <KV k={pmiLabel} v={fmt$(calc.pmi)} />}
                <KV k="Estimated Total" v={`${fmt$(calc.total)}/mo`} green total />
            </div>

            {/* Cash Needed */}
            <div className="afc-ds">
                <div className="afc-dl">Cash Needed</div>
                <KV k="Down Payment"    v={fmt$(calc.down)} />
                <KV k="Closing Costs"   v={fmt$(calc.closing)} />
                <KV k="Total Cash Needed" v={fmt$(calc.totalCash)} green total />
            </div>

            {/* Income to Qualify */}
            <div className="afc-qualify">
                <div>
                    <div className="afc-qualify-label">
                        Income to Qualify (43% DTI{monthlyDebts > 0 ? ` + ${fmt$(monthlyDebts)}/mo debt` : ''})
                    </div>
                    {calc.qualifies
                        ? <div className="afc-qualify-check">✓ Your {fmtK(annualIncome)}/yr qualifies</div>
                        : <div style={{ fontSize: '0.72rem', color: '#f87171', marginTop: 2 }}>⚠ Debt reduces buying power</div>
                    }
                </div>
                <div className="afc-qualify-val">{fmtK(calc.incomeToQualify)}/yr</div>
            </div>
        </div>
    );
}

function KV({ k, v, green, total }: { k: string; v: string; green?: boolean; total?: boolean }) {
    return (
        <div className={`afc-kv${total ? ' afc-kv--total' : ''}`}>
            <span className="afc-kv-k">{k}</span>
            <span className={`afc-kv-v${green ? ' afc-kv-v--green' : ''}`}>{v}</span>
        </div>
    );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AffordabilitySliderCard(props: AffordabilitySliderParams) {
    const [income, setIncome]     = useState(props.annualIncome);
    const [debts, setDebts]       = useState(props.monthlyDebts);
    const [savings, setSavings]   = useState(props.savings);
    const [downPct, setDownPct]   = useState(props.downPct > 0 ? props.downPct : 3);
    const [rate, setRate]         = useState(props.rate);
    const [term, setTerm]         = useState(props.term);
    const [openCard, setOpenCard] = useState<'fha' | 'conv3' | 'conv20' | null>('conv3');
    const [compOpen, setCompOpen] = useState(false);
    const [sliderOpen, setSliderOpen] = useState(false);
    const [drawerPhase, setDrawerPhase] = useState<'idle'|'running'|'done'>('idle');

    const initDownPct = props.downPct > 0 ? props.downPct : 3;
    const isDirty = income !== props.annualIncome || debts !== props.monthlyDebts ||
        savings !== props.savings || downPct !== initDownPct ||
        Math.abs(rate - props.rate) > 0.001 || term !== props.term;

    const router = useRouter();
    const [pageUrl, setPageUrl] = useState('');
    useEffect(() => { if (typeof window !== 'undefined') setPageUrl(window.location.href); }, []);
    async function handleSavePdf() {
        const res = await fetch('/api/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'affordability', params: { annualIncome: income, monthlyDebts: debts, savings, downPct, rate, term, taxRate: props.taxRate, insRate: props.insRate, loanType: 'conventional' } }),
        });
        if (!res.ok) throw new Error('PDF generation failed');
    }

    const { fha, conv3, conv20 } = useMemo(() => ({
        fha:    calcProgram(income, debts, 3.5,     rate, term, props.taxRate, props.insRate, 'fha',          savings, props.fhaLoanLimit),
        conv3:  calcProgram(income, debts, downPct, rate, term, props.taxRate, props.insRate, 'conventional', savings, props.confLoanLimit),
        conv20: calcProgram(income, debts, 20,      rate, term, props.taxRate, props.insRate, 'conventional', savings, props.confLoanLimit),
    }), [income, debts, savings, downPct, rate, term, props.taxRate, props.insRate, props.fhaLoanLimit, props.confLoanLimit]);

    // Explorer stats based on Conv 3% (the "best fit" recommendation)
    const ref = conv3;

    function toggle(id: 'fha' | 'conv3' | 'conv20') {
        setOpenCard(prev => prev === id ? null : id);
    }

    function buildSeed(): string {
        const debtsStr   = debts   > 0 ? ` with $${debts.toLocaleString()}/mo in existing debts` : '';
        const savingsStr = savings > 0 ? ` and ${fmtK(savings)} in savings` : '';
        return `Affordability for ${fmtK(income)}/yr income${debtsStr}${savingsStr} at ${rate.toFixed(3)}% — ${term} year fixed`;
    }

    function getRunOverrides(): Record<string, any> {
        const changedKeys: string[] = [];
        if (income !== props.annualIncome) changedKeys.push('annualIncome');
        if (debts !== props.monthlyDebts) changedKeys.push('monthlyDebts');
        if (Math.abs(rate - props.rate) > 0.001) changedKeys.push('annualRatePct');
        if (term !== props.term) changedKeys.push('term');
        return {
            annualIncome: income,
            savings,
            monthlyDebts: debts,
            downPaymentPct: downPct,
            annualRatePct: rate,
            changedKeys,
        };
    }

    async function handleDrawerRun() {
        setDrawerPhase('running');
        if (props.onRunScenario) props.onRunScenario(buildSeed(), getRunOverrides());
        await new Promise<void>(r => setTimeout(r, 900));
        setDrawerPhase('done');
        await new Promise<void>(r => setTimeout(r, 1800));
        setSliderOpen(false);
        setDrawerPhase('idle');
    }

    // Best-fit program routing for the follow-up chip
    const chipIsJumbo = !!conv3 && conv3.baseLoan > 806_500;
    const chipUseFHA  = !chipIsJumbo && !!fha?.qualifies && !conv3?.qualifies;
    const chipLt      = chipIsJumbo ? 'jumbo' : chipUseFHA ? 'fha' : 'conventional';
    const chipDp      = chipIsJumbo ? 20 : chipUseFHA ? 3.5 : downPct;
    const chipProg    = (chipUseFHA && fha) ? fha : conv3;

    return (
        <div className="afc">

            {/* ── Top badge bar ── */}
            <div className="afc-topbar">
                <div className="afc-topbar-l">
                    <div className="afc-dot" />
                    <span className="afc-tl">AI Analysis</span>
                </div>
                <span className="afc-tr">Live · CalcEngine-Deterministic</span>
            </div>

            {/* ── Summary tiles ── */}
            <div className="afc-sum">
                <div className="afc-sum-head">
                    <div className="afc-sum-icon">
                        <HomeIcon />
                    </div>
                    <div>
                        <div className="afc-sum-title">What You Can Afford</div>
                        <div className="afc-sum-sub">3 programs · based on your income &amp; savings</div>
                    </div>
                </div>
                <div className="afc-tiles">
                    <Tile icon={
                        <svg viewBox="0 0 24 24" fill="none" stroke="#00e87a" strokeWidth="1.8" width="16" height="16">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/>
                        </svg>
                    } label="Income" value={fmtK(income) + '/yr'} />
                    <Tile icon={
                        <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="1.8" width="16" height="16">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75"/>
                        </svg>
                    } label="Savings" value={fmtK(savings)} />
                    <Tile icon={
                        <svg viewBox="0 0 24 24" fill="none" stroke="#3d8bff" strokeWidth="1.8" width="16" height="16">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"/>
                        </svg>
                    } label="Rate (APR)" value={rate.toFixed(2) + '%'} />
                    {debts > 0 ? (
                        <div className="afc-tile afc-tile--debt">
                            <div className="afc-tile-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.8" width="16" height="16">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/>
                                </svg>
                            </div>
                            <div className="afc-tile-label">Existing Debts</div>
                            <div className="afc-tile-value" style={{ color: '#f87171' }}>{fmt$(debts)}/mo</div>
                        </div>
                    ) : (
                        <Tile icon={
                            <svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8" width="16" height="16">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253"/>
                            </svg>
                        } label="Target DTI" value="43%" />
                    )}
                </div>
            </div>

            {/* ── Program accordion cards ── */}
            <div className="afc-programs">

                {/* FHA 3.5% */}
                <div className={`afc-pc${openCard === 'fha' ? ' afc-pc--open' : ''}`}>
                    <div className="afc-ph" onClick={() => toggle('fha')}>
                        <div className="afc-pi afc-pi--fha"><HomeIcon /></div>
                        <div className="afc-pt">
                            <div className="afc-pt-name">FHA 3.5% Down</div>
                            <div className="afc-pt-sub">Government-backed · low entry</div>
                        </div>
                        <span className="afc-badge afc-badge--amber">Lowest cash to close</span>
                        <div className="afc-chev"><ChevronDown /></div>
                    </div>
                    {fha && (
                        <>
                            <div className="afc-pcstats">
                                <StatCell label="Max Home" value={fmtK(fha.maxPrice)} />
                                <StatCell label="Est. Payment" value={`${fmt$(fha.total)}/mo`} />
                                <StatCell label="Cash Needed" value={fmtK(fha.totalCash)} />
                            </div>
                            <div className="afc-pcnote">
                                <span className="afc-note-icon">ⓘ</span>
                                <span className="afc-note-text">MIP stays unless refinanced — factor this into long-term cost</span>
                            </div>
                            {openCard === 'fha' && <ProgramDrawer calc={fha} loanType="fha" annualIncome={income} monthlyDebts={debts} />}
                        </>
                    )}
                </div>

                {/* Conventional 3% */}
                <div className={`afc-pc afc-pc--best${openCard === 'conv3' ? ' afc-pc--open' : ''}`}>
                    <div className="afc-ph" onClick={() => toggle('conv3')}>
                        <div className="afc-pi afc-pi--conv3"><HomeIcon /></div>
                        <div className="afc-pt">
                            <div className="afc-pt-name">Conventional {parseFloat(downPct.toFixed(1))}% Down</div>
                            <div className="afc-pt-sub">{downPct >= 20 ? 'No PMI · best payment' : 'Low-entry conventional'}</div>
                        </div>
                        <span className="afc-badge afc-badge--green">Best fit</span>
                        <div className="afc-chev"><ChevronDown /></div>
                    </div>
                    {conv3 && (
                        <>
                            <div className="afc-pcstats">
                                <StatCell label="Max Home" value={fmtK(conv3.maxPrice)} />
                                <StatCell label="Est. Payment" value={`${fmt$(conv3.total)}/mo`} />
                                <StatCell label="Cash Needed" value={fmtK(conv3.totalCash)} />
                            </div>
                            <div className="afc-pcnote">
                                <span className="afc-note-icon">ⓘ</span>
                                <span className="afc-note-text">{downPct >= 20 ? 'No PMI at this down payment — cleanest long-term structure' : 'PMI drops off at 80% LTV — cleaner long term than FHA'}</span>
                            </div>
                            {openCard === 'conv3' && <ProgramDrawer calc={conv3} loanType="conv3" annualIncome={income} monthlyDebts={debts} />}
                        </>
                    )}
                </div>

                {/* Conventional 20% */}
                <div className={`afc-pc${openCard === 'conv20' ? ' afc-pc--open' : ''}`}>
                    <div className="afc-ph" onClick={() => toggle('conv20')}>
                        <div className="afc-pi afc-pi--conv20"><ShieldIcon /></div>
                        <div className="afc-pt">
                            <div className="afc-pt-name">Conventional 20% Down</div>
                            <div className="afc-pt-sub">Best long-term payment structure</div>
                        </div>
                        <span className="afc-badge afc-badge--blue">Best long-term</span>
                        <div className="afc-chev"><ChevronDown /></div>
                    </div>
                    {conv20 && (
                        <>
                            <div className="afc-pcstats">
                                <StatCell label="Max Home" value={fmtK(conv20.maxPrice)} />
                                <StatCell label="Est. Payment" value={`${fmt$(conv20.total)}/mo`} />
                                <StatCell label="Cash Needed" value={fmtK(conv20.totalCash)} />
                            </div>
                            <div className="afc-pcnote">
                                <span className="afc-note-icon">ⓘ</span>
                                <span className="afc-note-text">No PMI — highest purchase power but requires far more upfront cash</span>
                            </div>
                            {openCard === 'conv20' && <ProgramDrawer calc={conv20} loanType="conv20" annualIncome={income} monthlyDebts={debts} />}
                        </>
                    )}
                </div>
            </div>

            {/* ── Best picks ── */}
            <div className="afc-picks">
                <div className="afc-pick-row">
                    <div className="afc-pick-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#00e87a" strokeWidth="1.8" width="12" height="12">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
                        </svg>
                    </div>
                    <span className="afc-pick-label">Best entry option</span>
                    <span className="afc-pick-val">Conventional 3% down</span>
                </div>
                <div className="afc-pick-row">
                    <div className="afc-pick-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#00e87a" strokeWidth="1.8" width="12" height="12">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
                        </svg>
                    </div>
                    <span className="afc-pick-label">Best long-term structure</span>
                    <span className="afc-pick-val">Conventional 20% down</span>
                </div>
            </div>

            {/* ── Side-by-side comparison toggle ── */}
            <div className="afc-comp-wrap">
                <button type="button" className={`afc-comp-toggle${compOpen ? ' afc-comp-toggle--open' : ''}`} onClick={() => setCompOpen(p => !p)}>
                    <span>⊞ &nbsp;Side-by-side comparison</span>
                    <ChevronDown />
                </button>
                {compOpen && (
                    <div className="afc-comp-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Metric</th>
                                    <th>FHA 3.5%</th>
                                    <th className="afc-col-best">Conv {parseFloat(downPct.toFixed(1))}%</th>
                                    <th>Conv 20%</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td>Max Home Price</td><td>{fha ? fmtK(fha.maxPrice) : '—'}</td><td className="afc-col-best">{conv3 ? fmtK(conv3.maxPrice) : '—'}</td><td>{conv20 ? fmtK(conv20.maxPrice) : '—'}</td></tr>
                                <tr><td>Down Payment</td><td>{fha ? fmt$(fha.down) : '—'}</td><td className="afc-col-best">{conv3 ? fmt$(conv3.down) : '—'}</td><td>{conv20 ? fmt$(conv20.down) : '—'}</td></tr>
                                <tr><td>Loan Amount</td><td>{fha ? fmt$(fha.loan) : '—'}</td><td className="afc-col-best">{conv3 ? fmt$(conv3.loan) : '—'}</td><td>{conv20 ? fmt$(conv20.loan) : '—'}</td></tr>
                                <tr className="afc-tr-hl"><td>Est. Monthly</td><td>{fha ? fmt$(fha.total) : '—'}</td><td className="afc-col-best">{conv3 ? fmt$(conv3.total) : '—'}</td><td>{conv20 ? fmt$(conv20.total) : '—'}</td></tr>
                                <tr><td>P&amp;I</td><td>{fha ? fmt$(fha.pi) : '—'}</td><td className="afc-col-best">{conv3 ? fmt$(conv3.pi) : '—'}</td><td>{conv20 ? fmt$(conv20.pi) : '—'}</td></tr>
                                <tr><td>MIP / PMI</td><td>{fha ? fmt$(fha.pmi) : '—'}</td><td className="afc-col-best">{conv3 ? fmt$(conv3.pmi) : '—'}</td><td>$0</td></tr>
                                <tr className="afc-tr-hl"><td>Cash Needed</td><td>{fha ? fmt$(fha.totalCash) : '—'}</td><td className="afc-col-best">{conv3 ? fmt$(conv3.totalCash) : '—'}</td><td>{conv20 ? fmt$(conv20.totalCash) : '—'}</td></tr>
                                <tr><td>Income to Qualify</td><td>{fha ? fmtK(fha.incomeToQualify) : '—'}</td><td className="afc-col-best">{conv3 ? fmtK(conv3.incomeToQualify) : '—'}</td><td>{conv20 ? fmtK(conv20.incomeToQualify) : '—'}</td></tr>
                                <tr><td>MIP / PMI Drops Off</td><td>Refinance only</td><td className="afc-col-best">At 80% LTV</td><td>N/A</td></tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Slider Drawer Trigger */}
            <button className={`afc-slider-trigger${sliderOpen ? ' open' : ''}`} onClick={() => setSliderOpen(o => !o)}>
                <div className="afc-trigger-left">
                    <span style={{ fontSize: 15 }}>⚙</span>
                    <div>
                        <div className="afc-trigger-title">Adjust Your Numbers</div>
                        {isDirty && <div className="afc-trigger-sub">● Changes pending</div>}
                    </div>
                </div>
                <span className="afc-trigger-arrow">{sliderOpen ? '▲ Close' : '▼ Open'}</span>
            </button>
            <div className={`afc-sdrawer${sliderOpen ? ' open' : ''}`}>
            {/* ── Affordability Explorer ── */}
            <div className="afc-explorer">
                <div className="afc-exp-title">Affordability Explorer</div>

                <SliderField
                    label="Annual Income" value={income}
                    min={30000} max={500000} step={1000}
                    onChange={setIncome}
                    format={v => fmtK(v) + '/yr'}
                    minLabel="$30k" maxLabel="$500k"
                    trackColor={COLORS.accent} theme="dark"
                />

                <SliderField
                    label="Monthly Debts" value={debts}
                    min={0} max={5000} step={50}
                    onChange={setDebts}
                    format={v => v === 0 ? 'None' : fmt$(v) + '/mo'}
                    minLabel="$0" maxLabel="$5k/mo"
                    trackColor={COLORS.accent} theme="dark"
                />

                <SliderField
                    label="Available Savings" value={savings}
                    min={0} max={500000} step={1000}
                    onChange={setSavings}
                    format={v => v === 0 ? 'None' : fmtK(v)}
                    minLabel="$0" maxLabel="$500k"
                    trackColor={COLORS.accent} theme="dark"
                />

                <SliderField
                    label="Down Payment (Conv)" value={downPct}
                    min={3} max={30} step={0.5}
                    onChange={setDownPct}
                    format={v => parseFloat(v.toFixed(1)) + '%'}
                    minLabel="3%" maxLabel="30%"
                    trackColor={COLORS.accent} theme="dark"
                />

                <SliderField
                    label="Interest Rate" value={rate}
                    min={3} max={12} step={0.125}
                    onChange={setRate}
                    format={v => parseFloat(v.toFixed(3)) + '%'}
                    minLabel="3%" maxLabel="12%"
                    trackColor={COLORS.accent} theme="dark"
                />

                {/* Term buttons */}
                <div className="afc-exp-term-label">Loan Term</div>
                <div className="afc-terms">
                    {([15, 20, 30] as const).map(t => (
                        <button type="button" key={t}
                            className={`afc-term${term === t ? ' afc-term--on' : ''}`}
                            onClick={() => setTerm(t)}
                        >{t}yr</button>
                    ))}
                </div>

                {/* Stats bar */}
                {ref && (
                    <div className="afc-exp-stats">
                        <div className="afc-exp-stat">
                            <div className="afc-exp-stat-label">Down Payment</div>
                            <div className="afc-exp-stat-val">{fmt$(ref.down)}</div>
                        </div>
                        <div className="afc-exp-stat">
                            <div className="afc-exp-stat-label">Closing Costs</div>
                            <div className="afc-exp-stat-val">~{fmt$(ref.closing)}</div>
                        </div>
                        <div className="afc-exp-stat">
                            <div className="afc-exp-stat-label">Total Cash Needed</div>
                            <div className="afc-exp-stat-val">{fmt$(ref.totalCash)}</div>
                        </div>
                        <div className="afc-exp-stat">
                            <div className="afc-exp-stat-label">
                                {ref.savingsGap > 0 ? '⚠ Savings Gap' : '✓ Savings OK'}
                            </div>
                            <div className="afc-exp-stat-val" style={{ color: ref.savingsGap > 0 ? '#ef4444' : '#059669' }}>
                                {ref.savingsGap > 0
                                    ? `Need ${fmt$(ref.savingsGap)} more`
                                    : `${fmt$(props.savings - ref.totalCash)} left after close`}
                            </div>
                        </div>
                    </div>
                )}

            </div>
            {/* Drawer CTA — dark bg, outside white section */}
            <div className="afc-sdrawer-cta">
                {drawerPhase === 'idle' && !isDirty && <span className="afc-sdrawer-hint">Drag sliders to model a new scenario</span>}
                {drawerPhase === 'idle' && isDirty && <button className="afc-sdrawer-run" onClick={handleDrawerRun}>▶ Run Adjusted Scenario →</button>}
                {drawerPhase === 'running' && <span className="afc-sdrawer-hint">Calculating…</span>}
                {drawerPhase === 'done' && <span className="afc-sdrawer-done">✓ Numbers Updated</span>}
            </div>
            </div>

            {/* Follow-up chip — run best-fit purchase estimate */}
            {chipProg && props.onRunScenario && (
                <div className="afc-followup-row">
                    <button
                        type="button"
                        className="afc-followup-chip"
                        onClick={() => {
                            const prStr = chipProg!.maxPrice >= 1_000_000
                                ? `$${(chipProg!.maxPrice / 1_000_000).toFixed(1)}M`
                                : `$${Math.round(chipProg!.maxPrice / 1000)}k`;
                            props.onRunScenario!(
                                `What does a ${prStr} ${chipLt} loan with ${chipDp}% down look like at ${rate.toFixed(2)}%?`,
                                { purchasePrice: chipProg!.maxPrice, downPaymentPct: chipDp, annualRatePct: rate, loanType: chipLt }
                            );
                        }}
                    >
                        {chipIsJumbo ? 'Run Jumbo estimate →' : chipUseFHA ? 'Run FHA estimate →' : 'Run Conventional estimate →'}
                    </button>
                </div>
            )}

            {/* Check a property */}
            {conv3 && (
                <div className="afc-property-row">
                    <button
                        type="button"
                        className="afc-btn-property"
                        onClick={() => {
                            const p = new URLSearchParams({
                                price:   String(Math.round(conv3!.maxPrice)),
                                dp:      String(downPct),
                                rate:    rate.toFixed(3),
                                term:    String(term),
                                lt:      'conventional',
                                taxRate: props.taxRate.toFixed(5),
                                insRate: props.insRate.toFixed(5),
                            });
                            router.push(`/check-property?${p.toString()}`);
                        }}
                    >
                        Check a property →
                    </button>
                </div>
            )}

            {/* ── Disclosures ── */}
            <div className="afc-disc">
                <p>
                    <strong>Educational estimates only.</strong> These figures are for planning purposes and are not a Loan Estimate, pre-approval, or commitment to lend under RESPA/TRID. Monthly payment estimates include principal &amp; interest, estimated property tax ({(props.taxRate * 100).toFixed(1)}% annual), homeowner&apos;s insurance ({(props.insRate * 100).toFixed(1)}% annual), and applicable MIP or PMI where shown. Closing costs estimated at 2.5–3% of purchase price. Actual terms depend on creditworthiness, property type, and lender. Rate sourced from FRED 30-Year Fixed Mortgage Average — not a rate lock or offer.
                </p>
            </div>

            {/* ── Rate assumption (FRED) — bottom of card ── */}
            <div className="afc-rate-note">
                <span className="afc-bulb">💡</span>
                <p><strong>Assumption:</strong> Rate assumed at <strong>{props.rate.toFixed(2)}%</strong> (FRED 30-yr fixed, live). Actual rate depends on credit score, lender, and lock timing. Use the slider above to model different rates.</p>
            </div>

            <div style={{ padding: '0 16px 16px', display: 'flex', justifyContent: 'flex-end' }}>
                <ShareAnswerButton url={pageUrl || undefined} onSavePdf={handleSavePdf} />
            </div>

            {/* ── Styles ── */}
            <style>{`
                .afc {
                    background: #0d1117;
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 16px;
                    overflow: clip;
                    margin-top: 14px;
                    font-family: system-ui, -apple-system, sans-serif;
                    color: #f0f4ff;
                }

                /* topbar */
                .afc-topbar {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 10px 16px;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    background: rgba(255,255,255,0.02);
                }
                .afc-topbar-l { display: flex; align-items: center; gap: 6px; }
                .afc-dot { width: 7px; height: 7px; border-radius: 50%; background: #00e87a; }
                .afc-tl { font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #94a3b8; }
                .afc-tr { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #eaf8f7; }

                /* summary */
                .afc-sum { padding: 16px 16px 0; }
                .afc-sum-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
                .afc-sum-icon {
                    width: 32px; height: 32px; border-radius: 9px;
                    background: rgba(0,232,122,0.1);
                    display: flex; align-items: center; justify-content: center;
                    flex-shrink: 0; color: #00e87a;
                }
                .afc-sum-title { font-size: 15px; font-weight: 700; color: #f0f4ff; }
                .afc-sum-sub { font-size: 11px; color: #94a3b8; margin-top: 1px; }
                .afc-tiles {
                    display: grid; grid-template-columns: repeat(4,1fr); gap: 6px;
                    margin-bottom: 14px;
                }
                .afc-tile {
                    background: #141b28; border-radius: 10px; padding: 10px 8px 8px;
                    text-align: center;
                }
                .afc-tile-icon { margin-bottom: 5px; display: flex; justify-content: center; }
                .afc-tile-label { font-size: 10px; color: #94a3b8; margin-bottom: 3px; }
                .afc-tile-value { font-size: 12px; font-weight: 700; color: #f0f4ff; }

                /* programs */
                .afc-programs { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; }

                .afc-pc {
                    background: #0e1420;
                    border: 1px solid rgba(255,255,255,0.07);
                    border-radius: 12px; overflow: hidden;
                }
                .afc-pc--best {
                    border-color: rgba(0,232,122,0.3);
                    box-shadow: 0 0 0 1px rgba(0,232,122,0.06), 0 4px 16px rgba(0,232,122,0.05);
                }

                .afc-ph {
                    display: flex; align-items: center; gap: 10px;
                    padding: 12px 14px 10px;
                    cursor: pointer; user-select: none;
                }
                .afc-pi {
                    width: 32px; height: 32px; border-radius: 8px;
                    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
                }
                .afc-pi--fha   { background: rgba(251,191,36,0.12); color: #fbbf24; }
                .afc-pi--conv3 { background: rgba(0,232,122,0.1);   color: #00e87a; }
                .afc-pi--conv20{ background: rgba(61,139,255,0.1);  color: #3d8bff; }

                .afc-pt { flex: 1; min-width: 0; }
                .afc-pt-name { font-size: 13px; font-weight: 700; color: #f0f4ff; }
                .afc-pt-sub  { font-size: 11px; color: #94a3b8; margin-top: 1px; }

                .afc-badge {
                    font-size: 9px; font-weight: 800; padding: 3px 8px;
                    border-radius: 20px; flex-shrink: 0; letter-spacing: .04em;
                    white-space: nowrap; text-transform: uppercase;
                }
                .afc-badge--green { background: rgba(0,232,122,0.12); color: #00e87a; border: 1px solid rgba(0,232,122,0.2); }
                .afc-badge--amber { background: rgba(251,191,36,0.12); color: #fbbf24; border: 1px solid rgba(251,191,36,0.2); }
                .afc-badge--blue  { background: rgba(61,139,255,0.12); color: #3d8bff; border: 1px solid rgba(61,139,255,0.2); }

                .afc-chev {
                    width: 20px; height: 20px; border-radius: 6px;
                    background: rgba(255,255,255,0.04);
                    display: flex; align-items: center; justify-content: center;
                    flex-shrink: 0; transition: transform .2s, background .15s;
                    color: #eaf8f7;
                }
                .afc-pc--open .afc-chev {
                    transform: rotate(180deg);
                    background: rgba(0,232,122,0.08);
                    color: #00e87a;
                }

                .afc-pcstats {
                    display: grid; grid-template-columns: repeat(3,1fr);
                    border-top: 1px solid rgba(255,255,255,0.04);
                    border-bottom: 1px solid rgba(255,255,255,0.04);
                }
                .afc-sc { padding: 9px 12px; }
                .afc-sc:not(:last-child) { border-right: 1px solid rgba(255,255,255,0.04); }
                .afc-sc-label { font-size: 9px; color: #eaf8f7; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 3px; font-weight: 600; }
                .afc-sc-val   { font-size: 13px; font-weight: 700; color: #f0f4ff; }

                .afc-pcnote {
                    padding: 7px 14px 9px;
                    display: flex; align-items: flex-start; gap: 6px;
                }
                .afc-note-icon { font-size: 11px; color: #eaf8f7; flex-shrink: 0; margin-top: 1px; }
                .afc-note-text { font-size: 11px; color: #94a3b8; line-height: 1.45; }

                /* drawer */
                .afc-drawer {
                    border-top: 1px solid rgba(255,255,255,0.05);
                    padding: 14px;
                    background: rgba(0,0,0,0.15);
                }
                .afc-ds { margin-bottom: 14px; }
                .afc-ds:last-child { margin-bottom: 0; }
                .afc-dl {
                    font-size: 9px; font-weight: 800; color: #eaf8f7;
                    text-transform: uppercase; letter-spacing: .1em; margin-bottom: 7px;
                }
                .afc-kv {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.03);
                }
                .afc-kv:last-child { border-bottom: none; }
                .afc-kv--total {
                    border-top: 1px solid rgba(255,255,255,0.07);
                    border-bottom: none; margin-top: 3px; padding-top: 7px;
                }
                .afc-kv-k { font-size: 12px; color: #8fa3b8; }
                .afc-kv-v { font-size: 12px; font-weight: 600; color: #f0f4ff; }
                .afc-kv-v--green { color: #00e87a; }
                .afc-limit-note { font-size: 0.65rem; color: #f59e0b; background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.22); border-radius: 6px; padding: 5px 8px; margin: 4px 0 6px; line-height: 1.45; }

                /* income to qualify band */
                .afc-qualify {
                    background: rgba(0,232,122,0.05);
                    border: 1px solid rgba(0,232,122,0.12);
                    border-radius: 8px; padding: 10px 12px; margin-top: 10px;
                    display: flex; align-items: center; justify-content: space-between;
                }
                .afc-qualify-label { font-size: 11px; color: #94a3b8; }
                .afc-qualify-check { font-size: 11px; color: #4a6e58; margin-top: 2px; }
                .afc-qualify-val   { font-size: 13px; font-weight: 700; color: #00e87a; }

                /* best picks */
                .afc-picks {
                    margin: 0 12px 12px;
                    background: #0e1420;
                    border: 1px solid rgba(255,255,255,0.07);
                    border-radius: 10px; padding: 12px 14px;
                }
                .afc-pick-row {
                    display: flex; align-items: center; gap: 10px;
                    padding: 6px 0;
                    border-bottom: 1px solid rgba(255,255,255,0.04);
                }
                .afc-pick-row:last-child { border-bottom: none; }
                .afc-pick-icon {
                    width: 24px; height: 24px; border-radius: 6px;
                    background: rgba(0,232,122,0.08);
                    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
                }
                .afc-pick-label { font-size: 12px; color: #94a3b8; flex: 1; }
                .afc-pick-val   { font-size: 12px; font-weight: 700; color: #00e87a; }

                /* comparison toggle */
                .afc-comp-wrap { margin: 0 12px 12px; }
                .afc-comp-toggle {
                    width: 100%;
                    display: flex; align-items: center; justify-content: space-between;
                    background: #0e1420; border: 1px solid rgba(255,255,255,0.07);
                    border-radius: 10px; padding: 11px 14px;
                    font-size: 12px; font-weight: 600; color: #8fa3b8;
                    cursor: pointer; font-family: inherit;
                    transition: color .15s, border-color .15s;
                }
                .afc-comp-toggle:hover { color: #f0f4ff; border-color: rgba(255,255,255,0.12); }
                .afc-comp-toggle--open {
                    color: #f0f4ff; border-bottom-left-radius: 0; border-bottom-right-radius: 0;
                    border-color: rgba(255,255,255,0.1);
                }
                .afc-comp-toggle--open svg { transform: rotate(180deg); }
                .afc-comp-table {
                    background: #0e1420;
                    border: 1px solid rgba(255,255,255,0.07);
                    border-top: none;
                    border-radius: 0 0 10px 10px;
                    overflow: hidden;
                }
                .afc-comp-table table { width: 100%; border-collapse: collapse; }
                .afc-comp-table thead th {
                    padding: 9px 10px; text-align: left;
                    font-size: 10px; font-weight: 700; color: #eaf8f7;
                    text-transform: uppercase; letter-spacing: .07em;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    background: rgba(0,0,0,0.2);
                }
                .afc-comp-table thead th:not(:first-child) { text-align: right; }
                .afc-comp-table tbody td {
                    padding: 8px 10px; font-size: 12px; color: #8fa3b8;
                    border-bottom: 1px solid rgba(255,255,255,0.03);
                }
                .afc-comp-table tbody td:not(:first-child) { text-align: right; font-weight: 600; color: #f0f4ff; }
                .afc-comp-table tbody tr:last-child td { border-bottom: none; }
                .afc-tr-hl td { background: rgba(0,232,122,0.04); }
                .afc-tr-hl td:not(:first-child) { color: #00e87a !important; }
                .afc-col-best { background: rgba(0,232,122,0.04); }

                /* rate note */
                .afc-rate-note {
                    margin: 0 12px 12px;
                    background: rgba(0,232,122,0.04);
                    border: 1px solid rgba(0,232,122,0.12);
                    border-radius: 10px; padding: 10px 14px;
                    display: flex; align-items: flex-start; gap: 10px;
                }
                .afc-bulb { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
                .afc-rate-note p { font-size: 12px; color: #8fa3b8; line-height: 1.5; }
                .afc-rate-note strong { color: #00e87a; }

                /* explorer */
                .afc-explorer {
                    border-top: 1px solid rgba(255,255,255,0.05);
                    padding: 16px 18px;
                    background: #0d1117;
                    color: #f0f4ff;
                    overflow: visible;
                }
                .afc-exp-title { font-size: 13px; font-weight: 700; color: #f0f4ff; margin-bottom: 14px; }
                .afc-exp-term-label { font-size: 13px; font-weight: 600; color: #8fa3b8; margin: 14px 0 8px; }
                .afc-terms { display: flex; gap: 8px; margin-bottom: 16px; }
                .afc-term {
                    flex: 1; padding: 10px 0; border-radius: 8px;
                    border: 1.5px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04);
                    font-size: 13px; font-weight: 600; color: #94a3b8;
                    cursor: pointer; font-family: inherit; text-align: center;
                    transition: all .15s;
                }
                .afc-term--on { border-color: #00e87a; color: #00e87a; background: rgba(0,232,122,0.08); }
                .afc-term:hover:not(.afc-term--on) { border-color: rgba(255,255,255,0.2); color: #f0f4ff; }

                .afc-exp-stats {
                    display: flex; flex-wrap: wrap; gap: 8px;
                    border-top: 1px solid rgba(255,255,255,0.06); padding-top: 12px; margin-bottom: 14px;
                }
                .afc-exp-stat { flex: 1; min-width: 100px; }
                .afc-exp-stat-label {
                    font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
                    color: #eaf8f7; font-weight: 700; margin-bottom: 3px;
                }
                .afc-exp-stat-val { font-size: 14px; font-weight: 700; color: #f0f4ff; }

                .afc-exp-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
                .afc-btn-rerun {
                    background: #111827; color: #f9fafb;
                    border: none; border-radius: 8px;
                    padding: 10px 18px; font-size: 13px; font-weight: 700;
                    cursor: pointer; font-family: inherit; flex-shrink: 0;
                    transition: background .15s;
                }
                .afc-btn-rerun:hover { background: #1f2937; }
                .afc-btn-vault {
                    display: flex; align-items: center; gap: 6px;
                    background: #00e87a; color: #07100f;
                    border: none; border-radius: 8px;
                    padding: 10px 16px; font-size: 13px; font-weight: 700;
                    cursor: pointer; font-family: inherit; flex-shrink: 0;
                    transition: opacity .15s;
                }
                .afc-btn-vault:hover { opacity: .88; }
                .afc-btn-match {
                    margin-left: auto;
                    background: #00e87a; color: #07100f;
                    border: none; border-radius: 8px;
                    padding: 10px 20px; font-size: 13px; font-weight: 700;
                    cursor: pointer; font-family: inherit;
                    transition: opacity .15s;
                }
                .afc-btn-match:hover { opacity: .88; }

                /* follow-up chip */
                .afc-followup-row { padding:0 12px 6px; }
                .afc-followup-chip { background:rgba(0,232,122,0.08); color:#00e87a; border:1.5px solid rgba(0,232,122,0.25); border-radius:8px; padding:10px 18px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; }
                .afc-followup-chip:hover { background:rgba(0,232,122,0.15); border-color:rgba(0,232,122,0.45); }

                /* check a property */
                .afc-property-row { padding:0 12px 10px; }
                .afc-btn-property { background:rgba(0,232,122,0.08); color:#00e87a; border:1.5px solid rgba(0,232,122,0.25); border-radius:8px; padding:10px 18px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; }
                .afc-btn-property:hover { background:rgba(0,232,122,0.15); border-color:rgba(0,232,122,0.45); }

                /* disclosures */
                .afc-disc {
                    margin: 0 12px 16px;
                    background: rgba(255,255,255,0.02);
                    border: 1px solid rgba(255,255,255,0.05);
                    border-radius: 10px; padding: 12px 14px;
                }
                .afc-disc p { font-size: 11px; color: #eaf8f7; line-height: 1.6; }
                .afc-disc strong { color: #94a3b8; font-weight: 600; }

                /* ── Slider Drawer ── */
                @keyframes afcTriggerPulse {
                    0%, 100% { box-shadow: none; }
                    50% { box-shadow: 0 0 14px rgba(0,232,122,0.08) inset; }
                }
                @keyframes afcRunPulse {
                    0%, 100% { box-shadow: none; }
                    50% { box-shadow: 0 0 20px rgba(0,232,122,0.22); }
                }
                .afc-slider-trigger {
                    width:100%; display:flex; align-items:center; justify-content:space-between; gap:12px;
                    padding:13px 18px; background:transparent; border:none;
                    border-top:1px solid rgba(0,232,122,0.12);
                    cursor:pointer; font-family:inherit; position:relative; overflow:hidden;
                    transition:background 0.2s, border-color 0.2s;
                    animation:afcTriggerPulse 3s ease-in-out infinite;
                }
                .afc-slider-trigger:hover, .afc-slider-trigger.open {
                    background:rgba(0,232,122,0.05); border-color:rgba(0,232,122,0.3); animation:none;
                }
                .afc-trigger-left { display:flex; align-items:center; gap:10px; text-align:left; }
                .afc-trigger-title { font-size:13px; font-weight:700; color:#00e87a; }
                .afc-trigger-sub { font-size:10px; color:rgba(0,232,122,0.6); margin-top:1px; }
                .afc-trigger-arrow { font-size:11px; color:rgba(0,232,122,0.55); flex-shrink:0; }
                .afc-sdrawer { max-height:0; overflow:hidden; transition:max-height 0.4s cubic-bezier(0.4,0,0.2,1); }
                .afc-sdrawer.open { max-height:900px; }
                .afc-sdrawer-cta { padding:12px 18px; background:#0d1117; }
                .afc-sdrawer-hint { font-size:12px; color:rgba(148,163,184,0.4); display:block; text-align:center; padding:8px 0; }
                .afc-sdrawer-done { font-size:13px; color:#00e87a; display:block; text-align:center; font-weight:600; padding:10px 0; }
                .afc-sdrawer-run {
                    width:100%; padding:13px 18px;
                    background:rgba(0,232,122,0.08); border:1.5px solid rgba(0,232,122,0.38);
                    border-radius:10px; color:#00e87a; font-size:14px; font-weight:700;
                    cursor:pointer; font-family:inherit; transition:all 0.15s;
                    animation:afcRunPulse 1.8s ease-in-out infinite;
                }
                .afc-sdrawer-run:hover { background:rgba(0,232,122,0.16); animation:none; }

                @media (max-width: 480px) {
                    .afc-tiles { grid-template-columns: repeat(2,1fr); }
                    .afc-badge { display: none; }
                    .afc-exp-stats { gap: 6px; }
                    .afc-exp-stat { min-width: 80px; }
                }
                @media (max-width: 640px) {
                    .afc-exp-actions { flex-direction:column; gap:8px; }
                    .afc-btn-vault,.afc-btn-match { width:100%; justify-content:center; text-align:center; margin-left:0; }
                    .afc-btn-property { width:100%; text-align:center; }
                }
            `}</style>
        </div>
    );
}

// ── Small sub-components ─────────────────────────────────────────────────────

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="afc-tile">
            <div className="afc-tile-icon">{icon}</div>
            <div className="afc-tile-label">{label}</div>
            <div className="afc-tile-value">{value}</div>
        </div>
    );
}

function StatCell({ label, value }: { label: string; value: string }) {
    return (
        <div className="afc-sc">
            <div className="afc-sc-label">{label}</div>
            <div className="afc-sc-val">{value}</div>
        </div>
    );
}
