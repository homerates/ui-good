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
  contract_version: z.literal('property-intelligence-v1.2'),
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
