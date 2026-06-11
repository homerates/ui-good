// lib/property/fetch.ts
// Orchestrates property data extraction from a listing URL.
// Fetch chain: detect → fetch HTML → site parser → og: fill-in → tax table

import { detectListingUrl }   from './detect';
import { parseOpenGraph }     from './parse/opengraph';
import { parseZillow }        from './parse/zillow';
import { parseRedfin }        from './parse/redfin';
import { lookupTaxRate }      from './taxTable';
import type { PropertyData, PropertyLookupResult } from './schema';

const FETCH_TIMEOUT_MS = 9_000;

// Browser-like headers to avoid trivial bot-detection blocks.
// Not guaranteed — Zillow/Redfin can still block server IPs.
const HEADERS: Record<string, string> = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-Fetch-Dest':  'document',
    'Sec-Fetch-Mode':  'navigate',
    'Sec-Fetch-Site':  'none',
    'Cache-Control':   'no-cache',
};

async function fetchHtml(url: string): Promise<{ html: string; status: number; finalUrl: string }> {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: ctrl.signal });
        const html = await res.text();
        return { html, status: res.status, finalUrl: res.url || url };
    } finally {
        clearTimeout(timer);
    }
}

// Merge site-specific parse result with og: data.
// Site-specific wins on every field it populated.
// og:image always wins for photoUrl — it is guaranteed to be a public CDN URL.
function merge(primary: Partial<PropertyData> | null, og: Partial<PropertyData>): Partial<PropertyData> {
    if (!primary) return og;
    const r: Partial<PropertyData> = { ...primary };
    const fill = (k: keyof PropertyData) => {
        if ((r[k] === null || r[k] === undefined) && og[k] != null) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (r as any)[k] = og[k];
        }
    };
    fill('price'); fill('address'); fill('city'); fill('state'); fill('zip');
    fill('beds'); fill('baths'); fill('sqft');
    // og:image wins for photoUrl — but only when it's a real property photo, not a brand/logo image.
    // Redfin's sign-in wall returns its logo as og:image — reject those.
    const isPropertyPhoto = (url: string | null | undefined) =>
        typeof url === 'string' && url.startsWith('http') && !/\/logo/i.test(url) && !/redfin-logo/i.test(url);
    if (isPropertyPhoto(og.photoUrl)) r.photoUrl = og.photoUrl;
    return r;
}

/**
 * Best-effort address extraction from a Zillow homedetails URL slug.
 * Slug format: /homedetails/5365-Long-Shadow-Ct-Westlake-Village-CA-91362/16487723_zpid/
 * Returns null if the slug doesn't match the expected pattern.
 */
function parseAddressFromZillowSlug(url: string): { address: string; city: string | null; state: string | null; zip: string | null } | null {
    // Extract the slug between /homedetails/ and the next /
    const slugMatch = url.match(/\/homedetails\/([^/]+)/i);
    if (!slugMatch) return null;
    const slug = slugMatch[1];

    // Slug ends with -STATE-ZIP (e.g. -CA-91362)
    const tailMatch = slug.match(/^(.+)-([A-Z]{2})-(\d{5})$/i);
    if (!tailMatch) return null;

    const beforeStatZip = tailMatch[1]; // e.g. "5365-Long-Shadow-Ct-Westlake-Village"
    const state = tailMatch[2].toUpperCase();
    const zip   = tailMatch[3];

    // Split street from city: street number is always the first token, street
    // ends before the city (no reliable delimiter — use heuristic: capitalize each word)
    const parts = beforeStatZip.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

    // Street suffix keywords help identify where city starts
    const SUFFIXES = new Set(['St','Ave','Blvd','Dr','Ln','Ct','Way','Pl','Rd','Ter','Cir','Loop','Pkwy','Hwy','Fwy','Trl','Path']);
    let suffixIdx = -1;
    for (let i = parts.length - 1; i >= 0; i--) {
        if (SUFFIXES.has(parts[i])) { suffixIdx = i; break; }
    }

    let streetParts: string[], cityParts: string[];
    if (suffixIdx !== -1 && suffixIdx < parts.length - 1) {
        streetParts = parts.slice(0, suffixIdx + 1);
        cityParts   = parts.slice(suffixIdx + 1);
    } else {
        // Fallback: first 3 tokens = street, rest = city
        streetParts = parts.slice(0, 3);
        cityParts   = parts.slice(3);
    }

    const street = streetParts.join(' ');
    const city   = cityParts.length > 0 ? cityParts.join(' ') : null;
    const address = [street, city, state, zip].filter(Boolean).join(', ');

    return { address, city, state, zip };
}

/**
 * Best-effort address extraction from a Redfin listing URL slug.
 * Format: /STATE/CITY/STREET-ADDRESS-ZIP/home/ID
 * e.g. /CA/San-Diego/4545-Illinois-St-92116/home/189065780
 */
function parseAddressFromRedfinSlug(url: string): { address: string; city: string | null; state: string | null; zip: string | null } | null {
    // Match /STATE/CITY/STREET/home/ID — STATE is 2 uppercase letters
    const m = url.match(/\/([A-Z]{2})\/([^/]+)\/([^/]+)\/home\/\d+/i);
    if (!m) return null;

    const state      = m[1].toUpperCase();
    const citySlug   = m[2];
    const streetSlug = m[3];

    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

    // City: replace hyphens with spaces, capitalize each word
    const city = citySlug.split('-').map(capitalize).join(' ');

    // Street: extract ZIP from end if present (5 digits), then parse street
    const streetParts = streetSlug.split('-');
    let zip: string | null = null;
    if (/^\d{5}$/.test(streetParts[streetParts.length - 1])) {
        zip = streetParts.pop()!;
    }

    const SUFFIXES = new Set(['St','Ave','Blvd','Dr','Ln','Ct','Way','Pl','Rd','Ter','Cir','Loop','Pkwy','Hwy','Trl','Path','Unit']);
    let suffixIdx = -1;
    const parts = streetParts.map(capitalize);
    for (let i = parts.length - 1; i >= 0; i--) {
        if (SUFFIXES.has(parts[i])) { suffixIdx = i; break; }
    }
    const street = suffixIdx !== -1 ? parts.slice(0, suffixIdx + 1).join(' ') : parts.join(' ');
    const address = [street, city, state, zip].filter(Boolean).join(', ');

    return { address, city, state, zip };
}

export async function fetchPropertyData(rawUrl: string): Promise<PropertyLookupResult> {
    // 1. Detect + validate URL
    const detected = detectListingUrl(rawUrl);
    if (!detected) {
        return {
            ok: false,
            error: 'Unrecognised listing URL',
            details: 'Please paste a Zillow, Redfin, or Realtor.com listing link.',
        };
    }

    const { source, cleanUrl } = detected;

    // 2. Fetch HTML
    let html: string;
    let httpStatus: number;
    let finalUrl: string;
    try {
        const fetched = await fetchHtml(cleanUrl);
        html       = fetched.html;
        httpStatus = fetched.status;
        finalUrl   = fetched.finalUrl;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('abort') || msg.includes('timeout')) {
            return { ok: false, error: 'Listing page timed out', details: msg };
        }
        return { ok: false, error: 'Could not fetch listing page', details: msg };
    }

    // Hard block (403/429) — try slug parsing before giving up.
    // For short URLs (e.g. redfin.com/home/ID), use finalUrl after redirect
    // which may contain the full address slug.
    if (httpStatus === 403 || httpStatus === 429) {
        const slugData =
            parseAddressFromZillowSlug(cleanUrl) ??
            parseAddressFromRedfinSlug(finalUrl) ??
            parseAddressFromRedfinSlug(cleanUrl);
        if (slugData) {
            const { rate } = lookupTaxRate(slugData.state ?? '', null);
            const warning = source === 'zillow'
                ? 'Price and details unavailable — Zillow blocked the request'
                : 'Price and details unavailable — Redfin blocked the request';
            const partial: PropertyData = {
                source, url: cleanUrl,
                parsedBy: 'partial', parseWarnings: [warning],
                price: null, address: slugData.address, city: slugData.city,
                state: slugData.state, zip: slugData.zip, county: null,
                beds: null, baths: null, sqft: null,
                annualTaxes: null, taxRateEffective: rate, taxSource: 'table',
                photoUrl: null, listingStatus: null,
            };
            return { ok: true, data: partial };
        }
        return {
            ok: false,
            error: `${source === 'zillow' ? 'Zillow' : 'Redfin'} blocked our request`,
            details: `HTTP ${httpStatus}. Try pasting the price and address manually.`,
        };
    }

    // 3. Parse og: tags (universal fallback — always run)
    const og = parseOpenGraph(html, source);
    const ogPartial: Partial<PropertyData> = {
        source, url: cleanUrl,
        price: og.price, address: og.address, city: og.city,
        state: og.state, zip: og.zip, county: null,
        beds: og.beds, baths: og.baths, sqft: og.sqft,
        photoUrl: og.imageUrl,
        annualTaxes: null, taxRateEffective: null, taxSource: null,
        parsedBy: 'opengraph', parseWarnings: [],
    };

    // 4. Run site-specific parser
    let siteData: Partial<PropertyData> | null = null;
    if (source === 'zillow')  siteData = parseZillow(html);
    if (source === 'redfin')  siteData = parseRedfin(html);

    // 5. Merge — og:image always overwrites photo
    const m = merge(siteData, ogPartial);
    m.url    = cleanUrl;
    m.source = source;
    // Carry through listingStatus from site parser (not in og: data)
    if (siteData?.listingStatus) m.listingStatus = siteData.listingStatus;

    // 6. Resolve taxes
    if (m.annualTaxes && m.price && m.price > 0) {
        m.taxRateEffective = m.annualTaxes / m.price;
        m.taxSource        = 'scraped';
    } else if (m.state) {
        const { rate } = lookupTaxRate(m.state, m.county ?? null);
        m.taxRateEffective = rate;
        m.taxSource        = 'table';
        if (m.price) m.annualTaxes = Math.round(m.price * rate);
    }

    // 7. If we have nothing useful, surface a clear error
    if (!m.price && !m.address) {
        return {
            ok: false,
            error: 'Could not read this listing',
            details: 'The listing site may have blocked our request. Try again or enter the price manually.',
        };
    }

    const data: PropertyData = {
        source:           m.source       ?? source,
        url:              cleanUrl,
        parsedBy:         m.parsedBy     ?? 'partial',
        parseWarnings:    m.parseWarnings ?? [],
        price:            m.price        ?? null,
        address:          m.address      ?? null,
        city:             m.city         ?? null,
        state:            m.state        ?? null,
        zip:              m.zip          ?? null,
        county:           m.county       ?? null,
        beds:             (m.beds  != null && m.beds  <= 20) ? m.beds  : null,
        baths:            (m.baths != null && m.baths <= 20) ? m.baths : null,
        sqft:             m.sqft         ?? null,
        annualTaxes:      m.annualTaxes  ?? null,
        taxRateEffective: m.taxRateEffective ?? null,
        taxSource:        m.taxSource    ?? null,
        // HARD RULE: property photos must come from ssl.cdn-redfin.com only.
        // Zillow/og photos (zillowstatic etc.) are dropped here — the downstream
        // Tavily photo lookup supplies the Redfin photo instead.
        photoUrl:         (m.photoUrl && /(^|\.)ssl\.cdn-redfin\.com\//.test(m.photoUrl.replace(/^https?:\/\//, '')))
            ? m.photoUrl : null,
        listingStatus:    m.listingStatus ?? null,
    };

    return { ok: true, data };
}
