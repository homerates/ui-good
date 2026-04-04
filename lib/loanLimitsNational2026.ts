/**
 * 2026 Nationwide Conforming Loan Limits — All High-Cost Counties
 *
 * Source: FHFA FullCountyLoanLimitList2026_HERA-BASED_FINAL_FLAT.xlsx
 * Effective: Calendar Year 2026
 *
 * National baseline (standard conforming — applies to all counties NOT listed below):
 *   1-unit: $832,750 | 2-unit: $1,066,250 | 3-unit: $1,288,800 | 4-unit: $1,601,750
 *
 * Ceiling: $1,249,125 (1-unit) — AK, HI (except Kalawao/Maui), DC, ID Teton, WV Jefferson, WY Teton, VI, GU
 * HI exception: Kalawao & Maui counties use $1,299,500 (1-unit) per Hawaii statutory exception
 *
 * California: All 58 counties are in lib/loanLimits2026.ts — imported and re-exported here.
 */

export interface NationalCountyLimits {
  county: string;
  conforming: { units1: number; units2: number; units3: number; units4: number };
  isHighBalance: boolean; // true = above national $832,750 baseline
}

export const NATIONAL_CONFORMING_BASELINE = {
  units1: 832_750,
  units2: 1_066_250,
  units3: 1_288_800,
  units4: 1_601_750,
};

/**
 * High-cost county overrides by state (excludes CA — see loanLimits2026.ts).
 * All unlisted counties default to NATIONAL_CONFORMING_BASELINE.
 */
export const HIGH_COST_COUNTIES: Record<string, NationalCountyLimits[]> = {

  AK: [
    { county: "ALEUTIANS EAST BOROUGH",              conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "ALEUTIANS WEST CENSUS AREA",          conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "ANCHORAGE MUNICIPALITY",              conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "BETHEL CENSUS AREA",                  conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "BRISTOL BAY BOROUGH",                 conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "CHUGACH CENSUS AREA",                 conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "COPPER RIVER CENSUS AREA",            conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "DENALI BOROUGH",                      conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "DILLINGHAM CENSUS AREA",              conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "FAIRBANKS NORTH STAR BOROUGH",        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "HAINES BOROUGH",                      conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "HOONAH-ANGOON CENSUS AREA",           conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "JUNEAU CITY AND BOROUGH",             conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "KENAI PENINSULA BOROUGH",             conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "KETCHIKAN GATEWAY BOROUGH",           conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "KODIAK ISLAND BOROUGH",               conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "KUSILVAK CENSUS AREA",                conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "LAKE AND PENINSULA BOROUGH",          conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "MATANUSKA-SUSITNA BOROUGH",           conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "NOME CENSUS AREA",                    conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "NORTH SLOPE BOROUGH",                 conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "NORTHWEST ARCTIC BOROUGH",            conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "PETERSBURG CENSUS AREA",              conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "PRINCE OF WALES-HYDER CENSUS AREA",  conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "SITKA CITY AND BOROUGH",              conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "SKAGWAY MUNICIPALITY",                conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "SOUTHEAST FAIRBANKS CENSUS AREA",     conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "WRANGELL CITY AND BOROUGH",           conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "YAKUTAT CITY AND BOROUGH",            conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "YUKON-KOYUKUK CENSUS AREA",           conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
  ],

  CO: [
    { county: "ADAMS COUNTY",      conforming: { units1: 862500,  units2: 1104150, units3: 1334700, units4: 1658700  }, isHighBalance: true },
    { county: "ARAPAHOE COUNTY",   conforming: { units1: 862500,  units2: 1104150, units3: 1334700, units4: 1658700  }, isHighBalance: true },
    { county: "BOULDER COUNTY",    conforming: { units1: 879750,  units2: 1126250, units3: 1361350, units4: 1691850  }, isHighBalance: true },
    { county: "BROOMFIELD COUNTY", conforming: { units1: 862500,  units2: 1104150, units3: 1334700, units4: 1658700  }, isHighBalance: true },
    { county: "CLEAR CREEK COUNTY",conforming: { units1: 862500,  units2: 1104150, units3: 1334700, units4: 1658700  }, isHighBalance: true },
    { county: "DENVER COUNTY",     conforming: { units1: 862500,  units2: 1104150, units3: 1334700, units4: 1658700  }, isHighBalance: true },
    { county: "DOUGLAS COUNTY",    conforming: { units1: 862500,  units2: 1104150, units3: 1334700, units4: 1658700  }, isHighBalance: true },
    { county: "EAGLE COUNTY",      conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625  }, isHighBalance: true },
    { county: "ELBERT COUNTY",     conforming: { units1: 862500,  units2: 1104150, units3: 1334700, units4: 1658700  }, isHighBalance: true },
    { county: "GARFIELD COUNTY",   conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875  }, isHighBalance: true },
    { county: "GILPIN COUNTY",     conforming: { units1: 862500,  units2: 1104150, units3: 1334700, units4: 1658700  }, isHighBalance: true },
    { county: "GRAND COUNTY",      conforming: { units1: 883200,  units2: 1130650, units3: 1366700, units4: 1698500  }, isHighBalance: true },
    { county: "JEFFERSON COUNTY",  conforming: { units1: 862500,  units2: 1104150, units3: 1334700, units4: 1658700  }, isHighBalance: true },
    { county: "LAKE COUNTY",       conforming: { units1: 1092500, units2: 1398600, units3: 1690600, units4: 2101000  }, isHighBalance: true },
    { county: "MOFFAT COUNTY",     conforming: { units1: 1089050, units2: 1394200, units3: 1685250, units4: 2094350  }, isHighBalance: true },
    { county: "PARK COUNTY",       conforming: { units1: 862500,  units2: 1104150, units3: 1334700, units4: 1658700  }, isHighBalance: true },
    { county: "PITKIN COUNTY",     conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875  }, isHighBalance: true },
    { county: "ROUTT COUNTY",      conforming: { units1: 1089050, units2: 1394200, units3: 1685250, units4: 2094350  }, isHighBalance: true },
    { county: "SAN MIGUEL COUNTY", conforming: { units1: 994750,  units2: 1273450, units3: 1539350, units4: 1913000  }, isHighBalance: true },
    { county: "SUMMIT COUNTY",     conforming: { units1: 1092500, units2: 1398600, units3: 1690600, units4: 2101000  }, isHighBalance: true },
  ],

  CT: [
    { county: "GREATER BRIDGEPORT PLANNING REGION",   conforming: { units1: 977500, units2: 1251400, units3: 1512650, units4: 1879850 }, isHighBalance: true },
    { county: "NAUGATUCK VALLEY PLANNING REGION",     conforming: { units1: 851000, units2: 1089450, units3: 1316900, units4: 1636550 }, isHighBalance: true },
    { county: "WESTERN CONNECTICUT PLANNING REGION",  conforming: { units1: 977500, units2: 1251400, units3: 1512650, units4: 1879850 }, isHighBalance: true },
  ],

  DC: [
    { county: "DISTRICT OF COLUMBIA", conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
  ],

  FL: [
    { county: "MONROE COUNTY", conforming: { units1: 990150, units2: 1267600, units3: 1532200, units4: 1904150 }, isHighBalance: true },
  ],

  GU: [
    { county: "GUAM", conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
  ],

  HI: [
    { county: "HAWAII COUNTY",   conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "HONOLULU COUNTY", conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "KALAWAO COUNTY",  conforming: { units1: 1299500, units2: 1663600, units3: 2010950, units4: 2499100 }, isHighBalance: true },
    { county: "KAUAI COUNTY",    conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "MAUI COUNTY",     conforming: { units1: 1299500, units2: 1663600, units3: 2010950, units4: 2499100 }, isHighBalance: true },
  ],

  ID: [
    { county: "TETON COUNTY", conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
  ],

  MA: [
    { county: "DUKES COUNTY",      conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "ESSEX COUNTY",      conforming: { units1: 962550,  units2: 1232250, units3: 1489500, units4: 1851100 }, isHighBalance: true },
    { county: "MIDDLESEX COUNTY",  conforming: { units1: 962550,  units2: 1232250, units3: 1489500, units4: 1851100 }, isHighBalance: true },
    { county: "NANTUCKET COUNTY",  conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "NORFOLK COUNTY",    conforming: { units1: 962550,  units2: 1232250, units3: 1489500, units4: 1851100 }, isHighBalance: true },
    { county: "PLYMOUTH COUNTY",   conforming: { units1: 962550,  units2: 1232250, units3: 1489500, units4: 1851100 }, isHighBalance: true },
    { county: "SUFFOLK COUNTY",    conforming: { units1: 962550,  units2: 1232250, units3: 1489500, units4: 1851100 }, isHighBalance: true },
  ],

  MD: [
    { county: "CALVERT COUNTY",       conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "CHARLES COUNTY",       conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "FREDERICK COUNTY",     conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "MONTGOMERY COUNTY",    conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "PRINCE GEORGE'S COUNTY", conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
  ],

  NH: [
    { county: "ROCKINGHAM COUNTY", conforming: { units1: 962550, units2: 1232250, units3: 1489500, units4: 1851100 }, isHighBalance: true },
    { county: "STRAFFORD COUNTY",  conforming: { units1: 962550, units2: 1232250, units3: 1489500, units4: 1851100 }, isHighBalance: true },
  ],

  NJ: [
    { county: "BERGEN COUNTY",     conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "ESSEX COUNTY",      conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "HUDSON COUNTY",     conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "HUNTERDON COUNTY",  conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "MIDDLESEX COUNTY",  conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "MONMOUTH COUNTY",   conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "MORRIS COUNTY",     conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "OCEAN COUNTY",      conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "PASSAIC COUNTY",    conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "SOMERSET COUNTY",   conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "SUSSEX COUNTY",     conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "UNION COUNTY",      conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
  ],

  NY: [
    { county: "BRONX COUNTY",       conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "KINGS COUNTY",       conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "NASSAU COUNTY",      conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "NEW YORK COUNTY",    conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "PUTNAM COUNTY",      conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "QUEENS COUNTY",      conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "RICHMOND COUNTY",    conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "ROCKLAND COUNTY",    conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "SUFFOLK COUNTY",     conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "WESTCHESTER COUNTY", conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
  ],

  PA: [
    { county: "PIKE COUNTY", conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
  ],

  TN: [
    { county: "CANNON COUNTY",     conforming: { units1: 1029250, units2: 1317650, units3: 1592700, units4: 1979350 }, isHighBalance: true },
    { county: "CHEATHAM COUNTY",   conforming: { units1: 1029250, units2: 1317650, units3: 1592700, units4: 1979350 }, isHighBalance: true },
    { county: "DAVIDSON COUNTY",   conforming: { units1: 1029250, units2: 1317650, units3: 1592700, units4: 1979350 }, isHighBalance: true },
    { county: "DICKSON COUNTY",    conforming: { units1: 1029250, units2: 1317650, units3: 1592700, units4: 1979350 }, isHighBalance: true },
    { county: "HICKMAN COUNTY",    conforming: { units1: 1029250, units2: 1317650, units3: 1592700, units4: 1979350 }, isHighBalance: true },
    { county: "MACON COUNTY",      conforming: { units1: 1029250, units2: 1317650, units3: 1592700, units4: 1979350 }, isHighBalance: true },
    { county: "MAURY COUNTY",      conforming: { units1: 1029250, units2: 1317650, units3: 1592700, units4: 1979350 }, isHighBalance: true },
    { county: "ROBERTSON COUNTY",  conforming: { units1: 1029250, units2: 1317650, units3: 1592700, units4: 1979350 }, isHighBalance: true },
    { county: "RUTHERFORD COUNTY", conforming: { units1: 1029250, units2: 1317650, units3: 1592700, units4: 1979350 }, isHighBalance: true },
    { county: "SMITH COUNTY",      conforming: { units1: 1029250, units2: 1317650, units3: 1592700, units4: 1979350 }, isHighBalance: true },
    { county: "SUMNER COUNTY",     conforming: { units1: 1029250, units2: 1317650, units3: 1592700, units4: 1979350 }, isHighBalance: true },
    { county: "TROUSDALE COUNTY",  conforming: { units1: 1029250, units2: 1317650, units3: 1592700, units4: 1979350 }, isHighBalance: true },
    { county: "WILLIAMSON COUNTY", conforming: { units1: 1029250, units2: 1317650, units3: 1592700, units4: 1979350 }, isHighBalance: true },
    { county: "WILSON COUNTY",     conforming: { units1: 1029250, units2: 1317650, units3: 1592700, units4: 1979350 }, isHighBalance: true },
  ],

  UT: [
    { county: "GRAND COUNTY",   conforming: { units1: 839500,  units2: 1074700, units3: 1299100, units4: 1614450 }, isHighBalance: true },
    { county: "SUMMIT COUNTY",  conforming: { units1: 1150000, units2: 1472250, units3: 1779600, units4: 2211600 }, isHighBalance: true },
    { county: "WASATCH COUNTY", conforming: { units1: 1150000, units2: 1472250, units3: 1779600, units4: 2211600 }, isHighBalance: true },
    { county: "WAYNE COUNTY",   conforming: { units1: 997050,  units2: 1276400, units3: 1542900, units4: 1917450 }, isHighBalance: true },
  ],

  VA: [
    { county: "ALEXANDRIA CITY",      conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "ARLINGTON COUNTY",     conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "CLARKE COUNTY",        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "CULPEPER COUNTY",      conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "FAIRFAX CITY",         conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "FAIRFAX COUNTY",       conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "FALLS CHURCH CITY",    conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "FAUQUIER COUNTY",      conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "FREDERICKSBURG CITY",  conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "LOUDOUN COUNTY",       conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "MADISON COUNTY",       conforming: { units1: 1209750, units2: 1548975, units3: 1872225, units4: 2326875 }, isHighBalance: true },
    { county: "MANASSAS CITY",        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "MANASSAS PARK CITY",   conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "PRINCE WILLIAM COUNTY",conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "RAPPAHANNOCK COUNTY",  conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "SPOTSYLVANIA COUNTY",  conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "STAFFORD COUNTY",      conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "WARREN COUNTY",        conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
  ],

  VI: [
    { county: "ST. CROIX ISLAND",  conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "ST. JOHN ISLAND",   conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
    { county: "ST. THOMAS ISLAND", conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
  ],

  WA: [
    { county: "KING COUNTY",      conforming: { units1: 1063750, units2: 1361800, units3: 1646100, units4: 2045700 }, isHighBalance: true },
    { county: "PIERCE COUNTY",    conforming: { units1: 1063750, units2: 1361800, units3: 1646100, units4: 2045700 }, isHighBalance: true },
    { county: "SNOHOMISH COUNTY", conforming: { units1: 1063750, units2: 1361800, units3: 1646100, units4: 2045700 }, isHighBalance: true },
  ],

  WV: [
    { county: "JEFFERSON COUNTY", conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
  ],

  WY: [
    { county: "TETON COUNTY", conforming: { units1: 1249125, units2: 1599375, units3: 1933200, units4: 2402625 }, isHighBalance: true },
  ],
};

/** States that have at least one high-cost county (includes CA handled separately) */
export const HIGH_COST_STATES = new Set([
  "AK","CA","CO","CT","DC","FL","GU","HI","ID","MA","MD","NH","NJ","NY","PA","TN","UT","VA","VI","WA","WV","WY"
]);

/**
 * Returns limits for a given state + county.
 * Falls back to NATIONAL_CONFORMING_BASELINE for unlisted counties.
 */
export function getLimits(state: string, county: string): NationalCountyLimits {
  const counties = HIGH_COST_COUNTIES[state] ?? [];
  const match = counties.find(c => c.county.toUpperCase() === county.toUpperCase());
  if (match) return match;
  return {
    county,
    conforming: NATIONAL_CONFORMING_BASELINE,
    isHighBalance: false,
  };
}

/** Human-readable state names for the dropdown */
export const STATE_NAMES: Record<string, string> = {
  AL:"Alabama", AK:"Alaska", AZ:"Arizona", AR:"Arkansas", CA:"California",
  CO:"Colorado", CT:"Connecticut", DE:"Delaware", DC:"Washington D.C.", FL:"Florida",
  GA:"Georgia", GU:"Guam", HI:"Hawaii", ID:"Idaho", IL:"Illinois",
  IN:"Indiana", IA:"Iowa", KS:"Kansas", KY:"Kentucky", LA:"Louisiana",
  ME:"Maine", MD:"Maryland", MA:"Massachusetts", MI:"Michigan", MN:"Minnesota",
  MS:"Mississippi", MO:"Missouri", MT:"Montana", NE:"Nebraska", NV:"Nevada",
  NH:"New Hampshire", NJ:"New Jersey", NM:"New Mexico", NY:"New York", NC:"North Carolina",
  ND:"North Dakota", OH:"Ohio", OK:"Oklahoma", OR:"Oregon", PA:"Pennsylvania",
  RI:"Rhode Island", SC:"South Carolina", SD:"South Dakota", TN:"Tennessee", TX:"Texas",
  UT:"Utah", VT:"Vermont", VA:"Virginia", VI:"U.S. Virgin Islands", WA:"Washington",
  WV:"West Virginia", WI:"Wisconsin", WY:"Wyoming",
};
