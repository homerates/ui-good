/**
 * 2026 California Loan Limits — Conforming & FHA
 *
 * Conforming limits: FHFA (Fannie Mae / Freddie Mac)
 *   Source: https://www.fhfa.gov/CLL
 *   Effective: Calendar Year 2026
 *
 * FHA Forward limits: HUD (HUD No. 25-145)
 *   Effective: FHA case numbers assigned on or after Jan 1, 2026
 *   Floor (1-unit): $541,287 | Ceiling (1-unit): $1,249,125
 *   Note: All CA counties are at or above the FHA floor.
 *         FHA limit per county = min(conforming limit, FHA ceiling)
 *
 * National baseline conforming (standard / non-high-balance): $806,500 (1-unit)
 * High-balance = any county limit above $806,500
 *
 * Limits by units: 1-unit | 2-unit | 3-unit | 4-unit
 */

export interface CountyLimits {
    county: string;
    /** Fannie Mae / Freddie Mac conforming limit — same for both GSEs */
    conforming: { units1: number; units2: number; units3: number; units4: number };
    /** HUD FHA Forward 2026 limit */
    fha: { units1: number; units2: number; units3: number; units4: number };
    /** true = high-balance (above national $806,500 baseline), false = standard conforming */
    isHighBalance: boolean;
}

// National 2026 baseline (non-high-balance areas)
export const NATIONAL_CONFORMING_BASELINE = {
    units1: 806500,
    units2: 1032000,
    units3: 1247200,
    units4: 1550000,
};

// FHA 2026 national floor & ceiling
export const FHA_2026 = {
    floor: { units1: 541287, units2: 693050, units3: 837700, units4: 1041125 },
    ceiling: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
};

/** All 58 California counties — 2026 Conforming & FHA limits */
export const CA_LOAN_LIMITS_2026: CountyLimits[] = [
    {
        county: "ALAMEDA",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "ALPINE",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "AMADOR",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "BUTTE",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "CALAVERAS",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "COLUSA",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "CONTRA COSTA",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "DEL NORTE",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "EL DORADO",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "FRESNO",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "GLENN",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "HUMBOLDT",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "IMPERIAL",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "INYO",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "KERN",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "KINGS",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "LAKE",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "LASSEN",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "LOS ANGELES",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "MADERA",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "MARIN",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "MARIPOSA",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "MENDOCINO",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "MERCED",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "MODOC",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "MONO",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "MONTEREY",
        conforming: { units1: 994750, units2: 1273450, units3: 1539350, units4: 1913000 },
        fha: { units1: 994750, units2: 1273450, units3: 1539350, units4: 1913000 },
        isHighBalance: true,
    },
    {
        county: "NAPA",
        conforming: { units1: 1017750, units2: 1302900, units3: 1574900, units4: 1957250 },
        fha: { units1: 1017750, units2: 1302900, units3: 1574900, units4: 1957250 },
        isHighBalance: true,
    },
    {
        county: "NEVADA",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "ORANGE",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "PLACER",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "PLUMAS",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "RIVERSIDE",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "SACRAMENTO",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "SAN BENITO",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "SAN BERNARDINO",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "SAN DIEGO",
        conforming: { units1: 1104000, units2: 1413350, units3: 1708400, units4: 2123100 },
        fha: { units1: 1104000, units2: 1413350, units3: 1708400, units4: 2123100 },
        isHighBalance: true,
    },
    {
        county: "SAN FRANCISCO",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "SAN JOAQUIN",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "SAN LUIS OBISPO",
        conforming: { units1: 1000500, units2: 1280850, units3: 1548250, units4: 1924100 },
        fha: { units1: 1000500, units2: 1280850, units3: 1548250, units4: 1924100 },
        isHighBalance: true,
    },
    {
        county: "SAN MATEO",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "SANTA BARBARA",
        conforming: { units1: 941850, units2: 1205750, units3: 1457450, units4: 1811300 },
        fha: { units1: 941850, units2: 1205750, units3: 1457450, units4: 1811300 },
        isHighBalance: true,
    },
    {
        county: "SANTA CLARA",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "SANTA CRUZ",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "SHASTA",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "SIERRA",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "SISKIYOU",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "SOLANO",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "SONOMA",
        conforming: { units1: 897000, units2: 1148350, units3: 1388050, units4: 1725050 },
        fha: { units1: 897000, units2: 1148350, units3: 1388050, units4: 1725050 },
        isHighBalance: true,
    },
    {
        county: "STANISLAUS",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "SUTTER",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "TEHAMA",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "TRINITY",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "TULARE",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "TUOLUMNE",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "VENTURA",
        conforming: { units1: 1035000, units2: 1325000, units3: 1601600, units4: 1990450 },
        fha: { units1: 1035000, units2: 1325000, units3: 1601600, units4: 1990450 },
        isHighBalance: true,
    },
    {
        county: "YOLO",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
    {
        county: "YUBA",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        isHighBalance: true,
    },
];

// ─── Lookup helpers ─────────────────────────────────────────────────────────

/** Normalize county name for lookup — handles "Los Angeles", "LA County", "los angeles county" etc. */
function normalizeCounty(input: string): string {
    return input
        .toUpperCase()
        .replace(/\s+COUNTY$/i, '')
        .replace(/\bCO\.\s*$/i, '')
        .trim();
}

/** Common city → county mapping for California */
const CITY_TO_COUNTY: Record<string, string> = {
    // Los Angeles Metro
    "LOS ANGELES": "LOS ANGELES",
    "LA": "LOS ANGELES",
    "PASADENA": "LOS ANGELES",
    "LONG BEACH": "LOS ANGELES",
    "BURBANK": "LOS ANGELES",
    "GLENDALE": "LOS ANGELES",
    "TORRANCE": "LOS ANGELES",
    "SANTA MONICA": "LOS ANGELES",
    "CULVER CITY": "LOS ANGELES",
    "INGLEWOOD": "LOS ANGELES",
    "COMPTON": "LOS ANGELES",
    "POMONA": "LOS ANGELES",
    "EL MONTE": "LOS ANGELES",
    "WEST HOLLYWOOD": "LOS ANGELES",
    "BEVERLY HILLS": "LOS ANGELES",
    "MALIBU": "LOS ANGELES",
    "CALABASAS": "LOS ANGELES",
    "THOUSAND OAKS": "VENTURA",
    "SIMI VALLEY": "VENTURA",
    "OXNARD": "VENTURA",
    "VENTURA": "VENTURA",
    // Bay Area
    "SAN FRANCISCO": "SAN FRANCISCO",
    "SF": "SAN FRANCISCO",
    "SAN JOSE": "SANTA CLARA",
    "PALO ALTO": "SANTA CLARA",
    "MOUNTAIN VIEW": "SANTA CLARA",
    "SUNNYVALE": "SANTA CLARA",
    "CUPERTINO": "SANTA CLARA",
    "SANTA CLARA": "SANTA CLARA",
    "FREMONT": "ALAMEDA",
    "OAKLAND": "ALAMEDA",
    "BERKELEY": "ALAMEDA",
    "HAYWARD": "ALAMEDA",
    "SAN LEANDRO": "ALAMEDA",
    "SAN MATEO": "SAN MATEO",
    "REDWOOD CITY": "SAN MATEO",
    "FOSTER CITY": "SAN MATEO",
    "DALY CITY": "SAN MATEO",
    "SOUTH SAN FRANCISCO": "SAN MATEO",
    "WALNUT CREEK": "CONTRA COSTA",
    "CONCORD": "CONTRA COSTA",
    "RICHMOND": "CONTRA COSTA",
    "ANTIOCH": "CONTRA COSTA",
    "SAN RAFAEL": "MARIN",
    "MILL VALLEY": "MARIN",
    "NAPA": "NAPA",
    "SANTA ROSA": "SONOMA",
    "PETALUMA": "SONOMA",
    // San Diego
    "SAN DIEGO": "SAN DIEGO",
    "CHULA VISTA": "SAN DIEGO",
    "OCEANSIDE": "SAN DIEGO",
    "ESCONDIDO": "SAN DIEGO",
    "CARLSBAD": "SAN DIEGO",
    "EL CAJON": "SAN DIEGO",
    "SANTEE": "SAN DIEGO",
    // Orange County
    "ANAHEIM": "ORANGE",
    "IRVINE": "ORANGE",
    "SANTA ANA": "ORANGE",
    "ORANGE": "ORANGE",
    "HUNTINGTON BEACH": "ORANGE",
    "GARDEN GROVE": "ORANGE",
    "FULLERTON": "ORANGE",
    "COSTA MESA": "ORANGE",
    "NEWPORT BEACH": "ORANGE",
    "LAGUNA BEACH": "ORANGE",
    // Inland Empire
    "RIVERSIDE": "RIVERSIDE",
    "SAN BERNARDINO": "SAN BERNARDINO",
    "ONTARIO": "SAN BERNARDINO",
    "RANCHO CUCAMONGA": "SAN BERNARDINO",
    "FONTANA": "SAN BERNARDINO",
    "MORENO VALLEY": "RIVERSIDE",
    "CORONA": "RIVERSIDE",
    "MURRIETA": "RIVERSIDE",
    "TEMECULA": "RIVERSIDE",
    "PALM SPRINGS": "RIVERSIDE",
    // Central Valley
    "FRESNO": "FRESNO",
    "BAKERSFIELD": "KERN",
    "STOCKTON": "SAN JOAQUIN",
    "MODESTO": "STANISLAUS",
    "VISALIA": "TULARE",
    "SACRAMENTO": "SACRAMENTO",
    "ELK GROVE": "SACRAMENTO",
    "ROSEVILLE": "PLACER",
    "ROCKLIN": "PLACER",
    // Central Coast
    "SANTA BARBARA": "SANTA BARBARA",
    "SAN LUIS OBISPO": "SAN LUIS OBISPO",
    "MONTEREY": "MONTEREY",
    "SALINAS": "MONTEREY",
    "SANTA CRUZ": "SANTA CRUZ",
};

/**
 * Look up 2026 loan limits for a California county or city.
 * Returns null if not found.
 *
 * @param location  County name (e.g. "Los Angeles County"), city (e.g. "Irvine"), or county without "County"
 * @param units     Number of units (1–4), defaults to 1
 */
export function getCALoanLimits(
    location: string,
    units: 1 | 2 | 3 | 4 = 1
): {
    county: string;
    conformingLimit: number;
    fhaLimit: number;
    isHighBalance: boolean;
    loanType: "STANDARD_CONFORMING" | "HIGH_BALANCE" | "JUMBO";
    unitsRequested: number;
    source: string;
} | null {
    const normalized = normalizeCounty(location);

    // Try direct county match first
    let match = CA_LOAN_LIMITS_2026.find(c => c.county === normalized);

    // Try city → county lookup
    if (!match) {
        const countyFromCity = CITY_TO_COUNTY[normalized];
        if (countyFromCity) {
            match = CA_LOAN_LIMITS_2026.find(c => c.county === countyFromCity);
        }
    }

    if (!match) return null;

    const unitKey = `units${units}` as keyof typeof match.conforming;
    const conformingLimit = match.conforming[unitKey];
    const fhaLimit = match.fha[unitKey];
    const nationalBaseline = NATIONAL_CONFORMING_BASELINE[unitKey];

    const loanType =
        conformingLimit === nationalBaseline
            ? "STANDARD_CONFORMING"
            : "HIGH_BALANCE";

    return {
        county: match.county,
        conformingLimit,
        fhaLimit,
        isHighBalance: match.isHighBalance,
        loanType,
        unitsRequested: units,
        source: "FHFA 2026 / HUD FHA 2026 (effective Jan 1, 2026)",
    };
}

/**
 * Given a loan amount and location, classify the loan and return
 * a plain-English summary for use in AI prompts.
 *
 * @param loanAmount   The requested loan amount
 * @param location     County or city in California
 * @param units        Number of units (1–4)
 */
export function classifyLoan(
    loanAmount: number,
    location: string,
    units: 1 | 2 | 3 | 4 = 1
): string {
    const limits = getCALoanLimits(location, units);

    if (!limits) {
        return `County not found for "${location}". Using national baseline: conforming limit $${NATIONAL_CONFORMING_BASELINE.units1.toLocaleString()} (1-unit). FHA limit: $${FHA_2026.ceiling.units1.toLocaleString()} (high-cost ceiling).`;
    }

    const { county, conformingLimit, fhaLimit, loanType } = limits;
    const fmt = (n: number) => `$${n.toLocaleString()}`;

    if (loanAmount <= fhaLimit) {
        return `${county} County (${units}-unit): Loan ${fmt(loanAmount)} — eligible for FHA (limit ${fmt(fhaLimit)}), conventional conforming (limit ${fmt(conformingLimit)}). Program type: ${loanType}.`;
    } else if (loanAmount <= conformingLimit) {
        return `${county} County (${units}-unit): Loan ${fmt(loanAmount)} — exceeds FHA limit (${fmt(fhaLimit)}), within conforming limit (${fmt(conformingLimit)}). FHA NOT eligible. Conventional (${loanType}) available.`;
    } else {
        return `${county} County (${units}-unit): Loan ${fmt(loanAmount)} — exceeds conforming limit (${fmt(conformingLimit)}). This is a JUMBO loan. FHA limit: ${fmt(fhaLimit)}. Neither FHA nor conforming conventional applies — jumbo lender required (typically 720+ credit, 12–24 months reserves).`;
    }
}

/**
 * Build a loan limits context string for injection into AI prompts.
 * Use this when a user mentions a California location and loan amount.
 */
export function buildLoanLimitsContext(
    location: string,
    loanAmount: number,
    units: 1 | 2 | 3 | 4 = 1
): string {
    const limits = getCALoanLimits(location, units);
    if (!limits) return '';

    const { county, conformingLimit, fhaLimit, loanType } = limits;
    const fmt = (n: number) => `$${n.toLocaleString()}`;

    return [
        `── 2026 LOAN LIMITS: ${county} COUNTY (${units}-unit) ──`,
        `Conforming limit (Fannie Mae / Freddie Mac): ${fmt(conformingLimit)} [${loanType}]`,
        `FHA Forward limit (HUD 2026):                ${fmt(fhaLimit)}`,
        `Requested loan amount:                        ${fmt(loanAmount)}`,
        `Classification: ${classifyLoan(loanAmount, location, units)}`,
        `Source: FHFA CY2026 / HUD FHA 2026 (effective Jan 1, 2026)`,
    ].join('\n');
}