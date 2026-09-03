// lib/gateway/outputSchema.ts
//
// Runtime schema for the LOCKED External Property Intelligence Contract V1
// (docs/HOMERATES_EXTERNAL_PROPERTY_INTELLIGENCE_V1.md, commit d63ffea8).
// This schema is the second, independent line of defense behind
// outputShaping.ts's allowlist construction (see that file's header) --
// a shaped object that doesn't validate against this schema is never
// returned to a caller, no matter how it failed to validate.
//
// Every field here traces to an EXPOSE or TRANSFORM row in Contract V1
// section 5's field classification matrix. Nothing here should ever be able
// to represent an INTERNAL ONLY field (raw L2/L3/L4 scores, methodologyVersion,
// decisionIntelligence.source, raw provenance timestamps/pipeline names,
// search_count, properties.id) -- if a future edit to this file adds a way to
// represent one of those, that is itself a contract violation to catch in review.

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
  contract_version: z.literal('property-intelligence-v1'),
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
        credit_score: z.number(),
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
