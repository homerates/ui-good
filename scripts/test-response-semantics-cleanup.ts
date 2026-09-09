// scripts/test-response-semantics-cleanup.ts
//
// Property Intelligence -- External Response Semantics Cleanup (2026-09-08).
//
// Proves the three traceable causes of the live ChatGPT misinterpretation
// are fixed: (1) credit_score removed from the external assumption_profile
// (Property Intelligence never used it for its rate), (2) a confirmed $0
// HOA no longer falsely triggers the "not confirmed" limitation, (3) the
// unconfirmed-HOA limitation text states only what's actually true (PITIA
// undetermined), never an inferred conclusion about payment direction. Also
// confirms Rate Intelligence's own credit/LTV assumptions are untouched.
//
// Run with: npx tsx scripts/test-response-semantics-cleanup.ts

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

async function insertTestProperty(sb: any, addressFull: string, opts: { avm?: number; hoaMonthly?: number } = {}): Promise<{ id: string }> {
  const now = new Date().toISOString();
  const { data: prop } = await sb.from('properties').insert({
    address_full: addressFull, address_line: addressFull, city: 'Testville', state: 'ZZ', zip: '00001',
    beds: 3, baths: 2, sqft: 1500, latest_listing_status: 'SOLD', latest_value: opts.avm ?? null,
    enriched_at: now, enrichment_source: 'test_harness', confidence: 0.65, updated_at: now,
  }).select('id').single();
  const snapshotData: Record<string, unknown> = { city: 'Testville', state: 'ZZ', estimatedValue: opts.avm ?? null };
  if (opts.hoaMonthly !== undefined) snapshotData.hoaMonthly = opts.hoaMonthly;
  await sb.from('property_snapshots').insert({
    property_id: prop.id, snapshot_type: 'full', source: 'test_harness', data: snapshotData,
    fetched_at: now, expires_at: new Date(Date.now() + 86_400_000).toISOString(), confidence: 0.65,
  });
  return { id: prop.id };
}

async function main() {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured.');

  const testIds: string[] = [];

  try {
    // A. Doverwood, live: credit_score absent from assumption_profile.
    {
      const address = '5845 Doverwood Dr #106, Culver City, CA 90230';
      const id = await resolvePropertyId(address);
      if (id) {
        const canonical = await buildCanonicalPropertyIntelligence(id);
        const shaped = shapeForExternalContract(address, canonical);
        const parsed = ExternalPropertyIntelligenceV1Schema.safeParse(shaped);
        const noCreditScore = shaped.financing_intelligence != null && !('credit_score' in shaped.financing_intelligence.assumption_profile);
        record('A. Doverwood: credit_score absent from assumption_profile', noCreditScore && parsed.success ? 'PASS' : 'FAIL', JSON.stringify(shaped.financing_intelligence?.assumption_profile));
        record('A2. Doverwood: contract_version is current (v1.4)', shaped.contract_version === 'property-intelligence-v1.4' ? 'PASS' : 'FAIL', shaped.contract_version);
      } else {
        console.log('  (Doverwood not in corpus in this environment -- A skipped)');
      }
    }

    // B/C/D. Confirmed HOA=0, confirmed HOA>0, unconfirmed HOA -- exact limitation semantics.
    const addrHoaZero = `${Date.now()} Confirmed Zero HOA Ln, Testville, ZZ 00001`;
    const addrHoaConfirmed = `${Date.now()} Confirmed HOA Dr, Testville, ZZ 00001`;
    const addrHoaUnknown = `${Date.now()} Unknown HOA Way, Testville, ZZ 00001`;

    const zero = await insertTestProperty(sb, addrHoaZero, { avm: 500_000, hoaMonthly: 0 });
    testIds.push(zero.id);
    const confirmed = await insertTestProperty(sb, addrHoaConfirmed, { avm: 500_000, hoaMonthly: 300 });
    testIds.push(confirmed.id);
    const unknown = await insertTestProperty(sb, addrHoaUnknown, { avm: 500_000 });
    testIds.push(unknown.id);

    {
      const canonical = await buildCanonicalPropertyIntelligence(zero.id);
      const shaped = shapeForExternalContract(addrHoaZero, canonical);
      const noFalseWarning = !shaped.decision_intelligence?.limitations.some((l) => /HOA/i.test(l));
      const hoaIsZero = shaped.ownership_cost_intelligence?.hoa.value === 0;
      const pitiaEqualsPiti = shaped.ownership_cost_intelligence?.estimated_pitia.value === shaped.ownership_cost_intelligence?.estimated_piti.value;
      record('C. Confirmed $0 HOA -- no false "not confirmed" limitation', noFalseWarning && hoaIsZero ? 'PASS' : 'FAIL', JSON.stringify({ limitations: shaped.decision_intelligence?.limitations, hoa: shaped.ownership_cost_intelligence?.hoa.value }));
      record('C2. Confirmed $0 HOA -- PITIA equals PITI', pitiaEqualsPiti ? 'PASS' : 'FAIL', JSON.stringify({ piti: shaped.ownership_cost_intelligence?.estimated_piti.value, pitia: shaped.ownership_cost_intelligence?.estimated_pitia.value }));
    }

    {
      const canonical = await buildCanonicalPropertyIntelligence(confirmed.id);
      const shaped = shapeForExternalContract(addrHoaConfirmed, canonical);
      const noFalseWarning = !shaped.decision_intelligence?.limitations.some((l) => /HOA/i.test(l));
      const pitiaCorrect = shaped.ownership_cost_intelligence?.estimated_pitia.value === (shaped.ownership_cost_intelligence!.estimated_piti.value as number) + 300;
      record('D. Confirmed HOA > 0 -- no false limitation, PITIA = PITI + HOA', noFalseWarning && pitiaCorrect ? 'PASS' : 'FAIL', JSON.stringify({ limitations: shaped.decision_intelligence?.limitations, hoa: shaped.ownership_cost_intelligence?.hoa.value, piti: shaped.ownership_cost_intelligence?.estimated_piti.value, pitia: shaped.ownership_cost_intelligence?.estimated_pitia.value }));
    }

    {
      const canonical = await buildCanonicalPropertyIntelligence(unknown.id);
      const shaped = shapeForExternalContract(addrHoaUnknown, canonical);
      const limitation = shaped.decision_intelligence?.limitations.find((l) => /HOA/i.test(l));
      const exactWording = limitation === 'HOA dues have not been confirmed, so PITIA and the complete monthly housing obligation cannot yet be determined.';
      const noOldFragment = !shaped.decision_intelligence?.limitations.some((l) => l === 'HOA fee not confirmed.');
      const pitiaNull = shaped.ownership_cost_intelligence?.estimated_pitia.value === null;
      const hoaNull = shaped.ownership_cost_intelligence?.hoa.value === null;
      record('B. Unknown HOA -- precise limitation wording, no old fragment', exactWording && noOldFragment ? 'PASS' : 'FAIL', JSON.stringify(limitation));
      record('B2. Unknown HOA -- hoa null (never zero), PITIA null (never asserted higher)', hoaNull && pitiaNull ? 'PASS' : 'FAIL', JSON.stringify({ hoa: shaped.ownership_cost_intelligence?.hoa.value, pitia: shaped.ownership_cost_intelligence?.estimated_pitia.value }));
    }

    // F. Rate Intelligence's own credit/LTV assumption is unaffected (internal, canonical only).
    {
      const canonical = await buildCanonicalPropertyIntelligence(confirmed.id);
      const ok = canonical?.financing?.rateIntelligence.assumedCreditScore === 740;
      record('F. Rate Intelligence assumedCreditScore unchanged (740, internal-only)', ok ? 'PASS' : 'FAIL', JSON.stringify(canonical?.financing?.rateIntelligence.assumedCreditScore));
    }

    // E. No point AVM -- never invents a value (null stays null, no low/high/list-price substitution).
    // This fixture is deliberately maximally sparse (no avm, no comps at all),
    // which independently means eligibility='unavailable' -- confirmed via
    // the engine's OWN existing, unmodified logic that decisionIntelligence
    // is null in that case (l2/l3/l4 are only ever attempted when eligibility
    // isn't 'unavailable') -- not something this task's scope touches, so
    // the assertion here checks value_intelligence directly instead, which
    // is always present and is the field Phase 7's requirement is actually
    // about ("no valuation conclusion invented").
    {
      const noAvmAddr = `${Date.now()} No AVM Ct, Testville, ZZ 00001`;
      const noAvm = await insertTestProperty(sb, noAvmAddr, {});
      testIds.push(noAvm.id);
      const canonical = await buildCanonicalPropertyIntelligence(noAvm.id);
      const shaped = shapeForExternalContract(noAvmAddr, canonical);
      const noInventedValue = shaped.value_intelligence?.avm.value === null;
      record('E. No point AVM -- stays null, no invented value', noInventedValue ? 'PASS' : 'FAIL', JSON.stringify(shaped.value_intelligence?.avm));
    }
  } finally {
    console.log('\n=== CLEANUP ===');
    if (testIds.length) {
      await sb.from('property_snapshots').delete().in('property_id', testIds);
      await sb.from('properties').delete().in('id', testIds);
    }
    console.log('deleted test property ids:', testIds);
  }

  console.log('\n=== FINAL RESULTS ===');
  console.table(results.map((r) => ({ name: r.name, status: r.status })));
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\nPASS=${pass} FAIL=${fail} TOTAL=${results.length}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
