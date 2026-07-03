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
};

const UNRESOLVED: FfiecEligibilityResult = {
  method: 'unresolved',
  census_tract_geoid: null,
  tract_income_level: null,
  distressed_underserved: false,
  tract_eligible: false,
  ffiec_mfi_estimate: null,
  ffiec_adjusted_limit: null,
  income_eligible: false,
  any_eligible: false,
};

async function mfiForMsaMd(sb: SupabaseClient, msaMd: string | null): Promise<number | null> {
  if (!msaMd) return null;
  const { data } = await sb
    .from('ffiec_mfi')
    .select('mfi_estimate')
    .eq('msa_md', msaMd)
    .order('data_year', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? Number(data.mfi_estimate) : null;
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
  if (!sb) return UNRESOLVED;

  const clampedSize = Math.max(1, Math.min(8, household_size));
  const sizeFactor = AMI_SIZE_FACTORS[clampedSize] ?? 1.00;

  // ── Path 1: geocoded address → direct tract lookup ─────────────────────────
  if (address?.trim()) {
    try {
      const geo = await geocodeAddress(address.trim());
      if (geo) {
        const { data: tract } = await sb
          .from('ffiec_census_tracts')
          .select('tract_income_level, distressed_underserved, msa_md')
          .eq('census_tract_geoid', geo.censusTractGeoid)
          .maybeSingle();

        if (tract) {
          const tractEligible =
            ELIGIBLE_INCOME_LEVELS.has(tract.tract_income_level) ||
            !!tract.distressed_underserved;

          const mfiEstimate = await mfiForMsaMd(sb, tract.msa_md as string | null);
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
          };
        }
        // geo resolved but tract not in our DB → fall through to county_fallback
      }
    } catch (err) {
      if (!(err instanceof GeocoderError)) throw err;
      // Census API failure — fall through to county_fallback; don't surface the error
    }
  }

  // ── Path 2: county_fips → dominant MSA/MD → ffiec_mfi ─────────────────────
  if (county_fips) {
    const msaMd = await dominantMsaMdForCounty(sb, county_fips);
    const mfiEstimate = await mfiForMsaMd(sb, msaMd);

    if (mfiEstimate != null) {
      const adjustedLimit = Math.round(mfiEstimate * sizeFactor * 0.80);
      return {
        method: 'county_fallback',
        census_tract_geoid: null,
        tract_income_level: null,
        distressed_underserved: false,
        tract_eligible: false,
        ffiec_mfi_estimate: mfiEstimate,
        ffiec_adjusted_limit: adjustedLimit,
        income_eligible: income <= adjustedLimit,
        any_eligible: income <= adjustedLimit,
      };
    }
  }

  return UNRESOLVED;
}
