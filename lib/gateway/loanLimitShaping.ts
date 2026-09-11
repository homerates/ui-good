// lib/gateway/loanLimitShaping.ts
//
// Invocable Tool Workstream (2026-09-11). Same explicit-allow-list
// construction discipline as lib/gateway/outputShaping.ts /
// benchmarkRatesShaping.ts (no spread, no destructure-then-omit) -- every
// field below is read from a named path on the internal LoanLimitResult and
// written to a named path on the external contract, with the claim_type
// each field actually earns: the raw published limits are MARKET FACT (an
// external agency's own published figure, like a benchmark rate -- not
// HomeRates' own math), the classification is DERIVED CALCULATION (a
// straightforward comparison HomeRates computed from those published
// figures plus the caller's loan amount).

import { EDUCATIONAL_DISCLAIMER } from '../disclosures';
import { CURRENT_LOAN_LIMIT_YEAR, type LoanLimitResult } from '../pricing/loanLimitIntelligence';
import type { LoanLimitIntelligenceV1 } from './loanLimitSchema';

export function shapeLoanLimitIntelligenceForExternalContract(raw: LoanLimitResult): LoanLimitIntelligenceV1 {
  return {
    contract_version: 'loan-limit-intelligence-v1',
    query: {
      zip: raw.query.zip,
      county: raw.query.county,
      state: raw.query.state,
      year: raw.query.year,
      units: raw.query.units,
      loan_amount: raw.query.loanAmount,
      program: raw.query.program,
    },
    county_resolution: {
      status: raw.countyResolution.status,
      county: raw.countyResolution.county,
      state: raw.countyResolution.state,
      source: raw.countyResolution.source,
    },
    national_baseline_limit: {
      value: raw.nationalBaselineLimit.value,
      units: raw.query.units,
      claim_type: 'MARKET FACT',
      source: 'FHFA (Federal Housing Finance Agency)',
      year: CURRENT_LOAN_LIMIT_YEAR,
      status: raw.nationalBaselineLimit.status,
    },
    county_conforming_limit: {
      value: raw.countyConformingLimit.value,
      is_high_balance: raw.countyConformingLimit.isHighBalance,
      claim_type: 'MARKET FACT',
      source: 'FHFA (Federal Housing Finance Agency)',
      year: CURRENT_LOAN_LIMIT_YEAR,
      status: raw.countyConformingLimit.status,
    },
    fha_county_limit: {
      value: raw.fhaCountyLimit.value,
      claim_type: 'MARKET FACT',
      source: 'HUD (U.S. Department of Housing and Urban Development)',
      year: CURRENT_LOAN_LIMIT_YEAR,
      status: raw.fhaCountyLimit.status,
    },
    classification: {
      conventional: raw.classification.conventional,
      fha: raw.classification.fha,
      claim_type: 'DERIVED CALCULATION',
    },
    as_of: {
      requested_year: raw.query.year,
      current_data_year: CURRENT_LOAN_LIMIT_YEAR,
      is_current_year: raw.isCurrentYear,
    },
    disclaimer: EDUCATIONAL_DISCLAIMER,
  };
}
