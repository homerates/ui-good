// lib/propertyIntelligencePilot.ts
//
// Data assembly for the canonical public Property Intelligence pilot
// (/property-intelligence/[id]). Renders ONLY already-enriched HomeRates
// intelligence — no Grok/Tavily call is made here. Every numeric output is
// tagged with a FactLabel so the page (and any machine reader) can tell a
// property fact from a market fact from an illustrative assumption.
//
// Reuses the existing, already-approved engines rather than reimplementing
// any methodology:
//   - lib/scoring/decisionScore.ts   -- L2-L4 are read pre-computed from
//     featured_properties (the DSC pipeline already ran scoreL2/L3/L4 and
//     stored the result; this module does not recompute them).
//   - lib/pricing/llpa-engine.ts     -- illustrative financing (LLPA + curve).
//   - lib/pricing/conforming-limits.ts -- conforming/high-balance/jumbo zone.
//   - lib/pricing/jumboEstimate.ts   -- jumbo anchor when the illustrative
//     loan amount exceeds the conforming ceiling.
//   - lib/mortgageCalculator.ts      -- P&I amortization.
//   - lib/property/taxTable.ts       -- state/county effective tax rate.
//   - lib/market-data                -- real FRED/OBMMI observations, with
//     their real observation date (never dropped, unlike the gap this pilot
//     was built to close elsewhere in the app).

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
  asOf?: string | null; // real timestamp only -- never a synthesized string
}

export interface ComparableSale {
  address: string;
  soldPrice: number | null;
  soldDate: string | null; // as returned by the source -- may be qualitative ("Recent"), never invented
  sqft: number | null;
  pricePerSqft: number | null;
}

export interface PropertyIntelligencePilotData {
  id: string;
  eligibility: 'index' | 'noindex' | 'unavailable';
  ineligibleReasons: string[];

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
    zillowEstimate: number | null;
    redfinEstimate: number | null;
    listPrice: LabeledValue<number | null>;
    comparables: ComparableSale[];
    freshness: string | null; // real score_computed_at timestamp
  };

  financing: {
    scenario: {
      creditScore: number;
      downPaymentPct: number;
      loanType: 'conventional' | 'jumbo';
      occupancy: 'primary';
      termYears: 30;
    };
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
    rateAnchorSource: 'obmmi' | 'synthetic';
  };

  ownershipCost: {
    taxRate: LabeledValue<{ rate: number; level: 'county' | 'state' | 'national' }>;
    monthlyTax: LabeledValue<number>;
    monthlyInsurance: LabeledValue<number>;
    estimatedMonthlyPITI: LabeledValue<number>;
  };

  decisionIntelligence: {
    l2: { score: number; summary: string } | null;
    l3: { score: number; summary: string } | null;
    l4: { score: number; summary: string } | null;
    compositeL2L4: number | null;
    methodologyVersion: string;
    computedAt: string | null; // real score_computed_at
  } | null;

  locationIntelligence: {
    narrative: LabeledValue<string> | null;
    strengths: string[];
    tradeoffs: string[];
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
  };
}

const METHODOLOGY_VERSION = 'Decision Score L1-L4 (locked 2026-08-19), L2-L4 property-centered subset';

function parseNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && !Number.isNaN(n) ? n : null;
}

function resolveAvm(zillow: number | null, redfin: number | null): number | null {
  const vals = [zillow, redfin].filter((v): v is number => v != null && v > 0);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export async function getPropertyIntelligencePilotData(
  propertyId: string,
): Promise<PropertyIntelligencePilotData | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data: prop } = await sb
    .from('properties')
    .select('id, address_full, address_line, city, state, zip, beds, baths, sqft, property_type, enriched_at, enrichment_source')
    .eq('id', propertyId)
    .maybeSingle();
  if (!prop) return null;

  const addressNorm = prop.address_full.trim().toLowerCase();
  const { data: fp } = await sb
    .from('featured_properties')
    .select('address, beds, baths, sqft, price, l2_score, l2_summary, l3_score, l3_summary, l4_score, l4_summary, composite_score, raw_data, score_computed_at')
    .eq('address_norm', addressNorm)
    .maybeSingle();

  const rd = (fp?.raw_data ?? {}) as Record<string, unknown>;
  const zillowEst = parseNum(rd.zillow_estimate);
  const redfinEst = parseNum(rd.redfin_estimate);
  const avm = resolveAvm(zillowEst, redfinEst);
  const listPrice = parseNum(fp?.price);

  const rawComps = Array.isArray(rd.comparable_sales) ? (rd.comparable_sales as Record<string, unknown>[]) : [];
  const comparables: ComparableSale[] = rawComps
    .filter(c => typeof c.address === 'string')
    .map(c => ({
      address: c.address as string,
      soldPrice: parseNum(c.sold_price),
      soldDate: typeof c.sold_date === 'string' ? c.sold_date : null,
      sqft: parseNum(c.sqft),
      pricePerSqft: parseNum(c.price_per_sqft),
    }));

  const li = rd.location_intelligence as Record<string, unknown> | undefined;
  const locationIntelligence = li
    ? {
        narrative: typeof li.narrative === 'string'
          ? { label: 'AI INTERPRETATION' as const, value: li.narrative }
          : null,
        strengths: Array.isArray(li.strengths) ? (li.strengths as string[]) : [],
        tradeoffs: Array.isArray(li.tradeoffs) ? (li.tradeoffs as string[]) : [],
        subScores: Array.isArray(li.sub_scores)
          ? (li.sub_scores as Record<string, unknown>[]).map(s => ({
              metric: String(s.metric ?? ''),
              rating: String(s.rating ?? ''),
              description: String(s.description ?? ''),
            }))
          : [],
      }
    : null;

  // ── Eligibility (§8 of the approved architecture): all four required ──
  const reasons: string[] = [];
  if (!prop.enriched_at) reasons.push('Property has no successful enrichment timestamp.');
  if (avm == null) reasons.push('No usable AVM (zillow/redfin estimate) available.');
  if (comparables.length < 1) reasons.push('No comparable sale on record.');
  if (!prop.city || !prop.state) reasons.push('Location (city/state) not resolved.');
  const eligibility: PropertyIntelligencePilotData['eligibility'] =
    reasons.length === 0 ? 'index' : (avm != null || comparables.length > 0) ? 'noindex' : 'unavailable';

  // ── Illustrative financing scenario (§5 of the approved architecture) ──
  // 740 credit score matches the site-wide default already used by
  // /rate-intelligence-engine's RateEngineClient.tsx -- not a new number.
  // 20% down, 30yr fixed, primary residence, conventional-unless-above-ceiling.
  const creditScore = 740;
  const downPaymentPct = 20;
  const price = listPrice ?? avm ?? 0;
  const stateLimitInfo = getStateLimitInfo(prop.state ?? '');
  const provisionalLoanAmount = Math.round(price * (1 - downPaymentPct / 100));
  const conformingStatus = getConformingStatus(provisionalLoanAmount, stateLimitInfo.ceiling);
  const loanType: 'conventional' | 'jumbo' = conformingStatus === 'above_limit' ? 'jumbo' : 'conventional';
  const ltv = 100 - downPaymentPct;

  const obmmiSeriesId = resolveObmmiSeriesId(loanType, creditScore, ltv);
  const [parRateObs, marketObs, jumboResult] = await Promise.all([
    getLatest('MORTGAGE30US'),
    obmmiSeriesId && loanType !== 'jumbo' ? getLatest(obmmiSeriesId) : Promise.resolve(null),
    loanType === 'jumbo'
      ? estimateJumboAnchor({ creditScore, ltv, occupancy: 'primary', loanPurpose: 'purchase' })
      : Promise.resolve(null),
  ]);
  const parRate = parRateObs?.value ?? 6.82; // same documented fallback as rate-intelligence-engine
  const marketRate = loanType === 'jumbo' ? jumboResult?.anchorRate ?? null : marketObs?.value ?? null;

  const engineInput: LLPAInput = {
    creditScore,
    ltv,
    occupancy: 'primary',
    loanPurpose: 'purchase',
    propertyType: 'sfr',
    loanAmount: provisionalLoanAmount,
    lockDays: 30,
    loanType,
    highBalanceCeiling: stateLimitInfo.ceiling,
  };
  const llpaResult = computeLLPA(engineInput, parRate, marketRate, jumboResult ? {
    baseSource: jumboResult.baseSource,
    spreadUsed: jumboResult.spreadUsed,
    spreadSource: jumboResult.spreadSource,
    adjustmentDelta: jumboResult.adjustmentDelta,
    conformingRate: jumboResult.conformingRate,
    clamped: jumboResult.clamped,
  } : undefined);

  const mortgage = price > 0
    ? calculateMortgage({ price, downPaymentPct, rate: llpaResult.lenderParRate, termYears: 30 })
    : null;

  const taxInfo = lookupTaxRate(prop.state ?? '', prop.city ?? null);
  const monthlyTax = mortgage ? Math.round((price * taxInfo.rate) / 12) : 0;
  // 0.3% annual insurance -- same documented default already public on
  // /property-intelligence's methodology page; not a new assumption.
  const monthlyInsurance = mortgage ? Math.round((price * 0.003) / 12) : 0;
  const estimatedPITI = mortgage ? Math.round(mortgage.monthlyPI + monthlyTax + monthlyInsurance) : 0;

  const marketRateSeriesLabel = loanType === 'jumbo'
    ? 'OBMMI Jumbo 30yr Fixed (estimated, credit/LTV-adjusted)'
    : obmmiSeriesId
      ? `OBMMI Conventional 30yr Fixed — ${creditScore >= 740 ? 'FICO 740+' : 'FICO segment'}, LTV ${ltv <= 80 ? '≤80' : '>80'}`
      : 'National 30yr fixed par rate (FRED MORTGAGE30US)';

  return {
    id: prop.id,
    eligibility,
    ineligibleReasons: reasons,
    address: { label: 'PROPERTY FACT', value: prop.address_full },
    city: prop.city,
    state: prop.state,
    zip: prop.zip,
    propertyFacts: {
      propertyType: { label: 'PROPERTY FACT', value: prop.property_type ?? fp?.beds != null ? (prop.property_type ?? null) : null },
      beds: { label: 'PROPERTY FACT', value: prop.beds ?? fp?.beds ?? null },
      baths: { label: 'PROPERTY FACT', value: prop.baths ?? fp?.baths ?? null },
      sqft: { label: 'PROPERTY FACT', value: prop.sqft ?? fp?.sqft ?? null },
    },
    valuation: {
      avm: { label: 'ESTIMATE', value: avm, source: 'Zillow + Redfin automated valuation, averaged where both are available', asOf: fp?.score_computed_at ?? null },
      zillowEstimate: zillowEst,
      redfinEstimate: redfinEst,
      listPrice: { label: 'PROPERTY FACT', value: listPrice },
      comparables,
      freshness: fp?.score_computed_at ?? null,
    },
    financing: {
      scenario: { creditScore, downPaymentPct, loanType, occupancy: 'primary', termYears: 30 },
      loanAmount: { label: 'DERIVED CALCULATION', value: provisionalLoanAmount },
      ltv: { label: 'ILLUSTRATIVE ASSUMPTION', value: ltv },
      conformingStatus,
      conformingCeiling: { label: 'MARKET FACT', value: stateLimitInfo.ceiling, source: `FHFA 2026 conforming loan limit, ${stateLimitInfo.stateName}` },
      marketRate: {
        label: 'MARKET FACT',
        value: {
          rate: marketRate ?? parRate,
          observationDate: loanType === 'jumbo' ? null : (marketObs?.observationDate ?? parRateObs?.observationDate ?? null),
          seriesLabel: marketRateSeriesLabel,
        },
        asOf: loanType === 'jumbo' ? null : (marketObs?.observationDate ?? parRateObs?.observationDate ?? null),
      },
      lenderParRate: { label: 'DERIVED CALCULATION', value: llpaResult.lenderParRate },
      monthlyPI: { label: 'DERIVED CALCULATION', value: mortgage ? Math.round(mortgage.monthlyPI) : 0 },
      totalLLPAPoints: llpaResult.totalLLPA,
      llpaDataSource: LLPA_DATA_SOURCE,
      llpaEffectiveDate: LLPA_MATRIX_EFFECTIVE_DATE,
      llpaDisclaimer: LLPA_DISCLAIMER,
      rateAnchorSource: llpaResult.rateAnchorSource,
    },
    ownershipCost: {
      taxRate: { label: taxInfo.level === 'county' ? 'MARKET FACT' : 'ESTIMATE', value: { rate: taxInfo.rate, level: taxInfo.level }, source: taxInfo.level === 'county' ? 'County effective property tax rate' : `${taxInfo.level === 'state' ? prop.state : 'National'} average effective property tax rate` },
      monthlyTax: { label: 'DERIVED CALCULATION', value: monthlyTax },
      monthlyInsurance: { label: 'ESTIMATE', value: monthlyInsurance, source: 'HomeRates.ai default: 0.3% of price annually' },
      estimatedMonthlyPITI: { label: 'DERIVED CALCULATION', value: estimatedPITI },
    },
    decisionIntelligence: fp && (fp.l2_score != null || fp.l3_score != null || fp.l4_score != null)
      ? {
          l2: fp.l2_score != null ? { score: fp.l2_score, summary: fp.l2_summary ?? '' } : null,
          l3: fp.l3_score != null ? { score: fp.l3_score, summary: fp.l3_summary ?? '' } : null,
          l4: fp.l4_score != null ? { score: fp.l4_score, summary: fp.l4_summary ?? '' } : null,
          compositeL2L4: fp.composite_score ?? null,
          methodologyVersion: METHODOLOGY_VERSION,
          computedAt: fp.score_computed_at ?? null,
        }
      : null,
    locationIntelligence,
    market: {
      medianDom: { label: 'MARKET FACT', value: parseNum(rd.market_median_dom) },
      medianPrice: { label: 'MARKET FACT', value: parseNum(rd.market_median_price) },
      saleToListPct: { label: 'MARKET FACT', value: parseNum(rd.market_sale_to_list) },
    },
    provenance: {
      propertyEnrichedAt: prop.enriched_at,
      propertyEnrichmentSource: prop.enrichment_source,
      intelligenceComputedAt: fp?.score_computed_at ?? null,
    },
  };
}
