// app/api/zip-county-lookup/route.ts
// GET /api/zip-county-lookup?zip=90210
// Resolves ZIP → county using the geo_crosswalk Supabase table (same source used by geoFeatures.ts).
// Returns county name, state code, and the exact conforming loan limit for that county.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CA_LOAN_LIMITS_2026 } from '../../../lib/loanLimits2026';
import {
  HIGH_COST_COUNTIES,
  NATIONAL_CONFORMING_BASELINE,
} from '../../../lib/loanLimitsNational2026';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

// geo_crosswalk stores county names in title case without suffix ("Los Angeles", "King").
// CA data: "LOS ANGELES" (no suffix). National: "KING COUNTY", "ANCHORAGE MUNICIPALITY".
// Two-pass matching handles both.
function findCountyLimit(stateCode: string, countyName: string): number {
  const baseline = NATIONAL_CONFORMING_BASELINE.units1;
  const raw      = countyName.toUpperCase().trim();
  const stripped = raw.replace(/\s+COUNTY$/i, '').trim();

  if (stateCode === 'CA') {
    return (
      CA_LOAN_LIMITS_2026.find(c => c.county === stripped || c.county === raw)
        ?.conforming.units1 ?? baseline
    );
  }

  const counties = HIGH_COST_COUNTIES[stateCode];
  if (!counties?.length) return baseline;

  // Pass 1: exact match — covers AK boroughs/municipalities stored with their suffix
  const exact = counties.find(c => c.county === raw);
  if (exact) return exact.conforming.units1;

  // Pass 2: append " COUNTY" — geo_crosswalk returns "King", national data has "KING COUNTY"
  const withSuffix = counties.find(c => c.county === raw + ' COUNTY' || c.county === stripped + ' COUNTY');
  if (withSuffix) return withSuffix.conforming.units1;

  return baseline;
}

export async function GET(req: NextRequest) {
  const zip = req.nextUrl.searchParams.get('zip')?.trim();
  if (!zip || !/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: 'Enter a valid 5-digit ZIP code' }, { status: 400 });
  }

  try {
    const sb = getServiceClient();

    // Pick the row with the highest residential ratio when a ZIP spans multiple counties
    const { data, error } = await sb
      .from('geo_crosswalk')
      .select('county_name, state_abbr')
      .eq('zip', zip)
      .order('res_ratio', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);

    // geo_crosswalk covers HUD-tracked ZIPs but not every US ZIP code.
    // Return notFound (not an error) so the client can fall back gracefully to the state estimate.
    if (!data) {
      return NextResponse.json({ notFound: true }, { status: 200 });
    }

    const { county_name: countyName, state_abbr: stateCode } = data;
    if (!countyName || !stateCode) {
      return NextResponse.json({ notFound: true }, { status: 200 });
    }

    const conformingLimit = findCountyLimit(stateCode, countyName);
    const baseline        = NATIONAL_CONFORMING_BASELINE.units1;

    return NextResponse.json({
      zip,
      county:         countyName,
      stateCode:      stateCode.toUpperCase(),
      conformingLimit,
      conformingBaseline: baseline,
      isHighBalance:  conformingLimit > baseline,
    });
  } catch (err) {
    console.error('[zip-county-lookup]', err);
    return NextResponse.json(
      { error: 'Lookup failed — check your connection or try again' },
      { status: 502 },
    );
  }
}
