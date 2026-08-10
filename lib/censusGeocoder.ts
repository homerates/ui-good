import { getSupabase } from './supabaseServer';

const GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';
const GEOCODER_COORDS_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';

// Newest-first vintage chain. Current_Current uses the most recent TIGER/Line address data;
// older ACS vintages are tried when Current_Current returns no match.
// All vintages use the same 2020 census tract boundaries, so GEOIDs are stable across vintages.
const VINTAGE_CHAIN = ['Current_Current', 'ACS2025_Current', 'ACS2024_Current'] as const;

export type GeocodeResult = {
  censusTractGeoid: string;
  latitude: number;
  longitude: number;
  vintage_used: string;
};

// Thrown only on actual API/network failures — callers must distinguish from null (no match).
export class GeocoderError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'GeocoderError';
  }
}

function normalizeAddress(address: string): string {
  return address.toLowerCase().trim().replace(/\s+/g, ' ');
}

async function tryVintage(address: string, vintage: string): Promise<GeocodeResult | null> {
  const url =
    `${GEOCODER_URL}?address=${encodeURIComponent(address)}` +
    `&benchmark=Public_AR_Current&vintage=${vintage}&layers=10&format=json`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    throw new GeocoderError(`Census Geocoder network error: ${(err as Error).message}`);
  }

  if (!res.ok) {
    throw new GeocoderError(`Census Geocoder HTTP ${res.status}`, res.status);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new GeocoderError('Census Geocoder returned non-JSON response');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matches = (body as any)?.result?.addressMatches;
  if (!Array.isArray(matches) || matches.length === 0) {
    return null; // valid no-match for this vintage — caller tries next
  }

  const match = matches[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bg = (match?.geographies?.['Census Block Groups'] as any[])?.[0];
  if (!bg?.STATE || !bg?.COUNTY || !bg?.TRACT) {
    throw new GeocoderError('Census Geocoder response missing tract geography fields');
  }

  const censusTractGeoid =
    String(bg.STATE).padStart(2, '0') +
    String(bg.COUNTY).padStart(3, '0') +
    String(bg.TRACT).padStart(6, '0');

  const latitude = Number(match.coordinates?.y);
  const longitude = Number(match.coordinates?.x);

  if (isNaN(latitude) || isNaN(longitude)) {
    throw new GeocoderError('Census Geocoder response missing coordinate fields');
  }

  return { censusTractGeoid, latitude, longitude, vintage_used: vintage };
}

// Reverse-geocode: coordinates → county FIPS. Unlike onelineaddress, this is a direct
// spatial join against TIGER geography (no addressMatches wrapper) — used when the
// caller already has a trusted lat/lng (e.g. a Google Places selection) and a bare
// city name would otherwise fail text-based matching (city name ≠ county name for
// most US cities).
async function tryVintageCoordinates(lat: number, lng: number, vintage: string): Promise<GeocodeResult | null> {
  const url =
    `${GEOCODER_COORDS_URL}?x=${lng}&y=${lat}` +
    `&benchmark=Public_AR_Current&vintage=${vintage}&layers=10&format=json`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    throw new GeocoderError(`Census Geocoder network error: ${(err as Error).message}`);
  }

  if (!res.ok) {
    throw new GeocoderError(`Census Geocoder HTTP ${res.status}`, res.status);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new GeocoderError('Census Geocoder returned non-JSON response');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bg = ((body as any)?.result?.geographies?.['Census Block Groups'] as any[])?.[0];
  if (!bg?.STATE || !bg?.COUNTY || !bg?.TRACT) {
    return null; // valid no-match (e.g. water, out-of-coverage territory) — caller tries next vintage
  }

  const censusTractGeoid =
    String(bg.STATE).padStart(2, '0') +
    String(bg.COUNTY).padStart(3, '0') +
    String(bg.TRACT).padStart(6, '0');

  return { censusTractGeoid, latitude: lat, longitude: lng, vintage_used: vintage };
}

export async function geocodeCoordinates(lat: number, lng: number): Promise<GeocodeResult | null> {
  let result: GeocodeResult | null = null;
  for (const vintage of VINTAGE_CHAIN) {
    result = await tryVintageCoordinates(lat, lng, vintage);
    if (result) break;
  }
  return result;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const sb = getSupabase();
  const normalized = normalizeAddress(address);

  // Cache check — returns cached result including the vintage that produced it
  if (sb) {
    const { data } = await sb
      .from('address_geocode_cache')
      .select('census_tract_geoid, latitude, longitude, vintage_used')
      .eq('normalized_address', normalized)
      .maybeSingle();
    if (data) {
      return {
        censusTractGeoid: data.census_tract_geoid,
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        vintage_used: (data.vintage_used as string) ?? 'Current_Current',
      };
    }
  }

  // Try each vintage in order; stop at first match.
  // A no-match from one vintage is not an error — fall through to the next.
  let result: GeocodeResult | null = null;
  for (const vintage of VINTAGE_CHAIN) {
    result = await tryVintage(address, vintage);
    if (result) break;
  }

  if (!result) return null;

  // Write to cache — store the vintage that produced the match so future reads know
  if (sb) {
    await sb.from('address_geocode_cache').upsert(
      {
        normalized_address: normalized,
        census_tract_geoid: result.censusTractGeoid,
        latitude: result.latitude,
        longitude: result.longitude,
        vintage_used: result.vintage_used,
      },
      { onConflict: 'normalized_address' }
    );
  }

  return result;
}
