// lib/gateway/benchmarkRatesShaping.ts
//
// North Star Workstream 10. Same explicit-allow-list construction discipline
// as lib/gateway/outputShaping.ts (no spread, no destructure-then-omit) --
// every field below is read from a named path on the internal
// BenchmarkRatesResult and written to a named path on the external contract.

import { EDUCATIONAL_DISCLAIMER } from '../disclosures';
import type { BenchmarkRate, BenchmarkRatesResult } from '../market-data/benchmarkRates';
import type { BenchmarkRatesV1 } from './benchmarkRatesSchema';

function shapeRate(raw: BenchmarkRate) {
  return {
    value: raw.value,
    series_id: raw.seriesId,
    series_label: raw.seriesLabel,
    source: raw.source,
    as_of: raw.asOf,
    retrieved_at: raw.retrievedAt,
    freshness_status: raw.freshnessStatus,
    claim_type: 'MARKET FACT' as const,
  };
}

export function shapeBenchmarkRatesForExternalContract(raw: BenchmarkRatesResult): BenchmarkRatesV1 {
  return {
    contract_version: 'benchmark-rates-v1',
    thirty_year_fixed: shapeRate(raw.thirtyYearFixed),
    fifteen_year_fixed: shapeRate(raw.fifteenYearFixed),
    five_one_arm: shapeRate(raw.fiveOneArm),
    disclaimer: EDUCATIONAL_DISCLAIMER,
  };
}
