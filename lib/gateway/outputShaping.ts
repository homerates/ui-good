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
  // Demand-Triggered Intelligence (2026-09-09): 'unavailable' eligibility
  // (no AVM AND no comps) used to always mean NOT_AVAILABLE here, even for a
  // property lib/propertyIntelligence.ts now happily computes illustrative
  // financing/ownership-cost intelligence for (a verified list price is
  // enough -- see purchasePriceBasis). Saying NOT_AVAILABLE while
  // financing_intelligence/ownership_cost_intelligence are populated below
  // would be a real internal contradiction, not a privacy concern -- so this
  // reports PARTIAL, same as the 'noindex' branch, whenever that data
  // actually exists. Only a genuinely price-less property (no list price,
  // no AVM -- financing/ownershipCosts both still null) stays NOT_AVAILABLE.
  if (raw.financing || raw.ownershipCosts) {
    return {
      status: 'PARTIAL',
      reason: raw.ineligibleReasons[0] ?? 'Valuation and comparable sales are not yet available for this property.',
    };
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

// Progressive Intelligence (2026-09-09, Demand-Triggered Intelligence /
// Progressive Intelligence for External AI): the first-party chat product has
// never waited for L3/L4 (Grok comps/location) before showing a user
// something useful -- app/chat/page.tsx renders the property/financing card
// immediately, then a background call updates the SAME message once deep
// analysis lands. External callers have no browser tab to run that follow-up
// call themselves, so this makes the SAME two facts (what's known now, what's
// still being assembled) explicit in the response instead. Purely derived
// from `raw` -- no new query, no new state table: "enriched" means
// grok-sourced comps or location narrative are already present in the SAME
// canonical object this file already reads everything else from.
function computeIntelligenceProgress(raw: CanonicalPropertyIntelligence): ExternalPropertyIntelligenceV1['intelligence_progress'] {
  const hasComps = raw.comps.length > 0;
  const hasLocation = raw.location != null;
  const enriched = hasComps || hasLocation;
  return {
    status: enriched ? 'enriched' : 'enriching',
    layers: {
      financial: raw.financing ? 'complete' : 'pending',
      property: raw.valuation.pointEstimate != null ? 'complete' : raw.valuation.listPrice != null ? 'partial' : 'pending',
      market: raw.market.medianDom != null || raw.market.medianPrice != null ? 'complete' : 'pending',
      location: hasLocation ? 'complete' : 'pending',
    },
    follow_up_recommended: !enriched,
  };
}

// Property-specific canonical destination -- never a generic homepage
// redirect, and never keyed by raw.propertyId (that field must never cross
// this boundary -- see file header). Address-keyed, matching how
// app/property-intel/page.tsx itself reads its `address` query param.
function computeDeepIntelligenceCta(
  raw: CanonicalPropertyIntelligence,
  addressRequested: string,
): ExternalPropertyIntelligenceV1['deep_intelligence'] {
  const url = new URL('https://chat.homerates.ai/property-intel');
  url.searchParams.set('address', raw.property.address || addressRequested);
  return {
    available: true,
    destination: url.toString(),
    capability_summary:
      'Interactive HomeRates Property Intelligence report: live comparable sales, market and ' +
      'location context, and an adjustable financing scenario for this property.',
  };
}

export function shapeForExternalContract(
  addressRequested: string,
  raw: CanonicalPropertyIntelligence | null,
): ExternalPropertyIntelligenceV1 {
  if (!raw) {
    return {
      contract_version: 'property-intelligence-v1.4',
      query: { address_requested: addressRequested },
      availability: { status: 'NOT_AVAILABLE', reason: 'HomeRates does not currently have intelligence for this address.' },
      property: null,
      value_intelligence: null,
      financing_intelligence: null,
      ownership_cost_intelligence: null,
      market_location_intelligence: { market: { median_dom: labeled('MARKET FACT', null), median_price: labeled('MARKET FACT', null), sale_to_list_pct: labeled('MARKET FACT', null) }, location: null },
      decision_intelligence: null,
      // No resolved property to report progress on or link to yet -- both
      // null, distinct from the "resolved but still enriching" case below.
      intelligence_progress: null,
      deep_intelligence: null,
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
        // Demand-Triggered Intelligence (v1.3, 2026-09-09): discloses which
        // price the financing math below was actually computed from.
        // 'list_price' is a real, scraped PROPERTY FACT (the current asking
        // price) -- NEVER HomeRates' own valuation, never conflated with
        // value_intelligence.avm above (which stays null exactly when no
        // real AVM exists, completely independent of this field). Exists so
        // a calling AI cannot reasonably infer that a populated financing
        // block means HomeRates estimated this property's value -- it may
        // simply mean HomeRates used the current asking price as an
        // explicit illustrative purchase-price assumption.
        purchase_price_basis: {
          value: raw.financing.purchasePriceBasis.value,
          source: raw.financing.purchasePriceBasis.source === 'list_price' ? ('CURRENT_ASKING_PRICE' as const) : ('AVM' as const),
          claim_type: raw.financing.purchasePriceBasis.source === 'list_price' ? ('PROPERTY FACT' as const) : ('ESTIMATE' as const),
        },
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
    contract_version: 'property-intelligence-v1.4',
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
    intelligence_progress: computeIntelligenceProgress(raw),
    deep_intelligence: computeDeepIntelligenceCta(raw, addressRequested),
    freshness: { as_of: asOf, staleness },
    provenance: { source_category: sourceCategory, citation: 'Public listing and market data' },
    disclaimer: EDUCATIONAL_DISCLAIMER,
  };
}
