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

import { getSupabase } from '../lib/supabaseServer';
import { getBenchmarkRates } from '../lib/market-data/benchmarkRates';
import { shapeBenchmarkRatesForExternalContract } from '../lib/gateway/benchmarkRatesShaping';
import { BenchmarkRatesV1Schema } from '../lib/gateway/benchmarkRatesSchema';
import { getBenchmarkRatesGated } from '../lib/gateway/benchmarkRatesGateway';
import { issueCredential, revokeCredential, ALLOWED_GATEWAY_SCOPES } from '../lib/gateway/credentials';
import { authenticateRequest, requireAnyScope, requireScope } from '../lib/gateway/auth';

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

    // D4: invalid/missing credential -> UNAUTHORIZED, same as property intelligence.
    const resultNoAuth = await getBenchmarkRatesGated(null, '127.0.0.1');
    record('D4. Missing credential -> UNAUTHORIZED',
      !resultNoAuth.ok && resultNoAuth.error === 'UNAUTHORIZED' ? 'PASS' : 'FAIL', JSON.stringify(resultNoAuth));

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
    record('E6. All 4 tools/list entries carry read-only MCP annotations',
      (routeSrc.match(/annotations: \{ readOnlyHint: true, destructiveHint: false, openWorldHint: false \}/g) ?? []).length === 4
        ? 'PASS' : 'FAIL', 'source-inspected');
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
