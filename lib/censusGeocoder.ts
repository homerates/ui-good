import { getSupabase } from '@/lib/supabaseServer';

const GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';

export type GeocodeResult = {
  censusTractGeoid: string;
  latitude: number;
  longitude: number;
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

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const sb = getSupabase();
  const normalized = normalizeAddress(address);

  // Cache check
  if (sb) {
    const { data } = await sb
      .from('address_geocode_cache')
      .select('census_tract_geoid, latitude, longitude')
      .eq('normalized_address', normalized)
      .maybeSingle();
    if (data) {
      return {
        censusTractGeoid: data.census_tract_geoid,
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
      };
    }
  }

  // Census Geocoder API call
  // layers=10 returns "Census Block Groups" which embed STATE/COUNTY/TRACT fields —
  // the 11-digit census tract GEOID is constructed from those three fields.
  const url =
    `${GEOCODER_URL}?address=${encodeURIComponent(address)}` +
    `&benchmark=Public_AR_Current&vintage=Current_Current&layers=10&format=json`;

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
    return null; // valid no-match — address not found, not an error
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

  // Write to cache (best-effort — don't fail the geocode if the write fails)
  if (sb) {
    await sb.from('address_geocode_cache').upsert(
      { normalized_address: normalized, census_tract_geoid: censusTractGeoid, latitude, longitude },
      { onConflict: 'normalized_address' }
    );
  }

  return { censusTractGeoid, latitude, longitude };
}
