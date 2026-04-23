// app/api/homeowner/analysis/route.ts
// GET — full property intelligence for the signed-in homeowner
// Sources: property_snapshots cache → properties table → FHFA AVM model → Tavily fallback
// No external paid AVM APIs — all data from public sources + LO overrides

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { getFredSnapshot } from '@/lib/fred';
import { requireAdmin } from '../../../../lib/adminAuth';
import { getUserPlan } from '../../../../lib/subscription';
import { enrichFromAttom, getAttomAVM, getAttomMortgage, getAttomComps, type AttomComp, type AttomAVM, type AttomMortgage, type AttomProperty } from '../../../../lib/attom';

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

// Zillow/Redfin AVM cross-check via Tavily — only fires for low-confidence ATTOM results
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
        query: `"${address}" sold price last sale public records`,
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

// ── property_snapshots cache helpers ─────────────────────────────────────────
const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeAddr(a: string) { return a.toLowerCase().replace(/\s+/g, ' ').trim(); }

async function getSnapshot(address: string) {
  try {
    const { data: prop } = await db().from('properties').select('id').eq('address_full', normalizeAddr(address)).maybeSingle();
    if (!prop) return null;
    const { data: snap } = await db().from('property_snapshots')
      .select('data, fetched_at').eq('property_id', prop.id).eq('snapshot_type', 'full')
      .order('fetched_at', { ascending: false }).limit(1).maybeSingle();
    if (!snap) return null;
    if (snap.fetched_at && Date.now() - new Date(snap.fetched_at).getTime() > SNAPSHOT_TTL_MS) return null;
    // Invalidate only if ATTOM is configured AND this snapshot was never ATTOM-checked at all
    // (avmDate may be null for properties where ATTOM has no AVM — that's OK, still cache it)
    if (process.env.ATTOM_API_KEY && !(snap.data as any)?.attomCheckedAt) return null;
    // Invalidate assessed-value snapshots — CA Prop 13 values can be 5–10× below market.
    // Force a fresh ATTOM pass so we pick up the real sale price from their DB.
    if ((snap.data as any)?.avmSource === 'attom_assessed') return null;
    return snap.data as PropertyData;
  } catch { return null; }
}

async function saveSnapshot(address: string, data: PropertyData) {
  try {
    const addr  = normalizeAddr(address);
    const state = stateFromAddress(address.toUpperCase()) ?? null;
    const zip   = address.match(/\b(\d{5})\b/)?.[1] ?? null;
    // Don't overwrite enrichment_source — preserve ATTOM enrichment if present
    const { data: prop } = await db().from('properties')
      .upsert({ address_full: addr, state, zip, updated_at: new Date().toISOString() }, { onConflict: 'address_full' })
      .select('id').single();
    if (!prop) return;
    const expiresAt = new Date(Date.now() + SNAPSHOT_TTL_MS).toISOString();
    const confidence = data.avmSource === 'attom' ? 0.95 : 0.75;
    await db().from('property_snapshots').insert({ property_id: prop.id, snapshot_type: 'full', source: data.avmSource === 'attom' ? 'attom_analysis' : 'internal', data, expires_at: expiresAt, confidence });
  } catch { /* non-blocking */ }
}

type PropertyData = {
  estimatedValue: number | null; estimatedValueLow: number | null; estimatedValueHigh: number | null;
  estimatedBalance: number | null; estimatedEquity: number | null; purchaseRate: number | null;
  lastSaleDate: string | null; lastSalePrice: number | null; rentEstimate: number | null;
  beds: number | null; baths: number | null; sqft: number | null;
  yearBuilt: number | null; propertyType: string | null; lotSizeSqft: number | null; apn: string | null;
  avmSource: 'attom' | 'attom_assessed' | 'fhfa' | null; avmConfidence: number | null; avmDate: string | null;
  mortgageSource: 'attom' | 'estimated' | null; mortgageLender: string | null; mortgageOriginalAmount: number | null; mortgageOriginationDate: string | null;
  comps: AttomComp[]; streetViewUrl: string | null; staticMapUrl: string | null;
  photoUrl: string | null;
  attomCheckedAt: string | null;
};

// ── Main local property intelligence — replaces rentcastLookup ───────────────
async function propertyLookup(address: string, record: Record<string, any>): Promise<PropertyData | null> {
  // 1. Check snapshot cache — back-fill Maps URLs dynamically (env-var-based, not stored)
  const cached = await getSnapshot(address);
  if (cached) {
    const mk = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
    if (mk && !cached.streetViewUrl) {
      cached.streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=800x300&location=${encodeURIComponent(address)}&return_error_code=true&key=${mk}`;
      cached.staticMapUrl  = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(address)}&zoom=15&size=500x260&scale=2&maptype=satellite&markers=color:green%7C${encodeURIComponent(address)}&key=${mk}`;
    }
    return cached;
  }

  // 2. Check properties table for stored sale data
  const addr = normalizeAddr(address);
  // Try full ATTOM column set; gracefully degrade if any column is missing
  const ATTOM_SEL = 'id, latest_last_sale_price, latest_last_sale_date, state, zip, beds, baths, sqft, year_built, property_type, apn, avm_value, avm_value_low, avm_value_high, avm_confidence, avm_date, mortgage_open_balance, mortgage_original_amount, mortgage_interest_rate, mortgage_lender, mortgage_origination_date';
  const BASIC_SEL = 'id, latest_last_sale_price, latest_last_sale_date, state, zip, beds, baths, sqft, year_built, property_type, apn';
  const fullRes = await db().from('properties').select(ATTOM_SEL).eq('address_full', addr).maybeSingle();
  let prop: any = fullRes.error ? null : (fullRes.data ?? null);
  // If SELECT errored (e.g. migration not yet applied), fall back to always-available columns
  if (fullRes.error) {
    const basic = await db().from('properties').select(BASIC_SEL).eq('address_full', addr).maybeSingle();
    prop = basic.data ?? null;
  }
  // Fuzzy fallback: addresses from URL params lack commas (Google Places adds them).
  // "8 peachtree coto de caza ca 92697" ≠ "8 peachtree, coto de caza, ca 92697"
  if (!prop) {
    // Strip all commas from stored addresses and compare
    const addrNoComma = addr.replace(/,\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const firstTokens = addrNoComma.split(' ').slice(0, 3).join(' ');
    const { data: fuzzyFull } = await db().from('properties').select(ATTOM_SEL)
      .ilike('address_full', `${firstTokens}%`).limit(5);
    if (fuzzyFull?.length) {
      prop = fuzzyFull.find((r: any) => {
        const stored = (r.address_full ?? '').replace(/,\s*/g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();
        return stored === addrNoComma;
      }) ?? null;
    }
  }

  // 3. Resolve last sale data (DB → LO override → Tavily)
  let rawSalePrice: number | null = prop?.latest_last_sale_price ?? null;
  let rawSaleDateStr: string | null = prop?.latest_last_sale_date ?? null;

  // If we have no sale data in DB, fire Tavily as fallback
  if (!rawSalePrice && !record.actual_purchase_price) {
    const tv = await tavilyPropertySearch(address);
    rawSalePrice = tv.lastSalePrice;
    if (tv.lastSaleDate) rawSaleDateStr = tv.lastSaleDate;
    // Persist to properties table for next time
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
  const stateCode = prop?.state ?? stateFromAddress(address.toUpperCase());
  const annualRate = fhfaRate(stateCode) / 100;
  const salePrice = rawSalePrice ?? null;
  const saleDate  = rawSaleDateStr ? new Date(rawSaleDateStr) : null;
  const yearsElapsed = saleDate ? Math.max(0, (Date.now() - saleDate.getTime()) / (365.25 * 24 * 3600 * 1000)) : null;

  let estimatedValue: number | null = null;
  if (salePrice && yearsElapsed !== null) {
    estimatedValue = Math.round(salePrice * Math.pow(1 + annualRate, yearsElapsed));
  }
  let estimatedValueLow  = estimatedValue ? Math.round(estimatedValue * 0.92) : null;
  let estimatedValueHigh = estimatedValue ? Math.round(estimatedValue * 1.08) : null;

  // ── ATTOM inline fetch — runs on first load before enrich has completed ──────
  // Fires all 4 ATTOM endpoints in parallel; results persist to DB for future requests.
  // After first successful fetch the properties table has full data and this block is skipped.
  let inlineProfile: AttomProperty | null = null;
  let inlineAvm: AttomAVM | null = null;
  let inlineMtg: AttomMortgage | null = null;
  let inlineComps: AttomComp[] = [];
  if (process.env.ATTOM_API_KEY && !prop?.avm_value) {
    console.log('[analysis] ATTOM inline fetch for:', address);
    const [profileRes, avmRes, mtgRes, compsRes] = await Promise.allSettled([
      enrichFromAttom(address),
      getAttomAVM(address),
      getAttomMortgage(address),
      getAttomComps(address),
    ]);
    inlineProfile = profileRes.status === 'fulfilled' && (profileRes.value.beds || profileRes.value.lastSalePrice) ? profileRes.value : null;
    inlineAvm     = avmRes.status     === 'fulfilled' && avmRes.value.estimatedValue   ? avmRes.value   : null;
    inlineMtg     = mtgRes.status     === 'fulfilled' && mtgRes.value.openBalance      ? mtgRes.value   : null;
    inlineComps   = compsRes.status   === 'fulfilled'                                  ? compsRes.value : [];
    console.log('[analysis] ATTOM results — avm:', inlineAvm?.estimatedValue, 'beds:', inlineProfile?.beds, 'mtg:', inlineMtg?.openBalance, 'comps:', inlineComps.length);

    // Persist to properties table (non-blocking) — only possible when prop row exists
    if (prop?.id) {
      const upd: Record<string, any> = { updated_at: new Date().toISOString() };
      if (inlineProfile?.beds)            { upd.beds = inlineProfile.beds; upd.baths = inlineProfile.baths; upd.sqft = inlineProfile.sqft; upd.year_built = inlineProfile.yearBuilt; upd.property_type = inlineProfile.propertyType; upd.apn = inlineProfile.apn; upd.lot_size_sqft = inlineProfile.lotSizeSqft; upd.attom_id = inlineProfile.attomId; }
      if (inlineProfile?.lastSalePrice)   { upd.latest_last_sale_price = inlineProfile.lastSalePrice; upd.latest_last_sale_date = inlineProfile.lastSaleDate; }
      if (inlineAvm?.estimatedValue)      { upd.avm_value = inlineAvm.estimatedValue; upd.avm_value_low = inlineAvm.estimatedValueLow; upd.avm_value_high = inlineAvm.estimatedValueHigh; upd.avm_confidence = inlineAvm.confidence; upd.avm_date = inlineAvm.avmDate; }
      if (inlineMtg?.openBalance)         { upd.mortgage_open_balance = inlineMtg.openBalance; upd.mortgage_original_amount = inlineMtg.originalAmount; upd.mortgage_interest_rate = inlineMtg.interestRate; upd.mortgage_lender = inlineMtg.lender; upd.mortgage_origination_date = inlineMtg.originationDate; }
      if (Object.keys(upd).length > 1) void db().from('properties').update(upd).eq('id', prop.id);
      if (inlineComps.length > 0) {
        void db().from('property_snapshots').insert({ property_id: prop.id, snapshot_type: 'comps', source: 'attom', data: inlineComps, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), confidence: 0.95 });
      }
    }
  }

  // If ATTOM profile has a more recent/higher sale price than DB (e.g. recent flip),
  // recalculate FHFA from it — otherwise assessed-value fallback would be used instead.
  if (inlineProfile?.lastSalePrice && inlineProfile.lastSalePrice > (salePrice ?? 0)) {
    const pDate = inlineProfile.lastSaleDate ? new Date(inlineProfile.lastSaleDate) : null;
    const pYrs  = pDate ? Math.max(0, (Date.now() - pDate.getTime()) / (365.25 * 24 * 3600 * 1000)) : 0;
    const fhfaEst = Math.round(inlineProfile.lastSalePrice * Math.pow(1 + annualRate, pYrs));
    if (fhfaEst > (estimatedValue ?? 0)) {
      estimatedValue     = fhfaEst;
      estimatedValueLow  = Math.round(fhfaEst * 0.92);
      estimatedValueHigh = Math.round(fhfaEst * 1.08);
    }
  }

  // ATTOM AVM overrides FHFA appreciation model — stored prop wins, inline is fallback
  const attomConf = prop?.avm_confidence ?? inlineAvm?.confidence ?? null;
  let attomAvm    = prop?.avm_value ?? inlineAvm?.estimatedValue ?? null;

  // Sanity-check low-confidence ATTOM AVMs against Zillow/Redfin via Tavily.
  // ATTOM is unreliable for luxury/private estates with sparse comps (tScore < 50).
  if (attomAvm && attomConf !== null && attomConf < 50) {
    const webAvm = await tavilyAvmSearch(address);
    if (webAvm) {
      const ratio = attomAvm / webAvm;
      if (ratio > 1.4 || ratio < 0.7) {
        // ATTOM diverges >40% from web consensus — blend toward web estimate
        console.log(`[analysis] ATTOM AVM ${attomAvm} conf ${attomConf} diverges from web ${webAvm} (ratio ${ratio.toFixed(2)}) — blending`);
        attomAvm = Math.round((attomAvm + webAvm * 2) / 3); // weight web 2:1
      }
    }
  }

  // For properties where ATTOM has no AVM (private estates, sparse comps), use assessed value
  const assessedFallback = inlineProfile?.assessedValue ?? null;
  const avmSource: 'attom' | 'attom_assessed' | 'fhfa' =
    attomAvm ? 'attom' : assessedFallback ? 'attom_assessed' : 'fhfa';
  if (attomAvm) {
    estimatedValue     = attomAvm;
    estimatedValueLow  = prop?.avm_value_low  ?? inlineAvm?.estimatedValueLow  ?? Math.round(attomAvm * 0.92);
    estimatedValueHigh = prop?.avm_value_high ?? inlineAvm?.estimatedValueHigh ?? Math.round(attomAvm * 1.08);
  } else if (assessedFallback && !estimatedValue) {
    // CA Prop 13 means assessed values can be far below market for older homes.
    // Use 1.25× as a conservative floor — better than blank, clearly labelled in UI.
    estimatedValue     = Math.round(assessedFallback * 1.25);
    estimatedValueLow  = Math.round(assessedFallback);
    estimatedValueHigh = Math.round(assessedFallback * 1.50);
  }

  // 5. HUD Fair Market Rent via geo_crosswalk
  const zip = prop?.zip ?? address.match(/\b(\d{5})\b/)?.[1] ?? null;
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
  }

  // ATTOM mortgage data overrides estimated balance/rate — stored prop wins, inline is fallback
  const attomBalance = prop?.mortgage_open_balance ?? inlineMtg?.openBalance ?? null;
  const mortgageSource: 'attom' | 'estimated' = attomBalance ? 'attom' : 'estimated';
  if (attomBalance) {
    estimatedBalance = attomBalance;
    const attomRate = prop?.mortgage_interest_rate ?? inlineMtg?.interestRate ?? null;
    if (attomRate) purchaseRate = attomRate;
    if (estimatedValue && estimatedBalance) estimatedEquity = Math.round(estimatedValue - estimatedBalance);
  }

  const lastSaleDate = saleDate ? saleDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : null;

  // 8. Comps: stored snapshot first, fall back to inline fetch results
  let comps: AttomComp[] = inlineComps; // may already have inline comps from step above
  if (!comps.length && prop?.id) {
    try {
      const { data: compsSnap } = await db().from('property_snapshots')
        .select('data').eq('property_id', prop.id).eq('snapshot_type', 'comps')
        .gt('expires_at', new Date().toISOString())
        .order('fetched_at', { ascending: false }).limit(1).maybeSingle();
      comps = (compsSnap?.data as AttomComp[]) ?? [];
    } catch { /* non-blocking */ }
  }

  // 9. Street View + satellite map URLs
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
  const streetViewUrl = mapsKey
    ? `https://maps.googleapis.com/maps/api/streetview?size=800x300&location=${encodeURIComponent(address)}&return_error_code=true&key=${mapsKey}`
    : null;
  const staticMapUrl = mapsKey
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(address)}&zoom=15&size=500x260&scale=2&maptype=satellite&markers=color:green%7C${encodeURIComponent(address)}&key=${mapsKey}`
    : null;

  // 10. Property photo — pull from most recent 'full' snapshot (scraped from Redfin)
  let photoUrl: string | null = null;
  if (prop?.id) {
    try {
      const { data: photoSnap } = await db().from('property_snapshots')
        .select('data').eq('property_id', prop.id).eq('snapshot_type', 'full')
        .order('fetched_at', { ascending: false }).limit(1).maybeSingle();
      const snapData = photoSnap?.data as Record<string, any> | null;
      const candidate = snapData?.photoUrl ?? null;
      if (typeof candidate === 'string' && candidate.startsWith('http')) photoUrl = candidate;
    } catch { /* non-blocking */ }
  }

  const result: PropertyData = {
    estimatedValue, estimatedValueLow, estimatedValueHigh,
    estimatedBalance, estimatedEquity, purchaseRate,
    lastSaleDate: lastSaleDate ?? (inlineProfile?.lastSaleDate ?? null),
    lastSalePrice: salePrice ?? inlineProfile?.lastSalePrice ?? null,
    rentEstimate,
    beds: prop?.beds ?? inlineProfile?.beds ?? null,
    baths: prop?.baths ?? inlineProfile?.baths ?? null,
    sqft: prop?.sqft ?? inlineProfile?.sqft ?? null,
    yearBuilt: prop?.year_built ?? inlineProfile?.yearBuilt ?? null,
    propertyType: prop?.property_type ?? inlineProfile?.propertyType ?? null,
    lotSizeSqft: prop?.lot_size_sqft ?? inlineProfile?.lotSizeSqft ?? null,
    apn: prop?.apn ?? inlineProfile?.apn ?? null,
    avmSource,
    avmConfidence: prop?.avm_confidence ?? inlineAvm?.confidence ?? null,
    avmDate: prop?.avm_date ?? inlineAvm?.avmDate ?? null,
    mortgageSource,
    mortgageLender: prop?.mortgage_lender ?? inlineMtg?.lender ?? null,
    mortgageOriginalAmount: prop?.mortgage_original_amount ?? inlineMtg?.originalAmount ?? null,
    mortgageOriginationDate: prop?.mortgage_origination_date ?? inlineMtg?.originationDate ?? null,
    comps,
    streetViewUrl,
    staticMapUrl,
    photoUrl,
    attomCheckedAt: process.env.ATTOM_API_KEY ? new Date().toISOString() : null,
  };

  // 7. Cache result (non-blocking)
  void saveSnapshot(address, result);
  return result;
}

// ── Shared computation — same logic for consumer and LO/borrower paths ────────
function buildAnalysis(
  rentcast: NonNullable<PropertyData>,
  fred: Awaited<ReturnType<typeof getFredSnapshot>>,
  record: Record<string, any>,
  historyRows: Record<string, any>[],
) {
  const liveRate  = fred?.mort30Avg ?? 7.0;
  const prime     = 4.25 + 3;
  const helocRate = prime + 0.5;

  const { lastSalePrice, lastSaleDate } = rentcast;

  // actual_value: LO/borrower-entered appraisal or verified valuation — always wins over AVM estimate
  const estimatedValue   = record.actual_value ? Number(record.actual_value) : rentcast.estimatedValue;
  const valueIsVerified  = !!record.actual_value;

  const balance        = record.actual_balance ? Number(record.actual_balance) : rentcast.estimatedBalance;
  const purchaseRate   = record.actual_rate    ? Number(record.actual_rate)    : rentcast.purchaseRate;
  const estimatedEquity  = (estimatedValue && balance) ? Math.round(estimatedValue - balance) : rentcast.estimatedEquity;
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
  const rentMonthly = rentcast.rentEstimate ?? (estimatedValue ? Math.round(estimatedValue * 0.0055) : null);
  const rentVsOwn   = (piti && rentMonthly) ? rentMonthly - piti : null;

  // Use actual purchase price override when available — avoids comparing vs a 2018 Rentcast sale
  const appreciationBaseline = purchasePriceOverride ?? lastSalePrice;
  const appreciationPct = (appreciationBaseline && estimatedValue) ? +((estimatedValue - appreciationBaseline) / appreciationBaseline * 100).toFixed(1) : null;

  const valueHistory = historyRows.map(r => ({ date: r.snapshot_date as string, value: r.estimated_value as number }));

  // Overlay actual purchase data so the UI always shows what the LO entered, not Rentcast history
  const displaySalePrice = purchasePriceOverride ?? lastSalePrice;
  const displaySaleDate  = record.actual_purchase_date
    ? new Date(record.actual_purchase_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : lastSaleDate;

  return {
    ...rentcast,
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

    return NextResponse.json({
      ...buildAnalysis(propData, fred, bor, []),
      borrowerName: bor.name,
      address: bor.property_address,
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

    return NextResponse.json({
      ...buildAnalysis(propData, fred, borrower, historyRes.data ?? []),
      borrowerName: borrower.name,
      address: borrower.property_address,
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
  const isPro = userPlan.plan === 'pro' || userPlan.plan === 'founding';

  const payload = buildAnalysis(propData, fred, homeowner, historyRes.data ?? []);
  if (!isPro) {
    // Loan-on-record is Pro-only — strip from consumer response
    (payload as any).mortgageLender = null;
    (payload as any).mortgageOriginalAmount = null;
    (payload as any).mortgageOriginationDate = null;
  }

  return NextResponse.json({
    address: homeowner.property_address,
    ...payload,
  });
}
