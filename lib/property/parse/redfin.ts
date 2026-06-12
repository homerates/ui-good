// lib/property/parse/redfin.ts
// Parses Redfin listing pages via JSON-LD structured data (schema.org).
// Falls back gracefully to og: parser in fetch.ts if nothing found.

import type { PropertyData, ListingStatus } from '../schema';

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

function extractAllJsonLd(html: string): unknown[] {
    const results: unknown[] = [];
    const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        try {
            const parsed = JSON.parse(m[1]);
            results.push(parsed);
            if (Array.isArray(parsed?.['@graph'])) {
                for (const item of parsed['@graph']) results.push(item);
            }
        } catch { /* skip malformed block */ }
    }
    return results;
}

const LISTING_TYPES = [
    'RealEstateListing','SingleFamilyResidence','House',
    'Residence','Apartment','Condominium','Townhouse','Product',
];

/** Street number + zip pulled from the Redfin URL slug, e.g.
 *  /CA/Yorba-Linda/28525-Evening-Breeze-Dr-92887/home/4285772 → { streetNum: '28525', zip: '92887' } */
function urlExpectations(url: string | undefined): { streetNum: string | null; zip: string | null } {
    if (!url) return { streetNum: null, zip: null };
    const seg = url.match(/redfin\.com\/[A-Za-z]{2}\/[^/]+\/([^/]+)\//i)?.[1] ?? '';
    const streetNum = seg.match(/^(\d+)-/)?.[1] ?? null;
    const zip = seg.match(/-(\d{5})$/)?.[1] ?? null;
    return { streetNum, zip };
}

/** Redfin's MAIN listing blob uses an ARRAY @type (["Product","RealEstateListing"]).
 *  toStr() returns null for arrays — which made the old type check skip the main blob
 *  and pick the first string-typed "similar homes" carousel item (wrong property). */
function blobTypes(b: unknown): string[] {
    const t = dig(b, '@type');
    if (typeof t === 'string') return [t];
    if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string');
    return [];
}

/** Redfin pages embed JSON-LD for the main listing AND for "similar homes" carousel
 *  items. Selection semantics (verified against live pages 2026-06-11):
 *  - The MAIN blob often has NO address fields at all (street null) but carries the price.
 *  - Carousel blobs DO carry street addresses — of OTHER properties.
 *  So: reject only blobs whose address CONTRADICTS the URL. Absence of an address is
 *  neutral (cannot contradict) and must not disqualify the main blob. */
function blobMatchesUrl(b: unknown, expect: { streetNum: string | null; zip: string | null }): boolean {
    if (!expect.streetNum && !expect.zip) return true; // nothing to validate against
    const street = toStr(dig(b, 'address', 'streetAddress'));
    const zip    = toStr(dig(b, 'address', 'postalCode'));
    if (street) {
        // Street present — it must match the URL's street number
        return expect.streetNum ? street.trim().startsWith(expect.streetNum) : true;
    }
    if (zip && expect.zip) return zip === expect.zip;
    return true; // no address info — neutral
}

function findListingBlob(blobs: unknown[], expect: { streetNum: string | null; zip: string | null }): unknown | null {
    // Pass 0: positive street-number match — the strongest possible signal
    if (expect.streetNum) {
        for (const b of blobs) {
            const street = toStr(dig(b, 'address', 'streetAddress'));
            if (street && street.trim().startsWith(expect.streetNum)) return b;
        }
    }
    // Pass 1: known schema.org types (array @type supported), contradictions excluded
    for (const b of blobs) {
        const types = blobTypes(b);
        if (types.some(t => LISTING_TYPES.some(lt => t.includes(lt))) && blobMatchesUrl(b, expect)) return b;
    }
    // Pass 2: anything with a price, contradictions excluded
    for (const b of blobs) {
        if ((dig(b, 'offers', 'price') ?? dig(b, 'price')) && blobMatchesUrl(b, expect)) return b;
    }
    return null;
}

/** Detect listing status from Redfin's page title and JSON-LD availability.
 *  Redfin titles: "SOLD - 24101 Zancon...", "PENDING - ...", or plain address.
 *  JSON-LD: offers.availability "Discontinued"/"OutOfStock" → SOLD, "LimitedAvailability" → PENDING */
function detectRedfinStatus(html: string, blob: unknown): ListingStatus {
    // 1. Title tag — most reliable signal
    const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleM) {
        const title = titleM[1].trim();
        if (/^sold\b/i.test(title))       return 'SOLD';
        if (/^off.market\b/i.test(title)) return 'OFF_MARKET';
        if (/^pending\b/i.test(title))    return 'PENDING';
    }
    // 2. JSON-LD offers.availability
    const avail = toStr(dig(blob, 'offers', 'availability')) ?? '';
    if (/discontinued|outofstock|sold/i.test(avail))       return 'SOLD';
    if (/limitedavailability|pending/i.test(avail))        return 'PENDING';
    if (/instock|forsale|available/i.test(avail))          return 'FOR_SALE';
    // 3. Redfin data-rf attribute in HTML
    if (/data-rf-test-name="abp-status"[^>]*>\s*Sold/i.test(html))       return 'SOLD';
    if (/data-rf-test-name="abp-status"[^>]*>\s*Off.Market/i.test(html)) return 'OFF_MARKET';
    if (/data-rf-test-name="abp-status"[^>]*>\s*Pending/i.test(html))    return 'PENDING';
    if (/data-rf-test-name="abp-status"[^>]*>\s*Active/i.test(html))     return 'FOR_SALE';
    // 4. Redfin sold-banner or off-market indicators in page body
    if (/class="[^"]*sold[^"]*"[^>]*>\s*(?:This home|Sold)/i.test(html)) return 'SOLD';
    if (/off.market|not.*for.*sale|no longer.*listed/i.test(html))        return 'OFF_MARKET';
    // 5. Fallback: JSON-LD blob has a price, no negative signal fired → likely active listing
    if (blob && dig(blob, 'offers', 'price')) return 'FOR_SALE';
    return null;
}

export function parseRedfin(html: string, url?: string): Partial<PropertyData> | null {
    const blobs = extractAllJsonLd(html);
    const blob  = findListingBlob(blobs, urlExpectations(url));
    if (!blob) return null;

    const price =
        parsePrice(dig(blob, 'offers', 'price')) ??
        parsePrice(dig(blob, 'price')) ??
        null;

    const addrObj   = dig(blob, 'address');
    const streetAddr = toStr(dig(addrObj, 'streetAddress'));
    const city       = toStr(dig(addrObj, 'addressLocality'));
    const state      = toStr(dig(addrObj, 'addressRegion'))?.toUpperCase() ?? null;
    const zip        = toStr(dig(addrObj, 'postalCode'));
    const address    = streetAddr && city && state && zip
        ? `${streetAddr}, ${city}, ${state} ${zip}`
        : streetAddr ?? null;

    const beds  = toNum(dig(blob, 'numberOfBedrooms')) ?? toNum(dig(blob, 'numberOfRooms'));
    const baths = toNum(dig(blob, 'numberOfBathroomsTotal')) ?? toNum(dig(blob, 'numberOfFullBathrooms'));
    const sqft  = toNum(dig(blob, 'floorSize', 'value'));

    const rawTax    = parsePrice(dig(blob, 'taxAnnualAmount')) ?? null;
    const annualTaxes = rawTax !== null && rawTax > 100 ? rawTax : null;

    const imageRaw = dig(blob, 'image');
    let photoUrl: string | null = null;
    if (typeof imageRaw === 'string') photoUrl = imageRaw;
    else if (Array.isArray(imageRaw) && imageRaw.length > 0) photoUrl = toStr(imageRaw[0]);

    const listingStatus = detectRedfinStatus(html, blob);

    return {
        source:       'redfin',
        price,
        address,
        city,
        state,
        zip,
        county:       null,
        beds,
        baths,
        sqft,
        annualTaxes,
        photoUrl,
        listingStatus,
        parsedBy:     'redfin_script',
        parseWarnings: price ? [] : ['json-ld: no price found'],
    };
}
