// app/api/property/enrich/route.ts
// POST { address } — fires in background when user confirms an address.
// Calls ATTOM API first (structured JSON), falls back to Tavily/Redfin scraping.
// upserts to properties table. Zero cost after first lookup (30-day cache).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enrichFromAttom } from '../../../../lib/attom';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function normalizeAddr(a: string) {
  return a.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ── Parse Redfin/Zillow page text for structured property fields ──────────────
function parsePropertyContent(text: string): Partial<EnrichedProperty> {
  const t = text.replace(/\s+/g, ' ');

  // Last sold price: "Sold for $260,000" / "Last sold: $260,000" / "Sold $260K"
  const soldMatch = t.match(/(?:sold\s+for|last\s+sold[:\s]+|sold[:\s]+)\$\s*([\d,]+(?:\.\d+)?)\s*(?:thousand|k)?/i)
    ?? t.match(/\$\s*([\d,]+)\s*(?:sold|sale price)/i);
  let lastSalePrice: number | null = null;
  if (soldMatch) {
    const raw = Number(soldMatch[1].replace(/,/g, ''));
    lastSalePrice = raw > 10000 ? raw : raw * 1000;
    // Sanity check: home prices between $20k and $50M
    if (lastSalePrice < 20000 || lastSalePrice > 50_000_000) lastSalePrice = null;
  }

  // Last sold date: "Sold Apr 2025" / "Apr 15, 2025" / "2025-04-15"
  const dateMatch = t.match(/(?:sold|purchased|closed)[^.]{0,60}?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/i)
    ?? t.match(/(?:sold|purchased|closed)[^.]{0,40}?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})/i)
    ?? t.match(/(?:sold|purchased|closed)[^.]{0,20}?(\d{4})/i);
  const lastSaleDate = dateMatch ? dateMatch[1].trim() : null;

  // Beds: "3 beds" / "3 bd" / "3 bedrooms"
  const bedsMatch = t.match(/(\d+)\s*(?:bed(?:room)?s?|bd)\b/i);
  const beds = bedsMatch ? Number(bedsMatch[1]) : null;

  // Baths: "2 baths" / "2 ba" / "2.5 bath"
  const bathsMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:bath(?:room)?s?|ba)\b/i);
  const baths = bathsMatch ? Number(bathsMatch[1]) : null;

  // Sqft: "1,450 sq ft" / "1450 sqft" / "1,450 square feet"
  const sqftMatch = t.match(/([\d,]+)\s*(?:sq\.?\s*ft\.?|sqft|square\s+feet)/i);
  const sqft = sqftMatch ? Number(sqftMatch[1].replace(/,/g, '')) : null;

  // Year built: "Built in 1998" / "Year built: 1998"
  const yearMatch = t.match(/(?:built\s+in|year\s+built[:\s]+)(\d{4})/i);
  const yearBuilt = yearMatch ? Number(yearMatch[1]) : null;

  // Property type: single family, condo, townhouse, multi-family
  let propertyType: string | null = null;
  if (/single[\s-]family|sfr|single family/i.test(t)) propertyType = 'single_family';
  else if (/condo(?:minium)?/i.test(t)) propertyType = 'condo';
  else if (/townhouse|town\s*home/i.test(t)) propertyType = 'townhouse';
  else if (/multi[\s-]family|duplex|triplex|fourplex/i.test(t)) propertyType = 'multi_family';

  // APN / parcel number
  const apnMatch = t.match(/(?:apn|parcel[:\s#]+)([\d\-]+)/i);
  const apn = apnMatch ? apnMatch[1] : null;

  return { lastSalePrice, lastSaleDate, beds, baths, sqft, yearBuilt, propertyType, apn };
}

type EnrichedProperty = {
  lastSalePrice: number | null;
  lastSaleDate: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
  apn: string | null;
};

// ── Tavily search with Redfin priority ───────────────────────────────────────
async function enrichFromTavily(address: string): Promise<EnrichedProperty> {
  const key = process.env.TAVILY_API_KEY;
  const empty: EnrichedProperty = { lastSalePrice: null, lastSaleDate: null, beds: null, baths: null, sqft: null, yearBuilt: null, propertyType: null, apn: null };
  if (!key) return empty;

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 9000);

    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        // Redfin first, fall back to Zillow/Realtor if needed
        query: `"${address}" sold price beds baths sqft site:redfin.com`,
        max_results: 3,
        search_depth: 'advanced',
        include_answer: true,
        include_raw_content: false,
      }),
    });
    clearTimeout(t);
    if (!res.ok) return empty;

    const data = await res.json();

    // Combine answer + all result snippets for maximum coverage
    const combined = [
      data.answer ?? '',
      ...(data.results ?? []).map((r: any) => `${r.title ?? ''} ${r.content ?? ''}`),
    ].join(' ');

    const parsed = parsePropertyContent(combined);

    // If Redfin search missed sale price, try a broader search
    if (!parsed.lastSalePrice) {
      const res2 = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: key,
          query: `"${address}" last sold price public records`,
          max_results: 3,
          search_depth: 'basic',
          include_answer: true,
        }),
      });
      if (res2.ok) {
        const data2 = await res2.json();
        const text2 = [data2.answer ?? '', ...(data2.results ?? []).map((r: any) => r.content ?? '')].join(' ');
        const parsed2 = parsePropertyContent(text2);
        // Merge — only fill gaps
        if (!parsed.lastSalePrice) parsed.lastSalePrice = parsed2.lastSalePrice;
        if (!parsed.lastSaleDate)  parsed.lastSaleDate  = parsed2.lastSaleDate;
        if (!parsed.beds)          parsed.beds          = parsed2.beds;
        if (!parsed.baths)         parsed.baths         = parsed2.baths;
        if (!parsed.sqft)          parsed.sqft          = parsed2.sqft;
        if (!parsed.yearBuilt)     parsed.yearBuilt     = parsed2.yearBuilt;
      }
    }

    return { ...empty, ...parsed };
  } catch {
    return empty;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const address: string = body?.address?.trim();
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 });

  const addr = normalizeAddr(address);
  const state = address.match(/\b([A-Z]{2})\b\s*\d{5}/)?.[1] ?? address.match(/\b([A-Z]{2})\s*$/)?.[1] ?? null;
  const zip   = address.match(/\b(\d{5})\b/)?.[1] ?? null;

  // Check if we already have fresh data (enriched within 30 days)
  const { data: existing } = await db()
    .from('properties')
    .select('id, enriched_at, latest_last_sale_price, beds, sqft')
    .eq('address_full', addr)
    .maybeSingle();

  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const isFresh = existing?.enriched_at
    && Date.now() - new Date(existing.enriched_at).getTime() < thirtyDaysMs
    && existing.latest_last_sale_price; // has meaningful data

  if (isFresh) {
    return NextResponse.json({ ok: true, cached: true, address });
  }

  // Try ATTOM first (structured, reliable), fall back to Tavily scraping
  let enriched = await enrichFromAttom(address);
  const source = (enriched.beds || enriched.lastSalePrice) ? 'attom' : null;

  if (!source) {
    enriched = await enrichFromTavily(address) as typeof enriched;
  }

  // Build upsert payload — only include fields we found
  const payload: Record<string, any> = {
    address_full: addr,
    state: state ?? null,
    zip: zip ?? null,
    enrichment_source: source ?? 'redfin_via_tavily',
    enriched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (enriched.lastSalePrice)  payload.latest_last_sale_price = enriched.lastSalePrice;
  if (enriched.lastSaleDate)   payload.latest_last_sale_date  = enriched.lastSaleDate;
  if (enriched.beds)           payload.beds                   = enriched.beds;
  if (enriched.baths)          payload.baths                  = enriched.baths;
  if (enriched.sqft)           payload.sqft                   = enriched.sqft;
  if (enriched.yearBuilt)      payload.year_built             = enriched.yearBuilt;
  if (enriched.propertyType)   payload.property_type          = enriched.propertyType;
  if (enriched.apn)            payload.apn                    = enriched.apn;
  if ((enriched as any).lotSizeSqft)  payload.lot_size_sqft  = (enriched as any).lotSizeSqft;
  if ((enriched as any).attomId)      payload.attom_id        = (enriched as any).attomId;

  const { data: upserted } = await db()
    .from('properties')
    .upsert(payload, { onConflict: 'address_full' })
    .select('id')
    .single();

  // Write property_snapshot so analysis route hits cache next time
  if (upserted?.id && enriched.lastSalePrice) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    try {
      await db().from('property_snapshots').insert({
        property_id: upserted.id,
        snapshot_type: source === 'attom' ? 'attom' : 'enrich',
        source: source ?? 'redfin_via_tavily',
        data: enriched,
        expires_at: expiresAt,
        confidence: source === 'attom' ? 0.95 : 0.85,
      });
    } catch { /* non-blocking */ }
  }

  return NextResponse.json({ ok: true, cached: false, address, data: enriched });
}
