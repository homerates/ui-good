// lib/attom.ts
// ATTOM Data API client — Step 2 of AI/data quality roadmap.
// Replaces Tavily scraping in property/enrich with structured JSON.
// Docs: https://api.developer.attomdata.com/docs

const ATTOM_BASE = 'https://api.attomdata.com/propertyapi/v1.0.0';
const TIMEOUT_MS = 8000;

export type AttomProperty = {
  lastSalePrice:  number | null;
  lastSaleDate:   string | null;
  beds:           number | null;
  baths:          number | null;
  sqft:           number | null;
  yearBuilt:      number | null;
  propertyType:   string | null;
  apn:            string | null;
  estimatedValue: number | null;
  lotSizeSqft:    number | null;
  attomId:        string | null;
};

const EMPTY: AttomProperty = {
  lastSalePrice: null, lastSaleDate: null, beds: null, baths: null,
  sqft: null, yearBuilt: null, propertyType: null, apn: null,
  estimatedValue: null, lotSizeSqft: null, attomId: null,
};

// Split "1984 Lake Sherwood Dr, Lake Sherwood, CA 91361"
// → address = "1984 Lake Sherwood Dr"   address2 = "Lake Sherwood, CA 91361"
function splitAddress(full: string): { address: string; address2: string } {
  const idx = full.indexOf(',');
  if (idx === -1) return { address: full.trim(), address2: '' };
  return {
    address:  full.slice(0, idx).trim(),
    address2: full.slice(idx + 1).trim(),
  };
}

function mapPropType(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = raw.toUpperCase();
  if (t.includes('SFR') || t.includes('SINGLE'))  return 'single_family';
  if (t.includes('CONDO'))                         return 'condo';
  if (t.includes('TOWN'))                          return 'townhouse';
  if (t.includes('MULTI') || t.includes('DUPLEX')) return 'multi_family';
  return raw.toLowerCase();
}

async function attomGet(path: string, params: Record<string, string>, apiKey: string): Promise<any> {
  const url = new URL(`${ATTOM_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { apikey: apiKey, accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

export async function enrichFromAttom(address: string): Promise<AttomProperty> {
  const apiKey = process.env.ATTOM_API_KEY;
  if (!apiKey) return EMPTY;

  const { address: street, address2 } = splitAddress(address);
  const params = address2
    ? { address: street, address2 }
    : { address: street };

  // Fire basic profile + sale history in parallel
  const [profileRes, historyRes] = await Promise.allSettled([
    attomGet('/property/basicprofile', params, apiKey),
    attomGet('/saleshistory/basichistory', params, apiKey),
  ]);

  const profile = profileRes.status === 'fulfilled' ? profileRes.value : null;
  const history = historyRes.status === 'fulfilled' ? historyRes.value : null;

  const prop   = profile?.property?.[0];
  const build  = prop?.building;
  const sale   = history?.property?.[0]?.salehistory?.[0];

  if (!prop && !sale) return EMPTY;

  const rawSaleDate = sale?.transactiondate ?? null;
  const lastSaleDate = rawSaleDate
    ? new Date(rawSaleDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  return {
    attomId:        prop?.identifier?.attomId?.toString() ?? null,
    beds:           build?.rooms?.beds ?? null,
    baths:          (build?.rooms?.bathsfull ?? null) !== null
                      ? (build?.rooms?.bathsfull ?? 0) + ((build?.rooms?.bathshalf ?? 0) * 0.5)
                      : null,
    sqft:           build?.size?.livingsize ?? build?.size?.universalsize ?? null,
    yearBuilt:      build?.yearbuilt ?? null,
    propertyType:   mapPropType(prop?.summary?.proptype),
    apn:            prop?.lot?.apn ?? null,
    lotSizeSqft:    prop?.lot?.lotsize2 ?? null,
    lastSalePrice:  sale?.amount?.saleamt ?? null,
    lastSaleDate,
    estimatedValue: null, // AVM endpoint — add in Step 3
  };
}
