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
 *   Note: CA counties range from FHA floor to FHA ceiling depending on median prices.
 *
 * National baseline conforming (standard / non-high-balance): $832,750 (1-unit)
 * High-balance = any county limit above $832,750
 *
 * Limits by units: 1-unit | 2-unit | 3-unit | 4-unit
 */

export interface CountyLimits {
    county: string;
    /** Fannie Mae / Freddie Mac conforming limit — same for both GSEs */
    conforming: { units1: number; units2: number; units3: number; units4: number };
    /** HUD FHA Forward 2026 limit (per HUD No. 25-145) */
    fha: { units1: number; units2: number; units3: number; units4: number };
    /** true = high-balance (above national $832,750 baseline), false = standard conforming */
    isHighBalance: boolean;
}

// National 2026 baseline (non-high-balance areas)
// Effective Jan 1 2026 — up from $806,500 (2025); source: FHFA CY2026
export const NATIONAL_CONFORMING_BASELINE = {
    units1: 832750,
    units2: 1066250,
    units3: 1288800,
    units4: 1601750,
};

// FHA 2026 national floor & ceiling
export const FHA_2026 = {
    floor:   { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
    ceiling: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
};

/** All 58 California counties — 2026 Conforming & FHA limits */
export const CA_LOAN_LIMITS_2026: CountyLimits[] = [
    {
        county: "ALAMEDA",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha:        { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "ALPINE",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 736000,  units2: 942200,  units3: 1138900, units4: 1415400 },
        isHighBalance: false,
    },
    {
        county: "AMADOR",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "BUTTE",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "CALAVERAS",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "COLUSA",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "CONTRA COSTA",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha:        { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "DEL NORTE",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "EL DORADO",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 764750,  units2: 979000,  units3: 1183400, units4: 1470700 },
        isHighBalance: false,
    },
    {
        county: "FRESNO",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "GLENN",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "HUMBOLDT",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "IMPERIAL",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "INYO",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "KERN",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "KINGS",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "LAKE",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "LASSEN",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "LOS ANGELES",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha:        { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "MADERA",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "MARIN",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha:        { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "MARIPOSA",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "MENDOCINO",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 546250,  units2: 699300,  units3: 845300,  units4: 1050500 },
        isHighBalance: false,
    },
    {
        county: "MERCED",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "MODOC",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "MONO",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 776250,  units2: 993750,  units3: 1201200, units4: 1492800 },
        isHighBalance: false,
    },
    {
        county: "MONTEREY",
        conforming: { units1: 994750,  units2: 1273450, units3: 1539350, units4: 1913000 },
        fha:        { units1: 994750,  units2: 1273450, units3: 1539350, units4: 1913000 },
        isHighBalance: true,
    },
    {
        county: "NAPA",
        conforming: { units1: 1017750, units2: 1302900, units3: 1574900, units4: 1957250 },
        fha:        { units1: 1017750, units2: 1302900, units3: 1574900, units4: 1957250 },
        isHighBalance: true,
    },
    {
        county: "NEVADA",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 649750,  units2: 831800,  units3: 1005450, units4: 1249550 },
        isHighBalance: false,
    },
    {
        county: "ORANGE",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha:        { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "PLACER",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 764750,  units2: 979000,  units3: 1183400, units4: 1470700 },
        isHighBalance: false,
    },
    {
        county: "PLUMAS",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "RIVERSIDE",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 690000,  units2: 883300,  units3: 1067750, units4: 1326950 },
        isHighBalance: false,
    },
    {
        county: "SACRAMENTO",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 764750,  units2: 979000,  units3: 1183400, units4: 1470700 },
        isHighBalance: false,
    },
    {
        county: "SAN BENITO",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha:        { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "SAN BERNARDINO",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 690000,  units2: 883300,  units3: 1067750, units4: 1326950 },
        isHighBalance: false,
    },
    {
        county: "SAN DIEGO",
        conforming: { units1: 1104000, units2: 1413350, units3: 1708400, units4: 2123100 },
        fha:        { units1: 1104000, units2: 1413350, units3: 1708400, units4: 2123100 },
        isHighBalance: true,
    },
    {
        county: "SAN FRANCISCO",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha:        { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "SAN JOAQUIN",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 678500,  units2: 868600,  units3: 1049950, units4: 1304850 },
        isHighBalance: false,
    },
    {
        county: "SAN LUIS OBISPO",
        conforming: { units1: 1000500, units2: 1280850, units3: 1548250, units4: 1924100 },
        fha:        { units1: 1000500, units2: 1280850, units3: 1548250, units4: 1924100 },
        isHighBalance: true,
    },
    {
        county: "SAN MATEO",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha:        { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "SANTA BARBARA",
        conforming: { units1: 941850,  units2: 1205750, units3: 1457450, units4: 1811300 },
        fha:        { units1: 941850,  units2: 1205750, units3: 1457450, units4: 1811300 },
        isHighBalance: true,
    },
    {
        county: "SANTA CLARA",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha:        { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "SANTA CRUZ",
        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        fha:        { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 },
        isHighBalance: true,
    },
    {
        county: "SHASTA",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "SIERRA",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "SISKIYOU",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "SOLANO",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 685400,  units2: 877450,  units3: 1060600, units4: 1318100 },
        isHighBalance: false,
    },
    {
        county: "SONOMA",
        conforming: { units1: 897000,  units2: 1148350, units3: 1388050, units4: 1725050 },
        fha:        { units1: 897000,  units2: 1148350, units3: 1388050, units4: 1725050 },
        isHighBalance: true,
    },
    {
        county: "STANISLAUS",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 545100,  units2: 697800,  units3: 843500,  units4: 1048300 },
        isHighBalance: false,
    },
    {
        county: "SUTTER",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "TEHAMA",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "TRINITY",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "TULARE",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "TUOLUMNE",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
    },
    {
        county: "VENTURA",
        conforming: { units1: 1035000, units2: 1325000, units3: 1601600, units4: 1990450 },
        fha:        { units1: 1035000, units2: 1325000, units3: 1601600, units4: 1990450 },
        isHighBalance: true,
    },
    {
        county: "YOLO",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 764750,  units2: 979000,  units3: 1183400, units4: 1470700 },
        isHighBalance: false,
    },
    {
        county: "YUBA",
        conforming: { units1: 832750, units2: 1066250, units3: 1288800, units4: 1601750 },
        fha:        { units1: 541287,  units2: 693050,  units3: 837700,  units4: 1041125 },
        isHighBalance: false,
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
    "GOLETA": "SANTA BARBARA",
    "LOMPOC": "SANTA BARBARA",
    "SAN LUIS OBISPO": "SAN LUIS OBISPO",
    "NIPOMO": "SAN LUIS OBISPO",
    "ATASCADERO": "SAN LUIS OBISPO",
    "PASO ROBLES": "SAN LUIS OBISPO",
    "ARROYO GRANDE": "SAN LUIS OBISPO",
    "PISMO BEACH": "SAN LUIS OBISPO",
    "GROVER BEACH": "SAN LUIS OBISPO",
    "MORRO BAY": "SAN LUIS OBISPO",
    "CAMBRIA": "SAN LUIS OBISPO",
    "MONTEREY": "MONTEREY",
    "SALINAS": "MONTEREY",
    "CARMEL": "MONTEREY",
    "SEASIDE": "MONTEREY",
    "KING CITY": "MONTEREY",
    "SANTA CRUZ": "SANTA CRUZ",
    "CAPITOLA": "SANTA CRUZ",
    "WATSONVILLE": "SANTA CRUZ",
    "SCOTTS VALLEY": "SANTA CRUZ",
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
    const fhaLimit        = match.fha[unitKey];
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

// ─── ZIP → County lookup ─────────────────────────────────────────────────────

/**
 * 3-digit ZIP prefix → CA county.
 * Covers most CA markets; edge-case overrides in ZIP5_TO_COUNTY below.
 */
const ZIP_PREFIX_TO_COUNTY: Record<string, string> = {
    // Los Angeles County
    '900': 'LOS ANGELES', '901': 'LOS ANGELES', '902': 'LOS ANGELES',
    '903': 'LOS ANGELES', '904': 'LOS ANGELES', '905': 'LOS ANGELES',
    '906': 'LOS ANGELES', '907': 'LOS ANGELES', '908': 'LOS ANGELES',
    '910': 'LOS ANGELES', '911': 'LOS ANGELES', '912': 'LOS ANGELES',
    '913': 'LOS ANGELES', '914': 'LOS ANGELES', '915': 'LOS ANGELES',
    '916': 'LOS ANGELES', '917': 'LOS ANGELES', '918': 'LOS ANGELES',
    // San Diego
    '919': 'SAN DIEGO', '920': 'SAN DIEGO', '921': 'SAN DIEGO', '922': 'SAN DIEGO',
    // San Bernardino
    '923': 'SAN BERNARDINO', '924': 'SAN BERNARDINO',
    // Riverside
    '925': 'RIVERSIDE', '928': 'RIVERSIDE',
    // Orange County
    '926': 'ORANGE', '927': 'ORANGE',
    // Ventura
    '930': 'VENTURA', '931': 'VENTURA',
    // Kern
    '932': 'KERN', '933': 'KERN',
    // San Luis Obispo
    '934': 'SAN LUIS OBISPO',
    // Santa Barbara
    '935': 'SANTA BARBARA', '936': 'SANTA BARBARA',
    // Fresno
    '937': 'FRESNO', '938': 'FRESNO',
    // Monterey
    '939': 'MONTEREY',
    // San Mateo
    '940': 'SAN MATEO', '943': 'SAN MATEO', '944': 'SAN MATEO',
    // San Francisco
    '941': 'SAN FRANCISCO', '942': 'SAN FRANCISCO',
    // Contra Costa
    '945': 'CONTRA COSTA',
    // Alameda
    '946': 'ALAMEDA', '947': 'ALAMEDA', '948': 'ALAMEDA',
    // Marin
    '949': 'MARIN',
    // Santa Clara
    '950': 'SANTA CLARA', '951': 'SANTA CLARA',
    // San Joaquin
    '952': 'SAN JOAQUIN',
    // Stanislaus / Merced
    '953': 'STANISLAUS',
    // Sonoma
    '954': 'SONOMA',
    // Humboldt
    '955': 'HUMBOLDT',
    // Sacramento / Placer
    '956': 'SACRAMENTO', '957': 'SACRAMENTO', '958': 'PLACER',
    // Northern CA
    '959': 'BUTTE', '960': 'SHASTA', '961': 'LASSEN',
};

/** 5-digit ZIP overrides for edge cases where the 3-digit prefix maps to wrong county */
const ZIP5_TO_COUNTY: Record<string, string> = {
    // Riverside mixed with Orange/San Diego prefixes
    '92880': 'RIVERSIDE', '92881': 'RIVERSIDE', '92882': 'RIVERSIDE', '92883': 'RIVERSIDE',
    // San Bernardino mixed with LA prefix
    '91701': 'SAN BERNARDINO', '91710': 'SAN BERNARDINO', '91730': 'SAN BERNARDINO',
    '91737': 'SAN BERNARDINO', '91739': 'SAN BERNARDINO', '91740': 'LOS ANGELES',
    '91750': 'LOS ANGELES',    '91752': 'RIVERSIDE',
    // Santa Cruz (950xx prefix shared with Santa Clara)
    '95003': 'SANTA CRUZ', '95005': 'SANTA CRUZ', '95006': 'SANTA CRUZ', '95007': 'SANTA CRUZ',
    '95010': 'SANTA CRUZ', '95017': 'SANTA CRUZ', '95018': 'SANTA CRUZ', '95019': 'SANTA CRUZ',
    '95060': 'SANTA CRUZ', '95061': 'SANTA CRUZ', '95062': 'SANTA CRUZ', '95063': 'SANTA CRUZ',
    '95064': 'SANTA CRUZ', '95065': 'SANTA CRUZ', '95066': 'SANTA CRUZ', '95067': 'SANTA CRUZ',
    '95070': 'SANTA CLARA', // Saratoga
    // San Benito
    '95023': 'SAN BENITO', '95024': 'SAN BENITO', '95045': 'SAN BENITO',
    // Napa (mixed with Contra Costa 945 prefix)
    '94503': 'NAPA', '94508': 'NAPA', '94515': 'NAPA', '94558': 'NAPA', '94559': 'NAPA',
    '94562': 'NAPA', '94567': 'NAPA', '94574': 'NAPA', '94576': 'NAPA', '94581': 'NAPA',
    '94599': 'NAPA',
    // Solano (mixed with Contra Costa 945 prefix)
    '94510': 'SOLANO', '94512': 'SOLANO', '94533': 'SOLANO', '94534': 'SOLANO',
    '94535': 'SOLANO', '94571': 'SOLANO', '94585': 'SOLANO', '94589': 'SOLANO',
    '94590': 'SOLANO', '94591': 'SOLANO', '94592': 'SOLANO',
    // Alameda (945 prefix — overrides CONTRA COSTA default for this prefix)
    '94536': 'ALAMEDA', '94537': 'ALAMEDA', '94538': 'ALAMEDA', '94539': 'ALAMEDA',
    '94540': 'ALAMEDA', '94541': 'ALAMEDA', '94542': 'ALAMEDA', '94543': 'ALAMEDA',
    '94544': 'ALAMEDA', '94545': 'ALAMEDA', '94546': 'ALAMEDA',
    '94550': 'ALAMEDA', '94551': 'ALAMEDA', '94552': 'ALAMEDA',
    '94555': 'ALAMEDA', '94557': 'ALAMEDA', '94560': 'ALAMEDA',
    '94566': 'ALAMEDA', '94568': 'ALAMEDA',
    '94577': 'ALAMEDA', '94578': 'ALAMEDA', '94579': 'ALAMEDA',
    '94580': 'ALAMEDA', '94586': 'ALAMEDA', '94587': 'ALAMEDA', '94588': 'ALAMEDA',
    // Contra Costa (945 prefix specifics)
    '94520': 'CONTRA COSTA', '94521': 'CONTRA COSTA', '94523': 'CONTRA COSTA',
    '94524': 'CONTRA COSTA', '94525': 'CONTRA COSTA', '94526': 'CONTRA COSTA',
    '94527': 'CONTRA COSTA', '94528': 'CONTRA COSTA', '94529': 'CONTRA COSTA',
    '94530': 'CONTRA COSTA', '94531': 'CONTRA COSTA', '94547': 'CONTRA COSTA',
    '94549': 'CONTRA COSTA', '94553': 'CONTRA COSTA', '94556': 'CONTRA COSTA',
    '94561': 'CONTRA COSTA', '94563': 'CONTRA COSTA', '94564': 'CONTRA COSTA',
    '94565': 'CONTRA COSTA', '94570': 'CONTRA COSTA', '94572': 'CONTRA COSTA',
    '94575': 'CONTRA COSTA', '94582': 'CONTRA COSTA', '94583': 'CONTRA COSTA',
    '94595': 'CONTRA COSTA', '94596': 'CONTRA COSTA', '94597': 'CONTRA COSTA',
    '94598': 'CONTRA COSTA',
    // Placer (958 prefix shared with Sacramento)
    '95603': 'PLACER', '95604': 'PLACER', '95626': 'SACRAMENTO', '95630': 'SACRAMENTO',
    '95648': 'PLACER', '95650': 'PLACER', '95658': 'PLACER', '95661': 'PLACER',
    '95662': 'SACRAMENTO', '95663': 'PLACER', '95672': 'SACRAMENTO', '95677': 'PLACER',
    '95678': 'PLACER', '95681': 'PLACER', '95682': 'EL DORADO', '95683': 'SACRAMENTO',
    '95703': 'PLACER', '95713': 'PLACER', '95714': 'PLACER', '95715': 'PLACER',
    '95717': 'PLACER', '95722': 'PLACER', '95728': 'PLACER', '95736': 'PLACER',
    '95746': 'PLACER', '95747': 'PLACER', '95762': 'EL DORADO',
    // El Dorado specifics
    '95664': 'EL DORADO', '95666': 'EL DORADO', '95667': 'EL DORADO',
    // Yolo
    '95605': 'YOLO', '95616': 'YOLO', '95617': 'YOLO', '95618': 'YOLO',
    '95619': 'EL DORADO', '95620': 'YOLO', '95637': 'YOLO', '95645': 'YOLO',
    '95691': 'YOLO', '95694': 'YOLO', '95695': 'YOLO', '95697': 'YOLO', '95698': 'YOLO',
};

/**
 * Resolve a CA ZIP code to a county name.
 * Returns null if the ZIP is not in California or not recognized.
 */
export function getCACountyByZip(zip: string): string | null {
    const z = zip.replace(/\D/g, '').slice(0, 5);
    if (z.length < 5) return null;
    if (ZIP5_TO_COUNTY[z]) return ZIP5_TO_COUNTY[z];
    const prefix = z.slice(0, 3);
    return ZIP_PREFIX_TO_COUNTY[prefix] ?? null;
}

// ─── County property tax rates ───────────────────────────────────────────────

/**
 * Effective annual property tax rates by CA county (Prop 13 base + special assessments).
 * County-wide averages — individual parcels vary significantly (Mello-Roos, CFD, etc.).
 */
export const CA_COUNTY_TAX_RATES: Record<string, number> = {
    'ALAMEDA':         0.0125,
    'ALPINE':          0.0105,
    'AMADOR':          0.0105,
    'BUTTE':           0.0110,
    'CALAVERAS':       0.0105,
    'COLUSA':          0.0105,
    'CONTRA COSTA':    0.0120,
    'DEL NORTE':       0.0105,
    'EL DORADO':       0.0115,
    'FRESNO':          0.0110,
    'GLENN':           0.0105,
    'HUMBOLDT':        0.0105,
    'IMPERIAL':        0.0105,
    'INYO':            0.0105,
    'KERN':            0.0110,
    'KINGS':           0.0105,
    'LAKE':            0.0110,
    'LASSEN':          0.0105,
    'LOS ANGELES':     0.0118,
    'MADERA':          0.0105,
    'MARIN':           0.0110,
    'MARIPOSA':        0.0105,
    'MENDOCINO':       0.0105,
    'MERCED':          0.0105,
    'MODOC':           0.0105,
    'MONO':            0.0105,
    'MONTEREY':        0.0110,
    'NAPA':            0.0110,
    'NEVADA':          0.0105,
    'ORANGE':          0.0115,
    'PLACER':          0.0120,
    'PLUMAS':          0.0105,
    'RIVERSIDE':       0.0125,
    'SACRAMENTO':      0.0115,
    'SAN BENITO':      0.0110,
    'SAN BERNARDINO':  0.0115,
    'SAN DIEGO':       0.0115,
    'SAN FRANCISCO':   0.0118,
    'SAN JOAQUIN':     0.0110,
    'SAN LUIS OBISPO': 0.0108,
    'SAN MATEO':       0.0110,
    'SANTA BARBARA':   0.0107,
    'SANTA CLARA':     0.0120,
    'SANTA CRUZ':      0.0110,
    'SHASTA':          0.0105,
    'SIERRA':          0.0105,
    'SISKIYOU':        0.0105,
    'SOLANO':          0.0115,
    'SONOMA':          0.0110,
    'STANISLAUS':      0.0110,
    'SUTTER':          0.0105,
    'TEHAMA':          0.0105,
    'TRINITY':         0.0105,
    'TULARE':          0.0105,
    'TUOLUMNE':        0.0105,
    'VENTURA':         0.0110,
    'YOLO':            0.0115,
    'YUBA':            0.0105,
};

// ─── County homeowner insurance rates ────────────────────────────────────────

/**
 * Default annual homeowner insurance rates by CA county (as % of home value).
 * Higher in wildland-urban interface and fire-risk zones.
 */
export const CA_COUNTY_INS_RATES: Record<string, number> = {
    // High fire risk
    'BUTTE':           0.0075,
    'LAKE':            0.0075,
    'MENDOCINO':       0.0070,
    'TRINITY':         0.0075,
    'SISKIYOU':        0.0075,
    'LASSEN':          0.0070,
    'SHASTA':          0.0070,
    'TEHAMA':          0.0070,
    'MODOC':           0.0065,
    // Moderate-high fire risk (foothills)
    'EL DORADO':       0.0065,
    'NEVADA':          0.0065,
    'PLACER':          0.0060,
    'TUOLUMNE':        0.0065,
    'MARIPOSA':        0.0065,
    'MADERA':          0.0060,
    'CALAVERAS':       0.0060,
    'AMADOR':          0.0060,
    'ALPINE':          0.0060,
    // Moderate fire risk (coastal mountains, wine country)
    'VENTURA':         0.0055,
    'SANTA BARBARA':   0.0055,
    'MARIN':           0.0055,
    'NAPA':            0.0055,
    'SONOMA':          0.0055,
    'MONTEREY':        0.0050,
    'SANTA CRUZ':      0.0050,
    'SAN LUIS OBISPO': 0.0050,
    // Desert / inland (fire + wind)
    'RIVERSIDE':       0.0060,
    'SAN BERNARDINO':  0.0060,
    'KERN':            0.0055,
    'IMPERIAL':        0.0050,
    'INYO':            0.0055,
    'MONO':            0.0055,
    // Standard urban/suburban
    'LOS ANGELES':     0.0045,
    'ORANGE':          0.0045,
    'SAN DIEGO':       0.0048,
    'SAN FRANCISCO':   0.0040,
    'SAN MATEO':       0.0042,
    'SANTA CLARA':     0.0042,
    'ALAMEDA':         0.0043,
    'CONTRA COSTA':    0.0045,
    'SOLANO':          0.0050,
    'SACRAMENTO':      0.0048,
    'SAN JOAQUIN':     0.0050,
    'STANISLAUS':      0.0050,
    'MERCED':          0.0050,
    'FRESNO':          0.0050,
    'KINGS':           0.0050,
    'TULARE':          0.0050,
    'YOLO':            0.0048,
    'YUBA':            0.0050,
    'SUTTER':          0.0050,
    'PLUMAS':          0.0065,
    'SIERRA':          0.0065,
    'HUMBOLDT':        0.0055,
    'DEL NORTE':       0.0055,
    'COLUSA':          0.0050,
    'GLENN':           0.0050,
    'SAN BENITO':      0.0050,
};

/** Get the effective property tax rate for a CA county (defaults to 1.1% if unknown) */
export function getCACountyTaxRate(county: string): number {
    return CA_COUNTY_TAX_RATES[county.toUpperCase().replace(/\s+COUNTY$/i, '').trim()] ?? 0.0110;
}

/** Get the default insurance rate for a CA county (defaults to 0.5% if unknown) */
export function getCACountyInsRate(county: string): number {
    return CA_COUNTY_INS_RATES[county.toUpperCase().replace(/\s+COUNTY$/i, '').trim()] ?? 0.0050;
}

/**
 * Build a loan limits context string for injection into AI prompts.
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
