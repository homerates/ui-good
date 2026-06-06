'use client';

import React, { useState, useMemo, useEffect, CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import SliderField from './SliderField';
import { COLORS } from '../../lib/tokens';
import {
    getCALoanLimits,
    getCACountyByZip,
    getCACountyTaxRate,
    getCACountyInsRate,
    NATIONAL_CONFORMING_BASELINE,
} from '@/loanLimits2026';

// ─── helpers ────────────────────────────────────────────────────────────────

function calcPI(p: number, r: number, y: number): number {
    if (p <= 0 || r <= 0) return 0;
    const mr = r / 100 / 12, n = y * 12;
    return (p * mr * Math.pow(1 + mr, n)) / (Math.pow(1 + mr, n) - 1);
}
function f$(n: number): string {
    const a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e6) { const m = a / 1e6; return s + '$' + (m % 1 === 0 ? m.toFixed(0) : m.toFixed(2).replace(/\.?0+$/, '')) + 'M'; }
    if (a >= 1e4) return s + '$' + Math.round(a / 1000) + 'k';
    return s + '$' + Math.round(a).toLocaleString();
}
function fL(n: number): string { return '$' + Math.round(n).toLocaleString(); }
function fP(n: number): string { return n.toFixed(2) + '%'; }

// ─── zone config ─────────────────────────────────────────────────────────────

type Zone = 'conforming' | 'high_balance' | 'jumbo';

const ZC: Record<Zone, {
    label: string; icon: string; color: string; bg: string; border: string;
    spread: number; res: number; cc: number; note: string;
}> = {
    conforming: {
        label: 'Conforming', icon: '✓',
        color: COLORS.accent, bg: 'rgba(0,232,122,0.07)', border: 'rgba(0,232,122,0.28)',
        spread: 0, res: 2, cc: 0.025,
        note: 'Fannie Mae / Freddie Mac — best rates, lowest reserve and down payment requirements.',
    },
    high_balance: {
        label: 'High-Balance', icon: '◈',
        color: COLORS.orange, bg: 'rgba(255,140,66,0.07)', border: 'rgba(255,140,66,0.28)',
        spread: 0.25, res: 4, cc: 0.025,
        note: 'High-balance conforming — GSE-backed up to county limit. Slight rate premium over standard conforming; easier qualifying than jumbo.',
    },
    jumbo: {
        label: 'Jumbo', icon: '⬡',
        color: COLORS.red, bg: 'rgba(255,95,95,0.07)', border: 'rgba(255,95,95,0.28)',
        spread: 0.40, res: 9, cc: 0.02,
        note: 'Portfolio / non-conforming loan. Portfolio lenders set their own guidelines. Shop 2–3 lenders — pricing, reserves, and criteria vary significantly.',
    },
};

// ─── types ───────────────────────────────────────────────────────────────────

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

// ─── component ───────────────────────────────────────────────────────────────

export default function JumboAffordabilitySliderCard(props: JumboAffordabilitySliderParams) {
    const pMax  = Math.max(10_000_000, Math.ceil(props.price * 2.5 / 500_000) * 500_000);
    const pStep = pMax > 20_000_000 ? 500_000 : pMax > 10_000_000 ? 250_000 : 100_000;

    const [price,   setPrice]   = useState(Math.max(500_000, Math.min(pMax, Math.round(props.price / pStep) * pStep)));
    const [down,    setDown]    = useState(Math.max(10, Math.min(50, props.downPct)));
    const [rate,    setRate]    = useState(Math.round(props.baseRate * 8) / 8);
    const [zip,     setZip]     = useState(props.county ?? '');
    const [cLimit,  setCLimit]  = useState(props.countyLimit);
    const [county,  setCounty]  = useState(props.county ?? '');
    const [taxRate, setTaxRate] = useState(props.taxRate);
    const [insRate, setInsRate] = useState(props.insRate);
    const [zipErr,  setZipErr]  = useState('');
    const [open,    setOpen]    = useState(false);
    const router = useRouter();
    const natBase  = props.nationalBaseline ?? NATIONAL_CONFORMING_BASELINE.units1;

    function handleZip(val: string) {
        setZip(val); setZipErr('');
        const t = val.trim();
        if (t.length === 5 && /^\d{5}$/.test(t)) {
            const found = getCACountyByZip(t);
            if (found) {
                const lim = getCALoanLimits(found);
                if (lim) { setCLimit(lim.conformingLimit); setCounty(lim.county); setTaxRate(getCACountyTaxRate(lim.county)); setInsRate(getCACountyInsRate(lim.county)); }
                else setZipErr('CA county not found');
            } else setZipErr('ZIP not in CA database');
        } else if (t.length > 5 && /[a-zA-Z]/.test(t)) {
            const lim = getCALoanLimits(t);
            if (lim) { setCLimit(lim.conformingLimit); setCounty(lim.county); setTaxRate(getCACountyTaxRate(lim.county)); setInsRate(getCACountyInsRate(lim.county)); }
            else setZipErr('County not found');
        }
    }

    const c = useMemo(() => {
        const loan = price * (1 - down / 100), dp = price - loan, ltv = loan / price;
        const zone: Zone = loan <= natBase ? 'conforming' : loan <= cLimit ? 'high_balance' : 'jumbo';
        const z = ZC[zone];
        const mPI = calcPI(loan, rate, 30), mTax = price * taxRate / 12, mIns = price * insRate / 12;
        const mPMI = zone !== 'jumbo' && down < 20 ? loan * 0.008 / 12 : 0;
        const total = mPI + mTax + mIns + mPMI;
        const res = total * z.res, cc = price * z.cc, cash = dp + cc + res;
        const dHB  = zone === 'jumbo' ? Math.max(0, ((loan - cLimit) / price) * 100) : 0;
        const dCon = zone !== 'conforming' ? Math.max(0, ((loan - natBase) / price) * 100) : 0;
        const svHB  = zone === 'jumbo' ? cLimit * (ZC.jumbo.spread - ZC.high_balance.spread) / 100 : 0;
        const svCon = zone !== 'conforming' ? natBase * (z.spread - ZC.conforming.spread) / 100 : 0;
        return {
            loan, dp, ltv, zone, z, mPI, mTax, mIns, mPMI, total, res, cc, cash,
            i36: (total / 0.36) * 12, i43: (total / 0.43) * 12, i50: (total / 0.50) * 12,
            tInt: mPI * 360 - loan, dHB, dCon, svHB, svCon,
        };
    }, [price, down, rate, cLimit, natBase, taxRate, insRate]);

    const { z } = c;
    const countyDisplay = county ? county.charAt(0) + county.slice(1).toLowerCase().replace(/_/g, ' ') : '';

    function handleCheckProperty() {
        const p = new URLSearchParams({ price: String(Math.round(price)), dp: String(down), rate: rate.toFixed(3), term: '30', lt: 'jumbo', taxRate: taxRate.toFixed(5), insRate: insRate.toFixed(5) });
        router.push(`/check-property?${p.toString()}`);
    }

    function handleRun() {
        props.onRunScenario?.(
            `Jumbo affordability: ${f$(price)} home, ${down}% down, ${fP(rate)} — ${county || 'CA'}`,
            { purchasePrice: price, downPaymentPct: down, annualRatePct: rate, loanType: 'jumbo', county: county || undefined, taxRate, insRate },
        );
    }


    // ── shared style fragments ────────────────────────────────────────────────
    const divS: CSSProperties  = { height: 1, background: 'rgba(255,255,255,0.06)', margin: '16px 20px 0' };
    const secLbl: CSSProperties = { fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'rgba(185,208,192,0.45)', padding: '14px 20px 0' };
    const bRow: CSSProperties  = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.84rem' };
    const bLbl: CSSProperties  = { color: 'rgba(185,208,192,0.75)' };
    const bVal: CSSProperties  = { fontWeight: 600, color: '#f0f4ff' };
    const dsLbl: CSSProperties = { fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'rgba(185,208,192,0.4)', marginBottom: 8 };

    return (
        <div style={{ background: '#0e1420', border: `1px solid ${z.border}`, borderRadius: 18, width: '100%', color: '#f0f4ff', fontFamily: 'var(--font-dm-sans,"DM Sans",sans-serif)', overflow: 'hidden', transition: 'border-color 0.3s' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 0' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(185,208,192,0.55)' }}>Jumbo Affordability</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: z.bg, border: `1px solid ${z.border}`, borderRadius: 20, padding: '4px 12px', fontSize: '0.78rem', fontWeight: 700, color: z.color }}>
                    {z.icon} {z.label}
                </span>
            </div>

            {/* Hero */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, padding: '14px 20px 0' }}>
                {([
                    { val: fL(Math.round(c.total)),                         lbl: 'Monthly PITI',    accent: true },
                    { val: f$(Math.round(c.i43 / 1000) * 1000),             lbl: 'Income @43% DTI', accent: false },
                    { val: f$(Math.round(c.cash)),                           lbl: 'Cash at Close',   accent: false },
                ] as { val: string; lbl: string; accent: boolean }[]).map(({ val, lbl, accent }) => (
                    <div key={lbl} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '14px 10px', textAlign: 'center' as const, minWidth: 0 }}>
                        <div style={{ fontSize: 'clamp(1.15rem,4vw,1.55rem)', fontWeight: 800, color: accent ? z.color : '#f0f4ff', lineHeight: 1.1, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{val}</div>
                        <div style={{ fontSize: '0.63rem', color: 'rgba(185,208,192,0.55)', marginTop: 5, textTransform: 'uppercase' as const, letterSpacing: '0.04em', lineHeight: 1.3 }}>{lbl}</div>
                    </div>
                ))}
            </div>

            {/* Monthly Breakdown */}
            <div style={divS} />
            <div style={secLbl}>Monthly Breakdown</div>
            <div style={{ padding: '8px 20px 0' }}>
                {([
                    { lbl: 'Principal & Interest', val: fL(Math.round(c.mPI)) },
                    { lbl: `Property Tax (${fP(taxRate * 100)})`, val: fL(Math.round(c.mTax)) },
                    { lbl: "Homeowner's Insurance", val: fL(Math.round(c.mIns)) },
                    ...(c.mPMI > 0 ? [{ lbl: 'PMI (until 20% equity)', val: fL(Math.round(c.mPMI)) }] : []),
                ] as { lbl: string; val: string }[]).map(({ lbl, val }) => (
                    <div key={lbl} style={bRow}><span style={bLbl}>{lbl}</span><span style={bVal}>{val}</span></div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 0', fontSize: '0.9rem', fontWeight: 700, marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <span>Total Monthly PITI</span>
                    <span style={{ fontSize: '1.05rem', fontWeight: 800, color: z.color }}>{fL(Math.round(c.total))}</span>
                </div>
            </div>

            {/* Adjust Your Numbers */}
            <div style={divS} />
            <div style={secLbl}>Adjust Your Numbers</div>
            <div style={{ padding: '6px 20px 0' }}>
                <div style={{ marginBottom: 16 }}>
                    <SliderField label="Purchase Price" value={price} min={500_000} max={pMax} step={pStep}
                        onChange={setPrice} format={fL} minLabel="$500k" maxLabel={f$(pMax)} trackColor={z.color} theme="dark" />
                </div>
                <div style={{ marginBottom: 16 }}>
                    <SliderField label="Down Payment" value={down} min={10} max={50} step={1}
                        onChange={setDown} format={v => `${v}% (${fL(Math.round(price * v / 100))})`}
                        minLabel="10%" maxLabel="50%" trackColor={z.color} theme="dark" />
                </div>
                <div style={{ marginBottom: 4 }}>
                    <SliderField label="Interest Rate" value={rate} min={3.5} max={10} step={0.125}
                        onChange={setRate} format={fP} minLabel="3.5%" midLabel={`FRED: ${fP(props.baseRate)}`} maxLabel="10%"
                        trackColor={z.color} theme="dark" />
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(61,139,255,0.1)', border: '1px solid rgba(61,139,255,0.25)', borderRadius: 6, padding: '3px 8px', fontSize: '0.7rem', color: '#3d8bff', fontWeight: 600, marginTop: 6 }}>
                        📡 Seeded from FRED live rate: {fP(props.baseRate)}
                    </div>
                    {c.zone !== 'conforming' && (
                        <div style={{ fontSize: '0.7rem', color: 'rgba(185,208,192,0.4)', marginTop: 5, lineHeight: 1.5 }}>
                            💡 {c.zone === 'jumbo' ? 'Jumbo loans typically run 0.25–0.50% above conforming' : 'High-balance loans typically run 0.125–0.25% above conforming'} — varies by lender, credit, and reserves.
                        </div>
                    )}
                </div>
            </div>

            {/* What Income Do I Need to Qualify? */}
            <div style={divS} />
            <div style={secLbl}>What Income Do I Need to Qualify?</div>
            <div style={{ padding: '8px 20px 0' }}>
                {([
                    { lbl: '36% DTI — Conservative', val: fL(Math.round(c.i36 / 1000) * 1000), dim: false },
                    { lbl: '43% DTI — Standard',     val: fL(Math.round(c.i43 / 1000) * 1000), dim: false },
                    { lbl: '50% DTI — Stretch',      val: fL(Math.round(c.i50 / 1000) * 1000), dim: true  },
                ] as { lbl: string; val: string; dim: boolean }[]).map(({ lbl, val, dim }) => (
                    <div key={lbl} style={{ ...bRow, borderBottom: dim ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
                        <span style={{ ...bLbl, ...(dim ? { color: 'rgba(185,208,192,0.38)' } : {}) }}>{lbl}</span>
                        <span style={{ ...bVal, ...(dim ? { color: 'rgba(185,208,192,0.38)', fontWeight: 500 } : {}) }}>{val}</span>
                    </div>
                ))}
            </div>

            {/* CTAs */}
            <div style={{ display: 'grid', gridTemplateColumns: props.onRunScenario ? '1fr 1fr' : '1fr', gap: 10, padding: '16px 20px 0' }}>
                <button onClick={handleCheckProperty} style={{ padding: '11px 8px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', textAlign: 'center' as const, background: 'rgba(61,139,255,0.1)', border: '1px solid rgba(61,139,255,0.25)', color: '#3d8bff', fontFamily: 'inherit' }}>
                    Check Property ↗
                </button>
                {props.onRunScenario && (
                    <button onClick={handleRun} style={{ padding: '11px 8px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', textAlign: 'center' as const, background: z.color, border: 'none', color: '#fff', fontFamily: 'inherit' }}>
                        Run My Numbers →
                    </button>
                )}
            </div>

            {/* Drawer trigger */}
            <button
                onClick={() => setOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '14px 20px 0', padding: '13px 20px', cursor: 'pointer', fontSize: '0.84rem', color: z.color, background: z.bg, border: `1.5px solid ${z.border}`, borderRadius: 12, fontFamily: 'inherit', width: 'calc(100% - 40px)', userSelect: 'none' as const }}
            >
                <span style={{ fontWeight: 700, letterSpacing: '0.01em' }}>Loan Zone · Full Summary · Cash to Close</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.7, transition: 'transform 0.25s', display: 'inline-block', transform: open ? 'rotate(180deg)' : undefined }}>▼</span>
            </button>

            {/* Drawer */}
            <div style={{ maxHeight: open ? 1400 : 0, overflow: 'hidden', transition: 'max-height 0.38s ease', background: '#080c12' }}>
                <div style={{ padding: '0 0 28px' }}>

                    {/* Zone detail */}
                    <div style={{ padding: '14px 20px 0' }}>
                        <div style={dsLbl}>Loan Zone</div>
                        <div style={{ background: z.bg, border: `1px solid ${z.border}`, borderRadius: 10, padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 700, color: z.color, marginBottom: 6 }}>{z.icon} {z.label} Loan</div>
                            <div style={{ fontSize: '0.8rem', color: 'rgba(185,208,192,0.8)', lineHeight: 1.55 }}>{z.note}</div>
                        </div>
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                            {c.dHB > 0.05 && (
                                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '9px 12px', fontSize: '0.8rem', color: 'rgba(185,208,192,0.85)', lineHeight: 1.55 }}>
                                    <strong style={{ color: '#ff8c42' }}>High-Balance crossover:</strong> Add {fP(c.dHB)} more down (loan → {fL(Math.round(cLimit))} county limit) — saves <strong style={{ color: '#00e87a' }}>{fL(Math.round(c.svHB))}/yr</strong> in rate premium.
                                </div>
                            )}
                            {c.dCon > 0.05 && (
                                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '9px 12px', fontSize: '0.8rem', color: 'rgba(185,208,192,0.85)', lineHeight: 1.55 }}>
                                    <strong style={{ color: '#00e87a' }}>Conforming crossover:</strong> Add {fP(c.dCon)} more down (loan → {fL(natBase)} national limit) — saves <strong style={{ color: '#00e87a' }}>{fL(Math.round(c.svCon))}/yr</strong> in rate premium.
                                </div>
                            )}
                            {c.dHB <= 0.05 && c.dCon <= 0.05 && (
                                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '9px 12px', fontSize: '0.8rem', color: 'rgba(185,208,192,0.38)', lineHeight: 1.55 }}>
                                    No crossover opportunity at current price &amp; down payment.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* County / ZIP */}
                    <div style={{ padding: '14px 20px 0' }}>
                        <div style={dsLbl}>County / ZIP (California)</div>
                        <input
                            type="text"
                            placeholder="ZIP code or county name (e.g. 90210 or Los Angeles)"
                            value={zip} onChange={e => handleZip(e.target.value)}
                            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.11)', borderRadius: 8, padding: '9px 12px', color: '#f0f4ff', fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit', marginTop: 8 }}
                        />
                        {zipErr && <div style={{ fontSize: '0.71rem', color: '#ef4444', marginTop: 4 }}>{zipErr}</div>}
                        {countyDisplay && !zipErr && <div style={{ fontSize: '0.71rem', color: 'rgba(185,208,192,0.42)', marginTop: 5 }}>{countyDisplay} County — conforming limit {fL(cLimit)}</div>}
                        {!countyDisplay && !zipErr && <div style={{ fontSize: '0.71rem', color: 'rgba(185,208,192,0.42)', marginTop: 5 }}>Updates loan limits, tax rate &amp; insurance for your county.</div>}
                    </div>

                    {/* Reserves */}
                    <div style={{ padding: '14px 20px 0' }}>
                        <div style={dsLbl}>Lender Reserve Requirement</div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '11px 14px', fontSize: '0.8rem', color: 'rgba(185,208,192,0.85)', lineHeight: 1.5, marginTop: 8 }}>
                            <span>🏦</span>
                            <span><strong>{z.res}-month reserves</strong> required for {z.label.toLowerCase()} loans — <strong>{fL(Math.round(c.res))}</strong> at current monthly payment.</span>
                        </div>
                    </div>

                    {/* Full Loan Summary */}
                    <div style={{ padding: '14px 20px 0' }}>
                        <div style={dsLbl}>Full Loan Summary</div>
                        <div style={{ marginTop: 8 }}>
                            {([
                                { lbl: 'Loan Amount',                                           val: fL(Math.round(c.loan)) },
                                { lbl: 'LTV',                                                   val: fP(c.ltv * 100) },
                                { lbl: 'Down Payment',                                          val: fL(Math.round(c.dp)) },
                                { lbl: `Est. Closing Costs (${c.zone === 'jumbo' ? '2%' : '2.5%'})`, val: fL(Math.round(c.cc)) },
                                { lbl: `Reserves (${z.res} months)`,                            val: fL(Math.round(c.res)) },
                                { lbl: 'Est. Total Interest (30yr)',                            val: fL(Math.round(c.tInt)) },
                            ] as { lbl: string; val: string }[]).map(({ lbl, val }) => (
                                <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.83rem' }}>
                                    <span style={{ color: 'rgba(185,208,192,0.7)' }}>{lbl}</span>
                                    <span style={{ fontWeight: 600, color: '#f0f4ff' }}>{val}</span>
                                </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.9rem', fontWeight: 700, marginTop: 4 }}>
                                <span>Total Cash Needed</span>
                                <span style={{ fontSize: '1rem', fontWeight: 800, color: z.color }}>{fL(Math.round(c.cash))}</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* ════ PERMANENT BOTTOM ════ */}
            <div style={{ paddingBottom: 20 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '12px 20px 0', padding: '10px 12px', background: 'rgba(61,139,255,0.05)', border: '1px solid rgba(61,139,255,0.15)', borderRadius: 8, fontSize: '0.75rem', color: 'rgba(185,208,192,0.65)', lineHeight: 1.55 }}>
                    <span>💡</span>
                    <span><strong style={{ color: 'rgba(185,208,192,0.9)' }}>Rate seeded from live FRED 30yr avg.</strong> Jumbo loans typically run 0.25–0.50% above conforming. Adjust the rate slider to model your actual scenario.</span>
                </div>
                <div style={{ margin: '12px 20px 0', padding: '12px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, fontSize: '0.71rem', color: 'rgba(185,208,192,0.38)', lineHeight: 1.65, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <strong style={{ color: 'rgba(185,208,192,0.55)' }}>⚠️ Educational estimates only.</strong> All figures are approximate and for informational purposes only. Actual rates, taxes, insurance, PMI, closing costs, and reserve requirements will vary based on lender, credit profile, property location, and market conditions. This is not a commitment to lend or a loan approval. 2026 conforming limits sourced from FHFA. Rate data from FRED / St. Louis Fed (PMMS series).
                </div>
            </div>

        </div>
    );
}
