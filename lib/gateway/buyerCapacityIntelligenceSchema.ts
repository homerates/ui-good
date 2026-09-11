// lib/gateway/buyerCapacityIntelligenceSchema.ts
//
// Invocable Tool Workstream (2026-09-11). External contract for the new
// homerates_buyer_capacity_intelligence tool -- the fifth and final locked
// intent. Reuses ScenarioIntelligenceV1Schema VERBATIM for each band's
// nested `scenario` field (not a second copy of that shape) -- "Buyer
// Capacity and Scenario Intelligence MUST consume the same... it may
// invert, it may not duplicate."
//
// V1 (2026-09-11): initial version.

import { z } from 'zod';
import { BenchmarkRateSchema } from './benchmarkRatesSchema';
import { ScenarioIntelligenceV1Schema } from './scenarioIntelligenceSchema';

const InputSource = z.enum(['USER_INPUT', 'CURRENT_BENCHMARK', 'EXPLICIT_ASSUMPTION', 'UNKNOWN', 'UNAVAILABLE']);
const Program = z.enum(['conventional', 'fha', 'va', 'jumbo']);
const Constraint = z.enum(['INCOME_DTI', 'CASH_AVAILABLE', 'NONE_AFFORDABLE']);

function tagged(valueSchema: z.ZodTypeAny) {
  return z.object({ value: valueSchema, source: InputSource });
}

export const BuyerCapacityIntelligenceV1Schema = z.object({
  contract_version: z.literal('buyer-capacity-intelligence-v1'),
  program: Program,
  inputs: z.object({
    annual_income: tagged(z.number()),
    monthly_debts: tagged(z.number()),
    down_payment_pct: tagged(z.number()),
    available_cash: tagged(z.number().nullable()),
    rate_pct: tagged(z.number().nullable()),
  }),
  rate_benchmark: BenchmarkRateSchema.nullable(),
  bands: z.array(z.object({
    label: z.string(),
    dti_target: z.number(),
    price: z.number(),
    constraint: Constraint,
    down_payment_amount: z.number(),
    scenario: ScenarioIntelligenceV1Schema.nullable(),
  })),
  assumptions: z.array(z.object({
    field: z.string(),
    value: z.unknown(),
    reason: z.string(),
    claim_type: z.literal('ILLUSTRATIVE ASSUMPTION'),
  })),
  disclaimer: z.string(),
});

export type BuyerCapacityIntelligenceV1 = z.infer<typeof BuyerCapacityIntelligenceV1Schema>;
