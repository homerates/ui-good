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

async function fetchHtml(url: string): Promise<string> {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
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
    // og:image always preferred — public CDN URL, no auth required
    if (og.photoUrl) r.photoUrl = og.photoUrl;
    return r;
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
    try {
        html = await fetchHtml(cleanUrl);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('abort') || msg.includes('timeout')) {
            return { ok: false, error: 'Listing page timed out', details: msg };
        }
        return { ok: false, error: 'Could not fetch listing page', details: msg };
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
        beds:             m.beds         ?? null,
        baths:            m.baths        ?? null,
        sqft:             m.sqft         ?? null,
        annualTaxes:      m.annualTaxes  ?? null,
        taxRateEffective: m.taxRateEffective ?? null,
        taxSource:        m.taxSource    ?? null,
        photoUrl:         m.photoUrl     ?? null,
    };

    return { ok: true, data };
}
