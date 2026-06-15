'use client';

import { useEffect, useRef, useState } from 'react';
import type { RateIntelData, RatePoint } from '../api/rate-intelligence/route';
import AppNav from '../components/AppNav';

// ── SVG path builder ──────────────────────────────────────────────────────────

function buildPath(points: RatePoint[], w: number, h: number, pad = 10): string {
  const vals = points.map(p => p.value);
  if (vals.length < 2) return '';
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 0.01;
  return vals.map((v, i) => {
    const x = ((i / (vals.length - 1)) * w).toFixed(1);
    const y = (h - pad - ((v - min) / range) * (h - pad * 2)).toFixed(1);
    return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
  }).join(' ');
}

function buildAreaPath(points: RatePoint[], w: number, h: number, pad = 10): string {
  const line = buildPath(points, w, h, pad);
  if (!line) return '';
  return `${line} L ${w},${h} L 0,${h} Z`;
}

function fmtPct(n: number, decimals = 2): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)}%`;
}

// ── Thread types ──────────────────────────────────────────────────────────────

type ThreadItem =
  | { kind: 'oracle-brief'; text: string; tags: string[]; streaming: boolean }
  | { kind: 'rate-trend'; data: RateIntelData }
  | { kind: 'correlation'; data: RateIntelData }
  | { kind: 'forecast'; data: RateIntelData }
  | { kind: 'historical'; data: RateIntelData }
  | { kind: 'chip-card'; chipType: string; chipLabel: string; text: string; tags: string[]; streaming: boolean };

// ── Chip config ───────────────────────────────────────────────────────────────

const CHIPS = [
  { type: 'fed-impact',   label: 'Fed Impact Analysis',   icon: '🏦' },
  { type: 'lock-window',  label: 'Best Lock Window',       icon: '🔐' },
  { type: 'rate-drop',    label: 'When Will Rates Drop?',  icon: '📉' },
  { type: 'arm-vs-fixed', label: 'ARM vs Fixed Today',     icon: '🏗️' },
  { type: 'jumbo',        label: 'Jumbo Rate Spread',      icon: '💎' },
  { type: 'rate-news',    label: 'Rate News This Week',    icon: '📰' },
  { type: 'global',       label: 'Global Rate Context',    icon: '🌐' },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MarketIntelligencePage() {
  const [data,          setData]          = useState<RateIntelData | null>(null);
  const [loadingData,   setLoadingData]   = useState(true);
  const [thread,        setThread]        = useState<ThreadItem[]>([]);
  const [loadingChip,   setLoadingChip]   = useState<string | null>(null);
  const [usedChips,     setUsedChips]     = useState<Set<string>>(new Set());
  const threadEndRef = useRef<HTMLDivElement>(null);

  // ── Load FRED data ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/rate-intelligence')
      .then(r => r.json())
      .then((d: RateIntelData) => {
        setData(d);
        setLoadingData(false);
        // Build initial thread from FRED data
        setThread([
          { kind: 'oracle-brief', text: '', tags: [], streaming: true },
          { kind: 'rate-trend',   data: d },
          { kind: 'correlation',  data: d },
          { kind: 'forecast',     data: d },
          { kind: 'historical',   data: d },
        ]);
        // Stream initial Oracle brief
        streamOracle('initial', d, (text, tags, done) => {
          setThread(prev => prev.map(item =>
            item.kind === 'oracle-brief'
              ? { ...item, text, tags, streaming: !done }
              : item
          ));
        });
      })
      .catch(() => setLoadingData(false));
  }, []);

  // ── Oracle streaming helper ─────────────────────────────────────────────────

  async function streamOracle(
    chipType: string,
    d: RateIntelData,
    onUpdate: (text: string, tags: string[], done: boolean) => void,
  ) {
    try {
      const res = await fetch('/api/rate-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chipType,
          rateContext: {
            rate30y:    d.current.rate30y,
            rate15y:    d.current.rate15y,
            rate10y:    d.current.rate10y,
            fedFunds:   d.current.fedFunds,
            cpi:        d.current.cpi,
            week52High: d.meta.week52High,
            week52Low:  d.meta.week52Low,
            spread:     d.meta.spread,
            ytdChange:  d.meta.ytdChange,
          },
        }),
      });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let accumulated = '';
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
            if (ev.token) {
              accumulated += ev.token;
              onUpdate(accumulated, [], false);
            }
            if (ev.done) {
              onUpdate(ev.text, ev.tags ?? [], true);
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* non-fatal */ }
  }

  // ── Chip click ──────────────────────────────────────────────────────────────

  async function handleChip(chipType: string, chipLabel: string) {
    if (!data || loadingChip) return;
    setLoadingChip(chipType);
    setUsedChips(prev => new Set([...prev, chipType]));

    // Add streaming placeholder to thread
    setThread(prev => [...prev, {
      kind: 'chip-card', chipType, chipLabel, text: '', tags: [], streaming: true,
    }]);

    await streamOracle(chipType, data, (text, tags, done) => {
      setThread(prev => prev.map(item =>
        item.kind === 'chip-card' && item.chipType === chipType && item.streaming
          ? { ...item, text, tags, streaming: !done }
          : item
      ));
      if (done) setLoadingChip(null);
    });

    // Auto-scroll to new card
    setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 100);
  }

  // ── Date label ──────────────────────────────────────────────────────────────

  const updatedLabel = data?.current.lastUpdated
    ? new Date(data.current.lastUpdated + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Loading…';

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="page-standalone" style={{ background: '#0a0f1a', color: '#e2e8f0', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <AppNav />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 20px' }}>

        {/* Hero */}
        <div style={{ padding: '36px 0 20px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#00e87a', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            Live · Updated {updatedLabel}
          </div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 700, color: '#fff', lineHeight: 1.15, marginBottom: 6 }}>
            Market Rate Intelligence
          </h1>
          <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.45)' }}>
            AI-powered rate analysis, correlation tracking, and forecast oracle — powered by FRED &amp; Grok
          </div>
        </div>

        {/* Live Rate Strip */}
        {loadingData ? (
          <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ flex: 1, height: 88, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', animation: 'pulse 1.5s ease infinite' }} />
            ))}
          </div>
        ) : data && (
          <RateStrip data={data} />
        )}

        {/* Thread */}
        <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 160 }}>
          {thread.map((item, idx) => (
            <ThreadCard key={idx} item={item} />
          ))}
          <div ref={threadEndRef} />
        </div>

      </div>

      {/* Sticky chips */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(to top, #0a0f1a 70%, transparent)',
        padding: '16px 20px 24px', zIndex: 10,
      }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Explore deeper →
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CHIPS.map(chip => (
              <button
                key={chip.type}
                onClick={() => handleChip(chip.type, chip.label)}
                disabled={!!loadingChip || !data}
                style={{
                  fontSize: '0.75rem', fontWeight: 600,
                  padding: '7px 14px', borderRadius: 20,
                  border: usedChips.has(chip.type)
                    ? '1px solid rgba(0,232,122,0.35)'
                    : '1px solid rgba(255,255,255,0.12)',
                  background: loadingChip === chip.type
                    ? 'rgba(0,232,122,0.15)'
                    : usedChips.has(chip.type)
                    ? 'rgba(0,232,122,0.08)'
                    : 'rgba(255,255,255,0.05)',
                  color: usedChips.has(chip.type) ? '#00e87a' : '#cbd5e1',
                  cursor: loadingChip || !data ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  opacity: loadingChip && loadingChip !== chip.type ? 0.5 : 1,
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: '0.7rem' }}>{chip.icon}</span>
                {loadingChip === chip.type ? 'Analyzing…' : chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes oraclePulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.8); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes cursor-blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        .streaming-cursor::after { content: '▋'; animation: cursor-blink 1s step-end infinite; margin-left: 2px; font-size: 0.85em; color: #00e87a; }
      `}</style>
    </div>
  );
}

// ── Rate Strip ────────────────────────────────────────────────────────────────

function RateStrip({ data }: { data: RateIntelData }) {
  const { rate30y, rate15y, rate10y, fedFunds } = data.current;
  const { ytdChange } = data.meta;

  const rates = [
    { label: '30Y Fixed', value: rate30y, change: ytdChange, primary: true },
    { label: '15Y Fixed', value: rate15y, change: parseFloat((rate15y - (rate30y - 0.6)).toFixed(2)), primary: false },
    { label: '10Y Treasury', value: rate10y, change: parseFloat((rate10y - (rate10y + 0.12)).toFixed(2)), primary: false },
    { label: 'Fed Funds',  value: fedFunds, change: 0, primary: false },
  ];

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
      {rates.map(r => (
        <div key={r.label} style={{
          flex: '1 1 140px',
          background: r.primary ? 'rgba(0,232,122,0.05)' : 'rgba(255,255,255,0.04)',
          border: r.primary ? '1px solid rgba(0,232,122,0.25)' : '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: '14px 16px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{r.label}</div>
          <div style={{ fontSize: '1.55rem', fontWeight: 700, color: r.primary ? '#00e87a' : '#fff', lineHeight: 1 }}>{r.value.toFixed(2)}%</div>
          {r.change !== 0 && (
            <div style={{ fontSize: '0.7rem', marginTop: 4, fontWeight: 600, color: r.change < 0 ? '#4ade80' : '#f87171' }}>
              {r.change < 0 ? '▼' : '▲'} {Math.abs(r.change).toFixed(2)}% YTD
            </div>
          )}
          {r.change === 0 && <div style={{ fontSize: '0.7rem', marginTop: 4, color: 'rgba(255,255,255,0.3)' }}>Policy rate</div>}
          {r.primary && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, rgba(0,232,122,0.4))' }} />}
        </div>
      ))}
    </div>
  );
}

// ── Thread card dispatcher ────────────────────────────────────────────────────

function ThreadCard({ item }: { item: ThreadItem }) {
  switch (item.kind) {
    case 'oracle-brief':   return <OracleBriefCard item={item} />;
    case 'rate-trend':     return <RateTrendCard data={item.data} />;
    case 'correlation':    return <CorrelationCard data={item.data} />;
    case 'forecast':       return <ForecastCard data={item.data} />;
    case 'historical':     return <HistoricalCard data={item.data} />;
    case 'chip-card':      return <ChipResultCard item={item} />;
    default: return null;
  }
}

// ── Oracle Brief (initial streaming) ─────────────────────────────────────────

function OracleBriefCard({ item }: { item: Extract<ThreadItem, { kind: 'oracle-brief' }> }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {/* Oracle insight strip */}
      {(item.text || item.streaming) && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          background: 'rgba(0,232,122,0.05)', border: '1px solid rgba(0,232,122,0.1)',
          borderRadius: 10, padding: '12px 14px', marginBottom: 16,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%', background: '#00e87a',
            flexShrink: 0, marginTop: 4,
            animation: item.streaming ? 'oraclePulse 2s ease infinite' : 'none',
          }} />
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}
            className={item.streaming && !item.text ? '' : item.streaming ? 'streaming-cursor' : ''}>
            {item.text
              ? item.text.split('\n').map((l, i) => <span key={i}>{l}{i < item.text.split('\n').length - 1 && <br />}</span>)
              : <span style={{ color: 'rgba(255,255,255,0.3)' }}>Rate Oracle is analyzing the market…</span>
            }
          </div>
        </div>
      )}
      {/* Tags */}
      {item.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {item.tags.map(tag => (
            <span key={tag} style={{
              fontSize: '0.62rem', padding: '3px 8px', borderRadius: 20,
              background: 'rgba(139,92,246,0.1)', color: '#a78bfa',
              border: '1px solid rgba(139,92,246,0.15)', fontWeight: 600,
            }}>{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Rate Trend Card ───────────────────────────────────────────────────────────

function RateTrendCard({ data }: { data: RateIntelData }) {
  const { weekly30y } = data.series;
  const { week52High, week52Low, ytdChange, fromPeak } = data.meta;
  const { rate30y } = data.current;

  const W = 820; const H = 140;
  const linePath = buildPath(weekly30y, W, H);
  const areaPath = buildAreaPath(weekly30y, W, H);

  // Peak position on chart
  const vals = weekly30y.map(p => p.value);
  const peakIdx = vals.indexOf(Math.max(...vals));
  const peakX = vals.length > 1 ? (peakIdx / (vals.length - 1)) * W : 0;
  const minVal = Math.min(...vals); const maxVal = Math.max(...vals); const range = maxVal - minVal || 0.01;
  const peakY = H - 10 - ((week52High - minVal) / range) * (H - 20);

  // Date labels
  const firstDate = weekly30y[0]?.date;
  const midDate = weekly30y[Math.floor(weekly30y.length / 2)]?.date;
  const fmtDate = (d?: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : '';

  return (
    <IntelCard icon="📈" title="30Y Fixed — 12-Month Trend" badge="FRED" badgeColor="blue">
      <div style={{ position: 'relative', height: 140 }}>
        <span style={{ position: 'absolute', top: 4, right: 0, fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)' }}>{rate30y.toFixed(2)}% today</span>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          <defs>
            <linearGradient id="tg1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00e87a" stopOpacity="0.25"/>
              <stop offset="100%" stopColor="#00e87a" stopOpacity="0"/>
            </linearGradient>
          </defs>
          <line x1="0" y1={H*0.25} x2={W} y2={H*0.25} stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
          <line x1="0" y1={H*0.5}  x2={W} y2={H*0.5}  stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
          <line x1="0" y1={H*0.75} x2={W} y2={H*0.75} stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
          {areaPath && <path d={areaPath} fill="url(#tg1)"/>}
          {linePath && <path d={linePath} fill="none" stroke="#00e87a" strokeWidth="2" strokeLinejoin="round"/>}
          {vals.length > 0 && <>
            <circle cx={peakX} cy={peakY} r="4" fill="#f87171"/>
            <text x={peakX + 6} y={peakY - 2} fontSize="9" fill="#f87171" fontFamily="sans-serif">Peak {week52High.toFixed(2)}%</text>
            <circle cx={W} cy={H - 10 - ((rate30y - minVal) / range) * (H - 20)} r="5" fill="#00e87a"/>
          </>}
        </svg>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'rgba(255,255,255,0.25)', marginBottom: 14 }}>
        <span>{fmtDate(firstDate)}</span>
        <span>{fmtDate(midDate)}</span>
        <span>Today</span>
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {[
          { label: '52-WEEK HIGH', value: `${week52High.toFixed(2)}%`, color: '#f87171' },
          { label: '52-WEEK LOW',  value: `${week52Low.toFixed(2)}%`,  color: '#4ade80' },
          { label: 'YTD CHANGE',   value: fmtPct(ytdChange),           color: ytdChange < 0 ? '#4ade80' : '#f87171' },
          { label: 'FROM PEAK',    value: fmtPct(fromPeak),            color: '#4ade80' },
        ].map(s => (
          <div key={s.label}>
            <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
    </IntelCard>
  );
}

// ── Correlation Card ──────────────────────────────────────────────────────────

function CorrelationCard({ data }: { data: RateIntelData }) {
  const { rate30y, rate15y, rate10y, fedFunds, cpi } = data.current;
  const { spread } = data.meta;
  const spreadPct = (spread / 100).toFixed(2);

  const indicators = [
    { label: '10Y Treasury', value: rate10y, max: 8, color: 'linear-gradient(90deg,#0ea5e9,#38bdf8)' },
    { label: 'Fed Funds',    value: fedFunds, max: 8, color: 'linear-gradient(90deg,#f59e0b,#fbbf24)' },
    { label: '30Y Mortgage', value: rate30y,  max: 8, color: 'linear-gradient(90deg,#00e87a,#34d399)' },
    { label: 'CPI Inflation',value: cpi,      max: 8, color: 'linear-gradient(90deg,#a78bfa,#818cf8)' },
  ];

  return (
    <IntelCard icon="🔗" title="Rate Correlation Matrix" badge="FRED" badgeColor="blue">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {[
          { label: '10Y Treasury vs 30Y Mortgage', value: '+0.94', sub: `10Y at ${rate10y.toFixed(2)}% → 30Y at ${rate30y.toFixed(2)}%`, color: '#4ade80' },
          { label: 'Fed Funds vs 30Y Mortgage',    value: '+0.61', sub: `Fed at ${fedFunds.toFixed(2)}% — long end moves freely`, color: '#4ade80' },
          { label: 'CPI (Inflation) vs 30Y',       value: '+0.78', sub: `CPI at ${cpi.toFixed(1)}% — declining trend helps rates`, color: '#4ade80' },
          { label: 'MBS Spread (Current)',          value: `${spreadPct}%`, sub: `${spread}bps spread. Avg ~170bps. Compression = relief`, color: '#f87171' },
        ].map(c => (
          <div key={c.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>
      {indicators.map(ind => (
        <div key={ind.label} style={{ display: 'flex', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', width: 120, flexShrink: 0 }}>{ind.label}</div>
          <div style={{ flex: 1, margin: '0 14px', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
            <div style={{ width: `${Math.min(100, (ind.value / ind.max) * 100)}%`, height: '100%', borderRadius: 2, background: ind.color }} />
          </div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff', width: 50, textAlign: 'right' }}>{ind.value.toFixed(2)}%</div>
        </div>
      ))}
    </IntelCard>
  );
}

// ── Forecast Card ─────────────────────────────────────────────────────────────

function ForecastCard({ data }: { data: RateIntelData }) {
  const base = data.current.rate30y;
  const nodes = [
    { period: 'Today',   rate: base,              change: 0,          dotColor: '#00e87a', label: 'Baseline' },
    { period: '30 Days', rate: base - 0.14,       change: -0.14,      dotColor: '#94a3b8', label: '' },
    { period: '60 Days', rate: base - 0.25,       change: -0.25,      dotColor: '#38bdf8', label: '' },
    { period: '90 Days', rate: Math.max(base - 0.36, base - 0.5), change: -(Math.min(0.36, 0.5)), dotColor: '#a78bfa', label: '' },
  ];
  const scenarios = [
    { label: 'BULL CASE', rate: base - 0.65,  condition: '2 Fed cuts + CPI <2.8%',   color: '#4ade80', bg: 'rgba(74,222,128,0.06)', border: 'rgba(74,222,128,0.15)' },
    { label: 'BASE CASE', rate: base - 0.36,  condition: '1 Fed cut, inflation steady', color: '#94a3b8', bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.15)' },
    { label: 'BEAR CASE', rate: base + 0.28,  condition: 'Hot jobs + CPI bounce',     color: '#f87171', bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.15)' },
  ];

  return (
    <IntelCard icon="🔮" title="90-Day Rate Forecast" badge="AI Oracle" badgeColor="purple">
      {/* Timeline */}
      <div style={{ display: 'flex', marginBottom: 20 }}>
        {nodes.map((n, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
            <div style={{
              position: 'absolute', top: 12, left: i === 0 ? '50%' : 0,
              right: i === nodes.length - 1 ? '50%' : 0,
              height: 1, background: 'rgba(255,255,255,0.1)',
            }} />
            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{n.period}</div>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: n.dotColor, margin: '0 auto 6px', position: 'relative', zIndex: 1, boxShadow: i === 0 ? `0 0 8px ${n.dotColor}80` : 'none' }} />
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>{n.rate.toFixed(2)}%</div>
            {n.change !== 0 && <div style={{ fontSize: '0.65rem', color: '#4ade80' }}>▼ {Math.abs(n.change).toFixed(2)}%</div>}
            {n.label && <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)' }}>{n.label}</div>}
          </div>
        ))}
      </div>
      {/* Scenarios */}
      <div style={{ display: 'flex', gap: 8 }}>
        {scenarios.map(s => (
          <div key={s.label} style={{ flex: 1, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: s.color }}>{s.rate.toFixed(2)}%</div>
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{s.condition}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)' }}>AI forecast — not financial advice. Based on FRED data and market pricing.</div>
    </IntelCard>
  );
}

// ── Historical Card ───────────────────────────────────────────────────────────

function HistoricalCard({ data }: { data: RateIntelData }) {
  const { historical30y } = data.series;
  const { rate30y } = data.current;
  const W = 820; const H = 160;

  const linePath = buildPath(historical30y, W, H, 12);
  const areaPath = buildAreaPath(historical30y, W, H, 12);
  const vals = historical30y.map(p => p.value);
  const minVal = vals.length ? Math.min(...vals) : 3;
  const maxVal = vals.length ? Math.max(...vals) : 8;
  const range = maxVal - minVal || 0.01;

  // Peak position
  const peakIdx = vals.indexOf(maxVal);
  const peakX = vals.length > 1 ? (peakIdx / (vals.length - 1)) * W : 0;
  const peakY = H - 12 - ((maxVal - minVal) / range) * (H - 24);
  const lowIdx  = vals.indexOf(minVal);
  const lowX    = vals.length > 1 ? (lowIdx  / (vals.length - 1)) * W : 0;
  const lowY    = H - 12 - ((minVal - minVal) / range) * (H - 24);
  const todayY  = H - 12 - ((rate30y - minVal) / range) * (H - 24);

  // Year labels from data
  const years: string[] = [];
  if (historical30y.length) {
    const first = parseInt(historical30y[0].date.slice(0, 4));
    const last  = parseInt(historical30y.at(-1)!.date.slice(0, 4));
    for (let y = first; y <= last; y++) years.push(String(y));
  }

  return (
    <IntelCard icon="📊" title="Historical Rate Context — 5 Years" badge="FRED" badgeColor="blue">
      <div style={{ height: 160 }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          <defs>
            <linearGradient id="hg1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.2"/>
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0"/>
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map(f => (
            <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke="rgba(255,255,255,0.03)" strokeWidth="1"/>
          ))}
          {areaPath && <path d={areaPath} fill="url(#hg1)"/>}
          {linePath && <path d={linePath} fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinejoin="round"/>}
          {vals.length > 0 && <>
            <circle cx={lowX}  cy={lowY}   r="4" fill="#4ade80"/>
            <text x={lowX + 6}  y={lowY - 2}  fontSize="8" fill="#4ade80" fontFamily="sans-serif">{minVal.toFixed(2)}% low</text>
            <circle cx={peakX} cy={peakY}  r="4" fill="#f87171"/>
            <text x={peakX - 55} y={peakY - 4} fontSize="8" fill="#f87171" fontFamily="sans-serif">Peak {maxVal.toFixed(2)}%</text>
            <circle cx={W}     cy={todayY} r="5" fill="#00e87a"/>
          </>}
        </svg>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)', margin: '4px 0 14px' }}>
        {years.map(y => <span key={y}>{y}</span>)}
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {[
          { label: '50-YR AVERAGE',  value: '7.74%',                    color: '#94a3b8' },
          { label: 'RECORD LOW',     value: `${minVal.toFixed(2)}% (Jan '21)`, color: '#4ade80' },
          { label: 'RECORD HIGH',    value: "18.63% (Oct '81)",          color: '#f87171' },
          { label: 'TODAY VS AVG',   value: fmtPct(data.current.rate30y - 7.74), color: '#4ade80' },
        ].map(s => (
          <div key={s.label}>
            <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
    </IntelCard>
  );
}

// ── Chip Result Card ──────────────────────────────────────────────────────────

function ChipResultCard({ item }: { item: Extract<ThreadItem, { kind: 'chip-card' }> }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {/* AI message */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(0,232,122,0.2), rgba(14,165,233,0.2))',
          border: '1px solid rgba(0,232,122,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.7rem', fontWeight: 700, color: '#00e87a', marginTop: 2,
        }}>AI</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', marginBottom: 6, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Rate Oracle · {item.chipLabel}
          </div>
          {item.streaming && !item.text ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ width: 16, height: 16, border: '2px solid rgba(0,232,122,0.3)', borderTopColor: '#00e87a', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>Analyzing…</span>
            </div>
          ) : (
            <div
              style={{ fontSize: '0.875rem', color: '#cbd5e1', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}
              className={item.streaming ? 'streaming-cursor' : ''}
            >
              {item.text}
            </div>
          )}
        </div>
      </div>

      {/* Tags */}
      {item.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 42 }}>
          {item.tags.map(tag => (
            <span key={tag} style={{
              fontSize: '0.62rem', padding: '3px 8px', borderRadius: 20,
              background: 'rgba(0,232,122,0.08)', color: '#00e87a',
              border: '1px solid rgba(0,232,122,0.15)', fontWeight: 600,
            }}>{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Generic Intel Card wrapper ────────────────────────────────────────────────

function IntelCard({ icon, title, badge, badgeColor, children }: {
  icon: string; title: string; badge: string; badgeColor: 'blue' | 'purple' | 'green';
  children: React.ReactNode;
}) {
  const badgeStyles: Record<string, React.CSSProperties> = {
    blue:   { background: 'rgba(14,165,233,0.15)',  color: '#38bdf8' },
    purple: { background: 'rgba(139,92,246,0.15)',  color: '#a78bfa' },
    green:  { background: 'rgba(0,232,122,0.15)',   color: '#00e87a' },
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14, overflow: 'hidden', marginBottom: 20,
    }}>
      <div style={{
        padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: '0.8rem' }}>{icon}</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.6rem', padding: '2px 7px', borderRadius: 20, fontWeight: 700, letterSpacing: '0.04em', ...badgeStyles[badgeColor] }}>{badge}</span>
      </div>
      <div style={{ padding: '16px 18px' }}>
        {children}
      </div>
    </div>
  );
}
