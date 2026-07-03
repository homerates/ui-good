import { SupabaseClient } from '@supabase/supabase-js';
import { geocodeAddress, GeocoderError } from './censusGeocoder';
import { getSupabase } from './supabaseServer';
import { AMI_SIZE_FACTORS } from './amiSizeFactors';

const ELIGIBLE_INCOME_LEVELS = new Set(['Low', 'Moderate']);

export type FfiecEligibilityResult = {
  method: 'geocoded' | 'county_fallback' | 'unresolved';
  census_tract_geoid: string | null;
  tract_income_level: string | null;
  distressed_underserved: boolean;
  tract_eligible: boolean;
  ffiec_mfi_estimate: number | null;
  ffiec_adjusted_limit: number | null;
  income_eligible: boolean;
  any_eligible: boolean;
  // Diagnostic fields — surfaced in debug panel only
  geocode_attempted: boolean;
  geocode_failure_reason: 'not_attempted' | 'no_match' | 'error' | 'geoid_not_in_db' | null;
  ffiec_tract_data_year: number | null;
  ffiec_mfi_data_year: number | null;
};

async function mfiForMsaMd(
  sb: SupabaseClient,
  msaMd: string | null,
): Promise<{ estimate: number; data_year: number } | null> {
  if (!msaMd) return null;
  const { data } = await sb
    .from('ffiec_mfi')
    .select('mfi_estimate, data_year')
    .eq('msa_md', msaMd)
    .order('data_year', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { estimate: Number(data.mfi_estimate), data_year: Number(data.data_year) } : null;
}

// Fetches all msa_md values for a county and counts occurrences in JS.
// Supabase JS doesn't support GROUP BY; county tract counts are bounded enough
// that a high-limit select is the cleanest approach without a stored procedure.
async function dominantMsaMdForCounty(sb: SupabaseClient, countyFips: string): Promise<string | null> {
  const { data } = await sb
    .from('ffiec_census_tracts')
    .select('msa_md')
    .eq('county_fips', countyFips)
    .not('msa_md', 'is', null)
    .limit(5000);

  if (!data?.length) return null;

  const counts: Record<string, number> = {};
  for (const row of data) {
    if (row.msa_md) counts[row.msa_md] = (counts[row.msa_md] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export async function checkFfiecEligibility({
  address,
  county_fips,
  income,
  household_size,
}: {
  address?: string | null;
  county_fips: string | null;
  income: number;
  household_size: number;
}): Promise<FfiecEligibilityResult> {
  const sb = getSupabase();

  const clampedSize = Math.max(1, Math.min(8, household_size));
  const sizeFactor = AMI_SIZE_FACTORS[clampedSize] ?? 1.00;

  // Track diagnostic state across paths
  let geocode_attempted = false;
  let geocode_failure_reason: FfiecEligibilityResult['geocode_failure_reason'] = 'not_attempted';

  if (!sb) {
    return {
      method: 'unresolved', census_tract_geoid: null, tract_income_level: null,
      distressed_underserved: false, tract_eligible: false, ffiec_mfi_estimate: null,
      ffiec_adjusted_limit: null, income_eligible: false, any_eligible: false,
      geocode_attempted: false, geocode_failure_reason: 'not_attempted',
      ffiec_tract_data_year: null, ffiec_mfi_data_year: null,
    };
  }

  // ── Path 1: geocoded address → direct tract lookup ─────────────────────────
  if (address?.trim()) {
    geocode_attempted = true;
    try {
      const geo = await geocodeAddress(address.trim());
      if (geo) {
        const { data: tract } = await sb
          .from('ffiec_census_tracts')
          .select('tract_income_level, distressed_underserved, msa_md, data_year')
          .eq('census_tract_geoid', geo.censusTractGeoid)
          .maybeSingle();

        if (tract) {
          const tractEligible =
            ELIGIBLE_INCOME_LEVELS.has(tract.tract_income_level) ||
            !!tract.distressed_underserved;

          const mfiResult = await mfiForMsaMd(sb, tract.msa_md as string | null);
          const mfiEstimate = mfiResult?.estimate ?? null;
          const adjustedLimit =
            mfiEstimate != null ? Math.round(mfiEstimate * sizeFactor * 0.80) : null;
          const incomeEligible = adjustedLimit != null && income <= adjustedLimit;

          return {
            method: 'geocoded',
            census_tract_geoid: geo.censusTractGeoid,
            tract_income_level: tract.tract_income_level as string,
            distressed_underserved: !!tract.distressed_underserved,
            tract_eligible: tractEligible,
            ffiec_mfi_estimate: mfiEstimate,
            ffiec_adjusted_limit: adjustedLimit,
            income_eligible: incomeEligible,
            any_eligible: tractEligible || incomeEligible,
            geocode_attempted: true,
            geocode_failure_reason: null,
            ffiec_tract_data_year: Number(tract.data_year),
            ffiec_mfi_data_year: mfiResult?.data_year ?? null,
          };
        }
        // Geocode succeeded but GEOID not in our ffiec_census_tracts table
        geocode_failure_reason = 'geoid_not_in_db';
      } else {
        // Census Geocoder returned empty matches — valid no-match
        geocode_failure_reason = 'no_match';
      }
    } catch (err) {
      if (!(err instanceof GeocoderError)) throw err;
      // Census API/network failure — fall through to county_fallback
      geocode_failure_reason = 'error';
    }
  }

  // ── Path 2: county_fips → dominant MSA/MD → ffiec_mfi ─────────────────────
  if (county_fips) {
    const msaMd = await dominantMsaMdForCounty(sb, county_fips);
    const mfiResult = await mfiForMsaMd(sb, msaMd);

    if (mfiResult != null) {
      const adjustedLimit = Math.round(mfiResult.estimate * sizeFactor * 0.80);
      return {
        method: 'county_fallback',
        census_tract_geoid: null,
        tract_income_level: null,
        distressed_underserved: false,
        tract_eligible: false,
        ffiec_mfi_estimate: mfiResult.estimate,
        ffiec_adjusted_limit: adjustedLimit,
        income_eligible: income <= adjustedLimit,
        any_eligible: income <= adjustedLimit,
        geocode_attempted,
        geocode_failure_reason,
        ffiec_tract_data_year: null,
        ffiec_mfi_data_year: mfiResult.data_year,
      };
    }
  }

  return {
    method: 'unresolved',
    census_tract_geoid: null,
    tract_income_level: null,
    distressed_underserved: false,
    tract_eligible: false,
    ffiec_mfi_estimate: null,
    ffiec_adjusted_limit: null,
    income_eligible: false,
    any_eligible: false,
    geocode_attempted,
    geocode_failure_reason,
    ffiec_tract_data_year: null,
    ffiec_mfi_data_year: null,
  };
}
