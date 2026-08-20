"use client";
// app/rate-intelligence-engine/RateEngineClient.tsx
// Interactive form + 4 output cards: A-1 Rate Range · A-2 LLPA Breakdown · B-2 Rate Options · B-1 Negotiation Brief
// + Rate marketplace table below results

import { useState, useCallback, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import type { LLPAInput, RateCurvePoint } from "../../lib/pricing/llpa-engine";
import { resolveObmmiSeriesId } from "../../lib/pricing/llpa-engine";
import type { LoanType } from "../../lib/pricing/marketplace-engine";
import RateMarketplaceTable from "../components/RateMarketplaceTable";
import {
  HIGH_COST_COUNTIES,
  HIGH_COST_STATES,
  NATIONAL_CONFORMING_BASELINE,
} from "../../lib/loanLimitsNational2026";
import { CA_LOAN_LIMITS_2026 } from "../../lib/loanLimits2026";
import { scoreL5 } from "../../lib/scoring/decisionScore";

// ─── Types for API response ────────────────────────────────────────────────────

interface EngineResult {
  parRate: number;
  lenderParRate: number;
  totalLLPA: number;
  totalLLPADollars: number;
  rateEquivalent: number;
  breakdown: { label: string; points: number }[];
  rateCurve: RateCurvePoint[];
  recommendedCurvePoint: { point: RateCurvePoint; reasoning: string };
  negotiationBrief: string[];
  conformingStatus: 'standard' | 'high_balance' | 'above_limit';
  conformingBaseline: number;
  highBalanceCeiling: number;
  isHighCostState: boolean;
  stateName: string;
  dataSource: string;
  disclaimer: string;
  rateAnchorSource: 'obmmi' | 'synthetic';
  obmmiSegmentLabel?: string;
  // "Where does your rate fall?" Seam 1 (data plumbing) -- absent for dscr
  // (synthetic path, no real OBMMI data to compare against).
  marketComparison?: {
    marketRate: number;
    segmentLabel: string;
    conformingSegments?: { label: string; seriesId: string; rate: number }[];
    /** True only for jumbo's estimated segment table -- absent/falsy for real conforming segments. */
    estimated?: boolean;
  };
  /** Jumbo only -- see lib/pricing/jumboEstimate.ts. Transparency data for the estimate disclaimer below. */
  jumboEstimate?: {
    baseSource: 'real-jumbo' | 'conforming-plus-spread';
    spreadUsed: number | null;
    spreadSource: 'live-trailing' | 'hardcoded-fallback' | null;
    adjustmentDelta: number;
    conformingRate: number | null;
    clamped: boolean;
  };
}

// ─── Default inputs ────────────────────────────────────────────────────────────

// loanType is tracked as its own piece of component state (see `loanType`
// below), not part of this form-fields group -- merged in separately when
// building the request body.
const DEFAULTS: Omit<LLPAInput, 'loanType'> = {
  creditScore: 740,
  ltv: 80,
  occupancy: "primary",
  loanPurpose: "purchase",
  propertyType: "sfr",
  loanAmount: 450_000,
  lockDays: 30,
};

// ─── Credit bucket label helper ───────────────────────────────────────────────

function creditBucketLabel(score: number): string {
  if (score < 620)  return "< 620 (below min)";
  if (score <= 639) return "620–639 (fair)";
  if (score <= 659) return "640–659 (fair)";
  if (score <= 679) return "660–679 (fair-good)";
  if (score <= 699) return "680–699 (good)";
  if (score <= 719) return "700–719 (good)";
  if (score <= 739) return "720–739 (very good)";
  if (score <= 759) return "740–759 (very good)";
  return "760+ (excellent)";
}

// ─── Format / parse helpers ───────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function parseNum(s: string): number {
  return parseFloat(s.replace(/[$,%\s]/g, '').replace(/,/g, '')) || 0;
}

function fmt$(n: number): string {
  return "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// "Where does your rate fall?" -- plain sanity check, not a compliance
// requirement. 2-15% comfortably covers every realistic current mortgage
// product (including higher-risk DSCR/non-QM) while catching fat-finger
// entry (0.5%, 25%, or "690" meant as "6.90"). Empty input is valid (no
// comparison shown, not an error) since this field is optional.
function validateQuotedRate(raw: string): { value: number | null; error: string | null } {
  const trimmed = raw.trim();
  if (trimmed === '') return { value: null, error: null };
  const n = parseNum(trimmed);
  if (!n || Number.isNaN(n)) return { value: null, error: "Enter a rate, e.g. 6.875" };
  if (n > 20) return { value: null, error: `${n} isn't a realistic mortgage rate — did you mean ${(n / 100).toFixed(3)}%?` };
  if (n < 2 || n > 15) return { value: null, error: "Enter a realistic mortgage rate between 2% and 15%" };
  return { value: n, error: null };
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RateEngineClient() {
  const params = useSearchParams();
  const { isSignedIn } = useUser();

  // Parse scenario URL params (set by DSC "🔬 Run Rate Intelligence" or ISC CTA)
  const paramPrice   = params?.get('price')     ? Number(params.get('price'))    : null;
  const paramDownPct = params?.get('downPct')   ? Number(params.get('downPct'))  : null;
  const paramPurpose = (params?.get('purpose')   ?? null) as LLPAInput['loanPurpose'] | null;
  const paramOcc     = (params?.get('occupancy') ?? null) as LLPAInput['occupancy']   | null;
  const paramLT      = (params?.get('lt')        ?? null) as LoanType | null;
  const paramSt      = params?.get('st') ?? null;

  // Derived initial values — used to seed useState once on mount
  const initPrice    = paramPrice ?? 562_500;
  const initDownPct  = paramDownPct ?? 20;
  const initDown     = Math.round(initPrice * initDownPct / 100);
  const initLoan     = initPrice - initDown;
  const initLTV      = parseFloat(((initLoan / initPrice) * 100).toFixed(2));

  const [inputs, setInputs] = useState<Omit<LLPAInput, 'loanType'>>(() => ({
    ...DEFAULTS,
    loanAmount: Math.round(initLoan),
    ltv:        initLTV,
    loanPurpose: paramPurpose ?? DEFAULTS.loanPurpose,
    occupancy:   paramOcc    ?? DEFAULTS.occupancy,
  }));
  const [homePrice,   setHomePrice]   = useState(initPrice);
  const [downPayment, setDownPayment] = useState(initDown);
  const [state, setState] = useState(paramSt ?? "CA");
  const [loanType, setLoanType] = useState<LoanType>(paramLT ?? "conventional");
  const [result, setResult] = useState<EngineResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // "Where does your rate fall?" -- pure client-side comparison against data
  // already in `result`, no recalculation needed. Draft string state matches
  // the priceDraft/downDraft/scoreDraft pattern used elsewhere in this file.
  const [quotedRateDraft, setQuotedRateDraft] = useState('');
  const [quotedRateError, setQuotedRateError] = useState<string | null>(null);

  const [downMode, setDownMode] = useState<'%' | '$'>('%');

  const [priceDraft, setPriceDraft] = useState(fmtCurrency(initPrice));
  const [downDraft,  setDownDraft]  = useState(String(initDownPct));  // start in % mode
  const [scoreDraft, setScoreDraft] = useState(String(DEFAULTS.creditScore));

  // County selector — derived from FHFA data files, same as /loan-limits page
  const paramSid    = params?.get('sid')    ?? null;
  const paramCounty = params?.get('county') ?? null;
  const [county, setCounty] = useState<string>(
    paramCounty ? paramCounty.toUpperCase().replace(/\s+COUNTY$/i, '').trim() : ''
  );
  const [countyFromZip, setCountyFromZip] = useState(!!paramCounty);
  const paramZip = params?.get('zip') ?? null;

  // Auto-resolve ZIP → county only when county wasn't already passed in the URL
  useEffect(() => {
    if (!paramZip || paramCounty) return;
    fetch(`/api/zip-county-lookup?zip=${paramZip}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && !d.notFound && d.county) {
          // Normalise county name to match the FHFA options list (all-caps, no suffix)
          const raw = (d.county as string).toUpperCase().replace(/\s+COUNTY$/i, '').trim();
          setCounty(raw);
          setCountyFromZip(true);
        }
      })
      .catch(() => {});
  // Only run on initial mount — paramZip from URL is fixed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Session carry-through — hard rule: whenever a session's scenario data is
  // already known (price, down %, loan type, property address), landing on
  // this page via ?sid= alone (e.g. Track 5's "Decode your rate" CTA, which
  // passes only sid) must auto-fill from it rather than falling back to
  // generic defaults. Skipped when explicit scenario params are already in
  // the URL (paramPrice etc. above) — those already prefill correctly and
  // take priority over a session fetch.
  const [sessionPrefilled, setSessionPrefilled] = useState(false);
  const [stateFromSession, setStateFromSession] = useState(false);
  useEffect(() => {
    if (!paramSid || paramPrice != null) return;
    fetch(`/api/buyer-sessions/${paramSid}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const row = d?.session;
        if (!row) return;
        const sj = row.scenario_json as { price?: number; dp_pct?: number; lt?: LoanType } | null | undefined;
        if (sj && typeof sj.price === 'number' && typeof sj.dp_pct === 'number') {
          const price = sj.price;
          const down  = Math.round(price * sj.dp_pct / 100);
          setHomePrice(price);
          setDownPayment(down);
          setPriceDraft(fmtCurrency(price));
          setDownDraft(String(sj.dp_pct));
          syncLTV(price, down);
          if (sj.lt) setLoanType(sj.lt);
          setSessionPrefilled(true);
        }
        // Resolve state + county from the session's property address —
        // same zip→county lookup the ?zip= path above already uses — when
        // no explicit ?st=/?zip=/?county= was passed.
        const addr = row.property_address as string | undefined;
        const m = !paramSt && addr ? addr.match(/,\s*([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?\s*$/) : null;
        if (m) {
          setState(m[1].toUpperCase());
          setStateFromSession(true);
          if (!paramZip && !paramCounty) {
            fetch(`/api/zip-county-lookup?zip=${m[2]}`)
              .then(r => r.ok ? r.json() : null)
              .then(cd => {
                if (cd && !cd.notFound && cd.county) {
                  setCounty((cd.county as string).toUpperCase().replace(/\s+COUNTY$/i, '').trim());
                  setCountyFromZip(true);
                }
              })
              .catch(() => {});
          }
        }
      })
      .catch(() => {});
  // Only run on initial mount — paramSid/paramPrice/paramSt/paramZip/paramCounty are fixed from the URL
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // True whenever price/down are non-default — whether from explicit URL
  // params (chat, DecisionScoreCard) or a session fetch (bare ?sid= links
  // like Track 5's "Decode your rate") — both mean these aren't defaults.
  const fromScenario = paramPrice != null || sessionPrefilled;

  // Sync loan amount / LTV from home price + down payment
  function syncLTV(price: number, down: number) {
    const loan = Math.max(price - down, 1);
    const ltv  = Math.min(((price - down) / price) * 100, 97);
    setInputs(prev => ({ ...prev, loanAmount: Math.round(loan), ltv: parseFloat(ltv.toFixed(2)) }));
  }

  function setPrice(v: number) {
    setHomePrice(v);
    if (downMode === '%') {
      // Recompute dollar down from current % draft so LTV stays accurate
      const pct = parseNum(downDraft);
      const newDown = Math.round(v * pct / 100);
      setDownPayment(newDown);
      syncLTV(v, newDown);
    } else {
      syncLTV(v, downPayment);
    }
  }
  function setDown(v: number) {
    setDownPayment(v);
    syncLTV(homePrice, v);
  }

  function switchDownMode(mode: '%' | '$') {
    setDownMode(mode);
    // Convert current downPayment to the new mode's draft format
    if (mode === '%') {
      const pct = homePrice > 0 ? Math.round((downPayment / homePrice) * 100) : 20;
      setDownDraft(String(pct));
    } else {
      setDownDraft(fmtCurrency(downPayment));
    }
  }

  // County options + exact limit — same data source as /loan-limits page
  const countyOptions = useMemo(() => {
    if (!HIGH_COST_STATES.has(state)) return [];
    if (state === 'CA') return CA_LOAN_LIMITS_2026.map(c => c.county);
    return (HIGH_COST_COUNTIES[state] ?? []).map(c => c.county);
  }, [state]);

  const countyLimit = useMemo((): number | null => {
    if (!county) return null;
    if (state === 'CA') return CA_LOAN_LIMITS_2026.find(c => c.county === county)?.conforming.units1 ?? null;
    return (HIGH_COST_COUNTIES[state] ?? []).find(c => c.county === county)?.conforming.units1 ?? null;
  }, [state, county]);

  function handleStateChange(val: string) {
    const s = val.toUpperCase().slice(0, 2);
    setState(s);
    setCounty(''); // reset county when state changes
  }

  const runCalc = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { ...inputs, state, loanType };
      if (countyLimit != null) body.highBalanceCeiling = countyLimit;
      const r = await fetch("/api/rate-intelligence-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? "Calculation failed"); return; }
      setResult(data);
      // Write decoded rate + L5 score back to the originating buyer session
      // (keyed by ?sid=) so Track 5 reads both from the same row as l1–l4.
      if (paramSid) {
        const l5 = scoreL5({
          lenderParRate:      data.lenderParRate,
          conformingSegments: data.marketComparison?.conformingSegments ?? null,
          nationalParRate:    data.parRate,
          loanType,
          synthetic:          data.rateAnchorSource === 'synthetic',
        });
        fetch(`/api/buyer-sessions/${paramSid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            card_fair_par_rate: data.lenderParRate,
            ...(l5 ? { l5_score: l5.score, l5_summary: l5.summary } : {}),
          }),
        }).catch(() => { /* best-effort */ });
      }
      // Auto-capture rate_engine_run → consumer_activity. No auto-run-on-mount
      // path exists for runCalc (button click only), so isSignedIn is already
      // resolved here — no Clerk-timing concern like the check-property page.
      if (isSignedIn) {
        fetch('/api/crm/auto-capture', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            event: 'rate_engine_run',
            data: {
              state,
              loan_type:       loanType,
              loan_amount:     inputs.loanAmount,
              ltv:             inputs.ltv,
              rate_equivalent: data.rateEquivalent,
            },
          }),
        }).catch(() => { /* non-fatal */ });
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, [inputs, state, countyLimit, loanType, isSignedIn]);

  const inp: React.CSSProperties = {
    width: "100%", boxSizing: "border-box" as const,
    padding: "9px 12px", background: "#141b28",
    border: "1px solid rgba(255,255,255,0.09)", borderRadius: 9,
    color: "#f0f4ff", fontSize: "0.875rem", fontFamily: "inherit", outline: "none",
  };
  const label: React.CSSProperties = {
    display: "block", fontSize: "0.7rem", fontWeight: 700,
    letterSpacing: "0.07em", textTransform: "uppercase" as const, color: "#8fa3b8", marginBottom: 5,
  };
  const card: React.CSSProperties = {
    background: "#0e1420", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14, padding: "1.5rem",
  };

  // Styles that vary based on whether field is pre-filled from scenario
  const inpFilled: React.CSSProperties = {
    ...inp, borderColor: 'rgba(0,232,122,0.28)', background: 'rgba(0,232,122,0.04)',
    color: '#4ade80', fontWeight: 600,
  };
  const labelTag = (filled: boolean) => filled ? (
    <span style={{ fontSize: '0.62rem', color: 'rgba(0,232,122,0.55)', marginLeft: 5 }}>✓ from scenario</span>
  ) : null;

  // AD-11 Seam 3 follow-up: Card A-1 predates the OBMMI flagship-series
  // anchor (Jumbo/FHA/VA each get their own real, unsegmented OBMMI series
  // -- see resolveObmmiSeriesId in lib/pricing/llpa-engine.ts) and still
  // showed a generic "Rate Range to Expect" header with the citation only
  // reachable by scrolling to Card A-2. Conventional (segmented -- distinct
  // per-request obmmiSegmentLabel) and dscr (fully synthetic fallback) are
  // intentionally left alone; this only labels the 3 flagship series that
  // share one fixed OBMMI series per loan type.
  const FLAGSHIP_OBMMI_LABELS: Partial<Record<LoanType, string>> = { fha: 'FHA', va: 'VA', jumbo: 'Jumbo' };
  const flagshipLabel = result?.rateAnchorSource === 'obmmi' ? FLAGSHIP_OBMMI_LABELS[loanType] : undefined;
  const cardA1Title = flagshipLabel ? `${flagshipLabel} Rate Range to Expect` : "Rate Range to Expect";

  // "Where does your rate fall?" -- derived once per render, reused by
  // Card A-3 below. Ranking is computed client-side from the already-
  // fetched conformingSegments array (10 real values); "which segment is
  // mine" is resolved by calling the same pure resolveObmmiSeriesId used
  // server-side, with the same inputs already in component state, and
  // matching by seriesId (exact string match) rather than by rate value --
  // matching on the rounded marketRate float would be fragile since
  // lenderParRate/rateEquivalent each round independently before marketRate
  // is derived from their difference.
  const { value: quotedRate, error: quotedRateValidationError } = validateQuotedRate(quotedRateDraft);
  const marketComparison = result?.marketComparison;
  const mySegmentId = marketComparison && loanType === 'conventional'
    ? resolveObmmiSeriesId('conventional', inputs.creditScore, inputs.ltv)
    : null;
  const sortedSegments = marketComparison?.conformingSegments
    ? [...marketComparison.conformingSegments].sort((a, b) => a.rate - b.rate)
    : null;
  const myRank = sortedSegments && mySegmentId
    ? sortedSegments.findIndex(s => s.seriesId === mySegmentId) + 1 // 0 -> not found
    : 0;

  // "Continue → Get Matched" target. With a session (?sid=), runCalc already
  // PATCHed l5_score/l5_summary onto the session row, so Track 5 just re-reads
  // that row via ?session=. Without one (page reached directly, no prior Track 5
  // session), fall back to carrying the just-decoded L5 result + purchase context
  // as URL params instead of a bare /track5 link that would lose the decode entirely.
  const track5Href = (() => {
    if (paramSid) return `/track5?session=${paramSid}`;
    if (!result) return '/track5';
    const l5 = scoreL5({
      lenderParRate:      result.lenderParRate,
      conformingSegments: result.marketComparison?.conformingSegments ?? null,
      nationalParRate:    result.parRate,
      loanType,
      synthetic:          result.rateAnchorSource === 'synthetic',
    });
    const p = new URLSearchParams();
    if (l5) { p.set('l5_score', String(l5.score)); p.set('l5_summary', l5.summary); }
    p.set('ctx_price', String(homePrice));
    p.set('ctx_lt',    loanType);
    p.set('ctx_dp',    String(homePrice > 0 ? Math.round((downPayment / homePrice) * 100) : 20));
    return `/track5?${p.toString()}`;
  })();

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: "#f0f4ff" }}>

      {/* ── ORIGIN BAR — only when launched from a scenario ─────────────────── */}
      {fromScenario && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 9,
          background: 'rgba(0,232,122,0.04)', border: '1px solid rgba(0,232,122,0.18)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 20,
          fontSize: '0.82rem', color: 'rgba(185,208,192,0.65)', lineHeight: 1.45,
        }}>
          <span style={{ color: '#00e87a', fontWeight: 700, marginTop: 1 }}>✓</span>
          <span>
            <strong style={{ color: '#00e87a' }}>Loan details pre-filled from your scenario.</strong>
            {' '}Enter your credit score — that&apos;s the one input we need to run the full LLPA pricing.
          </span>
        </div>
      )}

      {/* ── INPUT FORM ───────────────────────────────────────────────────────── */}
      <div style={{ ...card, marginBottom: 28 }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "#00e87a", marginBottom: 16 }}>
          Your Loan Scenario
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>

          {/* Credit score — spotlight when from scenario (the one missing piece) */}
          <div style={{
            gridColumn: "1/-1",
            ...(fromScenario ? {
              background: 'linear-gradient(135deg, rgba(139,92,246,0.07), rgba(139,92,246,0.03))',
              border: '1px solid rgba(139,92,246,0.22)', borderRadius: 10, padding: '12px 12px 8px',
            } : {}),
          }}>
            {fromScenario && (
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(167,139,250,0.75)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 8 }}>
                ⚡ Required — the biggest single pricing factor
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <label style={{ ...label, marginBottom: 0 }}>{creditBucketLabel(inputs.creditScore)}</label>
              <input
                type="text" inputMode="numeric"
                value={scoreDraft}
                onChange={e => setScoreDraft(e.target.value)}
                onBlur={() => {
                  const v = Math.min(820, Math.max(580, parseInt(scoreDraft, 10) || 620));
                  setScoreDraft(String(v));
                  setInputs(p => ({ ...p, creditScore: v }));
                }}
                style={{ ...inp, width: 82, textAlign: "center" as const, padding: "6px 10px" }}
              />
            </div>
            <input
              type="range" min={580} max={820} step={5} value={inputs.creditScore}
              onChange={e => {
                const v = +e.target.value;
                setScoreDraft(String(v));                // keep text input in sync with slider
                setInputs(p => ({ ...p, creditScore: v }));
              }}
              style={{ width: "100%", accentColor: "#00e87a" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "#8fa3b8", marginTop: 3 }}>
              <span>580</span><span>760+ best tier</span><span>820</span>
            </div>
          </div>

          {/* Home price */}
          <div>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 5 }}>
              <label style={{ ...label, marginBottom: 0 }}>Home Price</label>
              {labelTag(fromScenario)}
            </div>
            <input
              type="text" inputMode="numeric"
              style={fromScenario ? inpFilled : inp}
              value={priceDraft}
              onChange={e => setPriceDraft(e.target.value)}
              onFocus={() => setPriceDraft(String(homePrice))}
              onBlur={() => {
                const v = Math.max(50000, parseNum(priceDraft) || 50000);
                setPriceDraft(fmtCurrency(v));
                setPrice(v);
              }}
            />
          </div>

          {/* Down payment — accepts $ amount or % */}
          <div>
            {/* Label row with mode toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <label style={{ ...label, marginBottom: 0 }}>Down Payment</label>
                {labelTag(fromScenario)}
              </div>
              <div style={{ display: "flex", gap: 3 }}>
                {(['$', '%'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchDownMode(m)}
                    style={{
                      padding: "2px 9px", borderRadius: 5,
                      fontSize: "0.7rem", fontWeight: 700, cursor: "pointer",
                      fontFamily: "inherit",
                      border: `1px solid ${downMode === m ? 'rgba(0,232,122,0.4)' : 'rgba(255,255,255,0.08)'}`,
                      background: downMode === m ? 'rgba(0,232,122,0.12)' : 'rgba(255,255,255,0.03)',
                      color: downMode === m ? '#00e87a' : 'rgba(185,208,192,0.35)',
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="text" inputMode="numeric"
              style={fromScenario ? inpFilled : inp}
              value={downDraft}
              placeholder={downMode === '%' ? "e.g. 20" : "e.g. 112500"}
              onChange={e => setDownDraft(e.target.value)}
              onFocus={() => {
                // Strip formatting on focus so user can type cleanly
                if (downMode === '$') {
                  setDownDraft(String(downPayment));
                } else {
                  setDownDraft(String(Math.round((downPayment / homePrice) * 100)));
                }
              }}
              onBlur={() => {
                const raw = parseNum(downDraft);
                let dollars: number;
                if (downMode === '%') {
                  dollars = Math.round(homePrice * Math.min(raw, 99) / 100);
                  const clampedPct = Math.min(99, Math.max(0, raw));
                  setDownDraft(`${clampedPct}%`);
                } else {
                  dollars = Math.min(homePrice * 0.99, Math.max(0, raw));
                  setDownDraft(fmtCurrency(dollars));
                }
                setDown(dollars);
              }}
            />
            {/* Derived value hint */}
            <div style={{ fontSize: "0.7rem", color: "rgba(185,208,192,0.35)", marginTop: 4 }}>
              {downMode === '%'
                ? `= ${fmtCurrency(downPayment)} · ${inputs.ltv.toFixed(1)}% LTV`
                : `= ${homePrice > 0 ? Math.round((downPayment / homePrice) * 100) : 0}% down · ${inputs.ltv.toFixed(1)}% LTV`}
            </div>
          </div>

          {/* Loan amount + conforming status */}
          <div>
            <label style={label}>Loan Amount</label>
            <div style={{ ...inp, background: "rgba(0,232,122,0.05)", color: "#00e87a", fontWeight: 700, border: "1px solid rgba(0,232,122,0.15)" }}>
              {fmt$(inputs.loanAmount)}
            </div>
            {/* Conforming status chip — uses county limit when selected, falls back to baseline check */}
            {(() => {
              const BASELINE = NATIONAL_CONFORMING_BASELINE.units1;
              const status = result?.conformingStatus ?? (() => {
                if (inputs.loanAmount <= BASELINE) return 'standard';
                if (countyLimit != null && inputs.loanAmount <= countyLimit) return 'high_balance';
                if (countyLimit != null) return 'above_limit';
                return 'check';
              })();
              const countyDisplay = county ? county.replace(/ COUNTY$/, '').replace(/ BOROUGH$/, '').replace(/ MUNICIPALITY$/, '').replace(/ CENSUS AREA$/, '') : null;
              const ceilingDisplay = countyLimit ?? result?.highBalanceCeiling;
              const chips = {
                standard:    { bg: 'rgba(0,232,122,0.08)',   border: 'rgba(0,232,122,0.22)',   color: '#00e87a',  text: `Standard conforming ≤ $${BASELINE.toLocaleString()}` },
                high_balance:{ bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.25)',  color: '#fbbf24',  text: `High-balance conforming${countyDisplay ? ` — ${countyDisplay} ($${(ceilingDisplay ?? 0).toLocaleString()})` : ceilingDisplay ? ` — ceiling $${ceilingDisplay.toLocaleString()}` : ''}` },
                above_limit: { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)', color: '#f87171',  text: `Above conforming limit${countyDisplay ? ` — ${countyDisplay} max $${(ceilingDisplay ?? 0).toLocaleString()}` : ' — jumbo territory'}` },
                check:       { bg: 'rgba(251,191,36,0.06)',  border: 'rgba(251,191,36,0.18)',  color: 'rgba(251,191,36,0.7)', text: `> $${BASELINE.toLocaleString()} — select county above to confirm zone` },
              };
              const c = chips[status];
              return (
                <div style={{ fontSize: '0.68rem', fontWeight: 600, marginTop: 6, padding: '4px 9px', borderRadius: 6, background: c.bg, border: `1px solid ${c.border}`, color: c.color, lineHeight: 1.4 }}>
                  {c.text}
                </div>
              );
            })()}
          </div>

          {/* Occupancy */}
          <div>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 5 }}>
              <label style={{ ...label, marginBottom: 0 }}>Occupancy</label>
              {labelTag(fromScenario && paramOcc != null)}
            </div>
            <select style={fromScenario && paramOcc != null ? inpFilled : inp} value={inputs.occupancy}
              onChange={e => setInputs(p => ({ ...p, occupancy: e.target.value as LLPAInput['occupancy'] }))}>
              <option value="primary">Primary residence</option>
              <option value="second">Second home</option>
              <option value="investment">Investment property</option>
            </select>
          </div>

          {/* Loan purpose */}
          <div>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 5 }}>
              <label style={{ ...label, marginBottom: 0 }}>Loan Purpose</label>
              {labelTag(fromScenario && paramPurpose != null)}
            </div>
            <select style={fromScenario && paramPurpose != null ? inpFilled : inp} value={inputs.loanPurpose}
              onChange={e => setInputs(p => ({ ...p, loanPurpose: e.target.value as LLPAInput['loanPurpose'] }))}>
              <option value="purchase">Purchase</option>
              <option value="rate_term_refi">Rate / term refinance</option>
              <option value="cash_out_refi">Cash-out refinance</option>
            </select>
          </div>

          {/* Property type */}
          <div>
            <label style={label}>Property Type</label>
            <select style={inp} value={inputs.propertyType}
              onChange={e => setInputs(p => ({ ...p, propertyType: e.target.value as LLPAInput['propertyType'] }))}>
              <option value="sfr">Single-family (SFR)</option>
              <option value="condo">Condo</option>
              <option value="2unit">2-unit</option>
              <option value="3_4unit">3–4 unit</option>
              <option value="manufactured">Manufactured</option>
            </select>
          </div>

          {/* Lock period */}
          <div>
            <label style={label}>Lock Period</label>
            <select style={inp} value={inputs.lockDays}
              onChange={e => setInputs(p => ({ ...p, lockDays: +e.target.value as LLPAInput['lockDays'] }))}>
              <option value={15}>15-day (fastest close)</option>
              <option value={30}>30-day (standard)</option>
              <option value={45}>45-day (+0.125 pts)</option>
              <option value={60}>60-day (+0.250 pts)</option>
            </select>
          </div>

          {/* Loan type — for marketplace filter */}
          <div>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 5 }}>
              <label style={{ ...label, marginBottom: 0 }}>Loan Type</label>
              {labelTag(paramLT != null || sessionPrefilled)}
            </div>
            <select style={paramLT != null || sessionPrefilled ? inpFilled : inp} value={loanType}
              onChange={e => setLoanType(e.target.value as LoanType)}>
              <option value="conventional">Conventional</option>
              <option value="fha">FHA</option>
              <option value="va">VA</option>
              <option value="jumbo">Jumbo</option>
            </select>
          </div>

          {/* Property State */}
          <div>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 5 }}>
              <label style={{ ...label, marginBottom: 0 }}>Property State</label>
              {labelTag(paramSt != null || stateFromSession)}
            </div>
            <input
              style={paramSt != null || stateFromSession ? inpFilled : inp}
              value={state}
              onChange={e => handleStateChange(e.target.value)}
              maxLength={2}
              placeholder="CA"
            />
          </div>

          {/* County — shown only for high-cost states; uses same FHFA data as /loan-limits */}
          {HIGH_COST_STATES.has(state) && countyOptions.length > 0 && (
            <div>
              <label style={label}>
                County {labelTag(countyFromZip)}
              </label>
              <select
                style={countyFromZip ? inpFilled : inp}
                value={county}
                onChange={e => { setCounty(e.target.value); setCountyFromZip(false); }}
              >
                <option value="">— Select county —</option>
                {countyOptions.map(c => (
                  <option key={c} value={c}>
                    {c.replace(/ COUNTY$/, '').replace(/ BOROUGH$/, '').replace(/ MUNICIPALITY$/, '').replace(/ CENSUS AREA$/, '')}
                  </option>
                ))}
              </select>
              {countyLimit != null && (
                <div style={{ fontSize: '0.7rem', color: 'rgba(251,191,36,0.6)', marginTop: 4 }}>
                  Conforming ceiling: ${countyLimit.toLocaleString()}
                </div>
              )}
            </div>
          )}

        </div>

        {/* CTA — transforms after decode: Decode dims, Get Matched appears */}
        <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" as const }}>
          <button onClick={() => runCalc()} disabled={loading} style={{
            padding: "12px 32px", borderRadius: 999,
            background: loading
              ? "rgba(0,232,122,0.4)"
              : result
                ? "rgba(0,232,122,0.12)"
                : "#00e87a",
            color: result ? "rgba(0,232,122,0.6)" : "#080c12",
            fontWeight: 700, fontSize: "0.95rem",
            border: result ? "1px solid rgba(0,232,122,0.25)" : "none",
            cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            transition: "all 0.2s ease",
          }}>
            {loading ? "Calculating…" : result ? "Re-decode →" : "Decode my rate →"}
          </button>

          {result && (
            <a href={track5Href} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(139,92,246,0.85)",
              color: "#fff", fontWeight: 700, fontSize: "0.92rem",
              borderRadius: 999, padding: "12px 28px",
              textDecoration: "none", letterSpacing: "0.01em",
            }}>
              Continue → Get Matched
            </a>
          )}

          {error && <span style={{ fontSize: "0.85rem", color: "#ff5f5f" }}>{error}</span>}
        </div>
      </div>

      {/* ── OUTPUT CARDS ─────────────────────────────────────────────────────── */}
      {result && (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 20 }}>

          {/* ── ABOVE-LIMIT WARNING — shown when loan exceeds conforming ceiling ── */}
          {result.conformingStatus === 'above_limit' && (
            <div style={{
              background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.25)',
              borderRadius: 12, padding: '14px 18px',
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f87171', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>
                ⚠ Loan exceeds conforming limit — jumbo territory
              </div>
              <div style={{ fontSize: '0.82rem', color: 'rgba(248,113,113,0.8)', lineHeight: 1.55 }}>
                Your loan amount ({fmt$(inputs.loanAmount)}) exceeds the highest conforming limit
                in {result.stateName} (${result.highBalanceCeiling.toLocaleString()}).
                Fannie Mae LLPA pricing applies to conforming loans only.
                Jumbo loans are priced by each lender&apos;s own portfolio guidelines and will differ
                significantly from these estimates. Use this as a directional reference only.
              </div>
            </div>
          )}

          {/* ── HIGH-BALANCE NOTE — informational when applicable ── */}
          {result.conformingStatus === 'high_balance' && (
            <div style={{
              background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.18)',
              borderRadius: 10, padding: '10px 14px', fontSize: '0.78rem',
              color: 'rgba(251,191,36,0.75)', lineHeight: 1.5,
            }}>
              <strong style={{ color: '#fbbf24' }}>High-balance conforming loan</strong> — your loan exceeds the national
              baseline (${result.conformingBaseline.toLocaleString()}) but is within the {result.stateName} high-cost
              ceiling (${result.highBalanceCeiling.toLocaleString()}). Fannie Mae LLPA pricing applies with the
              high-balance surcharge shown in the breakdown below.
            </div>
          )}

          {/* ── STAT BAR ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            {[
              { label: "FRED Par Rate", value: `${result.parRate.toFixed(2)}%`, sub: "30yr national avg", color: "#8fa3b8" },
              { label: "Total LLPA", value: `${result.totalLLPA > 0 ? "+" : ""}${result.totalLLPA.toFixed(3)} pts`, sub: `${result.totalLLPA >= 0 ? "+" : ""}${fmt$(result.totalLLPADollars)}`, color: result.totalLLPA > 1 ? "#ff9966" : result.totalLLPA > 0 ? "#f0c14b" : "#00e87a" },
              { label: "Rate Impact", value: `+${result.rateEquivalent.toFixed(3)}%`, sub: "added to par rate", color: "#f0c14b" },
              { label: "Your Lender Par", value: `${result.lenderParRate.toFixed(3)}%`, sub: "par offer (no pts)", color: "#00e87a" },
            ].map(s => (
              <div key={s.label} style={{ ...card, padding: "1rem 1.25rem" }}>
                <div style={{ fontSize: "0.68rem", color: "#8fa3b8", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: 700, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: s.color, lineHeight: 1.1, marginBottom: 3 }}>{s.value}</div>
                <div style={{ fontSize: "0.72rem", color: "#8fa3b8" }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {result.jumboEstimate && (
            <div style={{ ...card, padding: "0.85rem 1.1rem", border: "1px dashed rgba(240,193,75,0.35)", background: "rgba(240,193,75,0.05)" }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#f0c14b", marginBottom: 3 }}>
                Estimated jumbo rate
              </div>
              <div style={{ fontSize: "0.74rem", color: "#8fa3b8", lineHeight: 1.55 }}>
                {result.jumboEstimate.baseSource === 'real-jumbo'
                  ? "Jumbo has no real per-credit-score/LTV OBMMI series (only one national average exists), so this adjusts today's real jumbo average for your credit score and LTV using published spread ranges — not a live per-segment observation the way conforming rates are."
                  : "Today's jumbo average hasn't synced yet, so this estimate is built from the real conforming average plus an observed jumbo-conforming spread, adjusted for your credit score and LTV."}
                {' '}This is an estimate, not a committed or quoted rate — actual investor pricing may vary.
              </div>
            </div>
          )}

          {/* ── CARD A-1: Rate Range to Expect ── */}
          <div style={card}>
            <div style={{ fontSize: "0.68rem", color: "#8fa3b8", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: 700, marginBottom: 4 }}>Card A-1</div>
            <div style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: 12 }}>{cardA1Title}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { label: "Competitive lender", rate: (result.lenderParRate - 0.125).toFixed(3), note: "Best-in-market offer" },
                { label: "Par (no pts/credits)", rate: result.lenderParRate.toFixed(3), note: "Standard offer ← expect this" },
                { label: "High-margin lender", rate: (result.lenderParRate + 0.375).toFixed(3), note: "1.5 pts above par" },
              ].map(r => (
                <div key={r.label} style={{ background: "#141b28", borderRadius: 10, padding: "14px 14px", border: "1px solid rgba(255,255,255,0.07)", textAlign: "center" as const }}>
                  <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#f0f4ff", letterSpacing: "-0.02em" }}>{r.rate}%</div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#8fa3b8", marginTop: 4 }}>{r.label}</div>
                  <div style={{ fontSize: "0.68rem", color: "#8fa3b8", marginTop: 3 }}>{r.note}</div>
                </div>
              ))}
            </div>
            <p style={{ margin: "12px 0 0", fontSize: "0.78rem", color: "#8fa3b8", lineHeight: 1.55 }}>
              The spread reflects lender margin, not Fannie Mae adjustments. Get 3 Loan Estimates and compare Line A (origination fee) to find the competitive end of this range.
            </p>
            {flagshipLabel && (
              <p style={{ margin: "8px 0 0", fontSize: "0.72rem", color: "#8fa3b8", lineHeight: 1.5 }}>
                {result.dataSource}
              </p>
            )}
          </div>

          {/* ── CARD A-3: Where Does Your Rate Fall? ──
              "Card A-3" is my own naming choice, not a confirmed spec --
              nothing in this codebase documents what the A-1/A-2 vs B-1/B-2
              lettering actually encodes, so this groups with A-1/A-2 as the
              closer thematic match ("your rate story") rather than B-1/B-2
              ("your options"), flagged as an inference during design.
              Absent entirely for dscr (marketComparison is undefined there --
              no real OBMMI data exists to compare against). */}
          {marketComparison && (
            <div style={card}>
              <div style={{ fontSize: "0.68rem", color: "#8fa3b8", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: 700, marginBottom: 4 }}>Card A-3</div>
              <div style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: 12 }}>Where Does Your Rate Fall?</div>

              {/* Unconditional market fact -- real data, no personal input needed */}
              <p style={{ margin: "0 0 4px", fontSize: "0.88rem", color: "#e6edf3", lineHeight: 1.6 }}>
                {loanType === 'conventional'
                  ? <>The average rate observed for your segment (<strong>{marketComparison.segmentLabel}</strong>) is{' '}
                      <strong style={{ color: "#f0f4ff" }}>{marketComparison.marketRate.toFixed(3)}%</strong> today.
                      {sortedSegments && myRank > 0 && (
                        <> That's the <strong>{ordinal(myRank)}-best</strong> of the {sortedSegments.length} credit/LTV tiers OBMMI tracks.</>
                      )}
                    </>
                  : <>The average {flagshipLabel ?? marketComparison.segmentLabel} rate observed today is{' '}
                      <strong style={{ color: "#f0f4ff" }}>{marketComparison.marketRate.toFixed(3)}%</strong>. Jumbo/FHA/VA/USDA are each a
                      single national average — there's no credit/LTV segmentation to rank against.
                    </>
                }
              </p>
              <p style={{ margin: "0 0 14px", fontSize: "0.72rem", color: "#8fa3b8", lineHeight: 1.5 }}>
                This compares against the base segment average — your own adjustments (occupancy, purpose,
                property type, lock period) are shown separately in your LLPA Breakdown below.
              </p>

              {/* Optional numeric input */}
              <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" as const, color: "#8fa3b8", marginBottom: 5 }}>
                The rate you were quoted (optional)
              </label>
              <input
                type="text" inputMode="decimal"
                placeholder="e.g. 6.875"
                style={{
                  width: "100%", maxWidth: 200, boxSizing: "border-box" as const,
                  padding: "9px 12px", background: "#141b28",
                  border: `1px solid ${quotedRateValidationError ? "rgba(248,113,113,0.5)" : "rgba(255,255,255,0.09)"}`,
                  borderRadius: 9, color: "#f0f4ff", fontSize: "0.875rem", fontFamily: "inherit", outline: "none",
                }}
                value={quotedRateDraft}
                onChange={e => setQuotedRateDraft(e.target.value)}
              />
              {quotedRateValidationError && (
                <p style={{ margin: "6px 0 0", fontSize: "0.75rem", color: "#f87171" }}>{quotedRateValidationError}</p>
              )}

              {/* Comparison -- only once a valid rate is entered */}
              {quotedRate != null && (() => {
                const delta = parseFloat((quotedRate - marketComparison.marketRate).toFixed(3));
                const verdict = delta > 0.01 ? 'above' : delta < -0.01 ? 'below' : 'at';
                const color = verdict === 'below' ? '#4ade80' : verdict === 'above' ? '#f87171' : '#8fa3b8';
                return (
                  <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 10, border: `1px solid ${color}33` }}>
                    <span style={{ fontSize: "0.9rem", color: "#e6edf3" }}>
                      You entered <strong>{quotedRate.toFixed(3)}%</strong>. That's{' '}
                      <strong style={{ color }}>
                        {verdict === 'at' ? 'right at the segment average' : `${Math.abs(delta).toFixed(3)} points ${verdict} the segment average`}
                      </strong>
                      {verdict !== 'at' && ` (${marketComparison.marketRate.toFixed(3)}%)`}.
                    </span>
                  </div>
                );
              })()}

              <p style={{ margin: "14px 0 0", fontSize: "0.72rem", color: "#8fa3b8", lineHeight: 1.5 }}>
                This compares your quote to a market average for your general credit/LTV tier, not a
                personalized underwriting match — actual rates vary by lender, exact credit profile, and
                factors not captured here. {result.dataSource}
              </p>
            </div>
          )}

          {/* ── CARD A-2: LLPA Breakdown ── */}
          <div style={card}>
            <div style={{ fontSize: "0.68rem", color: "#8fa3b8", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: 700, marginBottom: 4 }}>Card A-2</div>
            <div style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: 14 }}>Your LLPA Breakdown</div>
            {result.breakdown.length === 0 ? (
              <div style={{ padding: "14px", background: "rgba(0,232,122,0.06)", borderRadius: 10, border: "1px solid rgba(0,232,122,0.15)", color: "#00e87a", fontSize: "0.9rem", fontWeight: 600 }}>
                {result.rateAnchorSource === 'obmmi'
                  // AD-11 Seam 3b: an empty breakdown here means no surcharges
                  // beyond the OBMMI-anchored rate -- NOT "best pricing tier"
                  // (credit/LTV pricing is baked into the anchor itself, not
                  // disclosed as a separate adjustment, so this can be true
                  // for any segment, not just the best one).
                  ? `✓ No additional adjustments — your rate already reflects real market pricing for your ${result.obmmiSegmentLabel} segment.`
                  : "✓ Zero price adjustments — you're in the best LLPA tier."}
              </div>
            ) : (
              <div style={{ overflowX: "auto" as const }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", minWidth: 400 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      {["Adjustment Factor", "Price Points", "Dollar Cost", "Rate Impact"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left" as const, fontSize: "0.68rem", fontWeight: 700, color: "#8fa3b8", textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.breakdown.map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "9px 12px", color: "#e6edf3", fontWeight: 500 }}>{row.label}</td>
                        <td style={{ padding: "9px 12px", color: row.points < 0 ? "#00e87a" : "#ff9966", fontWeight: 700 }}>
                          {row.points >= 0 ? "+" : ""}{row.points.toFixed(3)}
                        </td>
                        <td style={{ padding: "9px 12px", color: "#8fa3b8" }}>
                          {row.points >= 0 ? "+" : ""}{fmt$(Math.round((row.points * inputs.loanAmount) / 100))}
                        </td>
                        <td style={{ padding: "9px 12px", color: "#8fa3b8" }}>
                          {row.points >= 0 ? "+" : ""}{(row.points / 4).toFixed(3)}%
                        </td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: "1.5px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}>
                      <td style={{ padding: "10px 12px", color: "#f0f4ff", fontWeight: 800 }}>Total LLPA</td>
                      <td style={{ padding: "10px 12px", color: result.totalLLPA === 0 ? "#00e87a" : "#ff9966", fontWeight: 800 }}>
                        {result.totalLLPA >= 0 ? "+" : ""}{result.totalLLPA.toFixed(3)} pts
                      </td>
                      <td style={{ padding: "10px 12px", color: "#f0f4ff", fontWeight: 700 }}>
                        +{fmt$(result.totalLLPADollars)}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#f0c14b", fontWeight: 700 }}>
                        +{result.rateEquivalent.toFixed(3)}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ margin: "12px 0 0", fontSize: "0.72rem", color: "#8fa3b8", lineHeight: 1.5 }}>
              {result.dataSource}
            </p>
          </div>

          {/* ── CARD B-2: Rate Options (curve table) ── */}
          <div style={card}>
            <div style={{ fontSize: "0.68rem", color: "#8fa3b8", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: 700, marginBottom: 4 }}>Card B-2</div>
            <div style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: 4 }}>Your Rate Options</div>
            <p style={{ margin: "0 0 14px", fontSize: "0.82rem", color: "#8fa3b8", lineHeight: 1.5 }}>
              Every lender offers rate/cost trade-offs. Lower rate = you pay points upfront. Higher rate = lender pays your closing costs.
            </p>
            <div style={{ overflowX: "auto" as const }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", minWidth: 520 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    {["Rate", "Cost / Credit", "Break-Even", "Total 30yr Interest", ""].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left" as const, fontSize: "0.68rem", fontWeight: 700, color: "#8fa3b8", textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rateCurve.map((pt, i) => {
                    const isRec = result.recommendedCurvePoint.point.rate === pt.rate;
                    const isCredit = pt.label === "credit";
                    const isPar = pt.label === "par";
                    const totalInt = Math.round(
                      (pt.rate / 100 / 12) / (1 - Math.pow(1 + pt.rate / 100 / 12, -360)) * 360 * inputs.loanAmount - inputs.loanAmount
                    );
                    return (
                      <tr key={i} style={{
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        background: isRec ? "rgba(0,232,122,0.06)" : "transparent",
                      }}>
                        <td style={{ padding: "10px 12px", fontWeight: 800, fontSize: "1rem", color: isPar ? "#00e87a" : "#f0f4ff" }}>
                          {pt.rate.toFixed(3)}%
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: isCredit ? "#00e87a" : isPar ? "#8fa3b8" : "#ff9966" }}>
                          {isCredit
                            ? `+${fmt$(Math.abs(pt.dollarCost))} credit`
                            : isPar
                            ? "PAR (no cost)"
                            : `-${fmt$(pt.dollarCost)} (${pt.points.toFixed(2)} pt${pt.points !== 1 ? "s" : ""})`}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#8fa3b8" }}>
                          {pt.breakEvenMonths !== null
                            ? `${pt.breakEvenMonths} mo (${(pt.breakEvenMonths / 12).toFixed(1)} yr)`
                            : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#8fa3b8", fontSize: "0.85rem" }}>
                          {fmt$(totalInt)}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {isRec && (
                            <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 8px", background: "rgba(0,232,122,0.12)", borderRadius: 99, color: "#00e87a", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
                              Recommended
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(0,232,122,0.05)", border: "1px solid rgba(0,232,122,0.12)", borderRadius: 10 }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#00e87a", marginBottom: 4 }}>Recommended: {result.recommendedCurvePoint.point.rate.toFixed(3)}%</div>
              <div style={{ fontSize: "0.8rem", color: "#8fa3b8", lineHeight: 1.55 }}>{result.recommendedCurvePoint.reasoning}</div>
            </div>
            <p style={{ margin: "12px 0 0", fontSize: "0.72rem", color: "#8fa3b8", lineHeight: 1.5 }}>
              Actual rate options vary by lender. Table uses live FRED par rate ({result.parRate.toFixed(2)}%) and estimated point-to-rate conversion. Educational estimate only.
            </p>
          </div>

          {/* ── CARD B-1: Negotiation Brief ── */}
          <div style={card}>
            <div style={{ fontSize: "0.68rem", color: "#8fa3b8", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: 700, marginBottom: 4 }}>Card B-1</div>
            <div style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: 14 }}>Your Negotiation Brief</div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
              {result.negotiationBrief.map((point, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: "rgba(0,232,122,0.12)", border: "1px solid rgba(0,232,122,0.25)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, fontSize: "0.7rem", fontWeight: 800, color: "#00e87a",
                  }}>{i + 1}</div>
                  <p style={{ margin: 0, fontSize: "0.88rem", color: "#c8d8ea", lineHeight: 1.65 }}>{point}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, padding: "14px", background: "#141b28", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#8fa3b8", marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                What to ask your lender
              </div>
              {[
                "Can you show me the LLPA breakdown on my lock confirmation?",
                "What is your origination fee separate from points?",
                "What rate can I get with 0 points and 0 credits?",
                "Can I lock for 15 days if I close fast?",
              ].map((q, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
                  <span style={{ color: "#00e87a", fontSize: "0.8rem", flexShrink: 0 }}>›</span>
                  <span style={{ fontSize: "0.82rem", color: "#8fa3b8", lineHeight: 1.5 }}>{q}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── DISCLAIMER ── */}
          <p style={{ fontSize: "0.75rem", color: "rgba(143,163,184,0.6)", lineHeight: 1.55, margin: 0 }}>
            {result.disclaimer}
          </p>

          {/* ── RATE MARKETPLACE TABLE ── */}
          {state.length === 2 && (
            <div>
              <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "#8fa3b8", marginBottom: 12, marginTop: 8 }}>
                Rate marketplace
              </div>
              <RateMarketplaceTable scenario={{
                ...inputs,
                state: state.toUpperCase(),
                loanType,
              }} />
            </div>
          )}


        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {!result && !loading && (
        <div style={{ ...card, textAlign: "center" as const, padding: "3rem 2rem" }}>
          <div style={{ fontSize: "2rem", marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 700, color: "#f0f4ff", marginBottom: 8 }}>Configure your scenario above</div>
          <div style={{ fontSize: "0.875rem", color: "#8fa3b8", maxWidth: 400, margin: "0 auto" }}>
            Enter your credit score, home price, and down payment — then click "Decode my rate" to see the full LLPA breakdown, rate options, and your negotiation brief.
          </div>
        </div>
      )}

    </div>
  );
}
