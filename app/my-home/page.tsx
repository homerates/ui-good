'use client';

import { useEffect, useState, Suspense } from 'react';
import { useUser, SignInButton, SignedIn, SignedOut } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppNav from '../components/AppNav';
import AddressAutocomplete from '../components/AddressAutocomplete';
import MarketIntelCard from '../components/MarketIntelCard';

interface HomeownerProperty {
  id: string;
  property_address: string;
  is_primary: boolean;
  digest_enabled: boolean;
  updated_at: string;
  name: string | null;
  email: string | null;
  actual_balance: number | null;
  actual_rate: number | null;
  actual_purchase_price: number | null;
  actual_purchase_date: string | null;
}

interface SavedOverrides {
  actual_balance:        number | null;
  actual_rate:           number | null;
  actual_purchase_price: number | null;
  actual_purchase_date:  string | null;
}

interface AttomComp {
  address: string; city: string | null; salePrice: number; saleDate: string;
  beds: number | null; baths: number | null; sqft: number | null;
  pricePerSqft: number | null; propertyType: string | null; yearBuilt: number | null; distanceMiles: number | null;
}

interface AnalysisData {
  address: string;
  estimatedValue: number | null;
  estimatedValueLow: number | null;
  estimatedValueHigh: number | null;
  estimatedBalance: number | null;
  estimatedEquity: number | null;
  purchaseRate: number | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  liveRate: number;
  rentEstimate: number | null;
  valueHistory: { date: string; value: number }[];
  ltv: number | null;
  equityPct: number | null;
  appreciationPct: number | null;
  helocMax: number | null;
  helocRate: number;
  helocRateLabel: string;
  cashOutMax: number | null;
  helocDraws: { label: string; amount: number; interestOnly: number; amortizing: number }[];
  refiMonthlySaving: number;
  refiBreakEven: number | null;
  refiClosingCost: number;
  paidOffPct: number;
  interestPaid: number | null;
  yearsElapsed: number | null;
  payoffYear: number | null;
  nextValueTarget: number | null;
  nextValueTargetYear: number | null;
  piti: number | null;
  rentMonthly: number | null;
  rentVsOwn: number | null;
  prime: number;
  savedOverrides: SavedOverrides;
  balanceIsEstimated: boolean;
  rateIsEstimated: boolean;
  borrowerName?: string;
  isLoView?: boolean;
  // Listing context (buyer mode)
  listingStatus: string | null;
  daysOnMarket: number | null;
  listPrice: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  // ATTOM enrichment
  yearBuilt: number | null;
  propertyType: string | null;
  lotSizeSqft: number | null;
  apn: string | null;
  avmSource: 'attom' | 'attom_assessed' | 'fhfa' | null;
  avmConfidence: number | null;
  avmDate: string | null;
  attomCheckedAt: string | null;
  mortgageSource: string | null;
  mortgageLender: string | null;
  mortgageOriginalAmount: number | null;
  mortgageOriginationDate: string | null;
  comps: AttomComp[];
  streetViewUrl: string | null;
  staticMapUrl: string | null;
}

type ChipId = 'equity' | 'heloc' | 'refi' | 'economy' | 'milestones';
type BuyerChipId = 'position' | 'payment' | 'comps' | 'cost' | 'signal';

interface NearbySale {
  address: string; price: number; sqft: number | null;
  beds: number | null; baths: number | null; date: string; pricePerSqft: number | null;
}

const CHIPS: { id: ChipId; label: string; icon: string }[] = [
  { id: 'equity',     label: 'Equity & Value',  icon: '🏠' },
  { id: 'heloc',      label: 'HELOC Power',      icon: '💳' },
  { id: 'refi',       label: 'Refi Math',        icon: '🔁' },
  { id: 'economy',    label: 'Economy',          icon: '📈' },
  { id: 'milestones', label: 'Milestones',       icon: '🏁' },
];

const BUYER_CHIPS: { id: BuyerChipId; label: string; icon: string }[] = [
  { id: 'position', label: 'Market Position', icon: '📊' },
  { id: 'payment',  label: 'My Payment',      icon: '💰' },
  { id: 'comps',    label: 'Comp Analysis',   icon: '🏘' },
  { id: 'cost',     label: 'True Cost',       icon: '📅' },
  { id: 'signal',   label: 'Offer Signal',    icon: '🎯' },
];

// ── Market Intelligence animated loader overlay ───────────────────────────────
const LOADER_STAGES = [
  { icon: '🔍', label: 'Searching web for listing data…',      sub: 'Tavily' },
  { icon: '🏡', label: 'Pulling comparable sales & history…',  sub: 'Tavily' },
  { icon: '📊', label: 'Analyzing market trends…',             sub: 'Tavily' },
  { icon: '🧠', label: 'Running deep market reasoning…',       sub: 'Grok 4' },
  { icon: '💡', label: 'Generating buyer intelligence…',       sub: 'Grok 4' },
  { icon: '✨', label: 'Polishing analysis for you…',          sub: 'GPT-4o' },
];

function MarketIntelLoader() {
  const [stageIdx, setStageIdx] = useState(0);
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    const iv = setInterval(() => {
      setStageIdx(i => (i + 1) % LOADER_STAGES.length);
      setPulse(false);
      setTimeout(() => setPulse(true), 50);
    }, 4000);
    return () => clearInterval(iv);
  }, []);

  const stage = LOADER_STAGES[stageIdx];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 8999,
      background: 'rgba(5,8,18,0.88)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0,
      fontFamily: 'var(--font-dm-sans, system-ui, sans-serif)',
    }}>
      {/* Animated crystal ball */}
      <div style={{
        fontSize: 64, lineHeight: 1, marginBottom: 28,
        animation: 'miOrbit 3s ease-in-out infinite',
        filter: 'drop-shadow(0 0 24px rgba(167,139,250,0.75))',
      }}>
        🔮
      </div>

      {/* Stage label */}
      <div style={{
        fontSize: '1rem', fontWeight: 700,
        color: 'rgba(167,139,250,0.95)',
        letterSpacing: '0.02em', textAlign: 'center',
        marginBottom: 8,
        opacity: pulse ? 1 : 0,
        transition: 'opacity 0.3s',
        minHeight: 26,
      }}>
        <span style={{ marginRight: 8 }}>{stage.icon}</span>{stage.label}
      </div>

      {/* Engine badge */}
      <div style={{
        fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'rgba(139,92,246,0.65)',
        marginBottom: 32,
        opacity: pulse ? 1 : 0,
        transition: 'opacity 0.3s 0.1s',
      }}>
        {stage.sub}
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 8 }}>
        {LOADER_STAGES.map((_, i) => (
          <div key={i} style={{
            width: i === stageIdx ? 22 : 6,
            height: 6, borderRadius: 99,
            background: i === stageIdx ? 'rgba(139,92,246,0.85)' : 'rgba(139,92,246,0.20)',
            transition: 'all 0.4s ease',
          }} />
        ))}
      </div>

      {/* Engine row */}
      <div style={{ display: 'flex', gap: 8, marginTop: 32 }}>
        {['Grok 4', 'Tavily', 'GPT-4o'].map(lbl => (
          <span key={lbl} style={{
            fontSize: '0.6rem', padding: '3px 9px', borderRadius: 5,
            background: 'rgba(139,92,246,0.12)', color: 'rgba(167,139,250,0.6)',
            fontWeight: 700, letterSpacing: '0.06em', border: '1px solid rgba(139,92,246,0.18)',
          }}>{lbl}</span>
        ))}
      </div>

      <style>{`
        @keyframes miOrbit {
          0%   { transform: translateY(0px) rotate(-4deg); }
          25%  { transform: translateY(-12px) rotate(2deg); }
          50%  { transform: translateY(-6px) rotate(4deg); }
          75%  { transform: translateY(-16px) rotate(-2deg); }
          100% { transform: translateY(0px) rotate(-4deg); }
        }
      `}</style>
    </div>
  );
}

// ── Property share button (copies /my-home?address=... link) ──────────────────
function PropertyShareButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  function handleShare() {
    const url = `${window.location.origin}/my-home?address=${encodeURIComponent(address)}`;
    navigator.clipboard.writeText(url).catch(() => {
      const el = document.createElement('textarea');
      el.value = url; el.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(el); el.focus(); el.select();
      document.execCommand('copy'); document.body.removeChild(el);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={handleShare}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '10px 16px', borderRadius: 999,
        border: '1px solid rgba(148,163,184,0.5)',
        background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(15,23,42,0.8)',
        color: copied ? '#4ade80' : '#e2e8f0',
        fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
        transition: 'all 0.2s', whiteSpace: 'nowrap',
      }}
    >
      {copied ? '✓ Copied!' : '⇗ Share'}
    </button>
  );
}

// ── Estimated badge ────────────────────────────────────────────────────────────
function EstBadge() {
  return (
    <span style={{
      fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase', padding: '1px 5px', borderRadius: 4,
      background: 'rgba(234,179,8,0.12)', color: '#eab308',
      border: '1px solid rgba(234,179,8,0.25)', marginLeft: 5,
      verticalAlign: 'middle',
    }}>est</span>
  );
}

// ── Format helpers ─────────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}k`;
  return `$${n.toLocaleString()}`;
}
function pct(n: number | null): string { return n !== null ? `${n}%` : '—'; }
function rate(n: number | null | undefined): string { return n ? `${n.toFixed(2)}%` : '—'; }

// ── ATTOM Intelligence Cards ──────────────────────────────────────────────────

function CardPropertyIntel({ d }: { d: AnalysisData }) {
  const hasDetails = d.beds || d.baths || d.sqft || d.yearBuilt || d.lotSizeSqft || d.apn;
  const hasMortgage = d.mortgageLender || d.mortgageOriginalAmount || d.mortgageOriginationDate;
  if (!hasDetails && !hasMortgage) return null;
  return (
    <div className="mh-card">
      <div className="mh-card-label">Property Profile</div>
      {hasDetails && (
        <div className="mh-stat-row" style={{ flexWrap: 'wrap', gap: 12 }}>
          {d.beds        && <div className="mh-stat"><div className="mh-stat-label">Beds</div><div className="mh-stat-value">{d.beds}</div></div>}
          {d.baths       && <div className="mh-stat"><div className="mh-stat-label">Baths</div><div className="mh-stat-value">{d.baths}</div></div>}
          {d.sqft        && <div className="mh-stat"><div className="mh-stat-label">Living Sqft</div><div className="mh-stat-value">{d.sqft.toLocaleString()}</div></div>}
          {d.yearBuilt   && <div className="mh-stat"><div className="mh-stat-label">Year Built</div><div className="mh-stat-value">{d.yearBuilt}</div></div>}
          {d.lotSizeSqft && <div className="mh-stat"><div className="mh-stat-label">Lot Size</div><div className="mh-stat-value">{(d.lotSizeSqft / 43560).toFixed(2)} ac</div></div>}
          {d.sqft && d.estimatedValue && <div className="mh-stat"><div className="mh-stat-label">$/Sqft</div><div className="mh-stat-value">${Math.round(d.estimatedValue / d.sqft)}</div></div>}
        </div>
      )}
      {d.propertyType && (
        <div style={{ marginTop: 10, fontSize: '0.72rem', color: '#475569' }}>
          Property type: <span style={{ color: '#94a3b8', textTransform: 'capitalize' }}>{d.propertyType.replace('_', ' ')}</span>
          {d.apn && <span style={{ marginLeft: 12 }}>APN: <span style={{ color: '#94a3b8' }}>{d.apn}</span></span>}
        </div>
      )}
      {hasMortgage && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(99,179,237,0.12)' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#475569', marginBottom: 10 }}>Recorded Mortgage</div>
          <div className="mh-stat-row" style={{ flexWrap: 'wrap', gap: 12 }}>
            {d.mortgageLender && <div className="mh-stat"><div className="mh-stat-label">Lender</div><div className="mh-stat-value" style={{ fontSize: '0.85rem' }}>{d.mortgageLender}</div></div>}
            {d.mortgageOriginalAmount && <div className="mh-stat"><div className="mh-stat-label">Original Loan</div><div className="mh-stat-value">{fmt(d.mortgageOriginalAmount)}</div></div>}
            {d.mortgageOriginationDate && <div className="mh-stat"><div className="mh-stat-label">Originated</div><div className="mh-stat-value" style={{ fontSize: '0.82rem' }}>{new Date(d.mortgageOriginationDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</div></div>}
          </div>
          {d.mortgageSource === 'attom' && (
            <div style={{ marginTop: 8, fontSize: '0.62rem', color: '#334155' }}>Source: ATTOM public records</div>
          )}
        </div>
      )}
      {(d.avmDate || d.attomCheckedAt) && (
        <div style={{ marginTop: hasMortgage ? 10 : 14, fontSize: '0.6rem', color: '#334155' }}>
          Data as of {new Date(d.avmDate ?? d.attomCheckedAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {d.avmSource && <span style={{ marginLeft: 6, color: '#1e293b' }}>· {d.avmSource === 'attom' ? 'ATTOM AVM' : d.avmSource === 'fhfa' ? 'FHFA model' : 'assessed'}</span>}
        </div>
      )}
    </div>
  );
}

function CardComps({ d }: { d: AnalysisData }) {
  const comps = d.comps ?? [];
  if (!comps.length) return null;
  const subjectPsf = (d.estimatedValue && d.sqft) ? Math.round(d.estimatedValue / d.sqft) : null;
  return (
    <div className="mh-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="mh-card-label" style={{ marginBottom: 0 }}>Comparable Sales</div>
        <div style={{ fontSize: '0.62rem', color: '#334155' }}>0.5 mi · last 2 yrs · ATTOM</div>
      </div>
      {subjectPsf && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(0,232,122,0.05)', border: '1px solid rgba(0,232,122,0.15)', borderRadius: 8, fontSize: '0.72rem', color: '#94a3b8' }}>
          Your home: <span style={{ color: '#00e87a', fontWeight: 700 }}>${subjectPsf}/sqft</span> ({d.avmSource === 'attom' ? 'ATTOM AVM' : 'est. value'} ÷ sqft)
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr>{['Address', 'Sold', 'Price', 'Bd/Ba', 'Sqft', '$/sqft'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#475569', borderBottom: '1px solid #1e293b', whiteSpace: 'nowrap' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {comps.map((c, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '8px 8px', color: '#94a3b8', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.address}</td>
                <td style={{ padding: '8px 8px', color: '#64748b', whiteSpace: 'nowrap' }}>{c.saleDate ? new Date(c.saleDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : '—'}</td>
                <td style={{ padding: '8px 8px', color: '#f1f5f9', fontWeight: 700, whiteSpace: 'nowrap' }}>{c.salePrice ? `$${Math.round(c.salePrice / 1000)}K` : '—'}</td>
                <td style={{ padding: '8px 8px', color: '#64748b', whiteSpace: 'nowrap' }}>{c.beds ?? '—'}/{c.baths ?? '—'}</td>
                <td style={{ padding: '8px 8px', color: '#64748b', whiteSpace: 'nowrap' }}>{c.sqft ? c.sqft.toLocaleString() : '—'}</td>
                <td style={{ padding: '8px 8px', whiteSpace: 'nowrap', color: c.pricePerSqft && subjectPsf ? (c.pricePerSqft > subjectPsf ? '#22c55e' : c.pricePerSqft < subjectPsf * 0.9 ? '#f87171' : '#94a3b8') : '#94a3b8', fontWeight: 600 }}>
                  {c.pricePerSqft ? `$${c.pricePerSqft}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(99,179,237,0.12)' }}>
        <a
          href={(() => {
            const avgPsf = comps.filter(c => c.pricePerSqft).reduce((s, c) => s + (c.pricePerSqft ?? 0), 0) / comps.filter(c => c.pricePerSqft).length;
            const avgPrice = comps.filter(c => c.salePrice).reduce((s, c) => s + c.salePrice, 0) / comps.filter(c => c.salePrice).length;
            const parts = [`CMA for ${d.address}: ATTOM shows ${comps.length} nearby comps within 0.5 mi sold in the last 2 years.`];
            if (avgPsf) parts.push(`Average comp $/sqft: $${Math.round(avgPsf)}.`);
            if (avgPrice) parts.push(`Average comp sale price: $${Math.round(avgPrice / 1000)}K.`);
            if (d.estimatedValue) parts.push(`ATTOM AVM for subject: $${Math.round(d.estimatedValue / 1000)}K.`);
            parts.push('Run a full CMA analysis with AI. Are comps supporting the AVM value? What price range is defensible?');
            return `/chat?sq=${encodeURIComponent(parts.join(' '))}`;
          })()}
          className="mh-cta-link"
          style={{ color: '#93c5fd' }}
        >
          Run AI CMA in chat →
        </a>
      </div>
    </div>
  );
}

// ── Sub-cards ──────────────────────────────────────────────────────────────────

function CardEquity({ d, nearbySales, onEdit }: { d: AnalysisData; nearbySales?: NearbySale[]; onEdit?: () => void }) {
  const eqPct = d.equityPct ?? 0;
  const balPct = 100 - eqPct;
  const missingBalance = !d.estimatedEquity && !(d.estimatedEquity != null && d.estimatedEquity < 0);
  return (
    <div>
      {missingBalance && onEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(234,179,8,0.05)', border: '1px dashed rgba(234,179,8,0.25)', borderRadius: 8, marginBottom: 16 }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Equity and LTV require your loan balance.</span>
          <button onClick={onEdit} style={{ fontSize: '0.78rem', fontWeight: 700, color: '#eab308', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Add your numbers →</button>
        </div>
      )}
      <div className="mh-stat-row">
        <div className="mh-stat">
          <div className="mh-stat-label">Est. Value</div>
          <div className="mh-stat-value">{d.estimatedValue ? fmt(d.estimatedValue) : '—'}</div>
          {d.appreciationPct !== null && (
            <div className="mh-stat-sub" style={{ color: d.appreciationPct >= 0 ? '#22c55e' : '#f97066' }}>
              {d.appreciationPct >= 0 ? '+' : ''}{d.appreciationPct}% since purchase
              {d.lastSaleDate && (() => { const yr = d.lastSaleDate!.match(/\d{4}/)?.[0]; return yr ? ` (${yr})` : ''; })()}
            </div>
          )}
        </div>
        <div className="mh-stat">
          <div className="mh-stat-label">Est. Equity</div>
          <div className="mh-stat-value">{d.estimatedEquity ? fmt(d.estimatedEquity) : missingBalance && onEdit ? <button onClick={onEdit} style={{ background: 'none', border: '1px dashed rgba(148,163,184,0.35)', borderRadius: 6, color: '#64748b', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', padding: '3px 8px' }}>Add balance →</button> : '—'}</div>
          <div className="mh-stat-sub">{pct(d.equityPct)} of value</div>
        </div>
        <div className="mh-stat">
          <div className="mh-stat-label">LTV Ratio</div>
          <div className="mh-stat-value">{d.ltv !== null ? pct(d.ltv) : missingBalance && onEdit ? <button onClick={onEdit} style={{ background: 'none', border: '1px dashed rgba(148,163,184,0.35)', borderRadius: 6, color: '#64748b', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', padding: '3px 8px' }}>Add balance →</button> : '—'}</div>
          <div className="mh-stat-sub">{d.estimatedBalance ? fmt(d.estimatedBalance) + ' balance' : ''}</div>
        </div>
      </div>

      {/* Equity bar */}
      {d.estimatedEquity && d.estimatedBalance && (
        <div style={{ margin: '20px 0 8px' }}>
          <div className="mh-bar-label-row">
            <span style={{ color: '#22c55e' }}>{fmt(d.estimatedEquity)} equity ({pct(d.equityPct)})</span>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>{fmt(d.estimatedBalance)} remaining</span>
          </div>
          <div className="mh-bar-track">
            <div className="mh-bar-fill" style={{ width: `${eqPct}%`, background: '#22c55e' }} />
            <div className="mh-bar-fill" style={{ width: `${balPct}%`, background: 'rgba(255,255,255,0.1)' }} />
          </div>
        </div>
      )}

      {/* Range */}
      {d.estimatedValueLow && d.estimatedValueHigh && (
        <div className="mh-range-note">
          Value range: {fmt(d.estimatedValueLow)} – {fmt(d.estimatedValueHigh)}
          {d.lastSaleDate && d.lastSalePrice && (
            <span style={{ marginLeft: 12, color: 'rgba(255,255,255,0.35)' }}>
              Purchased {fmt(d.lastSalePrice)} · {d.lastSaleDate}
            </span>
          )}
        </div>
      )}

      {/* Sparkline */}
      {d.valueHistory.length >= 2 && (
        <div style={{ marginTop: 20 }}>
          <div className="mh-section-sub-label">12-month value trend</div>
          <Sparkline history={d.valueHistory} />
        </div>
      )}

      {/* Nearby Sales */}
      {nearbySales && nearbySales.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="mh-section-sub-label" style={{ marginBottom: 10 }}>Recent Nearby Sales</div>
          <table className="mh-table">
            <thead>
              <tr>
                <th>Address</th>
                <th>Price</th>
                <th>Details</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {nearbySales.map((s, i) => (
                <tr key={i}>
                  <td style={{ color: 'rgba(255,255,255,0.5)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.address || '—'}</td>
                  <td style={{ color: '#22c55e' }}>{s.price >= 1_000_000 ? `$${(s.price/1_000_000).toFixed(2)}M` : `$${Math.round(s.price/1000)}K`}</td>
                  <td style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                    {[s.beds && `${s.beds}bd`, s.baths && `${s.baths}ba`, s.sqft && `${s.sqft.toLocaleString()}sf`].filter(Boolean).join(' · ')}
                  </td>
                  <td style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem' }}>{s.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mh-footnote" style={{ marginTop: 8 }}>Recent sales sourced from Redfin. For informational purposes only.</div>
        </div>
      )}
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <Link href={`/chat?sq=${encodeURIComponent(`Equity options for ${d.address}: value ${d.estimatedValue ? fmt(d.estimatedValue) : '?'}, balance ${d.estimatedBalance ? fmt(d.estimatedBalance) : '?'}, equity ${d.estimatedEquity ? fmt(d.estimatedEquity) : '?'} (${d.equityPct ?? '?'}%). What are my best options — HELOC, cash-out refi, or sell?`)}`} className="mh-cta-link">
          Explore my equity options →
        </Link>
      </div>
    </div>
  );
}

function CardHELOC({ d }: { d: AnalysisData }) {
  if (!d.helocMax || d.helocMax < 10_000) {
    return <p className="mh-empty-note">Not enough equity for a HELOC right now. Typically requires at least 15% equity above your balance.</p>;
  }
  return (
    <div>
      <div className="mh-stat-row" style={{ marginBottom: 20 }}>
        <div className="mh-stat">
          <div className="mh-stat-label">Max HELOC Available</div>
          <div className="mh-stat-value" style={{ color: '#22c55e' }}>{fmt(d.helocMax)}</div>
          <div className="mh-stat-sub">At 85% CLTV</div>
        </div>
        <div className="mh-stat">
          <div className="mh-stat-label">HELOC Rate</div>
          <div className="mh-stat-value">{rate(d.helocRate)}</div>
          <div className="mh-stat-sub">{d.helocRateLabel} variable</div>
        </div>
        {d.cashOutMax && d.cashOutMax > 10_000 && (
          <div className="mh-stat">
            <div className="mh-stat-label">Cash-out Refi Alt.</div>
            <div className="mh-stat-value">{fmt(d.cashOutMax)}</div>
            <div className="mh-stat-sub">At 80% LTV fixed</div>
          </div>
        )}
      </div>

      <div className="mh-section-sub-label" style={{ marginBottom: 8 }}>Draw scenarios</div>
      <table className="mh-table">
        <thead>
          <tr>
            <th>Scenario</th>
            <th>Amount</th>
            <th>Interest only</th>
            <th>Amortizing (20yr)</th>
          </tr>
        </thead>
        <tbody>
          {d.helocDraws.map(row => (
            <tr key={row.label}>
              <td style={{ color: 'rgba(255,255,255,0.6)' }}>{row.label}</td>
              <td>{fmt(row.amount)}</td>
              <td style={{ color: 'rgba(255,255,255,0.55)' }}>{fmt(row.interestOnly)}/mo</td>
              <td style={{ color: 'rgba(255,255,255,0.55)' }}>{fmt(row.amortizing)}/mo</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mh-footnote">
        Rate is estimated Prime + 0.50% variable. Actual rates vary by lender, credit, and LTV.{' '}
        <Link href="/messages" className="mh-inline-link">
          Message my LO →
        </Link>
      </div>
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <Link href={`/chat?sq=${encodeURIComponent(`HELOC vs cash-out refi analysis for ${d.address}: I have ${d.helocMax ? '$' + Math.round(d.helocMax).toLocaleString() : 'equity'} available at ~${d.helocRate?.toFixed(2) ?? '7.75'}% HELOC rate. Compare accessing equity via HELOC vs cash-out refi at today's ${d.liveRate.toFixed(2)}% rate. Show payments, costs, and break-even.`)}`} className="mh-cta-link">
          Compare HELOC vs cash-out refi →
        </Link>
      </div>
    </div>
  );
}

function CardRefi({ d, onEdit, plan, isLo }: { d: AnalysisData; onEdit: () => void; plan?: string; isLo?: boolean }) {
  const canSeeLoan = isLo || plan === 'pro' || plan === 'founding';
  const hasOpportunity = d.refiMonthlySaving > 50 && d.purchaseRate && d.purchaseRate > d.liveRate;
  return (
    <div>
      <div className="mh-stat-row" style={{ marginBottom: 20 }}>
        <div className="mh-stat">
          <div className="mh-stat-label">Your Rate {d.rateIsEstimated && <EstBadge />}</div>
          <div className="mh-stat-value">{rate(d.purchaseRate)}</div>
          <div className="mh-stat-sub">{d.rateIsEstimated ? 'Historical avg estimate' : 'Your actual rate'}</div>
        </div>
        <div className="mh-stat">
          <div className="mh-stat-label">Market Today</div>
          <div className="mh-stat-value" style={{ color: d.liveRate < (d.purchaseRate ?? 99) ? '#22c55e' : '#f97066' }}>
            {rate(d.liveRate)}
          </div>
          <div className="mh-stat-sub">30yr fixed avg</div>
        </div>
        <div className="mh-stat">
          <div className="mh-stat-label">Balance {d.balanceIsEstimated && <EstBadge />}</div>
          <div className="mh-stat-value">{d.estimatedBalance ? fmt(d.estimatedBalance) : '—'}</div>
          <div className="mh-stat-sub">{d.balanceIsEstimated ? 'Estimate' : 'Your actual balance'}</div>
        </div>
      </div>
      {(d.rateIsEstimated || d.balanceIsEstimated) && (
        <div className="mh-est-notice">
          Numbers marked <span style={{ color: '#eab308' }}>est</span> are estimated from public records.{' '}
          <button className="mh-inline-btn" onClick={onEdit}>Enter your actual numbers →</button>
        </div>
      )}

      {(d.mortgageLender || d.mortgageOriginalAmount) && canSeeLoan && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13, color: 'rgba(255,255,255,0.55)', display: 'flex', flexWrap: 'wrap' as const, gap: '4px 6px', alignItems: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.35)', marginRight: 2 }}>Current loan on record:</span>
          {d.mortgageOriginalAmount && (
            <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{fmt(d.mortgageOriginalAmount)}</span>
          )}
          {d.mortgageLender && (
            <span>with <span style={{ color: 'rgba(255,255,255,0.7)' }}>{d.mortgageLender}</span></span>
          )}
          {d.mortgageOriginationDate && (
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>· originated {new Date(d.mortgageOriginationDate).getFullYear()}</span>
          )}
        </div>
      )}
      {(d.mortgageLender || d.mortgageOriginalAmount) && !canSeeLoan && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.9rem' }}>🔒</span>
          <span style={{ color: 'rgba(255,255,255,0.35)' }}>Loan on record available on </span>
          <a href="/pricing" style={{ color: '#00e87a', textDecoration: 'none', fontWeight: 600 }}>Pro plan →</a>
        </div>
      )}

      {hasOpportunity ? (
        <div className="mh-highlight-box" style={{ borderColor: 'rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.05)' }}>
          <div className="mh-highlight-title" style={{ color: '#22c55e' }}>Refi opportunity</div>
          <div className="mh-stat-row" style={{ marginTop: 12, marginBottom: 0 }}>
            <div className="mh-stat" style={{ background: 'none', border: 'none', padding: 0 }}>
              <div className="mh-stat-label">Monthly savings</div>
              <div className="mh-stat-value" style={{ color: '#22c55e' }}>{fmt(d.refiMonthlySaving)}/mo</div>
            </div>
            <div className="mh-stat" style={{ background: 'none', border: 'none', padding: 0 }}>
              <div className="mh-stat-label">Annual savings</div>
              <div className="mh-stat-value">{fmt(d.refiMonthlySaving * 12)}/yr</div>
            </div>
            {d.refiBreakEven && (
              <div className="mh-stat" style={{ background: 'none', border: 'none', padding: 0 }}>
                <div className="mh-stat-label">Break-even</div>
                <div className="mh-stat-value">{d.refiBreakEven} months</div>
                <div className="mh-stat-sub">~{fmt(d.refiClosingCost)} closing costs</div>
              </div>
            )}
          </div>
          <Link
            href={(() => {
              const rawBal = d.estimatedBalance ?? (d.estimatedValue ? Math.round(d.estimatedValue * 0.65) : null);
              const effectiveRate = d.purchaseRate ?? d.liveRate;
              const balNote  = d.estimatedBalance ? '' : ' (approximate — based on estimated home value, adjust as needed)';
              const rateNote = d.purchaseRate     ? '' : ' (using today\'s market rate as reference — update if you know your actual rate)';
              const q = rawBal
                ? `I have a $${Math.round(rawBal).toLocaleString('en-US')} balance${balNote} at ${effectiveRate.toFixed(2)}%${rateNote}, market rate is ${d.liveRate.toFixed(2)}%. Should I refinance? Show monthly savings and break-even.`
                : `I have a mortgage at ${effectiveRate.toFixed(2)}%${rateNote}, market rate is ${d.liveRate.toFixed(2)}%. Should I refinance? What is the break-even point?`;
              return `/chat?sq=${encodeURIComponent(q)}`;
            })()}
            className="mh-cta-link"
            style={{ display: 'inline-block', marginTop: 14 }}
          >
            Run detailed refi analysis →
          </Link>
        </div>
      ) : (
        <div className="mh-empty-note">
          {(d.purchaseRate ?? 0) <= d.liveRate
            ? 'Your current rate is already at or below today\'s market — refinancing likely doesn\'t make sense right now.'
            : 'The rate gap is too small to justify refinancing costs at this time.'}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <div className="mh-section-sub-label" style={{ marginBottom: 8 }}>Loan payoff progress</div>
        <div className="mh-bar-label-row">
          <span>{d.paidOffPct}% paid off</span>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>{d.estimatedBalance ? fmt(d.estimatedBalance) + ' remaining' : ''}</span>
        </div>
        <div className="mh-bar-track" style={{ marginTop: 6 }}>
          <div className="mh-bar-fill" style={{ width: `${d.paidOffPct}%`, background: '#22c55e' }} />
          <div className="mh-bar-fill" style={{ width: `${100 - d.paidOffPct}%`, background: 'rgba(255,255,255,0.08)' }} />
        </div>
        {d.interestPaid && (
          <div className="mh-range-note" style={{ marginTop: 8 }}>
            Est. interest paid to date: <strong>{fmt(d.interestPaid)}</strong>
            {d.yearsElapsed ? ` over ${d.yearsElapsed} years` : ''}
          </div>
        )}
      </div>
    </div>
  );
}

function CardEconomy({ d }: { d: AnalysisData }) {
  return (
    <div>
      <div className="mh-stat-row" style={{ marginBottom: 20 }}>
        <div className="mh-stat">
          <div className="mh-stat-label">30yr Fixed</div>
          <div className="mh-stat-value">{rate(d.liveRate)}</div>
          <div className="mh-stat-sub">Freddie Mac avg</div>
        </div>
        <div className="mh-stat">
          <div className="mh-stat-label">Fed Funds</div>
          <div className="mh-stat-value">~{(d.prime - 3).toFixed(2)}%</div>
          <div className="mh-stat-sub">Implied from prime rate</div>
        </div>
        <div className="mh-stat">
          <div className="mh-stat-label">Prime Rate</div>
          <div className="mh-stat-value">{rate(d.prime)}</div>
          <div className="mh-stat-sub">Drives HELOC rates</div>
        </div>
      </div>

      {d.piti && d.rentMonthly && (
        <div style={{ marginTop: 4 }}>
          <div className="mh-section-sub-label" style={{ marginBottom: 10 }}>Rent vs. own — your area</div>
          <div className="mh-compare-row">
            <div className="mh-compare-item">
              <div className="mh-stat-label">Est. rent equivalent</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>{fmt(d.rentMonthly)}/mo</div>
            </div>
            <div className="mh-compare-divider" />
            <div className="mh-compare-item">
              <div className="mh-stat-label">Your est. P&I + tax/ins</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>{fmt(d.piti)}/mo</div>
            </div>
            {d.rentVsOwn !== null && (
              <>
                <div className="mh-compare-divider" />
                <div className="mh-compare-item">
                  <div className="mh-stat-label">
                    {d.rentVsOwn > 0 ? 'Owning saves' : 'Owning costs extra'}
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: d.rentVsOwn > 0 ? '#22c55e' : '#f97066' }}>
                    {fmt(Math.abs(d.rentVsOwn))}/mo
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="mh-footnote">Rent estimate from HUD Fair Market Rent data. Ownership cost includes est. taxes &amp; insurance at 1.5% annual.</div>
        </div>
      )}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <Link href={`/chat?sq=${encodeURIComponent(`I own ${d.address}. Market rate is ${d.liveRate.toFixed(2)}% and my rate is ${d.purchaseRate?.toFixed(2) ?? 'unknown'}%. How do current economic conditions — rates, prime, Fed direction — affect my refi timing, HELOC rate, and overall equity strategy?`)}`} className="mh-cta-link">
          How do rates affect my options? →
        </Link>
      </div>
    </div>
  );
}

function CardMilestones({ d }: { d: AnalysisData }) {
  const items = [];

  if (d.estimatedEquity && d.estimatedEquity > 100_000) {
    const rounded = Math.floor(d.estimatedEquity / 100_000) * 100_000;
    items.push({
      done: true, color: '#22c55e',
      label: `Reached ${fmt(rounded)} equity`,
      detail: `Currently at ${fmt(d.estimatedEquity)} — ${pct(d.equityPct)} of home value`,
    });
  }

  if (d.payoffYear) {
    const yrs = d.payoffYear - new Date().getFullYear();
    items.push({
      done: false, color: '#eab308',
      label: 'Pay off mortgage',
      detail: `${d.payoffYear} · ${yrs} years remaining at current rate`,
    });
  }

  if (d.nextValueTarget && d.nextValueTargetYear) {
    items.push({
      done: false, color: 'rgba(255,255,255,0.3)',
      label: `Reach ${fmt(d.nextValueTarget)} value`,
      detail: `~${d.nextValueTargetYear} at 4.2% annual appreciation`,
    });
  }

  if (items.length === 0) {
    return <p className="mh-empty-note">Not enough data to compute milestones. Make sure your address is saved and the digest has run at least once.</p>;
  }

  return (
    <div>
      {items.map((m, i) => (
        <div key={i} className="mh-milestone-row">
          <div className="mh-milestone-dot" style={{ background: m.color, opacity: m.done ? 1 : 0.4 }} />
          <div className="mh-milestone-body">
            <div className="mh-milestone-label" style={{ color: m.done ? '#22c55e' : '#fff' }}>
              {m.label}
              {m.done && <span className="mh-milestone-done-badge">Done</span>}
            </div>
            <div className="mh-milestone-detail">{m.detail}</div>
          </div>
        </div>
      ))}
      <div className="mh-footnote" style={{ marginTop: 16 }}>Milestones based on ATTOM AVM or FHFA model, FRED live rates, and 4.2% national avg. appreciation.</div>
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <Link href={`/chat?sq=${encodeURIComponent(`Payoff and wealth plan for ${d.address}: mortgage balance $${d.estimatedBalance ? Math.round(d.estimatedBalance).toLocaleString() : 'unknown'}${d.purchaseRate ? ` at ${d.purchaseRate}%` : ''}${d.payoffYear ? `, payoff projected ${d.payoffYear}` : ''}${d.estimatedEquity ? ` — current equity $${Math.round(d.estimatedEquity).toLocaleString()}` : ''}. Build a full equity trajectory, payoff acceleration options, and wealth-building milestones.`)}`} className="mh-cta-link">
          Get my full payoff plan →
        </Link>
      </div>
    </div>
  );
}

// ── Sparkline component ────────────────────────────────────────────────────────

function Sparkline({ history }: { history: { date: string; value: number }[] }) {
  if (history.length < 2) return null;
  const vals = history.map(h => h.value);
  const min  = Math.min(...vals);
  const max  = Math.max(...vals);
  const range = max - min || 1;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 48, marginTop: 4 }}>
      {vals.map((v, i) => {
        const h = Math.max(4, Math.round(((v - min) / range) * 40));
        const isLast = i === vals.length - 1;
        return (
          <div
            key={i}
            style={{
              flex: 1, height: h, borderRadius: '2px 2px 0 0',
              background: isLast ? '#22c55e' : 'rgba(34,197,94,0.3)',
              transition: 'height 0.3s',
            }}
          />
        );
      })}
    </div>
  );
}

// Build a /chat URL that passes full CMA paramOverrides so the CMA card fires deterministically
function buildCMAUrl(d: AnalysisData): string {
  const addr  = d.address ?? '';
  const parts = addr.split(',');
  const city  = parts[1]?.trim() ?? '';
  const stateM = parts[2]?.trim().match(/^([A-Z]{2})/);
  const state = stateM?.[1] ?? '';
  const price = d.listPrice ?? d.estimatedValue ?? null;
  const taxAnnual = price ? Math.round(price * 0.011) : undefined;
  const seed  = `Property intelligence report: ${addr}`;
  const p = new URLSearchParams({ sq: seed, cmaAddress: addr });
  if (city)           p.set('cmaCity', city);
  if (state)          p.set('cmaState', state);
  if (price)          p.set('cmaPrice', String(Math.round(price)));
  if (d.beds != null) p.set('cmaBeds', String(d.beds));
  if (d.baths != null) p.set('cmaBaths', String(d.baths));
  if (d.sqft != null) p.set('cmaSqft', String(d.sqft));
  if (taxAnnual)      p.set('cmaTaxAnnual', String(taxAnnual));
  p.set('cmaTaxRate', '0.011');
  if (d.liveRate)     p.set('cmaLiveRate', String(d.liveRate));
  return `/chat?${p.toString()}`;
}

// ── Buyer Cards ───────────────────────────────────────────────────────────────

function CardMarketPosition({ d, onFeelingLucky }: { d: AnalysisData; nearbySales?: NearbySale[]; onFeelingLucky?: () => void }) {
  const listPrice = d.listPrice;
  const avm       = d.estimatedValue;
  const basis     = d.lastSalePrice;
  const basisYear = d.lastSaleDate?.match(/\d{4}/)?.[0] ?? null;
  const spread    = (listPrice && avm) ? Math.round((avm - listPrice) / listPrice * 100) : null;
  const basisGain = (listPrice && basis && basis > 0) ? Math.round((listPrice - basis) / basis * 100) : null;
  const psf       = (listPrice && d.sqft) ? Math.round(listPrice / d.sqft) : null;


  return (
    <div className="mh-card">
      <div className="mh-card-label">Market Position</div>
      <div className="mh-stat-row">
        <div className="mh-stat">
          <div className="mh-stat-label">List Price</div>
          <div className="mh-stat-value" style={{ color: '#93c5fd' }}>{listPrice ? fmt(listPrice) : '—'}</div>
          <div className="mh-stat-sub">{psf ? `$${psf}/sqft` : ''}</div>
        </div>
        <div className="mh-stat">
          <div className="mh-stat-label">Redfin AVM</div>
          <div className="mh-stat-value" style={{ color: spread != null ? (spread >= 0 ? '#22c55e' : '#f87171') : '#f1f5f9' }}>
            {avm ? fmt(avm) : '—'}
          </div>
          <div className="mh-stat-sub">{spread != null ? `${spread > 0 ? '+' : ''}${spread}% vs ask` : ''}</div>
        </div>
        {/* AI Market Analysis — Feeling Lucky box */}
        <button
          onClick={onFeelingLucky}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '14px 10px',
            borderRadius: 10,
            background: 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(59,130,246,0.10) 100%)',
            border: '1px solid rgba(139,92,246,0.30)',
            cursor: onFeelingLucky ? 'pointer' : 'default',
            transition: 'border-color 0.2s, box-shadow 0.2s',
            boxShadow: '0 0 0 0 rgba(139,92,246,0)',
          }}
          onMouseOver={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139,92,246,0.65)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 18px rgba(139,92,246,0.25)';
          }}
          onMouseOut={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139,92,246,0.30)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 0 rgba(139,92,246,0)';
          }}
        >
          {/* Pandora's box icon */}
          <span style={{ fontSize: 26, lineHeight: 1, filter: 'drop-shadow(0 0 8px rgba(167,139,250,0.7))' }}>🔮</span>
          <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.9)', textAlign: 'center', lineHeight: 1.3 }}>
            AI Market<br />Analysis
          </div>
          <div style={{ fontSize: '0.58rem', color: 'rgba(139,92,246,0.7)', fontWeight: 600, textAlign: 'center' }}>
            Feeling Lucky? ✦
          </div>
          <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginTop: 2 }}>
            {['G', 'T', 'AI'].map(lbl => (
              <span key={lbl} style={{ fontSize: '0.5rem', padding: '1px 4px', borderRadius: 3, background: 'rgba(139,92,246,0.18)', color: 'rgba(167,139,250,0.8)', fontWeight: 700, letterSpacing: '0.03em' }}>{lbl}</span>
            ))}
          </div>
        </button>
      </div>
      {d.daysOnMarket != null && (
        <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(99,179,237,0.06)', border: '1px solid rgba(99,179,237,0.15)', borderRadius: 8 }}>
          <div style={{ fontSize: '0.72rem', color: '#93c5fd', fontWeight: 700 }}>
            {d.daysOnMarket <= 7 ? '🔥 Fresh listing' : d.daysOnMarket <= 30 ? '📅 Active listing' : '⏳ Extended time on market'}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: 3 }}>
            {d.daysOnMarket} days on market{d.daysOnMarket > 30 ? ' — sellers may have more flexibility on price' : ''}
          </div>
        </div>
      )}
      {d.beds || d.baths || d.sqft ? (
        <div style={{ marginTop: 12, fontSize: '0.78rem', color: '#475569' }}>
          {[d.beds && `${d.beds} bd`, d.baths && `${d.baths} ba`, d.sqft && `${d.sqft.toLocaleString()} sqft`].filter(Boolean).join(' · ')}
        </div>
      ) : null}
    </div>
  );
}

function CardMyPayment({ d }: { d: AnalysisData }) {
  const askPrice = d.listPrice ?? d.estimatedValue;
  const liveRate = d.liveRate;
  function pitiAt(price: number, r: number) {
    const p = price * 0.80, mo = r / 100 / 12, n = 360;
    const pi = mo > 0 ? (p * mo * Math.pow(1+mo,n)) / (Math.pow(1+mo,n)-1) : p/n;
    return Math.round(pi + price * 0.011 / 12 + price * 0.005 / 12);
  }
  if (!askPrice) return (
    <div className="mh-card">
      <div className="mh-card-label">My Payment</div>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>List price not available.</div>
    </div>
  );
  const rows = [
    { label: `Today (${liveRate.toFixed(2)}%)`,           rate: liveRate,       highlight: true },
    { label: `+0.5% (${(liveRate+0.5).toFixed(2)}%)`,     rate: liveRate + 0.5, highlight: false },
    { label: `-0.5% (${(liveRate-0.5).toFixed(2)}%)`,     rate: liveRate - 0.5, highlight: false },
    { label: `-1.0% (${(liveRate-1.0).toFixed(2)}%)`,     rate: liveRate - 1.0, highlight: false },
  ].filter(r => r.rate >= 3 && r.rate <= 12);
  const base = pitiAt(askPrice, liveRate);
  return (
    <div className="mh-card">
      <div className="mh-card-label">My Payment at Ask Price</div>
      <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: 16 }}>
        {fmt(askPrice)} · 20% down · P&amp;I + taxes + insurance
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>{['Rate', 'Monthly PITI', 'vs Today'].map(h => (
            <th key={h} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', textAlign: 'left', paddingBottom: 8 }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const p = pitiAt(askPrice, row.rate);
            const diff = p - base;
            return (
              <tr key={i} style={{ background: row.highlight ? 'rgba(99,179,237,0.06)' : 'transparent', borderRadius: 6 }}>
                <td style={{ fontSize: '0.82rem', color: row.highlight ? '#93c5fd' : '#64748b', padding: '8px 0', fontWeight: row.highlight ? 700 : 400 }}>{row.label}</td>
                <td style={{ fontSize: '1rem', fontWeight: 700, color: row.highlight ? '#f1f5f9' : '#94a3b8', padding: '8px 0' }}>${p.toLocaleString()}/mo</td>
                <td style={{ fontSize: '0.82rem', color: diff < 0 ? '#22c55e' : diff > 0 ? '#f87171' : '#64748b', padding: '8px 0' }}>
                  {row.highlight ? '—' : `${diff < 0 ? '−' : '+'}$${Math.abs(diff).toLocaleString()}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: '0.68rem', color: '#334155' }}>
        Down payment: ${Math.round(askPrice * 0.20).toLocaleString()} · Loan amount: ${Math.round(askPrice * 0.80).toLocaleString()}
      </div>
    </div>
  );
}

function CardCompDelta({ d, nearbySales }: { d: AnalysisData; nearbySales?: NearbySale[] }) {
  const askPrice   = d.listPrice ?? d.estimatedValue;
  const askPsf     = (askPrice && d.sqft) ? Math.round(askPrice / d.sqft) : null;
  const valid      = (nearbySales ?? []).filter(s => s.price > 0);
  const avgPrice   = valid.length ? Math.round(valid.reduce((s, c) => s + c.price, 0) / valid.length) : null;
  const psfComps   = valid.filter(s => s.pricePerSqft && s.pricePerSqft > 0);
  const avgPsf     = psfComps.length ? Math.round(psfComps.reduce((s, c) => s + (c.pricePerSqft ?? 0), 0) / psfComps.length) : null;
  const priceDelta = (askPrice && avgPrice) ? Math.round((askPrice - avgPrice) / avgPrice * 100) : null;
  const psfDelta   = (askPsf && avgPsf) ? Math.round((askPsf - avgPsf) / avgPsf * 100) : null;
  if (valid.length < 3) return (
    <div className="mh-card">
      <div className="mh-card-label">Comp Analysis</div>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', textAlign: 'center', padding: '28px 0' }}>
        Not enough local sales data (need ≥ 3 recent comps).<br />
        <a href={buildCMAUrl(d)} style={{ color: '#93c5fd', textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>Run a full CMA in chat →</a>
      </div>
    </div>
  );
  return (
    <div className="mh-card">
      <div className="mh-card-label">Comp Analysis · {valid.length} Nearby Sales</div>
      <div className="mh-stat-row">
        <div className="mh-stat">
          <div className="mh-stat-label">This Home (Ask)</div>
          <div className="mh-stat-value" style={{ color: '#93c5fd' }}>{askPrice ? fmt(askPrice) : '—'}</div>
          <div className="mh-stat-sub">{askPsf ? `$${askPsf}/sqft` : ''}</div>
        </div>
        <div className="mh-stat">
          <div className="mh-stat-label">Avg Nearby Sale</div>
          <div className="mh-stat-value">{avgPrice ? fmt(avgPrice) : '—'}</div>
          <div className="mh-stat-sub">{avgPsf ? `$${avgPsf}/sqft` : ''}</div>
        </div>
        <div className="mh-stat">
          <div className="mh-stat-label">vs Comps</div>
          <div className="mh-stat-value" style={{ color: priceDelta != null ? (priceDelta > 5 ? '#f87171' : priceDelta < -5 ? '#22c55e' : '#f1f5f9') : undefined }}>
            {priceDelta != null ? `${priceDelta > 0 ? '+' : ''}${priceDelta}%` : '—'}
          </div>
          <div className="mh-stat-sub">{psfDelta != null ? `${psfDelta > 0 ? '+' : ''}${psfDelta}% $/sqft` : ''}</div>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        {valid.slice(0, 4).map((s, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.address}</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f1f5f9' }}>{fmt(s.price)}</span>
              {s.pricePerSqft && <span style={{ fontSize: '0.72rem', color: '#334155' }}>${s.pricePerSqft}/sf</span>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(99,179,237,0.12)' }}>
        <a href={buildCMAUrl(d)} className="mh-cta-link" style={{ color: '#93c5fd' }}>
          Run a full CMA with full market data →
        </a>
      </div>
    </div>
  );
}

function CardTrueCost({ d }: { d: AnalysisData }) {
  const askPrice = d.listPrice ?? d.estimatedValue;
  const rate     = d.liveRate;
  if (!askPrice) return (
    <div className="mh-card">
      <div className="mh-card-label">True Cost</div>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>List price not available.</div>
    </div>
  );
  function calcHorizon(years: number) {
    const p = askPrice! * 0.80, r = rate / 100 / 12, n = 360, k = years * 12;
    const pmt        = r > 0 ? (p * r * Math.pow(1+r,n)) / (Math.pow(1+r,n)-1) : p/n;
    const balAfter   = r > 0 ? p * (Math.pow(1+r,n) - Math.pow(1+r,k)) / (Math.pow(1+r,n)-1) : Math.max(0, p - pmt*k);
    const valueAfter = Math.round(askPrice! * Math.pow(1.042, years));
    const equity     = Math.round(valueAfter - balAfter);
    const intPaid    = Math.round(pmt * k - (p - balAfter));
    return { valueAfter, equity, intPaid };
  }
  const h5 = calcHorizon(5), h10 = calcHorizon(10);
  return (
    <div className="mh-card">
      <div className="mh-card-label">True Cost of Ownership</div>
      <div style={{ fontSize: '0.72rem', color: '#475569', marginBottom: 16 }}>At {rate.toFixed(2)}% · 20% down · 4.2%/yr appreciation</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {([{ label: '5 Years', h: h5 }, { label: '10 Years', h: h10 }] as const).map(({ label, h }) => (
          <div key={label} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#93c5fd', marginBottom: 10 }}>{label}</div>
            {[
              { label: 'Interest Paid', value: fmt(h.intPaid),    color: '#f87171' },
              { label: 'Est. Value',    value: fmt(h.valueAfter), color: '#22c55e' },
              { label: 'Equity Built',  value: fmt(h.equity),     color: '#22c55e' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: '0.72rem', color: '#475569' }}>{s.label}</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, fontSize: '0.65rem', color: '#334155', lineHeight: 1.5 }}>
        Assumes 20% down, 30yr fixed, 1.1% tax, 0.5% insurance, 4.2%/yr appreciation (FHFA historical avg).
      </div>
    </div>
  );
}

function CardOfferSignal({ d, nearbySales }: { d: AnalysisData; nearbySales?: NearbySale[] }) {
  const askPrice   = d.listPrice ?? d.estimatedValue;
  const avm        = d.estimatedValue;
  const dom        = d.daysOnMarket;
  const valid      = (nearbySales ?? []).filter(s => s.price > 0);
  const avgComp    = valid.length >= 3 ? Math.round(valid.reduce((s, c) => s + c.price, 0) / valid.length) : null;
  const avmDelta   = (askPrice && avm) ? (askPrice - avm) / avm * 100 : null;
  const compDelta  = (askPrice && avgComp) ? (askPrice - avgComp) / avgComp * 100 : null;
  const delta      = avmDelta ?? compDelta;
  let priceSignal: 'below' | 'at' | 'above' = 'at';
  let priceReason = '';
  if (delta != null) {
    if (delta > 7)       { priceSignal = 'above'; priceReason = `Listed ${Math.round(delta)}% above ${avm ? 'Redfin AVM' : 'avg comp'}`; }
    else if (delta < -5) { priceSignal = 'below'; priceReason = `Listed ${Math.round(Math.abs(delta))}% below ${avm ? 'Redfin AVM' : 'avg comp'}`; }
    else                 { priceSignal = 'at';    priceReason = `Within ${Math.abs(Math.round(delta))}% of ${avm ? 'Redfin AVM' : 'avg comp'}`; }
  }
  const domSignal = dom != null ? (dom <= 7 ? 'hot' : dom <= 30 ? 'normal' : 'slow') : null;
  const SIG = {
    below: { label: 'Below Market', color: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.3)',   icon: '↓' },
    at:    { label: 'At Market',    color: '#f1f5f9', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)', icon: '≈' },
    above: { label: 'Above Market', color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.3)', icon: '↑' },
  }[priceSignal];
  const factors: { label: string; value: string; ok: boolean }[] = [];
  if (avmDelta != null)  factors.push({ label: 'vs Redfin AVM',  value: `${avmDelta > 0 ? '+' : ''}${Math.round(avmDelta)}%`,   ok: avmDelta < 5 });
  if (compDelta != null) factors.push({ label: 'vs Nearby Sales', value: `${compDelta > 0 ? '+' : ''}${Math.round(compDelta)}%`, ok: compDelta < 5 });
  if (dom != null)       factors.push({ label: 'Days on Market',  value: `${dom}d`,                                               ok: dom < 30 });
  return (
    <div className="mh-card">
      <div className="mh-card-label">Offer Signal</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{ padding: '14px 24px', background: SIG.bg, border: `1px solid ${SIG.border}`, borderRadius: 12, textAlign: 'center', minWidth: 120, flexShrink: 0 }}>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: SIG.color, lineHeight: 1 }}>{SIG.icon}</div>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: SIG.color, marginTop: 4 }}>{SIG.label}</div>
        </div>
        <div>
          {priceReason && <div style={{ fontSize: '0.88rem', color: '#e2e8f0', marginBottom: 6 }}>{priceReason}</div>}
          {domSignal === 'slow'   && <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>On market {dom} days — sellers may be more open to offers</div>}
          {domSignal === 'hot'    && <div style={{ fontSize: '0.78rem', color: '#fbbf24' }}>Fresh listing — expect competition, move quickly</div>}
          {domSignal === 'normal' && <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Normal market pace ({dom} days on market)</div>}
          {!delta && <div style={{ fontSize: '0.78rem', color: '#475569' }}>Limited AVM or comp data for a precise signal — use chat CMA for deeper analysis</div>}
        </div>
      </div>
      {factors.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155', marginBottom: 10 }}>Key Factors</div>
          {factors.map((f, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{f.label}</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: f.ok ? '#22c55e' : '#f87171' }}>{f.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Map /api/property/lookup response → AnalysisData ─────────────────────────
function lookupToAnalysis(d: any, liveRate: number): AnalysisData {
  const prime = 7.5;
  const helocRate = prime + 0.5;

  // Parse sale data first — needed for value + balance estimation below
  const lastSalePrice   = (d.lastSalePrice  as number | null) ?? (d.price as number | null) ?? null;
  const lastSaleDate    = (d.lastSaleDate   as string | null) ?? null;
  const remainingMonths = (d.remainingMonths as number | null) ?? null;
  // purchaseRate may be null when API computed it in FOR_SALE mode; derive from year as fallback
  const HIST_RATES_CLIENT: Record<number, number> = {
    2025:6.76,2024:6.87,2023:6.81,2022:5.34,2021:2.96,2020:3.11,2019:3.94,2018:4.54,
    2017:3.99,2016:3.65,2015:3.85,2014:4.17,2013:3.98,2012:3.66,2011:4.45,2010:4.69,
    2009:5.04,2008:6.03,2007:6.34,2006:6.41,2005:5.87,2004:5.84,
  };
  let purchaseRate = (d.purchaseRate as number | null) ?? null;
  if (!purchaseRate && lastSaleDate) {
    const yr = parseInt(lastSaleDate.match(/\d{4}/)?.[0] ?? '0');
    if (yr >= 2004) purchaseRate = HIST_RATES_CLIENT[yr] ?? 5.5;
  }

  // Fall back: estimatedValue → listing price → lastSalePrice + FHFA 4.2%/yr appreciation
  let estimatedValue = (d.estimatedValue as number | null) ?? (d.price as number | null) ?? null;
  if (!estimatedValue && lastSalePrice) {
    if (lastSaleDate) {
      const saleYr = parseInt(lastSaleDate.match(/\d{4}/)?.[0] ?? '0');
      if (saleYr >= 1950) {
        const yearsHeld = Math.max(0, new Date().getFullYear() - saleYr);
        estimatedValue = Math.round(lastSalePrice * Math.pow(1.042, yearsHeld));
      } else {
        estimatedValue = lastSalePrice;
      }
    } else {
      estimatedValue = lastSalePrice;
    }
  }

  let estimatedBalance = (d.estimatedBalance as number | null) ?? null;
  let estimatedEquity  = (d.estimatedEquity  as number | null) ?? null;

  // Estimate mortgage balance via amortization when Redfin doesn't provide it
  if (!estimatedBalance && lastSalePrice && lastSaleDate && purchaseRate) {
    const saleYr = parseInt(lastSaleDate.match(/\d{4}/)?.[0] ?? '0');
    if (saleYr >= 1970) {
      const monthsElapsed = Math.min(360, Math.max(0,
        Math.round((Date.now() - new Date(saleYr, 0, 1).getTime()) / (30.44 * 24 * 60 * 60 * 1000))
      ));
      if (monthsElapsed < 360) {
        const p = lastSalePrice * 0.80, r = purchaseRate / 100 / 12, n = 360;
        const remainingBal = r > 0
          ? p * (Math.pow(1+r, n) - Math.pow(1+r, monthsElapsed)) / (Math.pow(1+r, n) - 1)
          : Math.max(0, p - (p / n) * monthsElapsed);
        estimatedBalance = Math.max(0, Math.round(remainingBal));
      }
    }
  }

  // Derive equity when Redfin doesn't provide it
  if (!estimatedEquity && estimatedBalance != null && estimatedValue) {
    estimatedEquity = Math.round(estimatedValue - estimatedBalance);
  }

  const ltv        = (estimatedBalance && estimatedValue) ? Math.round(estimatedBalance / estimatedValue * 100) : null;
  const equityPct  = (estimatedEquity  && estimatedValue) ? Math.round(Math.max(0, estimatedEquity) / estimatedValue * 100) : null;
  const appreciationPct = (lastSalePrice && estimatedValue && lastSalePrice > 0)
    ? Math.round((estimatedValue - lastSalePrice) / lastSalePrice * 100) : null;

  // HELOC / cash-out
  const helocMax   = (estimatedValue && estimatedBalance) ? Math.max(0, Math.round(estimatedValue * 0.85 - estimatedBalance)) : null;
  const cashOutMax = (estimatedValue && estimatedBalance) ? Math.max(0, Math.round(estimatedValue * 0.80 - estimatedBalance)) : null;

  const helocDraws: AnalysisData['helocDraws'] = [];
  if (helocMax && helocMax >= 25_000) {
    const r = helocRate / 100 / 12;
    for (const [label, amt] of [
      ['25% draw', Math.round(helocMax * 0.25)],
      ['50% draw', Math.round(helocMax * 0.50)],
      ['Max draw', helocMax],
    ] as [string, number][]) {
      helocDraws.push({
        label, amount: amt,
        interestOnly: Math.round(amt * r),
        amortizing: Math.round((amt * r * Math.pow(1 + r, 240)) / (Math.pow(1 + r, 240) - 1)),
      });
    }
  }

  // PITI (based on original purchase, not current market rate)
  let piti: number | null = null;
  if (lastSalePrice && purchaseRate) {
    const r = purchaseRate / 100 / 12, n = 360, p = lastSalePrice * 0.80;
    const pi = r > 0 ? (p * r * Math.pow(1+r,n)) / (Math.pow(1+r,n) - 1) : p / n;
    const tax = (estimatedValue ?? lastSalePrice) * 0.011 / 12;
    const ins = (estimatedValue ?? lastSalePrice) * 0.005 / 12;
    piti = Math.round(pi + tax + ins);
  }

  // Refi savings
  const refiClosingCost = estimatedBalance ? Math.round(estimatedBalance * 0.01) : 10_000;
  let refiMonthlySaving = 0;
  let refiBreakEven: number | null = null;
  if (estimatedBalance && purchaseRate && liveRate < purchaseRate) {
    const n = remainingMonths ?? 360;
    const r1 = purchaseRate / 100 / 12, r2 = liveRate / 100 / 12;
    const pmt1 = r1 > 0 ? (estimatedBalance * r1 * Math.pow(1+r1,n)) / (Math.pow(1+r1,n) - 1) : estimatedBalance / n;
    const pmt2 = r2 > 0 ? (estimatedBalance * r2 * Math.pow(1+r2,n)) / (Math.pow(1+r2,n) - 1) : estimatedBalance / n;
    refiMonthlySaving = Math.max(0, Math.round(pmt1 - pmt2));
    if (refiMonthlySaving > 0) refiBreakEven = Math.ceil(refiClosingCost / refiMonthlySaving);
  }

  // Payoff progress
  let paidOffPct = 0, yearsElapsed: number | null = null, payoffYear: number | null = null;
  let interestPaid: number | null = null;
  if (lastSaleDate && purchaseRate && lastSalePrice) {
    const mo: Record<string,number> = { january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const parts = lastSaleDate.toLowerCase().split(/[\s,]+/);
    const yr = parseInt(parts.find(p => /^\d{4}$/.test(p)) ?? '0');
    const mn = mo[parts[0]] ?? mo[parts[1]] ?? 0;
    if (yr > 1990) {
      const sd = new Date(yr, mn, 1);
      const elapsed = Math.max(0, Math.round((Date.now() - sd.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
      yearsElapsed = Math.round(elapsed / 12);
      paidOffPct   = Math.min(100, Math.round(elapsed / 360 * 100));
      payoffYear   = new Date().getFullYear() + Math.round(Math.max(0, 360 - elapsed) / 12);
      const p = lastSalePrice * 0.80, r = purchaseRate / 100 / 12, n = 360;
      const pmt = r > 0 ? (p * r * Math.pow(1+r,n)) / (Math.pow(1+r,n) - 1) : p / n;
      interestPaid = Math.round(pmt * elapsed - (p - (estimatedBalance ?? 0)));
    }
  }

  // 12-month value trend (backwards from today at 4.2% annual)
  const valueHistory: { date: string; value: number }[] = [];
  if (estimatedValue) {
    const mr = 0.042 / 12;
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(); dt.setMonth(dt.getMonth() - i);
      valueHistory.push({ date: dt.toISOString().slice(0, 7), value: Math.round(estimatedValue / Math.pow(1 + mr, i)) });
    }
  }

  // Next value milestone
  let nextValueTarget: number | null = null, nextValueTargetYear: number | null = null;
  if (estimatedValue) {
    nextValueTarget = Math.ceil((estimatedValue + 1) / 500_000) * 500_000;
    nextValueTargetYear = new Date().getFullYear() + Math.max(1, Math.ceil(Math.log(nextValueTarget / estimatedValue) / Math.log(1.042)));
  }

  // Listing context
  // If cached data says FOR_SALE but there's a recent sale date (< 18 months),
  // the snapshot is stale — the property has since sold.
  let listingStatus = (d.listingStatus as string | null) ?? 'UNKNOWN';
  if (listingStatus === 'FOR_SALE') {
    const rawDate = d.lastSaleDate as string | null;
    if (rawDate) {
      const parsed = new Date(rawDate);
      const monthsOld = isNaN(parsed.getTime())
        ? Infinity
        : (Date.now() - parsed.getTime()) / (30.44 * 24 * 3600 * 1000);
      if (monthsOld <= 18) listingStatus = 'SOLD';
    }
  }
  const daysOnMarket  = (d.daysOnMarket  as number | null) ?? null;
  const listPrice     = (listingStatus === 'FOR_SALE' || listingStatus === 'PENDING')
    ? ((d.price as number | null) ?? estimatedValue)
    : null;
  const beds  = (d.beds  as number | null) ?? null;
  const baths = (d.baths as number | null) ?? null;
  const sqft  = (d.sqft  as number | null) ?? null;

  return {
    address: (d.address as string | null) || '',
    estimatedValue, estimatedValueLow: d.estimatedValueLow ?? null, estimatedValueHigh: d.estimatedValueHigh ?? null,
    estimatedBalance, estimatedEquity, purchaseRate, lastSaleDate, lastSalePrice,
    liveRate, rentEstimate: null, valueHistory,
    ltv, equityPct, appreciationPct,
    helocMax, helocRate, helocRateLabel: 'Prime + 0.50%', cashOutMax, helocDraws,
    refiMonthlySaving, refiBreakEven, refiClosingCost,
    paidOffPct, interestPaid, yearsElapsed, payoffYear,
    nextValueTarget, nextValueTargetYear,
    piti, rentMonthly: null, rentVsOwn: null, prime,
    savedOverrides: { actual_balance: null, actual_rate: null, actual_purchase_price: null, actual_purchase_date: null },
    balanceIsEstimated: true, rateIsEstimated: true,
    listingStatus, daysOnMarket, listPrice, beds, baths, sqft,
    yearBuilt: null, propertyType: null, lotSizeSqft: null, apn: null,
    avmSource: null, avmConfidence: null, avmDate: null,
    mortgageSource: null, mortgageLender: null, mortgageOriginalAmount: null, mortgageOriginationDate: null,
    comps: [], streetViewUrl: null, staticMapUrl: null, attomCheckedAt: null,
  };
}

// ── Main page ──────────────────────────────────────────────────────────────────

function MyHomePageInner() {
  const { user, isLoaded } = useUser();
  const searchParams = useSearchParams()!;
  const borrowerId    = searchParams?.get('borrower_id') ?? null;
  const previewAddress = searchParams?.get('address') ?? null; // from /homeowner page
  const chipParam     = searchParams?.get('chip') as ChipId | null;

  // Multi-home state
  const [properties, setProperties]           = useState<HomeownerProperty[]>([]);
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);
  const [loading, setLoading]                 = useState(true);
  const [newAddress, setNewAddress]           = useState('');
  const [addingNew, setAddingNew]             = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [saved, setSaved]                     = useState(false);

  const CHIP_IDS: ChipId[] = ['equity', 'heloc', 'refi', 'economy', 'milestones'];
  const [activeChip, setActiveChip]           = useState<ChipId>(
    chipParam && CHIP_IDS.includes(chipParam) ? chipParam : 'equity'
  );
  const [activeBuyerChip, setActiveBuyerChip] = useState<BuyerChipId>('position');
  const [analysis, setAnalysis]               = useState<AnalysisData | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisErr, setAnalysisErr]         = useState('');

  // Loan detail editor (consumer only)
  const [editingLoan, setEditingLoan]               = useState(false);
  const [loanBalance, setLoanBalance]               = useState('');
  const [loanRate, setLoanRate]                     = useState('');
  const [loanPurchasePrice, setLoanPurchasePrice]   = useState('');
  const [loanPurchaseDate, setLoanPurchaseDate]     = useState('');
  const [loanSaving, setLoanSaving]                 = useState(false);
  const [loanSaved, setLoanSaved]                   = useState(false);

  // Rate Watch
  const [alertRate, setAlertRate]   = useState('');
  const [alertSaved, setAlertSaved] = useState(false);
  const [alertSaving, setAlertSaving] = useState(false);
  const [showAlertBox, setShowAlertBox] = useState(false);

  // Nearby sales
  const [nearbySales, setNearbySales] = useState<NearbySale[]>([]);

  // Market Intelligence modal
  const [marketIntelResult, setMarketIntelResult] = useState<any>(null);
  const [marketIntelLoading, setMarketIntelLoading] = useState(false);

  // User plan — loan-on-record is Pro-only
  const [userPlan, setUserPlan] = useState<string>('free');
  useEffect(() => {
    if (!isLoaded || !user) return;
    fetch('/api/user/plan').then(r => r.json()).then(d => { if (d?.plan) setUserPlan(d.plan); }).catch(() => {});
  }, [isLoaded, user]);

  // Derived
  const activeProperty = properties.find(p => p.id === activePropertyId)
    ?? properties.find(p => p.is_primary)
    ?? properties[0]
    ?? null;
  const hasAddress = borrowerId ? true : previewAddress ? true : properties.length > 0;

  // Load property list on mount
  useEffect(() => {
    if (previewAddress) { setLoading(false); return; } // preview mode — no saved properties needed
    if (!isLoaded || !user) return;
    if (borrowerId) { setLoading(false); return; }
    fetch('/api/homeowner/save')
      .then(r => r.json())
      .then(({ properties: props }: { properties: HomeownerProperty[] }) => {
        const list = props ?? [];
        setProperties(list);
        const primary = list.find(p => p.is_primary) ?? list[0];
        if (primary) setActivePropertyId(primary.id);
      })
      .finally(() => setLoading(false));
  }, [isLoaded, user, borrowerId, previewAddress]);

  // Load analysis whenever active property changes
  useEffect(() => {
    if (borrowerId) {
      if (!analysisLoading) loadAnalysis();
      return;
    }
    if (previewAddress) {
      if (!analysisLoading) loadAnalysis();
      return;
    }
    if (!activeProperty?.id) return;
    loadAnalysis(activeProperty.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProperty?.id, borrowerId, previewAddress]);

  async function loadAnalysis(propertyId?: string) {
    const pid = propertyId ?? activeProperty?.id;
    if (!borrowerId && !previewAddress && !pid) return;
    setAnalysisLoading(true);
    setAnalysisErr('');
    setAnalysis(null);
    try {
      // LO borrower view
      if (borrowerId) {
        const bust = `_t=${Date.now()}`;
        const res = await fetch(`/api/homeowner/analysis?borrower_id=${encodeURIComponent(borrowerId)}&${bust}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) { setAnalysisErr(data.error ?? 'Could not load analysis'); return; }
        setAnalysis(data);
        return;
      }

      // Authenticated homeowner — use homeowner/analysis for ATTOM-powered intelligence
      if (!previewAddress && activeProperty) {
        const qp = activeProperty.id ? `?property_id=${encodeURIComponent(activeProperty.id)}&_t=${Date.now()}` : `?_t=${Date.now()}`;
        const res = await fetch(`/api/homeowner/analysis${qp}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) { setAnalysisErr(data.error ?? 'Could not load analysis'); return; }

        // FOR SALE / PENDING: ATTOM has no reliable listing data — always use Redfin
        if (data.listingStatus === 'FOR_SALE' || data.listingStatus === 'PENDING') {
          const addr = activeProperty.property_address;
          const [lookupRes, tickerRes] = await Promise.all([
            fetch('/api/property/lookup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ address: addr }),
              cache: 'no-store',
            }),
            fetch('/api/ticker', { cache: 'no-store' }).catch(() => null),
          ]);
          const lookupJson = await lookupRes.json();
          if (lookupRes.ok && lookupJson.ok && lookupJson.data) {
            const tickerJson = tickerRes ? await tickerRes.json().catch(() => null) : null;
            const thirtyY = tickerJson?.items?.find((i: any) => i.label === '30Y FIXED');
            let liveRate = 6.65;
            if (thirtyY?.value) {
              const parsed = parseFloat(String(thirtyY.value).replace('%', ''));
              if (Number.isFinite(parsed) && parsed > 3 && parsed < 12) liveRate = parsed;
            }
            // homeowner/analysis confirmed FOR_SALE — carry status forward if lookup returned UNKNOWN
            // Always pin address to the saved property address — prevents Tavily finding
            // a wrong Redfin URL from contaminating the displayed card
            const lookupData = { ...lookupJson.data, address: addr };
            if (!lookupData.listingStatus || lookupData.listingStatus === 'UNKNOWN') {
              lookupData.listingStatus = data.listingStatus;
            }
            setAnalysis(lookupToAnalysis(lookupData, liveRate));
            return;
          }
          // Redfin lookup failed — fall through to ATTOM data as last resort
        }

        if (!data.estimatedValue && !data.lastSalePrice) {
          setAnalysisErr('Could not find property value data. Try pasting the Redfin link directly in chat.');
          return;
        }
        setAnalysis(data);
        return;
      }

      // Preview mode — use property/lookup for Redfin data + buyer intelligence
      const lookupAddress = previewAddress ?? null;
      if (!lookupAddress) { setAnalysisErr('No address available'); return; }

      const [lookupRes, tickerRes] = await Promise.all([
        fetch('/api/property/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: lookupAddress }),
          cache: 'no-store',
        }),
        fetch('/api/ticker', { cache: 'no-store' }).catch(() => null),
      ]);
      const lookupJson = await lookupRes.json();
      if (!lookupRes.ok || !lookupJson.ok || !lookupJson.data) {
        setAnalysisErr(lookupJson.error ?? 'Could not retrieve property data');
        return;
      }
      const d = lookupJson.data;
      if (!d.estimatedValue && !d.lastSalePrice && !d.price) {
        setAnalysisErr('Could not find property value data for this address. Try pasting the Redfin link directly in chat for instant results.');
        return;
      }
      const tickerJson = tickerRes ? await tickerRes.json().catch(() => null) : null;
      const thirtyY = tickerJson?.items?.find((i: any) => i.label === '30Y FIXED');
      let liveRate = 6.65;
      if (thirtyY?.value) {
        const parsed = parseFloat(String(thirtyY.value).replace('%', ''));
        if (Number.isFinite(parsed) && parsed > 3 && parsed < 12) liveRate = parsed;
      }
      // Pin address to what the user queried — prevents a wrong Redfin URL match from showing a different property
      setAnalysis(lookupToAnalysis({ ...lookupJson.data, address: lookupAddress }, liveRate));
    } catch {
      setAnalysisErr('Network error — try again');
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function handleMarketIntel() {
    if (!analysis?.address || marketIntelLoading) return;
    setMarketIntelLoading(true);
    try {
      const res = await fetch('/api/market-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property: {
            address:       analysis.address,
            list_price:    analysis.listPrice ?? undefined,
            redfin_avm:    analysis.estimatedValue ?? undefined,
            beds:          analysis.beds ?? undefined,
            baths:         analysis.baths ?? undefined,
            sqft:          analysis.sqft ?? undefined,
            price_per_sqft:analysis.listPrice && analysis.sqft ? Math.round(analysis.listPrice / analysis.sqft) : undefined,
            status:        analysis.listingStatus ?? undefined,
          },
        }),
      });
      const json = await res.json();
      if (json.ok && json.report) {
        setMarketIntelResult(json.report);
      }
    } catch {
      // fail silently — user can retry
    } finally {
      setMarketIntelLoading(false);
    }
  }

  // Load nearby sales when analysis address changes
  useEffect(() => {
    const addr = analysis?.address;
    if (!addr) return;
    fetch(`/api/homeowner/nearby-sales?address=${encodeURIComponent(addr)}`)
      .then(r => r.json())
      .then(d => { if (d.sales?.length) setNearbySales(d.sales); })
      .catch(() => {});
  }, [analysis?.address]);

  async function saveAlert() {
    const rate = parseFloat(alertRate);
    if (!rate || rate < 3 || rate > 12) return;
    setAlertSaving(true);
    await fetch('/api/homeowner/rate-alert', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        property_id: activeProperty?.id ?? null,
        property_address: analysis?.address ?? activeProperty?.property_address ?? previewAddress,
        threshold_rate: rate,
      }),
    });
    setAlertSaving(false);
    setAlertSaved(true);
    setTimeout(() => { setAlertSaved(false); setShowAlertBox(false); }, 3000);
  }

  async function addProperty() {
    if (!newAddress.trim()) return;
    const normalized = newAddress.trim().toLowerCase();
    const streetOf = (s: string) => s.split(',')[0].trim().toLowerCase();
    const alreadySaved = properties.some(p =>
      p.property_address?.toLowerCase() === normalized ||
      streetOf(p.property_address ?? '') === streetOf(newAddress.trim())
    );
    if (alreadySaved) {
      setNewAddress('');
      setAddingNew(false);
      return;
    }
    setSaving(true);
    // Fire lookup (listing status) + enrich (ATTOM AVM) in parallel before saving
    void fetch('/api/property/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: newAddress.trim() }),
    });
    try {
      const res = await fetch('/api/homeowner/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: newAddress.trim() }),
      });
      const { property } = await res.json();
      if (property) {
        setProperties(prev => {
          const updated = property.is_primary
            ? prev.map(p => ({ ...p, is_primary: false }))
            : prev;
          return [...updated, property];
        });
        setActivePropertyId(property.id);
        setNewAddress('');
        setAddingNew(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  async function setPrimary(propertyId: string) {
    setProperties(prev => prev.map(p => ({ ...p, is_primary: p.id === propertyId })));
    await fetch('/api/homeowner/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property_id: propertyId, is_primary: true }),
    });
  }

  async function removeProperty(propertyId: string) {
    if (!window.confirm('Remove this property from My Properties?')) return;
    const res = await fetch(`/api/homeowner/save?property_id=${encodeURIComponent(propertyId)}`, { method: 'DELETE' });
    if (!res.ok) return;
    setProperties(prev => {
      const remaining = prev.filter(p => p.id !== propertyId);
      if (activePropertyId === propertyId) {
        const next = remaining.find(p => p.is_primary) ?? remaining[0];
        setActivePropertyId(next?.id ?? null);
        setAnalysis(null);
      }
      return remaining;
    });
  }

  async function toggleDigest(propertyId: string, val: boolean) {
    setProperties(prev => prev.map(p => p.id === propertyId ? { ...p, digest_enabled: val } : p));
    await fetch('/api/homeowner/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property_id: propertyId, digest_enabled: val }),
    });
  }

  function openLoanEditor() {
    const ov = analysis?.savedOverrides;
    setLoanBalance(ov?.actual_balance        ? String(ov.actual_balance)        : '');
    setLoanRate(ov?.actual_rate              ? String(ov.actual_rate)            : '');
    setLoanPurchasePrice(ov?.actual_purchase_price ? String(ov.actual_purchase_price) : '');
    setLoanPurchaseDate(ov?.actual_purchase_date   ?? '');
    setEditingLoan(true);
  }

  async function saveLoanDetails() {
    if (!activeProperty?.id) return;
    setLoanSaving(true);
    const res = await fetch('/api/homeowner/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        property_id:           activeProperty.id,
        actual_balance:        loanBalance       ? parseFloat(loanBalance.replace(/[,$]/g, ''))       : null,
        actual_rate:           loanRate          ? parseFloat(loanRate.replace('%', ''))               : null,
        actual_purchase_price: loanPurchasePrice ? parseFloat(loanPurchasePrice.replace(/[,$]/g, '')) : null,
        actual_purchase_date:  loanPurchaseDate  || null,
      }),
    });
    const saved = await res.json().catch(() => null);
    if (saved?.property) {
      setProperties(prev => prev.map(p => p.id === saved.property.id ? saved.property : p));
    }
    setLoanSaving(false);
    setLoanSaved(true);
    setEditingLoan(false);
    setAnalysis(null);
    setTimeout(() => setLoanSaved(false), 2500);
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="mh-root">
        <nav className="mh-nav">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <Link href="/" className="mh-logo"><img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" /></Link>
          <AppNav drawerOnly />
        </nav>

        <div className="mh-shell">
          <SignedOut>
            <div className="mh-signin-box">
              {chipParam ? (
                <>
                  <div style={{ fontSize: '2rem', marginBottom: 10 }}>🔒</div>
                  <h2>Sign in to view your {
                    chipParam === 'equity' ? 'Equity & Value' :
                    chipParam === 'heloc'  ? 'HELOC Power' :
                    chipParam === 'refi'   ? 'Refi Math' :
                    chipParam === 'economy' ? 'Economy' : 'Milestones'
                  }</h2>
                  <p>Your personalized home intelligence is waiting. Sign in to see full details.</p>
                </>
              ) : (
                <>
                  <h2>Your Home, Analyzed for Free</h2>
                  <p>Sign in to monitor equity, HELOC capacity, refi timing, and more — no agent or lender required.</p>
                </>
              )}
              <SignInButton mode="modal">
                <button className="mh-signin-cta">Sign In — See My Properties</button>
              </SignInButton>
            </div>
          </SignedOut>

          <SignedIn>
            {loading ? (
              <div className="mh-loading">Loading your home profile…</div>
            ) : (
              <>
                {/* LO context banner */}
                {borrowerId && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, padding: '10px 16px', borderRadius: 10, marginBottom: 16,
                    background: 'rgba(99,179,237,0.07)', border: '1px solid rgba(99,179,237,0.2)',
                  }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(99,179,237,0.7)' }}>LO View</span>
                      <span style={{ fontSize: '0.88rem', color: '#e0f0e8', marginLeft: 10 }}>
                        {analysis?.borrowerName ? `${analysis.borrowerName}'s home intelligence` : 'Loading borrower data…'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <button
                        onClick={() => loadAnalysis()}
                        disabled={analysisLoading}
                        style={{ fontSize: '0.75rem', color: 'rgba(0,232,122,0.8)', background: 'none', border: '1px solid rgba(0,232,122,0.25)', borderRadius: 999, padding: '4px 12px', cursor: analysisLoading ? 'default' : 'pointer', opacity: analysisLoading ? 0.5 : 1 }}
                      >
                        {analysisLoading ? 'Refreshing…' : '↻ Refresh'}
                      </button>
                      <Link href="/pro/clients" style={{ fontSize: '0.78rem', color: 'rgba(99,179,237,0.7)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        ← Back to Clients
                      </Link>
                    </div>
                  </div>
                )}

                {/* Preview mode: save CTA — only for off-market/owned properties */}
                {previewAddress && analysis && analysis.listingStatus !== 'FOR_SALE' && analysis.listingStatus !== 'PENDING' && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', borderRadius: 10, marginBottom: 16, background: 'rgba(0,232,122,0.07)', border: '1px solid rgba(0,232,122,0.2)' }}>
                    <span style={{ fontSize: '0.85rem', color: '#e0f0e8' }}>Save this property to track value, equity &amp; rate alerts monthly.</span>
                    <SignedIn>
                      <button
                        onClick={async () => {
                          void fetch('/api/homeowner/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: previewAddress }) });
                          window.location.href = '/my-home';
                        }}
                        style={{ padding: '6px 16px', borderRadius: 999, border: 'none', background: '#00e87a', color: '#080c12', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        Save Property
                      </button>
                    </SignedIn>
                    <SignedOut>
                      <SignInButton mode="modal">
                        <button style={{ padding: '6px 16px', borderRadius: 999, border: 'none', background: '#00e87a', color: '#080c12', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          Sign In to Save
                        </button>
                      </SignInButton>
                    </SignedOut>
                  </div>
                )}
                {/* Buyer mode: prompt to sign in to get alerts when rate drops */}
                {previewAddress && analysis && (analysis.listingStatus === 'FOR_SALE' || analysis.listingStatus === 'PENDING') && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', borderRadius: 10, marginBottom: 16, background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)' }}>
                    <span style={{ fontSize: '0.85rem', color: '#bfdbfe' }}>Get a rate alert when 30Y drops — save money before you make an offer.</span>
                    <SignedIn>
                      <button
                        onClick={() => setShowAlertBox(true)}
                        style={{ padding: '6px 16px', borderRadius: 999, border: 'none', background: '#3b82f6', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        Set Rate Alert
                      </button>
                    </SignedIn>
                    <SignedOut>
                      <SignInButton mode="modal">
                        <button style={{ padding: '6px 16px', borderRadius: 999, border: 'none', background: '#3b82f6', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          Sign In for Alerts
                        </button>
                      </SignInButton>
                    </SignedOut>
                  </div>
                )}

                {/* HEADER + PROPERTY SELECTOR */}
                <div className="mh-header">
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <h1>{borrowerId ? (analysis?.borrowerName ? `${analysis.borrowerName}'s Home` : 'Borrower Home') : previewAddress ? 'Home Analysis' : 'My Properties'}</h1>
                      <p style={{ marginTop: 4 }}>{borrowerId
                        ? `Viewing property intelligence for ${analysis?.address ?? '…'}`
                        : previewAddress
                          ? `Property intelligence for ${analysis?.address || previewAddress}`
                        : hasAddress
                          ? `${user?.firstName ? `Hi ${user.firstName}.` : ''} Your property intelligence is below.`
                          : 'Add your address to unlock equity tracking, HELOC capacity, and rate alerts.'
                      }</p>
                    </div>
                    {!borrowerId && (
                      <button
                        className="mh-add-prop-btn"
                        onClick={() => { setAddingNew(v => !v); setTimeout(() => document.querySelector<HTMLInputElement>('.mh-add-form input')?.focus(), 60); }}
                      >
                        {addingNew ? '✕ Cancel' : '+ Add property'}
                      </button>
                    )}
                  </div>

                  {/* Property pills — shown when ≥1 property */}
                  {!borrowerId && properties.length > 0 && (
                    <div className="mh-prop-selector">
                      {properties.map(p => {
                        const short = p.property_address.split(',')[0];
                        const isActive = p.id === activeProperty?.id;
                        return (
                          <div key={p.id} className={`mh-prop-pill${isActive ? ' mh-prop-pill-active' : ''}`}>
                            <button
                              className="mh-prop-pill-inner"
                              onClick={() => {
                                if (!isActive) {
                                  setActivePropertyId(p.id);
                                  setAnalysis(null);
                                }
                              }}
                            >
                              <span>🏠</span>
                              <span className="mh-prop-pill-addr">{short}</span>
                              {p.is_primary && <span className="mh-prop-pill-star" title="Primary home">★</span>}
                            </button>
                            {/* Context menu: set primary / remove */}
                            {isActive && properties.length > 1 && (
                              <div className="mh-prop-pill-actions">
                                {!p.is_primary && (
                                  <button
                                    className="mh-prop-action-btn"
                                    title="Set as primary"
                                    onClick={() => setPrimary(p.id)}
                                  >★</button>
                                )}
                                <button
                                  className="mh-prop-action-btn mh-prop-action-remove"
                                  title="Remove property"
                                  onClick={() => removeProperty(p.id)}
                                >×</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add new property form */}
                  {!borrowerId && addingNew && (
                    <div className="mh-add-form mh-card" style={{ marginTop: 12, marginBottom: 0 }}>
                      <div className="mh-card-label">Add a property</div>
                      <div className="mh-form">
                        <AddressAutocomplete
                          className="mh-input"
                          placeholder="e.g. 1234 Oak Street, Los Angeles, CA 90001"
                          value={newAddress}
                          onChange={setNewAddress}
                          onSelect={setNewAddress}
                          onKeyDown={e => e.key === 'Enter' && addProperty()}
                        />
                        <div className="mh-form-row">
                          <button className="mh-save-btn" onClick={addProperty} disabled={saving || !newAddress.trim()}>
                            {saving ? 'Saving…' : 'Add →'}
                          </button>
                          <button className="mh-cancel-btn" onClick={() => { setAddingNew(false); setNewAddress(''); }}>
                            Cancel
                          </button>
                        </div>
                        {saved && <div className="mh-saved-msg">Property added!</div>}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── INTELLIGENCE HERO — shown when analysis is loaded ── */}
                {analysis && !analysisLoading && (() => {
                  const isBuyer = analysis.listingStatus === 'FOR_SALE' || analysis.listingStatus === 'PENDING';
                  const heroAddr = analysis.address || previewAddress || activeProperty?.property_address || '';
                  return (
                    <div style={{ background: '#0f172a', borderRadius: 16, marginBottom: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
                      {/* Accent line */}
                      <div style={{ height: 3, background: isBuyer ? 'linear-gradient(90deg,#3b82f6,#6366f1)' : 'linear-gradient(90deg,#00e87a,#00b459)' }} />

                      {/* Street View hero photo — satellite map as base layer; photo on top */}
                      {(analysis.streetViewUrl || analysis.staticMapUrl) && (
                        <div style={{ position: 'relative', height: 200, overflow: 'hidden', background: '#0a1628' }}>
                          {/* Satellite map — always rendered full-size as base */}
                          {analysis.staticMapUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={analysis.staticMapUrl}
                              alt="Satellite map"
                              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                              onError={e => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                            />
                          )}
                          {/* Street view — on top; hides to reveal full map when unavailable */}
                          {analysis.streetViewUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={analysis.streetViewUrl}
                              alt="Street view"
                              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                              onError={e => {
                                const img = e.currentTarget;
                                img.style.display = 'none';
                                const wrap = img.parentElement;
                                if (wrap && !wrap.querySelector('.sv-placeholder')) {
                                  const ph = document.createElement('div');
                                  ph.className = 'sv-placeholder';
                                  ph.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:rgba(0,0,0,0.35);pointer-events:none;';
                                  ph.innerHTML = '<div style="font-size:2rem;opacity:0.4">🏠</div><div style="font-size:0.68rem;color:rgba(255,255,255,0.45);letter-spacing:0.05em;">No street view available</div>';
                                  wrap.appendChild(ph);
                                }
                              }}
                            />
                          )}
                          {/* AVM source badge */}
                          {(analysis.avmSource === 'attom' || analysis.avmSource === 'attom_assessed') && (
                            <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, background: 'rgba(0,20,10,0.75)', border: '1px solid rgba(0,232,122,0.35)', borderRadius: 6, padding: '3px 8px', fontSize: '0.6rem', fontWeight: 700, color: '#00e87a', letterSpacing: '0.06em' }}>
                              {analysis.avmSource === 'attom' ? 'ATTOM AVM' : 'ATTOM ASSESSED'}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Property details bar — beds/baths/sqft/yearBuilt from ATTOM */}
                      {(analysis.beds || analysis.baths || analysis.sqft || analysis.yearBuilt || analysis.lotSizeSqft) && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, borderBottom: '1px solid #1e293b', background: '#0a1628' }}>
                          {[
                            analysis.beds      && { label: 'Beds',       val: `${analysis.beds}` },
                            analysis.baths     && { label: 'Baths',      val: `${analysis.baths}` },
                            analysis.sqft      && { label: 'Sq Ft',      val: analysis.sqft.toLocaleString() },
                            analysis.yearBuilt && { label: 'Built',      val: `${analysis.yearBuilt}` },
                            analysis.lotSizeSqft && { label: 'Lot',      val: `${Math.round(analysis.lotSizeSqft / 43560 * 100) / 100} ac` },
                            analysis.propertyType && { label: 'Type',    val: analysis.propertyType.replace('_', ' ') },
                          ].filter(Boolean).map((item: any, i, arr) => (
                            <div key={i} style={{ flex: '1 1 80px', padding: '10px 14px', borderRight: i < arr.length - 1 ? '1px solid #1e293b' : 'none', textAlign: 'center' }}>
                              <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#475569', marginBottom: 2 }}>{item.label}</div>
                              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#e2e8f0' }}>{item.val}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ padding: '20px 24px' }}>
                        {/* Address + mode label */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: isBuyer ? '#60a5fa' : '#00e87a', marginBottom: 3 }}>
                              {isBuyer ? (analysis.listingStatus === 'PENDING' ? '🔴 Pending · Buyer Intelligence' : '🏷 For Sale · Buyer Intelligence') : 'Home Intelligence'}
                            </div>
                            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#f1f5f9', lineHeight: 1.3 }}>{heroAddr}</div>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#334155' }}>
                            {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                          </div>
                        </div>

                        {/* 4 key stats — different set for buyer vs owner */}
                        {isBuyer ? (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, marginBottom: 20 }}>
                            {[
                              { label: 'List Price',    value: analysis.listPrice ? `$${Math.round(analysis.listPrice).toLocaleString()}` : (analysis.estimatedValue ? `$${Math.round(analysis.estimatedValue).toLocaleString()}` : '—'), blue: true },
                              { label: 'Redfin AVM',    value: analysis.estimatedValue ? `$${Math.round(analysis.estimatedValue).toLocaleString()}` : '—', blue: false },
                              { label: 'Days on Market',value: analysis.daysOnMarket != null ? `${analysis.daysOnMarket}d` : '—', blue: false },
                              { label: '$/sqft',        value: (analysis.listPrice && analysis.sqft) ? `$${Math.round(analysis.listPrice / analysis.sqft)}` : '—', blue: false },
                            ].map((s, i) => (
                              <div key={i} style={{ paddingRight: i < 3 ? 16 : 0, paddingLeft: i > 0 ? 16 : 0, borderRight: i < 3 ? '1px solid #1e293b' : 'none' }}>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#475569', marginBottom: 4 }}>{s.label}</div>
                                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: s.blue ? '#60a5fa' : '#f1f5f9', lineHeight: 1.1 }}>{s.value}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, marginBottom: 20 }}>
                            {[
                              { label: analysis.avmSource === 'attom' ? 'ATTOM AVM' : analysis.avmSource === 'attom_assessed' ? 'ATTOM Assessed' : 'Est. Value', value: analysis.estimatedValue ? `$${Math.round(analysis.estimatedValue).toLocaleString()}` : '—', green: true, missing: false },
                              { label: analysis.balanceIsEstimated ? 'Est. Equity' : 'Total Equity', value: analysis.estimatedEquity != null && analysis.estimatedEquity < 0 ? 'Underwater' : analysis.estimatedEquity ? `$${Math.round(analysis.estimatedEquity).toLocaleString()}` : '—', green: false, warn: analysis.estimatedEquity != null && analysis.estimatedEquity < 0, missing: !analysis.estimatedEquity && !(analysis.estimatedEquity != null && analysis.estimatedEquity < 0) },
                              { label: 'Appreciation', value: analysis.appreciationPct != null ? `+${analysis.appreciationPct}%` : '—', green: true, missing: false },
                              { label: analysis.balanceIsEstimated ? 'LTV (est.)' : 'LTV Ratio', value: analysis.ltv != null ? `${analysis.ltv}%` : '—', green: false, warn: analysis.ltv != null && analysis.ltv > 100, missing: analysis.ltv === null },
                            ].map((s, i) => (
                              <div key={i} style={{ paddingRight: i < 3 ? 16 : 0, paddingLeft: i > 0 ? 16 : 0, borderRight: i < 3 ? '1px solid #1e293b' : 'none' }}>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#475569', marginBottom: 4 }}>{s.label}</div>
                                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: s.warn ? '#f59e0b' : s.green ? '#00e87a' : '#f1f5f9', lineHeight: 1.1 }}>
                                  {s.missing && !borrowerId
                                    ? <button onClick={openLoanEditor} style={{ background: 'none', border: '1px dashed rgba(148,163,184,0.35)', borderRadius: 6, color: '#64748b', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', padding: '4px 10px', lineHeight: 1.4 }}>Add balance →</button>
                                    : s.value}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Equity bar — owner mode only */}
                        {!isBuyer && analysis.equityPct != null && analysis.estimatedEquity != null && analysis.estimatedEquity >= 0 && (
                          <div style={{ marginBottom: analysis.balanceIsEstimated ? 10 : 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#475569', marginBottom: 5 }}>
                              <span style={{ color: '#00e87a' }}>{`$${Math.round(analysis.estimatedEquity / 1000)}K equity (${analysis.equityPct}%)`}</span>
                              <span>{analysis.estimatedBalance ? `$${Math.round(analysis.estimatedBalance / 1000)}K ${analysis.balanceIsEstimated ? 'est. balance' : 'balance'}` : 'Balance'}</span>
                            </div>
                            <div style={{ height: 6, background: '#1e293b', borderRadius: 999, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.min(analysis.equityPct, 100)}%`, background: 'linear-gradient(90deg,#00e87a,#00b459)', borderRadius: 999 }} />
                            </div>
                            {analysis.balanceIsEstimated && !borrowerId && (
                              <div style={{ marginTop: 6, marginBottom: 14, fontSize: '0.62rem', color: '#475569' }}>
                                Equity &amp; LTV estimated assuming 20% down · <button onClick={openLoanEditor} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00e87a', fontWeight: 600, fontSize: '0.62rem', padding: 0 }}>Enter actual balance →</button>
                              </div>
                            )}
                          </div>
                        )}
                        {/* Underwater warning — owner mode only */}
                        {!isBuyer && analysis.estimatedEquity != null && analysis.estimatedEquity < 0 && (
                          <div style={{ marginBottom: 20, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8 }}>
                            <div style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 700 }}>⚠️ Property is currently underwater</div>
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: 3 }}>
                              Balance exceeds estimated value by {analysis.estimatedBalance && analysis.estimatedValue ? `$${Math.round(Math.abs(analysis.estimatedBalance - analysis.estimatedValue) / 1000)}K` : '—'}. Consider running refi math.
                            </div>
                          </div>
                        )}

                        {/* Rate Watch — homeowner view only (not LO/borrower) */}
                        {!borrowerId && !isBuyer && (
                          <div style={{ marginBottom: 20, padding: '14px 16px', background: 'rgba(0,232,122,0.05)', border: '1px solid rgba(0,232,122,0.15)', borderRadius: 10 }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#00e87a', marginBottom: 8 }}>Rate Watch</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                              <div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f1f5f9', marginBottom: 2 }}>Alert me when 30-year rates drop to:</div>
                                <div style={{ fontSize: '0.72rem', color: '#475569' }}>
                                  Current 30Y fixed: <span style={{ color: '#00e87a', fontWeight: 700 }}>{(analysis.liveRate ?? 6.65).toFixed(2)}%</span> · You control when to act, we just alert you.
                                </div>
                              </div>
                              <SignedIn>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <input type="number" step="0.125" min="3" max="10" value={alertRate}
                                    onChange={e => setAlertRate(e.target.value)}
                                    placeholder={`e.g. ${((analysis.liveRate ?? 6.65) - 1).toFixed(2)}`}
                                    style={{ width: 80, padding: '7px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: '0.88rem', fontFamily: 'inherit' }}
                                  />
                                  <span style={{ color: '#475569', fontSize: '0.82rem' }}>%</span>
                                  <button onClick={saveAlert} disabled={alertSaving || alertSaved || !alertRate}
                                    style={{ padding: '7px 16px', borderRadius: 999, background: alertSaved ? 'rgba(0,232,122,0.15)' : '#00e87a', border: 'none', color: alertSaved ? '#00e87a' : '#07100f', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    {alertSaved ? '✓ Alert Set' : alertSaving ? 'Saving…' : 'Set Alert'}
                                  </button>
                                </div>
                              </SignedIn>
                              <SignedOut>
                                <SignInButton mode="modal">
                                  <button style={{ padding: '7px 16px', borderRadius: 999, background: '#00e87a', border: 'none', color: '#07100f', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    Sign in to set rate alert
                                  </button>
                                </SignInButton>
                              </SignedOut>
                            </div>
                          </div>
                        )}

                        {/* CTA buttons */}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {/* Save to My Properties — always available for any signed-in user */}
                          <SignedIn>
                            {(() => {
                              const addrKey = heroAddr.split(',')[0].toLowerCase().trim();
                              const isAlreadySaved = properties.some(p =>
                                p.property_address?.toLowerCase().trim() === heroAddr.toLowerCase().trim() ||
                                p.property_address?.toLowerCase().trim().startsWith(addrKey)
                              );
                              return isAlreadySaved ? (
                                <span style={{ padding: '10px 20px', borderRadius: 999, border: '1px solid rgba(0,232,122,0.2)', color: 'rgba(0,232,122,0.6)', fontWeight: 700, fontSize: '0.82rem', display: 'inline-block' }}>
                                  ✓ Saved
                                </span>
                              ) : (
                                <button
                                  onClick={async () => {
                                    const res = await fetch('/api/homeowner/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: heroAddr }) });
                                    const json = await res.json();
                                    if (json.property) setProperties(prev => [...prev, json.property]);
                                  }}
                                  style={{ padding: '10px 20px', borderRadius: 999, border: '1px solid rgba(0,232,122,0.4)', color: '#00e87a', fontWeight: 700, fontSize: '0.82rem', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                                  Save to My Properties
                                </button>
                              );
                            })()}
                          </SignedIn>
                          <SignedOut>
                            <SignInButton mode="modal">
                              <button style={{ padding: '10px 20px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: '0.82rem', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                                Sign in to save &amp; track
                              </button>
                            </SignInButton>
                          </SignedOut>
                          {isBuyer ? (
                            <a
                              href={(() => {
                                const a = analysis;
                                const ask = a.listPrice ?? a.estimatedValue;
                                const parts: string[] = [`I'm looking at buying ${a.address}${ask ? ` listed at $${Math.round(ask).toLocaleString()}` : ''}.`];
                                parts.push(`Current 30-year rate is ${a.liveRate.toFixed(2)}%.`);
                                if (a.estimatedValue && ask && a.estimatedValue !== ask) parts.push(`Redfin AVM is $${Math.round(a.estimatedValue).toLocaleString()}.`);
                                if (a.daysOnMarket != null) parts.push(`Property has been on market ${a.daysOnMarket} days.`);
                                // Seller paid intentionally omitted — irrelevant to buyer and leads to bad AI framing;
                                parts.push('Calculate monthly PITI, run comps vs ask price, and project 5-year equity outlook.');
                                const addrParts = (a.address ?? '').split(',').map((s: string) => s.trim());
                                const p = new URLSearchParams({
                                  sq: parts.join(' '),
                                  cmaAddress: a.address ?? '',
                                  cmaCity:    addrParts[1] ?? '',
                                  cmaState:   (addrParts[2] ?? '').replace(/\s*\d{5}.*/, '').trim(),
                                  cmaPrice:   String(ask ?? ''),
                                  cmaLiveRate: String(a.liveRate.toFixed(2)),
                                  ...(a.beds    ? { cmaBeds:  String(a.beds)  } : {}),
                                  ...(a.baths   ? { cmaBaths: String(a.baths) } : {}),
                                  ...(a.sqft    ? { cmaSqft:  String(a.sqft)  } : {}),
                                  ...(a.streetViewUrl ? { cmaPhotoUrl: a.streetViewUrl } : {}),
                                });
                                return `/chat?${p.toString()}`;
                              })()}
                              style={{ padding: '10px 20px', borderRadius: 999, background: '#3b82f6', color: '#fff', fontWeight: 800, fontSize: '0.82rem', textDecoration: 'none', display: 'inline-block' }}
                            >
                              Run My Numbers →
                            </a>
                          ) : (
                            <a
                              href={(() => {
                                const a = analysis;
                                const effectiveRate = a.savedOverrides?.actual_rate ?? a.purchaseRate;
                                const sq = `Run homeowner analysis for ${a.address}: balance $${Math.round(a.estimatedBalance ?? 0).toLocaleString()}, rate ${effectiveRate ?? a.liveRate}%, home value $${Math.round(a.estimatedValue ?? 0).toLocaleString()}. Show me refi savings, break-even, and equity options.`;
                                return `/chat?${new URLSearchParams({ sq }).toString()}`;
                              })()}
                              style={{ padding: '10px 20px', borderRadius: 999, background: '#00e87a', color: '#07100f', fontWeight: 800, fontSize: '0.82rem', textDecoration: 'none', display: 'inline-block' }}
                            >
                              Run My Numbers →
                            </a>
                          )}
                          <a
                            href={isBuyer ? '#position' : '#equity'}
                            onClick={e => {
                              e.preventDefault();
                              const chipId = isBuyer ? 'position' : 'equity';
                              const chip = document.querySelector(`[data-chip="${chipId}"]`) as HTMLButtonElement | null;
                              chip?.click();
                              setTimeout(() => { (document.querySelector('.mh-chip-bar') as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
                            }}
                            style={{ padding: '10px 20px', borderRadius: 999, border: '1px solid #1e293b', color: '#94a3b8', fontWeight: 600, fontSize: '0.82rem', textDecoration: 'none', display: 'inline-block' }}
                          >
                            Full Analysis ↓
                          </a>
                          {isBuyer && (() => {
                            const a = analysis!;
                            const price = a.listPrice ?? a.estimatedValue ?? 0;
                            const matchP = new URLSearchParams({
                              from: 'scenario', lt: 'purchase',
                              price: String(Math.round(price)),
                              dp: '20',
                              rate: String(a.liveRate.toFixed(2)),
                              purpose: 'Purchase',
                            });
                            return (
                              <>
                                <a
                                  href={`/connect/post?${matchP.toString()}`}
                                  style={{ padding: '10px 18px', borderRadius: 999, background: '#00e87a', color: '#07100f', fontWeight: 700, fontSize: '0.82rem', textDecoration: 'none', display: 'inline-block', whiteSpace: 'nowrap' }}
                                >
                                  Get matched →
                                </a>
                                <PropertyShareButton address={a.address} />
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* INTELLIGENCE SECTION — always visible; locked preview when no address */}
                {(() => {
                  const isBuyer = !!(analysis && (analysis.listingStatus === 'FOR_SALE' || analysis.listingStatus === 'PENDING'));
                  return (
                <div className="mh-card" style={{ padding: 0, overflow: 'hidden' }}>
                  {/* Chip nav — buyer chips when FOR_SALE/PENDING, owner chips otherwise */}
                  <div className="mh-chip-bar">
                    {(isBuyer ? BUYER_CHIPS : CHIPS).map(c => {
                      const isActive = isBuyer ? activeBuyerChip === c.id : activeChip === c.id;
                      return (
                        <button
                          key={c.id}
                          data-chip={c.id}
                          className={`mh-chip${isActive ? (isBuyer ? ' mh-chip-active-buyer' : ' mh-chip-active') : ''}${!hasAddress ? ' mh-chip-dim' : ''}`}
                          onClick={() => {
                            if (!hasAddress) return;
                            if (isBuyer) setActiveBuyerChip(c.id as BuyerChipId);
                            else setActiveChip(c.id as ChipId);
                          }}
                          style={!hasAddress ? { cursor: 'default' } : undefined}
                        >
                          <span className="mh-chip-icon">{c.icon}</span>
                          {c.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Card content */}
                  <div className="mh-chip-body">
                    {/* ── Locked preview — no address yet ── */}
                    {!hasAddress && (
                      <div className="mh-preview-wrap">
                        {/* Ghost stat row */}
                        <div className="mh-stat-row mh-preview-ghost">
                          {[
                            { label: 'Est. Value',  value: '$———' },
                            { label: 'Est. Equity', value: '$———' },
                            { label: 'LTV Ratio',   value: '——%'  },
                          ].map(s => (
                            <div key={s.label} className="mh-stat">
                              <div className="mh-stat-label">{s.label}</div>
                              <div className="mh-stat-value" style={{ color: 'rgba(255,255,255,0.12)', letterSpacing: 2 }}>{s.value}</div>
                            </div>
                          ))}
                        </div>
                        {/* Ghost bar */}
                        <div style={{ margin: '20px 0 8px' }}>
                          <div className="mh-bar-label-row" style={{ opacity: 0.2 }}>
                            <span>Equity</span><span>Balance</span>
                          </div>
                          <div className="mh-bar-track">
                            <div className="mh-bar-fill" style={{ width: '40%', background: 'rgba(34,197,94,0.15)' }} />
                            <div className="mh-bar-fill" style={{ width: '60%', background: 'rgba(255,255,255,0.05)' }} />
                          </div>
                        </div>
                        {/* Unlock CTA overlay */}
                        <div className="mh-preview-cta">
                          <div style={{ fontSize: '1.4rem', marginBottom: 8 }}>🔓</div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 6 }}>
                            Enter your address to unlock
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: 16, lineHeight: 1.5 }}>
                            Equity tracking, HELOC capacity, refi timing, milestones — all personalized to your home.
                          </div>
                          <button
                            className="mh-save-btn"
                            style={{ width: 'auto', padding: '10px 28px' }}
                            onClick={() => {
                              setAddingNew(true);
                              setTimeout(() => {
                                const el = document.querySelector<HTMLInputElement>('.mh-add-form input');
                                el?.focus();
                                el?.closest('.mh-add-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }, 60);
                            }}
                          >
                            Add my property →
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── Active state ── */}
                    {hasAddress && (
                      <>
                        {analysisLoading && (
                          <div className="mh-analysis-loading">
                            <div className="mh-spinner" />
                            <span>Fetching property data…</span>
                          </div>
                        )}

                        {!analysisLoading && analysisErr && (
                          <div className="mh-analysis-err">
                            {analysisErr}
                            <button className="mh-retry-btn" onClick={() => loadAnalysis()}>Retry</button>
                          </div>
                        )}

                        {!analysisLoading && !analysisErr && analysis && (
                          <>
                            {isBuyer ? (
                              <>
                                {activeBuyerChip === 'position' && <CardMarketPosition d={analysis} nearbySales={nearbySales} onFeelingLucky={handleMarketIntel} />}
                                {activeBuyerChip === 'payment'  && <CardMyPayment      d={analysis} />}
                                {activeBuyerChip === 'comps'    && <CardCompDelta       d={analysis} nearbySales={nearbySales} />}
                                {activeBuyerChip === 'cost'     && <CardTrueCost        d={analysis} />}
                                {activeBuyerChip === 'signal'   && <CardOfferSignal     d={analysis} nearbySales={nearbySales} />}
                              </>
                            ) : (
                              <>
                                {activeChip === 'equity'     && <><CardEquity d={analysis} nearbySales={nearbySales} onEdit={!borrowerId ? openLoanEditor : undefined} /><CardComps d={analysis} /><CardPropertyIntel d={analysis} /></>}
                                {activeChip === 'heloc'      && <CardHELOC      d={analysis} />}
                                {activeChip === 'refi'       && <CardRefi       d={analysis} onEdit={openLoanEditor} plan={userPlan} isLo={!!analysis.isLoView} />}
                                {activeChip === 'economy'    && <CardEconomy    d={analysis} />}
                                {activeChip === 'milestones' && <CardMilestones d={analysis} />}
                              </>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>

                  {/* Refresh + chat CTA footer — only when analysis is loaded */}
                  {analysis && !analysisLoading && (
                    <div className="mh-chip-footer">
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="mh-refresh-btn" onClick={() => loadAnalysis()}>↻ Refresh</button>
                        {!borrowerId && !isBuyer && <button className="mh-refresh-btn" onClick={openLoanEditor} style={{ color: 'rgba(34,197,94,0.6)' }}>✎ Edit loan details</button>}
                        {borrowerId && <Link href="/pro/clients" className="mh-refresh-btn" style={{ color: 'rgba(99,179,237,0.6)', textDecoration: 'none' }}>✎ Edit in Clients</Link>}
                      </div>
                      {!isBuyer && <Link
                        href={(() => {
                          const addr = analysis?.address ?? activeProperty?.property_address ?? '';
                          const bal  = analysis?.estimatedBalance;
                          const live = analysis?.liveRate ?? 6.99;
                          const rate = analysis?.purchaseRate ?? live;
                          if (isBuyer) {
                            const ask = analysis.listPrice ?? analysis.estimatedValue;
                            const avm = analysis.estimatedValue;
                            const spread = (ask && avm) ? Math.round((avm - ask) / ask * 100) : null;
                            if (activeBuyerChip === 'comps') return buildCMAUrl(analysis);
                            if (activeBuyerChip === 'payment' && ask) return `/chat?sq=${encodeURIComponent(`Full payment breakdown for buying ${addr} at $${Math.round(ask).toLocaleString()}: 20% down, ${live.toFixed(2)}% rate, 30yr fixed. Include monthly PITI, total interest, and 5-year equity projection.`)}`;
                            if (activeBuyerChip === 'position' && ask) return `/chat?sq=${encodeURIComponent(`Pricing analysis for ${addr}: listed at $${Math.round(ask).toLocaleString()}${spread != null ? `, Redfin AVM ${avm ? '$' + Math.round(avm).toLocaleString() : '?'} (${spread > 0 ? '+' : ''}${spread}% vs ask)` : ''}${analysis.daysOnMarket != null ? `, ${analysis.daysOnMarket} days on market` : ''}. Is this fairly priced and what should I offer?`)}`;
                            if (activeBuyerChip === 'cost' && ask) return `/chat?sq=${encodeURIComponent(`True cost of buying ${addr} at $${Math.round(ask).toLocaleString()}: 20% down, ${live.toFixed(2)}% rate. Break down total costs at 5 and 10 years including interest, taxes, insurance, and equity built.`)}`;
                            if (activeBuyerChip === 'signal' && ask) return `/chat?sq=${encodeURIComponent(`Offer strategy for ${addr}: listed at $${Math.round(ask).toLocaleString()}${analysis.daysOnMarket != null ? `, ${analysis.daysOnMarket} days on market` : ''}${spread != null ? `, priced ${spread > 0 ? '+' : ''}${spread}% vs AVM` : ''}. What offer price, contingencies, and strategy do you recommend?`)}`;
                            return `/chat?sq=${encodeURIComponent(`I'm considering buying ${addr}${ask ? ` at $${Math.round(ask).toLocaleString()}` : ''}. Is it priced fairly and what are my monthly costs?`)}`;
                          }
                          if (activeChip === 'refi') {
                            const refibal = bal ?? (analysis?.estimatedValue ? Math.round(analysis.estimatedValue * 0.65) : null);
                            const balNote = bal ? '' : ' (approximate — based on estimated home value, adjust as needed)';
                            const rateNote = analysis?.purchaseRate ? '' : ' (using today\'s market rate as reference — update if you know your actual rate)';
                            if (refibal) return `/chat?sq=${encodeURIComponent(`I have a $${Math.round(refibal).toLocaleString('en-US')} balance${balNote} at ${rate.toFixed(2)}%${rateNote}, market rate is ${live.toFixed(2)}%. Should I refinance? Show monthly savings and break-even.`)}`;
                          }
                          if (activeChip === 'heloc' && analysis?.helocMax) {
                            return `/chat?sq=${encodeURIComponent(`HELOC analysis for ${addr}: I have ${analysis.helocMax ? '$' + Math.round(analysis.helocMax).toLocaleString() : 'equity'} available at ~${analysis.helocRate?.toFixed(2) ?? '7.75'}%. What are my best options for accessing home equity?`)}`;
                          }
                          if (activeChip === 'equity' && bal) {
                            return `/chat?sq=${encodeURIComponent(`Equity options for ${addr}: value ${analysis?.estimatedValue ? '$' + Math.round(analysis.estimatedValue).toLocaleString() : '?'}, balance $${Math.round(bal).toLocaleString()}, equity ${analysis?.estimatedEquity ? '$' + Math.round(analysis.estimatedEquity).toLocaleString() : '?'} (${analysis.equityPct ?? '?'}%). What are my best options — HELOC, cash-out refi, or sell?`)}`;
                          }
                          if (activeChip === 'economy') {
                            return `/chat?sq=${encodeURIComponent(`I own ${addr}. Market rate is ${live.toFixed(2)}%, my rate is ${rate.toFixed(2)}%. How do current economic conditions — rates, prime, Fed direction — affect my refi timing, HELOC rate, and equity strategy?`)}`;
                          }
                          if (activeChip === 'milestones') {
                            return `/chat?sq=${encodeURIComponent(`Payoff and wealth plan for ${addr}: mortgage balance $${analysis?.estimatedBalance ? Math.round(analysis.estimatedBalance).toLocaleString() : 'unknown'}${analysis?.purchaseRate ? ` at ${analysis.purchaseRate}%` : ''}${analysis?.payoffYear ? `, payoff projected ${analysis.payoffYear}` : ''}${analysis?.estimatedEquity ? ` — current equity $${Math.round(analysis.estimatedEquity).toLocaleString()}` : ''}. Build a full equity trajectory, payoff acceleration options, and wealth-building milestones.`)}`;
                          }
                          return `/chat?sq=${encodeURIComponent(`Property analysis for ${addr}`)}`;
                        })()}
                        className="mh-cta-link"
                      >
                        Ask a mortgage question →
                      </Link>}
                    </div>
                  )}
                </div>
                  );
                })()}

                {/* LOAN DETAIL EDITOR — consumer only */}
                {!borrowerId && editingLoan && (
                  <div className="mh-card" style={{ border: '1px solid rgba(34,197,94,0.2)' }}>
                    <div className="mh-card-label">Correct Your Loan Details</div>
                    <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.45)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
                      We estimate your balance and rate from public records. Enter your actual numbers for more accurate analysis.
                      Leave a field blank to keep using the estimate.
                    </p>
                    <div className="mh-loan-grid">
                      <div className="mh-loan-field">
                        <label className="mh-loan-label">Current loan balance</label>
                        <input
                          className="mh-input"
                          placeholder="e.g. 209000"
                          value={loanBalance}
                          onChange={e => setLoanBalance(e.target.value)}
                        />
                      </div>
                      <div className="mh-loan-field">
                        <label className="mh-loan-label">Your interest rate (%)</label>
                        <input
                          className="mh-input"
                          placeholder="e.g. 6.54"
                          value={loanRate}
                          onChange={e => setLoanRate(e.target.value)}
                        />
                      </div>
                      <div className="mh-loan-field">
                        <label className="mh-loan-label">Purchase price</label>
                        <input
                          className="mh-input"
                          placeholder="e.g. 670000"
                          value={loanPurchasePrice}
                          onChange={e => setLoanPurchasePrice(e.target.value)}
                        />
                      </div>
                      <div className="mh-loan-field">
                        <label className="mh-loan-label">Close date</label>
                        <input
                          className="mh-input"
                          type="date"
                          value={loanPurchaseDate}
                          onChange={e => setLoanPurchaseDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="mh-form-row" style={{ marginTop: '1rem' }}>
                      <button className="mh-save-btn" onClick={saveLoanDetails} disabled={loanSaving}>
                        {loanSaving ? 'Saving…' : 'Save my numbers'}
                      </button>
                      <button className="mh-cancel-btn" onClick={() => setEditingLoan(false)}>Cancel</button>
                    </div>
                    {loanSaved && <div className="mh-saved-msg" style={{ marginTop: 8 }}>Saved — refreshing analysis…</div>}
                  </div>
                )}

                {/* DIGEST TOGGLE — homeowner only (not buyer mode) */}
                {!borrowerId && !(analysis?.listingStatus === 'FOR_SALE' || analysis?.listingStatus === 'PENDING') && <div className="mh-card">
                  <div className="mh-card-label">Weekly Digest</div>
                  <div className="mh-digest-row">
                    <div className="mh-digest-info">
                      <h3>Home Intelligence Email</h3>
                      <p>Receive a weekly snapshot: equity, HELOC capacity, rate movement, and refi timing — sent to {user?.emailAddresses?.[0]?.emailAddress ?? 'your email'}.</p>
                    </div>
                    <label className="mh-toggle">
                      <input type="checkbox" checked={activeProperty?.digest_enabled ?? true} onChange={e => activeProperty && toggleDigest(activeProperty.id, e.target.checked)} />
                      <span className="mh-toggle-track" />
                    </label>
                  </div>
                </div>}
              </>
            )}
          </SignedIn>
        </div>
      </div>

      {/* Market Intelligence loading overlay */}
      {marketIntelLoading && <MarketIntelLoader />}

      {/* Market Intelligence result modal */}
      {!marketIntelLoading && marketIntelResult && (
        <MarketIntelCard
          report={marketIntelResult}
          address={analysis?.address ?? ''}
          onClose={() => setMarketIntelResult(null)}
        />
      )}
    </>
  );
}

export default function MyHomePage() {
  return (
    <Suspense fallback={null}>
      <MyHomePageInner />
    </Suspense>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const CSS = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html:has(.mh-root){height:auto!important;overflow:visible!important}
  body:has(.mh-root){display:block!important;height:auto!important;overflow:visible!important;background:#0a0a0f!important}
  .mh-root{min-height:100vh;background:#0a0a0f;color:#f0f0f0;font-family:'Inter',system-ui,sans-serif}

  .mh-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2rem;height:56px;background:rgba(10,10,15,0.95);border-bottom:1px solid rgba(255,255,255,0.07)}
  .mh-logo img{height:26px;display:block}
  .mh-shell{max-width:760px;margin:0 auto;padding:3rem 1.5rem 5rem}

  .mh-signin-box{text-align:center;padding:5rem 2rem;border:1px solid rgba(255,255,255,0.08);border-radius:20px;background:rgba(255,255,255,0.02)}
  .mh-signin-box h2{font-size:1.6rem;font-weight:700;margin-bottom:.75rem}
  .mh-signin-box p{color:rgba(255,255,255,0.55);margin-bottom:2rem;font-size:.95rem}
  .mh-signin-cta{display:inline-block;padding:.75rem 2rem;background:#22c55e;color:#000;font-weight:700;border-radius:10px;font-size:1rem;cursor:pointer;border:none}
  .mh-loading{text-align:center;padding:6rem 0;color:rgba(255,255,255,0.4);font-size:.95rem}

  .mh-header{margin-bottom:2rem}
  .mh-header h1{font-size:2rem;font-weight:800;letter-spacing:-.03em;margin-bottom:.4rem}
  .mh-header p{color:rgba(255,255,255,0.5);font-size:.95rem}

  .mh-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:16px;padding:1.75rem 2rem;margin-bottom:1.25rem}
  .mh-card-label{font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:.75rem}

  .mh-address-display{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
  .mh-address-text{font-size:1.1rem;font-weight:600;color:#fff}
  .mh-edit-btn{font-size:.8rem;color:rgba(255,255,255,0.45);background:rgba(255,255,255,0.06);border:none;border-radius:6px;padding:.3rem .75rem;cursor:pointer}
  .mh-edit-btn:hover{color:#fff;background:rgba(255,255,255,0.1)}

  .mh-form{display:flex;flex-direction:column;gap:.75rem}
  .mh-input{width:100%;padding:.75rem 1rem;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:10px;color:#fff;font-size:.95rem;outline:none}
  .mh-input:focus{border-color:#22c55e}
  .mh-input::placeholder{color:rgba(255,255,255,0.3)}
  .mh-form-row{display:flex;gap:.75rem}
  .mh-save-btn{flex:1;padding:.75rem;background:#22c55e;color:#000;font-weight:700;border:none;border-radius:10px;cursor:pointer;font-size:.95rem}
  .mh-save-btn:disabled{opacity:.5;cursor:not-allowed}
  .mh-cancel-btn{padding:.75rem 1.25rem;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);border:none;border-radius:10px;cursor:pointer}
  .mh-saved-msg{font-size:.8rem;color:#22c55e;text-align:center}
  .mh-no-address h2{font-size:1.2rem;font-weight:700;margin-bottom:.4rem}
  .mh-no-address p{color:rgba(255,255,255,0.5);font-size:.9rem;margin-bottom:1.25rem;line-height:1.6}

  /* CHIP NAV */
  .mh-chip-bar{display:flex;gap:6px;overflow-x:auto;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.07);scrollbar-width:none}
  .mh-chip-bar::-webkit-scrollbar{display:none}
  .mh-chip{display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:999px;font-size:.8rem;font-weight:600;cursor:pointer;white-space:nowrap;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.55);transition:all .15s}
  .mh-chip:hover{background:rgba(255,255,255,0.08);color:#fff;border-color:rgba(255,255,255,0.2)}
  .mh-chip-active{background:rgba(34,197,94,0.12);color:#22c55e;border-color:rgba(34,197,94,0.35)}
  .mh-chip-active-buyer{background:rgba(59,130,246,0.12);color:#60a5fa;border-color:rgba(59,130,246,0.35)}
  .mh-chip-dim{opacity:0.3;pointer-events:none}
  .mh-chip-icon{font-size:.85rem}

  /* LOCKED PREVIEW */
  .mh-preview-wrap{position:relative;padding-bottom:24px}
  .mh-preview-ghost{opacity:0.18;pointer-events:none;user-select:none;filter:blur(2px)}
  .mh-preview-cta{text-align:center;padding:28px 24px 8px;color:#f0f0f0}

  /* PROPERTY SELECTOR */
  .mh-add-prop-btn{flex-shrink:0;padding:7px 14px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);border-radius:999px;color:#22c55e;font-size:.8rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:all .15s}
  .mh-add-prop-btn:hover{background:rgba(34,197,94,0.18)}
  .mh-prop-selector{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
  .mh-prop-pill{display:flex;align-items:center;border-radius:999px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);overflow:hidden;transition:border-color .15s}
  .mh-prop-pill-active{border-color:rgba(34,197,94,0.4);background:rgba(34,197,94,0.07)}
  .mh-prop-pill-inner{display:flex;align-items:center;gap:6px;padding:7px 14px;background:none;border:none;color:rgba(255,255,255,0.6);font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
  .mh-prop-pill-active .mh-prop-pill-inner{color:#22c55e}
  .mh-prop-pill-addr{max-width:160px;overflow:hidden;text-overflow:ellipsis}
  .mh-prop-pill-star{font-size:.7rem;color:#eab308;margin-left:2px}
  .mh-prop-pill-actions{display:flex;gap:0;border-left:1px solid rgba(255,255,255,0.08)}
  .mh-prop-action-btn{padding:7px 10px;background:none;border:none;color:rgba(255,255,255,0.3);font-size:.85rem;cursor:pointer;transition:color .15s;font-family:inherit}
  .mh-prop-action-btn:hover{color:rgba(255,255,255,0.7)}
  .mh-prop-action-remove:hover{color:#f97066}
  .mh-add-form{margin-top:0}

  /* CHIP BODY */
  .mh-chip-body{padding:24px}
  .mh-chip-footer{display:flex;align-items:center;justify-content:space-between;padding:12px 24px;border-top:1px solid rgba(255,255,255,0.07)}
  .mh-refresh-btn{font-size:.8rem;color:rgba(255,255,255,0.4);background:none;border:none;cursor:pointer;padding:4px 8px;border-radius:6px}
  .mh-refresh-btn:hover{color:rgba(255,255,255,0.7);background:rgba(255,255,255,0.06)}

  /* LOAN EDITOR */
  .mh-loan-grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
  .mh-loan-field{display:flex;flex-direction:column;gap:.3rem}
  .mh-loan-label{font-size:.72rem;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,0.4)}
  .mh-est-notice{font-size:.78rem;color:rgba(255,255,255,0.4);background:rgba(234,179,8,0.06);border:1px solid rgba(234,179,8,0.15);border-radius:8px;padding:10px 12px;margin-bottom:14px;line-height:1.5}
  .mh-inline-btn{background:none;border:none;cursor:pointer;color:#eab308;font-size:.78rem;text-decoration:underline;padding:0}
  @media(max-width:600px){.mh-loan-grid{grid-template-columns:1fr}}

  /* LOADING / ERROR */
  .mh-analysis-loading{display:flex;align-items:center;gap:12px;color:rgba(255,255,255,0.45);font-size:.9rem;padding:2rem 0}
  .mh-spinner{width:18px;height:18px;border:2px solid rgba(255,255,255,0.1);border-top-color:#22c55e;border-radius:50%;animation:mh-spin .7s linear infinite;flex-shrink:0}
  @keyframes mh-spin{to{transform:rotate(360deg)}}
  .mh-analysis-err{color:rgba(255,95,95,.8);font-size:.875rem;display:flex;align-items:center;gap:12px;padding:.75rem 0}
  .mh-retry-btn{font-size:.8rem;padding:.3rem .75rem;background:rgba(255,95,95,.12);color:rgba(255,95,95,.8);border:1px solid rgba(255,95,95,.2);border-radius:6px;cursor:pointer}

  /* STATS GRID */
  .mh-stat-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .mh-stat{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:12px 14px}
  .mh-stat-label{font-size:.68rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:5px}
  .mh-stat-value{font-size:1.25rem;font-weight:800;color:#fff;line-height:1.1}
  .mh-stat-sub{font-size:.7rem;color:rgba(255,255,255,0.4);margin-top:3px}

  /* BARS */
  .mh-bar-label-row{display:flex;justify-content:space-between;font-size:.75rem;color:rgba(255,255,255,0.55);margin-bottom:5px}
  .mh-bar-track{display:flex;height:7px;border-radius:999px;overflow:hidden}
  .mh-bar-fill{height:100%;transition:width .4s ease}

  /* TABLE */
  .mh-table{width:100%;border-collapse:collapse;font-size:.85rem}
  .mh-table th{text-align:left;font-size:.68rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,0.35);padding:.5rem 0;border-bottom:1px solid rgba(255,255,255,0.07)}
  .mh-table td{padding:.65rem 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#fff;font-weight:600}
  .mh-table th:not(:first-child), .mh-table td:not(:first-child){text-align:right}

  /* MISC */
  .mh-range-note{font-size:.75rem;color:rgba(255,255,255,0.4);margin-top:4px}
  .mh-section-sub-label{font-size:.72rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,0.35)}
  .mh-empty-note{font-size:.875rem;color:rgba(255,255,255,0.4);line-height:1.6;padding:.5rem 0}
  .mh-footnote{font-size:.72rem;color:rgba(255,255,255,0.3);margin-top:10px;line-height:1.5}
  .mh-inline-link{color:#22c55e;text-decoration:none}
  .mh-cta-link{color:#22c55e;font-size:.875rem;font-weight:600;text-decoration:none}
  .mh-cta-link:hover{opacity:.8}

  .mh-highlight-box{padding:16px;border-radius:10px;border:1px solid rgba(255,255,255,0.08)}
  .mh-highlight-title{font-size:.75rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px}

  /* COMPARE ROW */
  .mh-compare-row{display:flex;align-items:center;gap:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px 16px}
  .mh-compare-item{flex:1}
  .mh-compare-divider{width:1px;height:40px;background:rgba(255,255,255,0.08);flex-shrink:0}

  /* MILESTONES */
  .mh-milestone-row{display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.06)}
  .mh-milestone-row:last-of-type{border-bottom:none}
  .mh-milestone-dot{width:10px;height:10px;border-radius:50%;margin-top:4px;flex-shrink:0}
  .mh-milestone-body{flex:1}
  .mh-milestone-label{font-size:.9rem;font-weight:700;display:flex;align-items:center;gap:8px}
  .mh-milestone-done-badge{font-size:.7rem;font-weight:600;color:#22c55e;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.25);border-radius:4px;padding:1px 7px}
  .mh-milestone-detail{font-size:.8rem;color:rgba(255,255,255,0.45);margin-top:3px}

  /* DIGEST */
  .mh-digest-row{display:flex;align-items:center;justify-content:space-between;gap:1rem}
  .mh-digest-info h3{font-size:1rem;font-weight:600;margin-bottom:.2rem}
  .mh-digest-info p{font-size:.82rem;color:rgba(255,255,255,0.45);line-height:1.4}
  .mh-toggle{position:relative;width:48px;height:26px;flex-shrink:0}
  .mh-toggle input{opacity:0;width:0;height:0;position:absolute}
  .mh-toggle-track{position:absolute;inset:0;background:rgba(255,255,255,0.12);border-radius:13px;cursor:pointer;transition:background .25s}
  .mh-toggle input:checked+.mh-toggle-track{background:#22c55e}
  .mh-toggle-track::after{content:'';position:absolute;left:3px;top:3px;width:20px;height:20px;background:#fff;border-radius:50%;transition:transform .25s}
  .mh-toggle input:checked+.mh-toggle-track::after{transform:translateX(22px)}

  @media(max-width:600px){
    .mh-shell{padding:2rem 1rem 4rem}
    .mh-header h1{font-size:1.5rem}
    .mh-stat-row{grid-template-columns:1fr 1fr}
    .mh-stat-row .mh-stat:last-child{grid-column:span 2}
    .mh-compare-row{flex-direction:column;gap:10px}
    .mh-compare-divider{display:none}
    .mh-table{font-size:.78rem}
  }
`;
