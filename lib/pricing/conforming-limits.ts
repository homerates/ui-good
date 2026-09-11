// lib/pricing/conforming-limits.ts
// Server-side only — imports full county data files.
// Returns the highest 1-unit conforming limit in a given state so the LLPA
// engine can correctly classify a loan as standard / high-balance / above-limit.

import { CA_LOAN_LIMITS_2026 } from '../loanLimits2026';
import {
  HIGH_COST_COUNTIES,
  NATIONAL_CONFORMING_BASELINE,
  HIGH_COST_STATES,
  STATE_NAMES,
} from '../loanLimitsNational2026';

// 2026 standard conforming baseline (all non-high-cost counties)
export const CONFORMING_BASELINE_2026 = NATIONAL_CONFORMING_BASELINE.units1; // $832,750

export type ConformingStatus = 'standard' | 'high_balance' | 'above_limit';

export interface StateLimitInfo {
  /** National standard conforming floor — $832,750 for 2026 */
  baseline: number;
  /** Highest 1-unit conforming limit in any county in this state */
  ceiling: number;
  /** True if the state has any high-cost counties above the national baseline */
  isHighCostState: boolean;
  stateName: string;
}

/** Returns the baseline, ceiling, and high-cost status for a 2-letter state code. */
export function getStateLimitInfo(state: string): StateLimitInfo {
  const upper    = (state ?? '').toUpperCase().trim();
  const baseline = NATIONAL_CONFORMING_BASELINE.units1;
  const stateName = STATE_NAMES[upper] ?? upper;

  if (upper === 'CA') {
    const ceiling = Math.max(...CA_LOAN_LIMITS_2026.map(c => c.conforming.units1));
    return { baseline, ceiling, isHighCostState: true, stateName };
  }

  if (HIGH_COST_STATES.has(upper) && HIGH_COST_COUNTIES[upper]?.length) {
    const ceiling = Math.max(...HIGH_COST_COUNTIES[upper].map(c => c.conforming.units1));
    return { baseline, ceiling, isHighCostState: true, stateName };
  }

  return { baseline, ceiling: baseline, isHighCostState: false, stateName };
}

/**
 * Classifies a loan amount against the state's conforming ceiling:
 *   standard      → loan ≤ $832,750 (national baseline)
 *   high_balance  → $832,750 < loan ≤ county ceiling (Fannie LLPA still applies + HB surcharge)
 *   above_limit   → loan > ceiling (non-conforming / jumbo — Fannie LLPA does NOT apply)
 */
export function getConformingStatus(loanAmount: number, ceiling: number): ConformingStatus {
  if (loanAmount <= CONFORMING_BASELINE_2026) return 'standard';
  if (loanAmount <= ceiling)                  return 'high_balance';
  return 'above_limit';
}

// ── Dynamic Conventional / High-Balance card classification ─────────────────
// Added for the "Dynamic Conventional / High-Balance Classification + Jumbo
// Comparison" workstream (2026-09-10). This is the SAME classification
// getConformingStatus() already provides (reused, not reinvented) plus one
// additional state getConformingStatus() was never designed to answer:
// COUNTY_REQUIRED, for the case where the loan exceeds the national baseline
// but no county-specific ceiling has been resolved yet -- we do not guess a
// county's high-balance limit; we say plainly that county data is needed.
//
// nationalMaxPossibleLimit (CONF_HIGH_BALANCE) lets a loan that exceeds the
// highest ceiling ANY U.S. county could have be classified ABOVE_CONVENTIONAL_LIMIT
// immediately, without forcing a county search the answer doesn't actually
// depend on -- e.g. a $2.4M loan is above every possible conventional limit
// regardless of which county it's in.
export type ConventionalZone = 'CONFORMING' | 'HIGH_BALANCE' | 'ABOVE_CONVENTIONAL_LIMIT' | 'COUNTY_REQUIRED';

export interface ConventionalZoneResult {
  zone: ConventionalZone;
  baselineLimit: number;
  /** The resolved county's own conforming ceiling, or null if not yet resolved / not applicable (CONFORMING). */
  applicableCountyLimit: number | null;
}

export function classifyConventionalLoan(
  rawLoanAmount: number,
  countyConformingLimit: number | null,
  nationalMaxPossibleLimit: number,
): ConventionalZoneResult {
  // Round to the nearest dollar before comparing against a hard threshold --
  // a caller that back-calculates loan amount from a rounded purchase price
  // (price/(1-down%)) can land a fraction of a dollar off an exact boundary
  // (e.g. 832750.2 instead of 832750), which would otherwise misclassify an
  // intentionally-at-baseline scenario as just-above-baseline. No real
  // loan-limit distinction is ever meaningful below whole-dollar precision.
  const loanAmount = Math.round(rawLoanAmount);
  const baselineLimit = CONFORMING_BASELINE_2026;
  if (loanAmount <= baselineLimit) {
    return { zone: 'CONFORMING', baselineLimit, applicableCountyLimit: null };
  }
  if (loanAmount > nationalMaxPossibleLimit) {
    return { zone: 'ABOVE_CONVENTIONAL_LIMIT', baselineLimit, applicableCountyLimit: countyConformingLimit };
  }
  if (countyConformingLimit == null) {
    return { zone: 'COUNTY_REQUIRED', baselineLimit, applicableCountyLimit: null };
  }
  const status = getConformingStatus(loanAmount, countyConformingLimit);
  return {
    zone: status === 'high_balance' ? 'HIGH_BALANCE' : 'ABOVE_CONVENTIONAL_LIMIT',
    baselineLimit,
    applicableCountyLimit: countyConformingLimit,
  };
}
