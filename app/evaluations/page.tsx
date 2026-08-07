'use client';
// app/evaluations/page.tsx — Property portfolio: 3-across grid of saved evaluations

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppNav from '../components/AppNav';
import { verdictLabel } from '../../lib/scoring/decisionScore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EvalSession {
  id:               string;
  property_address: string | null;
  session_name:     string | null;
  status:           string;
  scenario_json:    Record<string, unknown> | null;
  l1_score:         number | null;
  l2_score:         number | null;
  l3_score:         number | null;
  l4_score:         number | null;
  l2_summary:       string | null;
  l3_summary:       string | null;
  composite_score:  number | null;
  updated_at:       string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(s: number | null): string {
  if (s == null) return '#4b6080';
  if (s >= 70)   return '#4ade80';
  if (s >= 50)   return '#fbbf24';
  return '#f87171';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function levelCount(s: EvalSession): number {
  return [s.l1_score, s.l2_score, s.l3_score, s.l4_score].filter(x => x != null).length;
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

// Extract address from a session — l2_summary contains "ADDR — ..." prefix
function getAddress(s: EvalSession): string | null {
  return s.property_address
      ?? s.l2_summary?.split(' — ')[0]?.trim()
      ?? s.l3_summary?.split(' — ')[0]?.trim()
      ?? null;
}

// Pull street part and city/state part for display
function splitAddress(addr: string | null): { street: string; city: string } {
  if (!addr) return { street: 'Unnamed Property', city: '' };
  const parts = addr.split(',');
  return {
    street: parts[0]?.trim() ?? addr,
    city:   parts.slice(1, 3).join(',').trim(),
  };
}

// Build scenario label from session_name or scenario_json
function scenarioLabel(s: EvalSession): string {
  if (s.session_name) return s.session_name;
  const sj = s.scenario_json;
  if (!sj) return '';
  const lt = (sj.lt as string) === 'jumbo' ? 'Jumbo' : (sj.lt as string) === 'fha' ? 'FHA'
           : (sj.lt as string) === 'va' ? 'VA' : 'Conv.';
  const price = sj.price ? fmtK(sj.price as number) : '';
  const dp    = sj.dp_pct != null ? `${sj.dp_pct}% down` : '';
  return [lt, price, dp].filter(Boolean).join(' · ');
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 56 }: { score: number | null; size?: number }) {
  const r     = size * 0.38;
  const circ  = 2 * Math.PI * r;
  const cx    = size / 2;
  const color = scoreColor(score);
  const fill  = score != null ? circ * (score / 100) : 0;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={size * 0.07} />
        {score != null && (
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={size * 0.07}
            strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cx})`} />
        )}
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        {score != null ? (
          <>
            <span style={{ fontSize: size * 0.27, fontWeight: 900, color, lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: size * 0.14, color: '#4b6080' }}>/100</span>
          </>
        ) : (
          <span style={{ fontSize: size * 0.22, fontWeight: 700, color: '#4b6080' }}>—</span>
        )}
      </div>
    </div>
  );
}

// ─── Property Card ────────────────────────────────────────────────────────────

function PropertyCard({ s }: { s: EvalSession }) {
  const c      = s.composite_score;
  const cc     = scoreColor(c);
  const addr   = getAddress(s);
  const { street, city } = splitAddress(addr);
  const vLabel = c != null ? verdictLabel(c) : null;
  const n      = levelCount(s);
  const sLabel = scenarioLabel(s);
  const t5url  = `/track5?session=${s.id}`;

  const levels = [
    { k: 'L1', score: s.l1_score },
    { k: 'L2', score: s.l2_score },
    { k: 'L3', score: s.l3_score },
    { k: 'L4', score: s.l4_score },
  ];

  return (
    <a
      href={t5url}
      style={{ display: 'block', textDecoration: 'none' }}
    >
      <div style={{
        background: '#0d1117',
        border: `1px solid ${c != null ? `color-mix(in srgb, ${cc} 22%, rgba(255,255,255,0.06))` : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 14,
        overflow: 'hidden',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = c != null ? `color-mix(in srgb, ${cc} 45%, rgba(255,255,255,0.1))` : 'rgba(255,255,255,0.18)';
          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 24px rgba(0,0,0,0.3)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = c != null ? `color-mix(in srgb, ${cc} 22%, rgba(255,255,255,0.06))` : 'rgba(255,255,255,0.07)';
          (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
        }}
      >
        {/* Top accent bar */}
        <div style={{ height: 3, background: c != null ? cc : 'rgba(255,255,255,0.06)', flexShrink: 0 }} />

        {/* Card body */}
        <div style={{ padding: '16px 16px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Address + score ring row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '0.88rem', fontWeight: 800, color: '#e2e8f0',
                lineHeight: 1.25, marginBottom: 3,
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {street}
              </div>
              {city && (
                <div style={{ fontSize: '0.68rem', color: '#4b6080', marginBottom: 2 }}>{city}</div>
              )}
            </div>
            <ScoreRing score={c} size={52} />
          </div>

          {/* Verdict */}
          {vLabel && (
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: cc, marginBottom: 8 }}>
              {vLabel}
            </div>
          )}

          {/* Scenario label */}
          {sLabel && (
            <div style={{
              fontSize: '0.65rem', color: '#4b6080',
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 6, padding: '4px 8px', marginBottom: 10,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {sLabel}
            </div>
          )}

          {/* Level pills */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
            {levels.map(({ k, score }) => {
              const sc = scoreColor(score);
              return (
                <span key={k} style={{
                  fontSize: '0.6rem', fontWeight: 700,
                  padding: '2px 7px', borderRadius: 5,
                  background: score != null ? `color-mix(in srgb, ${sc} 12%, transparent)` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${score != null ? `color-mix(in srgb, ${sc} 28%, transparent)` : 'rgba(255,255,255,0.07)'}`,
                  color: score != null ? sc : '#4b6080',
                }}>
                  {k}{score != null ? ` ${score}` : ' —'}
                </span>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: '0.62rem', color: '#4b6080' }}>
              {n} of 4 · {fmtDate(s.updated_at)}
            </span>
            <span style={{
              fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 5, padding: '3px 8px',
            }}>
              Open →
            </span>
          </div>

        </div>
      </div>
    </a>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EvaluationsPage() {
  const { isSignedIn, isLoaded } = useUser();
  const router                   = useRouter();
  const [sessions, setSessions]  = useState<EvalSession[]>([]);
  const [loading,  setLoading]   = useState(true);
  const [error,    setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.replace('/sign-in'); return; }

    fetch('/api/buyer-sessions')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { if (d?.sessions) setSessions(d.sessions); })
      .catch(() => setError('Could not load your evaluations. Please try again.'))
      .finally(() => setLoading(false));
  }, [isLoaded, isSignedIn, router]);

  // Only show sessions with a known address (shells without address are not shown)
  const visible = sessions.filter(s => getAddress(s) != null);
  const shells  = sessions.filter(s => getAddress(s) == null);

  return (
    <div className="page-standalone ev-root">
      <style>{`
        .ev-root {
          background: #080c12;
          color: #f1f5f9;
          font-family: var(--font-dm-sans, 'DM Sans', system-ui, sans-serif);
          min-height: 100vh;
        }
        html:has(.ev-root) { height: auto !important; overflow: visible !important; }
        body:has(.ev-root) {
          display: block !important;
          height: auto !important;
          overflow: visible !important;
          background: #080c12 !important;
        }
        .ev-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        @media (max-width: 680px) {
          .ev-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 420px) {
          .ev-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <AppNav />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2.5rem 1.5rem 6rem' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#f1f5f9', marginBottom: 5 }}>
              My Evaluations
            </h1>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.65 }}>
              Your property portfolio. Tap any card to open its Decision Score.
            </p>
          </div>
          <Link href="/chat" style={{
            flexShrink: 0, display: 'inline-block',
            padding: '9px 18px', borderRadius: 8,
            fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none',
            background: 'rgba(74,222,128,0.08)', color: '#4ade80',
            border: '1px solid rgba(74,222,128,0.2)',
          }}>
            + New Scenario
          </Link>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div style={{ fontSize: '0.85rem', color: '#94a3b8', padding: '40px 0', textAlign: 'center' }}>
            Loading your evaluations…
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div style={{
            background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)',
            borderRadius: 10, padding: '14px 18px', fontSize: '0.82rem', color: '#f87171',
          }}>
            {error}
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && !error && visible.length === 0 && (
          <div style={{
            background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14, padding: '44px 28px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>🏡</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>
              No properties evaluated yet
            </div>
            <div style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.7, marginBottom: 24, maxWidth: 380, margin: '0 auto 24px' }}>
              Run a scenario, check a property, and complete Property Intelligence to build your first Decision Score.
            </div>
            <Link href="/chat" style={{
              display: 'inline-block', padding: '10px 24px', borderRadius: 8,
              fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none',
              background: 'rgba(74,222,128,0.08)', color: '#4ade80',
              border: '1px solid rgba(74,222,128,0.2)',
            }}>
              Start a Scenario →
            </Link>
          </div>
        )}

        {/* ── Portfolio grid ── */}
        {!loading && !error && visible.length > 0 && (
          <div className="ev-grid">
            {visible.map(s => <PropertyCard key={s.id} s={s} />)}
          </div>
        )}

        {/* ── Incomplete shells (scenario only, no address) ── */}
        {!loading && !error && shells.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4b6080', marginBottom: 10 }}>
              In Progress — No Property Linked
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {shells.map(s => (
                <div key={s.id} style={{
                  background: '#0d1117', border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 10, padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: 2 }}>
                      {scenarioLabel(s) || 'Unnamed Scenario'}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#4b6080' }}>
                      Scenario only · {fmtDate(s.updated_at)} · Check a property to continue
                    </div>
                  </div>
                  <Link href="/check-property" style={{
                    fontSize: '0.65rem', fontWeight: 700, color: '#4b6080',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 6, padding: '5px 10px', textDecoration: 'none', whiteSpace: 'nowrap',
                  }}>
                    Add Property →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {visible.length > 0 && (
          <div style={{ marginTop: 24, fontSize: '0.7rem', color: '#4b6080', textAlign: 'center', lineHeight: 1.6 }}>
            Evaluations save automatically as you complete each step of the Homeowner Journey.
          </div>
        )}

      </div>
    </div>
  );
}
