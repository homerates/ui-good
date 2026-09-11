// lib/gateway/scenarioIntelligenceShaping.ts
//
// Invocable Tool Workstream (2026-09-11). Same explicit-allow-list
// construction discipline as the other 3 tools' shaping files. The
// loan_limit_zone field reuses shapeLoanLimitIntelligenceForExternalContract()
// verbatim (the SAME shaping function homerates_loan_limit_intelligence
// uses) and extracts only the classification-relevant subset -- this tool's
// envelope doesn't need a second nested contract_version/query/disclaimer,
// but the field shapes and claim_types are byte-identical to that tool's
// own output, per the "shared engines own shared facts" ownership rule.

import { EDUCATIONAL_DISCLAIMER } from '../disclosures';
import type { ScenarioResult } from '../pricing/scenarioIntelligence';
import { shapeLoanLimitIntelligenceForExternalContract } from './loanLimitShaping';
import type { ScenarioIntelligenceV1 } from './scenarioIntelligenceSchema';

export function shapeScenarioIntelligenceForExternalContract(raw: ScenarioResult): ScenarioIntelligenceV1 {
  const shapedLoanLimit = shapeLoanLimitIntelligenceForExternalContract(raw.loanLimitZone);

  return {
    contract_version: 'scenario-intelligence-v1',
    program: raw.program,
    inputs: {
      price: raw.inputs.price,
      down_payment_pct: raw.inputs.downPaymentPct,
      down_payment_amount: raw.inputs.downPaymentAmount,
      term_years: raw.inputs.termYears,
      rate_pct: raw.inputs.ratePct,
      property_tax_rate_pct: raw.inputs.propertyTaxRatePct,
      insurance_annual: raw.inputs.insuranceAnnual,
      hoa_monthly: raw.inputs.hoaMonthly,
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
    loan_structure: {
      down_payment_amount: raw.loanStructure.downPaymentAmount,
      base_loan_amount: raw.loanStructure.baseLoanAmount,
      upfront_fee: raw.loanStructure.upfrontFee,
      upfront_fee_label: raw.loanStructure.upfrontFeeLabel,
      total_loan_amount: raw.loanStructure.totalLoanAmount,
      ltv: raw.loanStructure.ltv,
      claim_type: 'DERIVED CALCULATION',
    },
    monthly_breakdown: raw.monthlyBreakdown
      ? {
          principal_interest: raw.monthlyBreakdown.principalInterest,
          tax: raw.monthlyBreakdown.tax,
          insurance: raw.monthlyBreakdown.insurance,
          mortgage_insurance: raw.monthlyBreakdown.mortgageInsurance,
          mortgage_insurance_label: raw.monthlyBreakdown.mortgageInsuranceLabel,
          hoa: raw.monthlyBreakdown.hoa,
          piti: raw.monthlyBreakdown.piti,
          pitia: raw.monthlyBreakdown.pitia,
          claim_type: 'DERIVED CALCULATION' as const,
        }
      : null,
    loan_limit_zone: {
      county_resolution: shapedLoanLimit.county_resolution,
      national_baseline_limit: shapedLoanLimit.national_baseline_limit,
      county_conforming_limit: shapedLoanLimit.county_conforming_limit,
      fha_county_limit: shapedLoanLimit.fha_county_limit,
      classification: shapedLoanLimit.classification,
    },
    jumbo_detail: raw.jumboDetail ? { conforming_limit: raw.jumboDetail.conformingLimit, loan_exceeds_conforming: raw.jumboDetail.loanExceedsConforming } : null,
    program_detail: raw.programDetail,
    qualification: raw.qualification
      ? { front_end_dti: raw.qualification.frontEndDTI, back_end_dti: raw.qualification.backEndDTI, claim_type: 'DERIVED CALCULATION' as const }
      : null,
    assumptions: raw.assumptions.map((a) => ({ field: a.field, value: a.value, reason: a.reason, claim_type: 'ILLUSTRATIVE ASSUMPTION' as const })),
    disclaimer: EDUCATIONAL_DISCLAIMER,
  };
}
