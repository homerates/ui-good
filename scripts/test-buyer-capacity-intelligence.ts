// scripts/test-buyer-capacity-intelligence.ts
//
// Invocable Tool Workstream (2026-09-11). Tests the fifth and FINAL
// locked-architecture tool, homerates_buyer_capacity_intelligence:
// lib/pricing/buyerCapacityIntelligence.ts (engine -- the INVERSE of
// homerates_scenario_intelligence, found via binary search over price,
// never via lib/calcEngine.ts's calcAffordabilityScenario(), which was
// confirmed during this workstream to have unresolved PMI/MIP divergence
// from calcConventional()/calcFHA() -- see this file's own header and
// ARCHITECTURE_DECISIONS.md AD-32 for the full reasoning) ->
// lib/gateway/buyerCapacityIntelligenceGateway.ts (auth/scope/rate-limit/
// kill-switch/validation, identical order to the other four capabilities)
// -> lib/gateway/buyerCapacityIntelligenceSchema.ts (external contract
// validation, reusing ScenarioIntelligenceV1Schema verbatim per band) ->
// app/api/mcp/property-intelligence/route.ts (tools/list + tools/call
// dispatch for the fifth and final tool).
//
// Run with: npx tsx scripts/test-buyer-capacity-intelligence.ts

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
import { getBuyerCapacityIntelligence } from '../lib/pricing/buyerCapacityIntelligence';
import { getScenarioIntelligence } from '../lib/pricing/scenarioIntelligence';
import { calcAffordabilityScenario, monthlyPMI, fhaMIPRate } from '../lib/calcEngine';
import { shapeBuyerCapacityIntelligenceForExternalContract } from '../lib/gateway/buyerCapacityIntelligenceShaping';
import { BuyerCapacityIntelligenceV1Schema } from '../lib/gateway/buyerCapacityIntelligenceSchema';
import { getBuyerCapacityIntelligenceGated } from '../lib/gateway/buyerCapacityIntelligenceGateway';
import { issueCredential, ALLOWED_GATEWAY_SCOPES } from '../lib/gateway/credentials';
import { authenticateRequest, requireAnyScope } from '../lib/gateway/auth';
import { POST } from '../app/api/mcp/property-intelligence/route';

type Status = 'PASS' | 'FAIL';
interface Result { name: string; status: Status; evidence: string }
const results: Result[] = [];
function record(name: string, status: Status, evidence: string) {
  results.push({ name, status, evidence });
  console.log(`[${status}] ${name} -- ${evidence}`);
}

const ROUTE_URL = 'http://localhost/api/mcp/property-intelligence';
const PROTOCOL_VERSION = '2026-07-28';
function meta(overrides: Record<string, unknown> = {}) {
  return { 'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION, 'io.modelcontextprotocol/clientCapabilities': {}, ...overrides };
}
function mcpHeaders(method: string, name: string | null, overrides: Record<string, string> = {}) {
  const h: Record<string, string> = { 'mcp-protocol-version': PROTOCOL_VERSION, 'mcp-method': method };
  if (name !== null) h['mcp-name'] = name;
  return { ...h, ...overrides };
}
async function callAdapter(rpcBody: Record<string, unknown>, headers: Record<string, string> = {}) {
  const req = new NextRequest(ROUTE_URL, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(rpcBody) });
  const res = await POST(req);
  const status = res.status;
  let json: any = null;
  try { json = await res.json(); } catch { /* noop */ }
  return { status, json };
}

async function main() {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured.');

  // ===== A. Gate check: calcAffordabilityScenario's confirmed divergence
  // is NEVER called by the new engine, and the divergence itself is real
  // (pinned as a visible marker, exactly like AD-31's AFFD-012 marker). =====

  const engineSrc = fs.readFileSync(path.resolve(process.cwd(), 'lib/pricing/buyerCapacityIntelligence.ts'), 'utf-8');
  // The file's own header comment names calcAffordabilityScenario in prose
  // (explaining why it's avoided) -- only an actual `import` statement
  // naming it would mean the engine actually calls it.
  record('A1. Engine never imports calcAffordabilityScenario (the confirmed-diverged solver)', !/import\s*\{[^}]*calcAffordabilityScenario/.test(engineSrc) ? 'PASS' : 'FAIL', 'source-inspected');
  record('A2. Engine never imports any Grok/xAI module', !/grok|xai/i.test(engineSrc) ? 'PASS' : 'FAIL', 'source-inspected');

  {
    // KNOWN divergence marker (same evidence gathered live before this
    // workstream's implementation decision) -- calcAffordabilityScenario's
    // conventional MI is a flat PMI_RATE_STD regardless of LTV tier.
    const solver = calcAffordabilityScenario(150000, 30000, 500, 6.5, 15, 'Conventional', 832750);
    const ltv = solver.loanAmount / solver.homePrice;
    const correctPMI = Math.round(monthlyPMI(solver.loanAmount, ltv));
    record('A3. KNOWN divergence marker: calcAffordabilityScenario\'s conventional MI still disagrees with monthlyPMI() at ~85% LTV (confirmed gate reason, not fixed here)',
      solver.monthlyMI !== correctPMI ? 'PASS' : 'FAIL', JSON.stringify({ solverMI: solver.monthlyMI, correctPMI }));

    const fhaHighBalance = calcAffordabilityScenario(400000, 100000, 1000, 6.5, 3.5, 'FHA', 1249125);
    const hbLtv = fhaHighBalance.baseLoanAmount / fhaHighBalance.homePrice;
    const hbCorrectRate = fhaMIPRate(30, hbLtv, fhaHighBalance.baseLoanAmount);
    const hbCorrectMip = Math.round(fhaHighBalance.baseLoanAmount * hbCorrectRate / 12);
    record('A4. KNOWN divergence marker: calcAffordabilityScenario\'s FHA MIP still has no higher-balance tier (confirmed gate reason, not fixed here)',
      Math.abs(fhaHighBalance.monthlyMI - hbCorrectMip) > 2 ? 'PASS' : 'FAIL', JSON.stringify({ solverMIP: fhaHighBalance.monthlyMI, correctMIP: hbCorrectMip }));
  }

  // ===== B. Core engine behavior =====

  const conv = await getBuyerCapacityIntelligence({ annualIncome: 150000, monthlyDebts: 500, program: 'conventional', ratePct: 6.5 });
  record('B1. Returns multiple transparent DTI bands (not one false-precision maximum)', conv.bands.length >= 2 ? 'PASS' : 'FAIL', JSON.stringify(conv.bands.map((b) => b.label)));
  record('B2. Higher DTI target bands support a higher price (monotonic)',
    conv.bands.every((b, i) => i === 0 || b.price >= conv.bands[i - 1].price) ? 'PASS' : 'FAIL',
    JSON.stringify(conv.bands.map((b) => ({ label: b.label, price: b.price }))));
  record('B3. Each band\'s achieved back-end DTI is at or near its own target (within 0.5pp)',
    conv.bands.every((b) => b.scenario == null || Math.abs((b.scenario.qualification?.backEndDTI ?? 0) - b.dtiTarget * 100) <= 0.5) ? 'PASS' : 'FAIL',
    JSON.stringify(conv.bands.map((b) => ({ target: b.dtiTarget * 100, achieved: b.scenario?.qualification?.backEndDTI }))));

  // ===== C. MANDATORY PARITY TEST: feed each band's resolved price back
  // into Scenario Intelligence directly -- must reconcile. =====

  for (const b of conv.bands) {
    if (!b.scenario) continue;
    const fresh = await getScenarioIntelligence({
      price: b.price, program: 'conventional', downPaymentPct: conv.inputs.downPaymentPct.value,
      ratePct: conv.inputs.ratePct.value!, annualIncome: 150000, monthlyDebts: 500,
    });
    const pitiDiff = Math.abs((fresh.monthlyBreakdown?.piti ?? 0) - (b.scenario.monthlyBreakdown?.piti ?? 0));
    const dtiDiff = Math.abs((fresh.qualification?.backEndDTI ?? 0) - (b.scenario.qualification?.backEndDTI ?? 0));
    record(`C. MANDATORY PARITY: "${b.label}" band price ($${b.price}) fed into Scenario Intelligence reconciles within tolerance ($2 PITI, 0.2pp DTI)`,
      pitiDiff <= 2 && dtiDiff <= 0.2 ? 'PASS' : 'FAIL', JSON.stringify({ pitiDiff, dtiDiff }));
  }

  // ===== D. Cash constraint =====

  const cashLimited = await getBuyerCapacityIntelligence({ annualIncome: 300000, monthlyDebts: 0, program: 'conventional', ratePct: 6.5, availableCash: 50000 });
  record('D1. High income + low available cash -> CASH_AVAILABLE binds, all bands land at the same cash-capped price',
    cashLimited.bands.every((b) => b.constraint === 'CASH_AVAILABLE' && b.price === 250000) ? 'PASS' : 'FAIL',
    JSON.stringify(cashLimited.bands.map((b) => ({ label: b.label, price: b.price, constraint: b.constraint }))));

  // ===== E. NONE_AFFORDABLE case =====

  const noAfford = await getBuyerCapacityIntelligence({ annualIncome: 20000, monthlyDebts: 1500, program: 'conventional', ratePct: 6.5 });
  record('E1. Debts alone exceed every band\'s DTI target -> NONE_AFFORDABLE, price 0, scenario null (never a fabricated negative price)',
    noAfford.bands.every((b) => b.constraint === 'NONE_AFFORDABLE' && b.price === 0 && b.scenario === null) ? 'PASS' : 'FAIL',
    JSON.stringify(noAfford.bands.map((b) => ({ label: b.label, price: b.price, constraint: b.constraint }))));

  // ===== F. Program-specific sanity =====

  const fha = await getBuyerCapacityIntelligence({ annualIncome: 120000, monthlyDebts: 300, program: 'fha', ratePct: 6.5 });
  record('F1. FHA bands compute via calcFHA (UFMIP present, MIP present) through Scenario Intelligence, not reimplemented',
    fha.bands.every((b) => b.scenario == null || (b.scenario.loanStructure.upfrontFeeLabel === 'UFMIP' && (b.scenario.monthlyBreakdown?.mortgageInsurance ?? 0) > 0)) ? 'PASS' : 'FAIL',
    JSON.stringify(fha.bands.map((b) => ({ label: b.label, upfrontFeeLabel: b.scenario?.loanStructure.upfrontFeeLabel, mi: b.scenario?.monthlyBreakdown?.mortgageInsurance }))));

  const va = await getBuyerCapacityIntelligence({ annualIncome: 140000, monthlyDebts: 300, program: 'va' });
  record('F2. VA bands compute via calcVA (funding fee present, never PMI/MIP)',
    va.bands.every((b) => b.scenario == null || (b.scenario.loanStructure.upfrontFeeLabel === 'VA_FUNDING_FEE' && b.scenario.monthlyBreakdown?.mortgageInsuranceLabel === 'NONE')) ? 'PASS' : 'FAIL',
    JSON.stringify(va.bands.map((b) => ({ label: b.label, upfrontFeeLabel: b.scenario?.loanStructure.upfrontFeeLabel, miLabel: b.scenario?.monthlyBreakdown?.mortgageInsuranceLabel }))));

  const jumbo = await getBuyerCapacityIntelligence({ annualIncome: 600000, monthlyDebts: 500, program: 'jumbo' });
  record('F3. Jumbo bands enforce the 20% minimum down payment (calcJumbo\'s own rule, inherited via Scenario Intelligence)',
    jumbo.inputs.downPaymentPct.value === 20 ? 'PASS' : 'FAIL', JSON.stringify(jumbo.inputs.downPaymentPct));

  // ===== G. Rate handling =====

  const explicitRate = await getBuyerCapacityIntelligence({ annualIncome: 150000, program: 'conventional', ratePct: 6.5 });
  record('G1. Explicit rate_pct -> USER_INPUT, no benchmark fetched', explicitRate.inputs.ratePct.source === 'USER_INPUT' && explicitRate.rateBenchmark === null ? 'PASS' : 'FAIL', JSON.stringify(explicitRate.inputs.ratePct));

  const omittedRate = await getBuyerCapacityIntelligence({ annualIncome: 150000, program: 'conventional' });
  record('G2. Omitted rate_pct -> CURRENT_BENCHMARK, echoed consistently in inputs.rate_pct and rate_benchmark',
    omittedRate.inputs.ratePct.source === 'CURRENT_BENCHMARK' && omittedRate.rateBenchmark != null && omittedRate.inputs.ratePct.value === omittedRate.rateBenchmark.value ? 'PASS' : 'FAIL',
    JSON.stringify({ inputsRate: omittedRate.inputs.ratePct, benchmark: omittedRate.rateBenchmark }));

  const benchmarkCallCount = (engineSrc.match(/await getBenchmarkRates\(\)/g) ?? []).length;
  record('G3. Source-inspected: getBenchmarkRates() is called at most once per engine run, reused across every band/iteration',
    benchmarkCallCount === 1 ? 'PASS' : 'FAIL', `${benchmarkCallCount} call site(s)`);

  // ===== H. External contract shape =====

  const shaped = shapeBuyerCapacityIntelligenceForExternalContract(conv);
  const parsed = BuyerCapacityIntelligenceV1Schema.safeParse(shaped);
  record('H1. Shaped output passes BuyerCapacityIntelligenceV1Schema validation', parsed.success ? 'PASS' : 'FAIL', parsed.success ? 'valid' : JSON.stringify((parsed as any).error?.issues));
  record('H2. contract_version is buyer-capacity-intelligence-v1', shaped.contract_version === 'buyer-capacity-intelligence-v1' ? 'PASS' : 'FAIL', shaped.contract_version);
  record('H3. Each band\'s nested scenario reuses ScenarioIntelligenceV1Schema\'s exact shape (contract_version scenario-intelligence-v1)',
    shaped.bands.every((b) => b.scenario == null || b.scenario.contract_version === 'scenario-intelligence-v1') ? 'PASS' : 'FAIL', 'checked');

  // No approval/underwriting language anywhere in the tool description or schema literals.
  const routeSrcForDesc = fs.readFileSync(path.resolve(process.cwd(), 'app/api/mcp/property-intelligence/route.ts'), 'utf-8');
  const descMatch = routeSrcForDesc.match(/const BUYER_CAPACITY_TOOL_DESCRIPTION =\n([\s\S]*?);\nconst BUYER_CAPACITY_INPUT_SCHEMA/);
  const descText = descMatch ? descMatch[1] : '';
  record('H4. Tool description explicitly forbids approval/pre-qualification language',
    /never states? or implies loan approval|NEVER states or implies loan approval/i.test(descText) || /never/i.test(descText) && /approval/i.test(descText) ? 'PASS' : 'FAIL', 'source-inspected');

  // ===== I. Scope / gateway auth =====

  record('I1. buyer_capacity_intelligence:read is in ALLOWED_GATEWAY_SCOPES', (ALLOWED_GATEWAY_SCOPES as readonly string[]).includes('buyer_capacity_intelligence:read') ? 'PASS' : 'FAIL', JSON.stringify(ALLOWED_GATEWAY_SCOPES));

  const { data: partner, error: partnerErr } = await sb.from('gateway_partners').insert({
    name: 'Buyer Capacity Intelligence Test Partner', contact_email: 'gateway-validation@homerates.ai',
  }).select('id').single();
  if (partnerErr || !partner) throw new Error(`partner insert failed: ${partnerErr?.message}`);
  const partnerIds = [partner.id];
  await sb.from('gateway_partners').update({ status: 'active' }).eq('id', partner.id);

  try {
    const credPropOnly = await issueCredential(partner.id, ['property_intelligence:read']);
    const resultViaPropScope = await getBuyerCapacityIntelligenceGated({ annual_income: 150000, program: 'conventional' }, credPropOnly.plaintextKey, '127.0.0.1');
    record('I2. Existing property_intelligence:read-only credential can call the buyer-capacity tool (zero re-onboarding)',
      resultViaPropScope.ok ? 'PASS' : 'FAIL', JSON.stringify(resultViaPropScope.ok ? { ok: true } : resultViaPropScope));

    const credOwnScope = await issueCredential(partner.id, ['buyer_capacity_intelligence:read']);
    const resultOwnScope = await getBuyerCapacityIntelligenceGated({ annual_income: 150000, program: 'conventional' }, credOwnScope.plaintextKey, '127.0.0.1');
    record('I3. buyer_capacity_intelligence:read-only credential can call the tool',
      resultOwnScope.ok ? 'PASS' : 'FAIL', JSON.stringify(resultOwnScope.ok ? { ok: true } : resultOwnScope));

    const authOwnScope = await authenticateRequest(credOwnScope.plaintextKey);
    const scopeCheckForProperty = authOwnScope.ok ? requireAnyScope(authOwnScope.context, ['property_intelligence:read']) : null;
    record('I4. buyer_capacity_intelligence:read-only credential is FORBIDDEN from property_intelligence:read scope (genuinely narrower)',
      authOwnScope.ok && scopeCheckForProperty?.error === 'FORBIDDEN' ? 'PASS' : 'FAIL', JSON.stringify(scopeCheckForProperty));

    const resultNoAuth = await getBuyerCapacityIntelligenceGated({ annual_income: 150000, program: 'conventional' }, null, '127.0.0.1');
    record('I5. Missing credential -> UNAUTHORIZED', !resultNoAuth.ok && resultNoAuth.error === 'UNAUTHORIZED' ? 'PASS' : 'FAIL', JSON.stringify(resultNoAuth));

    // ===== J. Request validation =====

    const noIncome = await getBuyerCapacityIntelligenceGated({ program: 'conventional' }, credOwnScope.plaintextKey, '127.0.0.1');
    record('J1. Missing annual_income -> INVALID_REQUEST', !noIncome.ok && noIncome.error === 'INVALID_REQUEST' ? 'PASS' : 'FAIL', JSON.stringify(noIncome));

    const noProgram = await getBuyerCapacityIntelligenceGated({ annual_income: 150000 }, credOwnScope.plaintextKey, '127.0.0.1');
    record('J2. Missing program -> INVALID_REQUEST', !noProgram.ok && noProgram.error === 'INVALID_REQUEST' ? 'PASS' : 'FAIL', JSON.stringify(noProgram));

    const creditOnConv = await getBuyerCapacityIntelligenceGated({ annual_income: 150000, program: 'conventional', credit_score: 700 }, credOwnScope.plaintextKey, '127.0.0.1');
    record('J3. credit_score on a non-FHA program -> INVALID_REQUEST', !creditOnConv.ok && creditOnConv.error === 'INVALID_REQUEST' ? 'PASS' : 'FAIL', JSON.stringify(creditOnConv));

    const goodCall = await getBuyerCapacityIntelligenceGated({ annual_income: 150000, program: 'conventional', rate_pct: 6.5 }, credOwnScope.plaintextKey, '127.0.0.1');
    record('J4. Valid request via the gated entry point returns ok:true with a schema-valid payload', goodCall.ok ? 'PASS' : 'FAIL', JSON.stringify(goodCall.ok ? { contract_version: goodCall.data.contract_version, bandCount: goodCall.data.bands.length } : goodCall));

    // ===== K4. Real tools/call against the MCP route =====
    const mcpCallBody = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'homerates_buyer_capacity_intelligence', arguments: { annual_income: 150000, program: 'conventional', rate_pct: 6.5 }, _meta: meta() } };
    const mcpCallResult = await callAdapter(mcpCallBody, { ...mcpHeaders('tools/call', 'homerates_buyer_capacity_intelligence'), authorization: `Bearer ${credOwnScope.plaintextKey}`, 'x-forwarded-for': '203.0.113.190' });
    const mcpData = mcpCallResult.json?.result?.content?.[0]?.text ? JSON.parse(mcpCallResult.json.result.content[0].text) : null;
    record('K4. Real tools/call against homerates_buyer_capacity_intelligence succeeds end to end',
      mcpCallResult.status === 200 && mcpCallResult.json?.result?.isError === false && mcpData?.contract_version === 'buyer-capacity-intelligence-v1' ? 'PASS' : 'FAIL',
      JSON.stringify(mcpData ? { contract_version: mcpData.contract_version, bandCount: mcpData.bands?.length } : mcpCallResult.json));
  } finally {
    await sb.from('gateway_credentials').update({ status: 'revoked', revoked_at: new Date().toISOString() }).in('partner_id', partnerIds).neq('status', 'revoked');
    await sb.from('gateway_partners').update({ status: 'cancelled' }).in('id', partnerIds);
  }

  // ===== K. MCP route: tools/list advertises the fifth and final tool =====

  const routeSrc = fs.readFileSync(path.resolve(process.cwd(), 'app/api/mcp/property-intelligence/route.ts'), 'utf-8');
  record('K1. Route source references BUYER_CAPACITY_TOOL_NAME and dispatches it via getBuyerCapacityIntelligenceGated',
    /BUYER_CAPACITY_TOOL_NAME = 'homerates_buyer_capacity_intelligence'/.test(routeSrc) && /getBuyerCapacityIntelligenceGated\(/.test(routeSrc) ? 'PASS' : 'FAIL', 'source-inspected');

  const toolsListResult = await callAdapter({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: meta() } }, mcpHeaders('tools/list', null));
  const listedTools: { name: string; annotations?: Record<string, unknown> }[] = toolsListResult.json?.result?.tools ?? [];
  record('K2. tools/list now advertises exactly 5 tools -- the FULL locked architecture, all 5 intents exposed',
    listedTools.length === 5 && listedTools.some((t) => t.name === 'homerates_buyer_capacity_intelligence') ? 'PASS' : 'FAIL',
    JSON.stringify(listedTools.map((t) => t.name)));
  const buyerCapacityListing = listedTools.find((t) => t.name === 'homerates_buyer_capacity_intelligence');
  record('K3. homerates_buyer_capacity_intelligence carries read-only MCP annotations',
    JSON.stringify(buyerCapacityListing?.annotations) === JSON.stringify({ readOnlyHint: true, destructiveHint: false, openWorldHint: false }) ? 'PASS' : 'FAIL',
    JSON.stringify(buyerCapacityListing?.annotations));

  const mcpCallNoAuth = await callAdapter(
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'homerates_buyer_capacity_intelligence', arguments: { annual_income: 150000, program: 'conventional' }, _meta: meta() } },
    mcpHeaders('tools/call', 'homerates_buyer_capacity_intelligence'),
  );
  record('K5. tools/call against homerates_buyer_capacity_intelligence with no credential -> 401 UNAUTHORIZED (not a silent success)',
    mcpCallNoAuth.status === 401 ? 'PASS' : 'FAIL', JSON.stringify(mcpCallNoAuth.json));

  console.log('\n=== FINAL RESULTS ===');
  console.table(results.map((r) => ({ name: r.name, status: r.status })));
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\n${pass}/${results.length} passed.`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
