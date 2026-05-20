'use client';

import React, { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import PdfDownloadButton from './PdfDownloadButton';
import SliderField from './SliderField';

// ── 2026 CA County Conforming Limits (1-unit, FHFA) ─────────────────────────
const CA_LIMITS: Record<string, number> = {
    "ALAMEDA":1249125,"ALPINE":832750,"AMADOR":832750,"BUTTE":832750,
    "CALAVERAS":832750,"COLUSA":832750,"CONTRA COSTA":1249125,"DEL NORTE":832750,
    "EL DORADO":832750,"FRESNO":832750,"GLENN":832750,"HUMBOLDT":832750,
    "IMPERIAL":832750,"INYO":832750,"KERN":832750,"KINGS":832750,
    "LAKE":832750,"LASSEN":832750,"LOS ANGELES":1249125,"MADERA":832750,
    "MARIN":1249125,"MARIPOSA":832750,"MENDOCINO":832750,"MERCED":832750,
    "MODOC":832750,"MONO":832750,"MONTEREY":994750,"NAPA":1017750,
    "NEVADA":832750,"ORANGE":1249125,"PLACER":832750,"PLUMAS":832750,
    "RIVERSIDE":832750,"SACRAMENTO":832750,"SAN BENITO":1249125,"SAN BERNARDINO":832750,
    "SAN DIEGO":1104000,"SAN FRANCISCO":1249125,"SAN JOAQUIN":832750,
    "SAN LUIS OBISPO":1000500,"SAN MATEO":1249125,"SANTA BARBARA":941850,
    "SANTA CLARA":1249125,"SANTA CRUZ":1249125,"SHASTA":832750,"SIERRA":832750,
    "SISKIYOU":832750,"SOLANO":832750,"SONOMA":897000,"STANISLAUS":832750,
    "SUTTER":832750,"TEHAMA":832750,"TRINITY":832750,"TULARE":832750,
    "TUOLUMNE":832750,"VENTURA":1035000,"YOLO":832750,"YUBA":832750,
};

const CITY_TO_COUNTY: Record<string, string> = {
    "LOS ANGELES":"LOS ANGELES","LA":"LOS ANGELES","LONG BEACH":"LOS ANGELES",
    "PASADENA":"LOS ANGELES","SANTA MONICA":"LOS ANGELES","GLENDALE":"LOS ANGELES",
    "BURBANK":"LOS ANGELES","TORRANCE":"LOS ANGELES","COMPTON":"LOS ANGELES",
    "INGLEWOOD":"LOS ANGELES","HAWTHORNE":"LOS ANGELES","CULVER CITY":"LOS ANGELES",
    "WEST HOLLYWOOD":"LOS ANGELES","BEVERLY HILLS":"LOS ANGELES","MALIBU":"LOS ANGELES",
    "WEST COVINA":"LOS ANGELES","POMONA":"LOS ANGELES","EL MONTE":"LOS ANGELES",
    "WHITTIER":"LOS ANGELES","ALHAMBRA":"LOS ANGELES","DOWNEY":"LOS ANGELES",
    "SAN FRANCISCO":"SAN FRANCISCO","SF":"SAN FRANCISCO",
    "SAN JOSE":"SANTA CLARA","PALO ALTO":"SANTA CLARA","SUNNYVALE":"SANTA CLARA",
    "MOUNTAIN VIEW":"SANTA CLARA","CUPERTINO":"SANTA CLARA","MILPITAS":"SANTA CLARA",
    "CAMPBELL":"SANTA CLARA","GILROY":"SANTA CLARA","MORGAN HILL":"SANTA CLARA",
    "OAKLAND":"ALAMEDA","BERKELEY":"ALAMEDA","FREMONT":"ALAMEDA",
    "HAYWARD":"ALAMEDA","PLEASANTON":"ALAMEDA","LIVERMORE":"ALAMEDA",
    "SAN LEANDRO":"ALAMEDA","UNION CITY":"ALAMEDA","NEWARK":"ALAMEDA",
    "SAN DIEGO":"SAN DIEGO","CHULA VISTA":"SAN DIEGO","EL CAJON":"SAN DIEGO",
    "ESCONDIDO":"SAN DIEGO","CARLSBAD":"SAN DIEGO","OCEANSIDE":"SAN DIEGO",
    "NATIONAL CITY":"SAN DIEGO","SANTEE":"SAN DIEGO","ENCINITAS":"SAN DIEGO",
    "IRVINE":"ORANGE","ANAHEIM":"ORANGE","SANTA ANA":"ORANGE",
    "HUNTINGTON BEACH":"ORANGE","FULLERTON":"ORANGE","GARDEN GROVE":"ORANGE",
    "COSTA MESA":"ORANGE","NEWPORT BEACH":"ORANGE","TUSTIN":"ORANGE",
    "CONCORD":"CONTRA COSTA","WALNUT CREEK":"CONTRA COSTA","ANTIOCH":"CONTRA COSTA",
    "RICHMOND":"CONTRA COSTA","PITTSBURG":"CONTRA COSTA","MARTINEZ":"CONTRA COSTA",
    "BRENTWOOD":"CONTRA COSTA","OAKLEY":"CONTRA COSTA",
    "RIVERSIDE":"RIVERSIDE","PALM SPRINGS":"RIVERSIDE","TEMECULA":"RIVERSIDE",
    "MORENO VALLEY":"RIVERSIDE","CORONA":"RIVERSIDE","MURRIETA":"RIVERSIDE",
    "SAN BERNARDINO":"SAN BERNARDINO","FONTANA":"SAN BERNARDINO",
    "RANCHO CUCAMONGA":"SAN BERNARDINO","ONTARIO":"SAN BERNARDINO",
    "RIALTO":"SAN BERNARDINO","CHINO":"SAN BERNARDINO",
    "FRESNO":"FRESNO","CLOVIS":"FRESNO",
    "BAKERSFIELD":"KERN","DELANO":"KERN",
    "SACRAMENTO":"SACRAMENTO","ELK GROVE":"SACRAMENTO","FOLSOM":"SACRAMENTO",
    "STOCKTON":"SAN JOAQUIN","TRACY":"SAN JOAQUIN","LODI":"SAN JOAQUIN",
    "MODESTO":"STANISLAUS","TURLOCK":"STANISLAUS",
    "THOUSAND OAKS":"VENTURA","OXNARD":"VENTURA","VENTURA":"VENTURA",
    "SIMI VALLEY":"VENTURA","CAMARILLO":"VENTURA",
    "SANTA BARBARA":"SANTA BARBARA","SANTA MARIA":"SANTA BARBARA",
    "MONTEREY":"MONTEREY","SALINAS":"MONTEREY","SEASIDE":"MONTEREY",
    "NAPA":"NAPA","AMERICAN CANYON":"NAPA",
    "SANTA ROSA":"SONOMA","PETALUMA":"SONOMA","ROHNERT PARK":"SONOMA",
    "SAN MATEO":"SAN MATEO","REDWOOD CITY":"SAN MATEO","DALY CITY":"SAN MATEO",
    "FOSTER CITY":"SAN MATEO","BURLINGAME":"SAN MATEO","SAN BRUNO":"SAN MATEO",
    "SANTA CRUZ":"SANTA CRUZ","CAPITOLA":"SANTA CRUZ","WATSONVILLE":"SANTA CRUZ",
    "SAN LUIS OBISPO":"SAN LUIS OBISPO","PASO ROBLES":"SAN LUIS OBISPO",
    "ROSEVILLE":"PLACER","ROCKLIN":"PLACER","AUBURN":"PLACER",
};

const NATIONAL_BASELINE = 832750;
const HIGH_BAL_CA_MAX  = 1_249_125; // max CA high-balance limit (LA, SF, OC, SJ)
const PMI_RATE = 0.008;

const ZONE_MAP = {
    conforming: { color: '#00e87a', bg: 'rgba(0,232,122,0.08)',  border: 'rgba(0,232,122,0.25)',  label: 'Conforming'    },
    highbal:    { color: '#ff8c42', bg: 'rgba(255,140,66,0.08)', border: 'rgba(255,140,66,0.25)', label: 'High Balance'  },
    exceeds:    { color: '#ff5f5f', bg: 'rgba(255,95,95,0.08)',  border: 'rgba(255,95,95,0.25)',  label: 'Jumbo Required' },
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcPI(principal: number, annualRate: number, termYears: number): number {
    if (principal <= 0) return 0;
    if (annualRate <= 0) return principal / (termYears * 12);
    const r = annualRate / 100 / 12;
    const n = termYears * 12;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function fmt$(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtK(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(3).replace(/\.?0+$/, '')}M`;
    if (n >= 100_000)   return `$${Math.round(n / 1_000)}k`;
    return fmt$(n);
}
function toTitle(s: string) {
    return s.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

function resolveCounty(input: string): string | null {
    const raw = input.trim().toUpperCase();
    if (!raw) return null;
    const clean = raw.replace(/\s+COUNTY\s*$/, '').trim();
    if (CA_LIMITS[clean] !== undefined) return clean;
    if (CITY_TO_COUNTY[clean]) return CITY_TO_COUNTY[clean];
    return Object.keys(CA_LIMITS).find(k => k.startsWith(clean)) ?? null;
}

// ── Interface ─────────────────────────────────────────────────────────────────

export interface ConvHBSliderParams {
    price: number;
    downPct: number;
    rate: number;
    term: number;
    taxRate: number;
    insRate: number;
    county?: string;
    countyLimit?: number;
    monthlyDebts?: number;
    onRunScenario?: (seed: string, overrides: Record<string, any>) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConvHBSliderCard(props: ConvHBSliderParams) {
    const [price,      setPrice]      = useState(props.price);
    const [downPct,    setDownPct]    = useState(props.downPct);
    const [rate,       setRate]       = useState(props.rate);
    const [termYrs,    setTermYrs]    = useState(props.term);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [vaultOk,    setVaultOk]    = useState(false);
    const [debts,      setDebts]      = useState(props.monthlyDebts ?? 0);

    const initCounty = props.county ? resolveCounty(props.county) : null;
    const initLimit  = props.countyLimit ?? (initCounty ? CA_LIMITS[initCounty] : NATIONAL_BASELINE) ?? NATIONAL_BASELINE;
    const [locInput,    setLocInput]    = useState(initCounty ? toTitle(initCounty) + ' County' : '');
    const [countyName,  setCountyName]  = useState(initCounty ?? '');
    const [countyLimit, setCountyLimit] = useState(initLimit);
    const [locMatched,  setLocMatched]  = useState(initCounty ? toTitle(initCounty) + ' County ✓' : '');
    const [locHint,     setLocHint]     = useState(() => {
        if (!initCounty) return 'Affects conforming vs. high balance threshold';
        return initLimit > NATIONAL_BASELINE
            ? `High-balance eligible — county limit ${fmt$(initLimit)}`
            : `Standard conforming area — ${fmt$(NATIONAL_BASELINE)} limit`;
    });

    const { user } = useUser();
    const router   = useRouter();

    // ── Derived ───────────────────────────────────────────────────────────────

    const downAmt   = price * downPct / 100;
    const loanAmt   = price - downAmt;
    const ltv       = (loanAmt / price) * 100;
    const pi        = calcPI(loanAmt, rate, termYrs);
    const tax       = (price * props.taxRate) / 12;
    const ins       = (price * props.insRate) / 12;
    const pmi       = ltv > 80 ? (loanAmt * PMI_RATE) / 12 : 0;
    const total     = pi + tax + ins + pmi;
    const totalInt  = pi * termYrs * 12 - loanAmt;
    const totalPmts = total * termYrs * 12;

    const isHBCounty = countyLimit > NATIONAL_BASELINE;
    type ZoneKey = 'conforming' | 'highbal' | 'exceeds';
    let zone: ZoneKey;
    let limitVal: number;
    let limitDesc: string;
    let sumSub: string;

    if (loanAmt <= NATIONAL_BASELINE) {
        zone      = 'conforming';
        limitVal  = NATIONAL_BASELINE;
        limitDesc = `Loan of ${fmt$(loanAmt)} is within the standard conforming limit. Best conventional pricing applies.`;
        sumSub    = 'Conventional · conforming' + (countyName ? ' · ' + toTitle(countyName) : '');
    } else if (isHBCounty && loanAmt <= countyLimit) {
        zone      = 'highbal';
        limitVal  = countyLimit;
        limitDesc = `Loan of ${fmt$(loanAmt)} exceeds standard limit but qualifies as High Balance in this county. Same guidelines, slightly higher rate.`;
        sumSub    = 'Conventional · high balance · ' + toTitle(countyName);
    } else if (!countyName && loanAmt <= HIGH_BAL_CA_MAX) {
        // Loan is in the CA high-balance range but no county entered yet —
        // can't confirm HB eligibility without county. Default to orange, prompt for county.
        zone      = 'highbal';
        limitVal  = NATIONAL_BASELINE;
        limitDesc = `Loan of ${fmt$(loanAmt)} may qualify as High Balance (up to ${fmt$(HIGH_BAL_CA_MAX)} in many CA counties). Enter your county above to confirm.`;
        sumSub    = 'Possible High Balance — enter county to confirm';
    } else {
        zone      = 'exceeds';
        limitVal  = isHBCounty ? countyLimit : NATIONAL_BASELINE;
        limitDesc = `Loan of ${fmt$(loanAmt)} exceeds the ${isHBCounty ? 'high-balance' : 'conforming'} cap for this county. A Jumbo loan is required.`;
        sumSub    = 'Exceeds conforming limits · Jumbo required';
    }

    const zc = ZONE_MAP[zone];
    const zoneStyle = { '--chb-color': zc.color, '--chb-bg': zc.bg, '--chb-border': zc.border } as React.CSSProperties;

    // ── Crossover analysis ────────────────────────────────────────────────────

    const crossover = (() => {
        if (zone === 'exceeds') {
            const tgtLimit = isHBCounty ? countyLimit : NATIONAL_BASELINE;
            const tgtDown  = price - tgtLimit;
            const extra    = Math.max(0, tgtDown - downAmt);
            if (extra <= 0) return null;
            const label    = isHBCounty
                ? `Down to High Balance (${fmt$(countyLimit)} limit)`
                : `Down to Conforming (${fmt$(NATIONAL_BASELINE)} limit)`;
            const newPI    = calcPI(tgtLimit, rate, termYrs);
            const savings  = total - (newPI + tax + ins);
            return { label, extra, tgtPct: (tgtDown / price) * 100, savings };
        }
        if (zone === 'highbal') {
            const tgtDown = price - NATIONAL_BASELINE;
            const extra   = Math.max(0, tgtDown - downAmt);
            if (extra <= 0) return null;
            const newPI   = calcPI(NATIONAL_BASELINE, rate, termYrs);
            const savings = total - (newPI + tax + ins);
            return { label: `Down to Conforming (${fmt$(NATIONAL_BASELINE)} limit)`, extra, tgtPct: (tgtDown / price) * 100, savings };
        }
        if (pmi > 0) {
            const tgtDown = price * 0.20;
            const extra   = Math.max(0, tgtDown - downAmt);
            if (extra <= 0) return null;
            const newPI   = calcPI(price - tgtDown, rate, termYrs);
            const savings = total - (newPI + tax + ins);
            return { label: 'Eliminate PMI — reach 80% LTV', extra, tgtPct: 20, savings };
        }
        return null;
    })();

    // ── Income qualify ────────────────────────────────────────────────────────

    const totalObligation = total + debts;
    const q36 = (totalObligation / 0.36) * 12;
    const q43 = (totalObligation / 0.43) * 12;
    const q50 = (totalObligation / 0.50) * 12;

    // ── County handler ────────────────────────────────────────────────────────

    function onLocInput(input: string) {
        setLocInput(input);
        const resolved = resolveCounty(input);
        if (resolved) {
            const lim = CA_LIMITS[resolved];
            setCountyName(resolved); setCountyLimit(lim);
            setLocMatched(toTitle(resolved) + ' County ✓');
            setLocHint(lim > NATIONAL_BASELINE
                ? `High-balance eligible — county limit ${fmt$(lim)}`
                : `Standard conforming area — ${fmt$(NATIONAL_BASELINE)} limit`);
        } else if (!input.trim()) {
            setCountyName(''); setCountyLimit(NATIONAL_BASELINE);
            setLocMatched('');
            setLocHint('Affects conforming vs. high balance threshold');
        } else {
            setCountyName(''); setCountyLimit(NATIONAL_BASELINE);
            setLocMatched('');
            setLocHint('County not found — using national standard limit');
        }
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    async function handleVault() {
        if (!user) { router.push('/sign-up'); return; }
        try {
            await fetch('/api/library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: `Conv${zone === 'highbal' ? '/HB' : ''}: ${fmtK(price)} purchase, ${downPct}% down at ${rate.toFixed(2)}%`,
                    answer:   `Payment: ${fmt$(total)}/mo · Loan: ${fmt$(loanAmt)} · LTV: ${ltv.toFixed(1)}%`,
                    tool_id:  'vault_save_conv_hb',
                }),
            });
            setVaultOk(true);
        } catch { /* non-fatal */ }
    }

    function handleCheckProperty() {
        const p = new URLSearchParams({
            price: String(Math.round(price)), dp: String(downPct),
            rate: rate.toFixed(3), term: String(termYrs),
            lt: 'conventional',
            taxRate: props.taxRate.toFixed(5), insRate: props.insRate.toFixed(5),
        });
        router.push(`/check-property?${p.toString()}`);
    }

    function handleRun() {
        if (!props.onRunScenario) return;
        const dStr = debts > 0 ? ` with ${fmt$(debts)}/mo in other debts` : '';
        const seed = `Conventional loan on ${fmtK(price)} home, ${downPct}% down at ${rate.toFixed(3)}% — ${termYrs} year fixed${dStr}`;
        props.onRunScenario(seed, { isConvHB: true, purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate, termYears: termYrs, monthlyDebts: debts, changedKeys: ['purchasePrice', 'downPaymentPct', 'annualRatePct'] });
    }

    function handleGetMatched() {
        const p = new URLSearchParams({
            from: 'scenario', lt: 'Conventional', purpose: 'Purchase',
            price: String(Math.round(price)), dp: String(downPct),
            monthly: String(Math.round(total)), rate: String(rate), term: String(termYrs),
        });
        router.push(`/connect/post?${p.toString()}`);
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="chb" style={zoneStyle}>

            {/* Header */}
            <div className="chb-header">
                <div className="chb-header-left">
                    <div className="chb-hicon">
                        <svg viewBox="0 0 24 24" fill="none" stroke={zc.color} strokeWidth="1.8" width="16" height="16">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"/>
                        </svg>
                    </div>
                    <div>
                        <div className="chb-title">Purchase Payment Analysis</div>
                        <div className="chb-sub">{sumSub}</div>
                    </div>
                </div>
                <span className="chb-zone-badge">{zc.label}</span>
            </div>

            {/* Hero */}
            <div className="chb-hero">
                <div className="chb-hero-main">
                    <div className="chb-hero-label">Est. Monthly PITI</div>
                    <div className="chb-hero-amount">{fmt$(total)}<span className="chb-hero-mo">/mo</span></div>
                    <div className="chb-hero-sub">
                        {pmi > 0 ? `P&I + Tax + Ins + PMI (${fmt$(pmi)}/mo)` : `No PMI · ${downPct}% down`}
                    </div>
                </div>
                <div className="chb-hero-stats">
                    <div className="chb-hero-stat">
                        <div className="chb-hsl">Loan Amount</div>
                        <div className="chb-hsv">{fmt$(loanAmt)}</div>
                    </div>
                    <div className="chb-hero-stat">
                        <div className="chb-hsl">LTV</div>
                        <div className="chb-hsv">{ltv.toFixed(1)}%</div>
                    </div>
                    <div className="chb-hero-stat">
                        <div className="chb-hsl">Total Interest</div>
                        <div className="chb-hsv">{fmtK(totalInt)}</div>
                    </div>
                </div>
            </div>

            {/* Monthly breakdown — always visible */}
            <div className="chb-bkd">
                <div className="chb-bkd-title">Monthly Breakdown</div>
                <div className="chb-bkd-row"><span>Principal &amp; Interest</span><span>{fmt$(pi)}</span></div>
                <div className="chb-bkd-row"><span>Property Taxes ({(props.taxRate * 100).toFixed(2)}%)</span><span>{fmt$(tax)}</span></div>
                <div className="chb-bkd-row"><span>Homeowner&apos;s Insurance</span><span>{fmt$(ins)}</span></div>
                {pmi > 0 && <div className="chb-bkd-row chb-bkd-pmi"><span>PMI ({ltv.toFixed(1)}% LTV)</span><span>{fmt$(pmi)}</span></div>}
                <div className="chb-bkd-row chb-bkd-total"><span>Total PITI</span><span>{fmt$(total)}/mo</span></div>
            </div>

            {/* Sliders — always visible */}
            <div className="chb-sliders">
                <div className="chb-sliders-title">Adjust Your Numbers</div>

                {/* County lookup */}
                <div className="chb-loc-row">
                    <div className="chb-loc-hdr">
                        <span className="chb-loc-label">County / City</span>
                        {locMatched && <span className="chb-loc-matched">{locMatched}</span>}
                    </div>
                    <div className="chb-loc-wrap">
                        <span className="chb-loc-pin">📍</span>
                        <input
                            type="text" className="chb-loc-input" value={locInput}
                            placeholder="Los Angeles, Irvine, San Diego…"
                            list="chb-county-list"
                            onChange={e => onLocInput(e.target.value)}
                        />
                        <datalist id="chb-county-list">
                            {Object.keys(CA_LIMITS).map(c => <option key={c} value={toTitle(c) + ' County'} />)}
                            {Object.keys(CITY_TO_COUNTY).map(city => <option key={city} value={toTitle(city)} />)}
                        </datalist>
                    </div>
                    <div className="chb-loc-hint">{locHint}</div>
                </div>

                <SliderField label="Home Price" value={price} min={100000} max={3000000} step={5000}
                    onChange={setPrice} format={v => fmt$(v)} minLabel="$100k" maxLabel="$3M"
                    trackColor={zc.color} theme="dark" />

                <SliderField label="Down Payment" value={downPct} min={3} max={50} step={1}
                    onChange={setDownPct} format={v => `${v}% · ${fmt$(price * v / 100)}`}
                    minLabel="3%" maxLabel="50%" trackColor={zc.color} theme="dark" />
                <div className="chb-dp-chips">
                    {[3, 5, 10, 20, 25].map(pct => (
                        <button key={pct} className={`chb-dp-chip${downPct === pct ? ' active' : ''}`}
                            onClick={() => setDownPct(pct)}>{pct}%</button>
                    ))}
                </div>

                <div className="chb-rate-wrap">
                    <SliderField label="Interest Rate" value={rate} min={3} max={12} step={0.125}
                        onChange={setRate} format={v => parseFloat(v.toFixed(3)) + '%'}
                        minLabel="3%" maxLabel="12%" trackColor={zc.color} theme="dark" />
                    <div className="chb-fred-tag">FRED PMMS · {props.rate.toFixed(2)}% live</div>
                </div>

                <div className="chb-term-label">Loan Term</div>
                <div className="chb-terms">
                    {([15, 20, 30] as const).map(yr => (
                        <button key={yr} className={`chb-term${termYrs === yr ? ' chb-term--on' : ''}`}
                            onClick={() => setTermYrs(yr)}>{yr}yr</button>
                    ))}
                </div>

                <SliderField
                    label="Monthly Debts"
                    value={debts}
                    min={0} max={5000} step={50}
                    onChange={setDebts}
                    format={v => v === 0 ? 'None' : fmt$(v) + '/mo'}
                    minLabel="None" maxLabel="$5k/mo"
                    trackColor={zc.color} theme="dark"
                />
                <div style={{ fontSize: 11, color: '#64748b', marginTop: -4 }}>Car payments, student loans, credit cards, child support, etc.</div>
            </div>

            {/* Income qualify table */}
            <div className="chb-qualify">
                <div className="chb-qualify-title">Income to Qualify</div>
                {debts > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginBottom: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <span>PITI {fmt$(Math.round(total))} + Debts {fmt$(debts)}</span>
                        <span style={{ color: zc.color, fontWeight: 600 }}>Total {fmt$(Math.round(totalObligation))}/mo</span>
                    </div>
                )}
                <table className="chb-qtable">
                    <thead>
                        <tr><th>DTI</th><th>Guideline</th><th>Gross Annual</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>36%</td><td>Conservative</td><td className="chb-qval">{fmt$(q36)}</td></tr>
                        <tr className="chb-qrow-hi"><td>43%</td><td>Conv. standard</td><td className="chb-qval">{fmt$(q43)}</td></tr>
                        <tr><td>50%</td><td>DU/LP max</td><td className="chb-qval">{fmt$(q50)}</td></tr>
                    </tbody>
                </table>
            </div>

            {/* CTAs */}
            <div className="chb-cta-row">
                <button className="chb-cta-prop" onClick={handleCheckProperty}>🏠 Check a Property</button>
                {props.onRunScenario && (
                    <button className="chb-cta-run" onClick={handleRun}>▶ Run My Numbers</button>
                )}
            </div>
            <button className="chb-cta-full" onClick={handleGetMatched}>Get Matched with a Lender →</button>
            <a
                href={`/track5?price=${Math.round(price)}&downpct=${Math.round(downPct)}`}
                target="track5"
                rel="noopener"
                style={{
                    display: 'block', margin: '8px 12px 0',
                    background: 'rgba(167,139,250,0.08)',
                    border: '1px solid rgba(167,139,250,0.2)',
                    borderRadius: 9, padding: '11px 14px',
                    fontSize: 13, fontWeight: 700, color: '#a78bfa',
                    textDecoration: 'none', textAlign: 'center',
                }}
            >
                Check on Track 5 ↗
            </a>

            {/* Cross-fire chip — loan above national baseline: suggest running Jumbo card for comparison */}
            {props.onRunScenario && loanAmt > NATIONAL_BASELINE && (
                <div className="chb-xchip-row">
                    <button
                        className="chb-xchip"
                        onClick={() => props.onRunScenario!(
                            `Compare this as a Jumbo loan — ${fmtK(price)} home, ${downPct}% down. What does the jumbo payment and rate look like vs. High Balance conventional?`,
                            { isJumbo: true, purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate }
                        )}
                    >
                        ⇄ Compare Jumbo loan rates
                    </button>
                </div>
            )}

            {/* Drawer trigger */}
            <button className="chb-dtrigger" onClick={() => setDrawerOpen(o => !o)}>
                <span className="chb-dtrigger-left">
                    <span className="chb-dtrigger-dot" />
                    <span>
                        <span className="chb-dtrigger-label">Deep Analysis</span>
                        <span className="chb-dtrigger-sub">Zone · Crossover · Reserves · Full Summary</span>
                    </span>
                </span>
                <span className="chb-dtrigger-arrow">{drawerOpen ? '▲ Close' : '▼ View'}</span>
            </button>

            {/* Deep drawer */}
            <div style={{ maxHeight: drawerOpen ? 1600 : 0, overflow: 'hidden', transition: 'max-height 0.38s ease' }}>
                <div className="chb-drawer-inner">

                    {/* Loan Zone */}
                    <div className="chb-dsec">
                        <div className="chb-dsec-label">Loan Zone</div>
                        <div className="chb-zone-row">
                            <span className="chb-zone-pill">{zc.label}</span>
                            <p className="chb-zone-desc">{limitDesc}</p>
                        </div>
                        <div className="chb-kv2"><span>2026 Applicable Limit</span><span>{fmt$(limitVal)}</span></div>
                        <div className="chb-kv2"><span>National Conforming Baseline</span><span>{fmt$(NATIONAL_BASELINE)}</span></div>
                        {countyName && <div className="chb-kv2"><span>County</span><span>{toTitle(countyName)}</span></div>}
                        {isHBCounty && <div className="chb-kv2"><span>County High-Balance Limit</span><span>{fmt$(countyLimit)}</span></div>}
                    </div>

                    {/* Crossover opportunity */}
                    {crossover && (
                        <div className="chb-dsec">
                            <div className="chb-dsec-label">Crossover Opportunity</div>
                            <div className="chb-xcross-title">{crossover.label}</div>
                            <div className="chb-kv2"><span>Additional Down Needed</span><span>{fmt$(crossover.extra)}</span></div>
                            <div className="chb-kv2"><span>New Down Payment %</span><span>{crossover.tgtPct.toFixed(1)}%</span></div>
                            {crossover.savings > 0 && <>
                                <div className="chb-kv2 chb-kv2-green"><span>Est. Monthly Savings</span><span>{fmt$(crossover.savings)}/mo</span></div>
                                <div className="chb-kv2 chb-kv2-green"><span>Est. Annual Savings</span><span>{fmt$(crossover.savings * 12)}/yr</span></div>
                            </>}
                        </div>
                    )}

                    {/* PMI detail */}
                    {pmi > 0 && (
                        <div className="chb-dsec">
                            <div className="chb-dsec-label">PMI Detail</div>
                            <div className="chb-kv2"><span>Current LTV</span><span>{ltv.toFixed(1)}%</span></div>
                            <div className="chb-kv2"><span>PMI Monthly</span><span>{fmt$(pmi)}</span></div>
                            <div className="chb-kv2"><span>PMI Annual Cost</span><span>{fmt$(pmi * 12)}</span></div>
                            <div className="chb-kv2"><span>Auto-drop Balance (78% LTV)</span><span>{fmt$(price * 0.78)}</span></div>
                            <div className="chb-kv2"><span>Request-removal Balance (80% LTV)</span><span>{fmt$(price * 0.80)}</span></div>
                        </div>
                    )}

                    {/* Reserves */}
                    <div className="chb-dsec">
                        <div className="chb-dsec-label">Reserves Needed</div>
                        <div className="chb-kv2"><span>6-Month PITI Cushion</span><span>{fmt$(total * 6)}</span></div>
                        <div className="chb-kv2"><span>12-Month PITI Cushion</span><span>{fmt$(total * 12)}</span></div>
                    </div>

                    {/* Full underwriting summary */}
                    <div className="chb-dsec">
                        <div className="chb-dsec-label">Full Loan Summary</div>
                        <div className="chb-kv2"><span>Purchase Price</span><span>{fmt$(price)}</span></div>
                        <div className="chb-kv2"><span>Down Payment</span><span>{fmt$(downAmt)} ({downPct}%)</span></div>
                        <div className="chb-kv2"><span>Loan Amount</span><span>{fmt$(loanAmt)}</span></div>
                        <div className="chb-kv2"><span>LTV Ratio</span><span>{ltv.toFixed(1)}%</span></div>
                        <div className="chb-kv2"><span>Interest Rate</span><span>{rate.toFixed(3)}%</span></div>
                        <div className="chb-kv2"><span>Loan Term</span><span>{termYrs} yr fixed</span></div>
                        <div className="chb-kv2"><span>Monthly PITI</span><span>{fmt$(total)}</span></div>
                        <div className="chb-kv2"><span>Total of Payments ({termYrs}yr)</span><span>{fmt$(totalPmts)}</span></div>
                        <div className="chb-kv2 chb-kv2-amber"><span>Total Interest Paid</span><span>{fmt$(totalInt)}</span></div>
                    </div>

                </div>
            </div>

            {/* Permanent bottom */}
            <div className="chb-perm">
                <div className="chb-perm-label">Save This Scenario</div>
                <div className="chb-vault-row">
                    <button className="chb-btn-vault" onClick={handleVault}>
                        {vaultOk ? '✓ Saved to Vault' : '⭐ Save to My Vault'}
                    </button>
                    <PdfDownloadButton
                        type="conventional"
                        getParams={() => ({
                            price, downPct, rate, term: termYrs,
                            taxRate: props.taxRate, insRate: props.insRate,
                            loanType: 'conventional',
                        })}
                    />
                </div>
                <div className="chb-rate-note">
                    <span className="chb-bulb">💡</span>
                    <p>Rate seeded at <strong>{props.rate.toFixed(2)}%</strong> (FRED 30-yr fixed, live avg).
                    Actual rate depends on credit score, lender, and lock timing.</p>
                </div>
                <div className="chb-disc">
                    <p>
                        <strong>Educational estimates only.</strong> These figures are for planning purposes and are not a Loan Estimate,
                        pre-approval, or commitment to lend under RESPA/TRID. Monthly payment includes P&amp;I,
                        estimated property tax ({(props.taxRate * 100).toFixed(1)}% annual), homeowner&apos;s insurance ({(props.insRate * 100).toFixed(1)}% annual),
                        and PMI where LTV exceeds 80%. Conforming loan limits per FHFA 2026 guidelines — county-specific limits may vary.
                    </p>
                </div>
            </div>

            <style>{`
                .chb {
                    background: #0d1117;
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 16px;
                    overflow: clip;
                    margin-top: 14px;
                    font-family: system-ui, -apple-system, sans-serif;
                    color: #f0f4ff;
                }

                /* Header */
                .chb-header { display:flex; align-items:center; justify-content:space-between; padding:14px 16px 10px; gap:10px; }
                .chb-header-left { display:flex; align-items:center; gap:10px; }
                .chb-hicon { width:32px; height:32px; border-radius:9px; background:var(--chb-bg); border:1px solid var(--chb-border); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
                .chb-title { font-size:15px; font-weight:700; color:#f0f4ff; }
                .chb-sub   { font-size:11px; color:#6b7a99; margin-top:1px; }
                .chb-zone-badge { font-size:9px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; padding:4px 10px; border-radius:20px; background:var(--chb-bg); color:var(--chb-color); border:1px solid var(--chb-border); flex-shrink:0; white-space:nowrap; }

                /* Hero */
                .chb-hero { margin:0 12px 12px; background:#0e1420; border:1px solid var(--chb-border); border-radius:12px; padding:16px; display:grid; grid-template-columns:1.4fr 1fr; gap:16px; align-items:center; }
                .chb-hero-label { font-size:10px; font-weight:700; color:#8fa3b8; text-transform:uppercase; letter-spacing:.08em; margin-bottom:6px; }
                .chb-hero-amount { font-size:30px; font-weight:800; color:var(--chb-color); letter-spacing:-.5px; line-height:1; }
                .chb-hero-mo { font-size:16px; font-weight:600; color:#6b7a99; }
                .chb-hero-sub { font-size:11px; color:#6b7a99; margin-top:4px; }
                .chb-hero-stats { display:flex; flex-direction:column; gap:10px; padding-left:16px; border-left:1px solid rgba(255,255,255,0.05); }
                .chb-hsl { font-size:9px; color:#8fa3b8; text-transform:uppercase; letter-spacing:.06em; font-weight:600; margin-bottom:2px; }
                .chb-hsv { font-size:13px; font-weight:700; color:#f0f4ff; }

                /* Breakdown */
                .chb-bkd { margin:0 12px 12px; background:#0e1420; border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:14px; }
                .chb-bkd-title { font-size:10px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:.08em; margin-bottom:10px; }
                .chb-bkd-row { display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.03); font-size:12px; color:#8fa3b8; }
                .chb-bkd-row:last-child { border-bottom:none; }
                .chb-bkd-pmi span { color:#fbbf24 !important; font-weight:700; }
                .chb-bkd-total { border-top:1px solid rgba(255,255,255,0.07) !important; border-bottom:none !important; margin-top:4px; padding-top:10px !important; }
                .chb-bkd-total span:first-child { font-weight:700; color:#f0f4ff; }
                .chb-bkd-total span:last-child  { font-size:14px; font-weight:800; color:var(--chb-color); }

                /* Sliders section — white */
                .chb-sliders { background:#0d1117; color:#f0f4ff; padding:16px 18px; border-top:1px solid rgba(255,255,255,0.05); }
                .chb-sliders-title { font-size:13px; font-weight:700; color:#f0f4ff; margin-bottom:14px; }

                /* County lookup */
                .chb-loc-row { margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid rgba(255,255,255,0.05); }
                .chb-loc-hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
                .chb-loc-label  { font-size:13px; font-weight:600; color:#8fa3b8; }
                .chb-loc-matched { font-size:11px; color:#00e87a; font-weight:600; }
                .chb-loc-wrap { position:relative; }
                .chb-loc-input { width:100%; padding:9px 14px 9px 32px; border:1.5px solid rgba(255,255,255,0.1); border-radius:8px; font-size:13px; font-weight:500; color:#f0f4ff; font-family:inherit; background:rgba(255,255,255,0.04); outline:none; transition:border-color .15s; box-sizing:border-box; }
                .chb-loc-input:focus { border-color:#00e87a; background:rgba(0,232,122,0.06); }
                .chb-loc-pin { position:absolute; left:10px; top:50%; transform:translateY(-50%); font-size:12px; pointer-events:none; }
                .chb-loc-hint { font-size:10px; color:#3a4560; margin-top:5px; }

                /* DP chips */
                .chb-dp-chips { display:flex; gap:6px; flex-wrap:wrap; margin:-4px 0 14px; }
                .chb-dp-chip { padding:5px 12px; border-radius:20px; border:1.5px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04); font-size:11px; font-weight:600; color:#6b7a99; cursor:pointer; font-family:inherit; transition:all .12s; }
                .chb-dp-chip.active { border-color:var(--chb-color); color:var(--chb-color); background:var(--chb-bg); }
                .chb-dp-chip:hover:not(.active) { border-color:rgba(255,255,255,0.2); }

                /* FRED rate tag */
                .chb-rate-wrap { position:relative; }
                .chb-fred-tag { font-size:10px; font-weight:700; color:#00e87a; background:rgba(0,232,122,0.1); border:1px solid rgba(0,232,122,0.2); border-radius:4px; padding:2px 8px; display:inline-block; margin:-2px 0 12px; letter-spacing:.04em; }

                /* Term buttons */
                .chb-term-label { font-size:13px; font-weight:600; color:#8fa3b8; margin:4px 0 8px; }
                .chb-terms { display:flex; gap:8px; margin-bottom:4px; }
                .chb-term { flex:1; padding:10px 0; border-radius:8px; border:1.5px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04); font-size:13px; font-weight:600; color:#6b7a99; cursor:pointer; font-family:inherit; text-align:center; transition:all .15s; }
                .chb-term--on { border-color:var(--chb-color); color:var(--chb-color); background:var(--chb-bg); }
                .chb-term:hover:not(.chb-term--on) { border-color:rgba(255,255,255,0.2); }

                /* Income qualify */
                .chb-qualify { margin:0 12px 12px; background:#0e1420; border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:14px; }
                .chb-qualify-title { font-size:10px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:.08em; margin-bottom:10px; }
                .chb-qtable { width:100%; border-collapse:collapse; font-size:12px; }
                .chb-qtable th { font-size:9px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:.06em; padding:0 0 8px; text-align:left; border-bottom:1px solid rgba(255,255,255,0.05); }
                .chb-qtable th:last-child { text-align:right; }
                .chb-qtable td { padding:7px 0; border-bottom:1px solid rgba(255,255,255,0.03); color:#8fa3b8; }
                .chb-qtable tr:last-child td { border-bottom:none; }
                .chb-qrow-hi td { color:#f0f4ff; font-weight:600; }
                .chb-qval { font-weight:700; color:var(--chb-color) !important; text-align:right; }

                /* CTAs */
                .chb-cta-row { display:flex; gap:8px; padding:0 12px 8px; }
                .chb-cta-prop { flex:1; padding:11px 14px; background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.12); border-radius:9px; color:#f0f4ff; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; text-align:center; }
                .chb-cta-prop:hover { background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.25); }
                .chb-cta-run { flex:1; padding:11px 14px; background:var(--chb-bg); border:1.5px solid var(--chb-border); border-radius:9px; color:var(--chb-color); font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; text-align:center; }
                .chb-cta-run:hover { opacity:.85; }
                .chb-cta-full { display:block; width:calc(100% - 24px); margin:0 12px 12px; padding:13px; background:var(--chb-color); border:none; border-radius:9px; color:#07100f; font-size:14px; font-weight:800; cursor:pointer; font-family:inherit; transition:opacity .15s; text-align:center; }
                .chb-cta-full:hover { opacity:.88; }

                /* Cross-fire chip */
                .chb-xchip-row { padding:0 12px 8px; }
                .chb-xchip { width:100%; padding:10px 14px; border-radius:9px; font-size:13px; font-weight:600; cursor:pointer; text-align:center; background:rgba(255,95,95,0.06); border:1.5px solid rgba(255,95,95,0.2); color:#ff5f5f; font-family:inherit; transition:opacity .15s; }
                .chb-xchip:hover { opacity:.82; }

                /* Drawer trigger */
                .chb-dtrigger { width:100%; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:13px 18px; background:var(--chb-bg); border:none; border-top:1px solid var(--chb-border); border-bottom:1px solid var(--chb-border); cursor:pointer; font-family:inherit; transition:opacity .15s; }
                .chb-dtrigger:hover { opacity:.85; }
                .chb-dtrigger-left { display:flex; align-items:center; gap:10px; text-align:left; }
                .chb-dtrigger-dot { width:7px; height:7px; border-radius:50%; background:var(--chb-color); flex-shrink:0; }
                .chb-dtrigger-label { display:block; font-size:13px; font-weight:700; color:var(--chb-color); }
                .chb-dtrigger-sub { display:block; font-size:10px; color:rgba(255,255,255,0.6); margin-top:1px; }
                .chb-dtrigger-arrow { font-size:11px; color:var(--chb-color); opacity:.7; flex-shrink:0; }

                /* Drawer inner */
                .chb-drawer-inner { padding:14px; display:flex; flex-direction:column; gap:12px; background:#0a0f1a; }
                .chb-dsec { background:#0e1420; border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:14px; }
                .chb-dsec-label { font-size:9px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:.1em; margin-bottom:10px; }
                .chb-zone-row { display:flex; align-items:flex-start; gap:10px; margin-bottom:10px; }
                .chb-zone-pill { font-size:9px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; padding:4px 10px; border-radius:20px; background:var(--chb-bg); color:var(--chb-color); border:1px solid var(--chb-border); flex-shrink:0; white-space:nowrap; }
                .chb-zone-desc { font-size:11px; color:#8fa3b8; line-height:1.5; }
                .chb-kv2 { display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.03); font-size:12px; }
                .chb-kv2:last-child { border-bottom:none; }
                .chb-kv2 span:first-child { color:#8fa3b8; }
                .chb-kv2 span:last-child  { font-weight:700; color:#f0f4ff; }
                .chb-kv2-green span:last-child { color:#00e87a; }
                .chb-kv2-amber span:last-child { color:#fbbf24; }
                .chb-xcross-title { font-size:12px; font-weight:700; color:var(--chb-color); margin-bottom:8px; }

                /* Permanent bottom */
                .chb-perm { padding:16px; border-top:1px solid rgba(255,255,255,0.05); }
                .chb-perm-label { font-size:10px; font-weight:800; color:#8fa3b8; text-transform:uppercase; letter-spacing:.08em; margin-bottom:10px; }
                .chb-vault-row { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
                .chb-btn-vault { flex:1; min-width:140px; display:flex; align-items:center; justify-content:center; gap:6px; background:var(--chb-bg); color:var(--chb-color); border:1.5px solid var(--chb-border); border-radius:8px; padding:10px 16px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:opacity .15s; }
                .chb-btn-vault:hover { opacity:.85; }
                .chb-rate-note { background:rgba(0,232,122,0.04); border:1px solid rgba(0,232,122,0.12); border-radius:10px; padding:10px 14px; display:flex; align-items:flex-start; gap:10px; margin-bottom:10px; }
                .chb-bulb { font-size:16px; flex-shrink:0; margin-top:1px; }
                .chb-rate-note p { font-size:12px; color:#8fa3b8; line-height:1.5; margin:0; }
                .chb-rate-note strong { color:#00e87a; }
                .chb-disc { background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:10px; padding:12px 14px; }
                .chb-disc p { font-size:11px; color:#6b7a99; line-height:1.6; margin:0; }
                .chb-disc strong { color:#6b7a99; font-weight:600; }

                @media (max-width:480px) {
                    .chb-hero { grid-template-columns:1fr; }
                    .chb-hero-stats { flex-direction:row; padding-left:0; border-left:none; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px; }
                    .chb-cta-row { flex-direction:column; }
                    .chb-hero-amount { font-size:26px; }
                }
                @media (max-width:640px) {
                    .chb-vault-row { flex-direction:column; }
                    .chb-btn-vault { min-width:unset; }
                }
            `}</style>

        </div>
    );
}
