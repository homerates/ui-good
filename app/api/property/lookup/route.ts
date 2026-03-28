// app/api/property/lookup/route.ts
// Resolves a Redfin/Realtor URL or plain address into structured property data.
// Returns: listing status, last sale, estimated value/equity, and seeded slider params.

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

// ── Historical 30yr fixed annual averages (FRED MORTGAGE30US) ──────────────
const HIST_RATES: Record<number, number> = {
    2025: 6.76, 2024: 6.87, 2023: 6.81, 2022: 5.34,
    2021: 2.96, 2020: 3.11, 2019: 3.94, 2018: 4.54,
    2017: 3.99, 2016: 3.65, 2015: 3.85, 2014: 4.17,
    2013: 3.98, 2012: 3.66, 2011: 4.45, 2010: 4.69,
};

function historicalRate(year: number): number {
    return HIST_RATES[year] ?? 5.5;
}

/** Amortizing balance after monthsElapsed payments. Assumes 20% down. */
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

/** Parse "May 2025", "JANUARY 2023" → Date */
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

// ── Main handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
    try {
        const body = await req.json();
        if (body.url) return handleUrl(String(body.url));
        if (body.address) return handleAddress(String(body.address));
        return NextResponse.json({ ok: false, error: 'url or address required' }, { status: 400 });
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}

// ── URL-based scraper (Redfin / Realtor.com) ────────────────────────────────

async function handleUrl(rawUrl: string) {
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const warnings: string[] = [];

    // Detect source
    const source = /redfin\.com/i.test(url) ? 'redfin'
        : /realtor\.com/i.test(url) ? 'realtor'
        : /trulia\.com/i.test(url) ? 'trulia'
        : /homes\.com/i.test(url) ? 'homes'
        : 'unknown';

    // ── Step 1: Try Tavily extract (bypasses anti-bot better than direct fetch) ──
    let pageText = '';
    let photoUrl: string | null = null;

    const tavilyKey = process.env.TAVILY_API_KEY;
    if (tavilyKey) {
        try {
            const tvRes = await fetch('https://api.tavily.com/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: tavilyKey,
                    urls: [url],
                    include_images: true,
                }),
                signal: AbortSignal.timeout(15000),
            });
            if (tvRes.ok) {
                const tvJson = await tvRes.json();
                const result = tvJson?.results?.[0];
                if (result?.raw_content) {
                    pageText = result.raw_content as string;
                    photoUrl = result.images?.[0] ?? null;
                }
            }
        } catch { /* fall through to direct fetch */ }
    }

    // ── Step 2: Direct fetch fallback ──────────────────────────────────────
    if (!pageText) {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
                signal: AbortSignal.timeout(12000),
            });
            if (res.ok) {
                const html = await res.text();
                pageText = html;

                // Extract photo from OG meta
                if (!photoUrl) {
                    const ogImg = html.match(/<meta[^>]+(?:property|name)="og:image"[^>]+content="([^"]+)"/i)
                        ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+(?:property|name)="og:image"/i);
                    if (ogImg) photoUrl = ogImg[1];
                }
            }
        } catch (err: any) {
            return NextResponse.json({ ok: false, error: `Could not fetch listing: ${err.message}` });
        }
    }

    if (!pageText) {
        return NextResponse.json({ ok: false, error: 'Could not retrieve listing content.' });
    }

    // Limit to 150KB for parsing
    const text = pageText.slice(0, 150_000);

    // ── Parse listing status ───────────────────────────────────────────────
    let listingStatus: 'FOR_SALE' | 'OFF_MARKET' | 'PENDING' | 'SOLD' | 'UNKNOWN' = 'UNKNOWN';
    if (/off[\s-]?market/i.test(text))            listingStatus = 'OFF_MARKET';
    else if (/\bpending\b/i.test(text))           listingStatus = 'PENDING';
    else if (/for[\s-]?sale/i.test(text))         listingStatus = 'FOR_SALE';
    else if (/\bsold\b/i.test(text))              listingStatus = 'SOLD';

    // ── Parse price ────────────────────────────────────────────────────────
    let price: number | null = null;

    // JSON-LD offers.price
    for (const m of text.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
        try {
            const ld = JSON.parse(m[1]);
            const p = ld?.offers?.price ?? ld?.Offer?.price ?? ld?.price;
            if (p) {
                const n = parseFloat(String(p).replace(/[,$]/g, ''));
                if (n > 10_000) { price = n; break; }
            }
        } catch { /* continue */ }
    }

    // Fallback: OG description patterns
    if (!price) {
        const ogDesc = text.match(/<meta[^>]+(?:property|name)="og:description"[^>]+content="([^"]+)"/i)?.[1]
            ?? text.match(/<meta[^>]+content="([^"]+)"[^>]+(?:property|name)="og:description"/i)?.[1]
            ?? '';
        const ogTitle = text.match(/<meta[^>]+(?:property|name)="og:title"[^>]+content="([^"]+)"/i)?.[1] ?? '';

        for (const src of [ogDesc, ogTitle, text.slice(0, 3000)]) {
            const m = src.match(/\$\s*([\d,]+)(?:\s*(?:beds?|ba|sq|sqft|,|\s*[-–]))/i)
                ?? src.match(/(?:listed|price|asking)[:\s]+\$?([\d,]+)/i);
            if (m) {
                const n = parseInt(m[1].replace(/,/g, ''));
                if (n > 10_000) { price = n; break; }
            }
        }
    }

    // Plain text price: "Sold May 2025 for $2,150,000" — pick up the sale price if no list price
    // (handled below in last-sale parsing, merged afterwards)

    // ── Parse beds / baths / sqft ──────────────────────────────────────────
    const snippet = text.slice(0, 10_000);
    const bedsM  = snippet.match(/(\d+)\s*(?:bed|br|bd)\b/i);
    const bathsM = snippet.match(/(\d+(?:[.,]\d+)?)\s*(?:bath|ba)\b/i);
    const sqftM  = snippet.match(/([\d,]+)\s*(?:sq\.?\s*ft|sqft|square[\s-]?feet)/i);

    const beds  = bedsM  ? parseInt(bedsM[1])                          : null;
    const baths = bathsM ? parseFloat(bathsM[1].replace(',', '.'))     : null;
    const sqft  = sqftM  ? parseInt(sqftM[1].replace(/,/g, ''))        : null;

    // ── Parse address ──────────────────────────────────────────────────────
    let address: string | null = null;
    let city: string | null = null;
    let state: string | null = null;
    let zip: string | null = null;

    for (const m of text.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
        try {
            const ld = JSON.parse(m[1]);
            const addr = ld?.address ?? ld?.location?.address;
            if (addr?.streetAddress) {
                address = addr.streetAddress;
                city    = addr.addressLocality ?? null;
                state   = addr.addressRegion   ?? null;
                zip     = addr.postalCode       ?? null;
                break;
            }
        } catch { /* continue */ }
    }

    // Redfin URL fallback: /CA/Trabuco-Canyon/8-Peachtree-92679/home/5019838
    if (!address && source === 'redfin') {
        try {
            const parts = new URL(url).pathname.split('/').filter(Boolean);
            if (parts.length >= 3) {
                state = parts[0] ?? null;
                city  = parts[1]?.replace(/-/g, ' ') ?? null;
                const seg = parts[2] ?? '';
                const zipM = seg.match(/(\d{5})$/);
                if (zipM) {
                    zip     = zipM[1];
                    address = seg.replace(/-\d{5}$/, '').replace(/-/g, ' ');
                } else {
                    address = seg.replace(/-/g, ' ');
                }
            }
        } catch { /* ignore */ }
    }

    // ── Last sale ──────────────────────────────────────────────────────────
    let lastSaleDate:  string | null = null;
    let lastSalePrice: number | null = null;

    // "Sold May 2025 for $2,150,000" or "SOLD MAY 2025 FOR $2,150,000"
    const soldM = text.match(/sold\s+([A-Za-z]+\s+\d{4})\s+for\s+\$?([\d,]+)/i);
    if (soldM) {
        lastSaleDate  = soldM[1];
        lastSalePrice = parseInt(soldM[2].replace(/,/g, ''));
        // If no list price found, use sale price for off-market properties
        if (!price && listingStatus === 'OFF_MARKET') price = lastSalePrice;
    }

    // "Last sold: May 2025 · $2,150,000"
    if (!lastSaleDate) {
        const lsM = text.match(/last\s+sold[:\s]+([A-Za-z]+\s+\d{4})[^$\d]*\$?([\d,]+)/i);
        if (lsM) {
            lastSaleDate  = lsM[1];
            lastSalePrice = parseInt(lsM[2].replace(/,/g, ''));
        }
    }

    // ── Days on market ─────────────────────────────────────────────────────
    let daysOnMarket: number | null = null;
    const domM = text.match(/(\d+)\s+days?\s+on\s+(?:redfin|market|zillow|trulia)/i)
        ?? text.match(/days\s+on\s+(?:redfin|market)[:\s]+(\d+)/i);
    if (domM) daysOnMarket = parseInt(domM[1]);

    // ── HOA ───────────────────────────────────────────────────────────────
    let hoaMonthly: number | null = null;
    const hoaM = text.match(/hoa(?:\s+(?:fees?|dues?))?[:\s]+\$?([\d,]+)\s*\/?\s*mo/i)
        ?? text.match(/\$?([\d,]+)\s*\/\s*mo(?:nth)?\s+hoa/i);
    if (hoaM) hoaMonthly = parseInt(hoaM[1].replace(/,/g, ''));

    // ── Estimated value (Redfin Estimate) ─────────────────────────────────
    let estimatedValue: number | null = null;
    const evM = text.match(/(?:redfin\s+estimate|redfin\s+estimated?\s+(?:value|sale\s+price)|estimated\s+(?:sale\s+)?price|zestimate)[:\s$]+([\d,]+)/i);
    if (evM) estimatedValue = parseInt(evM[1].replace(/,/g, ''));

    // Range: "$2.19M – $2.65M"
    let estimatedValueLow: number | null = null;
    let estimatedValueHigh: number | null = null;
    const rangeM = text.match(/\$\s*([\d.]+)M?\s*[–\-—to]+\s*\$\s*([\d.]+)M/i);
    if (rangeM) {
        const lo = parseFloat(rangeM[1]);
        const hi = parseFloat(rangeM[2]);
        if (lo < hi && lo > 0) {
            estimatedValueLow  = Math.round(lo * 1_000_000);
            estimatedValueHigh = Math.round(hi * 1_000_000);
            if (!estimatedValue) estimatedValue = Math.round((lo + hi) / 2 * 1_000_000);
        }
    }

    // ── Refi fields for off-market ─────────────────────────────────────────
    let estimatedBalance:  number | null = null;
    let estimatedEquity:   number | null = null;
    let purchaseRate:      number | null = null;
    let remainingMonths:   number | null = null;

    if ((listingStatus === 'OFF_MARKET' || listingStatus === 'SOLD') && lastSalePrice && lastSaleDate) {
        const saleDate = parseMonthYear(lastSaleDate);
        if (saleDate) {
            const elapsed = monthsAgo(saleDate);
            purchaseRate     = historicalRate(saleDate.getFullYear());
            estimatedBalance = Math.round(remainingBalance(lastSalePrice, 0.20, purchaseRate, elapsed));
            remainingMonths  = Math.max(60, 360 - elapsed);
            const curVal     = estimatedValue ?? Math.round(lastSalePrice * 1.05);
            estimatedEquity  = Math.round(curVal - estimatedBalance);
        }
    }

    // ── Tax estimate ───────────────────────────────────────────────────────
    const refPrice      = price ?? lastSalePrice;
    const annualTaxes   = refPrice ? Math.round(refPrice * 0.011) : null;
    const taxRateEff    = 0.011;
    const pricePerSqft  = (price && sqft) ? Math.round(price / sqft) : null;

    if (!price && !beds && !address) {
        return NextResponse.json({
            ok: false,
            error: 'Could not extract property details from this listing. Try pasting the address directly.',
            details: `source=${source}`,
        });
    }

    return NextResponse.json({
        ok: true,
        data: {
            // Core PropertyCardData fields
            source,
            url,
            parsedBy:    'html-scraper-v1',
            parseWarnings: warnings,
            price,
            address:   address ? [address, city, state, zip].filter(Boolean).join(', ').replace(/,\s*,/g, ',') : null,
            city,
            state,
            zip,
            beds,
            baths,
            sqft,
            annualTaxes,
            taxRateEffective: taxRateEff,
            taxSource:   'table',
            photoUrl,
            // Extended
            listingStatus,
            daysOnMarket,
            lastSaleDate,
            lastSalePrice,
            estimatedValue,
            estimatedValueLow,
            estimatedValueHigh,
            estimatedBalance,
            estimatedEquity,
            purchaseRate,
            remainingMonths,
            hoaMonthly,
            pricePerSqft,
        },
    });
}

// ── Address-based lookup via Rentcast ───────────────────────────────────────

async function handleAddress(rawAddress: string) {
    const key = process.env.RENTCAST_API_KEY;
    if (!key) {
        return NextResponse.json({
            ok: false,
            error: 'Address lookup requires a Rentcast API key (RENTCAST_API_KEY). Add a Redfin link instead for instant results.',
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

        // Check active listing
        const listRes  = await fetch(`${base}/listings/sale?address=${enc}&status=Active&limit=1`, { headers: hdrs });
        const listData = listRes.ok ? await listRes.json() : null;
        const activeListing = Array.isArray(listData?.listings) ? listData.listings[0] : null;

        const listingStatus  = activeListing ? 'FOR_SALE' : 'OFF_MARKET';
        const price: number | null = activeListing?.price ?? null;

        // Last sale
        const rawDate    = prop.lastSaleDate ?? null;
        const lastSaleDate  = rawDate
            ? new Date(rawDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            : null;
        const lastSalePrice: number | null = prop.lastSalePrice ?? null;

        // AVM
        const estimatedValue:     number | null = avmData?.price         ?? null;
        const estimatedValueLow:  number | null = avmData?.priceRangeLow ?? null;
        const estimatedValueHigh: number | null = avmData?.priceRangeHigh ?? null;

        // Refi calcs
        let estimatedBalance:  number | null = null;
        let estimatedEquity:   number | null = null;
        let purchaseRate:      number | null = null;
        let remainingMonths:   number | null = null;

        if (listingStatus === 'OFF_MARKET' && lastSalePrice && rawDate) {
            const saleDate = new Date(rawDate);
            const elapsed  = monthsAgo(saleDate);
            purchaseRate     = historicalRate(saleDate.getFullYear());
            estimatedBalance = Math.round(remainingBalance(lastSalePrice, 0.20, purchaseRate, elapsed));
            remainingMonths  = Math.max(60, 360 - elapsed);
            const curVal     = estimatedValue ?? lastSalePrice;
            estimatedEquity  = Math.round(curVal - estimatedBalance);
        }

        return NextResponse.json({
            ok: true,
            data: {
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
                sqft:       prop.squareFootage ?? null,
                annualTaxes: null,
                taxRateEffective: 0.011,
                taxSource:  'table',
                photoUrl:   null,
                listingStatus,
                daysOnMarket:   activeListing?.daysOnMarket ?? null,
                lastSaleDate,
                lastSalePrice,
                estimatedValue,
                estimatedValueLow,
                estimatedValueHigh,
                estimatedBalance,
                estimatedEquity,
                purchaseRate,
                remainingMonths,
                hoaMonthly: null,
                pricePerSqft: (price && prop.squareFootage) ? Math.round(price / prop.squareFootage) : null,
            },
        });
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: `Rentcast lookup failed: ${err.message}` });
    }
}
