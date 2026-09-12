// lib/property/countyResolution.ts
//
// Resolves a ZIP code to its dominant county name via geo_crosswalk -- the
// same source and fallback app/api/zip-county-lookup/route.ts and
// app/api/ami-qualifier/route.ts already use. Extracted here so
// lib/propertyIntelligence.ts and app/api/beta/grok-property/route.ts can
// share one resolution path instead of each guessing county a different
// way (see the 2026-09-12 bug this fixes: propertyIntelligence.ts was
// passing CITY into lookupTaxRate()'s county parameter, silently defeating
// the curated COUNTY_TAX_OVERRIDES table for nearly every property).
//
// geo_crosswalk's own county_name column is null for essentially every row
// (the HUD USPS ETL only ever populates county_fips) -- county_fips ->
// hud_features.county_name is the real resolution path, not an edge case.
// Never throws: a lookup failure or unmapped ZIP returns null, the same
// "fall back to state-level" signal lookupTaxRate() already handles.

import type { SupabaseClient } from '@supabase/supabase-js';

export async function resolveCountyByZip(
  sb: SupabaseClient,
  zip: string | null | undefined,
): Promise<string | null> {
  if (!zip || !/^\d{5}$/.test(zip)) return null;

  try {
    const { data } = await sb
      .from('geo_crosswalk')
      .select('county_fips, county_name')
      .eq('zip', zip)
      .order('res_ratio', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return null;
    if (data.county_name) return data.county_name as string;

    if (data.county_fips) {
      const { data: hud } = await sb
        .from('hud_features')
        .select('county_name')
        .eq('county_fips', data.county_fips)
        .order('fiscal_year', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (hud?.county_name) return hud.county_name as string;
    }

    return null;
  } catch {
    return null;
  }
}
