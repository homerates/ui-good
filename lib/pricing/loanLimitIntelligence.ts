// lib/pricing/loanLimitIntelligence.ts
//
// Invocable Tool Workstream (2026-09-11) -- canonical engine behind the new
// homerates_loan_limit_intelligence external tool. Reuses the existing
// loan-limit tables (lib/loanLimits2026.ts's CA_LOAN_LIMITS_2026,
// lib/loanLimitsNational2026.ts's HIGH_COST_COUNTIES) and the existing
// classifyConventionalLoan() classification function (AD-28) verbatim --
// no new loan-limit data table is introduced here, per this workstream's
// explicit instruction not to duplicate what those files already maintain.
//
// FHA-per-county data is a REAL, HONEST gap outside California:
// CA_LOAN_LIMITS_2026 carries a real HUD FHA figure for every one of its 58
// counties (the `.fha` field), but loanLimitsNational2026.ts's
// HIGH_COST_COUNTIES table (every other state) has never carried FHA data --
// confirmed directly, not assumed. FHA county limits are NOT a simple
// function of the GSE conforming limit: e.g. Alpine, CA is GSE-standard
// (non-high-balance, conforming = the $832,750 baseline) but its real FHA
// limit is $736,000 -- well above the $541,287 national FHA floor -- so no
// formula safely derives a non-CA county's FHA limit from data this
// codebase already has. Rather than fabricate a number (or silently reuse
// the conforming limit, which would sometimes be wrong), FHA limit/
// classification for any non-CA county honestly reports UNAVAILABLE.
//
// YEAR -- CURRENT_LOAN_LIMIT_YEAR is the only year this codebase has real
// data for (2026, FHFA CY2026 / HUD No. 25-145). A caller requesting any
// other year still gets a resolved location (geography doesn't depend on
// year), but every limit/classification field reports UNAVAILABLE rather
// than a silently-wrong figure carried over from the only year on file.

import { getSupabase } from '../supabaseServer';
import { CA_LOAN_LIMITS_2026 } from '../loanLimits2026';
import { HIGH_COST_COUNTIES, NATIONAL_CONFORMING_BASELINE } from '../loanLimitsNational2026';
import { classifyConventionalLoan } from './conforming-limits';

export const CURRENT_LOAN_LIMIT_YEAR = 2026;

export type Units = 1 | 2 | 3 | 4;
export type Program = 'conventional' | 'fha' | 'both';
export type LoanLimitClassification =
  | 'CONFORMING'
  | 'HIGH_BALANCE'
  | 'ABOVE_CONFORMING_LIMIT'
  | 'WITHIN_FHA_LIMIT'
  | 'ABOVE_FHA_LIMIT'
  | 'COUNTY_REQUIRED'
  | 'UNAVAILABLE';

export interface LoanLimitQuery {
  zip?: string;
  county?: string;
  state?: string;
  year?: number;
  units?: Units;
  loanAmount?: number;
  program?: Program;
}

export type CountyResolutionStatus = 'RESOLVED' | 'UNRESOLVED' | 'NOT_PROVIDED';
export type LimitAvailability = 'AVAILABLE' | 'COUNTY_REQUIRED' | 'UNAVAILABLE';

export interface LoanLimitResult {
  query: { zip: string | null; county: string | null; state: string | null; year: number; units: Units; loanAmount: number | null; program: Program };
  countyResolution: { status: CountyResolutionStatus; county: string | null; state: string | null; source: 'ZIP_LOOKUP' | 'DIRECT_INPUT' | null };
  nationalBaselineLimit: { value: number | null; status: 'AVAILABLE' | 'UNAVAILABLE' };
  countyConformingLimit: { value: number | null; isHighBalance: boolean | null; status: LimitAvailability };
  fhaCountyLimit: { value: number | null; status: LimitAvailability };
  classification: { conventional: LoanLimitClassification | null; fha: LoanLimitClassification | null };
  isCurrentYear: boolean;
}

const unitKey = (units: Units) => `units${units}` as const;

// Max possible conforming ceiling per unit count, computed from the real
// tables at module load -- not a second hardcoded constant that could drift
// out of sync with them. Hawaii's Kalawao/Maui statutory exception
// ($1,299,500 1-unit) is the true national maximum, one tier above every
// other high-cost county's $1,249,125 ceiling.
const MAX_CEILING_BY_UNITS: Record<Units, number> = (() => {
  const allConforming = [
    ...CA_LOAN_LIMITS_2026.map((c) => c.conforming),
    ...Object.values(HIGH_COST_COUNTIES).flat().map((c) => c.conforming),
  ];
  return {
    1: Math.max(...allConforming.map((c) => c.units1)),
    2: Math.max(...allConforming.map((c) => c.units2)),
    3: Math.max(...allConforming.map((c) => c.units3)),
    4: Math.max(...allConforming.map((c) => c.units4)),
  };
})();

function normalizeCountyName(raw: string): string {
  return raw.toUpperCase().trim().replace(/\s+COUNTY$/i, '').trim();
}

/** Resolves a county's real conforming + FHA limits from the existing
 * tables only -- returns the national baseline (fhaLimit null) for any
 * county not found in either table, the same fallback both
 * app/api/zip-county-lookup/route.ts and lib/loanLimits2026.ts's
 * getCALoanLimits() already use. */
function lookupCountyLimits(state: string, county: string, units: Units): { conformingLimit: number; fhaLimit: number | null; isHighBalance: boolean } {
  const upperState = state.toUpperCase().trim();
  const uKey = unitKey(units);
  const normalized = normalizeCountyName(county);

  if (upperState === 'CA') {
    const match = CA_LOAN_LIMITS_2026.find((c) => c.county === normalized);
    if (match) return { conformingLimit: match.conforming[uKey], fhaLimit: match.fha[uKey], isHighBalance: match.isHighBalance };
  }

  const counties = HIGH_COST_COUNTIES[upperState] ?? [];
  const raw = county.toUpperCase().trim();
  const match = counties.find((c) => c.county === raw || c.county === normalized || c.county === `${normalized} COUNTY`);
  if (match) return { conformingLimit: match.conforming[uKey], fhaLimit: null, isHighBalance: match.isHighBalance };

  return { conformingLimit: NATIONAL_CONFORMING_BASELINE[uKey], fhaLimit: null, isHighBalance: false };
}

/** ZIP -> county/state, reusing the IDENTICAL geo_crosswalk + hud_features
 * resolution pattern already proven live in
 * app/api/zip-county-lookup/route.ts and app/api/ami-qualifier/route.ts --
 * same tables, same fallback (geo_crosswalk.county_name is null for every
 * row; hud_features resolves the real name from county_fips), no new
 * resolution table or heuristic invented for this tool. */
async function resolveZip(zip: string): Promise<{ county: string; state: string } | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from('geo_crosswalk')
    .select('county_fips, county_name, state_abbr')
    .eq('zip', zip)
    .order('res_ratio', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  let countyName = data.county_name as string | null;
  let stateCode = data.state_abbr as string | null;
  if (!countyName && data.county_fips) {
    const { data: hud } = await sb
      .from('hud_features')
      .select('county_name, state_abbr')
      .eq('county_fips', data.county_fips)
      .order('fiscal_year', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (hud) {
      countyName = hud.county_name as string;
      stateCode = (hud.state_abbr as string) ?? stateCode;
    }
  }
  if (!countyName || !stateCode) return null;
  return { county: countyName, state: stateCode.toUpperCase() };
}

function classifyFha(loanAmount: number | null, fhaLimit: number | null, resolved: boolean, isCurrentYear: boolean): LoanLimitClassification | null {
  if (loanAmount == null) return null;
  if (!isCurrentYear) return 'UNAVAILABLE';
  if (!resolved) return 'COUNTY_REQUIRED';
  if (fhaLimit == null) return 'UNAVAILABLE';
  return loanAmount <= fhaLimit ? 'WITHIN_FHA_LIMIT' : 'ABOVE_FHA_LIMIT';
}

function classifyConventional(loanAmount: number | null, countyConformingLimit: number | null, units: Units, isCurrentYear: boolean): LoanLimitClassification | null {
  if (loanAmount == null) return null;
  if (!isCurrentYear) return 'UNAVAILABLE';
  const result = classifyConventionalLoan(loanAmount, countyConformingLimit, MAX_CEILING_BY_UNITS[units]);
  // classifyConventionalLoan()'s zone names are CONFORMING/HIGH_BALANCE/
  // ABOVE_CONVENTIONAL_LIMIT/COUNTY_REQUIRED (AD-28) -- this tool's contract
  // (per the brief) names the third state ABOVE_CONFORMING_LIMIT instead;
  // the other three names already match verbatim.
  if (result.zone === 'ABOVE_CONVENTIONAL_LIMIT') return 'ABOVE_CONFORMING_LIMIT';
  return result.zone;
}

export async function getLoanLimitIntelligence(q: LoanLimitQuery): Promise<LoanLimitResult> {
  const units: Units = q.units ?? 1;
  const year = q.year ?? CURRENT_LOAN_LIMIT_YEAR;
  const program: Program = q.program ?? 'both';
  const isCurrentYear = year === CURRENT_LOAN_LIMIT_YEAR;
  const loanAmount = typeof q.loanAmount === 'number' && Number.isFinite(q.loanAmount) ? q.loanAmount : null;

  let resolvedCounty: string | null = null;
  let resolvedState: string | null = null;
  let source: 'ZIP_LOOKUP' | 'DIRECT_INPUT' | null = null;
  let resolutionStatus: CountyResolutionStatus = 'NOT_PROVIDED';

  if (q.zip) {
    const zipResult = await resolveZip(q.zip);
    if (zipResult) {
      resolvedCounty = zipResult.county;
      resolvedState = zipResult.state;
      source = 'ZIP_LOOKUP';
      resolutionStatus = 'RESOLVED';
    } else {
      resolutionStatus = 'UNRESOLVED';
    }
  } else if (q.county && q.state) {
    resolvedCounty = q.county;
    resolvedState = q.state.toUpperCase();
    source = 'DIRECT_INPUT';
    resolutionStatus = 'RESOLVED';
  }

  const resolved = resolutionStatus === 'RESOLVED';

  let countyConformingLimit: number | null = null;
  let isHighBalance: boolean | null = null;
  let fhaLimitValue: number | null = null;

  if (resolved && resolvedCounty && resolvedState) {
    const looked = lookupCountyLimits(resolvedState, resolvedCounty, units);
    countyConformingLimit = looked.conformingLimit;
    isHighBalance = looked.isHighBalance;
    fhaLimitValue = looked.fhaLimit;
  }

  const countyConformingStatus: LimitAvailability = !isCurrentYear ? 'UNAVAILABLE' : resolved ? 'AVAILABLE' : 'COUNTY_REQUIRED';
  const fhaStatus: LimitAvailability = !isCurrentYear ? 'UNAVAILABLE' : !resolved ? 'COUNTY_REQUIRED' : fhaLimitValue != null ? 'AVAILABLE' : 'UNAVAILABLE';

  return {
    query: {
      zip: q.zip ?? null,
      county: q.county ?? null,
      state: q.state ? q.state.toUpperCase() : null,
      year,
      units,
      loanAmount,
      program,
    },
    countyResolution: { status: resolutionStatus, county: resolvedCounty, state: resolvedState, source },
    nationalBaselineLimit: {
      value: isCurrentYear ? NATIONAL_CONFORMING_BASELINE[unitKey(units)] : null,
      status: isCurrentYear ? 'AVAILABLE' : 'UNAVAILABLE',
    },
    countyConformingLimit: {
      value: countyConformingStatus === 'AVAILABLE' ? countyConformingLimit : null,
      isHighBalance: countyConformingStatus === 'AVAILABLE' ? isHighBalance : null,
      status: countyConformingStatus,
    },
    fhaCountyLimit: {
      value: fhaStatus === 'AVAILABLE' ? fhaLimitValue : null,
      status: fhaStatus,
    },
    classification: {
      conventional: program === 'fha' ? null : classifyConventional(loanAmount, countyConformingLimit, units, isCurrentYear),
      fha: program === 'conventional' ? null : classifyFha(loanAmount, fhaLimitValue, resolved, isCurrentYear),
    },
    isCurrentYear,
  };
}
