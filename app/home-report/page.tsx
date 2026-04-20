'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SignInButton, SignedIn, SignedOut, useUser } from '@clerk/nextjs';
import Link from 'next/link';

// ── helpers ────────────────────────────────────────────────────────────────────
const fmtK = (n: number | null | undefined) => {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
};
const fmtFull = (n: number | null | undefined) => n != null ? `$${Math.round(n).toLocaleString()}` : '—';
const fmtPct  = (n: number | null | undefined) => n != null ? `${n > 0 ? '+' : ''}${n}%` : '—';

// ── Circular equity gauge ──────────────────────────────────────────────────────
function CircleGauge({ pct, label, sublabel, color = '#00e87a' }: { pct: number; label: string; sublabel?: string; color?: string }) {
  const r = 64; const circ = 2 * Math.PI * r; const filled = circ * Math.min(pct / 100, 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg width={148} height={148} viewBox="0 0 160 160">
        <circle cx={80} cy={80} r={r} fill="none" stroke="#1e293b" strokeWidth={10} />
        <circle cx={80} cy={80} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 80 80)" style={{ transition: 'stroke-dasharray 1s ease' }} />
        <text x={80} y={74} textAnchor="middle" fill="#f1f5f9" fontSize={28} fontWeight={800} fontFamily="system-ui,sans-serif">{pct}%</text>
        <text x={80} y={96} textAnchor="middle" fill="#64748b" fontSize={11} fontFamily="system-ui,sans-serif">{label}</text>
      </svg>
      {sublabel && <div style={{ fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center' }}>{sublabel}</div>}
    </div>
  );
}

// ── 5-year appreciation chart ──────────────────────────────────────────────────
function AppreciationChart({ projections }: { projections: { yr: number; val: number; gain: string }[] }) {
  const max = Math.max(...projections.map(p => p.val));
  const min = Math.min(...projections.map(p => p.val));
  const range = max - min || 1;
  const W = 560, H = 140, PAD = { l: 8, r: 8, t: 32, b: 24 };
  const innerW = W - PAD.l - PAD.r, innerH = H - PAD.t - PAD.b;
  const pts = projections.map((p, i) => ({
    x: PAD.l + (i / (projections.length - 1)) * innerW,
    y: PAD.t + innerH - ((p.val - min) / range) * innerH,
    ...p,
  }));
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaD = `${pathD} L${pts[pts.length-1].x},${H-PAD.b} L${pts[0].x},${H-PAD.b} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', overflow: 'visible' }}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00e87a" stopOpacity={0.15} />
          <stop offset="100%" stopColor="#00e87a" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#areaGrad)" />
      <path d={pathD} fill="none" stroke="#00e87a" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={i === 0 || i === pts.length - 1 ? 5 : 3.5}
            fill={i === 0 ? '#94a3b8' : '#00e87a'} stroke="#fff" strokeWidth={1.5} />
          <text x={p.x} y={p.y - 10} textAnchor="middle" fill="#f1f5f9" fontSize={10} fontWeight={700} fontFamily="system-ui,sans-serif">{fmtK(p.val)}</text>
          {i > 0 && <text x={p.x} y={p.y - 22} textAnchor="middle" fill="#00b459" fontSize={9} fontFamily="system-ui,sans-serif">{p.gain}</text>}
          <text x={p.x} y={H - PAD.b + 14} textAnchor="middle" fill="#94a3b8" fontSize={9} fontFamily="system-ui,sans-serif">Yr {p.yr}</text>
        </g>
      ))}
    </svg>
  );
}

// ── PITI calculator ────────────────────────────────────────────────────────────
function pitiCalc(balance: number, ratePct: number, annualTax: number): number {
  const mo = ratePct / 100 / 12, n = 360;
  return Math.round(balance * (mo * Math.pow(1+mo,n)) / (Math.pow(1+mo,n) - 1) + annualTax / 12);
}

const RATE_SCENARIOS = [5.5, 5.99, 6.5, 6.99, 7.5];

// ── Stat box ──────────────────────────────────────────────────────────────────
function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#475569', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '1.55rem', fontWeight: 800, color: color ?? '#f1f5f9', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Main inner component ───────────────────────────────────────────────────────
function HomeReportInner() {
  const searchParams = useSearchParams()!;
  const address = searchParams.get('address') ?? '';
  const { user } = useUser();

  const [data, setData]         = useState<any>(null);
  const [liveRate, setLiveRate] = useState<number>(6.65);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState('');
  const [sales, setSales]       = useState<any[]>([]);
  const [alertRate, setAlertRate]   = useState('');
  const [alertSaved, setAlertSaved] = useState(false);
  const [alertSaving, setAlertSaving] = useState(false);
  const [saved, setSaved]       = useState(false);

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!address) { setLoading(false); return; }
    (async () => {
      const [lookupRes, tickerRes, salesRes] = await Promise.all([
        fetch('/api/property/lookup', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address }), cache: 'no-store',
        }),
        fetch('/api/ticker', { cache: 'no-store' }).catch(() => null),
        fetch(`/api/homeowner/nearby-sales?address=${encodeURIComponent(address)}`).catch(() => null),
      ]);

      const lj = await lookupRes.json();
      if (!lookupRes.ok || !lj.ok || !lj.data) { setErr(lj.error ?? 'Could not retrieve property data'); setLoading(false); return; }
      setData(lj.data);

      const tj = tickerRes ? await tickerRes.json().catch(() => null) : null;
      const r30 = tj?.items?.find((i: any) => i.label === '30Y FIXED');
      if (r30?.value) { const p = parseFloat(String(r30.value).replace('%','')); if (p > 3 && p < 12) setLiveRate(p); }

      const sj = salesRes ? await salesRes.json().catch(() => null) : null;
      if (sj?.sales?.length) setSales(sj.sales);

      setLoading(false);
    })();
  }, [address]);

  async function saveAlert() {
    const rate = parseFloat(alertRate);
    if (!rate || rate < 3 || rate > 12) return;
    setAlertSaving(true);
    await fetch('/api/homeowner/rate-alert', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property_address: address, threshold_rate: rate }),
    });
    setAlertSaving(false);
    setAlertSaved(true);
    setTimeout(() => setAlertSaved(false), 3000);
  }

  async function saveProperty() {
    await fetch('/api/homeowner/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    setSaved(true);
  }

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Derived
  const listingStatus = data?.listingStatus ?? 'UNKNOWN';
  const isBuyer       = listingStatus === 'FOR_SALE' || listingStatus === 'PENDING';
  const daysOnMarket  = data?.daysOnMarket ?? null;
  const val           = data?.estimatedValue ?? data?.price ?? data?.lastSalePrice ?? null;
  const listPrice     = isBuyer ? (data?.price ?? val) : null;
  const equity        = data?.estimatedEquity ?? null;
  const balance       = data?.estimatedBalance ?? null;
  const eqPct         = (equity && val) ? Math.round(Math.max(0,equity) / val * 100) : null;
  const ltv           = (balance && val) ? Math.round(balance / val * 100) : null;
  const appPct        = (data?.lastSalePrice && val) ? Math.round((val - data.lastSalePrice) / data.lastSalePrice * 100) : null;
  const annualTax     = (isBuyer ? listPrice : val) ? Math.round(((isBuyer ? listPrice : val)!) * 0.0115) : 0;
  const baseVal       = isBuyer ? listPrice : val;
  const projections   = val ? Array.from({ length: 6 }, (_, i) => {
    const v = Math.round(val * Math.pow(1.042, i));
    return { yr: i, val: v, gain: i === 0 ? '' : `+${(((v - val) / val) * 100).toFixed(1)}%` };
  }) : [];
  // Rate scenarios: buyer uses listPrice × 0.80 as loan; owner uses estimated balance
  const scenarioBase  = isBuyer ? (listPrice ? Math.round(listPrice * 0.80) : null) : balance;
  const rateScenarios = scenarioBase ? RATE_SCENARIOS.map(r => ({
    rate: r, piti: pitiCalc(scenarioBase, r, annualTax),
    isCurrent: Math.abs(r - liveRate) < 0.26,
  })) : [];

  const streetViewUrl = address && mapsKey
    ? `https://maps.googleapis.com/maps/api/streetview?size=900x360&location=${encodeURIComponent(address)}&key=${mapsKey}`
    : null;

  // Seed for Run My Numbers — buyer vs owner context
  const runSeed = data ? (isBuyer && listPrice ? [
    `I'm looking at buying ${address} listed at ${fmtFull(listPrice)}.`,
    `Current 30-year rate is ${liveRate.toFixed(2)}%.`,
    val && val !== listPrice ? `Redfin AVM is ${fmtFull(val)}.` : '',
    daysOnMarket != null ? `Property has been on market ${daysOnMarket} days.` : '',
    data?.lastSalePrice ? `Seller originally paid ${fmtFull(data.lastSalePrice)}${data?.lastSaleDate ? ` in ${data.lastSaleDate}` : ''}.` : '',
    'Show me monthly PITI, whether it\'s priced fairly vs comps, and my 5-year equity outlook.',
  ].filter(Boolean).join(' ') : [
    `I own this home at ${address} and want to refinance or review my options.`,
    balance ? `Loan balance: ${fmtFull(balance)} (estimated).` : '',
    data?.purchaseRate ? `Current mortgage rate: ${data.purchaseRate}% (estimated from purchase year).` : '',
    val ? `Home value: ${fmtFull(val)}.` : '',
    equity ? `Equity: ${fmtFull(equity)} (${eqPct}%).` : '',
    `Show me refinance savings, break-even, and equity options. Use these exact figures.`,
  ].filter(Boolean).join(' ')) : '';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: HR_CSS }} />
      <div className="hr-root">
        {/* ── NAV ── */}
        <div className="hr-nav">
          <Link href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" style={{ height: 26 }} />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#00e87a', opacity: 0.7 }}>Home Intelligence Report</span>
            <span style={{ fontSize: '0.72rem', color: '#334155' }}>{today}</span>
          </div>
        </div>

        <div className="hr-body">
          {/* ── LOADING ── */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '8rem 0', color: '#64748b' }}>
              <div className="hr-spinner" style={{ margin: '0 auto 16px' }} />
              <div style={{ fontSize: '0.9rem' }}>Fetching property intelligence…</div>
              <div style={{ fontSize: '0.75rem', color: '#334155', marginTop: 8 }}>Searching Redfin for {address}</div>
            </div>
          )}

          {/* ── ERROR ── */}
          {!loading && err && (
            <div style={{ textAlign: 'center', padding: '6rem 0' }}>
              <div style={{ color: '#f97066', marginBottom: 12 }}>{err}</div>
              <Link href="/homeowner" style={{ color: '#00e87a', fontSize: '0.85rem' }}>← Try another address</Link>
            </div>
          )}

          {/* ── NO ADDRESS ── */}
          {!loading && !err && !address && (
            <div style={{ textAlign: 'center', padding: '6rem 0' }}>
              <div style={{ color: '#64748b', marginBottom: 12 }}>No address provided.</div>
              <Link href="/homeowner" style={{ color: '#00e87a', fontSize: '0.85rem' }}>← Enter your home address</Link>
            </div>
          )}

          {/* ── REPORT ── */}
          {!loading && !err && data && (
            <>
              {/* ── HERO — Street View + Address ── */}
              {streetViewUrl && (
                <div style={{ width: '100%', height: 240, borderRadius: 16, overflow: 'hidden', marginBottom: 28, position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={streetViewUrl} alt="Street view" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(8,12,18,0.9) 100%)' }} />
                  <div style={{ position: 'absolute', bottom: 20, left: 24 }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: isBuyer ? '#60a5fa' : '#00e87a', marginBottom: 4 }}>
                      {isBuyer ? (listingStatus === 'PENDING' ? '🔴 Pending · Buyer Intelligence' : '🏷 For Sale · Buyer Intelligence') : 'Home Intelligence'}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#fff' }}>{data.address ?? address}</div>
                    {(data.beds || data.baths || data.sqft) && (
                      <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>
                        {[data.beds && `${data.beds} bd`, data.baths && `${data.baths} ba`, data.sqft && `${data.sqft.toLocaleString()} sqft`].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!streetViewUrl && (
                <div className="hr-card" style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: isBuyer ? '#60a5fa' : '#00e87a', marginBottom: 4 }}>
                    {isBuyer ? (listingStatus === 'PENDING' ? '🔴 Pending · Buyer Intelligence' : '🏷 For Sale · Buyer Intelligence') : 'Home Intelligence'}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#fff' }}>{data.address ?? address}</div>
                  {(data.beds || data.baths || data.sqft) && (
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 3 }}>
                      {[data.beds && `${data.beds} bd`, data.baths && `${data.baths} ba`, data.sqft && `${data.sqft.toLocaleString()} sqft`].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {data.lastSaleDate && data.lastSalePrice && (
                    <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: 6 }}>
                      Purchased {fmtFull(data.lastSalePrice)} · {data.lastSaleDate}
                    </div>
                  )}
                </div>
              )}

              {/* ── 4 KEY STATS ── */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                {isBuyer ? (<>
                  <StatBox label="List Price"     value={fmtK(listPrice)} color="#60a5fa" />
                  <StatBox label="Redfin AVM"     value={fmtK(val)}
                    sub={val && listPrice ? `${Math.round((val - listPrice) / listPrice * 100) > 0 ? '+' : ''}${Math.round((val - listPrice) / listPrice * 100)}% vs ask` : undefined}
                    color={val && listPrice && val >= listPrice ? '#22c55e' : '#f97066'} />
                  <StatBox label="Days on Market" value={daysOnMarket != null ? `${daysOnMarket}d` : '—'}
                    sub={daysOnMarket != null ? (daysOnMarket <= 7 ? 'Fresh listing' : daysOnMarket <= 30 ? 'Active' : 'Extended — room to negotiate') : undefined}
                    color={daysOnMarket != null && daysOnMarket > 30 ? '#22c55e' : '#f1f5f9'} />
                  <StatBox label="$/sqft"         value={listPrice && data?.sqft ? `$${Math.round(listPrice / data.sqft)}` : '—'} color="#f1f5f9" />
                </>) : (<>
                  <StatBox label="Est. Value"  value={fmtK(val)} sub={data.estimatedValueLow && data.estimatedValueHigh ? `Range ${fmtK(data.estimatedValueLow)} – ${fmtK(data.estimatedValueHigh)}` : undefined} color="#00e87a" />
                  <StatBox label="Total Equity" value={fmtK(equity)} sub={eqPct != null ? `${eqPct}% of value` : undefined} color={equity && equity > 0 ? '#00e87a' : '#f59e0b'} />
                  <StatBox label="Appreciation" value={fmtPct(appPct)} sub={data.lastSaleDate ? `Since ${data.lastSaleDate}` : undefined} color={appPct && appPct > 0 ? '#00e87a' : '#f97066'} />
                  <StatBox label="LTV Ratio"    value={ltv != null ? `${ltv}%` : '—'} sub={balance ? `${fmtK(balance)} balance est.` : undefined} color={ltv && ltv > 80 ? '#f59e0b' : '#f1f5f9'} />
                </>)}
              </div>

              {/* ── EQUITY POSITION — owner mode only ── */}
              {!isBuyer && eqPct != null && val && equity != null && (
                <div className="hr-card" style={{ marginBottom: 20 }}>
                  <div className="hr-section-label">Equity Position</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap', marginTop: 16 }}>
                    {eqPct >= 0 && <CircleGauge pct={eqPct} label="Equity" sublabel={`${fmtK(equity)} in equity`} />}
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b', marginBottom: 8 }}>
                        <span style={{ color: '#00e87a' }}>{fmtK(equity)} equity ({eqPct}%)</span>
                        <span>{fmtK(balance)} remaining</span>
                      </div>
                      <div style={{ height: 10, background: '#1e293b', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(eqPct, 100)}%`, background: 'linear-gradient(90deg,#00e87a,#00b459)', borderRadius: 999 }} />
                      </div>
                      {val && (
                        <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>HELOC Available</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#00e87a', marginTop: 3 }}>
                              {balance && val ? fmtK(Math.max(0, Math.round(val * 0.85 - balance))) : '—'}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: '#475569', marginTop: 2 }}>At 85% CLTV</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Cash-Out Alt.</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f1f5f9', marginTop: 3 }}>
                              {balance && val ? fmtK(Math.max(0, Math.round(val * 0.80 - balance))) : '—'}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: '#475569', marginTop: 2 }}>At 80% LTV</div>
                          </div>
                          {data.lastSalePrice && val && (
                            <div>
                              <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Value Gained</div>
                              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#00e87a', marginTop: 3 }}>
                                {fmtK(Math.round(val - data.lastSalePrice))}
                              </div>
                              <div style={{ fontSize: '0.65rem', color: '#475569', marginTop: 2 }}>Since purchase</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── MARKET POSITION — buyer mode only ── */}
              {isBuyer && listPrice && (
                <div className="hr-card" style={{ marginBottom: 20, borderColor: 'rgba(59,130,246,0.2)' }}>
                  <div className="hr-section-label" style={{ color: '#60a5fa' }}>Market Position</div>
                  <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Ask Price',          value: fmtFull(listPrice),        sub: '',                            color: '#60a5fa' },
                      { label: 'Redfin AVM',         value: fmtFull(val),              sub: val && listPrice ? `${Math.round((val - listPrice) / listPrice * 100) > 0 ? '+' : ''}${Math.round((val - listPrice) / listPrice * 100)}% vs ask` : '', color: val && listPrice ? (val >= listPrice ? '#22c55e' : '#f97066') : '#f1f5f9' },
                      { label: `Seller Paid${data.lastSaleDate ? ` (${data.lastSaleDate.match(/\d{4}/)?.[0] ?? ''})` : ''}`, value: data.lastSalePrice ? fmtFull(data.lastSalePrice) : '—', sub: data.lastSalePrice && listPrice ? `+${Math.round((listPrice - data.lastSalePrice) / data.lastSalePrice * 100)}% seller gain` : '', color: '#f1f5f9' },
                    ].map((s, i) => (
                      <div key={i} style={{ flex: 1, minWidth: 120 }}>
                        <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#475569', marginBottom: 6 }}>{s.label}</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color, lineHeight: 1.1 }}>{s.value}</div>
                        {s.sub && <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 4 }}>{s.sub}</div>}
                      </div>
                    ))}
                  </div>
                  {daysOnMarket != null && (
                    <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(99,179,237,0.06)', border: '1px solid rgba(99,179,237,0.15)', borderRadius: 8 }}>
                      <span style={{ fontSize: '0.78rem', color: '#93c5fd', fontWeight: 700 }}>
                        {daysOnMarket <= 7 ? '🔥 Fresh listing' : daysOnMarket <= 30 ? '📅 Active listing' : '⏳ Extended time on market'}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: 8 }}>
                        {daysOnMarket} days on market{daysOnMarket > 30 ? ' — sellers may have more flexibility' : ''}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── 5-YEAR PROJECTION ── */}
              {projections.length > 1 && (
                <div className="hr-card" style={{ marginBottom: 20 }}>
                  <div className="hr-section-label">5-Year Value Projection</div>
                  <div style={{ fontSize: '0.72rem', color: '#475569', marginBottom: 16, marginTop: 4 }}>At 4.2% annual appreciation (national historical avg)</div>
                  <AppreciationChart projections={projections} />
                  <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Today</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#94a3b8', marginTop: 2 }}>{fmtK(val)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>In 5 Years</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#00e87a', marginTop: 2 }}>{fmtK(projections[5]?.val)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Projected Gain</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#00e87a', marginTop: 2 }}>
                        {val && projections[5] ? fmtK(Math.round(projections[5].val - val)) : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── RATE SCENARIOS ── */}
              {rateScenarios.length > 0 && (
                <div className="hr-card" style={{ marginBottom: 20 }}>
                  <div className="hr-section-label">{isBuyer ? 'Monthly Payment at Ask Price' : 'Monthly Payment at Various Rates'}</div>
                  <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 4, marginBottom: 16 }}>
                    {isBuyer
                      ? `Based on ${fmtK(scenarioBase)} loan (20% down) · Includes est. taxes & insurance`
                      : `Based on ${fmtK(balance)} estimated balance · Includes est. taxes & insurance`}
                  </div>
                  <table className="hr-table">
                    <thead>
                      <tr>
                        <th>Rate</th>
                        <th>Est. Monthly (PITI)</th>
                        <th>vs Today</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rateScenarios.map(s => {
                        const currentPiti = rateScenarios.find(r => r.isCurrent)?.piti ?? s.piti;
                        const diff = s.piti - currentPiti;
                        return (
                          <tr key={s.rate} style={{ background: s.isCurrent ? 'rgba(0,232,122,0.06)' : 'transparent' }}>
                            <td style={{ color: s.isCurrent ? '#00e87a' : '#f1f5f9' }}>
                              {s.rate}% {s.isCurrent && <span style={{ fontSize: '0.65rem', color: '#00e87a', marginLeft: 4 }}>← today</span>}
                            </td>
                            <td style={{ fontWeight: 700 }}>${s.piti.toLocaleString()}/mo</td>
                            <td style={{ color: diff < 0 ? '#00e87a' : diff > 0 ? '#f97066' : '#64748b', fontSize: '0.8rem' }}>
                              {diff === 0 ? '—' : `${diff > 0 ? '+' : ''}$${Math.abs(diff).toLocaleString()}/mo`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── NEARBY SALES ── */}
              {sales.length > 0 && (
                <div className="hr-card" style={{ marginBottom: 20 }}>
                  <div className="hr-section-label">{isBuyer ? 'Recent Comparable Sales' : 'Recent Nearby Sales'}</div>
                  <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 4, marginBottom: 14 }}>
                    {isBuyer ? 'What similar homes have sold for in this area' : 'Comparable homes sold recently in your area'}
                  </div>
                  <table className="hr-table">
                    <thead>
                      <tr>
                        <th>Address</th>
                        <th>Sale Price</th>
                        <th>Details</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.map((s, i) => (
                        <tr key={i}>
                          <td style={{ color: '#94a3b8', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.address || '—'}</td>
                          <td style={{ fontWeight: 700, color: '#00e87a' }}>{fmtK(s.price)}</td>
                          <td style={{ color: '#64748b', fontSize: '0.75rem' }}>
                            {[s.beds && `${s.beds}bd`, s.baths && `${s.baths}ba`, s.sqft && `${s.sqft.toLocaleString()}sf`].filter(Boolean).join(' · ')}
                            {s.pricePerSqft && ` · $${s.pricePerSqft}/sqft`}
                          </td>
                          <td style={{ color: '#475569', fontSize: '0.75rem' }}>{s.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── RATE WATCH ── */}
              <div className="hr-card" style={{ marginBottom: 20, border: '1px solid rgba(0,232,122,0.15)' }}>
                <div className="hr-section-label" style={{ color: '#00e87a' }}>Rate Watch</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.9rem', marginBottom: 3 }}>
                      Alert me when 30-year rates drop to:
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#475569' }}>
                      Current 30Y fixed: <span style={{ color: '#00e87a', fontWeight: 700 }}>{liveRate.toFixed(2)}%</span> · You control when to act, we just alert you.
                    </div>
                  </div>
                  <SignedIn>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="number" step="0.125" min="3" max="10"
                        value={alertRate}
                        onChange={e => setAlertRate(e.target.value)}
                        placeholder={`e.g. ${(liveRate - 1).toFixed(2)}`}
                        style={{ width: 90, padding: '8px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: '0.9rem', fontFamily: 'inherit' }}
                      />
                      <span style={{ color: '#475569', fontSize: '0.85rem' }}>%</span>
                      <button
                        onClick={saveAlert}
                        disabled={alertSaving || alertSaved || !alertRate}
                        style={{ padding: '8px 18px', borderRadius: 8, background: alertSaved ? 'rgba(0,232,122,0.15)' : '#00e87a', border: 'none', color: alertSaved ? '#00e87a' : '#07100f', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        {alertSaved ? '✓ Alert Set' : alertSaving ? 'Saving…' : 'Set Alert'}
                      </button>
                    </div>
                  </SignedIn>
                  <SignedOut>
                    <SignInButton mode="modal">
                      <button style={{ padding: '8px 18px', borderRadius: 8, background: '#00e87a', border: 'none', color: '#07100f', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Sign in to set rate alert
                      </button>
                    </SignInButton>
                  </SignedOut>
                </div>
              </div>

              {/* ── CTA STRIP ── */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
                {runSeed && (
                  <a href={`/chat?sq=${encodeURIComponent(runSeed)}`}
                    style={{ padding: '12px 24px', borderRadius: 999, background: isBuyer ? '#3b82f6' : '#00e87a', color: isBuyer ? '#fff' : '#07100f', fontWeight: 800, fontSize: '0.88rem', textDecoration: 'none', display: 'inline-block' }}>
                    Run My Numbers →
                  </a>
                )}
                {isBuyer ? (
                  /* Buyer: offer rate alert, not save-as-owned */
                  <SignedIn>
                    <a href={`/my-home?address=${encodeURIComponent(address)}`}
                      style={{ padding: '12px 24px', borderRadius: 999, border: '1px solid rgba(99,179,237,0.3)', color: '#60a5fa', fontWeight: 700, fontSize: '0.88rem', background: 'transparent', textDecoration: 'none', display: 'inline-block' }}>
                      Open in My Home →
                    </a>
                  </SignedIn>
                ) : (
                  /* Owner: save to properties */
                  <SignedIn>
                    {!saved ? (
                      <button onClick={saveProperty}
                        style={{ padding: '12px 24px', borderRadius: 999, border: '1px solid rgba(0,232,122,0.3)', color: '#00e87a', fontWeight: 700, fontSize: '0.88rem', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Save to My Properties
                      </button>
                    ) : (
                      <Link href="/my-home"
                        style={{ padding: '12px 24px', borderRadius: 999, border: '1px solid rgba(0,232,122,0.3)', color: '#00e87a', fontWeight: 700, fontSize: '0.88rem', background: 'transparent', textDecoration: 'none', display: 'inline-block' }}>
                        View My Properties →
                      </Link>
                    )}
                  </SignedIn>
                )}
                <SignedOut>
                  <SignInButton mode="modal">
                    <button style={{ padding: '12px 24px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: '0.88rem', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {isBuyer ? 'Sign in for rate alerts' : 'Sign in to save & track'}
                    </button>
                  </SignInButton>
                </SignedOut>
              </div>

              {/* ── DISCLAIMER ── */}
              <div style={{ fontSize: '0.68rem', color: '#1e293b', lineHeight: 1.6, paddingTop: 16, borderTop: '1px solid #0f172a' }}>
                HomeRates.ai is an independent educational tool and is not a mortgage broker or lender. Estimates are based on public records and FHFA appreciation models. Not financial advice.{' '}
                <Link href="/legal" style={{ color: '#1e293b' }}>Terms & Disclosures</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function HomeReportPage() {
  return (
    <Suspense fallback={null}>
      <HomeReportInner />
    </Suspense>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const HR_CSS = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html:has(.hr-root){height:auto!important;overflow:visible!important}
  body:has(.hr-root){display:block!important;height:auto!important;overflow:visible!important;background:#080c12!important}
  .hr-root{min-height:100vh;background:#080c12;color:#f0f0f0;font-family:'Inter',system-ui,sans-serif}

  .hr-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2rem;height:52px;background:rgba(8,12,18,0.97);border-bottom:1px solid rgba(255,255,255,0.06)}
  .hr-body{max-width:780px;margin:0 auto;padding:2.5rem 1.5rem 6rem}

  .hr-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:20px 24px}
  .hr-section-label{font-size:.65rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#475569}

  .hr-table{width:100%;border-collapse:collapse;font-size:.85rem}
  .hr-table th{text-align:left;font-size:.65rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#334155;padding:.4rem 0;border-bottom:1px solid rgba(255,255,255,0.06)}
  .hr-table td{padding:.6rem 0;border-bottom:1px solid rgba(255,255,255,0.04);color:#f1f5f9;font-weight:600}
  .hr-table th:not(:first-child),.hr-table td:not(:first-child){text-align:right}
  .hr-table td:last-child,.hr-table th:last-child{text-align:right}

  .hr-spinner{width:32px;height:32px;border:3px solid rgba(255,255,255,0.08);border-top-color:#00e87a;border-radius:50%;animation:hr-spin .7s linear infinite}
  @keyframes hr-spin{to{transform:rotate(360deg)}}

  @media(max-width:600px){
    .hr-body{padding:1.5rem 1rem 5rem}
    .hr-nav{padding:0 1rem}
  }
`;
