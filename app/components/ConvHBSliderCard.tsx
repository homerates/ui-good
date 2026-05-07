'use client';

// ConvHBSliderCard.tsx
// Conventional / High Balance purchase payment card
// County-aware: auto-detects conforming vs. high-balance vs. exceeds-limit
// Dark shell + white Payment Explorer — same pattern as AffordabilitySliderCard

import React, { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import PdfDownloadButton from './PdfDownloadButton';
import SliderField from './SliderField';
import DiscoverDock from './DiscoverDock';

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

const NATIONAL_BASELINE = 832750; // 2026 FHFA standard conforming
const PMI_RATE = 0.008;

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
function toTitle(s: string) {
    return s.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

// ── County lookup ─────────────────────────────────────────────────────────────

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
    rate: number;         // FRED live seed
    term: number;
    taxRate: number;      // annual fraction, e.g. 0.012
    insRate: number;      // annual fraction, e.g. 0.005
    county?: string;      // optional — pre-populates county lookup
    countyLimit?: number; // optional — pre-populates limit band
    onRunScenario?: (seed: string, overrides: Record<string, any>) => void;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="chb-tile">
            <div className="chb-tile-icon">{icon}</div>
            <div className="chb-tile-label">{label}</div>
            <div className="chb-tile-value">{value}</div>
        </div>
    );
}

function KVRow({ k, v, green, red, total, section }: { k: string; v?: string; green?: boolean; red?: boolean; total?: boolean; section?: boolean }) {
    if (section) return <div className="chb-kv-s">{k}</div>;
    return (
        <div className={`chb-kv${total ? ' chb-kv--total' : ''}`}>
            <span className="chb-kv-k">{k}</span>
            <span className={`chb-kv-v${green ? ' chb-kv-v--green' : red ? ' chb-kv-v--red' : ''}`}>{v}</span>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ConvHBSliderCard(props: ConvHBSliderParams) {
    const [price,    setPrice]    = useState(props.price);
    const [downPct,  setDownPct]  = useState(props.downPct);
    const [rate,     setRate]     = useState(props.rate);
    const [termYrs,  setTermYrs]  = useState(props.term);
    const [bkdOpen,  setBkdOpen]  = useState(true);
    const [vaultDone, setVaultDone] = useState(false);
    const [sliderOpen, setSliderOpen] = useState(false);
    const [drawerPhase, setDrawerPhase] = useState<'idle'|'running'|'done'>('idle');

    // County state — pre-populate if props supplied a county
    const initCounty   = props.county ? resolveCounty(props.county) : null;
    const initLimit    = props.countyLimit ?? (initCounty ? CA_LIMITS[initCounty] : NATIONAL_BASELINE) ?? NATIONAL_BASELINE;
    const [locInput,   setLocInput]   = useState(initCounty ? toTitle(initCounty) + ' County' : '');
    const [countyName, setCountyName] = useState(initCounty ?? '');
    const [countyLimit, setCountyLimit] = useState(initLimit);
    const [locMatched, setLocMatched] = useState(initCounty ? toTitle(initCounty) + ' County ✓' : '');
    const [locHint,    setLocHint]    = useState(() => {
        if (!initCounty) return 'Affects conforming vs. high balance threshold for this county';
        return initLimit > NATIONAL_BASELINE
            ? `High-balance eligible area — county limit ${fmt$(initLimit)}`
            : `Standard conforming area — ${fmt$(NATIONAL_BASELINE)} limit`;
    });

    const { user } = useUser();
    const router = useRouter();

    // ── Derived values ──────────────────────────────────────────────────────

    const downAmt  = price * downPct / 100;
    const loanAmt  = price - downAmt;
    const ltv      = (loanAmt / price) * 100;
    const pi       = calcPI(loanAmt, rate, termYrs);
    const tax      = (price * props.taxRate) / 12;
    const ins      = (price * props.insRate) / 12;
    const pmi      = ltv > 80 ? (loanAmt * PMI_RATE) / 12 : 0;
    const total    = pi + tax + ins + pmi;
    const totalInt = pi * termYrs * 12 - loanAmt;
    const totalPmts = total * termYrs * 12;

    const isDirty = price !== props.price || downPct !== props.downPct ||
        Math.abs(rate - props.rate) > 0.001 || termYrs !== props.term;

    // ── County limit band ───────────────────────────────────────────────────

    const isHBCounty = countyLimit > NATIONAL_BASELINE;
    let limitStatus: 'conforming' | 'highbal' | 'exceeds';
    let limitBadge: string;
    let limitDesc: string;
    let limitVal: number;
    let sumSub: string;

    if (loanAmt <= NATIONAL_BASELINE) {
        limitStatus = 'conforming';
        limitBadge  = 'Conforming';
        limitDesc   = `Loan of ${fmt$(loanAmt)} is within the standard conforming limit. Best conventional pricing applies.`;
        limitVal    = NATIONAL_BASELINE;
        sumSub      = 'Conventional loan · conforming' + (countyName ? ' · ' + toTitle(countyName) : '');
    } else if (isHBCounty && loanAmt <= countyLimit) {
        limitStatus = 'highbal';
        limitBadge  = 'High Balance';
        limitDesc   = `Loan of ${fmt$(loanAmt)} exceeds standard limit but qualifies as High Balance in this county. Same guidelines, slightly higher rate.`;
        limitVal    = countyLimit;
        sumSub      = 'Conventional loan · high balance' + (countyName ? ' · ' + toTitle(countyName) : '');
    } else {
        limitStatus = 'exceeds';
        limitBadge  = 'Exceeds Limits';
        limitDesc   = `Loan of ${fmt$(loanAmt)} exceeds the ${isHBCounty ? 'high balance' : 'conforming'} cap for this county. A Jumbo loan is required.`;
        limitVal    = isHBCounty ? countyLimit : NATIONAL_BASELINE;
        sumSub      = 'Exceeds conforming limits · Jumbo required';
    }

    // ── County input handler ────────────────────────────────────────────────

    function onLocInput(input: string) {
        setLocInput(input);
        const resolved = resolveCounty(input);
        if (resolved) {
            const lim = CA_LIMITS[resolved];
            setCountyName(resolved);
            setCountyLimit(lim);
            setLocMatched(toTitle(resolved) + ' County ✓');
            setLocHint(lim > NATIONAL_BASELINE
                ? `High-balance eligible area — county limit ${fmt$(lim)}`
                : `Standard conforming area — ${fmt$(NATIONAL_BASELINE)} limit`);
        } else if (!input.trim()) {
            setCountyName('');
            setCountyLimit(NATIONAL_BASELINE);
            setLocMatched('');
            setLocHint('Affects conforming vs. high balance threshold for this county');
        } else {
            setCountyName('');
            setCountyLimit(NATIONAL_BASELINE);
            setLocMatched('');
            setLocHint('County not found — using national standard limit');
        }
    }

    // ── Actions ─────────────────────────────────────────────────────────────

    async function handleVault() {
        if (!user) { router.push('/sign-up'); return; }
        try {
            await fetch('/api/library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: `Conv${limitStatus === 'highbal' ? '/HB' : ''}: ${fmtK(price)} purchase, ${downPct}% down at ${rate.toFixed(2)}%`,
                    answer: `Payment: ${fmt$(total)}/mo · Loan: ${fmt$(loanAmt)} · LTV: ${ltv.toFixed(1)}%`,
                    tool_id: 'vault_save_conv_hb',
                }),
            });
            setVaultDone(true);
        } catch { /* non-fatal */ }
    }

    function buildSeed(): string {
        return `Conventional loan on ${fmtK(price)} home, ${downPct}% down at ${rate.toFixed(3)}% — ${termYrs} year fixed`;
    }

    function getRunOverrides(): Record<string, any> {
        const changedKeys: string[] = [];
        if (price !== props.price)                     changedKeys.push('purchasePrice');
        if (downPct !== props.downPct)                 changedKeys.push('downPaymentPct');
        if (Math.abs(rate - props.rate) > 0.001)       changedKeys.push('annualRatePct');
        if (termYrs !== props.term)                    changedKeys.push('term');
        return { isConvHB: true, purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate, changedKeys };
    }

    function getMatchedUrl(): string {
        const p = new URLSearchParams({
            from: 'scenario', lt: 'Conventional', purpose: 'Purchase',
            price: String(Math.round(price)),
            dp:    String(downPct),
            monthly: String(Math.round(total)),
            rate:  String(rate),
            term:  String(termYrs),
        });
        return `/connect/post?${p.toString()}`;
    }

    async function handleDrawerRun() {
        setDrawerPhase('running');
        if (props.onRunScenario) props.onRunScenario(buildSeed(), getRunOverrides());
        await new Promise<void>(r => setTimeout(r, 900));
        setDrawerPhase('done');
        await new Promise<void>(r => setTimeout(r, 1800));
        setSliderOpen(false);
        setDrawerPhase('idle');
    }

    // ── Down payment chips ───────────────────────────────────────────────────

    const DP_CHIPS = [3, 5, 10, 20, 25];

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="chb">

            {/* Topbar */}
            <div className="chb-topbar">
                <div className="chb-topbar-l">
                    <div className="chb-dot" />
                    <span className="chb-tl">AI Analysis</span>
                </div>
                <span className="chb-tr">Live · CalcEngine-Deterministic</span>
            </div>

            {/* Summary tiles */}
            <div className="chb-sum">
                <div className="chb-sum-head">
                    <div className="chb-sum-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"/>
                        </svg>
                    </div>
                    <div>
                        <div className="chb-sum-title">Purchase Payment Analysis</div>
                        <div className="chb-sum-sub">{sumSub}</div>
                    </div>
                </div>
                <div className="chb-tiles">
                    <Tile icon={<svg viewBox="0 0 24 24" fill="none" stroke="#00e87a" strokeWidth="1.8" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"/></svg>}
                        label="Home Price" value={fmtK(price)} />
                    <Tile icon={<svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="1.8" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75"/></svg>}
                        label="Down Payment" value={`${downPct}% · ${fmtK(downAmt)}`} />
                    <Tile icon={<svg viewBox="0 0 24 24" fill="none" stroke="#3d8bff" strokeWidth="1.8" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"/></svg>}
                        label="Rate (APR)" value={`${rate.toFixed(2)}%`} />
                    <Tile icon={<svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
                        label="Loan Term" value={`${termYrs} yr fixed`} />
                </div>
            </div>

            {/* County limit status band */}
            <div className={`chb-band chb-band--${limitStatus}`}>
                <div className="chb-band-left">
                    <span className="chb-badge">{limitBadge}</span>
                    <span className="chb-band-desc" dangerouslySetInnerHTML={{ __html: limitDesc.replace(fmt$(loanAmt), `<strong>${fmt$(loanAmt)}</strong>`) }} />
                </div>
                <div className="chb-band-loc">
                    {countyName && <span className="chb-band-county">{toTitle(countyName)} Co.</span>}
                    2026 limit<span className="chb-band-lval">{fmt$(limitVal)}{limitStatus === 'exceeds' ? ' max' : ''}</span>
                </div>
            </div>

            {/* Payment hero */}
            <div className="chb-hero">
                <div className="chb-hero-label">Estimated Monthly PITI</div>
                <div className="chb-hero-amount">
                    {fmt$(total)}<span className="chb-hero-mo">/mo</span>
                </div>
                <div className="chb-hero-sub">
                    {pmi > 0 ? 'P&I + Tax + Insurance + PMI' : `P&I + Tax + Insurance · No PMI at ${downPct}% down`}
                </div>
                <div className="chb-hero-grid">
                    <div className="chb-hero-stat">
                        <div className="chb-hero-sl">Loan Amount</div>
                        <div className="chb-hero-sv">{fmt$(loanAmt)}</div>
                    </div>
                    <div className="chb-hero-stat">
                        <div className="chb-hero-sl">LTV</div>
                        <div className="chb-hero-sv">{ltv.toFixed(1)}%</div>
                    </div>
                    <div className="chb-hero-stat">
                        <div className="chb-hero-sl">Total Interest ({termYrs}yr)</div>
                        <div className="chb-hero-sv">{fmt$(totalInt)}</div>
                    </div>
                </div>
            </div>

            {/* PMI warning */}
            {pmi > 0 && (
                <div className="chb-pmi">
                    <span className="chb-pmi-icon">⚠</span>
                    <span className="chb-pmi-text">
                        <strong>PMI applies</strong> at {ltv.toFixed(1)}% LTV. Estimated {fmt$(pmi)}/mo added to payment.
                        Drops off automatically once you reach 80% LTV (~{fmt$(price * 0.8)} balance).
                    </span>
                </div>
            )}

            {/* Breakdown accordion */}
            <div className="chb-bkd">
                <button className="chb-bkd-toggle" onClick={() => setBkdOpen(o => !o)}>
                    <span className="chb-bkd-label">⊞ &nbsp;Full payment breakdown</span>
                    <span className={`chb-bkd-chev${bkdOpen ? ' open' : ''}`}>▴</span>
                </button>
                {bkdOpen && (
                    <div className="chb-bkd-body">
                        <KVRow k="Monthly Payment" section />
                        <KVRow k="Principal &amp; Interest" v={fmt$(pi)} />
                        <KVRow k="Property Taxes" v={fmt$(tax)} />
                        <KVRow k="Home Insurance" v={fmt$(ins)} />
                        <KVRow k="PMI" v={pmi > 0 ? fmt$(pmi) : 'None (≥20% down)'} red={pmi > 0} />
                        <KVRow k="Est. Total PITI" v={`${fmt$(total)}/mo`} green total />

                        <KVRow k="Loan Structure" section />
                        <KVRow k="Purchase Price" v={fmt$(price)} />
                        <KVRow k="Down Payment" v={fmt$(downAmt)} />
                        <KVRow k="Loan Amount" v={fmt$(loanAmt)} />
                        <KVRow k="LTV Ratio" v={`${ltv.toFixed(1)}%`} />

                        <KVRow k="Long-Term Cost" section />
                        <KVRow k="Total of Payments" v={fmt$(totalPmts)} />
                        <KVRow k="Total Interest Paid" v={fmt$(totalInt)} red />
                    </div>
                )}
            </div>

            {/* Slider Drawer Trigger */}
            <button className={`chb-slider-trigger${sliderOpen ? ' open' : ''}`} onClick={() => setSliderOpen(o => !o)}>
                <div className="chb-trigger-left">
                    <span style={{ fontSize: 15 }}>⚙</span>
                    <div>
                        <div className="chb-trigger-title">Adjust Your Numbers</div>
                        {isDirty && <div className="chb-trigger-sub">● Changes pending</div>}
                    </div>
                </div>
                <span className="chb-trigger-arrow">{sliderOpen ? '▲ Close' : '▼ Open'}</span>
            </button>
            <div className={`chb-drawer${sliderOpen ? ' open' : ''}`}>
            {/* White Payment Explorer */}
            <div className="chb-explorer">
                <div className="chb-exp-title">Payment Explorer</div>

                {/* County / Location */}
                <div className="chb-loc-row">
                    <div className="chb-loc-header">
                        <span className="chb-loc-label">County / Location</span>
                        {locMatched && <span className="chb-loc-matched">{locMatched}</span>}
                    </div>
                    <div className="chb-loc-wrap">
                        <span className="chb-loc-pin">📍</span>
                        <input
                            type="text"
                            className="chb-loc-input"
                            value={locInput}
                            placeholder="Type county or city (e.g. Los Angeles, Irvine, San Diego…)"
                            list="chb-county-list"
                            onChange={e => onLocInput(e.target.value)}
                        />
                        <datalist id="chb-county-list">
                            {Object.keys(CA_LIMITS).map(c => (
                                <option key={c} value={toTitle(c) + ' County'} />
                            ))}
                            {Object.keys(CITY_TO_COUNTY).map(city => (
                                <option key={city} value={toTitle(city)} />
                            ))}
                        </datalist>
                    </div>
                    <div className="chb-loc-hint">{locHint}</div>
                </div>

                {/* Home Price */}
                <SliderField
                    label="Home Price"
                    value={price}
                    min={100000} max={3000000} step={5000}
                    onChange={setPrice}
                    format={v => fmt$(v)}
                    minLabel="$100k" maxLabel="$3M"
                    trackColor="#00e87a" theme="light"
                />

                {/* Down Payment */}
                <SliderField
                    label="Down Payment"
                    value={downPct}
                    min={3} max={50} step={1}
                    onChange={setDownPct}
                    format={v => `${v}% · ${fmt$(price * v / 100)}`}
                    minLabel="3%" maxLabel="50%"
                    trackColor="#00e87a" theme="light"
                />
                <div className="chb-dp-chips">
                    {DP_CHIPS.map(pct => (
                        <button
                            key={pct}
                            className={`chb-dp-chip${downPct === pct ? ' active' : ''}`}
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
                <div className="chb-exp-term-label">Loan Term</div>
                <div className="chb-terms">
                    {([15, 20, 30] as const).map(yr => (
                        <button
                            key={yr}
                            className={`chb-term${termYrs === yr ? ' chb-term--on' : ''}`}
                            onClick={() => setTermYrs(yr)}
                        >{yr}yr</button>
                    ))}
                </div>

                {/* Stats bar */}
                <div className="chb-exp-stats">
                    <div className="chb-exp-stat">
                        <div className="chb-exp-stat-label">Loan Amount</div>
                        <div className="chb-exp-stat-val">{fmt$(loanAmt)}</div>
                    </div>
                    <div className="chb-exp-stat">
                        <div className="chb-exp-stat-label">LTV</div>
                        <div className="chb-exp-stat-val">{ltv.toFixed(1)}%</div>
                    </div>
                    <div className="chb-exp-stat">
                        <div className="chb-exp-stat-label">Total Interest</div>
                        <div className="chb-exp-stat-val">{fmt$(totalInt)}</div>
                    </div>
                    <div className="chb-exp-stat">
                        <div className="chb-exp-stat-label">Monthly PMI</div>
                        <div className="chb-exp-stat-val" style={{ color: pmi > 0 ? '#f59e0b' : '#94a3b8' }}>
                            {pmi > 0 ? fmt$(pmi) + '/mo' : 'None'}
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="chb-exp-actions">
                    <button className="chb-btn-vault" onClick={handleVault}>
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
                    <button className="chb-btn-match" onClick={() => router.push(getMatchedUrl())}>
                        Get Matched →
                    </button>
                </div>
            </div>
            {/* Drawer CTA — dark bg, outside white section */}
            <div className="chb-drawer-cta">
                {drawerPhase === 'idle' && !isDirty && <span className="chb-drawer-hint">Drag sliders to model a new scenario</span>}
                {drawerPhase === 'idle' && isDirty && <button className="chb-drawer-run" onClick={handleDrawerRun}>▶ Run Adjusted Scenario →</button>}
                {drawerPhase === 'running' && <span className="chb-drawer-hint">Calculating…</span>}
                {drawerPhase === 'done' && <span className="chb-drawer-done">✓ Numbers Updated</span>}
            </div>
            </div>

            {/* Share button */}
            <div className="chb-share-row">
                <button className="chb-btn-share" onClick={() => {
                    if (navigator.share) {
                        navigator.share({ title: 'My Purchase Payment', url: window.location.href });
                    } else {
                        navigator.clipboard.writeText(window.location.href);
                    }
                }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"/>
                    </svg>
                    Share this answer
                </button>
            </div>

            {/* Income qualify chip */}
            {props.onRunScenario && (
                <div className="chb-followup-row">
                    <button
                        className="chb-followup-chip"
                        onClick={() => {
                            const prStr = price >= 1_000_000 ? `$${(price / 1_000_000).toFixed(1)}M` : `$${Math.round(price / 1000)}k`;
                            props.onRunScenario!(
                                `What income do I need to qualify for a ${prStr} conventional loan with ${downPct}% down at ${rate.toFixed(2)}%?`,
                                { isIncomeQualify: true, purchasePrice: price, downPaymentPct: downPct, annualRatePct: rate, loanType: 'conventional' }
                            );
                        }}
                    >
                        What income do I need to qualify? →
                    </button>
                </div>
            )}

            {/* Check a property */}
            <div className="chb-property-row">
                <button
                    className="chb-btn-property"
                    onClick={() => {
                        const p = new URLSearchParams({
                            price:   String(Math.round(price)),
                            dp:      String(downPct),
                            rate:    rate.toFixed(3),
                            term:    String(termYrs),
                            lt:      'conventional',
                            taxRate: props.taxRate.toFixed(5),
                            insRate: props.insRate.toFixed(5),
                        });
                        router.push(`/check-property?${p.toString()}`);
                    }}
                >
                    Check a property →
                </button>
            </div>

            {/* Rate note */}
            <div className="chb-rate-note">
                <span className="chb-bulb">💡</span>
                <p>
                    <strong>Assumption:</strong> Rate seeded at <strong>{props.rate.toFixed(2)}%</strong> (FRED 30-yr fixed, live).
                    Actual rate depends on credit score, lender, and lock timing. Use the slider above to model different rates.
                </p>
            </div>

            {/* Disclosures */}
            <div className="chb-disc">
                <p>
                    <strong>Educational estimates only.</strong> These figures are for planning purposes and are not a Loan Estimate,
                    pre-approval, or commitment to lend under RESPA/TRID. Monthly payment includes principal &amp; interest,
                    estimated property tax ({(props.taxRate * 100).toFixed(1)}% annual), homeowner&apos;s insurance ({(props.insRate * 100).toFixed(1)}% annual),
                    and PMI where LTV exceeds 80%. Conforming loan limits per FHFA 2026 guidelines — county-specific limits may vary.
                    Actual terms depend on creditworthiness, property type, and lender.
                </p>
            </div>

            <DiscoverDock
                loanType="conventional"
                scenario={{
                    price,
                    loanAmount: loanAmt,
                    downPct,
                    rate,
                    term: termYrs,
                    ltv: loanAmt / price,
                    monthlyPayment: total,
                    monthlyPMI: pmi > 0 ? pmi : undefined,
                }}
            />

            {/* ── Styles ── */}
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

                /* topbar */
                .chb-topbar { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.02); }
                .chb-topbar-l { display:flex; align-items:center; gap:6px; }
                .chb-dot { width:7px; height:7px; border-radius:50%; background:#00e87a; }
                .chb-tl { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#6b7a99; }
                .chb-tr { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#3a4560; }

                /* summary */
                .chb-sum { padding:16px 16px 0; }
                .chb-sum-head { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
                .chb-sum-icon { width:32px; height:32px; border-radius:9px; background:rgba(0,232,122,0.1); display:flex; align-items:center; justify-content:center; flex-shrink:0; color:#00e87a; }
                .chb-sum-title { font-size:15px; font-weight:700; color:#f0f4ff; }
                .chb-sum-sub   { font-size:11px; color:#6b7a99; margin-top:1px; }
                .chb-tiles { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-bottom:14px; }
                .chb-tile { background:#141b28; border-radius:10px; padding:10px 8px 8px; text-align:center; }
                .chb-tile-icon { margin-bottom:5px; display:flex; justify-content:center; }
                .chb-tile-label { font-size:10px; color:#6b7a99; margin-bottom:3px; }
                .chb-tile-value { font-size:12px; font-weight:700; color:#f0f4ff; }

                /* limit band */
                .chb-band { margin:0 12px 12px; border-radius:10px; padding:10px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
                .chb-band--conforming { background:rgba(0,232,122,0.05); border:1px solid rgba(0,232,122,0.15); }
                .chb-band--highbal    { background:rgba(251,191,36,0.05); border:1px solid rgba(251,191,36,0.2); }
                .chb-band--exceeds    { background:rgba(239,68,68,0.05); border:1px solid rgba(239,68,68,0.2); }
                .chb-band-left { display:flex; align-items:center; gap:10px; }
                .chb-badge { font-size:9px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; padding:3px 10px; border-radius:20px; flex-shrink:0; }
                .chb-band--conforming .chb-badge { background:rgba(0,232,122,0.12); color:#00e87a; border:1px solid rgba(0,232,122,0.25); }
                .chb-band--highbal    .chb-badge { background:rgba(251,191,36,0.12); color:#fbbf24; border:1px solid rgba(251,191,36,0.25); }
                .chb-band--exceeds    .chb-badge { background:rgba(239,68,68,0.12); color:#ef4444; border:1px solid rgba(239,68,68,0.25); }
                .chb-band-desc { font-size:11px; color:#8fa3b8; line-height:1.4; }
                .chb-band-desc strong { color:#f0f4ff; }
                .chb-band-loc { font-size:10px; color:#3a4560; flex-shrink:0; text-align:right; }
                .chb-band-county { display:block; font-size:11px; color:#6b7a99; font-weight:600; margin-bottom:2px; }
                .chb-band-lval { display:block; font-size:11px; color:#6b7a99; font-weight:600; }

                /* payment hero */
                .chb-hero { margin:0 12px 12px; background:#0e1420; border:1px solid rgba(0,232,122,0.2); border-radius:12px; padding:16px; }
                .chb-hero-label { font-size:10px; font-weight:700; color:#3a4560; text-transform:uppercase; letter-spacing:.08em; margin-bottom:6px; }
                .chb-hero-amount { font-size:32px; font-weight:800; color:#00e87a; letter-spacing:-.5px; line-height:1; }
                .chb-hero-mo { font-size:16px; font-weight:600; color:#6b7a99; }
                .chb-hero-sub { font-size:11px; color:#6b7a99; margin-top:4px; }
                .chb-hero-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:0; margin-top:14px; border-top:1px solid rgba(255,255,255,0.05); padding-top:12px; }
                .chb-hero-stat { text-align:center; padding:0 8px; border-right:1px solid rgba(255,255,255,0.05); }
                .chb-hero-stat:last-child { border-right:none; }
                .chb-hero-sl { font-size:9px; color:#3a4560; text-transform:uppercase; letter-spacing:.06em; font-weight:600; margin-bottom:4px; }
                .chb-hero-sv { font-size:13px; font-weight:700; color:#f0f4ff; }

                /* PMI warning */
                .chb-pmi { margin:0 12px 12px; background:rgba(251,191,36,0.04); border:1px solid rgba(251,191,36,0.12); border-radius:8px; padding:9px 14px; display:flex; gap:8px; align-items:flex-start; }
                .chb-pmi-icon { font-size:13px; flex-shrink:0; margin-top:1px; color:#fbbf24; }
                .chb-pmi-text { font-size:11px; color:#8fa3b8; line-height:1.5; }
                .chb-pmi-text strong { color:#fbbf24; }

                /* breakdown accordion */
                .chb-bkd { margin:0 12px 12px; background:#0e1420; border:1px solid rgba(255,255,255,0.07); border-radius:10px; overflow:hidden; }
                .chb-bkd-toggle { display:flex; align-items:center; justify-content:space-between; width:100%; padding:11px 14px; cursor:pointer; background:transparent; border:none; font-family:inherit; }
                .chb-bkd-toggle:hover { background:rgba(255,255,255,0.02); }
                .chb-bkd-label { font-size:12px; font-weight:600; color:#8fa3b8; }
                .chb-bkd-chev { font-size:10px; color:#3a4560; transition:transform .2s; }
                .chb-bkd-chev.open { transform:rotate(0deg); }
                .chb-bkd-chev:not(.open) { transform:rotate(180deg); }
                .chb-bkd-body { border-top:1px solid rgba(255,255,255,0.05); padding:12px 14px; }
                .chb-kv { display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.03); }
                .chb-kv:last-child { border-bottom:none; }
                .chb-kv--total { border-top:1px solid rgba(255,255,255,0.07); border-bottom:none; margin-top:4px; padding-top:8px; }
                .chb-kv--total .chb-kv-k { font-weight:700; color:#f0f4ff; }
                .chb-kv-k { font-size:12px; color:#8fa3b8; }
                .chb-kv-v { font-size:12px; font-weight:600; color:#f0f4ff; }
                .chb-kv-v--green { color:#00e87a; font-size:13px; }
                .chb-kv-v--red   { color:#fbbf24; }
                .chb-kv-s { font-size:9px; font-weight:800; color:#3a4560; text-transform:uppercase; letter-spacing:.1em; margin:12px 0 6px; }
                .chb-kv-s:first-child { margin-top:0; }

                /* white explorer */
                .chb-explorer { border-top:1px solid rgba(255,255,255,0.05); padding:16px 18px; background:#fff; color:#0d1117; overflow:visible; }
                .chb-exp-title { font-size:13px; font-weight:700; color:#0d1117; margin-bottom:14px; }

                /* county lookup */
                .chb-loc-row { margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid #f1f5f9; }
                .chb-loc-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
                .chb-loc-label  { font-size:13px; font-weight:600; color:#0d1117; }
                .chb-loc-matched { font-size:11px; color:#00855c; font-weight:600; }
                .chb-loc-wrap { position:relative; }
                .chb-loc-input { width:100%; padding:9px 14px 9px 32px; border:1.5px solid #e2e8f0; border-radius:8px; font-size:13px; font-weight:500; color:#0d1117; font-family:inherit; background:#f9f9f9; outline:none; transition:border-color .15s, background .15s; }
                .chb-loc-input:focus { border-color:#00e87a; background:#f0fff8; }
                .chb-loc-pin { position:absolute; left:10px; top:50%; transform:translateY(-50%); font-size:12px; pointer-events:none; }
                .chb-loc-hint { font-size:10px; color:#94a3b8; margin-top:5px; }

                /* down payment chips */
                .chb-dp-chips { display:flex; gap:6px; flex-wrap:wrap; margin:-6px 0 12px; }
                .chb-dp-chip { padding:5px 12px; border-radius:20px; border:1.5px solid #e2e8f0; background:#f9f9f9; font-size:11px; font-weight:600; color:#64748b; cursor:pointer; font-family:inherit; transition:all .12s; }
                .chb-dp-chip.active { border-color:#00e87a; color:#065f46; background:#f0fff8; }
                .chb-dp-chip:hover:not(.active) { border-color:#94a3b8; }

                /* term buttons */
                .chb-exp-term-label { font-size:13px; font-weight:600; color:#0d1117; margin:4px 0 8px; }
                .chb-terms { display:flex; gap:8px; margin-bottom:16px; }
                .chb-term { flex:1; padding:10px 0; border-radius:8px; border:1.5px solid #e2e8f0; background:#f9f9f9; font-size:13px; font-weight:600; color:#64748b; cursor:pointer; font-family:inherit; text-align:center; transition:all .15s; }
                .chb-term--on { border-color:#00e87a; color:#065f46; background:#f0fff8; }
                .chb-term:hover:not(.chb-term--on) { border-color:#94a3b8; }

                /* stats bar */
                .chb-exp-stats { display:flex; flex-wrap:wrap; gap:8px; border-top:1px solid #eee; padding-top:12px; margin-bottom:14px; }
                .chb-exp-stat { flex:1; min-width:90px; }
                .chb-exp-stat-label { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:#999; font-weight:700; margin-bottom:3px; }
                .chb-exp-stat-val { font-size:14px; font-weight:700; color:#0d1117; }

                /* actions */
                .chb-exp-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
                .chb-btn-rerun { background:#111827; color:#f9fafb; border:none; border-radius:8px; padding:10px 18px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; flex-shrink:0; transition:background .15s; }
                .chb-btn-rerun:hover { background:#1f2937; }
                .chb-btn-vault { display:flex; align-items:center; gap:6px; background:#00e87a; color:#07100f; border:none; border-radius:8px; padding:10px 16px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; flex-shrink:0; transition:opacity .15s; }
                .chb-btn-vault:hover { opacity:.88; }
                .chb-btn-match { margin-left:auto; background:#00e87a; color:#07100f; border:none; border-radius:8px; padding:10px 20px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:opacity .15s; }
                .chb-btn-match:hover { opacity:.88; }

                /* share */
                .chb-share-row { display:flex; justify-content:flex-end; padding:0 12px 10px; }
                .chb-btn-share { display:flex; align-items:center; gap:6px; background:transparent; border:1.5px solid rgba(255,255,255,0.08); border-radius:8px; padding:7px 14px; font-size:12px; font-weight:600; color:#6b7a99; cursor:pointer; font-family:inherit; transition:all .15s; }
                .chb-btn-share:hover { border-color:rgba(255,255,255,0.18); color:#f0f4ff; }

                /* follow-up chip */
                /* check a property */
                .chb-followup-row { padding:0 12px 4px; }
                .chb-followup-chip { background:rgba(255,255,255,0.04); color:#8fa3b8; border:1.5px solid rgba(255,255,255,0.12); border-radius:8px; padding:10px 18px; font-size:13px; font-weight:600; cursor:pointer; font-family:inherit; transition:all .15s; }
                .chb-followup-chip:hover { background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.25); color:#f0f4ff; }
                .chb-property-row { padding:0 12px 10px; }
                .chb-btn-property { background:rgba(0,232,122,0.08); color:#00e87a; border:1.5px solid rgba(0,232,122,0.25); border-radius:8px; padding:10px 18px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; }
                .chb-btn-property:hover { background:rgba(0,232,122,0.15); border-color:rgba(0,232,122,0.45); }

                /* rate note */
                .chb-rate-note { margin:0 12px 12px; background:rgba(0,232,122,0.04); border:1px solid rgba(0,232,122,0.12); border-radius:10px; padding:10px 14px; display:flex; align-items:flex-start; gap:10px; }
                .chb-bulb { font-size:16px; flex-shrink:0; margin-top:1px; }
                .chb-rate-note p { font-size:12px; color:#8fa3b8; line-height:1.5; }
                .chb-rate-note strong { color:#00e87a; }

                /* disclosures */
                .chb-disc { margin:0 12px 16px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:10px; padding:12px 14px; }
                .chb-disc p { font-size:11px; color:#3a4560; line-height:1.6; }
                .chb-disc strong { color:#6b7a99; font-weight:600; }

                /* ── Slider Drawer ── */
                @keyframes chbTriggerPulse {
                    0%, 100% { box-shadow: none; }
                    50% { box-shadow: 0 0 14px rgba(0,232,122,0.08) inset; }
                }
                @keyframes chbRunPulse {
                    0%, 100% { box-shadow: none; }
                    50% { box-shadow: 0 0 20px rgba(0,232,122,0.22); }
                }
                .chb-slider-trigger {
                    width:100%; display:flex; align-items:center; justify-content:space-between; gap:12px;
                    padding:13px 18px; background:transparent; border:none;
                    border-top:1px solid rgba(0,232,122,0.12);
                    cursor:pointer; font-family:inherit; position:relative; overflow:hidden;
                    transition:background 0.2s, border-color 0.2s;
                    animation:chbTriggerPulse 3s ease-in-out infinite;
                }
                .chb-slider-trigger:hover, .chb-slider-trigger.open {
                    background:rgba(0,232,122,0.05); border-color:rgba(0,232,122,0.3); animation:none;
                }
                .chb-trigger-left { display:flex; align-items:center; gap:10px; text-align:left; }
                .chb-trigger-title { font-size:13px; font-weight:700; color:#00e87a; }
                .chb-trigger-sub { font-size:10px; color:rgba(0,232,122,0.6); margin-top:1px; }
                .chb-trigger-arrow { font-size:11px; color:rgba(0,232,122,0.55); flex-shrink:0; }
                .chb-drawer { max-height:0; overflow:hidden; transition:max-height 0.4s cubic-bezier(0.4,0,0.2,1); }
                .chb-drawer.open { max-height:900px; }
                .chb-drawer-cta { padding:12px 18px; background:#0d1117; }
                .chb-drawer-hint { font-size:12px; color:rgba(148,163,184,0.4); display:block; text-align:center; padding:8px 0; }
                .chb-drawer-done { font-size:13px; color:#00e87a; display:block; text-align:center; font-weight:600; padding:10px 0; }
                .chb-drawer-run {
                    width:100%; padding:13px 18px;
                    background:rgba(0,232,122,0.08); border:1.5px solid rgba(0,232,122,0.38);
                    border-radius:10px; color:#00e87a; font-size:14px; font-weight:700;
                    cursor:pointer; font-family:inherit; transition:all 0.15s;
                    animation:chbRunPulse 1.8s ease-in-out infinite;
                }
                .chb-drawer-run:hover { background:rgba(0,232,122,0.16); animation:none; }

                @media (max-width: 480px) {
                    .chb-tiles { grid-template-columns:repeat(2,1fr); }
                    .chb-hero-amount { font-size:26px; }
                    .chb-hero-grid { grid-template-columns:repeat(3,1fr); }
                }
                @media (max-width: 640px) {
                    .chb-exp-actions { flex-direction:column; gap:8px; }
                    .chb-exp-actions button,.chb-exp-actions a { width:100%; justify-content:center; text-align:center; margin-left:0; display:flex; }
                    .chb-share-row { justify-content:stretch; }
                    .chb-btn-share { width:100%; justify-content:center; }
                    .chb-followup-row,.chb-property-row { padding-left:0; padding-right:0; }
                    .chb-followup-chip,.chb-btn-property { width:100%; text-align:center; display:block; }
                }
            `}</style>

        </div>
    );
}
