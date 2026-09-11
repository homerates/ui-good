// lib/gateway/buyerCapacityIntelligenceShaping.ts
//
// Invocable Tool Workstream (2026-09-11). Same explicit-allow-list
// construction discipline as the other tools' shaping files. Each band's
// `scenario` field reuses shapeScenarioIntelligenceForExternalContract()
// verbatim (the SAME shaping function homerates_scenario_intelligence
// uses) -- byte-identical field shapes/claim_types, no second copy.

import { EDUCATIONAL_DISCLAIMER } from '../disclosures';
import type { BuyerCapacityResult } from '../pricing/buyerCapacityIntelligence';
import { shapeScenarioIntelligenceForExternalContract } from './scenarioIntelligenceShaping';
import type { BuyerCapacityIntelligenceV1 } from './buyerCapacityIntelligenceSchema';

export function shapeBuyerCapacityIntelligenceForExternalContract(raw: BuyerCapacityResult): BuyerCapacityIntelligenceV1 {
  return {
    contract_version: 'buyer-capacity-intelligence-v1',
    program: raw.program,
    inputs: {
      annual_income: raw.inputs.annualIncome,
      monthly_debts: raw.inputs.monthlyDebts,
      down_payment_pct: raw.inputs.downPaymentPct,
      available_cash: raw.inputs.availableCash,
      rate_pct: raw.inputs.ratePct,
    },
    rate_benchmark: raw.rateBenchmark
      ? {
          value: raw.rateBenchmark.value,
          series_id: raw.rateBenchmark.seriesId,
          series_label: raw.rateBenchmark.seriesLabel,
          source: raw.rateBenchmark.source,
          as_of: raw.rateBenchmark.asOf,
          retrieved_at: raw.rateBenchmark.retrievedAt,
          freshness_status: raw.rateBenchmark.freshnessStatus,
          claim_type: 'MARKET FACT' as const,
        }
      : null,
    bands: raw.bands.map((b) => ({
      label: b.label,
      dti_target: b.dtiTarget,
      price: b.price,
      constraint: b.constraint,
      down_payment_amount: b.downPaymentAmount,
      scenario: b.scenario ? shapeScenarioIntelligenceForExternalContract(b.scenario) : null,
    })),
    assumptions: raw.assumptions.map((a) => ({ field: a.field, value: a.value, reason: a.reason, claim_type: 'ILLUSTRATIVE ASSUMPTION' as const })),
    disclaimer: EDUCATIONAL_DISCLAIMER,
  };
}
