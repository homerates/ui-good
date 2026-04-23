// app/api/homeowner/nearby-sales/route.ts
// GET ?address=... — returns 3-8 recent comparable sales near the address.
// Primary: ATTOM salescomps/snapshot (0.5 mi, last 2 years)
// Fallback: Tavily/Redfin text parse

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAttomComps, type AttomComp } from '../../../../lib/attom';

interface NearbySale {
  address: string;
  price: number;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  date: string;
  pricePerSqft: number | null;
  source: string;
}

function parseSales(text: string): NearbySale[] {
  const sales: NearbySale[] = [];
  const chunks = text.split(/\n\n+/);

  for (const chunk of chunks) {
    // Find a sale price
    const priceM = chunk.match(/\$\s*([\d,]+(?:\.\d+)?)\s*([KkMm]?)\b/);
    if (!priceM) continue;
    const raw = parseFloat(priceM[1].replace(/,/g, ''));
    const suffix = priceM[2].toUpperCase();
    const price = suffix === 'M' ? Math.round(raw * 1_000_000) : suffix === 'K' ? Math.round(raw * 1_000) : Math.round(raw);
    if (price < 50_000 || price > 50_000_000) continue;

    // Sale date
    const dateM = chunk.match(/(?:sold|closed|sale)[^.]{0,40}((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4})/i)
      ?? chunk.match(/((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4})\s*(?:–|—|-|·|\|)/i);
    if (!dateM) continue;

    // Address — line starting with a number
    const addrM = chunk.match(/^\d+\s+[A-Za-z].{5,60}$/m)
      ?? chunk.match(/\d+\s+[A-Za-z][^,\n]{5,50}(?:,\s*[A-Za-z][^,\n]{2,30}){1,3}/);
    const address = addrM ? addrM[0].trim() : '';

    const sqftM  = chunk.match(/([\d,]+)\s*(?:sq\.?\s*ft|sqft|square\s*feet)/i);
    const bedsM  = chunk.match(/(\d+)\s*(?:bed|bd)\b/i);
    const bathsM = chunk.match(/(\d+(?:\.\d)?)\s*(?:bath|ba)\b/i);

    const sqft  = sqftM  ? parseInt(sqftM[1].replace(/,/g, '')) : null;
    const beds  = bedsM  ? parseInt(bedsM[1])  : null;
    const baths = bathsM ? parseFloat(bathsM[1]) : null;

    sales.push({
      address,
      price,
      sqft,
      beds,
      baths,
      date: dateM[1],
      pricePerSqft: sqft && sqft > 0 ? Math.round(price / sqft) : null,
      source: 'redfin',
    });

    if (sales.length >= 5) break;
  }

  return sales;
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address');
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 });

  // Primary: ATTOM salescomps (0.5 mi, last 2 years)
  try {
    const attomComps = await getAttomComps(address);
    if (attomComps.length >= 1) {
      const sales: NearbySale[] = attomComps.map((c: AttomComp) => ({
        address:      c.address,
        price:        c.salePrice,
        sqft:         c.sqft,
        beds:         c.beds,
        baths:        c.baths,
        date:         c.saleDate,
        pricePerSqft: c.pricePerSqft,
        source:       'attom',
      }));
      return NextResponse.json({ ok: true, sales });
    }
  } catch { /* fall through to Tavily */ }

  // Fallback: Tavily/Redfin text parse
  const key = process.env.TAVILY_API_KEY;
  if (!key) return NextResponse.json({ ok: true, sales: [] });

  try {
    const city = address.split(',').slice(1, 3).join(',').trim() || address;
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({
        api_key: key,
        query: `recent home sales near "${city}" sold 2024 2025 site:redfin.com`,
        max_results: 5,
        search_depth: 'basic',
        include_answer: false,
      }),
    });
    if (!res.ok) return NextResponse.json({ ok: true, sales: [] });

    const data = await res.json();
    const combined = (data.results ?? []).map((r: any) => `${r.title ?? ''}\n${r.content ?? ''}`).join('\n\n');
    const sales = parseSales(combined);

    return NextResponse.json({ ok: true, sales });
  } catch {
    return NextResponse.json({ ok: true, sales: [] });
  }
}
