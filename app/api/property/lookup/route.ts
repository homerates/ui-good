// app/api/property/lookup/route.ts
// POST /api/property/lookup
// Body: { url?: string, address?: string }
//
// For URL: uses existing lib/property/fetch pipeline for base data,
//          Tavily extract for extended fields (status, last sale, equity).
// For address: Rentcast API (requires RENTCAST_API_KEY env var).

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { fetchPropertyData } from '@/property/fetch';
import { lookupTaxRate }     from '@/property/taxTable';
import { getSupabase }       from '../../../../lib/supabaseServer';

// Cache TTL: 7 days for Rentcast snapshots
const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Normalize address for canonical lookup (lowercase, trim extra spaces)
function normalizeAddress(addr: string): string {
  return addr.trim().replace(/\s+/g, ' ');
}

// Upsert a canonical property + snapshot into Supabase and return the property id
async function cachePropertyResult(address: string, data: Record<string, unknown>, source: string): Promise<void> {
  try {
    const sb = getSupabase();
    if (!sb) return;
    const addressFull = normalizeAddress(address);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SNAPSHOT_TTL_MS).toISOString();

    // Upsert canonical property record
    const { data: prop } = await sb
      .from('properties')
      .upsert({
        address_full:            addressFull,
        address_line:            (data.address as string | null) ?? null,
        city:                    (data.city as string | null) ?? null,
        state:                   (data.state as string | null) ?? null,
        zip:                     (data.zip as string | null) ?? null,
        beds:                    (data.beds as number | null) ?? null,
        baths:                   (data.baths as number | null) ?? null,
        sqft:                    (data.sqft as number | null) ?? null,
        latest_value:            (data.estimatedValue as number | null) ?? null,
        latest_value_low:        (data.estimatedValueLow as number | null) ?? null,
        latest_value_high:       (data.estimatedValueHigh as number | null) ?? null,
        latest_rent:             (data.rentEstimate as number | null) ?? null,
        latest_last_sale_price:  (data.lastSalePrice as number | null) ?? null,
        latest_last_sale_date:   (data.lastSaleDate as string | null) ?? null,
        latest_listing_status:   (data.listingStatus as string | null) ?? null,
        enriched_at:             now.toISOString(),
        enrichment_source:       source,
        confidence:              source === 'rentcast' ? 0.90 : 0.65,
        updated_at:              now.toISOString(),
      }, { onConflict: 'address_full' })
      .select('id')
      .maybeSingle();

    if (!prop?.id) return;

    // Insert snapshot row (full payload)
    await sb.from('property_snapshots').insert({
      property_id:   prop.id,
      snapshot_type: 'full',
      source,
      data,
      fetched_at:    now.toISOString(),
      expires_at:    expiresAt,
      confidence:    source === 'rentcast' ? 0.90 : 0.65,
    });
  } catch {
    // Non-fatal — cache write failures should never break the lookup response
  }
}

// Check if a fresh cached snapshot exists for this address
async function getCachedSnapshot(address: string): Promise<Record<string, unknown> | null> {
  try {
    const sb = getSupabase();
    if (!sb) return null;
    const addressFull = normalizeAddress(address);
    const { data: prop } = await sb
      .from('properties')
      .select('id, enriched_at')
      .eq('address_full', addressFull)
      .maybeSingle();
    if (!prop?.id || !prop.enriched_at) return null;

    const age = Date.now() - new Date(prop.enriched_at).getTime();
    if (age > SNAPSHOT_TTL_MS) return null;

    const { data: snap } = await sb
      .from('property_snapshots')
      .select('data')
      .eq('property_id', prop.id)
      .eq('snapshot_type', 'full')
      .gt('expires_at', new Date().toISOString())
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return (snap?.data as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

// ── Historical 30yr fixed annual averages (FRED MORTGAGE30US) ──────────────
const HIST_RATES: Record<number, number> = {
    2025: 6.76, 2024: 6.87, 2023: 6.81, 2022: 5.34,
    2021: 2.96, 2020: 3.11, 2019: 3.94, 2018: 4.54,
    2017: 3.99, 2016: 3.65, 2015: 3.85, 2014: 4.17,
    2013: 3.98, 2012: 3.66, 2011: 4.45, 2010: 4.69,
    2009: 5.04, 2008: 6.03, 2007: 6.34, 2006: 6.41,
    2005: 5.87, 2004: 5.84, 2003: 5.83, 2002: 6.54,
    2001: 6.97, 2000: 8.05,
};

function historicalRate(year: number): number {
    return HIST_RATES[year] ?? 5.5;
}

function remainingBalance(
    purchasePrice: number,
    downPct = 0.20,
    ratePct: number,
    monthsElapsed: number,
    termMonths = 360,
): number {
    const principal = purchasePrice * (1 - downPct);
    const r = ratePct / 100 / 12;
    if (r === 0) return Math.max(0, principal - (principal / termMonths) * monthsElapsed);
    const pmt = (principal * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
    const bal = principal * Math.pow(1 + r, monthsElapsed) - pmt * ((Math.pow(1 + r, monthsElapsed) - 1) / r);
    return Math.max(0, bal);
}

function parseMonthYear(str: string): Date | null {
    const m = str.match(/([A-Za-z]+)\s+(\d{4})/);
    if (!m) return null;
    const months: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const mo = months[m[1].toLowerCase().slice(0, 3)];
    if (mo === undefined) return null;
    return new Date(parseInt(m[2]), mo, 1);
}

function monthsAgo(d: Date): number {
    const now = new Date();
    return Math.max(0, (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()));
}

// ── Extended field parser (works on Tavily-extracted text or raw HTML text) ─

interface ExtendedFields {
    listingStatus: 'FOR_SALE' | 'OFF_MARKET' | 'PENDING' | 'SOLD' | 'UNKNOWN';
    daysOnMarket: number | null;
    lastSaleDate: string | null;
    lastSalePrice: number | null;
    estimatedValue: number | null;
    estimatedValueLow: number | null;
    estimatedValueHigh: number | null;
    hoaMonthly: number | null;
    pricePerSqft: number | null;
    // Computed refi fields
    estimatedBalance: number | null;
    estimatedEquity: number | null;
    purchaseRate: number | null;
    remainingMonths: number | null;
}

function parseExtended(text: string, price: number | null, sqft: number | null): ExtendedFields {
    const t = text.slice(0, 150_000);

    // Listing status — check strongest signals first to avoid false positives
    // (sold pages contain "Contract Pending" in history; sold must win over pending)
    let listingStatus: ExtendedFields['listingStatus'] = 'UNKNOWN';
    if (/sold\s+(?:on\s+)?\w+\s+\d{1,2},?\s+\d{4}/i.test(t)   // "Sold on Feb 17, 2026"
        || /sold\s+price/i.test(t)                               // "Sold Price"
        || /\bsold\s+\w+\s+\d{4}\s+for\b/i.test(t))             // "Sold Feb 2026 for"
                                                    { listingStatus = 'SOLD'; }
    else if (/off[\s-]?market/i.test(t))            { listingStatus = 'OFF_MARKET'; }
    else if (/for[\s-]?sale/i.test(t))              { listingStatus = 'FOR_SALE'; }
    else if (/\bpending\b/i.test(t))                { listingStatus = 'PENDING'; }
    else if (/\bsold\b/i.test(t))                   { listingStatus = 'SOLD'; }

    // Days on market
    const domM = t.match(/(\d+)\s+days?\s+on\s+(?:redfin|market|zillow|trulia)/i)
        ?? t.match(/days\s+on\s+(?:redfin|market)[:\s]+(\d+)/i);
    const daysOnMarket = domM ? parseInt(domM[1]) : null;

    // Last sale — multiple formats:
    //  "Sold May 2025 for $2,150,000"
    //  "SOLD ON FEB 17, 2026\n$1,250,000 Sold Price"
    //  "Last sold: May 2024 · $1,200,000"
    let lastSaleDate: string | null = null;
    let lastSalePrice: number | null = null;
    const soldM =
        // "Sold May 2025 for $2,150,000"
        t.match(/sold\s+([A-Za-z]+\s+\d{4})\s+for\s+\$?([\d,]+)/i)
        // "Last sold: May 2024 · $1,200,000"
        ?? t.match(/last\s+sold[:\s]+([A-Za-z]+\s+\d{4})[^$\d]*\$?([\d,]+)/i)
        // "SOLD ON FEB 17, 2026" then nearby "$1,250,000 Sold Price"
        ?? (() => {
            const dateM = t.match(/sold\s+on\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
            const priceM = t.match(/\$([\d,]+)\s+sold\s+price/i) ?? t.match(/sold\s+price[:\s]+\$?([\d,]+)/i);
            if (dateM && priceM) {
                // normalize "Feb 17, 2026" → "February 2026"
                const d = new Date(dateM[1]);
                const label = isNaN(d.getTime()) ? dateM[1] : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                return [null, label, priceM[1]] as unknown as RegExpMatchArray;
            }
            return null;
        })();
    if (soldM) {
        lastSaleDate  = soldM[1] ?? null;
        lastSalePrice = soldM[2] ? parseInt(soldM[2].replace(/,/g, '')) : null;
    }

    // HOA
    const hoaM = t.match(/hoa(?:\s+(?:fees?|dues?))?[:\s]+\$?([\d,]+)\s*\/?\s*mo/i)
        ?? t.match(/\$?([\d,]+)\s*\/\s*mo(?:nth)?\s+hoa/i);
    const hoaMonthly = hoaM ? parseInt(hoaM[1].replace(/,/g, '')) : null;

    // Estimated value
    let estimatedValue: number | null = null;
    const evM = t.match(/(?:redfin\s+estimate|estimated?\s+(?:sale\s+)?(?:value|price)|zestimate)[:\s$]+([\d,]+)/i);
    if (evM) estimatedValue = parseInt(evM[1].replace(/,/g, ''));

    // Value range "$2.19M – $2.65M"
    let estimatedValueLow:  number | null = null;
    let estimatedValueHigh: number | null = null;
    const rangeM = t.match(/\$\s*([\d.]+)M?\s*[–\-—to]+\s*\$\s*([\d.]+)M/i);
    if (rangeM) {
        const lo = parseFloat(rangeM[1]);
        const hi = parseFloat(rangeM[2]);
        if (lo < hi && lo > 0) {
            estimatedValueLow  = Math.round(lo * 1_000_000);
            estimatedValueHigh = Math.round(hi * 1_000_000);
            if (!estimatedValue) estimatedValue = Math.round((lo + hi) / 2 * 1_000_000);
        }
    }

    // Price per sqft
    const pricePerSqft = (price && sqft) ? Math.round(price / sqft) : null;

    // Refi fields
    let estimatedBalance: number | null = null;
    let estimatedEquity:  number | null = null;
    let purchaseRate:     number | null = null;
    let remainingMonths:  number | null = null;

    const isOffMarket = listingStatus === 'OFF_MARKET' || listingStatus === 'SOLD';
    if (isOffMarket && lastSalePrice && lastSaleDate) {
        const saleDate = parseMonthYear(lastSaleDate);
        if (saleDate) {
            const elapsed    = monthsAgo(saleDate);
            purchaseRate     = historicalRate(saleDate.getFullYear());
            estimatedBalance = Math.round(remainingBalance(lastSalePrice, 0.20, purchaseRate, elapsed));
            remainingMonths  = Math.max(60, 360 - elapsed);
            const curVal     = estimatedValue ?? Math.round(lastSalePrice * 1.05);
            estimatedEquity  = Math.round(curVal - estimatedBalance);
        }
    }

    return {
        listingStatus, daysOnMarket, lastSaleDate, lastSalePrice,
        estimatedValue, estimatedValueLow, estimatedValueHigh,
        hoaMonthly, pricePerSqft,
        estimatedBalance, estimatedEquity, purchaseRate, remainingMonths,
    };
}

// ── Text-based property parser (for Tavily raw_content when direct fetch blocked) ─

interface BasicFields {
    price: number | null;
    beds:  number | null;
    baths: number | null;
    sqft:  number | null;
    address: string | null;
    city:    string | null;
    state:   string | null;
    zip:     string | null;
}

function parsePropertyFromText(text: string): BasicFields {
    const t = text.slice(0, 60_000);

    // Price — "$1,250,000" or "$749K" or "$1.2M"
    let price: number | null = null;
    const priceMatches = [...t.matchAll(/\$\s*([\d,]+(?:\.\d+)?)\s*([KkMm]?)\b/g)];
    for (const m of priceMatches) {
        const raw = parseFloat(m[1].replace(/,/g, ''));
        const suffix = m[2].toUpperCase();
        const val = suffix === 'M' ? Math.round(raw * 1_000_000)
                  : suffix === 'K' ? Math.round(raw * 1_000)
                  : Math.round(raw);
        if (val >= 50_000 && val <= 20_000_000) { price = val; break; }
    }

    // Beds / baths / sqft
    const bedsM  = t.match(/(\d+(?:\.\d+)?)\s*(?:bedroom(?:s)?|bed(?:s)?|bd)\b/i);
    const bathsM = t.match(/(\d+(?:\.\d+)?)\s*(?:bathroom(?:s)?|bath(?:s)?|ba)\b/i);
    const sqftM  = t.match(/([\d,]+)\s*(?:sq\.?\s*ft\.?|sqft|square\s*feet)/i);

    const beds  = bedsM  ? parseFloat(bedsM[1])                   : null;
    const baths = bathsM ? parseFloat(bathsM[1])                  : null;
    const sqft  = sqftM  ? parseInt(sqftM[1].replace(/,/g, ''))   : null;

    // Address — look for lines starting with a house number
    let address: string | null = null;
    let city:    string | null = null;
    let state:   string | null = null;
    let zip:     string | null = null;

    for (const line of t.split(/\n+/)) {
        const l = line.trim();
        if (!/^\d+\s+[A-Za-z]/.test(l) || l.length > 120) continue;
        // Full "123 Main St, City, CA 90001" pattern
        const full = l.match(/^(\d[^,]+),\s*([^,]+),\s*([A-Z]{2})\s*(\d{5})?/i);
        if (full) {
            address = `${full[1].trim()}, ${full[2].trim()}, ${full[3].toUpperCase()}${full[4] ? ' ' + full[4] : ''}`;
            city    = full[2].trim();
            state   = full[3].toUpperCase();
            zip     = full[4] ?? null;
            break;
        }
    }

    return { price, beds, baths, sqft, address, city, state, zip };
}

// ── Tavily extract helper ───────────────────────────────────────────────────

async function tavilyExtract(url: string): Promise<string | null> {
    const key = process.env.TAVILY_API_KEY;
    if (!key) return null;
    try {
        const res = await fetch('https://api.tavily.com/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: key, urls: [url] }),
            signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) return null;
        const json = await res.json();
        return (json?.results?.[0]?.raw_content as string) ?? null;
    } catch {
        return null;
    }
}

// ── Main handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
    try {
        const body = await req.json();
        if (body.url)     return handleUrl(String(body.url));
        if (body.address) return handleAddress(String(body.address));
        return NextResponse.json({ ok: false, error: 'url or address required' }, { status: 400 });
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}

// ── URL handler ─────────────────────────────────────────────────────────────

async function handleUrl(rawUrl: string) {
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

    // Run base property fetch and Tavily extract in parallel
    const [baseResult, tavilyText] = await Promise.allSettled([
        fetchPropertyData(url),
        tavilyExtract(url),
    ]);

    const base     = baseResult.status === 'fulfilled'  ? baseResult.value   : null;
    const text     = tavilyText.status === 'fulfilled'  ? tavilyText.value   : null;

    if (!base || !base.ok) {
        // Direct fetch blocked — fall back to Tavily text if available
        if (text && text.length > 200) {
            const tp  = parsePropertyFromText(text);
            const ext = parseExtended(text, tp.price, tp.sqft);
            if (tp.price || tp.address) {
                const { rate } = lookupTaxRate(tp.state ?? '', null);
                const siteLabel = /realtor\.com/i.test(url) ? 'realtor'
                                : /trulia\.com/i.test(url)  ? 'unknown'
                                : 'unknown';
                return NextResponse.json({
                    ok: true,
                    data: {
                        source:          siteLabel,
                        url,
                        parsedBy:        'partial' as const,
                        parseWarnings:   ['Listing site blocked direct access — data extracted via Tavily'],
                        price:           tp.price,
                        address:         tp.address,
                        city:            tp.city,
                        state:           tp.state,
                        zip:             tp.zip,
                        county:          null,
                        beds:            (tp.beds  != null && tp.beds  <= 20) ? tp.beds  : null,
                        baths:           (tp.baths != null && tp.baths <= 20) ? tp.baths : null,
                        sqft:            tp.sqft,
                        annualTaxes:     (tp.price && rate) ? Math.round(tp.price * rate) : null,
                        taxRateEffective: rate,
                        taxSource:       'table' as const,
                        photoUrl:        null,
                        ...ext,
                    },
                });
            }
        }
        const err = base && !base.ok ? base : null;
        return NextResponse.json({
            ok: false,
            error: err?.error ?? 'Could not fetch listing',
            details: err && 'details' in err ? err.details : undefined,
        });
    }

    const d = base.data;

    // Parse extended fields from Tavily text (or empty string if unavailable)
    const ext = parseExtended(text ?? '', d.price, d.sqft);

    // Base scraper has authoritative status from structured data (title tag / JSON-LD).
    // Only use Tavily-parsed status when the scraper couldn't determine it.
    if (d.listingStatus) ext.listingStatus = d.listingStatus;

    return NextResponse.json({
        ok: true,
        data: {
            // Base PropertyData fields
            source:           d.source,
            url,
            parsedBy:         d.parsedBy,
            parseWarnings:    d.parseWarnings,
            price:            d.price,
            address:          d.address,
            city:             d.city,
            state:            d.state,
            zip:              d.zip,
            beds:             d.beds,
            baths:            d.baths,
            sqft:             d.sqft,
            annualTaxes:      d.annualTaxes,
            taxRateEffective: d.taxRateEffective,
            taxSource:        d.taxSource,
            photoUrl:         d.photoUrl,
            // Extended fields
            ...ext,
        },
    });
}

// ── Address handler (cache-first, then Rentcast) ────────────────────────────

async function handleAddress(rawAddress: string) {
    // Check canonical property cache first — skip Rentcast if data is fresh
    const cached = await getCachedSnapshot(rawAddress);
    if (cached) {
        console.log('[property/lookup] served from cache:', rawAddress);
        return NextResponse.json({ ok: true, data: cached, fromCache: true });
    }

    const key = process.env.RENTCAST_API_KEY;
    if (!key) {
        return NextResponse.json({
            ok: false,
            error: 'Address lookup requires a Rentcast API key. Paste the Redfin link instead for instant results.',
        });
    }

    const enc  = encodeURIComponent(rawAddress);
    const base = 'https://api.rentcast.io/v1';
    const hdrs = { 'X-Api-Key': key, 'Accept': 'application/json' };

    try {
        const [propRes, avmRes] = await Promise.allSettled([
            fetch(`${base}/properties?address=${enc}&limit=1`, { headers: hdrs }),
            fetch(`${base}/avm/value?address=${enc}`,          { headers: hdrs }),
        ]);

        const propData = propRes.status === 'fulfilled' && propRes.value.ok
            ? await propRes.value.json() : null;
        const avmData  = avmRes.status  === 'fulfilled' && avmRes.value.ok
            ? await avmRes.value.json()  : null;

        const prop = Array.isArray(propData) ? propData[0] : propData;
        if (!prop) return NextResponse.json({ ok: false, error: 'Property not found at that address.' });

        const listRes   = await fetch(`${base}/listings/sale?address=${enc}&status=Active&limit=1`, { headers: hdrs });
        const listData  = listRes.ok ? await listRes.json() : null;
        const active    = Array.isArray(listData?.listings) ? listData.listings[0] : null;

        const listingStatus  = active ? 'FOR_SALE' : 'OFF_MARKET';
        const price: number | null = active?.price ?? null;

        const rawDate       = prop.lastSaleDate ?? null;
        const lastSaleDate  = rawDate
            ? new Date(rawDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            : null;
        const lastSalePrice: number | null = prop.lastSalePrice ?? null;

        const estimatedValue:     number | null = avmData?.price         ?? null;
        const estimatedValueLow:  number | null = avmData?.priceRangeLow ?? null;
        const estimatedValueHigh: number | null = avmData?.priceRangeHigh ?? null;

        let estimatedBalance: number | null = null;
        let estimatedEquity:  number | null = null;
        let purchaseRate:     number | null = null;
        let remainingMonths:  number | null = null;

        if (listingStatus === 'OFF_MARKET' && lastSalePrice && rawDate) {
            const saleDate   = new Date(rawDate);
            const elapsed    = monthsAgo(saleDate);
            purchaseRate     = historicalRate(saleDate.getFullYear());
            estimatedBalance = Math.round(remainingBalance(lastSalePrice, 0.20, purchaseRate, elapsed));
            remainingMonths  = Math.max(60, 360 - elapsed);
            const curVal     = estimatedValue ?? lastSalePrice;
            estimatedEquity  = Math.round(curVal - estimatedBalance);
        }

        const sqft = prop.squareFootage ?? null;

        const responseData = {
            source:     'rentcast',
            url:        '',
            parsedBy:   'rentcast-api-v1',
            parseWarnings: [],
            price,
            address:    prop.formattedAddress ?? rawAddress,
            city:       prop.city      ?? null,
            state:      prop.state     ?? null,
            zip:        prop.zipCode   ?? null,
            beds:       prop.bedrooms  ?? null,
            baths:      prop.bathrooms ?? null,
            sqft,
            annualTaxes:      null,
            taxRateEffective: 0.011,
            taxSource:        'table',
            photoUrl:         null,
            listingStatus,
            daysOnMarket:     active?.daysOnMarket ?? null,
            lastSaleDate,
            lastSalePrice,
            estimatedValue,
            estimatedValueLow,
            estimatedValueHigh,
            estimatedBalance,
            estimatedEquity,
            purchaseRate,
            remainingMonths,
            hoaMonthly:  null,
            pricePerSqft: (price && sqft) ? Math.round(price / sqft) : null,
        };

        // Write to canonical property cache (non-blocking)
        void cachePropertyResult(prop.formattedAddress ?? rawAddress, responseData, 'rentcast');

        return NextResponse.json({ ok: true, data: responseData });
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: `Rentcast lookup failed: ${err.message}` });
    }
}
