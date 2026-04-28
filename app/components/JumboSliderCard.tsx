'use client';

import React, { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import SliderField from './SliderField';
import PdfDownloadButton from './PdfDownloadButton';

// ── Constants ─────────────────────────────────────────────────────────────────

const NATIONAL_CONFORMING_2026 = 832750;
const HIGH_BAL_CA_MAX_2026     = 1249125;
const ARM_SPREAD               = 1.10;   // typical 7/1 SOFR ARM discount below 30yr fixed

// ── Math helpers ──────────────────────────────────────────────────────────────

function calcPI(principal: number, annualRate: number, termYears: number): number {
    if (principal <= 0) return 0;
    if (annualRate <= 0) return principal / (termYears * 12);
    const r = annualRate / 100 / 12;
    const n = termYears * 12;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function loanBalanceAfter(principal: number, annualRate: number, totalMonths: number, k: number): number {
    if (principal <= 0 || annualRate <= 0) return principal;
    const r  = annualRate / 100 / 12;
    const rk = Math.pow(1 + r, k);
    const rn = Math.pow(1 + r, totalMonths);
    return principal * (rn - rk) / (rn - 1);
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmt$(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtM(n: number) {
    if (n >= 10_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000_000)  return `$${(n / 1_000_000).toFixed(3).replace(/\.?0+$/, '')}M`;
    if (n >= 100_000)    return `$${Math.round(n / 1_000)}k`;
    return fmt$(n);
}

// ── Zone ──────────────────────────────────────────────────────────────────────

type LoanZone = 'conforming' | 'highbal' | 'jumbo';

function getZone(loanAmt: number): LoanZone {
    if (loanAmt <= NATIONAL_CONFORMING_2026) return 'conforming';
    if (loanAmt <= HIGH_BAL_CA_MAX_2026)     return 'highbal';
    return 'jumbo';
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TermType = '15yr' | '30yr' | 'arm7';

export interface JumboSliderParams {
    price:    number;
    downPct:  number;
    rate:     number;   // FRED live seed
    term?:    number;   // default 30
    taxRate:  number;
    insRate:  number;
    onRunScenario?: (seed: string, overrides: Record<string, any>) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function JumboSliderCard(props: JumboSliderParams) {
    const [price,     setPrice]     = useState(props.price);
    const [downPct,   setDownPct]   = useState(Math.max(20, props.downPct));
    const [rate,      setRate]      = useState(props.rate);
    const [termType,  setTermType]  = useState<TermType>('30yr');
    const [bkdOpen,   setBkdOpen]   = useState(true);
    const [vaultDone, setVaultDone] = useState(false);

    const { user } = useUser();
    const router   = useRouter();

    const DP_CHIPS = [20, 25, 30, 40] as const;

    const isDirty = price !== props.price ||
        Math.abs(downPct - Math.max(20, props.downPct)) > 0.001 ||
        Math.abs(rate - props.rate) > 0.001 ||
        termType !== '30yr';

    // ── Derived values ─────────────────────────────────────────────────────────

    const termYrs  = termType === '15yr' ? 15 : 30;
    const armRate  = Math.max(3.0, rate - ARM_SPREAD);
    const effRate  = termType === 'arm7' ? armRate : rate;

    const loanAmt    = price * (1 - downPct / 100);
    const downAmt    = price - loanAmt;
    const ltv        = (loanAmt / price) * 100;

    const monthlyPI  = calcPI(loanAmt, effRate, termYrs);
    const monthlyTax = (price * props.taxRate) / 12;
    const monthlyIns = (price * props.insRate) / 12;
    const total      = monthlyPI + monthlyTax + monthlyIns;

    const reserves6mo   = total * 6;
    const reserves12mo  = total * 12;
    const closingEst    = loanAmt * 0.02;
    const totalAssetsLo = downAmt + closingEst + reserves6mo;
    const totalAssetsHi = downAmt + closingEst + reserves12mo;

    const zone = getZone(loanAmt);

    // ARM yr-8 projections (used only when termType === 'arm7')
    const balYr8        = loanBalanceAfter(loanAmt, armRate, 360, 84);
    const adjRate1      = armRate + 2;
    const maxRate       = armRate + 5;
    const piAdj         = calcPI(balYr8, adjRate1, 276);
    const piMax         = calcPI(balYr8, maxRate, 276);
    const pitiMax       = piMax + monthlyTax + monthlyIns;
    const fixedPITI     = calcPI(loanAmt, rate, 30) + monthlyTax + monthlyIns;
    const armSaveMonthly = fixedPITI - total;
    const armSave7yr    = armSaveMonthly * 84;

    const totalInterest   = (monthlyPI * termYrs * 12) - loanAmt;
    const totalPIPayments = monthlyPI * termYrs * 12;

    // ── Actions ────────────────────────────────────────────────────────────────

    async function handleVault() {
        if (!user) { router.push('/sign-up'); return; }
        try {
            await fetch('/api/library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: `Jumbo: ${fmtM(price)} · ${downPct}% down · ${rate.toFixed(2)}% · ${termYrs}yr`,
                    answer: `Total/mo: ${fmt$(Math.round(total))} · PITI · Loan: ${fmt$(Math.round(loanAmt))}`,
                    tool_id: 'vault_save_jumbo',
                }),
            });
            setVaultDone(true);
        } catch { /* non-fatal */ }
    }

    function buildSeed() {
        return `Jumbo loan on a ${fmtM(price)} home, ${downPct}% down at ${rate.toFixed(3)}% — ${termYrs} year ${termType === 'arm7' ? '7/1 ARM' : 'fixed'}`;
    }

    function getRunOverrides(): Record<string, any> {
        return { purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate, loanType: 'jumbo' };
    }

    function getMatchedUrl() {
        const p = new URLSearchParams({
            from: 'scenario', lt: 'Jumbo', purpose: 'Purchase',
            price:   String(Math.round(price)),
            dp:      String(downPct),
            monthly: String(Math.round(total)),
            rate:    String(rate),
            term:    String(termYrs),
        });
        return `/connect/post?${p.toString()}`;
    }

    function buildIncomeSeed() {
        return `What income do I need to qualify for a ${fmtM(price)} jumbo home with ${downPct}% down at ${rate.toFixed(2)}%?`;
    }

    // ── Zone band content ──────────────────────────────────────────────────────

    const zoneBadge = zone === 'conforming' ? 'Standard Conforming'
        : zone === 'highbal' ? 'High Balance Agency'
        : 'Non-Conforming · Jumbo';

    const zoneDesc = zone === 'conforming'
        ? <span>Loan of <strong className="jbs-strong">{fmt$(Math.round(loanAmt))}</strong> is at or below the 2026 conforming limit — a conventional loan may offer better pricing.</span>
        : zone === 'highbal'
            ? <span>Loan of <strong className="jbs-strong">{fmt$(Math.round(loanAmt))}</strong> falls in the high-balance zone — available in designated high-cost counties (SF Bay, LA, NYC) via Fannie/Freddie.</span>
            : <span>Loan of <strong className="jbs-strong">{fmt$(Math.round(loanAmt))}</strong> exceeds the 2026 conforming limit by <strong className="jbs-strong">{fmt$(Math.round(loanAmt - NATIONAL_CONFORMING_2026))}</strong> — requires jumbo portfolio underwriting.</span>;

    const zoneRight = zone === 'conforming'
        ? { label: '2026 Conforming Limit', val: fmt$(NATIONAL_CONFORMING_2026) }
        : zone === 'highbal'
            ? { label: 'High-Bal Max (CA/NY)', val: fmt$(HIGH_BAL_CA_MAX_2026) }
            : { label: '2026 Conforming Limit', val: fmt$(NATIONAL_CONFORMING_2026) };

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="jbs">

            {/* Topbar */}
            <div className="jbs-topbar">
                <div className="jbs-topbar-l">
                    <div className="jbs-dot" />
                    <span className="jbs-tl">AI Analysis</span>
                </div>
                <span className="jbs-tr">Live · CalcEngine-Deterministic</span>
            </div>

            {/* Header */}
            <div className="jbs-header">
                <div className="jbs-header-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
                    </svg>
                </div>
                <div>
                    <div className="jbs-header-title">Jumbo Purchase Payment</div>
                    <div className="jbs-header-sub">
                        {fmtM(price)} · {downPct}% down · {effRate.toFixed(3)}% · {termType === 'arm7' ? '7/1 ARM' : `${termYrs}yr Fixed`}
                    </div>
                </div>
            </div>

            {/* Zone band */}
            <div className={`jbs-band jbs-band--${zone}`}>
                <div className="jbs-band-l">
                    <div className={`jbs-badge jbs-badge--${zone}`}>{zoneBadge}</div>
                    <div className="jbs-band-desc">{zoneDesc}</div>
                </div>
                <div className="jbs-band-r">
                    {zoneRight.label}<span>{zoneRight.val}</span>
                </div>
            </div>

            {/* Hero */}
            <div className="jbs-hero">
                <div className="jbs-hero-label">
                    {termType === 'arm7' ? 'Est. Monthly PITI (ARM Initial 7yr)' : 'Estimated Monthly PITI'}
                </div>
                <div className="jbs-hero-amount">
                    {fmt$(Math.round(total))}<span className="jbs-hero-mo">/mo</span>
                </div>
                <div className="jbs-hero-sub">
                    P&amp;I + Tax + Insurance · No PMI ({downPct}% down){termType === 'arm7' ? ' · Rate fixed yrs 1–7' : ''}
                </div>
                <div className="jbs-hero-grid">
                    <div className="jbs-hero-stat">
                        <div className="jbs-hero-sl">Loan Amount</div>
                        <div className="jbs-hero-sv">{fmtM(loanAmt)}</div>
                    </div>
                    <div className="jbs-hero-stat">
                        <div className="jbs-hero-sl">Down Payment</div>
                        <div className="jbs-hero-sv">{fmtM(downAmt)}</div>
                    </div>
                    <div className="jbs-hero-stat">
                        <div className="jbs-hero-sl">LTV</div>
                        <div className="jbs-hero-sv">{ltv.toFixed(1)}%</div>
                    </div>
                </div>
            </div>

            {/* ARM disclosure — shown only when 7/1 ARM selected */}
            {termType === 'arm7' && (
                <div className="jbs-arm">
                    <div className="jbs-arm-head">
                        <span className="jbs-arm-icon">📊</span>
                        <span className="jbs-arm-title">7/1 ARM — Rate Adjustment Analysis</span>
                    </div>
                    <div className="jbs-arm-body">
                        <div className="jbs-arm-compare">
                            <div className="jbs-arm-col">
                                <div className="jbs-arm-col-label">30yr Fixed</div>
                                <div className="jbs-arm-col-amount">{fmt$(Math.round(fixedPITI))}</div>
                                <div className="jbs-arm-col-note">PITI · locks in for life</div>
                            </div>
                            <div className="jbs-arm-col jbs-arm-col--on">
                                <div className="jbs-arm-col-label">7/1 ARM Initial</div>
                                <div className="jbs-arm-col-amount">{fmt$(Math.round(total))}</div>
                                <div className="jbs-arm-col-note">PITI · fixed first 84 months</div>
                            </div>
                        </div>
                        <div className="jbs-arm-savings">
                            <strong>{fmt$(Math.round(armSaveMonthly))}/mo saved</strong> vs 30yr fixed ·&nbsp;
                            <strong>{fmtM(Math.round(armSave7yr))} total</strong> before first adjustment
                        </div>
                        {([
                            { k: 'Initial rate (years 1–7)',              v: `${effRate.toFixed(3)}% (SOFR-indexed)`,           warn: false },
                            { k: 'Caps · 2/2/5 structure',                v: 'First +2% · Per-period +2% · Lifetime +5%',        warn: false },
                            { k: 'Year 8 adjusted rate (first +2% cap)',  v: `${adjRate1.toFixed(3)}%`,                          warn: true  },
                            { k: 'Year 8 P&I at first cap',               v: `~${fmt$(Math.round(piAdj))}/mo`,                   warn: true  },
                            { k: 'Maximum rate (lifetime +5%)',           v: `${maxRate.toFixed(3)}%`,                           warn: true  },
                            { k: 'P&I at maximum rate',                   v: `~${fmt$(Math.round(piMax))}/mo`,                   warn: true  },
                        ] as { k: string; v: string; warn: boolean }[]).map(({ k, v, warn }) => (
                            <div key={k} className="jbs-arm-cap-row">
                                <span className="jbs-arm-cap-k">{k}</span>
                                <span className={`jbs-arm-cap-v${warn ? ' warn' : ''}`}>{v}</span>
                            </div>
                        ))}
                        <div className="jbs-arm-risk">
                            ⚠️ <strong>Know your exit strategy.</strong> 7/1 ARMs work best if you plan to sell or refinance within 7 years, or expect rates to fall before year 8.
                            The <strong>{fmt$(Math.round(pitiMax))}/mo PITI at max rate</strong> should be stress-tested against your income.
                        </div>
                    </div>
                </div>
            )}

            {/* Reserve Requirements */}
            <div className="jbs-reserves">
                <div className="jbs-reserves-head">
                    <span className="jbs-reserves-icon">🏦</span>
                    <span className="jbs-reserves-title">Cash Reserves Required by Lenders</span>
                </div>
                <div className="jbs-reserves-rows">
                    <div className="jbs-reserves-row">
                        <div className="jbs-reserves-label">
                            6-Month Reserves (minimum)
                            <small>Must remain in account after closing — cannot be gifted</small>
                        </div>
                        <div className="jbs-reserves-val">{fmt$(Math.round(reserves6mo))}</div>
                    </div>
                    <div className="jbs-reserves-divider" />
                    <div className="jbs-reserves-row">
                        <div className="jbs-reserves-label">
                            12-Month Reserves (preferred for loans over $1M)
                            <small>Higher loan amounts typically require 12 months documented</small>
                        </div>
                        <div className="jbs-reserves-val">{fmt$(Math.round(reserves12mo))}</div>
                    </div>
                </div>
                <div className="jbs-reserves-note">
                    💡 Reserves are <strong>in addition to</strong> your down payment and closing costs. Expect approximately&nbsp;
                    <strong>{fmtM(Math.round(totalAssetsLo / 5000) * 5000)}–{fmtM(Math.round(totalAssetsHi / 5000) * 5000)} total liquid assets</strong> required at closing.
                </div>
            </div>

            {/* Underwriting criteria */}
            <div className="jbs-uw">
                <div className="jbs-uw-head">
                    <span className="jbs-uw-title">Jumbo Underwriting Standards</span>
                </div>
                <div className="jbs-uw-grid">
                    {([
                        { k: 'Min Credit Score',        v: '720+ (740+ preferred)',                                                                                cls: 'ok'                        },
                        { k: 'Max Back-End DTI',        v: '43% (some lenders 45%)',                                                                               cls: 'tight'                     },
                        { k: 'Down Payment',            v: downPct >= 30 ? `${downPct}% — strong position` : downPct >= 25 ? '25% — most lenders preferred' : '20% min · 25% preferred', cls: downPct >= 25 ? 'ok' : 'tight' },
                        { k: 'PMI',                     v: 'None — 20%+ required',                                                                                 cls: 'ok'                        },
                        { k: 'Income Documentation',   v: '2 yrs W-2 or 2 yrs tax returns',                                                                       cls: ''                          },
                        { k: 'Appraisal',               v: price >= 1_500_000 ? '2 appraisals often required >$1.5M' : 'Single appraisal standard',               cls: price >= 1_500_000 ? 'tight' : '' },
                    ] as { k: string; v: string; cls: string }[]).map(({ k, v, cls }) => (
                        <div key={k} className="jbs-uw-item">
                            <div className="jbs-uw-criterion">{k}</div>
                            <div className={`jbs-uw-val${cls ? ` ${cls}` : ''}`}>{v}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Breakdown accordion */}
            <div className="jbs-bkd">
                <button className="jbs-bkd-toggle" onClick={() => setBkdOpen(o => !o)}>
                    <span className="jbs-bkd-label">⊞ &nbsp;Full payment breakdown</span>
                    <span className={`jbs-bkd-chev${bkdOpen ? ' open' : ''}`}>▴</span>
                </button>
                {bkdOpen && (
                    <div className="jbs-bkd-body">
                        <div className="jbs-kv-s">Monthly Payment</div>
                        <div className="jbs-kv">
                            <span className="jbs-kv-k">Principal &amp; Interest{termType === 'arm7' ? ` (${effRate.toFixed(3)}% ARM initial)` : ''}</span>
                            <span className="jbs-kv-v">{fmt$(Math.round(monthlyPI))}</span>
                        </div>
                        <div className="jbs-kv"><span className="jbs-kv-k">Property Taxes (est. {(props.taxRate * 100).toFixed(1)}%/yr)</span><span className="jbs-kv-v">{fmt$(Math.round(monthlyTax))}</span></div>
                        <div className="jbs-kv"><span className="jbs-kv-k">Home Insurance (est. {(props.insRate * 100).toFixed(1)}%/yr)</span><span className="jbs-kv-v">{fmt$(Math.round(monthlyIns))}</span></div>
                        <div className="jbs-kv"><span className="jbs-kv-k">PMI</span><span className="jbs-kv-v jbs-kv-v--green">None ({downPct}% down)</span></div>
                        <div className="jbs-kv jbs-kv--total"><span className="jbs-kv-k">Total Monthly PITI</span><span className="jbs-kv-v jbs-kv-v--purple">{fmt$(Math.round(total))}</span></div>

                        <div className="jbs-kv-s">Loan Details</div>
                        <div className="jbs-kv"><span className="jbs-kv-k">Purchase Price</span><span className="jbs-kv-v">{fmt$(Math.round(price))}</span></div>
                        <div className="jbs-kv"><span className="jbs-kv-k">Down Payment ({downPct}%)</span><span className="jbs-kv-v">{fmt$(Math.round(downAmt))}</span></div>
                        <div className="jbs-kv"><span className="jbs-kv-k">Loan Amount</span><span className="jbs-kv-v jbs-kv-v--purple">{fmt$(Math.round(loanAmt))}</span></div>
                        {zone === 'jumbo' && (
                            <div className="jbs-kv"><span className="jbs-kv-k">Above 2026 Conforming Limit By</span><span className="jbs-kv-v jbs-kv-v--amber">{fmt$(Math.round(loanAmt - NATIONAL_CONFORMING_2026))}</span></div>
                        )}

                        <div className="jbs-kv-s">Lifetime Costs ({termYrs}yr)</div>
                        <div className="jbs-kv"><span className="jbs-kv-k">Total Interest</span><span className="jbs-kv-v">est. {fmt$(Math.round(totalInterest))}</span></div>
                        <div className="jbs-kv"><span className="jbs-kv-k">Total P&amp;I Payments</span><span className="jbs-kv-v">{fmt$(Math.round(totalPIPayments))}</span></div>

                        <div className="jbs-kv-s">Income Needed (no other debts)</div>
                        <div className="jbs-kv"><span className="jbs-kv-k">At 43% DTI (jumbo standard max)</span><span className="jbs-kv-v jbs-kv-v--purple">{fmt$(Math.round(total * 12 / 0.43))}/yr</span></div>
                        <div className="jbs-kv"><span className="jbs-kv-k">At 36% DTI (conservative)</span><span className="jbs-kv-v">{fmt$(Math.round(total * 12 / 0.36))}/yr</span></div>
                    </div>
                )}
            </div>

            {/* Explorer */}
            <div className="jbs-exp">
                <div className="jbs-exp-head">Payment Explorer</div>

                {/* Price — $500k to $25M; click value to type higher */}
                <SliderField
                    label="Home Price"
                    value={price}
                    min={500_000} max={25_000_000} step={25_000}
                    onChange={setPrice}
                    format={v => fmtM(v)}
                    parse={v => {
                        const clean = v.replace(/[$,\s]/g, '');
                        const n = parseFloat(clean);
                        if (isNaN(n)) return price;
                        return clean.toLowerCase().includes('m') ? n * 1_000_000 : n;
                    }}
                    minLabel="$500k" maxLabel="$25M+"
                    trackColor="#8b5cf6" theme="dark"
                />

                <SliderField
                    label="Down Payment"
                    value={downPct}
                    min={20} max={60} step={1}
                    onChange={setDownPct}
                    format={v => `${v}% · ${fmtM(price * v / 100)}`}
                    minLabel="20%" maxLabel="60%"
                    trackColor="#8b5cf6" theme="dark"
                />
                <div className="jbs-dp-chips">
                    {DP_CHIPS.map(pct => (
                        <button
                            key={pct}
                            className={`jbs-dp-chip${Math.round(downPct) === pct ? ' active' : ''}`}
                            onClick={() => setDownPct(pct)}
                        >
                            {pct}%
                        </button>
                    ))}
                </div>
                <div className="jbs-dp-min-note">Jumbo minimum: 20% down · 25% preferred by most lenders · No PMI required</div>

                <SliderField
                    label="Interest Rate"
                    value={rate}
                    min={3} max={12} step={0.125}
                    onChange={setRate}
                    format={v => {
                        const s = parseFloat(v.toFixed(3)) + '%';
                        return termType === 'arm7' ? `${s} → ARM ${Math.max(3, v - ARM_SPREAD).toFixed(3)}%` : s;
                    }}
                    minLabel="3%" maxLabel="12%"
                    midLabel={`FRED: ${props.rate.toFixed(2)}%`}
                    trackColor="#8b5cf6" theme="dark"
                />

                <div className="jbs-exp-term-label">Loan Term</div>
                <div className="jbs-terms">
                    {(['15yr', '30yr', 'arm7'] as const).map(t => (
                        <button
                            key={t}
                            className={`jbs-term${termType === t ? ' jbs-term--on' : ''}`}
                            onClick={() => setTermType(t)}
                        >
                            {t === '15yr' ? '15yr' : t === '30yr' ? '30yr' : '7/1 ARM'}
                        </button>
                    ))}
                </div>

                <div className="jbs-exp-stats">
                    <div className="jbs-exp-stat">
                        <div className="jbs-exp-stat-label">Loan Amount</div>
                        <div className="jbs-exp-stat-val">{fmtM(Math.round(loanAmt))}</div>
                    </div>
                    <div className="jbs-exp-stat">
                        <div className="jbs-exp-stat-label">LTV</div>
                        <div className="jbs-exp-stat-val">{ltv.toFixed(1)}%</div>
                    </div>
                    <div className="jbs-exp-stat">
                        <div className="jbs-exp-stat-label">6mo Reserves</div>
                        <div className="jbs-exp-stat-val" style={{ color: '#8b5cf6' }}>{fmtM(Math.round(reserves6mo))}</div>
                    </div>
                    <div className="jbs-exp-stat">
                        <div className="jbs-exp-stat-label">Total / mo</div>
                        <div className="jbs-exp-stat-val">{fmt$(Math.round(total))}</div>
                    </div>
                </div>

                <div className="jbs-exp-actions">
                    {isDirty && props.onRunScenario && (
                        <button className="jbs-btn-rerun" onClick={() => props.onRunScenario!(buildSeed(), getRunOverrides())}>
                            Run adjusted scenario →
                        </button>
                    )}
                    <button className="jbs-btn-vault" onClick={handleVault}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                            <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
                        </svg>
                        {vaultDone ? 'Saved ✓' : 'My Vault'}
                    </button>
                    <PdfDownloadButton
                        type="jumbo"
                        getParams={() => ({
                            price, downPct, rate, term: termYrs,
                            taxRate: props.taxRate, insRate: props.insRate,
                            loanType: 'jumbo',
                        })}
                    />
                    <button className="jbs-btn-match" onClick={() => router.push(getMatchedUrl())}>
                        Get Matched →
                    </button>
                </div>
            </div>

            {/* Follow-up chips */}
            {props.onRunScenario && (
                <div className="jbs-followup-row">
                    <button
                        className="jbs-followup-chip"
                        onClick={() => props.onRunScenario!(buildIncomeSeed(), {})}
                    >
                        What income do I need to qualify for this jumbo loan? →
                    </button>
                    <button
                        className="jbs-followup-chip jbs-followup-chip--property"
                        onClick={() => {
                            const p = new URLSearchParams({
                                price:   String(Math.round(price)),
                                dp:      String(downPct),
                                rate:    effRate.toFixed(3),
                                term:    String(termYrs),
                                lt:      'jumbo',
                                taxRate: props.taxRate.toFixed(5),
                                insRate: props.insRate.toFixed(5),
                            });
                            router.push(`/check-property?${p.toString()}`);
                        }}
                    >
                        Check a property →
                    </button>
                    <button
                        className="jbs-followup-chip"
                        onClick={() => props.onRunScenario!(
                            `How much in liquid reserves do I need for a $${Math.round(price / 1000)}k jumbo loan?`,
                            {}
                        )}
                    >
                        How much in reserves do I need? →
                    </button>
                </div>
            )}

            {/* Rate note */}
            <div className="jbs-rate-note">
                <span className="jbs-bulb">💡</span>
                <p>
                    <strong>Rate seeded from live FRED 30yr avg.</strong> Jumbo loans for well-qualified borrowers (720+ credit, 20%+ down, strong reserves) often price at par with or below conforming rates — portfolio lenders compete aggressively for high-net-worth clients.
                    {termType === 'arm7' && <> 7/1 ARM rate reflects SOFR-indexed pricing, typically ~{ARM_SPREAD.toFixed(2)}% below 30yr fixed at origination.</>}
                </p>
            </div>

            {/* Disclosures */}
            <div className="jbs-disc">
                <p>
                    <strong>Educational estimates only.</strong> A &quot;jumbo&quot; loan exceeds the 2026 FHFA conforming baseline of {fmt$(NATIONAL_CONFORMING_2026)} for a 1-unit standard-cost area residence. High-balance counties may have limits up to {fmt$(HIGH_BAL_CA_MAX_2026)}. Loans above the high-balance limit are held in portfolio by lenders. Property tax estimated at {(props.taxRate * 100).toFixed(1)}% annually; insurance at {(props.insRate * 100).toFixed(1)}% annually. Reserve calculations based on 6× and 12× total monthly PITI. 7/1 ARM caps shown as 2/2/5 (typical; actual caps vary by lender). Price slider range $500k–$25M; click the value to type higher amounts. These figures are not a pre-approval or commitment to lend.
                </p>
            </div>

            {/* ── Styles ── */}
            <style>{`
                .jbs {
                    background: #0d1117;
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 16px;
                    overflow: clip;
                    margin-top: 14px;
                    font-family: system-ui, -apple-system, sans-serif;
                    color: #f0f4ff;
                }

                /* topbar */
                .jbs-topbar { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.02); }
                .jbs-topbar-l { display:flex; align-items:center; gap:6px; }
                .jbs-dot { width:7px; height:7px; border-radius:50%; background:#8b5cf6; }
                .jbs-tl { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#6b7a99; }
                .jbs-tr { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#3a4560; }

                /* header */
                .jbs-header { display:flex; align-items:center; gap:12px; padding:16px 16px 12px; }
                .jbs-header-icon { width:36px; height:36px; border-radius:10px; background:rgba(139,92,246,0.1); border:1px solid rgba(139,92,246,0.2); display:flex; align-items:center; justify-content:center; color:#8b5cf6; flex-shrink:0; }
                .jbs-header-title { font-size:15px; font-weight:700; color:#f0f4ff; }
                .jbs-header-sub { font-size:11px; color:#6b7a99; margin-top:2px; }

                /* zone band */
                .jbs-band { margin:0 12px 12px; border-radius:10px; padding:10px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
                .jbs-band--conforming { background:rgba(0,232,122,0.04); border:1px solid rgba(0,232,122,0.2); }
                .jbs-band--highbal    { background:rgba(245,158,11,0.05); border:1px solid rgba(245,158,11,0.25); }
                .jbs-band--jumbo      { background:rgba(139,92,246,0.05); border:1px solid rgba(139,92,246,0.2); }
                .jbs-band-l { display:flex; align-items:center; gap:10px; min-width:0; }
                .jbs-badge { font-size:9px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; padding:3px 10px; border-radius:20px; flex-shrink:0; }
                .jbs-badge--conforming { background:rgba(0,232,122,0.1); color:#00e87a; border:1px solid rgba(0,232,122,0.25); }
                .jbs-badge--highbal    { background:rgba(245,158,11,0.1); color:#f59e0b; border:1px solid rgba(245,158,11,0.3); }
                .jbs-badge--jumbo      { background:rgba(139,92,246,0.12); color:#8b5cf6; border:1px solid rgba(139,92,246,0.25); }
                .jbs-band-desc { font-size:11px; color:#8fa3b8; line-height:1.4; }
                .jbs-strong { color:#f0f4ff; }
                .jbs-band-r { font-size:10px; color:#3a4560; flex-shrink:0; text-align:right; white-space:nowrap; }
                .jbs-band-r span { display:block; font-size:11px; font-weight:600; margin-top:2px; color:#6b7a99; }

                /* hero */
                .jbs-hero { margin:0 12px 12px; background:#0e1020; border:1px solid rgba(139,92,246,0.2); border-radius:14px; padding:20px 20px 16px; text-align:center; }
                .jbs-hero-label { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#2e1e5a; margin-bottom:8px; }
                .jbs-hero-amount { font-size:46px; font-weight:800; color:#8b5cf6; letter-spacing:-2px; line-height:1; }
                .jbs-hero-mo { font-size:18px; font-weight:600; color:#4a3a80; letter-spacing:0; }
                .jbs-hero-sub { font-size:12px; color:#8fa3b8; margin-top:6px; }
                .jbs-hero-grid { display:grid; grid-template-columns:repeat(3,1fr); margin-top:14px; border-top:1px solid rgba(255,255,255,0.06); padding-top:12px; }
                .jbs-hero-stat { text-align:center; padding:0 8px; border-right:1px solid rgba(255,255,255,0.06); }
                .jbs-hero-stat:last-child { border-right:none; }
                .jbs-hero-sl { font-size:9px; color:#3a4560; text-transform:uppercase; letter-spacing:.06em; font-weight:600; margin-bottom:4px; }
                .jbs-hero-sv { font-size:13px; font-weight:700; color:#f0f4ff; }

                /* ARM disclosure */
                .jbs-arm { margin:0 12px 12px; border-radius:12px; overflow:hidden; border:1px solid rgba(139,92,246,0.2); }
                .jbs-arm-head { display:flex; align-items:center; gap:8px; padding:9px 14px; background:rgba(139,92,246,0.07); border-bottom:1px solid rgba(139,92,246,0.12); }
                .jbs-arm-icon { font-size:14px; }
                .jbs-arm-title { font-size:11px; font-weight:700; color:#8b5cf6; letter-spacing:.04em; text-transform:uppercase; }
                .jbs-arm-body { padding:12px 14px; }
                .jbs-arm-compare { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; }
                .jbs-arm-col { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:10px 12px; }
                .jbs-arm-col--on { background:rgba(139,92,246,0.06); border-color:rgba(139,92,246,0.2); }
                .jbs-arm-col-label { font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#6b7a99; margin-bottom:6px; }
                .jbs-arm-col--on .jbs-arm-col-label { color:#8b5cf6; }
                .jbs-arm-col-amount { font-size:20px; font-weight:800; color:#c4cfe0; letter-spacing:-0.5px; }
                .jbs-arm-col--on .jbs-arm-col-amount { color:#8b5cf6; }
                .jbs-arm-col-note { font-size:10px; color:#6b7a99; margin-top:3px; }
                .jbs-arm-savings { background:rgba(0,232,122,0.05); border:1px solid rgba(0,232,122,0.15); border-radius:8px; padding:8px 12px; font-size:12px; color:#8fa3b8; margin-bottom:10px; line-height:1.5; }
                .jbs-arm-savings strong { color:#00e87a; }
                .jbs-arm-cap-row { display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.04); font-size:12px; }
                .jbs-arm-cap-row:last-child { border-bottom:none; }
                .jbs-arm-cap-k { color:#8fa3b8; }
                .jbs-arm-cap-v { font-weight:700; color:#c4cfe0; }
                .jbs-arm-cap-v.warn { color:#f59e0b; }
                .jbs-arm-risk { background:rgba(245,158,11,0.06); border:1px solid rgba(245,158,11,0.18); border-radius:8px; padding:9px 12px; font-size:11px; color:#b8a577; line-height:1.5; margin-top:10px; }
                .jbs-arm-risk strong { color:#f59e0b; }

                /* reserves */
                .jbs-reserves { margin:0 12px 12px; border-radius:12px; overflow:hidden; border:1px solid rgba(139,92,246,0.18); }
                .jbs-reserves-head { display:flex; align-items:center; gap:8px; padding:9px 14px; background:rgba(139,92,246,0.06); border-bottom:1px solid rgba(139,92,246,0.12); }
                .jbs-reserves-icon { font-size:14px; }
                .jbs-reserves-title { font-size:11px; font-weight:700; color:#8b5cf6; letter-spacing:.04em; text-transform:uppercase; }
                .jbs-reserves-rows { padding:10px 14px 8px; display:flex; flex-direction:column; gap:7px; }
                .jbs-reserves-row { display:flex; justify-content:space-between; align-items:center; gap:12px; }
                .jbs-reserves-label { font-size:12px; color:#8fa3b8; }
                .jbs-reserves-label small { font-size:10px; color:#3a4560; display:block; margin-top:2px; }
                .jbs-reserves-val { font-size:13px; font-weight:700; color:#8b5cf6; white-space:nowrap; }
                .jbs-reserves-divider { height:1px; background:rgba(255,255,255,0.05); }
                .jbs-reserves-note { margin:6px 14px 10px; border-radius:8px; padding:8px 12px; font-size:11px; line-height:1.5; background:rgba(139,92,246,0.05); border:1px solid rgba(139,92,246,0.14); color:#c4b5fd; }

                /* underwriting */
                .jbs-uw { margin:0 12px 12px; border-radius:12px; overflow:hidden; border:1px solid rgba(255,255,255,0.07); }
                .jbs-uw-head { display:flex; align-items:center; gap:8px; padding:9px 14px; background:rgba(255,255,255,0.025); border-bottom:1px solid rgba(255,255,255,0.06); }
                .jbs-uw-title { font-size:10px; font-weight:700; color:#6b7a99; letter-spacing:.08em; text-transform:uppercase; }
                .jbs-uw-grid { display:grid; grid-template-columns:1fr 1fr; gap:0; }
                .jbs-uw-item { padding:9px 14px; border-bottom:1px solid rgba(255,255,255,0.04); border-right:1px solid rgba(255,255,255,0.04); }
                .jbs-uw-item:nth-child(even) { border-right:none; }
                .jbs-uw-item:nth-last-child(-n+2) { border-bottom:none; }
                .jbs-uw-criterion { font-size:10px; color:#3a4560; text-transform:uppercase; letter-spacing:.05em; font-weight:600; margin-bottom:3px; }
                .jbs-uw-val { font-size:12px; font-weight:700; color:#c4cfe0; }
                .jbs-uw-val.tight { color:#f59e0b; }
                .jbs-uw-val.ok { color:#00e87a; }

                /* breakdown */
                .jbs-bkd { border-top:1px solid rgba(255,255,255,0.05); }
                .jbs-bkd-toggle { width:100%; display:flex; align-items:center; justify-content:space-between; padding:10px 16px; background:transparent; border:none; cursor:pointer; font-family:inherit; }
                .jbs-bkd-label { font-size:12px; font-weight:600; color:#8fa3b8; }
                .jbs-bkd-chev { font-size:10px; color:#8fa3b8; transition:transform .2s; display:inline-block; transform:rotate(180deg); }
                .jbs-bkd-chev.open { transform:rotate(0deg); }
                .jbs-bkd-body { padding:0 16px 12px; }
                .jbs-kv { display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
                .jbs-kv--total { padding-top:8px; border-top:1px solid rgba(255,255,255,0.12); border-bottom:none; }
                .jbs-kv-k { font-size:12px; color:#8fa3b8; }
                .jbs-kv-v { font-size:12px; font-weight:600; color:#c4cfe0; }
                .jbs-kv-v--purple { color:#8b5cf6; }
                .jbs-kv-v--green  { color:#00e87a; }
                .jbs-kv-v--amber  { color:#f59e0b; }
                .jbs-kv--total .jbs-kv-k { font-weight:700; color:#c4cfe0; font-size:13px; }
                .jbs-kv--total .jbs-kv-v { font-weight:800; font-size:13px; }
                .jbs-kv-s { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#6b7a99; padding:10px 0 4px; }
                .jbs-kv-s:first-child { padding-top:4px; }

                /* explorer */
                .jbs-exp { padding:12px 16px; border-top:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.015); }
                .jbs-exp-head { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#6b7a99; margin-bottom:12px; }
                .jbs-dp-chips { display:flex; gap:6px; margin:-4px 0 6px; }
                .jbs-dp-chip { background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.1); border-radius:6px; padding:4px 10px; font-size:12px; font-weight:600; color:#8fa3b8; cursor:pointer; font-family:inherit; transition:all .15s; }
                .jbs-dp-chip.active { background:rgba(139,92,246,0.1); border-color:rgba(139,92,246,0.35); color:#8b5cf6; }
                .jbs-dp-chip:hover { border-color:rgba(255,255,255,0.25); color:#f0f4ff; }
                .jbs-dp-min-note { font-size:10px; color:#3a4560; margin:-2px 0 12px; }
                .jbs-exp-term-label { font-size:12px; font-weight:600; color:#c4cfe0; margin-bottom:6px; }
                .jbs-terms { display:flex; gap:6px; margin-bottom:14px; }
                .jbs-term { flex:1; background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.1); border-radius:8px; padding:7px 0; font-size:12px; font-weight:600; color:#8fa3b8; cursor:pointer; font-family:inherit; transition:all .15s; text-align:center; }
                .jbs-term--on { background:rgba(139,92,246,0.1); border-color:rgba(139,92,246,0.35); color:#8b5cf6; }
                .jbs-term:hover { border-color:rgba(255,255,255,0.25); color:#f0f4ff; }
                .jbs-exp-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:2px; margin-bottom:12px; }
                .jbs-exp-stat { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:8px; text-align:center; }
                .jbs-exp-stat-label { font-size:10px; color:#6b7a99; margin-bottom:3px; }
                .jbs-exp-stat-val { font-size:12px; font-weight:700; color:#c4cfe0; }

                /* actions */
                .jbs-exp-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
                .jbs-btn-rerun { background:#111827; color:#f9fafb; border:none; border-radius:8px; padding:10px 16px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:background .15s; }
                .jbs-btn-rerun:hover { background:#1f2937; }
                .jbs-btn-vault { display:flex; align-items:center; gap:5px; background:rgba(255,255,255,0.04); color:#8fa3b8; border:1.5px solid rgba(255,255,255,0.1); border-radius:8px; padding:9px 14px; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; transition:all .15s; }
                .jbs-btn-vault:hover { border-color:rgba(255,255,255,0.25); color:#f0f4ff; }
                .jbs-btn-match { margin-left:auto; background:#8b5cf6; color:#fff; border:none; border-radius:8px; padding:10px 22px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:opacity .15s; }
                .jbs-btn-match:hover { opacity:.88; }

                /* follow-up chip */
                .jbs-followup-row { display:flex; flex-wrap:wrap; gap:8px; padding:0 12px 10px; }
                .jbs-followup-chip { background:rgba(139,92,246,0.06); border:1.5px solid rgba(139,92,246,0.2); border-radius:20px; padding:7px 14px; font-size:12px; font-weight:600; color:#8b5cf6; cursor:pointer; font-family:inherit; transition:all .15s; }
                .jbs-followup-chip:hover { background:rgba(139,92,246,0.12); border-color:rgba(139,92,246,0.4); }
                .jbs-followup-chip--property { background:rgba(0,232,122,0.06); border-color:rgba(0,232,122,0.2); color:#00e87a; }
                .jbs-followup-chip--property:hover { background:rgba(0,232,122,0.12); border-color:rgba(0,232,122,0.4); }

                /* rate note */
                .jbs-rate-note { margin:0 12px 12px; background:rgba(139,92,246,0.04); border:1px solid rgba(139,92,246,0.12); border-radius:10px; padding:10px 14px; display:flex; align-items:flex-start; gap:10px; }
                .jbs-bulb { font-size:16px; flex-shrink:0; margin-top:1px; }
                .jbs-rate-note p { font-size:12px; color:#8fa3b8; line-height:1.5; }
                .jbs-rate-note strong { color:#8b5cf6; }

                /* disclosures */
                .jbs-disc { padding:0 16px 16px; }
                .jbs-disc p { font-size:10px; color:#3a4560; line-height:1.5; }

                @media (max-width: 480px) {
                    .jbs-hero-amount { font-size:34px; }
                    .jbs-exp-stats { grid-template-columns:repeat(2,1fr); }
                    .jbs-band-r { display:none; }
                    .jbs-uw-grid { grid-template-columns:1fr; }
                    .jbs-arm-compare { grid-template-columns:1fr; }
                }
            `}</style>
        </div>
    );
}
