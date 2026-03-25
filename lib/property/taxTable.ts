// lib/property/taxTable.ts
// Effective property tax rates by state and major county.
// Source: Tax Foundation 2024 / ATTOM 2024 median effective rates.
// Rates are decimals: 0.018 = 1.8% of purchase price.
// Used when the listing page does not contain explicit tax data.

export const STATE_TAX_RATES: Record<string, number> = {
    AL: 0.0041, AK: 0.0057, AZ: 0.0051, AR: 0.0062, CA: 0.0076,
    CO: 0.0051, CT: 0.0173, DE: 0.0057, FL: 0.0089, GA: 0.0092,
    HI: 0.0028, ID: 0.0063, IL: 0.0205, IN: 0.0085, IA: 0.0153,
    KS: 0.0130, KY: 0.0083, LA: 0.0055, ME: 0.0109, MD: 0.0099,
    MA: 0.0110, MI: 0.0136, MN: 0.0110, MS: 0.0063, MO: 0.0099,
    MT: 0.0074, NE: 0.0161, NV: 0.0060, NH: 0.0186, NJ: 0.0220,
    NM: 0.0077, NY: 0.0172, NC: 0.0077, ND: 0.0098, OH: 0.0153,
    OK: 0.0090, OR: 0.0097, PA: 0.0153, RI: 0.0133, SC: 0.0057,
    SD: 0.0117, TN: 0.0062, TX: 0.0160, UT: 0.0058, VT: 0.0178,
    VA: 0.0082, WA: 0.0093, WV: 0.0059, WI: 0.0165, WY: 0.0057,
    DC: 0.0055,
};

// Key format: "STATE:COUNTY" uppercase
export const COUNTY_TAX_OVERRIDES: Record<string, number> = {
    // California (Prop 13 — effective rates on purchase price are low)
    'CA:LOS ANGELES':    0.0074,
    'CA:ORANGE':         0.0068,
    'CA:SAN DIEGO':      0.0072,
    'CA:SAN FRANCISCO':  0.0065,
    'CA:SANTA CLARA':    0.0067,
    'CA:ALAMEDA':        0.0077,
    'CA:CONTRA COSTA':   0.0075,
    'CA:RIVERSIDE':      0.0100,
    'CA:SAN BERNARDINO': 0.0098,
    'CA:SACRAMENTO':     0.0085,
    'CA:VENTURA':        0.0070,
    'CA:SAN MATEO':      0.0068,
    // Texas
    'TX:HARRIS':         0.0199,
    'TX:DALLAS':         0.0185,
    'TX:TARRANT':        0.0175,
    'TX:TRAVIS':         0.0175,
    'TX:BEXAR':          0.0155,
    'TX:COLLIN':         0.0160,
    'TX:DENTON':         0.0165,
    'TX:FORT BEND':      0.0195,
    // Florida
    'FL:MIAMI-DADE':     0.0089,
    'FL:BROWARD':        0.0095,
    'FL:PALM BEACH':     0.0100,
    'FL:HILLSBOROUGH':   0.0103,
    'FL:ORANGE':         0.0098,
    'FL:PINELLAS':       0.0090,
    // New York
    'NY:NEW YORK':       0.0088,
    'NY:NASSAU':         0.0210,
    'NY:WESTCHESTER':    0.0230,
    'NY:SUFFOLK':        0.0218,
    'NY:KINGS':          0.0068, // Brooklyn
    'NY:QUEENS':         0.0083,
    // Illinois
    'IL:COOK':           0.0227,
    'IL:DUPAGE':         0.0200,
    'IL:LAKE':           0.0215,
    // New Jersey
    'NJ:BERGEN':         0.0215,
    'NJ:ESSEX':          0.0240,
    'NJ:MORRIS':         0.0195,
    'NJ:UNION':          0.0220,
    // Georgia
    'GA:FULTON':         0.0113,
    'GA:GWINNETT':       0.0101,
    'GA:COBB':           0.0089,
    // Colorado
    'CO:DENVER':         0.0053,
    'CO:BOULDER':        0.0056,
    'CO:ARAPAHOE':       0.0055,
    // Washington
    'WA:KING':           0.0091,
    'WA:PIERCE':         0.0098,
    'WA:SNOHOMISH':      0.0089,
    // Arizona
    'AZ:MARICOPA':       0.0050,
    'AZ:PIMA':           0.0055,
    // Nevada
    'NV:CLARK':          0.0062,
    // Massachusetts
    'MA:MIDDLESEX':      0.0108,
    'MA:SUFFOLK':        0.0105,
    'MA:NORFOLK':        0.0109,
    // North Carolina
    'NC:MECKLENBURG':    0.0082,
    'NC:WAKE':           0.0079,
    // Virginia
    'VA:FAIRFAX':        0.0101,
    'VA:ARLINGTON':      0.0095,
    // Michigan
    'MI:WAYNE':          0.0234,
    'MI:OAKLAND':        0.0155,
};

/**
 * Best available effective tax rate for a location.
 * Returns rate as decimal (e.g. 0.018) and the source level.
 */
export function lookupTaxRate(
    state: string,
    county?: string | null,
): { rate: number; level: 'county' | 'state' | 'national' } {
    const st = state.trim().toUpperCase();
    const NATIONAL = 0.011;

    if (county) {
        const key = `${st}:${county.trim().toUpperCase()}`;
        if (COUNTY_TAX_OVERRIDES[key] !== undefined) {
            return { rate: COUNTY_TAX_OVERRIDES[key], level: 'county' };
        }
    }

    if (STATE_TAX_RATES[st] !== undefined) {
        return { rate: STATE_TAX_RATES[st], level: 'state' };
    }

    return { rate: NATIONAL, level: 'national' };
}
