// lib/canonicalPropertyIntelligence.ts
//
// Canonical Property Intelligence Consistency Workstream (2026-09-08).
// Stage A built this file; the Rate Role Correction (same day, before Stage E
// began) changed what its `financing` field means -- see the dated note on
// CanonicalFinancing below before touching either rate field.
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
// explicit, testable canonical object, computing nothing new EXCEPT the one
// deliberate exception documented below (the neutral property-market-rate
// payment recompute, added for the Rate Role Correction).
//
// SCOPE: this file introduces the canonical object ALONGSIDE the existing
// paths. It does not change first-party UI behavior (app/chat/page.tsx is
// untouched) -- Stage E (its migration, not yet started) is a separate,
// explicitly-deferred approval.
//
// "Use existing authoritative modules, do not duplicate calculations": this
// file makes exactly two external I/O calls, both to already-existing,
// already-safe server-side functions in lib/propertyIntelligence.ts --
// (1) getPropertyIntelligenceCorpusOnly() (re-exported from
// lib/gateway/corpusOnlyIntelligence.ts, the Gateway's own sole sanctioned
// entry point into property-specific data) for the property/valuation/
// ownership-cost assembly, and (2) getPropertyMarketReferenceRate() (a plain
// market-data reader, no property-specific data, imported directly -- it
// carries none of the property-corpus access-control concerns
// corpusOnlyIntelligence.ts exists to gate, so it doesn't need routing
// through that file) for the neutral rate. No new query beyond what each of
// those already does internally, no new AVM merge, no new LLPA/OBMMI call.
// The one genuinely new computation -- recomputing principalInterestMonthly
// at the neutral rate via calculateMortgage(), the SAME existing, tested
// mortgage-math primitive lib/propertyIntelligence.ts itself already uses,
// just called again with a different rate input -- exists because Property
// Intelligence and Rate Intelligence are now explicitly two different
// products with two different rates (see CanonicalFinancing below); this is
// not "recalculating the same value a second way," it's computing the ONE
// value Property Intelligence was always supposed to expose and never had
// a field for. Living outside lib/gateway/ keeps that module's "one entry
// point" invariant intact regardless.

import {
  getPropertyIntelligenceCorpusOnly,
  type PropertyIntelligenceData,
  CANONICAL_INSURANCE_ANNUAL_RATE,
  CANONICAL_INSURANCE_ASSUMPTION_LABEL,
} from './gateway/corpusOnlyIntelligence';
import { getPropertyMarketReferenceRate } from './propertyIntelligence';
import { calculateMortgage } from './mortgageCalculator';

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

  // RATE ROLE CORRECTION (2026-09-08) -- two deliberately separate products:
  //
  // propertyMarketRate: PROPERTY INTELLIGENCE's rate. "What does financing
  // this home look like against today's market?" -- neutral, no FICO, no LTV
  // pricing tier, no LLPA, no borrower data at all. Same underlying source
  // (FRED MORTGAGE30US via lib/market-data's getLatest()) as the first-party
  // property-scenario ticker's "30Y FIXED" figure -- see
  // getPropertyMarketReferenceRate()'s own header for the full trace. THIS
  // drives principalInterestMonthly below, and therefore pitiMonthly/
  // pitiaMonthly in CanonicalOwnershipCosts, and external Property
  // Intelligence's illustrative financing. It requires nothing about the
  // borrower.
  propertyMarketRate: { rate: number; source: string; asOf: string | null; label: string };

  // rateIntelligence: RATE INTELLIGENCE's own concept. "Where does this
  // borrower/scenario rank given credit, LTV, and pricing mechanics?" --
  // the existing OBMMI-segment-selected reference rate plus the LLPA-adjusted
  // result, computed exactly as lib/propertyIntelligence.ts's financing
  // engine always has, under its existing fixed illustrative assumptions
  // (740 credit score, 20% down). UNCHANGED math, only relocated/renamed
  // here so it's structurally impossible to confuse with propertyMarketRate.
  // Must NEVER drive Property Intelligence payment math -- kept for future
  // Rate Intelligence linkage only. Not read by lib/gateway/outputShaping.ts
  // today (Property Intelligence's external contract has no Rate
  // Intelligence surface yet); if one is ever added, it must read this
  // sub-object explicitly, never propertyMarketRate.
  rateIntelligence: {
    marketSegmentRate: { value: number; seriesLabel: string; asOf: string | null };
    llpaAdjustedRate: number;
    assumedCreditScore: number;
    assumedLtv: number;
    totalLLPAPoints: number;
    llpaDataSource: string;
    llpaEffectiveDate: string;
  };

  // Computed at propertyMarketRate (see above) -- never at rateIntelligence.llpaAdjustedRate.
  principalInterestMonthly: number;
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

/** Canonical builder. Wraps getPropertyIntelligenceCorpusOnly() -- the SAME
 *  call the Gateway already makes -- and relabels its output into the
 *  explicit canonical shape above. The AVM merge, OBMMI/LLPA rate selection,
 *  and tax lookup all remain exactly lib/propertyIntelligence.ts's existing,
 *  unmodified logic (preserved as `financing.rateIntelligence`). The one
 *  deliberate exception (Rate Role Correction, 2026-09-08): P&I/PITI/PITIA
 *  are recomputed at the neutral propertyMarketRate instead of trusting the
 *  engine's own LLPA-adjusted monthlyPI/PITI/PITIA -- see CanonicalFinancing's
 *  header for why this is Property Intelligence's own concept now, not a
 *  second, competing calculation of the same thing. */
export async function buildCanonicalPropertyIntelligence(propertyId: string): Promise<CanonicalPropertyIntelligence | null> {
  const [raw, propertyMarketRate] = await Promise.all([
    getPropertyIntelligenceCorpusOnly(propertyId),
    getPropertyMarketReferenceRate(),
  ]);
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

  // Same price derivation the financing engine itself uses internally
  // (list price preferred, AVM as fallback) -- not a new selection rule.
  const financingPrice = raw.valuation.listPrice.value ?? raw.valuation.avm.value ?? 0;

  const financing: CanonicalFinancing | null = raw.financing
    ? {
        scenario: raw.financing.scenario,
        loanAmount: raw.financing.loanAmount.value,
        ltv: raw.financing.ltv.value,
        conformingStatus: raw.financing.conformingStatus,
        propertyMarketRate: {
          rate: propertyMarketRate.rate,
          source: propertyMarketRate.source,
          asOf: propertyMarketRate.asOf,
          label: propertyMarketRate.label,
        },
        rateIntelligence: {
          marketSegmentRate: {
            value: raw.financing.marketRate.value.rate,
            seriesLabel: raw.financing.marketRate.value.seriesLabel,
            asOf: raw.financing.marketRate.value.observationDate,
          },
          llpaAdjustedRate: raw.financing.lenderParRate.value,
          assumedCreditScore: raw.financing.scenario.creditScore,
          assumedLtv: raw.financing.ltv.value,
          totalLLPAPoints: raw.financing.totalLLPAPoints,
          llpaDataSource: raw.financing.llpaDataSource,
          llpaEffectiveDate: raw.financing.llpaEffectiveDate,
        },
        // Recomputed at propertyMarketRate via the SAME calculateMortgage()
        // primitive the engine itself uses -- never raw.financing.monthlyPI
        // (which is LLPA-adjusted, i.e. Rate Intelligence's number).
        principalInterestMonthly: financingPrice > 0
          ? Math.round(calculateMortgage({
              price: financingPrice,
              downPaymentPct: raw.financing.scenario.downPaymentPct,
              rate: propertyMarketRate.rate,
              termYears: raw.financing.scenario.termYears,
            }).monthlyPI)
          : 0,
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
        // Recomputed at propertyMarketRate's P&I (financing?.principalInterestMonthly
        // above), not raw.ownershipCost.estimatedMonthlyPITI/PITIA (which are
        // built from the engine's LLPA-adjusted P&I -- Rate Intelligence's
        // number). Same PITI/PITIA formula lib/propertyIntelligence.ts itself
        // uses (P&I + tax + insurance; + HOA only when confirmed), just with
        // the neutral rate's P&I as input.
        pitiMonthly: Math.round((financing?.principalInterestMonthly ?? 0) + raw.ownershipCost.monthlyTax.value + raw.ownershipCost.monthlyInsurance.value),
        pitiaMonthly: raw.ownershipCost.monthlyHoa.value != null
          ? Math.round((financing?.principalInterestMonthly ?? 0) + raw.ownershipCost.monthlyTax.value + raw.ownershipCost.monthlyInsurance.value + raw.ownershipCost.monthlyHoa.value)
          : null,
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
