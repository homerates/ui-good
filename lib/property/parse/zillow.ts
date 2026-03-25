// lib/property/parse/zillow.ts
// Parses Zillow's embedded __NEXT_DATA__ JSON.
// Zillow's internal schema has changed 4+ times — we try 6 known paths.
// First candidate that yields a price wins; otherwise best partial data returned.

import type { PropertyData } from '../schema';

// Safe deep-get — never throws, returns undefined on any missing key
function dig(obj: unknown, ...keys: (string | number)[]): unknown {
    let cur: unknown = obj;
    for (const k of keys) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = (cur as Record<string | number, unknown>)[k];
    }
    return cur;
}

function toNum(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function toStr(v: unknown): string | null {
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function parsePrice(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) && v > 1000 ? Math.round(v) : null;
    if (typeof v === 'string') {
        const n = parseInt(v.replace(/[$,]/g, ''), 10);
        return Number.isFinite(n) && n > 1000 ? n : null;
    }
    return null;
}

function extractNextData(html: string): unknown {
    const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!m?.[1]) return null;
    try { return JSON.parse(m[1]); } catch { return null; }
}

// Zillow sometimes stores gdpClientCache as a stringified JSON-in-JSON
function unwrapGdpCache(raw: unknown): unknown {
    if (typeof raw !== 'string') return typeof raw === 'object' ? raw : null;
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) {
            const keys = Object.keys(parsed as object);
            // gdpClientCache shape: { "ForSale_<zpid>": { property: {...} } }
            for (const k of keys) {
                const inner = (parsed as Record<string, unknown>)[k];
                const prop = dig(inner, 'property');
                if (prop) return prop;
                if (inner && typeof inner === 'object') return inner;
            }
        }
        return parsed;
    } catch { return null; }
}

interface Extracted {
    price:       number | null;
    address:     string | null;
    city:        string | null;
    state:       string | null;
    zip:         string | null;
    county:      string | null;
    beds:        number | null;
    baths:       number | null;
    sqft:        number | null;
    annualTaxes: number | null;
    photoUrl:    string | null;
    warnings:    string[];
}

function extractFields(prop: unknown): Extracted {
    const warnings: string[] = [];

    const price =
        parsePrice(dig(prop, 'price')) ??
        parsePrice(dig(prop, 'listPrice')) ??
        parsePrice(dig(prop, 'hdpData', 'homeInfo', 'price')) ??
        null;

    if (!price) warnings.push('no price in property object');

    const streetAddr =
        toStr(dig(prop, 'address', 'streetAddress')) ??
        toStr(dig(prop, 'streetAddress')) ??
        toStr(dig(prop, 'hdpData', 'homeInfo', 'streetAddress'));

    const city =
        toStr(dig(prop, 'address', 'city')) ??
        toStr(dig(prop, 'city')) ??
        toStr(dig(prop, 'hdpData', 'homeInfo', 'city'));

    const state =
        toStr(dig(prop, 'address', 'state')) ??
        toStr(dig(prop, 'state')) ??
        toStr(dig(prop, 'hdpData', 'homeInfo', 'state'));

    const zip =
        toStr(dig(prop, 'address', 'zipcode')) ??
        toStr(dig(prop, 'zipcode')) ??
        toStr(dig(prop, 'hdpData', 'homeInfo', 'zipcode'));

    const county =
        toStr(dig(prop, 'county')) ??
        toStr(dig(prop, 'countyName')) ??
        toStr(dig(prop, 'hdpData', 'homeInfo', 'county'));

    const address = streetAddr && city && state && zip
        ? `${streetAddr}, ${city}, ${state} ${zip}`
        : streetAddr ?? null;

    const beds =
        toNum(dig(prop, 'bedrooms')) ??
        toNum(dig(prop, 'beds')) ??
        toNum(dig(prop, 'hdpData', 'homeInfo', 'bedrooms'));

    const baths =
        toNum(dig(prop, 'bathrooms')) ??
        toNum(dig(prop, 'baths')) ??
        toNum(dig(prop, 'hdpData', 'homeInfo', 'bathrooms')) ??
        (() => {
            const full = toNum(dig(prop, 'bathroomsFull')) ?? 0;
            const half = toNum(dig(prop, 'bathroomsHalf')) ?? 0;
            return full > 0 ? full + half * 0.5 : null;
        })();

    const sqft =
        toNum(dig(prop, 'livingArea')) ??
        toNum(dig(prop, 'hdpData', 'homeInfo', 'livingArea'));

    // Tax — guard against rate values (< 100 = not a dollar amount)
    const rawTax = parsePrice(dig(prop, 'taxAnnualAmount')) ?? null;
    const annualTaxes = rawTax !== null && rawTax > 100 ? rawTax : null;

    // Photo — prefer hi-res images array, fallback to thumbnail fields
    let photoUrl: string | null = null;
    const photos = dig(prop, 'photos') ?? dig(prop, 'originalPhotos') ?? dig(prop, 'images');
    if (Array.isArray(photos) && photos.length > 0) {
        const first = photos[0];
        photoUrl =
            toStr(dig(first, 'url')) ??
            toStr(dig(first, 'baseUrl')) ??
            toStr(dig(first, 'mixedSources', 'jpeg', 0, 'url')) ??
            null;
    }
    if (!photoUrl) {
        photoUrl = toStr(dig(prop, 'imgSrc')) ?? toStr(dig(prop, 'thumb')) ?? null;
    }

    return { price, address, city, state: state?.toUpperCase() ?? null,
        zip, county, beds, baths, sqft, annualTaxes, photoUrl, warnings };
}

export function parseZillow(html: string): Partial<PropertyData> | null {
    const nextData = extractNextData(html);
    if (!nextData) return null;

    const pp = dig(nextData, 'props', 'pageProps');

    // All known schema paths, newest first
    const candidates: Array<{ label: string; prop: unknown }> = [
        { label: 'componentProps.listingData.property',    prop: dig(pp, 'componentProps', 'listingData', 'property') },
        { label: 'initialData.property',                   prop: dig(pp, 'initialData', 'property') },
        { label: 'initialReduxState.gdp.response.property',prop: dig(pp, 'initialReduxState', 'gdp', 'response', 'property') },
        { label: 'gdpClientCache (stringified)',            prop: unwrapGdpCache(dig(pp, 'gdpClientCache')) },
        { label: 'listing',                                 prop: dig(pp, 'listing') },
        { label: 'initialData.building',                    prop: dig(pp, 'initialData', 'building') },
    ];

    let best: Extracted | null = null;

    for (const { prop } of candidates) {
        if (!prop) continue;
        const ex = extractFields(prop);
        if (ex.price !== null) { best = ex; break; }
        if (!best) best = ex; // keep first non-null candidate as partial
    }

    if (!best) return null;

    return {
        source:       'zillow',
        price:        best.price,
        address:      best.address,
        city:         best.city,
        state:        best.state,
        zip:          best.zip,
        county:       best.county,
        beds:         best.beds,
        baths:        best.baths,
        sqft:         best.sqft,
        annualTaxes:  best.annualTaxes,
        photoUrl:     best.photoUrl,
        parsedBy:     'zillow_next_data',
        parseWarnings: best.warnings,
    };
}
