// app/api/homeowner/analysis/route.ts
// GET — full property intelligence for the signed-in homeowner
// Sources: property_snapshots cache → Redfin+Tavily+GPT-4o → FHFA AVM model
// Same data pipeline as /api/property/lookup for consistency

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { getFredSnapshot } from '@/lib/fred';
import { requireAdmin } from '../../../../lib/adminAuth';
import { getUserPlan } from '../../../../lib/subscription';
import { fetchPropertyData } from '@/property/fetch';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Historical 30yr fixed annual averages (FRED) ─────────────────────────────
const HIST_RATES: Record<number, number> = {
  2025: 6.76, 2024: 6.87, 2023: 6.81, 2022: 5.34,
  2021: 2.96, 2020: 3.11, 2019: 3.94, 2018: 4.54,
  2017: 3.99, 2016: 3.65, 2015: 3.85, 2014: 4.17,
  2013: 3.98, 2012: 3.66, 2011: 4.45, 2010: 4.69,
  2009: 5.04, 2008: 6.03, 2007: 6.34, 2006: 6.41,
  2005: 5.87, 2004: 5.84, 2003: 5.83, 2002: 6.54,
  2001: 6.97, 2000: 8.05, 1999: 7.44, 1998: 6.94,
  1997: 7.60, 1996: 7.81, 1995: 7.93, 1994: 8.38,
  1993: 7.31, 1992: 8.39, 1991: 9.25, 1990: 10.13,
};
function historicalRate(year: number) { return HIST_RATES[year] ?? 5.5; }

function remainingBalance(purchasePrice: number, downPct = 0.20, ratePct: number, monthsElapsed: number) {
  const principal = purchasePrice * (1 - downPct);
  const r = ratePct / 100 / 12;
  const n = 360;
  if (r === 0) return Math.max(0, principal - (principal / n) * monthsElapsed);
  const pmt = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return Math.max(0, principal * Math.pow(1 + r, monthsElapsed) - pmt * ((Math.pow(1 + r, monthsElapsed) - 1) / r));
}

function monthsAgo(d: Date) {
  const now = new Date();
  return Math.max(0, (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()));
}

function monthlyPayment(principal: number, annualRate: number, months = 360): number {
  const r = annualRate / 100 / 12;
  if (r === 0 || principal <= 0) return Math.round(principal / months);
  return Math.round((principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1));
}

// ── FHFA state-level annual appreciation rates (5yr CAGR 2019-2024) ──────────
const FHFA_STATE: Record<string, number> = {
  AL:4.9, AK:3.8, AZ:8.7, AR:5.6, CA:5.8, CO:5.9, CT:7.2, DE:6.4,
  FL:10.2,GA:8.4, HI:4.1, ID:9.1, IL:4.8, IN:5.9, IA:4.7, KS:5.2,
  KY:5.4, LA:4.1, ME:8.3, MD:5.7, MA:6.1, MI:6.2, MN:5.6, MS:4.6,
  MO:5.5, MT:9.4, NE:5.4, NV:7.8, NH:8.1, NJ:6.3, NM:7.2, NY:4.2,
  NC:8.1, ND:3.9, OH:5.8, OK:5.3, OR:5.4, PA:5.6, RI:7.8, SC:8.9,
  SD:5.8, TN:8.6, TX:8.9, UT:8.3, VT:7.6, VA:6.3, WA:6.5, WV:4.2,
  WI:5.5, WY:5.1, DC:3.9,
};
function fhfaRate(state: string | null): number {
  return (state ? FHFA_STATE[state.toUpperCase()] : null) ?? 5.5;
}

// Extract state from an address string (last 2-letter token before ZIP or at end)
function stateFromAddress(address: string): string | null {
  const m = address.match(/\b([A-Z]{2})\b\s*\d{5}/) ?? address.match(/\b([A-Z]{2})\s*$/);
  if (!m) return null;
  return m[1] in FHFA_STATE ? m[1] : null;
}

// ── Tavily: async fire-and-forget to find last sale data ─────────────────────
// Parse "$1.3M", "$1,300,000", "$1.3 million" → integer
function parseDollarAmount(raw: string): number | null {
  const m = raw.match(/\$\s*([\d,]+(?:\.\d+)?)\s*([KkMm]?(?:illion|housand)?)?/i);
  if (!m) return null;
  const num = parseFloat(m[1].replace(/,/g, ''));
  const suffix = (m[2] ?? '').toLowerCase();
  const mult = suffix.startsWith('m') ? 1_000_000 : suffix.startsWith('k') || suffix.startsWith('t') ? 1_000 : 1;
  const val = Math.round(num * mult);
  return val > 50_000 && val < 50_000_000 ? val : null;
}

async function tavilyAvmSearch(address: string): Promise<number | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 7000);
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query: `"${address}" home value Zestimate "Redfin Estimate"`,
        max_results: 5,
        search_depth: 'basic',
        include_answer: true,
        include_domains: ['zillow.com', 'redfin.com', 'realtor.com', 'trulia.com'],
      }),
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const text = [data.answer ?? '', ...(data.results ?? []).map((r: any) => r.content ?? '')].join(' ');
    const estimates: number[] = [];
    // Match "Zestimate: $X" or "Redfin Estimate $X" or "estimate of $X"
    const patterns = [
      /Zestimate[^$\n]{0,40}(\$[\d,]+(?:\.\d+)?[KkMm]?)/gi,
      /Redfin\s+Estimate[^$\n]{0,40}(\$[\d,]+(?:\.\d+)?[KkMm]?)/gi,
      /home\s+(?:value|estimate)[^$\n]{0,30}(\$[\d,]+(?:\.\d+)?[KkMm]?)/gi,
    ];
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const v = parseDollarAmount(m[1]);
        if (v) estimates.push(v);
      }
    }
    if (!estimates.length) return null;
    estimates.sort((a, b) => a - b);
    // Return median to avoid outliers
    return estimates[Math.floor(estimates.length / 2)];
  } catch { return null; }
}

// Quick listing-status check via Tavily — fires only when DB has no status
async function checkListingStatus(address: string): Promise<string | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query: `"${address}" site:redfin.com`,
        max_results: 3,
        search_depth: 'basic',
        include_answer: false,
      }),
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const text = (data.results ?? []).map((r: any) => `${r.title ?? ''} ${r.content ?? ''}`).join(' ').toLowerCase();
    if (/\bfor sale\b|\bactive listing\b/.test(text)) return 'FOR_SALE';
    if (/\bpending\b|\bunder contract\b/.test(text)) return 'PENDING';
    if (/\bsold\b/.test(text)) return 'SOLD';
    return null;
  } catch { return null; }
}

async function tavilyPropertySearch(address: string): Promise<{ lastSalePrice: number | null; lastSaleDate: string | null }> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return { lastSalePrice: null, lastSaleDate: null };
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 7000);
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        // Use street + ZIP only — city aliases (Newbury Park↔Thousand Oaks, etc.) break exact-city queries
        query: `"${address.split(',')[0].trim()}" "${address.match(/\b\d{5}\b/)?.[0] ?? address}" last sold price date public records`,
        max_results: 3,
        search_depth: 'basic',
        include_answer: true,
      }),
    });
    clearTimeout(t);
    if (!res.ok) return { lastSalePrice: null, lastSaleDate: null };
    const data = await res.json();
    const text = [data.answer ?? '', ...(data.results ?? []).map((r: any) => r.content ?? '')].join(' ');
    // Parse price: $NNN,NNN or $N.NM
    const priceMatch = text.match(/\$\s*([\d,]+)\s*(?:thousand|k)?/i);
    let lastSalePrice: number | null = null;
    if (priceMatch) {
      const raw = Number(priceMatch[1].replace(/,/g, ''));
      lastSalePrice = raw > 10000 ? raw : raw * 1000; // handle "250,000" vs "250k"
    }
    // Parse date: Month YYYY or YYYY
    const dateMatch = text.match(/(?:sold|purchased|closed)[^.]{0,40}?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})/i);
    const lastSaleDate = dateMatch ? dateMatch[1] : null;
    return { lastSalePrice, lastSaleDate };
  } catch { return { lastSalePrice: null, lastSaleDate: null }; }
}

// ── Live Redfin+Tavily+GPT-4o lookup (same pipeline as /api/property/lookup) ──

interface LivePropertyFields {
  beds?: number | null; baths?: number | null; sqft?: number | null; lotSqft?: number | null;
  yearBuilt?: number | null;
  // CRITICAL DISTINCTION: these two must never be confused.
  // redfinEstimate = current Redfin AVM (today's value, shown in "Redfin Estimate" section)
  // estimatedValue = alias for redfinEstimate after merge (what the home is worth NOW)
  // lastSalePrice  = historical sold price (what it sold for, with a sold date)
  redfinEstimate?: number | null; estimatedValue?: number | null;
  lastSalePrice?: number | null; lastSaleDate?: string | null;
  listingStatus?: string | null; listPrice?: number | null;
  hoaMonthly?: number | null; propertyType?: string | null;
  address?: string | null; photoUrl?: string | null;
}

async function findRedfinUrlForAddr(address: string): Promise<string | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  const clean = address.replace(/,?\s*USA\s*$/i, '').replace(/,?\s*United States\s*$/i, '').trim();
  const short  = clean.replace(/,\s*\d{5}(-\d{4})?/, '').trim();
  const trySearch = async (q: string): Promise<string | null> => {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8_000),
        body: JSON.stringify({ api_key: key, query: q, max_results: 3, search_depth: 'basic', include_answer: false }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      for (const r of (data.results ?? [])) {
        const url: string = r.url ?? '';
        if (/redfin\.com\/.*\/home\/\d+/i.test(url)) return url;
        if (/redfin\.com\/[A-Z]{2}\/[^/]+\/[^/]+-\d+\//.test(url)) return url;
      }
    } catch { /* ignore */ }
    return null;
  };
  return (await trySearch(`"${clean}" site:redfin.com`)) ?? (short !== clean ? await trySearch(`${short} redfin site:redfin.com`) : null);
}

async function extractRedfinText(url: string): Promise<string | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.tavily.com/extract', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, urls: [url] }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.results?.[0]?.raw_content as string) ?? null;
  } catch { return null; }
}

async function gpt4oLiveExtract(text: string, url: string): Promise<LivePropertyFields | null> {
  if (!OPENAI_API_KEY || text.length < 100) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o', temperature: 0, max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `Extract real estate property fields from this Redfin page. Return only JSON. Use null for missing fields. Numbers not strings. Dates as "Month YYYY".

CRITICAL — Redfin pages show TWO dollar amounts that must NOT be confused:
- lastSalePrice: the HISTORICAL sold/sale price labeled "Sold Price" or appearing next to "SOLD ON [date]". This is a past transaction amount.
- redfinEstimate: the CURRENT Redfin Estimate AVM in its own "Redfin Estimate" section showing what the home is worth TODAY. This is a different, usually higher number than the sold price.

listingStatus: determine from page signals — SOLD if "SOLD ON [date]" or "Sold Price" present, FOR_SALE if active listing, OFF_MARKET if no active listing, PENDING if under contract.

Fields: beds, baths, sqft, yearBuilt, lotSqft, lastSalePrice, lastSaleDate, redfinEstimate, listingStatus, listPrice, hoaMonthly, propertyType` },
          { role: 'user', content: `URL: ${url}\n\n${text.slice(0, 12_000)}` },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content;
    return raw ? (JSON.parse(raw) as LivePropertyFields) : null;
  } catch { return null; }
}

// Full live lookup: Redfin direct scrape + Tavily extract + GPT-4o (same pipeline as /api/property/lookup)
async function liveRedfinLookup(address: string): Promise<LivePropertyFields | null> {
  // If address is already a Redfin URL (e.g. stored by LO/consumer), use it directly —
  // no Tavily search needed, avoids wrong-page results.
  const url = /^https?:\/\/.*redfin\.com/i.test(address)
    ? address
    : await findRedfinUrlForAddr(address);
  if (!url) return null;

  // Run Redfin direct scrape and Tavily extract in parallel — same as handleUrl() in property/lookup
  const [redfinRes, tavilyText] = await Promise.allSettled([
    fetchPropertyData(url),
    extractRedfinText(url),
  ]);

  const redfin = redfinRes.status === 'fulfilled' && redfinRes.value.ok ? redfinRes.value.data : null;
  const text   = tavilyText.status === 'fulfilled' ? tavilyText.value : null;

  // Need at least one source to have data
  if (!redfin && (!text || text.length < 200)) return null;

  // ── Pass 1: Deterministic regex extraction from Redfin page text ─────────────
  // Mirrors the ExtendedFields parser in /api/property/lookup — critical fields
  // are read directly from the page structure, not inferred by AI.
  // This ensures listingStatus, redfinEstimate, and lastSalePrice are always
  // sourced from Redfin's explicit text signals before GPT-4o is consulted.
  const rx = text ? (() => {
    const t = text;

    // Listing status — same strong signals as parseExtended in /api/property/lookup
    let listingStatus: string | null = null;
    if (/sold\s+(?:on\s+)?\w+\s+\d{1,2},?\s+\d{4}/i.test(t)
        || /sold\s+price/i.test(t)
        || /\bsold\s+\w+\s+\d{4}\s+for\b/i.test(t))
      listingStatus = 'SOLD';
    else if (/off[\s-]?market/i.test(t) || /no\s+longer\s+(?:for\s+sale|listed)/i.test(t))
      listingStatus = 'OFF_MARKET';
    else if (/(?:^|\n|\.)\s*(?:this\s+home\s+is\s+for\s+sale|listed\s+for\s+sale|active\s+listing)/i.test(t)
          || /\bfor\s+sale\b/i.test(t.slice(0, 3000)))
      listingStatus = 'FOR_SALE';
    else if (/\bpending\b/i.test(t))
      listingStatus = 'PENDING';
    else if (/\bsold\b/i.test(t))
      listingStatus = 'SOLD';

    // Redfin Estimate — current AVM
    // On off-market pages Redfin shows: "$876,326 Est. refi payment $2,804/mo" in the header
    // On-page section shows: "Redfin Estimate $876,326" — both must be caught
    const reM = t.match(/redfin\s+estimate[:\s\n]*\$?([\d,]+)/i)
      ?? t.match(/\$?([\d,]+)\s+Est\.\s+refi\s+payment/i);
    const redfinEstimate = reM ? parseInt(reM[1].replace(/,/g, '')) : null;

    // Sold price + date — multiple formats including "Sold May 2013 for $450,000"
    // Mirrors parseExtended patterns in /api/property/lookup
    const soldM =
      t.match(/sold\s+([A-Za-z]+\s+\d{4})\s+for\s+\$?([\d,]+)/i)          // "Sold May 2013 for $450,000"
      ?? t.match(/last\s+sold[:\s]+([A-Za-z]+\s+\d{4})[^$\d]*\$?([\d,]+)/i) // "Last sold: May 2013 · $450,000"
      ?? (() => {
        const dateM  = t.match(/sold\s+on\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
        const priceM = t.match(/\$([\d,]+)\s+sold\s+price/i) ?? t.match(/sold\s+price[:\s]+\$?([\d,]+)/i);
        if (dateM && priceM) {
          const d = new Date(dateM[1]);
          const label = isNaN(d.getTime()) ? dateM[1] : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          return [null, label, priceM[1]] as unknown as RegExpMatchArray;
        }
        return null;
      })();
    const lastSaleDate  = soldM?.[1] ?? null;
    const lastSalePrice = soldM?.[2] ? parseInt(soldM[2].replace(/,/g, '')) : null;

    return { listingStatus, redfinEstimate, lastSaleDate, lastSalePrice };
  })() : { listingStatus: null, redfinEstimate: null, lastSaleDate: null, lastSalePrice: null };

  // ── Pass 2: GPT-4o fills only fields still null after the regex pass ──────────
  const gpt = text && text.length > 200 ? await gpt4oLiveExtract(text, url) : null;

  // Merge: Redfin scraper (structured) > regex pre-pass (deterministic) > GPT-4o (AI gap-fill)
  const merged: LivePropertyFields = {
    beds:           redfin?.beds           ?? gpt?.beds          ?? null,
    baths:          redfin?.baths          ?? gpt?.baths         ?? null,
    sqft:           redfin?.sqft           ?? gpt?.sqft          ?? null,
    lotSqft:        gpt?.lotSqft           ?? null,
    yearBuilt:      gpt?.yearBuilt         ?? null,
    // AVM: use the Redfin Estimate (current value), NOT the sold price
    redfinEstimate: rx.redfinEstimate      ?? gpt?.redfinEstimate ?? null,
    estimatedValue: rx.redfinEstimate      ?? gpt?.redfinEstimate ?? null,
    // Historical sale — regex-parsed from Redfin page text (deterministic)
    lastSalePrice:  rx.lastSalePrice       ?? gpt?.lastSalePrice  ?? null,
    lastSaleDate:   rx.lastSaleDate        ?? gpt?.lastSaleDate   ?? null,
    // Status: Redfin scraper structured data > regex > GPT-4o
    listingStatus:  redfin?.listingStatus  ?? rx.listingStatus    ?? gpt?.listingStatus ?? null,
    listPrice:      redfin?.price          ?? gpt?.listPrice      ?? null,
    hoaMonthly:     gpt?.hoaMonthly        ?? null,
    propertyType:   gpt?.propertyType      ?? null,
    address:        redfin?.address        ?? gpt?.address        ?? null,
    photoUrl:       redfin?.photoUrl       ?? null,
  };

  // Verify house number matches — reject if we got the wrong listing page
  const queryNum  = address.trim().match(/^(\d+)/)?.[1];
  const mergedNum = (merged.address ?? '').trim().match(/^(\d+)/)?.[1];
  if (queryNum && mergedNum && queryNum !== mergedNum) {
    console.log(`[liveRedfinLookup] House number mismatch: queried "${address}", got "${merged.address}" — discarding`);
    return null;
  }

  return merged;
}

// ── property_snapshots cache helpers ─────────────────────────────────────────
const SNAPSHOT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — AVM data is stable; 7 days caused drift
const TWO_YEARS_MS    = 2 * 365.25 * 24 * 60 * 60 * 1000;

// Handles "Month YYYY" output from GPT-4o (e.g. "August 1996") which Date() rejects.
function parseFlexDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  let d = new Date(s);
  if (!isNaN(d.getTime()) && d.getFullYear() >= 1900) return d;
  const m = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m) { d = new Date(`${m[1]} 1, ${m[2]}`); if (!isNaN(d.getTime()) && d.getFullYear() >= 1900) return d; }
  return null;
}

function normalizeAddr(a: string) { return a.toLowerCase().replace(/\s+/g, ' ').trim(); }

async function getSnapshot(address: string) {
  try {
    const { data: prop } = await db().from('properties').select('id, latest_listing_status').ilike('address_full', normalizeAddr(address)).maybeSingle();
    if (!prop) return null;
    // Active listings bypass the 7-day cache — listing prices change daily
    if (prop.latest_listing_status === 'FOR_SALE' || prop.latest_listing_status === 'PENDING') return null;
    const { data: snap } = await db().from('property_snapshots')
      .select('data, fetched_at').eq('property_id', prop.id).eq('snapshot_type', 'full')
      .order('fetched_at', { ascending: false }).limit(1).maybeSingle();
    if (!snap) return null;
    const snapAvm       = (snap.data as any)?.estimatedValue as number | null;
    const snapSalePrice = (snap.data as any)?.lastSalePrice  as number | null;
    const snapAvmSource = (snap.data as any)?.avmSource as string | null;
    // FHFA-model AVMs are lower confidence — expire them in 7 days so a fresher Redfin
    // scrape can replace them. Redfin-verified estimates keep the full 30-day TTL.
    const effectiveTtl = (snapAvmSource === 'redfin_estimate') ? SNAPSHOT_TTL_MS : 7 * 24 * 60 * 60 * 1000;
    if (snap.fetched_at && Date.now() - new Date(snap.fetched_at).getTime() > effectiveTtl) return null;
    // Evict absurdly high AVMs
    if (snapAvm && snapAvm > 50_000_000) return null;
    // Evict AVMs clearly below the known sale price — symptom of a wrong-page GPT-4o extraction
    if (snapAvm && snapSalePrice && snapAvm < snapSalePrice * 0.60) return null;
    // Evict when AVM ≈ sale price — means the Redfin Estimate was never correctly extracted
    // and the sale price leaked into the AVM field.  No date check needed: a valid current
    // AVM for any property sold years ago will never be within 2% of the old sale price.
    if (snapAvm && snapSalePrice &&
        Math.abs(snapAvm - snapSalePrice) / snapSalePrice < 0.02) return null;
    return snap.data as PropertyData;
  } catch { return null; }
}

async function saveSnapshot(address: string, data: PropertyData) {
  try {
    const addr  = normalizeAddr(address);
    const state = stateFromAddress(address.toUpperCase()) ?? null;
    const zip   = address.match(/\b(\d{5})\b/)?.[1] ?? null;
    const newConfidence = data.avmSource === 'redfin_estimate' ? 0.90 : 0.75;

    const { data: prop } = await db().from('properties')
      .upsert({ address_full: addr, state, zip, updated_at: new Date().toISOString() }, { onConflict: 'address_full' })
      .select('id').single();
    if (!prop) return;

    // Source hierarchy rule: don't overwrite a snapshot that has higher confidence.
    // A consumer-triggered FHFA scrape (0.75) must not displace a Redfin-verified
    // snapshot (0.90) that a previous user already produced for this address.
    const { data: existing } = await db().from('property_snapshots')
      .select('confidence').eq('property_id', prop.id).eq('snapshot_type', 'full')
      .order('fetched_at', { ascending: false }).limit(1).maybeSingle();
    const existingConfidence = (existing?.confidence as number) ?? 0;
    if (newConfidence < existingConfidence) return; // lower-trust source — skip

    const expiresAt = new Date(Date.now() + SNAPSHOT_TTL_MS).toISOString();
    await db().from('property_snapshots').insert({
      property_id: prop.id, snapshot_type: 'full',
      source: data.avmSource ?? 'internal', data, expires_at: expiresAt, confidence: newConfidence,
    });
  } catch { /* non-blocking */ }
}

type PropertyData = {
  estimatedValue: number | null; estimatedValueLow: number | null; estimatedValueHigh: number | null;
  estimatedBalance: number | null; estimatedEquity: number | null; purchaseRate: number | null;
  lastSaleDate: string | null; lastSalePrice: number | null; rentEstimate: number | null;
  beds: number | null; baths: number | null; sqft: number | null;
  yearBuilt: number | null; propertyType: string | null; lotSizeSqft: number | null; apn: string | null;
  avmSource: 'redfin_estimate' | 'fhfa' | 'ai_estimate' | null; avmConfidence: number | null; avmDate: string | null;
  mortgageSource: 'estimated' | null; mortgageLender: null; mortgageOriginalAmount: null; mortgageOriginationDate: null;
  comps: Record<string, unknown>[]; streetViewUrl: string | null; staticMapUrl: string | null;
  photoUrl: string | null; parsedAddress: string | null;
  listingStatus: string | null;
  listPrice: number | null;
};

const AVM_MAX = 50_000_000; // $50M residential cap

// Parse a clean street address from a Redfin URL slug so DB keys are always
// human-readable, never URLs.  e.g.:
// redfin.com/CA/Trabuco-Canyon/8-Peachtree-92679/home/5019838
//   → "8 Peachtree, Trabuco Canyon, CA 92679"
function parseAddressFromRedfinUrl(url: string): string | null {
  const m = url.match(/redfin\.com\/([A-Z]{2})\/([^/]+)\/(.+?)-(\d{5})(?:\/|$)/i);
  if (m) return `${m[3].replace(/-/g, ' ')}, ${m[2].replace(/-/g, ' ')}, ${m[1].toUpperCase()} ${m[4]}`;
  const m2 = url.match(/redfin\.com\/([A-Z]{2})\/([^/]+)\/(\d[^/]+)(?:\/home\/\d+)?/i);
  if (!m2) return null;
  return `${m2[3].replace(/-/g, ' ')}, ${m2[2].replace(/-/g, ' ')}, ${m2[1].toUpperCase()}`;
}

// ── Main local property intelligence (AVM tiers: Redfin / FHFA / AI estimate) ──
async function propertyLookup(address: string, record: Record<string, any>): Promise<PropertyData | null> {
  // Normalize URL-format addresses (LO/consumer pasted a Redfin URL as property address).
  // Resolve to a clean street address immediately so all DB keys are human-readable,
  // snapshots are found on repeat lookups, and URLs never leak into the UI.
  const isRedfinUrl = /^https?:\/\/.*redfin\.com/i.test(address);
  const resolvedAddress = isRedfinUrl ? (parseAddressFromRedfinUrl(address) ?? address) : address;

  // 1. Check snapshot cache — back-fill Maps URLs dynamically (env-var-based, not stored)
  const cached = await getSnapshot(resolvedAddress);
  if (cached) {
    const mk = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
    if (mk && !cached.streetViewUrl) {
      cached.streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=800x300&location=${encodeURIComponent(resolvedAddress)}&return_error_code=true&key=${mk}`;
      cached.staticMapUrl  = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(resolvedAddress)}&zoom=15&size=500x260&scale=2&maptype=satellite&markers=color:green%7C${encodeURIComponent(resolvedAddress)}&key=${mk}`;
    }
    return cached;
  }

  // 2. Check properties table for stored sale data
  const addr = normalizeAddr(resolvedAddress);
  const PROP_SEL = 'id, latest_last_sale_price, latest_last_sale_date, latest_value, latest_listing_status, state, zip, beds, baths, sqft, year_built, property_type, apn, updated_at';
  let prop: any = (await db().from('properties').select(PROP_SEL).ilike('address_full', addr).maybeSingle()).data ?? null;
  // Fuzzy fallback: addresses from URL params lack commas (Google Places adds them)
  if (!prop) {
    const addrNoComma = addr.replace(/,\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const firstTokens = addrNoComma.split(' ').slice(0, 3).join(' ');
    const { data: fuzzyRows } = await db().from('properties').select(PROP_SEL).ilike('address_full', `${firstTokens}%`).limit(5);
    prop = (fuzzyRows ?? []).find((r: any) => {
      const stored = (r.address_full ?? '').replace(/,\s*/g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();
      return stored === addrNoComma;
    }) ?? null;
  }
  // ZIP+street fallback: Google Places aliases city names (e.g. Newbury Park→Thousand Oaks,
  // Coto De Caza→Trabuco Canyon) — same ZIP, different city string breaks the city-aware match above.
  // Match on house# + street name + ZIP only, ignoring city entirely.
  if (!prop) {
    const addrNoComma = addr.replace(/,\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const zipMatch = addrNoComma.match(/\b(\d{5})\b/);
    const streetPrefix = addrNoComma.split(' ').slice(0, 2).join(' '); // "1024 knollwood"
    if (zipMatch && streetPrefix.length > 3) {
      const { data: zipRows } = await db().from('properties').select(PROP_SEL)
        .ilike('address_full', `${streetPrefix}%`)
        .ilike('address_full', `%${zipMatch[1]}%`)
        .limit(3);
      // Prefer rows that already have sale data over empty/stub rows
      prop = zipRows?.find((r: any) => r.latest_last_sale_price) ?? zipRows?.[0] ?? null;
    }
  }

  // 3. Resolve last sale data (DB → LO override → Redfin+GPT-4o → Tavily text search)
  let rawSalePrice: number | null = prop?.latest_last_sale_price ?? null;
  let rawSaleDateStr: string | null = prop?.latest_last_sale_date ?? null;

  // Run live Redfin lookup whenever we have missing key fields — same pipeline as /api/property/lookup
  // Guard: if the LO has prepared this profile with actual_* data, live-scraped financials must NOT
  // override it. Live lookup still runs for structural data (beds/baths/sqft) and photo.
  // Pass original address: if it was a Redfin URL, liveRedfinLookup will use it directly (no Tavily search needed).
  const hasLoFinancials = !!(record.actual_purchase_price || record.actual_value || record.actual_balance || record.actual_rate);
  // Refresh when any key field is missing OR when the DB record is stale (>30 days).
  // Also refresh when latest_value ≈ the sale price for an old property — this means the
  // Redfin Estimate was never correctly extracted and the purchase price leaked into the AVM.
  const propAgeMs = prop?.updated_at ? Date.now() - new Date(prop.updated_at).getTime() : Infinity;
  const roughSaleMs = parseFlexDate(rawSaleDateStr)?.getTime() ?? null;
  // Only trigger the AVM-staleness Redfin re-scrape when we actually need a fresh AVM.
  // When hasLoFinancials=true the liveAvm/dbEst guards discard the scraped value anyway,
  // and triggering needsLive just adds 10+ seconds to the reload after a user saves numbers.
  // No date check: if latest_value ≈ last_sale_price the AVM is clearly wrong (sale price
  // leaked in), regardless of when the sale was.
  const avmEqualsOldSalePrice = !hasLoFinancials && !!(rawSalePrice && prop?.latest_value &&
      Math.abs(prop.latest_value - rawSalePrice) / rawSalePrice < 0.02);
  const needsLive = !rawSalePrice || !prop?.beds || !prop?.sqft || !prop?.latest_value || propAgeMs > SNAPSHOT_TTL_MS || avmEqualsOldSalePrice;
  const liveData = needsLive ? await liveRedfinLookup(address) : null;

  if (liveData) {
    // Only use liveData sale price when LO hasn't entered actual_purchase_price
    if (!rawSalePrice && !record.actual_purchase_price && liveData.lastSalePrice) {
      rawSalePrice = liveData.lastSalePrice;
    }
    // Sale date saved independently — it may arrive even when sale price is already in DB
    if (!rawSaleDateStr && liveData.lastSaleDate) {
      rawSaleDateStr = liveData.lastSaleDate;
    }
    // Persist enriched fields from Redfin to properties table.
    // Source hierarchy rule: only write a field if it is currently null in the DB.
    // A live consumer scrape must never overwrite data that was already confirmed
    // by a more-trusted source (Redfin direct, LO-entered, etc.).
    // Exception: listingStatus, listPrice, and Redfin Estimate are market state — they always update.
    if (prop?.id || rawSalePrice) {
      void db().from('properties').upsert({
        address_full: addr,
        ...(rawSalePrice    && !prop?.latest_last_sale_price && { latest_last_sale_price: rawSalePrice }),
        ...(rawSaleDateStr  && !prop?.latest_last_sale_date  && { latest_last_sale_date:  rawSaleDateStr }),
        ...(liveData.beds   && !prop?.beds        && { beds:          liveData.beds }),
        ...(liveData.baths  && !prop?.baths       && { baths:         liveData.baths }),
        ...(liveData.sqft   && !prop?.sqft        && { sqft:          liveData.sqft }),
        ...(liveData.yearBuilt  && !prop?.year_built    && { year_built:    liveData.yearBuilt }),
        ...(liveData.propertyType && !prop?.property_type && { property_type: liveData.propertyType }),
        // Only write SOLD/OFF_MARKET from homeowner route — never write FOR_SALE/PENDING
        ...(!hasLoFinancials && liveData.listingStatus && liveData.listingStatus !== 'FOR_SALE' && liveData.listingStatus !== 'PENDING' && { latest_listing_status: liveData.listingStatus }),
        // latest_value: Redfin Estimate wins for SOLD/off-market; list price wins for active listings
        ...((liveData.listPrice || liveData.redfinEstimate) && { latest_value: liveData.listPrice ?? liveData.redfinEstimate }),
        ...(!prop?.enrichment_source && { enrichment_source: 'redfin_via_tavily' }),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'address_full' });
    }
  }

  // Fallback: if liveData still didn't get sale data, try basic Tavily text search
  if (!rawSalePrice && !record.actual_purchase_price) {
    const tv = await tavilyPropertySearch(address);
    rawSalePrice = tv.lastSalePrice;
    if (tv.lastSaleDate) rawSaleDateStr = tv.lastSaleDate;
    if (rawSalePrice) {
      void db().from('properties').upsert({
        address_full: addr,
        latest_last_sale_price: rawSalePrice,
        latest_last_sale_date: rawSaleDateStr,
        enrichment_source: 'tavily',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'address_full' });
    }
  }

  // 4. FHFA AVM: lastSalePrice × (1 + annualRate)^yearsElapsed
  const stateCode = prop?.state ?? stateFromAddress(resolvedAddress.toUpperCase());
  const annualRate = fhfaRate(stateCode) / 100;
  const salePrice = rawSalePrice ?? null;
  const saleDate  = parseFlexDate(rawSaleDateStr); // handles "Month YYYY" from GPT-4o
  // Cap at 50 years — FHFA compounding beyond that produces nonsensical residential AVMs
  const yearsElapsed = saleDate ? Math.min(50, Math.max(0, (Date.now() - saleDate.getTime()) / (365.25 * 24 * 3600 * 1000))) : null;

  let estimatedValue: number | null = null;
  if (salePrice && yearsElapsed !== null) {
    estimatedValue = Math.round(salePrice * Math.pow(1 + annualRate, yearsElapsed));
  }
  let estimatedValueLow  = estimatedValue ? Math.round(estimatedValue * 0.92) : null;
  let estimatedValueHigh = estimatedValue ? Math.round(estimatedValue * 1.08) : null;

  // AVM priority (highest → lowest):
  //   0. user-entered actual_value override — always wins, no sanity check
  //   1. live Redfin scrape (current session)
  //   2. prop.latest_value from DB — written by /api/property/lookup when user pastes Redfin URL in chat
  //   3. FHFA appreciation model (already computed above)
  // Sanity check: any automated AVM must exceed 75% of known sale price (below that = wrong page).
  const rawLiveAvm = (!hasLoFinancials && liveData?.estimatedValue && liveData.estimatedValue > 50_000 && liveData.estimatedValue <= AVM_MAX)
    ? liveData.estimatedValue : null;
  const liveAvm = (rawLiveAvm && salePrice && rawLiveAvm < salePrice * 0.75)
    ? (() => { console.log(`[analysis] liveAvm ${rawLiveAvm} < salePrice ${salePrice} × 0.75 — discarding (wrong page)`); return null; })()
    : rawLiveAvm;

  // DB estimate: latest_value written by property/lookup when the Redfin URL was pasted in chat.
  // This is the correct Redfin AVM even when a direct Redfin scrape is blocked.
  const rawDbEst = (!hasLoFinancials && !liveAvm && prop?.latest_value && prop.latest_value > 50_000 && prop.latest_value <= AVM_MAX)
    ? prop.latest_value : null;
  // Sanity #1: below 75% of sale price → wrong page
  // Sanity #2: equals sale price → purchase price leaked in as AVM.
  // No date check needed: a real current AVM never matches a historical sale price within 2%.
  const dbEstIsOldSalePrice = !!(rawDbEst && salePrice &&
      Math.abs(rawDbEst - salePrice) / salePrice < 0.02);
  const dbEst = (rawDbEst && salePrice && rawDbEst < salePrice * 0.75) ? null
    : dbEstIsOldSalePrice ? null
    : rawDbEst;

  // avmSource tracks which data tier produced the estimate for UI color-coding:
  // redfin_estimate = scraped directly from Redfin's "Redfin Estimate" section (highest confidence)
  // fhfa            = derived from FHFA appreciation model on lastSalePrice (model estimate)
  // ai_estimate     = Tavily/GPT-4o gap-fill or 75% LTV fallback (lowest confidence, show amber)
  const avmSource: 'redfin_estimate' | 'fhfa' | 'ai_estimate' =
    record.actual_value ? 'redfin_estimate' : (liveAvm || dbEst) ? 'redfin_estimate' : (estimatedValue ? 'fhfa' : 'ai_estimate');

  // Priority 0: user-entered value override always wins
  if (record.actual_value && Number(record.actual_value) > 50_000) {
    estimatedValue     = Number(record.actual_value);
    estimatedValueLow  = Math.round(estimatedValue * 0.95);
    estimatedValueHigh = Math.round(estimatedValue * 1.05);
  } else if (liveAvm) {
    estimatedValue     = liveAvm;
    estimatedValueLow  = Math.round(liveAvm * 0.93);
    estimatedValueHigh = Math.round(liveAvm * 1.07);
  } else if (dbEst) {
    estimatedValue     = dbEst;
    estimatedValueLow  = Math.round(dbEst * 0.93);
    estimatedValueHigh = Math.round(dbEst * 1.07);
  }

  // Homeowner analysis never treats the property as FOR_SALE:
  // - checkListingStatus() is a buyer-flow tool; calling it here writes FOR_SALE to the DB
  //   and flips the card to Buyer Intelligence even for the owner's own home.
  // - If the property happens to be listed, the list price must NOT replace the AVM;
  //   the owner cares about market value, not their own ask price.
  let listingStatus: string | null = prop?.latest_listing_status ?? null;
  if (listingStatus === 'UNKNOWN') listingStatus = null;
  const isForSale = false; // always homeowner context — never buyer context
  const listingAvm = (isForSale && prop?.latest_value && prop.latest_value > 50_000 && prop.latest_value <= AVM_MAX)
    ? (prop.latest_value as number) : null;
  if (listingAvm) {
    estimatedValue     = listingAvm;
    estimatedValueLow  = Math.round(listingAvm * 0.97);
    estimatedValueHigh = Math.round(listingAvm * 1.03);
  }

  // 5. HUD Fair Market Rent via geo_crosswalk
  const zip = prop?.zip ?? resolvedAddress.match(/\b(\d{5})\b/)?.[1] ?? null;
  let rentEstimate: number | null = null;
  if (zip) {
    try {
      const { data: geo } = await db().from('geo_crosswalk').select('county_fips').eq('zip', zip).limit(1).maybeSingle();
      if (geo?.county_fips) {
        const { data: hud } = await db().from('hud_features').select('fmr_2br, fmr_3br').eq('county_fips', geo.county_fips).maybeSingle();
        rentEstimate = hud?.fmr_3br ?? hud?.fmr_2br ?? null;
      }
    } catch { /* non-blocking */ }
  }
  // Fallback: 0.55% of value/mo (common rule of thumb)
  if (!rentEstimate && estimatedValue) rentEstimate = Math.round(estimatedValue * 0.0055);

  // 6. Loan math
  let estimatedBalance: number | null = null;
  let estimatedEquity:  number | null = null;
  let purchaseRate:     number | null = null;

  if (salePrice && saleDate) {
    const elapsed = monthsAgo(saleDate);
    purchaseRate     = historicalRate(saleDate.getFullYear());
    estimatedBalance = Math.round(remainingBalance(salePrice, 0.20, purchaseRate, elapsed));
    estimatedEquity  = Math.round((estimatedValue ?? salePrice) - estimatedBalance);
  } else if (estimatedValue && !salePrice) {
    // No purchase data from any source — rough 75% LTV estimate so equity/LTV are never blank.
    // UI should treat this as low-confidence (balanceIsEstimated = true already covers this).
    estimatedBalance = Math.round(estimatedValue * 0.75);
    estimatedEquity  = Math.round(estimatedValue * 0.25);
  }

  const mortgageSource: 'estimated' | null = 'estimated';

  const lastSaleDate = saleDate ? saleDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : null;

  // 9. Street View + satellite map URLs
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
  const streetViewUrl = mapsKey
    ? `https://maps.googleapis.com/maps/api/streetview?size=800x300&location=${encodeURIComponent(resolvedAddress)}&return_error_code=true&key=${mapsKey}`
    : null;
  const staticMapUrl = mapsKey
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(resolvedAddress)}&zoom=15&size=500x260&scale=2&maptype=satellite&markers=color:green%7C${encodeURIComponent(resolvedAddress)}&key=${mapsKey}`
    : null;

  // 10. Property photo — priority: user upload > live Redfin > cached snapshot > Street View fallback
  // Rejects brand/logo images (e.g. Redfin sign-in wall returns its logo as og:image)
  const isValidPhoto = (url: string | null | undefined): url is string =>
    typeof url === 'string' && url.startsWith('http') && !/\/logo/i.test(url) && !/redfin-logo/i.test(url);

  let photoUrl: string | null = null;

  // Priority 1: user-uploaded photo (highest trust, never overridden)
  if (prop?.id) {
    try {
      const { data: userPhotoSnap } = await db().from('property_snapshots')
        .select('data').eq('property_id', prop.id).eq('snapshot_type', 'user_photo')
        .order('fetched_at', { ascending: false }).limit(1).maybeSingle();
      const upData = userPhotoSnap?.data as Record<string, any> | null;
      const upUrl = upData?.photoUrl ?? null;
      if (isValidPhoto(upUrl)) photoUrl = upUrl;
    } catch { /* non-blocking */ }
  }

  // Priority 2: live Redfin og:image (filtered — rejects sign-in wall logo)
  if (!photoUrl && isValidPhoto(liveData?.photoUrl)) photoUrl = liveData!.photoUrl!;

  // Priority 3: cached full snapshot photo (filtered)
  if (!photoUrl && prop?.id) {
    try {
      const { data: photoSnap } = await db().from('property_snapshots')
        .select('data').eq('property_id', prop.id).eq('snapshot_type', 'full')
        .order('fetched_at', { ascending: false }).limit(1).maybeSingle();
      const snapData = photoSnap?.data as Record<string, any> | null;
      const candidate = snapData?.photoUrl ?? null;
      if (isValidPhoto(candidate)) photoUrl = candidate;
    } catch { /* non-blocking */ }
  }

  // Priority 4: targeted Redfin fetch just for the photo when structural data was cached
  if (!photoUrl && !liveData) {
    try {
      const photoOnly = await liveRedfinLookup(address);
      if (isValidPhoto(photoOnly?.photoUrl)) photoUrl = photoOnly!.photoUrl!;
    } catch { /* non-blocking */ }
  }

  // Priority 5: Street View as visual fallback (already built from Google Maps API)
  if (!photoUrl && streetViewUrl) photoUrl = streetViewUrl;

  const result: PropertyData = {
    estimatedValue, estimatedValueLow, estimatedValueHigh,
    estimatedBalance, estimatedEquity, purchaseRate,
    lastSaleDate: lastSaleDate ?? null,
    lastSalePrice: salePrice ?? null,
    rentEstimate,
    beds: prop?.beds ?? liveData?.beds ?? null,
    baths: prop?.baths ?? liveData?.baths ?? null,
    sqft: prop?.sqft ?? liveData?.sqft ?? null,
    yearBuilt: prop?.year_built ?? liveData?.yearBuilt ?? null,
    propertyType: prop?.property_type ?? liveData?.propertyType ?? null,
    lotSizeSqft: prop?.lot_size_sqft ?? null,
    apn: prop?.apn ?? null,
    avmSource,
    avmConfidence: null,
    avmDate: null,
    mortgageSource,
    mortgageLender: null,
    mortgageOriginalAmount: null,
    mortgageOriginationDate: null,
    comps: [],
    streetViewUrl,
    staticMapUrl,
    photoUrl,
    parsedAddress: liveData?.address ?? null,
    listingStatus,
    listPrice: isForSale ? estimatedValue : null,
  };

  // 7. Cache result (non-blocking) — always keyed by resolved street address, never by URL
  void saveSnapshot(resolvedAddress, result);

  return result;
}

// ── Shared computation — same logic for consumer and LO/borrower paths ────────
function buildAnalysis(
  avm: NonNullable<PropertyData>,
  fred: Awaited<ReturnType<typeof getFredSnapshot>>,
  record: Record<string, any>,
  historyRows: Record<string, any>[],
) {
  const liveRate  = fred?.mort30Avg ?? 7.0;
  const prime     = 4.25 + 3;
  const helocRate = prime + 0.5;

  const { lastSalePrice, lastSaleDate } = avm;

  // actual_value: LO/borrower-entered appraisal or verified valuation — always wins over AVM estimate
  const estimatedValue   = record.actual_value ? Number(record.actual_value) : avm.estimatedValue;
  const valueIsVerified  = !!record.actual_value;

  const balance        = record.actual_balance ? Number(record.actual_balance) : avm.estimatedBalance;
  const purchaseRate   = record.actual_rate    ? Number(record.actual_rate)    : avm.purchaseRate;
  const estimatedEquity  = (estimatedValue && balance) ? Math.round(estimatedValue - balance) : avm.estimatedEquity;
  const estimatedBalance = balance;

  const balanceIsEstimated    = !record.actual_balance;
  const rateIsEstimated       = !record.actual_rate;
  const purchasePriceOverride = record.actual_purchase_price ? Number(record.actual_purchase_price) : null;

  const ltv       = (estimatedValue && estimatedBalance) ? Math.round((estimatedBalance / estimatedValue) * 100) : null;
  const equityPct = (estimatedValue && estimatedEquity)  ? Math.round((estimatedEquity  / estimatedValue) * 100) : null;

  const helocMax   = (estimatedValue && estimatedBalance) ? Math.max(0, Math.round(estimatedValue * 0.85 - estimatedBalance)) : null;
  const cashOutMax = (estimatedValue && estimatedBalance) ? Math.max(0, Math.round(estimatedValue * 0.80 - estimatedBalance)) : null;
  const helocDraws = helocMax ? [
    { label: '25% draw', amount: Math.round(helocMax * 0.25) },
    { label: '50% draw', amount: Math.round(helocMax * 0.50) },
    { label: 'Full draw', amount: helocMax },
  ].map(d => ({
    ...d,
    interestOnly: Math.round((d.amount * (helocRate / 100)) / 12),
    amortizing:   monthlyPayment(d.amount, helocRate, 240),
  })) : [];

  const origPurchasePrice   = purchasePriceOverride ?? lastSalePrice;
  // If LO entered actual balance, use it directly; otherwise estimate 80% LTV from purchase price
  const origBalance         = record.actual_balance
    ? Number(record.actual_balance)
    : origPurchasePrice ? origPurchasePrice * 0.8 : (estimatedBalance ?? 0) * 1.5;
  const refiMonthlySaving   = (purchaseRate && estimatedBalance && purchaseRate > liveRate)
    ? Math.max(0, monthlyPayment(estimatedBalance, purchaseRate) - monthlyPayment(estimatedBalance, liveRate)) : 0;
  const refiClosingCost     = estimatedBalance ? Math.round(estimatedBalance * 0.02) : 0;
  const refiBreakEven       = refiMonthlySaving > 0 ? Math.round(refiClosingCost / refiMonthlySaving) : null;

  const paidOff    = origBalance > 0 && estimatedBalance ? origBalance - estimatedBalance : 0;
  const paidOffPct = origBalance > 0 ? Math.round((paidOff / origBalance) * 100) : 0;

  const purchaseDateStr = record.actual_purchase_date ?? lastSaleDate;
  const purchaseYear    = purchaseDateStr ? new Date(purchaseDateStr).getFullYear() : null;
  const yearsElapsed    = purchaseYear ? new Date().getFullYear() - purchaseYear : null;
  const origPmt         = purchaseRate ? monthlyPayment(origBalance, purchaseRate) : null;
  const totalPaid       = (origPmt && yearsElapsed) ? origPmt * yearsElapsed * 12 : null;
  const interestPaid    = (totalPaid && paidOff) ? Math.max(0, Math.round(totalPaid - paidOff)) : null;

  const payoffYear = (estimatedBalance && purchaseRate) ? (() => {
    const pmt = monthlyPayment(origBalance, purchaseRate);
    const r   = purchaseRate / 100 / 12;
    const arg = 1 - (r * estimatedBalance) / pmt;
    if (arg <= 0) return new Date().getFullYear() + 30;
    const rem = Math.ceil(-Math.log(arg) / Math.log(1 + r));
    return new Date().getFullYear() + Math.ceil(rem / 12);
  })() : null;

  const nextValueTarget     = estimatedValue ? Math.ceil(estimatedValue / 250_000) * 250_000 : null;
  const yearsToTarget       = (nextValueTarget && estimatedValue) ? Math.ceil(Math.log(nextValueTarget / estimatedValue) / Math.log(1.042)) : null;
  const nextValueTargetYear = (yearsToTarget && yearsToTarget > 0 && yearsToTarget <= 15) ? new Date().getFullYear() + yearsToTarget : null;

  const piti        = (estimatedBalance && purchaseRate) ? monthlyPayment(estimatedBalance, purchaseRate) + Math.round((estimatedValue ?? 0) * 0.015 / 12) : null;
  const rentMonthly = avm.rentEstimate ?? (estimatedValue ? Math.round(estimatedValue * 0.0055) : null);
  const rentVsOwn   = (piti && rentMonthly) ? rentMonthly - piti : null;

  // Use actual purchase price override when available — avoids comparing vs a stale historical sale
  const appreciationBaseline = purchasePriceOverride ?? lastSalePrice;
  const appreciationPct = (appreciationBaseline && estimatedValue) ? +((estimatedValue - appreciationBaseline) / appreciationBaseline * 100).toFixed(1) : null;

  const valueHistory = historyRows.map(r => ({ date: r.snapshot_date as string, value: r.estimated_value as number }));

  // Overlay actual purchase data so the UI always shows what the LO entered, not the AVM's history
  const displaySalePrice = purchasePriceOverride ?? lastSalePrice;
  const displaySaleDate  = record.actual_purchase_date
    ? new Date(record.actual_purchase_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : lastSaleDate;

  return {
    ...avm,
    estimatedValue,
    lastSalePrice: displaySalePrice,
    lastSaleDate:  displaySaleDate,
    estimatedBalance, estimatedEquity, purchaseRate,
    liveRate, fedFundsRate: null,
    valueHistory: valueHistory.length >= 2 ? valueHistory : [],
    valueIsVerified,
    savedOverrides: {
      actual_balance:        record.actual_balance        ?? null,
      actual_rate:           record.actual_rate           ?? null,
      actual_purchase_price: record.actual_purchase_price ?? null,
      actual_purchase_date:  record.actual_purchase_date  ?? null,
      actual_value:          record.actual_value          ?? null,
    },
    balanceIsEstimated, rateIsEstimated,
    ltv, equityPct, appreciationPct,
    helocMax, helocRate, cashOutMax, helocDraws,
    refiMonthlySaving, refiBreakEven, refiClosingCost,
    paidOffPct, interestPaid, yearsElapsed,
    payoffYear, nextValueTarget, nextValueTargetYear,
    piti, rentMonthly, rentVsOwn, prime, helocRateLabel: `${prime.toFixed(2)}% + 0.50%`,
  };
}

export async function GET(request: NextRequest) {
  // ── REPORT TOKEN PATH: public shareable report (no Clerk auth needed) ────────
  const reportToken = request.nextUrl.searchParams.get('report_token');
  if (reportToken) {
    const { data: rep } = await db()
      .from('borrower_reports')
      .select('borrower_id')
      .eq('token', reportToken)
      .single();
    if (!rep) return NextResponse.json({ error: 'Invalid report token' }, { status: 404 });

    const { data: bor } = await db()
      .from('borrowers')
      .select('id, name, property_address, actual_balance, actual_rate, actual_purchase_price, actual_purchase_date, actual_value')
      .eq('id', rep.borrower_id)
      .single();
    if (!bor?.property_address) return NextResponse.json({ error: 'No address on file' }, { status: 404 });

    const [propData, fred] = await Promise.all([
      propertyLookup(bor.property_address, bor),
      getFredSnapshot({ timeoutMs: 8000 }),
    ]);
    if (!propData) return NextResponse.json({ error: 'Could not retrieve property data' }, { status: 422 });

    const reportAddr = /^https?:\/\//i.test(bor.property_address)
      ? (propData.parsedAddress ?? bor.property_address) : bor.property_address;
    return NextResponse.json({
      ...buildAnalysis(propData, fred, bor, []),
      borrowerName: bor.name,
      address: reportAddr,
    });
  }

  // ── PREVIEW PATH: unauthenticated address lookup (from /homeowner page) ─────
  const previewAddress = request.nextUrl.searchParams.get('preview_address');
  if (previewAddress) {
    const [propData, fred] = await Promise.all([
      propertyLookup(previewAddress, {}),
      getFredSnapshot({ timeoutMs: 8000 }),
    ]);
    if (!propData) return NextResponse.json({ error: 'Could not retrieve property data' }, { status: 422 });
    return NextResponse.json({
      address: previewAddress,
      isPreview: true,
      ...buildAnalysis(propData, fred, {}, []),
    });
  }

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const borrowerId = request.nextUrl.searchParams.get('borrower_id');

  // ── LO PATH: viewing a specific borrower's home ───────────────────────────
  if (borrowerId) {
    // Admin bypass — admins can view any borrower without being the LO
    const adminCheck = await requireAdmin();
    const isAdmin = !adminCheck.error;

    // Verify caller is an LO or agent who owns this borrower (skip for admins)
    const [loRes, agentRes] = isAdmin
      ? [{ data: null }, { data: null }]
      : await Promise.all([
          db().from('loan_officers').select('id').eq('user_id', userId).maybeSingle(),
          db().from('agents').select('id').eq('user_id', userId).maybeSingle(),
        ]);
    const isPro = isAdmin || !!loRes.data || !!agentRes.data;
    if (!isPro) return NextResponse.json({ error: 'Not an LO account' }, { status: 403 });

    const ownerCol = loRes.data ? 'loan_officer_id' : 'agent_id';
    const ownerId  = loRes.data?.id ?? agentRes.data?.id ?? null;

    let borrower: Record<string, any> | null = null;
    {
      let q = db()
        .from('borrowers')
        .select('id, name, property_address, actual_balance, actual_rate, actual_purchase_price, actual_purchase_date, actual_value')
        .eq('id', borrowerId);
      if (!isAdmin && ownerId) q = q.eq(ownerCol, ownerId);
      const res = await q.maybeSingle();
      if (res.error?.code === '42703') {
        let qf = db()
          .from('borrowers')
          .select('id, name, property_address')
          .eq('id', borrowerId);
        if (!isAdmin && ownerId) qf = qf.eq(ownerCol, ownerId);
        const fallback = await qf.maybeSingle();
        borrower = fallback.data;
      } else {
        borrower = res.data;
      }
    }

    if (!borrower?.property_address) {
      return NextResponse.json({ error: 'No address on file for this borrower' }, { status: 404 });
    }

    const [propData, fred, historyRes] = await Promise.all([
      propertyLookup(borrower.property_address, borrower),
      getFredSnapshot({ timeoutMs: 8000 }),
      db()
        .from('homeowner_snapshots')
        .select('snapshot_date, estimated_value')
        .eq('borrower_id', borrowerId)
        .not('estimated_value', 'is', null)
        .order('snapshot_date', { ascending: true })
        .limit(12),
    ]);

    if (!propData) return NextResponse.json({ error: 'Could not retrieve property data' }, { status: 422 });

    const loAddr = /^https?:\/\//i.test(borrower.property_address)
      ? (propData.parsedAddress ?? borrower.property_address) : borrower.property_address;
    return NextResponse.json({
      ...buildAnalysis(propData, fred, borrower, historyRes.data ?? []),
      borrowerName: borrower.name,
      address: loAddr,
      isLoView: true,
    });
  }

  // ── CONSUMER PATH: viewing own home ───────────────────────────────────────
  // Accepts ?property_id=<uuid> for multi-home; falls back to primary or first.
  const propertyId = request.nextUrl.searchParams.get('property_id');
  const SEL = 'id, property_address, actual_balance, actual_rate, actual_purchase_price, actual_purchase_date, actual_value';

  let homeowner: Record<string, any> | null = null;

  if (propertyId) {
    // Specific property requested — enforce ownership via user_id
    const res = await db()
      .from('consumer_homeowner_properties')
      .select(SEL)
      .eq('id', propertyId)
      .eq('user_id', userId)
      .maybeSingle();
    homeowner = res.data ?? null;
  }

  if (!homeowner) {
    // Fall back: primary property
    const primary = await db()
      .from('consumer_homeowner_properties')
      .select(SEL)
      .eq('user_id', userId)
      .eq('is_primary', true)
      .maybeSingle();
    homeowner = primary.data ?? null;
  }

  if (!homeowner) {
    // Fall back: first property by created_at
    const first = await db()
      .from('consumer_homeowner_properties')
      .select(SEL)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    homeowner = first.data ?? null;
  }

  if (!homeowner) {
    // Legacy fallback: old consumer_homeowners table (pre-migration)
    const legacy = await db()
      .from('consumer_homeowners')
      .select('property_address, id, actual_balance, actual_rate, actual_purchase_price, actual_purchase_date, actual_value')
      .eq('user_id', userId)
      .maybeSingle();
    homeowner = legacy.data ?? null;
  }

  if (!homeowner?.property_address) {
    return NextResponse.json({ error: 'No address on file' }, { status: 404 });
  }

  const [propData, fred, historyRes] = await Promise.all([
    propertyLookup(homeowner.property_address, homeowner),
    getFredSnapshot({ timeoutMs: 8000 }),
    db()
      .from('consumer_snapshots')
      .select('snapshot_date, estimated_value')
      .eq('consumer_id', homeowner.id)
      .not('estimated_value', 'is', null)
      .order('snapshot_date', { ascending: true })
      .limit(12),
  ]);

  if (!propData) {
    return NextResponse.json({ error: 'Could not retrieve property data' }, { status: 422 });
  }

  const userPlan = await getUserPlan(userId);
  const isPro = userPlan.plan === 'pro';

  const payload = buildAnalysis(propData, fred, homeowner, historyRes.data ?? []);
  if (!isPro) {
    // Loan-on-record is Pro-only — strip from consumer response
    (payload as any).mortgageLender = null;
    (payload as any).mortgageOriginalAmount = null;
    (payload as any).mortgageOriginationDate = null;
  }

  const consumerAddr = /^https?:\/\//i.test(homeowner.property_address)
    ? (propData.parsedAddress ?? homeowner.property_address) : homeowner.property_address;
  return NextResponse.json({
    address: consumerAddr,
    ...payload,
  });
}
