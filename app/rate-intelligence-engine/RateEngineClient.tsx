"use client";
// app/rate-intelligence-engine/RateEngineClient.tsx
// Interactive form + 4 output cards: A-1 Rate Range · A-2 LLPA Breakdown · B-2 Rate Options · B-1 Negotiation Brief
// + Rate marketplace table below results

import { useState, useCallback, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { LLPAInput, RateCurvePoint } from "../../lib/pricing/llpa-engine";
import type { LoanType } from "../../lib/pricing/marketplace-engine";
import RateMarketplaceTable from "../components/RateMarketplaceTable";
import {
  HIGH_COST_COUNTIES,
  HIGH_COST_STATES,
  NATIONAL_CONFORMING_BASELINE,
} from "../../lib/loanLimitsNational2026";
import { CA_LOAN_LIMITS_2026 } from "../../lib/loanLimits2026";

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
}

// ─── Default inputs ────────────────────────────────────────────────────────────

const DEFAULTS: LLPAInput = {
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function RateEngineClient() {
  const params = useSearchParams();

  // Parse scenario URL params (set by DSC "🔬 Run Rate Intelligence" or ISC CTA)
  const paramPrice   = params?.get('price')     ? Number(params.get('price'))    : null;
  const paramDownPct = params?.get('downPct')   ? Number(params.get('downPct'))  : null;
  const paramPurpose = (params?.get('purpose')   ?? null) as LLPAInput['loanPurpose'] | null;
  const paramOcc     = (params?.get('occupancy') ?? null) as LLPAInput['occupancy']   | null;
  const paramLT      = (params?.get('lt')        ?? null) as LoanType | null;
  const paramSt      = params?.get('st') ?? null;
  const fromScenario = paramPrice != null;

  // Derived initial values — used to seed useState once on mount
  const initPrice    = paramPrice ?? 562_500;
  const initDownPct  = paramDownPct ?? 20;
  const initDown     = Math.round(initPrice * initDownPct / 100);
  const initLoan     = initPrice - initDown;
  const initLTV      = parseFloat(((initLoan / initPrice) * 100).toFixed(2));

  const [inputs, setInputs] = useState<LLPAInput>(() => ({
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
      const body: Record<string, unknown> = { ...inputs, state };
      if (countyLimit != null) body.highBalanceCeiling = countyLimit;
      const r = await fetch("/api/rate-intelligence-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? "Calculation failed"); return; }
      setResult(data);
      // Write decoded rate back to the originating buyer session (keyed by ?sid=)
      // so Track 5 reads card_fair_par_rate from the same row as l1–l4.
      if (paramSid) {
        fetch(`/api/buyer-sessions/${paramSid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ card_fair_par_rate: data.lenderParRate }),
        }).catch(() => { /* best-effort */ });
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, [inputs, state, countyLimit]);

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
              {labelTag(fromScenario && paramPrice != null)}
            </div>
            <input
              type="text" inputMode="numeric"
              style={fromScenario && paramPrice != null ? inpFilled : inp}
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
                {labelTag(fromScenario && paramDownPct != null)}
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
              style={fromScenario && paramDownPct != null ? inpFilled : inp}
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
            <label style={label}>Loan Type</label>
            <select style={inp} value={loanType}
              onChange={e => setLoanType(e.target.value as LoanType)}>
              <option value="conventional">Conventional</option>
              <option value="fha">FHA</option>
              <option value="va">VA</option>
              <option value="jumbo">Jumbo</option>
            </select>
          </div>

          {/* Property State */}
          <div>
            <label style={label}>Property State</label>
            <input
              style={inp}
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
            <a href={paramSid ? `/track5?session=${paramSid}` : '/track5'} style={{
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

          {/* ── CARD A-1: Rate Range to Expect ── */}
          <div style={card}>
            <div style={{ fontSize: "0.68rem", color: "#8fa3b8", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: 700, marginBottom: 4 }}>Card A-1</div>
            <div style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: 12 }}>Rate Range to Expect</div>
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
          </div>

          {/* ── CARD A-2: LLPA Breakdown ── */}
          <div style={card}>
            <div style={{ fontSize: "0.68rem", color: "#8fa3b8", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: 700, marginBottom: 4 }}>Card A-2</div>
            <div style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: 14 }}>Your LLPA Breakdown</div>
            {result.breakdown.length === 0 ? (
              <div style={{ padding: "14px", background: "rgba(0,232,122,0.06)", borderRadius: 10, border: "1px solid rgba(0,232,122,0.15)", color: "#00e87a", fontSize: "0.9rem", fontWeight: 600 }}>
                ✓ Zero price adjustments — you're in the best LLPA tier.
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
