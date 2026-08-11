// lib/property/schema.ts
// Shared TypeScript interfaces for the property lookup pipeline.
// All scraped fields are nullable — callers must handle missing data.

export type PropertySource   = 'zillow' | 'redfin' | 'realtor' | 'unknown';
export type ParseMethod      = 'zillow_next_data' | 'redfin_script' | 'opengraph' | 'partial';
export type TaxSource        = 'scraped' | 'table' | null;
export type ListingStatus    = 'FOR_SALE' | 'OFF_MARKET' | 'PENDING' | 'SOLD' | null;

export interface PropertyData {
    // Provenance
    source:   PropertySource;
    url:      string;
    parsedBy: ParseMethod;
    parseWarnings: string[];

    // Price (integer dollars)
    price: number | null;

    // Current-value AVM read directly off the listing page (e.g. Redfin's own "Redfin
    // Estimate" widget) — distinct from `price`, which for a SOLD/OFF_MARKET listing is
    // the historical transaction price, not today's value. Optional: only Redfin's parser
    // populates this today; other site parsers simply omit it (undefined, not null, so a
    // caller's `d.estimatedValue ?? fallback` chain isn't disrupted by a stray explicit null).
    estimatedValue?: number | null;

    // Historical transaction — read directly off the listing page's own "About this home"
    // summary (Redfin only, same rationale as estimatedValue above). lastSaleDate is a
    // freeform "Month DD, YYYY" string, parsed the same way other date strings in this
    // pipeline are (see parseMonthYear in the API routes) — not a Date here to keep this
    // module free of any parsing-library assumption.
    lastSaleDate?: string | null;
    lastSalePrice?: number | null;

    // Address
    address: string | null;   // full one-line: "123 Main St, Austin, TX 78701"
    city:    string | null;
    state:   string | null;   // 2-letter uppercase: "TX"
    zip:     string | null;
    county:  string | null;

    // Property details
    beds:  number | null;
    baths: number | null;
    sqft:  number | null;

    // Tax — scraped dollar amount OR derived from table
    annualTaxes:      number | null;  // dollar amount
    taxRateEffective: number | null;  // decimal e.g. 0.018
    taxSource:        TaxSource;

    // Media — og:image is always a public CDN URL
    photoUrl: string | null;

    // Listing status — set by site-specific parser when determinable from structured data
    listingStatus: ListingStatus;
}

// API response shapes
export interface PropertyLookupOk    { ok: true;  data: PropertyData }
export interface PropertyLookupError { ok: false; error: string; details?: string }
export type PropertyLookupResult = PropertyLookupOk | PropertyLookupError;
