'use client';
// app/compare/page.tsx
// LO Comparison Tools — 4 side-by-side mortgage scenarios with live sliders
// Designed for LOs to walk through with clients on screen

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import AppNav from '../components/AppNav';

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

// ── AI Analysis button ────────────────────────────────────────────────────────
function AIAnalysisBtn({ seed }: { seed: string }) {
  return (
    <Link
      href={`/chat?sq=${encodeURIComponent(seed)}`}
      className="cmp-ai-btn"
    >
      <span className="cmp-ai-icon">🤖</span>
      <span className="cmp-ai-text">
        <span className="cmp-ai-label">Get full AI Analysis</span>
        <span className="cmp-ai-sub">Opens HomeRates chat with this exact scenario pre-loaded</span>
      </span>
      <span className="cmp-ai-arrow">→</span>
    </Link>
  );
}

// ── Slider ────────────────────────────────────────────────────────────────────
function Slider({ label, value, min, max, step, onChange, display }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; display: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="cmp-slider-row">
      <div className="cmp-slider-label-row">
        <span className="cmp-slider-label">{label}</span>
        <span className="cmp-slider-val">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ background: `linear-gradient(to right,#00e87a 0%,#00e87a ${pct}%,rgba(255,255,255,0.1) ${pct}%,rgba(255,255,255,0.1) 100%)` }}
      />
    </div>
  );
}

// ── Stat cell ─────────────────────────────────────────────────────────────────
function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="cmp-stat">
      <div className="cmp-stat-label">{label}</div>
      <div className="cmp-stat-value" style={accent ? { color: '#00e87a' } : {}}>{value}</div>
      {sub && <div className="cmp-stat-sub">{sub}</div>}
    </div>
  );
}

// ── TOOL 1: 5% vs 20% Down ────────────────────────────────────────────────────
function DownPaymentTool() {
  const [price, setPrice] = useState(600_000);
  const [rate, setRate] = useState(6.75);
  const [years, setYears] = useState(7);

  const calc = useMemo(() => {
    const low = { down: price * 0.05, loan: price * 0.95 };
    const high = { down: price * 0.20, loan: price * 0.80 };
    const pmiRate = 0.0055; // ~0.55%/yr on loan balance

    const lowPI = calcPI(low.loan, rate);
    const lowPMI = (low.loan * pmiRate) / 12;
    const lowTotal = lowPI + lowPMI;

    const highPI = calcPI(high.loan, rate);
    const highTotal = highPI;

    const monthlyDiff = lowTotal - highTotal;

    // PMI drops off when loan hits 80% LTV — approx months
    // Simple: equity grows via paydown only (conservative)
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

    const cashKept = high.down - low.down; // cash saved by going 5%
    // Opportunity cost: cash kept invested at 7%/yr
    const invested = cashKept * Math.pow(1.07, years) - cashKept;
    const totalPMIPaid = Math.min(pmiMonths, years * 12) * lowPMI;
    const extraPayments = monthlyDiff * years * 12; // extra paid on higher payment

    return {
      low: { down: low.down, loan: low.loan, pi: lowPI, pmi: lowPMI, total: lowTotal, cash: low.down + price * 0.03 },
      high: { down: high.down, loan: high.loan, pi: highPI, total: highTotal, cash: high.down + price * 0.03 },
      monthlyDiff, pmiMonths, cashKept, invested, totalPMIPaid, extraPayments,
    };
  }, [price, rate, years]);

  const winner = calc.invested > calc.totalPMIPaid
    ? `Keeping cash and putting 5% down is ahead by ${fmtK(calc.invested - calc.totalPMIPaid)} after ${years} years (invested vs PMI cost).`
    : `20% down saves ${fmtK(calc.totalPMIPaid - calc.invested)} in PMI over ${years} years and eliminates ${fmtK(calc.monthlyDiff * 12)}/yr in extra payment.`;

  return (
    <div className="cmp-tool">
      <div className="cmp-columns">
        {/* 5% down */}
        <div className="cmp-col cmp-col-a">
          <div className="cmp-col-header">
            <span className="cmp-col-badge" style={{ background: '#ff8c42' }}>5% DOWN</span>
            <span className="cmp-col-sub">Lower cash in — higher monthly</span>
          </div>
          <Stat label="Down payment" value={fmt(calc.low.down)} sub="+ closing costs" />
          <Stat label="Loan amount" value={fmt(calc.low.loan)} />
          <Stat label="Monthly P&I" value={fmt(calc.low.pi)} />
          <Stat label="PMI (est.)" value={fmt(calc.low.pmi) + '/mo'} sub={`drops off ~month ${calc.pmiMonths}`} />
          <Stat label="Total monthly" value={fmt(calc.low.total)} />
          <Stat label="Cash to close" value={fmtK(calc.low.cash)} />
        </div>

        {/* 20% down */}
        <div className="cmp-col cmp-col-b">
          <div className="cmp-col-header">
            <span className="cmp-col-badge" style={{ background: '#00e87a' }}>20% DOWN</span>
            <span className="cmp-col-sub">Higher cash in — no PMI</span>
          </div>
          <Stat label="Down payment" value={fmt(calc.high.down)} sub="+ closing costs" />
          <Stat label="Loan amount" value={fmt(calc.high.loan)} />
          <Stat label="Monthly P&I" value={fmt(calc.high.pi)} />
          <Stat label="PMI" value="None" />
          <Stat label="Total monthly" value={fmt(calc.high.total)} />
          <Stat label="Cash to close" value={fmtK(calc.high.cash)} />
        </div>
      </div>

      <div className="cmp-delta-row">
        <div className="cmp-delta"><span className="cmp-delta-label">Monthly difference</span><span className="cmp-delta-val">{fmt(calc.monthlyDiff)}/mo</span></div>
        <div className="cmp-delta"><span className="cmp-delta-label">Cash kept (5% route)</span><span className="cmp-delta-val">{fmt(calc.cashKept)}</span></div>
        <div className="cmp-delta"><span className="cmp-delta-label">That cash invested @7%/{years}yr</span><span className="cmp-delta-val">{fmtK(calc.invested)}</span></div>
        <div className="cmp-delta"><span className="cmp-delta-label">Total PMI paid/{years}yr</span><span className="cmp-delta-val">{fmtK(calc.totalPMIPaid)}</span></div>
      </div>

      <div className="cmp-insight">💡 {winner}</div>

      <div className="cmp-sliders">
        <Slider label="Purchase Price" value={price} min={200_000} max={2_000_000} step={25_000} onChange={setPrice} display={fmtK(price)} />
        <Slider label="Interest Rate" value={rate} min={4} max={10} step={0.125} onChange={setRate} display={fmtPct(rate)} />
        <Slider label="Years in home" value={years} min={2} max={15} step={1} onChange={setYears} display={`${years} yrs`} />
      </div>
    </div>
  );
}

// ── TOOL 2: Rate Buydown vs Price Reduction ───────────────────────────────────
function SellerCreditTool() {
  const [price, setPrice] = useState(650_000);
  const [credit, setCredit] = useState(15_000);
  const [baseRate, setBaseRate] = useState(6.75);
  const [downPct, setDownPct] = useState(10);
  const [years, setYears] = useState(7);

  const calc = useMemo(() => {
    const down = price * (downPct / 100);

    // Option A: Price reduction
    const loanA = (price - credit) * (1 - downPct / 100);
    const piA = calcPI(loanA, baseRate);

    // Option B: Rate buydown (1 point ≈ 0.125–0.25% rate reduction)
    // Standard: 1 point = 1% of loan = ~0.25% rate reduction
    // Credit as points: credit / (price*(1-downPct/100)) * 100 = points
    const loanB = price * (1 - downPct / 100);
    const points = (credit / loanB) * 100; // points purchased
    const rateReduction = points * 0.25; // 0.25% per point
    const reducedRate = Math.max(baseRate - rateReduction, 1);
    const piB = calcPI(loanB, reducedRate);

    const monthlyDiff = piA - piB; // positive = B saves money (lower payment)
    const annualSavingsA = 0; // baseline
    const annualSavingsB = monthlyDiff * 12;
    const totalSavedB = monthlyDiff * years * 12;

    // A saves by having lower loan balance
    const loanDiffA = loanB - loanA; // A has smaller loan
    const savingsFromSmallerLoan = (calcPI(loanB, baseRate) - piA) * years * 12;

    const winner = totalSavedB > savingsFromSmallerLoan ? 'B' : 'A';
    const margin = Math.abs(totalSavedB - savingsFromSmallerLoan);

    return {
      A: { loan: loanA, rate: baseRate, pi: piA, down, cash: down + price * 0.02 },
      B: { loan: loanB, rate: reducedRate, pi: piB, down, cash: down + price * 0.02 + credit, points: points.toFixed(2), rateReduction: rateReduction.toFixed(3) },
      monthlyDiff, totalSavedB, savingsFromSmallerLoan, winner, margin,
    };
  }, [price, credit, baseRate, downPct, years]);

  const insight = calc.winner === 'B'
    ? `Rate buydown saves ${fmtK(calc.totalSavedB)} more than price reduction over ${years} years. Best if you stay put.`
    : `Price reduction saves ${fmtK(calc.savingsFromSmallerLoan)} more than rate buydown over ${years} years (smaller loan compounds over time).`;

  return (
    <div className="cmp-tool">
      <div className="cmp-columns">
        <div className="cmp-col cmp-col-a">
          <div className="cmp-col-header">
            <span className="cmp-col-badge" style={{ background: '#ff8c42' }}>PRICE REDUCTION</span>
            <span className="cmp-col-sub">Seller drops price by {fmt(credit)}</span>
          </div>
          <Stat label="Purchase price" value={fmt(price - credit)} />
          <Stat label="Loan amount" value={fmt(calc.A.loan)} />
          <Stat label="Interest rate" value={fmtPct(calc.A.rate)} />
          <Stat label="Monthly P&I" value={fmt(calc.A.pi)} />
          <Stat label="Down payment" value={fmt(calc.A.down)} />
        </div>

        <div className="cmp-col cmp-col-b">
          <div className="cmp-col-header">
            <span className="cmp-col-badge" style={{ background: '#00e87a' }}>RATE BUYDOWN</span>
            <span className="cmp-col-sub">{calc.B.points} pts → −{calc.B.rateReduction}% rate</span>
          </div>
          <Stat label="Purchase price" value={fmt(price)} />
          <Stat label="Loan amount" value={fmt(calc.B.loan)} />
          <Stat label="Bought-down rate" value={fmtPct(calc.B.rate)} sub={`was ${fmtPct(baseRate)}`} />
          <Stat label="Monthly P&I" value={fmt(calc.B.pi)} />
          <Stat label="Down payment" value={fmt(calc.B.down)} />
        </div>
      </div>

      <div className="cmp-delta-row">
        <div className="cmp-delta"><span className="cmp-delta-label">Monthly payment difference</span><span className="cmp-delta-val">{fmt(Math.abs(calc.monthlyDiff))}/mo</span></div>
        <div className="cmp-delta"><span className="cmp-delta-label">Rate buydown savings / {years}yr</span><span className="cmp-delta-val">{fmtK(calc.totalSavedB)}</span></div>
        <div className="cmp-delta"><span className="cmp-delta-label">Price reduction savings / {years}yr</span><span className="cmp-delta-val">{fmtK(calc.savingsFromSmallerLoan)}</span></div>
        <div className="cmp-delta"><span className="cmp-delta-label">Winner</span><span className="cmp-delta-val" style={{ color: '#00e87a' }}>{calc.winner === 'B' ? 'Rate Buydown' : 'Price Reduction'}</span></div>
      </div>

      <div className="cmp-insight">💡 {insight}</div>

      <div className="cmp-sliders">
        <Slider label="Purchase Price" value={price} min={200_000} max={2_000_000} step={25_000} onChange={setPrice} display={fmtK(price)} />
        <Slider label="Seller Credit" value={credit} min={1_000} max={50_000} step={500} onChange={setCredit} display={fmtK(credit)} />
        <Slider label="Base Interest Rate" value={baseRate} min={4} max={10} step={0.125} onChange={setBaseRate} display={fmtPct(baseRate)} />
        <Slider label="Down Payment" value={downPct} min={3} max={30} step={1} onChange={setDownPct} display={`${downPct}%`} />
        <Slider label="Years in home" value={years} min={2} max={15} step={1} onChange={setYears} display={`${years} yrs`} />
      </div>
    </div>
  );
}

// ── TOOL 3: 15-Year vs 30-Year ────────────────────────────────────────────────
function TermTool() {
  const [price, setPrice] = useState(600_000);
  const [downPct, setDownPct] = useState(20);
  const [rate30, setRate30] = useState(6.75);

  const calc = useMemo(() => {
    const loan = price * (1 - downPct / 100);
    const rate15 = Math.max(rate30 - 0.65, 1); // 15yr historically ~0.65% lower

    const pi30 = calcPI(loan, rate30, 30);
    const pi15 = calcPI(loan, rate15, 15);
    const monthlyDiff = pi15 - pi30;

    const totalPaid30 = pi30 * 360;
    const totalPaid15 = pi15 * 180;
    const totalInterest30 = totalPaid30 - loan;
    const totalInterest15 = totalPaid15 - loan;
    const interestSaved = totalInterest30 - totalInterest15;

    // Equity at year 5
    function equityAtYear(rate: number, years: number): number {
      const pi = calcPI(loan, rate, years === 15 ? 15 : 30);
      const r = rate / 100 / 12;
      let bal = loan;
      for (let m = 0; m < Math.min(60, years * 12); m++) {
        const interest = bal * r;
        const principal = pi - interest;
        bal = Math.max(0, bal - principal);
      }
      return loan - bal;
    }
    const equity30at5 = equityAtYear(rate30, 30);
    const equity15at5 = equityAtYear(rate15, 15);
    const extraEquity = equity15at5 - equity30at5;

    return { loan, rate15, pi30, pi15, monthlyDiff, totalInterest30, totalInterest15, interestSaved, equity30at5, equity15at5, extraEquity };
  }, [price, downPct, rate30]);

  return (
    <div className="cmp-tool">
      <div className="cmp-columns">
        <div className="cmp-col cmp-col-a">
          <div className="cmp-col-header">
            <span className="cmp-col-badge" style={{ background: '#ff8c42' }}>30-YEAR</span>
            <span className="cmp-col-sub">Lower payment, slower equity</span>
          </div>
          <Stat label="Rate" value={fmtPct(rate30)} />
          <Stat label="Monthly P&I" value={fmt(calc.pi30)} />
          <Stat label="Total interest paid" value={fmtK(calc.totalInterest30)} />
          <Stat label="Equity at year 5" value={fmtK(calc.equity30at5)} />
          <Stat label="Loan paid off" value="Year 30" />
        </div>

        <div className="cmp-col cmp-col-b">
          <div className="cmp-col-header">
            <span className="cmp-col-badge" style={{ background: '#00e87a' }}>15-YEAR</span>
            <span className="cmp-col-sub">Higher payment, massive savings</span>
          </div>
          <Stat label="Rate" value={fmtPct(calc.rate15)} sub="~0.65% lower (typical)" />
          <Stat label="Monthly P&I" value={fmt(calc.pi15)} />
          <Stat label="Total interest paid" value={fmtK(calc.totalInterest15)} />
          <Stat label="Equity at year 5" value={fmtK(calc.equity15at5)} />
          <Stat label="Loan paid off" value="Year 15" />
        </div>
      </div>

      <div className="cmp-delta-row">
        <div className="cmp-delta"><span className="cmp-delta-label">Extra monthly (15yr)</span><span className="cmp-delta-val">{fmt(calc.monthlyDiff)}/mo</span></div>
        <div className="cmp-delta"><span className="cmp-delta-label">Interest saved</span><span className="cmp-delta-val" style={{ color: '#00e87a' }}>{fmtK(calc.interestSaved)}</span></div>
        <div className="cmp-delta"><span className="cmp-delta-label">Extra equity at yr 5</span><span className="cmp-delta-val" style={{ color: '#00e87a' }}>{fmtK(calc.extraEquity)}</span></div>
        <div className="cmp-delta"><span className="cmp-delta-label">Paid off 15 years sooner</span><span className="cmp-delta-val" style={{ color: '#00e87a' }}>✓</span></div>
      </div>

      <div className="cmp-insight">💡 The 15-year saves {fmtK(calc.interestSaved)} in total interest and builds {fmtK(calc.extraEquity)} more equity in the first 5 years — at the cost of {fmt(calc.monthlyDiff)}/mo more. The 30-year frees that cash flow for investing.</div>

      <div className="cmp-sliders">
        <Slider label="Purchase Price" value={price} min={200_000} max={2_000_000} step={25_000} onChange={setPrice} display={fmtK(price)} />
        <Slider label="Down Payment" value={downPct} min={5} max={40} step={5} onChange={setDownPct} display={`${downPct}%`} />
        <Slider label="30-Year Rate" value={rate30} min={4} max={10} step={0.125} onChange={setRate30} display={fmtPct(rate30)} />
      </div>
    </div>
  );
}

// ── TOOL 4: Rent vs Buy ───────────────────────────────────────────────────────
function RentBuyTool() {
  const [price, setPrice] = useState(550_000);
  const [rent, setRent] = useState(2_800);
  const [downPct, setDownPct] = useState(10);
  const [rate, setRate] = useState(6.75);
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

    // Appreciation
    const appRate = 0.04; // 4%/yr
    const futureValue = price * Math.pow(1 + appRate, years);
    const appreciation = futureValue - price;

    // Equity from paydown
    const r = rate / 100 / 12;
    let bal = loan;
    for (let m = 0; m < years * 12; m++) {
      const interest = bal * r;
      const principal = pi - interest;
      bal = Math.max(0, bal - principal);
    }
    const paydownEquity = loan - bal;
    const totalEquity = down + paydownEquity + appreciation;
    const netBuyPosition = totalEquity - closingCosts - (price * 0.06); // sell costs ~6%

    // Rent total outlay (3% annual increase)
    let totalRent = 0;
    let monthlyRent = rent;
    for (let y = 0; y < years; y++) {
      totalRent += monthlyRent * 12;
      monthlyRent *= 1.03;
    }
    const rentAtYearN = rent * Math.pow(1.03, years);

    const buyNetWorth = netBuyPosition;
    const rentNetWorth = 0; // renter has no housing equity (assumes they don't invest diff)
    const monthlyDiff = totalBuy - rent;

    return { down, loan, pi, tax, ins, pmi, totalBuy, closingCosts, appreciation, paydownEquity, totalEquity, netBuyPosition, totalRent, rentAtYearN, monthlyDiff, futureValue };
  }, [price, rent, downPct, rate, years]);

  const insight = calc.netBuyPosition > 0
    ? `Buying builds ${fmtK(calc.netBuyPosition)} in net equity over ${years} years (after selling costs). Monthly buy cost is ${calc.monthlyDiff > 0 ? fmt(calc.monthlyDiff) + '/mo more' : fmt(-calc.monthlyDiff) + '/mo less'} than renting.`
    : `At ${years} years, selling costs eat the equity. Staying longer or renting more aggressively tips the balance.`;

  return (
    <div className="cmp-tool">
      <div className="cmp-columns">
        <div className="cmp-col cmp-col-a">
          <div className="cmp-col-header">
            <span className="cmp-col-badge" style={{ background: '#ff8c42' }}>RENT</span>
            <span className="cmp-col-sub">Flexibility, zero equity</span>
          </div>
          <Stat label="Monthly rent (today)" value={fmt(calc.totalBuy > 0 ? rent : 0)} />
          <Stat label="Rent at year {years}" value={fmt(calc.rentAtYearN)} sub="at 3%/yr increase" />
          <Stat label={`Total rent paid / ${years}yr`} value={fmtK(calc.totalRent)} />
          <Stat label="Equity built" value="$0" />
          <Stat label="Net worth from housing" value="$0" />
        </div>

        <div className="cmp-col cmp-col-b">
          <div className="cmp-col-header">
            <span className="cmp-col-badge" style={{ background: '#00e87a' }}>BUY</span>
            <span className="cmp-col-sub">Building equity + appreciation</span>
          </div>
          <Stat label="Monthly PITI + PMI" value={fmt(calc.totalBuy)} />
          <Stat label="Down + closing" value={fmtK(calc.down + calc.closingCosts)} />
          <Stat label={`Appreciation / ${years}yr`} value={fmtK(calc.appreciation)} sub="at 4%/yr" />
          <Stat label={`Paydown equity / ${years}yr`} value={fmtK(calc.paydownEquity)} />
          <Stat label="Net equity (after sell costs)" value={fmtK(calc.netBuyPosition)} accent />
        </div>
      </div>

      <div className="cmp-delta-row">
        <div className="cmp-delta"><span className="cmp-delta-label">Monthly cost difference</span><span className="cmp-delta-val">{fmt(Math.abs(calc.monthlyDiff))}/mo {calc.monthlyDiff > 0 ? 'more to buy' : 'more to rent'}</span></div>
        <div className="cmp-delta"><span className="cmp-delta-label">Home value in {years}yr</span><span className="cmp-delta-val">{fmtK(calc.futureValue)}</span></div>
        <div className="cmp-delta"><span className="cmp-delta-label">Net equity built</span><span className="cmp-delta-val" style={{ color: '#00e87a' }}>{fmtK(calc.netBuyPosition)}</span></div>
        <div className="cmp-delta"><span className="cmp-delta-label">Total rent paid</span><span className="cmp-delta-val">{fmtK(calc.totalRent)}</span></div>
      </div>

      <div className="cmp-insight">💡 {insight}</div>

      <div className="cmp-sliders">
        <Slider label="Home Price" value={price} min={150_000} max={2_000_000} step={25_000} onChange={setPrice} display={fmtK(price)} />
        <Slider label="Current Monthly Rent" value={rent} min={500} max={10_000} step={100} onChange={setRent} display={fmt(rent) + '/mo'} />
        <Slider label="Down Payment" value={downPct} min={3} max={30} step={1} onChange={setDownPct} display={`${downPct}%`} />
        <Slider label="Interest Rate" value={rate} min={4} max={10} step={0.125} onChange={setRate} display={fmtPct(rate)} />
        <Slider label="Years in home" value={years} min={2} max={15} step={1} onChange={setYears} display={`${years} yrs`} />
      </div>
    </div>
  );
}

// ── Page shell ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'down',   label: '5% vs 20% Down',          icon: '💰' },
  { id: 'credit', label: 'Rate Buydown vs Price Cut', icon: '⚖️' },
  { id: 'term',   label: '15yr vs 30yr',              icon: '📅' },
  { id: 'rent',   label: 'Rent vs Buy',               icon: '🏠' },
];

export default function ComparePage() {
  const [tab, setTab] = useState('down');

  return (
    <>
      <style>{`
        body:has(.ps-root){display:block!important;height:auto!important;overflow:visible!important;}
        html:has(.ps-root){height:auto!important;overflow:visible!important;}
        body:has(.ps-root) .app-footer{display:none!important;}
        .ps-root{min-height:100vh;width:100%;background:#080c12;color:#e0f0e8;
          font-family:var(--font-dm-sans,'DM Sans',sans-serif);
          display:flex;flex-direction:column;align-items:center;overflow-x:hidden;box-sizing:border-box;}
        .ps-root *{box-sizing:border-box;}

        /* Header */
        .cp-header{position:sticky;top:0;z-index:50;width:100%;background:rgba(8,12,18,0.95);
          backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,0.06);}
        .cp-header-inner{max-width:960px;margin:0 auto;padding:0 20px;height:52px;
          display:flex;align-items:center;justify-content:space-between;gap:12px;}
        .cp-logo-link{display:flex;align-items:center;text-decoration:none;flex-shrink:0;}
        .cp-logo{height:24px;width:auto;}
        .cp-header-title{font-size:0.82rem;font-weight:600;color:rgba(185,208,192,0.5);}
        @media(max-width:640px){.cp-header-title{display:none;}.cp-chat-link{display:none;}}
        .cp-chat-link{display:inline-flex;align-items:center;gap:5px;font-size:0.78rem;
          font-weight:600;color:#00e87a;text-decoration:none;padding:5px 12px;
          border:1px solid rgba(0,232,122,0.3);border-radius:7px;flex-shrink:0;transition:background 0.15s;}
        .cp-chat-link:hover{background:rgba(0,232,122,0.08);}

        /* Main */
        .cp-main{width:100%;max-width:960px;padding:32px 16px 72px;display:flex;flex-direction:column;gap:24px;}

        /* Hero */
        .cp-hero{text-align:center;}
        .cp-eyebrow{display:inline-block;font-size:0.68rem;font-weight:700;letter-spacing:0.1em;
          text-transform:uppercase;color:#00e87a;background:rgba(0,232,122,0.1);
          border:1px solid rgba(0,232,122,0.2);border-radius:5px;padding:3px 9px;margin-bottom:10px;}
        .cp-h1{font-size:clamp(1.5rem,3vw,2.2rem);font-weight:800;color:#f0f4ff;line-height:1.15;margin:0 0 8px;}
        .cp-subtitle{font-size:0.88rem;color:rgba(185,208,192,0.6);max-width:540px;margin:0 auto;line-height:1.6;}

        /* Tabs */
        .cp-tabs{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;}
        .cp-tab{display:flex;align-items:center;gap:7px;padding:9px 18px;
          border-radius:10px;border:1px solid rgba(255,255,255,0.08);
          background:rgba(255,255,255,0.03);cursor:pointer;
          font-size:0.82rem;font-weight:600;color:rgba(185,208,192,0.6);
          transition:all 0.15s;white-space:nowrap;}
        .cp-tab:hover{border-color:rgba(0,232,122,0.2);color:#e0f0e8;}
        .cp-tab.active{background:rgba(0,232,122,0.1);border-color:rgba(0,232,122,0.35);color:#00e87a;}
        .cp-tab-icon{font-size:1rem;}

        /* Tool wrapper */
        .cmp-tool{display:flex;flex-direction:column;gap:16px;}

        /* Columns */
        .cmp-columns{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
        @media(max-width:560px){.cmp-columns{grid-template-columns:1fr;}}
        .cmp-col{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);
          border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:12px;}
        .cmp-col-a{border-color:rgba(255,140,66,0.2);}
        .cmp-col-b{border-color:rgba(0,232,122,0.2);}
        .cmp-col-header{display:flex;flex-direction:column;gap:4px;padding-bottom:10px;
          border-bottom:1px solid rgba(255,255,255,0.06);}
        .cmp-col-badge{display:inline-block;font-size:0.65rem;font-weight:800;letter-spacing:0.08em;
          text-transform:uppercase;color:#080c12;padding:3px 9px;border-radius:5px;width:fit-content;}
        .cmp-col-sub{font-size:0.78rem;color:rgba(185,208,192,0.5);}

        /* Stats */
        .cmp-stat{display:flex;flex-direction:column;gap:2px;}
        .cmp-stat-label{font-size:0.72rem;text-transform:uppercase;letter-spacing:0.05em;color:rgba(185,208,192,0.45);}
        .cmp-stat-value{font-size:1.05rem;font-weight:700;color:#f0f4ff;}
        .cmp-stat-sub{font-size:0.72rem;color:rgba(185,208,192,0.4);}

        /* Delta row */
        .cmp-delta-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
        @media(max-width:640px){.cmp-delta-row{grid-template-columns:repeat(2,1fr);}}
        .cmp-delta{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);
          border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:4px;}
        .cmp-delta-label{font-size:0.68rem;text-transform:uppercase;letter-spacing:0.05em;color:rgba(185,208,192,0.45);}
        .cmp-delta-val{font-size:0.98rem;font-weight:700;color:#f0f4ff;}

        /* Insight */
        .cmp-insight{background:rgba(0,232,122,0.05);border:1px solid rgba(0,232,122,0.15);
          border-radius:10px;padding:14px 18px;font-size:0.88rem;line-height:1.6;color:#a0c0a8;}

        /* Sliders */
        .cmp-sliders{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);
          border-radius:12px;padding:18px 20px;display:flex;flex-direction:column;gap:14px;}
        .cmp-slider-row{display:flex;flex-direction:column;gap:6px;}
        .cmp-slider-label-row{display:flex;justify-content:space-between;align-items:center;}
        .cmp-slider-label{font-size:0.78rem;color:rgba(185,208,192,0.6);}
        .cmp-slider-val{font-size:0.82rem;font-weight:700;color:#00e87a;}
        input[type=range]{width:100%;height:4px;border-radius:2px;outline:none;cursor:pointer;
          -webkit-appearance:none;appearance:none;}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
          width:16px;height:16px;border-radius:50%;background:#00e87a;cursor:pointer;}

        /* CTA */
        .cp-cta{text-align:center;padding:24px;background:rgba(255,255,255,0.02);
          border:1px solid rgba(255,255,255,0.06);border-radius:14px;}
        .cp-cta p{font-size:0.88rem;color:rgba(185,208,192,0.6);margin:0 0 14px;}
        .cp-cta-btn{display:inline-flex;align-items:center;gap:7px;background:#00e87a;
          color:#080c12;font-size:0.88rem;font-weight:700;padding:12px 28px;
          border-radius:9px;text-decoration:none;transition:background 0.15s;}
        .cp-cta-btn:hover{background:#00ff8a;}

        /* Footer */
        .cp-footer{width:100%;border-top:1px solid rgba(255,255,255,0.06);padding:18px 24px;
          display:flex;align-items:center;justify-content:center;flex-wrap:wrap;
          gap:8px;font-size:0.75rem;color:rgba(185,208,192,0.35);}
        .cp-footer a{color:rgba(0,232,122,0.45);text-decoration:none;}
        .cp-footer a:hover{color:#00e87a;}
        .cp-footer-sep{opacity:0.3;}
      `}</style>

      <div className="ps-root">
        <header className="cp-header">
          <div className="cp-header-inner">
            <Link href="/" className="cp-logo-link">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" className="cp-logo" />
            </Link>
            <span className="cp-header-title">LO Comparison Tools</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Link href="/chat" className="cp-chat-link">Full AI chat →</Link>
              <AppNav drawerOnly />
            </div>
          </div>
        </header>

        <main className="cp-main">
          <div className="cp-hero">
            <span className="cp-eyebrow">Side-by-Side</span>
            <h1 className="cp-h1">Mortgage Scenario Comparisons</h1>
            <p className="cp-subtitle">
              The 4 conversations every LO has — now instant. Adjust any slider and all numbers update live.
            </p>
          </div>

          {/* Tabs */}
          <div className="cp-tabs">
            {TABS.map(t => (
              <button key={t.id} className={`cp-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
                <span className="cp-tab-icon">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {/* Active tool */}
          {tab === 'down'   && <DownPaymentTool />}
          {tab === 'credit' && <SellerCreditTool />}
          {tab === 'term'   && <TermTool />}
          {tab === 'rent'   && <RentBuyTool />}

          {/* CTA */}
          <div className="cp-cta">
            <p>Need a deeper analysis on a real property? Paste any address in the AI chat — full Intelligence Card in seconds.</p>
            <Link href="/chat" className="cp-cta-btn">Open AI chat — no forms required →</Link>
          </div>
        </main>

        <footer className="cp-footer">
          <span>HomeRates.ai — educational tool, not a lender. Numbers are estimates for comparison purposes.</span>
          <span className="cp-footer-sep">•</span>
          <Link href="/disclosures">Terms</Link>
          <span className="cp-footer-sep">•</span>
          <Link href="/privacy">Privacy</Link>
        </footer>
      </div>
    </>
  );
}
