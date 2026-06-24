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
