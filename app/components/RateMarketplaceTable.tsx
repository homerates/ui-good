'use client';
// app/components/RateMarketplaceTable.tsx
// Anonymous lender rate table. Fetches from /api/rate-marketplace.
// Lender identity is hidden until borrower explicitly connects via discover dialogue.

import { useEffect, useState, useRef } from 'react';
import type { MarketplaceInput, MarketplaceOutput, RateTableRow } from '../../lib/pricing/marketplace-engine';
import RateDiscoverPanel from './RateDiscoverPanel';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function occupancyLabel(o: string) {
  return o === 'primary' ? 'Primary' : o === 'second' ? '2nd home' : 'Investment';
}

function purposeLabel(p: string) {
  return p === 'purchase' ? 'Purchase' : p === 'rate_term_refi' ? 'Rate/term refi' : 'Cash-out refi';
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: '#0e1420',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16,
  overflow: 'hidden',
  fontFamily: "'DM Sans', system-ui, sans-serif",
};

const eyebrow: React.CSSProperties = {
  fontSize: '0.62rem', fontWeight: 700, color: 'rgba(0,232,122,0.55)',
  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3,
};

// ─── Subcomponents ────────────────────────────────────────────────────────────

function CriteriaBar({ s }: { s: MarketplaceInput }) {
  const chips = [
    { label: `${s.creditScore} FICO`, pass: s.creditScore >= 640 },
    { label: `${s.ltv.toFixed(0)}% LTV`, pass: s.ltv <= 97 },
    { label: fmt$(s.loanAmount), pass: true },
    { label: s.loanType.charAt(0).toUpperCase() + s.loanType.slice(1), pass: true },
    { label: s.state.toUpperCase(), pass: true },
    { label: `${s.lockDays}-day lock`, pass: true },
    { label: occupancyLabel(s.occupancy), pass: true },
  ];

  return (
    <div style={{
      padding: '8px 18px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      background: 'rgba(255,255,255,0.015)',
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: '0.62rem', color: 'rgba(185,208,192,0.28)', marginRight: 2 }}>
        Qualifying criteria:
      </span>
      {chips.map(c => (
        <span key={c.label} style={{
          fontSize: '0.65rem', fontWeight: 600,
          color: c.pass ? 'rgba(74,222,128,0.7)' : 'rgba(185,208,192,0.4)',
          background: c.pass ? 'rgba(0,232,122,0.05)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${c.pass ? 'rgba(0,232,122,0.15)' : 'rgba(255,255,255,0.06)'}`,
          borderRadius: 5, padding: '2px 7px',
        }}>
          {c.pass ? '✓ ' : ''}{c.label}
        </span>
      ))}
    </div>
  );
}

function ColHeads() {
  const cols = ['Lender', 'Rate', 'APR', 'Monthly P&I', 'Est. closing', ''];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr 1fr 110px',
      padding: '7px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      {cols.map(c => (
        <div key={c} style={{
          fontSize: '0.6rem', fontWeight: 700,
          color: 'rgba(185,208,192,0.28)',
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          {c}
        </div>
      ))}
    </div>
  );
}

function RateRow({
  row, isBest, isOpen, onExplore,
}: {
  row: RateTableRow; isBest: boolean; isOpen: boolean; onExplore: () => void;
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr 1fr 110px',
      padding: '13px 18px', alignItems: 'center',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      background: isBest
        ? 'rgba(0,232,122,0.03)'
        : isOpen
        ? 'rgba(0,232,122,0.02)'
        : 'transparent',
      transition: 'background 0.12s',
    }}>
      {/* Lender */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(185,208,192,0.55)' }}>
            {row.label}
          </span>
          {isBest && (
            <span style={{
              fontSize: '0.55rem', fontWeight: 800, color: '#4ade80',
              background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.22)',
              borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              Best APR
            </span>
          )}
        </div>
      </div>

      {/* Rate */}
      <div>
        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: isBest ? '#4ade80' : '#f0f4ff' }}>
          {row.rate.toFixed(3)}%
        </div>
        <div style={{ fontSize: '0.63rem', color: 'rgba(185,208,192,0.28)' }}>PAR · no pts</div>
      </div>

      {/* APR */}
      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'rgba(185,208,192,0.7)' }}>
        {row.apr.toFixed(3)}%
      </div>

      {/* Monthly */}
      <div>
        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f0f4ff' }}>
          {fmt$(row.monthlyPayment)}
        </div>
        <div style={{ fontSize: '0.62rem', color: 'rgba(185,208,192,0.28)' }}>30-yr fixed</div>
      </div>

      {/* Closing */}
      <div>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(185,208,192,0.55)' }}>
          {fmt$(row.estClosingCosts)}
        </div>
        <div style={{ fontSize: '0.62rem', color: 'rgba(185,208,192,0.25)' }}>est. 3rd-party</div>
      </div>

      {/* CTA */}
      <div>
        <button onClick={onExplore} style={{
          padding: '8px 13px',
          background: isOpen ? 'rgba(0,232,122,0.15)' : 'rgba(0,232,122,0.08)',
          border: '1px solid rgba(0,232,122,0.25)',
          borderRadius: 9, color: '#4ade80',
          fontWeight: 700, fontSize: '0.76rem',
          fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
          transition: 'background 0.12s',
        }}>
          {isOpen ? 'Exploring ▾' : 'Explore →'}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface Props {
  scenario: MarketplaceInput;
}

export default function RateMarketplaceTable({ scenario }: Props) {
  const [output, setOutput] = useState<MarketplaceOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(3);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activePanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setOutput(null);
    setActiveId(null);
    setDisplayCount(3);

    fetch('/api/rate-marketplace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scenario),
    })
      .then(r => r.json())
      .then((data: MarketplaceOutput) => {
        if ('error' in data) { setError(String((data as { error: string }).error)); return; }
        setOutput(data);
      })
      .catch(() => setError('Unable to load rate offers — please try again.'))
      .finally(() => setLoading(false));
  }, [
    scenario.creditScore, scenario.ltv, scenario.loanAmount,
    scenario.lockDays, scenario.state, scenario.loanType,
    scenario.occupancy, scenario.loanPurpose, scenario.propertyType,
  ]);

  useEffect(() => {
    if (activeId && activePanelRef.current) {
      setTimeout(() => activePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
    }
  }, [activeId]);

  function toggleExplore(id: string) {
    setActiveId(prev => prev === id ? null : id);
  }

  // ── Loading ──
  if (loading) {
    return (
      <div style={{ ...card, padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '0.78rem', color: 'rgba(185,208,192,0.4)', marginBottom: 8 }}>
          Checking eligible lenders for your scenario…
        </div>
        <div style={{
          display: 'inline-block', width: 28, height: 28,
          border: '2px solid rgba(0,232,122,0.2)',
          borderTopColor: '#00e87a', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div style={{ ...card, padding: '1.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: '0.82rem', color: 'rgba(255,95,95,0.7)' }}>{error}</div>
      </div>
    );
  }

  // ── No lenders matched ──
  if (!output || output.rows.length === 0) {
    return (
      <div style={{ ...card, padding: '1.5rem' }}>
        <div style={eyebrow}>Rate offers</div>
        <div style={{ fontSize: '0.88rem', color: 'rgba(185,208,192,0.5)', lineHeight: 1.6 }}>
          No lenders are currently active for this exact scenario ({scenario.state}, {scenario.loanType}, {scenario.ltv.toFixed(0)}% LTV).
          More lenders are being onboarded — check back soon.
        </div>
      </div>
    );
  }

  const visibleRows = output.rows.slice(0, displayCount);
  const hiddenCount = output.rows.length - displayCount;
  const activeRow = output.rows.find(r => r.anonymousId === activeId) ?? null;

  return (
    <>
      <div style={card}>

        {/* Header */}
        <div style={{
          padding: '15px 18px 13px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={eyebrow}>Live rate offers</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f0f4ff' }}>
              Lenders eligible for your scenario
            </div>
            <div style={{ fontSize: '0.73rem', color: 'rgba(185,208,192,0.38)', marginTop: 2 }}>
              Sorted by APR · Lender identity hidden until you choose to connect
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            background: 'rgba(0,232,122,0.07)', border: '1px solid rgba(0,232,122,0.18)',
            borderRadius: 20, padding: '5px 12px',
            fontSize: '0.7rem', fontWeight: 700, color: '#4ade80',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animation: 'pulse 2s infinite' }} />
            {output.matchedCount} eligible
            <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
          </div>
        </div>

        {/* Eligibility criteria bar */}
        <CriteriaBar s={scenario} />

        {/* Column headers */}
        <ColHeads />

        {/* Rows + inline discover panels */}
        {visibleRows.map((row, i) => (
          <div key={row.anonymousId}>
            <RateRow
              row={row}
              isBest={i === 0}
              isOpen={activeId === row.anonymousId}
              onExplore={() => toggleExplore(row.anonymousId)}
            />
            {activeId === row.anonymousId && (
              <div ref={activePanelRef} style={{ padding: '0 18px 18px' }}>
                <RateDiscoverPanel
                  lenderId={row.anonymousId}
                  label={row.label}
                  rate={row.rate}
                  apr={row.apr}
                  monthly={row.monthlyPayment}
                  estClosingCosts={row.estClosingCosts}
                  scenario={scenario}
                  onClose={() => setActiveId(null)}
                />
              </div>
            )}
          </div>
        ))}

        {/* More lenders */}
        {hiddenCount > 0 && (
          <div style={{
            padding: '12px 18px',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: '0.72rem', color: 'rgba(185,208,192,0.33)' }}>
              Showing {displayCount} of {output.rows.length} eligible lenders
            </div>
            <button onClick={() => setDisplayCount(prev => prev + 5)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, padding: '8px 13px',
              color: 'rgba(185,208,192,0.55)', fontSize: '0.76rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.12s',
            }}>
              Review more lenders ↓
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '11px 18px',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: '0.63rem', color: 'rgba(185,208,192,0.22)', lineHeight: 1.55, maxWidth: 480 }}>
            Rates computed from live FRED par rate + Fannie Mae LLPA matrix + each lender's submitted margin.
            Lenders appear because your scenario meets their published eligibility criteria — not because HomeRates.ai selects or endorses them.{' '}
            <strong style={{ color: 'rgba(185,208,192,0.38)' }}>Lender identity is revealed only when you choose to connect.</strong>{' '}
            Est. closing costs are third-party averages and vary by location.
          </div>
        </div>

      </div>
    </>
  );
}
