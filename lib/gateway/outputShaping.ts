// lib/gateway/outputShaping.ts
//
// RAW INTERNAL RESULT -> construct NEW external object from explicit allowed
// fields -> (caller validates against ExternalPropertyIntelligenceV1Schema).
// Never serialize the raw internal object and then remove sensitive
// properties -- this file's only pattern is explicit-dotted-path reads on
// `raw` and explicit-key writes on the returned object. No spread operator on
// `raw` anywhere below. No destructure-then-omit anywhere below.
//
// Per docs/HOMERATES_EXTERNAL_PROPERTY_INTELLIGENCE_V1.md section 5's field
// classification matrix: this function must never read (not "read and
// discard" -- never reference at all) raw.decisionIntelligence.l2/l3/l4,
// .methodologyVersion, .source, raw.provenance's individual pipeline-name
// value, or raw.propertyId, anywhere in this file.
//
// LOCKED (2026-09-02, Rayaan): Contract V1 section 10 originally assumed a
// categorical "verdict" field would exist to expose for decision_intelligence.
// The real getPropertyIntelligenceData() output has no composite/verdict
// computation in this property-centered subset (L1, which requires borrower
// data, is never part of this view) -- only the individual L2/L3/L4 scores,
// which Contract V1 already classifies INTERNAL ONLY. Computing a verdict
// formula here would be new methodology, which the Gateway is not allowed to
// own (architecture doc section 5) -- locked as a contract-reality correction,
// not reopened. decision_intelligence below returns only drivers/limitations,
// both already present as plain-language strings in the real internal object.
//
// CANONICAL MIGRATION (2026-09-08, Stage D): this file now shapes a
// CanonicalPropertyIntelligence object (lib/canonicalPropertyIntelligence.ts)
// instead of reading PropertyIntelligenceData directly. It recalculates
// NOTHING -- every value below is an explicit-dotted-path read of a field
// the canonical builder already computed (which itself only wraps
// getPropertyIntelligenceCorpusOnly(), the same call this file always made).
// This closes the "external Property Intelligence independently recomputes
// figures" finding from the canonical-consistency audit: there is now
// exactly one place (lib/propertyIntelligence.ts) that computes valuation/
// rate/insurance/tax/PITI math, and this file only formats its output.

import type { CanonicalPropertyIntelligence } from '../canonicalPropertyIntelligence';
import type { FactLabel } from './corpusOnlyIntelligence';
import type { ExternalPropertyIntelligenceV1 } from './outputSchema';
import { EDUCATIONAL_DISCLAIMER } from '../disclosures';

// New, additive-only threshold -- not inherited from any existing internal
// "stale" flag, because none exists (freshness is a continuous timestamp
// internally). See docs/.../ARCHITECTURE.md section 11 and the implementation
// plan's Phase B note. TODO: confirm this value is the right one -- proposed,
// not researched (architecture doc section 29, open question 4).
const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function mapAvailability(raw: CanonicalPropertyIntelligence): { status: 'AVAILABLE' | 'PARTIAL' | 'NOT_AVAILABLE'; reason: string | null } {
  if (raw.eligibility === 'index') return { status: 'AVAILABLE', reason: null };
  if (raw.eligibility === 'noindex') {
    return { status: 'PARTIAL', reason: raw.ineligibleReasons[0] ?? 'This property does not yet meet HomeRates’ full data bar.' };
  }
  return { status: 'NOT_AVAILABLE', reason: 'HomeRates has this address on record but does not yet have enough verified data to provide intelligence.' };
}

function mapSourceCategory(rawSource: string | null): 'PUBLIC_LISTING_DATA' | 'AI_ASSISTED_ANALYSIS' | 'MARKET_DATA' {
  if (rawSource === 'redfin' || rawSource === 'web_search') return 'PUBLIC_LISTING_DATA';
  if (rawSource === 'featured_properties_organic_backfill') return 'AI_ASSISTED_ANALYSIS';
  return 'PUBLIC_LISTING_DATA';
}

function labeled(label: FactLabel, value: number | null): { value: number | null; claim_type: FactLabel } {
  return { value, claim_type: label };
}

export function shapeForExternalContract(
  addressRequested: string,
  raw: CanonicalPropertyIntelligence | null,
): ExternalPropertyIntelligenceV1 {
  if (!raw) {
    return {
      contract_version: 'property-intelligence-v1.2',
      query: { address_requested: addressRequested },
      availability: { status: 'NOT_AVAILABLE', reason: 'HomeRates does not currently have intelligence for this address.' },
      property: null,
      value_intelligence: null,
      financing_intelligence: null,
      ownership_cost_intelligence: null,
      market_location_intelligence: { market: { median_dom: labeled('MARKET FACT', null), median_price: labeled('MARKET FACT', null), sale_to_list_pct: labeled('MARKET FACT', null) }, location: null },
      decision_intelligence: null,
      freshness: { as_of: null, staleness: 'CURRENT' },
      provenance: { source_category: 'PUBLIC_LISTING_DATA', citation: 'No record on file' },
      disclaimer: EDUCATIONAL_DISCLAIMER,
    };
  }

  const availability = mapAvailability(raw);

  const asOf = raw.provenance.intelligenceComputedAt ?? raw.provenance.propertyEnrichedAt ?? null;
  const staleness: 'CURRENT' | 'STALE' = asOf && Date.now() - new Date(asOf).getTime() > STALE_THRESHOLD_MS ? 'STALE' : 'CURRENT';

  const sourceCategory = mapSourceCategory(raw.provenance.propertyEnrichmentSource);

  // Every claim_type below is a FIXED constant per field (confirmed by
  // re-auditing lib/propertyIntelligence.ts's own construction -- none of
  // these ever varied at runtime), so this file supplies them directly
  // rather than threading always-identical labels through the canonical
  // object. The canonical object's own job is values, not presentation
  // metadata for one specific external contract.
  const financing = raw.financing
    ? {
        // credit_score deliberately OMITTED (v1.2, Response Semantics
        // Cleanup 2026-09-08) -- Property Intelligence's propertyMarketRate
        // has never used it (Rate Role Correction, same day); exposing it
        // alongside the rate caused ChatGPT to describe the neutral market
        // rate as "740 credit" pricing, which is false. Rate Intelligence's
        // own assumedCreditScore (canonical.financing.rateIntelligence,
        // internal-only, unchanged) remains exactly where FICO/LTV
        // assumptions belong -- see this file's Rate Role Correction note
        // just below.
        assumption_profile: {
          down_payment_pct: raw.financing.scenario.downPaymentPct,
          loan_type: raw.financing.scenario.loanType,
          occupancy: raw.financing.scenario.occupancy,
          term_years: raw.financing.scenario.termYears,
          claim_type: 'ILLUSTRATIVE ASSUMPTION' as const,
          is_personalized: false as const,
        },
        loan: {
          amount: labeled('DERIVED CALCULATION', raw.financing.loanAmount),
          monthly_pi: labeled('DERIVED CALCULATION', raw.financing.principalInterestMonthly),
        },
        // Rate Role Correction (2026-09-08): Property Intelligence exposes
        // ONLY the neutral propertyMarketRate here -- never
        // rateIntelligence's OBMMI/LLPA-segmented figures, which assume a
        // borrower profile (740 FICO, specific LTV) this anonymous contract
        // never collects. monthly_pi above is (and now correctly is)
        // computed from this SAME neutral rate -- see
        // lib/canonicalPropertyIntelligence.ts's CanonicalFinancing header.
        // series_label deliberately carries neutral "market reference"
        // language, never an OBMMI/credit-tier description.
        market_rate: {
          value: raw.financing.propertyMarketRate.rate,
          series_label: raw.financing.propertyMarketRate.label,
          claim_type: 'MARKET FACT' as const,
        },
      }
    : null;

  const ownershipCost = raw.ownershipCosts
    ? {
        tax: labeled('DERIVED CALCULATION', raw.ownershipCosts.monthlyTaxes),
        insurance: labeled('ESTIMATE', raw.ownershipCosts.monthlyInsurance),
        hoa: labeled('PROPERTY FACT', raw.ownershipCosts.hoaMonthly),
        estimated_piti: labeled('DERIVED CALCULATION', raw.ownershipCosts.pitiMonthly),
        estimated_pitia: labeled('DERIVED CALCULATION', raw.ownershipCosts.pitiaMonthly),
      }
    : null;

  // decision_intelligence: drivers/limitations only -- see file header KNOWN GAP note.
  // Deliberately never reads raw.decisionIntelligence.l2 / .l3 / .l4 / .methodologyVersion / .source.
  const decisionIntelligence = raw.decisionIntelligence
    ? {
        drivers: raw.decisionIntelligence.strengths,
        limitations: raw.decisionIntelligence.missing,
      }
    : null;

  return {
    contract_version: 'property-intelligence-v1.2',
    query: { address_requested: addressRequested },
    availability,
    property: {
      address: raw.property.address,
      city: raw.property.city,
      state: raw.property.state,
      zip: raw.property.zip,
      property_type: raw.property.propertyType,
      beds: raw.property.beds,
      baths: raw.property.baths,
      sqft: raw.property.sqft,
    },
    value_intelligence: {
      avm: labeled('ESTIMATE', raw.valuation.pointEstimate),
      list_price: labeled('PROPERTY FACT', raw.valuation.listPrice),
      last_sale: { price: raw.valuation.lastSalePrice, date: raw.valuation.lastSaleDate },
      comparables: raw.comps.map((c) => ({
        address: c.address,
        sold_price: c.soldPrice,
        sold_date: c.soldDate,
      })),
    },
    financing_intelligence: financing,
    ownership_cost_intelligence: ownershipCost,
    market_location_intelligence: {
      market: {
        median_dom: labeled('MARKET FACT', raw.market.medianDom),
        median_price: labeled('MARKET FACT', raw.market.medianPrice),
        sale_to_list_pct: labeled('MARKET FACT', raw.market.saleToListPct),
      },
      location: raw.location
        ? {
            narrative: raw.location.narrative != null ? { value: raw.location.narrative, claim_type: 'AI INTERPRETATION' as const } : null,
            sub_scores: raw.location.subScores,
          }
        : null,
    },
    decision_intelligence: decisionIntelligence,
    freshness: { as_of: asOf, staleness },
    provenance: { source_category: sourceCategory, citation: 'Public listing and market data' },
    disclaimer: EDUCATIONAL_DISCLAIMER,
  };
}
