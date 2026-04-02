'use client';

import React, { useState, useMemo, CSSProperties } from 'react';
import {
    getCALoanLimits,
    getCACountyByZip,
    getCACountyTaxRate,
    getCACountyInsRate,
    NATIONAL_CONFORMING_BASELINE,
} from '@/loanLimits2026';

// ─── local helpers ──────────────────────────────────────────────
function calcPI(principal: number, annualRate: number, termYears: number): number {
    if (principal <= 0 || annualRate <= 0) return 0;
    const r = annualRate / 100 / 12;
    const n = termYears * 12;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function f$(n: number): string {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (abs >= 10_000) return `${sign}$${Math.round(abs / 1000)}k`;
    return `${sign}$${Math.round(abs).toLocaleString()}`;
}

function fLong(n: number): string {
    return '$' + Math.round(n).toLocaleString();
}

function fPct(n: number): string {
    return n.toFixed(2) + '%';
}

function trackStyle(val: number, min: number, max: number, color: string): CSSProperties {
    const pct = ((val - min) / (max - min)) * 100;
    return {
        background: `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, rgba(255,255,255,0.1) ${pct}%, rgba(255,255,255,0.1) 100%)`,
    };
}

// ─── types ──────────────────────────────────────────────────────
export interface JumboAffordabilitySliderParams {
    price: number;
    downPct: number;
    baseRate: number;
    countyLimit: number;
    nationalBaseline: number;
    county?: string;
    taxRate: number;
    insRate: number;
    onRunScenario?: (seed: string, params: Record<string, any>) => void;
}

type Zone = 'conforming' | 'high_balance' | 'jumbo';

const ZONE_CONFIG: Record<Zone, {
    label: string;
    icon: string;
    color: string;
    bg: string;
    border: string;
    spread: number;
    reserveMonths: number;
    note: string;
}> = {
    conforming: {
        label: 'Conforming',
        icon: '✓',
        color: '#22c55e',
        bg: 'rgba(34,197,94,0.08)',
        border: 'rgba(34,197,94,0.3)',
        spread: 0,
        reserveMonths: 2,
        note: 'Fannie Mae / Freddie Mac loan — best rates, lowest reserve requirements.',
    },
    high_balance: {
        label: 'High-Balance',
        icon: '◈',
        color: '#eab308',
        bg: 'rgba(234,179,8,0.08)',
        border: 'rgba(234,179,8,0.3)',
        spread: 0.25,
        reserveMonths: 4,
        note: 'High-balance conforming — GSE-backed but at county limit. Slight rate premium.',
    },
    jumbo: {
        label: 'Jumbo',
        icon: '⬡',
        color: '#ef4444',
        bg: 'rgba(239,68,68,0.08)',
        border: 'rgba(239,68,68,0.3)',
        spread: 0.40,
        reserveMonths: 9,
        note: 'Portfolio / non-conforming loan. Lenders vary widely — shop 2–3 jumbo lenders.',
    },
};

// ─── component ──────────────────────────────────────────────────
export default function JumboAffordabilitySliderCard(props: JumboAffordabilitySliderParams) {
    const [price, setPrice] = useState(Math.max(500_000, Math.min(5_000_000, Math.round(props.price / 25000) * 25000)));
    const [downPct, setDownPct] = useState(Math.max(10, Math.min(50, props.downPct)));
    const [rateAdj, setRateAdj] = useState(0);
    const [zipInput, setZipInput] = useState(props.county ?? '');
    const [countyLimit, setCountyLimit] = useState(props.countyLimit);
    const [county, setCounty] = useState(props.county ?? '');
    const [taxRate, setTaxRate] = useState(props.taxRate);
    const [insRate, setInsRate] = useState(props.insRate);
    const [isDirty, setIsDirty] = useState(false);
    const [zipError, setZipError] = useState('');

    const nationalBaseline = props.nationalBaseline ?? NATIONAL_CONFORMING_BASELINE.units1;

    // ZIP / county lookup
    function handleZipChange(val: string) {
        setZipInput(val);
        setZipError('');
        const trimmed = val.trim();

        if (trimmed.length === 5 && /^\d{5}$/.test(trimmed)) {
            // numeric ZIP
            const found = getCACountyByZip(trimmed);
            if (found) {
                const limits = getCALoanLimits(found);
                if (limits) {
                    setCountyLimit(limits.conformingLimit);
                    setCounty(limits.county);
                    setTaxRate(getCACountyTaxRate(limits.county));
                    setInsRate(getCACountyInsRate(limits.county));
                    setIsDirty(true);
                } else {
                    setZipError('CA county not found for this ZIP');
                }
            } else {
                setZipError('ZIP not found in CA database');
            }
        } else if (trimmed.length > 5 && /[a-zA-Z]/.test(trimmed)) {
            // county name
            const limits = getCALoanLimits(trimmed);
            if (limits) {
                setCountyLimit(limits.conformingLimit);
                setCounty(limits.county);
                setTaxRate(getCACountyTaxRate(limits.county));
                setInsRate(getCACountyInsRate(limits.county));
                setZipError('');
                setIsDirty(true);
            } else {
                setZipError('County not found');
            }
        }
    }

    const calc = useMemo(() => {
        const loanAmount = price * (1 - downPct / 100);
        const downAmount = price - loanAmount;
        const ltv = loanAmount / price;

        const zone: Zone =
            loanAmount <= nationalBaseline ? 'conforming' :
            loanAmount <= countyLimit ? 'high_balance' :
            'jumbo';

        const z = ZONE_CONFIG[zone];
        const effectiveRate = props.baseRate + z.spread + rateAdj;

        const monthlyPI = calcPI(loanAmount, effectiveRate, 30);
        const monthlyTax = (price * taxRate) / 12;
        const monthlyIns = (price * insRate) / 12;
        const monthlyPMI =
            zone !== 'jumbo' && downPct < 20
                ? (loanAmount * 0.008) / 12
                : 0;
        const totalMonthly = monthlyPI + monthlyTax + monthlyIns + monthlyPMI;

        const incomeNeeded36 = (totalMonthly / 0.36) * 12;
        const incomeNeeded43 = (totalMonthly / 0.43) * 12;
        const incomeNeeded50 = (totalMonthly / 0.50) * 12;

        const reservesAmount = totalMonthly * z.reserveMonths;
        const closingCosts = zone === 'jumbo' ? price * 0.02 : price * 0.025;
        const totalCashNeeded = downAmount + closingCosts + reservesAmount;

        // Crossover calculations
        const loanForHB = countyLimit; // max loan for high-balance
        const priceForHB = loanForHB / (1 - downPct / 100);
        const downToHighBalance =
            zone === 'jumbo'
                ? Math.max(0, ((loanAmount - countyLimit) / price) * 100)
                : 0;

        const loanForConforming = nationalBaseline;
        const priceForConforming = loanForConforming / (1 - downPct / 100);
        const downToConforming =
            zone !== 'conforming'
                ? Math.max(0, ((loanAmount - nationalBaseline) / price) * 100)
                : 0;

        // Annual savings from dropping a zone (approx, based on spread diff)
        const savingsHB =
            zone === 'jumbo'
                ? (countyLimit * (ZONE_CONFIG.jumbo.spread - ZONE_CONFIG.high_balance.spread) / 100) / 12 * 12
                : 0;
        const savingsConforming =
            zone !== 'conforming'
                ? (nationalBaseline * (z.spread - ZONE_CONFIG.conforming.spread) / 100) / 12 * 12
                : 0;

        // Total interest over life
        const totalInterest = monthlyPI * 360 - loanAmount;

        return {
            loanAmount,
            downAmount,
            ltv,
            zone,
            z,
            effectiveRate,
            monthlyPI,
            monthlyTax,
            monthlyIns,
            monthlyPMI,
            totalMonthly,
            incomeNeeded36,
            incomeNeeded43,
            incomeNeeded50,
            reservesAmount,
            closingCosts,
            totalCashNeeded,
            downToHighBalance,
            downToConforming,
            savingsHB,
            savingsConforming,
            totalInterest,
        };
    }, [price, downPct, rateAdj, countyLimit, nationalBaseline, taxRate, insRate, props.baseRate]);

    const { zone, z } = calc;

    function markDirty() {
        setIsDirty(true);
    }

    function handleRunScenario() {
        if (!props.onRunScenario) return;
        const seed = `Jumbo affordability: ${f$(price)} home, ${downPct}% down, ${fPct(calc.effectiveRate)} rate — ${county || 'CA'}`;
        props.onRunScenario(seed, {
            purchasePrice: price,
            downPaymentPct: downPct,
            annualRatePct: calc.effectiveRate,
            loanType: 'jumbo',
            county: county || undefined,
            taxRate,
            insRate,
        });
    }

    const countyDisplay = county
        ? county.charAt(0) + county.slice(1).toLowerCase().replace(/_/g, ' ')
        : '';

    // styles
    const S = {
        card: {
            background: '#0e1420',
            border: `1px solid ${z.border}`,
            borderRadius: 16,
            padding: '20px 20px 24px',
            color: '#f0f4ff',
            fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
            maxWidth: 700,
            width: '100%',
            boxSizing: 'border-box' as const,
        } as CSSProperties,
        headerBar: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
        } as CSSProperties,
        title: {
            fontSize: '0.9rem',
            fontWeight: 700,
            color: 'rgba(160,192,168,0.7)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase' as const,
        } as CSSProperties,
        badge: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: z.bg,
            border: `1px solid ${z.border}`,
            borderRadius: 20,
            padding: '4px 12px',
            fontSize: '0.78rem',
            fontWeight: 700,
            color: z.color,
        } as CSSProperties,
        heroRow: {
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            marginBottom: 20,
        } as CSSProperties,
        heroBox: {
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 12,
            padding: '12px 14px',
            textAlign: 'center' as const,
        } as CSSProperties,
        heroVal: {
            fontSize: '1.4rem',
            fontWeight: 800,
            color: '#f0f4ff',
            lineHeight: 1.1,
        } as CSSProperties,
        heroLabel: {
            fontSize: '0.7rem',
            color: 'rgba(160,192,168,0.6)',
            marginTop: 4,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.04em',
        } as CSSProperties,
        callout: {
            background: z.bg,
            border: `1px solid ${z.border}`,
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: '0.82rem',
            color: z.color,
            marginBottom: 14,
        } as CSSProperties,
        crossover: {
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: '0.82rem',
            color: 'rgba(160,192,168,0.85)',
            marginBottom: 10,
        } as CSSProperties,
        sectionLabel: {
            fontSize: '0.72rem',
            fontWeight: 700,
            color: 'rgba(160,192,168,0.5)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase' as const,
            marginBottom: 8,
            marginTop: 18,
        } as CSSProperties,
        sliderWrap: {
            marginBottom: 16,
        } as CSSProperties,
        sliderRow: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 6,
        } as CSSProperties,
        sliderLabel: {
            fontSize: '0.82rem',
            color: 'rgba(160,192,168,0.8)',
        } as CSSProperties,
        sliderVal: {
            fontSize: '0.85rem',
            fontWeight: 700,
            color: '#f0f4ff',
        } as CSSProperties,
        rangeInput: {
            width: '100%',
            height: 4,
            borderRadius: 2,
            outline: 'none',
            appearance: 'none' as const,
            WebkitAppearance: 'none' as const,
            cursor: 'pointer',
        } as CSSProperties,
        table: {
            width: '100%',
            borderCollapse: 'collapse' as const,
            fontSize: '0.82rem',
        } as CSSProperties,
        tr: {
            borderBottom: '1px solid rgba(255,255,255,0.05)',
        } as CSSProperties,
        tdLabel: {
            padding: '7px 0',
            color: 'rgba(160,192,168,0.7)',
        } as CSSProperties,
        tdVal: {
            padding: '7px 0',
            textAlign: 'right' as const,
            fontWeight: 600,
            color: '#f0f4ff',
        } as CSSProperties,
        tdTotal: {
            padding: '9px 0',
            color: '#f0f4ff',
            fontWeight: 700,
        } as CSSProperties,
        tdTotalVal: {
            padding: '9px 0',
            textAlign: 'right' as const,
            fontWeight: 800,
            color: z.color,
            fontSize: '1rem',
        } as CSSProperties,
        zipInput: {
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            padding: '8px 12px',
            color: '#f0f4ff',
            fontSize: '0.85rem',
            outline: 'none',
            width: '100%',
        } as CSSProperties,
        runBtn: {
            marginTop: 20,
            width: '100%',
            background: z.color,
            border: 'none',
            borderRadius: 10,
            padding: '12px',
            color: '#fff',
            fontSize: '0.88rem',
            fontWeight: 700,
            cursor: 'pointer',
        } as CSSProperties,
        reserveCallout: {
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: '0.82rem',
            color: 'rgba(160,192,168,0.85)',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
        } as CSSProperties,
    };

    return (
        <div style={S.card}>
            {/* Header */}
            <div style={S.headerBar}>
                <span style={S.title}>Jumbo Affordability</span>
                <span style={S.badge}>
                    <span>{z.icon}</span>
                    <span>{z.label}</span>
                </span>
            </div>

            {/* Hero row */}
            <div style={S.heroRow}>
                <div style={S.heroBox}>
                    <div style={S.heroVal}>{fLong(Math.round(calc.totalMonthly))}</div>
                    <div style={S.heroLabel}>Monthly PITI{calc.monthlyPMI > 0 ? '+PMI' : ''}</div>
                </div>
                <div style={S.heroBox}>
                    <div style={S.heroVal}>{f$(Math.round(calc.incomeNeeded43 / 1000) * 1000)}</div>
                    <div style={S.heroLabel}>Income Needed (43% DTI)</div>
                </div>
                <div style={S.heroBox}>
                    <div style={S.heroVal}>{f$(Math.round(calc.totalCashNeeded / 1000) * 1000)}</div>
                    <div style={S.heroLabel}>Cash at Close</div>
                </div>
            </div>

            {/* Zone note */}
            <div style={S.callout}>{z.note}</div>

            {/* Crossover callouts */}
            {calc.downToHighBalance > 0 && (
                <div style={S.crossover}>
                    <strong style={{ color: ZONE_CONFIG.high_balance.color }}>High-Balance crossover:</strong>{' '}
                    Add {fPct(calc.downToHighBalance)} more down to reach high-balance — saves{' '}
                    <strong>{fLong(Math.round(calc.savingsHB))}/yr</strong> in interest.
                </div>
            )}
            {calc.downToConforming > 0 && (
                <div style={S.crossover}>
                    <strong style={{ color: ZONE_CONFIG.conforming.color }}>Conforming crossover:</strong>{' '}
                    Add {fPct(calc.downToConforming)} more down to reach conforming — saves{' '}
                    <strong>{fLong(Math.round(calc.savingsConforming))}/yr</strong> in interest.
                </div>
            )}

            {/* Reserves callout */}
            <div style={S.reserveCallout}>
                <span style={{ fontSize: '1rem' }}>🏦</span>
                <span>
                    <strong>{z.reserveMonths}-month reserves</strong> required for {z.label.toLowerCase()} loans —{' '}
                    <strong>{fLong(Math.round(calc.reservesAmount))}</strong> at current payment.
                </span>
            </div>

            {/* Sliders */}
            <div style={S.sectionLabel}>Adjust Scenario</div>

            {/* Price slider */}
            <div style={S.sliderWrap}>
                <div style={S.sliderRow}>
                    <span style={S.sliderLabel}>Purchase Price</span>
                    <span style={S.sliderVal}>{fLong(price)}</span>
                </div>
                <input
                    type="range"
                    min={500_000}
                    max={5_000_000}
                    step={25_000}
                    value={price}
                    onChange={e => { setPrice(+e.target.value); markDirty(); }}
                    style={{ ...S.rangeInput, ...trackStyle(price, 500_000, 5_000_000, z.color) }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'rgba(160,192,168,0.4)', marginTop: 3 }}>
                    <span>$500k</span><span>$5M</span>
                </div>
            </div>

            {/* Down payment slider */}
            <div style={S.sliderWrap}>
                <div style={S.sliderRow}>
                    <span style={S.sliderLabel}>Down Payment</span>
                    <span style={S.sliderVal}>{downPct}% ({fLong(Math.round(calc.downAmount))})</span>
                </div>
                <input
                    type="range"
                    min={10}
                    max={50}
                    step={1}
                    value={downPct}
                    onChange={e => { setDownPct(+e.target.value); markDirty(); }}
                    style={{ ...S.rangeInput, ...trackStyle(downPct, 10, 50, z.color) }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'rgba(160,192,168,0.4)', marginTop: 3 }}>
                    <span>10%</span><span>50%</span>
                </div>
            </div>

            {/* Rate adjustment slider */}
            <div style={S.sliderWrap}>
                <div style={S.sliderRow}>
                    <span style={S.sliderLabel}>Rate Adjustment</span>
                    <span style={S.sliderVal}>
                        {rateAdj >= 0 ? '+' : ''}{rateAdj.toFixed(2)}% → {fPct(calc.effectiveRate)}
                    </span>
                </div>
                <input
                    type="range"
                    min={-100}
                    max={100}
                    step={5}
                    value={Math.round(rateAdj * 100)}
                    onChange={e => { setRateAdj(+e.target.value / 100); markDirty(); }}
                    style={{ ...S.rangeInput, ...trackStyle(rateAdj, -1, 1, z.color) }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'rgba(160,192,168,0.4)', marginTop: 3 }}>
                    <span>−1%</span><span>+1%</span>
                </div>
            </div>

            {/* ZIP / County input */}
            <div style={S.sectionLabel}>County / ZIP (California)</div>
            <input
                type="text"
                placeholder="ZIP code or county name (e.g. 90210 or Los Angeles)"
                value={zipInput}
                onChange={e => handleZipChange(e.target.value)}
                style={S.zipInput}
            />
            {zipError && (
                <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: 4 }}>{zipError}</div>
            )}
            {countyDisplay && !zipError && (
                <div style={{ fontSize: '0.75rem', color: 'rgba(160,192,168,0.6)', marginTop: 4 }}>
                    {countyDisplay} County — conforming limit {fLong(countyLimit)}
                </div>
            )}

            {/* Monthly breakdown table */}
            <div style={S.sectionLabel}>Monthly Breakdown</div>
            <table style={S.table}>
                <tbody>
                    <tr style={S.tr}>
                        <td style={S.tdLabel}>Principal & Interest</td>
                        <td style={S.tdVal}>{fLong(Math.round(calc.monthlyPI))}</td>
                    </tr>
                    <tr style={S.tr}>
                        <td style={S.tdLabel}>Property Tax ({fPct(taxRate * 100)})</td>
                        <td style={S.tdVal}>{fLong(Math.round(calc.monthlyTax))}</td>
                    </tr>
                    <tr style={S.tr}>
                        <td style={S.tdLabel}>Homeowner's Insurance</td>
                        <td style={S.tdVal}>{fLong(Math.round(calc.monthlyIns))}</td>
                    </tr>
                    {calc.monthlyPMI > 0 && (
                        <tr style={S.tr}>
                            <td style={S.tdLabel}>PMI (until 20% equity)</td>
                            <td style={S.tdVal}>{fLong(Math.round(calc.monthlyPMI))}</td>
                        </tr>
                    )}
                    <tr>
                        <td style={S.tdTotal}>Total Monthly PITI</td>
                        <td style={S.tdTotalVal}>{fLong(Math.round(calc.totalMonthly))}</td>
                    </tr>
                </tbody>
            </table>

            {/* DTI income table */}
            <div style={S.sectionLabel}>Annual Income Needed by DTI</div>
            <table style={S.table}>
                <tbody>
                    <tr style={S.tr}>
                        <td style={S.tdLabel}>36% DTI (conservative)</td>
                        <td style={S.tdVal}>{fLong(Math.round(calc.incomeNeeded36 / 1000) * 1000)}</td>
                    </tr>
                    <tr style={S.tr}>
                        <td style={S.tdLabel}>43% DTI (standard)</td>
                        <td style={S.tdVal}>{fLong(Math.round(calc.incomeNeeded43 / 1000) * 1000)}</td>
                    </tr>
                    <tr>
                        <td style={{ ...S.tdTotal, color: 'rgba(160,192,168,0.6)', fontWeight: 500 }}>50% DTI (stretch)</td>
                        <td style={{ ...S.tdTotalVal, color: 'rgba(160,192,168,0.6)', fontSize: '0.85rem' }}>{fLong(Math.round(calc.incomeNeeded50 / 1000) * 1000)}</td>
                    </tr>
                </tbody>
            </table>

            {/* Loan summary */}
            <div style={S.sectionLabel}>Loan Summary</div>
            <table style={S.table}>
                <tbody>
                    <tr style={S.tr}>
                        <td style={S.tdLabel}>Loan Amount</td>
                        <td style={S.tdVal}>{fLong(Math.round(calc.loanAmount))}</td>
                    </tr>
                    <tr style={S.tr}>
                        <td style={S.tdLabel}>LTV</td>
                        <td style={S.tdVal}>{fPct(calc.ltv * 100)}</td>
                    </tr>
                    <tr style={S.tr}>
                        <td style={S.tdLabel}>Effective Rate</td>
                        <td style={S.tdVal}>{fPct(calc.effectiveRate)}</td>
                    </tr>
                    <tr style={S.tr}>
                        <td style={S.tdLabel}>Est. Total Interest (30yr)</td>
                        <td style={S.tdVal}>{fLong(Math.round(calc.totalInterest))}</td>
                    </tr>
                    <tr style={S.tr}>
                        <td style={S.tdLabel}>Down Payment</td>
                        <td style={S.tdVal}>{fLong(Math.round(calc.downAmount))}</td>
                    </tr>
                    <tr style={S.tr}>
                        <td style={S.tdLabel}>Est. Closing Costs ({zone === 'jumbo' ? '2%' : '2.5%'})</td>
                        <td style={S.tdVal}>{fLong(Math.round(calc.closingCosts))}</td>
                    </tr>
                    <tr>
                        <td style={S.tdTotal}>Total Cash Needed</td>
                        <td style={S.tdTotalVal}>{fLong(Math.round(calc.totalCashNeeded))}</td>
                    </tr>
                </tbody>
            </table>

            {/* Run scenario button */}
            {isDirty && props.onRunScenario && (
                <button style={S.runBtn} onClick={handleRunScenario}>
                    Run adjusted scenario →
                </button>
            )}
        </div>
    );
}
