// lib/propertyIntelligence.ts
//
// Canonical Property Intelligence data assembly — covers the FULL existing
// `properties` corpus (357 rows as of 2026-08-24), not just a hand-picked
// subset. Renders ONLY already-enriched HomeRates intelligence; no
// Grok/Tavily/enrichment call is ever made from this module.
//
// Real corpus shape (audited directly, not assumed): most `properties` rows
// (enrichment_source='redfin'/'web_search') have their real intelligence in
// `property_snapshots` (type='full' -- price, listingStatus, annualTaxes,
// hoaMonthly, comps count via grok) and `grok_property_cache` (comps,
// location_intelligence, AVM estimates), matched by normalized address --
// NOT in `featured_properties`, which only covers properties that went
// through a full consumer Decision Score flow (112 of 357). Where
// featured_properties IS present, its pre-computed L2/L3/L4 are read
// directly (never recomputed, to stay byte-identical with what a consumer
// actually saw). Where it is absent, L2/L3/L4 are computed live from the
// same merged snapshot/grok inputs using the exact same pure functions
// (lib/scoring/decisionScore.ts) -- this is applying the existing,
// approved methodology to existing cached data, not new scoring logic.
//
// Two entry points, deliberately split for cost control:
//   - listIndexEligiblePropertyIds() -- cheap, ~4 bulk queries total,
//     NO LLPA/OBMMI/financing engine calls. Used by the sitemap and the
//     publish cron. Must stay cheap enough to run over the whole corpus.
//   - getPropertyIntelligenceData(id) -- full page data, including the
//     financing engine. Only ever called for one property at a time
//     (a real page request), and short-circuits before any engine call
//     if the property isn't eligible.

import { getSupabase } from './supabaseServer';
import { getLatest } from './market-data';
import {
  computeLLPA,
  resolveObmmiSeriesId,
  LLPA_DATA_SOURCE,
  LLPA_MATRIX_EFFECTIVE_DATE,
  LLPA_DISCLAIMER,
  type LLPAInput,
} from './pricing/llpa-engine';
import { getStateLimitInfo, getConformingStatus } from './pricing/conforming-limits';
import { estimateJumboAnchor } from './pricing/jumboEstimate';
import { calculateMortgage } from './mortgageCalculator';
import { lookupTaxRate } from './property/taxTable';
import { scoreL2, scoreL3, scoreL4, resolveAvm as resolveAvmPair } from './scoring/decisionScore';

export type FactLabel =
  | 'PROPERTY FACT'
  | 'MARKET FACT'
  | 'ILLUSTRATIVE ASSUMPTION'
  | 'DERIVED CALCULATION'
  | 'ESTIMATE'
  | 'AI INTERPRETATION';

export interface LabeledValue<T> {
  label: FactLabel;
  value: T;
  source?: string;
  asOf?: string | null;
}

export interface ComparableSale {
  address: string;
  soldPrice: number | null;
  soldDate: string | null;
  sqft: number | null;
  pricePerSqft: number | null;
}

export type LifecycleStatus = 'active' | 'pending' | 'sold' | 'off_market' | 'unknown';

export interface PropertyIntelligenceData {
  id: string;
  eligibility: 'index' | 'noindex' | 'unavailable';
  ineligibleReasons: string[];
  lifecycleStatus: LifecycleStatus;

  address: LabeledValue<string>;
  city: string | null;
  state: string | null;
  zip: string | null;
  propertyFacts: {
    propertyType: LabeledValue<string | null>;
    beds: LabeledValue<number | null>;
    baths: LabeledValue<number | null>;
    sqft: LabeledValue<number | null>;
  };

  valuation: {
    avm: LabeledValue<number | null>;
    avmSources: string[];
    listPrice: LabeledValue<number | null>;
    lastSalePrice: number | null;
    lastSaleDate: string | null;
    comparables: ComparableSale[];
    freshness: string | null;
  };

  financing: {
    scenario: { creditScore: number; downPaymentPct: number; loanType: 'conventional' | 'jumbo'; occupancy: 'primary'; termYears: 30 };
    loanAmount: LabeledValue<number>;
    ltv: LabeledValue<number>;
    conformingStatus: 'standard' | 'high_balance' | 'above_limit';
    conformingCeiling: LabeledValue<number>;
    marketRate: LabeledValue<{ rate: number; observationDate: string | null; seriesLabel: string }>;
    lenderParRate: LabeledValue<number>;
    monthlyPI: LabeledValue<number>;
    totalLLPAPoints: number;
    llpaDataSource: string;
    llpaEffectiveDate: string;
    llpaDisclaimer: string;
  } | null;

  ownershipCost: {
    taxRate: LabeledValue<{ rate: number; level: 'actual' | 'county' | 'state' | 'national' }>;
    monthlyTax: LabeledValue<number>;
    monthlyInsurance: LabeledValue<number>;
    monthlyHoa: LabeledValue<number | null>;
    estimatedMonthlyPITI: LabeledValue<number>;
  } | null;

  decisionIntelligence: {
    l2: { score: number; summary: string } | null;
    l3: { score: number; summary: string } | null;
    l4: { score: number; summary: string } | null;
    source: 'featured_properties' | 'computed';
    methodologyVersion: string;
    computedAt: string | null;
    strengths: string[];
    concerns: string[];
    missing: string[];
  } | null;

  locationIntelligence: {
    narrative: LabeledValue<string> | null;
    subScores: { metric: string; rating: string; description: string }[];
  } | null;

  market: {
    medianDom: LabeledValue<number | null>;
    medianPrice: LabeledValue<number | null>;
    saleToListPct: LabeledValue<number | null>;
  };

  provenance: {
    propertyEnrichedAt: string | null;
    propertyEnrichmentSource: string | null;
    intelligenceComputedAt: string | null;
    snapshotFetchedAt: string | null;
    grokCacheFetchedAt: string | null;
  };
}

const METHODOLOGY_VERSION = 'Decision Score L1-L4 (locked 2026-08-19), L2-L4 property-centered subset';

// Two different normalization conventions genuinely coexist in this codebase's
// existing tables -- confirmed directly against real rows, not assumed:
//   - featured_properties.address_norm: lower(trim(address)) -- punctuation
//     (commas) intact. Matches this table's own migration comment.
//   - grok_property_cache.address_normalized: written by
//     app/api/beta/grok-property/route.ts's normalizeAddressStrict(), which
//     also strips all punctuation. A loose-normalized lookup key silently
//     misses every row written that way -- confirmed live: a freshly deep-
//     enriched address ("441 Potter Way, Ladera Ranch, CA 92694") stored as
//     "441 potter way ladera ranch ca 92694" (no commas), while the loose key
//     would have looked up "441 potter way, ladera ranch, ca 92694" (commas
//     intact) and never found it -- so a just-enriched property kept being
//     treated as never-enriched.
// Use the matching one for each table; never assume they're interchangeable.
function normAddr(full: string): string {
  return full.trim().toLowerCase();
}
function normAddrStrict(full: string): string {
  return full.trim().toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && !Number.isNaN(n) ? n : null;
}

function mergeAvm(vals: (number | null | undefined)[]): { avm: number | null; count: number } {
  const clean = vals.filter((v): v is number => v != null && v > 0);
  if (clean.length === 0) return { avm: null, count: 0 };
  return { avm: Math.round(clean.reduce((a, b) => a + b, 0) / clean.length), count: clean.length };
}

function lifecycleFromStatus(status: string | null | undefined): LifecycleStatus {
  switch (status) {
    case 'FOR_SALE': return 'active';
    case 'PENDING': return 'pending';
    case 'SOLD': return 'sold';
    case 'OFF_MARKET': return 'off_market';
    default: return 'unknown';
  }
}

// ── Shared merge: properties + latest snapshot + grok cache + featured_properties ──
// No engine/network calls -- pure data assembly, cheap enough for a bulk pass.

interface RawMerge {
  prop: { id: string; address_full: string; address_line: string | null; city: string | null; state: string | null; zip: string | null; beds: number | null; baths: number | null; sqft: number | null; property_type: string | null; enriched_at: string | null; enrichment_source: string | null; latest_value: number | null; latest_value_low: number | null; latest_value_high: number | null; latest_listing_status: string | null };
  snapshot: Record<string, unknown> | null;
  snapshotFetchedAt: string | null;
  grok: Record<string, unknown> | null;
  grokFetchedAt: string | null;
  fp: { l2_score: number | null; l2_summary: string | null; l3_score: number | null; l3_summary: string | null; l4_score: number | null; l4_summary: string | null; score_computed_at: string | null } | null;
  avm: number | null;
  avmSources: string[];
  comparables: ComparableSale[];
  listPrice: number | null;
  city: string | null;
  state: string | null;
  lifecycleStatus: LifecycleStatus;
  eligibility: 'index' | 'noindex' | 'unavailable';
  ineligibleReasons: string[];
}

async function assembleRaw(propertyId: string): Promise<RawMerge | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data: prop } = await sb
    .from('properties')
    .select('id, address_full, address_line, city, state, zip, beds, baths, sqft, property_type, enriched_at, enrichment_source, latest_value, latest_value_low, latest_value_high, latest_listing_status')
    .eq('id', propertyId)
    .maybeSingle();
  if (!prop) return null;

  const addressNorm = normAddr(prop.address_full);
  const addressNormStrict = normAddrStrict(prop.address_full);

  const [{ data: snapRows }, { data: grokRows }, { data: fpRow }] = await Promise.all([
    sb.from('property_snapshots').select('data, fetched_at').eq('property_id', prop.id).eq('snapshot_type', 'full').order('fetched_at', { ascending: false }).limit(1),
    sb.from('grok_property_cache').select('grok_result, fetched_at').eq('address_normalized', addressNormStrict).maybeSingle(),
    sb.from('featured_properties').select('l2_score, l2_summary, l3_score, l3_summary, l4_score, l4_summary, score_computed_at, raw_data').eq('address_norm', addressNorm).maybeSingle(),
  ]);

  const snapshot = (snapRows?.[0]?.data ?? null) as Record<string, unknown> | null;
  const snapshotFetchedAt = snapRows?.[0]?.fetched_at ?? null;
  const grok = (grokRows?.grok_result ?? null) as Record<string, unknown> | null;
  const grokFetchedAt = grokRows?.fetched_at ?? null;
  const fpRaw = (fpRow?.raw_data ?? {}) as Record<string, unknown>;

  const avmCandidates = [
    parseNum(prop.latest_value),
    parseNum(snapshot?.estimatedValue),
    parseNum(grok?.zillow_estimate ?? fpRaw.zillow_estimate),
    parseNum(grok?.redfin_estimate ?? fpRaw.redfin_estimate),
  ];
  const { avm, count: avmCount } = mergeAvm(avmCandidates);
  const avmSources: string[] = [];
  if (avmCandidates[0] != null) avmSources.push('Redfin scrape estimate (canonical)');
  if (avmCandidates[1] != null) avmSources.push('Redfin scrape estimate (snapshot)');
  if (avmCandidates[2] != null) avmSources.push('Zillow estimate');
  if (avmCandidates[3] != null) avmSources.push('Redfin estimate (Grok)');

  const rawComps = Array.isArray(grok?.comparable_sales) ? (grok!.comparable_sales as Record<string, unknown>[])
    : Array.isArray(fpRaw.comparable_sales) ? (fpRaw.comparable_sales as Record<string, unknown>[]) : [];
  const comparables: ComparableSale[] = rawComps
    .filter(c => typeof c.address === 'string')
    .map(c => ({
      address: c.address as string,
      soldPrice: parseNum(c.sold_price),
      soldDate: typeof c.sold_date === 'string' ? c.sold_date : null,
      sqft: parseNum(c.sqft),
      pricePerSqft: parseNum(c.price_per_sqft),
    }));

  const listPrice = parseNum(snapshot?.price);
  const city = prop.city ?? (typeof snapshot?.city === 'string' ? snapshot.city as string : null);
  const state = prop.state ?? (typeof snapshot?.state === 'string' ? snapshot.state as string : null);
  // properties.latest_listing_status is written directly by /api/property/lookup on every
  // lookup (321/557 rows as of the corpus audit) -- a wider, more current source than the
  // latest property_snapshots row alone, which only exists for addresses fetched through
  // that specific pipeline. Prefer it; fall back to the snapshot for older rows.
  const rawStatus = prop.latest_listing_status ?? (typeof snapshot?.listingStatus === 'string' ? snapshot.listingStatus as string : null);
  const lifecycleStatus = lifecycleFromStatus(rawStatus);

  const enrichedAt = prop.enriched_at ?? snapshotFetchedAt ?? grokFetchedAt ?? fpRow?.score_computed_at ?? null;

  const reasons: string[] = [];
  if (!enrichedAt) reasons.push('No enrichment timestamp available.');
  if (avm == null) reasons.push('No usable AVM available.');
  if (comparables.length < 1) reasons.push('No comparable sale on record.');
  if (!city || !state) reasons.push('Location (city/state) not resolved.');
  // Sold/off-market/unknown properties are never actively indexed -- they may
  // still render (historical record) if they otherwise meet the bar.
  const meetsDataBar = reasons.length === 0;
  const eligibility: RawMerge['eligibility'] =
    meetsDataBar && (lifecycleStatus === 'active' || lifecycleStatus === 'pending') ? 'index'
    : (avm != null || comparables.length > 0) ? 'noindex'
    : 'unavailable';

  return {
    prop, snapshot, snapshotFetchedAt, grok, grokFetchedAt,
    fp: fpRow ? { l2_score: fpRow.l2_score, l2_summary: fpRow.l2_summary, l3_score: fpRow.l3_score, l3_summary: fpRow.l3_summary, l4_score: fpRow.l4_score, l4_summary: fpRow.l4_summary, score_computed_at: fpRow.score_computed_at } : null,
    avm, avmSources, comparables, listPrice, city, state, lifecycleStatus, eligibility, ineligibleReasons: reasons,
  };
}

// ── Cheap bulk pass, shared by the sitemap and the deep-enrichment cron:
// no engine calls, 4 queries total regardless of corpus size. Both callers
// MUST derive eligibility from this single merge so "what counts as
// INDEX-worthy" can never drift between the two crons. ──

interface BulkSummary {
  id: string;
  addressFull: string;
  avm: number | null;
  comps: number;
  city: string | null;
  state: string | null;
  enrichedAt: string | null;
  status: LifecycleStatus;
  hasFeaturedProperties: boolean;
  hasL234: boolean;
  hasListPrice: boolean;
  hasDeepGrok: boolean;
  grokFetchedAt: string | null;
  searchCount: number;
  daysOnMarket: number | null;
  meetsDataBar: boolean;
}

async function bulkMergeCorpus(): Promise<BulkSummary[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data: props } = await sb
    .from('properties')
    .select('id, address_full, city, state, enriched_at, latest_value, latest_value_low, latest_listing_status');
  if (!props || props.length === 0) return [];

  const [{ data: snaps }, { data: groks }, { data: fps }] = await Promise.all([
    sb.from('property_snapshots').select('property_id, data, fetched_at').eq('snapshot_type', 'full').order('fetched_at', { ascending: false }),
    sb.from('grok_property_cache').select('address_normalized, grok_result, fetched_at'),
    sb.from('featured_properties').select('address_norm, score_computed_at, l2_score, l3_score, l4_score, search_count'),
  ]);

  const latestSnapByProperty = new Map<string, { data: Record<string, unknown>; fetched_at: string }>();
  for (const s of snaps ?? []) {
    if (!latestSnapByProperty.has(s.property_id)) latestSnapByProperty.set(s.property_id, { data: s.data, fetched_at: s.fetched_at });
  }
  const grokByAddr = new Map<string, { result: Record<string, unknown>; fetched_at: string }>();
  for (const g of groks ?? []) grokByAddr.set(g.address_normalized, { result: g.grok_result, fetched_at: g.fetched_at });
  const fpByAddr = new Map<string, { score_computed_at: string | null; l2_score: number | null; l3_score: number | null; l4_score: number | null; search_count: number | null }>();
  for (const f of fps ?? []) fpByAddr.set(f.address_norm, f);

  return props.map((p) => {
    const addressNorm = normAddr(p.address_full);
    const addressNormStrict = normAddrStrict(p.address_full);
    const snap = latestSnapByProperty.get(p.id) ?? null;
    const grok = grokByAddr.get(addressNormStrict) ?? null;
    const fp = fpByAddr.get(addressNorm) ?? null;

    const avmVals = [parseNum(p.latest_value), parseNum(snap?.data?.estimatedValue), parseNum(grok?.result?.zillow_estimate), parseNum(grok?.result?.redfin_estimate)];
    const { avm } = mergeAvm(avmVals);
    const comps = Array.isArray(grok?.result?.comparable_sales) ? (grok!.result.comparable_sales as unknown[]).length : 0;
    const city = p.city ?? snap?.data?.city ?? null;
    const state = p.state ?? snap?.data?.state ?? null;
    const enrichedAt = p.enriched_at ?? snap?.fetched_at ?? grok?.fetched_at ?? fp?.score_computed_at ?? null;
    const rawStatus = p.latest_listing_status ?? (typeof snap?.data?.listingStatus === 'string' ? snap!.data.listingStatus as string : null);
    const status = lifecycleFromStatus(rawStatus);
    const hasL234 = !!fp && (fp.l2_score != null || fp.l3_score != null || fp.l4_score != null);
    const hasListPrice = parseNum(snap?.data?.price) != null;

    return {
      id: p.id, addressFull: p.address_full, avm, comps, city, state, enrichedAt, status,
      hasFeaturedProperties: !!fp, hasL234, hasListPrice,
      hasDeepGrok: grok?.result?.deep_analysis === true,
      grokFetchedAt: grok?.fetched_at ?? null,
      searchCount: fp?.search_count ?? 0,
      daysOnMarket: parseNum(snap?.data?.daysOnMarket),
      meetsDataBar: !!enrichedAt && avm != null && comps >= 1 && !!city && !!state,
    };
  });
}

export async function listIndexEligiblePropertyIds(): Promise<{ id: string; lastModified: string | null }[]> {
  const rows = await bulkMergeCorpus();
  return rows
    .filter(r => r.meetsDataBar && (r.status === 'active' || r.status === 'pending'))
    .map(r => ({ id: r.id, lastModified: r.enrichedAt }));
}

// ── Deep-enrichment candidate selection (Part 3) ──
// NOINDEX/DO-NOT-PUBLISH properties with enough identity to attempt deeper
// analysis, missing AVM and/or comps, not already deep-enriched and fresh.
// Prioritized (not filtered) by: active/pending status, existing
// featured_properties record, existing L2-L4, existing financing inputs
// (a resolved list price), recency. search_count is used only as an
// internal ranking signal here -- never returned or rendered publicly.

export interface DeepEnrichmentCandidate {
  id: string;
  addressFull: string;
  hasAvm: boolean;
  comps: number;
  priorityScore: number;
}

const DEEP_FRESH_MS = 7 * 24 * 60 * 60 * 1000; // matches grok_property_cache's own sold/off-market TTL

export async function listDeepEnrichmentCandidates(): Promise<DeepEnrichmentCandidate[]> {
  const rows = await bulkMergeCorpus();
  const now = Date.now();

  return rows
    .filter(r => {
      if (!r.city || !r.state) return false; // not enough identity to attempt
      if (r.avm != null && r.comps >= 1) return false; // already has what deep enrichment would add
      if (r.hasDeepGrok && r.grokFetchedAt && (now - new Date(r.grokFetchedAt).getTime()) < DEEP_FRESH_MS) return false; // recently deep-enriched already
      return true;
    })
    .map(r => {
      let priorityScore = 0;
      // Pending outranks merely-active: a pending listing already has a
      // real accepted offer -- a stronger, more concrete demand signal than
      // simply being on the market. Both real market_status facts, not
      // AI-inferred popularity (see lib/propertyAcquisition.ts's
      // desirabilityScore(), which this mirrors for the CSV/discovery
      // acquisition path -- same reasoning, applied here to properties
      // already anchored rather than incoming candidates).
      if (r.status === 'pending') priorityScore += 45;
      else if (r.status === 'active') priorityScore += 35;
      if (r.daysOnMarket != null && r.daysOnMarket >= 0) {
        const dom = r.daysOnMarket;
        priorityScore += dom <= 7 ? 20 : dom <= 21 ? 14 : dom <= 45 ? 7 : 0;
      }
      if (r.hasFeaturedProperties) priorityScore += 20;
      if (r.hasL234) priorityScore += 15;
      if (r.hasListPrice) priorityScore += 10;
      priorityScore += Math.min(r.searchCount, 10); // small, capped nudge from organic interest
      return { id: r.id, addressFull: r.addressFull, hasAvm: r.avm != null, comps: r.comps, priorityScore };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

// ── Full page data: only called for one property per real request ──

export async function getPropertyIntelligenceData(propertyId: string): Promise<PropertyIntelligenceData | null> {
  const raw = await assembleRaw(propertyId);
  if (!raw) return null;
  const { prop, snapshot, grok, fp } = raw;

  const li = grok?.location_intelligence as Record<string, unknown> | undefined;
  const locationIntelligence = li
    ? {
        narrative: typeof li.narrative === 'string' ? { label: 'AI INTERPRETATION' as const, value: li.narrative } : null,
        subScores: Array.isArray(li.sub_scores)
          ? (li.sub_scores as Record<string, unknown>[]).map(s => ({ metric: String(s.metric ?? ''), rating: String(s.rating ?? ''), description: String(s.description ?? '') }))
          : [],
      }
    : null;

  const strengths = Array.isArray(li?.strengths) ? (li!.strengths as string[]) : [];
  const tradeoffs = Array.isArray(li?.tradeoffs) ? (li!.tradeoffs as string[]) : [];
  const missing: string[] = [];
  if (raw.avm == null) missing.push('No automated valuation estimate on record.');
  if (raw.comparables.length === 0) missing.push('No comparable sale on record.');
  if (!snapshot?.hoaMonthly) missing.push('HOA fee not confirmed.');

  // Decision Intelligence -- prefer featured_properties' pre-computed scores;
  // else compute live from the same merged inputs using the same pure functions.
  let l2: { score: number; summary: string } | null = null;
  let l3: { score: number; summary: string } | null = null;
  let l4: { score: number; summary: string } | null = null;
  let diSource: 'featured_properties' | 'computed' = 'computed';
  let diComputedAt: string | null = null;

  if (fp) {
    l2 = fp.l2_score != null ? { score: fp.l2_score, summary: fp.l2_summary ?? '' } : null;
    l3 = fp.l3_score != null ? { score: fp.l3_score, summary: fp.l3_summary ?? '' } : null;
    l4 = fp.l4_score != null ? { score: fp.l4_score, summary: fp.l4_summary ?? '' } : null;
    diSource = 'featured_properties';
    diComputedAt = fp.score_computed_at;
  } else if (raw.eligibility !== 'unavailable') {
    if (raw.listPrice != null && raw.avm != null) l2 = scoreL2({ listPrice: raw.listPrice, avm: raw.avm });
    const domMedian = parseNum(grok?.market_median_dom);
    const stlRaw = parseNum(grok?.market_sale_to_list);
    l3 = scoreL3({ domMedian, saleToList: stlRaw != null ? stlRaw / 100 : null, subjectDom: parseNum(snapshot?.daysOnMarket), socialProofScore: parseNum(snapshot?.socialProofScore) });
    const overallScore = parseNum(li?.overall_score);
    if (overallScore != null) l4 = scoreL4({ overallScore, subScores: locationIntelligence?.subScores.map(s => ({ metric: s.metric, rating: s.rating })) });
    diComputedAt = raw.snapshotFetchedAt ?? raw.grokFetchedAt ?? null;
  }

  const decisionIntelligence = (l2 || l3 || l4)
    ? { l2, l3, l4, source: diSource, methodologyVersion: METHODOLOGY_VERSION, computedAt: diComputedAt, strengths, concerns: tradeoffs, missing }
    : null;

  const provenance = {
    propertyEnrichedAt: prop.enriched_at,
    propertyEnrichmentSource: prop.enrichment_source,
    intelligenceComputedAt: fp?.score_computed_at ?? raw.grokFetchedAt ?? raw.snapshotFetchedAt ?? null,
    snapshotFetchedAt: raw.snapshotFetchedAt,
    grokCacheFetchedAt: raw.grokFetchedAt,
  };

  const base = {
    id: prop.id,
    eligibility: raw.eligibility,
    ineligibleReasons: raw.ineligibleReasons,
    lifecycleStatus: raw.lifecycleStatus,
    address: { label: 'PROPERTY FACT' as const, value: prop.address_full },
    city: raw.city,
    state: raw.state,
    zip: prop.zip,
    propertyFacts: {
      propertyType: { label: 'PROPERTY FACT' as const, value: prop.property_type },
      beds: { label: 'PROPERTY FACT' as const, value: prop.beds ?? parseNum(snapshot?.beds) },
      baths: { label: 'PROPERTY FACT' as const, value: prop.baths ?? parseNum(snapshot?.baths) },
      sqft: { label: 'PROPERTY FACT' as const, value: prop.sqft ?? parseNum(snapshot?.sqft) },
    },
    valuation: {
      avm: { label: 'ESTIMATE' as const, value: raw.avm, source: raw.avmSources.length ? raw.avmSources.join(' + averaged with ') : undefined, asOf: provenance.intelligenceComputedAt },
      avmSources: raw.avmSources,
      listPrice: { label: 'PROPERTY FACT' as const, value: raw.listPrice },
      lastSalePrice: parseNum(snapshot?.lastSalePrice),
      lastSaleDate: typeof snapshot?.lastSaleDate === 'string' ? snapshot.lastSaleDate as string : null,
      comparables: raw.comparables,
      freshness: provenance.intelligenceComputedAt,
    },
    decisionIntelligence,
    locationIntelligence,
    market: {
      medianDom: { label: 'MARKET FACT' as const, value: parseNum(grok?.market_median_dom) },
      medianPrice: { label: 'MARKET FACT' as const, value: parseNum(grok?.market_median_price) },
      saleToListPct: { label: 'MARKET FACT' as const, value: parseNum(grok?.market_sale_to_list) },
    },
    provenance,
  };

  if (raw.eligibility === 'unavailable') {
    return { ...base, financing: null, ownershipCost: null };
  }

  // ── Financing engine -- only ever runs for a property that already passed
  // the data-presence threshold, and only for one property per call. ──
  const price = raw.listPrice ?? raw.avm ?? 0;
  const creditScore = 740;
  const downPaymentPct = 20;
  const stateLimitInfo = getStateLimitInfo(raw.state ?? '');
  const provisionalLoanAmount = Math.round(price * (1 - downPaymentPct / 100));
  const conformingStatus = getConformingStatus(provisionalLoanAmount, stateLimitInfo.ceiling);
  const loanType: 'conventional' | 'jumbo' = conformingStatus === 'above_limit' ? 'jumbo' : 'conventional';
  const ltv = 100 - downPaymentPct;

  const obmmiSeriesId = resolveObmmiSeriesId(loanType, creditScore, ltv);
  const [parRateObs, marketObs, jumboResult] = await Promise.all([
    getLatest('MORTGAGE30US'),
    obmmiSeriesId && loanType !== 'jumbo' ? getLatest(obmmiSeriesId) : Promise.resolve(null),
    loanType === 'jumbo' ? estimateJumboAnchor({ creditScore, ltv, occupancy: 'primary', loanPurpose: 'purchase' }) : Promise.resolve(null),
  ]);
  const parRate = parRateObs?.value ?? 6.82;
  const marketRate = loanType === 'jumbo' ? jumboResult?.anchorRate ?? null : marketObs?.value ?? null;

  const engineInput: LLPAInput = {
    creditScore, ltv, occupancy: 'primary', loanPurpose: 'purchase', propertyType: 'sfr',
    loanAmount: provisionalLoanAmount, lockDays: 30, loanType, highBalanceCeiling: stateLimitInfo.ceiling,
  };
  const llpaResult = computeLLPA(engineInput, parRate, marketRate, jumboResult ? {
    baseSource: jumboResult.baseSource, spreadUsed: jumboResult.spreadUsed, spreadSource: jumboResult.spreadSource,
    adjustmentDelta: jumboResult.adjustmentDelta, conformingRate: jumboResult.conformingRate, clamped: jumboResult.clamped,
  } : undefined);

  const mortgage = price > 0 ? calculateMortgage({ price, downPaymentPct, rate: llpaResult.lenderParRate, termYears: 30 }) : null;
  const realAnnualTax = parseNum(snapshot?.annualTaxes);
  const taxInfo = lookupTaxRate(raw.state ?? '', raw.city ?? null);
  const monthlyTax = realAnnualTax != null ? Math.round(realAnnualTax / 12) : (mortgage ? Math.round((price * taxInfo.rate) / 12) : 0);
  const monthlyInsurance = mortgage ? Math.round((price * 0.003) / 12) : 0;
  const hoaMonthly = parseNum(snapshot?.hoaMonthly);
  const estimatedPITI = mortgage ? Math.round(mortgage.monthlyPI + monthlyTax + monthlyInsurance + (hoaMonthly ?? 0)) : 0;
  const marketRateSeriesLabel = loanType === 'jumbo'
    ? 'OBMMI Jumbo 30yr Fixed (estimated, credit/LTV-adjusted)'
    : obmmiSeriesId ? `OBMMI Conventional 30yr Fixed — FICO ${creditScore}, LTV ${ltv <= 80 ? '≤80' : '>80'}`
    : 'National 30yr fixed par rate (FRED MORTGAGE30US)';

  return {
    ...base,
    financing: {
      scenario: { creditScore, downPaymentPct, loanType, occupancy: 'primary', termYears: 30 },
      loanAmount: { label: 'DERIVED CALCULATION', value: provisionalLoanAmount },
      ltv: { label: 'ILLUSTRATIVE ASSUMPTION', value: ltv },
      conformingStatus,
      conformingCeiling: { label: 'MARKET FACT', value: stateLimitInfo.ceiling, source: `FHFA 2026 conforming loan limit, ${stateLimitInfo.stateName}` },
      marketRate: { label: 'MARKET FACT', value: { rate: marketRate ?? parRate, observationDate: loanType === 'jumbo' ? null : (marketObs?.observationDate ?? parRateObs?.observationDate ?? null), seriesLabel: marketRateSeriesLabel }, asOf: loanType === 'jumbo' ? null : (marketObs?.observationDate ?? parRateObs?.observationDate ?? null) },
      lenderParRate: { label: 'DERIVED CALCULATION', value: llpaResult.lenderParRate },
      monthlyPI: { label: 'DERIVED CALCULATION', value: mortgage ? Math.round(mortgage.monthlyPI) : 0 },
      totalLLPAPoints: llpaResult.totalLLPA,
      llpaDataSource: LLPA_DATA_SOURCE,
      llpaEffectiveDate: LLPA_MATRIX_EFFECTIVE_DATE,
      llpaDisclaimer: LLPA_DISCLAIMER,
    },
    ownershipCost: {
      taxRate: realAnnualTax != null
        ? { label: 'PROPERTY FACT', value: { rate: price > 0 ? realAnnualTax / price : 0, level: 'actual' }, source: 'Actual tax bill (Redfin listing data)' }
        : { label: taxInfo.level === 'county' ? 'MARKET FACT' : 'ESTIMATE', value: { rate: taxInfo.rate, level: taxInfo.level }, source: taxInfo.level === 'state' ? `${raw.state} average effective property tax rate` : 'National average effective property tax rate' },
      monthlyTax: { label: realAnnualTax != null ? 'DERIVED CALCULATION' : 'DERIVED CALCULATION', value: monthlyTax },
      monthlyInsurance: { label: 'ESTIMATE', value: monthlyInsurance, source: 'HomeRates.ai default: 0.3% of price annually' },
      monthlyHoa: { label: 'PROPERTY FACT', value: hoaMonthly },
      estimatedMonthlyPITI: { label: 'DERIVED CALCULATION', value: estimatedPITI },
    },
  };
}
