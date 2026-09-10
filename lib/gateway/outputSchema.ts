// lib/gateway/outputSchema.ts
//
// Runtime schema for the External Property Intelligence Contract, now
// property-intelligence-v1.2 (bumped 2026-09-08 -- see below). This schema
// is the second, independent line of defense behind outputShaping.ts's
// allowlist construction (see that file's header) -- a shaped object that
// doesn't validate against this schema is never returned to a caller, no
// matter how it failed to validate.
//
// Every field here traces to an EXPOSE or TRANSFORM row in Contract V1
// section 5's field classification matrix. Nothing here should ever be able
// to represent an INTERNAL ONLY field (raw L2/L3/L4 scores, methodologyVersion,
// decisionIntelligence.source, raw provenance timestamps/pipeline names,
// search_count, properties.id) -- if a future edit to this file adds a way to
// represent one of those, that is itself a contract violation to catch in review.
//
// V1 -> V1.1 (documented per the versioning policy in
// docs/HOMERATES_EXTERNAL_PROPERTY_INTELLIGENCE_V1.md section 16): fixed a
// real mislabeling bug -- estimated_piti previously silently included HOA
// dues whenever HOA was known, contradicting its own name (PITI has no A).
// estimated_piti is now true Principal+Interest+Taxes+Insurance ONLY; a
// estimated_pitia field (PITI + confirmed HOA, or null when unconfirmed --
// never silently zero) carries the PITI+HOA figure.
//
// V1.1 -> V1.2 (Response Semantics Cleanup, same day): a live ChatGPT
// response revealed financing_intelligence.assumption_profile.credit_score
// (740, fixed, always present) was causing the model to describe Property
// Intelligence's neutral market_rate as "740 credit" pricing -- false since
// the Rate Role Correction (propertyMarketRate never uses credit score).
// credit_score is removed from assumption_profile entirely; Property
// Intelligence has no borrower-credit input of any kind. This is a genuine
// external-shape change (a field disappears) for any consumer reading it,
// which is exactly the kind of change this repo's versioning policy says
// must bump contract_version rather than silently redefine under the same
// string -- even though the only real consumer today (an LLM reading JSON
// descriptively) is unambiguously better off without a misleading field.
//
// V1.3 -> V1.4 (Progressive Intelligence for External AI, 2026-09-09): the
// first-party chat product has never waited for Grok comps/location before
// showing a user something useful -- it renders immediately, then updates the
// SAME card once deep analysis lands, via a client-side follow-up call an
// external caller has no equivalent of. Two new fields close that gap:
// intelligence_progress ('enriching' | 'enriched', per-layer completion,
// follow_up_recommended) tells the caller whether to expect richer data on a
// later call for the same address; deep_intelligence gives a property-specific
// (never generic, never internal-id-keyed) destination for the full
// interactive HomeRates experience. Both are purely derived from fields this
// file already reads -- no new query, no new job/state table. Neither field
// changes the meaning of `availability`, `financing_intelligence`, or any
// other v1.3 field.
//
// V1.4 -> V1.5 (Deep Intelligence Parity & External AI Utility, 2026-09-10):
// a forensic audit of a real property (1123 Seaview Ave, Pacific Grove, CA)
// found the first-party Deep Property Intelligence report rendering
// HomeRates' own narrative synthesis over a property (grok_intelligence_summary,
// key_highlights) that external Property Intelligence never received at all --
// external AI got comps/market/location FIELDS but none of HomeRates' own
// synthesis over them, leaving a real ChatGPT session unable to answer
// "is the asking price supported?" with anything beyond raw numbers. New
// required field `property_analysis` (`{narrative, highlights}`) closes that
// gap, sourced from the exact same grok_property_cache row already read for
// comps/market fields -- no new query, no new provider call. Deliberately
// does NOT include that same audit's sibling field, grok.buyer_strategy --
// a live example was found to contain a specific, ungrounded dollar figure
// ("comps suggest potential for $1.3M+ value") that is Grok's own speculative
// inference, not a HomeRates-computed conclusion; exposing it would
// reintroduce, via HomeRates' own data, exactly the unsupported-valuation-
// precision problem v1.4's TOOL_DESCRIPTION guardrail was built to stop
// ChatGPT from inventing on its own. Separately, that same audit found a
// REAL first-party-only bug (a "9840.0%" sale-to-list display, and a
// "$1.15M AI Estimate" that is actually a silent list-price fallback,
// mislabeled) in `app/property-report/page.tsx` -- confirmed NOT present in
// canonical or external output (both correctly show the true, unit-correct
// value / a null AVM), recorded in ARCHITECTURE_DECISIONS.md as an open
// technical issue on that separate first-party surface, not fixed here.
//
// V1.2 -> V1.3 (Demand-Triggered Intelligence, Fast Intelligence Tier,
// 2026-09-09): financing_intelligence/ownership_cost_intelligence are no
// longer forced to null whenever a property has no AVM/comps -- a real,
// verified list price is now enough (see lib/propertyIntelligence.ts's
// purchasePriceBasis note). This is a genuine external-shape change: a new
// required field, financing_intelligence.purchase_price_basis, discloses
// which price basis ('CURRENT_ASKING_PRICE' or 'AVM') was used, specifically
// so a calling AI can never mistake a populated financing block for a
// HomeRates valuation. availability.status can now report PARTIAL (instead
// of NOT_AVAILABLE) for a property with a list price but no AVM/comps --
// the status enum itself is unchanged, only which properties map to which
// value.

import { z } from 'zod';

const ClaimType = z.enum([
  'PROPERTY FACT',
  'MARKET FACT',
  'ILLUSTRATIVE ASSUMPTION',
  'DERIVED CALCULATION',
  'ESTIMATE',
  'AI INTERPRETATION',
]);

const LabeledNumber = z.object({ value: z.number().nullable(), claim_type: ClaimType });
const LabeledString = z.object({ value: z.string().nullable(), claim_type: ClaimType });

export const ExternalPropertyIntelligenceV1Schema = z.object({
  contract_version: z.literal('property-intelligence-v1.5'),
  query: z.object({ address_requested: z.string() }),
  availability: z.object({
    status: z.enum(['AVAILABLE', 'PARTIAL', 'NOT_AVAILABLE']),
    reason: z.string().nullable(),
  }),
  property: z
    .object({
      address: z.string(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      zip: z.string().nullable(),
      property_type: z.string().nullable(),
      beds: z.number().nullable(),
      baths: z.number().nullable(),
      sqft: z.number().nullable(),
    })
    .nullable(),
  value_intelligence: z
    .object({
      avm: LabeledNumber,
      list_price: LabeledNumber,
      last_sale: z.object({ price: z.number().nullable(), date: z.string().nullable() }),
      comparables: z.array(
        z.object({
          address: z.string(),
          sold_price: z.number().nullable(),
          sold_date: z.string().nullable(),
        }),
      ),
    })
    .nullable(),
  financing_intelligence: z
    .object({
      purchase_price_basis: z.object({
        value: z.number(),
        source: z.enum(['CURRENT_ASKING_PRICE', 'AVM']),
        claim_type: ClaimType,
      }),
      assumption_profile: z.object({
        down_payment_pct: z.number(),
        loan_type: z.enum(['conventional', 'jumbo']),
        occupancy: z.literal('primary'),
        term_years: z.literal(30),
        claim_type: z.literal('ILLUSTRATIVE ASSUMPTION'),
        is_personalized: z.literal(false),
      }),
      loan: z.object({ amount: LabeledNumber, monthly_pi: LabeledNumber }),
      market_rate: z.object({ value: z.number().nullable(), series_label: z.string(), claim_type: ClaimType }),
    })
    .nullable(),
  ownership_cost_intelligence: z
    .object({
      tax: LabeledNumber,
      insurance: LabeledNumber,
      hoa: LabeledNumber,
      estimated_piti: LabeledNumber,
      // null when HOA status is unconfirmed -- never silently equals
      // estimated_piti (that would be the same PITI/HOA conflation V1.1
      // exists to fix). See file header.
      estimated_pitia: LabeledNumber,
    })
    .nullable(),
  market_location_intelligence: z.object({
    market: z.object({
      median_dom: LabeledNumber,
      median_price: LabeledNumber,
      sale_to_list_pct: LabeledNumber,
    }),
    location: z
      .object({
        narrative: LabeledString.nullable(),
        sub_scores: z.array(z.object({ metric: z.string(), rating: z.string(), description: z.string() })),
      })
      .nullable(),
  }),
  decision_intelligence: z
    .object({
      drivers: z.array(z.string()),
      limitations: z.array(z.string()),
    })
    .nullable(),
  // Deep Intelligence Parity (v1.5): HomeRates' own narrative synthesis over
  // this property (market positioning, notable characteristics) -- distinct
  // from decision_intelligence.drivers/limitations above (which are
  // location-specific strengths/tradeoffs) and never a valuation conclusion.
  // narrative carries a claim_type because it's free-form AI-generated text;
  // highlights are short descriptive strings, not claims requiring individual
  // labeling. null exactly when no Grok enrichment has produced this content
  // yet (see intelligence_progress.status).
  property_analysis: z
    .object({
      narrative: LabeledString.nullable(),
      highlights: z.array(z.string()),
    })
    .nullable(),
  // Progressive Intelligence (v1.4): null exactly when `property` is null
  // (no resolved property to report progress on). Purely derived from
  // already-computed canonical fields -- never a new query, never a new
  // state store.
  intelligence_progress: z
    .object({
      status: z.enum(['enriching', 'enriched']),
      layers: z.object({
        financial: z.enum(['complete', 'pending']),
        property: z.enum(['complete', 'partial', 'pending']),
        market: z.enum(['complete', 'pending']),
        location: z.enum(['complete', 'pending']),
      }),
      follow_up_recommended: z.boolean(),
    })
    .nullable(),
  // Property-specific canonical destination for the full interactive
  // HomeRates experience -- never a generic homepage, never keyed by an
  // internal property id (see file header's INTERNAL ONLY list).
  deep_intelligence: z
    .object({
      available: z.literal(true),
      destination: z.string(),
      capability_summary: z.string(),
    })
    .nullable(),
  freshness: z.object({
    as_of: z.string().nullable(),
    staleness: z.enum(['CURRENT', 'STALE']),
  }),
  provenance: z.object({
    source_category: z.enum(['PUBLIC_LISTING_DATA', 'AI_ASSISTED_ANALYSIS', 'MARKET_DATA']),
    citation: z.string(),
  }),
  disclaimer: z.string(),
});

export type ExternalPropertyIntelligenceV1 = z.infer<typeof ExternalPropertyIntelligenceV1Schema>;
