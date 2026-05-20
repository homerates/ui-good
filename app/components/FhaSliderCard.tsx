'use client';

import React, { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import SliderField from './SliderField';
import PdfDownloadButton from './PdfDownloadButton';

// ── FHA 2026 limits by unit count (65% / 150% of FHFA 2026 baseline $832,750) ─
const FHA_LIMITS: Record<number, { floor: number; ceil: number }> = {
    1: { floor: 541287,  ceil: 1249125 },
    2: { floor: 693150,  ceil: 1598400 },
    3: { floor: 837700,  ceil: 1932100 },
    4: { floor: 1040350, ceil: 2403550 },
};

const UFMIP_RATE = 0.0175;

// Max purchase price at 3.5% min down, rounded up to nearest $5k
function priceSliderMax(u: number): number {
    return Math.ceil(FHA_LIMITS[u].ceil / 0.965 / 5000) * 5000;
}

function priceMaxLabel(u: number): string {
    const m = priceSliderMax(u);
    return m >= 1_000_000 ? `$${(m / 1_000_000).toFixed(1).replace(/\.?0+$/, '')}M` : `$${Math.round(m / 1_000)}k`;
}

// ── Math ──────────────────────────────────────────────────────────────────────

function calcPI(principal: number, annualRate: number, termYears: number): number {
    if (principal <= 0) return 0;
    if (annualRate <= 0) return principal / (termYears * 12);
    const r = annualRate / 100 / 12;
    const n = termYears * 12;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function mipRate(ltv: number): number { return ltv > 90 ? 0.0055 : 0.0050; }

// ── Formatting ────────────────────────────────────────────────────────────────

function fmt$(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtK(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
    if (n >= 100_000)   return `$${Math.round(n / 1_000)}k`;
    return fmt$(n);
}

// ── Interface ─────────────────────────────────────────────────────────────────

export interface FhaSliderParams {
    price:         number;
    downPct:       number;
    rate:          number;
    term:          number;
    taxRate:       number;
    insRate:       number;
    monthlyDebts?: number;
    onRunScenario?: (seed: string, overrides: Record<string, unknown>) => void;
}

type LimitStatus = 'within' | 'highcost' | 'exceeds';

function getLimitStatus(baseLoan: number, u: number): LimitStatus {
    const lim = FHA_LIMITS[u];
    if (baseLoan <= lim.floor) return 'within';
    if (baseLoan <= lim.ceil)  return 'highcost';
    return 'exceeds';
}

const DP_CHIPS = [3.5, 5, 10] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function FhaSliderCard(props: FhaSliderParams) {
    const [price,      setPrice]      = useState(props.price);
    const [downPct,    setDownPct]    = useState(props.downPct);
    const [rate,       setRate]       = useState(props.rate);
    const [termYrs,    setTermYrs]    = useState(props.term);
    const [units,      setUnits]      = useState(1);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [vaultDone,  setVaultDone]  = useState(false);
    const [debts,      setDebts]      = useState(props.monthlyDebts ?? 0);

    const { user } = useUser();
    const router   = useRouter();

    // ── Derived values ────────────────────────────────────────────────────────

    const downAmt    = price * downPct / 100;
    const baseLoan   = price - downAmt;
    const ufmip      = Math.round(baseLoan * UFMIP_RATE);
    const loanAmt    = baseLoan + ufmip;
    const ltv        = (baseLoan / price) * 100;
    const annMIP     = mipRate(ltv);
    const monthlyMIP = Math.round((baseLoan * annMIP) / 12);
    const pi         = Math.round(calcPI(loanAmt, rate, termYrs));
    const tax        = Math.round((price * props.taxRate) / 12);
    const ins        = Math.round((price * props.insRate) / 12);
    const total      = pi + monthlyMIP + tax + ins;
    const mipDrops   = downPct >= 10;
    const totalMIP   = mipDrops
        ? Math.round(monthlyMIP * 11 * 12)
        : Math.round(monthlyMIP * termYrs * 12);
    const lifeMIP    = Math.round(monthlyMIP * termYrs * 12);
    const totalPmts  = Math.round(total * termYrs * 12);
    const totalInt   = Math.round(totalPmts - loanAmt);

    const totalObligation = total + debts;
    const q36 = Math.round((totalObligation / 0.36) * 12);
    const q43 = Math.round((totalObligation / 0.43) * 12);
    const q50 = Math.round((totalObligation / 0.50) * 12);

    const limitStatus = getLimitStatus(baseLoan, units);
    const limits      = FHA_LIMITS[units];

    const limitBadge =
        limitStatus === 'within'   ? 'FHA Eligible'    :
        limitStatus === 'highcost' ? 'High-Cost Limit' : 'Exceeds FHA Max';

    const limitDesc =
        limitStatus === 'within'
            ? <span>Base loan of <strong className="fha-strong">{fmt$(Math.round(baseLoan))}</strong> is within the 2026 FHA floor for a {units}-unit property.</span>
            : limitStatus === 'highcost'
                ? <span>Base loan of <strong className="fha-strong">{fmt$(Math.round(baseLoan))}</strong> requires a high-cost county FHA loan for a {units}-unit property. Verify your county limit at hud.gov.</span>
                : <span>Base loan of <strong className="fha-strong">{fmt$(Math.round(baseLoan))}</strong> exceeds the FHA ceiling for a {units}-unit property. Consider Jumbo or Conventional.</span>;

    const limitRight =
        limitStatus === 'within'   ? fmt$(limits.floor)              :
        limitStatus === 'highcost' ? `up to ${fmt$(limits.ceil)}`    : `${fmt$(limits.ceil)} max`;

    // ── Actions ───────────────────────────────────────────────────────────────

    async function handleVault() {
        if (!user) { router.push('/sign-up'); return; }
        try {
            await fetch('/api/library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: `FHA: ${fmtK(price)} · ${downPct}% down · ${rate.toFixed(2)}% · ${termYrs}yr${units > 1 ? ` · ${units}-unit` : ''}`,
                    answer:   `Total/mo: ${fmt$(total)} · PITI+MIP · Base loan: ${fmt$(Math.round(baseLoan))}`,
                    tool_id:  'vault_save_fha',
                }),
            });
            setVaultDone(true);
        } catch { /* non-fatal */ }
    }

    function buildSeed() {
        const prStr  = price >= 1_000_000 ? `$${(price / 1_000_000).toFixed(2)}M` : `$${Math.round(price / 1000)}k`;
        const uStr   = units > 1 ? ` ${units}-unit` : '';
        const dStr   = debts > 0 ? ` with ${fmt$(debts)}/mo in other debts` : '';
        return `FHA loan on a${uStr} ${prStr} home, ${downPct}% down at ${rate.toFixed(3)}% — ${termYrs} year fixed${dStr}`;
    }

    function getMatchedUrl() {
        const p = new URLSearchParams({
            from: 'scenario', lt: 'FHA', purpose: 'Purchase',
            price:   String(Math.round(price)),
            dp:      String(downPct),
            monthly: String(total),
            rate:    String(rate),
            term:    String(termYrs),
        });
        return `/connect/post?${p.toString()}`;
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="fha">

            {/* Header */}
            <div className="fha-header">
                <div className="fha-header-left">
                    <div className="fha-hicon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" width="16" height="16">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
                        </svg>
                    </div>
                    <div>
                        <div className="fha-title">FHA Purchase Payment</div>
                        <div className="fha-sub">{fmtK(price)} · {downPct}% down · {rate.toFixed(2)}% · {termYrs}yr FHA{units > 1 ? ` · ${units}-unit` : ''}</div>
                    </div>
                </div>
                <span className={`fha-zone-badge fha-zone-badge--${limitStatus}`}>{limitBadge}</span>
            </div>

            {/* Limit band */}
            <div className={`fha-band fha-band--${limitStatus}`}>
                <div className="fha-band-l">
                    <div className={`fha-band-pill fha-band-pill--${limitStatus}`}>{limitBadge}</div>
                    <div className="fha-band-desc">{limitDesc}</div>
                </div>
                <div className="fha-band-r">
                    2026 FHA {units}-Unit Max<span>{limitRight}</span>
                </div>
            </div>

            {/* Hero */}
            <div className="fha-hero">
                <div>
                    <div className="fha-hero-label">Est. Monthly PITI + MIP</div>
                    <div className="fha-hero-amount">{fmt$(total)}<span className="fha-hero-mo">/mo</span></div>
                    <div className="fha-hero-sub">P&amp;I + MIP + Tax + Insurance · {downPct}% down</div>
                </div>
                <div className="fha-hero-stats">
                    <div><div className="fha-hsl">Base Loan</div><div className="fha-hsv">{fmt$(Math.round(baseLoan))}</div></div>
                    <div><div className="fha-hsl">Financed (w/ UFMIP)</div><div className="fha-hsv fha-hsv--amber">{fmt$(Math.round(loanAmt))}</div></div>
                    <div><div className="fha-hsl">LTV (base)</div><div className="fha-hsv">{ltv.toFixed(1)}%</div></div>
                </div>
            </div>

            {/* MIP callout */}
            <div className="fha-mip">
                <div className="fha-mip-head">
                    <span style={{ fontSize: 14 }}>🛡️</span>
                    <span className="fha-mip-title">FHA Mortgage Insurance (MIP)</span>
                </div>
                <div className="fha-mip-rows">
                    <div className="fha-mip-row">
                        <div className="fha-mip-row-label">
                            Upfront MIP (UFMIP)
                            <small>1.75% of base loan — financed into your loan</small>
                        </div>
                        <div className="fha-mip-row-val">{fmt$(ufmip)} financed</div>
                    </div>
                    <div className="fha-mip-divider" />
                    <div className="fha-mip-row">
                        <div className="fha-mip-row-label">
                            Annual MIP (monthly)
                            <small>{(annMIP * 100).toFixed(2)}%/yr on base loan · LTV {ltv > 90 ? '> 90%' : '≤ 90%'}</small>
                        </div>
                        <div className="fha-mip-row-val">{fmt$(monthlyMIP)}/mo</div>
                    </div>
                </div>
                <div className={`fha-mip-dur${mipDrops ? ' fha-mip-dur--good' : ' fha-mip-dur--warn'}`}>
                    <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{mipDrops ? '✅' : '⚠️'}</span>
                    {mipDrops
                        ? <span>With {downPct}% down, MIP cancels automatically after <strong>11 years</strong> — you&apos;ll save {fmt$(monthlyMIP)}/mo once it drops.</span>
                        : <span>With {downPct}% down, MIP runs for the <strong>life of your loan</strong> — it never drops off. Put 10%+ down to cancel MIP after 11 years.</span>
                    }
                </div>
            </div>

            {/* Monthly breakdown — always visible */}
            <div className="fha-bkd">
                <div className="fha-bkd-title">Monthly Breakdown</div>
                <div className="fha-bkd-row"><span>Principal &amp; Interest</span><span>{fmt$(pi)}</span></div>
                <div className="fha-bkd-row fha-bkd-mip"><span>Monthly MIP ({(annMIP * 100).toFixed(2)}%/yr)</span><span>{fmt$(monthlyMIP)}</span></div>
                <div className="fha-bkd-row"><span>Property Taxes ({(props.taxRate * 100).toFixed(2)}%)</span><span>{fmt$(tax)}</span></div>
                <div className="fha-bkd-row"><span>Homeowner&apos;s Insurance</span><span>{fmt$(ins)}</span></div>
                <div className="fha-bkd-row fha-bkd-total"><span>Total PITI + MIP</span><span>{fmt$(total)}/mo</span></div>
            </div>

            {/* Sliders — always visible, white section */}
            <div className="fha-sliders">
                <div className="fha-sliders-title">Adjust Your Numbers</div>

                {/* Unit count selector */}
                <div className="fha-unit-row">
                    <div className="fha-unit-label">Property Type</div>
                    <div className="fha-unit-chips">
                        {([1, 2, 3, 4] as const).map(u => (
                            <button
                                key={u}
                                className={`fha-unit-chip${units === u ? ' active' : ''}`}
                                onClick={() => {
                                    setUnits(u);
                                    const max = priceSliderMax(u);
                                    if (price > max) setPrice(max);
                                }}
                            >{u}-Unit</button>
                        ))}
                    </div>
                    <div className="fha-unit-note">
                        {units === 1
                            ? `FHA 2026 · 1-unit: ${fmt$(limits.floor)} floor – ${fmt$(limits.ceil)} high-cost ceiling`
                            : `FHA 2026 · ${units}-unit: ${fmt$(limits.floor)} floor – ${fmt$(limits.ceil)} high-cost ceiling · Owner-occupancy required`
                        }
                    </div>
                </div>

                <SliderField
                    label="Home Price"
                    value={price}
                    min={100000} max={priceSliderMax(units)} step={5000}
                    onChange={setPrice}
                    format={v => fmt$(v)}
                    minLabel="$100k" maxLabel={priceMaxLabel(units)}
                    trackColor="#f59e0b" theme="dark"
                />

                <SliderField
                    label="Down Payment"
                    value={downPct}
                    min={3.5} max={30} step={0.5}
                    onChange={setDownPct}
                    format={v => `${v}% · ${fmtK(price * v / 100)}`}
                    minLabel="3.5%" maxLabel="30%"
                    trackColor="#f59e0b" theme="dark"
                />
                <div className="fha-dp-chips">
                    {DP_CHIPS.map(pct => (
                        <button
                            key={pct}
                            className={`fha-dp-chip${downPct === pct ? ' active' : ''}`}
                            onClick={() => setDownPct(pct)}
                        >
                            {pct}%{pct === 10 ? <span className="fha-dp-chip-note"> MIP↓</span> : null}
                        </button>
                    ))}
                </div>
                <div className="fha-dp-note">FHA min: 3.5% (580+ credit) · 10% (500–579 credit)</div>

                <div className="fha-rate-wrap">
                    <SliderField
                        label="Interest Rate"
                        value={rate}
                        min={3} max={12} step={0.125}
                        onChange={setRate}
                        format={v => parseFloat(v.toFixed(3)) + '%'}
                        minLabel="3%" maxLabel="12%"
                        trackColor="#f59e0b" theme="dark"
                    />
                    <div className="fha-fred-tag">FRED PMMS · {props.rate.toFixed(2)}% live</div>
                </div>

                <div className="fha-term-label">Loan Term</div>
                <div className="fha-terms">
                    {([15, 30] as const).map(yr => (
                        <button
                            key={yr}
                            className={`fha-term${termYrs === yr ? ' fha-term--on' : ''}`}
                            onClick={() => setTermYrs(yr)}
                        >{yr}yr</button>
                    ))}
                </div>

                <SliderField
                    label="Monthly Debts"
                    value={debts}
                    min={0} max={5000} step={50}
                    onChange={setDebts}
                    format={v => v === 0 ? 'None' : fmt$(v) + '/mo'}
                    minLabel="None" maxLabel="$5k/mo"
                    trackColor="#f59e0b" theme="dark"
                />
                <div className="fha-dp-note" style={{ marginTop: -4 }}>Car payments, student loans, credit cards, child support, etc.</div>
            </div>

            {/* Limit exceeded warning */}
            {limitStatus === 'exceeds' && (
                <div className="fha-limit-warn">
                    <span style={{ fontSize: 16, flexShrink: 0 }}>🚫</span>
                    <div className="fha-limit-warn-text">
                        <strong>Loan exceeds the FHA maximum for a {units}-unit property.</strong>{' '}
                        The 2026 high-cost ceiling is <strong>{fmt$(limits.ceil)}</strong> — your base loan of{' '}
                        <strong>{fmt$(Math.round(baseLoan))}</strong> is {fmt$(Math.round(baseLoan - limits.ceil))} over the limit.{' '}
                        Reduce price, increase down payment, or consider a Jumbo or Conventional loan.
                    </div>
                </div>
            )}

            {/* Income qualify table */}
            <div className="fha-qualify">
                <div className="fha-qualify-title">Income to Qualify</div>
                {debts > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginBottom: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <span>PITI+MIP {fmt$(total)} + Debts {fmt$(debts)}</span>
                        <span style={{ color: '#f59e0b', fontWeight: 600 }}>Total {fmt$(totalObligation)}/mo</span>
                    </div>
                )}
                <table className="fha-qtable">
                    <thead>
                        <tr><th>DTI</th><th>Guideline</th><th>Gross Annual</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>36%</td><td>Conservative</td><td className="fha-qval">{fmt$(q36)}</td></tr>
                        <tr className="fha-qrow-hi"><td>43%</td><td>FHA Standard</td><td className="fha-qval">{fmt$(q43)}</td></tr>
                        <tr><td>50%</td><td>AUS Max</td><td className="fha-qval">{fmt$(q50)}</td></tr>
                    </tbody>
                </table>
            </div>

            {/* CTAs */}
            <div className="fha-cta-row">
                <button
                    className="fha-cta-prop"
                    onClick={() => {
                        const p = new URLSearchParams({
                            price:   String(Math.round(price)),
                            dp:      String(downPct),
                            rate:    rate.toFixed(3),
                            term:    String(termYrs),
                            lt:      'fha',
                            taxRate: props.taxRate.toFixed(5),
                            insRate: props.insRate.toFixed(5),
                        });
                        router.push(`/check-property?${p.toString()}`);
                    }}
                >🏠 Check a Property</button>

                {props.onRunScenario && (
                    <button
                        className="fha-cta-run"
                        onClick={() => props.onRunScenario!(buildSeed(), { isFHA: true, purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate, termYears: termYrs, monthlyDebts: debts })}
                    >▶ Run My Numbers</button>
                )}
            </div>
            <button className="fha-cta-full" onClick={() => router.push(getMatchedUrl())}>
                Get Matched with a Lender →
            </button>
            <a
                href="/track5"
                target="_blank"
                rel="noopener"
                style={{
                    display: 'block', margin: '8px 12px 0',
                    background: 'rgba(167,139,250,0.08)',
                    border: '1px solid rgba(167,139,250,0.2)',
                    borderRadius: 9, padding: '11px 14px',
                    fontSize: 13, fontWeight: 700, color: '#a78bfa',
                    textDecoration: 'none', textAlign: 'center',
                }}
            >
                Check on Track 5 ↗
            </a>

            {/* Deep analysis drawer */}
            <button className="fha-dtrigger" onClick={() => setDrawerOpen(o => !o)}>
                <span className="fha-dtrigger-left">
                    <span className="fha-dtrigger-dot" />
                    <span>
                        <span className="fha-dtrigger-label">Deep Analysis</span>
                        <span className="fha-dtrigger-sub">MIP lifetime cost · FHA limits by unit type · Reserves · Full summary</span>
                    </span>
                </span>
                <span className="fha-dtrigger-arrow">{drawerOpen ? '▲ Close' : '▼ View'}</span>
            </button>

            <div style={{ maxHeight: drawerOpen ? 1600 : 0, overflow: 'hidden', transition: 'max-height 0.38s ease' }}>
                <div className="fha-drawer-inner">

                    {/* FHA limits by unit type */}
                    <div className="fha-dsec">
                        <div className="fha-dsec-label">2026 FHA Loan Limits by Unit Type</div>
                        <table className="fha-limits-table">
                            <thead>
                                <tr><th>Units</th><th>National Floor</th><th>High-Cost Ceiling</th></tr>
                            </thead>
                            <tbody>
                                {([1, 2, 3, 4] as const).map(u => (
                                    <tr key={u} className={units === u ? 'fha-limits-active' : ''}>
                                        <td>{u}-Unit</td>
                                        <td>{fmt$(FHA_LIMITS[u].floor)}</td>
                                        <td>{fmt$(FHA_LIMITS[u].ceil)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="fha-limits-note">Verify your county limit at hud.gov/program_offices/housing/sfh/lender/origination/mortgage_limits</div>
                    </div>

                    {/* MIP detail */}
                    <div className="fha-dsec">
                        <div className="fha-dsec-label">MIP Lifetime Cost</div>
                        <div className="fha-kv2"><span>UFMIP (financed into loan)</span><span>{fmt$(ufmip)}</span></div>
                        <div className="fha-kv2"><span>Annual MIP Rate</span><span>{(annMIP * 100).toFixed(2)}% (LTV {ltv > 90 ? '> 90%' : '≤ 90%'})</span></div>
                        <div className="fha-kv2 fha-kv2--amber"><span>Monthly MIP</span><span>{fmt$(monthlyMIP)}/mo</span></div>
                        <div className="fha-kv2"><span>MIP Duration</span><span>{mipDrops ? '11 years (10%+ down)' : `Life of loan (${downPct}% down)`}</span></div>
                        <div className="fha-kv2 fha-kv2--amber"><span>Total MIP Paid ({mipDrops ? '11yr' : `${termYrs}yr`} est.)</span><span>{fmt$(totalMIP)}</span></div>
                        {mipDrops && (
                            <div className="fha-kv2 fha-kv2--green">
                                <span>vs. life-of-loan MIP</span>
                                <span>{fmt$(lifeMIP - totalMIP)} less</span>
                            </div>
                        )}
                    </div>

                    {/* Reserves */}
                    <div className="fha-dsec">
                        <div className="fha-dsec-label">Reserves Needed</div>
                        <div className="fha-kv2"><span>6-Month PITI Cushion</span><span>{fmt$(total * 6)}</span></div>
                        <div className="fha-kv2"><span>12-Month PITI Cushion</span><span>{fmt$(total * 12)}</span></div>
                    </div>

                    {/* Full loan summary */}
                    <div className="fha-dsec">
                        <div className="fha-dsec-label">Full Loan Summary</div>
                        <div className="fha-kv2"><span>Purchase Price</span><span>{fmt$(price)}</span></div>
                        <div className="fha-kv2"><span>Down Payment</span><span>{fmt$(Math.round(downAmt))} ({downPct}%)</span></div>
                        <div className="fha-kv2"><span>Base Loan Amount</span><span>{fmt$(Math.round(baseLoan))}</span></div>
                        <div className="fha-kv2 fha-kv2--amber"><span>UFMIP Financed (1.75%)</span><span>{fmt$(ufmip)}</span></div>
                        <div className="fha-kv2"><span>Total Financed Loan</span><span>{fmt$(Math.round(loanAmt))}</span></div>
                        <div className="fha-kv2"><span>LTV (base)</span><span>{ltv.toFixed(1)}%</span></div>
                        <div className="fha-kv2"><span>Interest Rate</span><span>{rate.toFixed(3)}%</span></div>
                        <div className="fha-kv2"><span>Loan Term</span><span>{termYrs} yr fixed</span></div>
                        <div className="fha-kv2"><span>Monthly PITI + MIP</span><span>{fmt$(total)}</span></div>
                        <div className="fha-kv2"><span>Total of Payments ({termYrs}yr)</span><span>{fmt$(totalPmts)}</span></div>
                        <div className="fha-kv2 fha-kv2--amber"><span>Total Interest Paid</span><span>{fmt$(totalInt)}</span></div>
                    </div>

                </div>
            </div>

            {/* Permanent bottom */}
            <div className="fha-perm">
                <div className="fha-perm-label">Save This Scenario</div>
                <div className="fha-vault-row">
                    <button className="fha-btn-vault" onClick={handleVault}>
                        {vaultDone ? '✓ Saved to Vault' : '⭐ Save to My Vault'}
                    </button>
                    <PdfDownloadButton
                        type="fha"
                        getParams={() => ({
                            price, downPct, rate, term: termYrs,
                            taxRate: props.taxRate, insRate: props.insRate,
                            loanType: 'fha',
                        })}
                    />
                </div>
                <div className="fha-rate-note">
                    <span className="fha-bulb">💡</span>
                    <p>
                        Rate seeded at <strong>{props.rate.toFixed(2)}%</strong> (FRED 30-yr fixed, live avg).
                        FHA MIP per HUD 2024 guidelines (0.55%/yr LTV &gt; 90%, 0.50%/yr ≤ 90%). Actual rate depends on credit score, lender, and lock timing.
                    </p>
                </div>
                <div className="fha-disc">
                    <p>
                        <strong>Educational estimates only.</strong> UFMIP of 1.75% is financed into the loan balance.
                        Monthly MIP calculated on the base loan per HUD Mortgagee Letter guidelines.
                        Property tax estimated at {(props.taxRate * 100).toFixed(1)}% annually; homeowner&apos;s insurance at {(props.insRate * 100).toFixed(1)}% annually.
                        FHA loan limits per HUD 2026 schedule — county-specific limits may be higher in high-cost areas. Multi-unit properties require owner-occupancy.
                        These figures are not a pre-approval or commitment to lend.
                    </p>
                </div>
            </div>

            {/* ── Styles ── */}
            <style>{`
                .fha {
                    background: #0d1117;
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 16px;
                    overflow: clip;
                    margin-top: 14px;
                    font-family: system-ui, -apple-system, sans-serif;
                    color: #f0f4ff;
                }

                /* Header */
                .fha-header { display:flex; align-items:center; justify-content:space-between; padding:14px 16px 10px; gap:10px; }
                .fha-header-left { display:flex; align-items:center; gap:10px; }
                .fha-hicon { width:32px; height:32px; border-radius:9px; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.25); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
                .fha-title { font-size:15px; font-weight:700; color:#f0f4ff; }
                .fha-sub   { font-size:11px; color:#6b7a99; margin-top:2px; }
                .fha-zone-badge { font-size:9px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; padding:4px 10px; border-radius:20px; flex-shrink:0; white-space:nowrap; }
                .fha-zone-badge--within   { background:rgba(0,232,122,0.1);  color:#00e87a; border:1px solid rgba(0,232,122,0.25); }
                .fha-zone-badge--highcost { background:rgba(245,158,11,0.1); color:#f59e0b; border:1px solid rgba(245,158,11,0.3); }
                .fha-zone-badge--exceeds  { background:rgba(239,68,68,0.1);  color:#ef4444; border:1px solid rgba(239,68,68,0.25); }

                /* Limit band */
                .fha-band { margin:0 12px 12px; border-radius:10px; padding:10px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
                .fha-band--within   { background:rgba(0,232,122,0.05);  border:1px solid rgba(0,232,122,0.15); }
                .fha-band--highcost { background:rgba(245,158,11,0.05); border:1px solid rgba(245,158,11,0.2); }
                .fha-band--exceeds  { background:rgba(239,68,68,0.05);  border:1px solid rgba(239,68,68,0.2); }
                .fha-band-l { display:flex; align-items:center; gap:10px; }
                .fha-band-pill { font-size:9px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; padding:3px 10px; border-radius:20px; flex-shrink:0; }
                .fha-band-pill--within   { background:rgba(0,232,122,0.12);  color:#00e87a; border:1px solid rgba(0,232,122,0.25); }
                .fha-band-pill--highcost { background:rgba(245,158,11,0.12); color:#f59e0b; border:1px solid rgba(245,158,11,0.25); }
                .fha-band-pill--exceeds  { background:rgba(239,68,68,0.12);  color:#ef4444; border:1px solid rgba(239,68,68,0.25); }
                .fha-band-desc { font-size:11px; color:#8fa3b8; line-height:1.4; }
                .fha-strong { color:#f0f4ff; }
                .fha-band-r { font-size:10px; color:#8fa3b8; flex-shrink:0; text-align:right; }
                .fha-band-r span { display:block; font-size:11px; color:#6b7a99; font-weight:600; margin-top:2px; }

                /* Hero */
                .fha-hero { margin:0 12px 12px; background:#0e1420; border:1px solid rgba(245,158,11,0.22); border-radius:14px; padding:18px 20px 14px; display:grid; grid-template-columns:1.4fr 1fr; gap:16px; align-items:center; }
                .fha-hero-label { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#4a3510; margin-bottom:6px; }
                .fha-hero-amount { font-size:32px; font-weight:800; color:#f59e0b; letter-spacing:-1px; line-height:1; }
                .fha-hero-mo { font-size:16px; font-weight:600; color:#6b5a1e; }
                .fha-hero-sub { font-size:11px; color:#8fa3b8; margin-top:4px; }
                .fha-hero-stats { display:flex; flex-direction:column; gap:10px; padding-left:16px; border-left:1px solid rgba(255,255,255,0.05); }
                .fha-hsl { font-size:9px; color:#8fa3b8; text-transform:uppercase; letter-spacing:.06em; font-weight:600; margin-bottom:2px; }
                .fha-hsv { font-size:13px; font-weight:700; color:#f0f4ff; }
                .fha-hsv--amber { color:#f59e0b; }

                /* MIP callout */
                .fha-mip { margin:0 12px 12px; border-radius:12px; overflow:hidden; border:1px solid rgba(245,158,11,0.18); }
                .fha-mip-head { display:flex; align-items:center; gap:8px; padding:10px 14px; background:rgba(245,158,11,0.06); border-bottom:1px solid rgba(245,158,11,0.12); }
                .fha-mip-title { font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#f59e0b; }
                .fha-mip-rows { padding:10px 14px 8px; display:flex; flex-direction:column; gap:8px; }
                .fha-mip-row { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
                .fha-mip-row-label { font-size:12px; color:#8fa3b8; line-height:1.4; }
                .fha-mip-row-label small { font-size:10px; color:#8fa3b8; display:block; margin-top:2px; }
                .fha-mip-row-val { font-size:13px; font-weight:700; color:#f59e0b; white-space:nowrap; text-align:right; }
                .fha-mip-divider { height:1px; background:rgba(255,255,255,0.05); margin:0 14px; }
                .fha-mip-dur { margin:8px 14px 12px; border-radius:8px; padding:9px 12px; display:flex; align-items:flex-start; gap:8px; font-size:12px; line-height:1.5; }
                .fha-mip-dur--warn { background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.15); color:#fca5a5; }
                .fha-mip-dur--good { background:rgba(0,232,122,0.05); border:1px solid rgba(0,232,122,0.15); color:#86efac; }

                /* Breakdown */
                .fha-bkd { margin:0 12px 12px; background:#0e1420; border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:14px; }
                .fha-bkd-title { font-size:10px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:.08em; margin-bottom:10px; }
                .fha-bkd-row { display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.03); font-size:12px; color:#8fa3b8; }
                .fha-bkd-row:last-child { border-bottom:none; }
                .fha-bkd-mip span { color:#f59e0b !important; font-weight:700; }
                .fha-bkd-total { border-top:1px solid rgba(255,255,255,0.07) !important; border-bottom:none !important; margin-top:4px; padding-top:10px !important; }
                .fha-bkd-total span:first-child { font-weight:700; color:#f0f4ff; }
                .fha-bkd-total span:last-child  { font-size:14px; font-weight:800; color:#f59e0b; }

                /* Sliders section */
                .fha-sliders { background:#0d1117; color:#f0f4ff; padding:16px 18px; border-top:1px solid rgba(255,255,255,0.05); }
                .fha-sliders-title { font-size:13px; font-weight:700; color:#f0f4ff; margin-bottom:14px; }

                /* Unit selector */
                .fha-unit-row { margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid rgba(255,255,255,0.05); }
                .fha-unit-label { font-size:13px; font-weight:600; color:#8fa3b8; margin-bottom:8px; }
                .fha-unit-chips { display:flex; gap:6px; margin-bottom:6px; }
                .fha-unit-chip { flex:1; padding:8px 0; border-radius:8px; border:1.5px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04); font-size:12px; font-weight:700; color:#6b7a99; cursor:pointer; font-family:inherit; text-align:center; transition:all .15s; }
                .fha-unit-chip.active { border-color:#f59e0b; color:#f59e0b; background:rgba(245,158,11,0.1); }
                .fha-unit-chip:hover:not(.active) { border-color:rgba(255,255,255,0.2); }
                .fha-unit-note { font-size:10px; color:#3a4560; }

                /* FRED tag */
                .fha-rate-wrap { position:relative; }
                .fha-fred-tag { display:inline-block; margin-top:4px; font-size:10px; font-weight:700; color:#f59e0b; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.2); border-radius:4px; padding:2px 8px; letter-spacing:.04em; }

                /* DP chips */
                .fha-dp-chips { display:flex; gap:6px; flex-wrap:wrap; margin:4px 0 8px; }
                .fha-dp-chip { padding:5px 12px; border-radius:20px; border:1.5px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04); font-size:11px; font-weight:600; color:#6b7a99; cursor:pointer; font-family:inherit; transition:all .12s; }
                .fha-dp-chip.active { border-color:#f59e0b; color:#f59e0b; background:rgba(245,158,11,0.1); }
                .fha-dp-chip:hover:not(.active) { border-color:rgba(255,255,255,0.2); }
                .fha-dp-chip-note { font-size:9px; font-weight:600; margin-left:3px; opacity:.8; }
                .fha-dp-note { font-size:10px; color:#3a4560; margin:-4px 0 12px; }

                /* Term */
                .fha-term-label { font-size:13px; font-weight:600; color:#8fa3b8; margin:4px 0 8px; }
                .fha-terms { display:flex; gap:8px; }
                .fha-term { flex:1; padding:10px 0; border-radius:8px; border:1.5px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04); font-size:13px; font-weight:600; color:#6b7a99; cursor:pointer; font-family:inherit; text-align:center; transition:all .15s; }
                .fha-term--on { border-color:#f59e0b; color:#f59e0b; background:rgba(245,158,11,0.1); }
                .fha-term:hover:not(.fha-term--on) { border-color:rgba(255,255,255,0.2); }

                /* Limit exceeded warning */
                .fha-limit-warn { margin:0 12px 12px; background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.2); border-radius:10px; padding:10px 14px; display:flex; gap:10px; align-items:flex-start; }
                .fha-limit-warn-text { font-size:12px; color:#fca5a5; line-height:1.5; }
                .fha-limit-warn-text strong { color:#ef4444; }

                /* Income qualify */
                .fha-qualify { margin:0 12px 12px; background:#0e1420; border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:14px; }
                .fha-qualify-title { font-size:10px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:.08em; margin-bottom:10px; }
                .fha-qtable { width:100%; border-collapse:collapse; font-size:12px; }
                .fha-qtable th { font-size:9px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:.06em; padding:0 0 8px; text-align:left; border-bottom:1px solid rgba(255,255,255,0.05); }
                .fha-qtable th:last-child { text-align:right; }
                .fha-qtable td { padding:7px 0; border-bottom:1px solid rgba(255,255,255,0.03); color:#8fa3b8; }
                .fha-qtable tr:last-child td { border-bottom:none; }
                .fha-qrow-hi td { color:#f0f4ff; font-weight:600; }
                .fha-qval { font-weight:700; color:#f59e0b !important; text-align:right; }

                /* CTAs */
                .fha-cta-row { display:flex; gap:8px; padding:0 12px 8px; }
                .fha-cta-prop { flex:1; padding:11px 14px; background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.12); border-radius:9px; color:#f0f4ff; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; text-align:center; }
                .fha-cta-prop:hover { background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.25); }
                .fha-cta-run { flex:1; padding:11px 14px; background:rgba(245,158,11,0.08); border:1.5px solid rgba(245,158,11,0.3); border-radius:9px; color:#f59e0b; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; text-align:center; }
                .fha-cta-run:hover { opacity:.85; }
                .fha-cta-full { display:block; width:calc(100% - 24px); margin:0 12px 12px; padding:13px; background:#f59e0b; border:none; border-radius:9px; color:#1c0f00; font-size:14px; font-weight:800; cursor:pointer; font-family:inherit; transition:opacity .15s; text-align:center; }
                .fha-cta-full:hover { opacity:.88; }

                /* Deep drawer trigger */
                .fha-dtrigger { width:100%; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:13px 18px; background:rgba(245,158,11,0.05); border:none; border-top:1px solid rgba(245,158,11,0.15); border-bottom:1px solid rgba(245,158,11,0.15); cursor:pointer; font-family:inherit; transition:opacity .15s; }
                .fha-dtrigger:hover { opacity:.85; }
                .fha-dtrigger-left { display:flex; align-items:center; gap:10px; text-align:left; }
                .fha-dtrigger-dot { width:7px; height:7px; border-radius:50%; background:#f59e0b; flex-shrink:0; }
                .fha-dtrigger-label { display:block; font-size:13px; font-weight:700; color:#f59e0b; }
                .fha-dtrigger-sub { display:block; font-size:10px; color:rgba(255,255,255,0.6); margin-top:1px; }
                .fha-dtrigger-arrow { font-size:11px; color:#f59e0b; opacity:.7; flex-shrink:0; }

                /* Drawer inner */
                .fha-drawer-inner { padding:14px; display:flex; flex-direction:column; gap:12px; background:#0a0f1a; }
                .fha-dsec { background:#0e1420; border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:14px; }
                .fha-dsec-label { font-size:9px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:.1em; margin-bottom:10px; }
                .fha-kv2 { display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.03); font-size:12px; }
                .fha-kv2:last-child { border-bottom:none; }
                .fha-kv2 span:first-child { color:#8fa3b8; }
                .fha-kv2 span:last-child  { font-weight:700; color:#f0f4ff; }
                .fha-kv2--amber span:last-child { color:#f59e0b; }
                .fha-kv2--green span:last-child { color:#00e87a; }

                /* FHA limits table in drawer */
                .fha-limits-table { width:100%; border-collapse:collapse; font-size:12px; margin-top:4px; }
                .fha-limits-table th { font-size:9px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:.06em; padding:0 0 8px; text-align:left; border-bottom:1px solid rgba(255,255,255,0.05); }
                .fha-limits-table th:not(:first-child) { text-align:right; }
                .fha-limits-table td { padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.03); color:#8fa3b8; font-size:11px; }
                .fha-limits-table tr:last-child td { border-bottom:none; }
                .fha-limits-table td:not(:first-child) { text-align:right; font-weight:600; color:#c4cfe0; }
                .fha-limits-active td { color:#f0f4ff !important; font-weight:700; background:rgba(245,158,11,0.06); }
                .fha-limits-active td:not(:first-child) { color:#f59e0b !important; }
                .fha-limits-note { font-size:10px; color:#8fa3b8; margin-top:8px; }

                /* Permanent bottom */
                .fha-perm { padding:16px; border-top:1px solid rgba(255,255,255,0.05); }
                .fha-perm-label { font-size:10px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:.08em; margin-bottom:10px; }
                .fha-vault-row { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
                .fha-btn-vault { flex:1; min-width:140px; display:flex; align-items:center; justify-content:center; gap:6px; background:rgba(245,158,11,0.08); color:#f59e0b; border:1.5px solid rgba(245,158,11,0.3); border-radius:8px; padding:10px 16px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:opacity .15s; }
                .fha-btn-vault:hover { opacity:.85; }
                .fha-rate-note { background:rgba(245,158,11,0.04); border:1px solid rgba(245,158,11,0.12); border-radius:10px; padding:10px 14px; display:flex; align-items:flex-start; gap:10px; margin-bottom:10px; }
                .fha-bulb { font-size:16px; flex-shrink:0; margin-top:1px; }
                .fha-rate-note p { font-size:12px; color:#8fa3b8; line-height:1.5; margin:0; }
                .fha-rate-note strong { color:#f59e0b; }
                .fha-disc { background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:10px; padding:12px 14px; }
                .fha-disc p { font-size:11px; color:#6b7a99; line-height:1.6; margin:0; }
                .fha-disc strong { color:#6b7a99; font-weight:600; }

                @media (max-width:480px) {
                    .fha-hero { grid-template-columns:1fr; }
                    .fha-hero-stats { flex-direction:row; padding-left:0; border-left:none; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px; }
                    .fha-cta-row { flex-direction:column; }
                    .fha-hero-amount { font-size:28px; }
                    .fha-band-r { display:none; }
                }
                @media (max-width:640px) {
                    .fha-vault-row { flex-direction:column; }
                    .fha-btn-vault { min-width:unset; }
                }
            `}</style>
        </div>
    );
}
