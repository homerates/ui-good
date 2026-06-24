// app/api/zip-county-lookup/route.ts
// GET /api/zip-county-lookup?zip=90210
// Calls the Census Bureau geocoding API (free, no key) to resolve ZIP → county.
// Returns county name, state code, and the exact conforming loan limit for that county.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { CA_LOAN_LIMITS_2026 } from '../../../lib/loanLimits2026';
import {
  HIGH_COST_COUNTIES,
  NATIONAL_CONFORMING_BASELINE,
} from '../../../lib/loanLimitsNational2026';

// CA stores "LOS ANGELES". National stores "KING COUNTY", "ANCHORAGE MUNICIPALITY", etc.
// Census API returns "Los Angeles", "King", "Anchorage Municipality".
// Two-pass matching: exact uppercase, then append/strip " COUNTY".
function findCountyLimit(stateCode: string, censusCountyName: string): number {
  const baseline  = NATIONAL_CONFORMING_BASELINE.units1;
  const searchRaw = censusCountyName.toUpperCase().trim();

  if (stateCode === 'CA') {
    // CA data has no suffix — just the bare county name
    return CA_LOAN_LIMITS_2026.find(c => c.county === searchRaw)?.conforming.units1 ?? baseline;
  }

  const counties = HIGH_COST_COUNTIES[stateCode];
  if (!counties?.length) return baseline;

  // Pass 1: exact match (handles AK boroughs, municipalities, etc.)
  const exact = counties.find(c => c.county === searchRaw);
  if (exact) return exact.conforming.units1;

  // Pass 2: Census returns just the name ("King") — national data has "KING COUNTY"
  const withCounty = counties.find(c => c.county === searchRaw + ' COUNTY');
  if (withCounty) return withCounty.conforming.units1;

  // Pass 3: Census returned "King County" style — strip and retry
  const stripped = searchRaw.replace(/\s+COUNTY$/, '').trim();
  const strippedMatch = counties.find(
    c => c.county === stripped || c.county === stripped + ' COUNTY',
  );
  if (strippedMatch) return strippedMatch.conforming.units1;

  return baseline;
}

export async function GET(req: NextRequest) {
  const zip = req.nextUrl.searchParams.get('zip')?.trim();
  if (!zip || !/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: 'Enter a valid 5-digit ZIP code' }, { status: 400 });
  }

  try {
    // Census Bureau geocoder — free, no API key, authoritative for US addresses
    const url = new URL('https://geocoding.geo.census.gov/geocoder/geographies/address');
    url.searchParams.set('benchmark', 'Public_AR_Current');
    url.searchParams.set('vintage', 'Current_Current');
    url.searchParams.set('format',    'json');
    url.searchParams.set('layers',    'Counties');
    url.searchParams.set('street',    '1 Main St');
    url.searchParams.set('zip',       zip);

    const r = await fetch(url.toString(), {
      headers: { 'User-Agent': 'HomeRates.ai Rate Intelligence/1.0' },
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) throw new Error(`Census API ${r.status}`);

    const json = await r.json();
    const match = json?.result?.addressMatches?.[0];
    if (!match) {
      return NextResponse.json({ error: 'ZIP code not found — double-check and try again' }, { status: 404 });
    }

    const stateCode  = (match.addressComponents?.state ?? '').toUpperCase();
    const countyName = match.geographies?.Counties?.[0]?.NAME ?? '';

    if (!stateCode || !countyName) {
      return NextResponse.json({ error: 'Could not determine county for this ZIP' }, { status: 404 });
    }

    const conformingLimit = findCountyLimit(stateCode, countyName);
    const baseline        = NATIONAL_CONFORMING_BASELINE.units1;

    return NextResponse.json({
      zip,
      county:         countyName,
      stateCode,
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
