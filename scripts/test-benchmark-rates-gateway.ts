// scripts/test-benchmark-rates-gateway.ts
//
// North Star Workstream 10 -- Intelligence Gateway Capability Architecture.
// Tests the new get_benchmark_rates capability: lib/market-data/benchmarkRates.ts
// (data layer) -> lib/gateway/benchmarkRatesGateway.ts (auth/scope/rate-limit/
// kill-switch pipeline, identical order to getPropertyIntelligence()) ->
// lib/gateway/benchmarkRatesSchema.ts (external contract validation) ->
// app/api/mcp/property-intelligence/route.ts (tools/list + tools/call
// dispatch for the second tool on the same MCP server).
//
// CONTRACT/DATA test, not a ChatGPT-behavior test -- see
// scripts/test-chatgpt-invocation-contract.ts's own header for that distinction.
//
// Run with: npx tsx scripts/test-benchmark-rates-gateway.ts

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
import { getBenchmarkRates } from '../lib/market-data/benchmarkRates';
import { shapeBenchmarkRatesForExternalContract } from '../lib/gateway/benchmarkRatesShaping';
import { BenchmarkRatesV1Schema } from '../lib/gateway/benchmarkRatesSchema';
import { getBenchmarkRatesGated } from '../lib/gateway/benchmarkRatesGateway';
import { issueCredential, revokeCredential, ALLOWED_GATEWAY_SCOPES } from '../lib/gateway/credentials';
import { authenticateRequest, requireAnyScope, requireScope } from '../lib/gateway/auth';
import { POST as mcpPost } from '../app/api/mcp/property-intelligence/route';

type Status = 'PASS' | 'FAIL';
interface Result { name: string; status: Status; evidence: string }
const results: Result[] = [];
function record(name: string, status: Status, evidence: string) {
  results.push({ name, status, evidence });
  console.log(`[${status}] ${name} -- ${evidence}`);
}

async function main() {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured.');

  // ===== A. Data layer =====

  const raw = await getBenchmarkRates();
  record('A1. All 3 series present (thirtyYearFixed/fifteenYearFixed/fiveOneArm)',
    raw.thirtyYearFixed != null && raw.fifteenYearFixed != null && raw.fiveOneArm != null ? 'PASS' : 'FAIL',
    JSON.stringify(raw));

  record('A2. asOf is the FRED observation date, never null when a real value exists',
    raw.thirtyYearFixed.value == null || raw.thirtyYearFixed.asOf != null ? 'PASS' : 'FAIL',
    JSON.stringify({ value: raw.thirtyYearFixed.value, asOf: raw.thirtyYearFixed.asOf }));

  record('A3. retrievedAt is a valid ISO timestamp, distinct field from asOf',
    !isNaN(new Date(raw.thirtyYearFixed.retrievedAt).getTime()) ? 'PASS' : 'FAIL',
    raw.thirtyYearFixed.retrievedAt);

  record('A4. freshnessStatus is one of CURRENT/STALE/UNAVAILABLE',
    ['CURRENT', 'STALE', 'UNAVAILABLE'].includes(raw.thirtyYearFixed.freshnessStatus) ? 'PASS' : 'FAIL',
    raw.thirtyYearFixed.freshnessStatus);

  record('A5. seriesId values are the real FRED series (MORTGAGE30US/15US/5US), never OBMMI/LLPA',
    raw.thirtyYearFixed.seriesId === 'MORTGAGE30US' && raw.fifteenYearFixed.seriesId === 'MORTGAGE15US' && raw.fiveOneArm.seriesId === 'MORTGAGE5US'
      ? 'PASS' : 'FAIL',
    JSON.stringify({ y30: raw.thirtyYearFixed.seriesId, y15: raw.fifteenYearFixed.seriesId, arm: raw.fiveOneArm.seriesId }));

  // ===== B. Shaping + schema =====

  const shaped = shapeBenchmarkRatesForExternalContract(raw);
  const parsed = BenchmarkRatesV1Schema.safeParse(shaped);
  record('B1. Shaped output passes BenchmarkRatesV1Schema validation',
    parsed.success ? 'PASS' : 'FAIL', parsed.success ? 'valid' : JSON.stringify((parsed as any).error?.issues?.slice(0, 3)));

  record('B2. contract_version is benchmark-rates-v1',
    shaped.contract_version === 'benchmark-rates-v1' ? 'PASS' : 'FAIL', shaped.contract_version);

  record('B3. Every rate carries claim_type MARKET FACT',
    shaped.thirty_year_fixed.claim_type === 'MARKET FACT' && shaped.fifteen_year_fixed.claim_type === 'MARKET FACT' && shaped.five_one_arm.claim_type === 'MARKET FACT'
      ? 'PASS' : 'FAIL', 'checked all 3');

  record('B4. disclaimer field present and non-empty (EDUCATIONAL_DISCLAIMER, not hand-written)',
    typeof shaped.disclaimer === 'string' && shaped.disclaimer.length > 0 ? 'PASS' : 'FAIL', shaped.disclaimer.slice(0, 40));

  record('B5. No OBMMI/rateIntelligence/LLPA field anywhere in the shaped output (source-of-truth check)',
    !JSON.stringify(shaped).match(/obmmi|llpa|rateIntelligence|credit_score|creditScore/i) ? 'PASS' : 'FAIL',
    'grepped shaped JSON for forbidden substrings');

  // ===== C. Scope model =====

  record('C1. benchmark_rates:read is in ALLOWED_GATEWAY_SCOPES',
    (ALLOWED_GATEWAY_SCOPES as readonly string[]).includes('benchmark_rates:read') ? 'PASS' : 'FAIL',
    JSON.stringify(ALLOWED_GATEWAY_SCOPES));

  record('C2. property_intelligence:read still in ALLOWED_GATEWAY_SCOPES (unchanged, additive only)',
    (ALLOWED_GATEWAY_SCOPES as readonly string[]).includes('property_intelligence:read') ? 'PASS' : 'FAIL',
    JSON.stringify(ALLOWED_GATEWAY_SCOPES));

  {
    // Fake CallerContext via requireAnyScope's own logic (no branded symbol
    // needed for a pure function-logic check -- requireScope/requireAnyScope
    // only read .scopes).
    const ctxWithPropScope = { scopes: ['property_intelligence:read'] } as any;
    const ctxWithRateScope = { scopes: ['benchmark_rates:read'] } as any;
    const ctxWithNeither = { scopes: ['something_else:read'] } as any;

    record('C3. requireAnyScope: property_intelligence:read alone is sufficient (OAuth/ChatGPT works with zero OAuth changes)',
      requireAnyScope(ctxWithPropScope, ['property_intelligence:read', 'benchmark_rates:read']) === null ? 'PASS' : 'FAIL', 'checked');

    record('C4. requireAnyScope: benchmark_rates:read alone is sufficient',
      requireAnyScope(ctxWithRateScope, ['property_intelligence:read', 'benchmark_rates:read']) === null ? 'PASS' : 'FAIL', 'checked');

    record('C5. requireAnyScope: neither scope -> FORBIDDEN',
      requireAnyScope(ctxWithNeither, ['property_intelligence:read', 'benchmark_rates:read'])?.error === 'FORBIDDEN' ? 'PASS' : 'FAIL', 'checked');

    record('C6. requireScope (single-scope, existing function) unchanged: still requires exact match',
      requireScope(ctxWithRateScope, 'property_intelligence:read')?.error === 'FORBIDDEN' ? 'PASS' : 'FAIL', 'checked');
  }

  // ===== D. Full Gateway pipeline, real credential =====

  const testIds: string[] = [];
  try {
    const { data: partner, error: partnerErr } = await sb.from('gateway_partners').insert({
      name: 'WS10 benchmark-rates test partner', contact_email: 'gateway-validation@homerates.ai',
    }).select('id').single();
    if (partnerErr || !partner) throw new Error(`partner insert failed: ${partnerErr?.message}`);
    testIds.push(partner.id);
    await sb.from('gateway_partners').update({ status: 'active' }).eq('id', partner.id);

    // D1: a credential scoped ONLY to property_intelligence:read (the real
    // shape of every credential issued today, including OAuth) can still
    // call get_benchmark_rates -- zero re-onboarding needed for existing
    // integrations.
    const credPropOnly = await issueCredential(partner.id, ['property_intelligence:read']);
    const resultViaPropScope = await getBenchmarkRatesGated(credPropOnly.plaintextKey, '127.0.0.1');
    record('D1. Existing property_intelligence:read-only credential can call get_benchmark_rates',
      resultViaPropScope.ok ? 'PASS' : 'FAIL', JSON.stringify(resultViaPropScope));

    // D2: a credential scoped ONLY to benchmark_rates:read can call it too,
    // but CANNOT call property intelligence (confirms the narrower scope is
    // genuinely narrower, not accidentally equivalent).
    const credRateOnly = await issueCredential(partner.id, ['benchmark_rates:read']);
    const resultViaRateScope = await getBenchmarkRatesGated(credRateOnly.plaintextKey, '127.0.0.1');
    record('D2. benchmark_rates:read-only credential can call get_benchmark_rates',
      resultViaRateScope.ok ? 'PASS' : 'FAIL', JSON.stringify(resultViaRateScope));

    const authRateOnly = await authenticateRequest(credRateOnly.plaintextKey);
    const scopeCheckForProperty = authRateOnly.ok ? requireScope(authRateOnly.context, 'property_intelligence:read') : null;
    record('D3. benchmark_rates:read-only credential is FORBIDDEN from property_intelligence:read (genuinely narrower scope)',
      authRateOnly.ok && scopeCheckForProperty?.error === 'FORBIDDEN' ? 'PASS' : 'FAIL', JSON.stringify(scopeCheckForProperty));

    // D4: a genuinely INVALID (garbage, not merely absent) credential still
    // -> UNAUTHORIZED. Superseded 2026-09-11 (Public Authority Access): a
    // wholly MISSING credential is no longer an error for this tool at all
    // -- see section F below for the real, live proof of that intentional
    // policy change. This assertion now covers the other half: presenting
    // something that LOOKS like a credential but isn't must still fail,
    // exactly as before.
    const resultBadAuth = await getBenchmarkRatesGated('hrg_garbage_notreal', '127.0.0.1');
    record('D4. Invalid (garbage, not merely absent) credential -> UNAUTHORIZED',
      !resultBadAuth.ok && resultBadAuth.error === 'UNAUTHORIZED' ? 'PASS' : 'FAIL', JSON.stringify(resultBadAuth));

    // D5: a credential with neither scope -> FORBIDDEN. issueCredential
    // requires an ALLOWED scope, so simulate via a direct row edit (same
    // pattern test-oauth-flow.ts already uses for this exact situation).
    const credToStrip = await issueCredential(partner.id, ['property_intelligence:read']);
    await sb.from('gateway_credentials').update({ scopes: ['some_other_scope:read'] }).eq('key_prefix', credToStrip.prefix);
    const resultWrongScope = await getBenchmarkRatesGated(credToStrip.plaintextKey, '127.0.0.1');
    record('D5. Credential with neither benchmark_rates:read nor property_intelligence:read -> FORBIDDEN',
      !resultWrongScope.ok && resultWrongScope.error === 'FORBIDDEN' ? 'PASS' : 'FAIL', JSON.stringify(resultWrongScope));

    // D6: revoked credential -> UNAUTHORIZED (same fail-closed posture as property intelligence).
    const credToRevoke = await issueCredential(partner.id, ['benchmark_rates:read']);
    const authForRevoke = await authenticateRequest(credToRevoke.plaintextKey);
    if (authForRevoke.ok) await revokeCredential(authForRevoke.context.credentialId);
    const resultRevoked = await getBenchmarkRatesGated(credToRevoke.plaintextKey, '127.0.0.1');
    record('D6. Revoked credential -> UNAUTHORIZED',
      !resultRevoked.ok && resultRevoked.error === 'UNAUTHORIZED' ? 'PASS' : 'FAIL', JSON.stringify(resultRevoked));

  } finally {
    for (const id of testIds) {
      await sb.from('gateway_credentials').delete().eq('partner_id', id);
      await sb.from('gateway_partners').delete().eq('id', id);
    }
  }

  // ===== E. MCP route: tools/list advertises both tools =====

  {
    const routeSrc = fs.readFileSync(path.resolve(process.cwd(), 'app/api/mcp/property-intelligence/route.ts'), 'utf-8');
    record('E1. MCP route registers BENCHMARK_RATES_TOOL_NAME alongside TOOL_NAME in tools/list',
      /tools:\s*\[[\s\S]*?\{ name: TOOL_NAME[\s\S]*?BENCHMARK_RATES_TOOL_NAME/.test(routeSrc) ? 'PASS' : 'FAIL', 'source-inspected');
    record('E2. tools/call dispatches BENCHMARK_RATES_TOOL_NAME to getBenchmarkRatesGated',
      /toolName === BENCHMARK_RATES_TOOL_NAME/.test(routeSrc) && /getBenchmarkRatesGated\(apiKeyHeader, requestIp\)/.test(routeSrc) ? 'PASS' : 'FAIL', 'source-inspected');
    record('E3. Unknown tool name (neither registered tool, canonical or legacy) still returns isError:true, not a crash',
      /!isPropertyIntelligence && !isBenchmarkRates/.test(routeSrc) ? 'PASS' : 'FAIL', 'source-inspected');
    record('E4. FORBIDDEN mapping advertises the tool-specific scope (benchmark_rates:read for the new tool)',
      /mapGatewayRejection\(id, result, 'benchmark_rates:read'\)/.test(routeSrc) ? 'PASS' : 'FAIL', 'source-inspected');
    record('E5. Canonical name is homerates_rate_oracle; legacy get_benchmark_rates kept callable but not advertised',
      /BENCHMARK_RATES_TOOL_NAME = 'homerates_rate_oracle'/.test(routeSrc) &&
      /LEGACY_BENCHMARK_RATES_TOOL_NAME = 'get_benchmark_rates'/.test(routeSrc) &&
      /isBenchmarkRates = toolName === BENCHMARK_RATES_TOOL_NAME \|\| toolName === LEGACY_BENCHMARK_RATES_TOOL_NAME/.test(routeSrc)
        ? 'PASS' : 'FAIL', 'source-inspected');
    record('E6. All 5 tools/list entries carry read-only MCP annotations',
      (routeSrc.match(/annotations: \{ readOnlyHint: true, destructiveHint: false, openWorldHint: false \}/g) ?? []).length === 5
        ? 'PASS' : 'FAIL', 'source-inspected');
  }

  // ===== F. PUBLIC AUTHORITY ACCESS (2026-09-11): no credential required =====
  // Built to unblock a real, live gap: Grok's MCP connector sends tools/call
  // with NO Authorization header at all (confirmed directly via Vercel logs,
  // User-Agent grok-connectors-manager/0.1.0) and never attempts any OAuth
  // negotiation. Rather than a 4th auth mechanism, this makes the credential
  // OPTIONAL for exactly this tool (a public, zero-marginal-cost national
  // reference rate) -- a caller that DOES present one still gets the
  // unchanged authenticated path (see D1-D6 above, still passing).
  {
    const resultNoHeaderAtAll = await getBenchmarkRatesGated(null, '203.0.113.150');
    record('F1. getBenchmarkRatesGated(null, ip) succeeds anonymously (no credential presented at all)',
      resultNoHeaderAtAll.ok && resultNoHeaderAtAll.data.contract_version === 'benchmark-rates-v1' ? 'PASS' : 'FAIL',
      JSON.stringify(resultNoHeaderAtAll.ok ? { ok: true } : resultNoHeaderAtAll));

    const resultGarbageCred = await getBenchmarkRatesGated('hrg_garbage_notreal', '203.0.113.151');
    record('F2. A PRESENTED but invalid credential still correctly fails UNAUTHORIZED (anonymous path is for an ABSENT header only, never a bad one)',
      !resultGarbageCred.ok && resultGarbageCred.error === 'UNAUTHORIZED' ? 'PASS' : 'FAIL', JSON.stringify(resultGarbageCred));

    // Real, live proof against the actual MCP route -- the exact shape
    // confirmed in production logs: a valid MCP-Protocol-Version header
    // (Grok's request passed that check, since it got a 401 from the
    // Gateway rather than a 400 from the protocol-header check), but NO
    // Authorization header whatsoever.
    const req = new NextRequest('http://localhost/api/mcp/property-intelligence', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'mcp-protocol-version': '2025-11-25' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 999, method: 'tools/call', params: { name: 'homerates_rate_oracle', arguments: {} } }),
    });
    const res = await mcpPost(req);
    const json = await res.json().catch(() => null);
    const data = json?.result?.content?.[0]?.text ? JSON.parse(json.result.content[0].text) : null;
    record('F3. Real, live tools/call against the actual MCP route with NO Authorization header succeeds (matches Grok\'s exact real request shape -- no more 401)',
      res.status === 200 && json?.result?.isError === false && data?.contract_version === 'benchmark-rates-v1' ? 'PASS' : 'FAIL',
      JSON.stringify({ status: res.status, isError: json?.result?.isError, contract_version: data?.contract_version }));
  }

  const failed = results.filter(r => r.status === 'FAIL');
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) {
    console.log('\nFAILURES:');
    for (const f of failed) console.log(` - ${f.name}: ${f.evidence}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
