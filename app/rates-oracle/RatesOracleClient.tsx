'use client';
// app/rates-oracle/RatesOracleClient.tsx
// Read-only, personalized companion to /rate-intelligence-engine: takes a saved
// buyer_evaluation_sessions row (?sid=) and visualizes where that scenario's rate
// falls among the real OBMMI segments — the same marketComparison/sortedSegments/
// myRank data RateEngineClient.tsx already computes for Card A-3, just charted
// instead of left as prose. Does NOT write card_fair_par_rate back (that's
// RateEngineClient's job when a user is actively tuning a scenario) — this page
// only reads an already-scored session and visualizes it.

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { LLPAInput, RateCurvePoint, LoanType } from '../../lib/pricing/llpa-engine';
import { resolveObmmiSeriesId } from '../../lib/pricing/llpa-engine';
import { RatesOracleChart } from './RatesOracleChart';

interface EngineResult {
  lenderParRate: number;
  totalLLPA: number;
  rateAnchorSource: 'obmmi' | 'synthetic';
  obmmiSegmentLabel?: string;
  dataSource: string;
  marketComparison?: {
    marketRate: number;
    segmentLabel: string;
    conformingSegments?: { label: string; seriesId: string; rate: number }[];
  };
  parRate: number;
}

interface SessionRow {
  id: string;
  property_address: string;
  composite_score: number | null;
  scenario_json: { price?: number; dp_pct?: number; lt?: LoanType } | null;
}

type EmptyStateKind = 'no-sid' | 'unauthorized' | 'not-found' | 'no-scenario-data';

const DEFAULT_CREDIT_SCORE = 740;

const card: React.CSSProperties = {
  background: '#0e1420', border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 14, padding: '1.5rem',
};
const label: React.CSSProperties = {
  display: 'block', fontSize: '0.7rem', fontWeight: 700,
  letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#8fa3b8', marginBottom: 5,
};
const inp: React.CSSProperties = {
  width: 120, boxSizing: 'border-box' as const,
  padding: '9px 12px', background: '#141b28',
  border: '1px solid rgba(255,255,255,0.09)', borderRadius: 9,
  color: '#f0f4ff', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none',
};

function EmptyState({ kind }: { kind: EmptyStateKind }) {
  const copy: Record<EmptyStateKind, { title: string; body: string; ctaHref: string; ctaLabel: string }> = {
    'no-sid': {
      title: 'This page shows where your rate falls',
      body: "Once you've run a Decision Score scenario, come back here to see how your saved scenario's rate ranks against today's real OBMMI market segments.",
      ctaHref: '/my-home', ctaLabel: '→ Start a scenario',
    },
    unauthorized: {
      title: 'Sign in to see your personalized rate breakdown',
      body: 'This scenario belongs to a signed-in account.',
      ctaHref: '/sign-in', ctaLabel: '→ Sign in',
    },
    'not-found': {
      title: "We couldn't find that scenario",
      body: 'It may have been deleted, or you may not have access to it.',
      ctaHref: '/my-home', ctaLabel: '→ Start a new scenario',
    },
    'no-scenario-data': {
      title: "This scenario doesn't have loan details saved yet",
      body: 'Run a Decision Score scenario with a home price and down payment first.',
      ctaHref: '/my-home', ctaLabel: '→ Go to My Home',
    },
  };
  const c = copy[kind];
  return (
    <div style={{ ...card, textAlign: 'center' as const, padding: '3rem 2rem' }}>
      <div style={{ fontSize: '2rem', marginBottom: 12 }}>🔮</div>
      <div style={{ fontWeight: 700, color: '#f0f4ff', marginBottom: 8 }}>{c.title}</div>
      <div style={{ fontSize: '0.875rem', color: '#8fa3b8', maxWidth: 420, margin: '0 auto 18px' }}>{c.body}</div>
      <a href={c.ctaHref} style={{ color: '#00e87a', fontSize: '0.875rem', fontWeight: 700, textDecoration: 'none' }}>
        {c.ctaLabel}
      </a>
    </div>
  );
}

export default function RatesOracleClient() {
  const params = useSearchParams();
  const sid = params?.get('sid') ?? null;

  const [session, setSession] = useState<SessionRow | null>(null);
  const [emptyState, setEmptyState] = useState<EmptyStateKind | null>(sid ? null : 'no-sid');
  const [creditScore, setCreditScore] = useState(DEFAULT_CREDIT_SCORE);
  const [creditScoreDraft, setCreditScoreDraft] = useState(String(DEFAULT_CREDIT_SCORE));

  const [result, setResult] = useState<EngineResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the saved session once on mount.
  useEffect(() => {
    if (!sid) return;
    fetch(`/api/buyer-sessions/${sid}`)
      .then(async r => {
        if (r.status === 401) { setEmptyState('unauthorized'); return; }
        if (r.status === 404) { setEmptyState('not-found'); return; }
        if (!r.ok) { setEmptyState('not-found'); return; }
        const { session: row } = await r.json();
        const sj = row?.scenario_json;
        if (!sj || typeof sj.price !== 'number' || typeof sj.dp_pct !== 'number') {
          setEmptyState('no-scenario-data');
          return;
        }
        setSession(row);
      })
      .catch(() => setEmptyState('not-found'));
  }, [sid]);

  const runCalc = useCallback(async (score: number) => {
    if (!session?.scenario_json) return;
    const { price, dp_pct, lt } = session.scenario_json as { price: number; dp_pct: number; lt?: LoanType };
    const loanAmount = Math.round(price * (1 - dp_pct / 100));
    const ltv = parseFloat((100 - dp_pct).toFixed(2));
    const loanType: LoanType = lt ?? 'conventional';

    const body: LLPAInput & { loanType: LoanType } = {
      creditScore: score,
      ltv,
      occupancy: 'primary',
      loanPurpose: 'purchase',
      propertyType: 'sfr',
      loanAmount,
      lockDays: 30,
      loanType,
    };

    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/rate-intelligence-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? 'Calculation failed'); return; }
      setResult(data);
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) runCalc(creditScore);
    // Only re-run when the session first loads or credit score changes explicitly (button/blur), not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (emptyState) return <EmptyState kind={emptyState} />;
  if (!session) {
    return (
      <div style={{ ...card, textAlign: 'center' as const, padding: '3rem 2rem', color: '#8fa3b8' }}>
        Loading your scenario…
      </div>
    );
  }

  const loanType: LoanType = (session.scenario_json?.lt as LoanType) ?? 'conventional';
  const marketComparison = result?.marketComparison;
  const mySegmentId = marketComparison && loanType === 'conventional'
    ? resolveObmmiSeriesId('conventional', creditScore, parseFloat((100 - (session.scenario_json?.dp_pct ?? 20)).toFixed(2)))
    : null;
  const sortedSegments = marketComparison?.conformingSegments
    ? [...marketComparison.conformingSegments].sort((a, b) => a.rate - b.rate)
    : null;
  const myRank = sortedSegments && mySegmentId
    ? sortedSegments.findIndex(s => s.seriesId === mySegmentId) + 1
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: '0.68rem', color: '#8fa3b8', textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>
              Personalized for your saved scenario
            </div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#f0f4ff' }}>{session.property_address}</div>
          </div>
          {session.composite_score != null && (
            <div style={{
              padding: '8px 16px', borderRadius: 10, background: 'rgba(0,232,122,0.08)',
              border: '1px solid rgba(0,232,122,0.28)', textAlign: 'center' as const,
            }}>
              <div style={{ fontSize: '0.62rem', color: 'rgba(0,232,122,0.7)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontWeight: 700 }}>
                Decision Score
              </div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#4ade80' }}>{session.composite_score}</div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 18, display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div>
            <label style={label}>Credit score</label>
            <input
              type="text" inputMode="numeric" style={inp}
              value={creditScoreDraft}
              onChange={e => setCreditScoreDraft(e.target.value.replace(/\D/g, '').slice(0, 3))}
              onBlur={() => {
                const n = parseInt(creditScoreDraft, 10);
                const clamped = Number.isFinite(n) ? Math.min(850, Math.max(580, n)) : DEFAULT_CREDIT_SCORE;
                setCreditScore(clamped);
                setCreditScoreDraft(String(clamped));
                runCalc(clamped);
              }}
            />
          </div>
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#8fa3b8', lineHeight: 1.5, maxWidth: 340 }}>
            Estimated at 740 by default — your saved scenario doesn't record a credit score.
            Adjust to your exact number for a precise ranking.
          </p>
        </div>
      </div>

      {loading && (
        <div style={{ ...card, textAlign: 'center' as const, color: '#8fa3b8' }}>Calculating…</div>
      )}
      {error && (
        <div style={{ ...card, color: '#f87171' }}>{error}</div>
      )}

      {result && !loading && (
        <div style={card}>
          <RatesOracleChart
            segments={loanType === 'conventional' ? sortedSegments : null}
            mySegmentId={mySegmentId}
            myRank={myRank}
            flagshipRate={loanType !== 'conventional' ? marketComparison?.marketRate ?? null : null}
            flagshipLabel={loanType !== 'conventional' ? (result.obmmiSegmentLabel ?? loanType.toUpperCase()) : null}
            parRate={loanType !== 'conventional' ? result.parRate : null}
          />
          <p style={{ margin: '14px 0 0', fontSize: '0.72rem', color: '#8fa3b8', lineHeight: 1.5 }}>
            {result.dataSource}
          </p>
        </div>
      )}
    </div>
  );
}
