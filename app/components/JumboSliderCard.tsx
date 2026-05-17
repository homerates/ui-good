'use client';

import React, { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import SliderField from './SliderField';
import PdfDownloadButton from './PdfDownloadButton';

// ── Constants ─────────────────────────────────────────────────────────────────

const NATIONAL_CONFORMING_2026 = 832750;
const HIGH_BAL_CA_MAX_2026     = 1249125;
const ARM_SPREAD               = 1.10;

// ── Zone config ───────────────────────────────────────────────────────────────

type LoanZone = 'conforming' | 'highbal' | 'jumbo';

const ZONE_MAP: Record<LoanZone, { label: string; icon: string; color: string; bg: string; border: string; note: string; res: number }> = {
    conforming: {
        label: 'Conforming', icon: '✓',
        color: '#00e87a', bg: 'rgba(0,232,122,0.07)', border: 'rgba(0,232,122,0.28)',
        note: 'Loan is at or below the 2026 conforming limit — a conventional loan may offer better pricing and reserve requirements.',
        res: 2,
    },
    highbal: {
        label: 'High-Balance', icon: '◈',
        color: '#ff8c42', bg: 'rgba(255,140,66,0.07)', border: 'rgba(255,140,66,0.28)',
        note: 'Loan falls in the high-balance zone — available in designated high-cost counties (SF Bay, LA, NYC) via Fannie/Freddie.',
        res: 4,
    },
    jumbo: {
        label: 'Jumbo', icon: '⬡',
        color: '#ff5f5f', bg: 'rgba(255,95,95,0.07)', border: 'rgba(255,95,95,0.28)',
        note: 'Portfolio / non-conforming loan. Portfolio lenders set their own guidelines. Shop 2–3 jumbo lenders — pricing, reserves, and qualifying criteria vary significantly.',
        res: 9,
    },
};

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
    rate:     number;
    term?:    number;
    taxRate:  number;
    insRate:  number;
    onRunScenario?: (seed: string, overrides: Record<string, any>) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function JumboSliderCard(props: JumboSliderParams) {
    const [price,    setPrice]    = useState(props.price);
    const [downPct,  setDownPct]  = useState(Math.max(20, props.downPct));
    const [rate,     setRate]     = useState(props.rate);
    const [termType, setTermType] = useState<TermType>(props.term === 15 ? '15yr' : '30yr');
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [vaultDone,  setVaultDone]  = useState(false);

    const { user } = useUser();
    const router   = useRouter();

    const DP_CHIPS = [20, 25, 30, 40] as const;

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
    const z    = ZONE_MAP[zone];

    // Crossover calculations
    const excessOverNational = Math.max(0, loanAmt - NATIONAL_CONFORMING_2026);
    const excessOverHighBal  = Math.max(0, loanAmt - HIGH_BAL_CA_MAX_2026);
    const downToConforming   = zone !== 'conforming' ? Math.max(0, (excessOverNational / price) * 100) : 0;
    const downToHighBal      = zone === 'jumbo' ? Math.max(0, (excessOverHighBal / price) * 100) : 0;
    const savingsConforming  = zone !== 'conforming' ? (NATIONAL_CONFORMING_2026 * 0.0040) : 0;
    const savingsHighBal     = zone === 'jumbo' ? (HIGH_BAL_CA_MAX_2026 * 0.0015) : 0;

    // ARM yr-8 projections
    const balYr8     = loanBalanceAfter(loanAmt, armRate, 360, 84);
    const adjRate1   = armRate + 2;
    const maxRate    = armRate + 5;
    const piAdj      = calcPI(balYr8, adjRate1, 276);
    const piMax      = calcPI(balYr8, maxRate, 276);
    const pitiMax    = piMax + monthlyTax + monthlyIns;
    const fixedPITI  = calcPI(loanAmt, rate, 30) + monthlyTax + monthlyIns;
    const armSaveMonthly = fixedPITI - total;
    const armSave7yr = armSaveMonthly * 84;

    const totalInterest   = (monthlyPI * termYrs * 12) - loanAmt;
    const totalPIPayments = monthlyPI * termYrs * 12;

    // DTI income
    const income43 = (total / 0.43) * 12;
    const income36 = (total / 0.36) * 12;
    const income50 = (total / 0.50) * 12;

    // ── Actions ────────────────────────────────────────────────────────────────

    async function handleVault() {
        if (!user) { router.push('/sign-up'); return; }
        try {
            await fetch('/api/library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: `Jumbo Purchase: ${fmtM(price)} · ${downPct}% down · ${rate.toFixed(2)}% · ${termYrs}yr`,
                    answer: `Total/mo: ${fmt$(Math.round(total))} · PITI · Loan: ${fmt$(Math.round(loanAmt))}`,
                    tool_id: 'vault_save_jumbo',
                }),
            });
            setVaultDone(true);
        } catch { /* non-fatal */ }
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

    function handleRun() {
        if (!props.onRunScenario) return;
        props.onRunScenario(
            `Jumbo loan on a ${fmtM(price)} home, ${downPct}% down at ${rate.toFixed(3)}% — ${termYrs}yr ${termType === 'arm7' ? '7/1 ARM' : 'fixed'}`,
            { purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate, termYears: termYrs, loanType: 'jumbo' },
        );
    }

    function handleCheckProperty() {
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
    }

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="jbs" style={{ '--jbs-color': z.color, '--jbs-bg': z.bg, '--jbs-border': z.border } as React.CSSProperties}>

            {/* Header */}
            <div className="jbs-header">
                <div className="jbs-header-left">
                    <span className="jbs-title">Jumbo Purchase</span>
                    <span className="jbs-sub">{fmtM(price)} · {downPct}% down · {effRate.toFixed(3)}% · {termType === 'arm7' ? '7/1 ARM' : `${termYrs}yr Fixed`}</span>
                </div>
                <span className="jbs-zone-badge">{z.icon} {z.label}</span>
            </div>

            {/* Hero */}
            <div className="jbs-hero">
                <div className="jbs-hero-main">
                    <div className="jbs-hero-piti">
                        {fmt$(Math.round(total))}<span className="jbs-hero-mo">/mo</span>
                    </div>
                    <div className="jbs-hero-lbl">{termType === 'arm7' ? 'Monthly PITI (ARM Yr 1–7)' : 'Estimated Monthly PITI'}</div>
                </div>
                <div className="jbs-hero-stat">
                    <div className="jbs-hero-sv">{fmtM(loanAmt)}</div>
                    <div className="jbs-hero-sl">Loan Amount</div>
                </div>
                <div className="jbs-hero-stat">
                    <div className="jbs-hero-sv">{ltv.toFixed(1)}%</div>
                    <div className="jbs-hero-sl">LTV</div>
                </div>
            </div>

            {/* Monthly Breakdown */}
            <div className="jbs-div" />
            <div className="jbs-sec">Monthly Breakdown</div>
            <div className="jbs-bd">
                <div className="jbs-bd-row"><span className="jbs-bd-lbl">Principal &amp; Interest{termType === 'arm7' ? ` (${effRate.toFixed(3)}% ARM initial)` : ''}</span><span className="jbs-bd-val">{fmt$(Math.round(monthlyPI))}</span></div>
                <div className="jbs-bd-row"><span className="jbs-bd-lbl">Property Taxes (est. {(props.taxRate * 100).toFixed(1)}%/yr)</span><span className="jbs-bd-val">{fmt$(Math.round(monthlyTax))}</span></div>
                <div className="jbs-bd-row"><span className="jbs-bd-lbl">Home Insurance (est. {(props.insRate * 100).toFixed(1)}%/yr)</span><span className="jbs-bd-val">{fmt$(Math.round(monthlyIns))}</span></div>
                <div className="jbs-bd-row"><span className="jbs-bd-lbl">PMI</span><span className="jbs-bd-val-green">None ({downPct}% down)</span></div>
                <div className="jbs-bd-total"><span>Total Monthly PITI</span><span className="jbs-bd-total-val">{fmt$(Math.round(total))}</span></div>
            </div>

            {/* Adjust Your Numbers */}
            <div className="jbs-div" />
            <div className="jbs-sec">Adjust Your Numbers</div>
            <div className="jbs-sliders">
                <div className="jbs-slider-wrap">
                    <SliderField label="Home Price" value={price} min={500_000} max={25_000_000} step={25_000}
                        onChange={setPrice} format={v => fmtM(v)}
                        parse={v => { const c = v.replace(/[$,\s]/g, ''); const n = parseFloat(c); if (isNaN(n)) return price; return c.toLowerCase().includes('m') ? n * 1_000_000 : n; }}
                        minLabel="$500k" maxLabel="$25M+" trackColor={z.color} theme="dark" />
                </div>
                <div className="jbs-slider-wrap">
                    <SliderField label="Down Payment" value={downPct} min={20} max={60} step={1}
                        onChange={setDownPct} format={v => `${v}% · ${fmtM(price * v / 100)}`}
                        minLabel="20%" maxLabel="60%" trackColor={z.color} theme="dark" />
                    <div className="jbs-dp-chips">
                        {DP_CHIPS.map(pct => (
                            <button key={pct} className={`jbs-dp-chip${Math.round(downPct) === pct ? ' active' : ''}`} onClick={() => setDownPct(pct)}>{pct}%</button>
                        ))}
                    </div>
                    <div className="jbs-dp-note">Jumbo minimum: 20% down · 25% preferred by most lenders · No PMI required</div>
                </div>
                <div className="jbs-slider-wrap">
                    <SliderField label="Interest Rate" value={rate} min={3} max={12} step={0.125}
                        onChange={setRate}
                        format={v => { const s = parseFloat(v.toFixed(3)) + '%'; return termType === 'arm7' ? `${s} → ARM ${Math.max(3, v - ARM_SPREAD).toFixed(3)}%` : s; }}
                        minLabel="3%" maxLabel="12%" midLabel={`FRED: ${props.rate.toFixed(2)}%`}
                        trackColor={z.color} theme="dark" />
                    <div className="jbs-fred-tag">📡 Seeded from FRED live rate: {props.rate.toFixed(3)}%</div>
                </div>
                <div className="jbs-term-label">Loan Term</div>
                <div className="jbs-terms">
                    {(['15yr', '30yr', 'arm7'] as const).map(t => (
                        <button key={t} className={`jbs-term${termType === t ? ' jbs-term--on' : ''}`} onClick={() => setTermType(t)}>
                            {t === '15yr' ? '15yr Fixed' : t === '30yr' ? '30yr Fixed' : '7/1 ARM'}
                        </button>
                    ))}
                </div>
            </div>

            {/* ARM analysis — inline when ARM selected */}
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
                            { k: 'Initial rate (years 1–7)',             v: `${effRate.toFixed(3)}% (SOFR-indexed)`,         warn: false },
                            { k: 'Caps · 2/2/5 structure',               v: 'First +2% · Per-period +2% · Lifetime +5%',     warn: false },
                            { k: 'Year 8 adjusted rate (first +2% cap)', v: `${adjRate1.toFixed(3)}%`,                       warn: true  },
                            { k: 'Year 8 P&I at first cap',              v: `~${fmt$(Math.round(piAdj))}/mo`,                warn: true  },
                            { k: 'Maximum rate (lifetime +5%)',          v: `${maxRate.toFixed(3)}%`,                        warn: true  },
                            { k: 'P&I at maximum rate',                  v: `~${fmt$(Math.round(piMax))}/mo`,                warn: true  },
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

            {/* What Income Do I Need to Qualify? */}
            <div className="jbs-div" />
            <div className="jbs-sec">What Income Do I Need to Qualify?</div>
            <div className="jbs-income">
                <div className="jbs-income-row"><span className="jbs-income-lbl">36% DTI — Conservative</span><span className="jbs-income-val">{fmt$(Math.round(income36 / 1000) * 1000)}/yr</span></div>
                <div className="jbs-income-row"><span className="jbs-income-lbl">43% DTI — Standard</span><span className="jbs-income-val">{fmt$(Math.round(income43 / 1000) * 1000)}/yr</span></div>
                <div className="jbs-income-row jbs-income-row--dim"><span className="jbs-income-lbl">50% DTI — Stretch</span><span className="jbs-income-val">{fmt$(Math.round(income50 / 1000) * 1000)}/yr</span></div>
            </div>

            {/* CTAs */}
            <div className="jbs-cta-row">
                <button className="jbs-btn-check" onClick={handleCheckProperty}>Check Property ↗</button>
                {props.onRunScenario && <button className="jbs-btn-run" onClick={handleRun}>Run My Numbers →</button>}
            </div>
            <div className="jbs-cta-full">
                <button className="jbs-btn-get-matched" onClick={() => router.push(getMatchedUrl())}>
                    Get Matched with Jumbo Specialists →
                </button>
            </div>

            {/* Cross-fire chip — HB range: suggest running the conventional HB card for comparison */}
            {props.onRunScenario && zone === 'highbal' && (
                <div className="jbs-xchip-row">
                    <button
                        className="jbs-xchip"
                        onClick={() => props.onRunScenario!(
                            `Compare this as a High Balance conventional loan — ${fmtM(price)} home, ${downPct}% down at ${rate.toFixed(2)}% — what does a High Balance conventional look like vs. jumbo?`,
                            { isConvHB: true, purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate }
                        )}
                    >
                        ⇄ Compare High Balance conventional rates
                    </button>
                </div>
            )}

            {/* Drawer trigger */}
            <button className={`jbs-dtrigger${drawerOpen ? ' open' : ''}`} onClick={() => setDrawerOpen(o => !o)}>
                <span className="jbs-dtrigger-lbl">Loan Zone · Reserves · Underwriting · Full Summary</span>
                <span className="jbs-dtrigger-chev">▼</span>
            </button>

            {/* Deep drawer */}
            <div className={`jbs-ddrawn${drawerOpen ? ' open' : ''}`}>
                <div style={{ padding: '0 0 28px' }}>

                    {/* Zone detail */}
                    <div className="jbs-dsec">
                        <div className="jbs-dsec-lbl">Loan Zone</div>
                        <div className="jbs-zone-detail" style={{ background: z.bg, border: `1px solid ${z.border}` }}>
                            <div className="jbs-zone-detail-hdr" style={{ color: z.color }}>{z.icon} {z.label} Loan · {fmtM(loanAmt)}</div>
                            <div className="jbs-zone-detail-note">{z.note}</div>
                        </div>
                        <div className="jbs-xblock">
                            {downToHighBal > 0.05 && (
                                <div className="jbs-xitem"><strong style={{ color: '#ff8c42' }}>High-Balance crossover:</strong> Add {downToHighBal.toFixed(2)}% more down (loan → {fmt$(HIGH_BAL_CA_MAX_2026)} max) — saves <strong style={{ color: '#00e87a' }}>{fmt$(Math.round(savingsHighBal))}/yr</strong> in rate premium.</div>
                            )}
                            {downToConforming > 0.05 && (
                                <div className="jbs-xitem"><strong style={{ color: '#00e87a' }}>Conforming crossover:</strong> Add {downToConforming.toFixed(2)}% more down (loan → {fmt$(NATIONAL_CONFORMING_2026)} limit) — saves <strong style={{ color: '#00e87a' }}>{fmt$(Math.round(savingsConforming))}/yr</strong> in rate premium.</div>
                            )}
                            {downToHighBal <= 0.05 && downToConforming <= 0.05 && (
                                <div className="jbs-xitem" style={{ color: 'rgba(185,208,192,0.38)' }}>No crossover opportunity at current price &amp; down payment.</div>
                            )}
                        </div>
                    </div>

                    {/* Reserves */}
                    <div className="jbs-dsec">
                        <div className="jbs-dsec-lbl">Cash Reserves Required by Lenders</div>
                        <div className="jbs-dres">
                            <div className="jbs-dres-row">
                                <div className="jbs-dres-lbl">6-Month Reserves (minimum)<small>Must remain in account after closing — cannot be gifted</small></div>
                                <div className="jbs-dres-val">{fmt$(Math.round(reserves6mo))}</div>
                            </div>
                            <div className="jbs-dres-row">
                                <div className="jbs-dres-lbl">12-Month Reserves (preferred &gt;$1M)<small>Higher loan amounts typically require 12 months documented</small></div>
                                <div className="jbs-dres-val">{fmt$(Math.round(reserves12mo))}</div>
                            </div>
                        </div>
                        <div className="jbs-dres-note">
                            💡 Reserves are <strong>in addition to</strong> your down payment and closing costs. Expect approximately <strong>{fmtM(Math.round(totalAssetsLo / 5000) * 5000)}–{fmtM(Math.round(totalAssetsHi / 5000) * 5000)} total liquid assets</strong> required at closing.
                        </div>
                    </div>

                    {/* Underwriting */}
                    <div className="jbs-dsec">
                        <div className="jbs-dsec-lbl">Jumbo Underwriting Standards</div>
                        <div className="jbs-uw-grid">
                            {([
                                { k: 'Min Credit Score',       v: '720+ (740+ preferred)',                                                                              cls: 'ok'                        },
                                { k: 'Max Back-End DTI',       v: '43% (some lenders 45%)',                                                                             cls: 'warn'                      },
                                { k: 'Down Payment',           v: downPct >= 30 ? `${downPct}% — strong` : downPct >= 25 ? '25% — most lenders preferred' : '20% min · 25% preferred', cls: downPct >= 25 ? 'ok' : 'warn' },
                                { k: 'PMI',                    v: 'None — 20%+ required',                                                                               cls: 'ok'                        },
                                { k: 'Income Documentation',   v: '2 yrs W-2 or tax returns',                                                                           cls: ''                          },
                                { k: 'Appraisal',              v: price >= 1_500_000 ? '2 appraisals often required' : 'Single appraisal standard',                    cls: price >= 1_500_000 ? 'warn' : '' },
                            ] as { k: string; v: string; cls: string }[]).map(({ k, v, cls }) => (
                                <div key={k} className="jbs-uw-item">
                                    <div className="jbs-uw-k">{k}</div>
                                    <div className={`jbs-uw-v${cls ? ` ${cls}` : ''}`}>{v}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Full Summary */}
                    <div className="jbs-dsec">
                        <div className="jbs-dsec-lbl">Full Loan Summary</div>
                        <div style={{ marginTop: 8 }}>
                            {([
                                { lbl: 'Purchase Price',                                     val: fmt$(Math.round(price)) },
                                { lbl: `Down Payment (${downPct}%)`,                         val: fmt$(Math.round(downAmt)) },
                                { lbl: 'Loan Amount',                                        val: fmt$(Math.round(loanAmt)) },
                                { lbl: 'LTV',                                                val: `${ltv.toFixed(1)}%` },
                                { lbl: 'Rate',                                               val: `${effRate.toFixed(3)}%` },
                                { lbl: 'Est. Closing Costs (2%)',                            val: fmt$(Math.round(closingEst)) },
                                { lbl: `Total Interest (${termYrs}yr)`,                      val: `est. ${fmt$(Math.round(totalInterest))}` },
                                { lbl: `Total P&I Payments (${termYrs}yr)`,                  val: fmt$(Math.round(totalPIPayments)) },
                            ] as { lbl: string; val: string }[]).map(({ lbl, val }) => (
                                <div key={lbl} className="jbs-sum-row">
                                    <span className="jbs-sum-lbl">{lbl}</span>
                                    <span className="jbs-sum-val">{val}</span>
                                </div>
                            ))}
                            <div className="jbs-sum-total">
                                <span>Total Cash at Closing</span>
                                <span className="jbs-sum-total-val">{fmt$(Math.round(downAmt + closingEst + reserves6mo))}</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* ════ PERMANENT BOTTOM ════ */}
            <div className="jbs-perm">
                <div className="jbs-sec" style={{ paddingTop: 18 }}>Save This Scenario</div>
                <div className="jbs-vault-row">
                    <button className="jbs-btn-vault-new" onClick={handleVault}>{vaultDone ? '✓ Saved' : '⭐ Save to My Vault'}</button>
                    <div style={{ display: 'flex' }}>
                        <PdfDownloadButton
                            type="jumbo"
                            getParams={() => ({ price, downPct, rate, term: termYrs, taxRate: props.taxRate, insRate: props.insRate, loanType: 'jumbo' })}
                        />
                    </div>
                </div>
                <div className="jbs-rate-note-new">
                    <span className="jbs-bulb">💡</span>
                    <p>
                        <strong>Rate seeded from live FRED 30yr avg.</strong> Jumbo loans for well-qualified borrowers (720+ credit, 20%+ down, strong reserves) often price at par with or below conforming rates — portfolio lenders compete aggressively for high-net-worth clients.
                        {termType === 'arm7' && <> 7/1 ARM rate reflects SOFR-indexed pricing, typically ~{ARM_SPREAD.toFixed(2)}% below 30yr fixed at origination.</>}
                    </p>
                </div>
                <div className="jbs-disc-new">
                    <strong>⚠️ Educational estimates only.</strong> A &quot;jumbo&quot; loan exceeds the 2026 FHFA conforming baseline of {fmt$(NATIONAL_CONFORMING_2026)} for a 1-unit standard-cost area residence. High-balance counties may have limits up to {fmt$(HIGH_BAL_CA_MAX_2026)}. Property tax estimated at {(props.taxRate * 100).toFixed(1)}% annually; insurance at {(props.insRate * 100).toFixed(1)}% annually. Reserve calculations based on 6× and 12× total monthly PITI. 7/1 ARM caps shown as 2/2/5 (typical; actual caps vary by lender). These figures are not a pre-approval or commitment to lend.
                </div>
            </div>

            {/* ── Styles ── */}
            <style>{`
                .jbs {
                    background: #0e1420;
                    border: 1px solid var(--jbs-border, rgba(255,255,255,0.08));
                    border-radius: 18px;
                    overflow: clip;
                    font-family: var(--font-dm-sans, "DM Sans", system-ui, sans-serif);
                    color: #f0f4ff;
                    transition: border-color 0.3s;
                }

                /* header */
                .jbs-header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px 0; }
                .jbs-header-left { display:flex; flex-direction:column; gap:3px; }
                .jbs-title { font-size:0.72rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:rgba(185,208,192,0.55); }
                .jbs-sub { font-size:0.72rem; color:rgba(185,208,192,0.35); font-weight:400; }
                .jbs-zone-badge { display:inline-flex; align-items:center; gap:6px; background:var(--jbs-bg); border:1px solid var(--jbs-border); border-radius:20px; padding:4px 12px; font-size:0.78rem; font-weight:700; color:var(--jbs-color); flex-shrink:0; transition:all 0.25s; }

                /* hero */
                .jbs-hero { display:grid; grid-template-columns:1.4fr 1fr 1fr; gap:10px; padding:14px 20px 0; }
                .jbs-hero-main { background:rgba(255,255,255,0.04); border-radius:12px; padding:16px 12px; text-align:center; min-width:0; }
                .jbs-hero-stat { background:rgba(255,255,255,0.04); border-radius:12px; padding:14px 12px; text-align:center; min-width:0; }
                .jbs-hero-piti { font-size:clamp(1.5rem,5vw,2rem); font-weight:800; line-height:1; color:var(--jbs-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                .jbs-hero-mo { font-size:0.65em; font-weight:600; opacity:0.7; }
                .jbs-hero-lbl { font-size:0.62rem; color:rgba(185,208,192,0.5); margin-top:5px; text-transform:uppercase; letter-spacing:0.04em; }
                .jbs-hero-sv { font-size:clamp(1.05rem,3.5vw,1.3rem); font-weight:800; color:#f0f4ff; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                .jbs-hero-sl { font-size:0.62rem; color:rgba(185,208,192,0.5); margin-top:5px; text-transform:uppercase; letter-spacing:0.04em; }

                /* crossover strip */
                .jbs-xstrip { margin:12px 20px 0; background:rgba(255,140,66,0.07); border:1px solid rgba(255,140,66,0.25); border-radius:10px; padding:9px 14px; font-size:0.8rem; color:rgba(185,208,192,0.9); display:flex; gap:8px; align-items:flex-start; line-height:1.5; }

                /* divider + section label */
                .jbs-div { height:1px; background:rgba(255,255,255,0.06); margin:16px 20px 0; }
                .jbs-sec { font-size:0.68rem; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; color:rgba(185,208,192,0.45); padding:14px 20px 0; }

                /* breakdown */
                .jbs-bd { padding:8px 20px 0; }
                .jbs-bd-row { display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.84rem; }
                .jbs-bd-row:last-child { border-bottom:none; }
                .jbs-bd-lbl { color:rgba(185,208,192,0.75); }
                .jbs-bd-val { font-weight:600; color:#f0f4ff; }
                .jbs-bd-val-green { font-weight:600; color:#00e87a; }
                .jbs-bd-total { display:flex; justify-content:space-between; align-items:center; padding:10px 0 0; font-size:0.9rem; font-weight:700; margin-top:4px; border-top:1px solid rgba(255,255,255,0.1); }
                .jbs-bd-total-val { font-size:1.05rem; font-weight:800; color:var(--jbs-color); }

                /* sliders */
                .jbs-sliders { padding:6px 20px 0; }
                .jbs-slider-wrap { margin-bottom:16px; }
                .jbs-dp-chips { display:flex; gap:6px; margin-top:8px; }
                .jbs-dp-chip { flex:1; padding:5px 0; border-radius:7px; font-size:0.78rem; font-weight:700; cursor:pointer; text-align:center; background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.1); color:rgba(185,208,192,0.6); font-family:inherit; transition:all 0.15s; }
                .jbs-dp-chip:hover { border-color:rgba(255,255,255,0.25); color:#f0f4ff; }
                .jbs-dp-chip.active { background:var(--jbs-bg); border-color:var(--jbs-color); color:var(--jbs-color); }
                .jbs-dp-note { font-size:0.7rem; color:rgba(185,208,192,0.38); margin-top:6px; }
                .jbs-fred-tag { display:inline-flex; align-items:center; gap:4px; background:rgba(61,139,255,0.1); border:1px solid rgba(61,139,255,0.25); border-radius:6px; padding:3px 8px; font-size:0.7rem; color:#3d8bff; font-weight:600; margin-top:6px; }
                .jbs-term-label { font-size:0.82rem; font-weight:600; color:rgba(185,208,192,0.8); padding:2px 20px 0; margin-bottom:-4px; }
                .jbs-terms { display:flex; gap:8px; padding:10px 20px 0; }
                .jbs-term { flex:1; background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.1); border-radius:8px; padding:8px 0; font-size:0.82rem; font-weight:600; color:rgba(185,208,192,0.7); cursor:pointer; font-family:inherit; transition:all 0.15s; text-align:center; }
                .jbs-term--on { background:var(--jbs-bg); border-color:var(--jbs-color); color:var(--jbs-color); }
                .jbs-term:hover { border-color:rgba(255,255,255,0.25); color:#f0f4ff; }

                /* ARM disclosure */
                .jbs-arm { margin:12px 20px 0; border-radius:12px; overflow:hidden; border:1px solid var(--jbs-border); }
                .jbs-arm-head { display:flex; align-items:center; gap:8px; padding:9px 14px; background:var(--jbs-bg); border-bottom:1px solid var(--jbs-border); }
                .jbs-arm-icon { font-size:14px; }
                .jbs-arm-title { font-size:11px; font-weight:700; color:var(--jbs-color); letter-spacing:.04em; text-transform:uppercase; }
                .jbs-arm-body { padding:12px 14px; background:#080c12; }
                .jbs-arm-compare { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; }
                .jbs-arm-col { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:10px 12px; }
                .jbs-arm-col--on { background:var(--jbs-bg); border-color:var(--jbs-border); }
                .jbs-arm-col-label { font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#6b7a99; margin-bottom:6px; }
                .jbs-arm-col--on .jbs-arm-col-label { color:var(--jbs-color); }
                .jbs-arm-col-amount { font-size:20px; font-weight:800; color:#c4cfe0; letter-spacing:-0.5px; }
                .jbs-arm-col--on .jbs-arm-col-amount { color:var(--jbs-color); }
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

                /* income */
                .jbs-income { padding:8px 20px 0; }
                .jbs-income-row { display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.84rem; }
                .jbs-income-row--dim { border-bottom:none; }
                .jbs-income-row--dim .jbs-income-lbl, .jbs-income-row--dim .jbs-income-val { color:rgba(185,208,192,0.38); font-weight:400; }
                .jbs-income-lbl { color:rgba(185,208,192,0.75); }
                .jbs-income-val { font-weight:600; color:#f0f4ff; }

                /* CTAs */
                .jbs-cta-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:16px 20px 0; }
                .jbs-btn-check { padding:11px 8px; border-radius:10px; font-size:0.82rem; font-weight:700; cursor:pointer; text-align:center; background:rgba(61,139,255,0.1); border:1px solid rgba(61,139,255,0.25); color:#3d8bff; font-family:inherit; transition:opacity 0.15s; }
                .jbs-btn-run { padding:11px 8px; border-radius:10px; font-size:0.82rem; font-weight:700; cursor:pointer; text-align:center; background:var(--jbs-color); border:none; color:#fff; font-family:inherit; transition:opacity 0.15s; }
                .jbs-btn-check:hover, .jbs-btn-run:hover { opacity:0.82; }
                .jbs-cta-full { padding:10px 20px 0; }
                .jbs-btn-get-matched { width:100%; padding:11px 8px; border-radius:10px; font-size:0.82rem; font-weight:700; cursor:pointer; text-align:center; background:transparent; border:1px solid rgba(255,255,255,0.14); color:rgba(185,208,192,0.8); font-family:inherit; transition:opacity 0.15s; }
                .jbs-btn-get-matched:hover { opacity:0.82; }

                /* cross-fire chip */
                .jbs-xchip-row { padding:8px 20px 0; }
                .jbs-xchip { width:100%; padding:10px 14px; border-radius:10px; font-size:0.8rem; font-weight:600; cursor:pointer; text-align:center; background:rgba(255,140,66,0.07); border:1px solid rgba(255,140,66,0.25); color:#ff8c42; font-family:inherit; transition:opacity 0.15s; }
                .jbs-xchip:hover { opacity:0.82; }

                /* drawer trigger */
                .jbs-dtrigger { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:14px 20px 0; padding:13px 20px; cursor:pointer; font-size:0.84rem; color:var(--jbs-color); background:var(--jbs-bg); border:1.5px solid var(--jbs-border); border-radius:12px; font-family:inherit; width:calc(100% - 40px); user-select:none; transition:all 0.18s; }
                .jbs-dtrigger:hover { opacity:0.85; }
                .jbs-dtrigger-lbl { font-weight:700; letter-spacing:0.01em; }
                .jbs-dtrigger-chev { font-size:0.7rem; opacity:0.7; transition:transform 0.25s; display:inline-block; }
                .jbs-dtrigger.open .jbs-dtrigger-chev { transform:rotate(180deg); }

                /* deep drawer */
                .jbs-ddrawn { max-height:0; overflow:hidden; transition:max-height 0.38s ease; background:#080c12; }
                .jbs-ddrawn.open { max-height:1600px; }
                .jbs-dsec { padding:14px 20px 0; }
                .jbs-dsec-lbl { font-size:0.68rem; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; color:rgba(185,208,192,0.4); margin-bottom:8px; }
                .jbs-zone-detail { border-radius:10px; padding:12px 14px; }
                .jbs-zone-detail-hdr { font-size:0.85rem; font-weight:700; margin-bottom:6px; }
                .jbs-zone-detail-note { font-size:0.8rem; color:rgba(185,208,192,0.8); line-height:1.55; }
                .jbs-xblock { margin-top:10px; display:flex; flex-direction:column; gap:8px; }
                .jbs-xitem { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:9px 12px; font-size:0.8rem; color:rgba(185,208,192,0.85); line-height:1.55; }

                /* reserves in drawer */
                .jbs-dres { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:10px; overflow:hidden; margin-top:8px; }
                .jbs-dres-row { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.05); }
                .jbs-dres-row:last-child { border-bottom:none; }
                .jbs-dres-lbl { font-size:0.8rem; color:rgba(185,208,192,0.75); }
                .jbs-dres-lbl small { font-size:0.7rem; color:rgba(185,208,192,0.38); display:block; margin-top:2px; }
                .jbs-dres-val { font-size:0.85rem; font-weight:700; color:var(--jbs-color); white-space:nowrap; }
                .jbs-dres-note { margin-top:8px; border-radius:8px; padding:9px 12px; font-size:0.78rem; line-height:1.5; background:var(--jbs-bg); border:1px solid var(--jbs-border); color:rgba(185,208,192,0.75); }
                .jbs-dres-note strong { color:var(--jbs-color); }

                /* underwriting in drawer */
                .jbs-uw-grid { display:grid; grid-template-columns:1fr 1fr; gap:0; margin-top:8px; border:1px solid rgba(255,255,255,0.07); border-radius:10px; overflow:hidden; }
                .jbs-uw-item { padding:9px 14px; border-bottom:1px solid rgba(255,255,255,0.04); border-right:1px solid rgba(255,255,255,0.04); }
                .jbs-uw-item:nth-child(even) { border-right:none; }
                .jbs-uw-item:nth-last-child(-n+2) { border-bottom:none; }
                .jbs-uw-k { font-size:0.68rem; color:rgba(185,208,192,0.4); text-transform:uppercase; letter-spacing:0.05em; font-weight:600; margin-bottom:3px; }
                .jbs-uw-v { font-size:0.8rem; font-weight:700; color:#c4cfe0; }
                .jbs-uw-v.ok { color:#00e87a; }
                .jbs-uw-v.warn { color:#f59e0b; }

                /* full summary in drawer */
                .jbs-sum-row { display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.83rem; }
                .jbs-sum-row:last-child { border-bottom:none; }
                .jbs-sum-lbl { color:rgba(185,208,192,0.7); }
                .jbs-sum-val { font-weight:600; color:#f0f4ff; }
                .jbs-sum-total { display:flex; justify-content:space-between; padding:10px 0 0; border-top:1px solid rgba(255,255,255,0.1); font-size:0.9rem; font-weight:700; margin-top:4px; }
                .jbs-sum-total-val { font-size:1rem; font-weight:800; color:var(--jbs-color); }

                /* permanent bottom */
                .jbs-perm { padding-bottom:20px; }
                .jbs-vault-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:10px 20px 0; }
                .jbs-btn-vault-new { padding:11px 8px; border-radius:10px; font-size:0.82rem; font-weight:700; cursor:pointer; text-align:center; background:rgba(61,139,255,0.1); border:1px solid rgba(61,139,255,0.25); color:#3d8bff; font-family:inherit; width:100%; transition:opacity 0.15s; }
                .jbs-btn-vault-new:hover { opacity:0.82; }
                .jbs-rate-note-new { margin:12px 20px 0; background:rgba(61,139,255,0.05); border:1px solid rgba(61,139,255,0.15); border-radius:8px; padding:10px 12px; display:flex; align-items:flex-start; gap:8px; }
                .jbs-bulb { font-size:16px; flex-shrink:0; margin-top:1px; }
                .jbs-rate-note-new p { font-size:0.75rem; color:rgba(185,208,192,0.65); line-height:1.55; }
                .jbs-rate-note-new strong { color:rgba(185,208,192,0.9); }
                .jbs-disc-new { margin:12px 20px 0; padding:12px 14px; background:rgba(255,255,255,0.02); border-radius:8px; font-size:0.71rem; color:rgba(185,208,192,0.38); line-height:1.65; border:1px solid rgba(255,255,255,0.05); }
                .jbs-disc-new strong { color:rgba(185,208,192,0.55); }
                .jbs-share { padding:14px 20px 0; }
                .jbs-btn-share { width:100%; background:transparent; border:1px solid rgba(255,255,255,0.11); border-radius:10px; padding:11px; color:rgba(185,208,192,0.6); font-size:0.82rem; font-weight:600; cursor:pointer; font-family:inherit; display:flex; align-items:center; justify-content:center; gap:7px; transition:border-color 0.15s, color 0.15s; }
                .jbs-btn-share:hover { border-color:rgba(255,255,255,0.28); color:#f0f4ff; }

                @media (max-width: 480px) {
                    .jbs-hero { grid-template-columns:1.6fr 1fr 1fr; }
                    .jbs-hero-piti { font-size:clamp(0.95rem,3.5vw,1.3rem); }
                    .jbs-uw-grid { grid-template-columns:1fr; }
                    .jbs-uw-item:nth-child(even) { border-right:none; }
                    .jbs-uw-item:nth-last-child(-n+2) { border-bottom:1px solid rgba(255,255,255,0.04); }
                    .jbs-uw-item:last-child { border-bottom:none; }
                    .jbs-arm-compare { grid-template-columns:1fr; }
                }
                @media (max-width: 640px) {
                    .jbs-cta-row { grid-template-columns:1fr; }
                    .jbs-vault-row { grid-template-columns:1fr; }
                }
            `}</style>
        </div>
    );
}
