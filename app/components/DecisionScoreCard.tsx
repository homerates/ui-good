'use client';
// app/components/DecisionScoreCard.tsx
// Auto-fires in chat after a Redfin URL / address paste.
// Computing state: L1 + L2 bars filled immediately; L3 + L4 shimmer while Grok runs.
// Complete state: all 4 bars animate in, composite score, CTA to Track 5.

import { useEffect, useRef, useState } from 'react';
import AdminCardBadge from './AdminCardBadge';

export type DecisionScoreData = {
  state: 'computing' | 'complete';
  address: string;
  propertyState?: string; // 2-letter state abbrev (e.g. "CA") — used for RIE URL
  zip?: string;           // 5-digit ZIP — used to resolve county
  county?: string;        // county name e.g. "ORANGE" — pre-fills county selector on RIE page
  l1Score: number;
  l1Summary: string;
  l2Score: number | null;
  l2Summary: string;
  l3Score?: number | null;
  l3Summary?: string;
  l4Score?: number | null;
  l4Summary?: string;
  compositeScore?: number;
  sessionId?: string;
};

function verdict(score: number): { label: string; color: string } {
  if (score >= 85) return { label: 'Strong Buy',       color: '#4ade80' };
  if (score >= 70) return { label: 'Ready to Offer',   color: '#4ade80' };
  if (score >= 55) return { label: 'Buy with Caution', color: '#fbbf24' };
  if (score >= 40) return { label: 'Watch the Market', color: '#fbbf24' };
  return               { label: 'Hold Off',            color: '#f87171' };
}

function barColor(score: number | null | undefined): string {
  if (score == null) return 'rgba(255,255,255,0.1)';
  if (score >= 70)   return '#4ade80';
  if (score >= 50)   return '#fbbf24';
  return '#f87171';
}

function computeComposite(
  l1: number, l2: number | null,
  l3?: number | null, l4?: number | null,
): number | null {
  const entries = [
    { s: l1,        w: 0.35 },
    { s: l2,        w: 0.25 },
    { s: l3 ?? null, w: 0.25 },
    { s: l4 ?? null, w: 0.15 },
  ].filter(e => e.s != null) as { s: number; w: number }[];
  if (entries.length < 2) return null;
  const totalW   = entries.reduce((a, e) => a + e.w, 0);
  const weighted = entries.reduce((a, e) => a + e.s * e.w, 0);
  return Math.round(weighted / totalW);
}

interface Props {
  data: DecisionScoreData;
  /** Current scenario params — threaded through to "Full Analysis ↗" URL so
   *  property-intel renders at the user's adjusted down/rate/income, not always 20% */
  scenarioPrice?:  number;
  scenarioDown?:   number;
  scenarioRate?:   number;
  scenarioIncome?: number;
  scenarioDebt?:   number;
}

export default function DecisionScoreCard({ data, scenarioPrice, scenarioDown, scenarioRate, scenarioIncome, scenarioDebt }: Props) {
  const [mounted,  setMounted]  = useState(false);
  const [complete, setComplete] = useState(data.state === 'complete');
  const prevState = useRef(data.state);

  // Trigger bar animation on mount (for L1/L2)
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Detect computing → complete transition
  useEffect(() => {
    if (prevState.current === 'computing' && data.state === 'complete') {
      setComplete(true);
      prevState.current = 'complete';
    }
  }, [data.state]);

  const { address, l1Score, l2Score, l3Score, l4Score, sessionId } = data;

  const composite = data.compositeScore ?? computeComposite(l1Score, l2Score, l3Score, l4Score);
  const v         = composite != null ? verdict(composite) : null;
  // Only colour the ring/badge once we have an actual composite score
  const hasScore  = complete && composite != null;
  const circ      = 163; // 2π × r=26
  const ringFill  = composite != null ? circ - (composite / 100) * circ : circ;

  // Build "Full Analysis" URL — carry session ID so property-intel loads the existing
  // scored session (not a fresh build), plus user's adjusted scenario params for PITI display.
  const fullAnalysisUrl = (() => {
    const p = new URLSearchParams({ address });
    if (sessionId)                                       p.set('sid',    sessionId);
    if (scenarioDown   != null && scenarioDown   !== 20) p.set('down',   String(scenarioDown));
    if (scenarioRate   != null)                          p.set('rate',   scenarioRate.toFixed(3));
    if (scenarioIncome != null && scenarioIncome  > 0)  p.set('income', String(Math.round(scenarioIncome)));
    if (scenarioDebt   != null && scenarioDebt    > 0)  p.set('debt',   String(Math.round(scenarioDebt)));
    return `/property-intel?${p.toString()}`;
  })();

  // Scenario override suffix — threads adjusted scenario into Track5 URL so
  // back-links to property-intel preserve the adjusted numbers (not original DB session)
  const t5ScenarioSuffix = (() => {
    const p = new URLSearchParams();
    if (scenarioDown   != null && scenarioDown   !== 20) p.set('sc_down',   String(scenarioDown));
    if (scenarioRate   != null)                          p.set('sc_rate',   scenarioRate.toFixed(3));
    if (scenarioIncome != null && scenarioIncome  > 0)  p.set('sc_income', String(Math.round(scenarioIncome)));
    if (scenarioDebt   != null && scenarioDebt    > 0)  p.set('sc_debt',   String(Math.round(scenarioDebt)));
    const s = p.toString();
    return s ? `&${s}` : '';
  })();

  // address param included in fallback URLs so Track5 Effect 2 can look up the
  // session even when no ?session= is available (chat DSC timing race).
  const addrParam = `&address=${encodeURIComponent(address)}`;
  const track5Url = sessionId
    ? `/track5?session=${sessionId}${t5ScenarioSuffix}`
    : l3Score != null
      ? `/track5?l1_score=${l1Score}&l1_summary=${encodeURIComponent(data.l1Summary)}&l2_score=${l2Score ?? ''}&l2_summary=${encodeURIComponent(data.l2Summary)}&l3_score=${l3Score}&l3_summary=${encodeURIComponent(data.l3Summary ?? '')}&l4_score=${l4Score ?? ''}&l4_summary=${encodeURIComponent(data.l4Summary ?? '')}${addrParam}${t5ScenarioSuffix}`
      : `/track5?l1_score=${l1Score}&l1_summary=${encodeURIComponent(data.l1Summary)}&l2_score=${l2Score ?? ''}&l2_summary=${encodeURIComponent(data.l2Summary)}${addrParam}${t5ScenarioSuffix}`;

  // "Get Matched" deep-links directly to the match section — skips scrolling past 4-level DSC
  const getMatchedUrl = `${track5Url}#get-matched`;

  // "🔬 Run Rate Intelligence" — builds URL with all scenario data pre-filled.
  // Only shown when scenarioPrice is available (launched from chat with a loan scenario).
  const rateIntelUrl = (() => {
    if (!scenarioPrice || scenarioPrice <= 0) return null;
    const downPct = scenarioDown ?? 20;
    const loan    = Math.round(scenarioPrice * (1 - downPct / 100));
    const ltv     = parseFloat(((loan / scenarioPrice) * 100).toFixed(2));
    const p = new URLSearchParams({
      price:    String(Math.round(scenarioPrice)),
      downPct:  String(downPct),
      loan:     String(loan),
      ltv:      String(ltv),
      purpose:  'purchase',
      occupancy: 'primary',
    });
    // Use explicit propertyState/zip fields first; fall back to parsing the address string
    const st  = data.propertyState ?? address.match(/,\s*([A-Z]{2})\s*(?:\d{5})?(?:\s*$|,)/i)?.[1]?.toUpperCase() ?? null;
    const zip = data.zip           ?? address.match(/\b(\d{5})\b/)?.[1] ?? null;
    if (st)           p.set('st',     st);
    if (zip)          p.set('zip',    zip);
    if (data.county)  p.set('county', data.county);
    if (sessionId)    p.set('sid',    sessionId);
    return `/rate-intelligence-engine?${p.toString()}`;
  })();

  const levels = [
    { num: 'L1', name: 'Financial', weight: '35%', score: l1Score,        done: true },
    { num: 'L2', name: 'Property',  weight: '25%', score: l2Score,        done: l2Score != null },
    { num: 'L3', name: 'Market',    weight: '25%', score: l3Score ?? null, done: complete && l3Score != null },
    { num: 'L4', name: 'Location',  weight: '15%', score: l4Score ?? null, done: complete && l4Score != null },
  ];

  const accentColor = hasScore ? (v?.color ?? '#00e87a') : 'rgba(255,255,255,0.12)';

  return (
    <div style={{
      background:    hasScore ? 'rgba(0,232,122,0.04)' : 'rgba(255,255,255,0.025)',
      border:        `1px solid ${hasScore ? 'rgba(0,232,122,0.18)' : 'rgba(255,255,255,0.1)'}`,
      borderRadius:  16,
      position:      'relative',
      overflow:      'hidden',
      marginTop:     10,
      fontFamily:    "'DM Sans', system-ui, sans-serif",
      transition:    'border-color 0.5s ease, background 0.5s ease',
    }}>
      <AdminCardBadge code="DSC-004" />

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>

          {/* Score ring */}
          <div style={{ position: 'relative', width: 60, height: 60, flexShrink: 0 }}>
            <svg width="60" height="60" viewBox="0 0 64 64" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
              <circle
                cx="32" cy="32" r="26" fill="none"
                stroke={accentColor}
                strokeWidth="5" strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={complete && composite != null ? ringFill : circ}
                style={{ transition: 'stroke-dashoffset 1.3s cubic-bezier(0.34,1.56,0.64,1) 0.3s, stroke 0.5s ease' }}
              />
            </svg>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize:   hasScore ? '1.15rem' : '0.72rem',
              fontWeight: 900,
              color:      hasScore ? (v?.color ?? '#00e87a') : 'rgba(185,208,192,0.3)',
              transition: 'color 0.5s ease',
            }}>
              {hasScore ? composite : '···'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: hasScore ? '#00e87a' : 'rgba(185,208,192,0.28)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2, transition: 'color 0.4s ease' }}>
              Track 5 · Decision Score
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f0f4ff', lineHeight: 1.2 }}>
              {hasScore && v ? v.label : complete ? 'Scoring complete' : 'Analyzing property…'}
            </div>
            <div style={{ fontSize: '0.73rem', color: 'rgba(185,208,192,0.48)', marginTop: 2 }}>
              {complete ? (address?.split(',').slice(0, 2).join(',') ?? address) : 'Running market & location intelligence'}
            </div>
          </div>
        </div>

        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: hasScore ? `${(v?.color ?? '#00e87a')}1a` : 'rgba(255,255,255,0.04)',
          border:     `1px solid ${hasScore ? `${(v?.color ?? '#00e87a')}38` : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 20, padding: '4px 12px',
          fontSize: '0.68rem', fontWeight: 700,
          color:    hasScore ? (v?.color ?? '#00e87a') : 'rgba(185,208,192,0.32)',
          whiteSpace: 'nowrap',
          transition: 'all 0.5s ease',
        }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
          {hasScore ? 'Ready' : complete ? 'Scored' : 'Computing'}
        </div>
      </div>

      {/* ── Level bars ── */}
      <div style={{ padding: '13px 20px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {levels.map((level, i) => {
          const isImmediate = i < 2; // L1 + L2 animate on mount
          const shouldAnimate = isImmediate ? mounted : complete;
          return (
            <div key={level.num} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Label */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, width: 148, flexShrink: 0 }}>
                <span style={{ fontSize: '0.61rem', fontWeight: 800, color: level.done || isImmediate ? '#00e87a' : 'rgba(185,208,192,0.22)', textTransform: 'uppercase', letterSpacing: '0.08em', transition: 'color 0.4s ease' }}>
                  {level.num}
                </span>
                <span style={{ fontSize: '0.75rem', color: level.done || isImmediate ? 'rgba(185,208,192,0.7)' : 'rgba(185,208,192,0.25)', transition: 'color 0.4s ease' }}>
                  {level.name}
                </span>
                <span style={{ fontSize: '0.61rem', color: 'rgba(185,208,192,0.22)', marginLeft: 'auto' }}>{level.weight}</span>
              </div>

              {/* Bar track */}
              <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                {level.score != null ? (
                  <div style={{
                    height: '100%', borderRadius: 3,
                    background: barColor(level.score),
                    width:      shouldAnimate ? `${level.score}%` : '0%',
                    transition: shouldAnimate
                      ? `width 0.9s cubic-bezier(0.34,1.56,0.64,1) ${isImmediate ? i * 0.12 : 0.15 + (i - 2) * 0.14}s`
                      : 'none',
                  }} />
                ) : complete ? (
                  /* Scored but data unavailable — flat empty bar */
                  <div style={{ height: '100%', borderRadius: 3, background: 'rgba(255,255,255,0.04)', width: '100%' }} />
                ) : (
                  /* Shimmer while loading */
                  <div style={{
                    height: '100%', borderRadius: 3,
                    background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'dsShimmer 1.6s infinite',
                  }} />
                )}
              </div>

              {/* Score or pulse dots */}
              {level.score != null ? (
                <div style={{ fontSize: '0.79rem', fontWeight: 700, color: '#f0f4ff', width: 30, textAlign: 'right', flexShrink: 0 }}>
                  {level.score}
                </div>
              ) : complete ? (
                /* Scored but data unavailable — show dash */
                <div style={{ fontSize: '0.75rem', color: 'rgba(185,208,192,0.2)', width: 30, textAlign: 'right', flexShrink: 0 }}>—</div>
              ) : (
                <div style={{ display: 'flex', gap: 3, width: 30, justifyContent: 'flex-end' }}>
                  {[0, 1, 2].map(j => (
                    <div key={j} style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(0,232,122,0.35)', animation: `dsPulse 1.2s ease-in-out ${j * 0.2}s infinite` }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── L5 Rate Intelligence row (appears after DSC completes) ── */}
      {complete && rateIntelUrl && (
        <div style={{ padding: '9px 20px 10px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Label */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, width: 148, flexShrink: 0 }}>
              <span style={{ fontSize: '0.61rem', fontWeight: 800, color: 'rgba(139,92,246,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                L5
              </span>
              <span style={{ fontSize: '0.75rem', color: 'rgba(185,208,192,0.35)' }}>
                Rate Intelligence
              </span>
              <span style={{ fontSize: '0.58rem', color: 'rgba(185,208,192,0.18)', marginLeft: 'auto' }}>🔬</span>
            </div>

            {/* Always-visible CTA */}
            <a href={rateIntelUrl} style={{
              flex: 1, fontSize: '0.72rem', fontWeight: 700,
              color: 'rgba(167,139,250,0.65)', textDecoration: 'none',
              letterSpacing: '0.01em', transition: 'color 0.2s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#c4b5fd')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(167,139,250,0.65)')}
            >
              → Decode your rate
            </a>

            <div style={{ width: 44 }} />
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      {complete ? (
        <div style={{ padding: '10px 20px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <a
            href={fullAnalysisUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,232,122,0.07)', border: '1px solid rgba(0,232,122,0.2)',
              color: '#00e87a', fontWeight: 700, fontSize: '0.77rem',
              borderRadius: 10, padding: '10px 14px', textDecoration: 'none', whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,232,122,0.13)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,232,122,0.07)')}
          >
            Full Analysis ↗
          </a>
        </div>
      ) : (
        <div style={{ padding: '11px 20px 13px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: '0.7rem', color: 'rgba(185,208,192,0.3)', whiteSpace: 'nowrap' }}>Grok · Market &amp; Location</div>
          <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg, #00e87a, rgba(0,232,122,0.35))', borderRadius: 1, animation: 'dsProgress 28s linear forwards' }} />
          </div>
        </div>
      )}

      <style>{`
        @keyframes dsShimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        @keyframes dsPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50%       { opacity: 1;   transform: scale(1.1); }
        }
        @keyframes dsProgress {
          0%   { width: 0%; }
          25%  { width: 35%; }
          60%  { width: 70%; }
          85%  { width: 88%; }
          100% { width: 94%; }
        }
      `}</style>
    </div>
  );
}
