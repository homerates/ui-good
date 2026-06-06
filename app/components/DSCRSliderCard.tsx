'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SliderField from './SliderField';
import { calcPI } from '../../lib/math';
import { COLORS } from '../../lib/tokens';

// ── Math ──────────────────────────────────────────────────────────────────────


// ── Formatting ────────────────────────────────────────────────────────────────

function fmt$(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(n));
}
function fmtK(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
    if (n >= 100_000)   return `$${Math.round(n / 1_000)}k`;
    return fmt$(n);
}
// ── DSCR status ───────────────────────────────────────────────────────────────

function dscrStatus(dscr: number) {
    if (dscr >= 1.5)  return { label: 'Excellent — qualifies at all lenders ≥1.5x',       icon: '✓', color: '#00e87a', bg: 'rgba(0,232,122,0.07)',   border: 'rgba(0,232,122,0.25)',  noteText: 'All lenders'           };
    if (dscr >= 1.25) return { label: 'Strong Qualify — best rates & terms ≥1.25x',        icon: '✓', color: '#5edb94', bg: 'rgba(94,219,148,0.07)',  border: 'rgba(94,219,148,0.22)', noteText: 'Best pricing'          };
    if (dscr >= 1.0)  return { label: 'Standard Qualify — most lenders approve ≥1.0x',     icon: '⚠', color: '#f5c842', bg: 'rgba(245,200,66,0.07)',  border: 'rgba(245,200,66,0.22)', noteText: 'Most lenders'          };
    if (dscr >= 0.75) return { label: 'Minimum Qualify — select lenders at ≥0.75x',        icon: '⚠', color: '#ff8c42', bg: 'rgba(255,140,66,0.08)',  border: 'rgba(255,140,66,0.25)', noteText: 'Select lenders ≥0.75'  };
    return                   { label: 'Does Not Qualify — DSCR below 0.75x threshold',     icon: '✗', color: '#ff5f5f', bg: 'rgba(255,95,95,0.07)',   border: 'rgba(255,95,95,0.22)',  noteText: 'No qualify'            };
}

// ── Interface ─────────────────────────────────────────────────────────────────

export interface DSCRSliderParams {
    price:          number;
    rent:           number;
    downPct:        number;
    rate:           number;
    term?:          number;
    vacancyRate:    number;   // 0–1 decimal
    taxRate:        number;
    insRate:        number;
    onRunScenario?: (seed: string, overrides: Record<string, unknown>) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DSCRSliderCard(props: DSCRSliderParams) {
    const [price,   setPrice]   = useState(props.price);
    const [rent,    setRent]    = useState(props.rent);
    const [downPct, setDownPct] = useState(props.downPct);
    const [rate,    setRate]    = useState(props.rate);
    const term                  = props.term ?? 30;
    const router = useRouter();

    // ── Derived ────────────────────────────────────────────────────────────────

    const calc = useMemo(() => {
        const downAmt  = price * downPct / 100;
        const loanAmt  = price - downAmt;
        const ltv      = loanAmt / price * 100;
        const pi       = calcPI(loanAmt, rate, term);
        const tax      = (price * props.taxRate) / 12;
        const ins      = (price * props.insRate) / 12;
        const pitia    = pi + tax + ins;
        const dscr     = pitia > 0 ? rent / pitia : 0;

        // Break-even rents
        const rentFor075 = Math.ceil(pitia * 0.75);
        const rentFor100 = Math.ceil(pitia);
        const rentFor125 = Math.ceil(pitia * 1.25);

        // Reverse-solve down payment: rent / (pi(L) + tax + ins) = target
        // pi(L) = target*rent - tax - ins  →  L = pi_target / rFactor
        const rFactor = rate > 0
            ? (rate / 100 / 12) * Math.pow(1 + rate / 100 / 12, term * 12) / (Math.pow(1 + rate / 100 / 12, term * 12) - 1)
            : 1 / (term * 12);
        const piNeeded100 = Math.max(0, rent - tax - ins);
        const piNeeded125 = Math.max(0, rent / 1.25 - tax - ins);
        const loan100 = piNeeded100 > 0 && rFactor > 0 ? piNeeded100 / rFactor : 0;
        const loan125 = piNeeded125 > 0 && rFactor > 0 ? piNeeded125 / rFactor : 0;
        const dp100   = Math.max(0, price - loan100);
        const dp125   = Math.max(0, price - loan125);
        const dpPct100 = Math.round(dp100 / price * 100);
        const dpPct125 = Math.round(dp125 / price * 100);

        return { downAmt, loanAmt, ltv, pi, tax, ins, pitia, dscr, rentFor075, rentFor100, rentFor125, dp100, dp125, dpPct100, dpPct125 };
    }, [price, rent, downPct, rate, term, props.taxRate, props.insRate]);

    const status = dscrStatus(calc.dscr);

    // ── Gauge ──────────────────────────────────────────────────────────────────

    const segColors = ['#ff5f5f', '#ff8c42', '#f5c842', '#5edb94', '#00e87a'];
    // Segments lit up to and including the current band, dim above
    const currentBand = calc.dscr < 0.75 ? 0 : calc.dscr < 1.0 ? 1 : calc.dscr < 1.25 ? 2 : calc.dscr < 1.5 ? 3 : 4;

    // ── Actions ────────────────────────────────────────────────────────────────

    function buildSeed() {
        return `DSCR loan on a ${fmtK(price)} investment property — ${fmt$(rent)}/mo rent, ${downPct}% down at ${rate.toFixed(3)}%`;
    }
    function getRunOverrides() {
        return { purchasePrice: price, grossMonthlyRent: rent, downPaymentPct: downPct, annualRatePct: rate, vacancyRate: 0, loanType: 'dscr' };
    }
    function handleRun() {
        if (props.onRunScenario) props.onRunScenario(buildSeed(), getRunOverrides());
    }
    function handleCheckProperty() {
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
        router.push(`/check-property?${p.toString()}`);
    }

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="dsc">

            {/* ── Header ── */}
            <div className="dsc-header">
                <div className="dsc-header-left">
                    <div className="dsc-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#00e87a" strokeWidth="1.8" width="16" height="16">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75" />
                        </svg>
                    </div>
                    <div>
                        <div className="dsc-title">DSCR Investment Analysis</div>
                        <div className="dsc-sub">{fmtK(price)} · {downPct}% down · {fmt$(rent)}/mo rent</div>
                    </div>
                </div>
                <div className="dsc-badge">DSCR</div>
            </div>

            {/* ── Hero row ── */}
            <div className="dsc-hero">
                <div className="dsc-hero-cell">
                    <div className="dsc-hero-lbl">DSCR Ratio</div>
                    <div className="dsc-hero-val" style={{ color: status.color }}>
                        {calc.dscr.toFixed(2)}<span className="dsc-hero-unit">x</span>
                    </div>
                    <div className="dsc-hero-note" style={{ color: status.color }}>{status.noteText}</div>
                </div>
                <div className="dsc-hero-cell">
                    <div className="dsc-hero-lbl">Monthly PITIA</div>
                    <div className="dsc-hero-val">{fmt$(Math.round(calc.pitia))}</div>
                    <div className="dsc-hero-note">P&amp;I + Tax + Ins</div>
                </div>
                <div className="dsc-hero-cell">
                    <div className="dsc-hero-lbl">Loan Amount</div>
                    <div className="dsc-hero-val">{fmtK(calc.loanAmt)}</div>
                    <div className="dsc-hero-note">{calc.ltv.toFixed(0)}% LTV</div>
                </div>
            </div>

            {/* ── Gauge ── */}
            <div className="dsc-gauge-wrap">
                <div className="dsc-gauge-label">Qualification Band</div>
                <div className="dsc-gauge-bar">
                    {segColors.map((c, i) => (
                        <div key={i} className="dsc-gauge-seg" style={{ background: c, opacity: i <= currentBand ? 1 : 0.15 }} />
                    ))}
                </div>
                <div className="dsc-gauge-ticks">
                    {['<0.75', '0.75', '1.00', '1.25', '1.50+'].map((t, i) => (
                        <div key={i} className="dsc-gauge-tick" style={{ color: i === currentBand || i === currentBand + 1 ? '#c9d4e8' : '#8fa3b8' }}>{t}</div>
                    ))}
                </div>
            </div>

            {/* ── Status pill ── */}
            <div className="dsc-status-row">
                <div className="dsc-status-pill" style={{ background: status.bg, border: `1px solid ${status.border}`, color: status.color }}>
                    <span>{status.icon}</span>
                    <span>{status.label}</span>
                </div>
            </div>

            {/* ── PITIA breakdown ── */}
            <div className="dsc-pitia">
                <div className="dsc-pitia-header">
                    <div className="dsc-pitia-title">Monthly PITIA Breakdown</div>
                    <div className="dsc-pitia-total">{fmt$(Math.round(calc.pitia))}/mo</div>
                </div>
                <div className="dsc-pitia-rows">
                    <div className="dsc-pitia-row">
                        <div className="dsc-pitia-row-lbl"><div className="dsc-pitia-dot" style={{ background: '#4a8cff' }} />Principal &amp; Interest</div>
                        <div className="dsc-pitia-row-val">{fmt$(Math.round(calc.pi))}/mo</div>
                    </div>
                    <div className="dsc-pitia-row">
                        <div className="dsc-pitia-row-lbl"><div className="dsc-pitia-dot" style={{ background: '#f5c842' }} />Property Tax</div>
                        <div className="dsc-pitia-row-val">{fmt$(Math.round(calc.tax))}/mo</div>
                    </div>
                    <div className="dsc-pitia-row">
                        <div className="dsc-pitia-row-lbl"><div className="dsc-pitia-dot" style={{ background: '#ff8c42' }} />Insurance</div>
                        <div className="dsc-pitia-row-val">{fmt$(Math.round(calc.ins))}/mo</div>
                    </div>
                </div>
            </div>

            <div className="dsc-sep" />

            {/* ── Break-even rent ── */}
            <div className="dsc-be">
                <div className="dsc-be-title">How Much Rent Do You Need?</div>
                <div className="dsc-be-grid">
                    <div className="dsc-be-card" style={{ borderColor: 'rgba(255,95,95,0.2)' }}>
                        <div className="dsc-be-card-lbl" style={{ color: '#ff5f5f' }}>Minimum<br />0.75x</div>
                        <div className="dsc-be-card-rent">{fmt$(calc.rentFor075)}</div>
                        <div className="dsc-be-card-mo">/mo gross rent</div>
                        <div className="dsc-be-card-note" style={{ color: '#f87171' }}>Select lenders only</div>
                    </div>
                    <div className="dsc-be-card" style={{ borderColor: 'rgba(245,200,66,0.25)' }}>
                        <div className="dsc-be-card-lbl" style={{ color: '#f5c842' }}>Standard<br />1.00x</div>
                        <div className="dsc-be-card-rent">{fmt$(calc.rentFor100)}</div>
                        <div className="dsc-be-card-mo">/mo gross rent</div>
                        <div className="dsc-be-card-note" style={{ color: '#fbbf24' }}>Most lenders</div>
                    </div>
                    <div className="dsc-be-card" style={{ borderColor: 'rgba(0,232,122,0.2)' }}>
                        <div className="dsc-be-card-lbl" style={{ color: '#00e87a' }}>Ideal<br />1.25x</div>
                        <div className="dsc-be-card-rent">{fmt$(calc.rentFor125)}</div>
                        <div className="dsc-be-card-mo">/mo gross rent</div>
                        <div className="dsc-be-card-note" style={{ color: '#00a853' }}>Best rates &amp; terms</div>
                    </div>
                </div>
            </div>

            {/* ── Down payment insight ── */}
            <div className="dsc-dp-insight">
                <div className="dsc-dp-title">How Much Down Do You Need?</div>
                <div className="dsc-dp-row">
                    <div>
                        <div className="dsc-dp-lbl">At {fmt$(rent)}/mo rent → 1.00x DSCR</div>
                        <div className="dsc-dp-sub">loan amount that matches rent to PITIA</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div className="dsc-dp-val">{fmtK(calc.dp100)} down</div>
                        <div className="dsc-dp-sub">{calc.dpPct100}% of purchase</div>
                    </div>
                </div>
                <div className="dsc-dp-row" style={{ marginBottom: 0 }}>
                    <div>
                        <div className="dsc-dp-lbl">At {fmt$(rent)}/mo rent → 1.25x DSCR</div>
                        <div className="dsc-dp-sub">for best pricing tier</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div className="dsc-dp-val" style={{ color: '#5edb94' }}>{fmtK(calc.dp125)} down</div>
                        <div className="dsc-dp-sub">{calc.dpPct125}% of purchase</div>
                    </div>
                </div>
            </div>

            <div className="dsc-sep" />

            {/* ── Adjusters ── */}
            <div className="dsc-adj">
                <div className="dsc-adj-title">Adjust Scenario</div>

                <SliderField
                    label="Purchase Price" value={price}
                    min={100000} max={10000000} step={25000}
                    onChange={setPrice}
                    format={v => fmtK(v)}
                    minLabel="$100k" maxLabel="$10M"
                    trackColor={COLORS.accent} theme="dark"
                />

                <SliderField
                    label="Monthly Gross Rent" value={rent}
                    min={500} max={50000} step={100}
                    onChange={setRent}
                    format={v => `${fmt$(v)}/mo`}
                    minLabel="$500" maxLabel="$50k"
                    trackColor={COLORS.accent} theme="dark"
                />

                <SliderField
                    label="Down Payment" value={downPct}
                    min={20} max={50} step={0.01}
                    onChange={setDownPct}
                    format={v => `${parseFloat(v.toFixed(2))}% · ${fmtK(price * v / 100)}`}
                    parse={text => {
                        const t = text.trim();
                        const hasDollar = t.includes('$') || /[km]\b/i.test(t);
                        const hasPercent = t.includes('%');
                        const raw = parseFloat(t.replace(/[$,%\s]/gi, '').replace(/[km]\b/gi, ''));
                        if (isNaN(raw)) return NaN;
                        if (hasDollar || (!hasPercent && raw > 100)) {
                            const mult = /k\b/i.test(t) ? 1_000 : /m\b/i.test(t) ? 1_000_000 : 1;
                            return parseFloat(((raw * mult) / price * 100).toFixed(4));
                        }
                        return raw;
                    }}
                    minLabel="20%" maxLabel="50%"
                    trackColor={COLORS.accent} theme="dark"
                />

                <SliderField
                    label="Interest Rate" value={rate}
                    min={5} max={10} step={0.125}
                    onChange={setRate}
                    format={v => `${parseFloat(v.toFixed(3))}%`}
                    minLabel="5.00%" maxLabel="10.00%"
                    trackColor={COLORS.accent} theme="dark"
                />
            </div>

            {/* ── CTA ── */}
            <div className="dsc-cta-wrap">
                <div className="dsc-cta-row">
                    <button className="dsc-btn-primary" onClick={handleRun}>Run My Numbers</button>
                    <button className="dsc-btn-secondary" onClick={handleCheckProperty}>Check Property</button>
                </div>
            </div>



            {/* ── Styles ── */}
            <style>{`
                .dsc {
                    background: #0e1420;
                    border: 1px solid rgba(0,232,122,0.2);
                    border-radius: 14px;
                    overflow: hidden;
                    margin-top: 14px;
                    font-family: system-ui, -apple-system, sans-serif;
                    color: #f0f4ff;
                    width: 100%;
                }

                /* Header */
                .dsc-header { display:flex; align-items:center; justify-content:space-between; padding:14px 18px 10px; }
                .dsc-header-left { display:flex; align-items:center; gap:10px; }
                .dsc-icon { width:32px; height:32px; border-radius:8px; background:rgba(0,232,122,0.1); border:1px solid rgba(0,232,122,0.2); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
                .dsc-title { font-size:15px; font-weight:700; color:#f0f4ff; }
                .dsc-sub   { font-size:11px; color:#8fa3b8; margin-top:1px; }
                .dsc-badge { font-size:10px; font-weight:800; letter-spacing:0.07em; color:#00e87a; background:rgba(0,232,122,0.1); border:1px solid rgba(0,232,122,0.2); border-radius:5px; padding:3px 7px; }

                /* Hero */
                .dsc-hero { display:grid; grid-template-columns:1fr 1fr 1fr; gap:1px; background:rgba(255,255,255,0.05); margin:0 18px 14px; border-radius:11px; overflow:hidden; }
                .dsc-hero-cell { background:#0d1420; padding:14px 16px; }
                .dsc-hero-lbl  { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:#8fa3b8; margin-bottom:5px; }
                .dsc-hero-val  { font-size:1.45rem; font-weight:800; line-height:1; color:#f0f4ff; }
                .dsc-hero-unit { font-size:0.6em; font-weight:600; opacity:0.65; }
                .dsc-hero-note { font-size:10px; color:#8fa3b8; margin-top:4px; }

                /* Gauge */
                .dsc-gauge-wrap  { margin:0 18px 14px; }
                .dsc-gauge-label { font-size:10px; font-weight:700; color:#8fa3b8; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:7px; }
                .dsc-gauge-bar   { display:flex; height:7px; border-radius:99px; overflow:hidden; gap:2px; }
                .dsc-gauge-seg   { flex:1; border-radius:99px; transition:opacity 0.2s; }
                .dsc-gauge-ticks { display:flex; justify-content:space-between; margin-top:5px; }
                .dsc-gauge-tick  { font-size:9px; font-weight:700; }

                /* Status pill */
                .dsc-status-row  { margin:0 18px 14px; }
                .dsc-status-pill { display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:99px; font-size:12px; font-weight:700; }

                /* PITIA breakdown */
                .dsc-pitia { margin:0 18px 16px; background:#0a0f1c; border:1px solid rgba(255,255,255,0.06); border-radius:10px; overflow:hidden; }
                .dsc-pitia-header { display:flex; align-items:center; justify-content:space-between; padding:10px 14px 8px; border-bottom:1px solid rgba(255,255,255,0.05); }
                .dsc-pitia-title  { font-size:10px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:0.07em; }
                .dsc-pitia-total  { font-size:13px; font-weight:800; color:#f0f4ff; }
                .dsc-pitia-rows   { padding:8px 14px 10px; display:flex; flex-direction:column; gap:5px; }
                .dsc-pitia-row    { display:flex; align-items:center; justify-content:space-between; }
                .dsc-pitia-row-lbl { display:flex; align-items:center; gap:6px; font-size:12px; color:#8fa3b8; }
                .dsc-pitia-dot    { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
                .dsc-pitia-row-val { font-size:12px; font-weight:600; color:#c9d4e8; }

                /* Separator */
                .dsc-sep { height:1px; background:rgba(255,255,255,0.05); margin:0 18px 16px; }

                /* Break-even */
                .dsc-be { margin:0 18px 16px; }
                .dsc-be-title     { font-size:10px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:0.07em; margin-bottom:9px; }
                .dsc-be-grid      { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
                .dsc-be-card      { background:#0a0f1c; border:1px solid rgba(255,255,255,0.06); border-radius:9px; padding:11px 12px; }
                .dsc-be-card-lbl  { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; margin-bottom:5px; line-height:1.3; }
                .dsc-be-card-rent { font-size:15px; font-weight:800; color:#f0f4ff; line-height:1; }
                .dsc-be-card-mo   { font-size:9px; font-weight:600; color:#8fa3b8; }
                .dsc-be-card-note { font-size:10px; margin-top:4px; }

                /* Down payment insight */
                .dsc-dp-insight { margin:0 18px 16px; background:rgba(0,232,122,0.04); border:1px solid rgba(0,232,122,0.15); border-radius:10px; padding:12px 14px; }
                .dsc-dp-title   { font-size:10px; font-weight:800; color:#00a853; text-transform:uppercase; letter-spacing:0.07em; margin-bottom:9px; }
                .dsc-dp-row     { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
                .dsc-dp-lbl     { font-size:12px; color:#8fa3b8; }
                .dsc-dp-val     { font-size:13px; font-weight:700; color:#00e87a; }
                .dsc-dp-sub     { font-size:10px; color:#8fa3b8; margin-top:2px; }

                /* Adjusters */
                .dsc-adj       { margin:0 18px 16px; display:flex; flex-direction:column; gap:14px; }
                .dsc-adj-title { font-size:10px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:0.07em; margin-bottom:2px; }

                /* CTA */
                .dsc-cta-wrap      { padding:0 18px 18px; }
                .dsc-cta-row       { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px; }
                .dsc-btn-primary   { padding:12px; background:#00e87a; color:#07100f; font-size:13px; font-weight:800; border:none; border-radius:9px; cursor:pointer; font-family:inherit; letter-spacing:0.02em; transition:opacity 0.15s; }
                .dsc-btn-primary:hover { opacity:0.88; }
                .dsc-btn-secondary { padding:12px; background:transparent; color:#00e87a; font-size:13px; font-weight:700; border:1.5px solid rgba(0,232,122,0.3); border-radius:9px; cursor:pointer; font-family:inherit; transition:all 0.15s; }
                .dsc-btn-secondary:hover { background:rgba(0,232,122,0.06); }
                .dsc-btn-full      { display:block; width:100%; padding:12px; background:rgba(0,232,122,0.08); color:#00e87a; font-size:13px; font-weight:700; border:1.5px solid rgba(0,232,122,0.2); border-radius:9px; cursor:pointer; font-family:inherit; text-align:center; transition:all 0.15s; }
                .dsc-btn-full:hover { background:rgba(0,232,122,0.12); }

                /* Chips */
                .dsc-chips { padding:0 18px 14px; display:flex; gap:7px; flex-wrap:wrap; }
                .dsc-chip  { padding:6px 11px; background:rgba(0,232,122,0.06); border:1px solid rgba(0,232,122,0.18); border-radius:99px; font-size:11px; font-weight:600; color:#00a853; cursor:pointer; transition:all 0.15s; white-space:nowrap; font-family:inherit; }
                .dsc-chip:hover { background:rgba(0,232,122,0.12); }
            `}</style>
        </div>
    );
}
