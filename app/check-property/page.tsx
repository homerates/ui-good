'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import AppNav from '@/components/AppNav';

// ── Math ──────────────────────────────────────────────────────────────────────

function calcPI(principal: number, annualRate: number, termYears: number): number {
    if (principal <= 0) return 0;
    if (annualRate <= 0) return principal / (termYears * 12);
    const r = annualRate / 100 / 12;
    const n = termYears * 12;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function loanBalanceAfter(principal: number, annualRate: number, totalMonths: number, k: number): number {
    if (principal <= 0 || annualRate <= 0) return principal;
    const r  = annualRate / 100 / 12;
    const rk = Math.pow(1 + r, k);
    const rn = Math.pow(1 + r, totalMonths);
    return principal * (rn - rk) / (rn - 1);
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmt$(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtK(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2).replace(/\.?0+$/, '')}M`;
    if (n >= 100_000)   return `$${Math.round(n / 1_000)}k`;
    return fmt$(n);
}
function pct(n: number, decimals = 1) { return `${n.toFixed(decimals)}%`; }

// ── Types ─────────────────────────────────────────────────────────────────────

interface Scenario {
    price:   number;
    dp:      number;
    rate:    number;
    term:    number;
    lt:      'conventional' | 'fha' | 'jumbo';
    taxRate: number;
    insRate: number;
}

interface PropData {
    price?:               number | null;
    address?:             string | null;
    city?:                string | null;
    state?:               string | null;
    zip?:                 string | null;
    beds?:                number | null;
    baths?:               number | null;
    sqft?:                number | null;
    yearBuilt?:           number | null;
    propertyType?:        string | null;
    annualTaxes?:         number | null;
    taxRateEffective?:    number | null;
    taxSource?:           string | null;
    estimatedValue?:      number | null;
    estimatedValueLow?:   number | null;
    estimatedValueHigh?:  number | null;
    listingStatus?:       string | null;
    lastSalePrice?:       number | null;
    lastSaleDate?:        string | null;
    hoaMonthly?:          number | null;
    photoUrl?:            string | null;
    source?:              string | null;
}

// ── Theme ─────────────────────────────────────────────────────────────────────

const THEME = {
    jumbo:        { accent: '#8b5cf6', accentFaint: 'rgba(139,92,246,0.12)', accentBorder: 'rgba(139,92,246,0.25)', label: 'Jumbo' },
    fha:          { accent: '#f59e0b', accentFaint: 'rgba(245,158,11,0.12)',  accentBorder: 'rgba(245,158,11,0.25)',  label: 'FHA' },
    conventional: { accent: '#3d8bff', accentFaint: 'rgba(61,139,255,0.12)',  accentBorder: 'rgba(61,139,255,0.25)',  label: 'Conventional' },
};

// ── Closing cost rates by loan type ───────────────────────────────────────────

const CLOSING_PCT: Record<string, number> = { jumbo: 0.020, fha: 0.030, conventional: 0.025 };

// ── Inner page (needs useSearchParams) ───────────────────────────────────────

function CheckPropertyInner() {
    const sp     = useSearchParams()!;
    const router = useRouter();

    const sc: Scenario = {
        price:   Number(sp?.get('price') ?? 0) || 500_000,
        dp:      Number(sp?.get('dp')    ?? 0) || 20,
        rate:    Number(sp?.get('rate')  ?? 0) || 6.5,
        term:    Number(sp?.get('term')  ?? 0) || 30,
        lt:      (sp?.get('lt') as Scenario['lt']) || 'conventional',
        taxRate: Number(sp?.get('taxRate') ?? 0) || 0.011,
        insRate: Number(sp?.get('insRate') ?? 0) || 0.003,
    };

    const theme = THEME[sc.lt];

    const [address,   setAddress]   = useState('');
    const [loading,   setLoading]   = useState(false);
    const [propData,  setPropData]  = useState<PropData | null>(null);
    const [lookupErr, setLookupErr] = useState<string | null>(null);
    const [resolved,  setResolved]  = useState('');

    async function handleLookup() {
        const raw = address.trim();
        if (!raw) return;
        setLoading(true);
        setLookupErr(null);
        setPropData(null);
        try {
            const isUrl = /^https?:\/\/|redfin\.com|zillow\.com|realtor\.com|trulia\.com/i.test(raw);
            const res = await fetch('/api/property/lookup', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(isUrl ? { url: raw } : { address: raw }),
            });
            const json = await res.json();
            if (!json.ok || !json.data) { setLookupErr('Could not load property data — try a different address or paste a Redfin link.'); }
            else { setPropData(json.data); setResolved(json.data.address ?? raw); }
        } catch { setLookupErr('Network error — please try again.'); }
        finally  { setLoading(false); }
    }

    // ── Derived scenario numbers (estimated, before real data) ───────────────

    const loanAmt   = sc.price * (1 - sc.dp / 100);
    const estPI     = calcPI(loanAmt, sc.rate, sc.term);
    const estTax    = (sc.price * sc.taxRate) / 12;
    const estIns    = (sc.price * sc.insRate) / 12;
    const estPITI   = estPI + estTax + estIns;

    // ── Real numbers (after property data loaded) ────────────────────────────

    const listPrice    = propData?.price ?? sc.price;
    const avm          = propData?.estimatedValue ?? null;
    const realAnnTax   = propData?.annualTaxes ?? (propData?.taxRateEffective ? sc.price * propData.taxRateEffective : null);
    const realMonthTax = realAnnTax ? realAnnTax / 12 : estTax;
    const hoaMonthly   = propData?.hoaMonthly ?? 0;
    const realPITI     = estPI + realMonthTax + estIns + hoaMonthly;
    const realIncome43 = Math.round((realPITI / 0.43) * 12);
    const realIncome38 = Math.round((realPITI / 0.38) * 12);

    // ── Cash to close ────────────────────────────────────────────────────────

    const downAmt      = sc.price * sc.dp / 100;
    const closingPct   = CLOSING_PCT[sc.lt];
    const closingAmt   = Math.round(sc.price * closingPct);
    const prepaidEscrow = Math.round((realMonthTax + estIns) * 3);
    const reserves6mo  = Math.round(realPITI * 6);
    const reserves12mo = Math.round(realPITI * 12);
    const totalClose   = downAmt + closingAmt + prepaidEscrow;
    const totalLiquid  = totalClose + (sc.lt === 'jumbo' ? reserves6mo : 0);

    // ── 5yr / 10yr ownership cost ────────────────────────────────────────────

    function ownershipCost(years: number) {
        const months   = years * 12;
        const balAfter = loanBalanceAfter(loanAmt, sc.rate, sc.term * 12, months);
        const equityBuilt = loanAmt - balAfter;
        const piPaid  = estPI * months;
        const taxPaid = realMonthTax * months;
        const insPaid = estIns * months;
        const hoaPaid = hoaMonthly * months;
        const totalPaid = downAmt + piPaid + taxPaid + insPaid + hoaPaid + closingAmt;
        const netCost   = totalPaid - equityBuilt;
        return { equityBuilt, piPaid, taxPaid, insPaid, hoaPaid, totalPaid, netCost, months };
    }

    const oc5  = ownershipCost(5);
    const oc10 = ownershipCost(10);

    // ── AVM badge ────────────────────────────────────────────────────────────

    function avmBadge() {
        if (!avm) return null;
        const diff = ((listPrice - avm) / avm) * 100;
        if (Math.abs(diff) < 2) return { text: 'At market value', color: '#00e87a' };
        if (diff > 0) return { text: `${diff.toFixed(1)}% above AVM — negotiate`, color: '#f59e0b' };
        return { text: `${Math.abs(diff).toFixed(1)}% below AVM — good value`, color: '#00e87a' };
    }

    const badge = avm ? avmBadge() : null;

    // ── Get Matched URL ──────────────────────────────────────────────────────

    function getMatchedUrl() {
        const p = new URLSearchParams({
            from: 'check-property', lt: theme.label, purpose: 'Purchase',
            price: String(Math.round(sc.price)),
            dp:    String(sc.dp),
            monthly: String(Math.round(realPITI)),
            rate:  String(sc.rate),
            term:  String(sc.term),
            ...(resolved ? { address: resolved } : {}),
        });
        return `/connect/post?${p.toString()}`;
    }

    return (
        <>
        <style>{`
            body:has(.ps-root){display:block!important;height:auto!important;overflow:visible!important;}
            html:has(.ps-root){height:auto!important;overflow:visible!important;}
            body:has(.ps-root) .app-footer{display:none!important;}
            .ps-root{min-height:100vh;width:100%;background:#080c12;color:#f0f4ff;font-family:system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;overflow-x:hidden;box-sizing:border-box;}
            .ps-root *{box-sizing:border-box;}
            .cp-header{position:sticky;top:0;z-index:50;width:100%;background:rgba(8,12,18,0.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,0.06);}
            .cp-header-inner{max-width:720px;margin:0 auto;padding:0 20px;height:52px;display:flex;align-items:center;justify-content:space-between;}
            .cp-logo{height:24px;width:auto;display:block;}
            .cp-body{width:100%;max-width:720px;padding:24px 20px 80px;}
        `}</style>
        <div className="ps-root">
            <header className="cp-header">
                <div className="cp-header-inner">
                    <Link href="/">
                        <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" className="cp-logo" />
                    </Link>
                    <AppNav drawerOnly />
                </div>
            </header>
        <div className="cp-body">

            {/* ── Page title ─────────────────────────────────────────────── */}
            <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#4b6080', marginBottom: 6 }}>
                    Property Discovery
                </div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#f0f4ff', letterSpacing: '-0.5px' }}>
                    Run your numbers on a specific property
                </h1>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7a99', lineHeight: 1.5 }}>
                    Drop in an address or Redfin/Zillow link. We pull the real tax data and show you the full picture — before you talk to anyone.
                </p>
            </div>

            {/* ── Scenario lock bar ──────────────────────────────────────── */}
            <div style={{ background: theme.accentFaint, border: `1px solid ${theme.accentBorder}`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: theme.accent, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: theme.accent, marginBottom: 2 }}>
                        Your Scenario · {theme.label}
                    </div>
                    <div style={{ fontSize: 13, color: '#c4cfe0', fontWeight: 600 }}>
                        {fmtK(sc.price)} · {sc.dp}% down · {sc.rate.toFixed(2)}% · {sc.term}yr · Est. {fmt$(Math.round(estPITI))}/mo
                    </div>
                </div>
                <button
                    onClick={() => router.back()}
                    style={{ fontSize: 12, color: '#4b6080', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                >
                    ← Back
                </button>
            </div>

            {/* ── Address input ──────────────────────────────────────────── */}
            <div style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#c4cfe0', marginBottom: 10 }}>
                    Property address or listing URL
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <AddressAutocomplete
                        value={address}
                        onChange={setAddress}
                        onSelect={v => { setAddress(v); }}
                        placeholder="123 Main St, Los Angeles, CA 90001  —  or paste a Redfin / Zillow URL"
                        style={{
                            flex: 1, background: '#0a0f1a', border: '1.5px solid rgba(255,255,255,0.1)',
                            borderRadius: 9, padding: '11px 14px', fontSize: 13, color: '#f0f4ff',
                            fontFamily: 'inherit', outline: 'none',
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') handleLookup(); }}
                    />
                    <button
                        onClick={handleLookup}
                        disabled={loading || !address.trim()}
                        style={{
                            background: theme.accent, color: '#fff', border: 'none', borderRadius: 9,
                            padding: '11px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                            fontFamily: 'inherit', opacity: (loading || !address.trim()) ? 0.5 : 1,
                            whiteSpace: 'nowrap', transition: 'opacity .15s',
                        }}
                    >
                        {loading ? 'Looking up…' : 'Run Numbers'}
                    </button>
                </div>
                {lookupErr && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#f87171', lineHeight: 1.4 }}>
                        {lookupErr}
                    </div>
                )}
                <div style={{ marginTop: 8, fontSize: 11, color: '#3a4560', lineHeight: 1.4 }}>
                    Supports any street address · Redfin · Zillow · Realtor.com links
                </div>
            </div>

            {/* ── Loading state ───────────────────────────────────────────── */}
            {loading && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#4b6080', fontSize: 14 }}>
                    <div style={{ fontSize: 28, marginBottom: 12 }}>🔍</div>
                    Pulling property data, tax records, and AVM…
                </div>
            )}

            {/* ── Results ─────────────────────────────────────────────────── */}
            {propData && !loading && (
                <>
                    {/* ① Property snapshot */}
                    <Section title="Property Snapshot" icon="🏡">
                        {resolved && (
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#c4cfe0', marginBottom: 12 }}>
                                {resolved}
                            </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 12 }}>
                            {propData.beds    && <StatTile label="Beds"      value={String(propData.beds)} />}
                            {propData.baths   && <StatTile label="Baths"     value={String(propData.baths)} />}
                            {propData.sqft    && <StatTile label="Sq Ft"     value={propData.sqft.toLocaleString()} />}
                            {propData.yearBuilt && <StatTile label="Year Built" value={String(propData.yearBuilt)} />}
                            {propData.sqft    && <StatTile label="$/sq ft"   value={`$${Math.round(sc.price / propData.sqft)}`} />}
                            {propData.listingStatus && <StatTile label="Status" value={propData.listingStatus.replace('_', ' ')} />}
                        </div>
                        {avm && (
                            <div style={{ background: '#0a0f1a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                                    <div>
                                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#3a4560', marginBottom: 3 }}>AVM Estimate</div>
                                        <div style={{ fontSize: 20, fontWeight: 800, color: '#f0f4ff' }}>{fmtK(avm)}</div>
                                        {propData.estimatedValueLow && propData.estimatedValueHigh && (
                                            <div style={{ fontSize: 11, color: '#4b6080', marginTop: 2 }}>
                                                Range: {fmtK(propData.estimatedValueLow)} – {fmtK(propData.estimatedValueHigh)}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#3a4560', marginBottom: 3 }}>List Price</div>
                                        <div style={{ fontSize: 20, fontWeight: 800, color: '#f0f4ff' }}>{fmtK(listPrice)}</div>
                                    </div>
                                    {badge && (
                                        <div style={{ fontSize: 12, fontWeight: 700, color: badge.color, alignSelf: 'flex-end', paddingBottom: 2 }}>
                                            {badge.text}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {propData.lastSalePrice && (
                            <div style={{ marginTop: 8, fontSize: 12, color: '#4b6080' }}>
                                Last sold: {propData.lastSaleDate ?? '—'}  for {fmtK(propData.lastSalePrice)}
                                {propData.lastSalePrice ? ` · ${pct(((sc.price - propData.lastSalePrice) / propData.lastSalePrice) * 100, 1)} ${sc.price >= propData.lastSalePrice ? 'appreciation' : 'discount vs last sale'}` : ''}
                            </div>
                        )}
                    </Section>

                    {/* ② Real numbers */}
                    <Section title="Your Real Numbers" icon="📊" accent={theme.accent}>
                        <div style={{ background: theme.accentFaint, border: `1px solid ${theme.accentBorder}`, borderRadius: 12, padding: '16px 18px', marginBottom: 12 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: theme.accent, marginBottom: 6 }}>
                                Updated PITI — with real tax data
                            </div>
                            <div style={{ fontSize: 36, fontWeight: 800, color: theme.accent, letterSpacing: '-1px' }}>
                                {fmt$(Math.round(realPITI))}<span style={{ fontSize: 16, fontWeight: 600, color: '#6b7a99' }}>/mo</span>
                            </div>
                            {realAnnTax && (
                                <div style={{ fontSize: 12, color: '#8fa3b8', marginTop: 6 }}>
                                    Real annual tax: {fmt$(Math.round(realAnnTax))} ({propData.taxSource ?? 'estimate'})
                                    {realAnnTax !== sc.price * sc.taxRate && (
                                        <span style={{ color: Math.abs(realAnnTax - sc.price * sc.taxRate) > 500 ? '#f59e0b' : '#6b7a99', marginLeft: 8 }}>
                                            {realAnnTax > sc.price * sc.taxRate
                                                ? `▲ ${fmt$(Math.round(realAnnTax - sc.price * sc.taxRate))}/yr above estimate`
                                                : `▼ ${fmt$(Math.round(sc.price * sc.taxRate - realAnnTax))}/yr below estimate`}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        <KVGrid>
                            <KV k="Principal & Interest" v={fmt$(Math.round(estPI))} />
                            <KV k={`Property Tax ${realAnnTax ? '(actual)' : '(est.)'}`} v={fmt$(Math.round(realMonthTax)) + '/mo'} highlight={!!realAnnTax} />
                            <KV k="Homeowner's Insurance" v={fmt$(Math.round(estIns)) + '/mo'} />
                            {hoaMonthly > 0 && <KV k="HOA (detected)" v={fmt$(hoaMonthly) + '/mo'} />}
                            <KV k="Total PITI" v={fmt$(Math.round(realPITI)) + '/mo'} total />
                        </KVGrid>
                        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <div style={{ background: '#0a0f1a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: '10px 12px' }}>
                                <div style={{ fontSize: 10, color: '#3a4560', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>Income @ {sc.lt === 'jumbo' ? '38%' : '43%'} DTI</div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: theme.accent }}>{fmt$(sc.lt === 'jumbo' ? realIncome38 : realIncome43)}<span style={{ fontSize: 11, fontWeight: 600, color: '#4b6080' }}>/yr</span></div>
                            </div>
                            <div style={{ background: '#0a0f1a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: '10px 12px' }}>
                                <div style={{ fontSize: 10, color: '#3a4560', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>Income @ 36% DTI</div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: '#c4cfe0' }}>{fmt$(Math.round((realPITI / 0.36) * 12))}<span style={{ fontSize: 11, fontWeight: 600, color: '#4b6080' }}>/yr</span></div>
                            </div>
                        </div>
                    </Section>

                    {/* ③ Cash to close */}
                    <Section title="Cash to Close — Day 1" icon="💰">
                        <div style={{ background: '#0a111d', border: '1px solid rgba(0,232,122,0.15)', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#00a854', marginBottom: 4 }}>Total Cash Needed at Closing</div>
                            <div style={{ fontSize: 32, fontWeight: 800, color: '#00e87a', letterSpacing: '-1px' }}>{fmtK(totalClose)}</div>
                            {sc.lt === 'jumbo' && (
                                <div style={{ fontSize: 12, color: '#4b6080', marginTop: 4 }}>
                                    Plus {fmtK(reserves6mo)} in liquid reserves = <strong style={{ color: '#c4cfe0' }}>{fmtK(totalLiquid)} total liquid</strong>
                                </div>
                            )}
                        </div>
                        <KVGrid>
                            <KV k={`Down Payment (${sc.dp}%)`} v={fmtK(downAmt)} />
                            <KV k={`Closing Costs (~${(closingPct * 100).toFixed(1)}%)`} v={fmtK(closingAmt)} />
                            <KV k="Prepaid Escrow (3mo tax+ins)" v={fmtK(prepaidEscrow)} />
                            <KV k="Total at Close" v={fmtK(totalClose)} total />
                        </KVGrid>
                        {sc.lt === 'jumbo' && (
                            <div style={{ marginTop: 10, background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.18)', borderRadius: 9, padding: '10px 14px' }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', marginBottom: 6 }}>🏦 Jumbo Reserve Requirements</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    <div>
                                        <div style={{ fontSize: 10, color: '#4b6080', marginBottom: 2 }}>6-Month Reserves</div>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: '#c4cfe0' }}>{fmtK(reserves6mo)}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: '#4b6080', marginBottom: 2 }}>12-Month Reserves</div>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: '#8b5cf6' }}>{fmtK(reserves12mo)}</div>
                                        <div style={{ fontSize: 10, color: '#4b6080' }}>for loans &gt; {fmtK(2_000_000)}</div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div style={{ marginTop: 8, fontSize: 11, color: '#3a4560', lineHeight: 1.5 }}>
                            Closing costs are estimated at {(closingPct * 100).toFixed(1)}% for {theme.label} loans — actual costs depend on lender, title company, and state. Prepaid escrow covers your initial tax and insurance setup with the lender.
                        </div>
                    </Section>

                    {/* ④ True cost of ownership */}
                    <Section title="True Cost of Ownership" icon="📈">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                            {[{ years: 5, oc: oc5 }, { years: 10, oc: oc10 }].map(({ years, oc }) => (
                                <div key={years} style={{ background: '#0a0f1a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 14px' }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#4b6080', marginBottom: 8 }}>{years}-Year Horizon</div>
                                    <div style={{ marginBottom: 6 }}>
                                        <div style={{ fontSize: 10, color: '#3a4560', marginBottom: 2 }}>Total Out of Pocket</div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: '#f0f4ff' }}>{fmtK(oc.totalPaid)}</div>
                                    </div>
                                    <div style={{ marginBottom: 6 }}>
                                        <div style={{ fontSize: 10, color: '#3a4560', marginBottom: 2 }}>Equity Built (payments)</div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#00e87a' }}>{fmtK(Math.round(oc.equityBuilt))}</div>
                                    </div>
                                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, marginTop: 4 }}>
                                        <div style={{ fontSize: 10, color: '#3a4560', marginBottom: 2 }}>Net Cost of Ownership</div>
                                        <div style={{ fontSize: 16, fontWeight: 800, color: theme.accent }}>{fmtK(Math.round(oc.netCost))}</div>
                                        <div style={{ fontSize: 10, color: '#3a4560', marginTop: 2 }}>{fmtK(Math.round(oc.netCost / years))}/yr avg</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <KVGrid>
                            <KV k="Interest paid (5yr)" v={fmtK(Math.round(oc5.piPaid - (loanAmt - loanBalanceAfter(loanAmt, sc.rate, sc.term * 12, 60))))} />
                            <KV k="Tax paid (5yr)" v={fmtK(Math.round(oc5.taxPaid))} />
                            <KV k="Interest paid (10yr)" v={fmtK(Math.round(oc10.piPaid - (loanAmt - loanBalanceAfter(loanAmt, sc.rate, sc.term * 12, 120))))} />
                            <KV k="Tax paid (10yr)" v={fmtK(Math.round(oc10.taxPaid))} />
                        </KVGrid>
                        <div style={{ marginTop: 10, fontSize: 11, color: '#3a4560', lineHeight: 1.5 }}>
                            Net cost = total out of pocket minus equity built through principal paydown. Does not assume any appreciation — equity upside from price growth is separate.
                        </div>
                    </Section>

                    {/* ── LO CTA — bottom of discovery ──────────────────── */}
                    <div style={{
                        background: '#0d1117', border: `1px solid ${theme.accentBorder}`,
                        borderRadius: 16, padding: '24px 24px 20px', marginTop: 8, textAlign: 'center',
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: theme.accent, marginBottom: 8 }}>
                            You've done your homework
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#f0f4ff', marginBottom: 6 }}>
                            Ready to lock in a rate?
                        </div>
                        <div style={{ fontSize: 13, color: '#6b7a99', lineHeight: 1.5, marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
                            You know your real PITI, cash to close, and cost of ownership. Most buyers don't walk in this prepared. Connect with a {theme.label.toLowerCase()} specialist who can run your exact scenario.
                        </div>
                        <a
                            href={getMatchedUrl()}
                            style={{
                                display: 'inline-block', background: theme.accent, color: sc.lt === 'conventional' ? '#fff' : sc.lt === 'jumbo' ? '#fff' : '#1c0f00',
                                borderRadius: 10, padding: '13px 28px', fontSize: 14, fontWeight: 700,
                                textDecoration: 'none', letterSpacing: '.02em',
                            }}
                        >
                            Get Matched with a {theme.label} Specialist →
                        </a>
                        <div style={{ marginTop: 10, fontSize: 11, color: '#3a4560' }}>
                            No commitment · Free · Your scenario is pre-loaded
                        </div>
                    </div>
                </>
            )}

            {/* empty state */}
            {!propData && !loading && (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: '#3a4560' }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>🏠</div>
                    <div style={{ fontSize: 13 }}>Enter an address above to pull real tax data and run your full scenario</div>
                </div>
            )}
        </div>
        </div>
        </>
    );
}

// ── Small reusable layout components ────────────────────────────────────────

function Section({ title, icon, accent, children }: { title: string; icon: string; accent?: string; children: React.ReactNode }) {
    return (
        <div style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 18px 16px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 16 }}>{icon}</span>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: accent ?? '#6b7a99' }}>{title}</span>
            </div>
            {children}
        </div>
    );
}

function StatTile({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 9, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: '#3a4560', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#c4cfe0' }}>{value}</div>
        </div>
    );
}

function KVGrid({ children }: { children: React.ReactNode }) {
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>{children}</div>;
}

function KV({ k, v, total, highlight }: { k: string; v: string; total?: boolean; highlight?: boolean }) {
    return (
        <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: total ? '8px 0 0' : '5px 0',
            borderTop: total ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.04)',
        }}>
            <span style={{ fontSize: 12, color: total ? '#c4cfe0' : '#6b7a99', fontWeight: total ? 700 : 400 }}>{k}</span>
            <span style={{ fontSize: 12, fontWeight: total ? 800 : 600, color: highlight ? '#00e87a' : total ? '#f0f4ff' : '#c4cfe0' }}>{v}</span>
        </div>
    );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function Page() {
    return (
        <Suspense>
            <CheckPropertyInner />
        </Suspense>
    );
}
