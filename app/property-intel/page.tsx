'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { SignInButton, SignedIn, SignedOut } from '@clerk/nextjs';
import Link from 'next/link';
import AppNav from '../components/AppNav';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Comp {
  address: string;
  sold_price: number;
  sold_date: string;
  sqft: number | null;
  price_per_sqft: number | null;
}

interface PropResult {
  current_status:            string | null;
  current_list_price:        number | null;
  bedrooms:                  number | null;
  bathrooms:                 number | null;
  sqft:                      number | null;
  year_built:                number | null;
  lot_size_sqft:             number | null;
  days_on_market:            number | null;
  price_per_sqft:            number | null;
  last_sold_price:           number | null;
  last_sold_date:            string | null;
  estimated_piti:            number | null;
  rate_used:                 number | null;
  life_fit_score:            number | null;
  key_highlights:            string[] | null;
  comparable_sales:          Comp[]   | null;
  grok_intelligence_summary: string   | null;
  confidence:                string   | null;
  data_freshness:            string   | null;
}

interface MapUrls {
  street_view_url: string | null;
  static_map_url:  string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt$ = (n: number | null | undefined) =>
  n != null ? '$' + Math.round(n).toLocaleString() : '—';

const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  'for sale':   { bg: 'rgba(74,222,128,0.15)',  color: '#4ade80', label: 'FOR SALE'   },
  'pending':    { bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24', label: 'PENDING'    },
  'sold':       { bg: 'rgba(96,165,250,0.15)',  color: '#60a5fa', label: 'SOLD'       },
  'off market': { bg: 'rgba(148,163,184,0.1)',  color: '#94a3b8', label: 'OFF MARKET' },
};

const CONF_CFG: Record<string, { bg: string; color: string; border: string }> = {
  high:   { bg: 'rgba(74,222,128,0.1)',  color: '#4ade80', border: 'rgba(74,222,128,0.2)'  },
  medium: { bg: 'rgba(251,191,36,0.1)',  color: '#fbbf24', border: 'rgba(251,191,36,0.2)'  },
  low:    { bg: 'rgba(248,113,113,0.1)', color: '#f87171', border: 'rgba(248,113,113,0.2)' },
};

// ── Skeleton helper ────────────────────────────────────────────────────────────
function Sk({ w, h = 14, r = 5 }: { w?: number | string; h?: number; r?: number }) {
  return (
    <span style={{
      display: 'inline-block', width: w ?? '100%', height: h,
      borderRadius: r,
      background: 'linear-gradient(90deg,#1e293b 25%,#273449 50%,#1e293b 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
      verticalAlign: 'middle',
    }} />
  );
}

// ── Main inner component ───────────────────────────────────────────────────────
function PropertyIntelInner() {
  const searchParams  = useSearchParams();
  const address       = (searchParams?.get('address') ?? '').trim();

  const [finalResult, setFinalResult] = useState<PropResult | null>(null);
  const [mapUrls,     setMapUrls]     = useState<MapUrls | null>(null);
  const [photoReady,  setPhotoReady]  = useState(false);
  const [mapView,     setMapView]     = useState<'street' | 'satellite'>('street');
  const [cacheHit,    setCacheHit]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [summary,     setSummary]     = useState('');
  const [error,       setError]       = useState('');
  const [copied,      setCopied]      = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [savedVault,  setSavedVault]  = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const d: Partial<PropResult> = finalResult ?? {};

  const photoUrl = mapUrls
    ? (mapView === 'street' ? mapUrls.street_view_url : mapUrls.static_map_url)
    : null;

  // ── Query ──────────────────────────────────────────────────────────────────
  const runQuery = useCallback(async () => {
    if (!address) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setFinalResult(null); setMapUrls(null);
    setPhotoReady(false); setCacheHit(false);
    setSummary(''); setError('');
    setLoading(true);

    try {
      // 1 — try cache
      const cd = await fetch(`/api/beta/grok-property?address=${encodeURIComponent(address)}`)
        .then(r => r.json()).catch(() => null);

      if (cd?.cached) {
        setCacheHit(true);
        if (cd.map_urls) setMapUrls(cd.map_urls);
        setFinalResult(cd.result as PropResult);
        setSummary(cd.result?.grok_intelligence_summary ?? '');
        setLoading(false);
        return;
      }

      // Cache miss — report hasn't been generated yet
      setError('No cached report found for this address. Open the property from My Properties to generate one.');
      setLoading(false);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message ?? 'Could not load property intelligence');
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (address) runQuery();
    return () => { abortRef.current?.abort(); };
  }, [address]);

  // ── CTAs ───────────────────────────────────────────────────────────────────
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).catch(() => {
      const el = document.createElement('textarea');
      el.value = window.location.href;
      document.body.appendChild(el); el.select();
      document.execCommand('copy'); document.body.removeChild(el);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/homeowner/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      setSavedVault(true);
      setTimeout(() => setSavedVault(false), 3000);
    } finally { setSaving(false); }
  };

  // ── Derived display values ─────────────────────────────────────────────────
  const statusKey = (d.current_status ?? '').toLowerCase();
  const statusCfg = STATUS_CFG[statusKey] ?? { bg: 'rgba(148,163,184,0.1)', color: '#94a3b8', label: (d.current_status ?? '').toUpperCase() };
  const confCfg   = CONF_CFG[(d.confidence ?? '').toLowerCase()] ?? CONF_CFG.medium;

  if (!address) {
    return (
      <div className="page-standalone pi-root">
        <AppNav />
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '80px 20px 60px', textAlign: 'center' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🏠</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>Property Intelligence</h2>
          <p style={{ color: '#475569', fontSize: '0.9rem', lineHeight: 1.6 }}>
            Search for a property using{' '}
            <Link href="/" style={{ color: '#4ade80' }}>Property Lookup</Link>
            {' '}from the home page, or open it from{' '}
            <Link href="/my-home" style={{ color: '#4ade80' }}>My Properties</Link>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .pi-root{background:#050812;color:#f1f5f9;font-family:var(--font-dm-sans,system-ui)}
        @keyframes shimmer  { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes fieldIn  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes blink    { 50%{opacity:0} }
        @keyframes spin     { to{transform:rotate(360deg)} }
        @keyframes photoFade{ from{opacity:0} to{opacity:1} }
        .fi  { animation: fieldIn  0.38s ease forwards; }
        .tw::after { content:'▋'; animation: blink 0.7s step-end infinite; color:#4ade80; margin-left:1px; }
        .spin{ animation: spin 0.9s linear infinite; }
        .pi-body-grid { display:grid; grid-template-columns:1fr 1fr; gap:0; }
        @media (max-width:680px) {
          .pi-body-grid { grid-template-columns:1fr !important; }
          .pi-body-grid > div:first-child { border-right:none !important; border-bottom:1px solid rgba(255,255,255,0.06); }
          .pi-hero-bottom { flex-direction:column !important; align-items:flex-start !important; }
          .pi-hero-piti   { text-align:left !important; }
          .pi-strip       { gap:14px !important; padding:12px 18px !important; }
          .pi-cta-bar     { flex-direction:column !important; }
          .pi-cta-bar > *,
          .pi-cta-bar a   { flex:none !important; width:100% !important; max-width:none !important; }
          .pi-cta-bar button { width:100% !important; justify-content:center !important; }
        }
      `}</style>

      <div className="page-standalone pi-root">
        <AppNav />
        <div style={{ maxWidth: 920, margin: '0 auto', padding: '24px 16px 80px' }}>

          {/* ── Loading state ─────────────────────────────────────────────── */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '90px 20px', gap: 20 }}>
              <div className="spin" style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.08)', borderTopColor: '#4ade80' }} />
              <div style={{ fontSize: '0.88rem', color: '#64748b' }}>Checking for cached report…</div>
            </div>
          )}

          {/* ── Error ─────────────────────────────────────────────────────── */}
          {error && (
            <div style={{ padding: 16, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, color: '#f87171', fontSize: '0.875rem', marginBottom: 20 }}>
              ⚠ {error}
            </div>
          )}

          {/* ── Card ─────────────────────────────────────────────────────── */}
          {finalResult && (
            <div style={{ display: 'flex', flexDirection: 'column', background: '#0f172a', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 8px 48px rgba(0,0,0,0.55)' }}>

              {/* ── Hero photo ────────────────────────────────────────────── */}
              <div style={{ height: 290, position: 'relative', background: '#1e293b', overflow: 'hidden' }}>
                {/* Skeleton shimmer while photo loads */}
                {!photoReady && (
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,#1a2540 25%,#1e2d4a 50%,#1a2540 75%)', backgroundSize: '200% 100%', animation: 'shimmer 2s infinite' }} />
                )}
                {/* Photo */}
                {photoUrl && (
                  <>
                    <img
                      src={photoUrl}
                      alt=""
                      style={{ display: 'none' }}
                      onLoad={() => setPhotoReady(true)}
                    />
                    {photoReady && (
                      <div style={{ position: 'absolute', inset: 0, backgroundImage: `url('${photoUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center', animation: 'photoFade 0.6s ease forwards' }} />
                    )}
                  </>
                )}
                {/* Loading spinner on photo area */}
                {!photoReady && !photoUrl && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="spin" style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#4ade80' }} />
                  </div>
                )}
                {/* Map toggle */}
                {photoReady && mapUrls?.static_map_url && (
                  <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 10, display: 'flex', background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, overflow: 'hidden', backdropFilter: 'blur(8px)' }}>
                    {(['street', 'satellite'] as const).map(v => (
                      <button key={v} onClick={() => { setMapView(v); setPhotoReady(false); }}
                        style={{ padding: '6px 12px', fontSize: '0.72rem', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: mapView === v ? 'rgba(255,255,255,0.22)' : 'transparent', color: mapView === v ? '#fff' : 'rgba(255,255,255,0.45)' }}>
                        {v.charAt(0).toUpperCase() + v.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
                {/* Cache badge */}
                {cacheHit && (
                  <div className="fi" style={{ position: 'absolute', top: 14, left: 14, zIndex: 10, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', padding: '4px 10px', background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.28)', borderRadius: 6, backdropFilter: 'blur(8px)' }}>
                    ⚡ INSTANT
                  </div>
                )}
                {/* Gradient overlay */}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(5,8,18,0.97) 0%, rgba(5,8,18,0.35) 55%, transparent 100%)', pointerEvents: 'none', zIndex: 2 }} />
                {/* Hero content */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '24px 28px', zIndex: 5 }}>
                  <div className="pi-hero-bottom" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                      {/* Status badge */}
                      {d.current_status
                        ? <div className="fi" style={{ display: 'inline-block', padding: '3px 12px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em', marginBottom: 8, background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.color}40` }}>{statusCfg.label}</div>
                        : <div style={{ marginBottom: 8 }}><Sk w={80} h={22} r={99} /></div>
                      }
                      {/* Price */}
                      {d.current_list_price != null
                        ? <div className="fi" style={{ fontSize: '2.5rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{fmt$(d.current_list_price)}</div>
                        : <Sk w={200} h={46} />
                      }
                      <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)', marginTop: 6, maxWidth: 440, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{address}</div>
                    </div>
                    {/* PITI */}
                    <div className="pi-hero-piti" style={{ textAlign: 'right' }}>
                      {d.estimated_piti != null
                        ? <div className="fi" style={{ fontSize: '1.9rem', fontWeight: 800, color: '#4ade80', lineHeight: 1 }}>{fmt$(d.estimated_piti)}/mo</div>
                        : <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Sk w={130} h={38} /></div>
                      }
                      <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: 4, letterSpacing: '0.06em' }}>EST. MONTHLY PITI</div>
                      {d.rate_used != null && (
                        <div className="fi" style={{ fontSize: '0.64rem', color: '#475569', marginTop: 2 }}>
                          @ {d.rate_used.toFixed(2)}% · 20% down
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Property strip ────────────────────────────────────────── */}
              <div className="pi-strip" style={{ display: 'flex', flexWrap: 'wrap', gap: 22, padding: '13px 28px', background: 'rgba(255,255,255,0.025)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {[
                  { val: d.bedrooms   != null ? `${d.bedrooms} bd`                                      : null, icon: 'fa-bed',            sk: 34 },
                  { val: d.bathrooms  != null ? `${d.bathrooms} ba`                                     : null, icon: 'fa-bath',           sk: 34 },
                  { val: d.sqft       != null ? `${Number(d.sqft).toLocaleString()} sqft`               : null, icon: 'fa-ruler-combined', sk: 66 },
                  { val: d.year_built != null ? `Built ${d.year_built}`                                 : null, icon: 'fa-calendar',       sk: 56 },
                  { val: d.lot_size_sqft != null ? `${Number(d.lot_size_sqft).toLocaleString()} sqft lot` : null, icon: 'fa-expand',      sk: 84 },
                ].map(({ val, icon, sk }, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.82rem', color: '#94a3b8' }}>
                    <i className={`fa-solid ${icon}`} style={{ color: '#475569', fontSize: '0.7rem', width: 14, textAlign: 'center' }} />
                    {val != null ? <span className="fi">{val}</span> : <Sk w={sk} h={13} />}
                  </div>
                ))}
              </div>

              {/* ── Two-column body ───────────────────────────────────────── */}
              <div className="pi-body-grid">

                {/* Left — Intelligence + Highlights */}
                <div style={{ padding: 24, borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>

                  {/* Grok Intelligence */}
                  <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.18)', borderRadius: 14, padding: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <i className="fa-solid fa-brain" style={{ color: '#a78bfa', fontSize: '1.05rem' }} />
                      <span style={{ fontWeight: 700, fontSize: '0.93rem' }}>Grok Intelligence</span>
                      </div>
                    {summary ? (
                      <p style={{ fontSize: '0.84rem', color: '#cbd5e1', lineHeight: 1.75, margin: 0, minHeight: 64 }}>
                        {summary}
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                        {[100, 92, 85, 78].map((w, i) => <Sk key={i} w={`${w}%`} h={12} />)}
                      </div>
                    )}
                  </div>

                  {/* Key Highlights */}
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20 }}>
                    <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#475569', marginBottom: 14 }}>Key Highlights</div>
                    {d.key_highlights?.length ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {d.key_highlights.map((h, i) => (
                          <div key={i} className="fi" style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                            <span style={{ color: '#4ade80', marginTop: 3, fontSize: '0.55rem', flexShrink: 0 }}>●</span>
                            <span style={{ fontSize: '0.81rem', color: '#cbd5e1', lineHeight: 1.55 }}>{h}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                        {[100, 88, 72, 80].map((w, i) => <Sk key={i} w={`${w}%`} h={12} />)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right — Metrics + Comps + Confidence */}
                <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>

                  {/* 2×2 metrics */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { val: d.life_fit_score,  fmt: (v: number) => String(v),  color: '#4ade80', label: 'Life-Fit Score', sub: null },
                      { val: d.days_on_market,  fmt: (v: number) => `${v}d`,    color: '#f1f5f9', label: 'Days on Market', sub: null },
                      { val: d.price_per_sqft,  fmt: (v: number) => `$${v}`,    color: '#f1f5f9', label: 'Price / SqFt',  sub: null },
                      { val: d.last_sold_price, fmt: (v: number) => fmt$(v),    color: '#fbbf24', label: 'Last Sold',      sub: d.last_sold_date },
                    ].map(({ val, fmt: fmtFn, color, label, sub }, i) => (
                      <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                        {val != null
                          ? <div className="fi" style={{ fontSize: i === 3 ? '1.5rem' : '2rem', fontWeight: 800, color, lineHeight: 1 }}>{fmtFn(val as number)}</div>
                          : <div style={{ display: 'flex', justifyContent: 'center' }}><Sk w={52} h={34} /></div>
                        }
                        {sub && <div className="fi" style={{ fontSize: '0.59rem', color: '#64748b', marginTop: 3 }}>{sub}</div>}
                        <div style={{ fontSize: '0.59rem', color: '#475569', marginTop: 5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Comps */}
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20, flex: 1 }}>
                    <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#475569', marginBottom: 14 }}>Recent Comps</div>
                    {d.comparable_sales?.length ? (
                      <div>
                        {d.comparable_sales.map((c, i) => (
                          <div key={i} className="fi" style={{ padding: '10px 0', borderBottom: i < d.comparable_sales!.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{c.address}</div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.71rem', color: '#64748b' }}>
                              <span style={{ color: '#4ade80', fontWeight: 700 }}>{fmt$(c.sold_price)}</span>
                              <span>{c.sold_date}</span>
                              {c.sqft        && <span>{Number(c.sqft).toLocaleString()} sf</span>}
                              {c.price_per_sqft && <span>${c.price_per_sqft}/sf</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[1, 2, 3].map(i => <Sk key={i} w="100%" h={52} r={8} />)}
                      </div>
                    )}
                  </div>

                  {/* Confidence */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
                    <span style={{ fontSize: '0.78rem', color: '#475569' }}>Confidence</span>
                    {d.confidence
                      ? <span className="fi" style={{ padding: '3px 10px', borderRadius: 99, fontSize: '0.67rem', fontWeight: 700, background: confCfg.bg, color: confCfg.color, border: `1px solid ${confCfg.border}` }}>
                          {d.confidence.charAt(0).toUpperCase() + d.confidence.slice(1)}
                        </span>
                      : <Sk w={50} h={20} r={99} />
                    }
                  </div>
                </div>
              </div>

              {/* ── Freshness footer ──────────────────────────────────────── */}
              <div style={{ padding: '10px 28px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                {d.data_freshness
                  ? <span className="fi" style={{ fontSize: '0.63rem', color: '#334155' }}>{d.data_freshness}</span>
                  : <Sk w={190} h={11} />
                }
                <span style={{ fontSize: '0.6rem', color: '#1e293b' }}>Powered by Grok-4 · HomeRates.AI</span>
              </div>

              {/* ── CTA bar ───────────────────────────────────────────────── */}
              <div className="pi-cta-bar" style={{ padding: '18px 28px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: 'rgba(255,255,255,0.012)' }}>

                {/* Share — always public */}
                <button onClick={handleShare} style={{ padding: '11px 20px', fontSize: '0.82rem', fontWeight: 600, background: 'transparent', color: copied ? '#4ade80' : '#94a3b8', border: `1px solid ${copied ? 'rgba(74,222,128,0.35)' : 'rgba(148,163,184,0.22)'}`, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s' }}>
                  <i className={`fa-solid ${copied ? 'fa-check' : 'fa-share-nodes'}`} style={{ fontSize: '0.8rem' }} />
                  {copied ? 'Copied!' : 'Share Report'}
                </button>

                {/* Save to Vault */}
                <SignedIn>
                  <button onClick={handleSave} disabled={saving || savedVault} style={{ padding: '11px 20px', fontSize: '0.82rem', fontWeight: 600, background: 'transparent', color: savedVault ? '#4ade80' : 'rgba(74,222,128,0.85)', border: `1px solid ${savedVault ? 'rgba(74,222,128,0.4)' : 'rgba(74,222,128,0.22)'}`, borderRadius: 10, cursor: saving ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s', opacity: saving ? 0.65 : 1 }}>
                    <i className={`fa-solid ${savedVault ? 'fa-check' : 'fa-bookmark'}`} style={{ fontSize: '0.8rem' }} />
                    {savedVault ? '✓ Saved!' : saving ? 'Saving…' : 'Save to Vault'}
                  </button>
                </SignedIn>
                <SignedOut>
                  <SignInButton mode="modal">
                    <button style={{ padding: '11px 20px', fontSize: '0.82rem', fontWeight: 600, background: 'transparent', color: 'rgba(74,222,128,0.85)', border: '1px solid rgba(74,222,128,0.22)', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
                      <i className="fa-solid fa-lock" style={{ fontSize: '0.72rem' }} />
                      Save to Vault
                    </button>
                  </SignInButton>
                </SignedOut>

                {/* Run My Numbers — primary CTA */}
                <SignedIn>
                  <Link href={`/my-home?address=${encodeURIComponent(address)}`} style={{ flex: 1, maxWidth: 280, textDecoration: 'none' }}>
                    <button style={{ width: '100%', padding: '12px 24px', fontSize: '0.88rem', fontWeight: 700, background: '#4ade80', color: '#050812', border: 'none', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s' }}>
                      <i className="fa-solid fa-calculator" style={{ fontSize: '0.8rem' }} />
                      Run My Numbers →
                    </button>
                  </Link>
                </SignedIn>
                <SignedOut>
                  <SignInButton mode="modal">
                    <button style={{ flex: 1, maxWidth: 280, padding: '12px 24px', fontSize: '0.88rem', fontWeight: 700, background: '#4ade80', color: '#050812', border: 'none', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <i className="fa-solid fa-lock" style={{ fontSize: '0.78rem' }} />
                      Sign In to Run Numbers →
                    </button>
                  </SignInButton>
                </SignedOut>

              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Suspense wrapper ───────────────────────────────────────────────────────────
function LoadingShell() {
  return (
    <div style={{ minHeight: '100vh', background: '#050812', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.07)', borderTopColor: '#4ade80', animation: 'spin 0.9s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default function PropertyIntelPage() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <PropertyIntelInner />
    </Suspense>
  );
}
