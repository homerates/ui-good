// scripts/test-first-party-canonical-consistency.ts
//
// Canonical Property Intelligence Consistency Workstream, Stage E (2026-09-08).
//
// Proves the new first-party endpoint (app/api/property/intelligence/route.ts)
// and the external MCP contract both derive from -- and agree with -- the
// SAME canonical builder, for the same property, at the same moment. This is
// the actual drift guard: if either surface ever starts computing its own
// value again, one of these assertions catches it.
//
// Run with: npx tsx scripts/test-first-party-canonical-consistency.ts

import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

import { NextRequest } from 'next/server';
import { getSupabase } from '../lib/supabaseServer';
import { resolvePropertyId } from '../lib/gateway/intelligenceGateway';
import { buildCanonicalPropertyIntelligence } from '../lib/canonicalPropertyIntelligence';
import { issueCredential } from '../lib/gateway/credentials';
import { GET as firstPartyGET } from '../app/api/property/intelligence/route';
import { POST as mcpPOST } from '../app/api/mcp/property-intelligence/route';

type Status = 'PASS' | 'FAIL';
interface Result { name: string; status: Status; evidence: string }
const results: Result[] = [];
function record(name: string, status: Status, evidence: string) {
  results.push({ name, status, evidence });
  console.log(`[${status}] ${name} -- ${evidence}`);
}

async function callFirstParty(address: string) {
  const req = new NextRequest(`http://localhost/api/property/intelligence?address=${encodeURIComponent(address)}`);
  const res = await firstPartyGET(req);
  return res.json();
}

async function callExternal(address: string, key: string) {
  const req = new NextRequest('http://localhost/api/mcp/property-intelligence', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': 'tools/call',
      'mcp-name': 'get_property_intelligence',
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: {
        name: 'get_property_intelligence',
        arguments: { address },
        _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} },
      },
    }),
  });
  const res = await mcpPOST(req);
  const json = await res.json();
  return JSON.parse(json.result.content[0].text);
}

async function main() {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured.');

  const { data: partner } = await sb.from('gateway_partners').insert({ name: 'Stage E Consistency Test Partner', contact_email: 'gateway-validation@homerates.ai' }).select('*').single();
  await sb.from('gateway_partners').update({ status: 'active' }).eq('id', partner.id);
  const cred = await issueCredential(partner.id, ['property_intelligence:read']);

  try {
    for (const address of ['5845 Doverwood Dr #106, Culver City, CA 90230', '1131 Mataro Ct, Pleasanton, CA 94566']) {
      console.log(`\n=== ${address} ===`);
      const id = await resolvePropertyId(address);
      if (!id) { console.log('  (not in corpus in this environment -- skipped)'); continue; }
      const canonical = await buildCanonicalPropertyIntelligence(id);
      const fp = await callFirstParty(address);
      const ext = await callExternal(address, cred.plaintextKey);

      const rateOk = fp.ok && fp.data.financing?.propertyMarketRate.rate === canonical?.financing?.propertyMarketRate.rate
        && ext.financing_intelligence?.market_rate.value === canonical?.financing?.propertyMarketRate.rate;
      record(`${address} -- propertyRate: firstParty == canonical == external`, rateOk ? 'PASS' : 'FAIL', JSON.stringify({ fp: fp.data?.financing?.propertyMarketRate.rate, canonical: canonical?.financing?.propertyMarketRate.rate, ext: ext.financing_intelligence?.market_rate.value }));

      const pitiOk = fp.ok && fp.data.ownershipCosts?.pitiMonthly === canonical?.ownershipCosts?.pitiMonthly
        && ext.ownership_cost_intelligence?.estimated_piti.value === canonical?.ownershipCosts?.pitiMonthly;
      record(`${address} -- PITI: firstParty == canonical == external`, pitiOk ? 'PASS' : 'FAIL', JSON.stringify({ fp: fp.data?.ownershipCosts?.pitiMonthly, canonical: canonical?.ownershipCosts?.pitiMonthly, ext: ext.ownership_cost_intelligence?.estimated_piti.value }));

      const hoaOk = fp.ok && fp.data.ownershipCosts?.hoaMonthly === canonical?.ownershipCosts?.hoaMonthly
        && ext.ownership_cost_intelligence?.hoa.value === canonical?.ownershipCosts?.hoaMonthly;
      record(`${address} -- HOA: firstParty == canonical == external`, hoaOk ? 'PASS' : 'FAIL', JSON.stringify({ fp: fp.data?.ownershipCosts?.hoaMonthly, canonical: canonical?.ownershipCosts?.hoaMonthly, ext: ext.ownership_cost_intelligence?.hoa.value }));

      const valOk = fp.ok && fp.data.valuation.pointEstimate === canonical?.valuation.pointEstimate
        && ext.value_intelligence?.avm.value === canonical?.valuation.pointEstimate;
      record(`${address} -- point valuation: firstParty == canonical == external`, valOk ? 'PASS' : 'FAIL', JSON.stringify({ fp: fp.data?.valuation.pointEstimate, canonical: canonical?.valuation.pointEstimate, ext: ext.value_intelligence?.avm.value }));

      // G: Rate Intelligence's own rate is explicitly allowed (expected) to differ.
      if (canonical?.financing) {
        const different = canonical.financing.rateIntelligence.llpaAdjustedRate !== canonical.financing.propertyMarketRate.rate;
        record(`${address} -- Rate Intelligence rate differs from Property Intelligence rate (allowed)`, 'PASS', `llpaAdjustedRate=${canonical.financing.rateIntelligence.llpaAdjustedRate} propertyMarketRate=${canonical.financing.propertyMarketRate.rate} different=${different}`);
      }
    }
  } finally {
    console.log('\n=== CLEANUP ===');
    await sb.from('gateway_credentials').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('partner_id', partner.id);
    await sb.from('gateway_partners').update({ status: 'cancelled' }).eq('id', partner.id);
  }

  console.log('\n=== FINAL RESULTS ===');
  console.table(results.map((r) => ({ name: r.name, status: r.status })));
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\nPASS=${pass} FAIL=${fail} TOTAL=${results.length}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
