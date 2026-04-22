// lib/attom.ts
// ATTOM Data API client — full intelligence suite.
// Endpoints: basicprofile, saleshistory, AVM, salescomps, detailmortgage
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

export type AttomAVM = {
  estimatedValue:     number | null;
  estimatedValueLow:  number | null;
  estimatedValueHigh: number | null;
  avmDate:            string | null;
  confidence:         number | null; // tScore 0–100
};

export type AttomComp = {
  address:       string;
  city:          string | null;
  salePrice:     number;
  saleDate:      string;
  beds:          number | null;
  baths:         number | null;
  sqft:          number | null;
  pricePerSqft:  number | null;
  propertyType:  string | null;
  yearBuilt:     number | null;
  distanceMiles: number | null;
};

export type AttomMortgage = {
  lender:          string | null;
  originalAmount:  number | null;
  openBalance:     number | null;
  interestRate:    number | null;
  loanType:        string | null;
  originationDate: string | null;
};

const EMPTY: AttomProperty = {
  lastSalePrice: null, lastSaleDate: null, beds: null, baths: null,
  sqft: null, yearBuilt: null, propertyType: null, apn: null,
  estimatedValue: null, lotSizeSqft: null, attomId: null,
};

const EMPTY_AVM: AttomAVM = {
  estimatedValue: null, estimatedValueLow: null, estimatedValueHigh: null,
  avmDate: null, confidence: null,
};

const EMPTY_MTG: AttomMortgage = {
  lender: null, originalAmount: null, openBalance: null,
  interestRate: null, loanType: null, originationDate: null,
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

async function attomGet(path: string, params: Record<string, string | undefined>, apiKey: string): Promise<any> {
  const url = new URL(`${ATTOM_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined) url.searchParams.set(k, v); });
  const res = await fetch(url.toString(), {
    headers: { apikey: apiKey, accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// ── Basic property profile + sale history ─────────────────────────────────────
export async function enrichFromAttom(address: string): Promise<AttomProperty> {
  const apiKey = process.env.ATTOM_API_KEY;
  if (!apiKey) return EMPTY;

  const { address: street, address2 } = splitAddress(address);
  const params = address2 ? { address: street, address2 } : { address: street };

  const [profileRes, historyRes] = await Promise.allSettled([
    attomGet('/property/basicprofile', params, apiKey),
    attomGet('/saleshistory/basichistory', params, apiKey),
  ]);

  const profile = profileRes.status === 'fulfilled' ? profileRes.value : null;
  const history = historyRes.status === 'fulfilled' ? historyRes.value : null;

  const prop  = profile?.property?.[0];
  const build = prop?.building;
  const sale  = history?.property?.[0]?.salehistory?.[0];

  if (!prop && !sale) return EMPTY;

  const rawSaleDate  = sale?.transactiondate ?? null;
  const lastSaleDate = rawSaleDate
    ? new Date(rawSaleDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  return {
    attomId:       prop?.identifier?.attomId?.toString() ?? null,
    beds:          build?.rooms?.beds ?? null,
    baths:         (build?.rooms?.bathsfull ?? null) !== null
                     ? (build?.rooms?.bathsfull ?? 0) + ((build?.rooms?.bathshalf ?? 0) * 0.5)
                     : null,
    sqft:          build?.size?.livingsize ?? build?.size?.universalsize ?? null,
    yearBuilt:     build?.yearbuilt ?? null,
    propertyType:  mapPropType(prop?.summary?.proptype),
    apn:           prop?.lot?.apn ?? null,
    lotSizeSqft:   prop?.lot?.lotsize2 ?? null,
    lastSalePrice: sale?.amount?.saleamt ?? null,
    lastSaleDate,
    estimatedValue: null, // use getAttomAVM() for AVM
  };
}

// ── AVM — Automated Valuation Model ──────────────────────────────────────────
export async function getAttomAVM(address: string): Promise<AttomAVM> {
  const apiKey = process.env.ATTOM_API_KEY;
  if (!apiKey) return EMPTY_AVM;

  const { address: street, address2 } = splitAddress(address);
  const params = address2 ? { address: street, address2 } : { address: street };

  const res = await attomGet('/attomavm/detail', params, apiKey);
  const avm = res?.property?.[0]?.avm;
  if (!avm?.amount?.value) return EMPTY_AVM;

  return {
    estimatedValue:     avm.amount.value   ?? null,
    estimatedValueLow:  avm.amount.low     ?? null,
    estimatedValueHigh: avm.amount.high    ?? null,
    avmDate:            avm.eventDate      ?? null,
    confidence:         avm.condition?.tScore ?? null,
  };
}

// ── Comparable sales within 0.5 mi, last 2 years ─────────────────────────────
export async function getAttomComps(address: string): Promise<AttomComp[]> {
  const apiKey = process.env.ATTOM_API_KEY;
  if (!apiKey) return [];

  const { address: street, address2 } = splitAddress(address);
  const twoYearsAgo = new Date(Date.now() - 2 * 365.25 * 24 * 3600 * 1000).toISOString().split('T')[0];

  const params: Record<string, string | undefined> = {
    address:     street,
    ...(address2 ? { address2 } : {}),
    searchType:  'Proximity',
    miles:       '0.5',
    minSaleDate: twoYearsAgo,
  };

  const res = await attomGet('/salescomps/snapshot', params, apiKey);
  const comps: any[] = res?.salescomps?.[0]?.comps ?? res?.property ?? [];

  return comps
    .filter((c: any) => (c?.sale?.amount?.saleamt ?? 0) > 0)
    .slice(0, 8)
    .map((c: any) => {
      const addr  = c.address ?? {};
      const sale  = c.sale ?? {};
      const bldg  = c.building ?? {};
      const price = sale.amount?.saleamt ?? null;
      const sqft  = bldg.size?.livingsize ?? bldg.size?.universalsize ?? null;
      return {
        address:       [addr.line1, addr.locality].filter(Boolean).join(', ') || 'Unknown',
        city:          addr.locality ?? null,
        salePrice:     price,
        saleDate:      sale.amount?.salesSearchDate ?? sale.transactiondate ?? '',
        beds:          bldg.rooms?.beds ?? null,
        baths:         (bldg.rooms?.bathsfull ?? null) !== null
                         ? (bldg.rooms?.bathsfull ?? 0) + ((bldg.rooms?.bathshalf ?? 0) * 0.5)
                         : null,
        sqft,
        pricePerSqft:  (price && sqft) ? Math.round(price / sqft) : null,
        propertyType:  mapPropType(c.summary?.proptype),
        yearBuilt:     bldg.yearbuilt ?? null,
        distanceMiles: typeof c.distance === 'number' ? +c.distance.toFixed(2) : null,
      };
    });
}

// ── First mortgage / lien on record ─────────────────────────────────────────
export async function getAttomMortgage(address: string): Promise<AttomMortgage> {
  const apiKey = process.env.ATTOM_API_KEY;
  if (!apiKey) return EMPTY_MTG;

  const { address: street, address2 } = splitAddress(address);
  const params = address2 ? { address: street, address2 } : { address: street };

  const res = await attomGet('/property/detailmortgage', params, apiKey);
  const mtg = res?.property?.[0]?.mortgage?.[0];
  if (!mtg) return EMPTY_MTG;

  return {
    lender:          mtg.lender?.name ?? null,
    originalAmount:  mtg.amount?.mOriginalLoanAmt  ?? null,
    openBalance:     mtg.amount?.mTotalLoanBalance ?? null,
    interestRate:    mtg.assessment?.mInterestRate ?? null,
    loanType:        mtg.loan?.mLoanType           ?? null,
    originationDate: mtg.term?.startDate           ?? null,
  };
}
