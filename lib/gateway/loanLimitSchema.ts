// lib/gateway/loanLimitSchema.ts
//
// Invocable Tool Workstream (2026-09-11). External contract for the new
// homerates_loan_limit_intelligence tool. Same discipline as
// lib/gateway/outputSchema.ts / benchmarkRatesSchema.ts (Zod validation,
// versioned contract_version literal, fail-closed if a future field shape
// drifts) applied to a third, address-independent (ZIP/county-independent
// of any specific property) capability.
//
// V1 (2026-09-11): initial version.

import { z } from 'zod';

const CountyResolutionStatus = z.enum(['RESOLVED', 'UNRESOLVED', 'NOT_PROVIDED']);
const LimitAvailability = z.enum(['AVAILABLE', 'COUNTY_REQUIRED', 'UNAVAILABLE']);
const Classification = z.enum([
  'CONFORMING',
  'HIGH_BALANCE',
  'ABOVE_CONFORMING_LIMIT',
  'WITHIN_FHA_LIMIT',
  'ABOVE_FHA_LIMIT',
  'COUNTY_REQUIRED',
  'UNAVAILABLE',
]);
const Program = z.enum(['conventional', 'fha', 'both']);

export const LoanLimitIntelligenceV1Schema = z.object({
  contract_version: z.literal('loan-limit-intelligence-v1'),
  query: z.object({
    zip: z.string().nullable(),
    county: z.string().nullable(),
    state: z.string().nullable(),
    year: z.number(),
    units: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    loan_amount: z.number().nullable(),
    program: Program,
  }),
  county_resolution: z.object({
    status: CountyResolutionStatus,
    county: z.string().nullable(),
    state: z.string().nullable(),
    source: z.enum(['ZIP_LOOKUP', 'DIRECT_INPUT']).nullable(),
  }),
  national_baseline_limit: z.object({
    value: z.number().nullable(),
    units: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    claim_type: z.literal('MARKET FACT'),
    source: z.string(),
    year: z.number(),
    status: z.enum(['AVAILABLE', 'UNAVAILABLE']),
  }),
  county_conforming_limit: z.object({
    value: z.number().nullable(),
    is_high_balance: z.boolean().nullable(),
    claim_type: z.literal('MARKET FACT'),
    source: z.string(),
    year: z.number(),
    status: LimitAvailability,
  }),
  fha_county_limit: z.object({
    value: z.number().nullable(),
    claim_type: z.literal('MARKET FACT'),
    source: z.string(),
    year: z.number(),
    status: LimitAvailability,
  }),
  classification: z.object({
    conventional: Classification.nullable(),
    fha: Classification.nullable(),
    claim_type: z.literal('DERIVED CALCULATION'),
  }),
  as_of: z.object({
    requested_year: z.number(),
    current_data_year: z.number(),
    is_current_year: z.boolean(),
  }),
  disclaimer: z.string(),
});

export type LoanLimitIntelligenceV1 = z.infer<typeof LoanLimitIntelligenceV1Schema>;
