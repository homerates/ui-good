// lib/property/parse/opengraph.ts
// Universal og: meta tag parser — works on every listing site.
// og:image is always a public CDN URL (used for social previews),
// making it the most reliable photo source even when __NEXT_DATA__ is blocked.

import type { PropertySource } from '../schema';

export interface OGData {
    title:       string | null;
    description: string | null;
    imageUrl:    string | null;  // og:image — always prefer this as final photo
    price:       number | null;
    address:     string | null;
    city:        string | null;
    state:       string | null;
    zip:         string | null;
    beds:        number | null;
    baths:       number | null;
    sqft:        number | null;
}

function esc(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function htmlDecode(s: string): string {
    return s
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;|&apos;|&#x27;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

function getMeta(html: string, key: string): string | null {
    const patterns = [
        new RegExp(`<meta[^>]+(?:property|name)=["']${esc(key)}["'][^>]+content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${esc(key)}["']`, 'i'),
    ];
    for (const re of patterns) {
        const m = html.match(re);
        if (m?.[1]) return htmlDecode(m[1].trim());
    }
    return null;
}

function parseDollar(raw: string | null): number | null {
    if (!raw) return null;
    const m = raw.replace(/[$,]/g, '').match(/\d[\d.]*/);
    if (!m) return null;
    const n = parseFloat(m[0]);
    return Number.isFinite(n) && n > 1000 ? Math.round(n) : null;
}

function parseBed(s: string | null): number | null {
    if (!s) return null;
    const m = s.match(/(\d+(?:\.\d+)?)\s*(?:bd|ba|bed|bath)/i) ?? s.match(/^(\d+(?:\.\d+)?)/);
    const n = m ? parseFloat(m[1]) : NaN;
    return Number.isFinite(n) ? n : null;
}

function parseSqft(s: string | null): number | null {
    if (!s) return null;
    const m = s.match(/([\d,]+)\s*(?:sq\.?\s*ft|sqft)/i);
    if (!m) return null;
    const n = parseInt(m[1].replace(/,/g, ''), 10);
    return Number.isFinite(n) && n > 50 ? n : null;
}

/** Parse address, price, beds, baths, sqft from og:title */
function parseTitle(title: string | null, _source: PropertySource): {
    price: number | null;
    beds:  number | null;
    baths: number | null;
    sqft:  number | null;
    address: string | null;
    city:    string | null;
    state:   string | null;
    zip:     string | null;
} {
    const empty = { price: null, beds: null, baths: null, sqft: null,
        address: null, city: null, state: null, zip: null };
    if (!title) return empty;

    // Strip site suffix after last " | "
    const clean = title.replace(/\s*\|\s*(?:Zillow|Redfin|Realtor\.com|Trulia|Homes\.com).*$/i, '').trim();

    // Price: look for $NNN,NNN pattern
    const priceMatch = clean.match(/\$([\d,]+)/);
    const price = priceMatch ? parseDollar(priceMatch[0]) : null;

    const beds  = parseBed(clean.match(/(\d+)\s*(?:bds?|beds?)/i)?.[0] ?? null);
    const baths = parseBed(clean.match(/(\d+(?:\.\d+)?)\s*(?:baths?|ba\b)/i)?.[0] ?? null);
    const sqft  = parseSqft(clean);

    // Address: "NNN Word St, City, ST ZIPCODE"
    const addrMatch = clean.match(/(\d+[^,$|]+,\s*[^,$|]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)/i);
    if (!addrMatch) return { price, beds, baths, sqft, address: null, city: null, state: null, zip: null };

    const addr = addrMatch[1].trim();
    const parts = addr.split(',').map(p => p.trim());
    const stateZip = parts[2] ?? '';
    const szMatch = stateZip.match(/^([A-Z]{2})\s+(\d{5})/i);

    return {
        price,
        beds,
        baths,
        sqft,
        address: addr,
        city:  parts[1] ?? null,
        state: szMatch?.[1]?.toUpperCase() ?? null,
        zip:   szMatch?.[2] ?? null,
    };
}

export function parseOpenGraph(html: string, source: PropertySource): OGData {
    const ogTitle = getMeta(html, 'og:title');
    const ogDesc  = getMeta(html, 'og:description');
    const ogImage = getMeta(html, 'og:image');
    const ogPrice = getMeta(html, 'og:price:amount') ?? getMeta(html, 'product:price:amount');

    const fromTitle = parseTitle(ogTitle, source);

    const price  = parseDollar(ogPrice) ?? fromTitle.price ?? parseDollar(ogDesc);
    const beds   = fromTitle.beds  ?? parseBed(ogDesc?.match(/(\d+)\s*(?:bds?|beds?)/i)?.[0] ?? null);
    const baths  = fromTitle.baths ?? parseBed(ogDesc?.match(/(\d+(?:\.\d+)?)\s*(?:baths?|ba\b)/i)?.[0] ?? null);
    const sqft   = fromTitle.sqft  ?? parseSqft(ogDesc);

    return {
        title: ogTitle,
        description: ogDesc,
        imageUrl: ogImage,
        price,
        address: fromTitle.address,
        city:    fromTitle.city,
        state:   fromTitle.state,
        zip:     fromTitle.zip,
        beds,
        baths,
        sqft,
    };
}
