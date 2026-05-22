'use client';
// app/evaluations/page.tsx — User's saved buying decision sessions

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppNav from '../components/AppNav';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EvalSession {
  id:               string;
  property_address: string | null;
  session_name:     string | null;
  status:           string;
  scenario_json:    Record<string, unknown> | null;
  l1_score:         number | null;
  l1_summary:       string | null;
  l2_score:         number | null;
  l2_summary:       string | null;
  l3_score:         number | null;
  l3_summary:       string | null;
  l4_score:         number | null;
  l4_summary:       string | null;
  composite_score:  number | null;
  created_at:       string;
  updated_at:       string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(s: number | null): string {
  if (s == null) return '#64748b';
  if (s >= 70)   return '#4ade80';
  if (s >= 50)   return '#fbbf24';
  return '#f87171';
}

function verdict(score: number): string {
  if (score >= 85) return 'Strong Buy';
  if (score >= 70) return 'Ready to Offer';
  if (score >= 55) return 'Buy with Caution';
  if (score >= 40) return 'Watch the Market';
  return 'Hold Off';
}

function buildTrack5Url(s: EvalSession): string {
  const p = new URLSearchParams();
  if (s.l1_score != null) { p.set('l1_score', String(s.l1_score)); if (s.l1_summary) p.set('l1_summary', s.l1_summary); }
  if (s.l2_score != null) { p.set('l2_score', String(s.l2_score)); if (s.l2_summary) p.set('l2_summary', s.l2_summary); }
  if (s.l3_score != null) { p.set('l3_score', String(s.l3_score)); if (s.l3_summary) p.set('l3_summary', s.l3_summary); }
  if (s.l4_score != null) { p.set('l4_score', String(s.l4_score)); if (s.l4_summary) p.set('l4_summary', s.l4_summary); }
  const sj = s.scenario_json;
  if (sj) {
    if (sj.price)          p.set('ctx_price', String(sj.price));
    if (sj.dp_pct != null) p.set('ctx_dp',    String(sj.dp_pct));
    if (sj.lt)             p.set('ctx_lt',     String(sj.lt));
    if (sj.rate)           p.set('ctx_rate',   String(sj.rate));
    if (sj.piti)           p.set('ctx_piti',   String(sj.piti));
  }
  return `/track5?${p.toString()}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function levelCount(s: EvalSession): number {
  return [s.l1_score, s.l2_score, s.l3_score, s.l4_score].filter(x => x != null).length;
}

// ─── Score Ring (mini) ────────────────────────────────────────────────────────

function MiniRing({ score }: { score: number | null }) {
  const size   = 52;
  const r      = size * 0.38;
  const circ   = 2 * Math.PI * r;
  const cx     = size / 2;
  const color  = scoreColor(score);
  const fill   = score != null ? circ * (score / 100) : 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={size * 0.07} />
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
            <span style={{ fontSize: '1rem', fontWeight: 900, color, lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: '0.5rem', color: '#64748b' }}>/100</span>
          </>
        ) : (
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b' }}>—</span>
        )}
      </div>
    </div>
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
      .then(d => {
        if (d?.sessions) setSessions(d.sessions);
      })
      .catch(() => setError('Could not load your evaluations. Please try again.'))
      .finally(() => setLoading(false));
  }, [isLoaded, isSignedIn, router]);

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
      `}</style>

      <AppNav />

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '2.5rem 1.5rem 6rem' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#f1f5f9', marginBottom: 5 }}>
                My Evaluations
              </h1>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.65 }}>
                Buying decisions in progress. Tap any to open your scorecard and continue scoring.
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
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div style={{ fontSize: '0.85rem', color: '#94a3b8', padding: '24px 0' }}>
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
        {!loading && !error && sessions.length === 0 && (
          <div style={{
            background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14, padding: '44px 28px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>
              No evaluations yet
            </div>
            <div style={{ fontSize: '0.82rem', color: '#eaf8f7', lineHeight: 1.7, marginBottom: 24, maxWidth: 420, margin: '0 auto 24px' }}>
              Run a purchase scenario from any calculator, then tap{' '}
              <span style={{ color: '#4ade80', fontWeight: 600 }}>📋 Score This Purchase</span>{' '}
              to create your first buying decision evaluation.
            </div>
            <Link href="/chat" style={{
              display: 'inline-block', padding: '10px 24px', borderRadius: 8,
              fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none',
              background: 'rgba(74,222,128,0.08)', color: '#4ade80',
              border: '1px solid rgba(74,222,128,0.2)',
            }}>
              Run a Purchase Scenario →
            </Link>
          </div>
        )}

        {/* ── Session list ── */}
        {sessions.map(s => {
          const n      = levelCount(s);
          const c      = s.composite_score;
          const cc     = scoreColor(c);
          const vLabel = c != null ? verdict(c) : null;
          const t5url  = buildTrack5Url(s);
          const levels = ['l1', 'l2', 'l3', 'l4'] as const;

          return (
            <div key={s.id} style={{
              background: '#0d1117',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 12, marginBottom: 10,
              overflow: 'hidden',
            }}>
              {/* Left accent stripe */}
              <div style={{ display: 'flex', alignItems: 'stretch' }}>
                <div style={{
                  width: 3, flexShrink: 0,
                  background: c != null ? cc : 'rgba(255,255,255,0.08)',
                }} />

                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px', flexWrap: 'wrap' }}>

                  {/* Score ring */}
                  <MiniRing score={c} />

                  {/* Details */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{
                      fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0',
                      marginBottom: 3,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {s.session_name ?? s.property_address ?? 'Unnamed Evaluation'}
                    </div>

                    {vLabel && (
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: cc, marginBottom: 5 }}>
                        {vLabel}
                      </div>
                    )}

                    {/* Level pills */}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 5 }}>
                      {levels.map((k, i) => {
                        const score = s[`${k}_score` as keyof EvalSession] as number | null;
                        const sc    = scoreColor(score);
                        return (
                          <span key={k} style={{
                            fontSize: '0.6rem', fontWeight: 700,
                            padding: '2px 6px', borderRadius: 5,
                            background: score != null ? `color-mix(in srgb, ${sc} 12%, transparent)` : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${score != null ? `color-mix(in srgb, ${sc} 28%, transparent)` : 'rgba(255,255,255,0.07)'}`,
                            color: score != null ? sc : '#64748b',
                          }}>
                            L{i + 1}{score != null ? ` ${score}` : ' —'}
                          </span>
                        );
                      })}
                    </div>

                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                      {n} of 4 levels scored · Updated {fmtDate(s.updated_at)}
                    </div>
                  </div>

                  {/* Open CTA */}
                  <a href={t5url} style={{
                    flexShrink: 0, display: 'inline-block',
                    padding: '9px 18px', borderRadius: 8,
                    fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
                    background: 'rgba(255,255,255,0.04)', color: '#eaf8f7',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}>
                    Open Scorecard →
                  </a>
                </div>
              </div>
            </div>
          );
        })}

        {sessions.length > 0 && (
          <div style={{ marginTop: 20, fontSize: '0.72rem', color: '#64748b', textAlign: 'center', lineHeight: 1.6 }}>
            Evaluations are saved automatically when you score a scenario. Run each level tool to fill in your full Decision Index.
          </div>
        )}

      </div>
    </div>
  );
}
