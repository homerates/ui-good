// app/api/property/lookup/route.ts
// POST /api/property/lookup
// Body: { url?: string, address?: string }
//
// For URL: uses existing lib/property/fetch pipeline for base data,
//          Tavily extract for extended fields (status, last sale, equity).
// For address: Tavily search → Redfin extract → broad web search fallback.

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { fetchPropertyData } from '@/property/fetch';
import { lookupTaxRate }     from '@/property/taxTable';
import { getSupabase }       from '../../../../lib/supabaseServer';

// Cache TTL: 7 days for property snapshots
const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Normalize address for canonical lookup (lowercase, trim extra spaces)
function normalizeAddress(addr: string): string {
  return addr.trim().replace(/\s+/g, ' ').toLowerCase();
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
        confidence:              source === 'redfin' ? 0.90 : 0.65,
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
      confidence:    source === 'redfin' ? 0.90 : 0.65,
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
    // FOR_SALE requires specific signals — not just any "for sale" text which appears on all pages in nav/ads
    let listingStatus: ExtendedFields['listingStatus'] = 'UNKNOWN';
    if (/sold\s+(?:on\s+)?\w+\s+\d{1,2},?\s+\d{4}/i.test(t)   // "Sold on Feb 17, 2026"
        || /sold\s+price/i.test(t)                               // "Sold Price"
        || /\bsold\s+\w+\s+\d{4}\s+for\b/i.test(t)             // "Sold Feb 2026 for"
        || /this\s+home\s+(?:is\s+)?(?:no\s+longer\s+)?(?:sold|was\s+sold)/i.test(t))
                                                    { listingStatus = 'SOLD'; }
    else if (/off[\s-]?market/i.test(t)
        || /not\s+(?:currently\s+)?(?:for\s+sale|listed|available)/i.test(t)
        || /no\s+longer\s+(?:for\s+sale|listed|available|accepting)/i.test(t))
                                                    { listingStatus = 'OFF_MARKET'; }
    else if (/(?:^|\n|\.)\s*(?:this\s+home\s+is\s+for\s+sale|listed\s+for\s+sale|active\s+listing|price\s+reduced|new\s+listing)/i.test(t)
        || /(?:beds?|baths?|sq\s*ft)[^.]{0,60}for\s+sale/i.test(t))
                                                    { listingStatus = 'FOR_SALE'; }
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

// ── Broad real-estate search fallback (any site, not just Redfin) ──────────
// Used when findRedfinUrl returns null. Searches across Zillow, Realtor, etc.
// and extracts data from the first relevant listing page.
async function broadSearchFallback(address: string): Promise<Record<string, unknown> | null> {
    const key = process.env.TAVILY_API_KEY;
    if (!key) return null;
    const clean = cleanAddressForSearch(address);
    const RE_DOMAINS = /redfin\.com|zillow\.com|realtor\.com|trulia\.com|homes\.com|movoto\.com/i;
    try {
        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(8_000),
            body: JSON.stringify({
                api_key: key,
                query: `${clean} home sold price`,
                max_results: 5,
                search_depth: 'basic',
                include_answer: false,
            }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const reResults: any[] = (data.results ?? []).filter((r: any) => RE_DOMAINS.test(r.url ?? ''));
        if (reResults.length === 0) return null;
        // Extract full page content from the first real-estate result
        const text = await tavilyExtract(reResults[0].url);
        if (!text || text.length < 200) return null;
        const tp  = parsePropertyFromText(text);
        const ext = parseExtended(text, tp.price, tp.sqft);
        if (!tp.price && !ext.lastSalePrice && !ext.estimatedValue) return null;
        const { rate } = lookupTaxRate(tp.state ?? '', null);
        return {
            source:           'web_search',
            url:              reResults[0].url,
            parsedBy:         'tavily_fallback',
            parseWarnings:    ['Data sourced from web search — may be less precise than a direct listing'],
            price:            tp.price,
            address:          tp.address ?? clean,
            city:             tp.city,
            state:            tp.state,
            zip:              tp.zip,
            beds:             tp.beds,
            baths:            tp.baths,
            sqft:             tp.sqft,
            annualTaxes:      (tp.price && rate) ? Math.round(tp.price * rate) : null,
            taxRateEffective: rate,
            taxSource:        'table',
            photoUrl:         null,
            ...ext,
        };
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

// ── Tavily search → find Redfin URL for an address ─────────────────────────

function cleanAddressForSearch(address: string): string {
    return address
        .replace(/,?\s*USA\s*$/i, '')          // strip ", USA" suffix from Google Places
        .replace(/,?\s*United States\s*$/i, '') // strip ", United States"
        .trim();
}

async function findRedfinUrl(address: string): Promise<string | null> {
    const key = process.env.TAVILY_API_KEY;
    if (!key) return null;

    const clean = cleanAddressForSearch(address);
    // Also try short form: "Street, City, ST" without zip
    const short = clean.replace(/,\s*\d{5}(-\d{4})?/, '').trim();

    const extractRedfinUrl = (results: any[]): string | null => {
        // First pass: ideal /home/XXXXXXX listing URL
        for (const r of results) {
            const url: string = r.url ?? '';
            if (/redfin\.com\/.*\/home\/\d+/i.test(url)) return url;
        }
        // Second pass: any Redfin listing-like path, excluding known non-listing pages
        for (const r of results) {
            const url: string = r.url ?? '';
            if (!/redfin\.com/i.test(url)) continue;
            if (/\/(city|school|news|research|mortgage|blog|about|help|sitemap)\//i.test(url)) continue;
            if (/redfin\.com\/[A-Z]{2}\/[^/]+\/[^/]+-\d+\//.test(url)) return url; // state/city/street-number pattern
        }
        return null;
    };

    try {
        // Try exact cleaned address first
        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(8_000),
            body: JSON.stringify({
                api_key: key,
                query: `"${clean}" site:redfin.com`,
                max_results: 3, search_depth: 'basic', include_answer: false,
            }),
        });
        if (res.ok) {
            const data = await res.json();
            const url = extractRedfinUrl(data.results ?? []);
            if (url) return url;
        }

        // Retry with short form (no zip)
        if (short !== clean) {
            const res2 = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(6_000),
                body: JSON.stringify({
                    api_key: key,
                    query: `${short} redfin site:redfin.com`,
                    max_results: 3, search_depth: 'basic', include_answer: false,
                }),
            });
            if (res2.ok) {
                const data2 = await res2.json();
                return extractRedfinUrl(data2.results ?? []);
            }
        }
        return null;
    } catch {
        return null;
    }
}

// ── Address handler (cache-first → Redfin via Tavily → broad web search) ───

async function handleAddress(rawAddress: string) {
    const cached = await getCachedSnapshot(rawAddress);
    if (cached) {
        console.log('[property/lookup] served from cache:', rawAddress);
        return NextResponse.json({ ok: true, data: cached, fromCache: true });
    }

    const redfinUrl = await findRedfinUrl(rawAddress);
    if (redfinUrl) {
        console.log('[property/lookup] found Redfin URL via Tavily for', rawAddress);
        const result = await handleUrl(redfinUrl);
        try {
            const body = await result.clone().json();
            if (body?.ok && body?.data) {
                void cachePropertyResult(rawAddress, body.data, body.data.source ?? 'redfin_via_tavily');
            }
        } catch { /* non-blocking */ }
        return result;
    }

    console.log('[property/lookup] no Redfin URL found, trying broad search for', rawAddress);
    const broadData = await broadSearchFallback(rawAddress);
    if (broadData) {
        void cachePropertyResult(rawAddress, broadData, 'web_search');
        return NextResponse.json({ ok: true, data: broadData });
    }

    return NextResponse.json({
        ok: false,
        error: 'Could not find property data for this address. Try pasting the Redfin or Zillow link directly.',
    });
}
