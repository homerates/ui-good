'use client';

// app/components/RefiIntelligenceCard.tsx
// Refi Intelligence Card — dual-mode (Simple + Deep Dive AI)
// Property + map hero, Tesla-style rate delta, 3 scenarios, HELOC, equity map, AI verdict

import React, { useState, useMemo } from 'react';
import SliderField from './SliderField';
import { COLORS } from '../../lib/tokens';

export interface RefiIntelligenceParams {
    // Core refi data
    balance: number;           // current/remaining loan balance
    currentRate: number;       // user's current rate
    newRate: number;           // FRED live 30yr rate
    termMonths?: number;       // new loan term months (default 360)
    closingCosts?: number;     // estimated closing costs (default 1.5% of balance)
    remainingMonths?: number;  // months left on current loan

    // Property context (from My Properties / Estated)
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    propertyValue?: number;    // AVM
    origRateLabel?: string;    // e.g. "Jul 2022"
    photoUrl?: string;         // ssl.cdn-redfin.com only

    // FRED context
    fredDate?: string;         // e.g. "Apr 23, 2026"
    sofr?: number;             // SOFR rate

    onRunScenario?: (seed: string, params?: Record<string, number>) => void;
}

// ── Math ──────────────────────────────────────────────────────────────────────
function calcPI(principal: number, ratePct: number, termMo: number): number {
    if (ratePct === 0) return principal / termMo;
    const r = ratePct / 100 / 12;
    return principal * r * Math.pow(1 + r, termMo) / (Math.pow(1 + r, termMo) - 1);
}

function fmt$(n: number, compact = false): string {
    if (compact) {
        if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
        if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
    }
    return `$${Math.round(Math.abs(n)).toLocaleString()}`;
}

function fmtRate(r: number): string {
    return `${r.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%`;
}

// ── Bar width helper — scale against 9% max ───────────────────────────────────
function barW(rate: number): string { return `${Math.min(100, (rate / 9) * 100).toFixed(1)}%`; }

// ── Date formatter — "2026-03-21" → "Mar 21, 2026" ───────────────────────────
function fmtFredDate(d?: string | null): string {
    if (!d) return '30yr avg';
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Verdict ────────────────────────────────────────────────────────────────────
function refiVerdict(rateDelta: number, beMonths: number | null): { emoji: string; text: string; color: string } {
    if (rateDelta >= 0.75 && beMonths !== null && beMonths <= 30) {
        return { emoji: '✅', color: '#00e87a', text: `Refinance makes strategic sense — ${beMonths}-month break-even with a ${rateDelta.toFixed(2)}% rate drop and rates near a multi-year equilibrium.` };
    }
    if (rateDelta >= 0.5) {
        return { emoji: '⚡', color: '#fbbf24', text: `Marginal benefit — ${rateDelta.toFixed(2)}% rate drop may be worth it. Run the break-even before committing.` };
    }
    return { emoji: '⏸', color: '#ef4444', text: `Hold — rate savings are thin (${rateDelta.toFixed(2)}%). Wait for a stronger rate environment or until you need cash-out.` };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function RefiIntelligenceCard(props: RefiIntelligenceParams) {
    const {
        balance: initBalance,
        currentRate: initCurrentRate,
        newRate: initNewRate,
        termMonths: initTermMonths = 360,
        remainingMonths,
        address,
        city,
        state,
        zip,
        propertyValue,
        origRateLabel,
        fredDate,
        sofr,
        photoUrl,
        onRunScenario,
    } = props;

    const safePhoto = photoUrl && /ssl\.cdn-redfin\.com/i.test(photoUrl) ? photoUrl : null;

    const initClosingCosts = props.closingCosts ?? Math.round(initBalance * 0.015 / 500) * 500;

    // Adjustable state — init from props per slider-state pattern
    const [balance, setBalance]           = useState(initBalance);
    const [currentRate, setCurrentRate]   = useState(initCurrentRate);
    const [newRate, setNewRate]           = useState(initNewRate);
    const [termMonths, setTermMonths]     = useState(initTermMonths);
    const [closingCosts, setClosingCosts] = useState(initClosingCosts);
    const [noCost, setNoCost]             = useState(false);

    const effNewRate = noCost ? parseFloat((newRate + 0.25).toFixed(3)) : newRate;
    const effClosing = noCost ? 0 : closingCosts;
    const termYears  = Math.round(termMonths / 12);
    const balanceMax = Math.max(4_000_000, Math.ceil(balance * 1.5 / 500_000) * 500_000);

    const isDirty =
        balance !== initBalance ||
        currentRate !== initCurrentRate ||
        newRate !== initNewRate ||
        termMonths !== initTermMonths ||
        closingCosts !== initClosingCosts ||
        noCost;

    const [mode, setMode] = useState<'simple' | 'deep'>('simple');
    const [activeScenario, setActiveScenario] = useState<'rate_term' | '15yr' | 'cashout'>('rate_term');

    // ── Derived calculations ──────────────────────────────────────────────────
    const calc = useMemo(() => {
        const oldPI     = calcPI(balance, currentRate, remainingMonths ?? 360);
        const refiRate  = parseFloat((effNewRate + 0.125).toFixed(3));
        const newPI30   = calcPI(balance, refiRate, termMonths);
        const savings   = oldPI - newPI30;

        const beMonths: number | null =
            savings > 0 && effClosing > 0 ? Math.ceil(effClosing / savings) :
            savings > 0 ? 0 : null;

        const net5yr  = Math.round(savings * 60  - effClosing);
        const net10yr = Math.round(savings * 120 - effClosing);

        const oldTotalInt = Math.round(oldPI * (remainingMonths ?? 360) - balance);
        const newTotalInt30 = Math.round(newPI30 * termMonths - balance);
        const intSaved30  = oldTotalInt - newTotalInt30;

        // 15yr scenario — 15yr typically ~0.6% below 30yr
        const rate15 = Math.max(3, parseFloat((newRate - 0.6).toFixed(3)));
        const pi15   = calcPI(balance, rate15, 180);
        const int15  = Math.round(pi15 * 180 - balance);
        const intSaved15vs30 = newTotalInt30 - int15;
        const payoffGainYrs  = parseFloat(((termMonths - 180) / 12).toFixed(1));

        // Cash-out scenario — up to 80% CLTV
        const cashOutRate  = parseFloat((newRate + 0.25).toFixed(3));
        const maxCashLoan  = propertyValue ? Math.round(propertyValue * 0.80) : null;
        const cashOutAmt   = maxCashLoan ? maxCashLoan - balance : null;
        const piCashOut    = maxCashLoan && cashOutAmt && cashOutAmt > 0
            ? calcPI(maxCashLoan, cashOutRate, termMonths) : null;
        const cashOutPmtDelta = piCashOut ? Math.round(piCashOut - oldPI) : null;
        const cashOutNewLtv   = propertyValue && maxCashLoan ? Math.round(maxCashLoan / propertyValue * 100) : null;

        // HELOC
        const helocMax = propertyValue ? Math.max(0, Math.round(propertyValue * 0.80 - balance)) : null;
        const helocRate = sofr ? parseFloat((sofr + 3.0).toFixed(2)) : null; // Prime ≈ SOFR + 3%

        // Equity
        const equityAmt = propertyValue ? propertyValue - balance : null;
        const equityPct = propertyValue && equityAmt ? Math.round(equityAmt / propertyValue * 100) : null;
        const ltv       = propertyValue ? Math.round(balance / propertyValue * 100) : null;

        // Thresholds (cash accessible at each CLTV)
        const access80 = propertyValue ? Math.max(0, Math.round(propertyValue * 0.80 - balance)) : null;
        const access75 = propertyValue ? Math.max(0, Math.round(propertyValue * 0.75 - balance)) : null;
        const access70 = propertyValue ? Math.round(propertyValue * 0.70 - balance) : null;

        const rateDelta  = parseFloat((currentRate - refiRate).toFixed(3));
        const verdict    = refiVerdict(rateDelta, beMonths);
        const fwdRate    = parseFloat((newRate - 0.48).toFixed(2));

        return {
            refiRate,
            oldPI: Math.round(oldPI), newPI30: Math.round(newPI30),
            savings: Math.round(savings), beMonths, net5yr, net10yr,
            oldTotalInt, newTotalInt30, intSaved30,
            rate15, pi15: Math.round(pi15), int15, intSaved15vs30, payoffGainYrs,
            cashOutRate, maxCashLoan, cashOutAmt, piCashOut: piCashOut ? Math.round(piCashOut) : null,
            cashOutPmtDelta, cashOutNewLtv,
            helocMax, helocRate,
            equityAmt, equityPct, ltv,
            access80, access75, access70,
            rateDelta, verdict, fwdRate,
        };
    }, [balance, currentRate, effNewRate, termMonths, effClosing, remainingMonths, propertyValue, sofr]);

    // ── Address formatting ────────────────────────────────────────────────────
    const shortAddr  = address ? address.split(',')[0] : null;
    const addrLine1  = shortAddr ?? 'Your Property';
    const addrLine2  = [city, state, zip].filter(Boolean).join(', ');
    // "Analyse Property" deep-links to the specific property, not just /my-home — a bare
    // href here previously always landed on whichever property is primary/first in the
    // user's list, silently ignoring which property this card was actually for.
    const addressForLink = [shortAddr, addrLine2].filter(Boolean).join(', ') || null;

    function buildSeed(type: string): string {
        const costStr = effClosing > 0 ? `, closing costs ${fmt$(effClosing)}` : ', no closing costs';
        if (type === '15yr') return `Refi ${fmt$(balance, true)} balance from ${fmtRate(currentRate)} to ${fmtRate(calc.rate15)} — 15yr fixed${costStr}`;
        if (type === 'cashout') return `Cash-out refinance ${fmt$(calc.maxCashLoan ?? balance, true)} at ${fmtRate(calc.cashOutRate)} — 30yr fixed`;
        if (type === 'heloc') return `HELOC on ${addrLine1} — property value ${fmt$(propertyValue ?? 0, true)}, balance ${fmt$(balance, true)}, max line ${fmt$(calc.helocMax ?? 0, true)}`;
        return `Refi ${fmt$(balance, true)} balance from ${fmtRate(currentRate)} to ${fmtRate(calc.refiRate)} — ${termYears}yr fixed${costStr}`;
    }

    function buildRunSeed(): string {
        const costStr = effClosing > 0 ? `, closing costs $${Math.round(effClosing / 500) * 500}` : ', no closing costs';
        return `Refi ${fmt$(balance, true)} balance from ${currentRate.toFixed(2)}% to ${effNewRate.toFixed(2)}% — ${termYears}yr fixed${costStr}`;
    }

    // ── Token colors ──────────────────────────────────────────────────────────
    const C = {
        bg:     '#0d1117',
        card:   '#0a111e',
        green:  '#00e87a',
        blue:   '#60a5fa',
        purple: '#a78bfa',
        amber:  '#fbbf24',
        red:    '#ef4444',
        muted: '#94a3b8',
        dim: '#eaf8f7',
        text:   '#e6edf3',
        sub:    '#8b949e',
    } as const;

    const tabStyle = (active: boolean, color: string = C.green): React.CSSProperties => ({
        flex: 1, padding: '7px 4px', borderRadius: 7, border: 'none', cursor: 'pointer',
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
        background: active ? (color === C.green ? 'rgba(0,232,122,0.1)' : color === C.purple ? 'rgba(139,92,246,0.1)' : 'rgba(251,191,36,0.08)') : 'transparent',
        color: active ? color : C.dim, transition: 'all .12s',
    });

    const chipStyle: React.CSSProperties = {
        fontSize: 10, fontWeight: 700, color: C.muted,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20, padding: '4px 12px', cursor: 'pointer', whiteSpace: 'nowrap',
    };

    return (
        <div style={{ background: C.bg, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, overflow: 'hidden', marginTop: 12, width: '100%', boxSizing: 'border-box', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
        <style>{`
          @keyframes ri-pulse{0%,100%{opacity:1}50%{opacity:.4}}
          .ri-live-dot{width:6px;height:6px;border-radius:50%;background:#00e87a;box-shadow:0 0 6px #00e87a;animation:ri-pulse 2s infinite;flex-shrink:0}
          .ri-mode-btn{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:5px 12px;border-radius:5px;border:none;cursor:pointer;background:transparent;color: #eaf8f7;transition:all .15s}
          .ri-mode-btn.active-simple{background:#0d1f35;color:#60a5fa}
          .ri-mode-btn.active-deep{background:#1a0d2e;color:#a78bfa}
          .ri-s-btn-primary{width:100%;background:#00e87a;color:#07100f;font-size:14px;font-weight:800;border:none;border-radius:12px;padding:15px 16px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}
          .ri-s-btn-secondary{flex:1;background:rgba(255,255,255,0.04);color:#8b949e;font-size:12px;font-weight:700;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:11px 10px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px}
          .ri-s-btn-heloc{flex:1;background:rgba(99,179,237,0.07);color:#63b3ed;font-size:12px;font-weight:700;border:1px solid rgba(99,179,237,0.18);border-radius:10px;padding:11px 10px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px}
          .ri-scen-chip{font-size:10px;font-weight:700;color: #94a3b8;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:4px 12px;cursor:pointer;white-space:nowrap}
          .ri-back{display:flex;align-items:center;gap:6px;padding:10px 16px 0;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color: #eaf8f7;cursor:pointer}
          .ri-back:hover{color:#60a5fa}
          .ri-deepdive-trigger{margin:0 16px 16px;background:linear-gradient(135deg,rgba(139,92,246,0.06),rgba(99,179,237,0.04));border:1px solid rgba(139,92,246,0.18);border-radius:10px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;transition:all .15s}
          .ri-deepdive-trigger:hover{border-color:rgba(139,92,246,0.35);background:rgba(139,92,246,0.1)}
          .ri-heloc-row::before{content:'✓';color:#00e87a;font-weight:700;flex-shrink:0;font-size:10px;margin-top:1px}
          .ri-heloc-row-x::before{content:'·';color: #eaf8f7}
        `}</style>

        {/* ── Topbar ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderBottom:'1px solid rgba(255,255,255,0.05)', background:'rgba(255,255,255,0.02)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:C.green, boxShadow:`0 0 7px rgba(0,232,122,0.6)` }} />
                <span style={{ fontSize:10, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:C.muted }}>Refi Intelligence</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <button
                    onClick={() => setNoCost(v => !v)}
                    style={{ fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:20, border:`1px solid ${noCost ? C.green : 'rgba(255,255,255,0.1)'}`, background: noCost ? 'rgba(0,232,122,0.1)' : 'rgba(255,255,255,0.04)', color: noCost ? C.green : C.muted, cursor:'pointer' }}
                >
                    {noCost ? '✓ No-Cost' : 'No-Cost Refi'}
                </button>
                <div style={{ display:'flex', gap:2, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:3 }}>
                    <button className={`ri-mode-btn${mode==='simple'?' active-simple':''}`} onClick={() => setMode('simple')}>Simple</button>
                    <button className={`ri-mode-btn${mode==='deep'?' active-deep':''}`} onClick={() => setMode('deep')}>Deep Dive AI</button>
                </div>
            </div>
        </div>

        {/* ── Property + Map Hero ── */}
        <div style={{ display:'grid', gridTemplateColumns:'60% 40%', height: mode==='simple' ? 190 : 140, borderBottom:'1px solid rgba(255,255,255,0.05)', position:'relative', flexShrink:0 }}>
            {/* House photo or wireframe illustration */}
            <div style={{
                position:'relative',
                overflow:'hidden',
                borderRight:'1px solid rgba(255,255,255,0.05)',
                ...(safePhoto
                    ? { backgroundImage: `url(${safePhoto})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : { background: 'linear-gradient(160deg,#020c05,#041208)' }),
            }}>
                {!safePhoto && <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 190" preserveAspectRatio="xMidYMid slice" style={{ width:'100%', height:'100%', display:'block' }}>
                    <defs>
                        <linearGradient id="ri-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#010a04"/><stop offset="100%" stopColor="#041409"/></linearGradient>
                        <radialGradient id="ri-glow" cx="50%" cy="100%" r="60%"><stop offset="0%" stopColor="rgba(0,232,122,0.05)"/><stop offset="100%" stopColor="rgba(0,232,122,0)"/></radialGradient>
                    </defs>
                    <rect width="340" height="190" fill="url(#ri-sky)"/>
                    <ellipse cx="170" cy="155" rx="200" ry="28" fill="rgba(0,232,122,0.035)"/>
                    <rect x="0" y="152" width="340" height="38" fill="rgba(0,232,122,0.02)"/>
                    <line x1="0" y1="152" x2="340" y2="152" stroke="rgba(0,232,122,0.1)" strokeWidth="0.8"/>
                    <polygon points="150,152 190,152 215,190 125,190" fill="rgba(0,232,122,0.03)" stroke="rgba(0,232,122,0.06)" strokeWidth="0.5"/>
                    <line x1="170" y1="152" x2="170" y2="190" stroke="rgba(0,232,122,0.04)" strokeWidth="0.5" strokeDasharray="3,4"/>
                    {/* Left wing */}
                    <rect x="18" y="98" width="95" height="54" fill="rgba(0,232,122,0.03)" stroke="rgba(0,232,122,0.38)" strokeWidth="1"/>
                    <polygon points="12,98 113,90 113,98" fill="rgba(0,232,122,0.04)" stroke="rgba(0,232,122,0.42)" strokeWidth="1"/>
                    {/* Center */}
                    <rect x="113" y="80" width="114" height="72" fill="rgba(0,232,122,0.04)" stroke="rgba(0,232,122,0.55)" strokeWidth="1"/>
                    <polygon points="105,80 170,54 235,80" fill="rgba(0,232,122,0.05)" stroke="rgba(0,232,122,0.65)" strokeWidth="1.2"/>
                    {/* Right wing (garage) */}
                    <rect x="227" y="98" width="95" height="54" fill="rgba(0,232,122,0.025)" stroke="rgba(0,232,122,0.35)" strokeWidth="1"/>
                    <polygon points="227,98 227,90 328,98" fill="rgba(0,232,122,0.04)" stroke="rgba(0,232,122,0.42)" strokeWidth="1"/>
                    {/* Chimney */}
                    <rect x="156" y="38" width="13" height="20" fill="rgba(0,232,122,0.04)" stroke="rgba(0,232,122,0.5)" strokeWidth="0.8"/>
                    <rect x="153" y="36" width="19" height="4" rx={0.5} fill="rgba(0,232,122,0.06)" stroke="rgba(0,232,122,0.55)" strokeWidth="0.8"/>
                    <path d="M162,36 Q158,28 163,22 Q168,16 164,10" fill="none" stroke="rgba(0,232,122,0.1)" strokeWidth="1" strokeLinecap="round"/>
                    {/* Center windows */}
                    <rect x="121" y="91" width="40" height="30" rx={1} fill="rgba(0,232,122,0.05)" stroke="rgba(0,232,122,0.5)" strokeWidth="0.9"/>
                    <line x1="141" y1="91" x2="141" y2="121" stroke="rgba(0,232,122,0.22)" strokeWidth="0.5"/>
                    <line x1="121" y1="106" x2="161" y2="106" stroke="rgba(0,232,122,0.14)" strokeWidth="0.5"/>
                    <rect x="179" y="91" width="40" height="30" rx={1} fill="rgba(0,232,122,0.05)" stroke="rgba(0,232,122,0.5)" strokeWidth="0.9"/>
                    <line x1="199" y1="91" x2="199" y2="121" stroke="rgba(0,232,122,0.22)" strokeWidth="0.5"/>
                    <line x1="179" y1="106" x2="219" y2="106" stroke="rgba(0,232,122,0.14)" strokeWidth="0.5"/>
                    {/* Door */}
                    <rect x="154" y="120" width="32" height="32" rx={1} fill="rgba(0,232,122,0.05)" stroke="rgba(0,232,122,0.6)" strokeWidth="1"/>
                    <rect x="159" y="125" width="10" height="13" rx={0.5} fill="none" stroke="rgba(0,232,122,0.26)" strokeWidth="0.6"/>
                    <rect x="171" y="125" width="10" height="13" rx={0.5} fill="none" stroke="rgba(0,232,122,0.26)" strokeWidth="0.6"/>
                    <circle cx="183" cy="138" r="1.8" fill="rgba(0,232,122,0.6)"/>
                    {/* Left wing windows */}
                    <rect x="28" y="108" width="32" height="22" rx={1} fill="rgba(0,232,122,0.04)" stroke="rgba(0,232,122,0.36)" strokeWidth="0.8"/>
                    <line x1="44" y1="108" x2="44" y2="130" stroke="rgba(0,232,122,0.16)" strokeWidth="0.5"/>
                    <rect x="72" y="108" width="32" height="22" rx={1} fill="rgba(0,232,122,0.04)" stroke="rgba(0,232,122,0.36)" strokeWidth="0.8"/>
                    <line x1="88" y1="108" x2="88" y2="130" stroke="rgba(0,232,122,0.16)" strokeWidth="0.5"/>
                    {/* Garage door */}
                    <rect x="235" y="110" width="79" height="42" rx={1} fill="rgba(0,232,122,0.02)" stroke="rgba(0,232,122,0.36)" strokeWidth="0.9"/>
                    <line x1="235" y1="124" x2="314" y2="124" stroke="rgba(0,232,122,0.16)" strokeWidth="0.5"/>
                    <line x1="235" y1="138" x2="314" y2="138" stroke="rgba(0,232,122,0.16)" strokeWidth="0.5"/>
                    <rect x="241" y="113" width="67" height="7" rx={0.8} fill="rgba(0,232,122,0.05)" stroke="rgba(0,232,122,0.2)" strokeWidth="0.5"/>
                    {/* Trees */}
                    <ellipse cx="14" cy="126" rx="11" ry="16" fill="rgba(0,232,122,0.025)" stroke="rgba(0,232,122,0.16)" strokeWidth="0.8"/>
                    <line x1="14" y1="142" x2="14" y2="152" stroke="rgba(0,232,122,0.18)" strokeWidth="1.2"/>
                    <ellipse cx="326" cy="132" rx="9" ry="12" fill="rgba(0,232,122,0.025)" stroke="rgba(0,232,122,0.14)" strokeWidth="0.8"/>
                    <rect width="340" height="190" fill="url(#ri-glow)" style={{ mixBlendMode:'screen' as any }}/>
                </svg>}
                {/* Photo fade */}
                <div style={{ position:'absolute', bottom:0, left:0, right:0, height:48, background:'linear-gradient(to bottom,transparent,rgba(13,17,23,0.85))', pointerEvents:'none' }}/>
            </div>

            {/* Map pane */}
            <div style={{ position:'relative', background:'#030a12', overflow:'hidden' }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 190" preserveAspectRatio="xMidYMid slice" style={{ width:'100%', height:'100%', display:'block' }}>
                    <defs>
                        <radialGradient id="ri-pin-glow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="rgba(0,232,122,0.35)"/><stop offset="100%" stopColor="rgba(0,232,122,0)"/></radialGradient>
                    </defs>
                    <rect width="200" height="190" fill="#030c14"/>
                    {/* Blocks */}
                    <rect x="7" y="7" width="52" height="45" rx={1.5} fill="rgba(0,232,122,0.022)"/>
                    <rect x="69" y="7" width="44" height="45" rx={1.5} fill="rgba(0,232,122,0.022)"/>
                    <rect x="123" y="7" width="70" height="45" rx={1.5} fill="rgba(0,232,122,0.022)"/>
                    <rect x="7" y="62" width="52" height="58" rx={1.5} fill="rgba(0,232,122,0.022)"/>
                    {/* Target block */}
                    <rect x="69" y="62" width="44" height="58" rx={1.5} fill="rgba(0,232,122,0.072)" stroke="rgba(0,232,122,0.28)" strokeWidth="1"/>
                    <line x1="69" y1="91" x2="113" y2="91" stroke="rgba(0,232,122,0.1)" strokeWidth="0.5"/>
                    <line x1="91" y1="62" x2="91" y2="120" stroke="rgba(0,232,122,0.1)" strokeWidth="0.5"/>
                    <rect x="123" y="62" width="70" height="58" rx={1.5} fill="rgba(0,232,122,0.022)"/>
                    <rect x="7" y="130" width="52" height="53" rx={1.5} fill="rgba(0,232,122,0.022)"/>
                    <rect x="69" y="130" width="44" height="53" rx={1.5} fill="rgba(0,232,122,0.022)"/>
                    <rect x="123" y="130" width="70" height="53" rx={1.5} fill="rgba(0,232,122,0.022)"/>
                    {/* Roads */}
                    <rect x="0" y="52" width="200" height="10" fill="rgba(0,232,122,0.048)"/>
                    <rect x="0" y="120" width="200" height="10" fill="rgba(0,232,122,0.035)"/>
                    <rect x="113" y="0" width="10" height="190" fill="rgba(0,232,122,0.048)"/>
                    <rect x="59" y="0" width="10" height="190" fill="rgba(0,232,122,0.035)"/>
                    <line x1="0" y1="57" x2="200" y2="57" stroke="rgba(0,232,122,0.1)" strokeWidth="0.6" strokeDasharray="5,5"/>
                    <line x1="118" y1="0" x2="118" y2="190" stroke="rgba(0,232,122,0.1)" strokeWidth="0.6" strokeDasharray="5,5"/>
                    {/* Street labels */}
                    <text x="10" y="50" fontFamily="system-ui,sans-serif" fontSize="4.5" fill="rgba(0,232,122,0.3)" fontWeight="700" letterSpacing="0.3">
                        {shortAddr ? shortAddr.toUpperCase().slice(0, 18) : 'WILLOW CANYON DR'}
                    </text>
                    {/* Pin */}
                    <circle cx="91" cy="91" r="22" fill="rgba(0,232,122,0.06)" stroke="rgba(0,232,122,0.12)" strokeWidth="1"/>
                    <circle cx="91" cy="91" r="13" fill="rgba(0,232,122,0.1)" stroke="rgba(0,232,122,0.25)" strokeWidth="1"/>
                    <circle cx="91" cy="91" r="10" fill="url(#ri-pin-glow)"/>
                    <circle cx="91" cy="91" r="5" fill="#00e87a"/>
                    <circle cx="91" cy="91" r="2.5" fill="rgba(0,12,5,0.7)"/>
                    <polygon points="87,89 91,85 95,89" fill="none" stroke="rgba(0,232,122,0.9)" strokeWidth="0.8"/>
                    <rect x="87.5" y="89" width="7" height="5" fill="rgba(0,232,122,0.15)" stroke="rgba(0,232,122,0.7)" strokeWidth="0.7"/>
                    {/* Compass */}
                    <g transform="translate(178,14)">
                        <circle cx="0" cy="0" r="8" fill="rgba(0,232,122,0.05)" stroke="rgba(0,232,122,0.15)" strokeWidth="0.8"/>
                        <text x="0" y="-2" textAnchor="middle" fontFamily="system-ui" fontSize="4.5" fill="rgba(0,232,122,0.5)" fontWeight="800">N</text>
                        <line x1="0" y1="-6" x2="0" y2="6" stroke="rgba(0,232,122,0.25)" strokeWidth="0.7"/>
                        <line x1="-6" y1="0" x2="6" y2="0" stroke="rgba(0,232,122,0.15)" strokeWidth="0.5"/>
                    </g>
                </svg>
                <div style={{ position:'absolute', bottom:0, left:0, right:0, height:38, background:'linear-gradient(to bottom,transparent,rgba(3,10,18,0.9))', pointerEvents:'none' }}/>
            </div>

            {/* Address overlay */}
            <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'20px 14px 8px', display:'flex', alignItems:'flex-end', justifyContent:'space-between', pointerEvents:'none', background:'linear-gradient(to bottom, transparent, rgba(13,17,23,0.95) 55%)' }}>
                <div>
                    <div style={{ fontSize:12, fontWeight:700, color:C.text, textShadow:'0 1px 6px rgba(0,0,0,0.8)' }}>{addrLine1}</div>
                    <div style={{ fontSize:10, color:'rgba(107,122,153,0.9)', marginTop:2, textShadow:'0 1px 4px rgba(0,0,0,0.8)' }}>{addrLine2}</div>
                </div>
                <a href={`/my-home${addressForLink ? `?address=${encodeURIComponent(addressForLink)}` : ''}`} style={{ fontSize:9, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', padding:'3px 9px', borderRadius:20, background:'rgba(59,130,246,0.15)', color:C.blue, border:'1px solid rgba(59,130,246,0.3)', backdropFilter:'blur(4px)', pointerEvents:'all', textDecoration:'none', cursor:'pointer' }}>Analyse Property →</a>
            </div>
        </div>

        {/* ════════════════════════ SIMPLE VIEW ════════════════════════ */}
        {mode === 'simple' && (
            <>
            {/* Equity ribbon */}
            <div style={{ display:'flex', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                {[
                    { label:'Est. Value', val: propertyValue ? fmt$(propertyValue, true) : '—', color: C.blue },
                    { label:'Balance',    val: fmt$(balance, true),                              color: C.text },
                    { label:'Equity',     val: calc.equityAmt ? fmt$(calc.equityAmt, true) : '—', color: C.green },
                ].map(({ label, val, color }) => (
                    <div key={label} style={{ flex:1, padding:'10px 14px', textAlign:'center', borderRight:'1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:C.dim, marginBottom:4 }}>{label}</div>
                        <div style={{ fontSize:14, fontWeight:800, color }}>{val}</div>
                    </div>
                ))}
                <div style={{ flex:1, padding:'10px 14px', textAlign:'center' }}>
                    <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:C.dim, marginBottom:4 }}>Equity %</div>
                    <div style={{ fontSize:14, fontWeight:800, color: C.green }}>{calc.equityPct != null ? `${calc.equityPct}%` : '—'}</div>
                </div>
            </div>

            {/* Rate hero — big Tesla numbers */}
            <div style={{ padding:'28px 24px 20px', display:'flex', alignItems:'center', justifyContent:'center', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ textAlign:'center', flex:1 }}>
                    <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:C.dim, marginBottom:8 }}>Your Rate{origRateLabel ? ` · ${origRateLabel}` : ''}</div>
                    <div style={{ fontSize:'clamp(26px, 8vw, 46px)', fontWeight:800, lineHeight:1, letterSpacing:'-.02em', color:C.red }}>{fmtRate(currentRate)}</div>
                    <div style={{ fontSize:10, color:C.muted, marginTop:6 }}>At close</div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, padding:'0 14px', flexShrink:0 }}>
                    <div style={{ fontSize:20, color:'rgba(255,255,255,0.12)' }}>→</div>
                    <div style={{ fontSize:12, fontWeight:800, color:C.green, background:'rgba(0,232,122,0.1)', border:'1px solid rgba(0,232,122,0.25)', borderRadius:20, padding:'4px 12px', whiteSpace:'nowrap' }}>
                        {calc.rateDelta > 0 ? `−${calc.rateDelta.toFixed(3)}%` : `+${Math.abs(calc.rateDelta).toFixed(3)}%`}
                    </div>
                </div>
                <div style={{ textAlign:'center', flex:1 }}>
                    <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:C.dim, marginBottom:8 }}>Refi Rate · FRED + 0.125%</div>
                    <div style={{ fontSize:'clamp(26px, 8vw, 46px)', fontWeight:800, lineHeight:1, letterSpacing:'-.02em', color:C.green }}>{fmtRate(calc.refiRate)}</div>
                    <div style={{ fontSize:10, color:C.muted, marginTop:6 }}>{fmtFredDate(fredDate)}</div>
                </div>
            </div>

            {/* Live dot */}
            <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'center', padding:'7px 16px', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                <div className="ri-live-dot"/>
                <span style={{ fontSize:10, color:C.dim, fontWeight:600 }}>FRED data · not a lender quote</span>
            </div>

            {/* ── Adjusters ── */}
            <div style={{ padding:'16px 16px 4px', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:C.dim, marginBottom:12 }}>Adjust Scenario</div>

                {/* Balance */}
                <div style={{ marginBottom:12 }}>
                    <SliderField
                        label="Loan Balance" value={balance}
                        min={50_000} max={balanceMax} step={balance >= 1_000_000 ? 25_000 : 5_000}
                        onChange={setBalance}
                        format={(n: number) => n >= 1_000_000 ? `$${(n/1_000_000).toFixed(2).replace(/\.?0+$/,'')}M` : `$${Math.round(n/1000)}k`}
                        trackColor={COLORS.emerald} theme="dark"
                    />
                </div>

                {/* Dual rate sliders */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 20px 1fr', gap:'0 6px', alignItems:'end', marginBottom:12 }}>
                    <SliderField
                        label="Current Rate" value={currentRate}
                        min={3} max={12} step={0.125}
                        onChange={setCurrentRate}
                        format={(r: number) => `${r.toFixed(3).replace(/0+$/,'').replace(/\.$/,'')}%`}
                        trackColor={COLORS.danger} theme="dark"
                    />
                    <div style={{ textAlign:'center', paddingBottom:6, fontSize:12, color:C.dim, fontWeight:700 }}>→</div>
                    <SliderField
                        label={`Target Rate${noCost ? ' +0.25%' : ''}`} value={newRate}
                        min={3} max={12} step={0.125}
                        onChange={setNewRate}
                        disabled={noCost}
                        format={(r: number) => `${r.toFixed(3).replace(/0+$/,'').replace(/\.$/,'')}%`}
                        trackColor={COLORS.emeraldDark} theme="dark"
                    />
                </div>

                {/* Closing costs */}
                <div style={{ marginBottom:12 }}>
                    <SliderField
                        label="Closing Costs" value={closingCosts}
                        min={0} max={Math.max(30_000, Math.ceil(balance * 0.04 / 1_000) * 1_000)} step={500}
                        onChange={setClosingCosts}
                        disabled={noCost}
                        format={(n: number) => `$${Math.round(Math.abs(n)).toLocaleString()}`}
                        trackColor={COLORS.emerald} theme="dark"
                    />
                </div>

                {/* Term toggle */}
                <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:C.muted, marginBottom:6 }}>New Term</div>
                    <div style={{ display:'flex', gap:6 }}>
                        {[15, 20, 30].map(yr => (
                            <button key={yr}
                                onClick={() => setTermMonths(yr * 12)}
                                style={{
                                    flex:1, padding:'6px 0', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                                    border: termYears === yr ? `2px solid ${C.green}` : '1.5px solid rgba(255,255,255,0.1)',
                                    background: termYears === yr ? 'rgba(0,232,122,0.1)' : 'rgba(255,255,255,0.04)',
                                    color: termYears === yr ? C.green : C.muted,
                                }}
                            >{yr}yr</button>
                        ))}
                    </div>
                </div>

                {/* Run button */}
                {isDirty && onRunScenario && (
                    <div style={{ marginBottom:14 }}>
                        <button
                            onClick={() => onRunScenario(buildRunSeed(), { currentBalance: balance, currentRatePct: currentRate, newRatePct: effNewRate, closingCosts: effClosing })}
                            style={{ width:'100%', padding:'11px 0', borderRadius:10, border:'none', background:C.green, color:'#07100f', fontSize:13, fontWeight:800, cursor:'pointer', letterSpacing:'-0.01em' }}
                        >
                            Run adjusted scenario →
                        </button>
                    </div>
                )}
            </div>

            {/* Savings hero */}
            <div style={{ padding:'28px 24px 20px', textAlign:'center', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', color:C.dim, marginBottom:10 }}>Estimated Monthly Savings</div>
                <div style={{ fontSize:'clamp(32px, 11vw, 56px)', fontWeight:800, color:C.green, lineHeight:1, letterSpacing:'-.03em' }}>
                    {calc.savings > 0 ? fmt$(calc.savings) : '—'}
                    <span style={{ fontSize:'clamp(14px, 4vw, 20px)', fontWeight:700, color:'rgba(0,232,122,0.6)' }}>/mo</span>
                </div>
                <div style={{ fontSize:12, color:C.muted, marginTop:10, lineHeight:1.6 }}>
                    Based on {fmt$(balance, true)} balance · {calc.rateDelta > 0 ? calc.rateDelta.toFixed(3) : '0'}% rate drop<br/>
                    <strong style={{ color:C.text }}>{fmt$(effClosing)}</strong> closing costs · <strong style={{ color:C.text }}>{calc.beMonths != null ? `${calc.beMonths}-month` : 'N/A'}</strong> break-even
                </div>
            </div>

            {/* Verdict */}
            <div style={{ margin:'0 16px 16px', background:`rgba(${calc.verdict.color === C.green ? '0,232,122' : calc.verdict.color === C.amber ? '251,191,36' : '239,68,68'},0.06)`, border:`1px solid rgba(${calc.verdict.color === C.green ? '0,232,122' : calc.verdict.color === C.amber ? '251,191,36' : '239,68,68'},0.18)`, borderRadius:10, padding:'11px 16px', display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:18, flexShrink:0 }}>{calc.verdict.emoji}</span>
                <span style={{ fontSize:12, fontWeight:600, color:'#c9d8f0', lineHeight:1.5 }}>
                    <strong style={{ color:calc.verdict.color }}>{calc.savings > 0 ? 'Refinance makes sense' : 'Hold'}</strong>{' — '}{calc.verdict.text.replace(/^[^—]*— ?/, '')}
                </span>
            </div>

            {/* 3 key stats */}
            <div style={{ display:'flex', borderTop:'1px solid rgba(255,255,255,0.04)', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                {[
                    { label:'Break-Even', val: calc.beMonths != null ? `${calc.beMonths} mo` : 'N/A', sub:'Months to recoup', color: calc.beMonths != null && calc.beMonths <= 30 ? C.green : C.amber },
                    { label:'5-Yr Net',   val: calc.net5yr > 0 ? fmt$(calc.net5yr, true) : '—',      sub:'After closing costs', color: C.text },
                    { label:'HELOC Avail',val: calc.helocMax ? fmt$(calc.helocMax, true) : '—',      sub:`LTV ${calc.ltv ?? '?'}% · 80% CLTV`, color: C.text },
                ].map(({ label, val, sub, color }) => (
                    <div key={label} style={{ flex:1, padding:'14px 10px', textAlign:'center', borderRight:'1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:C.dim, marginBottom:5 }}>{label}</div>
                        <div style={{ fontSize:16, fontWeight:800, color }}>{val}</div>
                        <div style={{ fontSize:9, color:C.muted, marginTop:3 }}>{sub}</div>
                    </div>
                ))}
            </div>

            {/* HELOC explore button */}
            {calc.helocMax && calc.helocMax > 0 && (
                <div style={{ padding:'0 16px 12px' }}>
                    <button className="ri-s-btn-heloc" style={{ width:'100%' }} onClick={() => onRunScenario?.(buildSeed('heloc'))}>
                        🏦 Explore HELOC — {fmt$(calc.helocMax, true)} available →
                    </button>
                </div>
            )}

            {/* Deep dive trigger */}
            <div className="ri-deepdive-trigger" onClick={() => setMode('deep')}>
                <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                    <span style={{ fontSize:16 }}>🧠</span>
                    <div>
                        <div style={{ fontSize:12, fontWeight:700, color:C.purple }}>Deep Dive AI Analysis</div>
                        <div style={{ fontSize:10, color:C.dim, marginTop:2 }}>Rate timeline · 3 scenarios · HELOC · Equity map · AI signals</div>
                    </div>
                </div>
                <span style={{ fontSize:14, color:C.purple }}>→</span>
            </div>
            </>
        )}

        {/* ════════════════════════ DEEP DIVE VIEW ════════════════════════ */}
        {mode === 'deep' && (
            <>
            <div className="ri-back" onClick={() => setMode('simple')}>← Back to Simple View</div>

            {/* Full property stats */}
            <div style={{ padding:'10px 14px 0' }}>
                <div style={{ fontSize:9, fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', color:C.dim, marginBottom:10 }}>Property Details</div>
                <div style={{ background:'linear-gradient(135deg,#0e1c2a,#0a1520)', border:'1px solid rgba(59,130,246,0.18)', borderRadius:14, overflow:'hidden', marginBottom:12 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)' }}>
                        {[
                            { l:'Est. Value', v: propertyValue ? fmt$(propertyValue, true) : '—', s:'AVM', c:C.blue },
                            { l:'Balance',    v: fmt$(balance, true),                              s:'Remaining', c:C.text },
                            { l:'Equity',     v: calc.equityAmt ? fmt$(calc.equityAmt, true) : '—', s:`${calc.equityPct ?? '?'}% owned`, c:C.green },
                            { l:'Orig. Rate', v: fmtRate(currentRate),                             s: origRateLabel ?? 'At close', c:'#f59e0b' },
                            { l:'Remaining',  v: remainingMonths ? `${remainingMonths} mo` : '~360 mo', s: remainingMonths ? `${(remainingMonths/12).toFixed(1)} yrs` : '30 yrs', c:C.text },
                        ].map(({ l, v, s, c }, i) => (
                            <div key={i} style={{ padding:'11px 10px', borderRight: i < 4 ? '1px solid rgba(255,255,255,0.05)' : 'none', textAlign:'center' }}>
                                <div style={{ fontSize:9, color:C.dim, fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>{l}</div>
                                <div style={{ fontSize:12, fontWeight:700, color:c }}>{v}</div>
                                <div style={{ fontSize:9, color:C.muted, marginTop:2 }}>{s}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Rate Environment */}
            <div style={{ padding:'0 14px 12px' }}>
                <div style={{ background:'#0a111e', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, overflow:'hidden' }}>
                    {/* Head */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 14px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:7, fontSize:12, fontWeight:700, color:C.text }}>
                            <div className="ri-live-dot"/>Rate Environment
                        </div>
                        <div style={{ fontSize:10, color:C.dim, fontWeight:600 }}>FRED · 30yr avg{fredDate ? ` · ${fmtFredDate(fredDate)}` : ''}</div>
                    </div>
                    {/* Delta */}
                    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ textAlign:'center', flex:1 }}>
                            <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', color:C.dim, marginBottom:4 }}>Your Rate{origRateLabel ? ` (${origRateLabel})` : ''}</div>
                            <div style={{ fontSize:20, fontWeight:800, color:C.red }}>{fmtRate(currentRate)}</div>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3, padding:'0 4px' }}>
                            <div style={{ fontSize:20, color:C.green }}>→</div>
                            <div style={{ fontSize:11, fontWeight:700, color:C.green, background:'rgba(0,232,122,0.1)', border:'1px solid rgba(0,232,122,0.2)', borderRadius:20, padding:'2px 10px', whiteSpace:'nowrap' }}>
                                {calc.rateDelta > 0 ? `−${calc.rateDelta.toFixed(3)}%` : `+${Math.abs(calc.rateDelta).toFixed(3)}%`}
                            </div>
                        </div>
                        <div style={{ textAlign:'center', flex:1 }}>
                            <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', color:C.dim, marginBottom:4 }}>Refi Rate (FRED+0.125%)</div>
                            <div style={{ fontSize:20, fontWeight:800, color:C.green }}>{fmtRate(calc.refiRate)}</div>
                        </div>
                    </div>
                    {/* Rate timeline bars */}
                    <div style={{ padding:'12px 14px 0' }}>
                        <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:C.dim, marginBottom:10 }}>30-Year Rate Timeline</div>
                        {[
                            { yr:'2020', rate:3.11, cls:'old',    color:'rgba(107,122,153,0.4)' },
                            { yr:'2021', rate:2.96, cls:'old',    color:'rgba(107,122,153,0.4)' },
                            { yr:'2022', rate:currentRate, cls:'closed', color:'rgba(239,68,68,0.55)', tag:'You closed', tagColor:'#ef4444' },
                            { yr:'2023', rate:6.79, cls:'avg',    color:'rgba(251,191,36,0.5)' },
                            { yr:'2024', rate:6.72, cls:'avg',    color:'rgba(251,191,36,0.5)' },
                            { yr:'Now',  rate:newRate, cls:'now', color:'#00e87a', tag:'Live', tagColor:'#00e87a' },
                            { yr:'Fwd',  rate:calc.fwdRate, cls:'fwd', color:'rgba(99,179,237,0.5)', tag:'12–18 mo', tagColor:'#63b3ed', dashed:true },
                        ].map(({ yr, rate, color, tag, tagColor, dashed }) => (
                            <div key={yr} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
                                <div style={{ fontSize:10, color:C.muted, width:36, flexShrink:0, fontWeight:600 }}>{yr}</div>
                                <div style={{ flex:1, background:'rgba(255,255,255,0.05)', borderRadius:4, height:7 }}>
                                    <div style={{ height:'100%', borderRadius:4, width:barW(rate), background: dashed ? undefined : color, backgroundImage: dashed ? `repeating-linear-gradient(90deg,${color} 0,${color} 6px,transparent 6px,transparent 10px)` : undefined }} />
                                </div>
                                <div style={{ fontSize:10, fontWeight:700, width:42, textAlign:'right', flexShrink:0, color: yr==='Now' ? C.green : yr==='Fwd' ? '#63b3ed' : yr==='2022' ? C.red : C.muted }}>{fmtRate(rate)}</div>
                                {tag && <div style={{ fontSize:9, padding:'1px 7px', borderRadius:20, whiteSpace:'nowrap', marginLeft:2, fontWeight:700, background:`rgba(${tagColor === C.green ? '0,232,122' : tagColor === '#ef4444' ? '239,68,68' : '99,179,237'},0.12)`, color:tagColor, border:`1px solid rgba(${tagColor === C.green ? '0,232,122' : tagColor === '#ef4444' ? '239,68,68' : '99,179,237'},0.25)` }}>{tag}</div>}
                            </div>
                        ))}
                    </div>
                    {/* Forward signal */}
                    <div style={{ margin:'10px 14px 14px', background:'rgba(99,179,237,0.06)', border:'1px solid rgba(99,179,237,0.18)', borderRadius:10, padding:'9px 12px', display:'flex', alignItems:'flex-start', gap:8 }}>
                        <span style={{ fontSize:14, flexShrink:0, marginTop:1 }}>📈</span>
                        <div style={{ fontSize:11, color:'#93c5fd', lineHeight:1.5 }}>
                            <strong style={{ color:'#bfdbfe' }}>Forward curve:</strong> Rates may ease another 0.25–0.4% over 12–18 months as spread compresses. Waiting for sub-{fmtRate(calc.fwdRate)} is speculative — not priced into futures.
                        </div>
                    </div>
                </div>
            </div>

            {/* Scenario Explorer */}
            <div style={{ padding:'0 14px 12px' }}>
                <div style={{ fontSize:9, fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', color:C.dim, marginBottom:10 }}>Scenario Explorer</div>
                {/* Tabs */}
                <div style={{ display:'flex', gap:4, marginBottom:12, background:'#0a111e', borderRadius:10, padding:4, border:'1px solid rgba(255,255,255,0.07)' }}>
                    <button style={tabStyle(activeScenario==='rate_term', C.green)} onClick={() => setActiveScenario('rate_term')}>Rate &amp; Term</button>
                    <button style={tabStyle(activeScenario==='15yr', C.purple)} onClick={() => setActiveScenario('15yr')}>Shorten 15yr</button>
                    <button style={tabStyle(activeScenario==='cashout', C.amber)} onClick={() => setActiveScenario('cashout')}>Cash-Out</button>
                </div>

                {/* Rate & Term */}
                {activeScenario === 'rate_term' && (
                    <div style={{ background:'#0a111e', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, overflow:'hidden' }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                            <div>
                                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                    <span style={{ fontSize:13, fontWeight:700, color:C.text }}>Rate &amp; Term Refi</span>
                                    <span style={{ fontSize:9, fontWeight:800, letterSpacing:'.07em', textTransform:'uppercase', padding:'2px 8px', borderRadius:20, background:'rgba(0,232,122,0.18)', color:C.green, border:`1px solid rgba(0,232,122,0.3)` }}>★ Best for You</span>
                                </div>
                                <div style={{ fontSize:10, color:C.muted, marginTop:1 }}>Lower rate · Same term · No cash pulled</div>
                            </div>
                            <div style={{ textAlign:'right' }}>
                                <div style={{ fontSize:16, fontWeight:800, color:C.green }}>{calc.savings > 0 ? `${fmt$(calc.savings)}/mo` : '—'}</div>
                                <div style={{ fontSize:9, color:C.dim, textTransform:'uppercase', letterSpacing:'.06em', marginTop:1 }}>Monthly savings</div>
                            </div>
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                            {[
                                { side:'Before', color:C.red,   pi:calc.oldPI,  rate:currentRate, note:'Current P&I' },
                                { side:'After',  color:C.green, pi:calc.newPI30, rate:calc.refiRate,    note:`${termMonths/12}yr at ${fmtRate(calc.refiRate)}` },
                            ].map(({ side, color, pi, rate, note }) => (
                                <div key={side} style={{ padding:'12px 14px', borderRight: side==='Before' ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                    <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color, marginBottom:10 }}>{side}</div>
                                    <div style={{ fontSize:20, fontWeight:800, lineHeight:1, marginBottom:10, color }}>{fmt$(pi)}/mo</div>
                                    <div style={{ fontSize:11, color:C.muted }}>Rate <strong style={{ color:C.text }}>{fmtRate(rate)}</strong></div>
                                    <div style={{ fontSize:10, color:C.dim, marginTop:3 }}>{note}</div>
                                </div>
                            ))}
                        </div>
                        {calc.beMonths != null && (
                            <div style={{ padding:'11px 14px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                                    <span style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:C.dim }}>Break-Even</span>
                                    <span style={{ fontSize:14, fontWeight:800, color:C.green }}>{calc.beMonths} months <span style={{ fontSize:10, color:C.muted, fontWeight:400 }}>· {calc.beMonths <= 24 ? 'Excellent' : calc.beMonths <= 36 ? 'Good' : 'Borderline'}</span></span>
                                </div>
                                <div style={{ height:6, background:'rgba(255,255,255,0.06)', borderRadius:4, overflow:'hidden' }}>
                                    <div style={{ height:'100%', borderRadius:4, background:C.green, width:`${Math.min(100, (calc.beMonths / 60) * 100)}%` }}/>
                                </div>
                                <div style={{ display:'flex', gap:16, marginTop:7, flexWrap:'wrap' }}>
                                    {[
                                        { k:'Closing costs', v: fmt$(effClosing) },
                                        { k:'Monthly savings', v: fmt$(calc.savings) },
                                        { k:'5-yr net', v: fmt$(calc.net5yr, true) },
                                        { k:'Lifetime int. saved', v: fmt$(calc.intSaved30, true) },
                                    ].map(({ k, v }) => (
                                        <div key={k} style={{ fontSize:10, color:C.muted }}>{k} <strong style={{ color:C.text }}>{v}</strong></div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div style={{ display:'flex', gap:8, padding:'10px 14px', flexWrap:'wrap' }}>
                            <button className="ri-scen-chip" onClick={() => onRunScenario?.(`What if rates drop to ${fmtRate(calc.fwdRate)} in 12 months, should I wait to refi?`)}>If rates drop to {fmtRate(calc.fwdRate)} →</button>
                            <button className="ri-scen-chip" onClick={() => onRunScenario?.(buildSeed('rate_term'))}>Run detailed analysis →</button>
                        </div>
                    </div>
                )}

                {/* Shorten 15yr */}
                {activeScenario === '15yr' && (
                    <div style={{ background:'#0a111e', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, overflow:'hidden' }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                            <div>
                                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                    <span style={{ fontSize:13, fontWeight:700, color:C.text }}>Shorten to 15-Year</span>
                                    <span style={{ fontSize:9, fontWeight:800, padding:'2px 8px', borderRadius:20, background:'rgba(139,92,246,0.12)', color:C.purple, border:`1px solid rgba(139,92,246,0.22)`, letterSpacing:'.07em', textTransform:'uppercase' as const }}>Max Equity</span>
                                </div>
                                <div style={{ fontSize:10, color:C.muted, marginTop:1 }}>Higher payment · Build equity fast · Lowest lifetime cost</div>
                            </div>
                            <div style={{ textAlign:'right' }}>
                                <div style={{ fontSize:16, fontWeight:800, color:C.purple }}>{fmt$(calc.intSaved15vs30, true)}</div>
                                <div style={{ fontSize:9, color:C.dim, textTransform:'uppercase', letterSpacing:'.06em', marginTop:1 }}>Interest saved vs 30yr</div>
                            </div>
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ padding:'12px 14px', borderRight:'1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:C.red, marginBottom:10 }}>Current</div>
                                <div style={{ fontSize:20, fontWeight:800, color:C.red, marginBottom:10 }}>{fmt$(calc.oldPI)}/mo</div>
                                <div style={{ fontSize:11, color:C.muted }}>Rate <strong style={{ color:C.text }}>{fmtRate(currentRate)}</strong></div>
                            </div>
                            <div style={{ padding:'12px 14px' }}>
                                <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:C.purple, marginBottom:10 }}>15yr at {fmtRate(calc.rate15)}</div>
                                <div style={{ fontSize:20, fontWeight:800, color:C.purple, marginBottom:10 }}>{fmt$(calc.pi15)}/mo</div>
                                <div style={{ fontSize:11, color:C.muted }}>Payoff <strong style={{ color:C.purple }}>{calc.payoffGainYrs}yr earlier</strong></div>
                            </div>
                        </div>
                        <div style={{ display:'flex', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                            {[
                                { l:'Payment Increase', v:`+${fmt$(calc.pi15 - calc.oldPI)}/mo`, c:C.red },
                                { l:'Payoff Earlier',   v:`${calc.payoffGainYrs} yrs`,           c:C.purple },
                                { l:'Total Int. Saved', v:fmt$(calc.intSaved15vs30, true),       c:C.purple },
                            ].map(({ l, v, c }, i) => (
                                <div key={i} style={{ flex:1, padding:'11px 14px', textAlign:'center', borderRight: i < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                    <div style={{ fontSize:9, color:C.dim, textTransform:'uppercase', letterSpacing:'.07em', fontWeight:600, marginBottom:4 }}>{l}</div>
                                    <div style={{ fontSize:14, fontWeight:800, color:c }}>{v}</div>
                                </div>
                            ))}
                        </div>
                        <div style={{ display:'flex', gap:8, padding:'10px 14px', flexWrap:'wrap' }}>
                            <button className="ri-scen-chip" onClick={() => onRunScenario?.(buildSeed('15yr'))}>Full 15yr analysis →</button>
                            <button className="ri-scen-chip" onClick={() => onRunScenario?.(`Can I afford $${Math.round((calc.pi15 - calc.oldPI)/100)*100} more per month?`)}>Can I afford +{fmt$(calc.pi15 - calc.oldPI)}/mo? →</button>
                        </div>
                    </div>
                )}

                {/* Cash-Out */}
                {activeScenario === 'cashout' && (
                    <div style={{ background:'#0a111e', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, overflow:'hidden' }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                            <div>
                                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                    <span style={{ fontSize:13, fontWeight:700, color:C.text }}>Cash-Out Refi</span>
                                    <span style={{ fontSize:9, fontWeight:800, padding:'2px 8px', borderRadius:20, background:'rgba(251,191,36,0.1)', color:C.amber, border:`1px solid rgba(251,191,36,0.2)`, letterSpacing:'.07em', textTransform:'uppercase' as const }}>Pull Equity</span>
                                </div>
                                <div style={{ fontSize:10, color:C.muted, marginTop:1 }}>New loan · Access equity · Fixed rate · Full term reset</div>
                            </div>
                            <div style={{ textAlign:'right' }}>
                                <div style={{ fontSize:16, fontWeight:800, color:C.amber }}>{calc.cashOutAmt && calc.cashOutAmt > 0 ? fmt$(calc.cashOutAmt, true) : propertyValue ? 'N/A' : '—'}</div>
                                <div style={{ fontSize:9, color:C.dim, textTransform:'uppercase', letterSpacing:'.06em', marginTop:1 }}>Max cash at 80% CLTV</div>
                            </div>
                        </div>
                        {calc.piCashOut && calc.cashOutAmt && calc.cashOutAmt > 0 ? (
                            <>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ padding:'12px 14px', borderRight:'1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:C.red, marginBottom:10 }}>Current</div>
                                    <div style={{ fontSize:20, fontWeight:800, color:C.red, marginBottom:8 }}>{fmt$(calc.oldPI)}/mo</div>
                                    <div style={{ fontSize:11, color:C.muted }}>Balance <strong style={{ color:C.text }}>{fmt$(balance, true)}</strong></div>
                                    <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>Rate <strong style={{ color:C.text, textDecoration:'line-through' }}>{fmtRate(currentRate)}</strong></div>
                                </div>
                                <div style={{ padding:'12px 14px' }}>
                                    <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:C.amber, marginBottom:10 }}>Cash-Out at {fmtRate(calc.cashOutRate)}</div>
                                    <div style={{ fontSize:20, fontWeight:800, color:C.amber, marginBottom:8 }}>{fmt$(calc.piCashOut)}/mo</div>
                                    <div style={{ fontSize:11, color:C.muted }}>New balance <strong style={{ color:C.amber }}>{fmt$(calc.maxCashLoan!, true)}</strong></div>
                                    <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>Rate <strong style={{ color:C.amber }}>{fmtRate(calc.cashOutRate)}</strong></div>
                                </div>
                            </div>
                            <div style={{ display:'flex', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                                {[
                                    { l:'Cash Received',  v:`+${fmt$(calc.cashOutAmt!, true)}`,    c:C.amber },
                                    { l:'Pmt Change',     v:`${calc.cashOutPmtDelta! > 0 ? '+' : ''}${fmt$(Math.abs(calc.cashOutPmtDelta!))}/mo`, c: calc.cashOutPmtDelta! > 0 ? C.red : C.green },
                                    { l:'New LTV',        v:`${calc.cashOutNewLtv ?? 80}%`,        c:C.text },
                                    { l:'Cash Rate',      v:fmtRate(calc.cashOutRate),             c:C.amber },
                                ].map(({ l, v, c }, i) => (
                                    <div key={i} style={{ flex:1, padding:'11px 8px', textAlign:'center', borderRight: i < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                        <div style={{ fontSize:9, color:C.dim, textTransform:'uppercase', letterSpacing:'.07em', fontWeight:600, marginBottom:4 }}>{l}</div>
                                        <div style={{ fontSize:13, fontWeight:800, color:c }}>{v}</div>
                                    </div>
                                ))}
                            </div>
                            </>
                        ) : (
                            <div style={{ padding:'16px 14px', color:C.muted, fontSize:12, textAlign:'center' }}>
                                Property value needed to calculate cash-out options. Ask "What is my home worth?" to get an AVM estimate.
                            </div>
                        )}
                        <div style={{ display:'flex', gap:8, padding:'10px 14px', flexWrap:'wrap' }}>
                            <button className="ri-scen-chip" onClick={() => onRunScenario?.(buildSeed('cashout'))}>Full cash-out analysis →</button>
                        </div>
                    </div>
                )}
            </div>

            {/* HELOC Intelligence */}
            <div style={{ padding:'0 14px 12px' }}>
                <div style={{ fontSize:9, fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', color:C.dim, marginBottom:10 }}>HELOC Intelligence</div>
                <div style={{ background:'linear-gradient(135deg,#0a1620,#081018)', border:'1px solid rgba(99,179,237,0.15)', borderRadius:14, overflow:'hidden' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 14px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                            <span style={{ fontSize:16 }}>🏦</span>
                            <div>
                                <div style={{ fontSize:13, fontWeight:700, color:C.text }}>Home Equity Line of Credit</div>
                                <div style={{ fontSize:10, color:C.muted, marginTop:1 }}>No refi needed · Variable rate · Draw when needed</div>
                            </div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                            <div style={{ fontSize:20, fontWeight:800, color:'#63b3ed' }}>{calc.helocMax ? fmt$(calc.helocMax, true) : '—'}</div>
                            <div style={{ fontSize:9, color:C.dim, textTransform:'uppercase', letterSpacing:'.07em', marginTop:1 }}>Max line (80% CLTV)</div>
                        </div>
                    </div>
                    <div style={{ padding:'12px 14px' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:12 }}>
                            {[
                                { l:'HELOC Rate',    v: calc.helocRate ? `~${calc.helocRate.toFixed(1)}%` : '~7.5–8%', c:'#f59e0b' },
                                { l:'Rate Type',     v:'Variable',          c:C.text, s:'Prime + 0.5%' },
                                { l:'Closing Costs', v:'~$500–$2k',         c:'#63b3ed' },
                                { l:'Draw Period',   v:'10 years',          c:C.text },
                                { l:'Interest Only', v:'During draw',       c:'#63b3ed' },
                                { l:'SOFR Today',    v: sofr ? `${sofr.toFixed(2)}%` : '~4.3%', c:C.text },
                            ].map(({ l, v, c, s }) => (
                                <div key={l} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:10, padding:'9px 10px', textAlign:'center' }}>
                                    <div style={{ fontSize:9, color:C.dim, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4, fontWeight:600 }}>{l}</div>
                                    <div style={{ fontSize:13, fontWeight:700, color:c }}>{v}</div>
                                    {s && <div style={{ fontSize:9, color:C.muted, marginTop:2 }}>{s}</div>}
                                </div>
                            ))}
                        </div>
                        <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:C.dim, marginBottom:8 }}>HELOC vs Cash-Out — When to Use Each</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                            <div style={{ background:'rgba(99,179,237,0.04)', borderRadius:10, padding:'10px 12px', border:'1px solid rgba(99,179,237,0.2)' }}>
                                <div style={{ fontSize:10, fontWeight:700, color:'#63b3ed', marginBottom:7, textTransform:'uppercase', letterSpacing:'.06em' }}>HELOC — Better When</div>
                                {['Phased renovations', 'Emergency liquidity', 'Rates may fall further', 'Keep current low rate', 'Lower closing cost'].map(t => (
                                    <div key={t} className="ri-heloc-row" style={{ display:'flex', alignItems:'flex-start', gap:5, marginBottom:4, fontSize:11, color:'#8b949e', lineHeight:1.4 }}>{t}</div>
                                ))}
                            </div>
                            <div style={{ background:'rgba(255,255,255,0.02)', borderRadius:10, padding:'10px 12px', border:'1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:7, textTransform:'uppercase', letterSpacing:'.06em' }}>Cash-Out — Better When</div>
                                {['One large lump need', 'Need fixed rate certainty', 'Already refinancing', 'Rates rising fast', 'Access discipline risk'].map(t => (
                                    <div key={t} className="ri-heloc-row" style={{ display:'flex', alignItems:'flex-start', gap:5, marginBottom:4, fontSize:11, color:'#8b949e', lineHeight:1.4 }}>{t}</div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Equity Access Map */}
            {propertyValue && (
                <div style={{ padding:'0 14px 12px' }}>
                    <div style={{ fontSize:9, fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', color:C.dim, marginBottom:10 }}>Equity Access Map</div>
                    <div style={{ background:'#0a111e', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, overflow:'hidden' }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 14px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ fontSize:12, fontWeight:700, color:C.text }}>LTV · Equity Position · Accessible Cash</div>
                            <div style={{ fontSize:10, fontWeight:700, color:C.green, background:'rgba(0,232,122,0.1)', border:'1px solid rgba(0,232,122,0.2)', borderRadius:20, padding:'2px 10px' }}>LTV {calc.ltv}% ✓</div>
                        </div>
                        <div style={{ padding:14 }}>
                            <div style={{ marginBottom:14 }}>
                                <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:C.dim, textTransform:'uppercase', letterSpacing:'.07em', fontWeight:600, marginBottom:6 }}>
                                    <span>Loan {fmt$(balance, true)}</span><span>Value {fmt$(propertyValue, true)}</span>
                                </div>
                                <div style={{ height:14, background:'rgba(255,255,255,0.05)', borderRadius:8, overflow:'hidden' }}>
                                    <div style={{ height:'100%', background:'linear-gradient(90deg,#3b82f6,#1d4ed8)', borderRadius:'8px 0 0 8px', width:`${calc.ltv}%` }}/>
                                </div>
                                <div style={{ position:'relative', height:18, marginTop:4 }}>
                                    <div style={{ position:'absolute', left:`${calc.ltv}%`, transform:'translateX(-50%)', fontSize:9, color:C.green, fontWeight:700, whiteSpace:'nowrap' }}>{calc.ltv}% ← Today</div>
                                    <div style={{ position:'absolute', left:'80%', transform:'translateX(-50%)', fontSize:9, color:C.muted, fontWeight:600, whiteSpace:'nowrap' }}>80%</div>
                                </div>
                            </div>
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
                                {[
                                    { ltv:'80% CLTV', access:calc.access80, note:'Available now · HELOC or cash-out', avail:!!(calc.access80 && calc.access80 > 0) },
                                    { ltv:'75% CLTV', access:calc.access75, note:'Better jumbo refi LTV threshold', avail:!!(calc.access75 && calc.access75 > 0) },
                                    { ltv:'70% CLTV', access:calc.access70, note: calc.access70 && calc.access70 < 0 ? 'Requires paydown to reach' : 'Available with paydown', avail:!!(calc.access70 && calc.access70 > 0) },
                                ].map(({ ltv, access, note, avail }) => (
                                    <div key={ltv} style={{ background: avail ? 'rgba(0,232,122,0.04)' : 'rgba(255,255,255,0.03)', border:`1px solid ${avail ? 'rgba(0,232,122,0.2)' : 'rgba(255,255,255,0.06)'}`, borderRadius:10, padding:'9px 10px' }}>
                                        <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color: avail ? C.green : C.dim, marginBottom:4 }}>{ltv}</div>
                                        <div style={{ fontSize:13, fontWeight:800, color: avail ? C.green : C.muted }}>
                                            {access != null ? (access >= 0 ? fmt$(access, true) : `−${fmt$(Math.abs(access), true)}`) : '—'}
                                        </div>
                                        <div style={{ fontSize:9, color:C.muted, marginTop:2, lineHeight:1.3 }}>{note}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Recommendation */}
            <div style={{ padding:'0 14px 14px' }}>
                <div style={{ fontSize:9, fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase', color:C.dim, marginBottom:10 }}>AI Recommendation</div>
                <div style={{ background:'linear-gradient(135deg,#0d1f16,#081410)', border:'1px solid rgba(0,232,122,0.2)', borderRadius:14, overflow:'hidden' }}>
                    <div style={{ padding:'12px 14px', borderBottom:'1px solid rgba(0,232,122,0.1)', display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:16 }}>🤖</span>
                        <div>
                            <div style={{ fontSize:12, fontWeight:700, color:C.green }}>HomeRates.ai Refi Analysis</div>
                            <div style={{ fontSize:10, color:'#3a5a3a', marginTop:1 }}>FRED live data · Your equity position · Rate trajectory</div>
                        </div>
                    </div>
                    <div style={{ margin:'14px 14px 12px', background:'rgba(0,232,122,0.07)', border:'1px solid rgba(0,232,122,0.18)', borderRadius:10, padding:'11px 14px', fontSize:13, fontWeight:700, color:C.green, lineHeight:1.4 }}>
                        {calc.verdict.emoji} {calc.verdict.text}
                    </div>
                    <div style={{ padding:'0 14px 14px' }}>
                        <div style={{ fontSize:12, color:C.sub, lineHeight:1.7, marginBottom:10 }}>
                            Your {fmtRate(currentRate)} rate{origRateLabel ? ` from ${origRateLabel}` : ''} sits <strong style={{ color:C.text }}>{calc.rateDelta.toFixed(3)}% above today's FRED average</strong> of {fmtRate(effNewRate)}. At {fmt$(balance, true)} balance, that's <strong style={{ color:C.text }}>{fmt$(calc.savings)}/month in payment relief</strong> with {fmt$(effClosing)} in closing costs — break-even at <strong style={{ color:C.text }}>{calc.beMonths != null ? `${calc.beMonths} months` : 'N/A'}</strong>.
                        </div>
                        <div style={{ fontSize:12, color:C.sub, lineHeight:1.7, marginBottom:12 }}>
                            The forward curve implies rates could ease to ~{fmtRate(calc.fwdRate)} in 12–18 months — but that's only an additional ~{fmt$(Math.round(calcPI(balance, effNewRate, termMonths) - calcPI(balance, calc.fwdRate, termMonths)))}/mo in savings. Waiting 12 months costs you <strong style={{ color:C.text }}>{fmt$(calc.savings * 12, true)} in foregone savings</strong> while the improvement remains speculative.
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                            {[
                                { icon:'📉', title:'Rate Delta',    body:`${calc.rateDelta.toFixed(3)}% drop — ${calc.rateDelta >= 0.75 ? 'above' : 'below'} the 0.75% threshold` },
                                { icon:'⏱️', title:'Break-Even',   body: calc.beMonths != null ? `${calc.beMonths} months — ${calc.beMonths <= 24 ? 'excellent' : calc.beMonths <= 36 ? 'good' : 'borderline'}` : 'Not favorable' },
                                { icon:'🏦', title:'Equity',       body: calc.ltv ? `LTV ${calc.ltv}% — ${calc.ltv < 80 ? 'strong' : 'at limit'}. ${calc.helocMax ? fmt$(calc.helocMax, true) + ' HELOC available' : ''}` : 'Property value needed' },
                                { icon:'📈', title:'Rate Outlook', body:`Forward curve: −0.48% more possible in 12–18 mo. Speculative` },
                                { icon:'⚡', title:'HELOC Option', body:`${calc.helocMax ? 'Keep current rate + open ' + fmt$(calc.helocMax, true) + ' HELOC for short-term cash' : 'Get property AVM to unlock HELOC analysis'}` },
                                { icon:'🏅', title:'15yr Path',    body:`${fmtRate(calc.rate15)} saves ${fmt$(calc.intSaved15vs30, true)} lifetime — if payment increase manageable` },
                            ].map(({ icon, title, body }) => (
                                <div key={title} style={{ display:'flex', alignItems:'flex-start', gap:7, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:9, padding:'9px 10px' }}>
                                    <span style={{ fontSize:13, flexShrink:0, marginTop:1 }}>{icon}</span>
                                    <div style={{ fontSize:11, color:C.sub, lineHeight:1.4 }}>
                                        <strong style={{ color:C.text, display:'block', fontSize:10, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:2 }}>{title}</strong>
                                        {body}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            </>
        )}
        </div>
    );
}
