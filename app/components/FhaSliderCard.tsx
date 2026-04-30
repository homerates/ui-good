'use client';

import React, { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import SliderField from './SliderField';
import PdfDownloadButton from './PdfDownloadButton';

// ── Constants ────────────────────────────────────────────────────────────────

const FHA_FLOOR  = 541287;
const FHA_CEIL   = 1249125;
const UFMIP_RATE = 0.0175;

// ── Math ─────────────────────────────────────────────────────────────────────

function calcPI(principal: number, annualRate: number, termYears: number): number {
    if (principal <= 0) return 0;
    if (annualRate <= 0) return principal / (termYears * 12);
    const r = annualRate / 100 / 12;
    const n = termYears * 12;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function mipRate(ltv: number): number {
    return ltv > 90 ? 0.0055 : 0.0050;
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmt$(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtK(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(3).replace(/\.?0+$/, '')}M`;
    if (n >= 100_000)   return `$${Math.round(n / 1_000)}k`;
    return fmt$(n);
}

// ── Interface ─────────────────────────────────────────────────────────────────

export interface FhaSliderParams {
    price:   number;
    downPct: number;
    rate:    number;
    term:    number;
    taxRate: number;
    insRate: number;
    onRunScenario?: (seed: string, overrides: Record<string, any>) => void;
}

// ── Limit band ────────────────────────────────────────────────────────────────

type LimitStatus = 'within' | 'highcost' | 'exceeds';

function getLimitStatus(baseLoan: number): LimitStatus {
    if (baseLoan <= FHA_FLOOR) return 'within';
    if (baseLoan <= FHA_CEIL)  return 'highcost';
    return 'exceeds';
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FhaSliderCard(props: FhaSliderParams) {
    const [price,    setPrice]    = useState(props.price);
    const [downPct,  setDownPct]  = useState(props.downPct);
    const [rate,     setRate]     = useState(props.rate);
    const [termYrs,  setTermYrs]  = useState(props.term);
    const [bkdOpen,  setBkdOpen]  = useState(true);
    const [vaultDone, setVaultDone] = useState(false);

    const { user } = useUser();
    const router   = useRouter();

    const isDirty = price !== props.price || downPct !== props.downPct ||
        Math.abs(rate - props.rate) > 0.001 || termYrs !== props.term;

    // ── Derived values ──────────────────────────────────────────────────────

    const downAmt    = price * downPct / 100;
    const baseLoan   = price - downAmt;
    const ufmip      = Math.round(baseLoan * UFMIP_RATE);
    const loanAmt    = baseLoan + ufmip;
    const ltv        = (baseLoan / price) * 100;
    const annMIP     = mipRate(ltv);
    const monthlyMIP = Math.round((baseLoan * annMIP) / 12);
    const pi         = calcPI(loanAmt, rate, termYrs);
    const tax        = (price * props.taxRate) / 12;
    const ins        = (price * props.insRate) / 12;
    const total      = pi + monthlyMIP + tax + ins;

    const mipDrops   = downPct >= 10;
    const mipLife    = mipDrops ? '11 years' : 'Life of loan';
    const totalMIP   = mipDrops
        ? Math.round(monthlyMIP * 11 * 12)
        : Math.round(monthlyMIP * termYrs * 12);

    const limitStatus = getLimitStatus(baseLoan);

    const DP_CHIPS = [3.5, 5, 10] as const;

    // ── Actions ─────────────────────────────────────────────────────────────

    async function handleVault() {
        if (!user) { router.push('/sign-up'); return; }
        try {
            await fetch('/api/library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: `FHA: ${fmtK(price)} · ${downPct}% down · ${rate.toFixed(2)}% · ${termYrs}yr`,
                    answer: `Total/mo: ${fmt$(Math.round(total))} · PITI+MIP · Base loan: ${fmt$(Math.round(baseLoan))}`,
                    tool_id: 'vault_save_fha',
                }),
            });
            setVaultDone(true);
        } catch { /* non-fatal */ }
    }

    function buildSeed() {
        const prStr = price >= 1_000_000
            ? `$${(price / 1_000_000).toFixed(2)}M`
            : `$${Math.round(price / 1000)}k`;
        return `FHA loan on a ${prStr} home, ${downPct}% down at ${rate.toFixed(3)}% — ${termYrs} year fixed`;
    }

    function getRunOverrides(): Record<string, any> {
        return { isFHA: true, purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate };
    }

    function getMatchedUrl() {
        const p = new URLSearchParams({
            from: 'scenario', lt: 'FHA', purpose: 'Purchase',
            price: String(Math.round(price)),
            dp:    String(downPct),
            monthly: String(Math.round(total)),
            rate:  String(rate),
            term:  String(termYrs),
        });
        return `/connect/post?${p.toString()}`;
    }

    function buildIncomeSeed() {
        const prStr = price >= 1_000_000
            ? `$${(price / 1_000_000).toFixed(2)}M`
            : `$${Math.round(price / 1000)}k`;
        return `What income do I need to qualify for a ${prStr} home with FHA ${downPct}% down at ${rate.toFixed(2)}%?`;
    }

    // ── Limit band content ───────────────────────────────────────────────────

    const limitBadge = limitStatus === 'within'
        ? 'FHA Eligible'
        : limitStatus === 'highcost'
            ? 'High-Cost Limit'
            : 'Exceeds FHA Max';

    const limitDesc = limitStatus === 'within'
        ? <span>Base loan of <strong className="fha-strong">{fmt$(Math.round(baseLoan))}</strong> is within the 2026 FHA national floor limit.</span>
        : limitStatus === 'highcost'
            ? <span>Base loan of <strong className="fha-strong">{fmt$(Math.round(baseLoan))}</strong> requires a high-cost area FHA loan. County-specific limit applies.</span>
            : <span>Base loan of <strong className="fha-strong">{fmt$(Math.round(baseLoan))}</strong> exceeds the FHA ceiling. Consider Jumbo or Conventional.</span>;

    const limitRight = limitStatus === 'within'
        ? fmt$(FHA_FLOOR)
        : limitStatus === 'highcost'
            ? `up to ${fmt$(FHA_CEIL)}`
            : `${fmt$(FHA_CEIL)} max`;

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="fha">

            {/* Topbar */}
            <div className="fha-topbar">
                <div className="fha-topbar-l">
                    <div className="fha-dot" />
                    <span className="fha-tl">AI Analysis</span>
                </div>
                <span className="fha-tr">Live · CalcEngine-Deterministic</span>
            </div>

            {/* Header */}
            <div className="fha-header">
                <div className="fha-header-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
                    </svg>
                </div>
                <div>
                    <div className="fha-header-title">FHA Purchase Payment</div>
                    <div className="fha-header-sub">{fmtK(price)} · {downPct}% down · {rate.toFixed(2)}% · {termYrs}yr FHA</div>
                </div>
            </div>

            {/* Limit band */}
            <div className={`fha-band fha-band--${limitStatus}`}>
                <div className="fha-band-l">
                    <div className={`fha-badge fha-badge--${limitStatus}`}>{limitBadge}</div>
                    <div className="fha-band-desc">{limitDesc}</div>
                </div>
                <div className="fha-band-r">
                    2026 FHA Limit<span>{limitRight}</span>
                </div>
            </div>

            {/* Hero */}
            <div className="fha-hero">
                <div className="fha-hero-label">Estimated Monthly PITI + MIP</div>
                <div className="fha-hero-amount">
                    {fmt$(Math.round(total))}<span className="fha-hero-mo">/mo</span>
                </div>
                <div className="fha-hero-sub">
                    P&amp;I + MIP + Tax + Insurance · {downPct}% down
                </div>
                <div className="fha-hero-grid">
                    <div className="fha-hero-stat">
                        <div className="fha-hero-sl">Base Loan</div>
                        <div className="fha-hero-sv">{fmt$(Math.round(baseLoan))}</div>
                    </div>
                    <div className="fha-hero-stat">
                        <div className="fha-hero-sl">Financed Loan</div>
                        <div className="fha-hero-sv">{fmt$(Math.round(loanAmt))}</div>
                    </div>
                    <div className="fha-hero-stat">
                        <div className="fha-hero-sl">LTV (base)</div>
                        <div className="fha-hero-sv">{ltv.toFixed(1)}%</div>
                    </div>
                </div>
            </div>

            {/* MIP callout */}
            <div className="fha-mip">
                <div className="fha-mip-head">
                    <span className="fha-mip-icon">🛡️</span>
                    <span className="fha-mip-title">FHA Mortgage Insurance (MIP)</span>
                </div>
                <div className="fha-mip-rows">
                    <div className="fha-mip-row">
                        <div className="fha-mip-row-label">
                            Upfront MIP (UFMIP)
                            <small>1.75% of base loan — financed into your loan</small>
                        </div>
                        <div className="fha-mip-row-val fha-mip-row-val--amber">{fmt$(ufmip)} financed</div>
                    </div>
                    <div className="fha-mip-divider" />
                    <div className="fha-mip-row">
                        <div className="fha-mip-row-label">
                            Annual MIP (monthly)
                            <small>{(annMIP * 100).toFixed(2)}%/yr on base loan · LTV {ltv > 90 ? '> 90%' : '≤ 90%'}</small>
                        </div>
                        <div className="fha-mip-row-val fha-mip-row-val--amber">{fmt$(monthlyMIP)}/mo</div>
                    </div>
                </div>
                <div className={`fha-mip-dur${mipDrops ? ' fha-mip-dur--good' : ' fha-mip-dur--warn'}`}>
                    <span className="fha-mip-dur-icon">{mipDrops ? '✅' : '⚠️'}</span>
                    {mipDrops
                        ? <span>With {downPct}% down, MIP cancels automatically after <strong>11 years</strong> — you&apos;ll save {fmt$(monthlyMIP)}/mo once it drops.</span>
                        : <span>With {downPct}% down, MIP runs for the <strong>life of your loan</strong> — it never drops off. Put 10%+ down to cancel MIP after 11 years.</span>
                    }
                </div>
            </div>

            {/* Breakdown accordion */}
            <div className="fha-bkd">
                <button className="fha-bkd-toggle" onClick={() => setBkdOpen(o => !o)}>
                    <span className="fha-bkd-label">⊞ &nbsp;Full payment breakdown</span>
                    <span className={`fha-bkd-chev${bkdOpen ? ' open' : ''}`}>▴</span>
                </button>
                {bkdOpen && (
                    <div className="fha-bkd-body">
                        <div className="fha-kv-s">Monthly Payment</div>
                        <div className="fha-kv"><span className="fha-kv-k">Principal &amp; Interest</span><span className="fha-kv-v">{fmt$(Math.round(pi))}</span></div>
                        <div className="fha-kv"><span className="fha-kv-k">Monthly MIP ({(annMIP * 100).toFixed(2)}%/yr)</span><span className="fha-kv-v fha-kv-v--amber">{fmt$(monthlyMIP)}</span></div>
                        <div className="fha-kv"><span className="fha-kv-k">Property Taxes (est.)</span><span className="fha-kv-v">{fmt$(Math.round(tax))}</span></div>
                        <div className="fha-kv"><span className="fha-kv-k">Home Insurance</span><span className="fha-kv-v">{fmt$(Math.round(ins))}</span></div>
                        <div className="fha-kv fha-kv--total"><span className="fha-kv-k">Total Monthly</span><span className="fha-kv-v fha-kv-v--amber">{fmt$(Math.round(total))}</span></div>
                        <div className="fha-kv-s">FHA Loan Details</div>
                        <div className="fha-kv"><span className="fha-kv-k">Base loan amount</span><span className="fha-kv-v">{fmt$(Math.round(baseLoan))}</span></div>
                        <div className="fha-kv"><span className="fha-kv-k">UFMIP financed (1.75%)</span><span className="fha-kv-v fha-kv-v--amber">{fmt$(ufmip)}</span></div>
                        <div className="fha-kv"><span className="fha-kv-k">Total financed loan</span><span className="fha-kv-v">{fmt$(Math.round(loanAmt))}</span></div>
                        <div className="fha-kv"><span className="fha-kv-k">MIP duration</span><span className={`fha-kv-v${mipDrops ? ' fha-kv-v--green' : ' fha-kv-v--red'}`}>{mipLife}</span></div>
                        <div className="fha-kv"><span className="fha-kv-k">Total MIP paid ({mipDrops ? '11yr' : `${termYrs}yr`} est.)</span><span className="fha-kv-v fha-kv-v--amber">{fmt$(totalMIP)} est.</span></div>
                    </div>
                )}
            </div>

            {/* Explorer */}
            <div className="fha-exp">
                <div className="fha-exp-head">Payment Explorer</div>

                <SliderField
                    label="Home Price"
                    value={price}
                    min={50000} max={900000} step={5000}
                    onChange={setPrice}
                    format={v => fmtK(v)}
                    minLabel="$50k" maxLabel="$900k"
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
                            {pct}%{pct === 10 ? <span className="fha-dp-chip-note"> MIP drops</span> : null}
                        </button>
                    ))}
                </div>
                <div className="fha-dp-min-note">FHA min: 3.5% (580+ credit) · 10% (500–579 credit)</div>

                <SliderField
                    label="Interest Rate"
                    value={rate}
                    min={3} max={12} step={0.125}
                    onChange={setRate}
                    format={v => parseFloat(v.toFixed(3)) + '%'}
                    minLabel="3%" maxLabel="12%"
                    trackColor="#f59e0b" theme="dark"
                />

                <div className="fha-exp-term-label">Loan Term</div>
                <div className="fha-terms">
                    {([15, 30] as const).map(yr => (
                        <button
                            key={yr}
                            className={`fha-term${termYrs === yr ? ' fha-term--on' : ''}`}
                            onClick={() => setTermYrs(yr)}
                        >{yr}yr</button>
                    ))}
                </div>

                <div className="fha-exp-stats">
                    <div className="fha-exp-stat">
                        <div className="fha-exp-stat-label">Base Loan</div>
                        <div className="fha-exp-stat-val">{fmt$(Math.round(baseLoan))}</div>
                    </div>
                    <div className="fha-exp-stat">
                        <div className="fha-exp-stat-label">Financed (w/ UFMIP)</div>
                        <div className="fha-exp-stat-val">{fmt$(Math.round(loanAmt))}</div>
                    </div>
                    <div className="fha-exp-stat">
                        <div className="fha-exp-stat-label">MIP / mo</div>
                        <div className="fha-exp-stat-val" style={{ color: '#f59e0b' }}>{fmt$(monthlyMIP)}</div>
                    </div>
                    <div className="fha-exp-stat">
                        <div className="fha-exp-stat-label">Total / mo</div>
                        <div className="fha-exp-stat-val">{fmt$(Math.round(total))}</div>
                    </div>
                </div>

                {/* Actions */}
                <div className="fha-exp-actions">
                    {isDirty && props.onRunScenario && (
                        <button className="fha-btn-rerun" onClick={() => props.onRunScenario!(buildSeed(), getRunOverrides())}>
                            Run adjusted scenario →
                        </button>
                    )}
                    <button className="fha-btn-vault" onClick={handleVault}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                            <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
                        </svg>
                        {vaultDone ? 'Saved ✓' : 'My Vault'}
                    </button>
                    <PdfDownloadButton
                        type="fha"
                        getParams={() => ({
                            price, downPct, rate, term: termYrs,
                            taxRate: props.taxRate, insRate: props.insRate,
                            loanType: 'fha',
                        })}
                    />
                    <button className="fha-btn-match" onClick={() => router.push(getMatchedUrl())}>
                        Get Matched →
                    </button>
                </div>
            </div>

            {/* Income qualify chip */}
            {props.onRunScenario && (
                <div className="fha-followup-row">
                    <button
                        className="fha-followup-chip"
                        onClick={() => {
                            const prStr = price >= 1_000_000 ? `$${(price / 1_000_000).toFixed(1)}M` : `$${Math.round(price / 1000)}k`;
                            props.onRunScenario!(
                                `What income do I need to qualify for a ${prStr} FHA loan with ${downPct}% down at ${rate.toFixed(2)}%?`,
                                { isIncomeQualify: true, purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate, loanType: 'fha' }
                            );
                        }}
                    >
                        What income do I need to qualify? →
                    </button>
                </div>
            )}

            {/* Check a property */}
            <div className="fha-property-row">
                <button
                    className="fha-btn-property"
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
                >
                    Check a property →
                </button>
            </div>

            {/* Rate note */}
            <div className="fha-rate-note">
                <span className="fha-bulb">💡</span>
                <p>
                    <strong>Assumption:</strong> Rate seeded at <strong>{props.rate.toFixed(2)}%</strong> (FRED 30-yr fixed, live).
                    FHA MIP per HUD 2024 guidelines (0.55%/yr LTV &gt; 90%, 0.50%/yr ≤ 90%). Actual rate depends on credit score, lender, and lock timing.
                </p>
            </div>

            {/* Disclosures */}
            <div className="fha-disc">
                <p>
                    <strong>Educational estimates only.</strong> UFMIP of 1.75% is financed into the loan balance. Monthly MIP calculated on the base loan per HUD Mortgagee Letter guidelines.
                    Property tax estimated at {(props.taxRate * 100).toFixed(1)}% annually; homeowner&apos;s insurance at {(props.insRate * 100).toFixed(1)}% annually.
                    FHA loan limits per HUD 2026 schedule — county-specific limits may be higher in high-cost areas. These figures are not a pre-approval or commitment to lend.
                </p>
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

                /* topbar */
                .fha-topbar { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.02); }
                .fha-topbar-l { display:flex; align-items:center; gap:6px; }
                .fha-dot { width:7px; height:7px; border-radius:50%; background:#f59e0b; }
                .fha-tl { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#6b7a99; }
                .fha-tr { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#3a4560; }

                /* header */
                .fha-header { display:flex; align-items:center; gap:12px; padding:16px 16px 12px; }
                .fha-header-icon { width:36px; height:36px; border-radius:10px; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.2); display:flex; align-items:center; justify-content:center; color:#f59e0b; flex-shrink:0; }
                .fha-header-title { font-size:15px; font-weight:700; color:#f0f4ff; }
                .fha-header-sub { font-size:11px; color:#6b7a99; margin-top:2px; }

                /* limit band */
                .fha-band { margin:0 12px 12px; border-radius:10px; padding:10px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
                .fha-band--within   { background:rgba(0,232,122,0.05); border:1px solid rgba(0,232,122,0.15); }
                .fha-band--highcost { background:rgba(245,158,11,0.05); border:1px solid rgba(245,158,11,0.2); }
                .fha-band--exceeds  { background:rgba(239,68,68,0.05); border:1px solid rgba(239,68,68,0.2); }
                .fha-band-l { display:flex; align-items:center; gap:10px; }
                .fha-badge { font-size:9px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; padding:3px 10px; border-radius:20px; flex-shrink:0; }
                .fha-badge--within   { background:rgba(0,232,122,0.12); color:#00e87a; border:1px solid rgba(0,232,122,0.25); }
                .fha-badge--highcost { background:rgba(245,158,11,0.12); color:#f59e0b; border:1px solid rgba(245,158,11,0.25); }
                .fha-badge--exceeds  { background:rgba(239,68,68,0.12); color:#ef4444; border:1px solid rgba(239,68,68,0.25); }
                .fha-band-desc { font-size:11px; color:#8fa3b8; line-height:1.4; }
                .fha-strong { color:#f0f4ff; }
                .fha-band-r { font-size:10px; color:#3a4560; flex-shrink:0; text-align:right; }
                .fha-band-r span { display:block; font-size:11px; color:#6b7a99; font-weight:600; margin-top:2px; }

                /* hero */
                .fha-hero { margin:0 12px 12px; background:#0e1420; border:1px solid rgba(245,158,11,0.2); border-radius:14px; padding:20px 20px 16px; text-align:center; }
                .fha-hero-label { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#4a3510; margin-bottom:8px; }
                .fha-hero-amount { font-size:46px; font-weight:800; color:#f59e0b; letter-spacing:-2px; line-height:1; }
                .fha-hero-mo { font-size:18px; font-weight:600; color:#6b5a1e; letter-spacing:0; }
                .fha-hero-sub { font-size:12px; color:#8fa3b8; margin-top:6px; }
                .fha-hero-grid { display:grid; grid-template-columns:repeat(3,1fr); margin-top:14px; border-top:1px solid rgba(255,255,255,0.06); padding-top:12px; }
                .fha-hero-stat { text-align:center; padding:0 8px; border-right:1px solid rgba(255,255,255,0.06); }
                .fha-hero-stat:last-child { border-right:none; }
                .fha-hero-sl { font-size:9px; color:#3a4560; text-transform:uppercase; letter-spacing:.06em; font-weight:600; margin-bottom:4px; }
                .fha-hero-sv { font-size:13px; font-weight:700; color:#f0f4ff; }

                /* MIP callout */
                .fha-mip { margin:0 12px 12px; border-radius:12px; overflow:hidden; border:1px solid rgba(245,158,11,0.18); }
                .fha-mip-head { display:flex; align-items:center; gap:8px; padding:10px 14px; background:rgba(245,158,11,0.06); border-bottom:1px solid rgba(245,158,11,0.12); }
                .fha-mip-icon { font-size:14px; }
                .fha-mip-title { font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#f59e0b; }
                .fha-mip-rows { padding:10px 14px 8px; display:flex; flex-direction:column; gap:8px; }
                .fha-mip-row { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
                .fha-mip-row-label { font-size:12px; color:#8fa3b8; line-height:1.4; }
                .fha-mip-row-label small { font-size:10px; color:#3a4560; display:block; margin-top:2px; }
                .fha-mip-row-val { font-size:13px; font-weight:700; color:#f0f4ff; white-space:nowrap; text-align:right; }
                .fha-mip-row-val--amber { color:#f59e0b; }
                .fha-mip-divider { height:1px; background:rgba(255,255,255,0.05); margin:0 14px; }
                .fha-mip-dur { margin:8px 14px 12px; border-radius:8px; padding:9px 12px; display:flex; align-items:flex-start; gap:8px; font-size:12px; line-height:1.5; }
                .fha-mip-dur--warn { background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.15); color:#fca5a5; }
                .fha-mip-dur--good { background:rgba(0,232,122,0.05); border:1px solid rgba(0,232,122,0.15); color:#86efac; }
                .fha-mip-dur-icon { flex-shrink:0; font-size:14px; margin-top:1px; }

                /* breakdown */
                .fha-bkd { border-top:1px solid rgba(255,255,255,0.05); }
                .fha-bkd-toggle { width:100%; display:flex; align-items:center; justify-content:space-between; padding:10px 16px; background:transparent; border:none; cursor:pointer; font-family:inherit; }
                .fha-bkd-label { font-size:12px; font-weight:600; color:#8fa3b8; }
                .fha-bkd-chev { font-size:10px; color:#8fa3b8; transition:transform .2s; display:inline-block; transform:rotate(180deg); }
                .fha-bkd-chev.open { transform:rotate(0deg); }
                .fha-bkd-body { padding:0 16px 12px; }
                .fha-kv { display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
                .fha-kv--total { padding-top:8px; border-top:1px solid rgba(255,255,255,0.12); border-bottom:none; }
                .fha-kv-k { font-size:12px; color:#8fa3b8; }
                .fha-kv-v { font-size:12px; font-weight:600; color:#c4cfe0; }
                .fha-kv-v--amber { color:#f59e0b; }
                .fha-kv-v--green { color:#00e87a; }
                .fha-kv-v--red { color:#ef4444; }
                .fha-kv--total .fha-kv-k { font-weight:700; color:#c4cfe0; font-size:13px; }
                .fha-kv--total .fha-kv-v { font-weight:800; font-size:13px; }
                .fha-kv-s { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#6b7a99; padding:10px 0 4px; }
                .fha-kv-s:first-child { padding-top:4px; }

                /* explorer */
                .fha-exp { padding:12px 16px; border-top:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.015); }
                .fha-exp-head { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#6b7a99; margin-bottom:12px; }
                .fha-dp-chips { display:flex; gap:6px; margin:-4px 0 6px; }
                .fha-dp-chip { background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.1); border-radius:6px; padding:4px 10px; font-size:12px; font-weight:600; color:#8fa3b8; cursor:pointer; font-family:inherit; transition:all .15s; }
                .fha-dp-chip.active { background:rgba(245,158,11,0.1); border-color:rgba(245,158,11,0.35); color:#f59e0b; }
                .fha-dp-chip:hover { border-color:rgba(255,255,255,0.25); color:#f0f4ff; }
                .fha-dp-chip-note { font-size:9px; font-weight:600; margin-left:3px; opacity:.8; }
                .fha-dp-min-note { font-size:10px; color:#3a4560; margin:-2px 0 12px; }
                .fha-exp-term-label { font-size:12px; font-weight:600; color:#c4cfe0; margin-bottom:6px; }
                .fha-terms { display:flex; gap:6px; margin-bottom:14px; }
                .fha-term { flex:1; background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.1); border-radius:8px; padding:7px 0; font-size:13px; font-weight:600; color:#8fa3b8; cursor:pointer; font-family:inherit; transition:all .15s; text-align:center; }
                .fha-term--on { background:rgba(245,158,11,0.1); border-color:rgba(245,158,11,0.35); color:#f59e0b; }
                .fha-term:hover { border-color:rgba(255,255,255,0.25); color:#f0f4ff; }
                .fha-exp-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:2px; margin-bottom:12px; }
                .fha-exp-stat { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:8px; text-align:center; }
                .fha-exp-stat-label { font-size:10px; color:#6b7a99; margin-bottom:3px; }
                .fha-exp-stat-val { font-size:12px; font-weight:700; color:#c4cfe0; }

                /* actions */
                .fha-exp-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
                .fha-btn-rerun { background:#111827; color:#f9fafb; border:none; border-radius:8px; padding:10px 16px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:background .15s; }
                .fha-btn-rerun:hover { background:#1f2937; }
                .fha-btn-vault { display:flex; align-items:center; gap:6px; background:#00e87a; color:#07100f; border:none; border-radius:8px; padding:10px 16px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; flex-shrink:0; transition:opacity .15s; }
                .fha-btn-vault:hover { opacity:.88; }
                .fha-btn-match { margin-left:auto; background:#f59e0b; color:#1c0f00; border:none; border-radius:8px; padding:10px 22px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:opacity .15s; }
                .fha-btn-match:hover { opacity:.88; }

                /* check a property */
                .fha-followup-row { padding:0 12px 4px; }
                .fha-followup-chip { background:rgba(255,255,255,0.04); color:#8fa3b8; border:1.5px solid rgba(255,255,255,0.12); border-radius:8px; padding:10px 18px; font-size:13px; font-weight:600; cursor:pointer; font-family:inherit; transition:all .15s; }
                .fha-followup-chip:hover { background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.25); color:#f0f4ff; }
                .fha-property-row { padding:0 12px 10px; }
                .fha-btn-property { background:rgba(0,232,122,0.08); color:#00e87a; border:1.5px solid rgba(0,232,122,0.25); border-radius:8px; padding:10px 18px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; }
                .fha-btn-property:hover { background:rgba(0,232,122,0.15); border-color:rgba(0,232,122,0.45); }

                /* rate note */
                .fha-rate-note { margin:0 12px 12px; background:rgba(245,158,11,0.04); border:1px solid rgba(245,158,11,0.12); border-radius:10px; padding:10px 14px; display:flex; align-items:flex-start; gap:10px; }
                .fha-bulb { font-size:16px; flex-shrink:0; margin-top:1px; }
                .fha-rate-note p { font-size:12px; color:#8fa3b8; line-height:1.5; }
                .fha-rate-note strong { color:#f59e0b; }

                /* disclosures */
                .fha-disc { padding:0 16px 16px; }
                .fha-disc p { font-size:10px; color:#3a4560; line-height:1.5; }

                @media (max-width: 480px) {
                    .fha-hero-amount { font-size:34px; }
                    .fha-exp-stats { grid-template-columns:repeat(2,1fr); }
                    .fha-band-r { display:none; }
                }
            `}</style>
        </div>
    );
}
