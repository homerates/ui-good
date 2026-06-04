'use client';
// app/components/LockedIntelligenceCard.tsx
// Renders in the card stack when a scenario is seeded but no property address exists.
// Previews the 4-level Decision Score structure in a locked state + CTA to add a property.

import AdminCardBadge from './AdminCardBadge';

interface Props {
  onCheckProperty?: () => void;
}

const LockIcon = ({ size = 18, opacity = 0.25 }: { size?: number; opacity?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="3" y="11" width="18" height="11" rx="2" stroke={`rgba(185,208,192,${opacity})`} strokeWidth="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke={`rgba(185,208,192,${opacity})`} strokeWidth="2" />
  </svg>
);

const levels = [
  { num: 'L1', name: 'Financial',  weight: '35%' },
  { num: 'L2', name: 'Property',   weight: '25%' },
  { num: 'L3', name: 'Market',     weight: '25%' },
  { num: 'L4', name: 'Location',   weight: '15%' },
];

export default function LockedIntelligenceCard({ onCheckProperty }: Props) {
  return (
    <div style={{
      background:   'rgba(255,255,255,0.025)',
      border:       '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16,
      position:     'relative',
      overflow:     'hidden',
      marginTop:    10,
      fontFamily:   "'DM Sans', system-ui, sans-serif",
    }}>
      <AdminCardBadge code="LIC-011" />

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>

          {/* Lock ring */}
          <div style={{ position: 'relative', width: 60, height: 60, flexShrink: 0 }}>
            <svg width="60" height="60" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LockIcon size={20} opacity={0.2} />
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(185,208,192,0.28)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
              Track 5 · Decision Score
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f0f4ff', lineHeight: 1.2 }}>
              Decision Intelligence
            </div>
            <div style={{ fontSize: '0.73rem', color: 'rgba(185,208,192,0.38)', marginTop: 2 }}>
              Add a property to run your score
            </div>
          </div>
        </div>

        {/* Locked badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background:   'rgba(255,255,255,0.04)',
          border:       '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20, padding: '4px 12px',
          fontSize: '0.68rem', fontWeight: 700,
          color: 'rgba(185,208,192,0.3)', whiteSpace: 'nowrap',
        }}>
          <LockIcon size={9} opacity={0.45} />
          Locked
        </div>
      </div>

      {/* ── Level rows ── */}
      <div style={{ padding: '13px 20px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {levels.map(level => (
          <div key={level.num} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Label */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, width: 148, flexShrink: 0 }}>
              <span style={{ fontSize: '0.61rem', fontWeight: 800, color: 'rgba(185,208,192,0.18)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {level.num}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'rgba(185,208,192,0.18)' }}>
                {level.name}
              </span>
              <span style={{ fontSize: '0.61rem', color: 'rgba(185,208,192,0.1)', marginLeft: 'auto' }}>{level.weight}</span>
            </div>

            {/* Bar track — subtle shimmer */}
            <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3, width: '100%',
                background: 'linear-gradient(90deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.02) 100%)',
                backgroundSize: '200% 100%',
                animation: 'dsShimmer 2.8s infinite',
              }} />
            </div>

            {/* Lock icon */}
            <div style={{ width: 30, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
              <LockIcon size={11} opacity={0.18} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Footer CTA ── */}
      <div style={{ padding: '12px 20px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ fontSize: '0.76rem', color: 'rgba(185,208,192,0.42)', marginBottom: 9, lineHeight: 1.5 }}>
          Enter a property address to unlock Decision Intelligence — scored across Financial, Property, Market &amp; Location.
        </div>
        <button
          onClick={onCheckProperty}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            background:   'rgba(0,232,122,0.06)',
            border:       '1px solid rgba(0,232,122,0.18)',
            color:        '#00e87a',
            fontWeight:   800,
            fontSize:     '0.85rem',
            borderRadius: 10,
            padding:      '10px 16px',
            cursor:       'pointer',
            fontFamily:   "'DM Sans', system-ui, sans-serif",
            transition:   'background 0.2s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,232,122,0.12)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,232,122,0.06)')}
        >
          Check a specific property →
        </button>
      </div>
    </div>
  );
}
