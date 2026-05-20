'use client';
// app/track5/page.tsx — Track 5 Decision Dashboard
// Read-only decision scorecard. No input. Data fed in via URL params from tools.
// Entry points: chat (affordability, market analysis), property-intel, future location tool.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppNav from '../components/AppNav';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LevelData {
  score:   number | null;
  summary: string | null;
}

interface Levels {
  l1: LevelData; // Financial Readiness  35%
  l2: LevelData; // Market Conditions    25%
  l3: LevelData; // Property Value       25%
  l4: LevelData; // Location Intelligence 15%
}

// ─── Weights ─────────────────────────────────────────────────────────────────

const WEIGHTS = { l1: 0.35, l2: 0.25, l3: 0.25, l4: 0.15 };

// ─── Decision Index ───────────────────────────────────────────────────────────

function computeIndex(levels: Levels): { score: number; pct: number } | null {
  let weighted = 0, totalW = 0;
  for (const [k, w] of Object.entries(WEIGHTS) as [keyof Levels, number][]) {
    if (levels[k].score != null) {
      weighted += levels[k].score! * w;
      totalW   += w;
    }
  }
  if (totalW === 0) return null;
  const score = Math.round(weighted / totalW);
  return { score, pct: totalW };
}

function verdict(score: number): { label: string; color: string } {
  if (score >= 85) return { label: 'Strong Buy',        color: '#4ade80' };
  if (score >= 70) return { label: 'Ready to Offer',    color: '#4ade80' };
  if (score >= 55) return { label: 'Buy with Caution',  color: '#fbbf24' };
  if (score >= 40) return { label: 'Watch the Market',  color: '#fbbf24' };
  return               { label: 'Hold Off',             color: '#f87171' };
}

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 48 }: { score: number | null; size?: number }) {
  const r     = size * 0.4;
  const circ  = 2 * Math.PI * r;
  const cx    = size / 2;
  const color = score == null ? 'rgba(255,255,255,0.05)'
              : score >= 70   ? '#4ade80'
              : score >= 50   ? '#fbbf24'
              :                 '#f87171';
  const fill  = score != null ? circ * (score / 100) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'relative' }}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="#1e293b" strokeWidth={size * 0.065} />
      {score != null && (
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={size * 0.065}
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: 'stroke-dasharray 0.8s ease' }} />
      )}
    </svg>
  );
}

// ─── Level Card ───────────────────────────────────────────────────────────────

interface LevelCardProps {
  num:      string;
  title:    string;
  weight:   string;
  data:     LevelData;
  cta:      { label: string; href: string };
  comingSoon?: boolean;
}

function LevelCard({ num, title, weight, data, cta, comingSoon }: LevelCardProps) {
  const { score, summary } = data;
  const scored = score != null;
  const color  = !scored       ? 'rgba(255,255,255,0.06)'
               : score >= 70   ? 'rgba(74,222,128,0.18)'
               : score >= 50   ? 'rgba(251,191,36,0.18)'
               :                 'rgba(248,113,113,0.18)';
  const stripe = !scored       ? 'rgba(255,255,255,0.05)'
               : score >= 70   ? '#4ade80'
               : score >= 50   ? '#fbbf24'
               :                 '#f87171';
  const ringColor = !scored ? undefined
                  : score >= 70 ? '#4ade80'
                  : score >= 50 ? '#fbbf24'
                  : '#f87171';

  return (
    <div style={{
      background: '#0d1117',
      border: `1px solid ${color}`,
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {/* Accent stripe */}
        <div style={{ width: 3, flexShrink: 0, background: stripe }} />

        {/* Score column */}
        <div style={{
          flexShrink: 0, width: 72,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '16px 0',
          borderRight: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: '#334155', marginBottom: 8 }}>
            {num}
          </div>
          <div style={{ position: 'relative', width: 48, height: 48 }}>
            <ScoreRing score={score} size={48} />
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.8rem', fontWeight: 800, color: ringColor ?? '#1e293b',
            }}>
              {score != null ? score : '—'}
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#e2e8f0' }}>{title}</span>
            <span style={{
              fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 4, padding: '2px 6px', color: '#475569',
            }}>{weight}</span>
          </div>
          <div style={{
            fontSize: '0.78rem', lineHeight: 1.65,
            color: scored ? '#94a3b8' : '#1e293b',
            fontStyle: scored ? 'normal' : 'italic',
          }}>
            {summary ?? (scored ? '' : `Not yet analyzed — run the tool to score this level.`)}
          </div>
          {scored && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
              <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${score}%`, borderRadius: 2,
                  background: score >= 70 ? '#4ade80' : score >= 50 ? '#fbbf24' : '#f87171',
                }} />
              </div>
              <span style={{ fontSize: '0.62rem', color: '#334155', whiteSpace: 'nowrap' }}>{score} / 100</span>
            </div>
          )}
        </div>

        {/* CTA */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', padding: '16px 18px 16px 0' }}>
          {comingSoon ? (
            <span style={{
              display: 'inline-block', padding: '8px 14px', borderRadius: 8,
              fontSize: '0.72rem', fontWeight: 700, fontStyle: 'italic',
              background: 'transparent', color: '#1e293b',
              border: '1px solid rgba(255,255,255,0.04)',
            }}>Coming Soon</span>
          ) : (
            <a
              href={cta.href} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-block', padding: '8px 14px', borderRadius: 8,
                fontSize: '0.72rem', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
                background: scored ? 'rgba(255,255,255,0.04)' : 'rgba(74,222,128,0.08)',
                color:      scored ? '#475569'                : '#4ade80',
                border:     scored ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(74,222,128,0.2)',
              }}
            >
              {scored ? 'Re-run ↗' : cta.label}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Decision Index Gauge ─────────────────────────────────────────────────────

function IndexGauge({ score }: { score: number }) {
  const r    = 43;
  const circ = 270; // arc degrees as stroke-dasharray (270° arc)
  const fill = circ * (score / 100);
  const v    = verdict(score);
  return (
    <div style={{ position: 'relative', width: 108, height: 108, flexShrink: 0 }}>
      <svg width={108} height={108} viewBox="0 0 108 108">
        <circle cx={54} cy={54} r={r} fill="none" stroke="#1e293b" strokeWidth={7} />
        <circle cx={54} cy={54} r={r} fill="none" stroke={v.color} strokeWidth={7}
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          transform="rotate(-135 54 54)"
          style={{ transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: '2.1rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em', color: v.color }}>
          {score}
        </span>
        <span style={{ fontSize: '0.65rem', color: '#334155', marginTop: 2 }}>/100</span>
      </div>
    </div>
  );
}

// ─── Inner Page ───────────────────────────────────────────────────────────────

function Track5Inner() {
  const params = useSearchParams();

  // Read scores + summaries from URL params
  const levels: Levels = {
    l1: {
      score:   params?.get('l1_score')   ? Number(params.get('l1_score'))   : null,
      summary: params?.get('l1_summary') ?? null,
    },
    l2: {
      score:   params?.get('l2_score')   ? Number(params.get('l2_score'))   : null,
      summary: params?.get('l2_summary') ?? null,
    },
    l3: {
      score:   params?.get('l3_score')   ? Number(params.get('l3_score'))   : null,
      summary: params?.get('l3_summary') ?? null,
    },
    l4: {
      score:   null, // Coming soon
      summary: null,
    },
  };

  const idx      = computeIndex(levels);
  const v        = idx ? verdict(idx.score) : null;
  const scoredN  = Object.values(levels).filter(l => l.score != null).length;
  const weightPct = idx ? Math.round(idx.pct * 100) : 0;

  return (
    <div className="page-standalone t5-root">
      <style>{`
        .t5-root { background:#080c12; color:#f1f5f9; font-family:var(--font-dm-sans,'DM Sans',system-ui,sans-serif); }
        html:has(.t5-root){ height:auto!important; overflow:visible!important; }
        body:has(.t5-root){ display:block!important; height:auto!important; overflow:visible!important; background:#080c12!important; }
      `}</style>

      <AppNav />

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '2.5rem 1.5rem 6rem' }}>

        {/* ── Page title ── */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#f1f5f9', marginBottom: 4 }}>
            Your Buying Decision Score
          </h1>
          <p style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.6 }}>
            Five independent analyses. One clear verdict. Run each tool — your score updates automatically.
          </p>
        </div>

        {/* ── Decision Index ── */}
        {idx ? (
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14, padding: '24px 28px',
            display: 'flex', alignItems: 'center', gap: 28,
            marginBottom: 8,
          }}>
            <IndexGauge score={idx.score} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: v!.color, letterSpacing: '-0.02em', marginBottom: 5 }}>
                {v!.label}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.65, marginBottom: 12 }}>
                Based on {scoredN} of 4 levels.{' '}
                {scoredN < 4 ? 'Complete remaining analyses to sharpen your score.' : 'All available levels scored.'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  `${scoredN} of 4 levels scored`,
                  `${weightPct}% of index weight`,
                ].map(t => (
                  <div key={t} style={{
                    fontSize: '0.65rem', fontWeight: 600,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 6, padding: '3px 8px', color: '#475569',
                  }}>
                    <span style={{ color: '#94a3b8', fontWeight: 700 }}>{t.split(' ')[0]}</span>
                    {' '}{t.split(' ').slice(1).join(' ')}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            background: '#0d1117',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 14, padding: '24px 28px',
            marginBottom: 8,
          }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
              No analyses run yet
            </div>
            <div style={{ fontSize: '0.8rem', color: '#1e293b', lineHeight: 1.65 }}>
              Run any tool below. Your Decision Index appears here once you have at least one score.
              Each analysis can be run independently — start wherever makes sense for you.
            </div>
          </div>
        )}

        {/* Weight progress bar */}
        {idx && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '12px 0 20px' }}>
            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${weightPct}%`, borderRadius: 2,
                background: 'rgba(74,222,128,0.3)',
                transition: 'width 0.6s ease',
              }} />
            </div>
            <span style={{ fontSize: '0.6rem', color: '#334155', whiteSpace: 'nowrap' }}>
              {weightPct}% of index scored
            </span>
          </div>
        )}

        {/* ── Section label ── */}
        <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#475569', marginBottom: 12 }}>
          4 Decision Levels
        </div>

        {/* ── Level Cards ── */}
        <LevelCard
          num="L1" title="Financial Readiness" weight="35%"
          data={levels.l1}
          cta={{ label: 'Run in Chat ↗', href: '/chat?sq=I+want+to+run+an+affordability+scenario' }}
        />
        <LevelCard
          num="L2" title="Market Conditions" weight="25%"
          data={levels.l2}
          cta={{ label: 'Run in Chat ↗', href: '/chat?sq=Run+a+market+analysis+for+my+area' }}
        />
        <LevelCard
          num="L3" title="Property Value" weight="25%"
          data={levels.l3}
          cta={{ label: 'Analyze Property ↗', href: '/property-intel' }}
        />
        <LevelCard
          num="L4" title="Location Intelligence" weight="15%"
          data={levels.l4}
          cta={{ label: 'Coming Soon', href: '#' }}
          comingSoon
        />

        {/* ── Wealth Monitor ── */}
        <div style={{ marginTop: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{
              fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
              background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)',
              borderRadius: 4, padding: '2px 7px', color: '#60a5fa',
            }}>Ongoing</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#334155' }}>
              Wealth Monitor
            </span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#1e293b', lineHeight: 1.6, marginBottom: 14 }}>
            Not part of your buying score — but essential after you own. Track refi timing, equity position, and market factors impacting your investment.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { icon: '📉', label: 'Refi Intelligence',  sub: 'Current rate vs. your rate. Break-even on a new loan.', link: 'Run in Chat ↗', href: '/chat?sq=Should+I+refinance+my+mortgage+now' },
              { icon: '🏠', label: 'Equity & HELOC',     sub: 'Estimated equity position and HELOC potential.',         link: 'My Properties ↗', href: '/my-home' },
              { icon: '📊', label: 'Market Impact',      sub: 'Local factors affecting your asset value over time.',    link: 'Run in Chat ↗', href: '/chat?sq=How+is+the+real+estate+market+impacting+my+home+value' },
            ].map(tile => (
              <a
                key={tile.label}
                href={tile.href} target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'block', textDecoration: 'none',
                  background: '#0d1117',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 10, padding: '14px 16px',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(96,165,250,0.2)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)')}
              >
                <div style={{ fontSize: '1.1rem', marginBottom: 7 }}>{tile.icon}</div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>{tile.label}</div>
                <div style={{ fontSize: '0.68rem', color: '#1e293b', lineHeight: 1.5 }}>{tile.sub}</div>
                <div style={{ fontSize: '0.65rem', color: '#60a5fa', marginTop: 8, fontWeight: 600 }}>{tile.link}</div>
              </a>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function Track5Page() {
  return (
    <Suspense>
      <Track5Inner />
    </Suspense>
  );
}
