'use client';

// app/components/HelocSliderCard.tsx
// HELOC Intelligence Card — dual-mode (Summary + Deep Dive)
// Dark theme matching RefiIntelligenceCard / DSCRSliderCard pattern

import React, { useState, useMemo } from 'react';
import SliderField from './SliderField';

export interface HelocSliderParams {
    homeValue:    number;
    balance:      number;
    drawAmount?:  number;
    helocRate?:   number;
    cashOutRate?: number;
    sofr?:        number;    // Prime ≈ SOFR + 3%
    address?:     string;
    onRunScenario?: (seed: string) => void;
}

// ── Math ──────────────────────────────────────────────────────────────────────
function calcPI(principal: number, ratePct: number, termMo: number): number {
    if (principal <= 0 || termMo <= 0) return 0;
    if (ratePct === 0) return principal / termMo;
    const r = ratePct / 100 / 12;
    return principal * r * Math.pow(1 + r, termMo) / (Math.pow(1 + r, termMo) - 1);
}

function fmt$(n: number, compact = false): string {
    if (compact) {
        if (Math.abs(n) >= 1_000_000) return `$${(Math.abs(n) / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
        if (Math.abs(n) >= 1_000) return `$${Math.round(Math.abs(n) / 1_000)}k`;
    }
    return `$${Math.round(Math.abs(n)).toLocaleString()}`;
}
function fmtR(r: number) { return `${r.toFixed(2)}%`; }

const DRAW_PERIOD_MO = 120; // 10yr standard draw period

// ── Verdict ──────────────────────────────────────────────────────────────────
function helocVerdict(cltv80: number, draw: number, maxLine80: number): { emoji: string; text: string; color: string } {
    if (draw === 0) return { emoji: '📐', color: '#94a3b8', text: 'Adjust the draw amount to see your HELOC payment and qualification window.' };
    if (cltv80 <= 75) return { emoji: '✅', color: '#00e87a', text: `Strong equity — CLTV ${cltv80.toFixed(0)}%. Most lenders will compete for this file. Draw up to ${fmt$(maxLine80, true)} at 80% CLTV.` };
    if (cltv80 <= 80) return { emoji: '⚡', color: '#fbbf24', text: `At the 80% CLTV ceiling. This is the standard qualification limit — reduce draw slightly for rate negotiation leverage.` };
    if (cltv80 <= 85) return { emoji: '⚠️', color: '#f97316', text: `Over 80% CLTV. Some lenders allow 85% but at higher rates. Reduce draw to ${fmt$(maxLine80, true)} to stay within the standard window.` };
    return { emoji: '🚫', color: '#ef4444', text: `CLTV too high to qualify at this draw amount. Build equity or reduce draw to access a HELOC.` };
}

// ── Color tokens ──────────────────────────────────────────────────────────────
const C = {
    bg:    '#0d1117', card:  '#0a111e', green: '#00e87a',
    blue:  '#60a5fa', teal:  '#2dd4bf', amber: '#fbbf24',
    red:   '#ef4444', muted: '#94a3b8', dim: '#eaf8f7',
    text:  '#e6edf3', sub:   '#8b949e',
} as const;

// ── Component ─────────────────────────────────────────────────────────────────
export default function HelocSliderCard(props: HelocSliderParams) {
    const defaultRate = props.helocRate ?? (props.sofr ? parseFloat((props.sofr + 3.0).toFixed(2)) : 8.5);
    const initMax80   = Math.max(0, Math.round(props.homeValue * 0.80 - props.balance));
    const initDraw    = props.drawAmount ?? Math.min(75_000, initMax80);

    const [homeValue,  setHomeValue]  = useState(props.homeValue);
    const [balance,    setBalance]    = useState(props.balance);
    const [drawAmount, setDrawAmount] = useState(Math.min(initDraw, initMax80));
    const [helocRate,  setHelocRate]  = useState(defaultRate);
    const [repayYrs,   setRepayYrs]   = useState(20);
    const [mode,       setMode]       = useState<'simple' | 'deep'>('simple');

    const maxLine80 = Math.max(0, Math.round(homeValue * 0.80 - balance));
    const maxLine85 = Math.max(0, Math.round(homeValue * 0.85 - balance));
    const safeDraw  = Math.min(drawAmount, maxLine85);
    const equity    = Math.max(0, homeValue - balance);
    const equityPct = homeValue > 0 ? (equity / homeValue) * 100 : 0;
    const cltv80    = homeValue > 0 ? ((balance + safeDraw) / homeValue) * 100 : 0;
    const cashOutRate = props.cashOutRate ?? helocRate;
    const shortAddr   = props.address?.split(',')[0] ?? 'Your Property';
    const verdict     = helocVerdict(cltv80, safeDraw, maxLine80);

    const calc = useMemo(() => {
        const repayMo       = repayYrs * 12;
        const drawMonthly   = safeDraw > 0 ? safeDraw * (helocRate / 100 / 12) : 0;
        const repayMonthly  = calcPI(safeDraw, helocRate, repayMo);
        const totalDrawInt  = drawMonthly * DRAW_PERIOD_MO;
        const totalRepayInt = Math.max(0, repayMonthly * repayMo - safeDraw);
        const totalHelocInt = totalDrawInt + totalRepayInt;

        const cashOutBal      = balance + safeDraw;
        const cashOutMonthly  = calcPI(cashOutBal, cashOutRate, 360);
        const oldMonthly      = calcPI(balance, cashOutRate, 360);
        const cashOutDelta    = cashOutMonthly - oldMonthly;
        const cashOutTotalInt = Math.max(0, cashOutMonthly * 360 - cashOutBal);
        const cashOutClosing  = Math.round(cashOutBal * 0.02);

        // Equity zone thresholds
        const zone80 = maxLine80;
        const zone85 = maxLine85;
        const zone70 = Math.max(0, Math.round(homeValue * 0.70 - balance));

        return {
            repayMo, drawMonthly: Math.round(drawMonthly),
            repayMonthly: Math.round(repayMonthly),
            totalDrawInt: Math.round(totalDrawInt),
            totalRepayInt: Math.round(totalRepayInt),
            totalHelocInt: Math.round(totalHelocInt),
            cashOutMonthly: Math.round(cashOutMonthly),
            cashOutDelta: Math.round(cashOutDelta),
            cashOutTotalInt: Math.round(cashOutTotalInt),
            cashOutClosing,
            helocWins: totalHelocInt < cashOutTotalInt,
            helocSavings: Math.abs(totalHelocInt - cashOutTotalInt),
            zone70, zone80, zone85,
        };
    }, [safeDraw, helocRate, repayYrs, balance, cashOutRate, homeValue, maxLine80, maxLine85]);

    // Must start with "HELOC on ..." to match the dispatcher's guard
    // (lib/calcDispatcher.ts, /^heloc\s+on\b/i) that routes HELOC questions
    // to a plain AI narrative instead of a calc card. Without it, both chips'
    // mention of "cash-out refi" trips isRefiQuestion() -- the highest-
    // priority classifier -- misreading the home value as a loan balance to
    // refinance away from and the HELOC rate as the current mortgage rate.
    function buildSeed(type = 'heloc'): string {
        const addr = props.address ?? 'this property';
        const base = `HELOC on ${addr} — home value ${fmt$(homeValue, true)}, mortgage balance ${fmt$(balance, true)}, HELOC draw ${fmt$(safeDraw, true)} at ${fmtR(helocRate)}.`;
        if (type === 'cashout') return `${base} Compare this HELOC to a cash-out refi at ${fmtR(cashOutRate)}. Which saves more over 10 years?`;
        return `${base} Walk me through the draw period payments, repayment schedule, and whether this makes sense vs a cash-out refi.`;
    }

    const cltvColor = cltv80 > 85 ? C.red : cltv80 > 80 ? '#f97316' : cltv80 > 75 ? C.amber : C.green;

    return (
        <div style={{ background: C.bg, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, overflow: 'hidden', marginTop: 12, width: '100%', boxSizing: 'border-box', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
        <style>{`
          @keyframes hc-pulse{0%,100%{opacity:1}50%{opacity:.4}}
          .hc-dot{width:6px;height:6px;border-radius:50%;background:#2dd4bf;box-shadow:0 0 6px #2dd4bf;animation:hc-pulse 2s infinite;flex-shrink:0}
          .hc-mode{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:5px 12px;border-radius:5px;border:none;cursor:pointer;background:transparent;color: #eaf8f7;transition:all .15s}
          .hc-mode.active{background:rgba(45,212,191,0.1);color:#2dd4bf}
          .hc-chip{font-size:10px;font-weight:700;color: #94a3b8;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:4px 12px;cursor:pointer;white-space:nowrap}
          .hc-chip:hover{background:rgba(255,255,255,0.07);color:#e6edf3}
          .hc-dive{margin:0 16px 16px;background:linear-gradient(135deg,rgba(45,212,191,0.06),rgba(96,165,250,0.04));border:1px solid rgba(45,212,191,0.18);border-radius:10px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;transition:all .15s}
          .hc-dive:hover{border-color:rgba(45,212,191,0.35);background:rgba(45,212,191,0.09)}
          .hc-back{display:flex;align-items:center;gap:6px;padding:10px 16px 0;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color: #eaf8f7;cursor:pointer;border:none;background:transparent}
          .hc-back:hover{color:#2dd4bf}
          .hc-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px}
          .hc-row:last-child{border-bottom:none}
          .hc-zone{border-radius:8px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:12px}
          .hc-repay-btn{flex:1;padding:7px 0;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;border:2px solid transparent;transition:all .12s}
        `}</style>

        {/* ── Topbar ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderBottom:'1px solid rgba(255,255,255,0.05)', background:'rgba(255,255,255,0.02)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                <div className="hc-dot" />
                <span style={{ fontSize:10, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:C.muted }}>HELOC Intelligence</span>
                {props.address && <span style={{ fontSize:10, color:C.dim }}>· {shortAddr}</span>}
            </div>
            <div style={{ display:'flex', gap:2 }}>
                <button className={`hc-mode${mode==='simple'?' active':''}`} onClick={() => setMode('simple')}>Summary</button>
                <button className={`hc-mode${mode==='deep'?' active':''}`} onClick={() => setMode('deep')}>Deep Dive</button>
            </div>
        </div>

        {mode === 'simple' ? (<>

            {/* ── Hero: 3 stats ── */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, padding:'14px 14px 0' }}>
                {[
                    { label:'Max Line (80%)', val: maxLine80 > 0 ? fmt$(maxLine80, true) : 'None', color: maxLine80 > 0 ? C.teal : C.red, sub:`CLTV ${Math.min(80, cltv80).toFixed(0)}%` },
                    { label:'Draw Payment', val: safeDraw > 0 ? `${fmt$(calc.drawMonthly)}/mo` : '—', color: C.blue, sub:'Interest only · 10yr' },
                    { label:'Repayment P&I', val: safeDraw > 0 ? `${fmt$(calc.repayMonthly)}/mo` : '—', color: C.text, sub:`${repayYrs}yr payoff` },
                ].map(({ label, val, color, sub }) => (
                    <div key={label} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'10px 8px', textAlign:'center' }}>
                        <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:C.dim, marginBottom:5 }}>{label}</div>
                        <div style={{ fontSize:18, fontWeight:800, color, letterSpacing:'-0.03em', lineHeight:1 }}>{val}</div>
                        <div style={{ fontSize:9, color:C.dim, marginTop:4 }}>{sub}</div>
                    </div>
                ))}
            </div>

            {/* ── CLTV Verdict ── */}
            <div style={{ margin:'12px 14px 0', background:'rgba(255,255,255,0.02)', border:`1px solid ${verdict.color}33`, borderRadius:10, padding:'9px 12px', display:'flex', alignItems:'flex-start', gap:8 }}>
                <span style={{ fontSize:14, flexShrink:0, marginTop:1 }}>{verdict.emoji}</span>
                <span style={{ fontSize:11, color:verdict.color, fontWeight:600, lineHeight:1.4 }}>{verdict.text}</span>
            </div>

            {/* ── Sliders ── */}
            <div style={{ padding:'14px 14px 0' }}>
                <SliderField label="Home Value" value={homeValue}
                    min={100_000} max={Math.max(5_000_000, Math.ceil(homeValue * 1.5 / 500_000) * 500_000)}
                    step={homeValue >= 1_000_000 ? 25_000 : 5_000}
                    onChange={setHomeValue} format={(v) => fmt$(v)} trackColor={C.teal} theme="dark" />
                <SliderField label="Mortgage Balance" value={balance}
                    min={0} max={Math.max(3_000_000, Math.ceil(homeValue * 0.97 / 100_000) * 100_000)}
                    step={balance >= 1_000_000 ? 25_000 : 5_000}
                    onChange={setBalance} format={(v) => fmt$(v)} trackColor={C.muted} theme="dark" />
                <SliderField
                    label={`HELOC Draw${maxLine80 > 0 ? ` (max ${fmt$(maxLine80, true)} at 80%)` : ' — build equity first'}`}
                    value={safeDraw} min={0} max={Math.max(maxLine85, 1)}
                    step={safeDraw >= 500_000 ? 25_000 : safeDraw >= 100_000 ? 5_000 : 1_000}
                    onChange={v => setDrawAmount(Math.min(v, maxLine85))}
                    format={(v) => fmt$(v)} trackColor={C.blue} theme="dark" />
                <SliderField label="HELOC Rate" value={helocRate}
                    min={5} max={14} step={0.125}
                    onChange={setHelocRate} format={(v) => fmtR(v)} trackColor={C.amber} theme="dark" />
            </div>

            {/* ── Repayment period ── */}
            <div style={{ padding:'12px 14px 0' }}>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:C.dim, marginBottom:7 }}>Repayment Period</div>
                <div style={{ display:'flex', gap:6 }}>
                    {[10, 15, 20].map(yr => (
                        <button key={yr} className="hc-repay-btn"
                            onClick={() => setRepayYrs(yr)}
                            style={{
                                borderColor: repayYrs === yr ? C.teal : 'rgba(255,255,255,0.08)',
                                background:  repayYrs === yr ? 'rgba(45,212,191,0.1)' : 'rgba(255,255,255,0.03)',
                                color:       repayYrs === yr ? C.teal : C.muted,
                            }}
                        >{yr}yr</button>
                    ))}
                </div>
            </div>

            {/* ── Equity summary strip ── */}
            <div style={{ margin:'12px 14px 0', display:'flex', gap:10, flexWrap:'wrap' }}>
                {[
                    { l:'Equity', v: fmt$(equity, true), c: equityPct >= 20 ? C.green : C.amber },
                    { l:'LTV',    v: `${(homeValue > 0 ? balance/homeValue*100 : 0).toFixed(0)}%`, c: C.text },
                    { l:'CLTV w/ draw', v: `${cltv80.toFixed(0)}%`, c: cltvColor },
                    { l:'85% line', v: maxLine85 > 0 ? fmt$(maxLine85, true) : '—', c: C.sub },
                ].map(({ l, v, c }) => (
                    <div key={l} style={{ fontSize:11, color:C.sub }}>
                        {l} <strong style={{ color: c }}>{v}</strong>
                    </div>
                ))}
            </div>

            {/* ── Deep Dive trigger ── */}
            <div className="hc-dive" style={{ marginTop:14 }} onClick={() => setMode('deep')}>
                <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                    <span style={{ fontSize:16 }}>🔬</span>
                    <div>
                        <div style={{ fontSize:12, fontWeight:700, color:C.teal }}>Deep Dive AI Analysis</div>
                        <div style={{ fontSize:10, color:C.dim, marginTop:2 }}>Cost breakdown · vs Cash-Out · Equity zones · Use cases</div>
                    </div>
                </div>
                <span style={{ fontSize:16, color:C.dim }}>→</span>
            </div>

        </>) : (<>

            {/* ── Deep Dive mode ── */}
            <button className="hc-back" onClick={() => setMode('simple')}>← Back to Summary</button>

            {/* Cost Breakdown */}
            <div style={{ padding:'12px 14px 0' }}>
                <div style={{ fontSize:9, fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', color:C.dim, marginBottom:10 }}>Cost Breakdown — {fmt$(safeDraw, true)} Draw</div>
                <div style={{ background:'linear-gradient(135deg,#0a1620,#081018)', border:'1px solid rgba(45,212,191,0.15)', borderRadius:14, overflow:'hidden' }}>
                    {[
                        { l:`Draw period (10yr × ${fmt$(calc.drawMonthly)}/mo — interest only)`, v: fmt$(calc.totalDrawInt), c: C.teal },
                        { l:`Repayment period (${repayYrs}yr P&I)`, v: fmt$(calc.totalRepayInt), c: C.blue },
                        { l:'Total HELOC interest', v: fmt$(calc.totalHelocInt), c: C.text, bold: true },
                        { l:'Closing costs', v: '$0', c: C.green, note: 'HELOCs typically have minimal or no closing costs' },
                    ].map(({ l, v, c, bold, note }) => (
                        <div key={l} className="hc-row" style={{ padding:'9px 14px' }}>
                            <div>
                                <div style={{ color: bold ? C.text : C.sub, fontWeight: bold ? 700 : 400 }}>{l}</div>
                                {note && <div style={{ fontSize:10, color:C.dim, marginTop:2 }}>{note}</div>}
                            </div>
                            <div style={{ fontWeight:800, color:c, whiteSpace:'nowrap', marginLeft:12 }}>{v}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* vs Cash-Out Refi */}
            {safeDraw > 0 && (
                <div style={{ padding:'12px 14px 0' }}>
                    <div style={{ fontSize:9, fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', color:C.dim, marginBottom:10 }}>vs Cash-Out Refi @ {fmtR(cashOutRate)}</div>
                    <div style={{ background:'linear-gradient(135deg,#0a1620,#081018)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:14, overflow:'hidden' }}>
                        {[
                            { l:'New refi balance', v: fmt$(balance + safeDraw), c: C.text },
                            { l:'Monthly P&I (30yr)', v: `${fmt$(calc.cashOutMonthly)}/mo`, c: C.text },
                            { l:'Payment increase vs today', v: `+${fmt$(calc.cashOutDelta)}/mo`, c: C.amber },
                            { l:'Est. closing costs (~2%)', v: fmt$(calc.cashOutClosing), c: C.red },
                            { l:'Total interest over 30yr', v: fmt$(calc.cashOutTotalInt), c: C.text },
                        ].map(({ l, v, c }) => (
                            <div key={l} className="hc-row" style={{ padding:'9px 14px' }}>
                                <span style={{ color:C.sub }}>{l}</span>
                                <span style={{ fontWeight:700, color:c, whiteSpace:'nowrap', marginLeft:12 }}>{v}</span>
                            </div>
                        ))}
                        <div style={{ padding:'10px 14px', background:'rgba(255,255,255,0.02)', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                <span style={{ fontSize:12, fontWeight:700, color:C.text }}>
                                    {calc.helocWins ? '🏆 HELOC wins' : '🏆 Cash-out wins'}
                                </span>
                                <span style={{ fontSize:13, fontWeight:800, color: calc.helocWins ? C.green : C.amber }}>
                                    saves {fmt$(calc.helocSavings, true)} in interest
                                </span>
                            </div>
                            <div style={{ fontSize:10, color:C.dim, marginTop:4 }}>
                                {calc.helocWins
                                    ? 'HELOC preserves your existing mortgage rate + avoids closing costs.'
                                    : 'Cash-out refi consolidates debt at a fixed rate — better if you want payment certainty.'}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Equity Zone Map */}
            <div style={{ padding:'12px 14px 0' }}>
                <div style={{ fontSize:9, fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', color:C.dim, marginBottom:10 }}>Equity Access Zones</div>
                {[
                    { label:'Conservative (70% CLTV)', amount: calc.zone70, note:'Best rates, easiest approval', color:'#00e87a' },
                    { label:'Standard (80% CLTV)', amount: calc.zone80, note:'Industry benchmark — most lenders', color:C.teal },
                    { label:'Stretch (85% CLTV)', amount: calc.zone85, note:'Select lenders only, higher rate', color:C.amber },
                ].map(({ label, amount, note, color }) => (
                    <div key={label} className="hc-zone" style={{ background:'rgba(255,255,255,0.02)', border:`1px solid ${color}22` }}>
                        <div>
                            <div style={{ fontSize:12, fontWeight:700, color:C.text }}>{label}</div>
                            <div style={{ fontSize:10, color:C.dim, marginTop:2 }}>{note}</div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                            <div style={{ fontSize:16, fontWeight:800, color: amount > 0 ? color : C.dim }}>
                                {amount > 0 ? fmt$(amount, true) : 'None'}
                            </div>
                            <div style={{ fontSize:9, color:C.dim }}>available</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* When HELOC wins */}
            <div style={{ padding:'12px 14px 0' }}>
                <div style={{ fontSize:9, fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', color:C.dim, marginBottom:10 }}>When HELOC Makes Sense</div>
                <div style={{ background:'linear-gradient(135deg,#0a1620,#081018)', border:'1px solid rgba(45,212,191,0.12)', borderRadius:14, padding:'12px 14px' }}>
                    {[
                        { win:true,  t:'Your existing rate is below market — HELOC keeps it intact' },
                        { win:true,  t:'Flexible draw — pay interest only on what you actually use' },
                        { win:true,  t:'Short-term need — remodel, bridge, or business capital' },
                        { win:false, t:'Need a fixed payment — HELOC is variable, can spike with prime rate' },
                        { win:false, t:'Pulling large lump sums long-term — cash-out locks in your rate' },
                    ].map(({ win, t }) => (
                        <div key={t} style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:7, fontSize:11, color:C.sub, lineHeight:1.4 }}>
                            <span style={{ color: win ? C.green : C.dim, fontWeight:800, flexShrink:0, marginTop:1 }}>{win ? '✓' : '·'}</span>
                            <span>{t}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* AI Analysis chips */}
            {props.onRunScenario && safeDraw > 0 && (
                <div style={{ padding:'12px 14px 0', display:'flex', gap:6, flexWrap:'wrap' }}>
                    <button className="hc-chip" onClick={() => props.onRunScenario!(buildSeed('heloc'))}>
                        🔍 Full HELOC analysis →
                    </button>
                    <button className="hc-chip" onClick={() => props.onRunScenario!(buildSeed('cashout'))}>
                        ⚖️ vs Cash-Out →
                    </button>
                    <button className="hc-chip" onClick={() => props.onRunScenario!(`What can I use HELOC funds for on ${shortAddr}? What are the tax implications?`)}>
                        📋 Use cases + tax →
                    </button>
                </div>
            )}

            <div style={{ height:16 }} />

        </>)}
        </div>
    );
}
