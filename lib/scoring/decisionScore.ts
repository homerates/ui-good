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
// L5 (Rate Intelligence) is NOT part of the Decision Score composite.
// Locked product decision, 2026-08-19: Composite Decision Score = L1-L4
// only. scoreL5() stays exported below for Rate Intelligence's own use as a
// separate, peer, first-class output (alongside Personal Fit) -- neither is
// folded into computeComposite(), and CompositeLevels has no l5 field.
//
// L1's per-program LTV curves (Conventional/FHA/VA/Jumbo) are HomeRates'
// own existing, already-approved scoring heuristic -- NOT a republished
// agency underwriting threshold and NOT an empirically validated risk
// model. Do not present these values, or the resulting L1 score, as an
// official agency determination anywhere they're surfaced. Program
// distinctions and LTV boundaries were sanity-checked against known agency
// program structure (VA's high-LTV tolerance with no PMI; FHA's ~96.5%
// typical LTV ceiling; the conventional 80% PMI threshold) as part of
// Decision Score consolidation (2026-08-19), but no score values were
// changed in that pass -- the VA/FHA curves are exactly what
// app/(consumer)/check-property/page.tsx already computed locally before
// this migration, and Conventional/Jumbo are decisionScore.ts's own
// pre-existing values. Changing any of these numbers is a separate product
// decision, not an engineering one.
//
// DTI is a HomeRates Financial Readiness (L1) signal only. It is never an
// LLPA/pricing input -- lib/pricing/llpa-engine.ts confirms directly from
// Fannie Mae's own Matrix change log that DTI-based LLPAs were introduced
// in 2023 and explicitly removed effective 01/24/24. Do not reintroduce a
// DTI-to-pricing path anywhere in the Rate Intelligence engine.

// ── L1 — Financial Readiness (LTV + optional DTI) ──────────────────────────

export interface ScoreL1Input {
  downPct: number;
  /** Only 'jumbo' changes the LTV thresholds; every other loan type shares the conventional ladder. */
  loanType: string;
  /** Back-end DTI %, omit/null to skip the adjustment entirely. */
  dti?: number | null;
}

// Four explicit program curves. VA and FHA are consolidated from
// app/(consumer)/check-property/page.tsx's pre-existing local logic (same
// values, now shared instead of duplicated); Conventional and Jumbo are
// decisionScore.ts's own pre-existing values, unchanged. See the module
// header for the boundary on presenting these as agency thresholds.
function ltvScoreForProgram(loanType: string, ltv: number): number {
  switch (loanType) {
    case 'va':     return ltv <= 0.80 ? 88 : 78;
    case 'fha':    return ltv <= 0.90 ? 72 : ltv <= 0.95 ? 65 : 58;
    case 'jumbo':  return ltv <= 0.75 ? 86 : ltv <= 0.80 ? 80 : 72;
    default:       return ltv <= 0.80 ? 85 : ltv <= 0.85 ? 78 : ltv <= 0.90 ? 70 : 60; // conventional
  }
}

export function scoreL1({ downPct, loanType, dti }: ScoreL1Input): { score: number; summary: string } {
  const ltv = 1 - downPct / 100;
  const isJumbo = loanType === 'jumbo';
  const ltvScore = ltvScoreForProgram(loanType, ltv);

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
  /** Additional already-0-100 sub-scores (e.g. transit_score, safety_score) averaged in alongside school/walk. */
  otherScores?: (number | null | undefined)[];
}

export function scoreL4({
  overallScore, subScores, school, walk, commuteMinutes, appreciation3yrPct, otherScores,
}: ScoreL4Input): { score: number; summary: string } | null {
  if (overallScore != null) {
    const score = Math.min(100, Math.max(0, Math.round(overallScore)));
    const pts = (subScores ?? []).slice(0, 3).map(s => `${s.metric}: ${s.rating}`);
    return { score, summary: pts.length ? pts.join(', ') + '.' : `Location score ${score}/100.` };
  }

  const cleanOthers = (otherScores ?? []).filter((s): s is number => s != null);
  if (school == null && walk == null && commuteMinutes == null && appreciation3yrPct == null && cleanOthers.length === 0) return null;

  const subs: number[] = [...cleanOthers];
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
  // Jumbo's "segments" are always an estimated table (lib/pricing/jumboEstimate.ts
  // buildEstimatedJumboSegments) -- no real per-credit-score/LTV OBMMI series
  // exists for jumbo -- so the estimated tag applies unconditionally there,
  // not just on the `synthetic` (cold-start-anchor) signal.
  const estTag = synthetic || loanType === 'jumbo' ? ' (estimated)' : '';

  if ((loanType === 'conventional' || loanType === 'jumbo') && conformingSegments) {
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

// ── AVM resolution helper (for scoreL2 callers) ─────────────────────────────
// Averages Zillow + Redfin estimates when both are available, else uses
// whichever exists. Pure -- callers already have these values in hand; this
// does not fetch anything. Compute the `avm` value passed into scoreL2 with
// this, rather than picking a single provider ad hoc per call site.

export function resolveAvm(zillowEstimate?: number | null, redfinEstimate?: number | null): number | null {
  const vals = [zillowEstimate, redfinEstimate].filter((v): v is number => v != null && v > 0);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

// ── Personal Fit — separate first-class output, NOT part of the composite ──
// Answers a different question than L2: does THIS specific listing fit THIS
// buyer's own stated budget, vs. L2's buyer-independent "is this priced
// fairly against the market" question. Extracted from
// app/(consumer)/check-property/page.tsx's pre-existing PITI-gap logic
// during Decision Score consolidation (2026-08-19) -- same formula, now
// shared rather than duplicated. Compute/display only for now -- not
// persisted; whether to retain it is a pending product decision.

export interface ScorePersonalFitInput {
  actualPITI: number;    // PITI for the actual property being evaluated
  scenarioPITI: number;  // buyer's stated budget/scenario PITI
  avm?: number | null;
  listPrice?: number | null;
}

export function scorePersonalFit({ actualPITI, scenarioPITI, avm, listPrice }: ScorePersonalFitInput): { score: number; summary: string } {
  const gapPct = scenarioPITI > 0 ? ((actualPITI - scenarioPITI) / scenarioPITI) * 100 : 0;
  const gapScore = gapPct <= 0 ? 90 : gapPct <= 5 ? 80 : gapPct <= 10 ? 70
    : gapPct <= 20 ? 58 : gapPct <= 35 ? 44 : 30;
  const gapSign = gapPct >= 0 ? '+' : '';
  const gapSummary = `PITI $${Math.round(actualPITI).toLocaleString()}/mo vs $${Math.round(scenarioPITI).toLocaleString()} budget (${gapSign}${gapPct.toFixed(0)}%)`;

  if (avm && listPrice) {
    const avmPrem = (listPrice - avm) / avm;
    const avmScore = avmPrem < -0.05 ? 92 : avmPrem < 0 ? 84 : avmPrem < 0.03 ? 76
      : avmPrem < 0.07 ? 65 : avmPrem < 0.12 ? 52 : avmPrem < 0.20 ? 38 : 22;
    const score = Math.round(gapScore * 0.65 + avmScore * 0.35);
    const premStr = `${avmPrem >= 0 ? '+' : ''}${(avmPrem * 100).toFixed(1)}%`;
    return { score, summary: `${gapSummary}. Listed ${premStr} vs AVM.` };
  }

  return { score: gapScore, summary: `${gapSummary}.` };
}

// ── Composite ────────────────────────────────────────────────────────────

// L1-L4 only. Locked product decision, 2026-08-19: Rate Intelligence (L5)
// is never part of the composite -- these are the original weights, not
// newly invented ones (reverted from the 30/20/20/15/15 split that existed
// only to make room for L5 in the composite math, before that placement
// was reconsidered).
export const COMPOSITE_WEIGHTS = { l1: 0.35, l2: 0.25, l3: 0.25, l4: 0.15 } as const;

export interface CompositeLevels {
  l1?: number | null;
  l2?: number | null;
  l3?: number | null;
  l4?: number | null;
  // l5 intentionally absent -- Rate Intelligence is a separate, peer,
  // first-class output (alongside Personal Fit below), never a composite
  // input. A caller trying to pass l5 here is a type error, not a silent
  // no-op.
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
