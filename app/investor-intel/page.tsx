'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppNav from '../components/AppNav';
import AddressAutocomplete from '../components/AddressAutocomplete';
import type { InvestorIntelResult, RentalComp } from '../api/investor-intel/route';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PropData {
  current_list_price: number | null;
  last_sold_price:    number | null;
  bedrooms:           number | null;
  bathrooms:          number | null;
  sqft:               number | null;
  year_built:         number | null;
  current_status:     string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt$ = (n: number | null | undefined, digits = 0) =>
  n != null ? '$' + Math.round(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';

const fmtPct = (n: number, digits = 1) => (n >= 0 ? '' : '') + n.toFixed(digits) + '%';

function rFactor(annualRate: number, termYrs = 30): number {
  const r = annualRate / 100 / 12;
  const n = termYrs * 12;
  if (r === 0) return 1 / n;
  return (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function calcMetrics(price: number, rent: number, downPct: number, rate: number, vacancyPct: number) {
  const loan    = price * (1 - downPct / 100);
  const pi      = loan * rFactor(rate);
  const taxMo   = (price * 0.011) / 12;
  const insMo   = (price * 0.005) / 12;
  const pitia   = pi + taxMo + insMo;
  const dscr    = pitia > 0 ? rent / pitia : 0;
  const noi     = rent * 12 * (1 - vacancyPct / 100) - price * 0.011 - price * 0.005;
  const capRate = price > 0 ? (noi / price) * 100 : 0;
  const grossYield = price > 0 ? (rent * 12 / price) * 100 : 0;
  const cashFlow = rent - pitia;
  const cashIn  = price * (downPct / 100);
  const coc     = cashIn > 0 ? (cashFlow * 12 / cashIn) * 100 : 0;
  return { loan, pi, taxMo, insMo, pitia, dscr, capRate, grossYield, cashFlow, coc };
}

function dscrColor(dscr: number): string {
  if (dscr >= 1.5)  return '#00e87a';
  if (dscr >= 1.25) return '#5edb94';
  if (dscr >= 1.0)  return '#f5c842';
  if (dscr >= 0.75) return '#ff8c42';
  return '#ff5f5f';
}

function dscrLabel(dscr: number): string {
  if (dscr >= 1.5)  return 'Excellent ≥1.5x';
  if (dscr >= 1.25) return 'Strong qualify ≥1.25x';
  if (dscr >= 1.0)  return 'Standard qualify ≥1.0x';
  if (dscr >= 0.75) return 'Min qualify ≥0.75x';
  return 'Does not qualify <0.75x';
}

function metricColor(v: number, good = true): string {
  if (good) return v >= 0 ? '#00e87a' : '#ff5f5f';
  return v >= 0 ? '#f5c842' : '#ff5f5f';
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Sk({ w, h = 14, r = 5 }: { w?: number | string; h?: number; r?: number }) {
  return (
    <span style={{
      display: 'inline-block', width: w ?? '100%', height: h,
      borderRadius: r,
      background: 'linear-gradient(90deg,#131d2e 25%,#1a2840 50%,#131d2e 75%)',
      backgroundSize: '200% 100%',
      animation: 'iiShimmer 1.5s infinite',
      verticalAlign: 'middle',
    }} />
  );
}

// ── Main inner component ───────────────────────────────────────────────────────

function InvestorIntelInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  const urlAddr = (searchParams?.get('address') ?? '').trim();

  const [inputAddr,    setInputAddr]    = useState(urlAddr);
  const [propData,     setPropData]     = useState<PropData | null>(null);
  const [rentalData,   setRentalData]   = useState<InvestorIntelResult | null>(null);
  const [price,        setPrice]        = useState(0);
  const [rent,         setRent]         = useState(0);
  const [downPct,      setDownPct]      = useState(25);
  const [rate,         setRate]         = useState(7.5);
  const [loadingProp,  setLoadingProp]  = useState(false);
  const [loadingRent,  setLoadingRent]  = useState(false);
  const [errorProp,    setErrorProp]    = useState('');
  const [errorRent,    setErrorRent]    = useState('');
  const [mapUrl,       setMapUrl]       = useState<string | null>(null);
  const [photoReady,   setPhotoReady]   = useState(false);
  const [aiExpanded,   setAiExpanded]   = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [savedPortfolio, setSavedPortfolio] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch property data — cache-only (same as /property-intel) ──────────────
  // Returns the result so runAnalysis can chain beds/type into the rental intel call.
  const fetchPropData = useCallback(async (addr: string): Promise<PropData | null> => {
    setLoadingProp(true);
    setErrorProp('');
    setPropData(null);
    setMapUrl(null);
    setPhotoReady(false);
    try {
      const res  = await fetch(`/api/beta/grok-property?address=${encodeURIComponent(addr)}`);
      const json = await res.json();
      if (json?.cached && json.result) {
        const r = json.result as PropData;
        setPropData(r);
        const p = r.current_list_price ?? r.last_sold_price ?? 0;
        if (p > 0) setPrice(p);
        if (json.map_urls?.street_view_url) setMapUrl(json.map_urls.street_view_url);
        return r;
      } else {
        setErrorProp('No cached property data — enter the purchase price manually below.');
        return null;
      }
    } catch {
      setErrorProp('Property data unavailable — enter the purchase price manually below.');
      return null;
    } finally {
      setLoadingProp(false);
    }
  }, []);

  // ── Fetch rental intel — GET cache first, POST only on miss ─────────────────
  const fetchRentalIntel = useCallback(async (addr: string, beds: number | null, propType: string) => {
    setLoadingRent(true);
    setErrorRent('');
    setRentalData(null);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const sig = abortRef.current.signal;

    const applyResult = (r: InvestorIntelResult) => {
      setRentalData(r);
      if (r.rentRangeMedian > 0) setRent(r.rentRangeMedian);
      if (r.rate > 0) setRate(r.rate);
    };

    try {
      // 1 — check cache (GET)
      const cacheRes  = await fetch(`/api/investor-intel?address=${encodeURIComponent(addr)}`, { signal: sig });
      const cacheJson = await cacheRes.json();
      if (cacheJson?.ok && cacheJson.result) {
        applyResult(cacheJson.result as InvestorIntelResult);
        setLoadingRent(false);
        return;
      }

      // 2 — cache miss → generate (POST with actual beds/type)
      const genRes  = await fetch('/api/investor-intel', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ address: addr, beds, propertyType: propType }),
        signal:  sig,
      });
      const genJson = await genRes.json();
      if (genJson?.ok && genJson.result) {
        applyResult(genJson.result as InvestorIntelResult);
      } else {
        setErrorRent(genJson.error ?? 'Rental intel unavailable — check back shortly.');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorRent('Rental market analysis unavailable.');
      }
    } finally {
      setLoadingRent(false);
    }
  }, []);

  // ── Run analysis: property data first → rental intel with actual beds/type ──
  const runAnalysis = useCallback(async (addr: string) => {
    if (!addr.trim()) return;
    router.replace(`/investor-intel?address=${encodeURIComponent(addr.trim())}`, { scroll: false });
    setRent(0);

    // Fetch property data first so we can pass beds + property type to Tavily
    const prop = await fetchPropData(addr);
    const beds     = prop?.bedrooms     ?? null;
    const propType = 'single family'; // extend later if propertyType field added to PropData
    fetchRentalIntel(addr, beds, propType);
  }, [fetchPropData, fetchRentalIntel, router]);

  // ── Auto-run on URL param ─────────────────────────────────────────────────
  useEffect(() => {
    if (urlAddr) {
      setInputAddr(urlAddr);
      runAnalysis(urlAddr);
    }
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlAddr]);

  // ── Save to Portfolio ────────────────────────────────────────────────────
  const saveToPortfolio = async () => {
    const p = price > 0 ? price : (propData?.current_list_price ?? propData?.last_sold_price ?? 0);
    const r = rent > 0 ? rent : (rentalData?.rentRangeMedian ?? 0);
    if (!urlAddr || p <= 0) return;
    setSaving(true);
    try {
      const m = calcMetrics(p, r, downPct, rate, rentalData?.vacancyPct ?? 5);
      await fetch('/api/investor/portfolio', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address:     urlAddr,
          avm:         p,
          beds:        propData?.bedrooms  ?? null,
          baths:       propData?.bathrooms ?? null,
          sqft:        propData?.sqft      ?? null,
          year_built:  propData?.year_built ?? null,
          dscr:        m ? parseFloat(m.dscr.toFixed(4))         : null,
          cap_rate:    m ? parseFloat(m.capRate.toFixed(4))      : null,
          gross_yield: m ? parseFloat(m.grossYield.toFixed(4))   : null,
          cash_flow:   m ? Math.round(m.cashFlow)                : null,
          down_pct:    downPct,
          rate,
          rent:        r,
        }),
      });
      setSavedPortfolio(true);
      setTimeout(() => setSavedPortfolio(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const hasAddress   = !!urlAddr;
  const effectivePrice = price > 0 ? price : (propData?.current_list_price ?? propData?.last_sold_price ?? 0);
  const effectiveRent  = rent > 0 ? rent : (rentalData?.rentRangeMedian ?? 2000);
  const vac = rentalData?.vacancyPct ?? 5;

  const m20 = effectivePrice > 0 ? calcMetrics(effectivePrice, effectiveRent, 20, rate, vac) : null;
  const m25 = effectivePrice > 0 ? calcMetrics(effectivePrice, effectiveRent, 25, rate, vac) : null;
  const m30 = effectivePrice > 0 ? calcMetrics(effectivePrice, effectiveRent, 30, rate, vac) : null;
  const mActive = effectivePrice > 0 ? calcMetrics(effectivePrice, effectiveRent, downPct, rate, vac) : null;

  // Range bar position (clamp 5–95%)
  const rentBarPos = rentalData
    ? Math.min(95, Math.max(5, ((effectiveRent - rentalData.rentRangeLow) / Math.max(1, rentalData.rentRangeHigh - rentalData.rentRangeLow)) * 100))
    : 50;

  const rentBarFillStart = 0;
  const rentBarFillWidth = rentalData
    ? ((rentalData.rentRangeHigh - rentalData.rentRangeLow) / Math.max(1, rentalData.rentRangeHigh * 1.2 - rentalData.rentRangeLow * 0.8)) * 100
    : 60;

  // ── No-address state ──────────────────────────────────────────────────────
  if (!hasAddress) {
    return (
      <div className="page-standalone ii-root">
        <AppNav />
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '72px 20px 60px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.12em', color: '#00e87a', textTransform: 'uppercase', marginBottom: 10 }}>Investor Intel</div>
          <h1 style={{ fontSize: '1.7rem', fontWeight: 800, color: '#f0f4ff', marginBottom: 8, lineHeight: 1.15 }}>Investment Property Report</h1>
          <p style={{ color: '#4a5a7a', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: 36 }}>
            DSCR analysis · rental comps · deal metrics · AI market intelligence
          </p>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#00e87a', pointerEvents: 'none', zIndex: 1 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <AddressAutocomplete
              value={inputAddr}
              onChange={setInputAddr}
              onSelect={addr => runAnalysis(addr)}
              placeholder="Enter investment property address…"
              style={{
                width: '100%', background: '#0d1420',
                border: '1.5px solid rgba(0,232,122,0.3)', borderRadius: 12,
                padding: '14px 130px 14px 46px', fontSize: 14, color: '#f0f4ff',
                outline: 'none', fontFamily: 'inherit',
              }}
              onKeyDown={e => { if (e.key === 'Enter') runAnalysis(inputAddr); }}
            />
            <button
              onClick={() => runAnalysis(inputAddr)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: '#00e87a', color: '#07100f', fontSize: 12, fontWeight: 800, border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Analyze →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Full report ───────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        .ii-root { background:#07090f; color:#f0f4ff; font-family:var(--font-dm-sans,system-ui); }
        @keyframes iiShimmer  { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes iiSpin     { to{transform:rotate(360deg)} }
        @keyframes iiPhotoFade{ from{opacity:0} to{opacity:1} }
        @keyframes iiPulse    { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .ii-spin { animation: iiSpin 0.9s linear infinite; }
        .ii-ai-dot { width:7px; height:7px; border-radius:50%; background:#00e87a; animation:iiPulse 1.8s ease-in-out infinite; }
        @media(max-width:600px){
          .ii-metrics-grid { grid-template-columns:1fr 1fr !important; }
          .ii-comps-grid   { grid-template-columns:1fr 1fr !important; }
          .ii-prop-header  { flex-direction:column !important; }
          .ii-photo        { width:100% !important; height:140px !important; }
          .ii-scenario-table th { font-size:9px !important; padding:8px 8px !important; }
          .ii-scenario-table td { font-size:11px !important; padding:8px 8px !important; }
        }
      `}</style>

      <div className="page-standalone ii-root">
        <AppNav />
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px 80px' }}>

          {/* ── Page header ──────────────────────────────────────────────── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.12em', color: '#00e87a', textTransform: 'uppercase', marginBottom: 5 }}>Investor Intel</div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f0f4ff', lineHeight: 1.15, margin: 0 }}>Investment Property Report</h1>
            <p style={{ fontSize: '0.8rem', color: '#3a4a6a', marginTop: 4, margin: 0 }}>DSCR analysis · rental comps · deal metrics · AI market intelligence</p>
          </div>

          {/* ── Address search bar ───────────────────────────────────────── */}
          <div style={{ position: 'relative', marginBottom: 28 }}>
            <div style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#00e87a', pointerEvents: 'none', zIndex: 1 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <AddressAutocomplete
              value={inputAddr}
              onChange={setInputAddr}
              onSelect={addr => runAnalysis(addr)}
              placeholder="Enter investment property address…"
              style={{
                width: '100%', background: '#0d1420',
                border: '1.5px solid rgba(0,232,122,0.3)', borderRadius: 12,
                padding: '13px 120px 13px 46px', fontSize: 14, color: '#f0f4ff',
                outline: 'none', fontFamily: 'inherit',
              }}
              onKeyDown={e => { if (e.key === 'Enter') runAnalysis(inputAddr); }}
            />
            <button
              onClick={() => runAnalysis(inputAddr)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: '#00e87a', color: '#07100f', fontSize: 12, fontWeight: 800, border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Analyze →
            </button>
          </div>

          {/* ── Property header card ─────────────────────────────────────── */}
          <div className="ii-prop-header" style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20, marginBottom: 20, display: 'flex', gap: 18, alignItems: 'flex-start' }}>
            {/* Photo */}
            <div className="ii-photo" style={{ width: 110, height: 80, borderRadius: 9, flexShrink: 0, background: '#1a2440', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
              {mapUrl && (
                <>
                  <img src={mapUrl} alt="" style={{ display: 'none' }} onLoad={() => setPhotoReady(true)} />
                  {photoReady && (
                    <div style={{ position: 'absolute', inset: 0, backgroundImage: `url('${mapUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center', animation: 'iiPhotoFade 0.5s ease forwards' }} />
                  )}
                </>
              )}
              {(!mapUrl || !photoReady) && (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2a3a5a" strokeWidth="1.2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              )}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f0f4ff', lineHeight: 1.3, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{urlAddr}</div>

              {/* Bed/bath/sqft strip */}
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
                {loadingProp
                  ? [60, 50, 70].map((w, i) => <Sk key={i} w={w} h={11} />)
                  : propData
                  ? [
                      propData.bedrooms   != null && `${propData.bedrooms} bed`,
                      propData.bathrooms  != null && `${propData.bathrooms} bath`,
                      propData.sqft       != null && `${Number(propData.sqft).toLocaleString()} sqft`,
                      propData.year_built != null && `Built ${propData.year_built}`,
                    ].filter(Boolean).map((s, i) => (
                      <span key={i} style={{ fontSize: 12, color: '#6a7a9a' }}><strong style={{ color: '#c9d4e8' }}>{String(s).split(' ')[0]}</strong> {String(s).split(' ').slice(1).join(' ')}</span>
                    ))
                  : <span style={{ fontSize: 11, color: '#3a4a6a', fontStyle: 'italic' }}>{errorProp || 'No property data'}</span>
                }
              </div>

              {/* AVM + Est Loan */}
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#3a4a6a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {propData ? 'AVM Estimate' : 'Purchase Price'}
                  </div>
                  {loadingProp
                    ? <Sk w={100} h={22} />
                    : propData
                    ? <div style={{ fontSize: 18, fontWeight: 800, color: '#00e87a' }}>{fmt$(propData.current_list_price ?? propData.last_sold_price)}</div>
                    : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: '#00e87a', fontSize: 14, fontWeight: 700 }}>$</span>
                        <input
                          type="text"
                          value={price > 0 ? price.toLocaleString() : ''}
                          onChange={e => { const v = parseFloat(e.target.value.replace(/,/g, '')); if (!isNaN(v)) setPrice(v); }}
                          placeholder="500,000"
                          style={{ background: 'rgba(0,232,122,0.07)', border: '1px solid rgba(0,232,122,0.25)', borderRadius: 6, padding: '4px 8px', fontSize: 16, fontWeight: 800, color: '#00e87a', width: 120, outline: 'none', fontFamily: 'inherit' }}
                        />
                      </div>
                    )
                  }
                  <div style={{ fontSize: '0.6rem', color: '#2a3a5a', marginTop: 1 }}>Redfin · {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
                </div>
                {effectivePrice > 0 && (
                  <div>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#3a4a6a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Est. Loan ({downPct}% down)</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#c9d4e8' }}>{fmt$(effectivePrice * (1 - downPct / 100))}</div>
                    <div style={{ fontSize: '0.6rem', color: '#2a3a5a', marginTop: 1 }}>DSCR · 30yr fixed · {rate.toFixed(2)}%</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Rent input bar ───────────────────────────────────────────── */}
          <div style={{ background: 'rgba(0,232,122,0.05)', border: '1px solid rgba(0,232,122,0.18)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f0f4ff' }}>Expected Monthly Rent</div>
              <div style={{ fontSize: 11, color: '#4a5a7a', marginTop: 2 }}>Used for all calculations below — override with your own estimate</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#00e87a' }}>$</span>
                <input
                  type="text"
                  value={effectiveRent > 0 ? effectiveRent.toLocaleString() : ''}
                  onChange={e => { const v = parseFloat(e.target.value.replace(/,/g, '')); if (!isNaN(v)) setRent(v); }}
                  placeholder={loadingRent ? 'Loading…' : '2,500'}
                  style={{ background: 'rgba(0,232,122,0.08)', border: '1.5px solid rgba(0,232,122,0.3)', borderRadius: 8, padding: '8px 12px', fontSize: 18, fontWeight: 800, color: '#00e87a', width: 120, outline: 'none', fontFamily: 'inherit', textAlign: 'right' }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#4a5a7a' }}>/mo</span>
              </div>
              {rentalData && (
                <div style={{ fontSize: 11, color: '#00a853', background: 'rgba(0,232,122,0.07)', border: '1px solid rgba(0,232,122,0.15)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  onClick={() => setRent(rentalData.rentRangeMedian)}>
                  ✦ AI estimate: {fmt$(rentalData.rentRangeLow)}–{fmt$(rentalData.rentRangeHigh)}
                </div>
              )}
              {loadingRent && !rentalData && (
                <div style={{ fontSize: 11, color: '#3a4a6a', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div className="ii-spin" style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#00e87a' }} />
                  Analyzing rental market…
                </div>
              )}
            </div>
          </div>

          {/* ── Adjusters row ────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            {[
              { label: 'Down Payment', value: downPct, set: setDownPct, suffix: '%', min: 15, max: 50, step: 5 },
              { label: 'DSCR Rate', value: rate, set: setRate, suffix: '%', min: 5, max: 12, step: 0.125 },
            ].map(({ label, value, set, suffix, min, max, step }) => (
              <div key={label} style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#3a4a6a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#c9d4e8' }}>{value % 1 === 0 ? value : value.toFixed(3).replace(/\.?0+$/, '')}{suffix}</div>
                </div>
                <input
                  type="range"
                  min={min} max={max} step={step}
                  value={value}
                  onChange={e => set(parseFloat(e.target.value))}
                  style={{ width: 100, accentColor: '#00e87a', cursor: 'pointer' }}
                />
              </div>
            ))}
          </div>

          {/* ── Deal Metrics grid ────────────────────────────────────────── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#3a4a6a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Deal Metrics</div>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#00e87a' }}>Live · {downPct}% down · {rate.toFixed(2)}%</div>
            </div>
            <div className="ii-metrics-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              {[
                {
                  label: 'DSCR Ratio',
                  val:   mActive ? mActive.dscr : null,
                  fmt:   (v: number) => v.toFixed(2) + 'x',
                  color: mActive ? dscrColor(mActive.dscr) : '#c9d4e8',
                  note:  mActive ? dscrLabel(mActive.dscr) : '—',
                },
                {
                  label: 'Cap Rate',
                  val:   mActive ? mActive.capRate : null,
                  fmt:   (v: number) => v.toFixed(1) + '%',
                  color: mActive ? (mActive.capRate >= 5 ? '#00e87a' : mActive.capRate >= 3 ? '#f5c842' : '#ff5f5f') : '#c9d4e8',
                  note:  'Net operating income / price',
                },
                {
                  label: 'Gross Yield',
                  val:   mActive ? mActive.grossYield : null,
                  fmt:   (v: number) => v.toFixed(1) + '%',
                  color: '#c9d4e8',
                  note:  'Annual rent / purchase price',
                },
                {
                  label: 'Cash-on-Cash',
                  val:   mActive ? mActive.coc : null,
                  fmt:   (v: number) => (v >= 0 ? '' : '') + v.toFixed(1) + '%',
                  color: mActive ? (mActive.coc >= 5 ? '#00e87a' : mActive.coc >= 0 ? '#f5c842' : '#ff5f5f') : '#c9d4e8',
                  note:  'Cash flow / cash invested',
                },
              ].map(({ label, val, fmt, color, note }) => (
                <div key={label} style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 11, padding: '14px 16px' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#3a4a6a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
                  {val != null
                    ? <div style={{ fontSize: '1.35rem', fontWeight: 800, color, lineHeight: 1 }}>{fmt(val)}</div>
                    : <Sk w={60} h={24} />
                  }
                  <div style={{ fontSize: '0.6rem', color: '#3a4a6a', marginTop: 5 }}>{note}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Down Payment Scenarios table ──────────────────────────────── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#3a4a6a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Down Payment Scenarios</div>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#4a5a7a' }}>{fmt$(effectivePrice)} · {fmt$(effectiveRent)}/mo · {rate.toFixed(2)}%</div>
            </div>
            <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 11, overflow: 'hidden' }}>
              <table className="ii-scenario-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#0a0f1c' }}>
                    <th style={{ fontSize: '0.6rem', fontWeight: 800, color: '#3a4a6a', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Metric</th>
                    {[
                      { pct: 20, m: m20 },
                      { pct: 25, m: m25 },
                      { pct: 30, m: m30 },
                    ].map(({ pct }) => (
                      <th key={pct} style={{ fontSize: '0.6rem', fontWeight: 800, color: downPct === pct ? '#00e87a' : '#3a4a6a', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {pct}% Down{downPct === pct ? <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, marginLeft: 6, background: 'rgba(0,232,122,0.1)', color: '#00e87a', border: '1px solid rgba(0,232,122,0.2)' }}>current</span> : null}
                        <br/><span style={{ fontWeight: 500, color: '#3a4a6a', textTransform: 'none', letterSpacing: 0, fontSize: '0.55rem' }}>{fmt$(effectivePrice * pct / 100)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Loan Amount',       vals: [m20, m25, m30].map(m => m ? fmt$(m.loan) : '—'),          highlight: false, colorFn: null },
                    { label: 'Monthly P&I',        vals: [m20, m25, m30].map(m => m ? fmt$(m.pi) : '—'),            highlight: false, colorFn: null },
                    { label: 'Monthly PITIA',      vals: [m20, m25, m30].map(m => m ? fmt$(m.pitia) : '—'),         highlight: false, colorFn: null },
                    { label: 'DSCR Ratio',         vals: [m20, m25, m30].map(m => m ? m.dscr.toFixed(2) + 'x' : '—'), highlight: true, colorFn: (v: string) => { const n = parseFloat(v); return n >= 1.25 ? '#00e87a' : n >= 0.75 ? '#f5c842' : '#ff5f5f'; } },
                    { label: 'Monthly Cash Flow',  vals: [m20, m25, m30].map(m => m ? fmt$(m.cashFlow) : '—'),      highlight: false, colorFn: (v: string) => v.startsWith('−') || parseFloat(v.replace(/[$,]/g, '')) < 0 ? '#ff5f5f' : '#00e87a' },
                    { label: 'Cash-on-Cash',       vals: [m20, m25, m30].map(m => m ? fmtPct(m.coc) : '—'),        highlight: false, colorFn: (v: string) => parseFloat(v) < 0 ? '#ff5f5f' : parseFloat(v) >= 5 ? '#00e87a' : '#f5c842' },
                    { label: 'Gross Yield',        vals: [m20, m25, m30].map(m => m ? fmtPct(m.grossYield) : '—'), highlight: false, colorFn: null },
                    { label: 'Rent → 1.0x DSCR',  vals: [m20, m25, m30].map(m => m ? fmt$(m.pitia) + '/mo' : '—'),highlight: false, colorFn: null },
                  ].map(({ label, vals, highlight, colorFn }, rowIdx) => (
                    <tr key={rowIdx} style={{ background: highlight ? 'rgba(0,232,122,0.03)' : 'transparent' }}>
                      <td style={{ fontSize: 11, fontWeight: 700, color: '#6a7a9a', padding: '10px 14px', textAlign: 'left', borderBottom: rowIdx < 7 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>{label}</td>
                      {vals.map((v, ci) => (
                        <td key={ci} style={{ fontSize: 12, fontWeight: 600, color: colorFn ? colorFn(v) : '#c9d4e8', padding: '10px 14px', textAlign: 'right', borderBottom: rowIdx < 7 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {mActive && mActive.dscr < 1.0 && effectivePrice > 0 && (
              <div style={{ marginTop: 8, fontSize: '0.65rem', color: '#2a3a5a', lineHeight: 1.5 }}>
                At {fmt$(effectiveRent)}/mo rent, DSCR = {mActive.dscr.toFixed(2)}x at {downPct}% down.
                {' '}Rent needed for 1.0x: <strong style={{ color: '#4a5a7a' }}>{fmt$(mActive.pitia)}/mo</strong>{' '}
                — for 1.25x: <strong style={{ color: '#4a5a7a' }}>{fmt$(mActive.pitia * 1.25)}/mo</strong>.
              </div>
            )}
          </div>

          {/* ── AI Rental Comps ──────────────────────────────────────────── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#3a4a6a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Rental Market Intelligence</div>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#00e87a' }}>Tavily + Grok · Live</div>
            </div>

            <div style={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {loadingRent
                    ? <div className="ii-spin" style={{ width: 7, height: 7, borderRadius: '50%', border: '2px solid rgba(0,232,122,0.2)', borderTopColor: '#00e87a' }} />
                    : <div className="ii-ai-dot" />
                  }
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#f0f4ff' }}>
                      {loadingRent ? 'Analyzing rental market…' : `Comparable Rentals — ${urlAddr.split(',').slice(1, 3).join(',').trim()}`}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: '#3a4a6a' }}>
                      {rentalData ? `Web search · ${rentalData.comps.length} comps · ${rentalData.dataFreshness}` : loadingRent ? 'Searching Zillow, Apartments.com, Realtor…' : 'Ready'}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 5, padding: '2px 7px' }}>Grok</div>
              </div>

              {loadingRent && !rentalData && (
                <div style={{ padding: '32px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[100, 85, 70].map((w, i) => <Sk key={i} w={`${w}%`} h={12} />)}
                </div>
              )}

              {errorRent && !rentalData && (
                <div style={{ padding: '18px', fontSize: '0.8rem', color: '#ff5f5f' }}>⚠ {errorRent}</div>
              )}

              {rentalData && (
                <div style={{ padding: 18 }}>
                  {/* Range bar */}
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#3a4a6a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                      {propData?.bedrooms ? `${propData.bedrooms}BR ` : ''}Market Rent Range — {urlAddr.split(',').slice(1, 3).join(',').trim()}
                    </div>
                    <div style={{ position: 'relative', height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 99 }}>
                      <div style={{ position: 'absolute', top: 0, height: '100%', background: 'linear-gradient(to right, #ff8c42, #00e87a)', borderRadius: 99, left: '10%', width: '70%' }} />
                      <div style={{ position: 'absolute', top: -4, width: 16, height: 16, borderRadius: '50%', background: '#00e87a', border: '2px solid #0d1420', left: `calc(${rentBarPos}% - 8px)`, transition: 'left 0.2s ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 9, color: '#3a4a6a', fontWeight: 700 }}>
                      <span>{fmt$(rentalData.rentRangeLow)}</span>
                      <span style={{ color: '#00a853' }}>{fmt$(effectiveRent)} ← yours</span>
                      <span>{fmt$(rentalData.rentRangeHigh)}</span>
                    </div>
                  </div>

                  {/* Comp cards */}
                  {rentalData.comps.length > 0 && (
                    <div className="ii-comps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 18 }}>
                      {rentalData.comps.slice(0, 3).map((comp: RentalComp, i: number) => {
                        const diff = comp.rent - effectiveRent;
                        return (
                          <div key={i} style={{ background: '#0a0f1c', border: `1px solid ${Math.abs(diff) < 150 ? 'rgba(0,232,122,0.15)' : 'rgba(255,255,255,0.05)'}`, borderRadius: 9, padding: '12px 14px' }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#c9d4e8', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{comp.address}</div>
                            <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#4a5a7a', marginBottom: 6 }}>
                              {comp.beds && <span>{comp.beds} bd</span>}
                              {comp.baths && <span>{comp.baths} ba</span>}
                              {comp.sqft && <span>{Number(comp.sqft).toLocaleString()} sf</span>}
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#f0f4ff', lineHeight: 1 }}>{fmt$(comp.rent)}<span style={{ fontSize: 9, fontWeight: 600, color: '#4a5a7a' }}>/mo</span></div>
                            <div style={{ fontSize: 10, marginTop: 3, color: diff >= 0 ? '#00e87a' : '#ff8c42' }}>
                              {diff >= 0 ? '▲' : '▼'} {fmt$(Math.abs(diff))} {diff >= 0 ? 'above' : 'below'} yours
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* AI narrative */}
                  <div style={{ background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.12)', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      AI Market Analysis
                      <button onClick={() => setAiExpanded(x => !x)} style={{ background: 'none', border: 'none', color: '#4a5a7a', cursor: 'pointer', fontSize: 12, padding: 0 }}>{aiExpanded ? '▲' : '▼'}</button>
                    </div>
                    {aiExpanded && (
                      <div style={{ fontSize: '0.78rem', color: '#9aa4bf', lineHeight: 1.65 }}>
                        {rentalData.aiNarrative}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Save to Portfolio CTA ───────────────────────────────────── */}
          {urlAddr && effectivePrice > 0 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
              <button
                onClick={saveToPortfolio}
                disabled={saving || savedPortfolio}
                style={{ padding: '11px 22px', fontSize: '0.85rem', fontWeight: 700, background: savedPortfolio ? 'rgba(0,232,122,0.12)' : '#00e87a', color: savedPortfolio ? '#00e87a' : '#07100f', border: savedPortfolio ? '1px solid rgba(0,232,122,0.3)' : 'none', borderRadius: 10, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1, transition: 'all 0.2s' }}
              >
                {savedPortfolio ? '✓ Saved to Portfolio' : saving ? 'Saving…' : '+ Save to Portfolio'}
              </button>
              {savedPortfolio && (
                <Link href="/investor" style={{ fontSize: '0.8rem', color: '#00e87a', textDecoration: 'none', fontWeight: 600 }}>
                  View My Portfolio →
                </Link>
              )}
            </div>
          )}

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <div style={{ fontSize: '0.6rem', color: '#1e2a3a', lineHeight: 1.5, padding: '0 4px' }}>
            Estimates only. AVM via Redfin cache. Rental comps via web search (Zillow, Realtor, Apartments.com). Tax 1.1%/yr · Insurance 0.5%/yr assumed.
            DSCR rates vary by lender. Not a pre-approval or commitment to lend.
          </div>

        </div>
      </div>
    </>
  );
}

// ── Suspense wrapper ──────────────────────────────────────────────────────────

function LoadingShell() {
  return (
    <div style={{ minHeight: '100vh', background: '#07090f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.07)', borderTopColor: '#00e87a' }} />
      <style>{`@keyframes iiSpin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default function InvestorIntelPage() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <InvestorIntelInner />
    </Suspense>
  );
}
