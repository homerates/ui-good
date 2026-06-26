'use client';
// app/track5/page.tsx — Track 5 Decision Dashboard
// Read-only decision scorecard. No input. Data fed in via URL params from tools.
// Entry points: chat (affordability, market analysis), property-intel, future location tool.

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import ConsumerNav from '../components/ConsumerNav';

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
  // L5 Rate Intelligence — read from session row (card_fair_par_rate), set after rate engine writes back
  const rieResult = typeof (sessionData?.card_fair_par_rate as number | null | undefined) === 'number'
    ? { lenderParRate: sessionData!.card_fair_par_rate as number }
    : null;

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
    // 2. Explicit ?address= param — passed by DSC fallback URL when no session
    ?? (params?.get('address')?.trim() || null)
    // 3. l2_summary prefix (property-intel format: "ADDR — ...")
    ?? extractAddressFromSummary(levels.l2.summary)
    // 4. l3_summary prefix (backward compat)
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
        // Send composite from UI state as fallback for race where DB session hasn't been updated yet
        body:    JSON.stringify({
          sessionId,
          composite:    idx?.score ?? null,
          fairParRate:  rieResult?.lenderParRate ?? null,
          fairParCounty: (sessionData?.county as string | null) ?? null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        // 409 active_match_exists — user already has an active post for this property ZIP;
        // treat it like a successful match so the UI shows the "already matched" state
        if (res.status === 409 && d.error === 'active_match_exists') {
          setMatchState('matched');
          if (sessionId && typeof window !== 'undefined') {
            try { localStorage.setItem(`t5m_${sessionId}`, '1'); } catch {}
          }
          return;
        }
        throw new Error(d.message ?? d.error ?? 'Request failed');
      }
      setMatchScenarioId(d.scenarioId ?? null);
      setMatchState('confirmed');
      // Persist so returning to the page doesn't show Get Matched again
      if (sessionId && typeof window !== 'undefined') {
        const t5key = `t5m_${sessionId}`;
        try {
          localStorage.setItem(t5key, '1');
        } catch {
          // localStorage full — evict property intel blobs and retry
          try {
            Object.keys(localStorage)
              .filter(k => k.startsWith('pi_v1_') || k.startsWith('pi_sid_'))
              .forEach(k => localStorage.removeItem(k));
            localStorage.setItem(t5key, '1');
          } catch {
            // Still no space — sessionStorage is enough for this tab
            try { sessionStorage.setItem(t5key, '1'); } catch {}
          }
        }
      }
    } catch (e: unknown) {
      setMatchError(e instanceof Error ? e.message : 'Something went wrong');
      setMatchState('modal'); // bounce back to modal so user can retry
    }
  }

  // ── Purchase scenario context — session wins over URL params ─────────────
  const sj       = (sessionData?.scenario_json ?? null) as Record<string, unknown> | null;
  const ctxPrice = (sj?.price as number)   ?? (params?.get('ctx_price') ? Number(params.get('ctx_price')) : null);
  const ctxLt    = (sj?.lt as string)      ?? params?.get('ctx_lt')    ?? null;
  const ctxPiti  = (sj?.piti as number)    ?? (params?.get('ctx_piti')  ? Number(params.get('ctx_piti'))  : null);

  // sc_* override params — passed from DecisionScoreCard after ISC adjustment.
  // These take priority over the original session's scenario_json so that back-links
  // to property-intel (and scenario display) reflect the user's adjusted scenario,
  // not the original 20%-down values stored in the DB session.
  const scDown   = params?.get('sc_down')   != null ? Number(params.get('sc_down'))   : null;
  const scRate   = params?.get('sc_rate')   != null ? Number(params.get('sc_rate'))   : null;
  const scIncome = params?.get('sc_income') != null ? Number(params.get('sc_income')) : null;
  const scDebt   = params?.get('sc_debt')   != null ? Number(params.get('sc_debt'))   : null;
  const ctxDp    = scDown  ?? (sj?.dp_pct as number)  ?? (params?.get('ctx_dp')    ? Number(params.get('ctx_dp'))    : null);
  const ctxRate  = scRate  ?? (sj?.rate as number)    ?? (params?.get('ctx_rate')  ? Number(params.get('ctx_rate'))  : null);
  const hasPurchaseCtx = !!(ctxPrice && ctxLt);

  // piUrlS: property-intel URL with sc_* scenario override params appended so that
  // "Back to Property Intel" back-links preserve the adjusted scenario all the way
  // through to Build Report (not the original 20%-down DB session values)
  const piUrlS = (() => {
    if (!address) return '/property-intel';
    const parts: string[] = [`address=${encodeURIComponent(address)}`];
    if (scDown   != null) parts.push(`down=${scDown}`);
    if (scRate   != null) parts.push(`rate=${scRate.toFixed(3)}`);
    if (scIncome != null && scIncome > 0) parts.push(`income=${Math.round(scIncome)}`);
    if (scDebt   != null && scDebt   > 0) parts.push(`debt=${Math.round(scDebt)}`);
    return `/property-intel?${parts.join('&')}`;
  })();

  function fmtK(n: number) {
    if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(2).replace(/\.?0+$/,'')}M`;
    if (n >= 100_000)   return `$${Math.round(n/1000)}K`;
    return `$${n.toLocaleString()}`;
  }
  const ltLabel  = ctxLt === 'jumbo' ? 'Jumbo' : ctxLt === 'fha' ? 'FHA' : ctxLt === 'va' ? 'VA' : 'Conv.';
  // piUrl already set above — used in Homeowner Journey back-links

  const idx       = computeIndex(levels);
  const v         = idx ? verdict(idx.score) : null;
  const scoredN   = Object.values(levels).filter(l => l.score != null).length + (rieResult != null ? 1 : 0);
  const weightPct = idx ? Math.round(idx.pct * 100) : 0;

  // ── Effect 1: Load from ?session=<id> — restores all scores + scenario context ──
  useEffect(() => {
    const sid = params?.get('session');
    if (!sid) return;
    // Restore matched state from localStorage (or sessionStorage fallback) so returning users can't re-submit
    if (typeof window !== 'undefined' &&
        (localStorage.getItem(`t5m_${sid}`) === '1' || sessionStorage.getItem(`t5m_${sid}`) === '1')) {
      setMatchState('matched');
    }
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

  // ── Effect 2: URL-params fallback — look up OR create session ───────────
  // When arriving via ?l1_score=...&address=... (no ?session=), the DSC card
  // in chat didn't have a session ID — typically a timing race where the
  // openBuyerChat async session creation hadn't stored the ID in localStorage.
  // 1. Try to find an existing session by address.
  // 2. If none found, create one from URL params so Get Matched works.
  const sessionLookupDoneRef = useRef(false);
  useEffect(() => {
    if (!isSignedIn) return;
    if (sessionId) return;                // Effect 1 already resolved a session
    if (params?.get('session')) return;   // Effect 1 will handle it
    if (!address) return;
    if (sessionLookupDoneRef.current) return;
    sessionLookupDoneRef.current = true;

    const applySession = (s: Record<string, unknown>) => {
      setSessionId(s.id as string);
      setSessionData(prev => prev ?? s);
      setSaved(true);
      if (typeof window !== 'undefined' &&
          (localStorage.getItem(`t5m_${s.id}`) === '1' ||
           sessionStorage.getItem(`t5m_${s.id}`) === '1')) {
        setMatchState('matched');
      }
    };

    fetch(`/api/buyer-sessions?address=${encodeURIComponent(address)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.session?.id) { applySession(d.session); return; }
        // No existing session — create one from URL params so Get Matched is usable
        const body: Record<string, unknown> = { property_address: address };
        if (levels.l1.score != null) { body.l1_score = levels.l1.score; body.l1_summary = levels.l1.summary; }
        if (levels.l2.score != null) { body.l2_score = levels.l2.score; body.l2_summary = levels.l2.summary; }
        if (levels.l3.score != null) { body.l3_score = levels.l3.score; body.l3_summary = levels.l3.summary; }
        if (levels.l4.score != null) { body.l4_score = levels.l4.score; body.l4_summary = levels.l4.summary; }
        return fetch('/api/buyer-sessions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
          .then(r => r.ok ? r.json() : null)
          .then(d2 => { if (d2?.session?.id) applySession(d2.session); });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, address]);

  return (
    <div className="page-standalone t5-root">
      <style>{`
        .t5-root { background:#080c12; color:#f1f5f9; font-family:var(--font-dm-sans,'DM Sans',system-ui,sans-serif); }
        html:has(.t5-root){ height:auto!important; overflow:visible!important; }
        body:has(.t5-root){ display:block!important; height:auto!important; overflow:visible!important; background:#080c12!important; }
      `}</style>

      <ConsumerNav fullNav />

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
                Based on {scoredN} of 5 levels.{' '}
                {scoredN < 5 ? 'Complete remaining analyses to sharpen your score.' : 'All levels scored.'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  `${scoredN} of 5 levels scored`,
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
          5 Decision Levels
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
            href:  address ? `${piUrlS}${sessionId ? `&sid=${sessionId}` : ''}` : '/property-intel',
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
            href: address ? `${piUrlS}${sessionId ? `&sid=${sessionId}` : ''}` : '/property-intel',
          }}
        />

        {/* L5 Rate Intelligence — purple accent, decoded rate from localStorage */}
        <div style={{
          background: '#0d1117',
          border: `1px solid ${rieResult ? 'rgba(167,139,250,0.25)' : 'rgba(255,255,255,0.06)'}`,
          borderRadius: 12, overflow: 'hidden', marginBottom: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            <div style={{ width: 3, flexShrink: 0, background: rieResult ? 'rgba(167,139,250,0.6)' : 'rgba(255,255,255,0.08)' }} />
            <div style={{
              flexShrink: 0, width: 72, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', padding: '16px 0',
              borderRight: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: rieResult ? 'rgba(167,139,250,0.8)' : '#eaf8f7', marginBottom: 8 }}>L5</div>
              <div style={{ position: 'relative', width: 48, height: 48 }}>
                <svg width={48} height={48} viewBox="0 0 48 48">
                  <circle cx={24} cy={24} r={19.2} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={3.1} />
                  {rieResult && (
                    <circle cx={24} cy={24} r={19.2} fill="none"
                      stroke="rgba(167,139,250,0.7)" strokeWidth={3.1}
                      strokeDasharray={`${2 * Math.PI * 19.2} 0`}
                      strokeLinecap="round" transform="rotate(-90 24 24)" />
                  )}
                </svg>
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: rieResult ? '0.55rem' : '0.8rem', fontWeight: 800,
                  color: rieResult ? 'rgba(167,139,250,0.9)' : '#94a3b8',
                }}>
                  {rieResult ? `${rieResult.lenderParRate.toFixed(2)}%` : '—'}
                </div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#e2e8f0' }}>Rate Intelligence</span>
                <span style={{
                  fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em',
                  background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)',
                  borderRadius: 4, padding: '2px 6px', color: 'rgba(167,139,250,0.7)',
                }}>LLPA</span>
              </div>
              <div style={{
                fontSize: '0.78rem', lineHeight: 1.65,
                color: rieResult ? '#94a3b8' : '#eaf8f7',
                fontStyle: rieResult ? 'normal' : 'italic',
              }}>
                {rieResult
                  ? `${rieResult.lenderParRate.toFixed(3)}% fair par rate decoded — use this as your lender benchmark.`
                  : 'Not yet decoded — run Rate Intelligence to reveal your LLPA-adjusted fair par rate.'}
              </div>
            </div>
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', padding: '16px 18px 16px 0' }}>
              <a
                href={`/rate-intelligence-engine${sessionId ? `?sid=${sessionId}` : ''}`}
                style={{
                  display: 'inline-block', padding: '8px 14px', borderRadius: 8,
                  fontSize: '0.72rem', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
                  background: 'rgba(167,139,250,0.08)',
                  color: 'rgba(167,139,250,0.9)',
                  border: '1px solid rgba(167,139,250,0.2)',
                }}
              >
                {rieResult ? 'Re-decode ↗' : 'Decode your rate ↗'}
              </a>
            </div>
          </div>
        </div>

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
              href={address ? `${piUrlS}${sessionId ? `&sid=${sessionId}` : ''}` : '/property-intel'}
              style={{ display: 'block', textDecoration: 'none', background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: '12px 12px' }}
            >
              <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#4b6080', marginBottom: 5 }}>Property Intel</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#c4cfe0', lineHeight: 1.4, marginBottom: 3 }}>Full Analysis</div>
              <div style={{ fontSize: '0.67rem', color: '#4b6080' }}>Grok 4 · comps · deep data</div>
              <div style={{ fontSize: '0.67rem', color: '#4b6080', marginTop: 6 }}>← Back to intel</div>
            </a>
          </div>
        </div>

        {/* ── Get Matched section — shown when session + address + composite exist (ZIP not required) ── */}
        {/* ── Get Matched / Already Matched — single anchor wrapper so #get-matched always scrolls here ── */}
        {isSignedIn && sessionId && address && idx && (
          <div id="get-matched">
            {matchState !== 'matched' ? (
              /* ── Fresh — show Get Matched form ── */
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
                      Share your Decision Score with loan officers in your area. Your name and address stay private — only your score and ZIP are shared at first.
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
                    ...(rieResult ? [{ dot: '#a78bfa', label: 'Rate Intelligence', val: `${rieResult.lenderParRate.toFixed(3)}% fair par · L5 decoded` }] : []),
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
            ) : (
              /* ── Already matched — tell user this scenario was already posted ── */
              <div style={{
                marginTop: 28,
                background: 'rgba(0,232,122,0.04)', border: '1px solid rgba(0,232,122,0.18)',
                borderRadius: 14, padding: '18px 20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                  <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>✅</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#4ade80', marginBottom: 3 }}>You already have an active match request for this property</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.5 }}>
                      Loan officers in <strong style={{ color: '#e2e8f0' }}>ZIP {matchZip}</strong> were already notified — posting again would be a duplicate. Check your inbox for their responses.
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/messages')}
                  style={{ width: '100%', background: 'rgba(0,232,122,0.08)', border: '1px solid rgba(0,232,122,0.22)', color: '#00e87a', borderRadius: 10, padding: '10px 20px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Check your inbox for responses →
                </button>
              </div>
            )}
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
            display: 'flex', flexDirection: 'column',
            maxHeight: 'calc(100vh - 48px)',
            overflow: 'hidden',
          }}>

            {/* State: consent gate */}
            {matchState === 'modal' && (
              <>
                <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#00e87a', marginBottom: 6 }}>Track 5 · Matching</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em', marginBottom: 5 }}>Connect with a local loan officer</div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.55 }}>Review exactly what gets shared. Your address and identity stay private until you choose to reveal them.</div>
                </div>

                <div style={{ padding: '18px 24px', overflowY: 'auto', flex: 1 }}>
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

                <div style={{ padding: '12px 24px 22px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
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
