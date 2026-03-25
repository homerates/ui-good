// lib/property/schema.ts
// Shared TypeScript interfaces for the property lookup pipeline.
// All scraped fields are nullable — callers must handle missing data.

export type PropertySource = 'zillow' | 'redfin' | 'realtor' | 'unknown';
export type ParseMethod   = 'zillow_next_data' | 'redfin_script' | 'opengraph' | 'partial';
export type TaxSource     = 'scraped' | 'table' | null;

export interface PropertyData {
    // Provenance
    source:   PropertySource;
    url:      string;
    parsedBy: ParseMethod;
    parseWarnings: string[];

    // Price (integer dollars)
    price: number | null;

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
}

// API response shapes
export interface PropertyLookupOk    { ok: true;  data: PropertyData }
export interface PropertyLookupError { ok: false; error: string; details?: string }
export type PropertyLookupResult = PropertyLookupOk | PropertyLookupError;
