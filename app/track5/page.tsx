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
  tooltip?: string; // scoring methodology explanation
}

function LevelCard({ num, title, weight, data, cta, comingSoon, tooltip }: LevelCardProps) {
  const { score, summary } = data;
  const scored = score != null;
  const [tipOpen, setTipOpen] = useState(false);
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
              borderRadius: 4, padding: '2px 6px', color: '#94a3b8',
            }}>{weight}</span>
            {tooltip && (
              <button
                onClick={() => setTipOpen(o => !o)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1,
                  fontSize: '0.7rem', color: tipOpen ? '#2dd4bf' : '#4b6080', transition: 'color .15s' }}
                title="How is this scored?"
              >ⓘ</button>
            )}
          </div>
          {tooltip && tipOpen && (
            <div style={{ marginBottom: 8, padding: '10px 14px', background: 'rgba(20,184,166,0.06)',
              border: '1px solid rgba(20,184,166,0.18)', borderRadius: 8, fontSize: '0.75rem',
              color: '#94a3b8', lineHeight: 1.65 }}>
              {tooltip}
            </div>
          )}
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loanTypeLabel(lt: string | null | undefined): string {
  if (lt === 'fha')   return 'FHA';
  if (lt === 'va')    return 'VA';
  if (lt === 'jumbo') return 'Jumbo';
  return 'Conv.';
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

  // ── Get Matched state ──────────────────────────────────────────────────────
  type MatchState = 'idle' | 'modal' | 'sending' | 'confirmed' | 'matched';
  const [matchState,      setMatchState]      = useState<MatchState>('idle');
  const [matchConsent,    setMatchConsent]    = useState(false);
  const [matchScenarioId, setMatchScenarioId] = useState<string | null>(null);
  const [matchError,      setMatchError]      = useState<string | null>(null);

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

  // ── Extract address — prefer property_address from session (always clean) ──
  // Parsing from summary strings is fragile (old formats, different separators).
  // Use the explicit property_address column as primary source; fall back to
  // summary parsing only when no session is loaded (URL-param mode).
  function extractAddressFromSummary(summary: string | null): string | null {
    if (!summary) return null;
    const part = summary.split(' — ')[0]?.trim() ?? null;
    // Reject if it doesn't look like an address: too long, contains quotes,
    // or doesn't have the structure of a street address.
    if (!part) return null;
    if (part.length > 120) return null;          // descriptions are long
    if (part.includes('"') || part.includes("'")) return null; // quoted = malformed
    if (!part.match(/\d/) && !part.match(/,/)) return null;   // no number or comma
    return part;
  }

  const address =
    // 1. Clean address column from DB session (most reliable)
    ((sessionData?.property_address as string | null)?.trim() || null)
    // 2. l2_summary prefix (current format: "ADDR — PITI ...")
    ?? extractAddressFromSummary(levels.l2.summary)
    // 3. l3_summary prefix (backward compat with older sessions)
    ?? extractAddressFromSummary(levels.l3.summary);

  const piUrl   = address ? `/property-intel?address=${encodeURIComponent(address)}` : '/property-intel';

  // ── Match helpers ──────────────────────────────────────────────────────────
  function extractZip(addr: string): string | null {
    const m = addr.match(/\b(\d{5})(?:-\d{4})?\b/);
    return m ? m[1] : null;
  }
  const matchZip = address ? extractZip(address) : null;

  async function handleMatch() {
    if (!sessionId || !matchConsent) return;
    setMatchState('sending');
    setMatchError(null);
    try {
      const res = await fetch('/api/track5/match', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sessionId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Request failed');
      setMatchScenarioId(d.scenarioId ?? null);
      setMatchState('confirmed');
    } catch (e: unknown) {
      setMatchError(e instanceof Error ? e.message : 'Something went wrong');
      setMatchState('modal'); // bounce back to modal so user can retry
    }
  }

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
          tooltip="Scored from your loan scenario — loan type, down payment %, and LTV. Formula by type: Conventional (LTV ≤80→85, ≤85→78, ≤90→70, >90→60) · FHA (LTV ≤90→72, ≤95→65, >95→58) · VA (LTV ≤80→88, else→78) · Jumbo (LTV ≤75→86, ≤80→80, else→72). This level contributes 35% of your final Decision Score."
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
          tooltip="Grok 4 scores the property against your budget and market comps. Key factors: PITI vs qualified monthly budget (gap %), list price vs Redfin/Zillow AVM (value gap), and days on market positioning. A property that fits your budget and is priced at or below market value scores 80+. This level contributes 25% of your final Decision Score."
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
          tooltip="Grok 4 live web search scores the local market conditions. Key signals: median days on market (longer = buyer's market = higher score), sale-to-list ratio (below 100% = negotiating room), and recent comp velocity. Competitive seller's markets score 30–50; buyer's markets with slow DOM score 70+. This level contributes 25% of your final Decision Score."
          cta={{
            label: address ? 'Back to Property Intel ↗' : 'Property Intelligence ↗',
            href:  address ? `${piUrl}${sessionId ? `&sid=${sessionId}` : ''}` : '/property-intel',
          }}
        />
        {/* L4 back-link: back to property-intel (deep analysis unlocks location) */}
        <LevelCard
          num="L4" title="Location Intelligence" weight="15%"
          data={levels.l4}
          tooltip="Grok 4 deep analysis scores 7 sub-dimensions: Walk Score, Transit Score, Bike Score, Schools (GreatSchools), Safety, Amenities & Commute, and Wildfire Risk. Wildfire risk uses an inverted scale — low score = high danger — and pulls the composite down significantly in high-risk areas. Run Deep Analysis on the Property Intelligence page to unlock this level. Contributes 15% of your final Decision Score."
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

        {/* ── Get Matched section — only when session + address + composite exist ── */}
        {isSignedIn && sessionId && address && idx && matchZip && matchState !== 'matched' && (
          <div style={{
            marginTop: 28,
            background: 'rgba(0,232,122,0.03)',
            border: '1px solid rgba(0,232,122,0.15)',
            borderRadius: 14,
            padding: '22px 22px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
              <div style={{
                width: 44, height: 44, flexShrink: 0,
                background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.22)',
                borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.25rem',
              }}>🎯</div>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f1f5f9', marginBottom: 4, letterSpacing: '-0.02em' }}>
                  Get Matched with a Local Expert
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.55 }}>
                  Share your Decision Score with vetted loan officers in your area. Your name and address stay private — only your score and ZIP are shared at first.
                </div>
              </div>
            </div>

            {/* What gets shared preview */}
            <div style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase' as const, color: '#4b6080' }}>
                What professionals see at match time
              </div>
              {[
                { dot: '#4ade80', label: 'Decision Score', val: `${idx.score} · ${v?.label}` },
                { dot: '#4ade80', label: 'ZIP Code',       val: matchZip },
                { dot: '#4ade80', label: 'Loan scenario',  val: [ctxLt ? loanTypeLabel(ctxLt) : null, ctxPrice ? fmtK(ctxPrice) : null, ctxDp ? `${ctxDp}% down` : null].filter(Boolean).join(' · ') || 'From scenario' },
                { dot: '#f87171', label: 'Full address',   val: null },
                { dot: '#f87171', label: 'Your name & contact', val: null },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: row.dot, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', flex: 1 }}>{row.label}</span>
                  {row.val
                    ? <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#e2e8f0' }}>{row.val}</span>
                    : <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4b6080' }}>🔒 Hidden until you accept</span>
                  }
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'rgba(126,244,244,0.04)', border: '1px solid rgba(126,244,244,0.12)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.73rem', color: '#94a3b8', lineHeight: 1.55 }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>🛡️</span>
              <span>Professionals respond to your score — you stay anonymous. Only after <strong style={{ color: '#e2e8f0' }}>you choose to connect</strong> does your full information get shared.</span>
            </div>

            <button
              onClick={() => { setMatchState('modal'); setMatchConsent(false); setMatchError(null); }}
              style={{ width: '100%', background: '#00e87a', color: '#060d08', border: 'none', borderRadius: 10, padding: '13px 20px', fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              Get Matched →
            </button>
          </div>
        )}

        {/* ── Already matched badge ── */}
        {matchState === 'matched' && (
          <div style={{
            marginTop: 28,
            background: 'rgba(0,232,122,0.04)', border: '1px solid rgba(0,232,122,0.18)',
            borderRadius: 14, padding: '18px 20px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>✅</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#4ade80', marginBottom: 3 }}>Match request sent</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.5 }}>
                Loan officers in <strong style={{ color: '#e2e8f0' }}>ZIP {matchZip}</strong> have been notified. You&apos;ll hear back in your HomeRates inbox.
              </div>
            </div>
            <button
              onClick={() => router.push('/messages')}
              style={{ flexShrink: 0, background: 'rgba(0,232,122,0.08)', border: '1px solid rgba(0,232,122,0.22)', color: '#00e87a', borderRadius: 8, padding: '8px 14px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const }}
            >
              View Inbox →
            </button>
          </div>
        )}

      </div>

      {/* ── Consent Modal ── */}
      {(matchState === 'modal' || matchState === 'sending' || matchState === 'confirmed') && (
        <div
          onClick={e => { if (e.target === e.currentTarget && matchState === 'modal') setMatchState('idle'); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
            zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div style={{
            background: '#0d1117',
            border: '1px solid rgba(0,232,122,0.2)',
            borderRadius: 18,
            width: '100%', maxWidth: 460,
            overflow: 'hidden',
          }}>

            {/* State: consent gate */}
            {matchState === 'modal' && (
              <>
                <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#00e87a', marginBottom: 6 }}>Track 5 · Matching</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em', marginBottom: 5 }}>Connect with a local loan officer</div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.55 }}>Review exactly what gets shared. Your address and identity stay private until you choose to reveal them.</div>
                </div>

                <div style={{ padding: '18px 24px' }}>
                  {/* Score strip */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(0,232,122,0.05)', border: '1px solid rgba(0,232,122,0.15)', borderRadius: 10, padding: '14px 16px', marginBottom: 18 }}>
                    <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
                      <ScoreRing score={idx?.score ?? null} size={52} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.05rem', fontWeight: 900, color: v?.color ?? '#4ade80' }}>
                        {idx?.score ?? '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 800, color: v?.color ?? '#4ade80', marginBottom: 2 }}>{v?.label}</div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{address?.split(',').slice(0, 2).join(',') ?? address} · ZIP {matchZip}</div>
                    </div>
                  </div>

                  {/* Sharing table */}
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase' as const, color: '#4b6080', marginBottom: 8 }}>Shared with matched professionals now</div>
                  <div style={{ marginBottom: 16 }}>
                    {[
                      { icon: '📊', label: 'Decision Score + level breakdown', val: `${idx?.score} / ${v?.label}` },
                      { icon: '📍', label: 'ZIP code',       val: matchZip ?? '' },
                      { icon: '🏠', label: 'Loan scenario',  val: [ctxLt ? loanTypeLabel(ctxLt) : null, ctxPrice ? fmtK(ctxPrice) : null, ctxDp ? `${ctxDp}% dn` : null].filter(Boolean).join(' · ') || 'From scenario' },
                      { icon: '🔒', label: 'Full property address', val: null },
                      { icon: '🔒', label: 'Your name & contact info', val: null },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: '0.85rem', width: 20, textAlign: 'center' as const, flexShrink: 0 }}>{row.icon}</span>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', flex: 1 }}>{row.label}</span>
                        {row.val
                          ? <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#e2e8f0' }}>{row.val}</span>
                          : <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4b6080' }}>Hidden — revealed only if you accept</span>
                        }
                      </div>
                    ))}
                  </div>

                  {/* Reveal timeline */}
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase' as const, color: '#4b6080', marginBottom: 10 }}>How the reveal works</div>
                    {[
                      { n: '1', text: <><strong style={{ color: '#e2e8f0' }}>Now:</strong> ZIP + score + scenario shared. Pro sees your readiness, not who you are.</> },
                      { n: '2', text: <><strong style={{ color: '#e2e8f0' }}>Pro responds:</strong> You get a message in your HomeRates inbox. Still anonymous.</> },
                      { n: '3', text: <><strong style={{ color: '#e2e8f0' }}>You accept:</strong> Full address + contact shared. You stay in control the whole time.</> },
                    ].map(step => (
                      <div key={step.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.22)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 800, color: '#00e87a' }}>{step.n}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.5, paddingTop: 1 }}>{step.text}</div>
                      </div>
                    ))}
                  </div>

                  {/* Consent checkbox */}
                  <div
                    onClick={() => setMatchConsent(c => !c)}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: matchConsent ? 'rgba(0,232,122,0.04)' : 'rgba(255,255,255,0.02)', border: `1.5px solid ${matchConsent ? 'rgba(0,232,122,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s', marginBottom: 16, userSelect: 'none' as const }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${matchConsent ? '#00e87a' : 'rgba(255,255,255,0.2)'}`, background: matchConsent ? '#00e87a' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1, transition: 'all 0.15s' }}>
                      {matchConsent && <span style={{ fontSize: '0.65rem', color: '#060d08', fontWeight: 900 }}>✓</span>}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.55 }}>
                      I understand that my <strong style={{ color: '#e2e8f0' }}>ZIP code, Decision Score, and loan scenario</strong> will be shared with matched professionals. My name, address, and contact info remain private until I choose to connect.
                    </div>
                  </div>

                  {matchError && (
                    <div style={{ fontSize: '0.75rem', color: '#f87171', marginBottom: 12, padding: '8px 12px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8 }}>
                      {matchError}
                    </div>
                  )}
                </div>

                <div style={{ padding: '0 24px 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    onClick={handleMatch}
                    disabled={!matchConsent}
                    style={{ width: '100%', background: '#00e87a', color: '#060d08', border: 'none', borderRadius: 10, padding: '13px 20px', fontSize: '0.9rem', fontWeight: 800, cursor: matchConsent ? 'pointer' : 'default', fontFamily: 'inherit', opacity: matchConsent ? 1 : 0.4, transition: 'opacity 0.15s' }}
                  >
                    Send Match Request →
                  </button>
                  <button
                    onClick={() => setMatchState('idle')}
                    style={{ width: '100%', background: 'transparent', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 20px', fontSize: '0.83rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* State: sending */}
            {matchState === 'sending' && (
              <div style={{ padding: '48px 24px', textAlign: 'center' as const }}>
                <div style={{ width: 44, height: 44, border: '3px solid rgba(0,232,122,0.15)', borderTopColor: '#00e87a', borderRadius: '50%', animation: 't5spin 0.9s linear infinite', margin: '0 auto 16px' }} />
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0', marginBottom: 5 }}>Sending your match request…</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Finding loan officers in ZIP {matchZip}</div>
              </div>
            )}

            {/* State: confirmed */}
            {matchState === 'confirmed' && (
              <div style={{ padding: '40px 24px 32px', textAlign: 'center' as const }}>
                <div style={{ width: 60, height: 60, background: 'rgba(0,232,122,0.1)', border: '2px solid rgba(0,232,122,0.3)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: '1.6rem' }}>✅</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f1f5f9', marginBottom: 6, letterSpacing: '-0.02em' }}>Match request sent</div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.6, marginBottom: 20 }}>
                  Loan officers serving <strong style={{ color: '#e2e8f0' }}>ZIP {matchZip}</strong> have been notified with your score summary. You&apos;ll receive their responses in your HomeRates inbox — you&apos;re still anonymous until you accept.
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px', textAlign: 'left' as const, marginBottom: 20 }}>
                  {[
                    { k: 'Shared with pros', v: `ZIP ${matchZip} · Score ${idx?.score}`, green: true },
                    { k: 'Your identity',    v: '🔒 Still private' },
                    { k: 'Next step',        v: 'Check your inbox for responses' },
                  ].map(row => (
                    <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.75rem' }}>
                      <span style={{ color: '#94a3b8' }}>{row.k}</span>
                      <span style={{ fontWeight: 700, color: row.green ? '#4ade80' : '#e2e8f0' }}>{row.v}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setMatchState('matched')}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '11px 20px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Done — back to my score
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Spinner keyframe ── */}
      <style>{`
        @keyframes t5spin { to { transform: rotate(360deg); } }
      `}</style>
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
