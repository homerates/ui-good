'use client';

// app/components/LoanLimitsSliderCard.tsx
// Nationwide 2026 Loan Limits interactive explorer
// Shows conforming / high-balance / jumbo zones based on purchase price + down payment.
// All math is local — no API calls on slider move.

import React, { useState, useMemo, useRef } from 'react';
import { HIGH_COST_COUNTIES, STATE_NAMES } from '@/loanLimitsNational2026';
import { CA_LOAN_LIMITS_2026 } from '@/loanLimits2026';
import SliderField from './SliderField';

export interface LoanLimitsSliderParams {
    county: string;
    state?: string;             // 2-letter state code — defaults to 'CA'
    stateName?: string;         // human-readable (e.g. 'Florida')
    conformingLimit: number;    // county max (e.g. 1,249,125 for LA County)
    nationalBaseline: number;   // always 832,750 (2026 FHFA national baseline)
    price: number;              // initial purchase price
    downPct: number;            // initial down payment %
    taxRate: number;            // annual property tax rate as decimal (e.g. 0.012)
    insRate: number;            // annual insurance rate as decimal (e.g. 0.005)
    baseRate: number;           // conforming 30yr rate %
    onRunScenario?: (seed: string, params: Record<string, any>) => void;
}

type LoanZone = 'standard_conforming' | 'high_balance' | 'jumbo';

// Rate premiums vs standard conforming
const RATE_PREMIUM_HB   = 0.30;  // +0.30% for high balance (mid-range estimate)
const RATE_PREMIUM_JUMBO = 0.50; // +0.50% for jumbo vs conforming

const ZONE_CONFIG = {
    standard_conforming: {
        label: 'CONFORMING',
        sublabel: 'Standard — best rates',
        icon: '✅',
        bg: 'rgba(0,232,122,0.06)',
        border: 'rgba(0,232,122,0.25)',
        badgeBg: '#00e87a',
        badgeText: '#080c12',
        barColor: '#00e87a',
    },
    high_balance: {
        label: 'HIGH BALANCE',
        sublabel: 'Above $832,750 — slight premium',
        icon: '⚡',
        bg: 'rgba(255,140,66,0.06)',
        border: 'rgba(255,140,66,0.25)',
        badgeBg: '#ff8c42',
        badgeText: '#080c12',
        barColor: '#ff8c42',
    },
    jumbo: {
        label: 'JUMBO',
        sublabel: 'Above county conforming limit',
        icon: '🏛️',
        bg: 'rgba(255,95,95,0.06)',
        border: 'rgba(255,95,95,0.25)',
        badgeBg: '#ff5f5f',
        badgeText: '#080c12',
        barColor: '#ff5f5f',
    },
};

// ── Math helpers ───────────────────────────────────────────────────────────────

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

function fmtK(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    return `$${Math.round(n / 1000)}k`;
}

function trackStyle(val: number, min: number, max: number, color = '#10b981'): React.CSSProperties {
    const pct = ((val - min) / (max - min)) * 100;
    return {
        background: `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, #e2e8f0 ${pct}%, #e2e8f0 100%)`,
    };
}

// ── Component ──────────────────────────────────────────────────────────────────

// CA quick-select counties
const CA_QUICK_COUNTIES = [
    { label: 'Los Angeles',    county: 'LOS ANGELES' },
    { label: 'Orange',         county: 'ORANGE' },
    { label: 'San Diego',      county: 'SAN DIEGO' },
    { label: 'San Francisco',  county: 'SAN FRANCISCO' },
    { label: 'Santa Clara',    county: 'SANTA CLARA' },
    { label: 'Sacramento',     county: 'SACRAMENTO' },
    { label: 'Ventura',        county: 'VENTURA' },
    { label: 'Riverside',      county: 'RIVERSIDE' },
    { label: 'Alameda',        county: 'ALAMEDA' },
    { label: 'San Bernardino', county: 'SAN BERNARDINO' },
];

// Build quick-select chips for a given state
function getQuickCounties(state: string): { label: string; county: string }[] {
    if (state === 'CA') return CA_QUICK_COUNTIES;
    const list = HIGH_COST_COUNTIES[state] ?? [];
    if (list.length > 0) {
        // Show up to 8 high-cost counties, title-cased
        return list.slice(0, 8).map(c => ({
            label: c.county.replace(/ COUNTY$/, '').replace(/ BOROUGH$/, '').replace(/ CENSUS AREA$/, '')
                .split(' ').map((w: string) => w.charAt(0) + w.slice(1).toLowerCase()).join(' '),
            county: c.county,
        }));
    }
    // Standard state — no high-cost counties, show a few major metros as text hints
    return [];
}

// Title-case a county string and strip redundant "COUNTY" / "BOROUGH" suffix for display
function formatCountyDisplay(raw: string): string {
    return raw
        .replace(/_/g, ' ')
        .replace(/\s+COUNTY$/i, '')
        .replace(/\s+BOROUGH$/i, '')
        .split(' ')
        .map(w => w.charAt(0) + w.slice(1).toLowerCase())
        .join(' ');
}

export default function LoanLimitsSliderCard(props: LoanLimitsSliderParams) {
    const { county, state = 'CA', stateName, conformingLimit, nationalBaseline, taxRate, insRate, baseRate, onRunScenario } = props;
    const resolvedStateName = stateName ?? STATE_NAMES[state] ?? state;
    const countyDisplay = formatCountyDisplay(county);
    const quickCounties = getQuickCounties(state);

    const priceMax = Math.max(conformingLimit * 2.5, 2_500_000);
    const [price,   setPrice]   = useState(props.price);
    const [downPct, setDownPct] = useState(props.downPct);

    // County / ZIP adjuster state
    const [zipInput, setZipInput] = useState('');
    const [adjOpen,  setAdjOpen]  = useState(false);
    const zipRef = useRef<HTMLInputElement>(null);

    const handleCountyLookup = (countyOrZip: string, targetState?: string) => {
        const val = countyOrZip.trim();
        if (!val) return;
        const stateCtx = targetState ?? state;
        const stateCtxName = STATE_NAMES[stateCtx] ?? stateCtx;
        onRunScenario?.(
            `${stateCtxName} loan limits for ${val} — show me the 2026 conforming, high balance, and jumbo thresholds`,
            { loanLimitsCounty: val, loanLimitsState: stateCtx, purchasePrice: price, downPaymentPct: downPct }
        );
        setZipInput('');
        setAdjOpen(false);
    };

    const calc = useMemo(() => {
        const downAmt  = price * downPct / 100;
        const loanAmt  = price - downAmt;
        const monthlyTax = (price * taxRate) / 12;
        const monthlyIns = (price * insRate) / 12;

        let zone: LoanZone;
        let effectiveRate: number;
        if (loanAmt <= nationalBaseline) {
            zone = 'standard_conforming';
            effectiveRate = baseRate;
        } else if (loanAmt <= conformingLimit) {
            zone = 'high_balance';
            effectiveRate = baseRate + RATE_PREMIUM_HB;
        } else {
            zone = 'jumbo';
            effectiveRate = baseRate + RATE_PREMIUM_JUMBO;
        }

        const monthlyPI   = calcPI(loanAmt, effectiveRate, 30);
        const totalMonthly = monthlyPI + monthlyTax + monthlyIns;

        // "Stay standard conforming" — how much down to get loan ≤ $832,750 (2026 baseline)
        const stayStdDown    = Math.max(0, price - nationalBaseline);
        const stayStdDownPct = price > 0 ? (stayStdDown / price) * 100 : 0;
        const canStayStd     = stayStdDownPct <= 100;

        // "Stay high-balance" — how much down to get loan ≤ conformingLimit
        const stayHBDown    = Math.max(0, price - conformingLimit);
        const stayHBDownPct = price > 0 ? (stayHBDown / price) * 100 : 0;
        const canStayHB     = stayHBDownPct <= 100;

        // Payment comparisons at tier boundaries
        const piAtStdConf   = calcPI(nationalBaseline, baseRate, 30);
        const totalAtStdConf = piAtStdConf + monthlyTax + monthlyIns;

        const piAtHB        = calcPI(Math.min(loanAmt, conformingLimit), baseRate + RATE_PREMIUM_HB, 30);
        const totalAtHB     = piAtHB + monthlyTax + monthlyIns;

        // Bar widths — fraction of conformingLimit * 1.5
        const barMax = conformingLimit * 1.25;
        const stdPct  = Math.min((nationalBaseline / barMax) * 100, 100);
        const hbPct   = Math.min((conformingLimit / barMax) * 100, 100);
        const loanPct = Math.min((loanAmt / barMax) * 100, 100);

        return {
            downAmt, loanAmt, monthlyPI, monthlyTax, monthlyIns, totalMonthly,
            zone, effectiveRate,
            stayStdDown, stayStdDownPct, canStayStd,
            stayHBDown, stayHBDownPct, canStayHB,
            piAtStdConf, totalAtStdConf, piAtHB, totalAtHB,
            stdPct, hbPct, loanPct,
        };
    }, [price, downPct, conformingLimit, nationalBaseline, taxRate, insRate, baseRate]);

    const zone = ZONE_CONFIG[calc.zone];

    const handleRunScenario = (seed: string, loanType: string) => {
        onRunScenario?.(seed, {
            purchasePrice: price,
            downPaymentPct: downPct,
            annualRatePct: calc.effectiveRate,
            loanType,
        });
    };

    return (
        <div className="ll-card">
            {/* ── Header ── */}
            <div className="ll-header">
                <div className="ll-header__left">
                    <span className="ll-header__county">📍 {countyDisplay}, {resolvedStateName}</span>
                    <span className="ll-header__title">2026 {resolvedStateName} Loan Limits</span>
                </div>
                <div className="ll-zone-badge" style={{ background: zone.badgeBg }}>
                    {zone.icon} {zone.label}
                </div>
            </div>

            {/* ── Zone sublabel ── */}
            <div className="ll-zone-sub" style={{ color: zone.badgeBg }}>
                {zone.sublabel}
                {calc.zone !== 'standard_conforming' && (
                    <span className="ll-rate-premium">
                        {' '}· {calc.zone === 'high_balance' ? `+${RATE_PREMIUM_HB}%` : `+${RATE_PREMIUM_JUMBO}%`} rate premium
                    </span>
                )}
            </div>

            {/* ── County / ZIP adjuster ── */}
            {onRunScenario && (
                <div className="ll-adj">
                    <button
                        className="ll-adj__toggle"
                        onClick={() => { setAdjOpen(o => !o); setTimeout(() => zipRef.current?.focus(), 50); }}
                    >
                        📍 Change county or ZIP
                        <span className="ll-adj__arrow">{adjOpen ? '▲' : '▼'}</span>
                    </button>

                    {adjOpen && (
                        <div className="ll-adj__panel">
                            {/* ZIP / county text input */}
                            <div className="ll-adj__row">
                                <input
                                    ref={zipRef}
                                    className="ll-adj__input"
                                    type="text"
                                    placeholder="ZIP code or county name (e.g. 92101, San Diego)"
                                    value={zipInput}
                                    onChange={e => setZipInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleCountyLookup(zipInput); }}
                                />
                                <button
                                    className="ll-adj__go"
                                    onClick={() => handleCountyLookup(zipInput)}
                                    disabled={!zipInput.trim()}
                                >
                                    Look up →
                                </button>
                            </div>

                            {/* Quick county chips — dynamic per state */}
                            {quickCounties.length > 0 && (
                                <>
                                    <div className="ll-adj__quick-label">Quick select</div>
                                    <div className="ll-adj__quick">
                                        {quickCounties.map(({ label, county: c }) => (
                                            <button
                                                key={c}
                                                className={`ll-adj__qchip${c.toUpperCase() === county.toUpperCase() ? ' ll-adj__qchip--active' : ''}`}
                                                onClick={() => handleCountyLookup(c)}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── Sliders ── */}
            <div className="ll-sliders">
                {/* Purchase Price */}
                <SliderField
                    label="Purchase Price" value={price}
                    min={200000} max={priceMax} step={25000}
                    onChange={setPrice}
                    format={fmtDollar}
                    minLabel="$200k" maxLabel={fmtK(priceMax)}
                    trackColor={zone.barColor} theme="dark"
                />

                {/* Down Payment */}
                <SliderField
                    label="Down Payment" value={downPct}
                    min={0} max={60} step={0.5}
                    onChange={setDownPct}
                    format={v => `${v.toFixed(1)}% · ${fmtDollar(price * v / 100)}`}
                    minLabel="0%" maxLabel="60%"
                    trackColor={zone.barColor} theme="dark"
                />
            </div>

            {/* ── Loan Amount + Zone bar ── */}
            <div className="ll-loan-display" style={{ background: zone.bg, borderColor: zone.border }}>
                <div className="ll-loan-display__top">
                    <div>
                        <div className="ll-loan-amt">{fmtDollar(calc.loanAmt)}</div>
                        <div className="ll-loan-lbl">Loan Amount</div>
                    </div>
                    <div className="ll-loan-piti">
                        <div className="ll-loan-amt">{fmtDollar(calc.totalMonthly)}<span className="ll-loan-mo">/mo</span></div>
                        <div className="ll-loan-lbl">Est. PITI · {calc.effectiveRate.toFixed(3)}%</div>
                    </div>
                </div>

                {/* Zone bar */}
                <div className="ll-bar-wrap">
                    <div className="ll-bar-track">
                        {/* Standard conforming zone */}
                        <div className="ll-bar-seg ll-bar-seg--std" style={{ width: `${calc.stdPct}%` }} />
                        {/* High balance zone */}
                        <div className="ll-bar-seg ll-bar-seg--hb"  style={{ width: `${Math.max(0, calc.hbPct - calc.stdPct)}%` }} />
                        {/* Jumbo zone (remainder) */}
                        <div className="ll-bar-seg ll-bar-seg--jumbo" style={{ flex: 1 }} />
                        {/* Current loan marker */}
                        <div className="ll-bar-marker" style={{ left: `${Math.min(calc.loanPct, 98)}%` }} />
                    </div>
                    <div className="ll-bar-labels">
                        <span style={{ left: 0 }}>$0</span>
                        <span style={{ left: `${calc.stdPct}%` }}>{fmtK(nationalBaseline)}</span>
                        {calc.hbPct < 96 && (
                            <span style={{ left: `${calc.hbPct}%` }}>{fmtK(conformingLimit)}</span>
                        )}
                    </div>
                </div>

                {/* Zone legend */}
                <div className="ll-legend">
                    <span className="ll-legend__dot ll-legend__dot--std" />
                    <span className="ll-legend__txt">Conforming</span>
                    <span className="ll-legend__dot ll-legend__dot--hb"  />
                    <span className="ll-legend__txt">High Balance</span>
                    <span className="ll-legend__dot ll-legend__dot--jmb" />
                    <span className="ll-legend__txt">Jumbo</span>
                </div>
            </div>

            {/* ── Limits table ── */}
            <div className="ll-limits-table">
                <div className="ll-limits-row ll-limits-row--std">
                    <span className="ll-limits-zone">✅ Standard Conforming</span>
                    <span className="ll-limits-amt">{fmtDollar(nationalBaseline)}</span>
                    <span className="ll-limits-rate">{baseRate.toFixed(3)}%</span>
                </div>
                <div className="ll-limits-row ll-limits-row--hb">
                    <span className="ll-limits-zone">⚡ High Balance</span>
                    <span className="ll-limits-amt">up to {fmtDollar(conformingLimit)}</span>
                    <span className="ll-limits-rate">+{RATE_PREMIUM_HB}% → {(baseRate + RATE_PREMIUM_HB).toFixed(3)}%</span>
                </div>
                <div className="ll-limits-row ll-limits-row--jmb">
                    <span className="ll-limits-zone">🏛️ Jumbo</span>
                    <span className="ll-limits-amt">above {fmtK(conformingLimit)}</span>
                    <span className="ll-limits-rate">+{RATE_PREMIUM_JUMBO}% → {(baseRate + RATE_PREMIUM_JUMBO).toFixed(3)}%</span>
                </div>
            </div>

            {/* ── Stay conforming callout ── */}
            {(calc.zone === 'jumbo' || calc.zone === 'high_balance') && (
                <div className="ll-callout">
                    {calc.zone === 'jumbo' && calc.canStayHB && (
                        <div className="ll-callout__row ll-callout__row--hb">
                            <span className="ll-callout__icon">⚡</span>
                            <span>
                                Put <strong>{fmtDollar(calc.stayHBDown)} ({calc.stayHBDownPct.toFixed(1)}%)</strong> down to drop to <strong>High Balance</strong>
                                {' '}<span className="ll-callout__save">saves ≈{fmtDollar((calc.totalMonthly - calc.totalAtHB))}/mo on rate premium</span>
                            </span>
                        </div>
                    )}
                    {calc.canStayStd && calc.stayStdDownPct <= 80 && (
                        <div className="ll-callout__row ll-callout__row--std">
                            <span className="ll-callout__icon">✅</span>
                            <span>
                                Put <strong>{fmtDollar(calc.stayStdDown)} ({calc.stayStdDownPct.toFixed(1)}%)</strong> down to reach <strong>Standard Conforming</strong>
                                {' '}<span className="ll-callout__save">best rates, no premium</span>
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* ── Payment comparison ── */}
            <div className="ll-compare">
                <div className="ll-compare__title">Payment Comparison at Tier Boundaries</div>
                <table className="ll-compare__table">
                    <thead>
                        <tr>
                            <th>Scenario</th>
                            <th>Loan Amt</th>
                            <th>Rate</th>
                            <th>PITI</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className={calc.zone === 'standard_conforming' ? 'll-compare__row--active' : ''}>
                            <td>✅ Conforming max</td>
                            <td>{fmtK(nationalBaseline)}</td>
                            <td>{baseRate.toFixed(3)}%</td>
                            <td>{fmtDollar(calc.totalAtStdConf)}/mo</td>
                        </tr>
                        {conformingLimit > nationalBaseline && (
                            <tr className={calc.zone === 'high_balance' ? 'll-compare__row--active' : ''}>
                                <td>⚡ HB max</td>
                                <td>{fmtK(conformingLimit)}</td>
                                <td>{(baseRate + RATE_PREMIUM_HB).toFixed(3)}%</td>
                                <td>{fmtDollar(calc.totalAtHB)}/mo</td>
                            </tr>
                        )}
                        <tr className={calc.zone === 'jumbo' ? 'll-compare__row--active' : ''}>
                            <td>🏛️ Your loan</td>
                            <td>{fmtK(calc.loanAmt)}</td>
                            <td>{calc.effectiveRate.toFixed(3)}%</td>
                            <td><strong>{fmtDollar(calc.totalMonthly)}/mo</strong></td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* ── Run scenario chips ── */}
            {onRunScenario && (
                <div className="ll-chips">
                    {calc.zone !== 'jumbo' ? (
                        <button className="ll-chip" onClick={() => handleRunScenario(
                            `Conventional ${calc.zone === 'high_balance' ? 'high balance' : ''} loan on a ${fmtDollar(price)} home with ${downPct}% down at ${calc.effectiveRate.toFixed(2)}%`,
                            'conventional'
                        )}>
                            Full conventional breakdown →
                        </button>
                    ) : (
                        <button className="ll-chip ll-chip--jumbo" onClick={() => handleRunScenario(
                            `Jumbo loan on a ${fmtDollar(price)} home with ${downPct}% down at ${calc.effectiveRate.toFixed(2)}%`,
                            'jumbo'
                        )}>
                            Full jumbo breakdown →
                        </button>
                    )}
                    {calc.zone === 'jumbo' && calc.canStayHB && (
                        <button className="ll-chip" onClick={() => handleRunScenario(
                            `Conventional high balance loan on a ${fmtDollar(price)} home with ${Math.ceil(calc.stayHBDownPct + 0.5)}% down`,
                            'conventional'
                        )}>
                            Go high-balance — {Math.ceil(calc.stayHBDownPct + 0.5)}% down
                        </button>
                    )}
                </div>
            )}

            {/* ── Styles ── */}
            <style>{`
                .ll-card {
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 16px;
                    padding: 20px;
                    margin: 12px 0;
                    font-family: inherit;
                }

                /* Header */
                .ll-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 12px;
                    margin-bottom: 4px;
                }
                .ll-header__left {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .ll-header__county {
                    font-size: 10px;
                    font-weight: 700;
                    color: #94a3b8;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                }
                .ll-header__title {
                    font-size: 15px;
                    font-weight: 700;
                    color: #0f172a;
                    letter-spacing: -0.01em;
                }
                .ll-zone-badge {
                    font-size: 11px;
                    font-weight: 700;
                    color: #fff;
                    padding: 4px 10px;
                    border-radius: 99px;
                    letter-spacing: 0.04em;
                    white-space: nowrap;
                    flex-shrink: 0;
                }
                .ll-zone-sub {
                    font-size: 12px;
                    font-weight: 500;
                    margin-bottom: 16px;
                }
                .ll-rate-premium {
                    font-size: 11px;
                    opacity: 0.75;
                }

                /* Sliders */
                .ll-sliders {
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                    margin-bottom: 16px;
                }
                .ll-slider-row { display: flex; flex-direction: column; gap: 4px; }
                .ll-slider-label {
                    display: flex;
                    justify-content: space-between;
                    font-size: 12px;
                    font-weight: 600;
                    color: #374151;
                }
                .ll-slider-val { color: #0f172a; font-variant-numeric: tabular-nums; }
                .ll-range {
                    -webkit-appearance: none;
                    width: 100%;
                    height: 6px;
                    border-radius: 3px;
                    outline: none;
                    cursor: pointer;
                }
                .ll-range::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: 18px; height: 18px;
                    border-radius: 50%;
                    background: #fff;
                    border: 2px solid #10b981;
                    box-shadow: 0 1px 4px rgba(0,0,0,0.15);
                    cursor: pointer;
                }
                .ll-slider-limits {
                    display: flex;
                    justify-content: space-between;
                    font-size: 10px;
                    color: #94a3b8;
                }

                /* Loan display */
                .ll-loan-display {
                    border: 1.5px solid;
                    border-radius: 12px;
                    padding: 14px 16px;
                    margin-bottom: 12px;
                }
                .ll-loan-display__top {
                    display: flex;
                    justify-content: space-between;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-bottom: 12px;
                }
                .ll-loan-amt {
                    font-size: 22px;
                    font-weight: 800;
                    color: #0f172a;
                    letter-spacing: -0.02em;
                    font-variant-numeric: tabular-nums;
                }
                .ll-loan-mo { font-size: 13px; font-weight: 500; color: #eaf8f7; }
                .ll-loan-lbl { font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
                .ll-loan-piti { text-align: right; }

                /* Zone bar */
                .ll-bar-wrap { position: relative; margin-bottom: 16px; }
                .ll-bar-track {
                    display: flex;
                    height: 8px;
                    border-radius: 4px;
                    overflow: visible;
                    position: relative;
                    background: transparent;
                }
                .ll-bar-seg {
                    height: 8px;
                    min-width: 2px;
                    flex-shrink: 0;
                }
                .ll-bar-seg--std   { background: #22c55e; border-radius: 4px 0 0 4px; }
                .ll-bar-seg--hb    { background: #eab308; }
                .ll-bar-seg--jumbo { background: #ef4444; border-radius: 0 4px 4px 0; }
                .ll-bar-marker {
                    position: absolute;
                    top: -4px;
                    width: 16px;
                    height: 16px;
                    background: #0f172a;
                    border: 2px solid #fff;
                    border-radius: 50%;
                    transform: translateX(-50%);
                    box-shadow: 0 1px 4px rgba(0,0,0,0.25);
                    z-index: 10;
                }
                .ll-bar-labels {
                    position: relative;
                    height: 18px;
                    margin-top: 4px;
                }
                .ll-bar-labels span {
                    position: absolute;
                    font-size: 10px;
                    color: #94a3b8;
                    transform: translateX(-50%);
                    white-space: nowrap;
                }
                .ll-bar-labels span:first-child { transform: none; }

                /* Legend */
                .ll-legend {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    flex-wrap: wrap;
                }
                .ll-legend__dot {
                    width: 8px; height: 8px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }
                .ll-legend__dot--std  { background: #22c55e; }
                .ll-legend__dot--hb   { background: #eab308; }
                .ll-legend__dot--jmb  { background: #ef4444; }
                .ll-legend__txt { font-size: 11px; color: #eaf8f7; margin-right: 6px; }

                /* Limits table */
                .ll-limits-table {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    margin-bottom: 12px;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    overflow: hidden;
                }
                .ll-limits-row {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 12px;
                    font-size: 12px;
                }
                .ll-limits-row--std  { background: #f0fdf4; }
                .ll-limits-row--hb   { background: #fefce8; }
                .ll-limits-row--jmb  { background: #fef2f2; }
                .ll-limits-zone { flex: 1; font-weight: 600; color: #374151; white-space: nowrap; }
                .ll-limits-amt  { color: #0f172a; font-weight: 700; font-variant-numeric: tabular-nums; min-width: 80px; text-align: right; }
                .ll-limits-rate { color: #eaf8f7; min-width: 80px; text-align: right; font-size: 11px; }

                /* Stay conforming callout */
                .ll-callout {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    margin-bottom: 12px;
                }
                .ll-callout__row {
                    display: flex;
                    align-items: flex-start;
                    gap: 8px;
                    padding: 10px 12px;
                    border-radius: 10px;
                    font-size: 13px;
                    line-height: 1.5;
                }
                .ll-callout__row--std { background: #f0fdf4; border: 1px solid #86efac; color: #14532d; }
                .ll-callout__row--hb  { background: #fefce8; border: 1px solid #fde047; color: #713f12; }
                .ll-callout__icon { font-size: 14px; flex-shrink: 0; margin-top: 1px; }
                .ll-callout__save { font-size: 11px; opacity: 0.75; }

                /* Payment comparison */
                .ll-compare {
                    margin-bottom: 14px;
                }
                .ll-compare__title {
                    font-size: 11px;
                    font-weight: 700;
                    color: #94a3b8;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    margin-bottom: 6px;
                }
                .ll-compare__table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 12px;
                }
                .ll-compare__table th {
                    text-align: left;
                    padding: 4px 8px;
                    background: #f8fafc;
                    color: #eaf8f7;
                    font-weight: 600;
                    border-bottom: 1px solid #e2e8f0;
                }
                .ll-compare__table td {
                    padding: 6px 8px;
                    border-bottom: 1px solid #f1f5f9;
                    color: #374151;
                    font-variant-numeric: tabular-nums;
                }
                .ll-compare__row--active td {
                    background: #f0fdf4;
                    font-weight: 600;
                    color: #0f172a;
                }
                .ll-compare__table tr:last-child td { border-bottom: none; }

                /* Chips */
                .ll-chips {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }
                .ll-chip {
                    padding: 7px 14px;
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 99px;
                    font-size: 12px;
                    font-weight: 500;
                    color: #eaf8f7;
                    cursor: pointer;
                    transition: border-color 0.12s, background 0.12s;
                    font-family: inherit;
                }
                .ll-chip:hover { border-color: #10b981; background: #f0fdf4; color: #065f46; }
                .ll-chip--jumbo { border-color: #ddd6fe; background: #f5f3ff; color: #6d28d9; }
                .ll-chip--jumbo:hover { border-color: #7c3aed; background: #ede9fe; color: #5b21b6; }

                /* County / ZIP adjuster */
                .ll-adj {
                    margin-bottom: 16px;
                }
                .ll-adj__toggle {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    padding: 7px 12px;
                    font-size: 12px;
                    font-weight: 600;
                    color: #eaf8f7;
                    cursor: pointer;
                    font-family: inherit;
                    width: 100%;
                    text-align: left;
                    transition: border-color 0.12s, background 0.12s;
                }
                .ll-adj__toggle:hover { border-color: #10b981; background: #f0fdf4; color: #065f46; }
                .ll-adj__arrow { margin-left: auto; font-size: 10px; }
                .ll-adj__panel {
                    margin-top: 8px;
                    padding: 12px;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    background: #f8fafc;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .ll-adj__row {
                    display: flex;
                    gap: 8px;
                }
                .ll-adj__input {
                    flex: 1;
                    padding: 7px 10px;
                    border: 1px solid #e2e8f0;
                    border-radius: 7px;
                    font-size: 12px;
                    font-family: inherit;
                    color: #0f172a;
                    background: #fff;
                    outline: none;
                    min-width: 0;
                }
                .ll-adj__input:focus { border-color: #10b981; box-shadow: 0 0 0 2px #d1fae5; }
                .ll-adj__go {
                    padding: 7px 14px;
                    background: #10b981;
                    border: none;
                    border-radius: 7px;
                    font-size: 12px;
                    font-weight: 600;
                    color: #fff;
                    cursor: pointer;
                    font-family: inherit;
                    white-space: nowrap;
                    flex-shrink: 0;
                    transition: background 0.12s;
                }
                .ll-adj__go:hover { background: #059669; }
                .ll-adj__go:disabled { opacity: 0.45; cursor: not-allowed; }
                .ll-adj__quick-label {
                    font-size: 10px;
                    font-weight: 700;
                    color: #94a3b8;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                }
                .ll-adj__quick {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                }
                .ll-adj__qchip {
                    padding: 5px 11px;
                    background: #fff;
                    border: 1px solid #e2e8f0;
                    border-radius: 99px;
                    font-size: 11px;
                    font-weight: 500;
                    color: #374151;
                    cursor: pointer;
                    font-family: inherit;
                    transition: border-color 0.12s, background 0.12s;
                }
                .ll-adj__qchip:hover { border-color: #10b981; background: #f0fdf4; color: #065f46; }
                .ll-adj__qchip--active {
                    border-color: #10b981;
                    background: #ecfdf5;
                    color: #065f46;
                    font-weight: 700;
                }

                @media (max-width: 500px) {
                    .ll-loan-amt { font-size: 18px; }
                    .ll-limits-table { font-size: 11px; }
                    .ll-limits-rate { display: none; }
                    .ll-compare__table th:nth-child(3),
                    .ll-compare__table td:nth-child(3) { display: none; }
                }
            `}</style>
        </div>
    );
}
