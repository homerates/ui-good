// app/components/FactLabelBadge.tsx
//
// Shared badge for HomeRates.ai's existing claim-type taxonomy -- the same
// six labels already defined as `FactLabel` in lib/propertyIntelligence.ts
// and rendered on the canonical public Property Intelligence page
// (app/property-intelligence/[id]/page.tsx's local `Tag` component) and in
// the Intelligence Gateway's `ClaimType` (lib/gateway/outputSchema.ts).
// This does not replace or modify either of those -- it's a second,
// independent consumer of the same terminology, extended with one
// presentation-only value ('UNAVAILABLE') for surfaces that need to show an
// unconfirmed/missing figure, which the canonical page instead renders as a
// plain "--" with prose. No calculation or scoring logic lives here.
import type { FactLabel } from '../../lib/propertyIntelligence';

export type ExtendedFactLabel = FactLabel | 'UNAVAILABLE';

export const FACT_LABEL_COLORS: Record<ExtendedFactLabel, { bg: string; fg: string; border: string }> = {
  'PROPERTY FACT':           { bg: 'rgba(56,189,248,0.10)',  fg: '#7dd3fc', border: 'rgba(56,189,248,0.30)' },
  'MARKET FACT':             { bg: 'rgba(0,232,122,0.10)',   fg: '#5eead4', border: 'rgba(0,232,122,0.30)' },
  'ILLUSTRATIVE ASSUMPTION': { bg: 'rgba(240,192,64,0.10)',  fg: '#fbbf24', border: 'rgba(240,192,64,0.30)' },
  'DERIVED CALCULATION':     { bg: 'rgba(167,139,250,0.10)', fg: '#c4b5fd', border: 'rgba(167,139,250,0.30)' },
  'ESTIMATE':                { bg: 'rgba(200,214,230,0.08)', fg: '#94a3b8', border: 'rgba(200,214,230,0.20)' },
  'AI INTERPRETATION':       { bg: 'rgba(244,114,182,0.10)', fg: '#f9a8d4', border: 'rgba(244,114,182,0.30)' },
  'UNAVAILABLE':             { bg: 'rgba(255,95,95,0.08)',   fg: '#ff9f9f', border: 'rgba(255,95,95,0.28)' },
};

export function FactLabelBadge({ label }: { label: ExtendedFactLabel }) {
  const c = FACT_LABEL_COLORS[label];
  return (
    <span
      style={{
        display: 'inline-block',
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '0.06em',
        padding: '2px 7px',
        borderRadius: 5,
        marginLeft: 8,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}
