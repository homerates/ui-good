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
// value, or raw.id, anywhere in this file.
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

import type { PropertyIntelligenceData, FactLabel } from './corpusOnlyIntelligence';
import type { ExternalPropertyIntelligenceV1 } from './outputSchema';
import { EDUCATIONAL_DISCLAIMER } from '../disclosures';

// New, additive-only threshold -- not inherited from any existing internal
// "stale" flag, because none exists (freshness is a continuous timestamp
// internally). See docs/.../ARCHITECTURE.md section 11 and the implementation
// plan's Phase B note. TODO: confirm this value is the right one -- proposed,
// not researched (architecture doc section 29, open question 4).
const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function mapAvailability(raw: PropertyIntelligenceData): { status: 'AVAILABLE' | 'PARTIAL' | 'NOT_AVAILABLE'; reason: string | null } {
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
  raw: PropertyIntelligenceData | null,
): ExternalPropertyIntelligenceV1 {
  if (!raw) {
    return {
      contract_version: 'property-intelligence-v1',
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

  const financing = raw.financing
    ? {
        assumption_profile: {
          credit_score: raw.financing.scenario.creditScore,
          down_payment_pct: raw.financing.scenario.downPaymentPct,
          loan_type: raw.financing.scenario.loanType,
          occupancy: raw.financing.scenario.occupancy,
          term_years: raw.financing.scenario.termYears,
          claim_type: 'ILLUSTRATIVE ASSUMPTION' as const,
          is_personalized: false as const,
        },
        loan: {
          amount: labeled(raw.financing.loanAmount.label, raw.financing.loanAmount.value),
          monthly_pi: labeled(raw.financing.monthlyPI.label, raw.financing.monthlyPI.value),
        },
        market_rate: {
          value: raw.financing.marketRate.value.rate,
          series_label: raw.financing.marketRate.value.seriesLabel,
          claim_type: raw.financing.marketRate.label,
        },
      }
    : null;

  const ownershipCost = raw.ownershipCost
    ? {
        tax: labeled(raw.ownershipCost.monthlyTax.label, raw.ownershipCost.monthlyTax.value),
        insurance: labeled(raw.ownershipCost.monthlyInsurance.label, raw.ownershipCost.monthlyInsurance.value),
        hoa: labeled(raw.ownershipCost.monthlyHoa.label, raw.ownershipCost.monthlyHoa.value),
        estimated_piti: labeled(raw.ownershipCost.estimatedMonthlyPITI.label, raw.ownershipCost.estimatedMonthlyPITI.value),
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
    contract_version: 'property-intelligence-v1',
    query: { address_requested: addressRequested },
    availability,
    property: {
      address: raw.address.value,
      city: raw.city,
      state: raw.state,
      zip: raw.zip,
      property_type: raw.propertyFacts.propertyType.value,
      beds: raw.propertyFacts.beds.value,
      baths: raw.propertyFacts.baths.value,
      sqft: raw.propertyFacts.sqft.value,
    },
    value_intelligence: {
      avm: labeled(raw.valuation.avm.label, raw.valuation.avm.value),
      list_price: labeled(raw.valuation.listPrice.label, raw.valuation.listPrice.value),
      last_sale: { price: raw.valuation.lastSalePrice, date: raw.valuation.lastSaleDate },
      comparables: raw.valuation.comparables.map((c) => ({
        address: c.address,
        sold_price: c.soldPrice,
        sold_date: c.soldDate,
      })),
    },
    financing_intelligence: financing,
    ownership_cost_intelligence: ownershipCost,
    market_location_intelligence: {
      market: {
        median_dom: labeled(raw.market.medianDom.label, raw.market.medianDom.value),
        median_price: labeled(raw.market.medianPrice.label, raw.market.medianPrice.value),
        sale_to_list_pct: labeled(raw.market.saleToListPct.label, raw.market.saleToListPct.value),
      },
      location: raw.locationIntelligence
        ? {
            narrative: raw.locationIntelligence.narrative
              ? { value: raw.locationIntelligence.narrative.value, claim_type: raw.locationIntelligence.narrative.label }
              : null,
            sub_scores: raw.locationIntelligence.subScores,
          }
        : null,
    },
    decision_intelligence: decisionIntelligence,
    freshness: { as_of: asOf, staleness },
    provenance: { source_category: sourceCategory, citation: 'Public listing and market data' },
    disclaimer: EDUCATIONAL_DISCLAIMER,
  };
}
