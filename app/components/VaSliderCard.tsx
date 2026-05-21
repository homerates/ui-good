'use client';

import React, { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import SliderField from './SliderField';
import PdfDownloadButton from './PdfDownloadButton';

// ── Residual income tables (VA Pamphlet 26-7 Table 41(a)) ────────────────────
// Loan ≥ $80k · Continental US · indexed by household size (1–5)
const RESIDUAL: Record<string, number[]> = {
    West:          [0, 491, 823, 990, 1117, 1158],
    Northeast:     [0, 450, 755, 909, 1025, 1062],
    'South/Midwest': [0, 441, 738, 889, 1003, 1039],
};

// ── Funding fee tiers ─────────────────────────────────────────────────────────
type FFTier = 'exempt' | '1.25' | '1.5' | '2.15' | '3.3';

const FF_OPTS: { label: string; val: FFTier; pct: number; note: string }[] = [
    { label: 'Exempt', val: 'exempt', pct: 0,    note: '10%+ disability rating' },
    { label: '1.25%',  val: '1.25',  pct: 1.25, note: '≥10% down — 1st use' },
    { label: '1.50%',  val: '1.5',   pct: 1.5,  note: '5–9.99% down — 1st use' },
    { label: '2.15%',  val: '2.15',  pct: 2.15, note: '<5% down — 1st use' },
    { label: '3.30%',  val: '3.3',   pct: 3.3,  note: '<5% down — subsequent use' },
];

function pctToTier(pct: number | undefined): FFTier {
    if (pct === 0)    return 'exempt';
    if (pct === 1.25) return '1.25';
    if (pct === 1.5)  return '1.5';
    if (pct === 3.3)  return '3.3';
    return '2.15';
}

// ── Math ──────────────────────────────────────────────────────────────────────

function calcPI(principal: number, annualRate: number, termYears: number): number {
    if (principal <= 0) return 0;
    if (annualRate <= 0) return principal / (termYears * 12);
    const r = annualRate / 100 / 12;
    const n = termYears * 12;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

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

export interface VaSliderParams {
    price:            number;
    downPct:          number;
    rate:             number;
    term:             number;
    taxRate:          number;
    insRate:          number;
    vaFundingFeePct?: number;  // 0 = exempt; undefined → default 2.15%
    monthlyDebts?:    number;
    onRunScenario?:   (seed: string, overrides: Record<string, unknown>) => void;
}

const DP_CHIPS = [0, 5, 10, 20] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function VaSliderCard(props: VaSliderParams) {
    const [price,      setPrice]      = useState(props.price);
    const [downPct,    setDownPct]    = useState(props.downPct);
    const [rate,       setRate]       = useState(props.rate);
    const [termYrs,    setTermYrs]    = useState(props.term);
    const [ffTier,     setFfTier]     = useState<FFTier>(pctToTier(props.vaFundingFeePct));
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [vaultDone,  setVaultDone]  = useState(false);
    const [debts,      setDebts]      = useState(props.monthlyDebts ?? 0);

    const { user } = useUser();
    const router   = useRouter();

    // ── Derived values ────────────────────────────────────────────────────────

    const ffPct       = FF_OPTS.find(o => o.val === ffTier)!.pct;
    const downAmt     = price * downPct / 100;
    const baseLoan    = price - downAmt;
    const fundingFee  = ffPct > 0 ? Math.round(baseLoan * ffPct / 100) : 0;
    const loanAmt     = baseLoan + fundingFee;
    const ltv         = (baseLoan / price) * 100;
    const pi          = Math.round(calcPI(loanAmt, rate, termYrs));
    const tax         = Math.round((price * props.taxRate) / 12);
    const ins         = Math.round((price * props.insRate) / 12);
    const piti        = pi + tax + ins;

    // PMI equivalent at 0.8%/yr — used for No-PMI savings callout
    const pmiMo       = Math.round(baseLoan * 0.008 / 12);

    const totalObligation = piti + debts;
    const q41         = Math.round((totalObligation / 0.41) * 12);
    const q43         = Math.round((totalObligation / 0.43) * 12);

    const totalPmts   = Math.round(piti * termYrs * 12);
    const totalInt    = Math.round(totalPmts - loanAmt);

    // ── Actions ───────────────────────────────────────────────────────────────

    async function handleVault() {
        if (!user) { router.push('/sign-up'); return; }
        try {
            await fetch('/api/library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: `VA: ${fmtK(price)} · ${downPct}% down · ${rate.toFixed(2)}% · ${ffTier === 'exempt' ? 'FF Exempt' : `${ffPct}% FF`}`,
                    answer:   `Monthly PITI: ${fmt$(piti)} · Funding fee: ${ffTier === 'exempt' ? 'Exempt' : fmt$(fundingFee)} · No PMI`,
                    tool_id:  'vault_save_va',
                }),
            });
            setVaultDone(true);
        } catch { /* non-fatal */ }
    }

    function handleRun() {
        if (!props.onRunScenario) return;
        props.onRunScenario(buildSeed(), {
            purchasePrice: price, downPaymentPct: downPct,
            annualRatePct: rate, termYears: termYrs,
            vaFundingFeeExempt: ffTier === 'exempt',
            customFundingFeePct: ffTier !== 'exempt' ? ffPct : undefined,
            loanType: 'va',
            monthlyDebts: debts,
        });
    }

    function buildSeed() {
        const prStr = fmtK(price);
        const ffStr = ffTier === 'exempt' ? 'exempt from VA funding fee' : `${ffPct}% VA funding fee`;
        const dStr  = debts > 0 ? ` with ${fmt$(debts)}/mo in other debts` : '';
        return `VA loan on a ${prStr} home, ${downPct}% down at ${rate.toFixed(3)}%, ${ffStr}, ${termYrs}-year fixed${dStr}`;
    }

    function getMatchedUrl() {
        const p = new URLSearchParams({
            from: 'va', lt: 'VA', purpose: 'Purchase',
            price:   String(Math.round(price)),
            dp:      String(downPct),
            monthly: String(piti),
            rate:    String(rate),
            term:    String(termYrs),
        });
        return `/connect/post?${p.toString()}`;
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="va">

            {/* Header */}
            <div className="va-header">
                <div className="va-header-left">
                    <div className="va-hicon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="1.8" width="16" height="16">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 12c0 2.09.54 4.05 1.487 5.753M15 9.75a3 3 0 11-6 0 3 3 0 016 0zm6 2.25c0 2.09-.54 4.05-1.487 5.753M12 21a11.955 11.955 0 01-8.513-3.547" />
                        </svg>
                    </div>
                    <div>
                        <div className="va-title">VA Loan — Purchase Payment</div>
                        <div className="va-sub">{fmtK(price)} · {downPct}% down · {rate.toFixed(2)}% · {termYrs}yr VA · No PMI</div>
                    </div>
                </div>
                <span className="va-nopmi-badge">No PMI</span>
            </div>

            {/* Hero */}
            <div className="va-hero">
                <div>
                    <div className="va-hero-label">Est. Monthly PITI</div>
                    <div className="va-hero-amount">{fmt$(piti)}<span className="va-hero-mo">/mo</span></div>
                    <div className="va-hero-sub">P&amp;I + Tax + Insurance · {downPct}% down · No PMI</div>
                </div>
                <div className="va-hero-stats">
                    <div><div className="va-hsl">Base Loan</div><div className="va-hsv">{fmt$(Math.round(baseLoan))}</div></div>
                    <div>
                        <div className="va-hsl">Funding Fee</div>
                        <div className={`va-hsv${ffTier === 'exempt' ? ' va-hsv--teal' : ''}`}>
                            {ffTier === 'exempt' ? 'Exempt' : `${fmt$(fundingFee)} (${ffPct}%)`}
                        </div>
                    </div>
                    <div><div className="va-hsl">Total Loan</div><div className="va-hsv">{fmt$(Math.round(loanAmt))}</div></div>
                </div>
            </div>

            {/* Funding fee selector */}
            <div className="va-ff">
                <div className="va-ff-head">
                    <span style={{ fontSize: 14 }}>🎖️</span>
                    <span className="va-ff-title">VA Funding Fee</span>
                </div>
                <div className="va-ff-body">
                    <div className="va-ff-grid">
                        {FF_OPTS.map(o => (
                            <button
                                key={o.val}
                                className={`va-ff-opt${ffTier === o.val ? ' va-ff-opt--on' : ''}`}
                                onClick={() => setFfTier(o.val)}
                            >
                                <span className="va-ff-opt-label">{o.label}</span>
                                <span className="va-ff-opt-note">{o.note}</span>
                            </button>
                        ))}
                    </div>
                    {ffTier !== 'exempt' && (
                        <div className="va-ff-calc">
                            {ffPct}% × {fmt$(Math.round(baseLoan))} base loan = <strong>{fmt$(fundingFee)}</strong> financed into loan
                        </div>
                    )}
                </div>
            </div>

            {/* No-PMI callout */}
            <div className="va-nopmi">
                <div className="va-nopmi-icon">🛡️</div>
                <div>
                    <div className="va-nopmi-title">No Private Mortgage Insurance — Ever</div>
                    <div className="va-nopmi-sub">
                        Conventional at {downPct}% down would add ~{fmt$(pmiMo)}/mo in PMI at this loan size until 20% equity.
                        VA borrowers skip PMI entirely — a benefit worth <strong>{fmt$(pmiMo * 60)}</strong> over 5 years.
                    </div>
                </div>
            </div>

            {/* Monthly breakdown — always visible */}
            <div className="va-bkd">
                <div className="va-bkd-title">Monthly Breakdown</div>
                <div className="va-bkd-row"><span>Principal &amp; Interest</span><span>{fmt$(pi)}</span></div>
                <div className="va-bkd-row va-bkd-pmi"><span>PMI</span><span>None — VA benefit</span></div>
                <div className="va-bkd-row"><span>Property Taxes ({(props.taxRate * 100).toFixed(2)}%)</span><span>{fmt$(tax)}</span></div>
                <div className="va-bkd-row"><span>Homeowner&apos;s Insurance</span><span>{fmt$(ins)}</span></div>
                <div className="va-bkd-row va-bkd-total"><span>Total Monthly PITI</span><span>{fmt$(piti)}/mo</span></div>
            </div>

            {/* Sliders — always visible, white section */}
            <div className="va-sliders">
                <div className="va-sliders-title">Adjust Your Numbers</div>

                <SliderField
                    label="Home Price"
                    value={price}
                    min={100000} max={3_000_000} step={5000}
                    onChange={setPrice}
                    format={v => fmt$(v)}
                    minLabel="$100k" maxLabel="$3M"
                    trackColor="#14b8a6" theme="dark"
                />

                <SliderField
                    label="Down Payment"
                    value={downPct}
                    min={0} max={50} step={1}
                    onChange={setDownPct}
                    format={v => `${v}% · ${fmtK(price * v / 100)}`}
                    minLabel="0%" maxLabel="50%"
                    trackColor="#14b8a6" theme="dark"
                />
                <div className="va-dp-chips">
                    {DP_CHIPS.map(pct => (
                        <button
                            key={pct}
                            className={`va-dp-chip${downPct === pct ? ' active' : ''}`}
                            onClick={() => setDownPct(pct)}
                        >
                            {pct}%{pct === 5 || pct === 10 ? <span className="va-dp-chip-note"> FF↓</span> : null}
                        </button>
                    ))}
                </div>
                <div className="va-dp-note">VA allows 0% down with no PMI — one of the strongest mortgage benefits available</div>

                <div className="va-rate-wrap">
                    <SliderField
                        label="Interest Rate"
                        value={rate}
                        min={3} max={12} step={0.125}
                        onChange={setRate}
                        format={v => parseFloat(v.toFixed(3)) + '%'}
                        minLabel="3%" maxLabel="12%"
                        trackColor="#14b8a6" theme="dark"
                    />
                    <div className="va-fred-tag">FRED PMMS · {props.rate.toFixed(2)}% live</div>
                </div>

                <div className="va-term-label">Loan Term</div>
                <div className="va-terms">
                    {([15, 30] as const).map(yr => (
                        <button
                            key={yr}
                            className={`va-term${termYrs === yr ? ' va-term--on' : ''}`}
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
                    trackColor="#14b8a6" theme="dark"
                />
                <div className="va-dp-note" style={{ marginTop: -4 }}>Car payments, student loans, credit cards, child support, etc.</div>
            </div>

            {/* Income qualify table */}
            <div className="va-qualify">
                <div className="va-qualify-title">Income to Qualify</div>
                {debts > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginBottom: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <span>PITI {fmt$(piti)} + Debts {fmt$(debts)}</span>
                        <span style={{ color: '#14b8a6', fontWeight: 600 }}>Total {fmt$(totalObligation)}/mo</span>
                    </div>
                )}
                <table className="va-qtable">
                    <thead>
                        <tr><th>DTI</th><th>Guideline</th><th>Gross Annual</th></tr>
                    </thead>
                    <tbody>
                        <tr className="va-qrow-hi"><td>41%</td><td>VA Guideline</td><td className="va-qval">{fmt$(q41)}</td></tr>
                        <tr><td>43%</td><td>Max (AUS)</td><td className="va-qval">{fmt$(q43)}</td></tr>
                    </tbody>
                </table>
                <div className="va-qualify-note">VA also applies a residual income test — strong residual income can qualify borrowers above 41% DTI.</div>
            </div>

            {/* Residual income */}
            <div className="va-residual">
                <div className="va-residual-head">
                    <span style={{ fontSize: 14 }}>💰</span>
                    <span className="va-residual-title">VA Residual Income Test (VA Pamphlet 26-7)</span>
                </div>
                <div className="va-residual-body">
                    After paying PITI, debts, and maintenance, VA requires leftover (<em className="va-em">residual</em>) income for family expenses.
                    This secondary qualifier often allows higher DTIs when residual income is strong.
                </div>
                <table className="va-rtable">
                    <thead>
                        <tr><th>Household</th><th>West</th><th>South/Midwest</th><th>Northeast</th></tr>
                    </thead>
                    <tbody>
                        {[1, 2, 3, 4, 5].map(n => (
                            <tr key={n}>
                                <td>{n} person{n > 1 ? 's' : ''}</td>
                                <td>{fmt$(RESIDUAL.West[n])}/mo</td>
                                <td>{fmt$(RESIDUAL['South/Midwest'][n])}/mo</td>
                                <td>{fmt$(RESIDUAL.Northeast[n])}/mo</td>
                            </tr>
                        ))}
                        <tr className="va-rtable-note">
                            <td colSpan={4}>Per VA Pamphlet 26-7 Table 41(a) · Loans ≥ $80k · Continental US</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* CTAs */}
            <div className="va-cta-row">
                <button
                    className="va-cta-prop"
                    onClick={() => {
                        const p = new URLSearchParams({
                            price:   String(Math.round(price)),
                            dp:      String(downPct),
                            rate:    rate.toFixed(3),
                            term:    String(termYrs),
                            lt:      'va',
                            taxRate: props.taxRate.toFixed(5),
                            insRate: props.insRate.toFixed(5),
                        });
                        router.push(`/check-property?${p.toString()}`);
                    }}
                >🏠 Check a Property</button>

                {props.onRunScenario && (
                    <button className="va-cta-run" onClick={handleRun}>▶ Run My Numbers</button>
                )}
            </div>
            <button className="va-cta-full" onClick={() => router.push(getMatchedUrl())}>
                Get Matched with a VA Lender →
            </button>

            {/* Deep analysis drawer */}
            <button className="va-dtrigger" onClick={() => setDrawerOpen(o => !o)}>
                <span className="va-dtrigger-left">
                    <span className="va-dtrigger-dot" />
                    <span>
                        <span className="va-dtrigger-label">Deep Analysis</span>
                        <span className="va-dtrigger-sub">Funding fee detail · Reserves · Lifetime cost · Full loan summary</span>
                    </span>
                </span>
                <span className="va-dtrigger-arrow">{drawerOpen ? '▲ Close' : '▼ View'}</span>
            </button>

            <div style={{ maxHeight: drawerOpen ? 1400 : 0, overflow: 'hidden', transition: 'max-height 0.38s ease' }}>
                <div className="va-drawer-inner">

                    {/* Funding fee detail */}
                    <div className="va-dsec">
                        <div className="va-dsec-label">Funding Fee Detail</div>
                        <div className="va-kv2"><span>Base Loan Amount</span><span>{fmt$(Math.round(baseLoan))}</span></div>
                        <div className="va-kv2"><span>Funding Fee Rate</span><span>{ffTier === 'exempt' ? 'Exempt (0%)' : `${ffPct}%`}</span></div>
                        <div className="va-kv2 va-kv2--teal"><span>Funding Fee (financed)</span><span>{ffTier === 'exempt' ? 'None (Exempt)' : fmt$(fundingFee)}</span></div>
                        <div className="va-kv2"><span>Total Loan (w/ fee)</span><span>{fmt$(Math.round(loanAmt))}</span></div>
                        <div className="va-kv2 va-kv2--green"><span>PMI Savings vs Conventional</span><span>{fmt$(pmiMo)}/mo · {fmt$(pmiMo * 60)} over 5yr (est.)</span></div>
                    </div>

                    {/* Reserves */}
                    <div className="va-dsec">
                        <div className="va-dsec-label">Reserves Needed</div>
                        <div className="va-kv2"><span>6-Month PITI Cushion</span><span>{fmt$(piti * 6)}</span></div>
                        <div className="va-kv2"><span>12-Month PITI Cushion</span><span>{fmt$(piti * 12)}</span></div>
                    </div>

                    {/* Full loan summary */}
                    <div className="va-dsec">
                        <div className="va-dsec-label">Full Loan Summary</div>
                        <div className="va-kv2"><span>Purchase Price</span><span>{fmt$(price)}</span></div>
                        <div className="va-kv2"><span>Down Payment</span><span>{fmt$(Math.round(downAmt))} ({downPct}%)</span></div>
                        <div className="va-kv2"><span>Base Loan Amount</span><span>{fmt$(Math.round(baseLoan))}</span></div>
                        <div className="va-kv2 va-kv2--teal"><span>Funding Fee (financed)</span><span>{ffTier === 'exempt' ? 'None (Exempt)' : fmt$(fundingFee)}</span></div>
                        <div className="va-kv2"><span>Total Financed Loan</span><span>{fmt$(Math.round(loanAmt))}</span></div>
                        <div className="va-kv2"><span>LTV (base)</span><span>{ltv.toFixed(1)}%</span></div>
                        <div className="va-kv2"><span>Interest Rate</span><span>{rate.toFixed(3)}%</span></div>
                        <div className="va-kv2"><span>Loan Term</span><span>{termYrs} yr fixed</span></div>
                        <div className="va-kv2"><span>Monthly PITI</span><span>{fmt$(piti)}</span></div>
                        <div className="va-kv2"><span>Total of Payments ({termYrs}yr)</span><span>{fmt$(totalPmts)}</span></div>
                        <div className="va-kv2 va-kv2--teal"><span>Total Interest Paid</span><span>{fmt$(totalInt)}</span></div>
                    </div>

                </div>
            </div>

            {/* Permanent bottom */}
            <div className="va-perm">
                <div className="va-perm-label">Save This Scenario</div>
                <div className="va-vault-row">
                    <button className="va-btn-vault" onClick={handleVault}>
                        {vaultDone ? '✓ Saved to Vault' : '⭐ Save to My Vault'}
                    </button>
                    <PdfDownloadButton
                        type="va"
                        getParams={() => ({
                            price, downPct, rate, term: termYrs,
                            taxRate: props.taxRate, insRate: props.insRate,
                            loanType: 'va',
                        })}
                    />
                </div>
                <div className="va-rate-note">
                    <span className="va-bulb">💡</span>
                    <p>
                        Rate seeded at <strong>{props.rate.toFixed(2)}%</strong> (FRED 30-yr fixed, live avg).
                        VA loans carry no PMI regardless of down payment or LTV.
                        VA funding fee per VA Pamphlet 26-7 (2024) — rates vary for National Guard/Reserve and surviving spouses.
                    </p>
                </div>
                <div className="va-disc">
                    <p>
                        <strong>Educational estimates only.</strong> VA funding fee financed into loan per VA Pamphlet 26-7 (2024).
                        No PMI is required on VA loans guaranteed by the Department of Veterans Affairs.
                        Property tax estimated at {(props.taxRate * 100).toFixed(1)}% annually; homeowner&apos;s insurance at {(props.insRate * 100).toFixed(1)}% annually.
                        Income requirements at 41% back-end DTI per VA guidelines; residual income thresholds per VA Pamphlet 26-7 Table 41(a).
                        Funding fee rates may differ for surviving spouses, National Guard, and Reserve members.
                        These figures are not a pre-approval or commitment to lend.
                    </p>
                </div>
            </div>

            {/* ── Styles ── */}
            <style>{`
                .va {
                    background: #0d1117;
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 16px;
                    overflow: clip;
                    margin-top: 14px;
                    font-family: system-ui, -apple-system, sans-serif;
                    color: #f0f4ff;
                }

                /* Header */
                .va-header { display:flex; align-items:center; justify-content:space-between; padding:14px 16px 10px; gap:10px; }
                .va-header-left { display:flex; align-items:center; gap:10px; }
                .va-hicon { width:32px; height:32px; border-radius:9px; background:rgba(20,184,166,0.1); border:1px solid rgba(20,184,166,0.25); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
                .va-title { font-size:15px; font-weight:700; color:#f0f4ff; }
                .va-sub   { font-size:11px; color: #94a3b8; margin-top:2px; }
                .va-nopmi-badge { font-size:9px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; padding:4px 10px; border-radius:20px; flex-shrink:0; white-space:nowrap; background:rgba(20,184,166,0.1); color:#14b8a6; border:1px solid rgba(20,184,166,0.25); }

                /* Hero */
                .va-hero { margin:0 12px 12px; background:#071a18; border:1px solid rgba(20,184,166,0.22); border-radius:14px; padding:18px 20px 14px; display:grid; grid-template-columns:1.4fr 1fr; gap:16px; align-items:center; }
                .va-hero-label { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#0f3830; margin-bottom:6px; }
                .va-hero-amount { font-size:32px; font-weight:800; color:#14b8a6; letter-spacing:-1px; line-height:1; }
                .va-hero-mo { font-size:16px; font-weight:600; color:#1a5550; }
                .va-hero-sub { font-size:11px; color:#8fa3b8; margin-top:4px; }
                .va-hero-stats { display:flex; flex-direction:column; gap:10px; padding-left:16px; border-left:1px solid rgba(255,255,255,0.05); }
                .va-hsl { font-size:9px; color:#8fa3b8; text-transform:uppercase; letter-spacing:.06em; font-weight:600; margin-bottom:2px; }
                .va-hsv { font-size:13px; font-weight:700; color:#f0f4ff; }
                .va-hsv--teal { color:#14b8a6; }

                /* Funding fee */
                .va-ff { margin:0 12px 12px; border-radius:12px; overflow:hidden; border:1px solid rgba(20,184,166,0.18); }
                .va-ff-head { display:flex; align-items:center; gap:8px; padding:10px 14px; background:rgba(20,184,166,0.06); border-bottom:1px solid rgba(20,184,166,0.12); }
                .va-ff-title { font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#14b8a6; }
                .va-ff-body { padding:10px 14px 12px; }
                .va-ff-grid { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
                .va-ff-opt { display:flex; flex-direction:column; align-items:flex-start; background:rgba(255,255,255,0.03); border:1.5px solid rgba(255,255,255,0.08); border-radius:9px; padding:8px 12px; cursor:pointer; font-family:inherit; transition:all .15s; min-width:90px; }
                .va-ff-opt--on { background:rgba(20,184,166,0.08); border-color:rgba(20,184,166,0.3); }
                .va-ff-opt-label { font-size:13px; font-weight:700; color:#c4cfe0; }
                .va-ff-opt--on .va-ff-opt-label { color:#14b8a6; }
                .va-ff-opt-note { font-size:10px; color:#4b6080; margin-top:2px; }
                .va-ff-calc { font-size:12px; color:#8fa3b8; background:rgba(20,184,166,0.04); border:1px solid rgba(20,184,166,0.1); border-radius:8px; padding:7px 12px; }
                .va-ff-calc strong { color:#14b8a6; }

                /* No-PMI callout */
                .va-nopmi { display:flex; align-items:flex-start; gap:10px; margin:0 12px 12px; background:rgba(20,184,166,0.05); border:1px solid rgba(20,184,166,0.18); border-radius:12px; padding:12px 14px; }
                .va-nopmi-icon { font-size:18px; flex-shrink:0; margin-top:1px; }
                .va-nopmi-title { font-size:12px; font-weight:700; color:#14b8a6; margin-bottom:4px; }
                .va-nopmi-sub { font-size:11px; color:#8fa3b8; line-height:1.5; }
                .va-nopmi-sub strong { color:#14b8a6; }

                /* Breakdown */
                .va-bkd { margin:0 12px 12px; background:#0e1420; border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:14px; }
                .va-bkd-title { font-size:10px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:.08em; margin-bottom:10px; }
                .va-bkd-row { display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.03); font-size:12px; color:#8fa3b8; }
                .va-bkd-row:last-child { border-bottom:none; }
                .va-bkd-pmi span { color:#14b8a6 !important; font-weight:700; }
                .va-bkd-total { border-top:1px solid rgba(255,255,255,0.07) !important; border-bottom:none !important; margin-top:4px; padding-top:10px !important; }
                .va-bkd-total span:first-child { font-weight:700; color:#f0f4ff; }
                .va-bkd-total span:last-child  { font-size:14px; font-weight:800; color:#14b8a6; }

                /* Sliders section */
                .va-sliders { background:#0d1117; color:#f0f4ff; padding:16px 18px; border-top:1px solid rgba(255,255,255,0.05); }
                .va-sliders-title { font-size:13px; font-weight:700; color:#f0f4ff; margin-bottom:14px; }

                /* FRED tag */
                .va-rate-wrap { position:relative; }
                .va-fred-tag { display:inline-block; margin-top:4px; font-size:10px; font-weight:700; color:#14b8a6; background:rgba(20,184,166,0.1); border:1px solid rgba(20,184,166,0.2); border-radius:4px; padding:2px 8px; letter-spacing:.04em; }

                /* DP chips */
                .va-dp-chips { display:flex; gap:6px; flex-wrap:wrap; margin:4px 0 8px; }
                .va-dp-chip { padding:5px 12px; border-radius:20px; border:1.5px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04); font-size:11px; font-weight:600; color: #94a3b8; cursor:pointer; font-family:inherit; transition:all .12s; }
                .va-dp-chip.active { border-color:#14b8a6; color:#14b8a6; background:rgba(20,184,166,0.1); }
                .va-dp-chip:hover:not(.active) { border-color:rgba(255,255,255,0.2); }
                .va-dp-chip-note { font-size:9px; font-weight:600; margin-left:3px; opacity:.8; }
                .va-dp-note { font-size:10px; color: #eaf8f7; margin:-4px 0 12px; }

                /* Term */
                .va-term-label { font-size:13px; font-weight:600; color:#8fa3b8; margin:4px 0 8px; }
                .va-terms { display:flex; gap:8px; }
                .va-term { flex:1; padding:10px 0; border-radius:8px; border:1.5px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04); font-size:13px; font-weight:600; color: #94a3b8; cursor:pointer; font-family:inherit; text-align:center; transition:all .15s; }
                .va-term--on { border-color:#14b8a6; color:#14b8a6; background:rgba(20,184,166,0.1); }
                .va-term:hover:not(.va-term--on) { border-color:rgba(255,255,255,0.2); }

                /* Income qualify */
                .va-qualify { margin:0 12px 12px; background:#0e1420; border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:14px; }
                .va-qualify-title { font-size:10px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:.08em; margin-bottom:10px; }
                .va-qtable { width:100%; border-collapse:collapse; font-size:12px; }
                .va-qtable th { font-size:9px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:.06em; padding:0 0 8px; text-align:left; border-bottom:1px solid rgba(255,255,255,0.05); }
                .va-qtable th:last-child { text-align:right; }
                .va-qtable td { padding:7px 0; border-bottom:1px solid rgba(255,255,255,0.03); color:#8fa3b8; }
                .va-qtable tr:last-child td { border-bottom:none; }
                .va-qrow-hi td { color:#f0f4ff; font-weight:600; }
                .va-qval { font-weight:700; color:#14b8a6 !important; text-align:right; }
                .va-qualify-note { font-size:10px; color:#8fa3b8; margin-top:8px; }

                /* Residual income */
                .va-residual { margin:0 12px 12px; border-radius:12px; overflow:hidden; border:1px solid rgba(20,184,166,0.18); }
                .va-residual-head { display:flex; align-items:center; gap:8px; padding:9px 14px; background:rgba(20,184,166,0.06); border-bottom:1px solid rgba(20,184,166,0.12); }
                .va-residual-title { font-size:11px; font-weight:700; color:#14b8a6; letter-spacing:.04em; }
                .va-residual-body { padding:10px 14px; font-size:12px; color:#8fa3b8; line-height:1.5; border-bottom:1px solid rgba(255,255,255,0.05); }
                .va-em { color:#14b8a6; font-style:normal; font-weight:600; }
                .va-rtable { width:100%; border-collapse:collapse; font-size:12px; }
                .va-rtable th { font-size:9px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:.06em; padding:8px 14px 6px; text-align:left; }
                .va-rtable th:not(:first-child) { text-align:right; }
                .va-rtable td { padding:5px 14px; border-top:1px solid rgba(255,255,255,0.04); font-size:12px; color:#8fa3b8; }
                .va-rtable td:not(:first-child) { text-align:right; font-weight:600; color:#c4cfe0; }
                .va-rtable-note td { color:#8fa3b8; font-size:10px; font-style:italic; text-align:left !important; font-weight:400 !important; color:#8fa3b8 !important; }

                /* CTAs */
                .va-cta-row { display:flex; gap:8px; padding:0 12px 8px; }
                .va-cta-prop { flex:1; padding:11px 14px; background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.12); border-radius:9px; color:#f0f4ff; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; text-align:center; }
                .va-cta-prop:hover { background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.25); }
                .va-cta-run { flex:1; padding:11px 14px; background:rgba(20,184,166,0.08); border:1.5px solid rgba(20,184,166,0.3); border-radius:9px; color:#14b8a6; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; text-align:center; }
                .va-cta-run:hover { opacity:.85; }
                .va-cta-full { display:block; width:calc(100% - 24px); margin:0 12px 12px; padding:13px; background:#14b8a6; border:none; border-radius:9px; color:#071513; font-size:14px; font-weight:800; cursor:pointer; font-family:inherit; transition:opacity .15s; text-align:center; }
                .va-cta-full:hover { opacity:.88; }

                /* Deep drawer trigger */
                .va-dtrigger { width:100%; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:13px 18px; background:rgba(20,184,166,0.05); border:none; border-top:1px solid rgba(20,184,166,0.15); border-bottom:1px solid rgba(20,184,166,0.15); cursor:pointer; font-family:inherit; transition:opacity .15s; }
                .va-dtrigger:hover { opacity:.85; }
                .va-dtrigger-left { display:flex; align-items:center; gap:10px; text-align:left; }
                .va-dtrigger-dot { width:7px; height:7px; border-radius:50%; background:#14b8a6; flex-shrink:0; }
                .va-dtrigger-label { display:block; font-size:13px; font-weight:700; color:#14b8a6; }
                .va-dtrigger-sub { display:block; font-size:10px; color:rgba(255,255,255,0.6); margin-top:1px; }
                .va-dtrigger-arrow { font-size:11px; color:#14b8a6; opacity:.7; flex-shrink:0; }

                /* Drawer inner */
                .va-drawer-inner { padding:14px; display:flex; flex-direction:column; gap:12px; background:#0a0f1a; }
                .va-dsec { background:#0e1420; border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:14px; }
                .va-dsec-label { font-size:9px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:.1em; margin-bottom:10px; }
                .va-kv2 { display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.03); font-size:12px; }
                .va-kv2:last-child { border-bottom:none; }
                .va-kv2 span:first-child { color:#8fa3b8; }
                .va-kv2 span:last-child  { font-weight:700; color:#f0f4ff; }
                .va-kv2--teal span:last-child { color:#14b8a6; }
                .va-kv2--green span:last-child { color:#00e87a; }

                /* Permanent bottom */
                .va-perm { padding:16px; border-top:1px solid rgba(255,255,255,0.05); }
                .va-perm-label { font-size:10px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:.08em; margin-bottom:10px; }
                .va-vault-row { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
                .va-btn-vault { flex:1; min-width:140px; display:flex; align-items:center; justify-content:center; gap:6px; background:rgba(20,184,166,0.08); color:#14b8a6; border:1.5px solid rgba(20,184,166,0.3); border-radius:8px; padding:10px 16px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:opacity .15s; }
                .va-btn-vault:hover { opacity:.85; }
                .va-rate-note { background:rgba(20,184,166,0.04); border:1px solid rgba(20,184,166,0.12); border-radius:10px; padding:10px 14px; display:flex; align-items:flex-start; gap:10px; margin-bottom:10px; }
                .va-bulb { font-size:16px; flex-shrink:0; margin-top:1px; }
                .va-rate-note p { font-size:12px; color:#8fa3b8; line-height:1.5; margin:0; }
                .va-rate-note strong { color:#14b8a6; }
                .va-disc { background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:10px; padding:12px 14px; }
                .va-disc p { font-size:11px; color: #94a3b8; line-height:1.6; margin:0; }
                .va-disc strong { color: #94a3b8; font-weight:600; }

                @media (max-width:480px) {
                    .va-hero { grid-template-columns:1fr; }
                    .va-hero-stats { flex-direction:row; padding-left:0; border-left:none; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px; }
                    .va-cta-row { flex-direction:column; }
                    .va-hero-amount { font-size:28px; }
                    .va-ff-opt { min-width:70px; }
                    .va-rtable th:nth-child(3), .va-rtable td:nth-child(3) { display:none; }
                }
                @media (max-width:640px) {
                    .va-vault-row { flex-direction:column; }
                    .va-btn-vault { min-width:unset; }
                }
            `}</style>
        </div>
    );
}
