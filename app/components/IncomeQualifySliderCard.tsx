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
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
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
    onRunScenario?: (seed: string, overrides: Record<string, any>) => void;
}

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
    const [monthlyDebt, setMonthlyDebt] = useState(0);
    const [bkdOpen,     setBkdOpen]     = useState(true);

    const [vaultDone, setVaultDone] = useState(false);

    const { user } = useUser();
    const router   = useRouter();

    // ── Derived values ──────────────────────────────────────────────────────

    const downAmt   = price * downPct / 100;
    const loanAmt   = price - downAmt;
    const ltv       = (loanAmt / price) * 100;
    const pi        = calcPI(loanAmt, rate, termYrs);
    const tax       = (price * props.taxRate) / 12;
    const ins       = (price * props.insRate) / 12;
    const pmi       = ltv > 80 ? (loanAmt * 0.008) / 12 : 0;
    const piti      = pi + tax + ins + pmi;
    const totalMo   = piti + monthlyDebt;

    const income43  = Math.round((totalMo / 0.43) * 12);
    const income36  = Math.round((totalMo / 0.36) * 12);
    const income28  = Math.round((totalMo / 0.28) * 12);

    const DP_CHIPS = [3, 5, 10, 20];

    function getMatchedUrl() {
        const p = new URLSearchParams({
            from: 'income', lt: 'Conventional', purpose: 'Purchase',
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

    function buildQualifySeed() {
        const prStr = price >= 1_000_000
            ? `$${(price / 1_000_000).toFixed(2)}M`
            : `$${Math.round(price / 1000)}k`;
        const incStr = fmt$(income43);
        return `I make ${incStr} per year — do I qualify for a ${prStr} home with ${downPct}% down at ${rate.toFixed(2)}%?`;
    }

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="iq">

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
                    <div className="iq-header-title">Income to Qualify</div>
                    <div className="iq-header-sub">{fmtK(price)} · {downPct}% down · {rate.toFixed(2)}% · {termYrs}yr fixed</div>
                </div>
            </div>

            {/* Hero — minimum income */}
            <div className="iq-hero">
                <div className="iq-hero-label">Minimum Annual Income (43% DTI)</div>
                <div className="iq-hero-amount">
                    {fmt$(income43)}<span className="iq-hero-yr">/yr</span>
                </div>
                <div className="iq-hero-sub">
                    Based on {fmt$(Math.round(piti))}/mo PITI{monthlyDebt > 0 ? ` + ${fmt$(monthlyDebt)}/mo debts` : ' — no other debts entered'}
                </div>
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

            {/* Monthly debt slider */}
            <div className="iq-debt-section">
                <SliderField
                    label="Your Other Monthly Debts"
                    value={monthlyDebt}
                    min={0} max={3000} step={50}
                    onChange={setMonthlyDebt}
                    format={v => v === 0 ? 'No other debts' : `${fmt$(v)}/mo`}
                    minLabel="$0" maxLabel="$3,000"
                    trackColor="#3d8bff" theme="light"
                />
                <div className="iq-debt-hint">
                    Car loan, student loans, credit cards, etc. — adds {monthlyDebt > 0 ? `${fmt$(Math.round((monthlyDebt / 0.43) * 12))} to annual income requirement` : 'nothing until you enter a value'}
                </div>
            </div>

            {/* DTI grid */}
            <div className="iq-dti-section">
                <div className="iq-dti-head">Required Income by DTI Threshold</div>
                <div className="iq-dti-grid">
                    <DTIRow pct="43%" label="Standard max (Fannie/Freddie)" annual={income43} active />
                    <DTIRow pct="36%" label="Conservative (strong file)" annual={income36} />
                    <DTIRow pct="28%" label="Front-end only (housing only)" annual={income28} />
                </div>
            </div>

            {/* Explorer — sliders */}
            <div className="iq-exp">
                <div className="iq-exp-head">Payment Explorer</div>

                {/* Home Price */}
                <SliderField
                    label="Home Price"
                    value={price}
                    min={100000} max={3000000} step={5000}
                    onChange={setPrice}
                    format={v => fmtK(v)}
                    minLabel="$100k" maxLabel="$3M"
                    trackColor="#00e87a" theme="light"
                />

                {/* Down Payment */}
                <SliderField
                    label="Down Payment"
                    value={downPct}
                    min={3} max={50} step={1}
                    onChange={setDownPct}
                    format={v => `${v}% · ${fmtK(price * v / 100)}`}
                    minLabel="3%" maxLabel="50%"
                    trackColor="#00e87a" theme="light"
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
                    trackColor="#00e87a" theme="light"
                />

                {/* Loan Term */}
                <div className="iq-exp-term-label">Loan Term</div>
                <div className="iq-terms">
                    {([15, 20, 30] as const).map(yr => (
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
                        <div className="iq-exp-stat-label">Monthly PMI</div>
                        <div className="iq-exp-stat-val" style={{ color: pmi > 0 ? '#f59e0b' : '#94a3b8' }}>
                            {pmi > 0 ? fmt$(pmi) + '/mo' : 'None'}
                        </div>
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
                        <KVRow k="PMI" v={pmi > 0 ? fmt$(pmi) : 'None (≥20% down)'} />
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
                {props.onRunScenario && (
                    <button
                        className="iq-btn-qualify"
                        onClick={() => props.onRunScenario!(buildQualifySeed(), {})}
                    >
                        I qualify — check my scenario →
                    </button>
                )}
                <button className="iq-btn-vault" onClick={handleVault}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                        <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd"/>
                    </svg>
                    {vaultDone ? 'Saved ✓' : 'My Vault'}
                </button>
                <PdfDownloadButton
                    type="conventional"
                    getParams={() => ({
                        price, downPct, rate, term: termYrs,
                        taxRate: props.taxRate, insRate: props.insRate,
                        loanType: 'conventional',
                    })}
                />
                <button className="iq-btn-match" onClick={() => router.push(getMatchedUrl())}>
                    Get Matched →
                </button>
            </div>

            {/* Rate note */}
            <div className="iq-rate-note">
                <span className="iq-bulb">💡</span>
                <p>
                    <strong>Assumption:</strong> Rate seeded at <strong>{props.rate.toFixed(2)}%</strong> (FRED 30-yr fixed, live).
                    DTI thresholds per Fannie Mae/Freddie Mac guidelines. Actual qualification depends on credit score, loan program, and lender overlays.
                </p>
            </div>

            {/* Disclosures */}
            <div className="iq-disc">
                <p>
                    <strong>Educational estimates only.</strong> Income requirements are calculated using standard 43% back-end DTI
                    (Fannie Mae DU guidelines). Actual lender requirements may vary. These figures are not a pre-approval or commitment
                    to lend. Monthly payment includes P&amp;I, estimated property tax ({(props.taxRate * 100).toFixed(1)}% annual),
                    homeowner&apos;s insurance ({(props.insRate * 100).toFixed(1)}% annual), and PMI where LTV exceeds 80%.
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
                .iq-tl { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#6b7a99; }
                .iq-tr { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#3a4560; }

                /* header */
                .iq-header { display:flex; align-items:center; gap:12px; padding:16px 16px 12px; }
                .iq-header-icon { width:36px; height:36px; border-radius:10px; background:rgba(61,139,255,0.12); border:1px solid rgba(61,139,255,0.2); display:flex; align-items:center; justify-content:center; color:#3d8bff; flex-shrink:0; }
                .iq-header-title { font-size:15px; font-weight:700; color:#f0f4ff; }
                .iq-header-sub { font-size:11px; color:#6b7a99; margin-top:2px; }

                /* hero */
                .iq-hero { margin:0 12px 12px; background:#0a111d; border:1px solid rgba(61,139,255,0.2); border-radius:14px; padding:20px 20px 16px; text-align:center; }
                .iq-hero-label { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#4b6080; margin-bottom:8px; }
                .iq-hero-amount { font-size:48px; font-weight:800; color:#3d8bff; letter-spacing:-2.5px; line-height:1; }
                .iq-hero-yr { font-size:20px; font-weight:600; color:#4b6080; letter-spacing:0; }
                .iq-hero-sub { font-size:12px; color:#8fa3b8; margin-top:8px; }
                .iq-hero-grid { display:grid; grid-template-columns:repeat(3,1fr); margin-top:14px; border-top:1px solid rgba(255,255,255,0.06); padding-top:12px; }
                .iq-hero-stat { text-align:center; padding:0 8px; border-right:1px solid rgba(255,255,255,0.06); }
                .iq-hero-stat:last-child { border-right:none; }
                .iq-hero-sl { font-size:9px; color:#3a4560; text-transform:uppercase; letter-spacing:.06em; font-weight:600; margin-bottom:4px; }
                .iq-hero-sv { font-size:13px; font-weight:700; color:#f0f4ff; }

                /* debt section */
                .iq-debt-section { padding:14px 16px 8px; border-top:1px solid rgba(255,255,255,0.05); }
                .iq-debt-hint { font-size:11px; color:#4b6080; margin-top:6px; padding-bottom:4px; line-height:1.4; }

                /* DTI grid */
                .iq-dti-section { padding:12px 16px; border-top:1px solid rgba(255,255,255,0.05); }
                .iq-dti-head { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#6b7a99; margin-bottom:8px; }
                .iq-dti-grid { display:flex; flex-direction:column; gap:4px; }
                .iq-dti-row { display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:9px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); }
                .iq-dti-row--active { background:rgba(61,139,255,0.06); border-color:rgba(61,139,255,0.22); }
                .iq-dti-pct { font-size:13px; font-weight:800; color:#f0f4ff; min-width:34px; }
                .iq-dti-row--active .iq-dti-pct { color:#3d8bff; }
                .iq-dti-label { font-size:11px; color:#6b7a99; flex:1; }
                .iq-dti-row--active .iq-dti-label { color:#8fa3b8; }
                .iq-dti-val { font-size:13px; font-weight:700; color:#6b7a99; }
                .iq-dti-val--blue { color:#3d8bff; font-size:14px; }
                .iq-dti-badge { font-size:9px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; padding:2px 8px; border-radius:20px; background:rgba(61,139,255,0.12); color:#3d8bff; border:1px solid rgba(61,139,255,0.25); flex-shrink:0; }

                /* explorer */
                .iq-exp { padding:12px 16px; border-top:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.015); }
                .iq-exp-head { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#6b7a99; margin-bottom:12px; }
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
                .iq-exp-stat-label { font-size:10px; color:#6b7a99; margin-bottom:3px; }
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
                .iq-kv-s { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#6b7a99; padding:10px 0 4px; }

                /* actions */
                .iq-actions { display:flex; align-items:center; gap:8px; padding:12px 16px; border-top:1px solid rgba(255,255,255,0.05); flex-wrap:wrap; }
                .iq-btn-qualify { background:rgba(61,139,255,0.1); color:#3d8bff; border:1.5px solid rgba(61,139,255,0.3); border-radius:8px; padding:10px 16px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; }
                .iq-btn-qualify:hover { background:rgba(61,139,255,0.18); border-color:rgba(61,139,255,0.5); }
                .iq-btn-vault { display:flex; align-items:center; gap:5px; background:rgba(255,255,255,0.04); color:#8fa3b8; border:1.5px solid rgba(255,255,255,0.1); border-radius:8px; padding:9px 14px; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; transition:all .15s; }
                .iq-btn-vault:hover { border-color:rgba(255,255,255,0.25); color:#f0f4ff; }
                .iq-btn-match { margin-left:auto; background:#00e87a; color:#07100f; border:none; border-radius:8px; padding:10px 20px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:opacity .15s; }
                .iq-btn-match:hover { opacity:.88; }

                /* rate note */
                .iq-rate-note { margin:0 12px 12px; background:rgba(61,139,255,0.04); border:1px solid rgba(61,139,255,0.12); border-radius:10px; padding:10px 14px; display:flex; align-items:flex-start; gap:10px; }
                .iq-bulb { font-size:16px; flex-shrink:0; margin-top:1px; }
                .iq-rate-note p { font-size:12px; color:#8fa3b8; line-height:1.5; }

                /* disclosures */
                .iq-disc { padding:0 16px 16px; }
                .iq-disc p { font-size:10px; color:#3a4560; line-height:1.5; }

                @media (max-width: 480px) {
                    .iq-hero-amount { font-size:34px; }
                    .iq-exp-stats { grid-template-columns:repeat(2,1fr); }
                    .iq-dti-label { display:none; }
                }
            `}</style>
        </div>
    );
}
