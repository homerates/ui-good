'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useUser } from '@clerk/nextjs';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PortfolioItem {
  id:               string;
  type:             'buyer_journey' | 'snapshot' | 'lo_scenario' | 'comparison';
  title:            string | null;
  address:          string | null;
  photo_url:        string | null;
  data:             Record<string, unknown>;
  last_accessed_at: string;
}

interface Props {
  /** Called when user clicks a journey thumbnail — resume that context */
  onResume?: (item: PortfolioItem) => void;
  /** Called when user clicks "+" new journey */
  onNewJourney?: () => void;
  /** Current chat address — used to highlight the active item */
  activeAddress?: string | null;
}

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, color }: { score: number | null; color: string }) {
  const r   = 16;
  const circ = 2 * Math.PI * r;
  const fill = score != null ? circ * (1 - score / 100) : circ;
  return (
    <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
      <svg width="40" height="40" viewBox="0 0 40 40" style={{ display: 'block' }}>
        <circle cx="20" cy="20" r={r} fill="none" stroke="#1a2740" strokeWidth="3" />
        {score != null && (
          <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={circ} strokeDashoffset={fill}
            strokeLinecap="round"
            transform="rotate(-90 20 20)" />
        )}
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 800,
        color: score != null ? color : '#2a3d55',
      }}>
        {score != null ? score : '—'}
      </div>
    </div>
  );
}

// ── Level bar row ─────────────────────────────────────────────────────────────

function LevelBar({ label, pct, score, total }: { label: string; pct: string; score: number | null; total: number }) {
  const barColor = score == null ? '#1a2740'
    : score >= 75 ? '#00e87a'
    : score >= 50 ? '#f5c518'
    : '#ef4444';
  const barWidth = score != null ? `${(score / total) * 100}%` : '0%';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 9, color: score != null ? '#94a3b8' : '#2a3d55', fontWeight: 600, width: 16, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 8, color: '#2a3d55', width: 20, textAlign: 'right', flexShrink: 0 }}>{pct}</span>
      <div style={{ flex: 1, height: 4, background: '#1a2740', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: barWidth, height: '100%', background: barColor, borderRadius: 2, transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, width: 18, textAlign: 'right', flexShrink: 0, color: score != null ? barColor : '#2a3d55' }}>
        {score != null ? score : '—'}
      </span>
    </div>
  );
}

// ── Journey thumbnail ─────────────────────────────────────────────────────────

function JourneyCard({ item, active, onResume }: { item: PortfolioItem; active: boolean; onResume?: (i: PortfolioItem) => void }) {
  const [copied, setCopied] = useState(false);
  const d = item.data;
  const l1 = (d.l1Score as number | null) ?? null;
  const l2 = (d.l2Score as number | null) ?? null;
  const l3 = (d.l3Score as number | null) ?? null;
  const l4 = (d.l4Score as number | null) ?? null;
  const composite = (d.compositeScore as number | null) ?? null;

  const completedLevels = [l1, l2, l3, l4].filter(v => v != null).length;
  const isComplete = completedLevels === 4;
  const ringColor  = isComplete ? '#00e87a' : completedLevels > 0 ? '#00aaff' : '#2a3d55';

  const verdict = (d.verdict as string | null) ??
    (isComplete ? 'Ready to Offer' : completedLevels > 0 ? 'In Progress' : 'Not Started');

  const statusLabel = isComplete ? 'Ready' : completedLevels > 0 ? 'Active' : 'New';
  const statusStyle: React.CSSProperties = isComplete
    ? { background: '#0f2918', color: '#00e87a', border: '1px solid #00e87a33' }
    : completedLevels > 0
    ? { background: '#001828', color: '#00aaff', border: '1px solid #00aaff33' }
    : { background: '#1a1200', color: '#f5a623', border: '1px solid #f5a62333' };

  const addr = item.address ?? item.title ?? 'Unknown property';
  const shortAddr = addr.length > 28 ? addr.slice(0, 27) + '…' : addr;

  return (
    <div
      onClick={() => onResume?.(item)}
      style={{
        background: '#0b1221',
        border: `1px solid ${active ? '#00aaff44' : '#1e2d45'}`,
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color .15s, transform .12s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = active ? '#00aaff66' : '#2a4060'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = active ? '#00aaff44' : '#1e2d45'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
    >
      {/* Photo strip or address bar */}
      {item.photo_url ? (
        <div style={{ position: 'relative', height: 80, overflow: 'hidden' }}>
          <img src={item.photo_url} alt={addr} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 30%, #0b1221 100%)' }} />
          <div style={{ position: 'absolute', bottom: 7, left: 10, right: 10, fontSize: 11, fontWeight: 700, color: '#e2e8f0', textShadow: '0 1px 4px #000a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {shortAddr}
          </div>
        </div>
      ) : (
        <div style={{ padding: '9px 11px 4px', display: 'flex', alignItems: 'flex-start', gap: 5 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#3a5070" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#94a3b8', lineHeight: 1.3 }}>{shortAddr}</div>
          </div>
        </div>
      )}

      {/* Score row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px 4px' }}>
        <ScoreRing score={composite} color={ringColor} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#3a5070', marginBottom: 2 }}>
            Level 5 · Decision Score
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#c8d8e8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {verdict}
          </div>
        </div>
        <div style={{ ...statusStyle, flexShrink: 0, padding: '3px 8px', borderRadius: 20, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
          {statusLabel}
        </div>
      </div>

      {/* Level bars */}
      <div style={{ padding: '3px 11px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <LevelBar label="L1" pct="30%" score={l1} total={100} />
        <LevelBar label="L2" pct="20%" score={l2} total={100} />
        <LevelBar label="L3" pct="20%" score={l3} total={100} />
        <LevelBar label="L4" pct="15%" score={l4} total={100} />
      </div>

      {/* CTA + Share row */}
      <div style={{ margin: '0 9px 9px', display: 'flex', gap: 6 }}>
        <div style={{
          flex: 1,
          padding: '6px 11px',
          borderRadius: 7,
          fontSize: 10,
          fontWeight: 700,
          textAlign: 'center',
          ...(isComplete
            ? { background: '#00e87a10', color: '#00e87a', border: '1px solid #00e87a22' }
            : completedLevels > 0
            ? { background: '#00aaff14', color: '#00aaff', border: '1px solid #00aaff2a' }
            : { background: '#f5a62314', color: '#f5a623', border: '1px solid #f5a6232a' }),
        }}>
          {isComplete ? 'View Full Score →' : completedLevels > 0 ? `Continue — L${completedLevels + 1} next →` : 'Start L1 Analysis →'}
        </div>
        {/* Share button */}
        <button
          title={copied ? 'Link copied!' : 'Share this property'}
          onClick={e => {
            e.stopPropagation();
            const url = `https://chat.homerates.ai/share/${item.id}`;
            navigator.clipboard.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          style={{
            flexShrink: 0,
            width: 30, height: 30,
            background: copied ? '#0f2918' : '#0f1e30',
            border: `1px solid ${copied ? '#00e87a33' : '#1e3450'}`,
            borderRadius: 7,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background .15s, border-color .15s',
          }}
        >
          {copied
            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#00e87a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4a6080" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          }
        </button>
      </div>
    </div>
  );
}

// ── Snapshot thumbnail ────────────────────────────────────────────────────────

function SnapshotCard({ item, active, onResume }: { item: PortfolioItem; active: boolean; onResume?: (i: PortfolioItem) => void }) {
  const d = item.data;
  const heroValue = (d.heroValue as string | null) ?? '—';
  const heroLabel = (d.heroLabel as string | null) ?? 'Monthly Payment';
  const loanType  = (d.loanType  as string | null) ?? '';
  const addr = item.address ?? item.title ?? 'Scenario';
  const shortAddr = addr.length > 26 ? addr.slice(0, 25) + '…' : addr;

  return (
    <div
      onClick={() => onResume?.(item)}
      style={{
        background: '#0b1221', border: `1px solid ${active ? '#00e87a44' : '#1e2d45'}`,
        borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
        transition: 'border-color .15s, transform .12s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#2a4060'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = active ? '#00e87a44' : '#1e2d45'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
    >
      {item.photo_url ? (
        <div style={{ position: 'relative', height: 60, overflow: 'hidden' }}>
          <img src={item.photo_url} alt={addr} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 20%, #0b1221 100%)' }} />
          <div style={{ position: 'absolute', bottom: 6, left: 10, fontSize: 10.5, fontWeight: 700, color: '#e2e8f0', textShadow: '0 1px 4px #000a' }}>{shortAddr}</div>
        </div>
      ) : (
        <div style={{ padding: '9px 11px 3px', fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>{shortAddr}</div>
      )}
      <div style={{ padding: '8px 11px 10px' }}>
        <div style={{ fontSize: 9, color: '#4a6080', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{heroLabel}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#00e87a', marginBottom: 2 }}>{heroValue}</div>
        {loanType && <div style={{ fontSize: 9.5, color: '#4a6080' }}>{loanType}</div>}
      </div>
    </div>
  );
}

// ── Shared scroll content ─────────────────────────────────────────────────────

function PortfolioContent({ items, loading, activeAddress, onResume, onNewJourney }: {
  items: PortfolioItem[];
  loading: boolean;
  activeAddress?: string | null;
  onResume?: (i: PortfolioItem) => void;
  onNewJourney?: () => void;
}) {
  const journeys  = items.filter(i => i.type === 'buyer_journey');
  const snapshots = items.filter(i => i.type === 'snapshot' || i.type === 'lo_scenario');
  const hasItems  = items.length > 0;
  return (
    <div className="portfolio-scroll-content" style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '10px 9px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {loading && items.length === 0 && (
        <div style={{ fontSize: 11, color: '#2a3d55', textAlign: 'center', paddingTop: 24 }}>Loading…</div>
      )}
      {!loading && !hasItems && (
        <div style={{ padding: '20px 8px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#3a5070', lineHeight: 1.6, marginBottom: 12 }}>
            Your Decision Portfolio lives here — one property per journey.
          </div>
          <button
            onClick={onNewJourney}
            style={{ padding: '8px 16px', background: '#0f2030', border: '1px solid #1e3450', borderRadius: 8, color: '#00aaff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
          >
            Start analysis +
          </button>
        </div>
      )}
      {journeys.length > 0 && (
        <>
          <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: '#2a3d55', paddingLeft: 2, marginBottom: -2 }}>
            Buyer Journeys
          </div>
          {journeys.map(item => (
            <JourneyCard
              key={item.id}
              item={item}
              active={!!(activeAddress && item.address && item.address.toLowerCase().includes(activeAddress.toLowerCase().slice(0, 12)))}
              onResume={onResume}
            />
          ))}
        </>
      )}
      {snapshots.length > 0 && (
        <>
          <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: '#2a3d55', paddingLeft: 2, marginBottom: -2, marginTop: 4 }}>
            Saved Scenarios
          </div>
          {snapshots.map(item => (
            <SnapshotCard
              key={item.id}
              item={item}
              active={!!(activeAddress && item.address && item.address.toLowerCase().includes(activeAddress.toLowerCase().slice(0, 12)))}
              onResume={onResume}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ── Main sidebar ──────────────────────────────────────────────────────────────

export default function PortfolioSidebar({ onResume, onNewJourney, activeAddress }: Props) {
  const { isSignedIn } = useUser();
  const [items, setItems]       = useState<PortfolioItem[]>([]);
  const [loading, setLoading]   = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const fetchItems = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      setLoading(true);
      const res = await fetch('/api/portfolio');
      if (res.ok) {
        const json = await res.json();
        setItems(json.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Refresh on window focus — user returns from another tab
  useEffect(() => {
    const onFocus = () => fetchItems();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchItems]);

  // Exposed globally so the answers API wiring can trigger a refresh
  useEffect(() => {
    (window as any).__portfolioRefresh = fetchItems;
    return () => { delete (window as any).__portfolioRefresh; };
  }, [fetchItems]);

  // Close sheet when user taps a card (resume/new journey fires the callback)
  const handleResumeWithClose = useCallback((item: PortfolioItem) => {
    setSheetOpen(false);
    onResume?.(item);
  }, [onResume]);

  const handleNewJourneyWithClose = useCallback(() => {
    setSheetOpen(false);
    onNewJourney?.();
  }, [onNewJourney]);

  if (!isSignedIn) return null;

  const count = items.length;

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <div style={{
        width: 272, flexShrink: 0,
        background: '#080f1c', borderLeft: '1px solid #131f30',
      }} className="portfolio-sidebar">
        <div style={{ height: 52, borderBottom: '1px solid #131f30', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: '#4a6080' }}>My Decision Portfolio</span>
          <button
            onClick={onNewJourney}
            title="New journey"
            style={{ width: 26, height: 26, background: '#0f2030', border: '1px solid #1e3450', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#00aaff', fontSize: 17, lineHeight: 1, transition: 'background .15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#1a3050')}
            onMouseLeave={e => (e.currentTarget.style.background = '#0f2030')}
          >+</button>
        </div>
        <PortfolioContent items={items} loading={loading} activeAddress={activeAddress} onResume={onResume} onNewJourney={onNewJourney} />
        <div style={{ borderTop: '1px solid #131f30', padding: '10px 14px', fontSize: 9.5, color: '#2a3d55', textAlign: 'center', flexShrink: 0 }}>
          My Decision Portfolio · powered by HomeRates.Ai
        </div>
      </div>

      {/* ── Mobile FAB ── */}
      <button
        className="portfolio-fab"
        onClick={() => setSheetOpen(true)}
        aria-label="Open portfolio"
        style={{
          position: 'fixed', bottom: 88, right: 16, zIndex: 1098,
          width: 48, height: 48, borderRadius: '50%',
          background: '#0f2030', border: '1px solid #1e3450',
          alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          transition: 'background .15s, transform .12s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#1a3050'; (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#0f2030'; (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
      >
        {/* Briefcase / portfolio icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00aaff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
          <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
        </svg>
        {/* Count badge */}
        {count > 0 && (
          <div style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 17, height: 17, borderRadius: 9,
            background: '#00e87a', color: '#000',
            fontSize: 9, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', border: '1.5px solid #080f1c',
          }}>
            {count > 9 ? '9+' : count}
          </div>
        )}
      </button>

      {/* ── Mobile backdrop ── */}
      <div
        className={`portfolio-backdrop${sheetOpen ? ' open' : ''}`}
        onClick={() => setSheetOpen(false)}
      />

      {/* ── Mobile bottom sheet ── */}
      <div ref={sheetRef} className={`portfolio-sheet${sheetOpen ? ' open' : ''}`}>
        {/* Drag handle */}
        <div style={{ padding: '10px 0 4px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#1e2d45' }} />
        </div>
        {/* Sheet header */}
        <div style={{ height: 44, borderBottom: '1px solid #131f30', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: '#4a6080' }}>My Decision Portfolio</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleNewJourneyWithClose}
              style={{ padding: '5px 12px', background: '#0f2030', border: '1px solid #1e3450', borderRadius: 7, color: '#00aaff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
            >
              + New
            </button>
            <button
              onClick={() => setSheetOpen(false)}
              style={{ width: 28, height: 28, background: '#1a2030', border: '1px solid #1e2d45', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#4a6080', fontSize: 16 }}
            >
              ×
            </button>
          </div>
        </div>
        {/* Scrollable content */}
        <PortfolioContent items={items} loading={loading} activeAddress={activeAddress} onResume={handleResumeWithClose} onNewJourney={handleNewJourneyWithClose} />
        {/* Safe area spacer */}
        <div style={{ height: 'env(safe-area-inset-bottom, 12px)', flexShrink: 0 }} />
      </div>
    </>
  );
}
