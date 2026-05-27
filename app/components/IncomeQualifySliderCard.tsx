'use client';

import React, { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import SliderField from './SliderField';
import PdfDownloadButton from './PdfDownloadButton';

// ── Math ─────────────────────────────────────────────────────────────────────

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
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(3).replace(/\.?0+$/, '')}M`;
    if (n >= 100_000)   return `$${Math.round(n / 1_000)}k`;
    return fmt$(n);
}

// ── Interface ─────────────────────────────────────────────────────────────────

export interface IncomeQualifySliderParams {
    price: number;
    downPct: number;
    rate: number;
    term: number;
    taxRate: number;
    insRate: number;
    loanType?: 'conventional' | 'fha' | 'jumbo' | 'va';
    annualIncome?: number;  // borrower's actual annual gross income — carried forward through adjusted scenarios
    monthlyDebt?: number;   // borrower's other monthly obligations — carried forward through adjusted scenarios
    /** G4: DSC computing state — disable "Run Adjusted Scenario" until L2/L3/L4 resolve */
    decisionScoreState?: 'computing' | 'complete';
    onRunScenario?: (seed: string, overrides: Record<string, any>) => void;
    journeyAddress?: string;
}

function iqNormKey(a: string) { return a.trim().toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').slice(0,100); }
function iqGetSid(a: string): string | null { try { return localStorage.getItem(`pi_sid_${iqNormKey(a)}`); } catch { return null; } }

// ── Sub-components ────────────────────────────────────────────────────────────

function DTIRow({ label, pct, annual, active }: { label: string; pct: string; annual: number; active?: boolean }) {
    return (
        <div className={`iq-dti-row${active ? ' iq-dti-row--active' : ''}`}>
            <div className="iq-dti-pct">{pct}</div>
            <div className="iq-dti-label">{label}</div>
            <div className={`iq-dti-val${active ? ' iq-dti-val--blue' : ''}`}>{fmt$(annual)}/yr</div>
            {active && <div className="iq-dti-badge">Standard</div>}
        </div>
    );
}

function KVRow({ k, v, highlight, total, section }: { k: string; v?: string; highlight?: boolean; total?: boolean; section?: boolean }) {
    if (section) return <div className="iq-kv-s">{k}</div>;
    return (
        <div className={`iq-kv${total ? ' iq-kv--total' : ''}`}>
            <span className="iq-kv-k">{k}</span>
            <span className={`iq-kv-v${highlight ? ' iq-kv-v--green' : ''}`}>{v}</span>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function IncomeQualifySliderCard(props: IncomeQualifySliderParams) {
    const [price,       setPrice]       = useState(props.price);
    const [downPct,     setDownPct]     = useState(props.downPct);
    const [rate,        setRate]        = useState(props.rate);
    const [termYrs,     setTermYrs]     = useState(props.term);
    const [monthlyDebt,  setMonthlyDebt]  = useState(props.monthlyDebt ?? 0);
    const [annualIncome, setAnnualIncome] = useState(props.annualIncome ?? 0);
    const [bkdOpen,      setBkdOpen]      = useState(true);

    const [vaultDone,    setVaultDone]    = useState(false);
    const [appliedBadge, setAppliedBadge] = useState(false);
    const [sliderOpen, setSliderOpen] = useState(false);
    const [drawerPhase, setDrawerPhase] = useState<'idle'|'running'|'done'>('idle');

    // Committed baseline — updated locally when "Run adjusted scenario" is clicked
    const [commitPrice,  setCommitPrice]  = useState(props.price);
    const [commitDown,   setCommitDown]   = useState(props.downPct);
    const [commitRate,   setCommitRate]   = useState(props.rate);
    const [commitTerm,   setCommitTerm]   = useState(props.term);
    const [commitDebt,   setCommitDebt]   = useState(props.monthlyDebt ?? 0);
    const [commitIncome, setCommitIncome] = useState(props.annualIncome ?? 0);

    const { user } = useUser();
    const router   = useRouter();

    // ── Journey: read existing session id set by parent slider card ───────────
    const [journeySid] = useState<string | null>(
        props.journeyAddress ? iqGetSid(props.journeyAddress) : null,
    );

    // ── Derived values ──────────────────────────────────────────────────────

    const isFHA    = props.loanType === 'fha';
    const isJumbo  = props.loanType === 'jumbo';
    const isVA     = props.loanType === 'va';

    const downAmt   = price * downPct / 100;
    const baseLoan  = price - downAmt;
    const ufmip     = isFHA ? Math.round(baseLoan * 0.0175) : 0;
    const loanAmt   = baseLoan + ufmip;           // financed amount (UFMIP rolled in for FHA)
    const ltv       = (baseLoan / price) * 100;
    const pi        = calcPI(loanAmt, rate, termYrs);
    const tax       = (price * props.taxRate) / 12;
    const ins       = (price * props.insRate) / 12;
    const pmi       = (!isFHA && !isJumbo && !isVA && ltv > 80) ? (baseLoan * 0.008) / 12 : 0;
    const monthlyMIP = isFHA ? Math.round((baseLoan * (ltv > 90 ? 0.0055 : 0.0050)) / 12) : 0;
    const piti      = pi + tax + ins + pmi + monthlyMIP;
    const totalMo   = piti + monthlyDebt;

    const income43  = Math.round((totalMo / 0.43) * 12);
    const income41  = Math.round((totalMo / 0.41) * 12);
    const income36  = Math.round((totalMo / 0.36) * 12);
    const income38  = Math.round((totalMo / 0.38) * 12);
    const income28  = Math.round((totalMo / 0.28) * 12);

    const reserves6mo  = Math.round(piti * 6);
    const reserves12mo = Math.round(piti * 12);

    // ── Borrower DTI — only when income is entered ──────────────────────────
    const monthlyIncome = annualIncome > 0 ? annualIncome / 12 : null;
    const backEndDTI    = monthlyIncome ? (totalMo / monthlyIncome) * 100 : null;
    const dtiClass  = backEndDTI == null ? '' : backEndDTI <= 28 ? 'excellent' : backEndDTI <= 36 ? 'strong' : backEndDTI <= 43 ? 'standard' : backEndDTI <= 49 ? 'elevated' : 'high';
    const dtiStatus = backEndDTI == null ? '' : backEndDTI <= 28 ? 'Exceptional — well below front-end limits' : backEndDTI <= 36 ? 'Strong — conservative debt load' : backEndDTI <= 43 ? 'Standard — at guideline limit' : backEndDTI <= 49 ? 'Elevated — approaching max' : 'High — may need compensating factors';
    const dtiColor  = backEndDTI == null ? '#3d8bff' : backEndDTI <= 28 ? '#00e87a' : backEndDTI <= 36 ? '#3d8bff' : backEndDTI <= 43 ? '#3d8bff' : backEndDTI <= 49 ? '#f59e0b' : '#ef4444';

    const DP_CHIPS  = isJumbo ? [20, 25, 30, 40] : isFHA ? [3.5, 5, 10] : isVA ? [0, 5, 10, 20] : [3, 5, 10, 20];
    const minDown   = isJumbo ? 20 : isFHA ? 3.5 : isVA ? 0 : 3;
    const priceMax  = isJumbo ? 15_000_000 : 3_000_000;
    const priceStep = isJumbo ? 25_000 : 5_000;

    function getMatchedUrl() {
        const lt = isJumbo ? 'Jumbo' : isFHA ? 'FHA' : 'Conventional';
        const p = new URLSearchParams({
            from: 'income', lt, purpose: 'Purchase',
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
                    question: `Income to qualify: ${fmtK(price)} · ${downPct}% down · ${rate.toFixed(2)}%`,
                    answer: `Min. income @ 43% DTI: ${fmt$(income43)}/yr · PITI: ${fmt$(Math.round(piti))}/mo`,
                    tool_id: 'vault_save_income_qualify',
                }),
            });
            setVaultDone(true);
        } catch { /* non-fatal */ }
    }

    const isDirty = price !== commitPrice || downPct !== commitDown ||
        Math.abs(rate - commitRate) > 0.001 || termYrs !== commitTerm || monthlyDebt !== commitDebt || annualIncome !== commitIncome;

    function handleCommit() {
        setCommitPrice(price);
        setCommitDown(downPct);
        setCommitRate(rate);
        setCommitTerm(termYrs);
        setCommitDebt(monthlyDebt);
        setCommitIncome(annualIncome);
        setAppliedBadge(true);
        setTimeout(() => setAppliedBadge(false), 1800);
    }

    async function handleDrawerRun() {
        setDrawerPhase('running');
        handleCommit();
        // Fire onRunScenario so parent can inject an adjusted scenario message (property_lookup path)
        if (props.onRunScenario) {
            const overrides = {
                downPaymentPct: downPct,
                rate,
                term:           termYrs,
                monthlyDebt,
                annualIncome:   annualIncome > 0 ? annualIncome : undefined,
                totalMonthly:   Math.round(totalMo),  // needed by parent for DTI computation
            };
            const incomeStr = annualIncome > 0 ? ` · ${fmtK(annualIncome)}/yr income` : '';
            const seed = `Run my numbers: ${downPct}% down · ${rate.toFixed(2)}% rate · ${termYrs}yr${incomeStr}`;
            props.onRunScenario(seed, overrides);
        }
        await new Promise<void>(r => setTimeout(r, 700));
        setDrawerPhase('done');
        await new Promise<void>(r => setTimeout(r, 1600));
        setSliderOpen(false);
        setDrawerPhase('idle');
    }

    function buildQualifySeed() {
        const prStr = price >= 1_000_000
            ? `$${(price / 1_000_000).toFixed(2)}M`
            : `$${Math.round(price / 1000)}k`;
        const incStr = fmt$(income43);
        if (isJumbo)  return `I make ${incStr} per year — can I qualify for a ${prStr} jumbo loan with ${downPct}% down at ${rate.toFixed(2)}%?`;
        if (isFHA)    return `I make ${incStr} per year — do I qualify for a ${prStr} FHA loan with ${downPct}% down at ${rate.toFixed(2)}%?`;
        if (isVA)     return `I make ${incStr} per year — do I qualify for a ${prStr} VA loan with ${downPct}% down at ${rate.toFixed(2)}%?`;
        return `I make ${incStr} per year — do I qualify for a ${prStr} home with ${downPct}% down at ${rate.toFixed(2)}%?`;
    }

    // ── Render ───────────────────────────────────────────────────────────────

    const TERMS = (isFHA || isVA) ? ([15, 30] as const) : ([15, 20, 30] as const);
    const rootCls = `iq${isFHA ? ' iq--fha' : isJumbo ? ' iq--jumbo' : isVA ? ' iq--va' : ''}`;

    return (
        <div className={rootCls}>

            {/* Topbar */}
            <div className="iq-topbar">
                <div className="iq-topbar-l">
                    <div className="iq-dot" />
                    <span className="iq-tl">AI Analysis</span>
                </div>
                <span className="iq-tr">Live · CalcEngine-Deterministic</span>
            </div>

            {/* Header */}
            <div className="iq-header">
                <div className="iq-header-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <div>
                    <div className="iq-header-title">Income to Qualify{isFHA ? ' — FHA' : isJumbo ? ' — Jumbo' : isVA ? ' — VA' : ''}</div>
                    <div className="iq-header-sub">{fmtK(price)} · {downPct}% down · {rate.toFixed(2)}% · {termYrs}yr {isFHA ? 'FHA' : isJumbo ? 'jumbo fixed' : isVA ? 'VA fixed' : 'fixed'}</div>
                </div>
            </div>

            {/* Hero — minimum income */}
            <div className="iq-hero">
                <div className="iq-hero-label">Minimum Annual Income ({isVA ? '41% DTI (VA guideline)' : '43% DTI'})</div>
                <div className="iq-hero-amount">
                    {fmt$(isVA ? income41 : income43)}<span className="iq-hero-yr">/yr</span>
                </div>
                <div className="iq-hero-sub">
                    Based on {fmt$(Math.round(piti))}/mo {isFHA ? 'PITI + MIP' : isVA ? 'PITI (no PMI)' : 'PITI'}{monthlyDebt > 0 ? ` + ${fmt$(monthlyDebt)}/mo debts` : ' — no other debts entered'}
                </div>
                {isJumbo && (
                    <div className="iq-hero-jumbo-note">
                        Jumbo lenders typically require 38–43% back-end DTI · 20%+ down · strong reserves
                    </div>
                )}
                {isVA && (
                    <div className="iq-hero-va-note">
                        VA uses 41% back-end DTI as primary guideline · No PMI ever · Residual income test also applies
                    </div>
                )}
                <div className="iq-hero-grid">
                    <div className="iq-hero-stat">
                        <div className="iq-hero-sl">Monthly PITI</div>
                        <div className="iq-hero-sv">{fmt$(Math.round(piti))}</div>
                    </div>
                    <div className="iq-hero-stat">
                        <div className="iq-hero-sl">Loan Amount</div>
                        <div className="iq-hero-sv">{fmt$(Math.round(loanAmt))}</div>
                    </div>
                    <div className="iq-hero-stat">
                        <div className="iq-hero-sl">Loan-to-Value</div>
                        <div className="iq-hero-sv">{ltv.toFixed(1)}%</div>
                    </div>
                </div>
            </div>

            {/* FHA MIP callout — only when FHA */}
            {isFHA && (
                <div className="iq-fha-callout">
                    <div className="iq-fha-callout-head">
                        <span className="iq-fha-callout-icon">🛡️</span>
                        <span className="iq-fha-callout-title">FHA Mortgage Insurance (MIP) raises your income floor</span>
                    </div>
                    <div className="iq-fha-callout-rows">
                        <div className="iq-fha-callout-row">
                            <span>Upfront MIP (UFMIP · 1.75% financed)</span>
                            <span className="iq-fha-callout-val">{fmt$(ufmip)} added to loan</span>
                        </div>
                        <div className="iq-fha-callout-divider" />
                        <div className="iq-fha-callout-row">
                            <span>Monthly MIP ({ltv > 90 ? '0.55' : '0.50'}%/yr on base loan)</span>
                            <span className="iq-fha-callout-val">{fmt$(monthlyMIP)}/mo</span>
                        </div>
                    </div>
                    <div className={`iq-fha-callout-dur${downPct >= 10 ? ' good' : ' warn'}`}>
                        {downPct >= 10
                            ? `✅ With ${downPct}% down, MIP cancels after 11 years — income floor drops by ${fmt$(Math.round((monthlyMIP / 0.43) * 12))}/yr at that point.`
                            : `⚠️ With ${downPct}% down, MIP runs for the life of the loan — adds ${fmt$(Math.round((monthlyMIP / 0.43) * 12))}/yr to your income requirement permanently.`
                        }
                    </div>
                </div>
            )}

            {/* Monthly debt slider */}
            <div className="iq-debt-section">
                <SliderField
                    label="Your Other Monthly Debts"
                    value={monthlyDebt}
                    min={0} max={3000} step={50}
                    onChange={setMonthlyDebt}
                    format={v => v === 0 ? 'No other debts' : `${fmt$(v)}/mo`}
                    minLabel="$0" maxLabel="$3,000"
                    trackColor="#3d8bff" theme="dark"
                />
                <div className="iq-debt-hint">
                    Car loan, student loans, credit cards, etc. — adds {monthlyDebt > 0 ? `${fmt$(Math.round((monthlyDebt / 0.43) * 12))} to annual income requirement` : 'nothing until you enter a value'}
                </div>
            </div>

            {/* Annual income — borrower strength */}
            <div className="iq-income-section">
                <SliderField
                    label="Your Annual Income"
                    value={annualIncome}
                    min={0} max={isJumbo ? 2_000_000 : 600_000} step={isJumbo ? 10_000 : 5_000}
                    onChange={setAnnualIncome}
                    format={v => v === 0 ? 'Not entered' : `${fmtK(v)}/yr`}
                    minLabel="$0" maxLabel={isJumbo ? '$2M' : '$600k'}
                    trackColor={isJumbo ? '#8b5cf6' : isVA ? '#14b8a6' : isFHA ? '#f59e0b' : '#3d8bff'} theme="dark"
                />
                {annualIncome === 0 && (
                    <div className="iq-income-hint">Enter your income to see your actual DTI and how it factors into your borrower score</div>
                )}
                {backEndDTI != null && (
                    <div className="iq-dti-strength">
                        <div className="iq-dti-strength-row">
                            <div>
                                <div className="iq-dti-strength-label">Your Back-End DTI</div>
                                <div className="iq-dti-strength-status">{dtiStatus}</div>
                            </div>
                            <div className={`iq-dti-strength-val iq-dti-strength-val--${dtiClass}`} style={{ color: dtiColor }}>
                                {backEndDTI.toFixed(1)}%
                            </div>
                        </div>
                        <div className="iq-dti-strength-bar">
                            <div
                                className="iq-dti-strength-fill"
                                style={{ width: `${Math.min(100, (backEndDTI / 60) * 100)}%`, background: dtiColor }}
                            />
                            {/* threshold markers */}
                            <div className="iq-dti-marker" style={{ left: `${(36/60)*100}%` }} title="36% — conservative" />
                            <div className="iq-dti-marker" style={{ left: `${(43/60)*100}%` }} title="43% — standard max" />
                            <div className="iq-dti-marker" style={{ left: `${(50/60)*100}%` }} title="50% — FHA limit" />
                        </div>
                        <div className="iq-dti-strength-legend">
                            <span>0%</span><span>36%</span><span>43%</span><span>50%</span><span>60%+</span>
                        </div>
                    </div>
                )}
            </div>

            {/* DTI grid */}
            <div className="iq-dti-section">
                <div className="iq-dti-head">Required Income by DTI Threshold</div>
                <div className="iq-dti-grid">
                    {isJumbo ? (
                        <>
                            <DTIRow pct="43%" label="Max (some jumbo lenders)" annual={income43} />
                            <DTIRow pct="38%" label="Typical jumbo cap" annual={income38} active />
                            <DTIRow pct="36%" label="Conservative / large loan" annual={income36} />
                        </>
                    ) : isVA ? (
                        <>
                            <DTIRow pct="41%" label="VA guideline (primary)" annual={income41} active />
                            <DTIRow pct="43%" label="Allowed with strong residual income" annual={income43} />
                            <DTIRow pct="36%" label="Conservative / high residual" annual={income36} />
                        </>
                    ) : (
                        <>
                            <DTIRow pct="43%" label="Standard max (Fannie/Freddie)" annual={income43} active />
                            <DTIRow pct="36%" label="Conservative (strong file)" annual={income36} />
                            <DTIRow pct="28%" label="Front-end only (housing only)" annual={income28} />
                        </>
                    )}
                </div>
            </div>

            {/* Jumbo reserves callout */}
            {isJumbo && (
                <div className="iq-reserves">
                    <div className="iq-reserves-head">
                        <span className="iq-reserves-icon">🏦</span>
                        <span className="iq-reserves-title">Jumbo Reserve Requirements</span>
                    </div>
                    <div className="iq-reserves-grid">
                        <div className="iq-reserves-item">
                            <div className="iq-reserves-label">6-Month Reserves</div>
                            <div className="iq-reserves-val">{fmtK(reserves6mo)}</div>
                            <div className="iq-reserves-note">Required for most jumbo loans ≤ {fmtK(2_000_000)}</div>
                        </div>
                        <div className="iq-reserves-item iq-reserves-item--hi">
                            <div className="iq-reserves-label">12-Month Reserves</div>
                            <div className="iq-reserves-val iq-reserves-val--hi">{fmtK(reserves12mo)}</div>
                            <div className="iq-reserves-note">Common for loans &gt; {fmtK(2_000_000)}</div>
                        </div>
                    </div>
                    <div className="iq-reserves-footer">
                        Reserves must be liquid — checking, savings, or verified investment accounts. Retirement accounts typically counted at 60%.
                    </div>
                </div>
            )}

            {/* Slider Drawer */}
            <button className={`iq-slider-trigger${sliderOpen ? ' open' : ''}`} onClick={() => setSliderOpen(o => !o)}>
                <div className="iq-trigger-left">
                    <span style={{ fontSize: 15 }}>⚙</span>
                    <div>
                        <div className="iq-trigger-title">Adjust Your Numbers</div>
                        {isDirty && <div className="iq-trigger-sub">● Changes pending</div>}
                    </div>
                </div>
                <span className="iq-trigger-arrow">{sliderOpen ? '▲ Close' : '▼ Open'}</span>
            </button>
            <div className={`iq-drawer${sliderOpen ? ' open' : ''}`}>
            {/* Explorer — sliders */}
            <div className="iq-exp">
                <div className="iq-exp-head">Payment Explorer</div>

                {/* Home Price */}
                <SliderField
                    label="Home Price"
                    value={price}
                    min={100000} max={priceMax} step={priceStep}
                    onChange={setPrice}
                    format={v => fmtK(v)}
                    minLabel="$100k" maxLabel={isJumbo ? '$15M' : '$3M'}
                    trackColor={isJumbo ? '#8b5cf6' : '#00e87a'} theme="dark"
                />

                {/* Down Payment */}
                <SliderField
                    label="Down Payment"
                    value={downPct}
                    min={minDown} max={50} step={isFHA ? 0.5 : 1}
                    onChange={v => setDownPct(Math.max(minDown, v))}
                    format={v => `${v}% · ${fmtK(price * v / 100)}`}
                    minLabel={`${minDown}%`} maxLabel="50%"
                    trackColor={isJumbo ? '#8b5cf6' : '#00e87a'} theme="dark"
                />
                <div className="iq-dp-chips">
                    {DP_CHIPS.map(pct => (
                        <button
                            key={pct}
                            className={`iq-dp-chip${downPct === pct ? ' active' : ''}`}
                            onClick={() => setDownPct(pct)}
                        >{pct}%</button>
                    ))}
                </div>

                {/* Interest Rate */}
                <SliderField
                    label="Interest Rate"
                    value={rate}
                    min={3} max={12} step={0.125}
                    onChange={setRate}
                    format={v => parseFloat(v.toFixed(3)) + '%'}
                    minLabel="3%" maxLabel="12%"
                    trackColor={isJumbo ? '#8b5cf6' : '#00e87a'} theme="dark"
                />

                {/* Loan Term */}
                <div className="iq-exp-term-label">Loan Term</div>
                <div className="iq-terms">
                    {TERMS.map(yr => (
                        <button
                            key={yr}
                            className={`iq-term${termYrs === yr ? ' iq-term--on' : ''}`}
                            onClick={() => setTermYrs(yr)}
                        >{yr}yr</button>
                    ))}
                </div>

                {/* Stats bar */}
                <div className="iq-exp-stats">
                    <div className="iq-exp-stat">
                        <div className="iq-exp-stat-label">Loan Amount</div>
                        <div className="iq-exp-stat-val">{fmt$(loanAmt)}</div>
                    </div>
                    <div className="iq-exp-stat">
                        <div className="iq-exp-stat-label">LTV</div>
                        <div className="iq-exp-stat-val">{ltv.toFixed(1)}%</div>
                    </div>
                    <div className="iq-exp-stat">
                        <div className="iq-exp-stat-label">Monthly PITI</div>
                        <div className="iq-exp-stat-val">{fmt$(Math.round(piti))}/mo</div>
                    </div>
                    <div className="iq-exp-stat">
                        <div className="iq-exp-stat-label">{isFHA ? 'Monthly MIP' : 'Monthly PMI'}</div>
                        <div className="iq-exp-stat-val" style={{ color: isVA ? '#14b8a6' : (isFHA ? monthlyMIP : pmi) > 0 ? '#f59e0b' : '#94a3b8' }}>
                            {isVA ? 'None (VA)' : isFHA ? (monthlyMIP > 0 ? fmt$(monthlyMIP) + '/mo' : 'None') : (pmi > 0 ? fmt$(pmi) + '/mo' : 'None')}
                        </div>
                    </div>
                </div>

                {/* Drawer CTA */}
                <div className="iq-drawer-cta">
                    {drawerPhase === 'idle' && !isDirty && <span className="iq-drawer-hint">Drag sliders to model a new scenario</span>}
                    {drawerPhase === 'idle' && isDirty && props.decisionScoreState === 'computing' && (
                        <button className="iq-drawer-run" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                            ⏳ Score Computing…
                        </button>
                    )}
                    {drawerPhase === 'idle' && isDirty && props.decisionScoreState !== 'computing' && (
                        <button className="iq-drawer-run" onClick={handleDrawerRun}>▶ Run Adjusted Scenario →</button>
                    )}
                    {drawerPhase === 'running' && <span className="iq-drawer-hint">Calculating…</span>}
                    {drawerPhase === 'done' && <span className="iq-drawer-done">✓ Numbers Updated</span>}
                </div>
            </div>
            </div>

            {/* Payment breakdown */}
            <div className="iq-bkd">
                <button className="iq-bkd-toggle" onClick={() => setBkdOpen(o => !o)}>
                    <span className="iq-bkd-label">⊞ &nbsp;Full payment breakdown</span>
                    <span className={`iq-bkd-chev${bkdOpen ? ' open' : ''}`}>▴</span>
                </button>
                {bkdOpen && (
                    <div className="iq-bkd-body">
                        <KVRow k="Monthly Payment" section />
                        <KVRow k="Principal &amp; Interest" v={fmt$(pi)} />
                        <KVRow k="Property Taxes" v={fmt$(tax)} />
                        <KVRow k="Home Insurance" v={fmt$(ins)} />
                        {isFHA
                            ? <KVRow k={`Monthly MIP (${ltv > 90 ? '0.55' : '0.50'}%/yr)`} v={fmt$(monthlyMIP)} />
                            : <KVRow k="PMI" v={pmi > 0 ? fmt$(pmi) : 'None (≥20% down)'} />
                        }
                        {monthlyDebt > 0 && <KVRow k="Other Monthly Debts" v={fmt$(monthlyDebt)} />}
                        <KVRow k="Total Monthly Obligations" v={fmt$(Math.round(totalMo))} total />
                        <KVRow k="Income Required" section />
                        <KVRow k="Min. income @ 43% DTI" v={`${fmt$(Math.round(totalMo / 0.43))}/mo · ${fmt$(income43)}/yr`} highlight />
                        <KVRow k="Conservative @ 36% DTI" v={`${fmt$(Math.round(totalMo / 0.36))}/mo · ${fmt$(income36)}/yr`} />
                    </div>
                )}
            </div>

            {/* Action buttons */}
            <div className="iq-actions">
                {!props.journeyAddress && (
                    <button
                        className="iq-btn-property"
                        onClick={() => {
                            const lt = isJumbo ? 'jumbo' : isFHA ? 'fha' : isVA ? 'va' : 'conventional';
                            const p = new URLSearchParams({
                                price:   String(Math.round(price)),
                                dp:      String(downPct),
                                rate:    rate.toFixed(3),
                                term:    String(termYrs),
                                lt,
                                taxRate: props.taxRate.toFixed(5),
                                insRate: props.insRate.toFixed(5),
                                ...(monthlyDebt > 0 ? { monthlyDebt: String(Math.round(monthlyDebt)) } : {}),
                            });
                            router.push(`/check-property?${p.toString()}`);
                        }}
                    >
                        Check a property →
                    </button>
                )}
                <button className="iq-btn-vault" onClick={handleVault}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                        <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd"/>
                    </svg>
                    {vaultDone ? 'Saved ✓' : 'My Vault'}
                </button>
                <PdfDownloadButton
                    type={isFHA ? 'fha' : 'conventional'}
                    getParams={() => ({
                        price, downPct, rate, term: termYrs,
                        taxRate: props.taxRate, insRate: props.insRate,
                        loanType: isFHA ? 'fha' : 'conventional',
                    })}
                />
            </div>

            {/* Rate note */}
            <div className="iq-rate-note">
                <span className="iq-bulb">💡</span>
                <p>
                    <strong>Assumption:</strong> Rate seeded at <strong>{props.rate.toFixed(2)}%</strong> (FRED 30-yr fixed, live).
                    {isJumbo
                        ? ' Jumbo lenders typically require 38–43% back-end DTI, 720+ credit score, and 20%+ down. Rates for qualified borrowers (720+ FICO, 20%+ down) can price at par or below conforming. Actual qualification depends on lender guidelines and asset verification.'
                        : isFHA
                            ? ' DTI thresholds per HUD/FHA guidelines. FHA MIP per HUD 2024 Mortgagee Letter (0.55%/yr LTV > 90%, 0.50%/yr ≤ 90%). UFMIP 1.75% financed. Actual rate depends on credit score and lender.'
                            : isVA
                                ? ' DTI per VA Pamphlet 26-7 guidelines. VA loans require no PMI regardless of down payment. Residual income test also applies — lenders verify remaining income after all obligations. Rates often at or below conventional for qualified borrowers.'
                                : ' DTI thresholds per Fannie Mae/Freddie Mac guidelines. Actual qualification depends on credit score, loan program, and lender overlays.'
                    }
                </p>
            </div>

            {/* Disclosures */}
            <div className="iq-disc">
                <p>
                    <strong>Educational estimates only.</strong> Income requirements are calculated using {isJumbo ? '38% typical jumbo' : isVA ? '41% VA guideline' : 'standard 43%'} back-end DTI.
                    {isJumbo
                        ? ` Jumbo loans are portfolio products — guidelines vary by lender. Reserve requirements, asset verification, and income documentation standards are more rigorous than conforming. Monthly payment includes P&I, estimated property tax (${(props.taxRate * 100).toFixed(2)}% annual), and homeowner's insurance (${(props.insRate * 100).toFixed(1)}% annual).`
                        : isFHA
                            ? ` FHA UFMIP of 1.75% is financed into the loan. Monthly MIP calculated on base loan per HUD Mortgagee Letter guidelines. MIP duration: life-of-loan with <10% down; 11 years with ≥10% down.`
                            : isVA
                                ? ` VA loans require no PMI regardless of LTV. Residual income requirements per VA Pamphlet 26-7 Table 41(a). Monthly payment includes P&I, estimated property tax (${(props.taxRate * 100).toFixed(1)}% annual), and homeowner's insurance (${(props.insRate * 100).toFixed(1)}% annual).`
                                : ` Fannie Mae DU guidelines. Monthly payment includes P&I, estimated property tax (${(props.taxRate * 100).toFixed(1)}% annual), homeowner's insurance (${(props.insRate * 100).toFixed(1)}% annual), and PMI where LTV exceeds 80%.`
                    } These figures are not a pre-approval or commitment to lend.
                </p>
            </div>

            {/* ── Styles ── */}
            <style>{`
                .iq {
                    background: #0d1117;
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 16px;
                    overflow: clip;
                    margin-top: 14px;
                    font-family: system-ui, -apple-system, sans-serif;
                    color: #f0f4ff;
                }

                /* topbar */
                .iq-topbar { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.02); }
                .iq-topbar-l { display:flex; align-items:center; gap:6px; }
                .iq-dot { width:7px; height:7px; border-radius:50%; background:#3d8bff; }
                .iq-tl { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color: #94a3b8; }
                .iq-tr { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color: #eaf8f7; }

                /* header */
                .iq-header { display:flex; align-items:center; gap:12px; padding:16px 16px 12px; }
                .iq-header-icon { width:36px; height:36px; border-radius:10px; background:rgba(61,139,255,0.12); border:1px solid rgba(61,139,255,0.2); display:flex; align-items:center; justify-content:center; color:#3d8bff; flex-shrink:0; }
                .iq-header-title { font-size:15px; font-weight:700; color:#f0f4ff; }
                .iq-header-sub { font-size:11px; color: #94a3b8; margin-top:2px; }

                /* hero */
                .iq-hero { margin:0 12px 12px; background:#0a111d; border:1px solid rgba(61,139,255,0.2); border-radius:14px; padding:20px 20px 16px; text-align:center; }
                .iq-hero-label { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#4b6080; margin-bottom:8px; }
                .iq-hero-amount { font-size:48px; font-weight:800; color:#3d8bff; letter-spacing:-2.5px; line-height:1; }
                .iq-hero-yr { font-size:20px; font-weight:600; color:#4b6080; letter-spacing:0; }
                .iq-hero-sub { font-size:12px; color:#8fa3b8; margin-top:8px; }
                .iq-hero-grid { display:grid; grid-template-columns:repeat(3,1fr); margin-top:14px; border-top:1px solid rgba(255,255,255,0.06); padding-top:12px; }
                .iq-hero-stat { text-align:center; padding:0 8px; border-right:1px solid rgba(255,255,255,0.06); }
                .iq-hero-stat:last-child { border-right:none; }
                .iq-hero-sl { font-size:9px; color: #eaf8f7; text-transform:uppercase; letter-spacing:.06em; font-weight:600; margin-bottom:4px; }
                .iq-hero-sv { font-size:13px; font-weight:700; color:#f0f4ff; }

                /* debt section */
                .iq-debt-section { padding:14px 16px 8px; border-top:1px solid rgba(255,255,255,0.05); }
                .iq-debt-hint { font-size:11px; color:#4b6080; margin-top:6px; padding-bottom:4px; line-height:1.4; }

                /* income section */
                .iq-income-section { padding:14px 16px 10px; border-top:1px solid rgba(255,255,255,0.05); }
                .iq-income-hint { font-size:11px; color:#4b6080; margin-top:6px; line-height:1.4; }
                .iq-dti-strength { margin-top:12px; background:rgba(255,255,255,0.025); border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:12px 14px; }
                .iq-dti-strength-row { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
                .iq-dti-strength-label { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#4b6080; margin-bottom:3px; }
                .iq-dti-strength-status { font-size:12px; color:#8fa3b8; }
                .iq-dti-strength-val { font-size:28px; font-weight:800; letter-spacing:-1px; }
                /* bar */
                .iq-dti-strength-bar { position:relative; height:6px; background:rgba(255,255,255,0.06); border-radius:3px; overflow:visible; }
                .iq-dti-strength-fill { height:100%; border-radius:3px; transition:width .3s, background .3s; }
                .iq-dti-marker { position:absolute; top:-3px; width:2px; height:12px; background:rgba(255,255,255,0.15); border-radius:1px; transform:translateX(-50%); }
                .iq-dti-strength-legend { display:flex; justify-content:space-between; margin-top:5px; font-size:9px; color:#4b6080; }

                /* DTI grid */
                .iq-dti-section { padding:12px 16px; border-top:1px solid rgba(255,255,255,0.05); }
                .iq-dti-head { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color: #94a3b8; margin-bottom:8px; }
                .iq-dti-grid { display:flex; flex-direction:column; gap:4px; }
                .iq-dti-row { display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:9px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); }
                .iq-dti-row--active { background:rgba(61,139,255,0.06); border-color:rgba(61,139,255,0.22); }
                .iq-dti-pct { font-size:13px; font-weight:800; color:#f0f4ff; min-width:34px; }
                .iq-dti-row--active .iq-dti-pct { color:#3d8bff; }
                .iq-dti-label { font-size:11px; color: #94a3b8; flex:1; }
                .iq-dti-row--active .iq-dti-label { color:#8fa3b8; }
                .iq-dti-val { font-size:13px; font-weight:700; color: #94a3b8; }
                .iq-dti-val--blue { color:#3d8bff; font-size:14px; }
                .iq-dti-badge { font-size:9px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; padding:2px 8px; border-radius:20px; background:rgba(61,139,255,0.12); color:#3d8bff; border:1px solid rgba(61,139,255,0.25); flex-shrink:0; }

                /* explorer */
                .iq-exp { padding:12px 16px; border-top:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.015); }
                .iq-exp-head { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color: #94a3b8; margin-bottom:12px; }
                .iq-dp-chips { display:flex; gap:6px; margin:-4px 0 12px; }
                .iq-dp-chip { background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.1); border-radius:6px; padding:4px 10px; font-size:12px; font-weight:600; color:#8fa3b8; cursor:pointer; font-family:inherit; transition:all .15s; }
                .iq-dp-chip.active { background:rgba(0,232,122,0.1); border-color:rgba(0,232,122,0.35); color:#00e87a; }
                .iq-dp-chip:hover { border-color:rgba(255,255,255,0.25); color:#f0f4ff; }
                .iq-exp-term-label { font-size:12px; font-weight:600; color:#c4cfe0; margin-bottom:6px; }
                .iq-terms { display:flex; gap:6px; margin-bottom:14px; }
                .iq-term { flex:1; background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.1); border-radius:8px; padding:7px 0; font-size:13px; font-weight:600; color:#8fa3b8; cursor:pointer; font-family:inherit; transition:all .15s; text-align:center; }
                .iq-term--on { background:rgba(0,232,122,0.1); border-color:rgba(0,232,122,0.35); color:#00e87a; }
                .iq-term:hover { border-color:rgba(255,255,255,0.25); color:#f0f4ff; }
                .iq-exp-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:2px; }
                .iq-exp-stat { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:8px; text-align:center; }
                .iq-exp-stat-label { font-size:10px; color: #94a3b8; margin-bottom:3px; }
                .iq-exp-stat-val { font-size:12px; font-weight:700; color:#c4cfe0; }

                /* breakdown */
                .iq-bkd { border-top:1px solid rgba(255,255,255,0.05); }
                .iq-bkd-toggle { width:100%; display:flex; align-items:center; justify-content:space-between; padding:10px 16px; background:transparent; border:none; cursor:pointer; font-family:inherit; }
                .iq-bkd-label { font-size:12px; font-weight:600; color:#8fa3b8; }
                .iq-bkd-chev { font-size:10px; color:#8fa3b8; transition:transform .2s; display:inline-block; transform:rotate(180deg); }
                .iq-bkd-chev.open { transform:rotate(0deg); }
                .iq-bkd-body { padding:0 16px 12px; }
                .iq-kv { display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
                .iq-kv--total { padding-top:8px; border-top:1px solid rgba(255,255,255,0.12); border-bottom:none; }
                .iq-kv-k { font-size:12px; color:#8fa3b8; }
                .iq-kv-v { font-size:12px; font-weight:600; color:#c4cfe0; }
                .iq-kv-v--green { color:#3d8bff; }
                .iq-kv--total .iq-kv-k { font-weight:700; color:#c4cfe0; font-size:13px; }
                .iq-kv--total .iq-kv-v { font-weight:800; color:#f0f4ff; font-size:13px; }
                .iq-kv-s { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color: #94a3b8; padding:10px 0 4px; }

                /* actions */
                .iq-actions { display:flex; align-items:center; gap:8px; padding:12px 16px; border-top:1px solid rgba(255,255,255,0.05); flex-wrap:wrap; }
                .iq-btn-rerun { background:transparent; color:#f0f4ff; border:1.5px solid rgba(255,255,255,0.2); border-radius:8px; padding:10px 16px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; }
                .iq-btn-rerun:hover { background:rgba(255,255,255,0.06); border-color:rgba(255,255,255,0.35); }
                .iq-applied-badge { font-size:13px; font-weight:600; color:#00e87a; padding:0 4px; align-self:center; }
                .iq-btn-property { background:rgba(0,232,122,0.08); color:#00e87a; border:1.5px solid rgba(0,232,122,0.25); border-radius:8px; padding:10px 16px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; }
                .iq-btn-property:hover { background:rgba(0,232,122,0.15); border-color:rgba(0,232,122,0.45); }
                .iq-btn-vault { display:flex; align-items:center; gap:6px; background:#00e87a; color:#07100f; border:none; border-radius:8px; padding:10px 16px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; flex-shrink:0; transition:opacity .15s; }
                .iq-btn-vault:hover { opacity:.88; }
                .iq-btn-match { margin-left:auto; background:#00e87a; color:#07100f; border:none; border-radius:8px; padding:10px 20px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:opacity .15s; }
                .iq-btn-match:hover { opacity:.88; }

                /* follow-up chips */

                /* rate note */
                .iq-rate-note { margin:0 12px 12px; background:rgba(61,139,255,0.04); border:1px solid rgba(61,139,255,0.12); border-radius:10px; padding:10px 14px; display:flex; align-items:flex-start; gap:10px; }
                .iq-bulb { font-size:16px; flex-shrink:0; margin-top:1px; }
                .iq-rate-note p { font-size:12px; color:#8fa3b8; line-height:1.5; }

                /* disclosures */
                .iq-disc { padding:0 16px 16px; }
                .iq-disc p { font-size:10px; color: #eaf8f7; line-height:1.5; }

                /* FHA amber theme overrides */
                .iq--fha .iq-dot { background:#f59e0b; }
                .iq--fha .iq-header-icon { background:rgba(245,158,11,0.1); border-color:rgba(245,158,11,0.2); color:#f59e0b; }
                .iq--fha .iq-hero { background:#0e1420; border-color:rgba(245,158,11,0.2); }
                .iq--fha .iq-hero-label { color:#4a3510; }
                .iq--fha .iq-hero-amount { color:#f59e0b; }
                .iq--fha .iq-hero-yr { color:#6b5a1e; }
                .iq--fha .iq-dti-row--active { background:rgba(245,158,11,0.06); border-color:rgba(245,158,11,0.22); }
                .iq--fha .iq-dti-row--active .iq-dti-pct { color:#f59e0b; }
                .iq--fha .iq-dti-badge { background:rgba(245,158,11,0.12); color:#f59e0b; border-color:rgba(245,158,11,0.25); }
                .iq--fha .iq-dti-val--blue { color:#f59e0b; }
                .iq--fha .iq-dp-chip.active { background:rgba(245,158,11,0.1); border-color:rgba(245,158,11,0.35); color:#f59e0b; }
                .iq--fha .iq-term--on { background:rgba(245,158,11,0.1); border-color:rgba(245,158,11,0.35); color:#f59e0b; }
                .iq--fha .iq-kv-v--green { color:#f59e0b; }
                .iq--fha .iq-btn-property { background:rgba(245,158,11,0.08); color:#f59e0b; border-color:rgba(245,158,11,0.25); }
                .iq--fha .iq-btn-property:hover { background:rgba(245,158,11,0.15); border-color:rgba(245,158,11,0.45); }
                .iq--fha .iq-btn-match { background:#f59e0b; color:#1c0f00; }
                .iq--fha .iq-rate-note { background:rgba(245,158,11,0.04); border-color:rgba(245,158,11,0.12); }

                /* Jumbo/VA hero notes */
                .iq-hero-jumbo-note { margin-top:8px; font-size:11px; color:#7c5cbf; font-style:italic; }
                .iq-hero-va-note { margin-top:8px; font-size:11px; color:#0e6b62; font-style:italic; }

                /* Jumbo reserves callout */
                .iq-reserves { margin:0 12px 12px; border-radius:12px; overflow:hidden; border:1px solid rgba(139,92,246,0.2); }
                .iq-reserves-head { display:flex; align-items:center; gap:8px; padding:9px 14px; background:rgba(139,92,246,0.06); border-bottom:1px solid rgba(139,92,246,0.12); }
                .iq-reserves-icon { font-size:14px; }
                .iq-reserves-title { font-size:11px; font-weight:700; color:#8b5cf6; letter-spacing:.04em; }
                .iq-reserves-grid { display:grid; grid-template-columns:1fr 1fr; }
                .iq-reserves-item { padding:10px 14px; border-right:1px solid rgba(255,255,255,0.05); }
                .iq-reserves-item:last-child { border-right:none; }
                .iq-reserves-item--hi { background:rgba(139,92,246,0.04); }
                .iq-reserves-label { font-size:10px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color: #94a3b8; margin-bottom:4px; }
                .iq-reserves-val { font-size:18px; font-weight:800; color:#c4cfe0; letter-spacing:-0.5px; }
                .iq-reserves-val--hi { color:#8b5cf6; }
                .iq-reserves-note { font-size:10px; color:#4b6080; margin-top:3px; line-height:1.4; }
                .iq-reserves-footer { padding:8px 14px; font-size:10px; color:#4b6080; line-height:1.5; border-top:1px solid rgba(255,255,255,0.04); }

                /* Jumbo purple theme overrides */
                .iq--jumbo .iq-dot { background:#8b5cf6; }
                .iq--jumbo .iq-header-icon { background:rgba(139,92,246,0.12); border-color:rgba(139,92,246,0.2); color:#8b5cf6; }
                .iq--jumbo .iq-hero { background:#0d0e1a; border-color:rgba(139,92,246,0.2); }
                .iq--jumbo .iq-hero-label { color:#3d2f6b; }
                .iq--jumbo .iq-hero-amount { color:#8b5cf6; }
                .iq--jumbo .iq-hero-yr { color:#5b4a9b; }
                .iq--jumbo .iq-dti-row--active { background:rgba(139,92,246,0.06); border-color:rgba(139,92,246,0.22); }
                .iq--jumbo .iq-dti-row--active .iq-dti-pct { color:#8b5cf6; }
                .iq--jumbo .iq-dti-badge { background:rgba(139,92,246,0.12); color:#8b5cf6; border-color:rgba(139,92,246,0.25); }
                .iq--jumbo .iq-dti-val--blue { color:#8b5cf6; }
                .iq--jumbo .iq-dp-chip.active { background:rgba(139,92,246,0.1); border-color:rgba(139,92,246,0.35); color:#8b5cf6; }
                .iq--jumbo .iq-term--on { background:rgba(139,92,246,0.1); border-color:rgba(139,92,246,0.35); color:#8b5cf6; }
                .iq--jumbo .iq-kv-v--green { color:#8b5cf6; }
                .iq--jumbo .iq-btn-property { background:rgba(139,92,246,0.08); color:#8b5cf6; border-color:rgba(139,92,246,0.25); }
                .iq--jumbo .iq-btn-property:hover { background:rgba(139,92,246,0.15); border-color:rgba(139,92,246,0.45); }
                .iq--jumbo .iq-btn-match { background:#8b5cf6; color:#fff; }
                .iq--jumbo .iq-rate-note { background:rgba(139,92,246,0.04); border-color:rgba(139,92,246,0.12); }

                /* VA teal theme overrides */
                .iq--va .iq-dot { background:#14b8a6; }
                .iq--va .iq-header-icon { background:rgba(20,184,166,0.12); border-color:rgba(20,184,166,0.2); color:#14b8a6; }
                .iq--va .iq-hero { background:#091916; border-color:rgba(20,184,166,0.2); }
                .iq--va .iq-hero-label { color:#0e4a45; }
                .iq--va .iq-hero-amount { color:#14b8a6; }
                .iq--va .iq-hero-yr { color:#1a6b62; }
                .iq--va .iq-dti-row--active { background:rgba(20,184,166,0.06); border-color:rgba(20,184,166,0.22); }
                .iq--va .iq-dti-row--active .iq-dti-pct { color:#14b8a6; }
                .iq--va .iq-dti-badge { background:rgba(20,184,166,0.12); color:#14b8a6; border-color:rgba(20,184,166,0.25); }
                .iq--va .iq-dti-val--blue { color:#14b8a6; }
                .iq--va .iq-dp-chip.active { background:rgba(20,184,166,0.1); border-color:rgba(20,184,166,0.35); color:#14b8a6; }
                .iq--va .iq-term--on { background:rgba(20,184,166,0.1); border-color:rgba(20,184,166,0.35); color:#14b8a6; }
                .iq--va .iq-kv-v--green { color:#14b8a6; }
                .iq--va .iq-btn-property { background:rgba(20,184,166,0.08); color:#14b8a6; border-color:rgba(20,184,166,0.25); }
                .iq--va .iq-btn-property:hover { background:rgba(20,184,166,0.15); border-color:rgba(20,184,166,0.45); }
                .iq--va .iq-btn-match { background:#14b8a6; color:#071513; }
                .iq--va .iq-rate-note { background:rgba(20,184,166,0.04); border-color:rgba(20,184,166,0.12); }

                /* FHA MIP callout */
                .iq-fha-callout { margin:0 12px 12px; border-radius:12px; overflow:hidden; border:1px solid rgba(245,158,11,0.18); }
                .iq-fha-callout-head { display:flex; align-items:center; gap:8px; padding:9px 14px; background:rgba(245,158,11,0.06); border-bottom:1px solid rgba(245,158,11,0.12); }
                .iq-fha-callout-icon { font-size:14px; }
                .iq-fha-callout-title { font-size:11px; font-weight:700; color:#f59e0b; letter-spacing:.04em; }
                .iq-fha-callout-rows { padding:8px 14px 6px; display:flex; flex-direction:column; gap:6px; }
                .iq-fha-callout-row { display:flex; justify-content:space-between; align-items:center; gap:12px; font-size:12px; color:#8fa3b8; }
                .iq-fha-callout-val { font-size:12px; font-weight:700; color:#f59e0b; white-space:nowrap; }
                .iq-fha-callout-divider { height:1px; background:rgba(255,255,255,0.05); margin:0; }
                .iq-fha-callout-dur { margin:6px 14px 10px; border-radius:8px; padding:8px 12px; font-size:11px; line-height:1.5; }
                .iq-fha-callout-dur.warn { background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.15); color:#fca5a5; }
                .iq-fha-callout-dur.good { background:rgba(0,232,122,0.05); border:1px solid rgba(0,232,122,0.15); color:#86efac; }

                /* slider drawer */
                @keyframes iqTriggerPulse { 0%,100%{box-shadow:none} 50%{box-shadow:0 0 14px rgba(61,139,255,0.08) inset} }
                @keyframes iqRunPulse { 0%,100%{box-shadow:none} 50%{box-shadow:0 0 20px rgba(61,139,255,0.28)} }
                .iq-slider-trigger { width:100%; display:flex; align-items:center; justify-content:space-between; padding:11px 16px; background:rgba(61,139,255,0.04); border:none; border-top:1px solid rgba(61,139,255,0.12); cursor:pointer; font-family:inherit; color:#c4cfe0; transition:background .2s,border-color .2s; animation:iqTriggerPulse 3s ease-in-out infinite; }
                .iq-slider-trigger:hover,.iq-slider-trigger.open { background:rgba(61,139,255,0.08); border-color:rgba(61,139,255,0.3); animation:none; }
                .iq-trigger-left { display:flex; align-items:center; gap:10px; }
                .iq-trigger-title { font-size:13px; font-weight:700; color:#c4cfe0; text-align:left; }
                .iq-trigger-sub { font-size:10px; color:#3d8bff; margin-top:1px; }
                .iq-trigger-arrow { font-size:11px; color: #94a3b8; flex-shrink:0; }
                .iq-drawer { max-height:0; overflow:hidden; transition:max-height 0.4s cubic-bezier(0.4,0,0.2,1); }
                .iq-drawer.open { max-height:900px; }
                .iq-drawer-cta { padding:4px 16px 12px; }
                .iq-drawer-hint { font-size:12px; color: #94a3b8; font-style:italic; }
                .iq-drawer-done { font-size:12px; color:#3d8bff; font-weight:700; }
                .iq-drawer-run { width:100%; padding:11px 0; background:rgba(61,139,255,0.1); color:#3d8bff; border:1.5px solid rgba(61,139,255,0.35); border-radius:10px; font-size:14px; font-weight:800; cursor:pointer; font-family:inherit; letter-spacing:.01em; transition:all .15s; animation:iqRunPulse 1.8s ease-in-out infinite; }
                .iq-drawer-run:hover { background:rgba(61,139,255,0.18); border-color:rgba(61,139,255,0.6); animation:none; }

                @media (max-width: 480px) {
                    .iq-hero-amount { font-size:34px; }
                    .iq-exp-stats { grid-template-columns:repeat(2,1fr); }
                    .iq-dti-label { display:none; }
                }
                @media (max-width: 640px) {
                    .iq-actions { flex-direction:column; gap:8px; }
                    .iq-actions button { width:100%; justify-content:center; text-align:center; margin-left:0; display:flex; }
                }
            `}</style>
        </div>
    );
}
