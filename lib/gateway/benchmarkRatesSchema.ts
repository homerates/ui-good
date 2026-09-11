// lib/gateway/benchmarkRatesSchema.ts
//
// North Star Workstream 10 -- Intelligence Gateway Capability Architecture.
// External contract for the new get_benchmark_rates tool. Same discipline as
// lib/gateway/outputSchema.ts (Zod validation, versioned contract_version
// literal, fail-closed if a future field shape drifts) applied to a second,
// address-independent capability.
//
// V1 (2026-09-10): initial version. Three neutral national reference rates
// (30yr fixed, 15yr fixed, 5/1 ARM) -- the same MORTGAGE30US/15US/5US FRED
// series family already exposed via property_intelligence's market_rate
// field, never OBMMI segment rates or an LLPA-adjusted rate (see
// lib/market-data/benchmarkRates.ts's header for why).

import { z } from 'zod';

const FreshnessStatus = z.enum(['CURRENT', 'STALE', 'UNAVAILABLE']);

// Exported (Invocable Tool Workstream, 2026-09-11) so homerates_scenario_intelligence
// can reuse this EXACT shape for its rate_benchmark field -- shared engines own
// shared facts; no second copy of this schema.
export const BenchmarkRateSchema = z.object({
  value: z.number().nullable(),
  series_id: z.string(),
  series_label: z.string(),
  source: z.string(),
  as_of: z.string().nullable(),
  retrieved_at: z.string(),
  freshness_status: FreshnessStatus,
  claim_type: z.literal('MARKET FACT'),
});

export const BenchmarkRatesV1Schema = z.object({
  contract_version: z.literal('benchmark-rates-v1'),
  thirty_year_fixed: BenchmarkRateSchema,
  fifteen_year_fixed: BenchmarkRateSchema,
  five_one_arm: BenchmarkRateSchema,
  disclaimer: z.string(),
});

export type BenchmarkRatesV1 = z.infer<typeof BenchmarkRatesV1Schema>;
