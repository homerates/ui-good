// scripts/test-chatgpt-invocation-contract.ts
//
// North Star Workstream 7 -- ChatGPT Invocation Behavior + External Prompt
// Surface (2026-09-10).
//
// CONTRACT TEST, not a ChatGPT behavior test. This proves the model-facing
// TEXT and DERIVED FIELDS exist and say what this workstream's real,
// manually-observed ChatGPT evidence showed was missing -- it cannot and does
// not prove ChatGPT actually follows this guidance. That evidence only comes
// from running real prompts through a live, OAuth-connected ChatGPT session
// (as Workstream 7's Phase 2 did) and observing the response, which no
// automated script in this repo can substitute for. See ARCHITECTURE_DECISIONS.md
// AD-21 for the full real-evidence trail this contract change was built on.
//
// Run with: npx tsx scripts/test-chatgpt-invocation-contract.ts

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
import { shapeForExternalContract } from '../lib/gateway/outputShaping';
import { ExternalPropertyIntelligenceV1Schema } from '../lib/gateway/outputSchema';
import { buildCanonicalPropertyIntelligence } from '../lib/canonicalPropertyIntelligence';

type Status = 'PASS' | 'FAIL';
interface Result { name: string; status: Status; evidence: string }
const results: Result[] = [];
function record(name: string, status: Status, evidence: string) {
  results.push({ name, status, evidence });
  console.log(`[${status}] ${name} -- ${evidence}`);
}

async function insertTestProperty(sb: any, addressFull: string, opts: { withComps?: boolean; withLocation?: boolean } = {}): Promise<{ id: string; grokKey: string | null }> {
  const now = new Date().toISOString();
  const { data: prop } = await sb.from('properties').insert({
    address_full: addressFull, address_line: addressFull, city: 'Testville', state: 'ZZ', zip: '00001',
    beds: 3, baths: 2, sqft: 1500, latest_listing_status: 'FOR_SALE',
    enriched_at: now, enrichment_source: 'test_harness', confidence: 0.65, updated_at: now,
  }).select('id').single();
  await sb.from('property_snapshots').insert({
    property_id: prop.id, snapshot_type: 'full', source: 'test_harness',
    data: { city: 'Testville', state: 'ZZ', price: 500_000 },
    fetched_at: now, expires_at: new Date(Date.now() + 86_400_000).toISOString(), confidence: 0.65,
  });
  let grokKey: string | null = null;
  if (opts.withComps || opts.withLocation) {
    grokKey = addressFull.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const { error: grokErr } = await sb.from('grok_property_cache').upsert({
      address_normalized: grokKey,
      address_raw: addressFull,
      grok_result: {
        comparable_sales: opts.withComps ? [{ address: '1 Comp St, Testville, ZZ', sold_price: 495_000, sold_date: 'Jan 2026' }] : [],
        location_intelligence: opts.withLocation ? { narrative: 'Quiet, walkable area near good schools.', sub_scores: [] } : undefined,
      },
      fetched_at: now,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    }, { onConflict: 'address_normalized' });
    if (grokErr) throw new Error(`grok_property_cache upsert failed: ${grokErr.message}`);
  }
  return { id: prop.id, grokKey };
}

async function main() {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured.');
  const testIds: string[] = [];
  const testGrokKeys: string[] = [];

  try {
    // A. TOOL_DESCRIPTION contains the three real, evidenced guardrails.
    {
      const routeSource = fs.readFileSync(path.resolve(process.cwd(), 'app/api/mcp/property-intelligence/route.ts'), 'utf8');
      const hasFollowUpOffer = /offer to check again shortly/i.test(routeSource);
      const hasValuationGuardrail = /never state\s*'?\s*a specific dollar figure or range as a fair-value conclusion|never state\s*.*fair-value conclusion/i.test(routeSource) || /fair-value conclusion/i.test(routeSource);
      const hasCtaSpecificity = /Relay what\s*'?\s*\+?\s*'?deep_intelligence\.capability_summary actually says|capability_summary actually says/i.test(routeSource);
      record('A1. TOOL_DESCRIPTION offers a follow-up when enriching', hasFollowUpOffer ? 'PASS' : 'FAIL', `present: ${hasFollowUpOffer}`);
      record('A2. TOOL_DESCRIPTION guards against unsupported valuation-range synthesis', hasValuationGuardrail ? 'PASS' : 'FAIL', `present: ${hasValuationGuardrail}`);
      record('A3. TOOL_DESCRIPTION instructs relaying capability_summary specifics, not genericizing', hasCtaSpecificity ? 'PASS' : 'FAIL', `present: ${hasCtaSpecificity}`);
    }

    // B. capability_summary is dynamic -- enriching vs enriched differ, and
    // never claims content that isn't actually present.
    {
      const enrichingAddr = `${Date.now()} Enriching Test Ln, Testville, ZZ 00001`;
      const enriched = await insertTestProperty(sb, enrichingAddr, {});
      testIds.push(enriched.id);
      const canonicalEnriching = await buildCanonicalPropertyIntelligence(enriched.id);
      const shapedEnriching = shapeForExternalContract(enrichingAddr, canonicalEnriching);
      const parsedEnriching = ExternalPropertyIntelligenceV1Schema.safeParse(shapedEnriching);
      const enrichingOk = shapedEnriching.intelligence_progress?.status === 'enriching'
        && shapedEnriching.intelligence_progress?.follow_up_recommended === true
        && !/comparable sales now|market and location context now/.test(shapedEnriching.deep_intelligence?.capability_summary ?? '')
        && parsedEnriching.success;
      record('B1. Enriching property: progress=enriching, follow_up_recommended, summary does not claim comps/location', enrichingOk ? 'PASS' : 'FAIL', JSON.stringify({ progress: shapedEnriching.intelligence_progress, summary: shapedEnriching.deep_intelligence?.capability_summary }));

      const richAddr = `${Date.now()} Enriched Test Ave, Testville, ZZ 00001`;
      const rich = await insertTestProperty(sb, richAddr, { withComps: true, withLocation: true });
      testIds.push(rich.id);
      if (rich.grokKey) testGrokKeys.push(rich.grokKey);
      const canonicalRich = await buildCanonicalPropertyIntelligence(rich.id);
      const shapedRich = shapeForExternalContract(richAddr, canonicalRich);
      const parsedRich = ExternalPropertyIntelligenceV1Schema.safeParse(shapedRich);
      const richSummary = shapedRich.deep_intelligence?.capability_summary ?? '';
      const richOk = shapedRich.intelligence_progress?.status === 'enriched'
        && shapedRich.intelligence_progress?.follow_up_recommended === false
        && /comparable sales/i.test(richSummary)
        && /market and location context/i.test(richSummary)
        && !/finishes gathering/i.test(richSummary)
        && parsedRich.success;
      record('B2. Enriched property: progress=enriched, follow_up_recommended false, summary claims comps+location', richOk ? 'PASS' : 'FAIL', JSON.stringify({ progress: shapedRich.intelligence_progress, summary: richSummary }));

      const partialAddr = `${Date.now()} Partial Enrich Rd, Testville, ZZ 00001`;
      const partial = await insertTestProperty(sb, partialAddr, { withComps: true, withLocation: false });
      testIds.push(partial.id);
      if (partial.grokKey) testGrokKeys.push(partial.grokKey);
      const canonicalPartial = await buildCanonicalPropertyIntelligence(partial.id);
      const shapedPartial = shapeForExternalContract(partialAddr, canonicalPartial);
      const partialSummary = shapedPartial.deep_intelligence?.capability_summary ?? '';
      const partialOk = shapedPartial.intelligence_progress?.status === 'enriched'
        && /comparable sales/i.test(partialSummary)
        && !/market and location context now|context\./i.test(partialSummary.replace(/gathering them\.$/, ''))
        || /finishes gathering/i.test(partialSummary);
      record('B3. Comps present but no location: summary does not claim location as already available', partialOk ? 'PASS' : 'FAIL', JSON.stringify({ progress: shapedPartial.intelligence_progress, summary: partialSummary }));

      // Deep-intelligence destination is address-keyed, never internal-id-keyed.
      const destinationSafe = !!shapedRich.deep_intelligence?.destination
        && shapedRich.deep_intelligence.destination.includes(encodeURIComponent(richAddr).replace(/%20/g, '+'))
        && !shapedRich.deep_intelligence.destination.includes(rich.id);
      record('B4. deep_intelligence.destination is address-keyed, never contains the internal property id', destinationSafe ? 'PASS' : 'FAIL', shapedRich.deep_intelligence?.destination ?? 'null');
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
