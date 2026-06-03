/**
 * lib/constants.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH for all mortgage/financial constants.
 *
 * When FHFA or HUD publish new annual limits, update this file only.
 * No more searching across 13 files for hardcoded 832750 or 541287.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── 2026 Loan Limits (FHFA / HUD, effective Jan 1 2026) ──────────────────────
export const FHA_FLOOR_2026         = 541_287;   // national floor (standard county)
export const FHA_CEILING_2026       = 1_249_125; // high-cost area ceiling
export const CONF_STANDARD_2026     = 832_750;   // baseline conforming limit
export const CONF_HIGH_BALANCE_2026 = 1_249_125; // CA high-balance ceiling

// Short aliases — use these in new code so the year isn't everywhere
export const FHA_FLOOR        = FHA_FLOOR_2026;
export const FHA_CEILING      = FHA_CEILING_2026;
export const CONF_STANDARD    = CONF_STANDARD_2026;
export const CONF_HIGH_BALANCE = CONF_HIGH_BALANCE_2026;

// ── FHA MIP Rates (HUD ML 2023-01) ───────────────────────────────────────────
export const FHA_UFMIP_RATE      = 0.0175;  // 1.75% upfront MIP, financed into loan
export const FHA_ANNUAL_MIP_HIGH = 0.0055;  // 0.55%/yr — LTV > 90% or term > 15yr
export const FHA_ANNUAL_MIP_LOW  = 0.0050;  // 0.50%/yr — LTV ≤ 90%

// ── PMI Rates (conventional) ─────────────────────────────────────────────────
export const PMI_RATE_DEFAULT = 0.008;   // 0.80%/yr — conservative fallback
export const PMI_RATE_STD     = 0.0055; // 0.55%/yr — LTV 90–95%
export const PMI_RATE_LOW     = 0.0030; // 0.30%/yr — LTV 80–90%
export const PMI_RATE_INVEST  = 0.005;  // 0.50%/yr — DSCR/investment estimate

// ── Fallback Rates (used when FRED data unavailable) ─────────────────────────
/** Used when FRED fetch fails — should mirror long-term market average */
export const FALLBACK_RATE_30Y  = 6.5;
export const DSCR_RATE_PREMIUM  = 0.5;  // DSCR loans typically +0.50% over 30Y avg

// ── Default Property Cost Rates (national averages) ──────────────────────────
export const TAX_RATE_DEFAULT  = 0.011;  // 1.10%/yr of purchase price
export const INS_RATE_DEFAULT  = 0.003;  // 0.30%/yr of purchase price
export const INS_RATE_HIGH     = 0.005;  // 0.50%/yr — used in older/legacy paths
export const INS_ANNUAL_FLAT   = 1_200;  // $1,200/yr flat — legacy, kept for compat

// ── DTI Thresholds (Fannie Mae / Freddie Mac / HUD guidelines) ───────────────
export const DTI_STANDARD_MAX     = 0.43;  // Fannie/Freddie/FHA standard back-end
export const DTI_CONVENTIONAL_MAX = 0.50;  // with compensating factors (DU/LP)
export const DTI_VA_MAX           = 0.41;  // VA guideline (plus residual income test)
export const DTI_JUMBO_STD        = 0.38;  // typical jumbo lender cap
export const DTI_JUMBO_MAX        = 0.43;  // some jumbo lenders allow 43%
export const DTI_FRONT_END        = 0.28;  // housing ratio only (front-end)
export const DTI_CONSERVATIVE     = 0.36;  // conservative underwriting guideline
