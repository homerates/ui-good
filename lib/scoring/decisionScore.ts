// lib/scoring/decisionScore.ts
//
// Canonical Decision Score (L1-L5) math. Every per-level formula and the
// composite/verdict logic used to be hand-copied across 10+ locations
// (chat's two entry paths, property-intel's two blocks, DecisionScoreCard,
// the partner-facing instant-score API, portfolio, track5, featured-properties)
// with real numeric divergence in places. This module is the single source
// of truth going forward — every caller passes in scalars it already has in
// hand; nothing here fetches data or calls a model.
//
// L3's formula canonicalizes on the richer of the two chat-path formulas
// (variable-weight social-proof blend) per product decision 2026-08-06 — this
// is a deliberate score change on the CMA-seeded chat path and instant-score,
// which previously used simpler/different L3 formulas.
//
// L5 is new: no L5 score existed anywhere before this module. The formula
// below (par-rate position within the real OBMMI segment distribution, with
// a spread-vs-national-par fallback) is a genuinely new design, not an
// extraction of existing code — treat it as a reasonable default, not a
// validated-by-precedent formula the way L1-L4 are.

// ── L1 — Financial Readiness (LTV + optional DTI) ──────────────────────────

export interface ScoreL1Input {
  downPct: number;
  /** Only 'jumbo' changes the LTV thresholds; every other loan type shares the conventional ladder. */
  loanType: string;
  /** Back-end DTI %, omit/null to skip the adjustment entirely. */
  dti?: number | null;
}

export function scoreL1({ downPct, loanType, dti }: ScoreL1Input): { score: number; summary: string } {
  const ltv = 1 - downPct / 100;
  const isJumbo = loanType === 'jumbo';
  const ltvScore = isJumbo
    ? (ltv <= 0.75 ? 86 : ltv <= 0.80 ? 80 : 72)
    : (ltv <= 0.80 ? 85 : ltv <= 0.85 ? 78 : ltv <= 0.90 ? 70 : 60);

  let dtiAdj = 0;
  let dtiTag = '';
  if (dti != null && dti > 0) {
    if (dti <= 28) { dtiAdj = 10; dtiTag = `DTI ${dti.toFixed(0)}% (exceptional)`; }
    else if (dti <= 36) { dtiAdj = 6; dtiTag = `DTI ${dti.toFixed(0)}% (strong)`; }
    else if (dti <= 43) { dtiAdj = 0; dtiTag = `DTI ${dti.toFixed(0)}% (standard)`; }
    else if (dti <= 49) { dtiAdj = -7; dtiTag = `DTI ${dti.toFixed(0)}% (elevated)`; }
    else { dtiAdj = -15; dtiTag = `DTI ${dti.toFixed(0)}% (high)`; }
  }

  const score = Math.min(100, Math.max(45, ltvScore + dtiAdj));
  const typeLabel = isJumbo ? 'Jumbo' : loanType === 'fha' ? 'FHA' : loanType === 'va' ? 'VA' : 'Conventional';
  const summary = `${typeLabel} · ${downPct}% down · LTV ${Math.round(ltv * 100)}%${dtiTag ? ` · ${dtiTag}` : ''}`;
  return { score, summary };
}

// ── L2 — Property Evaluation (list price vs AVM premium) ───────────────────

export interface ScoreL2Input {
  listPrice: number;
  avm: number | null;
}

export function scoreL2({ listPrice, avm }: ScoreL2Input): { score: number; summary: string } | null {
  if (!avm || !listPrice) return null;
  const prem = (listPrice - avm) / avm;
  const score = prem < -0.05 ? 92 : prem < 0 ? 84 : prem < 0.03 ? 76
    : prem < 0.07 ? 65 : prem < 0.12 ? 52 : prem < 0.20 ? 38 : 22;
  const premStr = `${prem >= 0 ? '+' : ''}${(prem * 100).toFixed(1)}%`;
  return { score, summary: `Listed ${premStr} vs AVM $${Math.round(avm / 1000)}K` };
}

// ── L3 — Market Intelligence (DOM + sale-to-list + optional social proof) ──
// Canonical formula = chat's property_lookup-path version (the richer of the
// two prior formulas). `saleToList` must already be a ratio (0.98), not a
// percent — callers normalize Grok's occasional percent-form output (>2 →
// divide by 100) before calling this.

function domScore(dom: number): number {
  return dom > 90 ? 90 : dom > 60 ? 80 : dom > 45 ? 68 : dom > 30 ? 55 : dom > 15 ? 42 : 32;
}
function stlScore(stl: number): number {
  return stl < 0.95 ? 90 : stl < 0.98 ? 80 : stl < 1.00 ? 68 : stl < 1.02 ? 55 : stl < 1.05 ? 42 : 30;
}

export interface ScoreL3Input {
  domMedian?: number | null;
  saleToList?: number | null;
  /** Property's own days-on-market — last-resort fallback only. */
  subjectDom?: number | null;
  /** 0-100 blended velocity signal (Zillow views/saves + Redfin rank), optional. */
  socialProofScore?: number | null;
  /** Preformatted strings appended to the summary when present, e.g. ["12,400 Zillow views", "3 saves"]. */
  socialProofNotes?: string[];
  /** Used only in the deepest fallback branch's summary text, e.g. "High". */
  interestLevel?: string | null;
}

export function scoreL3({
  domMedian, saleToList, subjectDom, socialProofScore, socialProofNotes, interestLevel,
}: ScoreL3Input): { score: number; summary: string } {
  let score: number | null = null;
  const parts: string[] = [];
  const subs: number[] = [];
  if (domMedian != null) { subs.push(domScore(domMedian)); parts.push(`Median DOM ${domMedian}d`); }
  if (saleToList != null) { subs.push(stlScore(saleToList)); parts.push(`sale-to-list ${(saleToList * 100).toFixed(1)}%`); }
  if (subs.length > 0) score = Math.round(subs.reduce((a, b) => a + b, 0) / subs.length);

  let summary = parts.join(', ');

  // Blend social-proof velocity signal — 35% weight when a DOM/STL base score
  // exists, 50% when social proof is the only signal available.
  if (socialProofScore != null) {
    const spWeight = score != null ? 0.35 : 0.5;
    score = Math.min(100, Math.round(
      score != null ? score * (1 - spWeight) + socialProofScore * spWeight : socialProofScore,
    ));
    if (socialProofNotes?.length) {
      summary = summary ? `${summary} · ${socialProofNotes.join(' · ')}` : socialProofNotes.join(' · ');
    }
  }

  // Final fallback chain — L3 must never stay null.
  if (score == null) {
    if (subjectDom != null && subjectDom >= 0) {
      score = domScore(subjectDom);
      summary = `Property at ${subjectDom}d on market (area stats pending)`;
    } else {
      score = 65;
      summary = interestLevel ? `${interestLevel} early demand` : 'Market data limited';
    }
  }

  return { score, summary };
}

// ── L4 — Location Intelligence (Grok overall_score, with fallback) ─────────

export interface ScoreL4Input {
  /** Grok location_intelligence.overall_score — preferred path when present. */
  overallScore?: number | null;
  subScores?: { metric: string; rating: string }[];
  school?: number | null; // 0-10
  walk?: number | null;   // 0-100
  commuteMinutes?: number | null;
  appreciation3yrPct?: number | null;
}

export function scoreL4({
  overallScore, subScores, school, walk, commuteMinutes, appreciation3yrPct,
}: ScoreL4Input): { score: number; summary: string } | null {
  if (overallScore != null) {
    const score = Math.min(100, Math.max(0, Math.round(overallScore)));
    const pts = (subScores ?? []).slice(0, 3).map(s => `${s.metric}: ${s.rating}`);
    return { score, summary: pts.length ? pts.join(', ') + '.' : `Location score ${score}/100.` };
  }

  if (school == null && walk == null && commuteMinutes == null && appreciation3yrPct == null) return null;

  const subs: number[] = [];
  const pts: string[] = [];
  if (school != null) { subs.push(Math.min(100, Math.max(0, school * 10))); pts.push(`Schools ${school}/10`); }
  if (walk != null) { subs.push(Math.min(100, Math.max(0, walk))); pts.push(`Walk ${walk}`); }
  if (commuteMinutes != null) {
    subs.push(commuteMinutes <= 15 ? 90 : commuteMinutes <= 25 ? 80 : commuteMinutes <= 35 ? 70 : commuteMinutes <= 45 ? 58 : commuteMinutes <= 60 ? 44 : 30);
    pts.push(`${commuteMinutes}min commute`);
  }
  if (appreciation3yrPct != null) {
    subs.push(appreciation3yrPct >= 12 ? 92 : appreciation3yrPct >= 7 ? 84 : appreciation3yrPct >= 3 ? 72 : appreciation3yrPct >= 0 ? 55 : 35);
    pts.push(`${appreciation3yrPct >= 0 ? '+' : ''}${appreciation3yrPct}% 3yr appreciation`);
  }
  const score = Math.round(subs.reduce((a, b) => a + b, 0) / subs.length);
  return { score, summary: pts.join(', ') + '.' };
}

// ── L5 — Rate Intelligence (new — see module header) ────────────────────────

export interface ScoreL5Input {
  /** Borrower's resolved lender par rate (card_fair_par_rate / lenderParRate). */
  lenderParRate?: number | null;
  /** Real OBMMI credit/LTV segment rates — conventional loans only. */
  conformingSegments?: { seriesId: string; rate: number }[] | null;
  /** FRED national par rate — fallback baseline for non-conventional / thin-segment cases. */
  nationalParRate?: number | null;
  loanType?: string;
  /** True when rateAnchorSource === 'synthetic' (no real OBMMI backing) — appends "(estimated)" rather than blocking the score. */
  synthetic?: boolean;
}

export function scoreL5({
  lenderParRate, conformingSegments, nationalParRate, loanType, synthetic,
}: ScoreL5Input): { score: number; summary: string } | null {
  if (lenderParRate == null) return null;
  const estTag = synthetic ? ' (estimated)' : '';

  if (loanType === 'conventional' && conformingSegments) {
    const rates = conformingSegments.map(s => s.rate).filter((r): r is number => r != null);
    if (rates.length >= 2) {
      const best = Math.min(...rates);
      const worst = Math.max(...rates);
      const rank = rates.filter(r => r >= lenderParRate).length;
      const score = worst === best
        ? 70
        : Math.round(Math.min(100, Math.max(0, ((worst - lenderParRate) / (worst - best)) * 100)));
      return { score, summary: `${lenderParRate.toFixed(3)}% beats ${rank}/${rates.length} market segments${estTag}` };
    }
  }

  if (nationalParRate != null) {
    const spreadPts = (lenderParRate - nationalParRate) * 100; // basis points
    const score = Math.round(Math.min(100, Math.max(0, 50 - spreadPts * 0.5)));
    const sign = spreadPts >= 0 ? '+' : '';
    return { score, summary: `${lenderParRate.toFixed(3)}% vs national par ${nationalParRate.toFixed(3)}% (${sign}${spreadPts.toFixed(0)}bps)${estTag}` };
  }

  return null;
}

// ── Composite ────────────────────────────────────────────────────────────

export const COMPOSITE_WEIGHTS = { l1: 0.30, l2: 0.20, l3: 0.20, l4: 0.15, l5: 0.15 } as const;

export interface CompositeLevels {
  l1?: number | null;
  l2?: number | null;
  l3?: number | null;
  l4?: number | null;
  l5?: number | null;
}

export function computeComposite(levels: CompositeLevels): number | null {
  const raw: { s: number | null | undefined; w: number }[] = (Object.keys(COMPOSITE_WEIGHTS) as (keyof typeof COMPOSITE_WEIGHTS)[])
    .map(k => ({ s: levels[k], w: COMPOSITE_WEIGHTS[k] }));
  const entries = raw.filter((e): e is { s: number; w: number } => e.s != null);
  if (entries.length < 2) return null;
  const totalW = entries.reduce((a, e) => a + e.w, 0);
  const weighted = entries.reduce((a, e) => a + e.s * e.w, 0);
  return Math.round(weighted / totalW);
}

// ── Verdict ──────────────────────────────────────────────────────────────

export interface Verdict {
  label: string;
  color: string;
}

export function verdict(score: number): Verdict {
  if (score >= 85) return { label: 'Strong Buy', color: '#4ade80' };
  if (score >= 70) return { label: 'Ready to Offer', color: '#4ade80' };
  if (score >= 55) return { label: 'Buy with Caution', color: '#fbbf24' };
  if (score >= 40) return { label: 'Watch the Market', color: '#fbbf24' };
  return { label: 'Hold Off', color: '#f87171' };
}

export function verdictLabel(score: number): string {
  return verdict(score).label;
}
