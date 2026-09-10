// scripts/test-deep-intelligence-parity.ts
//
// North Star Workstream 8 -- Deep Intelligence Parity & External AI Utility
// (2026-09-10).
//
// Proves the new property_analysis field (v1.5) does what a forensic audit
// of a real property (1123 Seaview Ave, Pacific Grove, CA 93950) found
// missing: HomeRates' own narrative synthesis over a property, distinct from
// (never conflated with) canonical AVM, and never including the sibling
// grok.buyer_strategy field (found live to contain an ungrounded specific
// dollar figure). Also regression-guards two real, confirmed bugs found in
// app/property-report/page.tsx (a first-party-only surface, NOT fixed here --
// see ARCHITECTURE_DECISIONS.md) from ever appearing in the canonical/
// external pipeline: a sale-to-list unit-conversion error ("9840.0%" instead
// of "98.4%") and a list-price-as-AVM fallback.
//
// CONTRACT/DATA test, not a ChatGPT-behavior test -- see
// scripts/test-chatgpt-invocation-contract.ts's own header for that distinction.
//
// Run with: npx tsx scripts/test-deep-intelligence-parity.ts

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
import { shapeForExternalContract } from '../lib/gateway/outputShaping';
import { ExternalPropertyIntelligenceV1Schema } from '../lib/gateway/outputSchema';

type Status = 'PASS' | 'FAIL';
interface Result { name: string; status: Status; evidence: string }
const results: Result[] = [];
function record(name: string, status: Status, evidence: string) {
  results.push({ name, status, evidence });
  console.log(`[${status}] ${name} -- ${evidence}`);
}

async function insertTestProperty(sb: any, addressFull: string, opts: {
  price?: number;
  grokSummary?: string;
  grokHighlights?: string[];
  grokBuyerStrategy?: string;
  saleToList?: number;
  avm?: number;
}): Promise<{ id: string; grokKey: string | null }> {
  const now = new Date().toISOString();
  const { data: prop } = await sb.from('properties').insert({
    address_full: addressFull, address_line: addressFull, city: 'Testville', state: 'ZZ', zip: '00001',
    beds: 3, baths: 2, sqft: 1500, latest_listing_status: 'FOR_SALE', latest_value: opts.avm ?? null,
    enriched_at: now, enrichment_source: 'test_harness', confidence: 0.65, updated_at: now,
  }).select('id').single();
  await sb.from('property_snapshots').insert({
    property_id: prop.id, snapshot_type: 'full', source: 'test_harness',
    data: { city: 'Testville', state: 'ZZ', price: opts.price ?? 500_000, estimatedValue: opts.avm ?? null },
    fetched_at: now, expires_at: new Date(Date.now() + 86_400_000).toISOString(), confidence: 0.65,
  });
  let grokKey: string | null = null;
  if (opts.grokSummary || opts.grokHighlights || opts.grokBuyerStrategy || opts.saleToList != null) {
    grokKey = addressFull.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const { error } = await sb.from('grok_property_cache').upsert({
      address_normalized: grokKey,
      address_raw: addressFull,
      grok_result: {
        grok_intelligence_summary: opts.grokSummary ?? null,
        key_highlights: opts.grokHighlights ?? [],
        buyer_strategy: opts.grokBuyerStrategy ?? null,
        market_sale_to_list: opts.saleToList ?? null,
        life_fit_score: 78,
        estimated_piti: 9999,
        data_freshness: 'Live data as of a fake test timestamp',
        confidence: 'medium',
      },
      fetched_at: now,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    }, { onConflict: 'address_normalized' });
    if (error) throw new Error(`grok_property_cache upsert failed: ${error.message}`);
  }
  return { id: prop.id, grokKey };
}

async function main() {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured.');
  const testIds: string[] = [];
  const testGrokKeys: string[] = [];

  try {
    // ===== A. REAL PRODUCTION PROPERTY: 1123 Seaview Ave, Pacific Grove, CA 93950 =====
    // The actual forensic-audit fixture. Confirmed absent of any real AVM
    // (properties.latest_value null, grok zillow/redfin_estimate both null)
    // but with real comps, real location_intelligence, and a real
    // grok_intelligence_summary/key_highlights -- exactly the "no canonical
    // AVM + valuation context exists" case Phase 13 calls mandatory.
    {
      const address = '1123 Seaview Ave, Pacific Grove, CA 93950';
      const id = await resolvePropertyId(address);
      if (id) {
        const canonical = await buildCanonicalPropertyIntelligence(id);
        const shaped = shapeForExternalContract(address, canonical);
        const parsed = ExternalPropertyIntelligenceV1Schema.safeParse(shaped);
        record('A1. Seaview: schema valid, contract_version v1.5', parsed.success && shaped.contract_version === 'property-intelligence-v1.5' ? 'PASS' : 'FAIL', JSON.stringify(parsed.success ? 'valid' : (parsed as any).error?.issues?.slice(0, 3)));

        // Mandatory case: AVM unavailable, but valuation context (property_analysis) exists.
        const avmNull = shaped.value_intelligence?.avm.value === null;
        const analysisPresent = shaped.property_analysis?.narrative?.value != null || (shaped.property_analysis?.highlights.length ?? 0) > 0;
        record('A2. Seaview: AVM null AND property_analysis present -- distinguished, not conflated', avmNull && analysisPresent ? 'PASS' : 'FAIL', JSON.stringify({ avm: shaped.value_intelligence?.avm, property_analysis: shaped.property_analysis }));

        // Asking price never silently becomes AVM.
        const priceBasisIsAskingPrice = shaped.financing_intelligence?.purchase_price_basis.source === 'CURRENT_ASKING_PRICE';
        record('A3. Seaview: financing uses CURRENT_ASKING_PRICE, avm stays null', priceBasisIsAskingPrice && avmNull ? 'PASS' : 'FAIL', JSON.stringify(shaped.financing_intelligence?.purchase_price_basis));

        // buyer_strategy (raw grok field, contains "$1.3M+" in the real live
        // data) must never appear anywhere in the shaped response.
        const fullJson = JSON.stringify(shaped);
        const noBuyerStrategyLeak = !/\$1\.3M|comps suggest potential|Contact owner directly/i.test(fullJson);
        record('A4. Seaview: raw grok.buyer_strategy text does not leak into the external response', noBuyerStrategyLeak ? 'PASS' : 'FAIL', noBuyerStrategyLeak ? 'not found' : 'FOUND -- leak');

        // Real regression guard: sale-to-list must be the real percentage
        // (98.4), never a x100-multiplied "9840" -- the exact bug confirmed
        // in app/property-report/page.tsx, must never reach canonical/external.
        const saleToList = shaped.market_location_intelligence.market.sale_to_list_pct.value;
        const saleToListSane = saleToList == null || (saleToList >= 0 && saleToList <= 200);
        record('A5. Seaview: sale_to_list_pct is a sane percentage (not a x100 unit-conversion bug)', saleToListSane ? 'PASS' : 'FAIL', `value=${saleToList}`);

        // Raw Grok internal-only fields must never leak (life_fit_score,
        // estimated_piti [Grok's own separate PITI calc], data_freshness,
        // confidence -- none of these are part of the external contract).
        const noRawGrokLeak = !/life_fit_score|"estimated_piti":9999|data_freshness|"confidence":"medium"/i.test(fullJson);
        record('A6. Seaview: raw Grok-only fields (life_fit_score, its own estimated_piti, etc.) do not leak', noRawGrokLeak ? 'PASS' : 'FAIL', noRawGrokLeak ? 'not found' : 'FOUND -- leak');

        // Highlights are real, comps are real, location is real -- all present together.
        record('A7. Seaview: comps + location + property_analysis all present (real enrichment)', (shaped.value_intelligence?.comparables.length ?? 0) > 0 && !!shaped.market_location_intelligence.location && !!shaped.property_analysis ? 'PASS' : 'FAIL', JSON.stringify({ comps: shaped.value_intelligence?.comparables.length, hasLocation: !!shaped.market_location_intelligence.location, hasAnalysis: !!shaped.property_analysis }));
      } else {
        console.log('  (Seaview not in corpus in this environment -- A skipped)');
      }
    }

    // ===== B. SYNTHETIC: enriching property (no grok data at all) =====
    {
      const addr = `${Date.now()} Enriching Parity Ln, Testville, ZZ 00001`;
      const p = await insertTestProperty(sb, addr, { price: 500_000 });
      testIds.push(p.id);
      const canonical = await buildCanonicalPropertyIntelligence(p.id);
      const shaped = shapeForExternalContract(addr, canonical);
      const ok = shaped.property_analysis === null && shaped.intelligence_progress?.status === 'enriching';
      record('B. Enriching property: property_analysis null, does not claim unavailable deep intelligence', ok ? 'PASS' : 'FAIL', JSON.stringify({ property_analysis: shaped.property_analysis, progress: shaped.intelligence_progress }));
    }

    // ===== C. SYNTHETIC: canonical AVM present (properties.latest_value set) =====
    {
      const addr = `${Date.now()} Real AVM Ave, Testville, ZZ 00001`;
      const p = await insertTestProperty(sb, addr, { price: 500_000, avm: 510_000, grokSummary: 'A well-kept starter home in a stable neighborhood.' });
      testIds.push(p.id);
      if (p.grokKey) testGrokKeys.push(p.grokKey);
      const canonical = await buildCanonicalPropertyIntelligence(p.id);
      const shaped = shapeForExternalContract(addr, canonical);
      const avmCorrect = shaped.value_intelligence?.avm.value === 510_000;
      const analysisSeparate = shaped.property_analysis?.narrative?.value === 'A well-kept starter home in a stable neighborhood.';
      record('C. AVM present: correctly identified as AVM, property_analysis is a separate field', avmCorrect && analysisSeparate ? 'PASS' : 'FAIL', JSON.stringify({ avm: shaped.value_intelligence?.avm, analysis: shaped.property_analysis }));
    }

    // ===== D. SYNTHETIC: sale_to_list stored correctly (98.4, not 0.984 or 9840) =====
    {
      const addr = `${Date.now()} Sale To List Ct, Testville, ZZ 00001`;
      const p = await insertTestProperty(sb, addr, { price: 500_000, saleToList: 98.4, grokSummary: 'Steady market activity nearby.' });
      testIds.push(p.id);
      if (p.grokKey) testGrokKeys.push(p.grokKey);
      const canonical = await buildCanonicalPropertyIntelligence(p.id);
      const shaped = shapeForExternalContract(addr, canonical);
      const correct = shaped.market_location_intelligence.market.sale_to_list_pct.value === 98.4;
      record('D. sale_to_list_pct passes through as stored (98.4), never re-multiplied', correct ? 'PASS' : 'FAIL', `value=${shaped.market_location_intelligence.market.sale_to_list_pct.value}`);
    }

    // ===== E. SYNTHETIC: buyer_strategy present in raw grok but never captured upstream =====
    {
      const addr = `${Date.now()} Buyer Strategy Blvd, Testville, ZZ 00001`;
      const p = await insertTestProperty(sb, addr, {
        price: 500_000,
        grokSummary: 'A safe, factual market summary with no invented figures.',
        grokBuyerStrategy: 'Comps suggest potential for $650K+ value, contact owner directly.',
      });
      testIds.push(p.id);
      if (p.grokKey) testGrokKeys.push(p.grokKey);
      const canonical = await buildCanonicalPropertyIntelligence(p.id);
      const shaped = shapeForExternalContract(addr, canonical);
      const fullJson = JSON.stringify(shaped);
      const noBuyerStrategy = !/\$650K|Comps suggest potential|contact owner directly/i.test(fullJson);
      const summaryStillPresent = shaped.property_analysis?.narrative?.value === 'A safe, factual market summary with no invented figures.';
      record('E. buyer_strategy never captured upstream (canonical), even when grok_intelligence_summary is present', noBuyerStrategy && summaryStillPresent ? 'PASS' : 'FAIL', JSON.stringify({ leaked: !noBuyerStrategy, analysis: shaped.property_analysis }));
    }

    // ===== F. property_analysis fields carry correct claim_type =====
    {
      const addr = `${Date.now()} Claim Type Way, Testville, ZZ 00001`;
      const p = await insertTestProperty(sb, addr, { price: 500_000, grokSummary: 'Test narrative.', grokHighlights: ['Highlight one', 'Highlight two'] });
      testIds.push(p.id);
      if (p.grokKey) testGrokKeys.push(p.grokKey);
      const canonical = await buildCanonicalPropertyIntelligence(p.id);
      const shaped = shapeForExternalContract(addr, canonical);
      const claimTypeCorrect = shaped.property_analysis?.narrative?.claim_type === 'AI INTERPRETATION';
      const highlightsCorrect = JSON.stringify(shaped.property_analysis?.highlights) === JSON.stringify(['Highlight one', 'Highlight two']);
      const parsed = ExternalPropertyIntelligenceV1Schema.safeParse(shaped);
      record('F. property_analysis.narrative.claim_type is AI INTERPRETATION; highlights pass through; schema valid', claimTypeCorrect && highlightsCorrect && parsed.success ? 'PASS' : 'FAIL', JSON.stringify(shaped.property_analysis));
    }
  } finally {
    console.log('\n=== CLEANUP ===');
    if (testGrokKeys.length) await sb.from('grok_property_cache').delete().in('address_normalized', testGrokKeys);
    if (testIds.length) {
      await sb.from('property_snapshots').delete().in('property_id', testIds);
      await sb.from('properties').delete().in('id', testIds);
    }
    console.log('deleted test property ids:', testIds, 'grok cache keys:', testGrokKeys);
  }

  console.log('\n=== FINAL RESULTS ===');
  console.table(results.map((r) => ({ name: r.name, status: r.status })));
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\nPASS=${pass} FAIL=${fail} TOTAL=${results.length}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
