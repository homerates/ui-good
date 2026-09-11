// lib/gateway/scenarioIntelligenceSchema.ts
//
// Invocable Tool Workstream (2026-09-11). External contract for the new
// homerates_scenario_intelligence tool. Same discipline as the other 3
// tools' schemas (Zod validation, versioned contract_version literal,
// fail-closed if a future field shape drifts).
//
// V1 (2026-09-11): initial version.

import { z } from 'zod';
import { BenchmarkRateSchema } from './benchmarkRatesSchema';

const InputSource = z.enum(['USER_INPUT', 'CURRENT_BENCHMARK', 'EXPLICIT_ASSUMPTION', 'PROPERTY_FACT', 'UNKNOWN', 'UNAVAILABLE']);
const Program = z.enum(['conventional', 'fha', 'va', 'jumbo']);

function tagged(valueSchema: z.ZodTypeAny) {
  return z.object({ value: valueSchema, source: InputSource });
}

const LoanLimitClassification = z.enum([
  'CONFORMING', 'HIGH_BALANCE', 'ABOVE_CONFORMING_LIMIT',
  'WITHIN_FHA_LIMIT', 'ABOVE_FHA_LIMIT', 'COUNTY_REQUIRED', 'UNAVAILABLE',
]);

export const ScenarioIntelligenceV1Schema = z.object({
  contract_version: z.literal('scenario-intelligence-v1'),
  program: Program,
  inputs: z.object({
    price: tagged(z.number()),
    down_payment_pct: tagged(z.number()),
    down_payment_amount: tagged(z.number()),
    term_years: tagged(z.number()),
    rate_pct: tagged(z.number().nullable()),
    property_tax_rate_pct: tagged(z.number()),
    insurance_annual: tagged(z.number()),
    hoa_monthly: tagged(z.number().nullable()),
  }),
  rate_benchmark: BenchmarkRateSchema.nullable(),
  loan_structure: z.object({
    down_payment_amount: z.number(),
    base_loan_amount: z.number(),
    upfront_fee: z.number(),
    upfront_fee_label: z.enum(['UFMIP', 'VA_FUNDING_FEE', 'NONE']),
    total_loan_amount: z.number(),
    ltv: z.number(),
    claim_type: z.literal('DERIVED CALCULATION'),
  }),
  monthly_breakdown: z.object({
    principal_interest: z.number(),
    tax: z.number(),
    insurance: z.number(),
    mortgage_insurance: z.number(),
    mortgage_insurance_label: z.enum(['PMI', 'MIP', 'NONE']),
    hoa: z.number().nullable(),
    piti: z.number(),
    pitia: z.number().nullable(),
    claim_type: z.literal('DERIVED CALCULATION'),
  }).nullable(),
  loan_limit_zone: z.object({
    county_resolution: z.object({
      status: z.enum(['RESOLVED', 'UNRESOLVED', 'NOT_PROVIDED']),
      county: z.string().nullable(),
      state: z.string().nullable(),
      source: z.enum(['ZIP_LOOKUP', 'DIRECT_INPUT']).nullable(),
    }),
    national_baseline_limit: z.object({ value: z.number().nullable(), units: z.number(), claim_type: z.literal('MARKET FACT'), source: z.string(), year: z.number(), status: z.enum(['AVAILABLE', 'UNAVAILABLE']) }),
    county_conforming_limit: z.object({ value: z.number().nullable(), is_high_balance: z.boolean().nullable(), claim_type: z.literal('MARKET FACT'), source: z.string(), year: z.number(), status: z.enum(['AVAILABLE', 'COUNTY_REQUIRED', 'UNAVAILABLE']) }),
    fha_county_limit: z.object({ value: z.number().nullable(), claim_type: z.literal('MARKET FACT'), source: z.string(), year: z.number(), status: z.enum(['AVAILABLE', 'COUNTY_REQUIRED', 'UNAVAILABLE']) }),
    classification: z.object({ conventional: LoanLimitClassification.nullable(), fha: LoanLimitClassification.nullable(), claim_type: z.literal('DERIVED CALCULATION') }),
  }),
  jumbo_detail: z.object({ conforming_limit: z.number(), loan_exceeds_conforming: z.boolean() }).nullable(),
  program_detail: z.record(z.unknown()),
  qualification: z.object({
    front_end_dti: z.number().nullable(),
    back_end_dti: z.number().nullable(),
    claim_type: z.literal('DERIVED CALCULATION'),
  }).nullable(),
  assumptions: z.array(z.object({
    field: z.string(),
    value: z.unknown(),
    reason: z.string(),
    claim_type: z.literal('ILLUSTRATIVE ASSUMPTION'),
  })),
  disclaimer: z.string(),
});

export type ScenarioIntelligenceV1 = z.infer<typeof ScenarioIntelligenceV1Schema>;
