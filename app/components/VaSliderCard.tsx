'use client';

import React, { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import SliderField from './SliderField';
import PdfDownloadButton from './PdfDownloadButton';

// ── Math ──────────────────────────────────────────────────────────────────────

function calcPI(principal: number, annualRate: number, termYears: number): number {
    if (principal <= 0) return 0;
    if (annualRate <= 0) return principal / (termYears * 12);
    const r = annualRate / 100 / 12;
    const n = termYears * 12;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// ── Residual income tables (VA Pamphlet 26-7) ─────────────────────────────────
// Loan ≥ $80k · Continental US · by household size

const RESIDUAL_NORTHEAST = [0, 450, 755, 909, 1025, 1062];
const RESIDUAL_MIDWEST   = [0, 441, 738, 889, 1003, 1039];
const RESIDUAL_SOUTH     = [0, 441, 738, 889, 1003, 1039];
const RESIDUAL_WEST      = [0, 491, 823, 990, 1117, 1158];

// ── Formatting ────────────────────────────────────────────────────────────────

function fmt$(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtK(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
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
    vaFundingFeePct?: number;  // 0 = exempt; undefined = auto (2.15%)
    onRunScenario?:   (seed: string, overrides: Record<string, any>) => void;
}

// ── Funding fee tiers ─────────────────────────────────────────────────────────

type FFTier = 'exempt' | '1.25' | '1.5' | '2.15' | '3.3';

const FF_OPTS: { label: string; val: FFTier; pct: number; note: string }[] = [
    { label: 'Exempt',  val: 'exempt', pct: 0,     note: '10%+ disability rating' },
    { label: '1.25%',   val: '1.25',  pct: 1.25,  note: '≥10% down — 1st use' },
    { label: '1.50%',   val: '1.5',   pct: 1.5,   note: '5–9.99% down — 1st use' },
    { label: '2.15%',   val: '2.15',  pct: 2.15,  note: '<5% down — 1st use' },
    { label: '3.30%',   val: '3.3',   pct: 3.3,   note: '<5% down — subsequent use' },
];

function pctToTier(pct: number | undefined): FFTier {
    if (pct === 0)     return 'exempt';
    if (pct === 1.25)  return '1.25';
    if (pct === 1.5)   return '1.5';
    if (pct === 3.3)   return '3.3';
    return '2.15';
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VaSliderCard(props: VaSliderParams) {
    const [price,     setPrice]     = useState(props.price);
    const [downPct,   setDownPct]   = useState(props.downPct);
    const [rate,      setRate]      = useState(props.rate);
    const [termYrs,   setTermYrs]   = useState(props.term);
    const [ffTier,    setFfTier]    = useState<FFTier>(pctToTier(props.vaFundingFeePct));
    const [bkdOpen,   setBkdOpen]   = useState(true);
    const [vaultDone, setVaultDone] = useState(false);

    const { user } = useUser();
    const router   = useRouter();

    const DP_CHIPS = [0, 5, 10, 20] as const;

    const isDirty = price !== props.price ||
        Math.abs(downPct - props.downPct) > 0.001 ||
        Math.abs(rate - props.rate) > 0.001 ||
        termYrs !== props.term ||
        ffTier !== pctToTier(props.vaFundingFeePct);

    // ── Derived values ──────────────────────────────────────────────────────

    const ffPct       = FF_OPTS.find(o => o.val === ffTier)!.pct;
    const downAmt     = price * downPct / 100;
    const baseLoan    = price - downAmt;
    const fundingFee  = Math.round(baseLoan * ffPct / 100);
    const loanAmt     = baseLoan + fundingFee;
    const ltv         = (baseLoan / price) * 100;

    const pi          = calcPI(loanAmt, rate, termYrs);
    const tax         = (price * props.taxRate) / 12;
    const ins         = (price * props.insRate) / 12;
    const piti        = pi + tax + ins;   // no PMI on VA

    const income41    = Math.round((piti / 0.41) * 12);
    const income43    = Math.round((piti / 0.43) * 12);

    function buildSeed() {
        const prStr = fmtK(price);
        const ffStr = ffTier === 'exempt' ? 'exempt from VA funding fee' : `${ffPct}% VA funding fee`;
        return `VA loan on a ${prStr} home with ${downPct}% down at ${rate.toFixed(2)}%, ${ffStr}, ${termYrs}-year fixed`;
    }

    function buildIncomeSeed() {
        const prStr = fmtK(price);
        return `What income do I need to qualify for a ${prStr} VA loan with ${downPct}% down at ${rate.toFixed(2)}%?`;
    }

    function getMatchedUrl() {
        const p = new URLSearchParams({
            from: 'va', lt: 'VA', purpose: 'Purchase',
            price: String(Math.round(price)),
            dp: String(downPct),
            monthly: String(Math.round(piti)),
            rate: String(rate),
            term: String(termYrs),
        });
        return `/connect/post?${p.toString()}`;
    }

    async function handleVault() {
        if (!user) { router.push('/sign-up'); return; }
        try {
            await fetch('/api/library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: `VA loan: ${fmtK(price)} · ${downPct}% down · ${rate.toFixed(2)}%`,
                    answer: `Monthly PITI: ${fmt$(Math.round(piti))} · Funding fee: ${fmt$(fundingFee)} (${ffTier === 'exempt' ? 'Exempt' : ffPct + '%'}) · No PMI`,
                    tool_id: 'vault_save_va',
                }),
            });
            setVaultDone(true);
        } catch { /* non-fatal */ }
    }

    function getRunOverrides() {
        return {
            purchasePrice: price,
            downPaymentPct: downPct,
            annualRatePct: rate,
            termYears: termYrs,
            vaFundingFeeExempt: ffTier === 'exempt',
            customFundingFeePct: ffTier !== 'exempt' ? ffPct : undefined,
            loanType: 'va',
        };
    }

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="va">

            {/* Topbar */}
            <div className="va-topbar">
                <div className="va-topbar-l">
                    <div className="va-dot" />
                    <span className="va-tl">AI Analysis</span>
                </div>
                <span className="va-tr">Live · CalcEngine-Deterministic</span>
            </div>

            {/* Header */}
            <div className="va-header">
                <div className="va-header-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 12c0 2.09.54 4.05 1.487 5.753M15 9.75a3 3 0 11-6 0 3 3 0 016 0zm6 2.25c0 2.09-.54 4.05-1.487 5.753M12 21a11.955 11.955 0 01-8.513-3.547" />
                    </svg>
                </div>
                <div>
                    <div className="va-header-title">VA Loan — Payment Breakdown</div>
                    <div className="va-header-sub">{fmtK(price)} · {downPct}% down · {rate.toFixed(2)}% · {termYrs}yr fixed · No PMI</div>
                </div>
            </div>

            {/* Hero */}
            <div className="va-hero">
                <div className="va-hero-label">Monthly PITI (Principal · Interest · Tax · Insurance)</div>
                <div className="va-hero-amount">
                    {fmt$(Math.round(piti))}<span className="va-hero-mo">/mo</span>
                </div>
                <div className="va-hero-sub">
                    No PMI — VA benefit saves ~{fmt$(Math.round(baseLoan * 0.008 / 12))}/mo vs conventional with same down payment
                </div>
                <div className="va-hero-grid">
                    <div className="va-hero-stat">
                        <div className="va-hero-sl">Base Loan</div>
                        <div className="va-hero-sv">{fmtK(baseLoan)}</div>
                    </div>
                    <div className="va-hero-stat">
                        <div className="va-hero-sl">Funding Fee</div>
                        <div className="va-hero-sv" style={{ color: ffTier === 'exempt' ? '#14b8a6' : '#c4cfe0' }}>
                            {ffTier === 'exempt' ? 'Exempt' : fmt$(fundingFee)}
                        </div>
                    </div>
                    <div className="va-hero-stat">
                        <div className="va-hero-sl">Total Loan</div>
                        <div className="va-hero-sv">{fmtK(loanAmt)}</div>
                    </div>
                </div>
            </div>

            {/* Funding fee selector */}
            <div className="va-ff-section">
                <div className="va-ff-head">VA Funding Fee</div>
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
                        {ffPct}% × {fmtK(baseLoan)} base loan = <strong>{fmt$(fundingFee)}</strong> financed into loan
                    </div>
                )}
            </div>

            {/* No-PMI callout */}
            <div className="va-nopmi">
                <div className="va-nopmi-icon">🛡️</div>
                <div className="va-nopmi-body">
                    <div className="va-nopmi-title">No Private Mortgage Insurance — Ever</div>
                    <div className="va-nopmi-sub">
                        Conventional at {downPct}% down would add ~{fmt$(Math.round(baseLoan * 0.008 / 12))}/mo in PMI
                        ({ltv.toFixed(0)}% LTV) until 20% equity. VA borrowers skip this entirely — a benefit worth
                        {' '}{fmt$(Math.round(baseLoan * 0.008 / 12 * 60))} over 5 years at this loan size.
                    </div>
                </div>
            </div>

            {/* Explorer */}
            <div className="va-exp">
                <div className="va-exp-head">Payment Explorer</div>

                <SliderField
                    label="Home Price"
                    value={price}
                    min={100000} max={3_000_000} step={5000}
                    onChange={setPrice}
                    format={v => fmtK(v)}
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
                        >{pct}%</button>
                    ))}
                </div>

                <SliderField
                    label="Interest Rate"
                    value={rate}
                    min={3} max={12} step={0.125}
                    onChange={setRate}
                    format={v => parseFloat(v.toFixed(3)) + '%'}
                    minLabel="3%" maxLabel="12%"
                    trackColor="#14b8a6" theme="dark"
                />

                <div className="va-exp-term-label">Loan Term</div>
                <div className="va-terms">
                    {([15, 30] as const).map(yr => (
                        <button
                            key={yr}
                            className={`va-term${termYrs === yr ? ' va-term--on' : ''}`}
                            onClick={() => setTermYrs(yr)}
                        >{yr}yr</button>
                    ))}
                </div>

                {/* Stats bar */}
                <div className="va-exp-stats">
                    <div className="va-exp-stat">
                        <div className="va-exp-stat-label">P&I</div>
                        <div className="va-exp-stat-val">{fmt$(Math.round(pi))}</div>
                    </div>
                    <div className="va-exp-stat">
                        <div className="va-exp-stat-label">Tax + Ins</div>
                        <div className="va-exp-stat-val">{fmt$(Math.round(tax + ins))}</div>
                    </div>
                    <div className="va-exp-stat">
                        <div className="va-exp-stat-label">PMI</div>
                        <div className="va-exp-stat-val" style={{ color: '#14b8a6' }}>None</div>
                    </div>
                    <div className="va-exp-stat">
                        <div className="va-exp-stat-label">Total / mo</div>
                        <div className="va-exp-stat-val">{fmt$(Math.round(piti))}</div>
                    </div>
                </div>

                {/* Actions */}
                <div className="va-exp-actions">
                    {isDirty && props.onRunScenario && (
                        <button className="va-btn-rerun" onClick={() => props.onRunScenario!(buildSeed(), getRunOverrides())}>
                            Run adjusted scenario →
                        </button>
                    )}
                    <button className="va-btn-vault" onClick={handleVault}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                            <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd"/>
                        </svg>
                        {vaultDone ? 'Saved ✓' : 'My Vault'}
                    </button>
                    <PdfDownloadButton
                        type="va"
                        getParams={() => ({
                            price, downPct, rate, term: termYrs,
                            taxRate: props.taxRate, insRate: props.insRate,
                            loanType: 'va',
                        })}
                    />
                    <button className="va-btn-match" onClick={() => router.push(getMatchedUrl())}>
                        Get Matched →
                    </button>
                </div>
            </div>

            {/* Payment breakdown */}
            <div className="va-bkd">
                <button className="va-bkd-toggle" onClick={() => setBkdOpen(o => !o)}>
                    <span className="va-bkd-label">⊞ &nbsp;Full payment breakdown</span>
                    <span className={`va-bkd-chev${bkdOpen ? ' open' : ''}`}>▴</span>
                </button>
                {bkdOpen && (
                    <div className="va-bkd-body">
                        <div className="va-kv-s">Monthly Payment</div>
                        <div className="va-kv"><span className="va-kv-k">Principal &amp; Interest</span><span className="va-kv-v">{fmt$(Math.round(pi))}</span></div>
                        <div className="va-kv"><span className="va-kv-k">Property Taxes</span><span className="va-kv-v">{fmt$(Math.round(tax))}</span></div>
                        <div className="va-kv"><span className="va-kv-k">Home Insurance</span><span className="va-kv-v">{fmt$(Math.round(ins))}</span></div>
                        <div className="va-kv"><span className="va-kv-k">PMI</span><span className="va-kv-v" style={{ color: '#14b8a6' }}>None — VA benefit</span></div>
                        <div className="va-kv va-kv--total"><span className="va-kv-k">Total Monthly PITI</span><span className="va-kv-v">{fmt$(Math.round(piti))}</span></div>
                        <div className="va-kv-s">Income to Qualify</div>
                        <div className="va-kv"><span className="va-kv-k">@ 41% DTI (VA guideline)</span><span className="va-kv-v va-kv-v--teal">{fmt$(income41)}/yr</span></div>
                        <div className="va-kv"><span className="va-kv-k">@ 43% DTI (max)</span><span className="va-kv-v">{fmt$(income43)}/yr</span></div>
                        <div className="va-kv-s">Funding Fee</div>
                        <div className="va-kv"><span className="va-kv-k">Fee Rate</span><span className="va-kv-v">{ffTier === 'exempt' ? 'Exempt' : ffPct + '%'}</span></div>
                        <div className="va-kv"><span className="va-kv-k">Fee Amount (financed)</span><span className="va-kv-v">{ffTier === 'exempt' ? '—' : fmt$(fundingFee)}</span></div>
                    </div>
                )}
            </div>

            {/* Residual income callout */}
            <div className="va-residual">
                <div className="va-residual-head">
                    <span className="va-residual-icon">💰</span>
                    <span className="va-residual-title">VA Residual Income Test</span>
                </div>
                <div className="va-residual-body">
                    VA lenders must verify that after paying PITI, taxes, maintenance, and all debts, you have
                    enough <em>residual income</em> left for your family's needs. This is VA's unique secondary
                    qualifier — separate from DTI — and often allows higher DTIs when residual income is strong.
                </div>
                <div className="va-residual-table">
                    <div className="va-residual-row">
                        <span>1 person (West)</span><span>{fmt$(RESIDUAL_WEST[1])}/mo</span>
                    </div>
                    <div className="va-residual-row">
                        <span>2 people (West)</span><span>{fmt$(RESIDUAL_WEST[2])}/mo</span>
                    </div>
                    <div className="va-residual-row">
                        <span>4 people (West)</span><span>{fmt$(RESIDUAL_WEST[4])}/mo</span>
                    </div>
                    <div className="va-residual-row va-residual-row--note">
                        <span>South/Midwest rates ~10% lower · Northeast slightly higher</span>
                    </div>
                </div>
            </div>

            {/* Follow-up chips */}
            {props.onRunScenario && (
                <div className="va-followup-row">
                    <button
                        className="va-followup-chip"
                        onClick={() => props.onRunScenario!(buildIncomeSeed(), {})}
                    >
                        What income do I need to qualify for this VA loan? →
                    </button>
                    <button
                        className="va-followup-chip va-followup-chip--property"
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
                    >
                        Check a property →
                    </button>
                </div>
            )}

            {/* Rate note */}
            <div className="va-rate-note">
                <span className="va-bulb">💡</span>
                <p>
                    <strong>Assumption:</strong> Rate seeded at <strong>{props.rate.toFixed(2)}%</strong> (FRED 30-yr fixed, live).
                    VA loans are guaranteed by the Department of Veterans Affairs — no PMI required regardless of down payment.
                    VA rates are often at or below conventional rates for qualified borrowers.
                </p>
            </div>

            {/* Disclosures */}
            <div className="va-disc">
                <p>
                    <strong>Educational estimates only.</strong> VA funding fee per VA Pamphlet 26-7 (2024).
                    No PMI is required on VA loans guaranteed by the Department of Veterans Affairs.
                    Property tax estimated at {(props.taxRate * 100).toFixed(1)}% annually; homeowner&apos;s insurance at {(props.insRate * 100).toFixed(1)}% annually.
                    Income requirements at 41% back-end DTI per VA guidelines. Residual income thresholds per VA Pamphlet 26-7, Table 41(a).
                    Funding fee may vary for surviving spouses and National Guard/Reserve members.
                    These figures are not a pre-approval or commitment to lend.
                </p>
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

                /* topbar */
                .va-topbar { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.02); }
                .va-topbar-l { display:flex; align-items:center; gap:6px; }
                .va-dot { width:7px; height:7px; border-radius:50%; background:#14b8a6; }
                .va-tl { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#6b7a99; }
                .va-tr { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#3a4560; }

                /* header */
                .va-header { display:flex; align-items:center; gap:12px; padding:16px 16px 12px; }
                .va-header-icon { width:36px; height:36px; border-radius:10px; background:rgba(20,184,166,0.12); border:1px solid rgba(20,184,166,0.2); display:flex; align-items:center; justify-content:center; color:#14b8a6; flex-shrink:0; }
                .va-header-title { font-size:15px; font-weight:700; color:#f0f4ff; }
                .va-header-sub { font-size:11px; color:#6b7a99; margin-top:2px; }

                /* hero */
                .va-hero { margin:0 12px 12px; background:#091916; border:1px solid rgba(20,184,166,0.2); border-radius:14px; padding:20px 20px 16px; text-align:center; }
                .va-hero-label { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#1a3a38; margin-bottom:8px; }
                .va-hero-amount { font-size:48px; font-weight:800; color:#14b8a6; letter-spacing:-2.5px; line-height:1; }
                .va-hero-mo { font-size:20px; font-weight:600; color:#236660; letter-spacing:0; }
                .va-hero-sub { font-size:12px; color:#8fa3b8; margin-top:8px; }
                .va-hero-grid { display:grid; grid-template-columns:repeat(3,1fr); margin-top:14px; border-top:1px solid rgba(255,255,255,0.06); padding-top:12px; }
                .va-hero-stat { text-align:center; padding:0 8px; border-right:1px solid rgba(255,255,255,0.06); }
                .va-hero-stat:last-child { border-right:none; }
                .va-hero-sl { font-size:9px; color:#3a4560; text-transform:uppercase; letter-spacing:.06em; font-weight:600; margin-bottom:4px; }
                .va-hero-sv { font-size:13px; font-weight:700; color:#f0f4ff; }

                /* funding fee */
                .va-ff-section { padding:12px 16px; border-top:1px solid rgba(255,255,255,0.05); }
                .va-ff-head { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#6b7a99; margin-bottom:8px; }
                .va-ff-grid { display:flex; flex-wrap:wrap; gap:6px; }
                .va-ff-opt { display:flex; flex-direction:column; align-items:flex-start; background:rgba(255,255,255,0.03); border:1.5px solid rgba(255,255,255,0.08); border-radius:9px; padding:8px 12px; cursor:pointer; font-family:inherit; transition:all .15s; min-width:90px; }
                .va-ff-opt--on { background:rgba(20,184,166,0.08); border-color:rgba(20,184,166,0.3); }
                .va-ff-opt-label { font-size:13px; font-weight:700; color:#c4cfe0; }
                .va-ff-opt--on .va-ff-opt-label { color:#14b8a6; }
                .va-ff-opt-note { font-size:10px; color:#4b6080; margin-top:2px; }
                .va-ff-calc { margin-top:8px; font-size:12px; color:#8fa3b8; background:rgba(20,184,166,0.04); border:1px solid rgba(20,184,166,0.1); border-radius:8px; padding:7px 12px; }
                .va-ff-calc strong { color:#14b8a6; }

                /* no PMI callout */
                .va-nopmi { display:flex; align-items:flex-start; gap:10px; margin:0 12px 12px; background:rgba(20,184,166,0.05); border:1px solid rgba(20,184,166,0.18); border-radius:12px; padding:12px 14px; }
                .va-nopmi-icon { font-size:18px; flex-shrink:0; margin-top:1px; }
                .va-nopmi-title { font-size:12px; font-weight:700; color:#14b8a6; margin-bottom:4px; }
                .va-nopmi-sub { font-size:11px; color:#8fa3b8; line-height:1.5; }

                /* explorer */
                .va-exp { padding:12px 16px; border-top:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.015); }
                .va-exp-head { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#6b7a99; margin-bottom:12px; }
                .va-dp-chips { display:flex; gap:6px; margin:-4px 0 12px; }
                .va-dp-chip { background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.1); border-radius:6px; padding:4px 10px; font-size:12px; font-weight:600; color:#8fa3b8; cursor:pointer; font-family:inherit; transition:all .15s; }
                .va-dp-chip.active { background:rgba(20,184,166,0.1); border-color:rgba(20,184,166,0.35); color:#14b8a6; }
                .va-dp-chip:hover { border-color:rgba(255,255,255,0.25); color:#f0f4ff; }
                .va-exp-term-label { font-size:12px; font-weight:600; color:#c4cfe0; margin-bottom:6px; }
                .va-terms { display:flex; gap:6px; margin-bottom:14px; }
                .va-term { flex:1; background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.1); border-radius:8px; padding:7px 0; font-size:13px; font-weight:600; color:#8fa3b8; cursor:pointer; font-family:inherit; transition:all .15s; text-align:center; }
                .va-term--on { background:rgba(20,184,166,0.1); border-color:rgba(20,184,166,0.35); color:#14b8a6; }
                .va-term:hover { border-color:rgba(255,255,255,0.25); color:#f0f4ff; }
                .va-exp-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:2px; }
                .va-exp-stat { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:8px; text-align:center; }
                .va-exp-stat-label { font-size:10px; color:#6b7a99; margin-bottom:3px; }
                .va-exp-stat-val { font-size:12px; font-weight:700; color:#c4cfe0; }

                /* actions */
                .va-exp-actions { display:flex; align-items:center; gap:8px; margin-top:12px; flex-wrap:wrap; }
                .va-btn-rerun { background:rgba(20,184,166,0.08); color:#14b8a6; border:1.5px solid rgba(20,184,166,0.25); border-radius:8px; padding:8px 14px; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; }
                .va-btn-rerun:hover { background:rgba(20,184,166,0.15); }
                .va-btn-vault { display:flex; align-items:center; gap:5px; background:rgba(255,255,255,0.04); color:#8fa3b8; border:1.5px solid rgba(255,255,255,0.1); border-radius:8px; padding:9px 14px; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; transition:all .15s; }
                .va-btn-vault:hover { border-color:rgba(255,255,255,0.25); color:#f0f4ff; }
                .va-btn-match { margin-left:auto; background:#14b8a6; color:#071513; border:none; border-radius:8px; padding:10px 20px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:opacity .15s; }
                .va-btn-match:hover { opacity:.88; }

                /* breakdown */
                .va-bkd { border-top:1px solid rgba(255,255,255,0.05); }
                .va-bkd-toggle { width:100%; display:flex; align-items:center; justify-content:space-between; padding:10px 16px; background:transparent; border:none; cursor:pointer; font-family:inherit; }
                .va-bkd-label { font-size:12px; font-weight:600; color:#8fa3b8; }
                .va-bkd-chev { font-size:10px; color:#8fa3b8; transition:transform .2s; display:inline-block; transform:rotate(180deg); }
                .va-bkd-chev.open { transform:rotate(0deg); }
                .va-bkd-body { padding:0 16px 12px; }
                .va-kv { display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
                .va-kv--total { padding-top:8px; border-top:1px solid rgba(255,255,255,0.12); border-bottom:none; }
                .va-kv-k { font-size:12px; color:#8fa3b8; }
                .va-kv-v { font-size:12px; font-weight:600; color:#c4cfe0; }
                .va-kv-v--teal { color:#14b8a6; }
                .va-kv--total .va-kv-k { font-weight:700; color:#c4cfe0; font-size:13px; }
                .va-kv--total .va-kv-v { font-weight:800; color:#f0f4ff; font-size:13px; }
                .va-kv-s { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#6b7a99; padding:10px 0 4px; }

                /* residual income */
                .va-residual { margin:0 12px 12px; border-radius:12px; overflow:hidden; border:1px solid rgba(20,184,166,0.18); }
                .va-residual-head { display:flex; align-items:center; gap:8px; padding:9px 14px; background:rgba(20,184,166,0.06); border-bottom:1px solid rgba(20,184,166,0.12); }
                .va-residual-icon { font-size:14px; }
                .va-residual-title { font-size:11px; font-weight:700; color:#14b8a6; letter-spacing:.04em; }
                .va-residual-body { padding:10px 14px; font-size:12px; color:#8fa3b8; line-height:1.5; }
                .va-residual-body em { color:#14b8a6; font-style:normal; font-weight:600; }
                .va-residual-table { border-top:1px solid rgba(255,255,255,0.05); }
                .va-residual-row { display:flex; justify-content:space-between; align-items:center; padding:6px 14px; font-size:12px; color:#8fa3b8; border-bottom:1px solid rgba(255,255,255,0.04); }
                .va-residual-row:last-child { border-bottom:none; }
                .va-residual-row--note { color:#3a4560; font-size:11px; font-style:italic; justify-content:flex-start; }

                /* follow-up chips */
                .va-followup-row { display:flex; flex-wrap:wrap; gap:8px; padding:0 12px 10px; }
                .va-followup-chip { background:rgba(20,184,166,0.06); border:1.5px solid rgba(20,184,166,0.2); border-radius:20px; padding:7px 14px; font-size:12px; font-weight:600; color:#14b8a6; cursor:pointer; font-family:inherit; transition:all .15s; }
                .va-followup-chip:hover { background:rgba(20,184,166,0.12); border-color:rgba(20,184,166,0.4); }
                .va-followup-chip--property { background:rgba(0,232,122,0.06); border-color:rgba(0,232,122,0.2); color:#00e87a; }
                .va-followup-chip--property:hover { background:rgba(0,232,122,0.12); border-color:rgba(0,232,122,0.4); }

                /* rate note */
                .va-rate-note { margin:0 12px 12px; background:rgba(20,184,166,0.04); border:1px solid rgba(20,184,166,0.12); border-radius:10px; padding:10px 14px; display:flex; align-items:flex-start; gap:10px; }
                .va-bulb { font-size:16px; flex-shrink:0; margin-top:1px; }
                .va-rate-note p { font-size:12px; color:#8fa3b8; line-height:1.5; }

                /* disclosures */
                .va-disc { padding:0 16px 16px; }
                .va-disc p { font-size:10px; color:#3a4560; line-height:1.5; }

                @media (max-width: 480px) {
                    .va-hero-amount { font-size:34px; }
                    .va-exp-stats { grid-template-columns:repeat(2,1fr); }
                    .va-ff-grid { gap:4px; }
                    .va-ff-opt { min-width:70px; }
                }
            `}</style>
        </div>
    );
}
