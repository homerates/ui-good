'use client';

import React, { useState } from 'react';
import SliderField from './SliderField';
import { COLORS } from '../../lib/tokens';

// ── Math ──────────────────────────────────────────────────────────────────────

function calcPI(principal: number, annualRate: number, termYears: number): number {
    if (principal <= 0) return 0;
    if (annualRate <= 0) return principal / (termYears * 12);
    const r = annualRate / 100 / 12;
    const n = termYears * 12;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

type BdType = '2/1' | '1/0' | '3/2/1';

interface BdYear {
    label:    string;
    rate:     number;
    pi:       number;
    piti:     number;
    subsidy:  number; // annual cost of this buydown year (0 for note-rate year)
    isFinal:  boolean;
}

function buildSchedule(
    loan: number, noteRate: number, termYears: number,
    moTax: number, moIns: number, bdType: BdType
): BdYear[] {
    const pi = (r: number) => calcPI(loan, r, termYears);
    const piNote = pi(noteRate);
    const row = (label: string, drop: number, isFinal = false): BdYear => {
        const rate = isFinal ? noteRate : noteRate - drop;
        const piVal = pi(rate);
        return {
            label, rate, pi: piVal,
            piti: Math.round(piVal + moTax + moIns),
            subsidy: isFinal ? 0 : (piNote - piVal) * 12,
            isFinal,
        };
    };
    if (bdType === '3/2/1') return [row('Year 1',3), row('Year 2',2), row('Year 3',1), row('Year 4+',0,true)];
    if (bdType === '1/0')   return [row('Year 1',1), row('Year 2+',0,true)];
    return [row('Year 1',2), row('Year 2',1), row('Year 3+',0,true)];
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
function fmtRate(r: number) { return parseFloat(r.toFixed(3)) + '%'; }

const LOAN_TYPE_LABEL: Record<string, string> = {
    conventional: 'Conventional',
    jumbo:        'Jumbo',
    va:           'VA',
    fha:          'FHA',
};

// ── Interface ─────────────────────────────────────────────────────────────────

export interface BuydownSliderParams {
    price:        number;
    downPct:      number;
    rate:         number;
    term:         number;
    taxRate:      number;
    insRate:      number;
    loanType:     'conventional' | 'jumbo' | 'va' | 'fha';
    buydownType:  BdType;
    sellerCredit?: number;
    onRunScenario?: (seed: string, overrides: Record<string, unknown>) => void;
}

const DP_CHIPS = [0, 5, 10, 20, 25] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function BuydownSliderCard(props: BuydownSliderParams) {
    const [price,        setPrice]        = useState(props.price);
    const [downPct,      setDownPct]      = useState(props.downPct);
    const [rate,         setRate]         = useState(props.rate);
    const [bdType,       setBdType]       = useState<BdType>(props.buydownType);
    const [sellerCredit, setSellerCredit] = useState(props.sellerCredit ?? 0);
    const [activeYrIdx,  setActiveYrIdx]  = useState(0);
    const [infoOpen,     setInfoOpen]     = useState(false);

    // ── Derived ──────────────────────────────────────────────────────────────
    const term     = props.term;
    const loan     = Math.round(price * (1 - downPct / 100));
    const moTax    = price * props.taxRate / 12;
    const moIns    = price * props.insRate / 12;
    const ltv      = loan / price * 100;
    const pmi      = ltv > 80 && props.loanType === 'conventional' ? loan * 0.008 / 12 : 0;
    const schedule = buildSchedule(loan, rate, term, moTax + pmi, moIns, bdType);
    const noteYear = schedule[schedule.length - 1];
    const curYear  = schedule[Math.min(activeYrIdx, schedule.length - 1)];
    const savings  = noteYear.piti - curYear.piti;
    const totalCost = Math.round(schedule.reduce((s, y) => s + y.subsidy, 0));

    // Permanent buydown comparison (same dollars as buydown cost)
    const ptsPossible  = loan > 0 ? totalCost / (loan / 100) : 0;
    const rateReduct   = ptsPossible * 0.25;
    const permRate     = Math.max(rate - rateReduct, 2.5);
    const permPI       = calcPI(loan, permRate, term);
    const permPITI     = Math.round(permPI + moTax + moIns);
    const permSavMo    = noteYear.piti - permPITI;
    const permBreakEven = permSavMo > 0 ? Math.ceil(totalCost / permSavMo) : null;

    // ── Handlers ─────────────────────────────────────────────────────────────

    function handleRun() {
        const seed = `Run ${bdType} buydown on ${fmtK(price)} ${LOAN_TYPE_LABEL[props.loanType]} purchase at ${fmtRate(rate)} note rate with ${downPct}% down`;
        props.onRunScenario?.(seed, {
            purchasePrice:  price,
            downPaymentPct: downPct,
            annualRatePct:  rate,
            loanType:       props.loanType,
            buydownType:    bdType,
            sellerCredit,
        });
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="bds">

            {/* Header */}
            <div className="bds-header">
                <div className="bds-header-left">
                    <span className="bds-title">{LOAN_TYPE_LABEL[props.loanType]} Purchase — Rate Buydown</span>
                    <span className="bds-sub">{fmtK(price)} · {downPct}% down · {fmtRate(rate)} note rate · {term}yr Fixed</span>
                </div>
                <span className="bds-badge">{bdType} Buydown</span>
            </div>

            {/* Year tabs */}
            <div className="bds-year-nav">
                {schedule.map((yr, i) => (
                    <React.Fragment key={i}>
                        {i > 0 && <span className="bds-year-arrow">›</span>}
                        <button
                            className={`bds-year-btn${activeYrIdx === i ? ' active' : ''}`}
                            onClick={() => setActiveYrIdx(i)}
                        >
                            {yr.label}
                        </button>
                    </React.Fragment>
                ))}
            </div>

            {/* Hero */}
            <div className="bds-hero">
                <div className="bds-hero-main">
                    <div className="bds-hero-piti">{fmt$(curYear.piti)}<span className="bds-hero-mo">/mo</span></div>
                    <div className="bds-hero-lbl">{curYear.isFinal ? 'PITI at Note Rate' : `PITI — ${curYear.label} Rate`}</div>
                    <div className="bds-rate-badge">{curYear.isFinal ? `${fmtRate(curYear.rate)} Note Rate` : `⬇ ${fmtRate(curYear.rate)} in ${curYear.label}`}</div>
                </div>
                <div className="bds-hero-stat">
                    <div className="bds-hero-sv">{fmtK(loan)}</div>
                    <div className="bds-hero-sl">Loan Amount</div>
                </div>
                <div className="bds-hero-stat">
                    {savings > 0
                        ? <><div className="bds-hero-sv bds-savings">{fmt$(savings)}/mo</div><div className="bds-hero-sl">Monthly Savings</div></>
                        : <><div className="bds-hero-sv" style={{ color: '#666' }}>—</div><div className="bds-hero-sl">vs Note Rate</div></>
                    }
                </div>
            </div>

            {/* Schedule table */}
            <div className="bds-div" />
            <div className="bds-sec">Year-by-Year Buydown Schedule</div>
            <div className="bds-table">
                <div className="bds-th-row">
                    <span className="bds-th">Period</span>
                    <span className="bds-th bds-tr-r">Rate</span>
                    <span className="bds-th bds-tr-r">PITI</span>
                    <span className="bds-th bds-tr-r">Savings</span>
                </div>
                {schedule.map((yr, i) => (
                    <div key={i} className={`bds-tr${activeYrIdx === i ? ' active' : ''}`} onClick={() => setActiveYrIdx(i)}>
                        <span className="bds-td-lbl">{yr.label}</span>
                        <span className={`bds-td bds-tr-r${yr.isFinal ? ' bds-td-dim' : ' bds-td-rate'}`}>{fmtRate(yr.rate)}</span>
                        <span className="bds-td bds-tr-r">{fmt$(yr.piti)}</span>
                        <span className={`bds-td bds-tr-r${yr.isFinal ? ' bds-td-dim' : ' bds-td-save'}`}>
                            {yr.isFinal ? '—' : `-${fmt$(Math.round(noteYear.piti - yr.piti))}/mo`}
                        </span>
                    </div>
                ))}
            </div>

            {/* Cost callout */}
            <div className="bds-cost-box">
                <div>
                    <div className="bds-cost-label">Total Buydown Cost</div>
                    <div className="bds-cost-value">{fmt$(totalCost)}</div>
                    <div className="bds-cost-note">Paid at closing · negotiable as seller credit</div>
                </div>
                <div className="bds-cost-right">
                    <div className="bds-cost-label">Seller Credit</div>
                    <div className={`bds-cost-value${sellerCredit >= totalCost && sellerCredit > 0 ? ' bds-covered' : ''}`}>
                        {sellerCredit > 0 ? fmt$(sellerCredit) : '—'}
                    </div>
                    {sellerCredit > 0 && (
                        <div className="bds-cost-note">
                            {sellerCredit >= totalCost
                                ? `✓ Covers full cost (+${fmt$(sellerCredit - totalCost)} left)`
                                : `${fmt$(totalCost - sellerCredit)} short`}
                        </div>
                    )}
                </div>
            </div>

            {/* Monthly breakdown */}
            <div className="bds-div" />
            <div className="bds-sec">Monthly Breakdown <span className="bds-sec-yr">({curYear.label})</span></div>
            <div className="bds-bd">
                <div className="bds-bd-row"><span className="bds-bd-lbl">Principal &amp; Interest ({fmtRate(curYear.rate)})</span><span className="bds-bd-val">{fmt$(Math.round(curYear.pi))}</span></div>
                <div className="bds-bd-row"><span className="bds-bd-lbl">Property Taxes (est. {(props.taxRate * 100).toFixed(1)}%/yr)</span><span className="bds-bd-val">{fmt$(Math.round(moTax))}</span></div>
                <div className="bds-bd-row"><span className="bds-bd-lbl">Home Insurance (est. {(props.insRate * 100).toFixed(1)}%/yr)</span><span className="bds-bd-val">{fmt$(Math.round(moIns))}</span></div>
                {pmi > 0 && <div className="bds-bd-row"><span className="bds-bd-lbl">PMI</span><span className="bds-bd-val">{fmt$(Math.round(pmi))}</span></div>}
                {pmi === 0 && <div className="bds-bd-row"><span className="bds-bd-lbl">PMI</span><span className="bds-bd-val-green">None ({downPct}% down)</span></div>}
                <div className="bds-bd-total"><span>Total Monthly PITI</span><span className="bds-bd-total-val">{fmt$(curYear.piti)}</span></div>
            </div>

            {/* Adjusters */}
            <div className="bds-div" />
            <div className="bds-sec">Adjust Your Numbers</div>
            <div className="bds-sliders">

                <div className="bds-slider-wrap">
                    <SliderField label="Home Price" value={price} min={200_000} max={5_000_000} step={25_000}
                        onChange={setPrice} format={v => fmtK(v)}
                        parse={v => { const c = v.replace(/[$,\s]/g,''); const n = parseFloat(c); if (isNaN(n)) return price; return c.toLowerCase().includes('m') ? n*1_000_000 : n; }}
                        minLabel="$200k" maxLabel="$5M+" trackColor={COLORS.amber} theme="dark" />
                </div>

                <div className="bds-slider-wrap">
                    <SliderField label="Down Payment" value={downPct} min={0} max={60} step={1}
                        onChange={setDownPct} format={v => `${v}% · ${fmtK(price * v / 100)}`}
                        minLabel="0%" maxLabel="60%" trackColor={COLORS.amber} theme="dark" />
                    <div className="bds-chips">
                        {DP_CHIPS.map(pct => (
                            <button key={pct} className={`bds-chip${Math.round(downPct) === pct ? ' active' : ''}`} onClick={() => setDownPct(pct)}>{pct}%</button>
                        ))}
                    </div>
                </div>

                <div className="bds-slider-wrap">
                    <SliderField label="Note Rate (Year 3+)" value={rate} min={3} max={12} step={0.125}
                        onChange={setRate} format={v => fmtRate(v)}
                        minLabel="3%" maxLabel="12%" midLabel={`FRED: ${fmtRate(props.rate)}`}
                        trackColor={COLORS.amber} theme="dark" />
                    <div className="bds-fred-tag">📡 Seeded from FRED live rate: {fmtRate(props.rate)}</div>
                </div>

                <div className="bds-slider-wrap">
                    <div className="bds-field-label">Buydown Type</div>
                    <div className="bds-type-chips">
                        {(['1/0', '2/1', '3/2/1'] as BdType[]).map(t => (
                            <button key={t} className={`bds-type-chip${bdType === t ? ' active' : ''}`} onClick={() => { setBdType(t); setActiveYrIdx(0); }}>
                                <span className="bds-type-name">{t}</span>
                                <span className="bds-type-sub">
                                    {t === '1/0' ? '-1% Yr 1' : t === '2/1' ? '-2% Yr 1 · -1% Yr 2' : '-3% → -2% → -1%'}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bds-slider-wrap">
                    <div className="bds-field-label">Seller Credit</div>
                    <div className="bds-credit-row">
                        <span className="bds-credit-icon">🤝</span>
                        <span className="bds-credit-lbl">Applied toward buydown cost</span>
                        <input
                            className="bds-credit-input"
                            type="text"
                            defaultValue={sellerCredit > 0 ? fmt$(sellerCredit) : '$0'}
                            onBlur={e => {
                                const raw = e.target.value.replace(/[$,\s]/g, '');
                                const n = parseFloat(raw);
                                const v = isNaN(n) ? 0 : Math.max(0, n);
                                setSellerCredit(v);
                                e.target.value = fmt$(v);
                            }}
                        />
                    </div>
                </div>

            </div>

            {/* CTA */}
            <div className="bds-div" />
            <div className="bds-cta-wrap">
                <button className="bds-cta" onClick={handleRun}>Run My Numbers</button>
            </div>

            {/* Advisory drawer */}
            <div className="bds-info-trigger" onClick={() => setInfoOpen(o => !o)}>
                <span>📘 How Buydowns Work — Common Questions &amp; Strategy</span>
                <span className={`bds-info-chev${infoOpen ? ' open' : ''}`}>▼</span>
            </div>

            {infoOpen && (
                <div className="bds-info-body">

                    {/* Permanent buydown comparison */}
                    <div className="bds-info-sec">Temporary vs Permanent Buydown — Same {fmt$(totalCost)}</div>
                    <div className="bds-perm-grid">
                        <div className="bds-perm-col">
                            <div className="bds-perm-col-label">{bdType} Temporary</div>
                            <div className="bds-perm-col-rate">{fmtRate(schedule[0].rate)} Yr 1</div>
                            <div className="bds-perm-col-note">Resets to {fmtRate(rate)} after period</div>
                            <div className="bds-perm-col-win">✓ Wins if you refinance in 1–{schedule.length - 1} yrs</div>
                        </div>
                        <div className="bds-perm-col bds-perm-col--alt">
                            <div className="bds-perm-col-label">Permanent Points</div>
                            <div className="bds-perm-col-rate">{fmtRate(permRate)} forever</div>
                            <div className="bds-perm-col-note">{fmt$(permSavMo)}/mo savings forever</div>
                            <div className="bds-perm-col-win">✓ Wins after {permBreakEven ? `${Math.ceil(permBreakEven / 12)} yr${Math.ceil(permBreakEven / 12) > 1 ? 's' : ''}` : 'long hold'} if no refi</div>
                        </div>
                    </div>
                    <div className="bds-perm-note">
                        {ptsPossible.toFixed(2)} pts purchased · {fmtRate(rateReduct)} rate reduction · break-even {permBreakEven ? `${permBreakEven} months` : 'N/A'}
                    </div>

                    {/* Q&A */}
                    <div className="bds-info-sec" style={{ marginTop: 16 }}>Common Questions</div>
                    <div className="bds-qa-list">
                        <div className="bds-qa">
                            <div className="bds-qa-q">What is a rate buydown?</div>
                            <div className="bds-qa-a">A temporary reduction in your mortgage interest rate, paid as a lump sum at closing. The difference between your reduced payment and the full payment is covered by a dedicated escrow account each month until it runs out.</div>
                        </div>
                        <div className="bds-qa">
                            <div className="bds-qa-q">Who can pay for it?</div>
                            <div className="bds-qa-a">Anyone — seller, builder, lender, or you. Most commonly negotiated as a seller concession, especially in slower markets. Conventional loans allow seller concessions up to 3–9% of purchase price depending on LTV. VA allows up to 4%.</div>
                        </div>
                        <div className="bds-qa">
                            <div className="bds-qa-q">Where is the money held?</div>
                            <div className="bds-qa-a">In a custodial escrow account maintained by your loan servicer, separate from your regular impound account. The servicer draws from it monthly to make up the payment shortfall — you never touch the funds directly.</div>
                        </div>
                        <div className="bds-qa">
                            <div className="bds-qa-q">What if I refinance during the buydown period?</div>
                            <div className="bds-qa-a">Any unused buydown funds are typically applied as a principal reduction on your existing loan at payoff — they do not transfer to the new loan. Always ask your lender: "If I refi in Year 1, what happens to the remaining escrow balance?" before signing.</div>
                        </div>
                        <div className="bds-qa">
                            <div className="bds-qa-q">Is this the same as builder teaser rates?</div>
                            <div className="bds-qa-a">Same mechanism — builders fund 2/1 buydowns as a sales incentive rather than cutting the price. The key difference: builders typically build the buydown cost into the inflated purchase price. Always compare the builder's offer against buying the same home at market price with a lender-funded buydown.</div>
                        </div>
                        <div className="bds-qa">
                            <div className="bds-qa-q">When does a temporary buydown beat permanent points?</div>
                            <div className="bds-qa-a">If you plan to refinance within {schedule.length - 1 === 1 ? '1 year' : `${schedule.length - 1} years`}, the temporary buydown almost always wins — you got the rate relief and the permanent points would never have broken even. In a declining rate environment, the buydown preserves maximum refi upside. Permanent points only win on a long hold with stable or rising rates.</div>
                        </div>
                    </div>

                </div>
            )}

            {/* ── Styles ── */}
            <style>{`
                .bds {
                    width: 100%;
                    background: #0e1420;
                    border: 1px solid rgba(245,158,11,0.22);
                    border-radius: 18px;
                    overflow: clip;
                    font-family: var(--font-dm-sans, "DM Sans", system-ui, sans-serif);
                    color: #f0f4ff;
                }

                /* header */
                .bds-header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px 0; gap:10px; }
                .bds-header-left { display:flex; flex-direction:column; gap:3px; min-width:0; }
                .bds-title { font-size:0.72rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:rgba(185,208,192,0.55); }
                .bds-sub { font-size:0.72rem; color:rgba(185,208,192,0.35); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                .bds-badge { display:inline-flex; align-items:center; padding:4px 12px; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.28); border-radius:20px; font-size:0.75rem; font-weight:700; color:#f59e0b; white-space:nowrap; flex-shrink:0; }

                /* year nav */
                .bds-year-nav { display:flex; align-items:center; gap:4px; padding:12px 20px 0; }
                .bds-year-btn { flex:1; padding:6px 0; background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.08); border-radius:8px; font-size:0.75rem; font-weight:600; color:rgba(185,208,192,0.5); cursor:pointer; font-family:inherit; transition:all 0.15s; text-align:center; }
                .bds-year-btn:hover { border-color:rgba(255,255,255,0.2); color:#f0f4ff; }
                .bds-year-btn.active { background:rgba(245,158,11,0.1); border-color:rgba(245,158,11,0.4); color:#f59e0b; }
                .bds-year-arrow { font-size:0.65rem; color:#333; flex-shrink:0; }

                /* hero */
                .bds-hero { display:grid; grid-template-columns:1.4fr 1fr 1fr; gap:10px; padding:14px 20px 0; }
                .bds-hero-main { background:rgba(255,255,255,0.04); border-radius:12px; padding:16px 12px; text-align:center; min-width:0; }
                .bds-hero-stat { background:rgba(255,255,255,0.04); border-radius:12px; padding:14px 12px; text-align:center; min-width:0; }
                .bds-hero-piti { font-size:clamp(1.3rem,4.5vw,1.9rem); font-weight:800; line-height:1; color:#f59e0b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                .bds-hero-mo { font-size:0.65em; font-weight:600; opacity:0.7; }
                .bds-hero-lbl { font-size:0.62rem; color:rgba(185,208,192,0.5); margin-top:5px; text-transform:uppercase; letter-spacing:0.04em; }
                .bds-rate-badge { display:inline-block; margin-top:7px; padding:3px 8px; background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.25); border-radius:20px; font-size:0.65rem; font-weight:700; color:#f59e0b; white-space:nowrap; }
                .bds-hero-sv { font-size:clamp(1rem,3.5vw,1.2rem); font-weight:800; color:#f0f4ff; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                .bds-hero-sl { font-size:0.62rem; color:rgba(185,208,192,0.5); margin-top:5px; text-transform:uppercase; letter-spacing:0.04em; }
                .bds-savings { color:#00e87a !important; }

                /* divider + section */
                .bds-div { height:1px; background:rgba(255,255,255,0.06); margin:16px 20px 0; }
                .bds-sec { font-size:0.68rem; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; color:rgba(185,208,192,0.45); padding:14px 20px 0; }
                .bds-sec-yr { text-transform:none; font-weight:400; color:rgba(185,208,192,0.3); letter-spacing:0; }

                /* schedule table */
                .bds-table { padding:8px 20px 0; }
                .bds-th-row { display:grid; grid-template-columns:1fr 0.9fr 1.1fr 1fr; gap:4px; padding:4px 0 6px; border-bottom:1px solid rgba(255,255,255,0.06); }
                .bds-th { font-size:0.62rem; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; color:rgba(185,208,192,0.35); }
                .bds-tr { display:grid; grid-template-columns:1fr 0.9fr 1.1fr 1fr; gap:4px; padding:7px 6px; border-radius:8px; cursor:pointer; border:1.5px solid transparent; transition:all 0.12s; margin-bottom:2px; }
                .bds-tr:hover { background:rgba(255,255,255,0.03); }
                .bds-tr.active { background:rgba(245,158,11,0.08); border-color:rgba(245,158,11,0.25); }
                .bds-td-lbl { font-size:0.82rem; font-weight:700; color:#f0f4ff; }
                .bds-td { font-size:0.82rem; color:rgba(185,208,192,0.8); }
                .bds-tr-r { text-align:right; }
                .bds-td-rate { color:#f59e0b; font-weight:600; }
                .bds-td-dim { color:rgba(185,208,192,0.35); text-decoration:line-through; }
                .bds-td-save { color:#00e87a; font-weight:600; font-size:0.75rem; }

                /* cost callout */
                .bds-cost-box { display:flex; justify-content:space-between; align-items:flex-start; margin:12px 20px 0; padding:12px 14px; background:rgba(245,158,11,0.06); border:1px solid rgba(245,158,11,0.18); border-radius:12px; gap:12px; }
                .bds-cost-label { font-size:0.68rem; color:rgba(185,208,192,0.5); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:3px; }
                .bds-cost-value { font-size:1.05rem; font-weight:800; color:#f59e0b; }
                .bds-cost-value.bds-covered { color:#00e87a; }
                .bds-cost-note { font-size:0.65rem; color:rgba(185,208,192,0.4); margin-top:3px; }
                .bds-cost-right { text-align:right; }

                /* breakdown */
                .bds-bd { padding:8px 20px 0; }
                .bds-bd-row { display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.84rem; }
                .bds-bd-row:last-child { border-bottom:none; }
                .bds-bd-lbl { color:rgba(185,208,192,0.75); }
                .bds-bd-val { font-weight:600; color:#f0f4ff; }
                .bds-bd-val-green { font-weight:600; color:#00e87a; }
                .bds-bd-total { display:flex; justify-content:space-between; align-items:center; padding:10px 0 0; font-size:0.9rem; font-weight:700; margin-top:4px; border-top:1px solid rgba(255,255,255,0.1); }
                .bds-bd-total-val { font-size:1.05rem; font-weight:800; color:#f59e0b; }

                /* adjusters */
                .bds-sliders { padding:6px 20px 0; }
                .bds-slider-wrap { margin-bottom:16px; }
                .bds-chips { display:flex; gap:6px; margin-top:8px; }
                .bds-chip { flex:1; padding:5px 0; border-radius:7px; font-size:0.78rem; font-weight:700; cursor:pointer; text-align:center; background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.1); color:rgba(185,208,192,0.6); font-family:inherit; transition:all 0.15s; }
                .bds-chip:hover { border-color:rgba(255,255,255,0.25); color:#f0f4ff; }
                .bds-chip.active { background:rgba(245,158,11,0.1); border-color:rgba(245,158,11,0.4); color:#f59e0b; }
                .bds-field-label { font-size:0.82rem; font-weight:600; color:rgba(185,208,192,0.8); margin-bottom:8px; }
                .bds-type-chips { display:flex; gap:8px; }
                .bds-type-chip { flex:1; display:flex; flex-direction:column; align-items:center; padding:10px 6px; border-radius:10px; background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.1); cursor:pointer; font-family:inherit; transition:all 0.15s; gap:4px; }
                .bds-type-chip:hover { border-color:rgba(255,255,255,0.25); }
                .bds-type-chip.active { background:rgba(245,158,11,0.1); border-color:rgba(245,158,11,0.4); }
                .bds-type-name { font-size:0.88rem; font-weight:700; color:rgba(185,208,192,0.8); }
                .bds-type-chip.active .bds-type-name { color:#f59e0b; }
                .bds-type-sub { font-size:0.62rem; color:rgba(185,208,192,0.45); text-align:center; line-height:1.4; }
                .bds-type-chip.active .bds-type-sub { color:rgba(245,158,11,0.7); }
                .bds-fred-tag { display:inline-flex; align-items:center; gap:4px; background:rgba(61,139,255,0.1); border:1px solid rgba(61,139,255,0.25); border-radius:6px; padding:3px 8px; font-size:0.7rem; color:#3d8bff; font-weight:600; margin-top:6px; }
                .bds-credit-row { display:flex; align-items:center; gap:10px; padding:9px 12px; background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.1); border-radius:10px; }
                .bds-credit-icon { font-size:0.9rem; flex-shrink:0; }
                .bds-credit-lbl { font-size:0.78rem; color:rgba(185,208,192,0.65); flex:1; }
                .bds-credit-input { background:#080c12; border:1px solid rgba(255,255,255,0.12); border-radius:7px; padding:5px 10px; font-size:0.82rem; color:#f0f4ff; width:110px; text-align:right; outline:none; font-family:inherit; }
                .bds-credit-input:focus { border-color:rgba(245,158,11,0.5); }

                /* CTA */
                .bds-cta-wrap { padding:14px 20px 20px; }
                .bds-cta { width:100%; padding:13px; background:#f59e0b; color:#000; font-size:0.88rem; font-weight:800; border:none; border-radius:10px; cursor:pointer; letter-spacing:0.02em; font-family:inherit; transition:opacity 0.15s; }
                .bds-cta:hover { opacity:0.88; }

                /* advisory drawer */
                .bds-info-trigger { display:flex; justify-content:space-between; align-items:center; padding:12px 20px; cursor:pointer; font-size:0.78rem; font-weight:600; color:rgba(185,208,192,0.5); border-top:1px solid rgba(255,255,255,0.06); transition:color 0.15s; }
                .bds-info-trigger:hover { color:rgba(185,208,192,0.8); }
                .bds-info-chev { font-size:0.65rem; transition:transform 0.2s; }
                .bds-info-chev.open { transform:rotate(180deg); }
                .bds-info-body { padding:0 20px 20px; border-top:1px solid rgba(255,255,255,0.06); }
                .bds-info-sec { font-size:0.65rem; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; color:rgba(185,208,192,0.35); padding:14px 0 8px; }

                /* permanent buydown comparison */
                .bds-perm-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
                .bds-perm-col { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:12px; }
                .bds-perm-col--alt { background:rgba(245,158,11,0.06); border-color:rgba(245,158,11,0.2); }
                .bds-perm-col-label { font-size:0.65rem; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; color:rgba(185,208,192,0.45); margin-bottom:6px; }
                .bds-perm-col--alt .bds-perm-col-label { color:rgba(245,158,11,0.6); }
                .bds-perm-col-rate { font-size:1.05rem; font-weight:800; color:#f0f4ff; line-height:1.1; }
                .bds-perm-col--alt .bds-perm-col-rate { color:#f59e0b; }
                .bds-perm-col-note { font-size:0.72rem; color:rgba(185,208,192,0.55); margin-top:4px; }
                .bds-perm-col-win { font-size:0.68rem; color:#00e87a; margin-top:6px; opacity:0.8; }
                .bds-perm-note { font-size:0.68rem; color:rgba(185,208,192,0.35); margin-top:8px; text-align:center; }

                /* Q&A */
                .bds-qa-list { display:flex; flex-direction:column; gap:0; }
                .bds-qa { padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05); }
                .bds-qa:last-child { border-bottom:none; }
                .bds-qa-q { font-size:0.8rem; font-weight:700; color:rgba(245,158,11,0.85); margin-bottom:5px; }
                .bds-qa-a { font-size:0.78rem; color:rgba(185,208,192,0.65); line-height:1.6; }

                /* mobile */
                @media (max-width: 480px) {
                    .bds-hero { grid-template-columns:1.5fr 1fr 1fr; }
                    .bds-hero-piti { font-size:clamp(1rem,4.5vw,1.4rem); }
                    .bds-th-row, .bds-tr { grid-template-columns:0.8fr 0.9fr 1fr 1fr; }
                    .bds-type-chip { padding:8px 4px; }
                    .bds-type-sub { font-size:0.58rem; }
                }
            `}</style>

        </div>
    );
}
