'use client';
// app/track5/page.tsx — Track 5 Decision Dashboard
// A scoring + status view across 5 intelligence levels for a given property.
// Entry points: cold (?address=), from my-home, from chat, from property-intel.

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppNav from '../components/AppNav';
import AddressAutocomplete from '../components/AddressAutocomplete';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PropResult {
  current_status:       string | null;
  current_list_price:   number | null;
  bedrooms:             number | null;
  bathrooms:            number | null;
  sqft:                 number | null;
  year_built:           number | null;
  days_on_market:       number | null;
  price_per_sqft:       number | null;
  last_sold_price:      number | null;
  last_sold_date:       string | null;
  estimated_piti:       number | null;
  rate_used:            number | null;
  comparable_sales:     Comp[]   | null;
  buyer_strategy:       string   | null;
  grok_intelligence_summary: string | null;
  // Deep fields
  zillow_estimate:      number | null;
  redfin_estimate:      number | null;
  zillow_saves:         number | null;
  zillow_views:         number | null;
  market_median_dom:    number | null;
  market_sale_to_list:  number | null;
  market_median_price:  number | null;
  deep_analysis:        boolean | null;
}

interface Comp {
  address:        string;
  sold_price:     number;
  sold_date:      string;
  sqft:           number | null;
  price_per_sqft: number | null;
}

interface Scores {
  l1: number | null;
  l2: number | null;
  l3: number | null;
  l4: number | null;
  l5: number | null;
}

// ─── Scoring logic ────────────────────────────────────────────────────────────

function scoreL1(d: PropResult): number | null {
  const list = d.current_list_price;
  if (!list) return null;
  const avm = d.zillow_estimate ?? d.redfin_estimate;
  if (avm && avm > 0) {
    const pct = (list - avm) / avm;
    if (pct <= -0.10) return 95;
    if (pct <= -0.05) return 88;
    if (pct <= -0.02) return 82;
    if (pct <=  0.00) return 75;
    if (pct <=  0.03) return 68;
    if (pct <=  0.07) return 58;
    return 45;
  }
  // No AVM: use comps average
  const comps = d.comparable_sales;
  if (comps && comps.length >= 2) {
    const avg = comps.reduce((s, c) => s + c.sold_price, 0) / comps.length;
    if (avg > 0) {
      const pct = (list - avg) / avg;
      if (pct <= -0.05) return 84;
      if (pct <=  0.00) return 76;
      if (pct <=  0.05) return 66;
      return 54;
    }
  }
  return null; // not enough data
}

function scoreL2(piti: number | null, annualIncome: number | null): number | null {
  if (!piti || !annualIncome || annualIncome <= 0) return null;
  const dti = piti / (annualIncome / 12);
  if (dti <= 0.25) return 94;
  if (dti <= 0.28) return 88;
  if (dti <= 0.32) return 80;
  if (dti <= 0.36) return 72;
  if (dti <= 0.40) return 62;
  if (dti <= 0.43) return 52;
  return 38;
}

function scoreL3(d: PropResult): number | null {
  if (!d.market_median_dom && !d.market_sale_to_list) return null;
  let score = 68;
  if (d.market_median_dom != null) {
    if (d.market_median_dom > 40)  score += 12;
    else if (d.market_median_dom > 25) score += 7;
    else if (d.market_median_dom > 14) score += 3;
    else if (d.market_median_dom < 8)  score -= 12;
    else if (d.market_median_dom < 12) score -= 6;
  }
  if (d.market_sale_to_list != null) {
    const stl = d.market_sale_to_list;
    if (stl < 97)   score += 10;
    else if (stl < 99)  score += 4;
    else if (stl > 102) score -= 10;
    else if (stl > 100) score -= 5;
  }
  return Math.min(95, Math.max(28, Math.round(score)));
}

function scoreL5(piti: number | null, listPrice: number | null): number | null {
  if (!piti || !listPrice || listPrice <= 0) return null;
  // Rent vs buy: rough estimate — market rent ≈ 0.45% of price/month
  const estRent = listPrice * 0.0045;
  const diff    = piti - estRent; // positive = buying costs more
  const yearsBreakEven = diff > 0 ? (listPrice * 0.05) / (diff * 12) : 0.5;
  // Score: lower break-even = better
  let score = 75;
  if (yearsBreakEven <= 2)  score = 90;
  else if (yearsBreakEven <= 3)  score = 82;
  else if (yearsBreakEven <= 4)  score = 74;
  else if (yearsBreakEven <= 6)  score = 62;
  else if (yearsBreakEven <= 8)  score = 50;
  else score = 38;
  return score;
}

function computeDecisionIndex(s: Scores): number | null {
  const entries: [number, number][] = [];
  if (s.l1 != null) entries.push([s.l1, 0.25]);
  if (s.l2 != null) entries.push([s.l2, 0.30]);
  if (s.l3 != null) entries.push([s.l3, 0.20]);
  if (s.l4 != null) entries.push([s.l4, 0.15]);
  if (s.l5 != null) entries.push([s.l5, 0.10]);
  if (entries.length < 2) return null;
  const totalWeight = entries.reduce((s, [, w]) => s + w, 0);
  return Math.round(entries.reduce((s, [v, w]) => s + v * w, 0) / totalWeight);
}

function verdict(score: number | null): string {
  if (score == null)  return '—';
  if (score >= 85)    return 'Strong Buy';
  if (score >= 70)    return 'Ready to Offer';
  if (score >= 55)    return 'Buy with Caution';
  if (score >= 40)    return 'Watch the Market';
  return 'Hold Off';
}

function scoreColor(score: number | null): string {
  if (score == null) return '#3a4560';
  if (score >= 75)   return '#00e87a';
  if (score >= 55)   return '#f59e0b';
  return '#ff5f5f';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt$ = (n: number | null | undefined) =>
  n != null ? '$' + Math.round(n).toLocaleString() : '—';

const fmtIncome = (raw: string): number | null => {
  if (!raw.trim()) return null;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (isNaN(n) || n <= 0) return null;
  const result = n < 500 ? n * 1000 : n; // shorthand: 180 → $180k
  return result >= 20000 ? result : null;  // require at least $20k to be valid
};

const fmtPct = (raw: string): number => {
  const n = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 20 : n;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBadge({ score, size = 20 }: { score: number | null; size?: number }) {
  const c = scoreColor(score);
  return (
    <span style={{
      fontFamily: 'var(--font-syne), system-ui, sans-serif',
      fontSize: size, fontWeight: 800,
      color: score != null ? c : '#6b7a99',
    }}>
      {score ?? '—'}
    </span>
  );
}

function StatusDot({ ready }: { ready: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 7, height: 7,
      borderRadius: '50%',
      background: ready ? '#00e87a' : '#3a4560',
      flexShrink: 0,
      ...(ready ? {} : {}),
    }} />
  );
}

function KMetric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: '#141b28',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 9, padding: '11px 12px',
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#8fa3b8', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2, color: color ?? '#f0f4ff' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: '#8fa3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function VerdictLine({ children, tone }: { children: React.ReactNode; tone: 'good' | 'warn' | 'caution' | 'neutral' }) {
  const borderColor = tone === 'good' ? '#00e87a' : tone === 'warn' ? '#f59e0b' : tone === 'caution' ? '#ff8c42' : '#3a4560';
  return (
    <div style={{
      borderLeft: `3px solid ${borderColor}`,
      background: '#141b28',
      borderRadius: '0 8px 8px 0',
      padding: '10px 12px',
      fontSize: 13, color: '#8fa3b8', lineHeight: 1.6,
      marginBottom: 14,
    }}>
      {children}
    </div>
  );
}

interface LevelCardProps {
  id:        string;
  badge:     string;
  badgeColor:string;
  name:      string;
  tagline:   string;
  score:     number | null;
  ready:     boolean;
  open:      boolean;
  onToggle:  () => void;
  children?: React.ReactNode;
  pendingMsg?: string;
  address:   string;
  proLabel:  string;
}

function LevelCard({ id, badge, badgeColor, name, tagline, score, ready, open, onToggle, children, pendingMsg, address, proLabel }: LevelCardProps) {
  const isActive = open;
  return (
    <div style={{
      background: '#0e1420',
      border: `1px solid ${isActive ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 14,
      overflow: 'hidden',
      transition: 'border-color 0.18s',
    }}>
      {/* Collapsed row — always visible */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => e.key === 'Enter' && onToggle()}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* Level badge */}
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${badgeColor}1e`,
          fontFamily: "'Syne', system-ui, sans-serif",
          fontSize: 11, fontWeight: 800, color: badgeColor,
          flexShrink: 0,
        }}>
          {badge}
        </div>

        {/* Name + verdict */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f0f4ff', marginBottom: 2 }}>{name}</div>
          <div style={{
            fontSize: 11, color: ready ? scoreColor(score) : '#8fa3b8',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {ready ? tagline : (pendingMsg ?? 'Run Full Market Analysis to unlock')}
          </div>
        </div>

        {/* Score + dot + caret */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <StatusDot ready={ready} />
          <ScoreBadge score={ready ? score : null} size={20} />
          <span style={{
            color: '#3a4560', fontSize: 14,
            transition: 'transform 0.2s',
            display: 'inline-block',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}>⌄</span>
        </div>
      </div>

      {/* Expanded body */}
      {open && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: 16 }}>
          {ready && children ? children : (
            <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
              <div style={{ fontSize: 13, color: '#8fa3b8', marginBottom: 14 }}>
                {pendingMsg ?? 'Run Full Market Analysis to unlock this level.'}
              </div>
            </div>
          )}

          {/* Action row — always rendered */}
          <div style={{ display: 'flex', gap: 8, marginTop: ready ? 0 : 0 }}>
            {ready && (
              <Link
                href={`/property-intel?address=${encodeURIComponent(address)}`}
                style={{
                  flex: 1, background: '#141b28',
                  border: '1px solid rgba(255,255,255,0.13)',
                  borderRadius: 8, padding: '10px 14px',
                  fontSize: 12, fontWeight: 700, color: '#f0f4ff',
                  textAlign: 'center', textDecoration: 'none',
                  display: 'block',
                }}
              >
                View Full Report →
              </Link>
            )}
            <Link
              href="/messages"
              style={{
                flex: ready ? 'none' : 1,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 8, padding: '10px 14px',
                fontSize: 12, fontWeight: 600, color: '#8fa3b8',
                textDecoration: 'none', textAlign: 'center',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                background: '#a78bfa', flexShrink: 0,
              }} />
              {proLabel}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Track5Page() {
  return (
    <Suspense>
      <Track5Inner />
    </Suspense>
  );
}

function Track5Inner() {
  const params  = useSearchParams();
  const router  = useRouter();

  const [address,     setAddress]     = useState(params?.get('address') ?? '');
  const [income,      setIncome]      = useState('');
  const [downPct,     setDownPct]     = useState('20');
  const [data,        setData]        = useState<PropResult | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [deepLoading, setDeepLoading] = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [openLevel,   setOpenLevel]   = useState<string | null>('l1');
  const deepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch basic grok cache on mount if address in URL
  useEffect(() => {
    const addr = params?.get('address');
    if (addr) { setAddress(addr); fetchData(addr); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = useCallback(async (addr: string) => {
    if (!addr.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      // 1 — try cache (GET)
      const cd = await fetch(`/api/beta/grok-property?address=${encodeURIComponent(addr.trim())}`)
        .then(r => r.json()).catch(() => null);

      if (cd?.cached && cd.result) {
        setData(cd.result);
        setOpenLevel('l1');
        setLoading(false);
        return;
      }

      // 2 — cache miss: pull Redfin MLS facts first (same pipeline as property-intel)
      let redfin: Record<string, unknown> | null = null;
      try {
        const lr = await fetch('/api/property/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: addr.trim() }),
        });
        const lj = await lr.json();
        if (lr.ok && lj.ok && lj.data) {
          const d = lj.data;
          const statusMap: Record<string, string> = {
            'Active': 'For Sale', 'active': 'For Sale',
            'Pending': 'Pending', 'pending': 'Pending',
            'Sold': 'Sold', 'sold': 'Sold',
            'Off Market': 'Off Market',
          };
          redfin = {
            current_status:     statusMap[d.listingStatus] ?? d.listingStatus ?? null,
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
          };
        }
      } catch { /* proceed without Redfin data — Grok will use training knowledge */ }

      // 3 — stream Grok with Redfin facts as authoritative context
      const postRes = await fetch('/api/beta/grok-property', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr.trim(), redfin }),
      });

      if (!postRes.ok || !postRes.body) {
        setError('Could not generate analysis. Please try again.');
        setLoading(false);
        return;
      }

      const reader = postRes.body.getReader();
      const dec    = new TextDecoder();
      let buf = '';

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
              setData(ev.result);
              setOpenLevel('l1');
              setLoading(false);
            }
            if (ev.error) { setError(ev.error); setLoading(false); }
          } catch { /* skip malformed */ }
        }
      }
      setLoading(false);
    } catch {
      setError('Unable to load analysis. Please try again.');
      setLoading(false);
    }
  }, []);

  const runDeepAnalysis = useCallback(async () => {
    if (!address || !data) return;
    setDeepLoading(true);
    try {
      const res = await fetch('/api/beta/grok-property', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          deep: true,
          redfin: {
            current_status:     data.current_status     ?? undefined,
            current_list_price: data.current_list_price ?? undefined,
            bedrooms:           data.bedrooms           ?? undefined,
            bathrooms:          data.bathrooms          ?? undefined,
            sqft:               data.sqft               ?? undefined,
            year_built:         data.year_built         ?? undefined,
            days_on_market:     data.days_on_market     ?? undefined,
          },
        }),
      });
      if (!res.body) return;
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          try {
            const chunk = JSON.parse(raw);
            if (chunk.done && chunk.result) {
              setData(prev => prev ? { ...prev, ...chunk.result } : chunk.result);
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch { /* silent */ }
    finally { setDeepLoading(false); }
  }, [address, data]);

  // Compute scores
  const incomeNum = fmtIncome(income);
  const scores: Scores = {
    l1: data ? scoreL1(data) : null,
    l2: data && incomeNum ? scoreL2(data.estimated_piti, incomeNum) : null,
    l3: data ? scoreL3(data) : null,
    l4: null, // Community: future L4 data
    l5: data ? scoreL5(data.estimated_piti, data.current_list_price) : null,
  };
  const indexScore  = computeDecisionIndex(scores);
  const indexVerdict = verdict(indexScore);
  const hasAnyData  = data != null;
  const hasDeep     = !!(data?.deep_analysis);
  const hasIndex    = indexScore != null;

  // Next step message
  const nextStepText = (() => {
    if (!hasAnyData) return null;
    if (!hasDeep) return 'Run Full Market Analysis to unlock L3 Market scoring and complete your Decision Index.';
    const lowest = (['l1','l2','l3','l5'] as const)
      .filter(k => scores[k] != null)
      .sort((a, b) => (scores[a] ?? 100) - (scores[b] ?? 100))[0];
    if (!lowest) return null;
    const msgs: Record<string, string> = {
      l1: 'L1 Property: listed above estimated value — review comps before making an offer.',
      l2: 'L2 Financial: DTI is above the comfort range — ask your LO about rate buydown options.',
      l3: 'L3 Market: this market is competitive — act quickly or risk losing this home.',
      l5: 'L5 Wealth: rent vs buy break-even is long — review the full wealth report.',
    };
    return msgs[lowest] ?? null;
  })();

  const toggleLevel = (id: string) => setOpenLevel(prev => prev === id ? null : id);

  // ── JSX ─────────────────────────────────────────────────────────────────────

  const hasInput = address.trim().length > 0;

  return (
    <div className="page-standalone t5-root" style={{ background: '#080c12', minHeight: '100vh' }}>
      <AppNav mode="standard" />

      {/* ── COLD STATE ── */}
      {!hasAnyData && !loading && (
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '56px 20px 80px', textAlign: 'center' }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: '#a78bfa', marginBottom: 12,
          }}>
            Track 5 · HomeRates.AI
          </div>
          <h1 style={{
            fontFamily: 'var(--font-syne), system-ui, sans-serif',
            fontSize: 'clamp(28px, 7vw, 44px)', fontWeight: 800,
            lineHeight: 1.1, color: '#f0f4ff', marginBottom: 12,
          }}>
            Score your home<br />
            <span style={{ color: '#00e87a' }}>decision.</span>
          </h1>
          <p style={{ fontSize: 15, color: '#8fa3b8', marginBottom: 36, lineHeight: 1.65 }}>
            5 intelligence levels. One verdict.<br />Property, financial, market, community, wealth.
          </p>

          {/* Address input */}
          <AddressAutocomplete
            value={address}
            onChange={setAddress}
            placeholder="Enter a property address…"
            style={{
              width: '100%', background: '#0e1420',
              border: '1px solid rgba(255,255,255,0.13)',
              borderRadius: 12, padding: '14px 16px',
              color: '#f0f4ff', fontSize: 15, fontFamily: 'inherit',
              outline: 'none', marginBottom: 10,
              boxSizing: 'border-box',
            }}
          />

          {/* Optional financial inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, textAlign: 'left' }}>
            {[
              { label: 'Annual Income', placeholder: 'e.g. 180 or $180,000', value: income,  setter: setIncome  },
              { label: 'Down Payment %', placeholder: '20',   value: downPct, setter: setDownPct },
            ].map(f => (
              <div key={f.label}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8fa3b8', marginBottom: 5 }}>
                  {f.label}
                </div>
                <input
                  value={f.value}
                  onChange={e => f.setter(e.target.value)}
                  placeholder={f.placeholder}
                  style={{
                    width: '100%', background: '#0e1420',
                    border: '1px solid rgba(255,255,255,0.13)',
                    borderRadius: 8, padding: '11px 14px',
                    color: '#f0f4ff', fontSize: 14, fontFamily: 'inherit', outline: 'none',
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#6b7a99', marginBottom: 16, textAlign: 'left' }}>
            30-yr rate pulled live from FRED · Income optional — unlocks L2 Financial score
          </div>

          <button
            disabled={!hasInput}
            onClick={() => fetchData(address)}
            style={{
              width: '100%', background: hasInput ? '#a78bfa' : '#141b28',
              border: 'none', borderRadius: 10, padding: '14px',
              fontSize: 14, fontWeight: 700, color: hasInput ? '#fff' : '#6b7a99',
              fontFamily: 'inherit', cursor: hasInput ? 'pointer' : 'default',
              transition: 'background 0.15s',
            }}
          >
            Run Track 5 Analysis →
          </button>

          {error && (
            <div style={{
              marginTop: 16, padding: '12px 16px',
              background: 'rgba(255,95,95,0.08)', border: '1px solid rgba(255,95,95,0.2)',
              borderRadius: 10, fontSize: 13, color: '#ff5f5f',
            }}>
              {error}
            </div>
          )}
        </div>
      )}

      {/* ── LOADING STATE ── */}
      {loading && (
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '80px 20px', textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '3px solid rgba(167,139,250,0.2)',
            borderTopColor: '#a78bfa',
            animation: 'spin 0.9s linear infinite',
            margin: '0 auto 20px',
          }} />
          <div style={{ fontSize: 15, color: '#f0f4ff', fontWeight: 600 }}>Analyzing property…</div>
          <div style={{ fontSize: 13, color: '#8fa3b8', marginTop: 6 }}>Pulling Redfin data + running Grok intelligence · ~15 sec</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* ── RESULTS STATE ── */}
      {hasAnyData && !loading && (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 20px 80px' }}>

          {/* Context bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: '#0e1420', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 20,
          }}>
            <span style={{ fontSize: 15 }}>🏠</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f0f4ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {address}
              </div>
              {data?.current_status && (
                <div style={{ fontSize: 12, color: '#8fa3b8', marginTop: 2 }}>
                  {data.current_status.toUpperCase()}
                  {data.bedrooms != null && ` · ${data.bedrooms}bd`}
                  {data.bathrooms != null && `/${data.bathrooms}ba`}
                  {data.sqft != null && ` · ${data.sqft.toLocaleString()} sqft`}
                </div>
              )}
            </div>
            <button
              onClick={() => { setData(null); setError(null); }}
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 7, padding: '5px 10px',
                fontSize: 11, fontWeight: 600, color: '#8fa3b8',
                cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
              }}
            >
              Change
            </button>
          </div>

          {/* ── DECISION INDEX ── */}
          <div style={{
            background: 'linear-gradient(160deg, #0d1220 0%, #110f28 100%)',
            border: '1px solid rgba(167,139,250,0.2)',
            borderRadius: 18, padding: '24px 20px 20px',
            marginBottom: 20, textAlign: 'center',
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
              textTransform: 'uppercase', color: '#a78bfa', marginBottom: 12,
            }}>
              Track 5 Decision Index
            </div>

            {/* Big score */}
            <div style={{
              fontFamily: 'var(--font-syne), system-ui, sans-serif',
              fontSize: 72, fontWeight: 800, lineHeight: 1,
              color: hasIndex ? scoreColor(indexScore) : '#6b7a99',
              marginBottom: 6,
            }}>
              {hasIndex ? indexScore : '—'}
              {hasIndex && <span style={{ fontSize: 22, color: '#8fa3b8' }}>/100</span>}
            </div>

            <div style={{
              fontFamily: 'var(--font-syne), system-ui, sans-serif',
              fontSize: 18, fontWeight: 700,
              color: hasIndex ? '#00e87a' : '#8fa3b8',
              marginBottom: hasIndex ? 6 : 4,
            }}>
              {hasIndex ? indexVerdict : (hasDeep ? 'Scoring…' : 'Partial score')}
            </div>

            {!hasIndex && (
              <div style={{ fontSize: 13, color: '#8fa3b8', marginBottom: 16, lineHeight: 1.5 }}>
                {incomeNum == null
                  ? 'Enter your income in the bar below to unlock L2 · Run Full Analysis for L3–L5.'
                  : 'Run Full Market Analysis to complete your score.'}
              </div>
            )}
            {hasIndex && (
              <div style={{ fontSize: 13, color: '#8fa3b8', marginBottom: 16 }}>
                {Object.values(scores).filter(v => v != null).length} of 5 levels scored
              </div>
            )}

            {/* 5 level pills */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              {([
                { id: 'l1', label: 'L1', color: '#3d8bff' },
                { id: 'l2', label: 'L2', color: '#00e87a' },
                { id: 'l3', label: 'L3', color: '#ff8c42' },
                { id: 'l4', label: 'L4', color: '#a78bfa' },
                { id: 'l5', label: 'L5', color: '#f59e0b' },
              ] as const).map(({ id, label, color }) => {
                const s = scores[id as keyof Scores];
                const active = openLevel === id;
                return (
                  <button
                    key={id}
                    onClick={() => toggleLevel(id)}
                    style={{
                      flex: 1, background: active ? 'rgba(167,139,250,0.08)' : '#141b28',
                      border: `1px solid ${active ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.07)'}`,
                      borderRadius: 8, padding: '8px 4px',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8fa3b8', marginBottom: 4 }}>
                      {label}
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-syne), system-ui, sans-serif',
                      fontSize: 16, fontWeight: 800,
                      color: s != null ? color : '#6b7a99',
                    }}>
                      {s ?? '—'}
                    </div>
                    <div style={{ height: 2, borderRadius: 1, background: s != null ? color : '#1e293b', opacity: 0.6, marginTop: 4, width: `${s ?? 10}%`, marginLeft: 'auto', marginRight: 'auto', maxWidth: '100%' }} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── NEXT STEP ── */}
          {nextStepText && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: '#0e1420', border: '1px solid rgba(255,255,255,0.07)',
              borderLeft: '3px solid #00e87a',
              borderRadius: 10, padding: '13px 16px', marginBottom: 20,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#00e87a', marginBottom: 3 }}>
                  Next Step
                </div>
                <div style={{ fontSize: 13, color: '#f0f4ff', lineHeight: 1.5 }}>
                  {nextStepText}
                </div>
              </div>
            </div>
          )}

          {/* ── DEEP ANALYSIS CTA (when not yet run) ── */}
          {!hasDeep && !deepLoading && (
            <button
              onClick={runDeepAnalysis}
              style={{
                width: '100%', background: 'rgba(167,139,250,0.1)',
                border: '1px solid rgba(167,139,250,0.25)',
                borderRadius: 10, padding: '13px',
                fontSize: 13, fontWeight: 700, color: '#a78bfa',
                fontFamily: 'inherit', cursor: 'pointer',
                marginBottom: 20, transition: 'background 0.15s',
              }}
            >
              Run Full Market Analysis — unlock L3, L4, L5 →
            </button>
          )}
          {deepLoading && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'rgba(167,139,250,0.07)',
              border: '1px solid rgba(167,139,250,0.15)',
              borderRadius: 10, padding: '13px 16px', marginBottom: 20,
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: '50%',
                border: '2px solid rgba(167,139,250,0.3)',
                borderTopColor: '#a78bfa',
                animation: 'spin 0.9s linear infinite', flexShrink: 0,
              }} />
              <span style={{ fontSize: 13, color: '#a78bfa' }}>Running Full Market Analysis…</span>
            </div>
          )}

          {/* ── PERSONALIZATION BAR (always visible) ── */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: 10, marginBottom: 20,
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8fa3b8', marginBottom: 5 }}>
                Annual Income <span style={{ color: incomeNum ? '#00e87a' : '#f59e0b', fontWeight: 800 }}>{incomeNum ? '✓' : '← required for L2'}</span>
              </div>
              <input
                value={income}
                onChange={e => setIncome(e.target.value)}
                placeholder="e.g. 180 or $180,000"
                style={{
                  width: '100%', background: '#0e1420',
                  border: `1px solid ${incomeNum ? 'rgba(0,232,122,0.25)' : 'rgba(255,255,255,0.13)'}`,
                  borderRadius: 8, padding: '10px 14px',
                  color: '#f0f4ff', fontSize: 14, fontFamily: 'inherit', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8fa3b8', marginBottom: 5 }}>
                Down Payment %
              </div>
              <input
                value={downPct}
                onChange={e => setDownPct(e.target.value)}
                placeholder="20"
                style={{
                  width: '100%', background: '#0e1420',
                  border: '1px solid rgba(255,255,255,0.13)',
                  borderRadius: 8, padding: '10px 14px',
                  color: '#f0f4ff', fontSize: 14, fontFamily: 'inherit', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* ── THE 5 LEVEL CARDS ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* L1 — Property */}
            <LevelCard
              id="l1" badge="L1" badgeColor="#3d8bff"
              name="Property Intelligence"
              tagline={
                data?.zillow_estimate || data?.redfin_estimate
                  ? (() => {
                      const avm = data.zillow_estimate ?? data.redfin_estimate!;
                      const list = data.current_list_price ?? 0;
                      const pct = ((list - avm) / avm * 100).toFixed(1);
                      return `${Number(pct) < 0 ? pct + '% below' : '+' + pct + '% above'} AVM · ${data.days_on_market ?? '—'} days on market`;
                    })()
                  : data?.comparable_sales?.length
                    ? `${data.comparable_sales.length} comps · ${fmt$(data.current_list_price)}`
                    : `Listed at ${fmt$(data?.current_list_price)}`
              }
              score={scores.l1}
              ready={scores.l1 != null}
              open={openLevel === 'l1'}
              onToggle={() => toggleLevel('l1')}
              address={address}
              proLabel="Ask your Agent"
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                <KMetric label="List Price" value={fmt$(data?.current_list_price)} sub={data?.current_status ?? undefined} />
                <KMetric
                  label="AVM Estimate"
                  value={fmt$(data?.zillow_estimate ?? data?.redfin_estimate)}
                  sub={data?.zillow_estimate ? 'Zillow' : data?.redfin_estimate ? 'Redfin' : 'No estimate'}
                  color={data?.zillow_estimate || data?.redfin_estimate ? '#00e87a' : undefined}
                />
                <KMetric
                  label="Days on Market"
                  value={data?.days_on_market != null ? `${data.days_on_market}d` : '—'}
                  sub={data?.market_median_dom != null ? `Avg ${data.market_median_dom}d` : undefined}
                />
              </div>
              {data?.comparable_sales && data.comparable_sales.length > 0 && (
                <VerdictLine tone={scores.l1 != null && scores.l1 >= 75 ? 'good' : scores.l1 != null && scores.l1 >= 55 ? 'warn' : 'caution'}>
                  {data.comparable_sales.length} comparable{data.comparable_sales.length > 1 ? 's' : ''} found —{' '}
                  <strong style={{ color: '#f0f4ff' }}>
                    avg {fmt$(data.comparable_sales.reduce((s, c) => s + c.sold_price, 0) / data.comparable_sales.length)}
                  </strong>
                  {data.days_on_market != null && data.market_median_dom != null && (
                    <> · This home at {data.days_on_market}d vs {data.market_median_dom}d area average</>
                  )}
                </VerdictLine>
              )}
            </LevelCard>

            {/* L2 — Financial */}
            <LevelCard
              id="l2" badge="L2" badgeColor="#00e87a"
              name="Financial Intelligence"
              tagline={
                incomeNum && data?.estimated_piti
                  ? (() => {
                      const dti = (data.estimated_piti / (incomeNum / 12) * 100).toFixed(1);
                      return `DTI ${dti}% · PITI ${fmt$(data.estimated_piti)}/mo`;
                    })()
                  : data?.estimated_piti
                    ? `PITI ${fmt$(data.estimated_piti)}/mo · Add income to score`
                    : 'Add income to unlock L2 score'
              }
              score={scores.l2}
              ready={scores.l2 != null}
              open={openLevel === 'l2'}
              onToggle={() => toggleLevel('l2')}
              pendingMsg={!incomeNum ? 'Enter your annual income above to unlock L2 Financial score.' : undefined}
              address={address}
              proLabel="Ask your LO"
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                <KMetric
                  label="Monthly PITI"
                  value={fmt$(data?.estimated_piti)}
                  sub={data?.rate_used != null ? `${data.rate_used}% rate` : undefined}
                  color={incomeNum && data?.estimated_piti && data.estimated_piti / (incomeNum / 12) > 0.36 ? '#f59e0b' : '#f0f4ff'}
                />
                <KMetric
                  label="DTI Ratio"
                  value={incomeNum && data?.estimated_piti ? `${(data.estimated_piti / (incomeNum / 12) * 100).toFixed(1)}%` : '—'}
                  sub="of gross monthly"
                  color={
                    incomeNum && data?.estimated_piti
                      ? data.estimated_piti / (incomeNum / 12) <= 0.32 ? '#00e87a'
                      : data.estimated_piti / (incomeNum / 12) <= 0.43 ? '#f59e0b'
                      : '#ff5f5f'
                      : undefined
                  }
                />
                <KMetric
                  label="Down Payment"
                  value={data?.current_list_price ? fmt$(data.current_list_price * fmtPct(downPct) / 100) : '—'}
                  sub={`${fmtPct(downPct)}% · ${fmtPct(downPct) >= 20 ? 'no PMI' : 'PMI applies'}`}
                />
              </div>
              {incomeNum && data?.estimated_piti && (
                <VerdictLine tone={scores.l2 != null && scores.l2 >= 75 ? 'good' : scores.l2 != null && scores.l2 >= 55 ? 'warn' : 'caution'}>
                  DTI of {(data.estimated_piti / (incomeNum / 12) * 100).toFixed(1)}%{' '}
                  {data.estimated_piti / (incomeNum / 12) <= 0.36
                    ? <><strong style={{ color: '#f0f4ff' }}>within conventional range</strong> (≤43%).</>
                    : <><strong style={{ color: '#f59e0b' }}>above comfort zone</strong> — ask your LO about a rate buydown.</>
                  }
                </VerdictLine>
              )}
            </LevelCard>

            {/* L3 — Market */}
            <LevelCard
              id="l3" badge="L3" badgeColor="#ff8c42"
              name="Market Intelligence"
              tagline={
                data?.market_median_dom != null
                  ? `${data.market_median_dom}d avg DOM · ${data.market_sale_to_list != null ? data.market_sale_to_list + '% sale-to-list' : ''}`
                  : 'Run Full Market Analysis to unlock'
              }
              score={scores.l3}
              ready={scores.l3 != null}
              open={openLevel === 'l3'}
              onToggle={() => toggleLevel('l3')}
              address={address}
              proLabel="Ask your Agent"
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                <KMetric
                  label="Avg DOM"
                  value={data?.market_median_dom != null ? `${data.market_median_dom}d` : '—'}
                  color={data?.market_median_dom != null && data.market_median_dom > 20 ? '#00e87a' : '#f59e0b'}
                />
                <KMetric
                  label="Sale-to-List"
                  value={data?.market_sale_to_list != null ? `${data.market_sale_to_list}%` : '—'}
                  color={data?.market_sale_to_list != null && data.market_sale_to_list < 99 ? '#00e87a' : '#f59e0b'}
                />
                <KMetric label="Area Median" value={fmt$(data?.market_median_price)} />
              </div>
              {data?.market_median_dom != null && (
                <VerdictLine tone={scores.l3 != null && scores.l3 >= 70 ? 'good' : scores.l3 != null && scores.l3 >= 55 ? 'warn' : 'caution'}>
                  {data.market_median_dom > 20
                    ? <><strong style={{ color: '#f0f4ff' }}>Market cooling</strong> — rising DOM gives you negotiating room.</>
                    : <><strong style={{ color: '#f0f4ff' }}>Active market</strong> — low DOM means competition. Move decisively.</>
                  }
                  {data.market_sale_to_list != null && data.market_sale_to_list < 99 && (
                    <> Sale-to-list below 100% confirms buyer leverage.</>
                  )}
                </VerdictLine>
              )}
            </LevelCard>

            {/* L4 — Community */}
            <LevelCard
              id="l4" badge="L4" badgeColor="#a78bfa"
              name="Community Intelligence"
              tagline="Schools, walkability, commute — coming soon"
              score={scores.l4}
              ready={false}
              open={openLevel === 'l4'}
              onToggle={() => toggleLevel('l4')}
              pendingMsg="Community scoring — schools, walkability, commute — is being added to Full Market Analysis."
              address={address}
              proLabel="Ask your Agent"
            />

            {/* L5 — Wealth */}
            <LevelCard
              id="l5" badge="L5" badgeColor="#f59e0b"
              name="Wealth Intelligence"
              tagline={
                scores.l5 != null && data?.current_list_price
                  ? `Est. ${fmt$(data.current_list_price * 1.159)} equity at year 5 · ${fmt$(data.estimated_piti)}/mo commitment`
                  : 'Equity projection and rent vs buy break-even'
              }
              score={scores.l5}
              ready={scores.l5 != null}
              open={openLevel === 'l5'}
              onToggle={() => toggleLevel('l5')}
              address={address}
              proLabel="Ask your LO"
            >
              {data?.current_list_price && data?.estimated_piti && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                    <KMetric
                      label="Est. 5-Yr Equity"
                      value={fmt$(data.current_list_price * 0.159 + data.current_list_price * fmtPct(downPct) / 100)}
                      sub="3% annual appreciation"
                      color="#00e87a"
                    />
                    <KMetric
                      label="Rent vs Buy B/E"
                      value={(() => {
                        const estRent = data.current_list_price! * 0.0045;
                        const diff = data.estimated_piti! - estRent;
                        if (diff <= 0) return '< 1 yr';
                        const be = (data.current_list_price! * 0.05) / (diff * 12);
                        return `${be.toFixed(1)} yrs`;
                      })()}
                      color="#00e87a"
                    />
                    <KMetric
                      label="Refi Trigger"
                      value={data.rate_used != null ? `≤${(data.rate_used - 1).toFixed(3)}%` : '—'}
                      sub="B/E under 24mo"
                    />
                  </div>
                  <VerdictLine tone={scores.l5 != null && scores.l5 >= 75 ? 'good' : 'warn'}>
                    At 3% annual appreciation,{' '}
                    <strong style={{ color: '#f0f4ff' }}>
                      {fmt$(data.current_list_price * 0.159 + data.current_list_price * fmtPct(downPct) / 100)} estimated equity
                    </strong>{' '}
                    at year 5. Ask your LO to set a rate alert — a 1% drop unlocks a refi with a sub-24-month break-even.
                  </VerdictLine>
                </>
              )}
            </LevelCard>

          </div>

          {/* ── BOTTOM CTA ── */}
          <div style={{ display: 'flex', gap: 8, marginTop: 24, flexWrap: 'wrap' }}>
            <Link
              href={`/chat?sq=${encodeURIComponent(`I'm looking at buying ${address}${data?.current_list_price ? ` listed at ${fmt$(data.current_list_price)}` : ''}. Current 30-year rate is ${data?.rate_used ?? '—'}%.`)}`}
              style={{
                flex: 1, background: '#00e87a', color: '#050a0a',
                borderRadius: 10, padding: '13px 18px',
                fontSize: 13, fontWeight: 700, textDecoration: 'none',
                textAlign: 'center', display: 'block', minWidth: 140,
              }}
            >
              Run My Numbers →
            </Link>
            <Link
              href={`/property-intel?address=${encodeURIComponent(address)}`}
              style={{
                flex: 1, background: 'transparent',
                border: '1px solid rgba(255,255,255,0.13)',
                borderRadius: 10, padding: '13px 18px',
                fontSize: 13, fontWeight: 600, color: '#8fa3b8',
                textDecoration: 'none', textAlign: 'center',
                display: 'block', minWidth: 140,
              }}
            >
              Full Intelligence Report →
            </Link>
          </div>

        </div>
      )}
    </div>
  );
}
