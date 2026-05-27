'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { SignInButton, SignedIn, SignedOut, useUser } from '@clerk/nextjs';
import Link from 'next/link';
import AppNav from '../components/AppNav';
import { normalizeListingStatus } from '@/prefetchGrokProperty';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Comp {
  address: string;
  sold_price: number;
  sold_date: string;
  sqft: number | null;
  price_per_sqft: number | null;
  days_on_market?: number | null;
}

interface LocationSubScore {
  metric:              string;
  score:               number;
  rating:              string;
  description:         string;
  // Wildfire-specific extras
  fire_factor?:        number | null;
  risk_30yr_pct?:      number | null;
  us_risk_percentile?: number | null;
}

interface LocationIntelligence {
  overall_score:  number;
  sub_scores:     LocationSubScore[];
  narrative:      string;
  strengths:      string[];
  tradeoffs:      string[];
  recommendation: string;
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
  original_list_date:        string | null;
  estimated_piti:            number | null;
  rate_used:                 number | null;
  life_fit_score:            number | null;
  key_highlights:            string[] | null;
  comparable_sales:          Comp[]   | null;
  grok_intelligence_summary: string   | null;
  buyer_strategy:            string   | null;
  confidence:                string   | null;
  data_freshness:            string   | null;
  photo_url:                 string   | null;
  // Deep analysis fields
  zillow_estimate:           number | null;
  redfin_estimate:           number | null;
  zillow_saves:              number | null;
  zillow_views:              number | null;
  market_median_dom:         number | null;
  market_sale_to_list:       number | null;
  market_median_price:       number | null;
  deep_analysis:             boolean | null;
  // Location Intelligence fields (simple — used for L4 score computation)
  school_score:                      number | null;
  walk_score:                        number | null;
  commute_minutes:                   number | null;
  neighborhood_appreciation_3yr_pct: number | null;
  // Rich Location Intelligence (deep analysis only)
  location_intelligence: LocationIntelligence | null;
}

interface MapUrls {
  street_view_url: string | null;
  static_map_url:  string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt$ = (n: number | null | undefined) =>
  n != null ? '$' + Math.round(n).toLocaleString() : '—';

/** Client-side PITI for a given scenario (mirrors server calcPITI but with variable down%). */
function calcScenarioPITI(
  price: number, downPct: number, rate: number,
  taxRate = 0.012, insRate = 0.005, hoaMonthly = 0,
): number {
  const principal = price * (1 - downPct / 100);
  const r = rate / 100 / 12;
  const n = 360;
  const pi = r > 0
    ? (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
    : principal / n;
  return Math.round(pi + (price * taxRate) / 12 + (price * insRate) / 12 + hoaMonthly);
}

function metricAccent(metric: string): string {
  const m = metric.toLowerCase();
  if (m.includes('wildfire') || m.includes('fire')) return '#f87171';
  if (m.includes('walk'))                            return '#60a5fa';
  if (m.includes('transit'))                         return '#818cf8';
  if (m.includes('bike') || m.includes('cycle'))     return '#34d399';
  if (m.includes('school'))                          return '#4ade80';
  if (m.includes('safety') || m.includes('crime'))   return '#4ade80';
  return '#fbbf24'; // amenities, commute, other
}

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

// ── localStorage cache helpers ─────────────────────────────────────────────────
// Results are cached client-side so navigating back from Track 5 (or any tab)
// never re-streams. TTL: 24h for active listings, 7d for sold/off-market.

function normKey(addr: string): string {
  return addr.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 100);
}

function lsRead(addr: string): { result: PropResult; mapUrls: MapUrls | null } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`pi_v1_${normKey(addr)}`);
    if (!raw) return null;
    const { result, mapUrls: m, cachedAt } = JSON.parse(raw) as {
      result: PropResult; mapUrls: MapUrls | null; cachedAt: number;
    };
    if (!result || !cachedAt) return null;
    const age = Date.now() - cachedAt;
    const ttl = /sold|off market|withdrawn/i.test(result.current_status ?? '')
      ? 7 * 86_400_000 : 86_400_000; // 7d sold, 24h active
    if (age >= ttl) { localStorage.removeItem(`pi_v1_${normKey(addr)}`); return null; }
    return { result, mapUrls: m ?? null };
  } catch { return null; }
}

function lsWrite(addr: string, result: PropResult, mapUrls: MapUrls | null) {
  if (typeof window === 'undefined') return;
  const key     = `pi_v1_${normKey(addr)}`;
  const payload = JSON.stringify({ result, mapUrls, cachedAt: Date.now() });
  try {
    localStorage.setItem(key, payload);
  } catch {
    // Quota exceeded — evict ALL cached property intel entries, then retry once
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('pi_v1_') || k.startsWith('pi_sid_'))
        .forEach(k => localStorage.removeItem(k));
      localStorage.setItem(key, payload);
    } catch {}
  }
}

function lsEvict(addr: string) {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(`pi_v1_${normKey(addr)}`); } catch {}
}

// ── Main inner component ───────────────────────────────────────────────────────
function PropertyIntelInner() {
  const searchParams  = useSearchParams();
  const address       = (searchParams?.get('address') ?? '').trim();

  // Scenario params threaded from chat DSC "Full Analysis ↗" — user's adjusted scenario
  const scenarioDown   = searchParams?.get('down')   != null ? Number(searchParams.get('down'))   : null;
  const scenarioRate   = searchParams?.get('rate')   != null ? Number(searchParams.get('rate'))   : null;
  const scenarioIncome = searchParams?.get('income') != null ? Number(searchParams.get('income')) : null;
  const scenarioDebt   = searchParams?.get('debt')   != null ? Number(searchParams.get('debt'))   : null;

  const [finalResult,    setFinalResult]    = useState<PropResult | null>(null);
  const [mapUrls,        setMapUrls]        = useState<MapUrls | null>(null);
  const [redfinPhotoUrl, setRedfinPhotoUrl] = useState<string | null>(null);
  const [photoReady,     setPhotoReady]     = useState(false);
  const [mapView,     setMapView]     = useState<'street' | 'satellite'>('street');
  const [cacheHit,    setCacheHit]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [loadingMsg,  setLoadingMsg]  = useState('Checking for cached report…');
  const [summary,     setSummary]     = useState('');
  const [error,       setError]       = useState('');
  const [copied,      setCopied]      = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [savedVault,  setSavedVault]  = useState(false);
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepStep,    setDeepStep]    = useState(0);

  const abortRef     = useRef<AbortController | null>(null);
  const deepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Session persistence — L2 + L3 + L4 auto-save ────────────────────────────
  // Fires when deep analysis completes. Uses the same formulas already in the
  // Track 5 CTA block below — no new scoring logic, just a parallel DB write.
  // If ?sid=<id> is in the URL (coming from Track 5 or check-property), PATCH
  // that session so all three pages are linked as one evaluation.
  const { isSignedIn }  = useUser();
  const incomingSid     = searchParams?.get('sid') ?? null; // session ID threaded from my-home or Track 5
  const [piSessionId, setPiSessionId] = useState<string | null>(null);
  const deepSavedRef    = useRef(''); // tracks last saved address (deep analysis)

  // ── Existing session fetch — pull L1/L2 written by Run My Numbers ─────────
  // When arriving with ?sid= or when signed in with a known address, fetch any
  // pre-existing buyer_evaluation_session so L1 (affordability) from the
  // my-home → chat journey is included in the Track 5 composite.
  interface ExistingSession {
    id: string;
    l1_score: number | null; l1_summary: string | null;
    l2_score: number | null; l2_summary: string | null;
    composite_score: number | null;
  }
  const [existingSession, setExistingSession] = useState<ExistingSession | null>(null);
  const sessionFetchedRef = useRef('');

  useEffect(() => {
    if (!isSignedIn || !address) return;
    if (sessionFetchedRef.current === address) return;
    sessionFetchedRef.current = address;

    const doFetch = incomingSid
      ? fetch(`/api/buyer-sessions/${incomingSid}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.session) setExistingSession(d.session); })
      : fetch(`/api/buyer-sessions?address=${encodeURIComponent(address)}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.session) setExistingSession(d.session); });
    doFetch.catch(() => {});
  }, [isSignedIn, address, incomingSid]);

  useEffect(() => {
    if (!isSignedIn) return;
    if (!finalResult?.deep_analysis) return;     // wait for deep analysis
    if (!address) return;
    if (deepSavedRef.current === address) return; // already saved for this address

    const d2 = finalResult;
    const list = d2.current_list_price;

    // L3 — same formula as JSX CTA block
    const compsAvg = d2.comparable_sales?.length
      ? d2.comparable_sales.reduce((s, c) => s + c.sold_price, 0) / d2.comparable_sales.length
      : null;
    const avm = d2.zillow_estimate ?? d2.redfin_estimate ?? compsAvg;
    let l3Score: number | null = null;
    let l3Summary: string | null = null;
    if (list && avm) {
      const prem    = (list - avm) / avm;
      l3Score       = prem < -0.05 ? 92 : prem < 0 ? 84 : prem < 0.03 ? 76
                    : prem < 0.07 ? 65 : prem < 0.12 ? 52 : prem < 0.20 ? 38 : 22;
      const premStr = `${prem >= 0 ? '+' : ''}${(prem * 100).toFixed(1)}%`;
      const compsN  = d2.comparable_sales?.length ?? 0;
      l3Summary     = `${address} — Listed $${Math.round(list / 1000)}K vs AVM $${Math.round(avm / 1000)}K (${premStr}${compsN > 0 ? `, ${compsN} comps` : ''}).`;
    }

    // L2 — market conditions (deep analysis only)
    // DOM: prefer market_median_dom → average comp DOMs → property's own DOM
    const compDoms = (d2.comparable_sales ?? [])
      .map(c => c.days_on_market)
      .filter((n): n is number => n != null);
    const compDomAvg = compDoms.length >= 2
      ? Math.round(compDoms.reduce((a: number, b: number) => a + b, 0) / compDoms.length)
      : null;
    const dom = d2.market_median_dom ?? compDomAvg ?? d2.days_on_market ?? null;
    const stl = d2.market_sale_to_list;
    let l2Score: number | null = null;
    let l2Summary: string | null = null;
    if (dom != null || stl != null) {
      const subs: number[] = [];
      if (dom != null) subs.push(dom > 90 ? 90 : dom > 60 ? 80 : dom > 45 ? 68 : dom > 30 ? 55 : dom > 15 ? 42 : 32);
      if (stl != null) subs.push(stl < 0.95 ? 90 : stl < 0.98 ? 80 : stl < 1.00 ? 68 : stl < 1.02 ? 55 : stl < 1.05 ? 42 : 30);
      l2Score   = Math.round(subs.reduce((a, b) => a + b, 0) / subs.length);
      const pts: string[] = [];
      if (dom != null) pts.push(`Median DOM ${dom}d${compDomAvg != null && d2.market_median_dom == null ? ' (from comps)' : ''}`);
      if (stl != null) pts.push(`sale-to-list ${(stl * 100).toFixed(1)}%`);
      l2Summary = pts.join(', ') + '.';
    }

    // L4 — location intelligence (deep analysis only)
    // Prefer location_intelligence.overall_score (Grok-computed, wildfire-aware)
    // over our manual formula which doesn't know about wildfire/climate risk.
    const li = d2.location_intelligence;
    let l4Score: number | null = null;
    let l4Summary: string | null = null;
    if (li?.overall_score != null) {
      l4Score   = Math.min(100, Math.max(0, Math.round(li.overall_score)));
      const pts = (li.sub_scores ?? []).slice(0, 3).map(s => `${s.metric}: ${s.rating}`);
      l4Summary = pts.length ? pts.join(', ') + '.' : `Location score ${l4Score}/100.`;
    } else {
      // Fallback: manual computation from individual fields
      const school  = d2.school_score;
      const walk    = d2.walk_score;
      const commute = d2.commute_minutes;
      const apprec  = d2.neighborhood_appreciation_3yr_pct;
      if (school != null || walk != null || commute != null || apprec != null) {
        const subs: number[] = [];
        if (school  != null) subs.push(Math.min(100, Math.max(0, school * 10)));
        if (walk    != null) subs.push(Math.min(100, Math.max(0, walk)));
        if (commute != null) subs.push(commute <= 15 ? 90 : commute <= 25 ? 80 : commute <= 35 ? 70 : commute <= 45 ? 58 : commute <= 60 ? 44 : 30);
        if (apprec  != null) subs.push(apprec >= 12 ? 92 : apprec >= 7 ? 84 : apprec >= 3 ? 72 : apprec >= 0 ? 55 : 35);
        l4Score = Math.min(100, Math.max(0, Math.round(subs.reduce((a, b) => a + b, 0) / subs.length)));
        const pts: string[] = [];
        if (school  != null) pts.push(`Schools ${school}/10`);
        if (walk    != null) pts.push(`Walk ${walk}`);
        if (commute != null) pts.push(`${commute}min commute`);
        if (apprec  != null) pts.push(`${apprec >= 0 ? '+' : ''}${apprec}% 3yr appreciation`);
        l4Summary = pts.join(', ') + '.';
      }
    }

    // Level model:
    //   l2_score = Property Evaluation (AVM gap) — check-property is primary; fall back to saving here if not yet set
    //   l3_score = Market Intelligence (DOM/sale-to-list)
    //   l4_score = Location Intelligence
    if (l2Score == null && l4Score == null && l3Score == null) return; // nothing to save

    const payload: Record<string, unknown> = { property_address: address };
    // Market conditions → l3
    if (l2Score != null) { payload.l3_score = l2Score; payload.l3_summary = l2Summary; }
    // AVM comparison → l2 (only if check-property hasn't already set it on this session)
    if (l3Score != null && !existingSession?.l2_score) {
      payload.l2_score = l3Score;
      payload.l2_summary = l3Summary;
    }
    if (l4Score != null) { payload.l4_score = l4Score; payload.l4_summary = l4Summary; }

    deepSavedRef.current = address;

    // PATCH the linked session if we arrived with ?sid=, else POST (upsert by address).
    const savePromise = incomingSid
      ? fetch(`/api/buyer-sessions/${incomingSid}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        })
      : fetch('/api/buyer-sessions', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        });

    savePromise
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.session?.id) {
          setPiSessionId(d.session.id);
          // Refresh existingSession so L1 (from prior Run My Numbers) is included in composite
          setExistingSession(prev => d.session.l1_score != null || prev?.l1_score != null
            ? { ...d.session, l1_score: d.session.l1_score ?? prev?.l1_score ?? null, l1_summary: d.session.l1_summary ?? prev?.l1_summary ?? null }
            : d.session
          );
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, finalResult, address]);

  const d: Partial<PropResult> = finalResult ?? {};

  // ── Scenario-aware PITI ────────────────────────────────────────────────────
  // When arriving from chat DSC "Full Analysis ↗", use the user's scenario (down %, rate)
  // instead of the cached 20%-down default. Falls back to cached value when no params.
  const hasScenario  = scenarioDown != null;
  const displayDown  = scenarioDown ?? 20;
  const displayRate  = scenarioRate ?? d.rate_used ?? null;
  // Use a tax rate from the deep result if available (it's stored inside grok_result)
  const resultTaxRate = (d as any).tax_rate_effective ?? 0.012;
  const displayPiti  = (hasScenario && d.current_list_price != null && displayRate != null)
    ? calcScenarioPITI(d.current_list_price, displayDown, displayRate, resultTaxRate)
    : d.estimated_piti ?? null;
  // DTI — only when income is provided; includes other monthly debts when passed
  const displayDTI = (scenarioIncome != null && scenarioIncome > 0 && displayPiti != null)
    ? (((displayPiti + (scenarioDebt ?? 0)) / (scenarioIncome / 12)) * 100).toFixed(0)
    : null;

  // photoUrl: for street view, fall back to Redfin CDN photo when Google Maps is unavailable
  const photoUrl = mapView === 'street'
    ? (mapUrls?.street_view_url ?? redfinPhotoUrl ?? null)
    : (mapUrls?.static_map_url ?? null);

  // ── Query ──────────────────────────────────────────────────────────────────
  const runQuery = useCallback(async (opts?: { force?: boolean }) => {
    if (!address) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const sig = abortRef.current.signal;

    setFinalResult(null); setMapUrls(null); setRedfinPhotoUrl(null);
    setPhotoReady(false); setCacheHit(false);
    setSummary(''); setError('');
    setLoadingMsg('Checking for cached report…');
    setLoading(true);

    try {
      // 1 — try DB cache (GET) — skipped on force-refresh so we always stream fresh
      if (!opts?.force) {
        const cd = await fetch(`/api/beta/grok-property?address=${encodeURIComponent(address)}`, { signal: sig })
          .then(r => r.json()).catch(() => null);

        if (cd?.cached) {
          setCacheHit(true);
          if (cd.map_urls) setMapUrls(cd.map_urls);
          const cachedPhoto: string | null = (cd.result as any)?.photo_url ?? null;
          if (cachedPhoto) setRedfinPhotoUrl(cachedPhoto);
          setFinalResult(cd.result as PropResult);
          setSummary(cd.result?.grok_intelligence_summary ?? '');
          setLoading(false);
          // Background: fetch Redfin photo if not already cached (for older Supabase entries)
          if (!cachedPhoto) {
            fetch('/api/property/lookup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ address }),
            })
              .then(r => r.ok ? r.json() : null)
              .then(lj => {
                if (lj?.ok && lj.data?.photoUrl) {
                  const pUrl = lj.data.photoUrl as string;
                  setRedfinPhotoUrl(pUrl);
                  // Persist into finalResult so lsWrite stores it → report page can read it
                  setFinalResult(prev => prev ? { ...prev, photo_url: pUrl } : prev);
                }
              })
              .catch(() => {});
          }
          return;
        }
      }

      // 2 — cache miss: get Redfin facts then stream Grok
      setLoadingMsg('Pulling property data…');
      let redfin: Record<string, unknown> | null = null;
      try {
        const lr = await fetch('/api/property/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address }),
          signal: sig,
        });
        const lj = await lr.json();
        if (lr.ok && lj.ok && lj.data) {
          const d = lj.data;
          redfin = {
            current_status:     normalizeListingStatus(d.listingStatus),
            current_list_price: d.price ?? null,
            bedrooms:           d.beds ?? null,
            bathrooms:          d.baths ?? null,
            sqft:               d.sqft ?? null,
            year_built:         d.yearBuilt ?? null,
            days_on_market:     d.daysOnMarket ?? null,
            last_sold_price:    d.lastSalePrice ?? null,
            last_sold_date:     d.lastSaleDate ?? null,
            lot_size_sqft:      d.lotSqft ?? null,
            tax_rate_effective: d.taxRateEffective ?? null,
            hoa_monthly:        d.hoaMonthly ?? null,
            photo_url:          (d.photoUrl as string | null) ?? null,
          };
          // Store Redfin CDN photo as independent fallback (survives meta_early overwrite)
          if (d.photoUrl) {
            setRedfinPhotoUrl(d.photoUrl as string);
          }
        }
      } catch { /* proceed without Redfin data */ }

      // 3 — stream Grok
      setLoadingMsg('Generating intelligence with Grok 4…');
      const postRes = await fetch('/api/beta/grok-property', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, redfin }),
        signal: sig,
      });

      if (!postRes.ok || !postRes.body) {
        setError('Could not generate property intelligence. Try again.');
        setLoading(false);
        return;
      }

      const reader = postRes.body.getReader();
      const dec    = new TextDecoder();
      let buf      = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(t.slice(6));
            if (ev.meta_early) {
              if (ev.meta_early.street_view_url || ev.meta_early.static_map_url) {
                setMapUrls({ street_view_url: ev.meta_early.street_view_url, static_map_url: ev.meta_early.static_map_url });
              }
            }
            if (ev.done && ev.result) {
              setFinalResult(ev.result as PropResult);
              setSummary((ev.result as PropResult).grok_intelligence_summary ?? '');
              setLoading(false);
            }
            if (ev.error) {
              setError(ev.error);
              setLoading(false);
            }
          } catch { /* skip malformed SSE chunks */ }
        }
      }
      setLoading(false);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message ?? 'Could not load property intelligence');
      setLoading(false);
    }
  }, [address]);

  // ── localStorage check — restore instantly before ever calling the API ─────
  // Works across tabs (target="_blank" from Track 5), navigations, and restarts.
  useEffect(() => {
    if (!address) return;

    const cached = lsRead(address);
    if (cached) {
      setFinalResult(cached.result);
      if (cached.mapUrls) setMapUrls(cached.mapUrls);
      // Use cached Redfin photo as fallback for Street View failures
      const lsPhoto: string | null = (cached.result as any).photo_url
        ?? cached.mapUrls?.street_view_url ?? null;
      if (lsPhoto) setRedfinPhotoUrl(lsPhoto);
      setSummary(cached.result.grok_intelligence_summary ?? '');
      setCacheHit(true);
      setLoading(false);
      // Background: if no Redfin CDN photo stored, do quick lookup to get it
      if (!(cached.result as any).photo_url) {
        fetch('/api/property/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address }),
        })
          .then(r => r.ok ? r.json() : null)
          .then(lj => { if (lj?.ok && lj.data?.photoUrl) setRedfinPhotoUrl(lj.data.photoUrl as string); })
          .catch(() => {});
      }
      return; // skip API entirely
    }

    runQuery();
    return () => { abortRef.current?.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // ── Persist result to localStorage once settled ───────────────────────────
  useEffect(() => {
    if (!address || !finalResult) return;
    lsWrite(address, finalResult, mapUrls);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalResult, mapUrls]);

  const DEEP_STEPS = [
    'Searching Redfin for current listing data…',
    'Pulling comparable sales from Zillow and MLS…',
    'Analyzing market trends for this ZIP code…',
    'Compiling your full intelligence report…',
  ];

  const runDeepAnalysis = useCallback(async () => {
    if (!address || deepLoading) return;
    setDeepLoading(true);
    setDeepStep(0);
    deepTimerRef.current = setInterval(() => {
      setDeepStep(s => Math.min(s + 1, DEEP_STEPS.length - 1));
    }, 20_000);

    try {
      const postRes = await fetch('/api/beta/grok-property', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          deep: true,
          redfin: finalResult ? {
            current_status:     finalResult.current_status     ?? undefined,
            current_list_price: finalResult.current_list_price ?? undefined,
            bedrooms:           finalResult.bedrooms           ?? undefined,
            bathrooms:          finalResult.bathrooms          ?? undefined,
            sqft:               finalResult.sqft               ?? undefined,
            year_built:         finalResult.year_built         ?? undefined,
            lot_size_sqft:      finalResult.lot_size_sqft      ?? undefined,
            last_sold_price:    finalResult.last_sold_price    ?? undefined,
            last_sold_date:     finalResult.last_sold_date     ?? undefined,
          } : null,
        }),
      });
      if (!postRes.ok || !postRes.body) {
        setDeepLoading(false);
        if (deepTimerRef.current) clearInterval(deepTimerRef.current);
        return;
      }
      const reader = postRes.body.getReader();
      const dec    = new TextDecoder();
      let buf      = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(t.slice(6));
            if (ev.done && ev.result) {
              setFinalResult(ev.result as PropResult);
              setSummary((ev.result as PropResult).grok_intelligence_summary ?? '');
              setCacheHit(false);
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* non-fatal */ }

    setDeepLoading(false);
    setDeepStep(0);
    if (deepTimerRef.current) clearInterval(deepTimerRef.current);
  }, [address, deepLoading]);

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

  const handleRefresh = () => {
    lsEvict(address);
    runQuery({ force: true });
  };

  // ── Linked session — hoisted so both "Run My Numbers" and Track 5 IIFE share it ──
  // Priority: session created by this page (piSessionId) → incoming ?sid → existing session
  // from DB for this address. Used to (a) seed the localStorage bridge before navigating
  // to chat so the slider card PATCHes rather than creates, and (b) build the Track 5 URL.
  const linkedSessionId = piSessionId || incomingSid || existingSession?.id || null;

  // ── Derived display values ─────────────────────────────────────────────────
  const statusKey = (d.current_status ?? '').toLowerCase();
  const statusCfg = STATUS_CFG[statusKey] ?? { bg: 'rgba(148,163,184,0.1)', color: '#94a3b8', label: (d.current_status ?? '').toUpperCase() };
  const confCfg   = CONF_CFG[(d.confidence ?? '').toLowerCase()] ?? CONF_CFG.medium;
  const isBuyer   = statusKey === 'for sale' || statusKey === 'pending';
  const chatUrl   = (() => {
    const price = d.current_list_price;
    const rate  = d.rate_used ?? 6.875;
    // Best available value estimate for homeowner context
    const compsAvg = d.comparable_sales?.length
      ? Math.round(d.comparable_sales.reduce((s, c) => s + c.sold_price, 0) / d.comparable_sales.length)
      : null;
    const avmEst = d.zillow_estimate ?? d.redfin_estimate ?? compsAvg ?? price;
    let sq: string;
    if (isBuyer && price) {
      sq = `I'm looking at buying ${address} listed at $${Math.round(price).toLocaleString()}. Current 30-year rate is ${rate.toFixed(2)}%.`;
    } else if (avmEst) {
      sq = `Run homeowner analysis for ${address}: estimated value $${Math.round(avmEst).toLocaleString()}, current 30-year rate is ${rate.toFixed(2)}%. Show me refi savings and break-even.`;
    } else {
      sq = `Run homeowner analysis for ${address} at today's ${rate.toFixed(2)}% rate. Show refi savings and break-even.`;
    }
    const p = new URLSearchParams({ sq, from: '/property-intel', fromLabel: 'Property Intelligence' });
    // Pass the address so chat seeds the slider card with journeyAddress
    // — this wires the "Property Intelligence →" chip and keeps the analysis anchored
    // to this property rather than starting from scratch.
    p.set('cmaAddress', address);
    return `/chat?${p.toString()}`;
  })();

  if (!address) {
    return (
      <div className="page-standalone pi-root">
        <AppNav />
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '80px 20px 60px', textAlign: 'center' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🏠</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>Property Intelligence</h2>
          <p style={{ color: '#eaf8f7', fontSize: '0.9rem', lineHeight: 1.6 }}>
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
        @keyframes shimmer   { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes fieldIn   { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes blink     { 50%{opacity:0} }
        @keyframes spin      { to{transform:rotate(360deg)} }
        @keyframes photoFade { from{opacity:0} to{opacity:1} }
        @keyframes pulseGlow { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes stepIn    { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
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
          .li-sub-grid    { grid-template-columns:repeat(2,1fr) !important; }
          .li-str-grid    { grid-template-columns:1fr !important; }
        }
        @media (max-width:420px) {
          .li-sub-grid    { grid-template-columns:1fr !important; }
        }
      `}</style>

      <div className="page-standalone pi-root">
        <AppNav />
        <div style={{ maxWidth: 920, margin: '0 auto', padding: '24px 16px 80px' }}>

          {/* ── Loading state ─────────────────────────────────────────────── */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '90px 20px', gap: 20 }}>
              <div className="spin" style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.08)', borderTopColor: '#4ade80' }} />
              <div style={{ fontSize: '0.88rem', color: '#eaf8f7' }}>{loadingMsg}</div>
              {loadingMsg.includes('Grok') && (
                <div style={{ fontSize: '0.72rem', color: '#eaf8f7', maxWidth: 280, textAlign: 'center', lineHeight: 1.5 }}>
                  Grok 4 is researching comps, market context, and buyer intelligence. This takes 30–60 seconds on first run.
                </div>
              )}
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
                      onError={() => {
                        if (photoUrl === redfinPhotoUrl) {
                          // Redfin CDN photo also failed — clear both so spinner stops
                          setRedfinPhotoUrl(null);
                        } else {
                          // Google Maps Street View 404 — clear it; photoUrl falls back to redfinPhotoUrl
                          setMapUrls(prev => prev ? { ...prev, street_view_url: null } : null);
                        }
                        setPhotoReady(false);
                      }}
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
                    {/* PITI — dynamic: uses scenario down%/rate when provided from chat */}
                    <div className="pi-hero-piti" style={{ textAlign: 'right' }}>
                      {displayPiti != null
                        ? <div className="fi" style={{ fontSize: '1.9rem', fontWeight: 800, color: '#4ade80', lineHeight: 1 }}>{fmt$(displayPiti)}/mo</div>
                        : <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Sk w={130} h={38} /></div>
                      }
                      <div style={{ fontSize: '0.66rem', color: '#eaf8f7', marginTop: 4, letterSpacing: '0.06em' }}>EST. MONTHLY PITI</div>
                      {displayRate != null && (
                        <div className="fi" style={{ fontSize: '0.64rem', color: '#eaf8f7', marginTop: 2 }}>
                          @ {displayRate.toFixed(2)}% · {displayDown}% down
                          {hasScenario && displayDown !== 20 && (
                            <span style={{ color: '#4ade80', marginLeft: 5, fontWeight: 700 }}>· Your Scenario</span>
                          )}
                        </div>
                      )}
                      {/* DTI context when income was passed from chat */}
                      {displayDTI != null && (
                        <div className="fi" style={{ fontSize: '0.62rem', color: '#4ade80', marginTop: 2, fontWeight: 600 }}>
                          DTI {displayDTI}% · ${Math.round(scenarioIncome! / 12).toLocaleString()}/mo income{scenarioDebt != null && scenarioDebt > 0 ? ` · $${scenarioDebt.toLocaleString()}/mo other debts` : ''}
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
                    <i className={`fa-solid ${icon}`} style={{ color: '#eaf8f7', fontSize: '0.7rem', width: 14, textAlign: 'center' }} />
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
                    <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#eaf8f7', marginBottom: 14 }}>Key Highlights</div>
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

                  {/* Buyer Strategy — only when deep analysis available */}
                  {d.buyer_strategy && (
                    <div className="fi" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)', borderRadius: 14, padding: 20 }}>
                      <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#fbbf24', marginBottom: 10 }}>Buyer Strategy</div>
                      <p style={{ fontSize: '0.84rem', color: '#cbd5e1', lineHeight: 1.75, margin: 0 }}>{d.buyer_strategy}</p>
                    </div>
                  )}
                </div>

                {/* Right — Metrics + Comps + Confidence */}
                <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>

                  {/* 2×2 metrics */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { val: d.life_fit_score,  fmt: (v: number) => String(v),  color: '#4ade80', label: 'Life-Fit Score', sub: null },
                      { val: d.days_on_market,  fmt: (v: number) => v === 0 ? 'New' : `${v}d`, color: '#f1f5f9', label: 'Days on Market', sub: d.original_list_date ?? null },
                      { val: d.price_per_sqft,  fmt: (v: number) => `$${v}`,    color: '#f1f5f9', label: 'Price / SqFt',  sub: null },
                      { val: d.last_sold_price, fmt: (v: number) => fmt$(v),    color: '#fbbf24', label: 'Last Sold',      sub: d.last_sold_date },
                    ].map(({ val, fmt: fmtFn, color, label, sub }, i) => (
                      <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                        {val != null
                          ? <div className="fi" style={{ fontSize: i === 3 ? '1.5rem' : '2rem', fontWeight: 800, color, lineHeight: 1 }}>{fmtFn(val as number)}</div>
                          : loading
                            ? <div style={{ display: 'flex', justifyContent: 'center' }}><Sk w={52} h={34} /></div>
                            : <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#eaf8f7', lineHeight: 1 }}>—</div>
                        }
                        {sub && <div className="fi" style={{ fontSize: '0.59rem', color: '#eaf8f7', marginTop: 3 }}>{sub}</div>}
                        <div style={{ fontSize: '0.59rem', color: '#eaf8f7', marginTop: 5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Deep analysis market stats — only when available */}
                  {(d.market_median_dom != null || d.market_sale_to_list != null || d.market_median_price != null) && (
                    <div className="fi" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {[
                        { val: d.market_median_dom,   fmt: (v: number) => `${v}d`,              color: '#94a3b8', label: 'Area Avg DOM' },
                        { val: d.market_sale_to_list, fmt: (v: number) => `${v}%`,              color: '#94a3b8', label: 'Sale/List' },
                        { val: d.market_median_price, fmt: (v: number) => fmt$(v),              color: '#94a3b8', label: 'Median Price' },
                      ].map(({ val, fmt: fmtFn, color, label }, i) => val != null ? (
                        <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '1.1rem', fontWeight: 700, color, lineHeight: 1 }}>{fmtFn(val)}</div>
                          <div style={{ fontSize: '0.56rem', color: '#eaf8f7', marginTop: 4, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
                        </div>
                      ) : null)}
                    </div>
                  )}

                  {/* Zillow / Redfin estimates — only when available */}
                  {(d.zillow_estimate != null || d.redfin_estimate != null) && (
                    <div className="fi" style={{ display: 'flex', gap: 8 }}>
                      {d.zillow_estimate != null && (
                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.65rem', color: '#eaf8f7', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Zillow Est.</span>
                          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#60a5fa' }}>{fmt$(d.zillow_estimate)}</span>
                        </div>
                      )}
                      {d.redfin_estimate != null && (
                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.65rem', color: '#eaf8f7', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Redfin Est.</span>
                          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f87171' }}>{fmt$(d.redfin_estimate)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Comps */}
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20, flex: 1 }}>
                    <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#eaf8f7', marginBottom: 14 }}>Recent Comps</div>
                    {d.comparable_sales?.length ? (
                      <div>
                        {d.comparable_sales.map((c, i) => (
                          <div key={i} className="fi" style={{ padding: '10px 0', borderBottom: i < d.comparable_sales!.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{c.address}</div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.71rem', color: '#eaf8f7' }}>
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
                    <span style={{ fontSize: '0.78rem', color: '#eaf8f7' }}>Confidence</span>
                    {d.confidence
                      ? <span className="fi" style={{ padding: '3px 10px', borderRadius: 99, fontSize: '0.67rem', fontWeight: 700, background: confCfg.bg, color: confCfg.color, border: `1px solid ${confCfg.border}` }}>
                          {d.confidence.charAt(0).toUpperCase() + d.confidence.slice(1)}
                        </span>
                      : <Sk w={50} h={20} r={99} />
                    }
                  </div>
                </div>
              </div>

              {/* ── Deep analysis progress ────────────────────────────────── */}
              {deepLoading && (
                <div style={{ padding: '20px 28px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(139,92,246,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div className="spin" style={{ width: 16, height: 16, border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#a78bfa', borderRadius: '50%', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#a78bfa' }}>Full Market Analysis in Progress</span>
                  </div>
                  {DEEP_STEPS.map((step, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', opacity: i <= deepStep ? 1 : 0.25, animation: i === deepStep ? 'pulseGlow 2s ease infinite' : 'none', fontSize: '0.78rem', color: i < deepStep ? '#4ade80' : i === deepStep ? '#e2e8f0' : '#eaf8f7', transition: 'opacity 0.4s' }}>
                      <span style={{ fontSize: '0.6rem', width: 14, textAlign: 'center', flexShrink: 0 }}>{i < deepStep ? '✓' : i === deepStep ? '●' : '○'}</span>
                      {step}
                    </div>
                  ))}
                  <div style={{ marginTop: 12, fontSize: '0.68rem', color: '#eaf8f7' }}>Takes 60–90 seconds. You can navigate away — your report will be cached when ready.</div>
                </div>
              )}

              {/* ── Location Intelligence ────────────────────────────────── */}
              {d.location_intelligence && (() => {
                const li = d.location_intelligence;
                const liColor = li.overall_score >= 70 ? '#4ade80' : li.overall_score >= 50 ? '#fbbf24' : '#f87171';
                const circ    = 2 * Math.PI * 26; // r=26
                const fill    = circ * (li.overall_score / 100);
                const isWildfire = (s: LocationSubScore) => s.metric.toLowerCase().includes('wildfire') || s.metric.toLowerCase().includes('fire');
                const regular    = li.sub_scores?.filter(s => !isWildfire(s)) ?? [];
                const wildfire   = li.sub_scores?.find(s => isWildfire(s)) ?? null;
                return (
                  <div className="fi" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(20,184,166,0.02)' }}>
                    {/* Header */}
                    <div style={{ padding: '18px 28px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '1rem' }}>📍</span>
                      <span style={{ fontWeight: 700, fontSize: '0.93rem', color: '#e2e8f0' }}>Location Intelligence</span>
                      <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(20,184,166,0.1)', color: '#2dd4bf', border: '1px solid rgba(20,184,166,0.25)', borderRadius: 4, padding: '2px 7px' }}>L4 · Deep Analysis</span>
                    </div>

                    {/* Overall score */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 18px', margin: '0 28px 16px' }}>
                      <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
                        <svg width="64" height="64" viewBox="0 0 64 64" style={{ position: 'absolute', inset: 0 }}>
                          <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                          <circle cx="32" cy="32" r="26" fill="none" stroke={liColor} strokeWidth="5"
                            strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
                            transform="rotate(-90 32 32)" style={{ transition: 'stroke-dasharray 0.8s ease' }} />
                        </svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 900, color: liColor }}>{li.overall_score}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4b6080', marginBottom: 3 }}>Location Score · 15% of index</div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: liColor, marginBottom: 4 }}>
                          {li.overall_score >= 70 ? 'Strong Location' : li.overall_score >= 55 ? 'Good with Trade-offs' : li.overall_score >= 40 ? 'Proceed with Caution' : 'High Risk Location'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.6 }}>{li.narrative}</div>
                      </div>
                    </div>

                    {/* Sub-score grid */}
                    {regular.length === 0 && !wildfire && (
                      <div style={{ margin: '0 28px 16px', padding: '14px 18px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, fontSize: '0.78rem', color: '#64748b', textAlign: 'center' }}>
                        Detailed sub-score breakdown unavailable — click Re-run for a fresh analysis.
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '0 28px 16px' }} className="li-sub-grid">
                      {regular.map((s, i) => {
                        const accent = metricAccent(s.metric);
                        return (
                          <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 5, position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accent }} />
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#4b6080' }}>{s.metric}</div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                              <span style={{ fontSize: '1.55rem', fontWeight: 900, lineHeight: 1, color: accent }}>{s.score}</span>
                              <span style={{ fontSize: '0.6rem', color: '#4b6080' }}>/100</span>
                            </div>
                            <div style={{ fontSize: '0.67rem', fontWeight: 700, color: accent }}>{s.rating}</div>
                            <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${s.score}%`, background: accent, borderRadius: 2 }} />
                            </div>
                            <div style={{ fontSize: '0.71rem', color: '#64748b', lineHeight: 1.5 }}>{s.description}</div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Wildfire risk — full-width danger card */}
                    {wildfire && (
                      <div style={{ margin: '0 28px 16px', background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 12, padding: 16, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: '#f87171' }} />
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#f87171', marginBottom: 4 }}>⚠ {wildfire.metric}</div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                              <span style={{ fontSize: '1.45rem', fontWeight: 900, color: '#f87171', lineHeight: 1 }}>{wildfire.score}</span>
                              <span style={{ fontSize: '0.6rem', color: '#4b6080' }}>/100</span>
                              {wildfire.rating && <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#f87171' }}>{wildfire.rating.toUpperCase()}</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {wildfire.fire_factor != null && (
                              <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 8, padding: '5px 12px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#f87171' }}>{wildfire.fire_factor}/10</div>
                                <div style={{ fontSize: '0.55rem', color: '#4b6080', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Fire Factor</div>
                              </div>
                            )}
                            {wildfire.risk_30yr_pct != null && (
                              <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 8, padding: '5px 12px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#f87171' }}>{wildfire.risk_30yr_pct}%</div>
                                <div style={{ fontSize: '0.55rem', color: '#4b6080', letterSpacing: '0.05em', textTransform: 'uppercase' }}>30-yr Risk</div>
                              </div>
                            )}
                            {wildfire.us_risk_percentile != null && (
                              <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 8, padding: '5px 12px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#f87171' }}>Top {100 - wildfire.us_risk_percentile}%</div>
                                <div style={{ fontSize: '0.55rem', color: '#4b6080', letterSpacing: '0.05em', textTransform: 'uppercase' }}>US Risk</div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
                          <div style={{ height: '100%', width: `${wildfire.score}%`, background: '#f87171', borderRadius: 2 }} />
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#fca5a5', lineHeight: 1.6 }}>{wildfire.description}</div>
                      </div>
                    )}

                    {/* Strengths / Trade-offs */}
                    {((li.strengths?.length ?? 0) > 0 || (li.tradeoffs?.length ?? 0) > 0) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 28px 16px' }} className="li-str-grid">
                        {(li.strengths?.length ?? 0) > 0 && (
                          <div style={{ background: 'rgba(74,222,128,0.04)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
                            <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4ade80', marginBottom: 2 }}>✓ Strengths</div>
                            {li.strengths.map((s, i) => (
                              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.78rem', color: '#86efac', lineHeight: 1.5 }}>
                                <span style={{ color: '#4ade80', fontSize: '0.5rem', marginTop: 5, flexShrink: 0 }}>●</span>{s}
                              </div>
                            ))}
                          </div>
                        )}
                        {(li.tradeoffs?.length ?? 0) > 0 && (
                          <div style={{ background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
                            <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#f87171', marginBottom: 2 }}>⚠ Trade-offs</div>
                            {li.tradeoffs.map((t, i) => (
                              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.78rem', color: '#fca5a5', lineHeight: 1.5 }}>
                                <span style={{ color: '#f87171', fontSize: '0.5rem', marginTop: 5, flexShrink: 0 }}>●</span>{t}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Recommendation */}
                    {li.recommendation && (
                      <div style={{ margin: '0 28px 20px', background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.18)', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '1rem', marginTop: 1, flexShrink: 0 }}>💡</span>
                        <div>
                          <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fbbf24', marginBottom: 5 }}>Location Recommendation</div>
                          <div style={{ fontSize: '0.82rem', color: '#fde68a', lineHeight: 1.65 }}>{li.recommendation}</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Freshness footer ──────────────────────────────────────── */}
              <div style={{ padding: '10px 28px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                {d.data_freshness
                  ? <span className="fi" style={{ fontSize: '0.63rem', color: '#eaf8f7' }}>{d.data_freshness}</span>
                  : <Sk w={190} h={11} />
                }
                <span style={{ fontSize: '0.6rem', color: '#eaf8f7' }}>Powered by Grok-4 · HomeRates.AI</span>
              </div>

              {/* ── CTA bar ───────────────────────────────────────────────── */}
              <div className="pi-cta-bar" style={{ padding: '18px 28px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: 'rgba(255,255,255,0.012)' }}>

                {/* Re-run — evicts local + DB cache, forces fresh Grok stream */}
                {!loading && finalResult && (
                  <button onClick={handleRefresh} title="Force a fresh analysis from Grok" style={{ padding: '11px 14px', fontSize: '0.78rem', fontWeight: 600, background: 'transparent', color: '#4b6080', border: '1px solid rgba(75,96,128,0.25)', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s' }}>
                    <i className="fa-solid fa-rotate-right" style={{ fontSize: '0.75rem' }} />
                    Re-run
                  </button>
                )}

                {/* Share — always public */}
                <button onClick={handleShare} style={{ padding: '11px 20px', fontSize: '0.82rem', fontWeight: 600, background: 'transparent', color: copied ? '#4ade80' : '#94a3b8', border: `1px solid ${copied ? 'rgba(74,222,128,0.35)' : 'rgba(148,163,184,0.22)'}`, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s' }}>
                  <i className={`fa-solid ${copied ? 'fa-check' : 'fa-share-nodes'}`} style={{ fontSize: '0.8rem' }} />
                  {copied ? 'Copied!' : 'Share Report'}
                </button>

                {/* Build Report — opens dynamic PDF report in new tab */}
                {finalResult && (
                  <a
                    href={`/property-report?address=${encodeURIComponent(address)}&down=${displayDown}&rate=${displayRate ?? d.rate_used ?? 6.875}${scenarioDebt != null && scenarioDebt > 0 ? `&debt=${scenarioDebt}` : ''}${(redfinPhotoUrl ?? (finalResult as any)?.photo_url) ? `&photo=${encodeURIComponent((redfinPhotoUrl ?? (finalResult as any)?.photo_url) as string)}` : ''}&chatUrl=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ padding: '11px 20px', fontSize: '0.82rem', fontWeight: 600, background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.28)', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s', textDecoration: 'none' }}
                  >
                    <i className="fa-solid fa-file-pdf" style={{ fontSize: '0.8rem' }} />
                    Build Report ↗
                  </a>
                )}

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

                {/* Full Market Analysis */}
                {!d.deep_analysis && !deepLoading && finalResult && (
                  <button onClick={runDeepAnalysis} style={{ padding: '11px 20px', fontSize: '0.82rem', fontWeight: 600, background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.28)', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s' }}>
                    <i className="fa-solid fa-magnifying-glass-chart" style={{ fontSize: '0.8rem' }} />
                    Full Market Analysis
                  </button>
                )}
                {d.deep_analysis && (
                  <div style={{ padding: '6px 14px', fontSize: '0.72rem', fontWeight: 700, color: '#a78bfa', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fa-solid fa-circle-check" style={{ fontSize: '0.7rem' }} /> Deep Analysis
                  </div>
                )}

                {/* Run My Numbers — primary CTA */}
                <SignedIn>
                  <button
                    onClick={() => {
                      // Seed the existing session ID into the pi_sid_ localStorage bridge
                      // so InteractiveSliderCard PATCHes the same session (preserving L2/L3/L4)
                      // rather than creating a new evaluation from scratch.
                      if (linkedSessionId) {
                        try { localStorage.setItem(`pi_sid_${normKey(address)}`, linkedSessionId); } catch {}
                      }
                      window.location.href = chatUrl;
                    }}
                    style={{ flex: 1, maxWidth: 280, padding: '12px 24px', fontSize: '0.88rem', fontWeight: 700, background: '#4ade80', color: '#050812', border: 'none', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s' }}
                  >
                    <i className="fa-solid fa-calculator" style={{ fontSize: '0.8rem' }} />
                    Run My Numbers →
                  </button>
                </SignedIn>
                <SignedOut>
                  <SignInButton mode="modal">
                    <button style={{ flex: 1, maxWidth: 280, padding: '12px 24px', fontSize: '0.88rem', fontWeight: 700, background: '#4ade80', color: '#050812', border: 'none', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <i className="fa-solid fa-lock" style={{ fontSize: '0.78rem' }} />
                      Sign In to Run Numbers →
                    </button>
                  </SignInButton>
                </SignedOut>

                {/* Track 5 — L1 (from journey session) + L2 + L3 + L4 feed */}
                {(() => {
                  // ── L1: Affordability — from buyer_evaluation_session (my-home → Run My Numbers) ──
                  const existingL1      = existingSession?.l1_score ?? null;
                  const existingL1Sum   = existingSession?.l1_summary ?? null;

                  // ── L3: Property Value ──────────────────────────────────
                  const list     = d.current_list_price;
                  const compsAvg = d.comparable_sales?.length
                    ? d.comparable_sales.reduce((s, c) => s + c.sold_price, 0) / d.comparable_sales.length
                    : null;
                  const avm      = d.zillow_estimate ?? d.redfin_estimate ?? compsAvg;
                  let l3Score: number | null = null;
                  let l3Summary: string | null = null;
                  if (list && avm) {
                    const prem    = (list - avm) / avm;
                    l3Score       = prem < -0.05 ? 92 : prem < 0 ? 84 : prem < 0.03 ? 76 : prem < 0.07 ? 65 : prem < 0.12 ? 52 : prem < 0.20 ? 38 : 22;
                    const premStr = `${prem >= 0 ? '+' : ''}${(prem * 100).toFixed(1)}%`;
                    const compsN  = d.comparable_sales?.length ?? 0;
                    l3Summary     = `${address} — Listed $${Math.round(list / 1000)}K vs AVM $${Math.round(avm / 1000)}K (${premStr}${compsN > 0 ? `, ${compsN} comps` : ''}).`;
                  }

                  // ── L2: Market Conditions (deep analysis only) ──────────
                  const dom = d.market_median_dom;
                  const stl = d.market_sale_to_list;
                  let l2Score: number | null = null;
                  let l2Summary: string | null = null;
                  if (dom != null || stl != null) {
                    const subs: number[] = [];
                    if (dom != null) subs.push(dom > 90 ? 90 : dom > 60 ? 80 : dom > 45 ? 68 : dom > 30 ? 55 : dom > 15 ? 42 : 32);
                    if (stl != null) subs.push(stl < 0.95 ? 90 : stl < 0.98 ? 80 : stl < 1.00 ? 68 : stl < 1.02 ? 55 : stl < 1.05 ? 42 : 30);
                    l2Score   = Math.round(subs.reduce((a, b) => a + b, 0) / subs.length);
                    const pts: string[] = [];
                    if (dom != null) pts.push(`Median DOM ${dom}d`);
                    if (stl != null) pts.push(`sale-to-list ${(stl * 100).toFixed(1)}%`);
                    l2Summary = pts.join(', ') + '.';
                  }

                  // ── L4: Location Intelligence (deep analysis only) ──────
                  // Prefer location_intelligence.overall_score (wildfire-aware)
                  const liCta = d.location_intelligence;
                  let l4Score: number | null = null;
                  let l4Summary: string | null = null;
                  if (liCta?.overall_score != null) {
                    l4Score   = Math.min(100, Math.max(0, Math.round(liCta.overall_score)));
                    const pts = (liCta.sub_scores ?? []).slice(0, 3).map(s => `${s.metric}: ${s.rating}`);
                    l4Summary = pts.length ? pts.join(', ') + '.' : `Location score ${l4Score}/100.`;
                  } else {
                    const school  = d.school_score;
                    const walk    = d.walk_score;
                    const commute = d.commute_minutes;
                    const apprec  = d.neighborhood_appreciation_3yr_pct;
                    if (school != null || walk != null || commute != null || apprec != null) {
                      const subs: number[] = [];
                      if (school  != null) subs.push(Math.min(100, Math.max(0, school * 10)));
                      if (walk    != null) subs.push(Math.min(100, Math.max(0, walk)));
                      if (commute != null) subs.push(commute <= 15 ? 90 : commute <= 25 ? 80 : commute <= 35 ? 70 : commute <= 45 ? 58 : commute <= 60 ? 44 : 30);
                      if (apprec  != null) subs.push(apprec >= 12 ? 92 : apprec >= 7 ? 84 : apprec >= 3 ? 72 : apprec >= 0 ? 55 : 35);
                      l4Score = Math.min(100, Math.max(0, Math.round(subs.reduce((a, b) => a + b, 0) / subs.length)));
                      const pts: string[] = [];
                      if (school  != null) pts.push(`Schools ${school}/10`);
                      if (walk    != null) pts.push(`Walk ${walk}`);
                      if (commute != null) pts.push(`${commute}min commute`);
                      if (apprec  != null) pts.push(`${apprec >= 0 ? '+' : ''}${apprec}% 3yr appreciation`);
                      l4Summary = pts.join(', ') + '.';
                    }
                  }

                  // ── Build URL if anything is ready ─────────────────────
                  const readyCount = [existingL1, l3Score, l2Score, l4Score].filter(s => s != null).length;
                  if (readyCount === 0) return null;

                  const urlp = new URLSearchParams();
                  if (existingL1 != null && existingL1Sum) { urlp.set('l1_score', String(existingL1)); urlp.set('l1_summary', existingL1Sum); }
                  if (l3Score != null && l3Summary) { urlp.set('l3_score', String(l3Score)); urlp.set('l3_summary', l3Summary); }
                  if (l2Score != null && l2Summary) { urlp.set('l2_score', String(l2Score)); urlp.set('l2_summary', l2Summary); }
                  if (l4Score != null && l4Summary) { urlp.set('l4_score', String(l4Score)); urlp.set('l4_summary', l4Summary); }
                  // linkedSessionId is hoisted to component scope — navigate to session if it exists
                  const href = linkedSessionId ? `/track5?session=${linkedSessionId}` : `/track5?${urlp.toString()}`;

                  // Weighted composite using available levels (35/25/25/15)
                  const weightedEntries = [
                    { s: existingL1, w: 0.35 }, { s: l2Score, w: 0.25 },
                    { s: l3Score,    w: 0.25 }, { s: l4Score, w: 0.15 },
                  ].filter(e => e.s != null);
                  const totalW   = weightedEntries.reduce((a, e) => a + e.w, 0);
                  const avgScore = totalW > 0
                    ? Math.round(weightedEntries.reduce((a, e) => a + e.s! * e.w, 0) / totalW)
                    : 0;
                  const avgColor  = avgScore >= 70 ? '#4ade80' : avgScore >= 50 ? '#fbbf24' : '#f87171';
                  const levelsText = readyCount === 4 ? '4 of 4 levels scored'
                    : readyCount === 1
                      ? (existingL1 != null ? 'Affordability' : l3Score != null ? 'Property Value' : l2Score != null ? 'Market Conditions' : 'Location') + ' scored'
                    : `${readyCount} of 4 levels scored`;

                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        width: '100%', textDecoration: 'none',
                        background: 'rgba(74,222,128,0.05)',
                        border: '1px solid rgba(74,222,128,0.22)',
                        borderRadius: 10, padding: '12px 16px',
                        marginTop: 2, gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                          <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 4, padding: '2px 7px', color: '#4ade80' }}>Decision Score</span>
                          <span style={{ fontSize: '0.7rem', color: '#4b6080' }}>{levelsText}</span>
                          {existingL1 != null && <span style={{ fontSize: '0.62rem', color: '#00e87a', fontWeight: 700 }}>· L1 ✓</span>}
                        </div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e2e8f0' }}>
                          {readyCount === 4 ? 'All 4 levels scored — View Decision Score →' : 'View Your Buying Decision Score →'}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'center' }}>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, lineHeight: 1, color: avgColor, letterSpacing: '-0.03em' }}>{avgScore}</div>
                        <div style={{ fontSize: '0.58rem', color: '#4b6080', marginTop: 2 }}>{readyCount === 4 ? 'composite' : 'partial'}</div>
                      </div>
                    </a>
                  );
                })()}

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
