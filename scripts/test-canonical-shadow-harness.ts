// scripts/test-canonical-shadow-harness.ts
//
// Canonical Property Intelligence Consistency Workstream, Stage C (2026-09-08).
//
// For each test property, computes and prints side by side:
//   EXISTING FIRST-PARTY RESULT -- the exact formulas app/chat/page.tsx uses
//   (confirmed by direct code trace, not guessed), evaluated here against
//   REAL data from the same already-deployed, already-live endpoints that
//   page calls (/api/property/lookup, /api/ticker, /api/rate-intelligence-engine,
//   all self-fetched over real HTTPS to production -- read-only, nothing new
//   written that those endpoints don't already write on their own).
//   NEW CANONICAL RESULT -- buildCanonicalPropertyIntelligence(), the same
//   function the external Gateway now consumes after Stage D.
//
// This is READ-ONLY evidence gathering. It does not alter production output,
// does not modify app/chat/page.tsx, and creates no new database rows beyond
// what /api/property/lookup's own normal operation already would for an
// address a caller looks up (identical to a real user pasting that address
// into chat).
//
// Run with: npx tsx scripts/test-canonical-shadow-harness.ts

import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

import { getSupabase } from '../lib/supabaseServer';
import { resolvePropertyId } from '../lib/gateway/intelligenceGateway';
import { buildCanonicalPropertyIntelligence } from '../lib/canonicalPropertyIntelligence';

const BASE_URL = process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'https://chat.homerates.ai';

interface FirstPartyReplicated {
  tickerRate: number | null;
  rieScenarioRate: number | null;
  rieObmmiLabel: string | null;
  decisionScoreAvm: number | null; // d.estimatedValue ?? d.estimatedValueLow ?? null -- the exact bug
  inlinePITI: number | null;
  propertyCardEstimatedValue: number | null;
  propertyCardEstimatedValueLow: number | null;
}

async function getTicker30Y(): Promise<number | null> {
  try {
    const r = await fetch(`${BASE_URL}/api/ticker`);
    if (!r.ok) return null;
    const j = await r.json();
    const item = j?.items?.find((i: any) => i.label === '30Y FIXED');
    const v = parseFloat(item?.value);
    return !isNaN(v) && v > 3 && v < 12 ? v : 6.65; // exact fallback app/chat/page.tsx uses
  } catch {
    return 6.65;
  }
}

async function getRieScenarioRate(price: number, downPct: number, loanType: 'conventional' | 'jumbo', state: string | undefined) {
  try {
    const ltv = parseFloat((100 - downPct).toFixed(2));
    const loanAmount = Math.round(price * (1 - downPct / 100));
    const r = await fetch(`${BASE_URL}/api/rate-intelligence-engine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creditScore: 740, ltv, occupancy: 'primary', loanPurpose: 'purchase', propertyType: 'sfr', loanAmount, lockDays: 30, loanType, state }),
    });
    if (!r.ok) return { rate: null, label: null };
    const j = await r.json();
    const seg = j.marketComparison?.conformingSegments?.find((s: any) => s.seriesId?.includes('LTV80') && s.seriesId?.includes('740'));
    return { rate: seg?.rate ?? j.marketComparison?.marketRate ?? null, label: j.obmmiSegmentLabel ?? null };
  } catch {
    return { rate: null, label: null };
  }
}

async function replicateFirstParty(address: string): Promise<{ propertyCard: any; replicated: FirstPartyReplicated } | null> {
  const lookupRes = await fetch(`${BASE_URL}/api/property/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  const lookupJson = await lookupRes.json().catch(() => null);
  if (!lookupJson?.ok || !lookupJson?.data) return null;
  const d = lookupJson.data;

  const tickerRate = await getTicker30Y();
  const isJumbo = Math.round((d.price ?? 0) * 0.8) > 832_750;
  const { rate: rieScenarioRate, label: rieObmmiLabel } = await getRieScenarioRate(d.price ?? 0, 20, isJumbo ? 'jumbo' : 'conventional', d.state);

  // Exact inline formula from app/chat/page.tsx:2646-2657 (confirmed by trace).
  const principal = (d.price ?? 0) * 0.80;
  const r = (tickerRate ?? 6.65) / 100 / 12;
  const n = 360;
  const pi = principal > 0 ? (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : 0;
  const monthlyTax = (d.annualTaxes ?? (d.price ?? 0) * (d.taxRateEffective ?? 0.0076)) / 12;
  const monthlyIns = (d.price ?? 0) * 0.005 / 12;
  const inlinePITI = Math.round(pi + monthlyTax + monthlyIns);

  // Exact bug from app/chat/page.tsx:2704 (confirmed by trace).
  const decisionScoreAvm = d.estimatedValue ?? d.estimatedValueLow ?? null;

  return {
    propertyCard: d,
    replicated: {
      tickerRate,
      rieScenarioRate,
      rieObmmiLabel,
      decisionScoreAvm,
      inlinePITI,
      propertyCardEstimatedValue: d.estimatedValue ?? null,
      propertyCardEstimatedValueLow: d.estimatedValueLow ?? null,
    },
  };
}

async function shadowCompare(label: string, address: string) {
  console.log(`\n=== ${label}: ${address} ===`);
  const fp = await replicateFirstParty(address);
  const propertyId = await resolvePropertyId(address);
  const canonical = propertyId ? await buildCanonicalPropertyIntelligence(propertyId) : null;

  const row = (field: string, fpVal: unknown, canVal: unknown) =>
    console.log(`  ${field.padEnd(28)} first-party(replicated)=${JSON.stringify(fpVal).padEnd(24)} canonical=${JSON.stringify(canVal)}`);

  row('price', fp?.propertyCard?.price ?? null, canonical?.valuation.listPrice);
  row('beds', fp?.propertyCard?.beds ?? null, canonical?.property.beds);
  row('baths', fp?.propertyCard?.baths ?? null, canonical?.property.baths);
  row('sqft', fp?.propertyCard?.sqft ?? null, canonical?.property.sqft);
  row('valuation (point)', fp?.replicated.decisionScoreAvm ?? null, canonical?.valuation.pointEstimate ?? null);
  row('rate (ticker vs propertyMarketRate)', fp?.replicated.tickerRate ?? null, canonical?.financing?.propertyMarketRate.rate ?? null);
  row('rate (RIE vs rateIntelligence.llpaAdjustedRate)', fp?.replicated.rieScenarioRate ?? null, canonical?.financing?.rateIntelligence.llpaAdjustedRate ?? null);
  row('loan amount', fp?.propertyCard?.price ? Math.round(fp.propertyCard.price * 0.8) : null, canonical?.financing?.loanAmount ?? null);
  row('P&I', null, canonical?.financing?.principalInterestMonthly ?? null);
  row('tax (monthly)', fp?.propertyCard ? Math.round((fp.propertyCard.annualTaxes ?? fp.propertyCard.price * (fp.propertyCard.taxRateEffective ?? 0.0076)) / 12) : null, canonical?.ownershipCosts?.monthlyTaxes ?? null);
  row('insurance (monthly)', fp?.propertyCard ? Math.round(fp.propertyCard.price * 0.005 / 12) : null, canonical?.ownershipCosts?.monthlyInsurance ?? null);
  row('insurance rate assumption', 0.005, canonical?.ownershipCosts?.insuranceAssumption.annualRate ?? null);
  row('HOA', fp?.propertyCard?.hoaMonthly ?? '(not read by first-party)', canonical?.ownershipCosts?.hoaMonthly ?? null);
  row('PITI', fp?.replicated.inlinePITI ?? null, canonical?.ownershipCosts?.pitiMonthly ?? null);
  row('PITIA', '(first-party has no PITIA concept)', canonical?.ownershipCosts?.pitiaMonthly ?? null);
  row('comp count', '(not surfaced in propertyCard)', canonical?.comps.length ?? null);
  row('freshness/asOf', '(none carried to client)', canonical?.provenance.intelligenceComputedAt ?? null);

  return { fp, canonical };
}

async function main() {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured.');

  await shadowCompare('A. DOVERWOOD (condo, no confirmed HOA in this scrape)', '5845 Doverwood Dr #106, Culver City, CA 90230');
  await shadowCompare('B. MATARO (rich existing intelligence)', '1131 Mataro Ct, Pleasanton, CA 94566');

  console.log('\n=== NOTES ===');
  console.log('- "rate (ticker vs marketRef)" and "rate (RIE vs illustrativeScenario)" are two SEPARATE, legitimately different rate concepts (see Stage B rule) -- they are not expected to match each other, only to each be internally consistent with what drives the corresponding payment figure.');
  console.log('- "valuation (point)" first-party column shows the CONFIRMED BUG: decisionScoreCard silently substitutes estimatedValueLow for a missing estimatedValue. Canonical never does this (avmLow/avmHigh are structurally separate fields from pointEstimate).');
  console.log('- HOA: first-party propertyCard DOES carry d.hoaMonthly (shown above), but app/chat/page.tsx never reads it into affordabilityPurchaseCard or the inline PITI calc -- confirmed structural gap, Stage E territory.');

  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
