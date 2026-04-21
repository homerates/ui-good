'use client';

// app/components/InteractiveSliderCard.tsx
// Interactive mortgage payment explorer — Conventional · FHA · VA · Jumbo tabs
// Supports optional rate buydown mode (2/1 · 1/0 · 3/2/1) with seller-credit coverage check

import React, { useState, useMemo } from 'react';
import PdfDownloadButton from './PdfDownloadButton';
import SliderField from './SliderField';

export interface SliderCardParams {
    price: number;
    downPct: number;
    rate: number;
    term: number;
    taxRate: number;          // annual % of price as decimal — e.g. 0.012
    insRate: number;          // annual % of price as decimal — e.g. 0.005
    loanType: 'conventional' | 'fha' | 'va' | 'jumbo';
    vaFundingFeePct?: number; // VA only — 0 = exempt, else 1.25 / 1.5 / 2.15
    buydownType?: '2/1' | '1/0' | '3/2/1' | 'none'; // Buydown mode
    sellerCredit?: number;    // Seller credit amount for buydown coverage check
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

interface BuydownRow {
    yr: number;
    effectiveRate: number;
    pi: number;
    monthlySavings: number;
    annualSavings: number;
}

interface BuydownSchedule {
    rows: BuydownRow[];
    piNote: number;
    totalCost: number;
}

function computeBuydownSchedule(
    loan: number,
    noteRate: number,
    term: number,
    bdType: '2/1' | '1/0' | '3/2/1',
): BuydownSchedule {
    const piNote = calcPI(loan, noteRate, term);
    const reductions: number[] =
        bdType === '3/2/1' ? [3, 2, 1] :
        bdType === '2/1'   ? [2, 1]    :
                             [1];       // 1/0

    const rows: BuydownRow[] = reductions.map((reduction, i) => {
        const yr = i + 1;
        const effectiveRate = Math.max(0, noteRate - reduction);
        const pi = calcPI(loan, effectiveRate, term);
        const monthlySavings = piNote - pi;
        const annualSavings  = monthlySavings * 12;
        return { yr, effectiveRate, pi, monthlySavings, annualSavings };
    });

    const totalCost = rows.reduce((sum, r) => sum + r.annualSavings, 0);
    return { rows, piNote, totalCost };
}

const C = { pi: '#3d8bff', tax: '#ff8c42', ins: '#00e87a', pmi: '#ff5f5f', ff: '#ff5f5f' };

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
    // VA subsequent use
    const [isSubsequentUse, setIsSubsequentUse] = useState(false);
    const [countyLimit,     setCountyLimit]     = useState(832750);
    const [prevEntUsed,     setPrevEntUsed]     = useState(0);
    // Buydown mode
    const initBdType = (props.buydownType ?? 'none') as '2/1' | '1/0' | '3/2/1' | 'none';
    const [activeBdType, setActiveBdType] = useState<'2/1' | '1/0' | '3/2/1' | 'none'>(initBdType);
    const [sellerCreditAmt, setSellerCreditAmt] = useState(props.sellerCredit ?? 0);

    const hasBuydownUI = props.buydownType !== undefined;
    const vaConcessionCap = Math.round(price * 0.04 / 1000) * 1000;

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

        // Buydown schedule
        const buydown: BuydownSchedule | null =
            activeBdType !== 'none'
                ? computeBuydownSchedule(loanAmt, rate, term, activeBdType)
                : null;

        // VA entitlement (subsequent use) — per lender worksheet:
        // Max Entitlement = 25% × county limit; Available = Max − Used; DP = 25% × (Price − 4 × Available)
        let entTotalEntitlement = 0, entUsed = 0, entRemaining = 0, entMaxZeroDn = 0, entDpNeeded = 0, entDpPct = 0;
        if (loanType === 'va' && isSubsequentUse) {
            entTotalEntitlement = Math.round(countyLimit * 0.25);
            entUsed             = prevEntUsed;
            entRemaining        = Math.max(0, entTotalEntitlement - entUsed);
            entMaxZeroDn        = entRemaining * 4;
            entDpNeeded         = price > entMaxZeroDn ? Math.round(0.25 * (price - entMaxZeroDn)) : 0;
            entDpPct            = price > 0 ? (entDpNeeded / price) * 100 : 0;
        }

        return { downAmt, baseLoan, loanAmt, fundingFee, ltv, pi, tax, ins, pmi, total, totalInterest, buydown, entTotalEntitlement, entUsed, entRemaining, entMaxZeroDn, entDpNeeded, entDpPct };
    }, [price, downPct, rate, term, loanType, vaFfPct, activeBdType, props.taxRate, props.insRate, isSubsequentUse, countyLimit, prevEntUsed]);

    const { downAmt, baseLoan, loanAmt, fundingFee, ltv, pi, tax, ins, pmi, total, totalInterest, buydown, entTotalEntitlement, entUsed, entRemaining, entMaxZeroDn, entDpNeeded, entDpPct } = calc;

    // When buydown active, hero shows yr1 payment as primary
    const yr1Total = buydown ? buydown.rows[0].pi + tax + ins + pmi : null;
    const heroTotal = (activeBdType !== 'none' && yr1Total) ? yr1Total : total;
    const heroSubtitle = activeBdType !== 'none' && yr1Total
        ? `${fmtDollar(total)}/mo at note rate (yr ${(buydown?.rows.length ?? 0) + 1}+)`
        : null;

    const isDirty = price !== props.price || downPct !== props.downPct ||
        Math.abs(rate - props.rate) > 0.001 || term !== props.term ||
        loanType !== props.loanType || (loanType === 'va' && vaFfPct !== initFfPct) ||
        activeBdType !== initBdType || sellerCreditAmt !== (props.sellerCredit ?? 0) ||
        isSubsequentUse || countyLimit !== 832750 || prevEntUsed !== 0;

    function buildSeed(): string {
        const bdSuffix = activeBdType !== 'none'
            ? ` with ${activeBdType} buydown${sellerCreditAmt > 0 ? ` and ${fmtDollar(sellerCreditAmt)} seller credit` : ''}`
            : '';
        if (loanType === 'fha')   return `FHA loan on a $${price.toLocaleString()} home with ${downPct}% down at ${fmtRate(rate)} — ${term} year fixed${bdSuffix}`;
        if (loanType === 'va' && isSubsequentUse) return `VA loan on a $${price.toLocaleString()} home at ${fmtRate(rate)} — subsequent use, county limit $${countyLimit.toLocaleString()}, previous entitlement used $${prevEntUsed.toLocaleString()}${vaFfPct === 0 ? ', funding fee exempt' : ''}`;
        if (loanType === 'va')    return `VA loan on a $${price.toLocaleString()} home with ${downPct}% down at ${fmtRate(rate)}${vaFfPct === 0 ? ', funding fee exempt' : ''}${bdSuffix}`;
        if (loanType === 'jumbo') return `Jumbo loan on a $${price.toLocaleString()} home with ${downPct}% down at ${fmtRate(rate)} — ${term} year fixed${bdSuffix}`;
        return `Conventional loan on a $${price.toLocaleString()} home with ${downPct}% down at ${fmtRate(rate)} — ${term} year fixed${bdSuffix}`;
    }

    function getRunOverrides(): Record<string, any> {
        const vaBase = loanType === 'va' && isSubsequentUse ? {
            purchasePrice:           price,
            countyLoanLimit:         countyLimit,
            previousEntitlementUsed: prevEntUsed,
            annualRatePct:           rate,
            loanType:                'va',
            vaFundingFeeExempt:      vaFfPct === 0,
            ...(vaFfPct > 0 ? { customFundingFeePct: vaFfPct } : {}),
        } : loanType === 'va' ? {
            purchasePrice:      price,
            downPaymentPct:     downPct,
            annualRatePct:      rate,
            loanType:           'va',
            vaFundingFeeExempt: vaFfPct === 0,
            ...(vaFfPct > 0 ? { customFundingFeePct: vaFfPct } : {}),
        } : loanType === 'fha' ? {
            purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate, isFHA: true,
        } : loanType === 'jumbo' ? {
            purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate, loanType: 'jumbo',
        } : {
            purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate,
        };
        if (activeBdType !== 'none') {
            return { ...vaBase, buydownType: activeBdType, sellerCredit: sellerCreditAmt };
        }
        return vaBase;
    }

    // Bar widths (note-rate based)
    const piPct  = total > 0 ? (pi  / total) * 100 : 0;
    const taxPct = total > 0 ? (tax / total) * 100 : 0;
    const insPct = total > 0 ? (ins / total) * 100 : 0;
    const pmiPct = pmi > 0 && total > 0 ? (pmi / total) * 100 : 0;
    const pmiLabel = loanType === 'fha' ? 'MIP' : 'PMI';

    const minDown = loanType === 'fha' ? 3.5 : loanType === 'va' ? 0 : loanType === 'jumbo' ? 20 : 3;

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
                <span className="isc__hdr-label">
                    {activeBdType !== 'none' ? `${activeBdType} Buydown Explorer` : 'Adjust & Explore'}
                </span>
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
                    <span className="isc__amount">{fmtDollar(heroTotal)}</span>
                    <span className="isc__per">/mo{activeBdType !== 'none' ? ' yr 1' : ''}</span>
                </div>
                {heroSubtitle && (
                    <div className="isc__bd-subtitle">{heroSubtitle}</div>
                )}

                {loanType === 'va' && (
                    <div className="isc__va-badge">🎖️ No PMI · Funding fee {vaFfPct === 0 ? 'exempt' : `${vaFfPct}%`} ({vaFfPct === 0 ? '$0' : fmtDollar(fundingFee)}) rolled in</div>
                )}
                {loanType === 'jumbo' && (
                    <div className="isc__jumbo-badge">🏛️ Jumbo · No PMI · 20% min down · Up to $5M</div>
                )}

                {/* Buydown year-by-year table */}
                {activeBdType !== 'none' && buydown && (
                    <div className="isc__bd-table">
                        <div className="isc__bd-thead">
                            <span>Year</span>
                            <span>Rate</span>
                            <span>P&I</span>
                            <span>PITI</span>
                            <span>Saves/mo</span>
                        </div>
                        {buydown.rows.map(row => (
                            <div key={row.yr} className="isc__bd-trow isc__bd-trow--reduced">
                                <span>Yr {row.yr}</span>
                                <span>{fmtRate(row.effectiveRate)}</span>
                                <span>{fmtDollar(row.pi)}</span>
                                <span>{fmtDollar(row.pi + tax + ins + pmi)}</span>
                                <span className="isc__bd-green">↓ {fmtDollar(row.monthlySavings)}</span>
                            </div>
                        ))}
                        <div className="isc__bd-trow isc__bd-trow--note">
                            <span>Yr {buydown.rows.length + 1}+</span>
                            <span>{fmtRate(rate)}</span>
                            <span>{fmtDollar(pi)}</span>
                            <span>{fmtDollar(total)}</span>
                            <span className="isc__bd-muted">note rate</span>
                        </div>
                        <div className="isc__bd-cost-row">
                            <span>Buydown cost</span>
                            <span className="isc__bd-cost-amt">{fmtDollar(buydown.totalCost)}</span>
                            {sellerCreditAmt > 0 && (
                                <span className={buydown.totalCost <= sellerCreditAmt ? 'isc__bd-covered' : 'isc__bd-short'}>
                                    {buydown.totalCost <= sellerCreditAmt
                                        ? `✓ Covered · ${fmtDollar(sellerCreditAmt - buydown.totalCost)} surplus`
                                        : `⚠ Short ${fmtDollar(buydown.totalCost - sellerCreditAmt)}`}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Stacked bar — note rate breakdown */}
                {activeBdType === 'none' && (
                    <>
                        <div className="isc__bar">
                            <div style={{ width: `${piPct}%`,  background: C.pi,  height: '100%', minWidth: 2, transition: 'width .2s' }} />
                            <div style={{ width: `${taxPct}%`, background: C.tax, height: '100%', minWidth: 2, transition: 'width .2s' }} />
                            <div style={{ width: `${insPct}%`, background: C.ins, height: '100%', minWidth: 2, transition: 'width .2s' }} />
                            {pmi > 0 && <div style={{ width: `${pmiPct}%`, background: C.pmi, height: '100%', minWidth: 2, transition: 'width .2s' }} />}
                        </div>

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
                    </>
                )}

                {/* When buydown active — compact legend row */}
                {activeBdType !== 'none' && (
                    <div className="isc__legend isc__legend--compact">
                        {([
                            { color: C.tax, name: 'Tax',  val: tax },
                            { color: C.ins, name: 'Ins',  val: ins },
                            ...(pmi > 0 ? [{ color: C.pmi, name: pmiLabel, val: pmi }] : []),
                        ] as { color: string; name: string; val: number }[]).map(item => (
                            <div key={item.name} className="isc__legend-item">
                                <span className="isc__dot" style={{ background: item.color }} />
                                <span className="isc__legend-name">{item.name}</span>
                                <span className="isc__legend-val">{fmtDollar(item.val)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Sliders ── */}
            <div className="isc__sliders">

                {/* Home Price */}
                <SliderField
                    label="Home Price"
                    value={price}
                    min={100000} max={priceMax} step={5000}
                    onChange={setPrice}
                    format={fmtDollar}
                    minLabel="$100k" maxLabel={priceMaxLabel}
                    trackColor="#00e87a" theme="light"
                />

                {/* Down Payment */}
                <SliderField
                    label="Down Payment"
                    value={downPct}
                    min={minDown} max={50} step={loanType === 'va' ? 1 : 0.5}
                    onChange={setDownPct}
                    format={v => `${v}% · ${fmtDollar(price * v / 100)}`}
                    minLabel={loanType === 'va' ? '0%' : loanType === 'jumbo' ? '20%' : `${minDown}%`}
                    maxLabel="50%"
                    trackColor="#00e87a" theme="light"
                />

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

                {/* VA Subsequent Use — toggle + prior balance slider + entitlement breakdown */}
                {loanType === 'va' && (
                    <div className="isc__row">
                        <div className="isc__row-hdr">
                            <span className="isc__row-name">Subsequent Use</span>
                            <button
                                className={`isc__subseq-toggle${isSubsequentUse ? ' isc__subseq-toggle--on' : ''}`}
                                onClick={() => setIsSubsequentUse(v => !v)}
                            >
                                {isSubsequentUse ? 'On — I have an active VA loan' : 'Off — First use / full entitlement'}
                            </button>
                        </div>
                        {isSubsequentUse && (
                            <>
                                <SliderField
                                    label="County Loan Limit"
                                    value={countyLimit}
                                    min={647200}
                                    max={2000000}
                                    step={1000}
                                    onChange={setCountyLimit}
                                    format={v => fmtDollar(v)}
                                    minLabel="$647,200"
                                    maxLabel="$2M"
                                />
                                <SliderField
                                    label="Previous Entitlement Used (Not Restored)"
                                    value={prevEntUsed}
                                    min={0}
                                    max={Math.round(countyLimit * 0.25)}
                                    step={100}
                                    onChange={setPrevEntUsed}
                                    format={v => fmtDollar(v)}
                                    minLabel="$0"
                                    maxLabel={fmtDollar(Math.round(countyLimit * 0.25))}
                                />
                                <div className="isc__ent-table">
                                    <div className="isc__ent-row">
                                        <span>Max entitlement (25% of {fmtDollar(countyLimit)})</span>
                                        <span>{fmtDollar(entTotalEntitlement)}</span>
                                    </div>
                                    <div className="isc__ent-row">
                                        <span>Previous entitlement used</span>
                                        <span className="isc__ent-used">−{fmtDollar(entUsed)}</span>
                                    </div>
                                    <div className="isc__ent-row isc__ent-row--highlight">
                                        <span>Available entitlement</span>
                                        <span>{fmtDollar(entRemaining)}</span>
                                    </div>
                                    <div className="isc__ent-row">
                                        <span>Max loan at $0 down (4 × available)</span>
                                        <span>{fmtDollar(entMaxZeroDn)}</span>
                                    </div>
                                    <div className={`isc__ent-row isc__ent-row--dp${entDpNeeded > 0 ? ' isc__ent-row--warn' : ' isc__ent-row--ok'}`}>
                                        <span><strong>Down payment required</strong></span>
                                        <span><strong>{entDpNeeded > 0 ? `${fmtDollar(entDpNeeded)} (${entDpPct.toFixed(1)}%)` : '$0 — fully covered'}</strong></span>
                                    </div>
                                </div>
                                <div className="isc__ff-hint">Per VA partial entitlement worksheet. Click any value to type exact amounts. Check with your lender for your COE details.</div>
                            </>
                        )}
                    </div>
                )}

                {/* Rate Buydown toggle — only when buydownType prop provided */}
                {hasBuydownUI && (
                    <div className="isc__row">
                        <div className="isc__row-hdr">
                            <span className="isc__row-name">Rate Buydown</span>
                            <span className="isc__row-val">
                                {activeBdType === 'none' ? 'None (note rate)' : `${activeBdType} Temporary Buydown`}
                            </span>
                        </div>
                        <div className="isc__terms">
                            {(['none', '1/0', '2/1', '3/2/1'] as const).map(t => (
                                <button key={t}
                                    className={`isc__term${activeBdType === t ? ' isc__term--on isc__term--bd' : ''}`}
                                    onClick={() => setActiveBdType(t)}
                                >{t === 'none' ? 'None' : t}</button>
                            ))}
                        </div>
                        {activeBdType !== 'none' && (
                            <div className="isc__ff-hint">
                                {activeBdType === '2/1' && 'Year 1 rate −2% · Year 2 rate −1% · Year 3+ note rate'}
                                {activeBdType === '1/0' && 'Year 1 rate −1% · Year 2+ note rate'}
                                {activeBdType === '3/2/1' && 'Year 1 rate −3% · Year 2 −2% · Year 3 −1% · Year 4+ note rate'}
                            </div>
                        )}
                    </div>
                )}

                {/* Seller Credit slider — shown when buydown active */}
                {hasBuydownUI && activeBdType !== 'none' && (
                    <div className="isc__row">
                        <SliderField
                            label="Seller / Builder Credit"
                            value={sellerCreditAmt}
                            min={0}
                            max={vaConcessionCap}
                            step={1000}
                            onChange={setSellerCreditAmt}
                            format={v => `${fmtDollar(v)}${buydown ? (v >= buydown.totalCost ? ' ✓ covers buydown' : ` · short ${fmtDollar(buydown.totalCost - v)}`) : ''}`}
                            minLabel="$0"
                            maxLabel={`${fmtDollar(vaConcessionCap)} (4% cap)`}
                            trackColor="#6366f1" theme="light"
                        />
                        <div className="isc__ff-hint">
                            Must be funded by seller, builder, or interested third party — borrower cannot self-fund a buydown. Buydown structures apply to all loan types; allowable credit amounts and underwriting guidelines vary by program. Check with your lender.
                        </div>
                    </div>
                )}

                {/* Interest Rate */}
                <SliderField
                    label="Interest Rate"
                    value={rate}
                    min={3} max={12} step={0.125}
                    onChange={setRate}
                    format={fmtRate}
                    minLabel="3%" maxLabel="12%"
                    trackColor="#00e87a" theme="light"
                />

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
                    {activeBdType !== 'none' && buydown && (
                        <div className="isc__stat">
                            <span className="isc__stat-label">Buydown Cost</span>
                            <span className="isc__stat-val">{fmtDollar(buydown.totalCost)}</span>
                        </div>
                    )}
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
                    margin-bottom: 4px;
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
                .isc__bd-subtitle {
                    font-size: 11px;
                    color: #94a3b8;
                    font-weight: 500;
                    margin-bottom: 12px;
                }

                /* Buydown year table */
                .isc__bd-table {
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    overflow: hidden;
                    margin-bottom: 12px;
                    font-size: 12px;
                }
                .isc__bd-thead {
                    display: grid;
                    grid-template-columns: 50px 60px 80px 80px 1fr;
                    gap: 6px;
                    background: #f1f5f9;
                    padding: 6px 10px;
                    font-size: 10px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: .05em;
                    color: #94a3b8;
                }
                .isc__bd-trow {
                    display: grid;
                    grid-template-columns: 50px 60px 80px 80px 1fr;
                    gap: 6px;
                    padding: 7px 10px;
                    font-weight: 600;
                    font-variant-numeric: tabular-nums;
                    border-top: 1px solid #f1f5f9;
                }
                .isc__bd-trow--reduced {
                    background: #f0fdf4;
                    color: #065f46;
                }
                .isc__bd-trow--note {
                    background: #fff;
                    color: #64748b;
                }
                .isc__bd-green { color: #10b981; font-weight: 700; }
                .isc__bd-muted { color: #94a3b8; font-style: italic; }
                .isc__bd-cost-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 7px 10px;
                    border-top: 1px solid #e2e8f0;
                    background: #f8fafc;
                    font-size: 12px;
                    font-weight: 600;
                    color: #374151;
                }
                .isc__bd-cost-amt {
                    font-weight: 700;
                    color: #0f172a;
                    font-variant-numeric: tabular-nums;
                }
                .isc__bd-covered {
                    font-size: 11px;
                    font-weight: 700;
                    color: #10b981;
                    background: #f0fdf4;
                    border: 1px solid #6ee7b7;
                    border-radius: 5px;
                    padding: 2px 7px;
                }
                .isc__bd-short {
                    font-size: 11px;
                    font-weight: 700;
                    color: #dc2626;
                    background: #fff5f5;
                    border: 1px solid #fecaca;
                    border-radius: 5px;
                    padding: 2px 7px;
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
                .isc__legend--compact {
                    margin-top: 4px;
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
                .isc__ff-hint {
                    font-size: 10px;
                    color: #94a3b8;
                    line-height: 1.4;
                    margin-top: 4px;
                }

                /* Row container */
                .isc__row { display: flex; flex-direction: column; gap: 8px; }
                .isc__row-hdr { display: flex; justify-content: space-between; align-items: baseline; }
                .isc__row-name { font-size: 13px; font-weight: 700; color: #374151; }
                .isc__row-val  { font-size: 12px; font-weight: 600; color: #64748b; }

                /* Term / FF / BD toggle */
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
                .isc__term--bd.isc__term--on {
                    border-color: #6366f1;
                    color: #3730a3;
                    background: #eef2ff;
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

                /* Subsequent use toggle button */
                .isc__subseq-toggle {
                    padding: 5px 12px;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 20px;
                    font-size: 11px;
                    font-weight: 600;
                    cursor: pointer;
                    color: #64748b;
                    background: #fff;
                    transition: all .15s;
                    white-space: nowrap;
                }
                .isc__subseq-toggle--on {
                    border-color: #dc2626;
                    color: #7f1d1d;
                    background: #fff5f5;
                }
                .isc__subseq-toggle:hover:not(.isc__subseq-toggle--on) {
                    border-color: #94a3b8;
                    color: #374151;
                }

                /* Entitlement breakdown table */
                .isc__ent-table {
                    display: flex;
                    flex-direction: column;
                    gap: 0;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    overflow: hidden;
                    font-size: 12px;
                    margin-top: 2px;
                }
                .isc__ent-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 7px 12px;
                    border-bottom: 1px solid #f1f5f9;
                    color: #374151;
                    font-weight: 500;
                }
                .isc__ent-row:last-child { border-bottom: none; }
                .isc__ent-row--highlight {
                    background: #f0fdf4;
                    color: #065f46;
                    font-weight: 700;
                }
                .isc__ent-row--dp {
                    background: #f8fafc;
                }
                .isc__ent-row--warn {
                    background: #fffbeb;
                    color: #92400e;
                }
                .isc__ent-row--ok {
                    background: #f0fdf4;
                    color: #065f46;
                }
                .isc__ent-used {
                    color: #dc2626;
                    font-weight: 700;
                }

                @media (max-width: 480px) {
                    .isc__amount { font-size: 1.9rem; }
                    .isc__legend { gap: 5px 10px; }
                    .isc__legend-name { font-size: 10px; }
                    .isc__terms { gap: 5px; }
                    .isc__term { font-size: 11px; padding: 8px 0; }
                    .isc__bd-thead,
                    .isc__bd-trow { font-size: 10px; grid-template-columns: 40px 52px 68px 68px 1fr; }
                }
            `}</style>
        </div>
    );
}
