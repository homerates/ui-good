'use client';

// app/components/InteractiveSliderCard.tsx
// Conventional · FHA · VA · Jumbo — dark theme rebuild with slider drawer UX

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import PdfDownloadButton from './PdfDownloadButton';
import SliderField from './SliderField';
import { CA_LOAN_LIMITS_2026 } from '@/loanLimits2026';
import { HIGH_COST_COUNTIES, type NationalCountyLimits } from '@/loanLimitsNational2026';

export interface SliderCardParams {
    price: number;
    downPct: number;
    rate: number;
    term: number;
    taxRate: number;
    insRate: number;
    loanType: 'conventional' | 'fha' | 'va' | 'jumbo';
    vaFundingFeePct?: number;
    buydownType?: '2/1' | '1/0' | '3/2/1' | 'none';
    sellerCredit?: number;
    onRunScenario?: (seed: string, paramOverrides: Record<string, any>) => void;
    /** When true (property_lookup path): hide Adjust drawer + action buttons — income card is the sole interactive surface */
    hideDrawer?: boolean;
    // CMA params — passed from property lookup path to enable Full Property Intelligence Report button
    cmaAddress?: string;
    cmaCity?: string;
    cmaState?: string;
    cmaZip?: string;
    cmaPrice?: number;
    cmaBeds?: number;
    cmaBaths?: number;
    cmaSqft?: number;
    cmaTaxAnnual?: number;
    cmaTaxRate?: number;
    cmaLiveRate?: number;
    cmaPhotoUrl?: string;
    journeyAddress?: string;  // set when launched from my-home — enables Property Intelligence CTA
    annualIncome?: number;   // borrower's actual annual income — carried forward through adjusted scenarios
}

function iscNormKey(a: string) { return a.trim().toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').slice(0,100); }
function iscGetSid(a: string): string | null { try { return localStorage.getItem(`pi_sid_${iscNormKey(a)}`); } catch { return null; } }
function iscSetSid(a: string, sid: string)   { try { localStorage.setItem(`pi_sid_${iscNormKey(a)}`, sid); } catch {} }

const VA_FF_OPTIONS = [
    { label: 'Exempt', pct: 0 },
    { label: '1.25%',  pct: 1.25 },
    { label: '1.50%',  pct: 1.50 },
    { label: '2.15%',  pct: 2.15 },
];

// ── Math ──────────────────────────────────────────────────────────────────────

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
function fmtRate(r: number) { return parseFloat(r.toFixed(3)) + '%'; }
function fmtK(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 100_000)   return `$${Math.round(n / 1_000)}k`;
    return fmtDollar(n);
}

interface BuydownRow { yr: number; effectiveRate: number; pi: number; monthlySavings: number; annualSavings: number; }
interface BuydownSchedule { rows: BuydownRow[]; piNote: number; totalCost: number; }

function computeBuydownSchedule(loan: number, noteRate: number, term: number, bdType: '2/1' | '1/0' | '3/2/1'): BuydownSchedule {
    const piNote = calcPI(loan, noteRate, term);
    const reductions = bdType === '3/2/1' ? [3, 2, 1] : bdType === '2/1' ? [2, 1] : [1];
    const rows: BuydownRow[] = reductions.map((red, i) => {
        const effectiveRate = Math.max(0, noteRate - red);
        const pi = calcPI(loan, effectiveRate, term);
        return { yr: i + 1, effectiveRate, pi, monthlySavings: piNote - pi, annualSavings: (piNote - pi) * 12 };
    });
    return { rows, piNote, totalCost: rows.reduce((s, r) => s + r.annualSavings, 0) };
}

const C = { pi: '#3d8bff', tax: '#ff8c42', ins: '#00e87a', pmi: '#ff5f5f' };

// ── Component ─────────────────────────────────────────────────────────────────

export default function InteractiveSliderCard(props: SliderCardParams) {
    const [price,    setPrice]    = useState(props.price);
    const [downPct,  setDownPct]  = useState(props.downPct);
    const [rate,     setRate]     = useState(props.rate);
    const [term,     setTerm]     = useState(props.term);
    const [loanType, setLoanType] = useState<'conventional' | 'fha' | 'va' | 'jumbo'>(props.loanType);
    const initFfPct = props.vaFundingFeePct ?? 2.15;
    const [vaFfPct,        setVaFfPct]        = useState<number>(initFfPct);
    const [isSubsequentUse,setIsSubsequentUse] = useState(false);
    const [countyLimit,    setCountyLimit]     = useState(832750);
    const [prevEntUsed,    setPrevEntUsed]     = useState(0);
    const [countyQuery,    setCountyQuery]     = useState('');
    const [countyResults,  setCountyResults]   = useState<{label: string; state: string; limit: number}[]>([]);
    const [countyMsg,      setCountyMsg]       = useState('');
    const [countySelected, setCountySelected]  = useState('');
    const initBdType = (props.buydownType ?? 'none') as '2/1' | '1/0' | '3/2/1' | 'none';
    const [activeBdType,    setActiveBdType]    = useState<'2/1' | '1/0' | '3/2/1' | 'none'>(initBdType);
    const [sellerCreditAmt, setSellerCreditAmt] = useState(props.sellerCredit ?? 0);
    const [sliderOpen,  setSliderOpen]  = useState(false);
    const [drawerPhase, setDrawerPhase] = useState<'idle'|'running'|'done'>('idle');
    const [vaultDone,   setVaultDone]   = useState(false);

    const { user } = useUser();
    const router   = useRouter();


    // ── Journey: L1 write-back when launched from my-home property context ────
    const iscJourneyFired = useRef(false);
    const [journeySid, setJourneySid] = useState<string | null>(
        props.journeyAddress ? iscGetSid(props.journeyAddress) : null,
    );
    useEffect(() => {
        if (!props.journeyAddress || iscJourneyFired.current) return;
        iscJourneyFired.current = true;
        const ltvCalc = (1 - props.downPct / 100) * 100;
        const l1Score =
            props.loanType === 'va'    ? (ltvCalc <= 80 ? 88 : 78) :
            props.loanType === 'fha'   ? (ltvCalc <= 90 ? 72 : ltvCalc <= 95 ? 65 : 58) :
            props.loanType === 'jumbo' ? (ltvCalc <= 75 ? 86 : ltvCalc <= 80 ? 80 : 72) :
                                         (ltvCalc <= 80 ? 85 : ltvCalc <= 85 ? 78 : ltvCalc <= 90 ? 70 : 60);
        const l1Summary = `${props.loanType} ${props.downPct}% down · ${ltvCalc.toFixed(1)}% LTV · ${props.rate.toFixed(2)}% rate`;
        fetch('/api/buyer-sessions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ property_address: props.journeyAddress, l1_score: l1Score, l1_summary: l1Summary, scenario_json: { price: props.price, dp_pct: props.downPct, lt: props.loanType, rate: props.rate, term: props.term } }),
        }).then(r => r.ok ? r.json() : null).then(d => { if (d?.session?.id) { iscSetSid(props.journeyAddress!, d.session.id); setJourneySid(d.session.id); } }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.journeyAddress]);

    // ── County / ZIP search ──────────────────────────────────────────────────

    function searchCountyName(q: string) {
        const upper = q.toUpperCase().trim();
        if (upper.length < 2) { setCountyResults([]); setCountyMsg(''); return; }
        const results: {label: string; state: string; limit: number}[] = [];
        for (const c of CA_LOAN_LIMITS_2026)
            if (c.county.includes(upper)) results.push({ label: c.county, state: 'CA', limit: c.conforming.units1 });
        for (const [state, counties] of Object.entries(HIGH_COST_COUNTIES) as [string, NationalCountyLimits[]][])
            for (const c of counties)
                if (c.county.includes(upper)) results.push({ label: c.county, state, limit: c.conforming.units1 });
        setCountyResults(results.slice(0, 8));
        setCountyMsg(results.length === 0 ? 'Not in high-cost list — standard $832,750 applies' : '');
    }

    async function lookupZip(zip: string) {
        setCountyMsg('Looking up ZIP...');
        setCountyResults([]);
        try {
            const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
            if (!res.ok) { setCountyMsg('ZIP not found — type county name instead'); return; }
            const data = await res.json();
            const st: string = data.places?.[0]?.['state abbreviation'] ?? '';
            if (!st) { setCountyMsg('ZIP not found — type county name instead'); return; }
            const list: {label: string; state: string; limit: number}[] = [];
            if (st === 'CA') {
                for (const c of CA_LOAN_LIMITS_2026) list.push({ label: c.county, state: 'CA', limit: c.conforming.units1 });
            } else if (HIGH_COST_COUNTIES[st]) {
                for (const c of (HIGH_COST_COUNTIES[st] as NationalCountyLimits[])) list.push({ label: c.county, state: st, limit: c.conforming.units1 });
            }
            if (list.length > 0) { setCountyResults(list); setCountyMsg(`${st} — select your county:`); }
            else { setCountyLimit(832750); setCountySelected(`Standard conforming — ${st}`); setCountyMsg(`${st} uses national baseline $832,750`); }
        } catch { setCountyMsg('Lookup failed — type county name instead'); }
    }

    useEffect(() => {
        if (!countyQuery) { setCountyResults([]); setCountyMsg(''); return; }
        const trimmed = countyQuery.trim();
        if (/^\d{5}$/.test(trimmed)) { const t = setTimeout(() => lookupZip(trimmed), 400); return () => clearTimeout(t); }
        searchCountyName(trimmed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [countyQuery]);

    useEffect(() => {
        if (!isSubsequentUse || loanType !== 'va') { if (!isSubsequentUse && loanType === 'va') setDownPct(0); return; }
        const entTotal  = Math.round(countyLimit * 0.25);
        const entRemain = Math.max(0, entTotal - prevEntUsed);
        const maxZeroDn = entRemain * 4;
        const dpNeeded  = price > maxZeroDn ? Math.round(0.25 * (price - maxZeroDn)) : 0;
        setDownPct(price > 0 ? parseFloat(((dpNeeded / price) * 100).toFixed(2)) : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSubsequentUse, countyLimit, prevEntUsed, price, loanType]);

    // ── Derived ──────────────────────────────────────────────────────────────

    const hasBuydownUI = props.buydownType !== undefined;
    const vaConcessionCap = Math.round(price * 0.04 / 1000) * 1000;
    const priceMax      = loanType === 'jumbo' ? 5000000 : props.price > 2000000 ? 4000000 : 2000000;
    const priceMaxLabel = priceMax === 5000000 ? '$5M' : priceMax === 4000000 ? '$4M' : '$2M';
    const minDown = loanType === 'fha' ? 3.5 : loanType === 'va' ? 0 : loanType === 'jumbo' ? 20 : 3;
    const pmiLabel = loanType === 'fha' ? 'MIP' : 'PMI';
    const accent = loanType === 'va' ? '#14b8a6' : loanType === 'jumbo' ? '#8b5cf6' : loanType === 'fha' ? '#f59e0b' : '#00e87a';

    const calc = useMemo(() => {
        const downAmt  = price * downPct / 100;
        const baseLoan = price - downAmt;
        const ltv      = baseLoan > 0 ? (baseLoan / price) * 100 : 0;
        let loanAmt = baseLoan, fundingFee = 0;
        if (loanType === 'fha')      loanAmt = baseLoan * 1.0175;
        else if (loanType === 'va')  { fundingFee = baseLoan * (vaFfPct / 100); loanAmt = baseLoan + fundingFee; }
        const pi  = calcPI(loanAmt, rate, term);
        const tax = (price * props.taxRate) / 12;
        const ins = (price * props.insRate) / 12;
        let pmi = 0;
        if      (loanType === 'conventional' && ltv > 80) pmi = (loanAmt * 0.008) / 12;
        else if (loanType === 'fha')                       pmi = (loanAmt * 0.0055) / 12;
        const total         = pi + tax + ins + pmi;
        const totalInterest = Math.max(0, pi * term * 12 - baseLoan);
        const buydown: BuydownSchedule | null = activeBdType !== 'none' ? computeBuydownSchedule(loanAmt, rate, term, activeBdType) : null;
        let entTotalEntitlement = 0, entUsed = 0, entRemaining = 0, entMaxZeroDn = 0, entDpNeeded = 0, entDpPct = 0;
        if (loanType === 'va' && isSubsequentUse) {
            entTotalEntitlement = Math.round(countyLimit * 0.25);
            entUsed = prevEntUsed;
            entRemaining = Math.max(0, entTotalEntitlement - entUsed);
            entMaxZeroDn = entRemaining * 4;
            entDpNeeded  = price > entMaxZeroDn ? Math.round(0.25 * (price - entMaxZeroDn)) : 0;
            entDpPct     = price > 0 ? (entDpNeeded / price) * 100 : 0;
        }
        return { downAmt, baseLoan, loanAmt, fundingFee, ltv, pi, tax, ins, pmi, total, totalInterest, buydown, entTotalEntitlement, entUsed, entRemaining, entMaxZeroDn, entDpNeeded, entDpPct };
    }, [price, downPct, rate, term, loanType, vaFfPct, activeBdType, props.taxRate, props.insRate, isSubsequentUse, countyLimit, prevEntUsed]);

    const { downAmt, baseLoan, loanAmt, fundingFee, ltv, pi, tax, ins, pmi, total, totalInterest, buydown, entTotalEntitlement, entUsed, entRemaining, entMaxZeroDn, entDpNeeded, entDpPct } = calc;

    const yr1Total   = buydown ? buydown.rows[0].pi + tax + ins + pmi : null;
    const heroTotal  = (activeBdType !== 'none' && yr1Total) ? yr1Total : total;
    const heroSub    = activeBdType !== 'none' && yr1Total ? `${fmtDollar(total)}/mo at note rate (yr ${(buydown?.rows.length ?? 0) + 1}+)` : null;

    const isDirty = price !== props.price || downPct !== props.downPct ||
        Math.abs(rate - props.rate) > 0.001 || term !== props.term ||
        loanType !== props.loanType || (loanType === 'va' && vaFfPct !== initFfPct) ||
        activeBdType !== initBdType || sellerCreditAmt !== (props.sellerCredit ?? 0) ||
        isSubsequentUse || countyLimit !== 832750 || prevEntUsed !== 0;

    const piPct  = total > 0 ? (pi  / total) * 100 : 0;
    const taxPct = total > 0 ? (tax / total) * 100 : 0;
    const insPct = total > 0 ? (ins / total) * 100 : 0;
    const pmiPct = pmi > 0 && total > 0 ? (pmi / total) * 100 : 0;

    // ── Functions ─────────────────────────────────────────────────────────────

    function switchTab(next: 'conventional' | 'fha' | 'va' | 'jumbo') {
        setLoanType(next);
        if (next === 'fha' && downPct < 3.5) setDownPct(3.5);
        if (next === 'conventional' && downPct < 3) setDownPct(3);
        if (next === 'jumbo' && downPct < 20) setDownPct(20);
        if (next === 'va') setVaFfPct(initFfPct);
    }

    function buildSeed(): string {
        const bdSuffix = activeBdType !== 'none' ? ` with ${activeBdType} buydown${sellerCreditAmt > 0 ? ` and ${fmtDollar(sellerCreditAmt)} seller credit` : ''}` : '';
        if (loanType === 'fha')   return `FHA loan on a $${price.toLocaleString()} home with ${downPct}% down at ${fmtRate(rate)} — ${term} year fixed${bdSuffix}`;
        if (loanType === 'va' && isSubsequentUse) return `VA loan on a $${price.toLocaleString()} home at ${fmtRate(rate)} — subsequent use, county limit $${countyLimit.toLocaleString()}, previous entitlement used $${prevEntUsed.toLocaleString()}${vaFfPct === 0 ? ', funding fee exempt' : ''}`;
        if (loanType === 'va')    return `VA loan on a $${price.toLocaleString()} home with ${downPct}% down at ${fmtRate(rate)}${vaFfPct === 0 ? ', funding fee exempt' : ''}${bdSuffix}`;
        if (loanType === 'jumbo') return `Jumbo loan on a $${price.toLocaleString()} home with ${downPct}% down at ${fmtRate(rate)} — ${term} year fixed${bdSuffix}`;
        return `Conventional loan on a $${price.toLocaleString()} home with ${downPct}% down at ${fmtRate(rate)} — ${term} year fixed${bdSuffix}`;
    }

    function getRunOverrides(): Record<string, any> {
        const vaBase = loanType === 'va' && isSubsequentUse ? {
            purchasePrice: price, countyLoanLimit: countyLimit, previousEntitlementUsed: prevEntUsed,
            annualRatePct: rate, loanType: 'va', vaFundingFeeExempt: vaFfPct === 0,
            ...(vaFfPct > 0 ? { customFundingFeePct: vaFfPct } : {}),
        } : loanType === 'va' ? {
            purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate, loanType: 'va',
            vaFundingFeeExempt: vaFfPct === 0, ...(vaFfPct > 0 ? { customFundingFeePct: vaFfPct } : {}),
        } : loanType === 'fha' ? {
            purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate, isFHA: true,
        } : loanType === 'jumbo' ? {
            purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate, loanType: 'jumbo',
        } : { purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate };
        if (activeBdType !== 'none') return { ...vaBase, buydownType: activeBdType, sellerCredit: sellerCreditAmt };
        return vaBase;
    }

    function getMatchedUrl() {
        const lt = loanType === 'va' ? 'va' : loanType === 'jumbo' ? 'jumbo' : loanType === 'fha' ? 'fha' : 'conventional';
        // Extract state from journey address if available (e.g. "…, CA 92130")
        const stateFromAddr = props.journeyAddress
            ? (props.journeyAddress.match(/,\s*([A-Z]{2})(?:\s+\d{5})?(?:\s*$|,)/)?.[1] ?? '')
            : '';
        const params: Record<string, string> = {
            from: 'scenario', lt,
            price: String(Math.round(price)),
            dp: String(downPct),
            rate: rate.toFixed(2),
            monthly: String(Math.round(total)),
            term: String(term),
        };
        if (stateFromAddr) params.state = stateFromAddr;
        return `/connect/post?${new URLSearchParams(params).toString()}`;
    }

    async function handleVault() {
        if (!user) { router.push('/sign-up'); return; }
        try {
            await fetch('/api/vault/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'scenario', loanType, price, downPct, rate, term, taxRate: props.taxRate, insRate: props.insRate }),
            });
            setVaultDone(true);
            setTimeout(() => setVaultDone(false), 2000);
        } catch { /* non-fatal */ }
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

    // ── Render ────────────────────────────────────────────────────────────────

    const tabClass = (lt: string) => {
        if (loanType !== lt) return 'isc-tab';
        if (lt === 'va')    return 'isc-tab on-va';
        if (lt === 'jumbo') return 'isc-tab on-jumbo';
        if (lt === 'fha')   return 'isc-tab on-fha';
        return 'isc-tab on';
    };

    return (
        <div className="isc">

            {/* Topbar */}
            <div className="isc-topbar">
                <div className="isc-topbar-l">
                    <div className="isc-dot" />
                    <span className="isc-tl">AI Analysis</span>
                </div>
                <span className="isc-tr">Live · CalcEngine</span>
            </div>

            {/* Loan type tabs */}
            <div className="isc-tabs">
                <button className={tabClass('conventional')} onClick={() => switchTab('conventional')}>Conventional</button>
                <button className={tabClass('fha')}          onClick={() => switchTab('fha')}>FHA</button>
                <button className={tabClass('va')}           onClick={() => switchTab('va')}>VA</button>
                <button className={tabClass('jumbo')}        onClick={() => switchTab('jumbo')}>Jumbo</button>
            </div>

            {/* Hero */}
            <div className="isc-hero">
                <div className="isc-hero-payment">
                    <span className="isc-hero-amount">{fmtDollar(heroTotal)}</span>
                    <span className="isc-hero-per">/mo{activeBdType !== 'none' ? ' yr 1' : ''}</span>
                </div>
                {heroSub && <div className="isc-hero-sub">{heroSub}</div>}

                {loanType === 'va' && (
                    <div className="isc-badge isc-badge--va">
                        🎖️ No PMI · Funding fee {vaFfPct === 0 ? 'exempt' : `${vaFfPct}%`} ({vaFfPct === 0 ? '$0' : fmtDollar(fundingFee)}) rolled in
                    </div>
                )}
                {loanType === 'jumbo' && (
                    <div className="isc-badge isc-badge--jumbo">🏛️ Jumbo · No PMI · 20% min down</div>
                )}
                {loanType === 'fha' && (
                    <div className="isc-badge isc-badge--fha">FHA · 3.5% min down · MIP: {fmtDollar(pmi)}/mo</div>
                )}

                {/* Buydown year-by-year table */}
                {activeBdType !== 'none' && buydown && (
                    <div className="isc-bd-table">
                        <div className="isc-bd-thead">
                            <span>Year</span><span>Rate</span><span>P&amp;I</span><span>PITI</span><span>Saves/mo</span>
                        </div>
                        {buydown.rows.map(row => (
                            <div key={row.yr} className="isc-bd-trow isc-bd-trow--reduced">
                                <span>Yr {row.yr}</span>
                                <span>{fmtRate(row.effectiveRate)}</span>
                                <span>{fmtDollar(row.pi)}</span>
                                <span>{fmtDollar(row.pi + tax + ins + pmi)}</span>
                                <span className="isc-bd-green">↓ {fmtDollar(row.monthlySavings)}</span>
                            </div>
                        ))}
                        <div className="isc-bd-trow isc-bd-trow--note">
                            <span>Yr {buydown.rows.length + 1}+</span>
                            <span>{fmtRate(rate)}</span>
                            <span>{fmtDollar(pi)}</span>
                            <span>{fmtDollar(total)}</span>
                            <span className="isc-bd-muted">note rate</span>
                        </div>
                        <div className="isc-bd-cost-row">
                            <span>Buydown cost</span>
                            <span className="isc-bd-cost-amt">{fmtDollar(buydown.totalCost)}</span>
                            {sellerCreditAmt > 0 && (
                                <span className={buydown.totalCost <= sellerCreditAmt ? 'isc-bd-covered' : 'isc-bd-short'}>
                                    {buydown.totalCost <= sellerCreditAmt
                                        ? `✓ Covered · ${fmtDollar(sellerCreditAmt - buydown.totalCost)} surplus`
                                        : `⚠ Short ${fmtDollar(buydown.totalCost - sellerCreditAmt)}`}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Stacked bar — note-rate breakdown */}
                {activeBdType === 'none' && (
                    <>
                        <div className="isc-bar">
                            <div style={{ width: `${piPct}%`,  background: C.pi,  height: '100%', minWidth: 2, transition: 'width .2s' }} />
                            <div style={{ width: `${taxPct}%`, background: C.tax, height: '100%', minWidth: 2, transition: 'width .2s' }} />
                            <div style={{ width: `${insPct}%`, background: C.ins, height: '100%', minWidth: 2, transition: 'width .2s' }} />
                            {pmi > 0 && <div style={{ width: `${pmiPct}%`, background: C.pmi, height: '100%', minWidth: 2, transition: 'width .2s' }} />}
                        </div>
                        <div className="isc-legend">
                            {([
                                { color: C.pi,  name: 'P&I',      val: pi  },
                                { color: C.tax, name: 'Tax',       val: tax },
                                { color: C.ins, name: 'Insurance', val: ins },
                                ...(pmi > 0 ? [{ color: C.pmi, name: pmiLabel, val: pmi }] : []),
                            ] as { color: string; name: string; val: number }[]).map(item => (
                                <div key={item.name} className="isc-legend-item">
                                    <span className="isc-legend-dot" style={{ background: item.color }} />
                                    <span className="isc-legend-name">{item.name}</span>
                                    <span className="isc-legend-val">{fmtDollar(item.val)}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {activeBdType !== 'none' && (
                    <div className="isc-legend">
                        {([
                            { color: C.tax, name: 'Tax', val: tax },
                            { color: C.ins, name: 'Ins', val: ins },
                            ...(pmi > 0 ? [{ color: C.pmi, name: pmiLabel, val: pmi }] : []),
                        ] as { color: string; name: string; val: number }[]).map(item => (
                            <div key={item.name} className="isc-legend-item">
                                <span className="isc-legend-dot" style={{ background: item.color }} />
                                <span className="isc-legend-name">{item.name}</span>
                                <span className="isc-legend-val">{fmtDollar(item.val)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Slider Drawer Trigger — hidden on property_lookup path (income card is the sole adjustment surface) */}
            {!props.hideDrawer && <button className={`isc-slider-trigger${sliderOpen ? ' open' : ''}`} onClick={() => setSliderOpen(o => !o)}>
                <div className="isc-trigger-left">
                    <span style={{ fontSize: 15 }}>⚙</span>
                    <div>
                        <div className="isc-trigger-title">Adjust Your Numbers</div>
                        {isDirty && <div className="isc-trigger-sub">● Changes pending</div>}
                    </div>
                </div>
                <span className="isc-trigger-arrow">{sliderOpen ? '▲ Close' : '▼ Open'}</span>
            </button>}
            {!props.hideDrawer && <div className={`isc-drawer${sliderOpen ? ' open' : ''}`}>
            <div className="isc-exp">

                {/* Home Price */}
                <SliderField
                    label="Home Price" value={price}
                    min={100000} max={priceMax} step={5000}
                    onChange={setPrice}
                    format={v => fmtK(v)}
                    minLabel="$100k" maxLabel={priceMaxLabel}
                    trackColor={accent} theme="dark"
                />

                {/* Down Payment */}
                <SliderField
                    label="Down Payment" value={downPct}
                    min={minDown} max={50} step={loanType === 'va' ? 1 : 0.5}
                    onChange={setDownPct}
                    format={v => `${v}% · ${fmtK(price * v / 100)}`}
                    minLabel={loanType === 'va' ? '0%' : loanType === 'jumbo' ? '20%' : `${minDown}%`}
                    maxLabel="50%"
                    trackColor={accent} theme="dark"
                />

                {/* VA Funding Fee */}
                {loanType === 'va' && (
                    <div className="isc-row">
                        <div className="isc-row-hdr">
                            <span className="isc-row-name">Funding Fee</span>
                            <span className="isc-row-val">{vaFfPct === 0 ? 'Exempt · $0' : `${vaFfPct}% · ${fmtDollar(fundingFee)}`}</span>
                        </div>
                        <div className="isc-terms">
                            {VA_FF_OPTIONS.map(opt => (
                                <button key={opt.pct}
                                    className={`isc-term${vaFfPct === opt.pct ? ' on-va' : ''}`}
                                    onClick={() => setVaFfPct(opt.pct)}
                                >{opt.label}</button>
                            ))}
                        </div>
                        <div className="isc-hint">First use: 0% down=2.15% · 5%+ down=1.50% · 10%+ down=1.25% · Disability=Exempt</div>
                    </div>
                )}

                {/* VA Subsequent Use */}
                {loanType === 'va' && (
                    <div className="isc-row">
                        <div className="isc-row-hdr">
                            <span className="isc-row-name">Subsequent Use</span>
                            <button
                                className={`isc-subseq-toggle${isSubsequentUse ? ' on' : ''}`}
                                onClick={() => setIsSubsequentUse(v => !v)}
                            >
                                {isSubsequentUse ? 'On — I have an active VA loan' : 'Off — First use / full entitlement'}
                            </button>
                        </div>
                        {isSubsequentUse && (
                            <>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: '#8fa3b8' }}>County or ZIP</span>
                                        {countySelected && <span style={{ fontSize: 11, fontWeight: 700, color: '#00e87a' }}>✓ {countySelected}</span>}
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="e.g. San Diego  or  92101"
                                        value={countyQuery}
                                        onChange={e => { setCountyQuery(e.target.value); setCountySelected(''); }}
                                        style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1.5px solid rgba(255,255,255,0.12)', fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.06)', color: '#c4cfe0', boxSizing: 'border-box', fontFamily: 'inherit' }}
                                    />
                                    {countyMsg && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{countyMsg}</div>}
                                    {countyResults.length > 0 && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: '#1a2035', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.4)', marginTop: 4, maxHeight: 220, overflowY: 'auto' }}>
                                            {countyResults.map((r, i) => (
                                                <button key={i}
                                                    onClick={() => { setCountyLimit(r.limit); setCountySelected(`${r.label}, ${r.state}`); setCountyQuery(''); setCountyResults([]); setCountyMsg(''); }}
                                                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: '#c4cfe0', fontFamily: 'inherit' }}
                                                >
                                                    <span>{r.label}, {r.state}</span>
                                                    <span style={{ fontWeight: 700, color: '#14b8a6', marginLeft: 8, flexShrink: 0 }}>${r.limit.toLocaleString()}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <SliderField
                                    label="County Loan Limit" value={countyLimit}
                                    min={647200} max={2000000} step={1000}
                                    onChange={setCountyLimit}
                                    format={v => fmtDollar(v)}
                                    minLabel="$647,200" maxLabel="$2M"
                                    trackColor="#14b8a6" theme="dark"
                                />
                                <SliderField
                                    label="Previous Entitlement Used (Not Restored)" value={prevEntUsed}
                                    min={0} max={Math.round(countyLimit * 0.25)} step={100}
                                    onChange={setPrevEntUsed}
                                    format={v => fmtDollar(v)}
                                    minLabel="$0" maxLabel={fmtDollar(Math.round(countyLimit * 0.25))}
                                    trackColor="#14b8a6" theme="dark"
                                />
                                <div className="isc-ent-table">
                                    <div className="isc-ent-row"><span>Max entitlement (25% of {fmtDollar(countyLimit)})</span><span>{fmtDollar(entTotalEntitlement)}</span></div>
                                    <div className="isc-ent-row"><span>Previous entitlement used</span><span className="isc-ent-used">−{fmtDollar(entUsed)}</span></div>
                                    <div className="isc-ent-row isc-ent-row--highlight"><span>Available entitlement</span><span>{fmtDollar(entRemaining)}</span></div>
                                    <div className="isc-ent-row"><span>Max loan at $0 down (4 × available)</span><span>{fmtDollar(entMaxZeroDn)}</span></div>
                                    <div className={`isc-ent-row${entDpNeeded > 0 ? ' isc-ent-row--warn' : ' isc-ent-row--ok'}`}>
                                        <span><strong>Down payment required</strong></span>
                                        <span><strong>{entDpNeeded > 0 ? `${fmtDollar(entDpNeeded)} (${entDpPct.toFixed(1)}%)` : '$0 — fully covered'}</strong></span>
                                    </div>
                                </div>
                                <div className="isc-hint">Per VA partial entitlement worksheet. Check with your lender for your COE details.</div>
                            </>
                        )}
                    </div>
                )}

                {/* Rate Buydown toggle */}
                {hasBuydownUI && (
                    <div className="isc-row">
                        <div className="isc-row-hdr">
                            <span className="isc-row-name">Rate Buydown</span>
                            <span className="isc-row-val">{activeBdType === 'none' ? 'None (note rate)' : `${activeBdType} Temporary Buydown`}</span>
                        </div>
                        <div className="isc-terms">
                            {(['none', '1/0', '2/1', '3/2/1'] as const).map(t => (
                                <button key={t}
                                    className={`isc-term${activeBdType === t ? ' on-bd' : ''}`}
                                    onClick={() => setActiveBdType(t)}
                                >{t === 'none' ? 'None' : t}</button>
                            ))}
                        </div>
                        {activeBdType !== 'none' && (
                            <div className="isc-hint">
                                {activeBdType === '2/1' && 'Year 1 rate −2% · Year 2 rate −1% · Year 3+ note rate'}
                                {activeBdType === '1/0' && 'Year 1 rate −1% · Year 2+ note rate'}
                                {activeBdType === '3/2/1' && 'Year 1 rate −3% · Year 2 −2% · Year 3 −1% · Year 4+ note rate'}
                            </div>
                        )}
                    </div>
                )}

                {/* Seller Credit — buydown active */}
                {hasBuydownUI && activeBdType !== 'none' && (
                    <SliderField
                        label="Seller / Builder Credit" value={sellerCreditAmt}
                        min={0} max={vaConcessionCap} step={1000}
                        onChange={setSellerCreditAmt}
                        format={v => `${fmtDollar(v)}${buydown ? (v >= buydown.totalCost ? ' ✓ covers buydown' : ` · short ${fmtDollar(buydown.totalCost - v)}`) : ''}`}
                        minLabel="$0" maxLabel={`${fmtDollar(vaConcessionCap)} (4% cap)`}
                        trackColor="#6366f1" theme="dark"
                    />
                )}

                {/* Interest Rate */}
                <SliderField
                    label="Interest Rate" value={rate}
                    min={3} max={12} step={0.125}
                    onChange={setRate}
                    format={fmtRate}
                    minLabel="3%" maxLabel="12%"
                    trackColor={accent} theme="dark"
                />

                {/* Loan Term */}
                <div className="isc-row">
                    <div className="isc-row-hdr"><span className="isc-row-name">Loan Term</span></div>
                    <div className="isc-terms">
                        {([15, 20, 30] as const).map(t => (
                            <button key={t}
                                className={`isc-term${term === t ? ' on' : ''}`}
                                onClick={() => setTerm(t)}
                            >{t}yr</button>
                        ))}
                    </div>
                </div>

                {/* Stats */}
                <div className="isc-exp-stats">
                    <div className="isc-exp-stat">
                        <div className="isc-exp-stat-label">Loan Amount</div>
                        <div className="isc-exp-stat-val">{fmtK(loanAmt)}</div>
                    </div>
                    <div className="isc-exp-stat">
                        <div className="isc-exp-stat-label">LTV</div>
                        <div className="isc-exp-stat-val">{ltv.toFixed(1)}%{ltv <= 80 ? ' ✓' : ''}</div>
                    </div>
                    <div className="isc-exp-stat">
                        <div className="isc-exp-stat-label">Total Interest</div>
                        <div className="isc-exp-stat-val">{fmtK(totalInterest)}</div>
                    </div>
                </div>

                {/* Drawer CTA */}
                <div className="isc-drawer-cta">
                    {drawerPhase === 'idle' && !isDirty && <span className="isc-drawer-hint">Drag sliders to model a new scenario</span>}
                    {drawerPhase === 'idle' && isDirty && <button className="isc-drawer-run" onClick={handleDrawerRun}>▶ Run Adjusted Scenario →</button>}
                    {drawerPhase === 'running' && <span className="isc-drawer-hint">Calculating…</span>}
                    {drawerPhase === 'done' && <span className="isc-drawer-done">✓ Numbers Updated</span>}
                </div>
            </div>
            </div>}

            {/* Action buttons — hidden on property_lookup path (income card has the CTAs) */}
            {!props.hideDrawer && <div className="isc-action-row">
                <button className="isc-btn-vault" onClick={handleVault}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                        <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
                    </svg>
                    {vaultDone ? 'Saved ✓' : 'My Vault'}
                </button>
                <PdfDownloadButton
                    type={loanType === 'va' ? 'va' : loanType === 'jumbo' ? 'jumbo' : loanType}
                    getParams={() => ({ price, downPct, rate, term, taxRate: props.taxRate, insRate: props.insRate, loanType, vaFundingFeePct: vaFfPct })}
                />
                <button className="isc-btn-match" onClick={() => router.push(getMatchedUrl())}>
                    Get Matched →
                </button>
            </div>}

            {/* Check a property — only in standalone (no journeyAddress, no hideDrawer) context */}
            {!props.hideDrawer && !props.journeyAddress && (
                <div className="isc-property-row">
                    <button className="isc-btn-property" onClick={() => {
                        const lt = loanType === 'va' ? 'va' : loanType === 'jumbo' ? 'jumbo' : loanType === 'fha' ? 'fha' : 'conventional';
                        const p = new URLSearchParams({ price: String(Math.round(price)), dp: String(downPct), rate: rate.toFixed(3), term: String(term), lt, taxRate: props.taxRate.toFixed(5), insRate: props.insRate.toFixed(5) });
                        router.push(`/check-property?${p.toString()}`);
                    }}>
                        Check a property →
                    </button>
                </div>
            )}

            {/* Rate note */}
            <div className="isc-note">
                <p>Rate seeded at <strong>{props.rate.toFixed(2)}%</strong> (FRED 30-yr fixed, live). Estimates only — not a loan offer.</p>
            </div>

            {/* ── Styles ── */}
            <style>{`
                .isc { background:#0d1117; border-radius:16px; margin-top:14px; font-family:system-ui,-apple-system,sans-serif; border:1px solid rgba(255,255,255,0.07); color:#c4cfe0; }

                /* topbar */
                .isc-topbar { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.06); }
                .isc-topbar-l { display:flex; align-items:center; gap:8px; }
                .isc-dot { width:6px; height:6px; border-radius:50%; background:#00e87a; flex-shrink:0; }
                .isc-tl { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#8fa3b8; }
                .isc-tr { font-size:10px; color:#8fa3b8; }

                /* loan type tabs */
                .isc-tabs { display:flex; gap:5px; padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.06); }
                .isc-tab { flex:1; padding:7px 0; border:1.5px solid rgba(255,255,255,0.1); border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; color:#8fa3b8; background:transparent; transition:all .15s; text-align:center; font-family:inherit; }
                .isc-tab.on      { border-color:rgba(0,232,122,0.35);   color:#00e87a; background:rgba(0,232,122,0.08); }
                .isc-tab.on-fha  { border-color:rgba(245,158,11,0.35);  color:#f59e0b; background:rgba(245,158,11,0.08); }
                .isc-tab.on-va   { border-color:rgba(20,184,166,0.35);  color:#14b8a6; background:rgba(20,184,166,0.08); }
                .isc-tab.on-jumbo{ border-color:rgba(139,92,246,0.35);  color:#8b5cf6; background:rgba(139,92,246,0.08); }
                .isc-tab:hover:not(.on):not(.on-fha):not(.on-va):not(.on-jumbo) { border-color:rgba(255,255,255,0.2); color:#c4cfe0; }

                /* hero */
                .isc-hero { padding:18px 16px 14px; border-bottom:1px solid rgba(255,255,255,0.06); }
                .isc-hero-payment { display:flex; align-items:baseline; gap:6px; margin-bottom:4px; }
                .isc-hero-amount { font-size:clamp(2rem,5vw,2.6rem); font-weight:800; color:#f0f4ff; letter-spacing:-.04em; font-variant-numeric:tabular-nums; transition:color .15s; }
                .isc-hero-per { font-size:.9rem; color: #94a3b8; font-weight:500; }
                .isc-hero-sub { font-size:11px; color: #94a3b8; font-weight:500; margin-bottom:10px; }

                /* badges */
                .isc-badge { font-size:11px; font-weight:600; border-radius:6px; padding:5px 10px; margin-bottom:10px; letter-spacing:.01em; }
                .isc-badge--va    { color:#14b8a6; background:rgba(20,184,166,0.08); border:1px solid rgba(20,184,166,0.2); }
                .isc-badge--jumbo { color:#8b5cf6; background:rgba(139,92,246,0.08); border:1px solid rgba(139,92,246,0.2); }
                .isc-badge--fha   { color:#f59e0b; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.2); }

                /* stacked bar */
                .isc-bar { display:flex; height:8px; border-radius:9999px; overflow:hidden; background:rgba(255,255,255,0.07); margin:10px 0 8px; gap:1px; }

                /* legend */
                .isc-legend { display:flex; flex-wrap:wrap; gap:5px 12px; }
                .isc-legend-item { display:flex; align-items:center; gap:4px; }
                .isc-legend-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
                .isc-legend-name { font-size:10px; font-weight:600; color: #94a3b8; text-transform:uppercase; letter-spacing:.04em; }
                .isc-legend-val  { font-size:11px; font-weight:700; color:#c4cfe0; font-variant-numeric:tabular-nums; }

                /* buydown table */
                .isc-bd-table { border:1px solid rgba(255,255,255,0.08); border-radius:10px; overflow:hidden; margin:10px 0 8px; font-size:12px; }
                .isc-bd-thead { display:grid; grid-template-columns:50px 60px 80px 80px 1fr; gap:6px; background:rgba(255,255,255,0.05); padding:6px 10px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color: #94a3b8; }
                .isc-bd-trow { display:grid; grid-template-columns:50px 60px 80px 80px 1fr; gap:6px; padding:7px 10px; font-weight:600; font-variant-numeric:tabular-nums; border-top:1px solid rgba(255,255,255,0.04); }
                .isc-bd-trow--reduced { background:rgba(0,232,122,0.06); color:#00e87a; }
                .isc-bd-trow--note { background:rgba(255,255,255,0.02); color: #94a3b8; }
                .isc-bd-green { color:#00e87a; font-weight:700; }
                .isc-bd-muted { color:#8fa3b8; font-style:italic; }
                .isc-bd-cost-row { display:flex; align-items:center; gap:10px; padding:7px 10px; border-top:1px solid rgba(255,255,255,0.07); background:rgba(255,255,255,0.03); font-size:12px; font-weight:600; color:#8fa3b8; }
                .isc-bd-cost-amt { font-weight:700; color:#c4cfe0; font-variant-numeric:tabular-nums; }
                .isc-bd-covered { font-size:11px; font-weight:700; color:#00e87a; background:rgba(0,232,122,0.08); border:1px solid rgba(0,232,122,0.2); border-radius:5px; padding:2px 7px; }
                .isc-bd-short   { font-size:11px; font-weight:700; color:#ff5f5f; background:rgba(255,95,95,0.08); border:1px solid rgba(255,95,95,0.2); border-radius:5px; padding:2px 7px; }

                /* slider drawer */
                @keyframes iscTriggerPulse { 0%,100%{box-shadow:none} 50%{box-shadow:0 0 14px rgba(0,232,122,0.08) inset} }
                @keyframes iscRunPulse     { 0%,100%{box-shadow:none} 50%{box-shadow:0 0 20px rgba(0,232,122,0.22)} }
                .isc-slider-trigger { width:100%; display:flex; align-items:center; justify-content:space-between; padding:11px 16px; background:rgba(0,232,122,0.04); border:none; border-top:1px solid rgba(0,232,122,0.12); cursor:pointer; font-family:inherit; color:#c4cfe0; transition:background .2s,border-color .2s; animation:iscTriggerPulse 3s ease-in-out infinite; }
                .isc-slider-trigger:hover,.isc-slider-trigger.open { background:rgba(0,232,122,0.07); border-color:rgba(0,232,122,0.3); animation:none; }
                .isc-trigger-left { display:flex; align-items:center; gap:10px; }
                .isc-trigger-title { font-size:13px; font-weight:700; color:#c4cfe0; text-align:left; }
                .isc-trigger-sub { font-size:10px; color:#00e87a; margin-top:1px; }
                .isc-trigger-arrow { font-size:11px; color: #94a3b8; flex-shrink:0; }
                .isc-drawer { max-height:0; overflow:hidden; transition:max-height 0.4s cubic-bezier(0.4,0,0.2,1); }
                .isc-drawer.open { max-height:1400px; }
                .isc-drawer-cta { padding:4px 16px 12px; }
                .isc-drawer-hint { font-size:12px; color: #94a3b8; font-style:italic; }
                .isc-drawer-done { font-size:12px; color:#00e87a; font-weight:700; }
                .isc-drawer-run { width:100%; padding:11px 0; background:rgba(0,232,122,0.08); color:#00e87a; border:1.5px solid rgba(0,232,122,0.3); border-radius:10px; font-size:14px; font-weight:800; cursor:pointer; font-family:inherit; letter-spacing:.01em; transition:all .15s; animation:iscRunPulse 1.8s ease-in-out infinite; }
                .isc-drawer-run:hover { background:rgba(0,232,122,0.15); border-color:rgba(0,232,122,0.55); animation:none; }

                /* explorer (inside drawer) */
                .isc-exp { padding:12px 16px; background:rgba(255,255,255,0.015); display:flex; flex-direction:column; gap:16px; }
                .isc-exp-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
                .isc-exp-stat { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:8px; text-align:center; }
                .isc-exp-stat-label { font-size:10px; color: #94a3b8; margin-bottom:3px; }
                .isc-exp-stat-val { font-size:12px; font-weight:700; color:#c4cfe0; }

                /* row / term toggle */
                .isc-row { display:flex; flex-direction:column; gap:8px; }
                .isc-row-hdr { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; }
                .isc-row-name { font-size:13px; font-weight:700; color:#c4cfe0; }
                .isc-row-val  { font-size:12px; font-weight:600; color: #94a3b8; }
                .isc-terms { display:flex; gap:6px; }
                .isc-term { flex:1; background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.1); border-radius:8px; padding:7px 0; font-size:12px; font-weight:600; color:#8fa3b8; cursor:pointer; font-family:inherit; transition:all .15s; text-align:center; }
                .isc-term.on      { border-color:rgba(0,232,122,0.35);  color:#00e87a; background:rgba(0,232,122,0.08); }
                .isc-term.on-fha  { border-color:rgba(245,158,11,0.35); color:#f59e0b; background:rgba(245,158,11,0.08); }
                .isc-term.on-va   { border-color:rgba(20,184,166,0.35); color:#14b8a6; background:rgba(20,184,166,0.08); }
                .isc-term.on-jumbo{ border-color:rgba(139,92,246,0.35); color:#8b5cf6; background:rgba(139,92,246,0.08); }
                .isc-term.on-bd   { border-color:rgba(99,102,241,0.35); color:#818cf8; background:rgba(99,102,241,0.08); }
                .isc-term:hover:not(.on):not(.on-fha):not(.on-va):not(.on-jumbo):not(.on-bd) { border-color:rgba(255,255,255,0.2); color:#c4cfe0; }
                .isc-hint { font-size:10px; color:#8fa3b8; line-height:1.4; }

                /* subsequent use toggle */
                .isc-subseq-toggle { padding:5px 12px; border:1.5px solid rgba(255,255,255,0.12); border-radius:20px; font-size:11px; font-weight:600; cursor:pointer; color:#8fa3b8; background:rgba(255,255,255,0.04); transition:all .15s; white-space:nowrap; font-family:inherit; }
                .isc-subseq-toggle.on { border-color:rgba(20,184,166,0.35); color:#14b8a6; background:rgba(20,184,166,0.08); }

                /* entitlement table */
                .isc-ent-table { display:flex; flex-direction:column; border:1px solid rgba(255,255,255,0.08); border-radius:10px; overflow:hidden; font-size:12px; }
                .isc-ent-row { display:flex; justify-content:space-between; align-items:center; padding:7px 12px; border-bottom:1px solid rgba(255,255,255,0.04); color:#8fa3b8; font-weight:500; }
                .isc-ent-row:last-child { border-bottom:none; }
                .isc-ent-row--highlight { background:rgba(20,184,166,0.06); color:#14b8a6; font-weight:700; }
                .isc-ent-row--warn { background:rgba(245,158,11,0.06); color:#f59e0b; }
                .isc-ent-row--ok   { background:rgba(20,184,166,0.04); color:#14b8a6; }
                .isc-ent-used { color:#ff5f5f; font-weight:700; }

                /* action row — below drawer, before check a property */
                .isc-action-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:10px 12px 4px; }
                .isc-btn-vault { display:flex; align-items:center; gap:6px; background:#00e87a; color:#07100f; border:none; border-radius:8px; padding:10px 16px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; flex-shrink:0; transition:opacity .15s; }
                .isc-btn-vault:hover { opacity:.88; }
                .isc-btn-match { background:transparent; color:#f0f4ff; border:1.5px solid rgba(255,255,255,0.2); border-radius:8px; padding:10px 16px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; }
                .isc-btn-match:hover { border-color:rgba(255,255,255,0.35); background:rgba(255,255,255,0.04); }

                /* check a property + full report */
                .isc-property-row { padding:4px 12px 10px; }
                .isc-btn-property { background:rgba(0,232,122,0.08); color:#00e87a; border:1.5px solid rgba(0,232,122,0.25); border-radius:8px; padding:10px 18px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; width:100%; text-align:center; display:block; }
                .isc-btn-property:hover { background:rgba(0,232,122,0.15); border-color:rgba(0,232,122,0.45); }
                .isc-btn-report { background:rgba(0,232,122,0.04); color:#00e87a; border:1.5px solid rgba(0,232,122,0.18); border-radius:8px; padding:10px 18px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; width:100%; text-align:center; display:block; }
                .isc-btn-report:hover { background:rgba(0,232,122,0.10); border-color:rgba(0,232,122,0.35); }

                /* note */
                .isc-note { padding:4px 16px 12px; }
                .isc-note p { font-size:10px; color: #94a3b8; line-height:1.5; }

                @media (max-width: 480px) {
                    .isc-hero-amount { font-size:1.9rem; }
                    .isc-exp-stats { grid-template-columns:repeat(2,1fr); }
                    .isc-bd-thead,.isc-bd-trow { font-size:10px; grid-template-columns:40px 52px 68px 68px 1fr; }
                }
                @media (max-width: 640px) {
                    .isc-action-row { flex-direction:column; gap:8px; }
                    .isc-action-row button { width:100%; justify-content:center; text-align:center; margin-left:0; display:flex; }
                }
            `}</style>
        </div>
    );
}
