// lib/property/detect.ts
// Detect which listing site a URL belongs to and clean it.

import type { PropertySource } from './schema';

export interface DetectResult {
    source:    PropertySource;
    cleanUrl:  string;
    hasParser: boolean; // false = og: fallback only
}

const PATTERNS: Array<{ re: RegExp; source: PropertySource; hasParser: boolean }> = [
    { re: /^https?:\/\/(www\.)?zillow\.com\/(homedetails|homes)\//i,         source: 'zillow',   hasParser: true  },
    // Redfin full URLs: /CA/City/Address/home/ID  or  /home/ID  (mobile short link)
    { re: /^https?:\/\/(www\.)?redfin\.com\/.+\/home\/\d+/i,                 source: 'redfin',   hasParser: true  },
    { re: /^https?:\/\/(www\.)?redfin\.com\/home\/\d+/i,                     source: 'redfin',   hasParser: true  },
    { re: /^https?:\/\/(www\.)?redfin\.com\/[A-Z]{2}\//i,                    source: 'redfin',   hasParser: true  },
    { re: /^https?:\/\/(www\.)?realtor\.com\/realestateandhomes-detail\//i,   source: 'realtor',  hasParser: false },
    { re: /^https?:\/\/(www\.)?trulia\.com\/property\//i,                     source: 'unknown',  hasParser: false },
    { re: /^https?:\/\/(www\.)?homes\.com\//i,                                source: 'unknown',  hasParser: false },
];

const TRACKING_PARAMS = [
    'utm_source','utm_medium','utm_campaign','utm_content','utm_term',
    'from','mmlid','listingId','ref','source',
];

/**
 * Detect listing source from a raw URL.
 * Returns null if the URL is not a recognised property listing.
 */
export function detectListingUrl(raw: string): DetectResult | null {
    let parsed: URL;
    try {
        let normalised = raw.trim();
        // Add https:// if the URL has no protocol (e.g. user pastes www.zillow.com/...)
        if (!/^https?:\/\//i.test(normalised)) {
            normalised = 'https://' + normalised.replace(/^\/\//, '');
        }
        normalised = normalised.replace(/^http:\/\//i, 'https://');
        parsed = new URL(normalised);
    } catch {
        return null;
    }

    for (const p of TRACKING_PARAMS) parsed.searchParams.delete(p);
    const cleanUrl = parsed.toString();

    for (const { re, source, hasParser } of PATTERNS) {
        if (re.test(cleanUrl)) return { source, cleanUrl, hasParser };
    }
    return null;
}
