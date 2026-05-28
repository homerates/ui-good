'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Comp {
  address: string;
  sold_price: number;
  sold_date: string;
  sqft: number | null;
  price_per_sqft: number | null;
  days_on_market?: number | null;
}

interface LocSubScore {
  metric: string;
  score: number;
  rating: string;
  description: string;
  fire_factor?: number | null;
  risk_30yr_pct?: number | null;
  us_risk_percentile?: number | null;
}

interface LocIntel {
  overall_score: number;
  sub_scores: LocSubScore[];
  narrative: string;
  strengths: string[];
  tradeoffs: string[];
  recommendation: string;
}

interface PropData {
  current_status: string | null;
  current_list_price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  year_built: number | null;
  lot_size_sqft: number | null;
  days_on_market: number | null;
  price_per_sqft: number | null;
  last_sold_price: number | null;
  last_sold_date: string | null;
  estimated_piti: number | null;
  rate_used: number | null;
  key_highlights: string[] | null;
  comparable_sales: Comp[] | null;
  grok_intelligence_summary: string | null;
  buyer_strategy: string | null;
  zillow_estimate: number | null;
  redfin_estimate: number | null;
  market_median_dom: number | null;
  market_sale_to_list: number | null;
  market_median_price: number | null;
  life_fit_score: number | null;
  school_score: number | null;
  walk_score: number | null;
  neighborhood_appreciation_3yr_pct: number | null;
  location_intelligence: LocIntel | null;
  photoUrl?: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt  = (n: number | null | undefined) => n != null ? n.toLocaleString('en-US') : '—';
const fmtK = (n: number | null | undefined) => {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
};
const fmtPct = (n: number | null | undefined) => n != null ? `${n.toFixed(1)}%` : '—';

function calcPI(principal: number, annualRate: number, months = 360): number {
  const r = annualRate / 100 / 12;
  if (r === 0) return Math.round(principal / months);
  return Math.round(principal * (r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1));
}

function scoreColor(s: number | null): string {
  if (s == null) return '#4b5c70';
  if (s >= 70) return '#4ade80';
  if (s >= 50) return '#fbbf24';
  return '#f87171';
}

function verdict(s: number): { label: string; color: string } {
  if (s >= 85) return { label: 'Strong Buy',       color: '#4ade80' };
  if (s >= 70) return { label: 'Ready to Offer',   color: '#4ade80' };
  if (s >= 55) return { label: 'Buy with Caution', color: '#fbbf24' };
  if (s >= 40) return { label: 'Watch the Market', color: '#fbbf24' };
  return             { label: 'Hold Off',           color: '#f87171' };
}

function computeComposite(l1: number, l2: number | null, l3: number | null, l4: number | null): number | null {
  const entries = [
    { s: l1,  w: 0.35 },
    { s: l2,  w: 0.25 },
    { s: l3,  w: 0.25 },
    { s: l4,  w: 0.15 },
  ].filter(e => e.s != null) as { s: number; w: number }[];
  if (entries.length < 2) return null;
  const totalW   = entries.reduce((a, e) => a + e.w, 0);
  const weighted = entries.reduce((a, e) => a + e.s! * e.w, 0);
  return Math.round(weighted / totalW);
}

function locSubColor(s: number): string {
  if (s >= 70) return 'green';
  if (s >= 50) return 'yellow';
  if (s >= 35) return 'orange';
  return 'red';
}

// ── Score ring SVG ─────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 100 }: { score: number; size?: number }) {
  const r = size * 0.42;
  const circ = 2 * Math.PI * r;
  const fill = circ * Math.min(score / 100, 1);
  const cx = size / 2, cy = size / 2;
  const color = scoreColor(score);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={size * 0.1} />
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth={size * 0.1}
        strokeDasharray={`${fill} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy - size * 0.04} textAnchor="middle" fill="#f0f4ff"
        fontSize={size * 0.24} fontWeight={800} fontFamily="DM Sans,sans-serif">{score}</text>
      <text x={cx} y={cy + size * 0.14} textAnchor="middle" fill="#4b5c70"
        fontSize={size * 0.11} fontFamily="DM Mono,monospace">/100</text>
    </svg>
  );
}

// ── Shared localStorage helpers (mirror property-intel) ───────────────────────
const piNormKey = (a: string) =>
  a.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 100);

function piLsRead(addr: string): { result: PropData; mapUrls: { street_view_url: string | null } | null } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`pi_v1_${piNormKey(addr)}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { result: PropData; mapUrls: { street_view_url: string | null } | null; cachedAt: number };
    if (!parsed?.result || !parsed.cachedAt) return null;
    const age = Date.now() - parsed.cachedAt;
    const ttl = /sold|off market|withdrawn/i.test(parsed.result.current_status ?? '')
      ? 7 * 86_400_000 : 86_400_000;
    if (age >= ttl) return null;
    return { result: parsed.result, mapUrls: parsed.mapUrls ?? null };
  } catch { return null; }
}

// ── Main report inner ──────────────────────────────────────────────────────────
function ReportInner() {
  const params = useSearchParams();
  const address    = params?.get('address') ?? '';
  const downPct    = Number(params?.get('down')  ?? 20);
  const rateOver   = Number(params?.get('rate')  ?? 0);
  const chatUrl    = params?.get('chatUrl') ?? '';   // optional back-link to specific chat session
  // photo passed directly from property-intel Build Report link — highest priority
  const photoParam = params?.get('photo') ?? null;

  const [data,         setData]         = useState<PropData | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [copied,       setCopied]       = useState(false);
  const [printing,     setPrinting]     = useState(false);
  // Separate hero photo state — survives if primary URL 404s
  const [heroPhoto,    setHeroPhoto]    = useState<string | null>(photoParam);
  const [heroFallback, setHeroFallback] = useState<string | null>(null);

  useEffect(() => {
    if (!address) { setError('No address provided.'); setLoading(false); return; }

    // ── Helper: fetch Redfin photo in background and set as fallback ──────────
    const fetchRedfinPhoto = () =>
      fetch('/api/property/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(lj => { if (lj?.ok && lj.data?.photoUrl) setHeroFallback(lj.data.photoUrl as string); })
        .catch(() => {});

    // 1. Try the property-intel localStorage cache first — fast & rich
    const cached = piLsRead(address);
    if (cached) {
      // Prefer Redfin CDN (reliable) over Google Maps Street View (may 404)
      const redfinCdn = (cached.result as any).photo_url as string | null ?? null;
      const googleMaps = cached.mapUrls?.street_view_url ?? null;
      const primary = redfinCdn ?? googleMaps;
      // photoParam (from URL) takes precedence over anything in cache
      if (!photoParam) setHeroPhoto(primary);
      else if (primary && primary !== photoParam) setHeroFallback(primary);
      const d = { ...cached.result, photoUrl: photoParam ?? primary };
      setData(d);
      setLoading(false);
      // Background: if no Redfin CDN photo in cache, fetch it as fallback for Google Maps failures
      if (!redfinCdn && !photoParam) fetchRedfinPhoto();
      return;
    }

    // 2. Try Supabase cache via grok-property GET — fully structured, correct field names
    fetch(`/api/beta/grok-property?address=${encodeURIComponent(address)}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (j?.cached && j?.result) {
          // Supabase hit — result already has current_list_price, bedrooms, etc.
          // Prefer Redfin CDN (photo_url from mergeResult) over Google Maps
          const redfinCdn = (j.result as any)?.photo_url as string | null ?? null;
          const googleMaps = j.map_urls?.street_view_url as string | null ?? null;
          const primary = redfinCdn ?? googleMaps;
          // photoParam (from URL) takes precedence
          if (!photoParam) setHeroPhoto(primary);
          else if (primary && primary !== photoParam) setHeroFallback(primary);
          setData({ ...j.result as PropData, photoUrl: photoParam ?? primary });
          setLoading(false);
          // Background: if no Redfin CDN photo, fetch for fallback
          if (!redfinCdn && !photoParam) fetchRedfinPhoto();
          return;
        }

        // 3. Supabase miss — call property/lookup and normalize raw field names
        return fetch('/api/property/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address }),
        })
          .then(r => r.ok ? r.json() : Promise.reject('lookup failed'))
          .then(lj => {
            const d = lj?.data ?? {};
            // Map raw lookup fields → PropData field names
            setData({
              current_status:     (d.listingStatus as string) ?? null,
              current_list_price: (d.price as number) ?? null,
              bedrooms:           (d.beds as number)  ?? null,
              bathrooms:          (d.baths as number) ?? null,
              sqft:               (d.sqft as number)  ?? null,
              year_built:         (d.yearBuilt as number) ?? null,
              days_on_market:     (d.daysOnMarket as number) ?? null,
              price_per_sqft:     (d.price && d.sqft) ? Math.round((d.price as number) / (d.sqft as number)) : null,
              last_sold_price:    (d.lastSalePrice as number) ?? null,
              last_sold_date:     (d.lastSaleDate as string)  ?? null,
              lot_size_sqft:      (d.lotSqft as number) ?? null,
              estimated_piti:     null,
              rate_used:          rateOver > 0 ? rateOver : null,
              key_highlights:     null,
              comparable_sales:   null,
              grok_intelligence_summary: null,
              buyer_strategy:     null,
              zillow_estimate:    (d.estimatedValue as number) ?? null,
              redfin_estimate:    null,
              market_median_dom:  null,
              market_sale_to_list: null,
              market_median_price: null,
              life_fit_score:     null,
              school_score:       null,
              walk_score:         null,
              neighborhood_appreciation_3yr_pct: null,
              location_intelligence: null,
              photoUrl:           photoParam ?? (d.photoUrl as string) ?? null,
            });
            if (!photoParam && d.photoUrl) setHeroPhoto(d.photoUrl as string);
            setLoading(false);
          });
      })
      .catch(() => { setError('Failed to load property data.'); setLoading(false); });
  }, [address, rateOver]);

  const handleShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      prompt('Copy this link:', window.location.href);
    }
  }, []);

  const handlePrint = useCallback(() => {
    setPrinting(true);
    setTimeout(() => { window.print(); setPrinting(false); }, 200);
  }, []);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#080c12', color: '#8fa3b8', fontFamily: 'DM Sans,sans-serif', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(0,232,122,0.3)', borderTopColor: '#00e87a', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ fontSize: 14 }}>Building your property report…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error || !data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#080c12', color: '#8fa3b8', fontFamily: 'DM Sans,sans-serif' }}>
      {error || 'No data found.'}
    </div>
  );

  // ── Derived financials ────────────────────────────────────────────────────────
  const price     = data.current_list_price ?? 0;
  const rate      = rateOver > 0 ? rateOver : (data.rate_used ?? 6.51);
  const downAmt   = Math.round(price * downPct / 100);
  const loanAmt   = price - downAmt;
  const ltv       = downPct < 80 ? (100 - downPct) : 80;
  const pi        = calcPI(loanAmt, rate);
  const taxMo     = Math.round((price * 0.0125) / 12);
  const insMo     = Math.round((price * 0.005) / 12);
  const totalPITI = pi + taxMo + insMo;
  const loanType  = loanAmt > 1_089_300 ? '30-Yr Jumbo Fixed' : '30-Yr Conventional Fixed';
  const hasPMI    = downPct < 20;

  // 15yr and ARM estimates
  const pi15  = calcPI(loanAmt, rate - 0.47, 180);
  const piARM = calcPI(loanAmt, rate - 0.63);

  // ── Scores ────────────────────────────────────────────────────────────────────
  // L1: financial fit
  const ltvScore   = downPct >= 20 ? 90 : downPct >= 10 ? 72 : 55;
  const pitiIncome = totalPITI / 0.35;
  const l1Score    = Math.min(100, Math.round(ltvScore));

  // L2: market position (AVM vs list)
  const avm = ((data.zillow_estimate ?? 0) + (data.redfin_estimate ?? 0)) / 2 || price;
  const avmDiff = avm > 0 ? ((avm - price) / avm) * 100 : 0;
  const l2Score = Math.min(100, Math.max(30, Math.round(50 + avmDiff * 5)));

  // L3: market timing (DOM, sale-to-list)
  const domScore  = data.market_median_dom
    ? Math.min(100, Math.max(30, Math.round(70 - ((data.days_on_market ?? 0) - data.market_median_dom) * 1.5)))
    : 65;
  const stlScore  = data.market_sale_to_list ? Math.round(data.market_sale_to_list * 100) : 70;
  const l3Score   = Math.round((domScore + stlScore) / 2);

  // L4: location
  const l4Score = data.location_intelligence?.overall_score ?? data.life_fit_score ?? null;

  const composite = computeComposite(l1Score, l2Score, l3Score, l4Score);
  const verd      = composite != null ? verdict(composite) : null;

  // ── Date ─────────────────────────────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const reportUrl = typeof window !== 'undefined' ? window.location.href : '';
  const backUrl   = chatUrl || `https://chat.homerates.ai/property-intel?address=${encodeURIComponent(address)}`;

  // ── Location sub-scores ───────────────────────────────────────────────────────
  const locSubs = data.location_intelligence?.sub_scores ?? [];
  const wildfire = locSubs.find(s => /wildfire|fire/i.test(s.metric));
  const mainSubs = locSubs.filter(s => !/wildfire|fire/i.test(s.metric));

  // ── Status badge ──────────────────────────────────────────────────────────────
  const status = data.current_status ?? 'Active';
  const isPending = /pending/i.test(status);
  const isSold    = /sold/i.test(status);

  // ── Comp table helper ─────────────────────────────────────────────────────────
  const comps = data.comparable_sales?.slice(0, 3) ?? [];

  return (
    <>
      {/* ── Print / action bar (screen only) ─────────────────────────────────── */}
      <div className="rp-action-bar no-print">
        <div className="rp-action-bar-left">
          <img src="/assets/homerates-email-logo.png" alt="HomeRates.ai" style={{ height: 28, width: 'auto' }} />
          <span className="rp-action-addr">{address}</span>
        </div>
        <div className="rp-action-btns">
          <a href={backUrl} target="_blank" rel="noopener noreferrer" className="rp-btn-ghost">
            ↗ View in HomeRates
          </a>
          <button className="rp-btn-ghost" onClick={handleShare}>
            {copied ? '✓ Link copied!' : '🔗 Share Report'}
          </button>
          <button className="rp-btn-primary" onClick={handlePrint} disabled={printing}>
            {printing ? 'Preparing…' : '⬇ Download PDF'}
          </button>
        </div>
      </div>

      {/* ── 4 portrait pages — centred column ────────────────────────────────── */}
      <div className="rp-book">

      {/* ═══════════════════════════════════════════════════════════════
          PAGE 1 — PROPERTY SNAPSHOT
      ═══════════════════════════════════════════════════════════════ */}
      <div className="rp-page">
        <div className="rp-watermark" />
        <div className="rp-watermark-corner" />

        {/* Nav */}
        <div className="rp-nav">
          <div className="rp-nav-logo">
            <img src="/assets/homerates-email-logo.png" alt="HomeRates.ai" />
          </div>
          <a href={backUrl} className="rp-nav-chip" target="_blank" rel="noopener noreferrer">
            ↗ View live analysis
          </a>
          <div className="rp-nav-meta">
            <div className="rp-nav-type">Property Intelligence Report</div>
            <div className="rp-nav-date">Generated {today} · Confidential</div>
          </div>
        </div>

        {/* Hero */}
        <div className="rp-hero">
          {(heroPhoto ?? data.photoUrl)
            ? <img
                src={heroPhoto ?? data.photoUrl ?? ''}
                className="rp-hero-img"
                alt="Property"
                onError={e => {
                  const img = e.currentTarget as HTMLImageElement;
                  // If primary (Google Maps) fails, try Redfin CDN fallback
                  if (heroFallback && img.src !== heroFallback) {
                    img.src = heroFallback;
                  } else {
                    img.style.display = 'none';
                  }
                }}
              />
            : <div className="rp-hero-ph">🏡</div>
          }
          <div className="rp-hero-grad" />
          <div className={`rp-status-badge ${isPending ? 'yellow' : isSold ? 'red' : 'green'}`}>
            <span className="rp-status-dot" />
            {status}
          </div>
          <div className="rp-hero-overlay">
            <div>
              <div className="rp-hero-price">{price ? `$${fmt(price)}` : '—'}</div>
              <div className="rp-hero-addr">{address}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="rp-hero-piti-label">Est. Monthly PITI</div>
              <div className="rp-hero-piti">${fmt(totalPITI)}/mo</div>
              <div className="rp-hero-piti-sub">@ {rate}% · {downPct}% down</div>
            </div>
          </div>
        </div>

        {/* Spec strip */}
        <div className="rp-spec-strip">
          {[
            data.bedrooms    != null && `${data.bedrooms} bd`,
            data.bathrooms   != null && `${data.bathrooms} ba`,
            data.sqft        != null && `${fmt(data.sqft)} sqft`,
            data.year_built  != null && `Built ${data.year_built}`,
            data.lot_size_sqft != null && `${fmt(data.lot_size_sqft)} sf lot`,
            data.days_on_market != null && `${data.days_on_market} DOM`,
            data.price_per_sqft != null && `$${fmt(data.price_per_sqft)}/sqft`,
          ].filter(Boolean).map((s, i) => (
            <div key={i} className="rp-spec-item">{s}</div>
          ))}
        </div>

        {/* Main 2-col */}
        <div className="rp-grid-2col" style={{ padding: '14px 36px 0' }}>

          {/* LEFT */}
          <div className="rp-col">
            {/* Grok intel */}
            <div className="rp-card">
              <div className="rp-card-title">Grok Intelligence</div>
              <div className="rp-body-text">{data.grok_intelligence_summary ?? 'Analysis not available.'}</div>
            </div>

            {/* Key highlights */}
            {data.key_highlights && data.key_highlights.length > 0 && (
              <div className="rp-card">
                <div className="rp-mono-label" style={{ marginBottom: 8 }}>Key Highlights</div>
                <ul className="rp-hl-list">
                  {data.key_highlights.slice(0, 5).map((h, i) => (
                    <li key={i}><span className="rp-hl-dot" />{h}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* AVM row */}
            <div className="rp-avm-row">
              {data.zillow_estimate != null && (
                <div className="rp-avm-item">
                  <span className="rp-mono-label">Zillow Est.</span>
                  <span style={{ fontSize: 17, fontWeight: 700, color: '#60a5fa' }}>{fmtK(data.zillow_estimate)}</span>
                </div>
              )}
              {data.redfin_estimate != null && (
                <div className="rp-avm-item">
                  <span className="rp-mono-label">Redfin Est.</span>
                  <span style={{ fontSize: 17, fontWeight: 700, color: '#fb923c' }}>{fmtK(data.redfin_estimate)}</span>
                </div>
              )}
              <div className="rp-avm-item">
                <span className="rp-mono-label">AI Estimate</span>
                <span style={{ fontSize: 17, fontWeight: 700, color: '#4ade80' }}>{fmtK(avm)}</span>
              </div>
              <div className="rp-avm-item">
                <span className="rp-mono-label">vs. List</span>
                <span style={{ fontSize: 17, fontWeight: 700, color: avmDiff >= 0 ? '#4ade80' : '#f87171' }}>
                  {avmDiff >= 0 ? '+' : ''}{avmDiff.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="rp-col">
            {/* 2×2 stats */}
            <div className="rp-grid-2col" style={{ gap: 8 }}>
              {data.life_fit_score != null && (
                <div className="rp-stat-card">
                  <span className="rp-mono-label">Life-Fit Score</span>
                  <span className="rp-stat-val" style={{ color: scoreColor(data.life_fit_score) }}>{data.life_fit_score}</span>
                </div>
              )}
              <div className="rp-stat-card">
                <span className="rp-mono-label">Days on Market</span>
                <span className="rp-stat-val">{data.days_on_market ?? '—'}<span style={{ fontSize: 13, color: '#4b5c70', fontWeight: 400 }}>d</span></span>
                <span className="rp-stat-sub">Median: {data.market_median_dom ?? '—'}d area avg</span>
              </div>
              <div className="rp-stat-card">
                <span className="rp-mono-label">Price / Sqft</span>
                <span className="rp-stat-val">${fmt(data.price_per_sqft)}</span>
              </div>
              <div className="rp-stat-card">
                <span className="rp-mono-label">Last Sold</span>
                <span className="rp-stat-val" style={{ fontSize: 18, color: '#fbbf24' }}>{fmtK(data.last_sold_price)}</span>
                <span className="rp-stat-sub" style={{ fontFamily: 'DM Mono,monospace', fontSize: 9 }}>{data.last_sold_date ?? ''}</span>
              </div>
            </div>

            {/* 3-col market */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div className="rp-mkt-card">
                <div className="rp-mono-label">Area Avg DOM</div>
                <div className="rp-mkt-val">{data.market_median_dom ?? '—'}<span style={{ fontSize: 11, color: '#4b5c70' }}>d</span></div>
              </div>
              <div className="rp-mkt-card">
                <div className="rp-mono-label">Sale / List</div>
                <div className="rp-mkt-val">{data.market_sale_to_list != null ? `${(data.market_sale_to_list * 100).toFixed(1)}%` : '—'}</div>
              </div>
              <div className="rp-mkt-card">
                <div className="rp-mono-label">Median Price</div>
                <div className="rp-mkt-val" style={{ fontSize: 15 }}>{fmtK(data.market_median_price)}</div>
              </div>
            </div>

            {/* Comp table */}
            {comps.length > 0 && (
              <div className="rp-card" style={{ padding: 0, overflow: 'hidden', flex: 1 }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontFamily: 'DM Mono,monospace', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5c70' }}>
                  Recent Comps
                </div>
                <div className="rp-table-wrap">
                <table className="rp-table">
                  <thead>
                    <tr>
                      <th>Address</th><th>Sqft</th><th>Price</th><th>$/sqft</th><th>DOM</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="rp-subject-row">
                      <td><strong>{address.split(',')[0]}</strong> <span className="rp-comp-tag">SUBJECT</span></td>
                      <td>{fmt(data.sqft)}</td>
                      <td style={{ color: '#4ade80', fontWeight: 600 }}>{fmtK(price)}</td>
                      <td>${fmt(data.price_per_sqft)}</td>
                      <td>{data.days_on_market ?? '—'}d</td>
                    </tr>
                    {comps.map((c, i) => (
                      <tr key={i}>
                        <td>{c.address.split(',')[0]}</td>
                        <td>{fmt(c.sqft)}</td>
                        <td>{fmtK(c.sold_price)}</td>
                        <td>${fmt(c.price_per_sqft)}</td>
                        <td>{c.days_on_market ?? '—'}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>{/* end rp-table-wrap */}
              </div>
            )}
          </div>
        </div>

        {/* Share button — in-page (print visible) */}
        <div className="rp-inline-share no-print" style={{ padding: '12px 36px 0' }}>
          <button onClick={handleShare} className="rp-share-inline">
            {copied ? '✓ Report link copied to clipboard' : '🔗 Share this report'}
          </button>
          <button onClick={handlePrint} className="rp-download-inline">
            ⬇ Download PDF
          </button>
        </div>

        <div className="rp-footer">
          <span className="rp-footer-left">HomeRates.Ai · Property Intelligence Report · Confidential · © {new Date().getFullYear()}</span>
          <a href={backUrl} className="rp-footer-link" target="_blank" rel="noopener noreferrer">chat.homerates.ai ↗</a>
          <span className="rp-footer-right">Page 1 of 4</span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          PAGE 2 — MORTGAGE SCENARIO
      ═══════════════════════════════════════════════════════════════ */}
      <div className="rp-page">
        <div className="rp-watermark" />
        <div className="rp-watermark-corner" />

        <div className="rp-nav">
          <div className="rp-nav-logo"><img src="/assets/homerates-email-logo.png" alt="HomeRates.ai" /></div>
          <a href="https://chat.homerates.ai/chat" className="rp-nav-chip" target="_blank" rel="noopener noreferrer">↗ Run your scenario</a>
          <div className="rp-nav-meta">
            <div className="rp-nav-type">Mortgage Scenario Analysis</div>
            <div className="rp-nav-date">{address}</div>
          </div>
        </div>

        <div className="rp-scenario-banner">
          <div className="rp-scenario-title">Your Financing Scenario</div>
          <div className="rp-scenario-sub">{loanType} · {downPct}% Down · ${fmt(loanAmt)} Loan · {rate}% Rate{hasPMI ? '' : ' · No PMI'}</div>
        </div>

        <div className="rp-grid-2col" style={{ padding: '14px 36px 0' }}>
          <div className="rp-col">
            {/* Inputs */}
            <div className="rp-card">
              <div className="rp-mono-label" style={{ marginBottom: 14 }}>Scenario Inputs</div>
              <div className="rp-grid-2col" style={{ gap: 14 }}>
                {[
                  ['Purchase Price',  `$${fmt(price)}`],
                  ['Down Payment',    `$${fmt(downAmt)} (${downPct}%)`],
                  ['Loan Amount',     `$${fmt(loanAmt)}`],
                  ['Interest Rate',   `${rate}%`, '#4ade80'],
                  ['Loan Type',       loanType],
                  ['LTV',            `${ltv.toFixed(1)}%${!hasPMI ? ' · No PMI' : ''}`],
                ].map(([label, val, col]) => (
                  <div key={label as string}>
                    <div style={{ fontSize: 10, color: '#4b5c70', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: col as string || '#f0f4ff' }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* PITI breakdown */}
            <div className="rp-piti-card">
              <div className="rp-piti-header">
                <div>
                  <div className="rp-mono-label">Total Monthly PITI</div>
                  <div style={{ fontSize: 11, color: '#4b5c70' }}>P · I · Tax · Insurance</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#00e87a', letterSpacing: '-0.02em' }}>${fmt(totalPITI)}</div>
                  <div style={{ fontSize: 11, color: '#4b5c70' }}>/month</div>
                </div>
              </div>
              {[
                ['Principal & Interest', `$${fmt(pi)}`],
                [`Property Tax (1.25%)`, `$${fmt(taxMo)}`],
                ['Homeowners Insurance', `$${fmt(insMo)}`],
                ['HOA Dues', '$0'],
                ['PMI', hasPMI ? `$${fmt(Math.round(loanAmt * 0.008 / 12))}` : '$0 · NONE'],
              ].map(([label, val]) => (
                <div key={label} className="rp-piti-line">
                  <span style={{ fontSize: 12, color: '#8fa3b8' }}>{label}</span>
                  <span style={{ fontFamily: 'DM Mono,monospace', fontSize: 13, color: label === 'PMI' && !hasPMI ? '#4ade80' : '#f0f4ff' }}>{val}</span>
                </div>
              ))}
            </div>

            {/* Buyer strategy */}
            {data.buyer_strategy && (
              <div className="rp-card">
                <div className="rp-mono-label" style={{ marginBottom: 8 }}>AI Buyer Strategy</div>
                <div className="rp-body-text">{data.buyer_strategy}</div>
              </div>
            )}
          </div>

          <div className="rp-col">
            <div className="rp-mono-label" style={{ paddingTop: 4, marginBottom: 10 }}>Loan Program Comparison</div>
            {[
              { type: loanType, rate: `${rate}%`, piti: `$${fmt(totalPITI)}/mo PITI`, note: null, selected: true },
              { type: loanType.replace('30-Yr', '15-Yr'), rate: `${(rate - 0.47).toFixed(2)}%`, piti: `$${fmt(pi15 + taxMo + insMo)}/mo est.`, note: `+$${fmt(pi15 - pi)}/mo · Pay off 15 yrs sooner`, selected: false },
              { type: loanType.replace('30-Yr', '7/1 ARM'), rate: `${(rate - 0.63).toFixed(2)}%`, piti: `$${fmt(piARM + taxMo + insMo)}/mo est.`, note: `-$${fmt(pi - piARM)}/mo · Rate adjusts after 7 yrs`, selected: false },
            ].map(opt => (
              <div key={opt.type} className={`rp-loan-opt${opt.selected ? ' selected' : ''}`}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#8fa3b8', letterSpacing: '0.04em' }}>{opt.type}</div>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>{opt.rate}</div>
                <div style={{ fontSize: 12, color: '#8fa3b8' }}>{opt.piti}</div>
                {opt.selected && <div style={{ fontSize: 10, color: '#00e87a', fontWeight: 700, marginTop: 4 }}>★ Your Scenario</div>}
                {opt.note && <div style={{ fontSize: 10, color: '#4b5c70', marginTop: 3 }}>{opt.note}</div>}
              </div>
            ))}

            {/* Income thresholds */}
            <div className="rp-card" style={{ background: '#111827' }}>
              <div className="rp-mono-label" style={{ marginBottom: 12 }}>Qualification Thresholds</div>
              {[
                ['Min. Gross Income (35% DTI)', `$${fmt(Math.round(pitiIncome))} / yr`],
                ['Min. Cash to Close (est.)',    `$${fmt(Math.round(downAmt + price * 0.027))}`],
                ['PITI as % at $250K income',   `${((totalPITI * 12 / 250000) * 100).toFixed(1)}%`],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: '#4b5c70' }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{val}</div>
                </div>
              ))}
            </div>

            {/* 10-yr snapshot */}
            <div className="rp-card">
              <div className="rp-mono-label" style={{ marginBottom: 10 }}>10-Year Equity Snapshot</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['After 1 Year',    `$${fmt(Math.round(loanAmt * 0.0082))}`, '#f0f4ff'],
                  ['After 5 Years',   `$${fmt(Math.round(loanAmt * 0.0453))}`, '#f0f4ff'],
                  ['After 10 Years',  `$${fmt(Math.round(loanAmt * 0.1038))}`, '#f0f4ff'],
                  ['Proj. Value (3.7%)', fmtK(Math.round(price * Math.pow(1.037, 10))), '#4ade80'],
                ].map(([label, val, col]) => (
                  <div key={label} style={{ background: '#111827', borderRadius: 10, padding: '11px 14px' }}>
                    <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#4b5c70', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: col as string }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rp-footer">
          <span className="rp-footer-left">HomeRates.Ai · Property Intelligence Report · Confidential · © {new Date().getFullYear()}</span>
          <a href="https://chat.homerates.ai/chat" className="rp-footer-link" target="_blank" rel="noopener noreferrer">chat.homerates.ai ↗</a>
          <span className="rp-footer-right">Page 2 of 4</span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          PAGE 3 — LOCATION INTELLIGENCE
      ═══════════════════════════════════════════════════════════════ */}
      <div className="rp-page">
        <div className="rp-watermark" />
        <div className="rp-watermark-corner" />

        <div className="rp-nav">
          <div className="rp-nav-logo"><img src="/assets/homerates-email-logo.png" alt="HomeRates.ai" /></div>
          <a href={backUrl} className="rp-nav-chip" target="_blank" rel="noopener noreferrer">↗ View live analysis</a>
          <div className="rp-nav-meta">
            <div className="rp-nav-type">Location Intelligence · 15% of Index</div>
            <div className="rp-nav-date">{address}</div>
          </div>
        </div>

        {data.location_intelligence ? (
          <>
            {/* Loc hero */}
            <div className="rp-loc-hero">
              <div className="rp-loc-circle" style={{ borderColor: scoreColor(data.location_intelligence.overall_score), color: scoreColor(data.location_intelligence.overall_score) }}>
                {data.location_intelligence.overall_score}
              </div>
              <div>
                <div className="rp-mono-label" style={{ marginBottom: 3 }}>Location Score · 15% of Index</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: scoreColor(data.location_intelligence.overall_score), marginBottom: 6 }}>
                  {data.location_intelligence.overall_score >= 80 ? 'Strong Location' : data.location_intelligence.overall_score >= 65 ? 'Good Location' : 'Moderate Location'}
                </div>
                <div className="rp-body-text" style={{ maxWidth: 600 }}>{data.location_intelligence.narrative}</div>
              </div>
            </div>

            {/* Sub-score grid */}
            {mainSubs.length > 0 && (
              <div className="rp-loc-grid">
                {mainSubs.slice(0, 6).map((s) => {
                  const cls = locSubColor(s.score);
                  const col = scoreColor(s.score);
                  return (
                    <div key={s.metric} className={`rp-loc-card rp-loc-card-${cls}`}>
                      <div className="rp-mono-label" style={{ marginBottom: 6 }}>{s.metric}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
                        <span style={{ fontSize: 30, fontWeight: 800, color: col }}>{s.score}</span>
                        <span style={{ fontSize: 12, color: '#4b5c70' }}>/100</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: col, marginBottom: 8 }}>{s.rating}</div>
                      <div style={{ fontSize: 11, color: '#8fa3b8', lineHeight: 1.55 }}>{s.description}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Wildfire */}
            {wildfire && (
              <div className="rp-wildfire-card">
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 13 }}>⚠</span>
                    <span className="rp-mono-label" style={{ color: '#fb923c' }}>Wildfire Risk</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 36, fontWeight: 800, color: '#fb923c' }}>{wildfire.score}</span>
                    <span style={{ fontSize: 13, color: '#4b5c70' }}>/100</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fb923c', marginTop: 2, marginBottom: 8 }}>{wildfire.rating}</div>
                  <div className="rp-body-text">{wildfire.description}</div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {wildfire.fire_factor != null && (
                    <div className="rp-wf-chip">
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#fb923c' }}>{wildfire.fire_factor}/10</div>
                      <div className="rp-mono-label">Fire Factor</div>
                    </div>
                  )}
                  {wildfire.risk_30yr_pct != null && (
                    <div className="rp-wf-chip">
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#fb923c' }}>{wildfire.risk_30yr_pct}%</div>
                      <div className="rp-mono-label">30-Yr Risk</div>
                    </div>
                  )}
                  {wildfire.us_risk_percentile != null && (
                    <div className="rp-wf-chip">
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#fb923c' }}>Top {wildfire.us_risk_percentile}%</div>
                      <div className="rp-mono-label">US Risk</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Strengths + Tradeoffs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '10px 36px 0' }}>
              <div className="rp-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 11 }}>✓</span>
                  <span className="rp-mono-label" style={{ color: '#00e87a' }}>Strengths</span>
                </div>
                <ul className="rp-str-list">
                  {data.location_intelligence.strengths.map((s, i) => (
                    <li key={i}><span className="rp-str-dot green" />{s}</li>
                  ))}
                </ul>
              </div>
              <div className="rp-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 11 }}>⚠</span>
                  <span className="rp-mono-label" style={{ color: '#fb923c' }}>Trade-offs</span>
                </div>
                <ul className="rp-str-list">
                  {data.location_intelligence.tradeoffs.map((t, i) => (
                    <li key={i}><span className="rp-str-dot orange" />{t}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Recommendation */}
            <div className="rp-rec-box" style={{ margin: '10px 36px 0' }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
              <div>
                <div className="rp-mono-label" style={{ color: '#fbbf24', marginBottom: 5 }}>Location Recommendation</div>
                <div style={{ fontSize: 13, color: '#f0f4ff', lineHeight: 1.65 }}>{data.location_intelligence.recommendation}</div>
              </div>
            </div>
          </>
        ) : (
          <div style={{ padding: '32px 36px', color: '#8fa3b8', fontSize: 13 }}>
            Location intelligence requires a deep analysis run. Visit the property-intel page to generate it.
          </div>
        )}

        <div className="rp-footer">
          <span className="rp-footer-left">HomeRates.Ai · Property Intelligence Report · Confidential · © {new Date().getFullYear()}</span>
          <a href={backUrl} className="rp-footer-link" target="_blank" rel="noopener noreferrer">chat.homerates.ai ↗</a>
          <span className="rp-footer-right">Page 3 of 4</span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          PAGE 4 — DECISION SCORE + DISCLOSURES
      ═══════════════════════════════════════════════════════════════ */}
      <div className="rp-page">
        <div className="rp-watermark" />
        <div className="rp-watermark-corner" />

        <div className="rp-nav">
          <div className="rp-nav-logo"><img src="/assets/homerates-email-logo.png" alt="HomeRates.ai" /></div>
          <a href="https://chat.homerates.ai/track5" className="rp-nav-chip" target="_blank" rel="noopener noreferrer">↗ Get Matched</a>
          <div className="rp-nav-meta">
            <div className="rp-nav-type">Autonomous Decision Score</div>
            <div className="rp-nav-date">{address}</div>
          </div>
        </div>

        {/* DS hero */}
        <div className="rp-ds-hero">
          <ScoreRing score={composite ?? 0} size={108} />
          <div>
            {verd && <div style={{ fontSize: 24, fontWeight: 800, color: verd.color, marginBottom: 5 }}>{verd.label}</div>}
            <div style={{ fontSize: 13, color: '#8fa3b8', marginBottom: 12 }}>Based on {[l1Score, l2Score, l3Score, l4Score].filter(s => s != null).length} of 4 levels scored.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {composite != null && <span className="rp-chip green">{[l1Score, l2Score, l3Score, l4Score].filter(s => s != null).length} of 4 levels scored</span>}
              <span className="rp-chip">{loanType} · {downPct}% down · {rate}%</span>
              <span className="rp-chip" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{address}</span>
            </div>
          </div>
        </div>

        {/* L1-L4 rows */}
        <div className="rp-ds-levels">
          <div className="rp-mono-label" style={{ marginBottom: 6 }}>4 Decision Levels</div>

          {[
            {
              n: 'L1', name: 'Financial Readiness', weight: '35%', score: l1Score,
              sub: `${loanType} · ${downPct}% down · ${ltv.toFixed(1)}% LTV · ${rate}% rate${hasPMI ? ' · PMI applies' : ' · No PMI'}. ${downPct >= 20 ? 'Strong equity entry eliminates PMI.' : 'PMI applies — consider 20% down to eliminate.'} Income threshold ~$${fmt(Math.round(pitiIncome))} / yr.`,
            },
            {
              n: 'L2', name: 'Property Evaluation', weight: '25%', score: l2Score,
              sub: `${address} — PITI $${fmt(totalPITI)}/mo. AI value estimate ${fmtK(avm)} vs list ${fmtK(price)} (${avmDiff >= 0 ? '+' : ''}${avmDiff.toFixed(1)}%). ${avmDiff >= 0 ? 'List priced below AI estimate — favorable entry.' : 'List priced above AI estimate — negotiate or appraise.'}`,
            },
            {
              n: 'L3', name: 'Market Intelligence', weight: '25%', score: l3Score,
              sub: `Median DOM ${data.market_median_dom ?? '—'}d, sale-to-list ${data.market_sale_to_list != null ? `${(data.market_sale_to_list * 100).toFixed(1)}%` : '—'}. Subject at ${data.days_on_market ?? '—'} DOM. ${(data.market_sale_to_list ?? 0) > 0.99 ? 'Sellers near full ask — limited negotiation room.' : 'Some negotiation room exists.'}`,
            },
            ...(l4Score != null ? [{
              n: 'L4', name: 'Location Intelligence', weight: '15%', score: l4Score,
              sub: data.location_intelligence
                ? `${data.location_intelligence.sub_scores.slice(0, 3).map(s => `${s.metric}: ${s.rating} (${s.score})`).join('. ')}.`
                : `Overall location score: ${l4Score}/100.`,
            }] : []),
          ].map(lvl => (
            <div key={lvl.n} className="rp-ds-row">
              <div className="rp-ds-circle" style={{ borderColor: scoreColor(lvl.score), color: scoreColor(lvl.score) }}>
                {lvl.score}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{lvl.name}</span>
                  <span className="rp-weight-chip">{lvl.weight}</span>
                </div>
                <div style={{ fontSize: 11.5, color: '#8fa3b8', marginBottom: 9, lineHeight: 1.5 }}>{lvl.sub}</div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 100, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${lvl.score}%`, background: scoreColor(lvl.score), borderRadius: 100 }} />
                </div>
              </div>
              <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 19, fontWeight: 800, color: scoreColor(lvl.score), minWidth: 44, textAlign: 'right' }}>
                {lvl.score} <span style={{ fontSize: 10, color: '#4b5c70', fontWeight: 400 }}>/ 100</span>
              </div>
            </div>
          ))}
        </div>

        {/* Score legend */}
        <div className="rp-legend">
          <div className="rp-mono-label" style={{ marginRight: 16 }}>Score Legend</div>
          {[['#4ade80','85–100 Strong Buy'],['#4ade80','70–84 Ready to Offer'],['#fbbf24','55–69 Buy with Caution'],['#fbbf24','40–54 Watch the Market'],['#f87171','0–39 Hold Off']].map(([col, lbl]) => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8fa3b8' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: col, flexShrink: 0, display: 'inline-block' }} />
              {lbl}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="rp-cta-box">
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 5 }}>Ready to move on this property?</div>
            <div style={{ fontSize: 12, color: '#8fa3b8', lineHeight: 1.55 }}>Connect with a HomeRates-vetted loan officer — pre-approve your scenario and structure the strongest possible offer. No pressure, no gatekeepers.</div>
          </div>
          <a href="https://chat.homerates.ai/track5" className="rp-cta-btn" target="_blank" rel="noopener noreferrer">Get Matched →</a>
        </div>

        {/* Share in-report */}
        <div className="no-print" style={{ margin: '10px 36px 0', display: 'flex', gap: 10 }}>
          <button onClick={handleShare} className="rp-share-inline">
            {copied ? '✓ Report link copied' : '🔗 Share this report'}
          </button>
          <button onClick={handlePrint} className="rp-download-inline">
            ⬇ Download PDF
          </button>
        </div>

        {/* Disclosures */}
        <div style={{ margin: '12px 36px 0', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
          <div className="rp-mono-label" style={{ marginBottom: 10 }}>Disclosures & Attribution</div>
          <div className="rp-disc">EDUCATIONAL PURPOSE ONLY. This report is generated by HomeRates.Ai and is for informational and educational purposes only. It does not constitute financial advice, a mortgage commitment, loan guarantee, or appraisal. All figures — including AVM estimates, PITI calculations, income requirements, appreciation projections, and Decision Scores — are statistical estimates and may differ materially from actual outcomes.</div>
          <div className="rp-disc">DATA SOURCES. Rate data sourced from FRED® (Federal Reserve Bank of St. Louis). Property intelligence generated by Grok (xAI) via Tavily web search. Location intelligence computed from publicly available school, walkability, crime, and wildfire data. Wildfire risk per First Street Foundation. AVM estimates from Zillow and Redfin public data. HomeRates.Ai is not a licensed lender, broker, or financial advisor. Powered by Grok-4 · HomeRates.Ai.</div>
          <div className="rp-disc" style={{ marginTop: 8, color: 'rgba(75,92,112,0.6)' }}>© {new Date().getFullYear()} HomeRates.Ai · chat.homerates.ai · For recipient use only · Not for redistribution</div>
        </div>

        <div className="rp-footer" style={{ position: 'relative', marginTop: 16 }}>
          <span className="rp-footer-left">HomeRates.Ai · Property Intelligence Report · Confidential · © {new Date().getFullYear()}</span>
          <a href="https://chat.homerates.ai/track5" className="rp-footer-link" target="_blank" rel="noopener noreferrer">chat.homerates.ai ↗</a>
          <span className="rp-footer-right">Page 4 of 4</span>
        </div>
      </div>

      </div>{/* end rp-book */}
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
  @page { size: letter portrait; margin: 0; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 13px; line-height: 1.5; }

  /* Centred column wrapper — 816px = US Letter portrait at 96 dpi */
  .rp-book { width: 816px; margin: 0 auto; display: flex; flex-direction: column; background: #080c12; padding-top: 52px; }

  /* Action bar */
  .rp-action-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 999; background: #0d1117; border-bottom: 1px solid rgba(255,255,255,0.08); padding: 10px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .rp-action-bar-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .rp-action-addr { font-size: 12px; color: #8fa3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rp-action-btns { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .rp-btn-ghost { background: none; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: #8fa3b8; font-size: 12px; font-family: 'DM Sans',sans-serif; padding: 7px 14px; cursor: pointer; text-decoration: none; transition: border-color 0.15s, color 0.15s; }
  .rp-btn-ghost:hover { border-color: rgba(0,232,122,0.4); color: #00e87a; }
  .rp-btn-primary { background: #00e87a; color: #000; font-weight: 700; font-size: 12px; font-family: 'DM Sans',sans-serif; border: none; border-radius: 8px; padding: 8px 18px; cursor: pointer; }
  .rp-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

  /* Pages — screen: 816×1056px (US Letter at 96dpi) */
  .rp-page { width: 816px; min-height: 1056px; position: relative; overflow: hidden; padding-bottom: 50px; background: #080c12; }
  .rp-page + .rp-page { border-top: 3px solid #000; }

  /* ── Print: enforce exactly one printed page per .rp-page div ── */
  @media print {
    .no-print { display: none !important; }
    .rp-book { padding-top: 0; width: 100%; }
    .rp-page {
      width: 8.5in;
      height: 11in !important;
      min-height: unset !important;
      max-height: 11in !important;
      overflow: hidden !important;
      break-after: page;
      page-break-after: always;
      break-inside: avoid;
      page-break-inside: avoid;
      border-top: none !important;
    }
    .rp-page:last-child {
      break-after: auto !important;
      page-break-after: auto !important;
    }
    /* Shrink hero in print — recovers ~80px of vertical space per page */
    .rp-hero { height: 165px !important; }
    /* Tighter nav padding in print */
    .rp-nav { padding-top: 8px !important; padding-bottom: 8px !important; }
    .rp-spec-strip .rp-spec-item { padding-top: 8px !important; padding-bottom: 8px !important; }
  }

  /* Watermarks */
  .rp-watermark { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
  .rp-watermark::before { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); width: 340px; height: 340px; background-image: url('/assets/homerates-icon-clear.png'); background-size: contain; background-repeat: no-repeat; background-position: center; opacity: 0.028; }
  .rp-watermark-corner { position: absolute; bottom: 60px; right: 28px; width: 48px; height: 48px; background-image: url('/assets/homerates-icon-clear.png'); background-size: contain; background-repeat: no-repeat; opacity: 0.055; pointer-events: none; z-index: 0; }

  /* Nav */
  .rp-nav { display: flex; align-items: center; padding: 12px 36px; border-bottom: 1px solid rgba(255,255,255,0.06); background: #0d1117; position: relative; z-index: 1; gap: 14px; }
  .rp-nav-logo img { height: 28px; width: auto; display: block; }
  .rp-nav-chip { font-family: 'DM Mono',monospace; font-size: 9px; letter-spacing: 0.1em; color: #00e87a; text-decoration: none; border: 1px solid rgba(0,232,122,0.2); border-radius: 100px; padding: 4px 11px; background: rgba(0,232,122,0.05); white-space: nowrap; }
  .rp-nav-meta { margin-left: auto; text-align: right; }
  .rp-nav-type { font-family: 'DM Mono',monospace; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: #4b5c70; margin-bottom: 2px; }
  .rp-nav-date { font-size: 11px; color: #8fa3b8; }

  /* Hero */
  .rp-hero { position: relative; width: 100%; height: 240px; overflow: hidden; background: #111827; }
  .rp-hero-img { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.75); }
  .rp-hero-ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 64px; opacity: 0.12; background: linear-gradient(135deg,#111827,#1a2a1a); }
  .rp-hero-grad { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(8,12,18,0) 0%, rgba(8,12,18,0.8) 75%, rgba(8,12,18,1) 100%); }
  .rp-status-badge { position: absolute; top: 14px; left: 36px; display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 100px; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
  .rp-status-badge.green { background: rgba(0,232,122,0.2); border: 1px solid rgba(0,232,122,0.4); color: #00e87a; }
  .rp-status-badge.yellow { background: rgba(251,191,36,0.2); border: 1px solid rgba(251,191,36,0.4); color: #fbbf24; }
  .rp-status-badge.red { background: rgba(248,113,113,0.2); border: 1px solid rgba(248,113,113,0.4); color: #f87171; }
  .rp-status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .rp-hero-overlay { position: absolute; bottom: 0; left: 36px; right: 36px; padding-bottom: 16px; display: flex; align-items: flex-end; justify-content: space-between; }
  .rp-hero-price { font-size: 40px; font-weight: 800; letter-spacing: -0.03em; color: #fff; margin-bottom: 3px; }
  .rp-hero-addr { font-size: 13px; color: rgba(255,255,255,0.6); }
  .rp-hero-piti-label { font-family: 'DM Mono',monospace; font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 3px; }
  .rp-hero-piti { font-size: 26px; font-weight: 800; color: #00e87a; letter-spacing: -0.02em; }
  .rp-hero-piti-sub { font-size: 10px; color: rgba(255,255,255,0.35); margin-top: 2px; }

  /* Spec strip */
  .rp-spec-strip { display: flex; align-items: center; background: #0d1117; border-bottom: 1px solid rgba(255,255,255,0.06); padding: 0 36px; position: relative; z-index: 1; flex-wrap: wrap; }
  .rp-spec-item { font-size: 12px; color: #8fa3b8; padding: 12px 16px 12px 0; margin-right: 16px; border-right: 1px solid rgba(255,255,255,0.06); white-space: nowrap; }
  .rp-spec-item:last-child { border-right: none; }

  /* Layout */
  .rp-grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .rp-col { display: flex; flex-direction: column; gap: 10px; }

  /* Cards */
  .rp-card { background: #0d1117; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 16px 18px; position: relative; z-index: 1; }
  .rp-card-title { font-size: 13px; font-weight: 700; margin-bottom: 9px; }
  .rp-body-text { font-size: 12px; line-height: 1.72; color: #8fa3b8; }
  .rp-mono-label { font-family: 'DM Mono',monospace; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: #4b5c70; }
  .rp-hl-list { list-style: none; display: flex; flex-direction: column; gap: 7px; margin-top: 10px; }
  .rp-hl-list li { display: flex; align-items: flex-start; gap: 9px; font-size: 12px; color: #8fa3b8; line-height: 1.5; }
  .rp-hl-dot { width: 5px; height: 5px; border-radius: 50%; background: #00e87a; flex-shrink: 0; margin-top: 5px; }

  /* AVM row */
  .rp-avm-row { display: flex; background: #0d1117; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; overflow: hidden; position: relative; z-index: 1; }
  .rp-avm-item { flex: 1; padding: 12px 14px; border-right: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; gap: 4px; }
  .rp-avm-item:last-child { border-right: none; }

  /* Stat cards */
  .rp-stat-card { background: #0d1117; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 3px; position: relative; z-index: 1; }
  .rp-stat-val { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; }
  .rp-stat-sub { font-size: 10px; color: #4b5c70; }

  /* Market cards */
  .rp-mkt-card { background: #111827; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 11px 13px; position: relative; z-index: 1; }
  .rp-mkt-val { font-size: 18px; font-weight: 800; margin-top: 5px; }

  /* Table */
  .rp-table { width: 100%; border-collapse: collapse; }
  .rp-table th { font-family: 'DM Mono',monospace; font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: #4b5c70; padding: 7px 10px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .rp-table td { padding: 8px 10px; font-size: 11px; border-bottom: 1px solid rgba(255,255,255,0.03); }
  .rp-table tr:last-child td { border-bottom: none; }
  .rp-subject-row td { background: rgba(0,232,122,0.04); }
  .rp-comp-tag { display: inline-block; font-size: 8px; font-weight: 700; padding: 1px 6px; border-radius: 100px; background: rgba(0,232,122,0.15); color: #00e87a; margin-left: 5px; letter-spacing: 0.06em; }

  /* Inline share buttons */
  .rp-share-inline { background: none; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #8fa3b8; font-size: 12px; font-family: 'DM Sans',sans-serif; padding: 8px 16px; cursor: pointer; transition: border-color 0.15s, color 0.15s; }
  .rp-share-inline:hover { border-color: rgba(0,232,122,0.4); color: #00e87a; }
  .rp-download-inline { background: rgba(0,232,122,0.08); border: 1px solid rgba(0,232,122,0.25); border-radius: 8px; color: #00e87a; font-size: 12px; font-family: 'DM Sans',sans-serif; padding: 8px 16px; cursor: pointer; font-weight: 600; }
  .rp-download-inline:hover { background: rgba(0,232,122,0.14); }

  /* Footer */
  .rp-footer { position: absolute; bottom: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: space-between; padding: 9px 36px; border-top: 1px solid rgba(255,255,255,0.06); background: #0d1117; z-index: 1; }
  .rp-footer-left, .rp-footer-right { font-family: 'DM Mono',monospace; font-size: 9px; color: #4b5c70; }
  .rp-footer-link { font-family: 'DM Mono',monospace; font-size: 9px; color: #00e87a; text-decoration: none; border: 1px solid rgba(0,232,122,0.2); border-radius: 100px; padding: 2px 9px; }

  /* Scenario page */
  .rp-scenario-banner { background: #0d1117; border-bottom: 1px solid rgba(255,255,255,0.06); padding: 18px 36px; position: relative; z-index: 1; }
  .rp-scenario-title { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 3px; }
  .rp-scenario-sub { font-size: 12px; color: #8fa3b8; }
  .rp-piti-card { background: #111827; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; overflow: hidden; position: relative; z-index: 1; }
  .rp-piti-header { padding: 13px 18px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: space-between; }
  .rp-piti-line { display: flex; align-items: center; justify-content: space-between; padding: 10px 18px; border-bottom: 1px solid rgba(255,255,255,0.03); }
  .rp-piti-line:last-child { border-bottom: none; }
  .rp-loan-opt { background: #111827; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 3px; position: relative; z-index: 1; }
  .rp-loan-opt.selected { border-color: rgba(0,232,122,0.35); background: rgba(0,232,122,0.05); }

  /* Location intel */
  .rp-loc-hero { display: flex; align-items: flex-start; gap: 18px; padding: 18px 36px; background: #0d1117; border-bottom: 1px solid rgba(255,255,255,0.06); position: relative; z-index: 1; }
  .rp-loc-circle { width: 64px; height: 64px; border-radius: 50%; border: 3px solid; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; background: rgba(74,222,128,0.08); flex-shrink: 0; }
  .rp-loc-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding: 10px 36px 0; }
  .rp-loc-card { background: #0d1117; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 15px 16px; position: relative; overflow: hidden; z-index: 1; }
  .rp-loc-card::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 3px; }
  .rp-loc-card-green::after { background: #4ade80; }
  .rp-loc-card-yellow::after { background: #fbbf24; }
  .rp-loc-card-orange::after { background: #fb923c; }
  .rp-loc-card-red::after { background: #f87171; }
  .rp-wildfire-card { margin: 10px 36px 0; background: rgba(251,146,60,0.06); border: 1px solid rgba(251,146,60,0.22); border-radius: 12px; padding: 16px 20px; display: flex; align-items: center; gap: 20px; position: relative; z-index: 1; }
  .rp-wf-chip { background: rgba(251,146,60,0.12); border: 1px solid rgba(251,146,60,0.22); border-radius: 10px; padding: 10px 14px; text-align: center; min-width: 80px; }
  .rp-str-list { list-style: none; display: flex; flex-direction: column; gap: 7px; }
  .rp-str-list li { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: #8fa3b8; line-height: 1.5; }
  .rp-str-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
  .rp-str-dot.green { background: #00e87a; }
  .rp-str-dot.orange { background: #fb923c; }
  .rp-rec-box { background: rgba(251,191,36,0.05); border: 1px solid rgba(251,191,36,0.18); border-radius: 12px; padding: 14px 18px; display: flex; align-items: flex-start; gap: 12px; position: relative; z-index: 1; }

  /* Decision score */
  .rp-ds-hero { display: flex; align-items: flex-start; gap: 28px; padding: 18px 36px; background: #0d1117; border-bottom: 1px solid rgba(255,255,255,0.06); position: relative; z-index: 1; }
  .rp-ds-levels { padding: 12px 36px; display: flex; flex-direction: column; gap: 8px; position: relative; z-index: 1; }
  .rp-ds-row { background: #0d1117; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 15px 18px; display: grid; grid-template-columns: 46px 1fr auto; gap: 14px; align-items: center; }
  .rp-ds-circle { width: 42px; height: 42px; border-radius: 50%; border: 3px solid; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; }
  .rp-weight-chip { font-family: 'DM Mono',monospace; font-size: 10px; padding: 2px 7px; border-radius: 100px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.06); color: #8fa3b8; }
  .rp-chip { padding: 4px 12px; border-radius: 100px; font-size: 10px; font-weight: 600; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.06); color: #8fa3b8; }
  .rp-chip.green { background: rgba(74,222,128,0.12); border-color: rgba(74,222,128,0.3); color: #4ade80; }
  .rp-legend { margin: 0 36px; background: #0d1117; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 13px 18px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; position: relative; z-index: 1; }
  .rp-cta-box { margin: 10px 36px 0; background: linear-gradient(135deg,rgba(0,232,122,0.10),rgba(0,180,89,0.05)); border: 1px solid rgba(0,232,122,0.22); border-radius: 14px; padding: 18px 22px; display: flex; align-items: center; justify-content: space-between; gap: 20px; position: relative; z-index: 1; }
  .rp-cta-btn { background: #00e87a; color: #000; font-weight: 700; font-size: 13px; padding: 11px 22px; border-radius: 9px; text-decoration: none; flex-shrink: 0; font-family: 'DM Sans',sans-serif; }
  .rp-disc { font-family: 'DM Mono',monospace; font-size: 9.5px; line-height: 1.7; color: #4b5c70; margin-bottom: 7px; position: relative; z-index: 1; }

  /* ── Mobile responsive ─────────────────────────────────────────────────────── */
  @media (max-width: 840px) {
    /* Book wrapper fills viewport */
    .rp-book  { width: 100%; padding-top: 56px; }
    .rp-page  { width: 100%; min-height: unset; padding-bottom: 28px; }

    /* Action bar — hide address on small screens, compress buttons */
    .rp-action-bar { padding: 8px 12px; gap: 8px; flex-wrap: wrap; }
    .rp-action-addr { display: none; }
    .rp-action-btns { gap: 6px; }
    .rp-btn-ghost, .rp-btn-primary { font-size: 11px; padding: 6px 10px; }

    /* Nav / header row — tighten padding */
    .rp-nav { padding: 10px 16px; }
    .rp-nav-logo img { height: 22px; }

    /* Hero */
    .rp-hero { height: 180px; }
    .rp-hero-overlay { left: 16px; right: 16px; padding-bottom: 12px; }
    .rp-hero-price { font-size: 24px; }
    .rp-hero-piti  { font-size: 18px; }
    .rp-hero-addr  { font-size: 11px; }
    .rp-status-badge { left: 16px; top: 10px; font-size: 9px; }

    /* Spec strip */
    .rp-spec-strip { padding: 0 16px; }
    .rp-spec-item  { font-size: 11px; padding: 10px 10px 10px 0; margin-right: 10px; }

    /* Content padding: all 36px horizontal margins → 16px */
    .rp-grid-2col, .rp-col { padding: 0; }
    .rp-scenario-banner, .rp-loc-hero, .rp-ds-hero, .rp-ds-levels,
    .rp-loc-grid, .rp-wildfire-card, .rp-legend, .rp-cta-box { padding-left: 16px; padding-right: 16px; }
    .rp-loc-grid, .rp-wildfire-card, .rp-legend, .rp-cta-box { margin-left: 0; margin-right: 0; }

    /* 2-column grids → single column */
    .rp-grid-2col { grid-template-columns: 1fr; }
    .rp-loc-grid  { grid-template-columns: 1fr 1fr; }

    /* Stat values */
    .rp-stat-val  { font-size: 18px; }
    .rp-hero-price { letter-spacing: -0.02em; }
    .rp-scenario-title { font-size: 16px; }

    /* Decision score rows */
    .rp-ds-row { grid-template-columns: 36px 1fr auto; gap: 10px; padding: 12px 14px; }
    .rp-ds-circle { width: 34px; height: 34px; font-size: 12px; }

    /* CTA box — stack on mobile */
    .rp-cta-box { flex-direction: column; align-items: flex-start; gap: 12px; }
    .rp-cta-btn  { width: 100%; text-align: center; }

    /* Footer */
    .rp-footer { padding: 8px 16px; position: relative; }
    .rp-footer-right { display: none; }

    /* Inline share buttons */
    .rp-share-inline, .rp-download-inline { font-size: 11px; padding: 7px 12px; }

    /* AVM row — stack on very small screens */
    .rp-avm-row { flex-wrap: wrap; }
    .rp-avm-item { min-width: 45%; }

    /* Tables — allow horizontal scroll */
    .rp-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .rp-table th, .rp-table td { font-size: 10px; padding: 6px 7px; }
  }

  @media (max-width: 480px) {
    .rp-loc-grid { grid-template-columns: 1fr; }
    .rp-hero { height: 150px; }
    .rp-hero-price { font-size: 20px; }
    .rp-hero-piti  { font-size: 16px; }
  }
`;

// ── Export ─────────────────────────────────────────────────────────────────────
export default function PropertyReportPage() {
  return (
    // page-standalone triggers globals.css :has() rule that resets body to display:block + overflow:visible
    <div className="page-standalone" style={{ background: '#000', minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Suspense fallback={
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#080c12', color: '#8fa3b8', fontFamily: 'sans-serif' }}>
          Loading report…
        </div>
      }>
        <ReportInner />
      </Suspense>
    </div>
  );
}
