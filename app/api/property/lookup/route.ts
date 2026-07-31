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
import { log }               from '../../../../lib/logger';
import { isPlausibleSaleYear } from '../../../../lib/dateSanity';
import { historicalRate, remainingBalance, monthsAgo, fhfaRate } from '../../../../lib/homeownerCalc';
import { computeAvmTier } from '../../../../lib/propertyAvm';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';

// Cache TTL: 7 days for active listings (not cached anyway), 24h for SOLD/OFF_MARKET
const SNAPSHOT_TTL_MS      = 7 * 24 * 60 * 60 * 1000;
const SOLD_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

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
    const status    = (data.listingStatus as string | null) ?? null;
    const ttl       = (status === 'SOLD' || status === 'OFF_MARKET') ? SOLD_SNAPSHOT_TTL_MS : SNAPSHOT_TTL_MS;
    const expiresAt = new Date(now.getTime() + ttl).toISOString();

    // Build upsert object — only include value/sale fields when non-null so
    // re-lookups that miss the estimate don't wipe a previously stored value.
    const estimatedValue  = (data.estimatedValue  as number | null) ?? null;
    const lastSalePrice   = (data.lastSalePrice   as number | null) ?? null;
    const lastSaleDate    = (data.lastSaleDate    as string | null) ?? null;
    const upsertRow: Record<string, unknown> = {
        address_full:          addressFull,
        address_line:          (data.address as string | null) ?? null,
        city:                  (data.city    as string | null) ?? null,
        state:                 (data.state   as string | null) ?? null,
        zip:                   (data.zip     as string | null) ?? null,
        beds:                  (data.beds    as number | null) ?? null,
        baths:                 (data.baths   as number | null) ?? null,
        sqft:                  (data.sqft    as number | null) ?? null,
        latest_listing_status: (data.listingStatus as string | null) ?? null,
        latest_rent:           (data.rentEstimate  as number | null) ?? null,
        enriched_at:           now.toISOString(),
        enrichment_source:     source,
        confidence:            source === 'redfin' ? 0.90 : 0.65,
        updated_at:            now.toISOString(),
    };
    // Only overwrite AVM / sale fields when we actually have a value —
    // prevents nulling out a previously captured Redfin Estimate on re-lookup.
    if (estimatedValue != null)                              upsertRow.latest_value       = estimatedValue;
    if ((data.estimatedValueLow  as number | null) != null) upsertRow.latest_value_low   = data.estimatedValueLow;
    if ((data.estimatedValueHigh as number | null) != null) upsertRow.latest_value_high  = data.estimatedValueHigh;
    if (lastSalePrice != null)                              upsertRow.latest_last_sale_price = lastSalePrice;
    if (lastSaleDate  != null)                              upsertRow.latest_last_sale_date  = lastSaleDate;

    // Upsert canonical property record
    const { data: prop } = await sb
      .from('properties')
      .upsert(upsertRow, { onConflict: 'address_full' })
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
  } catch (e: unknown) {
    log.warn('[PropertyLookup] Cache write failed (non-fatal)', { address: normalizeAddress(address), error: (e as Error)?.message });
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
      .select('id, enriched_at, latest_listing_status')
      .eq('address_full', addressFull)
      .maybeSingle();
    if (!prop?.id || !prop.enriched_at) return null;

    // Always re-fetch live data for active listings — status can change daily
    const status = prop.latest_listing_status as string | null;
    if (!status || status === 'FOR_SALE' || status === 'PENDING') return null;

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

    const data = (snap?.data as Record<string, unknown>) ?? null;
    // Cross-pipeline cache incompatibility guard (symmetric to the one in
    // app/api/homeowner/analysis/route.ts's getSnapshot): /api/homeowner/analysis writes to
    // this SAME property_snapshots table under a DIFFERENT field shape — its current-value
    // field is `estimatedValue`, not `price`. If the latest snapshot for this property was
    // written by that other pipeline, `price` comes back undefined and this whole response
    // (consumed directly by /chat's "Run My Numbers" card and /property-intel's Grok facts)
    // would silently show a blank price. Treat a missing price as a cache miss instead.
    if (data && data.price == null) return null;
    return data;
  } catch (e: unknown) {
    log.warn('[PropertyLookup] Cache read failed', { address: normalizeAddress(address), error: (e as Error)?.message });
    return null;
  }
}

// historicalRate, remainingBalance, and monthsAgo now live in lib/homeownerCalc.ts —
// this file used to carry its own independent copies (same formulas, but a rate table that
// stopped at 2000 instead of homeownerCalc's 1990). Consolidated as part of the shared-core
// audit between this pipeline and app/api/homeowner/analysis/route.ts.

// Bounded via isPlausibleSaleYear (lib/dateSanity.ts) — a sale can never be in the future.
// Without this, a real month name (passing MONTH_RE upstream) immediately followed in source
// text by an unrelated 4-digit number — e.g. this property's own house number, "2420 County
// Down Dr" — parses as a valid Date centuries out; see the parseFlexDate fix in
// app/api/homeowner/analysis/route.ts and parseFlexDateClient in my-home/page.tsx for the
// same defect on the same failure mode.
function parseMonthYear(str: string): Date | null {
    const m = str.match(/([A-Za-z]+)\s+(\d{4})/);
    if (!m) return null;
    const months: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const mo = months[m[1].toLowerCase().slice(0, 3)];
    if (mo === undefined) return null;
    const yr = parseInt(m[2]);
    if (!isPlausibleSaleYear(yr)) return null;
    return new Date(yr, mo, 1);
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

    // Listing status detection — priority order matters.
    // Key insight: "Sold Price" appears in the sale HISTORY of every Redfin page (active or not),
    // so it cannot be used as a primary SOLD signal. Active FOR_SALE pages also contain
    // "for sale" in nav/ads globally, so we check the first ~3000 chars for that signal.
    // Order: unambiguous SOLD → active FOR_SALE (top-of-page) → off-market → pending → broad fallbacks.
    let listingStatus: ExtendedFields['listingStatus'] = 'UNKNOWN';

    // 1. Unambiguous SOLD — date-specific patterns that only appear on truly-sold pages
    if (/sold\s+(?:on\s+)?\w+\s+\d{1,2},?\s+\d{4}/i.test(t)    // "Sold on Feb 17, 2026"
        || /\bsold\s+\w+\s+\d{4}\s+for\b/i.test(t)              // "Sold Feb 2026 for"
        || /this\s+home\s+(?:is\s+)?(?:no\s+longer\s+)?(?:sold|was\s+sold)/i.test(t))
                                                    { listingStatus = 'SOLD'; }

    // 2. Active FOR_SALE — check before broad SOLD fallback; "for sale" in first 3000 chars
    //    is the listing badge/header, not a nav link (which appears further down)
    else if (/(?:^|\n|\.)\s*(?:this\s+home\s+is\s+for\s+sale|listed\s+for\s+sale|active\s+listing|price\s+reduced|new\s+listing)/i.test(t)
        || /(?:beds?|baths?|sq\s*ft)[^.]{0,60}for\s+sale/i.test(t)
        || /\bstatus[:\s]+active\b/i.test(t)
        || /\bfor\s+sale\b/i.test(t.slice(0, 3000)))
                                                    { listingStatus = 'FOR_SALE'; }

    // 3. Off-market
    else if (/off[\s-]?market/i.test(t)
        || /not\s+(?:currently\s+)?(?:for\s+sale|listed|available)/i.test(t)
        || /no\s+longer\s+(?:for\s+sale|listed|available|accepting)/i.test(t))
                                                    { listingStatus = 'OFF_MARKET'; }

    // 4. Pending — after FOR_SALE so "pending" in history of active listings doesn't win
    else if (/\bpending\b/i.test(t))               { listingStatus = 'PENDING'; }

    // 5. Broad SOLD fallback — "Sold Price" label or any "sold" text (only reaches here if no active signals above)
    else if (/\bsold\s+price\b/i.test(t) || /\bsold\b/i.test(t)) { listingStatus = 'SOLD'; }

    // Days on market — match days or hours ("6 hours on Redfin" → 0 days)
    const domM = t.match(/(\d+)\s+days?\s+on\s+(?:redfin|market|zillow|trulia)/i)
        ?? t.match(/days\s+on\s+(?:redfin|market)[:\s]+(\d+)/i);
    const domHours = !domM ? t.match(/(\d+)\s+hours?\s+on\s+(?:redfin|market)/i) : null;
    const daysOnMarket = domM ? parseInt(domM[1]) : domHours ? 0 : null;

    // Refine UNKNOWN with daysOnMarket (computed above) — days on market = active listing
    if (listingStatus === 'UNKNOWN' && daysOnMarket !== null) {
        listingStatus = 'FOR_SALE';
    }

    // Last sale — multiple formats:
    //  "Sold May 2025 for $2,150,000"
    //  "SOLD ON FEB 17, 2026\n$1,250,000 Sold Price"
    //  "Last sold: May 2024 · $1,200,000"
    let lastSaleDate: string | null = null;
    let lastSalePrice: number | null = null;
    // Helper: parse "$X", "$X,XXX", "$1.2M", "$980K" → integer dollars
    const parseMoney = (s: string | null | undefined): number | null => {
        if (!s) return null;
        const m = s.replace(/[$,]/g, '').match(/^([\d.]+)\s*([KkMm]?)$/);
        if (!m) return null;
        const raw = parseFloat(m[1]);
        const suf = m[2].toUpperCase();
        const val = suf === 'M' ? Math.round(raw * 1_000_000)
                  : suf === 'K' ? Math.round(raw * 1_000)
                  : Math.round(raw);
        return val > 10_000 ? val : null;
    };

    // Month alternation — rejects prepositions like "in"/"on" that Redfin uses in "Sold in 2026 for $X"
    const MONTH_RE = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

    const soldM =
        // "Sold May 2025 for $2,150,000"
        t.match(new RegExp(`sold\\s+(${MONTH_RE}\\s+\\d{4})\\s+for\\s+\\$?([\\d,]+(?:\\.\\d+)?[KkMm]?)`, 'i'))
        // "Sold May 2025 $2,150,000" (no "for") or "Sold • May 2025 $2,150,000"
        ?? t.match(new RegExp(`sold\\s+[•·\\-–]?\\s*(${MONTH_RE}\\s+\\d{4})[^$\\d]*\\$?([\\d,]+(?:\\.\\d+)?[KkMm]?)`, 'i'))
        // "Last sold: May 2024 · $1,200,000"
        ?? t.match(/last\s+sold[:\s]+([A-Za-z]+\s+\d{4})[^$\d]*\$?([\d,]+(?:\.\d+)?[KkMm]?)/i)
        // "SOLD ON FEB 17, 2026" then nearby "$1,250,000 Sold Price"
        ?? (() => {
            const dateM = t.match(/sold\s+on\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
            const priceM = t.match(/\$([\d,]+(?:\.\d+)?[KkMm]?)\s+sold\s+price/i) ?? t.match(/sold\s+price[:\s]+\$?([\d,]+(?:\.\d+)?[KkMm]?)/i);
            if (dateM && priceM) {
                const d = new Date(dateM[1]);
                const label = isNaN(d.getTime()) ? dateM[1] : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                return [null, label, priceM[1]] as unknown as RegExpMatchArray;
            }
            return null;
        })()
        // "$932,000 Sold Sep 2020" (price before date)
        ?? (() => {
            const m = t.match(/\$([\d,]+(?:\.\d+)?[KkMm]?)\s+sold\s+([A-Za-z]+\s+\d{4})/i);
            return m ? [null, m[2], m[1]] as unknown as RegExpMatchArray : null;
        })();
    if (soldM) {
        lastSaleDate  = soldM[1] ?? null;
        lastSalePrice = parseMoney(soldM[2]);
    }

    // HOA
    const hoaM = t.match(/hoa(?:\s+(?:fees?|dues?))?[:\s]+\$?([\d,]+)\s*\/?\s*mo/i)
        ?? t.match(/\$?([\d,]+)\s*\/\s*mo(?:nth)?\s+hoa/i);
    const hoaMonthly = hoaM ? parseInt(hoaM[1].replace(/,/g, '')) : null;

    // Estimated value — Redfin Estimate section. Handles $980K and $1.2M formats.
    let estimatedValue: number | null = null;
    const evRaw = t.match(/(?:redfin\s+estimate|estimated?\s+(?:sale\s+)?(?:value|price)|zestimate)[:\s$]*([\d,]+(?:\.\d+)?)\s*([KkMm]?)/i)
      ?? t.match(/\$?([\d,]+(?:\.\d+)?)\s*([KkMm]?)\s+Est\.\s+refi\s+payment/i);
    if (evRaw) estimatedValue = parseMoney(`${evRaw[1]}${evRaw[2] ?? ''}`);

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

    // Sanitize the raw captured string, not just the parsed Date used for balance math above —
    // without this, an implausible date (e.g. "January 2420", the FHFA branch above already
    // rejects) still flows out to the API response and gets displayed as-is / injected into the
    // Grok property-intel prompt as a "verified fact".
    if (lastSaleDate && !parseMonthYear(lastSaleDate)) lastSaleDate = null;

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

// ── GPT-4o structured extraction ────────────────────────────────────────────

interface GPT4oPropertyFields {
    beds?: number | null;
    baths?: number | null;
    sqft?: number | null;
    lotSqft?: number | null;
    yearBuilt?: number | null;
    // redfinEstimate: CURRENT Redfin Estimate AVM (today's value, "Redfin Estimate" section)
    // estimatedValue: alias — only for backwards-compat with existing consumers
    // lastSalePrice:  HISTORICAL sold price (past transaction, different number)
    redfinEstimate?: number | null;
    estimatedValue?: number | null;
    lastSalePrice?: number | null;
    lastSaleDate?: string | null;
    listingStatus?: 'FOR_SALE' | 'OFF_MARKET' | 'PENDING' | 'SOLD' | 'UNKNOWN' | null;
    listPrice?: number | null;
    hoaMonthly?: number | null;
    propertyType?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    taxAssessedValue?: number | null;
    daysOnMarket?: number | null;
    // Social proof fields — engagement signals from Zillow/Redfin
    zillowViews?: number | null;
    zillowSaves?: number | null;
    zillowDaysOnMarket?: number | null;
    redfinViews?: string | null;    // e.g. "Top 10% of similar homes"
    redfinSaves?: number | null;
}

async function gpt4oExtract(text: string, url: string): Promise<GPT4oPropertyFields | null> {
    if (!OPENAI_API_KEY || text.length < 100) return null;
    try {
        const snippet = text.slice(0, 12_000);
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
            body: JSON.stringify({
                model: 'gpt-4o',
                temperature: 0,
                max_tokens: 400,
                response_format: { type: 'json_object' },
                messages: [
                    {
                        role: 'system',
                        content: `Extract real estate property fields from this Redfin page. Return only JSON. Use null for missing fields. Numbers not strings. Dates as "YYYY-MM-DD".

CRITICAL — Redfin pages show TWO dollar amounts that must NOT be confused:
- lastSalePrice: the HISTORICAL sold/sale price labeled "Sold Price" or next to "SOLD ON [date]". Past transaction.
- redfinEstimate: the CURRENT Redfin Estimate AVM in its own "Redfin Estimate" section. Today's value, usually higher than sold price on rising markets.
- estimatedValue: same as redfinEstimate (alias for compatibility).

listingStatus: SOLD if "SOLD ON [date]" or "Sold Price" present, FOR_SALE if active listing, OFF_MARKET if no active listing, PENDING if under contract, UNKNOWN otherwise.

Fields: beds, baths, sqft, lotSqft, yearBuilt, redfinEstimate, estimatedValue, lastSalePrice, lastSaleDate, listingStatus, listPrice, hoaMonthly, propertyType, address, city, state (2-letter), zip, taxAssessedValue, daysOnMarket (number of days listed — if shown as hours use 0), zillowViews (integer — look for "X views" near Zestimate), zillowSaves (integer — look for "X saves" or "X people saved"), zillowDaysOnMarket (integer — Zillow's own DOM if visible), redfinViews (string — e.g. "Top 10% of similar homes" if shown), redfinSaves (integer — Redfin saves count if visible)`,
                    },
                    { role: 'user', content: `URL: ${url}\n\nPage text:\n${snippet}` },
                ],
            }),
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return null;
        const json = await res.json();
        const raw = json?.choices?.[0]?.message?.content;
        if (!raw) return null;
        return JSON.parse(raw) as GPT4oPropertyFields;
    } catch (e: unknown) {
        log.warn('[PropertyLookup] GPT-4o extraction failed', { error: (e as Error)?.message });
        return null;
    }
}

// Merge GPT-4o fields into a data object — only fills nulls, never overwrites.
// Special case: GPT's redfinEstimate maps to estimatedValue (the regex parser already
// correctly extracts estimatedValue from Redfin text, so GPT only fills it as a backup).
function mergeGpt4o(base: Record<string, unknown>, gpt: GPT4oPropertyFields | null): Record<string, unknown> {
    if (!gpt) return base;
    const out = { ...base };
    // Bridge: if regex missed estimatedValue but GPT found redfinEstimate, use it
    if (out.estimatedValue == null && gpt.redfinEstimate != null) {
        out.estimatedValue = gpt.redfinEstimate;
    }
    for (const [k, v] of Object.entries(gpt)) {
        if (v != null && (out[k] == null || out[k] === undefined)) {
            out[k] = v;
        }
    }
    return out;
}

// ── Tavily extract helper ───────────────────────────────────────────────────

interface TavilyExtractResult { content: string | null; imageUrl: string | null; }

// Pick the first Redfin CDN photo from a Tavily images array.
// Hard rule: only ssl.cdn-redfin.com images are accepted — no other sources.
function pickPropertyPhoto(images: string[]): string | null {
    for (const u of images) {
        if (u.startsWith('https://ssl.cdn-redfin.com/')) return u;
    }
    return null;
}

async function tavilyExtract(url: string): Promise<TavilyExtractResult> {
    const key = process.env.TAVILY_API_KEY;
    if (!key) return { content: null, imageUrl: null };
    try {
        const res = await fetch('https://api.tavily.com/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: key, urls: [url] }),
            signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) return { content: null, imageUrl: null };
        const json = await res.json();
        const content  = (json?.results?.[0]?.raw_content as string) ?? null;
        const imageUrl = pickPropertyPhoto((json?.results?.[0]?.images as string[]) ?? []);
        return { content, imageUrl };
    } catch (e: unknown) {
        log.warn('[PropertyLookup] Tavily raw extract failed', { error: (e as Error)?.message });
        return { content: null, imageUrl: null };
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
        const firstUrl = reResults[0].url;
        const { content: text, imageUrl: broadPhotoUrl } = await tavilyExtract(firstUrl);
        if (!text || text.length < 200) return null;
        const tp  = parsePropertyFromText(text);
        const ext = parseExtended(text, tp.price, tp.sqft);
        if (!tp.price && !ext.lastSalePrice && !ext.estimatedValue) return null;
        const gpt = await gpt4oExtract(text, firstUrl);
        const { rate } = lookupTaxRate((gpt?.state ?? tp.state) ?? '', null);
        const base: Record<string, unknown> = {
            source:           'web_search',
            url:              firstUrl,
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
            photoUrl:         broadPhotoUrl ?? null,
            ...ext,
        };
        return mergeGpt4o(base, gpt);
    } catch (e: unknown) {
        log.warn('[PropertyLookup] Broad search scrape failed', { error: (e as Error)?.message });
        return null;
    }
}

// ── Snippet-first price rescue ───────────────────────────────────────────────
// Used by the URL path when the listing page blocks its price per-request.
// Search snippets ("…listed at $2,150,000…") usually carry the price without
// needing any page fetch — and the page fetch would just re-hit the blocked URL.
async function rescuePriceViaSearch(
    address: string,
    excludeUrl?: string,
): Promise<{ price: number | null; estimatedValue: number | null } | null> {
    const key = process.env.TAVILY_API_KEY;
    if (!key) return null;
    const clean = cleanAddressForSearch(address);
    const RE_DOMAINS = /redfin\.com|zillow\.com|realtor\.com|trulia\.com|homes\.com|movoto\.com/i;
    const streetNum = clean.match(/^(\d+)\b/)?.[1] ?? null;
    try {
        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(8_000),
            body: JSON.stringify({
                api_key: key,
                query: `${clean} listing price`,
                max_results: 6,
                search_depth: 'basic',
                include_answer: false,
            }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        // Same-property guard: only results that mention this street number
        const reResults: any[] = (data.results ?? [])
            .filter((r: any) => RE_DOMAINS.test(r.url ?? ''))
            .filter((r: any) => !streetNum || new RegExp(`\\b${streetNum}\\b`).test(`${r.title ?? ''} ${r.content ?? ''} ${r.url ?? ''}`));
        if (reResults.length === 0) return null;

        // 1. Parse price straight from snippets (no page fetch)
        const snippetText = reResults.map((r: any) => `${r.title ?? ''}\n${r.content ?? ''}`).join('\n\n');
        const sp = parsePropertyFromText(snippetText);
        const spExt = parseExtended(snippetText, sp.price, sp.sqft);
        if (sp.price || spExt.estimatedValue) {
            return { price: sp.price ?? null, estimatedValue: (spExt.estimatedValue as number | null) ?? null };
        }

        // 2. Page-extract fallback — skip the URL that already failed
        for (const r of reResults.slice(0, 3)) {
            const candUrl = String(r.url ?? '');
            if (excludeUrl && candUrl.replace(/\/+$/, '') === excludeUrl.replace(/\/+$/, '')) continue;
            const { content: text } = await tavilyExtract(candUrl);
            if (!text || text.length < 200) continue;
            const tp  = parsePropertyFromText(text);
            const ext = parseExtended(text, tp.price, tp.sqft);
            if (tp.price || ext.estimatedValue) {
                return { price: tp.price ?? null, estimatedValue: (ext.estimatedValue as number | null) ?? null };
            }
        }
        return null;
    } catch (e: unknown) {
        log.warn('[PropertyLookup] Snippet price rescue failed', { error: (e as Error)?.message });
        return null;
    }
}

// Parse a human-readable address from a Redfin URL slug when the HTML scraper
// returns null — prevents the raw URL from being shown as the property address.
// e.g. redfin.com/CA/Trabuco-Canyon/8-Peachtree-92679/home/5019838
//   → "8 Peachtree, Trabuco Canyon, CA 92679"
function addressFromRedfinUrl(url: string): string | null {
    // Slug ends with -ZIPCODE before /home/
    const m = url.match(/redfin\.com\/([A-Z]{2})\/([^/]+)\/(.+?)-(\d{5})(?:\/|$)/i);
    if (m) {
        const street = m[3].replace(/-/g, ' ');
        const city   = m[2].replace(/-/g, ' ');
        return `${street}, ${city}, ${m[1].toUpperCase()} ${m[4]}`;
    }
    // Fallback: no zip in slug (less common)
    const m2 = url.match(/redfin\.com\/([A-Z]{2})\/([^/]+)\/(\d[^/]+)(?:\/home\/\d+)?/i);
    if (!m2) return null;
    return `${m2[3].replace(/-/g, ' ')}, ${m2[2].replace(/-/g, ' ')}, ${m2[1].toUpperCase()}`;
}

// ── Single-authority ZIP resolver ─────────────────────────────────────────────
// Priority: text scraper > GPT-4o extract > Redfin URL slug.
// Called once per response — replaces three downstream patches.
function resolveZip(url: string, scraperZip: string | null, gptZip: string | null | undefined): string | null {
    if (scraperZip) return scraperZip;
    if (gptZip)     return gptZip;
    return url.match(/redfin\.com\/[A-Z]{2}\/[^/]+\/.+?-(\d{5})(?:\/|$)/i)?.[1] ?? null;
}

// Derives county name from ZIP via two-step join:
//   geo_crosswalk (zip -> county_fips + state_abbr) -> hud_features (county_fips -> county_name)
// hud_features.county_name is title case ("Orange"); CA normalized to ALLCAPS ("ORANGE").
// Non-CA returns null — national keys need suffix handling not built yet.
async function resolveCounty(zip: string | null): Promise<string | null> {
    if (!zip || !/^\d{5}$/.test(zip)) return null;
    const sb = getSupabase();
    if (!sb) return null;

    // Call 1: ZIP -> county_fips + state_abbr (dominant county by res_ratio)
    const { data: xwRows, error: xwErr } = await sb
        .from('geo_crosswalk')
        .select('county_fips, state_abbr, res_ratio')
        .eq('zip', zip)
        .order('res_ratio', { ascending: false })
        .limit(1);
    if (xwErr || !xwRows?.length) {
        log.warn('[BUGTRACE] resolveCounty miss', { zip, fips: null, state: null, reason: 'no_crosswalk', err: xwErr?.message ?? null, errCode: (xwErr as any)?.code ?? null, rowCount: xwRows?.length ?? 0 });
        return null;
    }
    const { county_fips: fips, state_abbr: state } = xwRows[0];

    // Call 2: county_fips -> county_name via hud_features
    const { data: hudRows, error: hudErr } = await sb
        .from('hud_features')
        .select('county_name')
        .eq('county_fips', fips)
        .limit(1);
    const rawName = hudRows?.[0]?.county_name ?? null;
    if (hudErr || !rawName) {
        log.warn('[BUGTRACE] resolveCounty miss', { zip, fips, state, reason: 'no_hud_row' });
        return null;
    }

    // CA only — ALLCAPS matches CA_LOAN_LIMITS_2026 keys exactly
    if (state === 'CA') return rawName.toUpperCase();

    log.warn('[BUGTRACE] resolveCounty miss', { zip, fips, state, reason: 'non_ca' });
    return null;
}

// ── Sold-data rescue via web-search snippets ────────────────────────────────
// When Tavily extract returns nothing (Redfin JS-rendering blocked),
// search snippets usually carry "Sold [Month Year] for $X" + "Redfin Estimate: $X".
interface SoldSnippetResult { text: string | null; photoUrl: string | null; }
async function fetchSoldSnippets(address: string): Promise<SoldSnippetResult> {
    const key = process.env.TAVILY_API_KEY;
    if (!key || !address) return { text: null, photoUrl: null };
    const clean = cleanAddressForSearch(address);
    const streetNum = clean.match(/^(\d+)\b/)?.[1] ?? null;
    const RE_DOMAINS = /redfin\.com|zillow\.com|realtor\.com|trulia\.com|homes\.com/i;
    try {
        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(8_000),
            body: JSON.stringify({
                api_key: key,
                query: `${clean} sold price redfin estimate sale history`,
                max_results: 5,
                search_depth: 'basic',
                include_answer: false,
                include_images: true,
            }),
        });
        if (!res.ok) return { text: null, photoUrl: null };
        const data = await res.json();
        const results: Record<string, unknown>[] = (data.results ?? [])
            .filter((r: Record<string, unknown>) => RE_DOMAINS.test(String(r.url ?? '')))
            .filter((r: Record<string, unknown>) => {
                if (!streetNum) return true;
                const haystack = `${r.title ?? ''} ${r.content ?? ''} ${r.url ?? ''}`;
                return new RegExp(`\\b${streetNum}\\b`).test(haystack);
            });
        if (results.length === 0) return { text: null, photoUrl: null };
        const text = results.map((r) => `${r.title ?? ''}\n${r.content ?? ''}`).join('\n\n');
        // Also pick a property photo from Tavily search images (ssl.cdn-redfin.com only)
        const allImages: string[] = [
            ...((data.images as string[]) ?? []),
            ...results.flatMap((r) => (r.images as string[] | undefined) ?? []),
        ];
        const photoUrl = pickPropertyPhoto(allImages);
        return { text, photoUrl };
    } catch (e: unknown) {
        log.warn('[PropertyLookup] Sold snippets rescue failed', { error: (e as Error)?.message });
        return { text: null, photoUrl: null };
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

    const base           = baseResult.status === 'fulfilled'  ? baseResult.value        : null;
    const tavilyResult   = tavilyText.status === 'fulfilled'   ? tavilyText.value        : null;
    const text           = tavilyResult?.content   ?? null;
    const tavilyPhotoUrl = tavilyResult?.imageUrl  ?? null;

    if (!base || !base.ok) {
        // Direct fetch blocked — fall back to Tavily text if available
        if (text && text.length > 200) {
            const tp  = parsePropertyFromText(text);
            const ext = parseExtended(text, tp.price, tp.sqft);
            if (tp.price || tp.address) {
                const gpt = await gpt4oExtract(text, url);
                const { rate } = lookupTaxRate((gpt?.state ?? tp.state) ?? '', null);
                const siteLabel = /realtor\.com/i.test(url) ? 'realtor'
                                : /trulia\.com/i.test(url)  ? 'unknown'
                                : 'unknown';
                const baseData: Record<string, unknown> = {
                    source:           siteLabel,
                    url,
                    parsedBy:         'partial',
                    parseWarnings:    ['Listing site blocked direct access — data extracted via Tavily + GPT-4o'],
                    price:            tp.price,
                    address:          tp.address,
                    city:             tp.city,
                    state:            tp.state,
                    zip:              tp.zip,
                    county:           null,
                    beds:             (tp.beds  != null && tp.beds  <= 20) ? tp.beds  : null,
                    baths:            (tp.baths != null && tp.baths <= 20) ? tp.baths : null,
                    sqft:             tp.sqft,
                    annualTaxes:      (tp.price && rate) ? Math.round(tp.price * rate) : null,
                    taxRateEffective: rate,
                    taxSource:        'table',
                    photoUrl:         tavilyPhotoUrl,
                    ...ext,
                };
                return NextResponse.json({ ok: true, data: mergeGpt4o(baseData, gpt) });
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

    // GPT-4o fills any gaps left by the regex parsers (beds/baths/sqft/yearBuilt/HOA etc.)
    const gpt = text ? await gpt4oExtract(text, url) : null;

    const baseData: Record<string, unknown> = {
        source:           d.source,
        url,
        parsedBy:         d.parsedBy,
        parseWarnings:    d.parseWarnings,
        price:            d.price,
        address:          d.address ?? (/redfin\.com/i.test(url) ? addressFromRedfinUrl(url) : null),
        city:             d.city,
        state:            d.state,
        zip:              resolveZip(url, d.zip ?? null, gpt?.zip ?? null),
        beds:             d.beds,
        baths:            d.baths,
        sqft:             d.sqft,
        annualTaxes:      d.annualTaxes,
        taxRateEffective: d.taxRateEffective,
        taxSource:        d.taxSource,
        photoUrl:         (typeof d.photoUrl === 'string' && d.photoUrl.startsWith('http') && !/\/logo/i.test(d.photoUrl) && !/redfin-logo/i.test(d.photoUrl)) ? d.photoUrl : (tavilyPhotoUrl ?? null),
        ...ext,
    };

    const merged = mergeGpt4o(baseData, gpt);

    // GPT-4o's lastSaleDate is freeform output merged in by mergeGpt4o's generic
    // "fill any null field" loop — completely unvalidated, and not necessarily "Month YYYY"
    // shaped (could be ISO "2021-05-18"), so parseMonthYear's regex alone won't catch a bad
    // one here. Reject anything outside a plausible sale-date range regardless of source.
    if (typeof merged.lastSaleDate === 'string') {
        const d = new Date(merged.lastSaleDate);
        const plausible = !isNaN(d.getTime()) && isPlausibleSaleYear(d.getFullYear());
        if (!plausible && !parseMonthYear(merged.lastSaleDate)) merged.lastSaleDate = null;
    }

    // For SOLD/OFF_MARKET, the current-value computation (replacing JSON-LD's stale original
    // listing price) runs once, AFTER the sale-data rescue below has had its chance to fill in
    // any missing lastSaleDate/lastSalePrice — see the computeAvmTier() call further down.
    const finalStatus = merged.listingStatus as string | null;

    // SOLD/OFF_MARKET rescue: when Tavily extract returned no text (Redfin JS-blocked),
    // sale date + sold price + AVM come back null from parseExtended. Web-search snippets
    // indexed by Google/Bing usually carry this data in preview text — use them as fallback.
    if ((finalStatus === 'SOLD' || finalStatus === 'OFF_MARKET') && (!merged.lastSaleDate || !merged.photoUrl) && typeof merged.address === 'string') {
        try {
            const { text: snippets, photoUrl: rescuedPhoto } = await fetchSoldSnippets(merged.address as string);
            // Recover property photo from search images when direct fetch missed it
            if (!merged.photoUrl && rescuedPhoto) merged.photoUrl = rescuedPhoto;
            if (snippets && !merged.lastSaleDate) {
                // Prepend "SOLD" so parseExtended's status detection triggers balance calc
                const rescueExt = parseExtended('SOLD\n' + snippets, merged.price as number | null, merged.sqft as number | null);
                if (!merged.lastSaleDate  && rescueExt.lastSaleDate)   merged.lastSaleDate   = rescueExt.lastSaleDate;
                if (!merged.lastSalePrice && rescueExt.lastSalePrice)   merged.lastSalePrice  = rescueExt.lastSalePrice;
                if (!merged.estimatedValue && rescueExt.estimatedValue) merged.estimatedValue = rescueExt.estimatedValue;
                // Recompute balance/equity/rate now that we have sale data
                if (!merged.estimatedBalance && rescueExt.estimatedBalance) merged.estimatedBalance = rescueExt.estimatedBalance;
                if (!merged.estimatedEquity  && rescueExt.estimatedEquity)  merged.estimatedEquity  = rescueExt.estimatedEquity;
                if (!merged.purchaseRate     && rescueExt.purchaseRate)     merged.purchaseRate     = rescueExt.purchaseRate;
                if (!merged.remainingMonths  && rescueExt.remainingMonths)  merged.remainingMonths  = rescueExt.remainingMonths;
            }
        } catch (e: unknown) {
            log.warn('[PropertyLookup] Sold data rescue failed (non-blocking)', { error: (e as Error)?.message });
        }
    }

    // For SOLD/OFF_MARKET: compute the current value with the SAME tiered, sanity-checked
    // logic app/api/homeowner/analysis/route.ts uses (lib/propertyAvm.ts) — replaces the old
    // "estimatedValue ?? lastSalePrice" shortcut, which could disagree with what My Home shows
    // for the exact same property. Also recomputes balance/equity/rate from that same value
    // via the shared homeownerCalc primitives, superseding parseExtended()'s opportunistic
    // estimate (from before the rescue above may have filled in better sale data).
    if (finalStatus === 'SOLD' || finalStatus === 'OFF_MARKET') {
        const lastSalePrice = (merged.lastSalePrice as number | null) ?? null;
        const saleDate = typeof merged.lastSaleDate === 'string' ? parseMonthYear(merged.lastSaleDate) : null;
        const avmTier = computeAvmTier({
            salePrice: lastSalePrice,
            saleDate,
            stateCode: (merged.state as string | null) ?? null,
            liveAvmCandidate: (merged.estimatedValue as number | null) ?? null,
            dbEstCandidate: null, // no prior cached value in this pipeline's own request scope
            listPriceCandidate: (merged.listPrice as number | null) ?? null,
            actualValueOverride: null, // no LO-entered override concept in the buying-journey pipeline
            trustScrapedEstimates: true,
        }, fhfaRate);
        if (avmTier.estimatedValue) {
            merged.price             = avmTier.estimatedValue;
            merged.estimatedValue    = avmTier.estimatedValue;
            merged.estimatedValueLow = avmTier.estimatedValueLow;
            merged.estimatedValueHigh = avmTier.estimatedValueHigh;
            merged.avmSource         = avmTier.avmSource;
        }
        if (lastSalePrice && saleDate) {
            const elapsed = monthsAgo(saleDate);
            const purchaseRate = historicalRate(saleDate.getFullYear());
            const estimatedBalance = Math.round(remainingBalance(lastSalePrice, 0.20, purchaseRate, elapsed));
            merged.purchaseRate      = purchaseRate;
            merged.estimatedBalance  = estimatedBalance;
            merged.remainingMonths   = Math.max(60, 360 - elapsed);
            merged.estimatedEquity   = Math.round((avmTier.estimatedValue ?? Math.round(lastSalePrice * 1.05)) - estimatedBalance);
        }
    }

    // FOR_SALE with blocked structured price: GPT-4o/Tavily often still recover the
    // list price from rendered text (listPrice). Use it so the full card stack
    // (ISC/PITI/sliders) builds instead of the "enter the listing price" fallback.
    if (!merged.price) {
        const lp = (merged.listPrice as number | null) ?? null;
        if (lp && lp > 50_000 && lp < 50_000_000) merged.price = lp;
    }

    // Last-resort price rescue: Redfin's price-blocking is per-request, so when both
    // the page scrape AND the page extract come back stripped, parse the price from
    // web-search SNIPPETS by address (no page fetch — the page already blocked us).
    if (!merged.price && typeof merged.address === 'string' && merged.address.length > 5) {
        const pushWarning = (w: string) => {
            merged.parseWarnings = [
                ...(Array.isArray(merged.parseWarnings) ? merged.parseWarnings as string[] : []),
                w,
            ];
        };
        try {
            const rescue = await rescuePriceViaSearch(merged.address, url);
            const rp = rescue?.price ?? null;
            if (rp && rp > 50_000 && rp < 50_000_000) {
                merged.price = rp;
                pushWarning('price recovered via web search');
            } else {
                pushWarning('price rescue: web search found no price');
            }
            if (!merged.estimatedValue && rescue?.estimatedValue) merged.estimatedValue = rescue.estimatedValue;
            if (!merged.annualTaxes && merged.price && merged.taxRateEffective) {
                merged.annualTaxes = Math.round((merged.price as number) * (merged.taxRateEffective as number));
            }
        } catch (e: unknown) {
            pushWarning('price rescue: search errored');
            log.warn('[PropertyLookup] Price rescue search failed (non-blocking)', { error: (e as Error)?.message });
        }
    }

    // Compute socialProofScore + interestLevel from engagement signals
    const spViews  = merged.zillowViews  as number | null ?? null;
    const spSaves  = merged.zillowSaves  as number | null ?? null;
    const spDom    = merged.daysOnMarket as number | null ?? null;
    const spRank   = merged.redfinViews  as string | null ?? null;
    let spScore = 40;
    if (spDom != null) {
        if (spDom <= 1) spScore += 25;
        else if (spDom <= 3) spScore += 20;
        else if (spDom <= 7) spScore += 15;
        else if (spDom <= 14) spScore += 8;
        else if (spDom > 60) spScore -= 15;
        else if (spDom > 30) spScore -= 5;
    }
    if (spViews != null) {
        if (spViews > 500) spScore += 20;
        else if (spViews > 200) spScore += 15;
        else if (spViews > 100) spScore += 10;
        else if (spViews > 50) spScore += 5;
    }
    if (spSaves != null) {
        if (spSaves > 100) spScore += 10;
        else if (spSaves > 50) spScore += 7;
        else if (spSaves > 20) spScore += 4;
    }
    if (spRank) {
        if (/top\s*5%/i.test(spRank))  spScore += 15;
        else if (/top\s*10%/i.test(spRank)) spScore += 12;
        else if (/top\s*25%/i.test(spRank)) spScore += 6;
    }
    merged.socialProofScore = Math.min(100, Math.max(0, Math.round(spScore)));
    merged.interestLevel    = spScore >= 80 ? 'Very High' : spScore >= 65 ? 'High' : spScore >= 50 ? 'Moderate' : 'Low';

    merged.county = await resolveCounty((merged.zip as string | null) ?? null);

    return NextResponse.json({ ok: true, data: merged });
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

    // Extract house number + first street word from the input address so we can
    // double-verify any Redfin URL slug actually belongs to THIS property.
    // Redfin slugs embed both: /CA/City/6203-Verda-Ln-92130/home/...
    // Checking only the house number isn't enough — two streets in the same zip can
    // share a number (e.g. 6203 Verda Ln AND 6203 Other St). The first street word
    // (≥3 chars) is almost always distinctive enough to reject the wrong slug.
    const expectedStreetNum  = clean.trim().match(/^(\d+)/)?.[1] ?? null;
    const expectedStreetWord = clean.trim().match(/^\d+\s+([A-Za-z]{3,})/)?.[1]?.toLowerCase() ?? null;

    const slugMatchesAddress = (url: string): boolean => {
        if (!expectedStreetNum) return true; // can't verify, allow
        // Redfin slug: /STATE/City/HOUSENUM-Street-Name[-ZIP]/home/PROPID
        const m = url.match(/redfin\.com\/[A-Z]{2}\/[^/]+\/(\d+)-([^/]+?)(?:-\d{5})?(?:\/|$)/i);
        if (!m) return true; // no parseable slug — allow (extraction will catch wrong data)
        if (m[1] !== expectedStreetNum) return false;
        // Cross-check first street word — prevents same-number-different-street mismatches
        if (expectedStreetWord && !m[2].toLowerCase().includes(expectedStreetWord)) return false;
        return true;
    };

    const extractRedfinUrl = (results: any[]): string | null => {
        // First pass: ideal /home/XXXXXXX listing URL — verify street number
        for (const r of results) {
            const url: string = r.url ?? '';
            if (/redfin\.com\/.*\/home\/\d+/i.test(url) && slugMatchesAddress(url)) return url;
        }
        // Second pass: any Redfin listing-like path, excluding known non-listing pages
        for (const r of results) {
            const url: string = r.url ?? '';
            if (!/redfin\.com/i.test(url)) continue;
            if (/\/(city|school|news|research|mortgage|blog|about|help|sitemap)\//i.test(url)) continue;
            if (/redfin\.com\/[A-Z]{2}\/[^/]+\/[^/]+-\d+\//.test(url) && slugMatchesAddress(url)) return url;
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
                const url2 = extractRedfinUrl(data2.results ?? []);
                if (url2) return url2;
            }
        }

        // Third retry: street + state + ZIP only — bypasses city/neighborhood alias
        // mismatches (e.g. Google "Thousand Oaks" vs Redfin "Newbury Park" for 91320,
        // or "Canyon Country" vs "Santa Clarita", etc.)
        const streetZipM = clean.match(/^([^,]+),\s*[^,]+,\s*([A-Z]{2})\s+(\d{5})/i);
        if (streetZipM) {
            const streetZip = `${streetZipM[1].trim()} ${streetZipM[2].toUpperCase()} ${streetZipM[3]}`;
            const res3 = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(6_000),
                body: JSON.stringify({
                    api_key: key,
                    query: `${streetZip} site:redfin.com`,
                    max_results: 5, search_depth: 'basic', include_answer: false,
                }),
            });
            if (res3.ok) {
                const data3 = await res3.json();
                return extractRedfinUrl(data3.results ?? []);
            }
        }

        return null;
    } catch (e: unknown) {
        log.warn('[PropertyLookup] Redfin URL search failed', { error: (e as Error)?.message });
        return null;
    }
}

// ── Address handler (cache-first → Redfin via Tavily → broad web search) ───

async function handleAddress(rawAddress: string) {
    let cached = await getCachedSnapshot(rawAddress);
    if (cached) {
        if (!cached.zip) {
            const z = resolveZip((cached.url as string | undefined) ?? '', null, null);
            if (z) cached = { ...cached, zip: z };
        }
        if (!cached.county && cached.zip) {
            cached = { ...cached, county: await resolveCounty(cached.zip as string) };
        }
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
        } catch (e: unknown) { log.warn('[PropertyLookup] Post-lookup cache write failed (non-blocking)', { error: (e as Error)?.message }); }
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
