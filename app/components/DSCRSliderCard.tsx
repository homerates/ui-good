'use client';

import React, { useState, useMemo } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import SliderField from './SliderField';
import PdfDownloadButton from './PdfDownloadButton';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAINT_RATE      = 0.01;
const VACANCY_OPTIONS = [0, 5, 8, 10] as const;
const MGMT_OPTIONS    = [0, 8] as const;
const ACCENT          = '#00e87a';

// ── Math ──────────────────────────────────────────────────────────────────────

function calcPI(principal: number, annualRate: number, termYears: number): number {
    if (annualRate <= 0 || principal <= 0) return 0;
    const r = annualRate / 100 / 12;
    const n = termYears * 12;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmt$(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(n));
}
function fmtK(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(3).replace(/\.?0+$/, '')}M`;
    if (n >= 100_000)   return `$${Math.round(n / 1_000)}k`;
    return fmt$(n);
}
function fmtSigned(n: number) { return (n >= 0 ? '+' : '−') + fmt$(n); }
function fmtRate(r: number)   { return parseFloat(r.toFixed(3)) + '%'; }

// ── DSCR status ───────────────────────────────────────────────────────────────

function dscrStatus(dscr: number) {
    if (dscr >= 1.5)  return { label: 'Excellent  ≥1.5x',        icon: '✓', color: ACCENT,    bg: 'rgba(0,232,122,0.07)',  border: 'rgba(0,232,122,0.22)'  };
    if (dscr >= 1.25) return { label: 'Qualifies  ≥1.25x',       icon: '✓', color: ACCENT,    bg: 'rgba(0,232,122,0.05)',  border: 'rgba(0,232,122,0.18)'  };
    if (dscr >= 1.0)  return { label: 'Borderline  1.0–1.24x',   icon: '⚠', color: '#ff8c42', bg: 'rgba(255,140,66,0.07)', border: 'rgba(255,140,66,0.22)' };
    return                    { label: 'Does Not Qualify  <1.0x', icon: '✗', color: '#ff5f5f', bg: 'rgba(255,95,95,0.07)',  border: 'rgba(255,95,95,0.22)'  };
}

// ── Interface ─────────────────────────────────────────────────────────────────

export interface DSCRSliderParams {
    price:       number;
    rent:        number;
    downPct:     number;
    rate:        number;
    term?:       number;
    vacancyRate: number;   // 0–1 decimal (e.g. 0.05 = 5%)
    taxRate:     number;
    insRate:     number;
    onRunScenario?: (seed: string, overrides: Record<string, any>) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DSCRSliderCard(props: DSCRSliderParams) {
    const [price,    setPrice]    = useState(props.price);
    const [rent,     setRent]     = useState(props.rent);
    const [downPct,  setDownPct]  = useState(props.downPct);
    const [rate,     setRate]     = useState(props.rate);
    const [term]                  = useState(props.term ?? 30);
    const [vacancy,  setVacancy]  = useState(Math.round(props.vacancyRate * 100));
    const [mgmtPct,  setMgmtPct]  = useState(0);
    const [bkdOpen,     setBkdOpen]     = useState(true);
    const [rentReveal,  setRentReveal]  = useState(false);
    const [vaultDone,   setVaultDone]   = useState(false);

    const { user } = useUser();
    const router   = useRouter();

    const isDirty = price !== props.price || rent !== props.rent || downPct !== props.downPct ||
        Math.abs(rate - props.rate) > 0.001 || vacancy !== Math.round(props.vacancyRate * 100);

    // ── Derived ────────────────────────────────────────────────────────────────

    const calc = useMemo(() => {
        const vacRate       = vacancy / 100;
        const mgmtRate      = mgmtPct / 100;
        const downAmt       = price * downPct / 100;
        const loanAmt       = price - downAmt;
        const ltv           = (loanAmt / price) * 100;
        const pi            = calcPI(loanAmt, rate, term);
        const tax           = (price * props.taxRate) / 12;
        const ins           = (price * props.insRate) / 12;
        const pitia         = pi + tax + ins;
        const effectiveRent = rent * (1 - vacRate);
        const dscr          = pitia > 0 ? effectiveRent / pitia : 0;
        const maint         = (price * MAINT_RATE) / 12;
        const mgmt          = rent * mgmtRate;
        const cashFlow      = effectiveRent - pitia - maint - mgmt;
        const annualCF      = cashFlow * 12;
        const rentFor100    = pitia > 0 ? Math.ceil(pitia / (1 - vacRate)) : 0;
        const rentFor125    = pitia > 0 ? Math.ceil(pitia * 1.25 / (1 - vacRate)) : 0;
        const totalInterest = Math.max(0, pi * term * 12 - loanAmt);
        const grossYield    = price > 0 ? (rent * 12 / price) * 100 : 0;
        const capRate       = price > 0 ? ((rent * 12 - (tax + ins + maint) * 12) / price) * 100 : 0;
        return { downAmt, loanAmt, ltv, pi, tax, ins, pitia, effectiveRent, dscr, maint, mgmt, cashFlow, annualCF, rentFor100, rentFor125, totalInterest, grossYield, capRate };
    }, [price, rent, downPct, rate, term, vacancy, mgmtPct, props.taxRate, props.insRate]);

    const status    = dscrStatus(calc.dscr);
    const pitiaPct  = calc.effectiveRent > 0 ? Math.min(100, (calc.pitia / calc.effectiveRent) * 100) : 100;

    // ── Helpers ────────────────────────────────────────────────────────────────

    function buildSeed(): string {
        const vacClause = vacancy > 0 ? ` with ${vacancy}% vacancy` : '';
        return `DSCR loan on a ${fmtK(price)} investment property, ${fmtK(rent)}/mo rent, ${downPct}% down at ${fmtRate(rate)}${vacClause}`;
    }

    function getRunOverrides() {
        return { purchasePrice: price, monthlyRent: rent, downPaymentPct: downPct, annualRatePct: rate, vacancyRate: vacancy / 100, loanType: 'dscr' };
    }

    function getCheckPropertyUrl() {
        const p = new URLSearchParams({
            price:   String(Math.round(price)),
            dp:      String(downPct),
            rate:    rate.toFixed(3),
            term:    String(term),
            lt:      'dscr',
            taxRate: props.taxRate.toFixed(5),
            insRate: props.insRate.toFixed(5),
            rent:    String(Math.round(rent)),
        });
        return `/check-property?${p.toString()}`;
    }

    function getMatchedUrl() {
        const p = new URLSearchParams({
            from: 'dscr', lt: 'DSCR', purpose: 'Investment',
            price: String(Math.round(price)),
            dp: String(downPct),
            monthly: String(Math.round(calc.pitia)),
            rate: String(rate),
            term: String(term),
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
                    question: `DSCR investment: ${fmtK(price)} · ${fmtK(rent)}/mo rent · ${downPct}% down · ${rate.toFixed(2)}%`,
                    answer: `PITIA: ${fmt$(Math.round(calc.pitia))}/mo · DSCR: ${calc.dscr.toFixed(2)}x · Cash Flow: ${fmtSigned(calc.cashFlow)}/mo`,
                    tool_id: 'vault_save_dscr',
                }),
            });
            setVaultDone(true);
        } catch { /* non-fatal */ }
    }

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="dsc">

            {/* ① Topbar */}
            <div className="dsc-topbar">
                <div className="dsc-topbar-l">
                    <div className="dsc-dot" />
                    <span className="dsc-tl">AI Analysis</span>
                </div>
                <span className="dsc-tr">Live · CalcEngine-Deterministic</span>
            </div>

            {/* ② Header */}
            <div className="dsc-header">
                <div className="dsc-header-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75" />
                    </svg>
                </div>
                <div>
                    <div className="dsc-header-title">DSCR Investment Loan</div>
                    <div className="dsc-header-sub">{fmtK(price)} · {downPct}% down · {rate.toFixed(2)}% · {term}yr fixed · No income verification</div>
                </div>
            </div>

            {/* ③ Hero — Monthly PITIA (the actual scenario number, always first) */}
            <div className="dsc-hero">
                <div className="dsc-hero-label">Monthly PITIA (Principal · Interest · Tax · Insurance)</div>
                <div className="dsc-hero-amount">{fmt$(Math.round(calc.pitia))}<span className="dsc-hero-mo">/mo</span></div>
                <div className="dsc-hero-sub">Gross rent {fmt$(Math.round(rent))}/mo · No income docs required — lender qualifies on property cash flow</div>
                <div className="dsc-hero-grid">
                    <div className="dsc-hero-stat">
                        <div className="dsc-hero-sl">Loan Amount</div>
                        <div className="dsc-hero-sv">{fmtK(calc.loanAmt)}</div>
                    </div>
                    <div className="dsc-hero-stat">
                        <div className="dsc-hero-sl">Down Payment</div>
                        <div className="dsc-hero-sv">{fmt$(Math.round(calc.downAmt))}</div>
                    </div>
                    <div className="dsc-hero-stat">
                        <div className="dsc-hero-sl">LTV</div>
                        <div className="dsc-hero-sv">{calc.ltv.toFixed(1)}%</div>
                    </div>
                </div>
            </div>

            {/* ④ DSCR Analysis — ratio, cash flow, threshold */}
            <div className="dsc-analysis" style={{ background: status.bg, borderTop: `1px solid ${status.border}`, borderBottom: `1px solid ${status.border}` }}>
                <div className="dsc-analysis-top">
                    {/* DSCR ratio */}
                    <div>
                        <div className="dsc-analysis-label">DSCR Ratio</div>
                        <div className="dsc-dscr-num" style={{ color: status.color }}>
                            {calc.dscr.toFixed(2)}<span className="dsc-dscr-x">x</span>
                        </div>
                        <div className="dsc-status" style={{ color: status.color }}>
                            {status.icon} {status.label}
                        </div>
                        <div className="dsc-formula">
                            {fmt$(Math.round(calc.effectiveRent))} effective rent ÷ {fmt$(Math.round(calc.pitia))} PITIA
                        </div>
                    </div>

                    {/* Cash flow */}
                    <div className="dsc-cf-box">
                        <div className="dsc-cf-label">Monthly Cash Flow</div>
                        <div className="dsc-cf-val" style={{ color: calc.cashFlow >= 0 ? ACCENT : '#ff5f5f' }}>
                            {fmtSigned(calc.cashFlow)}/mo
                        </div>
                        <div className="dsc-cf-annual" style={{ color: calc.cashFlow >= 0 ? ACCENT : '#ff5f5f' }}>
                            {fmtSigned(calc.annualCF)}/yr
                        </div>
                        <div className="dsc-cf-note">after PITIA + maint{mgmtPct > 0 ? ' + mgmt' : ''}</div>
                    </div>
                </div>

                {/* Ratio bar */}
                <div className="dsc-ratio-bar-wrap">
                    <div className="dsc-ratio-bar">
                        <div className="dsc-ratio-rent" />
                        <div className="dsc-ratio-pitia" style={{ width: `${pitiaPct}%` }} />
                        <div className="dsc-ratio-marker" style={{ left: `${100 / 1.25}%` }}>
                            <div className="dsc-ratio-line" />
                            <div className="dsc-ratio-tag">1.25x</div>
                        </div>
                    </div>
                    <div className="dsc-ratio-legend">
                        <span><span className="dsc-dot-sm" style={{ background: ACCENT }} />Effective Rent {fmt$(Math.round(calc.effectiveRent))}</span>
                        <span><span className="dsc-dot-sm" style={{ background: '#3b82f6' }} />PITIA {fmt$(Math.round(calc.pitia))}</span>
                    </div>
                </div>

                {/* Threshold hints */}
                {calc.dscr < 1.25 && (
                    <div className="dsc-thresh">
                        {calc.dscr < 1.0 && <span>Rent needed for 1.0x: <strong>{fmt$(calc.rentFor100)}/mo</strong></span>}
                        <span>Rent needed for 1.25x: <strong>{fmt$(calc.rentFor125)}/mo</strong></span>
                    </div>
                )}

                {/* Return metrics */}
                <div className="dsc-returns">
                    <div className="dsc-return-stat">
                        <span className="dsc-return-label">Gross Yield</span>
                        <span className="dsc-return-val" style={{ color: ACCENT }}>{calc.grossYield.toFixed(1)}%</span>
                    </div>
                    <div className="dsc-return-stat">
                        <span className="dsc-return-label">Cap Rate</span>
                        <span className="dsc-return-val">{calc.capRate.toFixed(1)}%</span>
                    </div>
                    <div className="dsc-return-stat">
                        <span className="dsc-return-label">Annual Cash Flow</span>
                        <span className="dsc-return-val" style={{ color: calc.annualCF >= 0 ? ACCENT : '#ff5f5f' }}>{fmtSigned(calc.annualCF)}</span>
                    </div>
                </div>
            </div>

            {/* ⑤ Explorer — sliders */}
            <div className="dsc-exp">
                <div className="dsc-exp-head">Investment Explorer</div>

                <SliderField
                    label="Purchase Price" value={price}
                    min={100000} max={3000000} step={5000}
                    onChange={setPrice}
                    format={v => fmtK(v)}
                    minLabel="$100k" maxLabel="$3M"
                    trackColor={ACCENT} theme="dark"
                />

                <SliderField
                    label="Monthly Gross Rent" value={rent}
                    min={500} max={20000} step={50}
                    onChange={setRent}
                    format={v => `${fmtK(v)}/mo`}
                    minLabel="$500" maxLabel="$20k"
                    trackColor={ACCENT} theme="dark"
                />

                <SliderField
                    label="Down Payment" value={downPct}
                    min={15} max={40} step={1}
                    onChange={setDownPct}
                    format={v => `${v}% · ${fmtK(price * v / 100)}`}
                    minLabel="15%" maxLabel="40%"
                    trackColor={ACCENT} theme="dark"
                />

                <SliderField
                    label="Interest Rate" value={rate}
                    min={5} max={13} step={0.125}
                    onChange={setRate}
                    format={fmtRate}
                    minLabel="5%" maxLabel="13%"
                    trackColor={ACCENT} theme="dark"
                />

                {/* Vacancy + Mgmt toggles */}
                <div className="dsc-toggles">
                    <div className="dsc-toggle-group">
                        <span className="dsc-toggle-label">Vacancy</span>
                        <div className="dsc-toggle-btns">
                            {VACANCY_OPTIONS.map(v => (
                                <button key={v}
                                    className={`dsc-toggle-btn${vacancy === v ? ' dsc-toggle-btn--on' : ''}`}
                                    onClick={() => setVacancy(v)}
                                >{v}%</button>
                            ))}
                        </div>
                    </div>
                    <div className="dsc-toggle-group">
                        <span className="dsc-toggle-label">Mgmt Fee</span>
                        <div className="dsc-toggle-btns">
                            {MGMT_OPTIONS.map(m => (
                                <button key={m}
                                    className={`dsc-toggle-btn${mgmtPct === m ? ' dsc-toggle-btn--on' : ''}`}
                                    onClick={() => setMgmtPct(m)}
                                >{m === 0 ? 'None' : `${m}%`}</button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="dsc-exp-actions">
                    {isDirty && props.onRunScenario && (
                        <button className="dsc-btn-rerun" onClick={() => props.onRunScenario!(buildSeed(), getRunOverrides())}>
                            Run adjusted scenario →
                        </button>
                    )}
                    <button className="dsc-btn-vault" onClick={handleVault}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                            <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
                        </svg>
                        {vaultDone ? 'Saved ✓' : 'My Vault'}
                    </button>
                    <PdfDownloadButton
                        type="dscr"
                        getParams={() => ({ price, rent, downPct, rate, vacancyRate: vacancy / 100, taxRate: props.taxRate, insRate: props.insRate, mgmtPct })}
                    />
                    <button className="dsc-btn-match" onClick={() => router.push(getMatchedUrl())}>
                        Get Matched →
                    </button>
                </div>
            </div>

            {/* ⑥ Full breakdown toggle */}
            <div className="dsc-bkd">
                <button className="dsc-bkd-toggle" onClick={() => setBkdOpen(o => !o)}>
                    <span className="dsc-bkd-label">⊞ &nbsp;Full payment breakdown</span>
                    <span className={`dsc-bkd-chev${bkdOpen ? ' open' : ''}`}>▴</span>
                </button>
                {bkdOpen && (
                    <div className="dsc-bkd-body">
                        <div className="dsc-kv-s">Monthly PITIA</div>
                        <div className="dsc-kv"><span className="dsc-kv-k">Principal &amp; Interest</span><span className="dsc-kv-v">{fmt$(Math.round(calc.pi))}</span></div>
                        <div className="dsc-kv"><span className="dsc-kv-k">Property Taxes</span><span className="dsc-kv-v">{fmt$(Math.round(calc.tax))}</span></div>
                        <div className="dsc-kv"><span className="dsc-kv-k">Home Insurance</span><span className="dsc-kv-v">{fmt$(Math.round(calc.ins))}</span></div>
                        <div className="dsc-kv dsc-kv--total"><span className="dsc-kv-k">Total Monthly PITIA</span><span className="dsc-kv-v">{fmt$(Math.round(calc.pitia))}</span></div>
                        <div className="dsc-kv-s">Cash Flow Waterfall</div>
                        <div className="dsc-kv"><span className="dsc-kv-k">Gross Rent</span><span className="dsc-kv-v">{fmt$(Math.round(rent))}</span></div>
                        {vacancy > 0 && <div className="dsc-kv"><span className="dsc-kv-k">Vacancy ({vacancy}%)</span><span className="dsc-kv-v dsc-kv-v--neg">−{fmt$(Math.round(rent * vacancy / 100))}</span></div>}
                        <div className="dsc-kv"><span className="dsc-kv-k">Effective Rent</span><span className="dsc-kv-v">{fmt$(Math.round(calc.effectiveRent))}</span></div>
                        <div className="dsc-kv"><span className="dsc-kv-k">Less PITIA</span><span className="dsc-kv-v dsc-kv-v--neg">−{fmt$(Math.round(calc.pitia))}</span></div>
                        <div className="dsc-kv"><span className="dsc-kv-k">Less Maintenance (1%/yr)</span><span className="dsc-kv-v dsc-kv-v--neg">−{fmt$(Math.round(calc.maint))}</span></div>
                        {mgmtPct > 0 && <div className="dsc-kv"><span className="dsc-kv-k">Less Mgmt ({mgmtPct}%)</span><span className="dsc-kv-v dsc-kv-v--neg">−{fmt$(Math.round(calc.mgmt))}</span></div>}
                        <div className="dsc-kv dsc-kv--total"><span className="dsc-kv-k">Net Monthly Cash Flow</span><span className="dsc-kv-v" style={{ color: calc.cashFlow >= 0 ? ACCENT : '#ff5f5f' }}>{fmtSigned(calc.cashFlow)}</span></div>
                        <div className="dsc-kv-s">Annual Summary</div>
                        <div className="dsc-kv"><span className="dsc-kv-k">Annual Cash Flow</span><span className="dsc-kv-v" style={{ color: calc.annualCF >= 0 ? ACCENT : '#ff5f5f' }}>{fmtSigned(calc.annualCF)}</span></div>
                        <div className="dsc-kv"><span className="dsc-kv-k">Total Interest (30yr)</span><span className="dsc-kv-v">{fmt$(Math.round(calc.totalInterest))}</span></div>
                    </div>
                )}
            </div>

            {/* Check a property */}
            <div className="dsc-property-row">
                <button
                    className="dsc-btn-property"
                    onClick={() => router.push(getCheckPropertyUrl())}
                >
                    Check a property →
                </button>
            </div>

            {/* Inline rent-threshold reveal — no AI round-trip needed */}
            {rentReveal && (
                <div className="dsc-rent-reveal">
                    <div className="dsc-rent-reveal-head">Rent Thresholds at Current PITIA ({fmt$(Math.round(calc.pitia))}/mo)</div>
                    <div className="dsc-rent-reveal-rows">
                        <div className="dsc-rent-row">
                            <span className="dsc-rent-row-label">Break-even (1.0x DSCR)</span>
                            <span className="dsc-rent-row-val" style={{ color: '#ff8c42' }}>{fmt$(calc.rentFor100)}/mo</span>
                        </div>
                        <div className="dsc-rent-row">
                            <span className="dsc-rent-row-label">Most lenders require (1.25x)</span>
                            <span className="dsc-rent-row-val" style={{ color: ACCENT }}>{fmt$(calc.rentFor125)}/mo</span>
                        </div>
                        <div className="dsc-rent-row-note">
                            Your rent is {fmt$(Math.round(rent))}/mo — {rent >= calc.rentFor125 ? `${fmt$(Math.round(rent - calc.rentFor125))} above the 1.25x threshold ✓` : `${fmt$(Math.round(calc.rentFor125 - rent))} short of 1.25x`}
                        </div>
                    </div>
                </div>
            )}

            {/* ⑧ Note */}
            <div className="dsc-note">
                <span className="dsc-bulb">💡</span>
                <p>
                    <strong>No income docs.</strong> DSCR lenders qualify on the property&apos;s rental income alone — DSCR = Effective Rent ÷ PITIA. Most require ≥1.25x.
                    Rate seeded at <strong>{props.rate.toFixed(2)}%</strong> (FRED 30-yr, live). DSCR loans typically run 0.5–1.5% above conventional.
                    Maintenance 1%/yr is shown in cash flow but excluded from the DSCR ratio (as most lenders compute it).
                </p>
            </div>

            {/* ⑨ Disclosures */}
            <div className="dsc-disc">
                <p>
                    <strong>Educational estimates only.</strong> Tax {(props.taxRate * 100).toFixed(2)}%/yr · Insurance {(props.insRate * 100).toFixed(2)}%/yr.
                    DSCR thresholds vary by lender (1.0x–1.25x typical). Actual terms depend on credit, property type, and lender overlays. Not a pre-approval or commitment to lend.
                </p>
            </div>

            {/* ── Styles ── */}
            <style>{`
                .dsc {
                    background: #0d1117;
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 16px;
                    overflow: clip;
                    margin-top: 14px;
                    font-family: system-ui, -apple-system, sans-serif;
                    color: #f0f4ff;
                }

                /* topbar */
                .dsc-topbar { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.02); }
                .dsc-topbar-l { display:flex; align-items:center; gap:6px; }
                .dsc-dot { width:7px; height:7px; border-radius:50%; background:${ACCENT}; }
                .dsc-tl { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#6b7a99; }
                .dsc-tr { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#3a4560; }

                /* header */
                .dsc-header { display:flex; align-items:center; gap:12px; padding:16px 16px 12px; }
                .dsc-header-icon { width:36px; height:36px; border-radius:10px; background:rgba(0,232,122,0.1); border:1px solid rgba(0,232,122,0.2); display:flex; align-items:center; justify-content:center; color:${ACCENT}; flex-shrink:0; }
                .dsc-header-title { font-size:15px; font-weight:700; color:#f0f4ff; }
                .dsc-header-sub { font-size:11px; color:#6b7a99; margin-top:2px; }

                /* hero */
                .dsc-hero { margin:0 12px 0; background:#091a10; border:1px solid rgba(0,232,122,0.2); border-radius:14px; padding:20px 20px 16px; text-align:center; margin-bottom:0; }
                .dsc-hero-label { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#1a3a22; margin-bottom:8px; }
                .dsc-hero-amount { font-size:48px; font-weight:800; color:${ACCENT}; letter-spacing:-2.5px; line-height:1; }
                .dsc-hero-mo { font-size:20px; font-weight:600; color:#1a6635; letter-spacing:0; }
                .dsc-hero-sub { font-size:12px; color:#8fa3b8; margin-top:8px; }
                .dsc-hero-grid { display:grid; grid-template-columns:repeat(3,1fr); margin-top:14px; border-top:1px solid rgba(255,255,255,0.06); padding-top:12px; }
                .dsc-hero-stat { text-align:center; padding:0 8px; border-right:1px solid rgba(255,255,255,0.06); }
                .dsc-hero-stat:last-child { border-right:none; }
                .dsc-hero-sl { font-size:9px; color:#3a4560; text-transform:uppercase; letter-spacing:.06em; font-weight:600; margin-bottom:4px; }
                .dsc-hero-sv { font-size:13px; font-weight:700; color:#f0f4ff; }

                /* analysis */
                .dsc-analysis { padding:18px 16px 14px; margin-top:12px; }
                .dsc-analysis-top { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:16px; }
                .dsc-analysis-label { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#3a4560; margin-bottom:6px; }
                .dsc-dscr-num { font-size:clamp(2.6rem,6vw,3.2rem); font-weight:800; letter-spacing:-.05em; line-height:1; font-variant-numeric:tabular-nums; }
                .dsc-dscr-x { font-size:1.5rem; font-weight:700; letter-spacing:0; }
                .dsc-status { font-size:13px; font-weight:700; margin:5px 0 3px; }
                .dsc-formula { font-size:11px; color:#4b6080; font-variant-numeric:tabular-nums; }

                /* cash flow box */
                .dsc-cf-box { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07); border-radius:12px; padding:12px 16px; text-align:right; flex-shrink:0; }
                .dsc-cf-label { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:#3a4560; margin-bottom:4px; }
                .dsc-cf-val { font-size:1.4rem; font-weight:800; font-variant-numeric:tabular-nums; letter-spacing:-.02em; line-height:1; }
                .dsc-cf-annual { font-size:12px; font-weight:700; font-variant-numeric:tabular-nums; margin-top:3px; }
                .dsc-cf-note { font-size:9px; color:#3a4560; margin-top:4px; }

                /* ratio bar */
                .dsc-ratio-bar-wrap { margin-bottom:10px; }
                .dsc-ratio-bar { position:relative; height:14px; border-radius:9999px; overflow:visible; margin-bottom:8px; background:rgba(255,255,255,0.08); }
                .dsc-ratio-rent { position:absolute; inset:0; background:${ACCENT}; border-radius:9999px; opacity:.2; }
                .dsc-ratio-pitia { position:absolute; top:0; left:0; bottom:0; background:#3b82f6; border-radius:9999px; transition:width .2s ease; opacity:.7; }
                .dsc-ratio-marker { position:absolute; top:-4px; bottom:-4px; transform:translateX(-50%); }
                .dsc-ratio-line { width:2px; height:100%; background:#f59e0b; border-radius:1px; margin:0 auto; }
                .dsc-ratio-tag { position:absolute; top:-18px; left:50%; transform:translateX(-50%); font-size:9px; font-weight:700; color:#d97706; white-space:nowrap; background:rgba(245,158,11,0.12); padding:1px 5px; border-radius:4px; }
                .dsc-ratio-legend { display:flex; gap:16px; font-size:11px; color:#4b6080; }
                .dsc-ratio-legend span { display:flex; align-items:center; gap:5px; }
                .dsc-dot-sm { display:inline-block; width:8px; height:8px; border-radius:50%; flex-shrink:0; }

                /* threshold hints */
                .dsc-thresh { display:flex; gap:16px; flex-wrap:wrap; font-size:11px; color:#4b6080; margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.06); }
                .dsc-thresh strong { color:#f0f4ff; }

                /* return metrics row */
                .dsc-returns { display:grid; grid-template-columns:repeat(3,1fr); margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.06); }
                .dsc-return-stat { text-align:center; padding:0 8px; border-right:1px solid rgba(255,255,255,0.06); }
                .dsc-return-stat:last-child { border-right:none; }
                .dsc-return-label { display:block; font-size:9px; color:#3a4560; text-transform:uppercase; letter-spacing:.06em; font-weight:600; margin-bottom:4px; }
                .dsc-return-val { font-size:13px; font-weight:700; color:#f0f4ff; }

                /* explorer */
                .dsc-exp { padding:16px 16px 12px; border-top:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.015); }
                .dsc-exp-head { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#6b7a99; margin-bottom:12px; }

                /* toggles */
                .dsc-toggles { display:flex; gap:16px; flex-wrap:wrap; margin-top:4px; }
                .dsc-toggle-group { display:flex; flex-direction:column; gap:6px; flex:1; min-width:130px; }
                .dsc-toggle-label { font-size:12px; font-weight:600; color:#c4cfe0; }
                .dsc-toggle-btns { display:flex; gap:6px; }
                .dsc-toggle-btn { flex:1; padding:6px 0; background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.1); border-radius:8px; font-size:12px; font-weight:600; color:#8fa3b8; cursor:pointer; font-family:inherit; transition:all .15s; }
                .dsc-toggle-btn--on { background:rgba(0,232,122,0.08); border-color:rgba(0,232,122,0.3); color:${ACCENT}; }
                .dsc-toggle-btn:hover:not(.dsc-toggle-btn--on) { border-color:rgba(255,255,255,0.25); color:#f0f4ff; }

                /* actions */
                .dsc-exp-actions { display:flex; align-items:center; gap:8px; margin-top:14px; flex-wrap:wrap; }
                .dsc-btn-rerun { background:rgba(0,232,122,0.08); color:${ACCENT}; border:1.5px solid rgba(0,232,122,0.25); border-radius:8px; padding:8px 14px; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; }
                .dsc-btn-rerun:hover { background:rgba(0,232,122,0.15); }
                .dsc-btn-vault { display:flex; align-items:center; gap:5px; background:rgba(255,255,255,0.04); color:#8fa3b8; border:1.5px solid rgba(255,255,255,0.1); border-radius:8px; padding:9px 14px; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; transition:all .15s; }
                .dsc-btn-vault:hover { border-color:rgba(255,255,255,0.25); color:#f0f4ff; }
                .dsc-btn-match { margin-left:auto; background:${ACCENT}; color:#00150a; border:none; border-radius:8px; padding:10px 20px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:opacity .15s; }
                .dsc-btn-match:hover { opacity:.88; }

                /* breakdown */
                .dsc-bkd { border-top:1px solid rgba(255,255,255,0.05); }
                .dsc-bkd-toggle { width:100%; display:flex; align-items:center; justify-content:space-between; padding:10px 16px; background:transparent; border:none; cursor:pointer; font-family:inherit; }
                .dsc-bkd-label { font-size:12px; font-weight:600; color:#8fa3b8; }
                .dsc-bkd-chev { font-size:10px; color:#8fa3b8; transition:transform .2s; display:inline-block; transform:rotate(180deg); }
                .dsc-bkd-chev.open { transform:rotate(0deg); }
                .dsc-bkd-body { padding:0 16px 12px; }
                .dsc-kv { display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
                .dsc-kv--total { padding-top:8px; border-top:1px solid rgba(255,255,255,0.12); border-bottom:none; }
                .dsc-kv-k { font-size:12px; color:#8fa3b8; }
                .dsc-kv-v { font-size:12px; font-weight:600; color:#c4cfe0; }
                .dsc-kv-v--neg { color:#ff5f5f !important; }
                .dsc-kv--total .dsc-kv-k { font-weight:700; color:#c4cfe0; font-size:13px; }
                .dsc-kv--total .dsc-kv-v { font-weight:800; color:#f0f4ff; font-size:13px; }
                .dsc-kv-s { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#6b7a99; padding:10px 0 4px; }

                /* check a property */
                .dsc-property-row { padding:0 12px 10px; }
                .dsc-btn-property { background:rgba(0,232,122,0.08); color:#00e87a; border:1.5px solid rgba(0,232,122,0.25); border-radius:8px; padding:10px 18px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; }
                .dsc-btn-property:hover { background:rgba(0,232,122,0.15); border-color:rgba(0,232,122,0.45); }

                /* rent reveal */
                .dsc-rent-reveal { margin:0 12px 12px; background:rgba(0,232,122,0.05); border:1px solid rgba(0,232,122,0.18); border-radius:12px; overflow:hidden; }
                .dsc-rent-reveal-head { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#1a6635; padding:8px 14px; background:rgba(0,232,122,0.06); border-bottom:1px solid rgba(0,232,122,0.12); }
                .dsc-rent-reveal-rows { padding:10px 14px; display:flex; flex-direction:column; gap:8px; }
                .dsc-rent-row { display:flex; justify-content:space-between; align-items:center; }
                .dsc-rent-row-label { font-size:12px; color:#8fa3b8; }
                .dsc-rent-row-val { font-size:13px; font-weight:800; font-variant-numeric:tabular-nums; }
                .dsc-rent-row-note { font-size:11px; color:#4b6080; padding-top:6px; border-top:1px solid rgba(255,255,255,0.05); }

                /* note */
                .dsc-note { margin:0 12px 12px; background:rgba(0,232,122,0.04); border:1px solid rgba(0,232,122,0.12); border-radius:10px; padding:10px 14px; display:flex; align-items:flex-start; gap:10px; }
                .dsc-bulb { font-size:16px; flex-shrink:0; margin-top:1px; }
                .dsc-note p { font-size:12px; color:#8fa3b8; line-height:1.5; }
                .dsc-note strong { color:#f0f4ff; }

                /* disclosures */
                .dsc-disc { padding:0 16px 16px; }
                .dsc-disc p { font-size:10px; color:#3a4560; line-height:1.5; }

                @media (max-width: 480px) {
                    .dsc-hero-amount { font-size:34px; }
                    .dsc-dscr-num { font-size:2.2rem; }
                    .dsc-returns { grid-template-columns:repeat(3,1fr); }
                    .dsc-cf-box { text-align:left; }
                }
            `}</style>
        </div>
    );
}
