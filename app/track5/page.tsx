'use client';
// app/track5/page.tsx — Track 5 Decision Dashboard
// Read-only decision scorecard. No input. Data fed in via URL params from tools.
// Entry points: chat (affordability, market analysis), property-intel, future location tool.

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
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
      {/* Track ring — visible but dim */}
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={size * 0.065} />
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
  const stripe = !scored       ? 'rgba(255,255,255,0.08)'
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
          {/* Level number — readable dim label */}
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: '#eaf8f7', marginBottom: 8 }}>
            {num}
          </div>
          <div style={{ position: 'relative', width: 48, height: 48 }}>
            <ScoreRing score={score} size={48} />
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.8rem', fontWeight: 800,
              /* unscored dash uses #94a3b8 so it's visible but clearly inactive */
              color: ringColor ?? '#94a3b8',
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
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4, padding: '2px 6px',
              /* weight badge — clear enough to read */
              color: '#94a3b8',
            }}>{weight}</span>
          </div>
          <div style={{
            fontSize: '0.78rem', lineHeight: 1.65,
            /* scored summary: bright; unscored placeholder: dim but readable */
            color: scored ? '#94a3b8' : '#eaf8f7',
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
              <span style={{ fontSize: '0.62rem', color: '#eaf8f7', whiteSpace: 'nowrap' }}>{score} / 100</span>
            </div>
          )}
        </div>

        {/* CTA */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', padding: '16px 18px 16px 0' }}>
          {comingSoon ? (
            <span style={{
              display: 'inline-block', padding: '8px 14px', borderRadius: 8,
              fontSize: '0.72rem', fontWeight: 700, fontStyle: 'italic',
              background: 'transparent', color: '#eaf8f7',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>Coming Soon</span>
          ) : (
            <a
              href={cta.href} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-block', padding: '8px 14px', borderRadius: 8,
                fontSize: '0.72rem', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
                background: scored ? 'rgba(255,255,255,0.04)' : 'rgba(74,222,128,0.08)',
                color:      scored ? '#eaf8f7'                : '#4ade80',
                border:     scored ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(74,222,128,0.2)',
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
        {/* Track ring — visible but dim */}
        <circle cx={54} cy={54} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={7} />
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
        <span style={{ fontSize: '0.65rem', color: '#eaf8f7', marginTop: 2 }}>/100</span>
      </div>
    </div>
  );
}

// ─── Inner Page ───────────────────────────────────────────────────────────────

function Track5Inner() {
  // ── Hooks — all declared first so sessionData is available before derived values ──
  const params         = useSearchParams();
  const router         = useRouter();
  const { isSignedIn } = useUser();

  const saveAttemptedRef              = useRef(false);
  const [sessionId, setSessionId]     = useState<string | null>(null);
  const [saved,     setSaved]         = useState(false);
  // sessionData: loaded from DB when ?session=<id> is in URL, or after auto-save
  const [sessionData, setSessionData] = useState<Record<string, unknown> | null>(null);

  // ── Clamp helper ──────────────────────────────────────────────────────────
  function clampScore(raw: string | null | undefined): number | null {
    if (!raw) return null;
    const n = Number(raw);
    if (!isFinite(n)) return null;
    return Math.min(100, Math.max(0, Math.round(n)));
  }

  // ── Levels — session data wins over URL params ────────────────────────────
  const levels: Levels = sessionData ? {
    l1: { score: (sessionData.l1_score as number) ?? null, summary: (sessionData.l1_summary as string) ?? null },
    l2: { score: (sessionData.l2_score as number) ?? null, summary: (sessionData.l2_summary as string) ?? null },
    l3: { score: (sessionData.l3_score as number) ?? null, summary: (sessionData.l3_summary as string) ?? null },
    l4: { score: (sessionData.l4_score as number) ?? null, summary: (sessionData.l4_summary as string) ?? null },
  } : {
    l1: { score: clampScore(params?.get('l1_score')), summary: params?.get('l1_summary') ?? null },
    l2: { score: clampScore(params?.get('l2_score')), summary: params?.get('l2_summary') ?? null },
    l3: { score: clampScore(params?.get('l3_score')), summary: params?.get('l3_summary') ?? null },
    l4: { score: clampScore(params?.get('l4_score')), summary: params?.get('l4_summary') ?? null },
  };

  // ── Extract address from l2_summary (Property Evaluation — "ADDR — ...") ──
  // Fall back to l3_summary for backward compatibility with older sessions
  const address = levels.l2.summary?.split(' — ')[0]?.trim()
               ?? levels.l3.summary?.split(' — ')[0]?.trim()
               ?? null;
  const piUrl   = address ? `/property-intel?address=${encodeURIComponent(address)}` : '/property-intel';

  // ── Purchase scenario context — session wins over URL params ─────────────
  const sj       = (sessionData?.scenario_json ?? null) as Record<string, unknown> | null;
  const ctxPrice = (sj?.price as number)   ?? (params?.get('ctx_price') ? Number(params.get('ctx_price')) : null);
  const ctxDp    = (sj?.dp_pct as number)  ?? (params?.get('ctx_dp')    ? Number(params.get('ctx_dp'))    : null);
  const ctxLt    = (sj?.lt as string)      ?? params?.get('ctx_lt')    ?? null;
  const ctxRate  = (sj?.rate as number)    ?? (params?.get('ctx_rate')  ? Number(params.get('ctx_rate'))  : null);
  const ctxPiti  = (sj?.piti as number)    ?? (params?.get('ctx_piti')  ? Number(params.get('ctx_piti'))  : null);
  const hasPurchaseCtx = !!(ctxPrice && ctxLt);

  function fmtK(n: number) {
    if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(2).replace(/\.?0+$/,'')}M`;
    if (n >= 100_000)   return `$${Math.round(n/1000)}K`;
    return `$${n.toLocaleString()}`;
  }
  const ltLabel  = ctxLt === 'jumbo' ? 'Jumbo' : ctxLt === 'fha' ? 'FHA' : ctxLt === 'va' ? 'VA' : 'Conv.';
  // piUrl already set above — used in Homeowner Journey back-links

  const idx       = computeIndex(levels);
  const v         = idx ? verdict(idx.score) : null;
  const scoredN   = Object.values(levels).filter(l => l.score != null).length;
  const weightPct = idx ? Math.round(idx.pct * 100) : 0;

  // ── Effect 1: Load from ?session=<id> — restores all scores + scenario context ──
  useEffect(() => {
    const sid = params?.get('session');
    if (!sid) return;
    fetch(`/api/buyer-sessions/${sid}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.session) {
          setSessionData(d.session);
          setSessionId(d.session.id);
          setSaved(true);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // NOTE: Auto-save from URL params removed — Track 5 is now only reachable from
  // Property Intelligence which saves the session before navigating here.
  // Session always arrives via ?session=<id> (Effect 1 above handles loading).

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
        <div style={{ marginBottom: hasPurchaseCtx ? 16 : 28 }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#f1f5f9', marginBottom: 4 }}>
            Your Buying Decision Score
          </h1>
          <p style={{ fontSize: '0.8rem', color: '#eaf8f7', lineHeight: 1.6 }}>
            Four independent analyses. One clear verdict. Run each tool — your score updates automatically.
          </p>
        </div>

        {/* ── Purchase scenario context bar ── */}
        {hasPurchaseCtx && (
          <div style={{
            background: 'rgba(126,244,244,0.04)', border: '1px solid rgba(126,244,244,0.18)',
            borderRadius: 10, padding: '10px 16px', marginBottom: 24,
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#7ef4f4', flexShrink: 0 }}>
              Scenario
            </span>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#c4cfe0' }}>
              {fmtK(ctxPrice!)} · {ltLabel} · {ctxDp}% down · {ctxRate?.toFixed(2)}% rate{ctxPiti ? ` · ${fmtK(ctxPiti)}/mo PITI` : ''}
            </span>
          </div>
        )}

        {/* ── Saved indicator ── */}
        {saved && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.22)',
            borderRadius: 8, padding: '9px 14px', marginBottom: 16,
          }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4ade80' }}>
              ✓ Evaluation saved
            </span>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>·</span>
            <Link href="/evaluations" style={{
              fontSize: '0.72rem', fontWeight: 600, color: '#4ade80',
              textDecoration: 'underline', textUnderlineOffset: 2,
            }}>
              View My Evaluations →
            </Link>
          </div>
        )}

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
              <div style={{ fontSize: '0.82rem', color: '#eaf8f7', lineHeight: 1.65, marginBottom: 12 }}>
                Based on {scoredN} of 4 levels.{' '}
                {scoredN < 4 ? 'Complete remaining analyses to sharpen your score.' : 'All levels scored.'}
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
                    borderRadius: 6, padding: '3px 8px', color: '#eaf8f7',
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
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14, padding: '24px 28px',
            marginBottom: 8,
          }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>
              No analyses run yet
            </div>
            <div style={{ fontSize: '0.8rem', color: '#eaf8f7', lineHeight: 1.65 }}>
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
            <span style={{ fontSize: '0.6rem', color: '#eaf8f7', whiteSpace: 'nowrap' }}>
              {weightPct}% of index scored
            </span>
          </div>
        )}

        {/* ── Section label ── */}
        <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#eaf8f7', marginBottom: 12 }}>
          4 Decision Levels
        </div>

        {/* ── Level Cards ── */}
        {/* L1 back-link: re-run the scenario in chat */}
        <LevelCard
          num="L1" title="Financial Readiness" weight="35%"
          data={levels.l1}
          cta={{
            label: hasPurchaseCtx ? 'Back to Scenario ↗' : 'Run Scenario ↗',
            href:  hasPurchaseCtx
              ? `/chat?sq=${encodeURIComponent(`Show me a ${ltLabel} purchase payment breakdown for ${fmtK(ctxPrice!)} with ${ctxDp}% down at ${ctxRate?.toFixed(2)}%.`)}`
              : '/chat',
          }}
        />
        {/* L2 back-link: back to check-property (gap analysis, AVM vs list) */}
        <LevelCard
          num="L2" title="Property Evaluation" weight="25%"
          data={levels.l2}
          cta={{
            label: address ? 'Back to Property ↗' : 'Check a Property ↗',
            href:  hasPurchaseCtx
              ? `/check-property?price=${ctxPrice}&dp=${ctxDp}&rate=${ctxRate}&term=30&lt=${ctxLt}${address ? `&address=${encodeURIComponent(address)}` : ''}${sessionId ? `&sid=${sessionId}` : ''}`
              : '/check-property',
          }}
        />
        {/* L3 back-link: back to property-intel (market conditions + comps) */}
        <LevelCard
          num="L3" title="Market Intelligence" weight="25%"
          data={levels.l3}
          cta={{
            label: address ? 'Back to Property Intel ↗' : 'Property Intelligence ↗',
            href:  address ? `${piUrl}${sessionId ? `&sid=${sessionId}` : ''}` : '/property-intel',
          }}
        />
        {/* L4 back-link: back to property-intel (deep analysis unlocks location) */}
        <LevelCard
          num="L4" title="Location Intelligence" weight="15%"
          data={levels.l4}
          cta={{
            label: levels.l4.score != null
              ? (address ? 'Back to Property Intel ↗' : 'Property Intelligence ↗')
              : (address ? 'Run Deep Analysis ↗' : 'Property Intelligence ↗'),
            href: address ? `${piUrl}${sessionId ? `&sid=${sessionId}` : ''}` : '/property-intel',
          }}
        />

        {/* ── Homeowner Journey — back-nav to source cards ── */}
        <div style={{
          marginTop: 24,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12, padding: '16px 18px',
        }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4b6080', marginBottom: 12 }}>
            Homeowner Journey
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {/* 1 — Scenario */}
            <a
              href={hasPurchaseCtx
                ? `/chat?sq=${encodeURIComponent(`Show me a ${ltLabel} purchase payment breakdown for ${fmtK(ctxPrice!)} with ${ctxDp}% down at ${ctxRate?.toFixed(2)}%.`)}`
                : '/chat'}
              style={{ display: 'block', textDecoration: 'none', background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: '12px 12px' }}
            >
              <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#4b6080', marginBottom: 5 }}>Scenario</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#c4cfe0', lineHeight: 1.4, marginBottom: 3 }}>
                {hasPurchaseCtx ? `${ltLabel} ${fmtK(ctxPrice!)}` : 'Run Scenario'}
              </div>
              {hasPurchaseCtx && (
                <div style={{ fontSize: '0.67rem', color: '#4b6080' }}>{ctxDp}% down · {ctxRate?.toFixed(2)}%</div>
              )}
              <div style={{ fontSize: '0.67rem', color: '#4b6080', marginTop: 6 }}>← Back to scenario</div>
            </a>

            {/* 2 — Property Evaluation */}
            <a
              href={hasPurchaseCtx
                ? `/check-property?price=${ctxPrice}&dp=${ctxDp}&rate=${ctxRate}&term=30&lt=${ctxLt}${address ? `&address=${encodeURIComponent(address)}` : ''}${sessionId ? `&sid=${sessionId}` : ''}`
                : '/check-property'}
              style={{ display: 'block', textDecoration: 'none', background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: '12px 12px' }}
            >
              <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#4b6080', marginBottom: 5 }}>Property Evaluation</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#c4cfe0', lineHeight: 1.4, marginBottom: 3 }}>
                {address ? address.split(',')[0] : 'Check Property'}
              </div>
              {address && (
                <div style={{ fontSize: '0.67rem', color: '#4b6080' }}>{address.split(',').slice(1).join(',').trim()}</div>
              )}
              <div style={{ fontSize: '0.67rem', color: '#4b6080', marginTop: 6 }}>← Back to property</div>
            </a>

            {/* 3 — Property Intelligence */}
            <a
              href={address ? `${piUrl}${sessionId ? `&sid=${sessionId}` : ''}` : '/property-intel'}
              style={{ display: 'block', textDecoration: 'none', background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: '12px 12px' }}
            >
              <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#4b6080', marginBottom: 5 }}>Property Intel</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#c4cfe0', lineHeight: 1.4, marginBottom: 3 }}>Full Analysis</div>
              <div style={{ fontSize: '0.67rem', color: '#4b6080' }}>Grok 4 · comps · deep data</div>
              <div style={{ fontSize: '0.67rem', color: '#4b6080', marginTop: 6 }}>← Back to intel</div>
            </a>
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
