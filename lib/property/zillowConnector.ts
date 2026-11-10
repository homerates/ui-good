// lib/property/zillowConnector.ts
// Property lookup via Zillow's official public MCP connector (https://mcp.zillow.com/api/v2).
//
// Why this exists (ISSUE-040, 2026-11-10): Redfin put AWS WAF Bot Control in front of its
// listing pages (HTTP 202 + x-amzn-waf-action: challenge, "Are You a Robot?" even for a
// real headless browser; last successful Redfin scrape in production 2026-10-05). Tavily
// extract fails on the same pages. Zillow launched this connector for AI assistants on
// 2026-10-19; it is unauthenticated and needs no API key.
//
// ── USAGE RULES (Zillow's own, from the connector's tool descriptions) ─────────────────
// These are the terms Zillow publishes for this connector. Do not relax them:
//   1. Zestimate text is used verbatim — never edited, paraphrased or blended with any
//      other AVM (so never pass it through computeAvmTier()).
//   2. Zillow's Zestimate disclaimer is always shown with the value, and a "listing price /
//      recent sale is a key input" note is shown whenever Zillow includes one.
//   3. The Zestimate tool is never used as the asking price of a for-sale home — asking
//      price comes only from Zillow's own search results, with a link to the Zillow page.
//   4. The details tool is off-market only (Zillow returns an error for active listings).
//   5. No fabricated values: a field Zillow doesn't return stays null.
// Plus HomeRates' own guardrails: on-demand only (one user request → at most 4 calls, never
// bulk or cron), results are NOT written to the shared `properties` cache or anything that
// feeds public pages / property_publications, and the card always links back to Zillow.

import { geocodeAddress } from '../censusGeocoder';
import { log } from '../logger';
import { validatePropertyIdentity, parseAddressComponents, normalizeStreetName, type AddressComponents } from '../addressIdentity';

const ENDPOINT = 'https://mcp.zillow.com/api/v2';
const CALL_TIMEOUT_MS = 15_000;
// ~0.004° ≈ 400m — small enough that the exact home is in the first page of results.
const SEARCH_BOX_DEG = 0.004;

interface ToolResult {
    isError: boolean;
    text: string;
    structured: unknown;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult | null> {
    try {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
            signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        });
        if (!res.ok) {
            log.warn('[ZillowConnector] HTTP error', { tool: name, status: res.status });
            return null;
        }
        // Streamable HTTP: the reply arrives as an SSE "data:" line (or plain JSON).
        const raw = await res.text();
        const payload = raw.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).pop() ?? raw;
        const msg = JSON.parse(payload);
        if (msg.error || !msg.result) {
            log.warn('[ZillowConnector] JSON-RPC error', { tool: name, error: msg.error?.message });
            return null;
        }
        const text = (msg.result.content ?? [])
            .filter((c: { type?: string }) => c.type === 'text')
            .map((c: { text?: string }) => c.text ?? '')
            .join('');
        return { isError: !!msg.result.isError, text, structured: msg.result.structuredContent ?? null };
    } catch (e: unknown) {
        log.warn('[ZillowConnector] call failed', { tool: name, error: (e as Error)?.message });
        return null;
    }
}

const money = (s: string | undefined): number | null => {
    if (!s) return null;
    const n = Number(s.replace(/[$,]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
};

export interface ZestimateResult {
    value: number;
    low: number | null;
    high: number | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    yearBuilt: number | null;
    /** Zillow's own "listing price / recent sale is a key input" sentence, verbatim. */
    keyInputNote: string | null;
    /** Zillow's "What is the Zestimate" text, verbatim — must be shown with the value. */
    disclaimer: string | null;
    /** The full valuation report, verbatim (comps included). */
    report: string;
    /** The address as Zillow states it in the report header. */
    zillowAddress: string | null;
}

export function parseZestimateReport(text: string): ZestimateResult | null {
    // Zillow words the range two ways: "estimated sales range of $A - $B" (typical) and
    // "estimated market value of $A - $B" (seen on recently sold homes).
    const head = text.match(/The Zestimate for (.+?) is (\$[\d,]+)/);
    const value = money(head?.[2]);
    if (!head || !value) return null;
    const range = text.match(/(?:range|market value) of (\$[\d,]+)\s*-\s*(\$[\d,]+)/);
    const facts = text.match(/([\d,]+) sqft, (\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?) beds\/baths/);
    const year = text.match(/built in (\d{4})/);
    // "…is a key input to the Zestimate…" or "…is a key factor driving this estimate."
    const keyInput = text.match(/[^\n.]*\bis a key (?:input|factor)\b[^\n]*/);
    const discIdx = text.indexOf('What is the Zestimate');
    return {
        value,
        low:  money(range?.[1]),
        high: money(range?.[2]),
        sqft:  facts ? Number(facts[1].replace(/,/g, '')) : null,
        beds:  facts ? Number(facts[2]) : null,
        baths: facts ? Number(facts[3]) : null,
        yearBuilt: year ? Number(year[1]) : null,
        keyInputNote: keyInput ? keyInput[0].trim() : null,
        disclaimer: discIdx >= 0 ? text.slice(discIdx + 'What is the Zestimate'.length).trim() || null : null,
        report: text.trim(),
        zillowAddress: head[1].trim(),
    };
}

interface OffMarketDetails {
    street: string; city: string; state: string; zip: string;
    county: string | null;
    taxRatePct: number | null;
    taxAssessedValue: number | null;
}

function parseDetails(text: string): OffMarketDetails | null {
    const start = text.indexOf('{');
    if (start < 0) return null;
    try {
        const p = JSON.parse(text.slice(start))?.propertyDetails?.property;
        if (!p?.address?.streetAddress) return null;
        return {
            street: p.address.streetAddress, city: p.address.city, state: p.address.state, zip: p.address.zipcode,
            county: typeof p.county === 'string' ? p.county : null,
            taxRatePct: typeof p.propertyTaxRate === 'number' ? p.propertyTaxRate : null,
            taxAssessedValue: typeof p.taxAssessedValue === 'number' ? p.taxAssessedValue : null,
        };
    } catch {
        return null;
    }
}

interface ActiveListing {
    street: string; city: string; state: string; zip: string;
    price: number;
    beds: number | null; baths: number | null; sqft: number | null; lotSqft: number | null;
    url: string | null;
}

/** Finds the exact home among Zillow's search results in a small box around its coordinates. */
async function findActiveListing(requestedAddress: string, lat: number, lng: number): Promise<ActiveListing | null> {
    const d = SEARCH_BOX_DEG;
    const wkt = `POLYGON((${lng - d} ${lat - d}, ${lng + d} ${lat - d}, ${lng + d} ${lat + d}, ${lng - d} ${lat + d}, ${lng - d} ${lat - d}))`;
    const r = await callTool('zillow_property_search', {
        request: { propertySearchRegionFiltersRequest: { customPolygonWKT: wkt }, propertyFiltersRequest: {} },
    });
    if (!r || r.isError) return null;
    const results = ((r.structured as { results?: unknown[] } | null)?.results ?? []) as Array<{ type?: string; result?: Record<string, any> }>;
    for (const item of results) {
        const x = item.result;
        if (!x) continue;
        const fa = x.formattedAddress;
        const price = x.price?.filteredPrice;
        if (!fa?.line1 || typeof price !== 'number') continue;
        const identity = validatePropertyIdentity(requestedAddress, {
            address: fa.line1, city: fa.city, state: fa.stateOrProvince, zip: fa.postalCode,
        });
        if (!identity.ok) continue;
        return {
            street: fa.line1, city: fa.city, state: fa.stateOrProvince, zip: fa.postalCode,
            price,
            beds:  typeof x.bedroomCount === 'number' ? x.bedroomCount : null,
            baths: typeof x.bathroomCount === 'number' ? x.bathroomCount : null,
            sqft:  typeof x.livingAreaSquareFeet === 'number' ? x.livingAreaSquareFeet : null,
            lotSqft: x.lotArea?.sizeUnits === 'Square Feet' && typeof x.lotArea?.size === 'number' ? x.lotArea.size : null,
            url: typeof x.homeDetailsPageUrl === 'string' ? x.homeDetailsPageUrl : null,
        };
    }
    return null;
}

/** True when a Zestimate report header ("870 Doud St Monterey, CA 93940" — Zillow puts no
 *  comma between street and city) names the requested house number + street, and the same
 *  state and ZIP. Street-type words are canonicalized (St≡Street); nothing else is fuzzy. */
function zestimateNamesAddress(requested: AddressComponents, header: string): boolean {
    const [streetCity, ...rest] = header.split(',');
    const head = normalizeStreetName(streetCity.trim());
    const want = `${requested.houseNumber} ${normalizeStreetName(requested.street)}`;
    if (head !== want && !head.startsWith(want + ' ')) return false;
    const tail = rest.join(',').trim().match(/^([A-Za-z]{2})\s*(\d{5})?/);
    if (!tail) return false;
    if (requested.state && tail[1].toUpperCase() !== requested.state) return false;
    if (requested.zip && tail[2] !== requested.zip) return false;
    return true;
}

/** Zillow address-search URL — used as the source link when there's no listing page URL. */
function zillowSearchUrl(fullAddress: string): string {
    return `https://www.zillow.com/homes/${encodeURIComponent(fullAddress.replace(/,/g, '').replace(/\s+/g, '-'))}_rb/`;
}

/**
 * Looks up a property through Zillow's connector. Returns data in the same shape the
 * /api/property/lookup pipeline returns, or null when Zillow can't confirm this exact
 * address. Never throws.
 */
export async function lookupViaZillow(requestedAddress: string): Promise<Record<string, unknown> | null> {
    const [zRes, detailsRes, geo] = await Promise.all([
        callTool('get_zestimate', { address: requestedAddress }),
        callTool('zillow_property_details_by_address_or_name', { query: requestedAddress }),
        geocodeAddress(requestedAddress).catch(() => null),
    ]);

    const zestimate = zRes && !zRes.isError ? parseZestimateReport(zRes.text) : null;
    const details = detailsRes && !detailsRes.isError ? parseDetails(detailsRes.text) : null;
    const isForSaleError = !!detailsRes?.isError && /'For Sale' listing/i.test(detailsRes.text);

    let listing: ActiveListing | null = null;
    if (!details && geo) listing = await findActiveListing(requestedAddress, geo.latitude, geo.longitude);

    // The Zestimate is only used when its own header names the requested home.
    const requested = parseAddressComponents(requestedAddress);
    const z = zestimate?.zillowAddress && requested && zestimateNamesAddress(requested, zestimate.zillowAddress)
        ? zestimate : null;

    // Identity. Preferred anchor: Zillow's structured address (details or a search match),
    // which must pass the shared identity gate. Fallback: a listed home Zillow's search
    // doesn't return (typically pending / under contract) — anchored on the requested
    // address only when the Zestimate header independently names that exact home + ZIP.
    let anchor: { street: string; city: string; state: string; zip: string } | null = details ?? listing;
    if (anchor) {
        const identity = validatePropertyIdentity(requestedAddress, {
            address: anchor.street, city: anchor.city, state: anchor.state, zip: anchor.zip,
        });
        if (!identity.ok) {
            log.warn('[ZillowConnector] identity check failed', { code: identity.code });
            return null;
        }
    } else if (z && requested?.city && requested.state && requested.zip) {
        anchor = { street: `${requested.houseNumber} ${requested.street}`, city: requested.city, state: requested.state, zip: requested.zip };
    } else {
        log.warn('[ZillowConnector] no confirmable match', { forSale: isForSaleError, geocoded: !!geo, zestimate: !!zestimate });
        return null;
    }

    const fullAddress = `${anchor.street}, ${anchor.city}, ${anchor.state} ${anchor.zip}`;
    const forSale = !!listing || isForSaleError;
    // Zillow rule: a Zestimate is never the asking price of a listed home. Listed but not
    // in search → price stays null and the card's existing "enter the listing price" flow runs.
    const price = listing ? listing.price : forSale ? null : z?.value ?? null;
    const taxRateEffective = details?.taxRatePct != null ? details.taxRatePct / 100 : null;

    const notes: string[] = ['Property data from Zillow'];
    if (forSale && !listing) notes.push('Listed for sale — see the asking price on Zillow');
    if (z) {
        notes.push(`Zestimate® ${'$' + z.value.toLocaleString()}`);
        if (z.keyInputNote) notes.push(z.keyInputNote);
        if (z.disclaimer) notes.push(z.disclaimer);
    }

    return {
        source:           'zillow',
        url:              listing?.url ?? zillowSearchUrl(fullAddress),
        parsedBy:         'zillow_connector',
        parseWarnings:    notes,
        price,
        listPrice:        listing?.price ?? null,
        address:          fullAddress,
        city:             anchor.city,
        state:            anchor.state,
        zip:              anchor.zip,
        county:           details?.county ?? null,
        beds:             listing?.beds ?? z?.beds ?? null,
        baths:            listing?.baths ?? z?.baths ?? null,
        sqft:             listing?.sqft ?? z?.sqft ?? null,
        lotSqft:          listing?.lotSqft ?? null,
        yearBuilt:        z?.yearBuilt ?? null,
        annualTaxes:      price && taxRateEffective ? Math.round(price * taxRateEffective) : null,
        taxRateEffective,
        taxSource:        taxRateEffective != null ? 'zillow' : null,
        // HARD RULE: photos only from ssl.cdn-redfin.com — Zillow supplies none we may use.
        photoUrl:         null,
        listingStatus:    forSale ? 'FOR_SALE' : 'OFF_MARKET',
        estimatedValue:   z?.value ?? null,
        estimatedValueLow:  z?.low ?? null,
        estimatedValueHigh: z?.high ?? null,
        avmSource:        z ? 'zillow_zestimate' : null,
        // Verbatim Zillow text, for any surface that shows the valuation detail.
        zestimateReport:     z?.report ?? null,
        zestimateDisclaimer: z?.disclaimer ?? null,
        zestimateKeyInput:   z?.keyInputNote ?? null,
        dataAttribution:  'Property data and Zestimate® from Zillow',
        lastSaleDate:     null,
        lastSalePrice:    null,
    };
}
