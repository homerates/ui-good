// lib/canonicalPropertyIntelligence.ts
//
// Canonical Property Intelligence Consistency Workstream, Stage A (2026-09-08).
//
// WHY THIS EXISTS: a live-usage audit found the same property
// (5845 Doverwood Dr #106, Culver City, CA 90230) producing materially
// different rate/insurance/valuation/PITI figures across HomeRates surfaces.
// Root cause, confirmed by tracing every code path: the first-party chat
// surface (app/chat/page.tsx) client-assembles its property-lookup response
// from THREE independent backend calls (/api/property/lookup, /api/ticker,
// /api/rate-intelligence-engine) plus inline arithmetic, while the external
// MCP Gateway computes its own figures via lib/propertyIntelligence.ts's
// getPropertyIntelligenceData() -- a SEPARATE, already-more-correct engine
// that neither surface's other computations reuse. This file does not
// reimplement that engine -- it wraps and TYPES its existing output as one
// explicit, testable canonical object, and adds only the two genuinely
// missing pieces (a real marketReferenceRate-vs-illustrativeScenarioRate
// split naming, and avmLow/avmHigh exposure) rather than recomputing
// anything.
//
// STAGE A SCOPE: this file introduces the canonical object ALONGSIDE the
// existing paths. It does not change first-party UI behavior (app/chat/page.tsx
// is untouched) and, on its own, does not change external behavior either --
// Stage D wires lib/gateway/outputShaping.ts to consume it.
//
// "Use existing authoritative modules, do not duplicate calculations": this
// file's only external I/O is one call to getPropertyIntelligenceCorpusOnly()
// (re-exported from lib/gateway/corpusOnlyIntelligence.ts, the Gateway's own
// sole sanctioned entry point into lib/propertyIntelligence.ts) -- the SAME
// call the Gateway itself already makes. No new query, no new AVM merge, no
// new LLPA/OBMMI call, no new PITI formula. Living outside lib/gateway/ (not
// inside it) keeps that module's "one entry point" invariant intact: this
// file is a second CONSUMER of that entry point, not a second PATH into
// lib/propertyIntelligence.ts -- the automated import-boundary check
// (scripts/check-gateway-import-boundary.mjs) only scans files inside
// lib/gateway/, so it is unaffected either way, but the intent matters more
// than the letter of that check here.

import {
  getPropertyIntelligenceCorpusOnly,
  type PropertyIntelligenceData,
  CANONICAL_INSURANCE_ANNUAL_RATE,
  CANONICAL_INSURANCE_ASSUMPTION_LABEL,
} from './gateway/corpusOnlyIntelligence';

export interface CanonicalPropertyFacts {
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  propertyType: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  listingStatus: PropertyIntelligenceData['lifecycleStatus'];
}

export interface CanonicalValuation {
  // The single point estimate -- averaged across whichever real, point-value
  // AVM sources exist (properties.latest_value, snapshot.estimatedValue,
  // Grok zillow_estimate/redfin_estimate). NEVER a range boundary.
  pointEstimate: number | null;
  sources: string[];
  // Range bounds, kept structurally SEPARATE from `pointEstimate` so no
  // future caller can do what app/chat/page.tsx's decisionScoreCard
  // construction currently does (`d.estimatedValue ?? d.estimatedValueLow`) --
  // a range floor substituted for a missing point AVM. That bug lives only
  // in the first-party client code; this canonical object structurally
  // cannot reproduce it, since `low`/`high` are never read as a fallback for
  // `pointEstimate` anywhere in this file.
  low: number | null;
  high: number | null;
  listPrice: number | null;
  lastSalePrice: number | null;
  lastSaleDate: string | null;
  asOf: string | null;
}

export interface CanonicalFinancing {
  scenario: { creditScore: number; downPaymentPct: number; loanType: 'conventional' | 'jumbo'; occupancy: 'primary'; termYears: 30 };
  loanAmount: number;
  ltv: number;
  conformingStatus: 'standard' | 'high_balance' | 'above_limit';
  // The raw national/OBMMI par rate BEFORE lender pricing adjustments (LLPA)
  // -- a general market reference point, NOT what drives the payment below.
  // Corresponds to /api/ticker's role: a legitimate, separate concept from
  // the scenario-specific rate, never meant to independently drive a
  // property-specific payment.
  marketReferenceRate: { value: number; seriesLabel: string; asOf: string | null };
  // The LLPA-adjusted, credit/LTV-segment-specific rate. THIS is what
  // principalInterestMonthly below is computed from, and what any canonical
  // payment calculation must use -- never marketReferenceRate directly.
  illustrativeScenarioRate: number;
  principalInterestMonthly: number;
  totalLLPAPoints: number;
  llpaDataSource: string;
  llpaEffectiveDate: string;
}

export interface CanonicalOwnershipCosts {
  annualTaxes: number | null;
  taxRateEffective: { rate: number; level: 'actual' | 'county' | 'state' | 'national' };
  monthlyTaxes: number;
  monthlyInsurance: number;
  // Documents the methodology so no caller can mistake this for a real
  // premium quote -- see this file's header and the Stage B report for why
  // 0.003 (not 0.005) is the canonical rate.
  insuranceAssumption: { annualRate: number; label: string };
  // null = unknown, NEVER coerced to zero. A confirmed "no HOA applies" must
  // arrive as an explicit 0 from the data itself (snapshot.hoaMonthly === 0),
  // never invented here.
  hoaMonthly: number | null;
  hoaConfirmed: boolean;
  pitiMonthly: number;
  // null whenever hoaMonthly is null -- "cannot be fully determined yet",
  // never silently equal to pitiMonthly.
  pitiaMonthly: number | null;
}

export interface CanonicalPropertyIntelligence {
  propertyId: string;
  eligibility: PropertyIntelligenceData['eligibility'];
  ineligibleReasons: string[];
  property: CanonicalPropertyFacts;
  valuation: CanonicalValuation;
  // null under the same conditions the underlying engine already uses --
  // eligibility === 'unavailable' (no data-bar-qualifying property never gets
  // a financing/ownership computation at all, by the existing engine's own
  // design, not something this wrapper decides).
  financing: CanonicalFinancing | null;
  ownershipCosts: CanonicalOwnershipCosts | null;
  comps: PropertyIntelligenceData['valuation']['comparables'];
  market: {
    medianDom: number | null;
    medianPrice: number | null;
    saleToListPct: number | null;
  };
  location: {
    narrative: string | null;
    subScores: { metric: string; rating: string; description: string }[];
  } | null;
  // Kept in the SAME shape as PropertyIntelligenceData.decisionIntelligence
  // deliberately -- this canonical object is internal, so it may hold
  // internal-only fields (raw l2/l3/l4 scores, methodologyVersion, source)
  // that a future first-party consumer could use. Any EXTERNAL consumer
  // (lib/gateway/outputShaping.ts) must keep its own existing, locked
  // discipline of reading only .strengths/.missing from this object --
  // this file does not relax that boundary, only relocates its source.
  decisionIntelligence: PropertyIntelligenceData['decisionIntelligence'];
  provenance: {
    propertyEnrichedAt: string | null;
    propertyEnrichmentSource: string | null;
    intelligenceComputedAt: string | null;
    snapshotFetchedAt: string | null;
    grokCacheFetchedAt: string | null;
    valuationAsOf: string | null;
  };
}

/** Stage A canonical builder. Wraps getPropertyIntelligenceCorpusOnly() --
 *  the SAME call the Gateway already makes -- and relabels its output into
 *  the explicit canonical shape above. Computes nothing new; the AVM merge,
 *  LLPA/OBMMI rate selection, tax lookup, and PITI/PITIA math all remain
 *  exactly lib/propertyIntelligence.ts's existing, unmodified logic. */
export async function buildCanonicalPropertyIntelligence(propertyId: string): Promise<CanonicalPropertyIntelligence | null> {
  const raw = await getPropertyIntelligenceCorpusOnly(propertyId);
  if (!raw) return null;

  const property: CanonicalPropertyFacts = {
    address: raw.address.value,
    city: raw.city,
    state: raw.state,
    zip: raw.zip,
    propertyType: raw.propertyFacts.propertyType.value,
    beds: raw.propertyFacts.beds.value,
    baths: raw.propertyFacts.baths.value,
    sqft: raw.propertyFacts.sqft.value,
    listingStatus: raw.lifecycleStatus,
  };

  const valuation: CanonicalValuation = {
    pointEstimate: raw.valuation.avm.value,
    sources: raw.valuation.avmSources,
    low: raw.valuation.avmLow,
    high: raw.valuation.avmHigh,
    listPrice: raw.valuation.listPrice.value,
    lastSalePrice: raw.valuation.lastSalePrice,
    lastSaleDate: raw.valuation.lastSaleDate,
    asOf: raw.valuation.freshness,
  };

  const financing: CanonicalFinancing | null = raw.financing
    ? {
        scenario: raw.financing.scenario,
        loanAmount: raw.financing.loanAmount.value,
        ltv: raw.financing.ltv.value,
        conformingStatus: raw.financing.conformingStatus,
        marketReferenceRate: {
          value: raw.financing.marketRate.value.rate,
          seriesLabel: raw.financing.marketRate.value.seriesLabel,
          asOf: raw.financing.marketRate.value.observationDate,
        },
        illustrativeScenarioRate: raw.financing.lenderParRate.value,
        principalInterestMonthly: raw.financing.monthlyPI.value,
        totalLLPAPoints: raw.financing.totalLLPAPoints,
        llpaDataSource: raw.financing.llpaDataSource,
        llpaEffectiveDate: raw.financing.llpaEffectiveDate,
      }
    : null;

  const ownershipCosts: CanonicalOwnershipCosts | null = raw.ownershipCost
    ? {
        annualTaxes: raw.ownershipCost.annualTaxes,
        taxRateEffective: raw.ownershipCost.taxRate.value,
        monthlyTaxes: raw.ownershipCost.monthlyTax.value,
        monthlyInsurance: raw.ownershipCost.monthlyInsurance.value,
        insuranceAssumption: {
          annualRate: CANONICAL_INSURANCE_ANNUAL_RATE,
          label: raw.ownershipCost.monthlyInsurance.source ?? CANONICAL_INSURANCE_ASSUMPTION_LABEL,
        },
        hoaMonthly: raw.ownershipCost.monthlyHoa.value,
        hoaConfirmed: raw.ownershipCost.monthlyHoa.value != null,
        pitiMonthly: raw.ownershipCost.estimatedMonthlyPITI.value,
        pitiaMonthly: raw.ownershipCost.estimatedMonthlyPITIA.value,
      }
    : null;

  return {
    propertyId,
    eligibility: raw.eligibility,
    ineligibleReasons: raw.ineligibleReasons,
    property,
    valuation,
    financing,
    ownershipCosts,
    comps: raw.valuation.comparables,
    market: {
      medianDom: raw.market.medianDom.value,
      medianPrice: raw.market.medianPrice.value,
      saleToListPct: raw.market.saleToListPct.value,
    },
    location: raw.locationIntelligence
      ? {
          narrative: raw.locationIntelligence.narrative?.value ?? null,
          subScores: raw.locationIntelligence.subScores,
        }
      : null,
    decisionIntelligence: raw.decisionIntelligence,
    provenance: {
      propertyEnrichedAt: raw.provenance.propertyEnrichedAt,
      propertyEnrichmentSource: raw.provenance.propertyEnrichmentSource,
      intelligenceComputedAt: raw.provenance.intelligenceComputedAt,
      snapshotFetchedAt: raw.provenance.snapshotFetchedAt,
      grokCacheFetchedAt: raw.provenance.grokCacheFetchedAt,
      valuationAsOf: raw.valuation.freshness,
    },
  };
}
