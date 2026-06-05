'use client';
// app/components/ScenarioComparisonCard.tsx
// Inline scenario comparison card for chat — 4 tools with live sliders
// Fires onRunScenario(seed) for deeper AI analysis within the same chat thread

import React, { useState, useMemo } from 'react';

export interface ScenarioComparisonCardParams {
    tool: 'down_payment' | 'seller_credit' | 'term' | 'rent_buy' | 'conv_vs_jumbo' | 'conv_vs_fha';
    price: number;
    rate: number;
    downPct?: number;
    years?: number;
    credit?: number;
    rent?: number;
    jumboRatePremium?: number;
    onRunScenario?: (seed: string) => void;
}

// ── Math helpers ──────────────────────────────────────────────────────────────
function calcPI(loan: number, annualRate: number, years = 30): number {
    if (loan <= 0 || annualRate <= 0) return 0;
    const r = annualRate / 100 / 12;
    const n = years * 12;
    return (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}
function fmt(n: number) { return '$' + Math.round(n).toLocaleString(); }
function fmtK(n: number) {
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (Math.abs(n) >= 10_000) return '$' + Math.round(n / 1_000) + 'k';
    return '$' + Math.round(n).toLocaleString();
}
function fmtPct(n: number) { return n.toFixed(2) + '%'; }

// ── Sub-components ─────────────────────────────────────────────────────────────
function Slider({ label, value, min, max, step, onChange, display }: {
    label: string; value: number; min: number; max: number; step: number;
    onChange: (v: number) => void; display: string;
}) {
    const pct = ((value - min) / (max - min)) * 100;
    return (
        <div className="sc-slider-row">
            <div className="sc-slider-label-row">
                <span className="sc-slider-label">{label}</span>
                <span className="sc-slider-val">{display}</span>
            </div>
            <input type="range" min={min} max={max} step={step} value={value}
                onChange={e => onChange(Number(e.target.value))}
                style={{ background: `linear-gradient(to right,#00e87a 0%,#00e87a ${pct}%,rgba(255,255,255,0.1) ${pct}%,rgba(255,255,255,0.1) 100%)` }}
            />
        </div>
    );
}

function Stat({ label, value, sub, accent, icon }: { label: string; value: string; sub?: string; accent?: boolean; icon?: string }) {
    return (
        <div className="sc-stat">
            <div className="sc-stat-label">{icon && <span style={{ marginRight: 4, opacity: 0.6 }}>{icon}</span>}{label}</div>
            <div className="sc-stat-value" style={accent ? { color: '#00e87a' } : {}}>{value}</div>
            {sub && <div className="sc-stat-sub">{sub}</div>}
        </div>
    );
}

// ── Tool: 5% vs 20% Down ──────────────────────────────────────────────────────
function DownPaymentTool({ initPrice, initRate, onRunScenario }: {
    initPrice: number; initRate: number; onRunScenario?: (seed: string) => void;
}) {
    const [price, setPrice] = useState(initPrice);
    const [rate, setRate] = useState(initRate);
    const [years, setYears] = useState(7);

    const calc = useMemo(() => {
        const low = { down: price * 0.05, loan: price * 0.95 };
        const high = { down: price * 0.20, loan: price * 0.80 };
        const pmiRate = 0.0055;
        const lowPI = calcPI(low.loan, rate);
        const lowPMI = (low.loan * pmiRate) / 12;
        const lowTotal = lowPI + lowPMI;
        const highPI = calcPI(high.loan, rate);
        const highTotal = highPI;
        const monthlyDiff = lowTotal - highTotal;
        const targetLoan = price * 0.80;
        let bal = low.loan;
        let pmiMonths = 0;
        const r = rate / 100 / 12;
        while (bal > targetLoan && pmiMonths < 360) {
            const interest = bal * r;
            const principal = lowPI - interest;
            bal -= principal;
            pmiMonths++;
        }
        const cashKept = high.down - low.down;
        const invested = cashKept * Math.pow(1.07, years) - cashKept;
        const totalPMIPaid = Math.min(pmiMonths, years * 12) * lowPMI;
        const seed = `[deep-analysis] 5% down (${fmt(low.down)}) vs 20% down (${fmt(high.down)}) on a ${fmt(price)} home at ${fmtPct(rate)}. 5% down: ${fmt(lowTotal)}/mo including PMI which drops off at month ${pmiMonths}. 20% down: ${fmt(highTotal)}/mo, no PMI. Cash saved by going 5% down: ${fmt(cashKept)}, invested at 7% over ${years} years grows to ${fmtK(invested + cashKept)} (${fmtK(invested)} gain). Total PMI paid over ${years} years: ${fmtK(totalPMIPaid)}. Which is better and walk me through the break-even analysis.`;
        return { low: { down: low.down, loan: low.loan, pi: lowPI, pmi: lowPMI, total: lowTotal }, high: { down: high.down, loan: high.loan, pi: highPI, total: highTotal }, monthlyDiff, pmiMonths, cashKept, invested, totalPMIPaid, seed };
    }, [price, rate, years]);

    const winner = calc.invested > calc.totalPMIPaid
        ? `Keeping cash + 5% down is ahead by ${fmtK(calc.invested - calc.totalPMIPaid)} after ${years} yrs (invested vs PMI cost).`
        : `20% down saves ${fmtK(calc.totalPMIPaid - calc.invested)} in PMI over ${years} yrs and removes ${fmt(calc.monthlyDiff)}/mo in extra payment.`;

    return (
        <div className="sc-body">
            <div className="sc-columns">
                <div className="sc-col sc-col-a">
                    <div className="sc-col-header">
                        <span className="sc-col-badge" style={{ background: '#ff8c42' }}>5% DOWN</span>
                        <span className="sc-col-sub">Lower cash in — higher monthly</span>
                    </div>
                    <Stat icon="💵" label="Down payment" value={fmt(calc.low.down)} sub="+ closing costs" />
                    <Stat icon="🏦" label="Loan amount" value={fmt(calc.low.loan)} />
                    <Stat icon="📅" label="Monthly P&I" value={fmt(calc.low.pi)} />
                    <Stat icon="🛡️" label="PMI (est.)" value={fmt(calc.low.pmi) + '/mo'} sub={`drops off ~month ${calc.pmiMonths}`} />
                    <Stat icon="💳" label="Total monthly" value={fmt(calc.low.total)} />
                </div>
                <div className="sc-col sc-col-b">
                    <div className="sc-col-header">
                        <span className="sc-col-badge" style={{ background: '#00e87a' }}>20% DOWN</span>
                        <span className="sc-col-sub">Higher cash in — no PMI</span>
                    </div>
                    <Stat icon="💵" label="Down payment" value={fmt(calc.high.down)} sub="+ closing costs" />
                    <Stat icon="🏦" label="Loan amount" value={fmt(calc.high.loan)} />
                    <Stat icon="📅" label="Monthly P&I" value={fmt(calc.high.pi)} />
                    <Stat icon="✅" label="PMI" value="None" />
                    <Stat icon="💳" label="Total monthly" value={fmt(calc.high.total)} />
                </div>
            </div>
            <div className="sc-delta-row">
                <div className="sc-delta"><span className="sc-delta-label">⬆️ Monthly diff</span><span className="sc-delta-val">{fmt(calc.monthlyDiff)}/mo</span></div>
                <div className="sc-delta"><span className="sc-delta-label">💰 Cash kept (5%)</span><span className="sc-delta-val">{fmt(calc.cashKept)}</span></div>
                <div className="sc-delta"><span className="sc-delta-label">📈 Invested @7%/{years}yr</span><span className="sc-delta-val" style={{ color: '#00e87a' }}>{fmtK(calc.invested)}</span></div>
                <div className="sc-delta"><span className="sc-delta-label">🛑 Total PMI/{years}yr</span><span className="sc-delta-val" style={{ color: '#ff8c42' }}>{fmtK(calc.totalPMIPaid)}</span></div>
            </div>
            <div className="sc-insight">💡 {winner}</div>
            <div className="sc-sliders">
                <Slider label="Purchase Price" value={price} min={200_000} max={2_000_000} step={25_000} onChange={setPrice} display={fmtK(price)} />
                <Slider label="Interest Rate" value={rate} min={4} max={10} step={0.125} onChange={setRate} display={fmtPct(rate)} />
                <Slider label="Years in home" value={years} min={2} max={15} step={1} onChange={setYears} display={`${years} yrs`} />
            </div>
            {onRunScenario && (
                <button className="sc-ai-btn" onClick={() => onRunScenario(calc.seed)}>
                    <span className="sc-ai-icon">🤖</span>
                    <span className="sc-ai-text">
                        <span className="sc-ai-label">Run deeper AI analysis on this scenario</span>
                        <span className="sc-ai-sub">Sends your exact numbers to the AI for a full breakdown</span>
                    </span>
                    <span className="sc-ai-arrow">→</span>
                </button>
            )}
        </div>
    );
}

// ── Tool: Rate Buydown vs Price Reduction ─────────────────────────────────────
function SellerCreditTool({ initPrice, initRate, initCredit, onRunScenario }: {
    initPrice: number; initRate: number; initCredit: number; onRunScenario?: (seed: string) => void;
}) {
    const [price, setPrice] = useState(initPrice);
    const [credit, setCredit] = useState(initCredit);
    const [baseRate, setBaseRate] = useState(initRate);
    const [downPct, setDownPct] = useState(10);
    const [years, setYears] = useState(7);

    const calc = useMemo(() => {
        const down = price * (downPct / 100);
        const loanA = (price - credit) * (1 - downPct / 100);
        const piA = calcPI(loanA, baseRate);
        const loanB = price * (1 - downPct / 100);
        const points = (credit / loanB) * 100;
        const rateReduction = points * 0.25;
        const reducedRate = Math.max(baseRate - rateReduction, 1);
        const piB = calcPI(loanB, reducedRate);
        const monthlyDiff = piA - piB;
        const totalSavedB = monthlyDiff * years * 12;
        const savingsFromSmallerLoan = (calcPI(loanB, baseRate) - piA) * years * 12;
        const winner = totalSavedB > savingsFromSmallerLoan ? 'B' : 'A';
        const seed = `[deep-analysis] Seller credit options on a ${fmt(price)} home at ${fmtPct(baseRate)} with ${fmtPct(downPct)} down. Option A: Price reduction of ${fmt(credit)} → loan ${fmt(loanA)} at ${fmtPct(baseRate)}, payment ${fmt(piA)}/mo. Option B: Rate buydown using ${fmt(credit)} as ${points.toFixed(2)} points → rate drops to ${fmtPct(reducedRate)}, payment ${fmt(piB)}/mo. Monthly diff: ${fmt(Math.abs(monthlyDiff))}. Over ${years} years, buydown saves ${fmtK(totalSavedB)}, price reduction saves ${fmtK(savingsFromSmallerLoan)}. Which is better and why? Walk me through the break-even and long-term math.`;
        return { A: { loan: loanA, rate: baseRate, pi: piA, down }, B: { loan: loanB, rate: reducedRate, pi: piB, down, points: points.toFixed(2), rateReduction: rateReduction.toFixed(3) }, monthlyDiff, totalSavedB, savingsFromSmallerLoan, winner, seed };
    }, [price, credit, baseRate, downPct, years]);

    const insight = calc.winner === 'B'
        ? `Rate buydown saves ${fmtK(calc.totalSavedB)} more than price reduction over ${years} years. Best if you stay put.`
        : `Price reduction saves ${fmtK(calc.savingsFromSmallerLoan)} more than rate buydown over ${years} years (smaller loan compounds).`;

    return (
        <div className="sc-body">
            <div className="sc-columns">
                <div className="sc-col sc-col-a">
                    <div className="sc-col-header">
                        <span className="sc-col-badge" style={{ background: '#ff8c42' }}>PRICE REDUCTION</span>
                        <span className="sc-col-sub">Seller drops price by {fmt(credit)}</span>
                    </div>
                    <Stat icon="🏷️" label="Purchase price" value={fmt(price - credit)} />
                    <Stat icon="🏦" label="Loan amount" value={fmt(calc.A.loan)} />
                    <Stat icon="📊" label="Interest rate" value={fmtPct(calc.A.rate)} />
                    <Stat icon="📅" label="Monthly P&I" value={fmt(calc.A.pi)} />
                    <Stat icon="💵" label="Down payment" value={fmt(calc.A.down)} />
                </div>
                <div className="sc-col sc-col-b">
                    <div className="sc-col-header">
                        <span className="sc-col-badge" style={{ background: '#00e87a' }}>RATE BUYDOWN</span>
                        <span className="sc-col-sub">{calc.B.points} pts → −{calc.B.rateReduction}% rate</span>
                    </div>
                    <Stat icon="🏷️" label="Purchase price" value={fmt(price)} />
                    <Stat icon="🏦" label="Loan amount" value={fmt(calc.B.loan)} />
                    <Stat icon="📉" label="Bought-down rate" value={fmtPct(calc.B.rate)} sub={`was ${fmtPct(baseRate)}`} />
                    <Stat icon="📅" label="Monthly P&I" value={fmt(calc.B.pi)} />
                    <Stat icon="💵" label="Down payment" value={fmt(calc.B.down)} />
                </div>
            </div>
            <div className="sc-delta-row">
                <div className="sc-delta"><span className="sc-delta-label">↕️ Monthly diff</span><span className="sc-delta-val">{fmt(Math.abs(calc.monthlyDiff))}/mo</span></div>
                <div className="sc-delta"><span className="sc-delta-label">📉 Buydown saves/{years}yr</span><span className="sc-delta-val" style={calc.winner === 'B' ? { color: '#00e87a' } : {}}>{fmtK(calc.totalSavedB)}</span></div>
                <div className="sc-delta"><span className="sc-delta-label">🏷️ Price cut saves/{years}yr</span><span className="sc-delta-val" style={calc.winner === 'A' ? { color: '#00e87a' } : {}}>{fmtK(calc.savingsFromSmallerLoan)}</span></div>
                <div className="sc-delta"><span className="sc-delta-label">🏆 Winner</span><span className="sc-delta-val" style={{ color: '#00e87a' }}>{calc.winner === 'B' ? 'Rate Buydown' : 'Price Reduction'}</span></div>
            </div>
            <div className="sc-insight">💡 {insight}</div>
            <div className="sc-sliders">
                <Slider label="Purchase Price" value={price} min={200_000} max={2_000_000} step={25_000} onChange={setPrice} display={fmtK(price)} />
                <Slider label="Seller Credit" value={credit} min={1_000} max={50_000} step={500} onChange={setCredit} display={fmtK(credit)} />
                <Slider label="Base Interest Rate" value={baseRate} min={4} max={10} step={0.125} onChange={setBaseRate} display={fmtPct(baseRate)} />
                <Slider label="Down Payment" value={downPct} min={3} max={30} step={1} onChange={setDownPct} display={`${downPct}%`} />
                <Slider label="Years in home" value={years} min={2} max={15} step={1} onChange={setYears} display={`${years} yrs`} />
            </div>
            {onRunScenario && (
                <button className="sc-ai-btn" onClick={() => onRunScenario(calc.seed)}>
                    <span className="sc-ai-icon">🤖</span>
                    <span className="sc-ai-text">
                        <span className="sc-ai-label">Run deeper AI analysis on this scenario</span>
                        <span className="sc-ai-sub">Sends your exact numbers to the AI for a full breakdown</span>
                    </span>
                    <span className="sc-ai-arrow">→</span>
                </button>
            )}
        </div>
    );
}

// ── Tool: 15yr vs 30yr ────────────────────────────────────────────────────────
function TermTool({ initPrice, initRate, onRunScenario }: {
    initPrice: number; initRate: number; onRunScenario?: (seed: string) => void;
}) {
    const [price, setPrice] = useState(initPrice);
    const [downPct, setDownPct] = useState(20);
    const [rate30, setRate30] = useState(initRate);

    const calc = useMemo(() => {
        const loan = price * (1 - downPct / 100);
        const rate15 = Math.max(rate30 - 0.65, 1);
        const pi30 = calcPI(loan, rate30, 30);
        const pi15 = calcPI(loan, rate15, 15);
        const monthlyDiff = pi15 - pi30;
        const totalInterest30 = pi30 * 360 - loan;
        const totalInterest15 = pi15 * 180 - loan;
        const interestSaved = totalInterest30 - totalInterest15;
        function equityAtYear(rate: number, termYears: number): number {
            const pi = calcPI(loan, rate, termYears);
            const r = rate / 100 / 12;
            let bal = loan;
            for (let m = 0; m < 60; m++) { bal = Math.max(0, bal - (pi - bal * r)); }
            return loan - bal;
        }
        const equity30at5 = equityAtYear(rate30, 30);
        const equity15at5 = equityAtYear(rate15, 15);
        const extraEquity = equity15at5 - equity30at5;
        const seed = `[deep-analysis] 15-year mortgage on a ${fmt(price)} home with ${fmtPct(downPct)} down. 30-year at ${fmtPct(rate30)}: ${fmt(pi30)}/mo, total interest ${fmtK(totalInterest30)}, equity at year 5: ${fmtK(equity30at5)}. 15-year at ${fmtPct(rate15)} (typical ~0.65% lower): ${fmt(pi15)}/mo (${fmt(monthlyDiff)}/mo more), total interest ${fmtK(totalInterest15)}, interest saved ${fmtK(interestSaved)}, extra equity at year 5: ${fmtK(extraEquity)}. Walk me through the full analysis — when does a 15-year make sense and what are the trade-offs?`;
        return { loan, rate15, pi30, pi15, monthlyDiff, totalInterest30, totalInterest15, interestSaved, equity30at5, equity15at5, extraEquity, seed };
    }, [price, downPct, rate30]);

    return (
        <div className="sc-body">
            <div className="sc-columns">
                <div className="sc-col sc-col-a">
                    <div className="sc-col-header">
                        <span className="sc-col-badge" style={{ background: '#ff8c42' }}>30-YEAR</span>
                        <span className="sc-col-sub">Lower payment, slower equity</span>
                    </div>
                    <Stat icon="📊" label="Rate" value={fmtPct(rate30)} />
                    <Stat icon="📅" label="Monthly P&I" value={fmt(calc.pi30)} />
                    <Stat icon="💸" label="Total interest" value={fmtK(calc.totalInterest30)} />
                    <Stat icon="🏠" label="Equity at year 5" value={fmtK(calc.equity30at5)} />
                    <Stat icon="🗓️" label="Paid off" value="Year 30" />
                </div>
                <div className="sc-col sc-col-b">
                    <div className="sc-col-header">
                        <span className="sc-col-badge" style={{ background: '#00e87a' }}>15-YEAR</span>
                        <span className="sc-col-sub">Higher payment, massive savings</span>
                    </div>
                    <Stat icon="📊" label="Rate" value={fmtPct(calc.rate15)} sub="~0.65% lower (typical)" />
                    <Stat icon="📅" label="Monthly P&I" value={fmt(calc.pi15)} />
                    <Stat icon="✅" label="Total interest" value={fmtK(calc.totalInterest15)} />
                    <Stat icon="🏠" label="Equity at year 5" value={fmtK(calc.equity15at5)} accent />
                    <Stat icon="🎯" label="Paid off" value="Year 15" />
                </div>
            </div>
            <div className="sc-delta-row">
                <div className="sc-delta"><span className="sc-delta-label">⬆️ Extra monthly (15yr)</span><span className="sc-delta-val">{fmt(calc.monthlyDiff)}/mo</span></div>
                <div className="sc-delta"><span className="sc-delta-label">💰 Interest saved</span><span className="sc-delta-val" style={{ color: '#00e87a' }}>{fmtK(calc.interestSaved)}</span></div>
                <div className="sc-delta"><span className="sc-delta-label">🏠 Extra equity yr 5</span><span className="sc-delta-val" style={{ color: '#00e87a' }}>{fmtK(calc.extraEquity)}</span></div>
                <div className="sc-delta"><span className="sc-delta-label">🎯 Paid off sooner</span><span className="sc-delta-val" style={{ color: '#00e87a' }}>15 yrs earlier</span></div>
            </div>
            <div className="sc-insight">💡 The 15-year saves {fmtK(calc.interestSaved)} in total interest and builds {fmtK(calc.extraEquity)} more equity in 5 years — at the cost of {fmt(calc.monthlyDiff)}/mo. The 30-year frees that cash flow for investing.</div>
            <div className="sc-sliders">
                <Slider label="Purchase Price" value={price} min={200_000} max={2_000_000} step={25_000} onChange={setPrice} display={fmtK(price)} />
                <Slider label="Down Payment" value={downPct} min={5} max={40} step={5} onChange={setDownPct} display={`${downPct}%`} />
                <Slider label="30-Year Rate" value={rate30} min={4} max={10} step={0.125} onChange={setRate30} display={fmtPct(rate30)} />
            </div>
            {onRunScenario && (
                <button className="sc-ai-btn" onClick={() => onRunScenario(calc.seed)}>
                    <span className="sc-ai-icon">🤖</span>
                    <span className="sc-ai-text">
                        <span className="sc-ai-label">Run deeper AI analysis on this scenario</span>
                        <span className="sc-ai-sub">Sends your exact numbers to the AI for a full breakdown</span>
                    </span>
                    <span className="sc-ai-arrow">→</span>
                </button>
            )}
        </div>
    );
}

// ── Tool: Rent vs Buy ─────────────────────────────────────────────────────────
function RentBuyTool({ initPrice, initRate, initRent, onRunScenario }: {
    initPrice: number; initRate: number; initRent: number; onRunScenario?: (seed: string) => void;
}) {
    const [price, setPrice] = useState(initPrice);
    const [rent, setRent] = useState(initRent);
    const [downPct, setDownPct] = useState(10);
    const [rate, setRate] = useState(initRate);
    const [years, setYears] = useState(7);

    const calc = useMemo(() => {
        const down = price * (downPct / 100);
        const loan = price - down;
        const pi = calcPI(loan, rate);
        const tax = (price * 0.012) / 12;
        const ins = (price * 0.003) / 12;
        const pmi = downPct < 20 ? (loan * 0.0055) / 12 : 0;
        const totalBuy = pi + tax + ins + pmi;
        const closingCosts = price * 0.03;
        const futureValue = price * Math.pow(1.04, years);
        const appreciation = futureValue - price;
        const r = rate / 100 / 12;
        let bal = loan;
        for (let m = 0; m < years * 12; m++) { bal = Math.max(0, bal - (pi - bal * r)); }
        const paydownEquity = loan - bal;
        const totalEquity = down + paydownEquity + appreciation;
        const netBuyPosition = totalEquity - closingCosts - price * 0.06;
        let totalRent = 0;
        let monthlyRent = rent;
        for (let y = 0; y < years; y++) { totalRent += monthlyRent * 12; monthlyRent *= 1.03; }
        const rentAtYearN = rent * Math.pow(1.03, years);
        const monthlyDiff = totalBuy - rent;
        const seed = `[deep-analysis] Renting at ${fmt(rent)}/mo versus buying a ${fmt(price)} home with ${fmtPct(downPct)} down at ${fmtPct(rate)}. Buying costs ${fmt(totalBuy)}/mo PITI${pmi > 0 ? ' + PMI' : ''}, down + closing ${fmtK(down + closingCosts)}. After ${years} years buying builds ${fmtK(netBuyPosition)} net equity (after selling costs). Total rent paid: ${fmtK(totalRent)}, rent rises to ${fmt(rentAtYearN)}/mo at year ${years} (3%/yr). Monthly cost difference: ${fmt(Math.abs(monthlyDiff))}/mo ${monthlyDiff > 0 ? 'more to buy' : 'cheaper to buy'}. Run a full analysis — when does buying become clearly better and what are the key factors?`;
        return { down, loan, pi, tax, ins, pmi, totalBuy, closingCosts, appreciation, paydownEquity, netBuyPosition, totalRent, rentAtYearN, monthlyDiff, futureValue, seed };
    }, [price, rent, downPct, rate, years]);

    const insight = calc.netBuyPosition > 0
        ? `Buying builds ${fmtK(calc.netBuyPosition)} net equity over ${years} years after selling costs. Monthly buy cost is ${calc.monthlyDiff > 0 ? fmt(calc.monthlyDiff) + '/mo more' : fmt(-calc.monthlyDiff) + '/mo less'} than renting.`
        : `At ${years} years, selling costs eat the equity — staying longer tips the balance.`;

    return (
        <div className="sc-body">
            <div className="sc-columns">
                <div className="sc-col sc-col-a">
                    <div className="sc-col-header">
                        <span className="sc-col-badge" style={{ background: '#ff8c42' }}>RENT</span>
                        <span className="sc-col-sub">Flexibility, zero equity</span>
                    </div>
                    <Stat icon="🏠" label="Monthly rent (today)" value={fmt(rent)} />
                    <Stat icon="📈" label={`Rent at year ${years}`} value={fmt(calc.rentAtYearN)} sub="at 3%/yr increase" />
                    <Stat icon="💸" label={`Total rent / ${years}yr`} value={fmtK(calc.totalRent)} />
                    <Stat icon="❌" label="Equity built" value="$0" />
                </div>
                <div className="sc-col sc-col-b">
                    <div className="sc-col-header">
                        <span className="sc-col-badge" style={{ background: '#00e87a' }}>BUY</span>
                        <span className="sc-col-sub">Building equity + appreciation</span>
                    </div>
                    <Stat icon="📅" label="Monthly PITI" value={fmt(calc.totalBuy)} />
                    <Stat icon="💵" label="Down + closing" value={fmtK(calc.down + calc.closingCosts)} />
                    <Stat icon="🏡" label={`Appreciation / ${years}yr`} value={fmtK(calc.appreciation)} sub="at 4%/yr" />
                    <Stat icon="🏆" label="Net equity (after sell)" value={fmtK(calc.netBuyPosition)} accent />
                </div>
            </div>
            <div className="sc-delta-row">
                <div className="sc-delta"><span className="sc-delta-label">↕️ Monthly diff</span><span className="sc-delta-val">{fmt(Math.abs(calc.monthlyDiff))}/mo {calc.monthlyDiff > 0 ? 'more to buy' : 'more to rent'}</span></div>
                <div className="sc-delta"><span className="sc-delta-label">🏡 Home value in {years}yr</span><span className="sc-delta-val">{fmtK(calc.futureValue)}</span></div>
                <div className="sc-delta"><span className="sc-delta-label">💰 Net equity built</span><span className="sc-delta-val" style={{ color: '#00e87a' }}>{fmtK(calc.netBuyPosition)}</span></div>
                <div className="sc-delta"><span className="sc-delta-label">🛑 Total rent paid</span><span className="sc-delta-val">{fmtK(calc.totalRent)}</span></div>
            </div>
            <div className="sc-insight">💡 {insight}</div>
            <div className="sc-sliders">
                <Slider label="Home Price" value={price} min={150_000} max={2_000_000} step={25_000} onChange={setPrice} display={fmtK(price)} />
                <Slider label="Monthly Rent" value={rent} min={500} max={10_000} step={100} onChange={setRent} display={fmt(rent) + '/mo'} />
                <Slider label="Down Payment" value={downPct} min={3} max={30} step={1} onChange={setDownPct} display={`${downPct}%`} />
                <Slider label="Interest Rate" value={rate} min={4} max={10} step={0.125} onChange={setRate} display={fmtPct(rate)} />
                <Slider label="Years in home" value={years} min={2} max={15} step={1} onChange={setYears} display={`${years} yrs`} />
            </div>
            {onRunScenario && (
                <button className="sc-ai-btn" onClick={() => onRunScenario(calc.seed)}>
                    <span className="sc-ai-icon">🤖</span>
                    <span className="sc-ai-text">
                        <span className="sc-ai-label">Run deeper AI analysis on this scenario</span>
                        <span className="sc-ai-sub">Sends your exact numbers to the AI for a full breakdown</span>
                    </span>
                    <span className="sc-ai-arrow">→</span>
                </button>
            )}
        </div>
    );
}

// ── Tool: Conventional vs Jumbo ───────────────────────────────────────────────
const CONF_LIMIT = 832_750;

function ConvVsJumboTool({ initPrice, initRate, initPremium, onRunScenario }: {
    initPrice: number; initRate: number; initPremium: number; onRunScenario?: (seed: string) => void;
}) {
    const [price, setPrice]     = useState(initPrice);
    const [convRate, setConvRate] = useState(initRate);
    const [premium, setPremium] = useState(initPremium);
    const [years, setYears]     = useState(7);

    const calc = useMemo(() => {
        const jumboRate   = parseFloat((convRate + premium).toFixed(3));
        // Conventional: put down enough to keep loan at conforming limit
        const convLoan    = Math.min(price * 0.80, CONF_LIMIT);
        const convDown    = price - convLoan;
        const convDownPct = (convDown / price) * 100;
        const convPI      = calcPI(convLoan, convRate);
        const tax         = price * 0.011 / 12;
        const ins         = price * 0.005 / 12;
        const convTotal   = convPI + tax + ins;
        // Jumbo: 20% down, higher rate
        const jumboDown   = price * 0.20;
        const jumboLoan   = price * 0.80;
        const jumboPI     = calcPI(jumboLoan, jumboRate);
        const jumboTotal  = jumboPI + tax + ins;
        const extraDown   = convDown - jumboDown;
        const monthlySave = jumboTotal - convTotal;
        const breakEvenMo = monthlySave > 0 ? Math.round(extraDown / monthlySave) : Infinity;
        const isConvBetter = breakEvenMo < years * 12;
        const seed = `[deep-analysis] Conventional vs Jumbo on a ${fmt(price)} home. Conventional: ${fmtPct(convDownPct)} down (${fmt(convDown)}) → loan ${fmt(convLoan)} at ${fmtPct(convRate)}, ${fmt(convTotal)}/mo PITI. Jumbo: 20% down (${fmt(jumboDown)}) → loan ${fmt(jumboLoan)} at ${fmtPct(jumboRate)}, ${fmt(jumboTotal)}/mo PITI. Extra down for conventional: ${fmt(extraDown)}. Monthly savings: ${fmt(monthlySave)}. Break-even: ${isFinite(breakEvenMo) ? breakEvenMo + ' months' : 'never'}. Which strategy is better for a ${years}-year hold?`;
        return { convLoan, convDown, convDownPct, convPI, convTotal, jumboDown, jumboLoan, jumboPI, jumboTotal, jumboRate, extraDown, monthlySave, breakEvenMo, isConvBetter, seed };
    }, [price, convRate, premium, years]);

    const insight = calc.monthlySave > 0
        ? `Conventional saves ${fmt(calc.monthlySave)}/mo but needs ${fmt(calc.extraDown)} more down. Break-even: ${isFinite(calc.breakEvenMo) ? calc.breakEvenMo + ' months' : 'never'} — ${calc.isConvBetter ? 'conventional wins' : 'jumbo wins'} at ${years} yrs.`
        : `Jumbo has a lower payment despite higher rate (smaller required down). Consider if you want to preserve cash.`;

    return (
        <div className="sc-body">
            <div className="sc-columns">
                <div className="sc-col sc-col-b">
                    <div className="sc-col-header">
                        <span className="sc-col-badge" style={{ background: '#00e87a' }}>CONVENTIONAL</span>
                        <span className="sc-col-sub">Lower rate · More down required</span>
                    </div>
                    <Stat icon="💵" label="Down payment" value={fmt(calc.convDown)} sub={`${calc.convDownPct.toFixed(1)}% — keeps loan conforming`} />
                    <Stat icon="🏦" label="Loan amount" value={fmt(calc.convLoan)} sub={`≤ $${CONF_LIMIT.toLocaleString()} limit`} />
                    <Stat icon="📊" label="Rate" value={fmtPct(convRate)} />
                    <Stat icon="📅" label="Monthly PITI" value={fmt(calc.convTotal)} />
                    <Stat icon="✅" label="PMI" value="None (LTV ≤ 80%)" />
                </div>
                <div className="sc-col sc-col-a">
                    <div className="sc-col-header">
                        <span className="sc-col-badge" style={{ background: '#8b5cf6' }}>JUMBO</span>
                        <span className="sc-col-sub">20% down · Rate premium</span>
                    </div>
                    <Stat icon="💵" label="Down payment" value={fmt(calc.jumboDown)} sub="20%" />
                    <Stat icon="🏦" label="Loan amount" value={fmt(calc.jumboLoan)} sub="over conforming limit" />
                    <Stat icon="📊" label="Rate" value={fmtPct(calc.jumboRate)} sub={`+${fmtPct(premium)} premium`} />
                    <Stat icon="📅" label="Monthly PITI" value={fmt(calc.jumboTotal)} />
                    <Stat icon="✅" label="PMI" value="None (LTV = 80%)" />
                </div>
            </div>
            <div className="sc-delta-row">
                <div className="sc-delta"><span className="sc-delta-label">💵 Extra down (conv)</span><span className="sc-delta-val">{fmt(calc.extraDown)}</span></div>
                <div className="sc-delta"><span className="sc-delta-label">📅 Monthly savings</span><span className="sc-delta-val" style={{ color: calc.monthlySave > 0 ? '#00e87a' : '#f59e0b' }}>{fmt(Math.abs(calc.monthlySave))}/mo</span></div>
                <div className="sc-delta"><span className="sc-delta-label">⏱ Break-even</span><span className="sc-delta-val">{isFinite(calc.breakEvenMo) ? calc.breakEvenMo + ' mo' : 'N/A'}</span></div>
                <div className="sc-delta"><span className="sc-delta-label">🏆 Winner ({years}yr)</span><span className="sc-delta-val" style={{ color: '#00e87a' }}>{calc.isConvBetter ? 'Conv.' : 'Jumbo'}</span></div>
            </div>
            <div className="sc-insight">💡 {insight}</div>
            <div className="sc-sliders">
                <Slider label="Purchase Price" value={price} min={900_000} max={3_000_000} step={25_000} onChange={setPrice} display={fmtK(price)} />
                <Slider label="Conventional Rate" value={convRate} min={4} max={10} step={0.125} onChange={setConvRate} display={fmtPct(convRate)} />
                <Slider label="Jumbo Rate Premium" value={premium} min={0.125} max={0.875} step={0.125} onChange={setPremium} display={`+${fmtPct(premium)}`} />
                <Slider label="Years in home" value={years} min={2} max={15} step={1} onChange={setYears} display={`${years} yrs`} />
            </div>
            {onRunScenario && (
                <button className="sc-ai-btn" onClick={() => onRunScenario(calc.seed)}>
                    <span className="sc-ai-icon">🤖</span>
                    <span className="sc-ai-text">
                        <span className="sc-ai-label">Run deeper AI analysis on this scenario</span>
                        <span className="sc-ai-sub">Sends your exact numbers to the AI for a full breakdown</span>
                    </span>
                    <span className="sc-ai-arrow">→</span>
                </button>
            )}
        </div>
    );
}

// ── Tool: Conventional vs FHA ──────────────────────────────────────────────────
function ConvVsFHATool({ initPrice, initRate, onRunScenario }: {
    initPrice: number; initRate: number; onRunScenario?: (seed: string) => void;
}) {
    const [price, setPrice]   = useState(initPrice);
    const [rate, setRate]     = useState(initRate);
    const [convDown, setConvDown] = useState(10);
    const [years, setYears]   = useState(7);

    const calc = useMemo(() => {
        const tax  = price * 0.011 / 12;
        const ins  = price * 0.005 / 12;
        // FHA: 3.5% down, 1.75% UFMIP financed, 0.55% annual MIP
        const fhaBase    = price * (1 - 0.035);
        const fhaLoan    = fhaBase * 1.0175;
        const fhaDown    = price * 0.035;
        const fhaMIPmo   = fhaBase * 0.0055 / 12;
        const fhaPI      = calcPI(fhaLoan, rate);
        const fhaTotal   = fhaPI + fhaMIPmo + tax + ins;
        // Conventional: convDown%, PMI until 80% LTV
        const convLoan   = price * (1 - convDown / 100);
        const convDownAmt = price * convDown / 100;
        const convPI     = calcPI(convLoan, rate);
        const pmiRate    = 0.008;
        const hasPMI     = convDown < 20;
        const convPMImo  = hasPMI ? convLoan * pmiRate / 12 : 0;
        // Months until PMI drops (loan reaches 80% LTV)
        let pmiMonths = 0;
        if (hasPMI) {
            let bal = convLoan;
            const r = rate / 100 / 12;
            const target = price * 0.80;
            while (bal > target && pmiMonths < 360) {
                bal -= (convPI - bal * r);
                pmiMonths++;
            }
        }
        const convTotal = convPI + convPMImo + tax + ins;
        const monthlyDiff = fhaTotal - convTotal;
        const extraDown = convDownAmt - fhaDown;
        const seed = `[deep-analysis] FHA vs Conventional on a ${fmt(price)} home at ${fmtPct(rate)}. FHA: 3.5% down (${fmt(fhaDown)}), UFMIP 1.75% financed, loan ${fmt(fhaLoan)}, MIP ${fmt(fhaMIPmo)}/mo (life of loan), total ${fmt(fhaTotal)}/mo. Conventional ${convDown}% down (${fmt(convDownAmt)}), loan ${fmt(convLoan)}, PMI ${hasPMI ? fmt(convPMImo) + '/mo drops at month ' + pmiMonths : 'none'}, total ${fmt(convTotal)}/mo. Conventional requires ${fmt(extraDown)} more down. Monthly diff: ${fmt(Math.abs(monthlyDiff))}. Which is better for a ${years}-year hold and is it worth the larger down payment?`;
        return { fhaDown, fhaLoan, fhaMIPmo, fhaPI, fhaTotal, convDownAmt, convLoan, convPI, convPMImo, convTotal, monthlyDiff, extraDown, pmiMonths, hasPMI, seed };
    }, [price, rate, convDown, years]);

    const insight = calc.monthlyDiff > 0
        ? `Conventional saves ${fmt(calc.monthlyDiff)}/mo but needs ${fmt(calc.extraDown)} more down. FHA keeps more cash now — MIP is permanent if down < 10%.`
        : `FHA is cheaper monthly despite MIP — check if the rate difference makes conventional worth the higher down payment.`;

    return (
        <div className="sc-body">
            <div className="sc-columns">
                <div className="sc-col sc-col-a">
                    <div className="sc-col-header">
                        <span className="sc-col-badge" style={{ background: '#f59e0b' }}>FHA · 3.5% DOWN</span>
                        <span className="sc-col-sub">Low barrier · Permanent MIP</span>
                    </div>
                    <Stat icon="💵" label="Down payment" value={fmt(calc.fhaDown)} sub="3.5% minimum" />
                    <Stat icon="🏦" label="Loan (w/ UFMIP)" value={fmt(calc.fhaLoan)} sub="1.75% financed" />
                    <Stat icon="🛡️" label="Monthly MIP" value={fmt(calc.fhaMIPmo) + '/mo'} sub="life of loan if down < 10%" />
                    <Stat icon="📅" label="Monthly PITI+MIP" value={fmt(calc.fhaTotal)} />
                    <Stat icon="📊" label="Rate" value={fmtPct(rate)} />
                </div>
                <div className="sc-col sc-col-b">
                    <div className="sc-col-header">
                        <span className="sc-col-badge" style={{ background: '#00e87a' }}>CONVENTIONAL</span>
                        <span className="sc-col-sub">{calc.hasPMI ? `${convDown}% down · PMI until 80% LTV` : `${convDown}% down · No PMI`}</span>
                    </div>
                    <Stat icon="💵" label="Down payment" value={fmt(calc.convDownAmt)} sub={`${convDown}%`} />
                    <Stat icon="🏦" label="Loan amount" value={fmt(calc.convLoan)} />
                    <Stat icon="🛡️" label={calc.hasPMI ? 'PMI' : 'PMI'} value={calc.hasPMI ? fmt(calc.convPMImo) + '/mo' : 'None'} sub={calc.hasPMI ? `drops ~month ${calc.pmiMonths}` : '20%+ down'} />
                    <Stat icon="📅" label="Monthly PITI" value={fmt(calc.convTotal)} />
                    <Stat icon="📊" label="Rate" value={fmtPct(rate)} />
                </div>
            </div>
            <div className="sc-delta-row">
                <div className="sc-delta"><span className="sc-delta-label">💵 Extra down (conv)</span><span className="sc-delta-val">{fmt(calc.extraDown)}</span></div>
                <div className="sc-delta"><span className="sc-delta-label">📅 Monthly diff</span><span className="sc-delta-val" style={{ color: calc.monthlyDiff > 0 ? '#00e87a' : '#f59e0b' }}>{fmt(Math.abs(calc.monthlyDiff))}/mo</span></div>
                <div className="sc-delta"><span className="sc-delta-label">⏱ PMI drops</span><span className="sc-delta-val">{calc.hasPMI ? `mo ${calc.pmiMonths}` : 'No PMI'}</span></div>
                <div className="sc-delta"><span className="sc-delta-label">🛡️ FHA MIP</span><span className="sc-delta-val" style={{ color: '#f59e0b' }}>Life of loan</span></div>
            </div>
            <div className="sc-insight">💡 {insight}</div>
            <div className="sc-sliders">
                <Slider label="Purchase Price" value={price} min={100_000} max={1_200_000} step={25_000} onChange={setPrice} display={fmtK(price)} />
                <Slider label="Interest Rate" value={rate} min={4} max={10} step={0.125} onChange={setRate} display={fmtPct(rate)} />
                <Slider label="Conventional Down %" value={convDown} min={3} max={20} step={1} onChange={setConvDown} display={`${convDown}%`} />
                <Slider label="Years in home" value={years} min={2} max={15} step={1} onChange={setYears} display={`${years} yrs`} />
            </div>
            {onRunScenario && (
                <button className="sc-ai-btn" onClick={() => onRunScenario(calc.seed)}>
                    <span className="sc-ai-icon">🤖</span>
                    <span className="sc-ai-text">
                        <span className="sc-ai-label">Run deeper AI analysis on this scenario</span>
                        <span className="sc-ai-sub">Sends your exact numbers to the AI for a full breakdown</span>
                    </span>
                    <span className="sc-ai-arrow">→</span>
                </button>
            )}
        </div>
    );
}

// ── Main exported card ─────────────────────────────────────────────────────────
const TOOL_LABELS: Record<string, string> = {
    down_payment:   '5% vs 20% Down Payment',
    seller_credit:  'Rate Buydown vs Price Reduction',
    term:           '15-Year vs 30-Year',
    rent_buy:       'Rent vs Buy',
    conv_vs_jumbo:  'Conventional vs Jumbo',
    conv_vs_fha:    'Conventional vs FHA',
};

export default function ScenarioComparisonCard({
    tool, price, rate, downPct: _dp, years: _yr, credit, rent, jumboRatePremium,
    onRunScenario,
}: ScenarioComparisonCardParams) {
    return (
        <>
            <style>{`
                .sc-card{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);
                  border-radius:16px;overflow:hidden;font-family:var(--font-dm-sans,'DM Sans',sans-serif);}
                .sc-card *{box-sizing:border-box;}
                .sc-header{display:flex;align-items:center;gap:10px;padding:14px 18px;
                  border-bottom:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);}
                .sc-header-icon{font-size:1.1rem;}
                .sc-header-label{font-size:0.72rem;font-weight:700;letter-spacing:0.08em;
                  text-transform:uppercase;color:#00e87a;}
                .sc-header-title{font-size:0.95rem;font-weight:700;color:#f0f4ff;}
                .sc-body{padding:16px;display:flex;flex-direction:column;gap:14px;}
                .sc-columns{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
                @media(max-width:520px){.sc-columns{grid-template-columns:1fr;}}
                .sc-col{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);
                  border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px;}
                .sc-col-a{border-color:rgba(255,140,66,0.15);}
                .sc-col-b{border-color:rgba(0,232,122,0.15);}
                .sc-col-header{display:flex;flex-direction:column;gap:3px;padding-bottom:8px;
                  border-bottom:1px solid rgba(255,255,255,0.05);}
                .sc-col-badge{display:inline-block;font-size:0.62rem;font-weight:800;letter-spacing:0.07em;
                  text-transform:uppercase;color:#080c12;padding:2px 8px;border-radius:4px;width:fit-content;}
                .sc-col-sub{font-size:0.73rem;color:rgba(185,208,192,0.45);}
                .sc-stat{display:flex;flex-direction:column;gap:1px;}
                .sc-stat-label{font-size:0.68rem;text-transform:uppercase;letter-spacing:0.05em;color:rgba(185,208,192,0.4);}
                .sc-stat-value{font-size:1rem;font-weight:700;color:#f0f4ff;}
                .sc-stat-sub{font-size:0.68rem;color:rgba(185,208,192,0.35);}
                .sc-delta-row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
                @media(max-width:580px){.sc-delta-row{grid-template-columns:repeat(2,1fr);}}
                .sc-delta{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);
                  border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:3px;}
                .sc-delta-label{font-size:0.65rem;text-transform:uppercase;letter-spacing:0.04em;color:rgba(185,208,192,0.4);}
                .sc-delta-val{font-size:0.92rem;font-weight:700;color:#f0f4ff;}
                .sc-insight{background:rgba(0,232,122,0.05);border:1px solid rgba(0,232,122,0.12);
                  border-radius:9px;padding:12px 15px;font-size:0.84rem;line-height:1.55;color:#a0c0a8;}
                .sc-sliders{background:rgba(255,255,255,0.015);border:1px solid rgba(255,255,255,0.05);
                  border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:12px;}
                .sc-slider-row{display:flex;flex-direction:column;gap:5px;}
                .sc-slider-label-row{display:flex;justify-content:space-between;align-items:center;}
                .sc-slider-label{font-size:0.75rem;color:rgba(185,208,192,0.55);}
                .sc-slider-val{font-size:0.78rem;font-weight:700;color:#00e87a;}
                .sc-sliders input[type=range]{width:100%;height:3px;border-radius:2px;outline:none;
                  cursor:pointer;-webkit-appearance:none;appearance:none;}
                .sc-sliders input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
                  width:14px;height:14px;border-radius:50%;background:#00e87a;cursor:pointer;}
                .sc-ai-btn{display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;
                  background:rgba(0,232,122,0.06);border:1px solid rgba(0,232,122,0.2);
                  border-radius:10px;cursor:pointer;text-align:left;transition:background 0.15s;}
                .sc-ai-btn:hover{background:rgba(0,232,122,0.1);border-color:rgba(0,232,122,0.35);}
                .sc-ai-icon{font-size:1.3rem;flex-shrink:0;}
                .sc-ai-text{display:flex;flex-direction:column;gap:2px;flex:1;}
                .sc-ai-label{font-size:0.85rem;font-weight:700;color:#00e87a;}
                .sc-ai-sub{font-size:0.73rem;color:rgba(185,208,192,0.5);}
                .sc-ai-arrow{font-size:1rem;color:#00e87a;flex-shrink:0;}
            `}</style>
            <div className="sc-card">
                <div className="sc-header">
                    <span className="sc-header-icon">⚖️</span>
                    <div>
                        <div className="sc-header-label">Side-by-Side Comparison</div>
                        <div className="sc-header-title">{TOOL_LABELS[tool] ?? tool}</div>
                    </div>
                </div>
                {tool === 'down_payment' && (
                    <DownPaymentTool initPrice={price} initRate={rate} onRunScenario={onRunScenario} />
                )}
                {tool === 'seller_credit' && (
                    <SellerCreditTool initPrice={price} initRate={rate} initCredit={credit ?? 15_000} onRunScenario={onRunScenario} />
                )}
                {tool === 'term' && (
                    <TermTool initPrice={price} initRate={rate} onRunScenario={onRunScenario} />
                )}
                {tool === 'rent_buy' && (
                    <RentBuyTool initPrice={price} initRate={rate} initRent={rent ?? 2_800} onRunScenario={onRunScenario} />
                )}
                {tool === 'conv_vs_jumbo' && (
                    <ConvVsJumboTool initPrice={price} initRate={rate} initPremium={jumboRatePremium ?? 0.375} onRunScenario={onRunScenario} />
                )}
                {tool === 'conv_vs_fha' && (
                    <ConvVsFHATool initPrice={price} initRate={rate} onRunScenario={onRunScenario} />
                )}
            </div>
        </>
    );
}
