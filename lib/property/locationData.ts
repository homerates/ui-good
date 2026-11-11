// lib/property/locationData.ts
// Location scores from US government open data — the sourced replacement for the
// location sub-scores Grok used to fill "from your knowledge" (Property Intelligence
// step 2, started 2026-11-11 when grounding left L4 empty).
//
// Sources (free, no key, verified live 2026-11-11):
//   - EPA National Walkability Index (block group, 1–20 scale, EPA's own 4 bands)
//   - FEMA National Flood Hazard Layer (flood zone at the point; SFHA = high-risk area
//     where flood insurance is required for federally backed mortgages)
// Coordinates come from the Census geocoder (lib/censusGeocoder.ts).
//
// Deliberately NOT scored yet:
//   - Wildfire: USFS Wildfire Risk to Communities layers return values for developed
//     areas, but their published scale isn't documented in the service metadata, and
//     they rate Altadena (Eaton fire, 2025) the same as low-risk suburbs. No score is
//     better than a misleading one.
//   - Commute (Census ACS) needs a Census API key; schools need a ratings source.
// FEMA's service doesn't answer non-US traffic; Vercel runs in the US.

import { geocodeAddress } from '../censusGeocoder';
import { log } from '../logger';

const TIMEOUT_MS = 12_000;

const EPA_WALK_URL = 'https://geodata.epa.gov/arcgis/rest/services/OA/WalkabilityIndex/MapServer/0/query';
const FEMA_NFHL_URL = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query';
export const EPA_WALK_SOURCE = 'https://www.epa.gov/smartgrowth/national-walkability-index-user-guide-and-methodology';
export const FEMA_FLOOD_SOURCE = 'https://msc.fema.gov/portal/home';

export interface LocationSubScore {
    metric: string;
    score: number;          // 0–100, higher = better for a homeowner
    rating: string;
    description: string;
    source_url: string;
    source: string;
}

export interface GovernmentLocationData {
    overall_score: number | null;
    sub_scores: LocationSubScore[];
    flood_zone: string | null;
    flood_high_risk: boolean | null;
    walkability_index: number | null;
}

function pointQuery(base: string, lng: number, lat: number, outFields: string): string {
    const p = new URLSearchParams({
        geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects', outFields, returnGeometry: 'false', f: 'json',
    });
    return `${base}?${p.toString()}`;
}

async function firstFeature(url: string): Promise<Record<string, unknown> | null> {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) return null;
        const j = await res.json();
        return (j?.features?.[0]?.attributes as Record<string, unknown>) ?? null;
    } catch (e: unknown) {
        log.warn('[locationData] source unavailable', { url: url.split('?')[0], error: (e as Error)?.message });
        return null;
    }
}

/** EPA bands, from the Walkability Index user guide. */
function walkability(index: number): LocationSubScore {
    const rating = index <= 5.75 ? 'Least walkable'
        : index <= 10.5 ? 'Below average walkability'
        : index <= 15.25 ? 'Above average walkability'
        : 'Most walkable';
    return {
        metric: 'Walkability',
        score: Math.round(((Math.min(20, Math.max(1, index)) - 1) / 19) * 100),
        rating,
        description: `EPA National Walkability Index ${index.toFixed(1)} of 20 for this neighborhood (${rating.toLowerCase()}), based on intersection density, transit proximity and mix of uses.`,
        source_url: EPA_WALK_SOURCE,
        source: 'EPA National Walkability Index',
    };
}

function flood(attrs: Record<string, unknown>): LocationSubScore | null {
    const zone = String(attrs.FLD_ZONE ?? '').trim();
    const subtype = String(attrs.ZONE_SUBTY ?? '').trim();
    const sfha = String(attrs.SFHA_TF ?? '') === 'T';
    if (!zone) return null;
    if (zone === 'D') return null; // "undetermined" — no score rather than a guess
    const base = { metric: 'Flood Risk', source_url: FEMA_FLOOD_SOURCE, source: 'FEMA National Flood Hazard Layer' };
    if (sfha) {
        return {
            ...base, score: 20, rating: `High risk (FEMA Zone ${zone})`,
            description: `In a FEMA Special Flood Hazard Area (Zone ${zone}). Flood insurance is required for federally backed mortgages here, which adds to the monthly cost.`,
        };
    }
    if (/0\.2\s*PCT/i.test(subtype)) {
        return {
            ...base, score: 60, rating: `Moderate risk (FEMA Zone ${zone}, 0.2% annual chance)`,
            description: 'Outside the high-risk flood area but within the 0.2%-annual-chance (500-year) floodplain. Flood insurance is optional but worth pricing.',
        };
    }
    return {
        ...base, score: 95, rating: `Minimal risk (FEMA Zone ${zone})`,
        description: `FEMA maps this location as an area of minimal flood hazard (Zone ${zone}). Flood insurance is not required for federally backed mortgages.`,
    };
}

/** Never throws. Returns null when the address can't be geocoded. */
export async function getGovernmentLocationData(address: string): Promise<GovernmentLocationData | null> {
    const geo = await geocodeAddress(address).catch(() => null);
    if (!geo) return null;
    const { latitude: lat, longitude: lng } = geo;

    const [walkAttrs, floodAttrs] = await Promise.all([
        firstFeature(pointQuery(EPA_WALK_URL, lng, lat, 'NatWalkInd')),
        firstFeature(pointQuery(FEMA_NFHL_URL, lng, lat, 'FLD_ZONE,ZONE_SUBTY,SFHA_TF')),
    ]);

    const subs: LocationSubScore[] = [];
    const walkIndex = typeof walkAttrs?.NatWalkInd === 'number' ? walkAttrs.NatWalkInd : null;
    if (walkIndex != null) subs.push(walkability(walkIndex));
    const floodScore = floodAttrs ? flood(floodAttrs) : null;
    if (floodScore) subs.push(floodScore);

    return {
        overall_score: subs.length ? Math.round(subs.reduce((a, s) => a + s.score, 0) / subs.length) : null,
        sub_scores: subs,
        flood_zone: floodAttrs ? String(floodAttrs.FLD_ZONE ?? '') || null : null,
        flood_high_risk: floodAttrs ? String(floodAttrs.SFHA_TF ?? '') === 'T' : null,
        walkability_index: walkIndex,
    };
}
