// app/api/investor-intel/route.ts
// POST { address, beds, propertyType }
// → Tavily rental comp search → Grok structured analysis → cache → return
// GET  { address }
// → check cache → return if fresh
//
// Supabase: reuses grok_property_cache with key prefix "investor_intel::"
// (run a dedicated migration to investor_intel_cache if volume warrants it)

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { getSupabase } from '../../../lib/supabaseServer';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RentalComp {
  address: string;
  beds:    number | null;
  baths:   number | null;
  sqft:    number | null;
  rent:    number;
  source:  string;
}

export interface InvestorIntelResult {
  rentRangeLow:    number;
  rentRangeMedian: number;
  rentRangeHigh:   number;
  vacancyPct:      number;
  comps:           RentalComp[];
  aiNarrative:     string;
  rate:            number;
  confidence:      'high' | 'medium' | 'low';
  dataFreshness:   string;
}

// ── Live rate ─────────────────────────────────────────────────────────────────

async function getLiveRate(origin: string): Promise<number> {
  try {
    const res = await fetch(`${origin}/api/ticker`, { cache: 'no-store' });
    if (!res.ok) return 7.5;
    const json = await res.json();
    const item = json?.items?.find((i: any) => i.label === '30Y FIXED');
    if (item?.value) {
      const parsed = parseFloat(String(item.value).replace('%', ''));
      // DSCR rates run ~0.5% above conforming; add spread
      if (Number.isFinite(parsed) && parsed > 3 && parsed < 12) {
        return parseFloat(Math.min(parsed + 0.5, 11.5).toFixed(3));
      }
    }
  } catch {}
  return 7.5;
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function cacheKey(address: string): string {
  return 'investor_intel::' + address.trim().toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function readCache(address: string): Promise<InvestorIntelResult | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const key = cacheKey(address);
  const { data } = await sb
    .from('grok_property_cache')
    .select('grok_result, fetched_at')
    .eq('address_normalized', key)
    .maybeSingle();
  if (!data) return null;
  // TTL check
  const age = Date.now() - new Date(data.fetched_at).getTime();
  if (age > CACHE_TTL_MS) return null;
  return data.grok_result as InvestorIntelResult;
}

async function writeCache(address: string, result: InvestorIntelResult): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const key  = cacheKey(address);
  const now  = new Date();
  await sb.from('grok_property_cache').upsert({
    address_normalized: key,
    address_raw:        `[investor-intel] ${address.trim()}`,
    grok_result:        result,
    model:              'grok-investor-intel',
    fetched_at:         now.toISOString(),
    expires_at:         new Date(now.getTime() + CACHE_TTL_MS).toISOString(),
  }, { onConflict: 'address_normalized' });
}

// ── Tavily: fetch rental comp context ─────────────────────────────────────────

async function tavilyRentalContext(address: string, beds: number | null, propertyType: string): Promise<string> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return '';

  const parts   = address.split(',').map(s => s.trim());
  const city    = parts.slice(1, 3).join(', ');
  const zipMatch = address.match(/\b(\d{5})\b/);
  const zip     = zipMatch ? zipMatch[1] : '';

  const bedsStr = beds ? `${beds} bedroom` : '';
  const typeLbl = propertyType || 'house';

  const queries = [
    `${bedsStr} ${typeLbl} rental price ${city}${zip ? ' ' + zip : ''} 2025 2026`,
    `average rent ${bedsStr} ${typeLbl} ${city} landlord monthly`,
    `${city}${zip ? ' ' + zip : ''} rental market vacancy rate 2026`,
  ];

  const results = await Promise.allSettled(
    queries.map(q =>
      fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8_000),
        body: JSON.stringify({
          api_key:        key,
          query:          q,
          max_results:    4,
          search_depth:   'advanced',
          include_answer: true,
        }),
      }).then(r => r.json()),
    ),
  );

  const snippets: string[] = [];
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const d = r.value;
    if (d.answer) snippets.push(d.answer);
    for (const res of (d.results ?? []).slice(0, 3)) {
      if (res.content) snippets.push(`[${res.url ?? 'web'}] ${String(res.content).slice(0, 400)}`);
    }
  }

  return snippets.join('\n\n').slice(0, 8_000) || 'No rental data found.';
}

// ── Grok: structure rental intel ──────────────────────────────────────────────

const GROK_SYSTEM = `You are a DSCR investor rental market analyst for HomeRates.ai.
Current date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

Your job: analyze web data and return structured rental market intelligence for a DSCR investor.

Return ONLY valid JSON — no markdown, no explanation, no code fences:
{
  "rent_range_low": number,
  "rent_range_median": number,
  "rent_range_high": number,
  "vacancy_pct": number,
  "comps": [
    { "address": "nearby address or source label", "beds": number or null, "baths": number or null, "sqft": number or null, "rent": number, "source": "zillow|apartments.com|realtor.com|web" }
  ],
  "ai_narrative": "2-3 sentence rental market analysis for an investor: rent range, vacancy, absorption, and whether a DSCR investor should expect to hit market rent quickly",
  "confidence": "high|medium|low",
  "data_freshness": "Rental data as of [month year]"
}

Rules:
- Include 2-4 realistic comp entries from web context; if specific comps not found, create realistic estimates based on the market data and label source as "market estimate"
- rent_range_median should be the most likely achievable rent for this property
- vacancy_pct: typical local vacancy rate (3–12% range)
- ai_narrative: investor-focused, factual, no hype`;

async function grokRentalIntel(
  address: string,
  beds:          number | null,
  propertyType:  string,
  webContext:    string,
): Promise<InvestorIntelResult | null> {
  const key = process.env.XAI_API_KEY;
  if (!key) return null;

  const userMsg = `Analyze rental market for this investment property:
Address: ${address}
${beds ? `Bedrooms: ${beds}` : ''}
${propertyType ? `Property type: ${propertyType}` : ''}

Web research context:
${webContext}

Return structured JSON for this rental market.`;

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(40_000),
    body: JSON.stringify({
      model:           (process.env.XAI_MODEL || 'grok-4').trim(),
      messages:        [{ role: 'system', content: GROK_SYSTEM }, { role: 'user', content: userMsg }],
      temperature:     0.15,
      max_tokens:      900,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const raw: string = data.choices?.[0]?.message?.content ?? '';

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { parsed = JSON.parse(m[0]); } catch { return null; }
  }

  return {
    rentRangeLow:    Number(parsed.rent_range_low)    || 0,
    rentRangeMedian: Number(parsed.rent_range_median) || 0,
    rentRangeHigh:   Number(parsed.rent_range_high)   || 0,
    vacancyPct:      Number(parsed.vacancy_pct)       || 5,
    comps:           Array.isArray(parsed.comps) ? parsed.comps : [],
    aiNarrative:     String(parsed.ai_narrative || ''),
    rate:            0, // filled in by handler
    confidence:      parsed.confidence === 'high' ? 'high' : parsed.confidence === 'low' ? 'low' : 'medium',
    dataFreshness:   String(parsed.data_freshness || 'Rental data as of ' + new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })),
  };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const url     = new URL(req.url);
  const address = url.searchParams.get('address')?.trim();
  if (!address) {
    return new Response(JSON.stringify({ error: 'address required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const cached = await readCache(address);
  if (cached) {
    return new Response(JSON.stringify({ ok: true, cached: true, result: cached }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: false, cached: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch {}

  const address:      string         = body.address ?? '';
  const beds:         number | null  = body.beds ?? null;
  const propertyType: string         = body.propertyType ?? 'single family';

  if (!address.trim()) {
    return new Response(JSON.stringify({ error: 'address required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // Check cache first
  const cached = await readCache(address);
  if (cached) {
    return new Response(JSON.stringify({ ok: true, cached: true, result: cached }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // Parallel: live rate + Tavily context
  const origin = new URL(req.url).origin;
  const [liveRate, webContext] = await Promise.all([
    getLiveRate(origin),
    tavilyRentalContext(address, beds, propertyType).catch(() => ''),
  ]);

  const result = await grokRentalIntel(address, beds, propertyType, webContext);

  if (!result) {
    return new Response(JSON.stringify({ ok: false, error: 'Analysis unavailable — check API keys' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  result.rate = liveRate;

  await writeCache(address, result);

  return new Response(JSON.stringify({ ok: true, cached: false, result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
