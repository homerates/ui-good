// scripts/test-scenario-intelligence.ts
//
// Invocable Tool Workstream (2026-09-11). Tests the new
// homerates_scenario_intelligence capability end to end:
// lib/pricing/scenarioIntelligence.ts (engine, calls lib/calcEngine.ts's
// calcConventional/calcFHA/calcVA/calcJumbo directly -- the documented
// "single source of all mortgage math" -- plus
// lib/pricing/loanLimitIntelligence.ts for loan-limit-zone and
// lib/market-data/benchmarkRates.ts for the rate-omitted path) ->
// lib/gateway/scenarioIntelligenceGateway.ts (auth/scope/rate-limit/
// kill-switch/validation, identical order to the other three
// capabilities) -> lib/gateway/scenarioIntelligenceSchema.ts (external
// contract validation) -> app/api/mcp/property-intelligence/route.ts
// (tools/list + tools/call dispatch for the fourth tool).
//
// KNOWN, DOCUMENTED, OUT-OF-SCOPE FINDING (see ARCHITECTURE_DECISIONS.md
// AD-31): AffordabilityPurchaseCard.tsx (AFFD-012) computes conventional
// PMI with its own inline formula that does NOT tier PMI_RATE_LOW/STD by
// LTV the way calcEngine.ts's monthlyPMI() correctly does -- confirmed
// live during this workstream (an 85%-LTV scenario: $312/mo on the card's
// own math vs $170/mo via calcEngine.ts). Per explicit instruction, this
// tool is built against calcEngine.ts (not AFFD-012's own math), so the
// "same scenario via UI card and tool" parity test below compares against
// calcEngine.ts directly (the actual canonical engine) rather than against
// AFFD-012's card -- the T-section below also pins down the KNOWN
// divergence magnitude as an explicit, visible regression marker, not a
// silently-ignored gap.
//
// Run with: npx tsx scripts/test-scenario-intelligence.ts

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
import { getScenarioIntelligence } from '../lib/pricing/scenarioIntelligence';
import { calcConventional, monthlyPI } from '../lib/calcEngine';
import { PMI_RATE_STD } from '../lib/constants';
import { shapeScenarioIntelligenceForExternalContract } from '../lib/gateway/scenarioIntelligenceShaping';
import { ScenarioIntelligenceV1Schema } from '../lib/gateway/scenarioIntelligenceSchema';
import { getScenarioIntelligenceGated } from '../lib/gateway/scenarioIntelligenceGateway';
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

  // ===== A. Parity: same scenario via calcEngine.ts directly (the actual
  // canonical engine) and the tool -> same result =====

  const direct = calcConventional({ purchasePrice: 800000, downPaymentPct: 15, annualRatePct: 6.5, termYears: 30 });
  const viaTool = await getScenarioIntelligence({ price: 800000, program: 'conventional', downPaymentPct: 15, ratePct: 6.5, termYears: 30 });
  record('A1. Same scenario via calcEngine.ts and the tool -> identical PMI (correctly LTV-tiered, not the card\'s flat rate)',
    direct.monthlyPMI === viaTool.monthlyBreakdown?.mortgageInsurance ? 'PASS' : 'FAIL',
    JSON.stringify({ direct: direct.monthlyPMI, tool: viaTool.monthlyBreakdown?.mortgageInsurance }));
  record('A2. Same scenario via calcEngine.ts and the tool -> identical PITI',
    direct.totalMonthly === viaTool.monthlyBreakdown?.piti ? 'PASS' : 'FAIL',
    JSON.stringify({ direct: direct.totalMonthly, tool: viaTool.monthlyBreakdown?.piti }));

  // KNOWN, DOCUMENTED divergence marker (AD-31) -- AFFD-012's own inline PMI
  // formula (`ltv > 80 ? baseLoan * PMI_RATE_STD / 12 : 0`, replicated here
  // ONLY as a literal transcription for comparison, never imported from the
  // component) does NOT match calcEngine.ts for this exact scenario. This
  // assertion exists to make the gap visible if it's ever silently fixed or
  // silently worsens -- not to certify the card's formula as correct.
  {
    const baseLoan = 800000 * (1 - 0.15);
    const cardPMI = Math.round((baseLoan * PMI_RATE_STD) / 12);
    const ok = cardPMI !== direct.monthlyPMI && cardPMI === 312 && direct.monthlyPMI === 170;
    record('A3. KNOWN divergence marker: AFFD-012\'s own inline PMI formula still disagrees with calcEngine.ts at 85% LTV (not fixed by this workstream, per explicit instruction)',
      ok ? 'PASS' : 'FAIL', JSON.stringify({ cardFormula: cardPMI, calcEngine: direct.monthlyPMI }));
  }

  // ===== B. Mandatory recompute tests =====

  const p1 = await getScenarioIntelligence({ price: 800000, program: 'conventional', downPaymentPct: 20, ratePct: 6.5 });
  const p2 = await getScenarioIntelligence({ price: 900000, program: 'conventional', downPaymentPct: 20, ratePct: 6.5 });
  record('B1. Price change recomputes loan amount and P&I', p1.loanStructure.baseLoanAmount !== p2.loanStructure.baseLoanAmount && p1.monthlyBreakdown?.principalInterest !== p2.monthlyBreakdown?.principalInterest ? 'PASS' : 'FAIL',
    JSON.stringify({ price800k: { loan: p1.loanStructure.baseLoanAmount, pi: p1.monthlyBreakdown?.principalInterest }, price900k: { loan: p2.loanStructure.baseLoanAmount, pi: p2.monthlyBreakdown?.principalInterest } }));

  const d1 = await getScenarioIntelligence({ price: 800000, program: 'conventional', downPaymentPct: 10, ratePct: 6.5 });
  const d2 = await getScenarioIntelligence({ price: 800000, program: 'conventional', downPaymentPct: 20, ratePct: 6.5 });
  record('B2. Down-payment change recomputes LTV and PMI (10% down has PMI, 20% down does not)',
    (d1.monthlyBreakdown?.mortgageInsurance ?? 0) > 0 && d2.monthlyBreakdown?.mortgageInsurance === 0 && d1.loanStructure.ltv !== d2.loanStructure.ltv ? 'PASS' : 'FAIL',
    JSON.stringify({ tenPctDown: { ltv: d1.loanStructure.ltv, pmi: d1.monthlyBreakdown?.mortgageInsurance }, twentyPctDown: { ltv: d2.loanStructure.ltv, pmi: d2.monthlyBreakdown?.mortgageInsurance } }));

  const b1 = await getScenarioIntelligence({ price: 800000, program: 'conventional', downPaymentPct: 20, ratePct: 6.5, county: 'Los Angeles', state: 'CA' });
  const b2 = await getScenarioIntelligence({ price: 1_200_000, program: 'conventional', downPaymentPct: 20, ratePct: 6.5, county: 'Los Angeles', state: 'CA' });
  record('B3. Loan crosses the conforming baseline -> classification recomputes from CONFORMING to HIGH_BALANCE',
    b1.loanLimitZone.classification.conventional === 'CONFORMING' && b2.loanLimitZone.classification.conventional === 'HIGH_BALANCE' ? 'PASS' : 'FAIL',
    JSON.stringify({ below: b1.loanLimitZone.classification.conventional, above: b2.loanLimitZone.classification.conventional }));

  const c1 = await getScenarioIntelligence({ price: 3_000_000, program: 'conventional', downPaymentPct: 20, ratePct: 6.5, county: 'Los Angeles', state: 'CA' });
  record('B4. Loan crosses the county limit -> ABOVE_CONFORMING_LIMIT, program never silently switches to jumbo',
    c1.loanLimitZone.classification.conventional === 'ABOVE_CONFORMING_LIMIT' && c1.program === 'conventional' ? 'PASS' : 'FAIL',
    JSON.stringify({ classification: c1.loanLimitZone.classification.conventional, programEchoed: c1.program }));

  const r1 = await getScenarioIntelligence({ price: 800000, program: 'conventional', downPaymentPct: 20, ratePct: 6.5 });
  const r2 = await getScenarioIntelligence({ price: 800000, program: 'conventional', downPaymentPct: 20, ratePct: 7.0 });
  const expectedPI2 = Math.round(monthlyPI(640000, 7.0, 360));
  record('B5. Rate +0.5% changes payment deterministically, matching monthlyPI() exactly',
    r1.monthlyBreakdown?.principalInterest !== r2.monthlyBreakdown?.principalInterest && r2.monthlyBreakdown?.principalInterest === expectedPI2 ? 'PASS' : 'FAIL',
    JSON.stringify({ at6_5: r1.monthlyBreakdown?.principalInterest, at7_0: r2.monthlyBreakdown?.principalInterest, expected: expectedPI2 }));

  const h1 = await getScenarioIntelligence({ price: 800000, program: 'conventional', downPaymentPct: 20, ratePct: 6.5 });
  const h2 = await getScenarioIntelligence({ price: 800000, program: 'conventional', downPaymentPct: 20, ratePct: 6.5, hoaMonthly: 300 });
  record('B6. Unknown HOA preserved as unknown (null, never zero); confirmed HOA correctly included in PITIA only',
    h1.monthlyBreakdown?.hoa === null && h1.monthlyBreakdown?.pitia === null && h2.monthlyBreakdown?.hoa === 300 && h2.monthlyBreakdown?.pitia === (h2.monthlyBreakdown!.piti + 300) ? 'PASS' : 'FAIL',
    JSON.stringify({ unknown: { hoa: h1.monthlyBreakdown?.hoa, pitia: h1.monthlyBreakdown?.pitia, piti: h1.monthlyBreakdown?.piti }, confirmed: { hoa: h2.monthlyBreakdown?.hoa, pitia: h2.monthlyBreakdown?.pitia, piti: h2.monthlyBreakdown?.piti } }));

  const rt = await getScenarioIntelligence({ price: 800000, program: 'conventional', downPaymentPct: 20 });
  record('B7. Rate omitted -> current HomeRates benchmark used, and the SAME object echoed consistently in inputs.rate_pct and rate_benchmark',
    rt.inputs.ratePct.source === 'CURRENT_BENCHMARK' && rt.rateBenchmark != null && rt.inputs.ratePct.value === rt.rateBenchmark.value ? 'PASS' : 'FAIL',
    JSON.stringify({ inputsRate: rt.inputs.ratePct, benchmark: rt.rateBenchmark }));

  const engineSrc = fs.readFileSync(path.resolve(process.cwd(), 'lib/pricing/scenarioIntelligence.ts'), 'utf-8');
  // Excludes the header comment's own prose mention of getBenchmarkRates() --
  // only a real call site is preceded by `await`.
  const benchmarkCallCount = (engineSrc.match(/await getBenchmarkRates\(\)/g) ?? []).length;
  record('B7b. Source-inspected: getBenchmarkRates() is called at most once per engine run (structurally guarantees the same object is reused, not re-fetched)',
    benchmarkCallCount === 1 ? 'PASS' : 'FAIL', `${benchmarkCallCount} call site(s)`);

  // No external call to Grok, ever.
  record('B8. Engine never imports any Grok/xAI module', !/grok|xai/i.test(engineSrc) ? 'PASS' : 'FAIL', 'source-inspected');

  // ===== C. Program-specific correctness spot checks =====

  const fha = await getScenarioIntelligence({ price: 500000, program: 'fha', ratePct: 6.5 });
  record('C1. FHA scenario computes UFMIP + tiered MIP via calcEngine.ts (not reproduced)',
    fha.loanStructure.upfrontFeeLabel === 'UFMIP' && fha.loanStructure.upfrontFee > 0 && (fha.monthlyBreakdown?.mortgageInsuranceLabel === 'MIP') ? 'PASS' : 'FAIL',
    JSON.stringify({ upfrontFee: fha.loanStructure.upfrontFee, mi: fha.monthlyBreakdown?.mortgageInsuranceLabel }));

  const va = await getScenarioIntelligence({ price: 500000, program: 'va', ratePct: 6.5, buydownPoints: 1 });
  record('C2. VA scenario computes funding fee + buydown via calcEngine.ts\'s own calcVA(), never PMI/MIP',
    va.loanStructure.upfrontFeeLabel === 'VA_FUNDING_FEE' && va.monthlyBreakdown?.mortgageInsuranceLabel === 'NONE' && (va.programDetail as any).buydownCost === 5000 ? 'PASS' : 'FAIL',
    JSON.stringify({ upfrontFeeLabel: va.loanStructure.upfrontFeeLabel, mi: va.monthlyBreakdown?.mortgageInsuranceLabel, programDetail: va.programDetail }));

  const jumbo = await getScenarioIntelligence({ price: 3_000_000, program: 'jumbo', ratePct: 6.5, downPaymentPct: 5 });
  record('C3. Jumbo enforces the 20% minimum down payment internally (calcEngine.ts\'s own rule, not reproduced) even when a lower down payment is requested',
    jumbo.inputs.downPaymentPct.value === 5 && jumbo.loanStructure.ltv < 0.81 ? 'PASS' : 'FAIL',
    JSON.stringify({ requestedDownPct: jumbo.inputs.downPaymentPct.value, ltv: jumbo.loanStructure.ltv }));
  record('C3b. Jumbo exposes its own conformingLimit/loanExceedsConforming fields verbatim',
    jumbo.jumboDetail?.conformingLimit === 832750 && jumbo.jumboDetail?.loanExceedsConforming === true ? 'PASS' : 'FAIL',
    JSON.stringify(jumbo.jumboDetail));

  // ===== D. External contract shape =====

  const shaped = shapeScenarioIntelligenceForExternalContract(viaTool);
  const parsed = ScenarioIntelligenceV1Schema.safeParse(shaped);
  record('D1. Shaped output passes ScenarioIntelligenceV1Schema validation', parsed.success ? 'PASS' : 'FAIL', parsed.success ? 'valid' : JSON.stringify((parsed as any).error?.issues));
  record('D2. contract_version is scenario-intelligence-v1', shaped.contract_version === 'scenario-intelligence-v1' ? 'PASS' : 'FAIL', shaped.contract_version);
  record('D3. loan_structure/monthly_breakdown/qualification carry claim_type DERIVED CALCULATION; assumptions carry ILLUSTRATIVE ASSUMPTION',
    shaped.loan_structure.claim_type === 'DERIVED CALCULATION' && shaped.monthly_breakdown?.claim_type === 'DERIVED CALCULATION' && shaped.assumptions.every((a) => a.claim_type === 'ILLUSTRATIVE ASSUMPTION') ? 'PASS' : 'FAIL', 'checked');
  record('D4. rate_benchmark reuses the exact BenchmarkRateSchema shape (claim_type MARKET FACT)',
    shaped.rate_benchmark == null || shaped.rate_benchmark.claim_type === 'MARKET FACT' ? 'PASS' : 'FAIL', JSON.stringify(shaped.rate_benchmark));
  record('D5. loan_limit_zone reuses homerates_loan_limit_intelligence\'s exact field shapes (same claim_type/status vocabulary)',
    shaped.loan_limit_zone.classification.claim_type === 'DERIVED CALCULATION' && shaped.loan_limit_zone.county_conforming_limit.claim_type === 'MARKET FACT' ? 'PASS' : 'FAIL', 'checked');

  // ===== E. Scope / gateway auth =====

  record('E1. scenario_intelligence:read is in ALLOWED_GATEWAY_SCOPES', (ALLOWED_GATEWAY_SCOPES as readonly string[]).includes('scenario_intelligence:read') ? 'PASS' : 'FAIL', JSON.stringify(ALLOWED_GATEWAY_SCOPES));

  const { data: partner, error: partnerErr } = await sb.from('gateway_partners').insert({
    name: 'Scenario Intelligence Test Partner', contact_email: 'gateway-validation@homerates.ai',
  }).select('id').single();
  if (partnerErr || !partner) throw new Error(`partner insert failed: ${partnerErr?.message}`);
  const partnerIds = [partner.id];
  await sb.from('gateway_partners').update({ status: 'active' }).eq('id', partner.id);

  try {
    const credPropOnly = await issueCredential(partner.id, ['property_intelligence:read']);
    const resultViaPropScope = await getScenarioIntelligenceGated({ price: 800000, program: 'conventional' }, credPropOnly.plaintextKey, '127.0.0.1');
    record('E2. Existing property_intelligence:read-only credential can call the scenario tool (zero re-onboarding)',
      resultViaPropScope.ok ? 'PASS' : 'FAIL', JSON.stringify(resultViaPropScope.ok ? { ok: true } : resultViaPropScope));

    const credScenarioOnly = await issueCredential(partner.id, ['scenario_intelligence:read']);
    const resultViaScenarioScope = await getScenarioIntelligenceGated({ price: 800000, program: 'conventional' }, credScenarioOnly.plaintextKey, '127.0.0.1');
    record('E3. scenario_intelligence:read-only credential can call the scenario tool',
      resultViaScenarioScope.ok ? 'PASS' : 'FAIL', JSON.stringify(resultViaScenarioScope.ok ? { ok: true } : resultViaScenarioScope));

    const authScenarioOnly = await authenticateRequest(credScenarioOnly.plaintextKey);
    const scopeCheckForProperty = authScenarioOnly.ok ? requireAnyScope(authScenarioOnly.context, ['property_intelligence:read']) : null;
    record('E4. scenario_intelligence:read-only credential is FORBIDDEN from property_intelligence:read scope (genuinely narrower)',
      authScenarioOnly.ok && scopeCheckForProperty?.error === 'FORBIDDEN' ? 'PASS' : 'FAIL', JSON.stringify(scopeCheckForProperty));

    const resultNoAuth = await getScenarioIntelligenceGated({ price: 800000, program: 'conventional' }, null, '127.0.0.1');
    record('E5. Missing credential -> UNAUTHORIZED', !resultNoAuth.ok && resultNoAuth.error === 'UNAUTHORIZED' ? 'PASS' : 'FAIL', JSON.stringify(resultNoAuth));

    // ===== F. Request validation (INVALID_REQUEST) =====

    const noPrice = await getScenarioIntelligenceGated({ program: 'conventional' }, credScenarioOnly.plaintextKey, '127.0.0.1');
    record('F1. Missing price -> INVALID_REQUEST', !noPrice.ok && noPrice.error === 'INVALID_REQUEST' ? 'PASS' : 'FAIL', JSON.stringify(noPrice));

    const noProgram = await getScenarioIntelligenceGated({ price: 800000 }, credScenarioOnly.plaintextKey, '127.0.0.1');
    record('F2. Missing program -> INVALID_REQUEST', !noProgram.ok && noProgram.error === 'INVALID_REQUEST' ? 'PASS' : 'FAIL', JSON.stringify(noProgram));

    const bothDown = await getScenarioIntelligenceGated({ price: 800000, program: 'conventional', down_payment_pct: 10, down_payment_amount: 80000 }, credScenarioOnly.plaintextKey, '127.0.0.1');
    record('F3. Both down_payment_pct and down_payment_amount given -> INVALID_REQUEST', !bothDown.ok && bothDown.error === 'INVALID_REQUEST' ? 'PASS' : 'FAIL', JSON.stringify(bothDown));

    const badProgram = await getScenarioIntelligenceGated({ price: 800000, program: 'heloc' }, credScenarioOnly.plaintextKey, '127.0.0.1');
    record('F4. Invalid program value -> INVALID_REQUEST', !badProgram.ok && badProgram.error === 'INVALID_REQUEST' ? 'PASS' : 'FAIL', JSON.stringify(badProgram));

    const creditOnConv = await getScenarioIntelligenceGated({ price: 800000, program: 'conventional', credit_score: 700 }, credScenarioOnly.plaintextKey, '127.0.0.1');
    record('F5. credit_score on a non-FHA program -> INVALID_REQUEST', !creditOnConv.ok && creditOnConv.error === 'INVALID_REQUEST' ? 'PASS' : 'FAIL', JSON.stringify(creditOnConv));

    const buydownOnFha = await getScenarioIntelligenceGated({ price: 800000, program: 'fha', buydown_points: 1 }, credScenarioOnly.plaintextKey, '127.0.0.1');
    record('F6. buydown_points on a non-VA program -> INVALID_REQUEST', !buydownOnFha.ok && buydownOnFha.error === 'INVALID_REQUEST' ? 'PASS' : 'FAIL', JSON.stringify(buydownOnFha));

    const countyNoState = await getScenarioIntelligenceGated({ price: 800000, program: 'conventional', county: 'Ventura' }, credScenarioOnly.plaintextKey, '127.0.0.1');
    record('F7. county without state -> INVALID_REQUEST', !countyNoState.ok && countyNoState.error === 'INVALID_REQUEST' ? 'PASS' : 'FAIL', JSON.stringify(countyNoState));

    const goodCall = await getScenarioIntelligenceGated({ price: 800000, program: 'conventional', down_payment_pct: 20, rate_pct: 6.5 }, credScenarioOnly.plaintextKey, '127.0.0.1');
    record('F8. Valid request via the gated entry point returns ok:true with a schema-valid payload', goodCall.ok ? 'PASS' : 'FAIL', JSON.stringify(goodCall.ok ? { contract_version: goodCall.data.contract_version } : goodCall));

    // ===== G4. Real tools/call against the MCP route (needs an active partner/credential) =====
    const mcpCallBody = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'homerates_scenario_intelligence', arguments: { price: 800000, program: 'conventional', down_payment_pct: 20, rate_pct: 6.5 }, _meta: meta() } };
    const mcpCallResult = await callAdapter(mcpCallBody, { ...mcpHeaders('tools/call', 'homerates_scenario_intelligence'), authorization: `Bearer ${credScenarioOnly.plaintextKey}`, 'x-forwarded-for': '203.0.113.180' });
    const mcpData = mcpCallResult.json?.result?.content?.[0]?.text ? JSON.parse(mcpCallResult.json.result.content[0].text) : null;
    record('G4. Real tools/call against homerates_scenario_intelligence succeeds end to end',
      mcpCallResult.status === 200 && mcpCallResult.json?.result?.isError === false && mcpData?.contract_version === 'scenario-intelligence-v1' ? 'PASS' : 'FAIL',
      JSON.stringify(mcpData ?? mcpCallResult.json));
  } finally {
    await sb.from('gateway_credentials').update({ status: 'revoked', revoked_at: new Date().toISOString() }).in('partner_id', partnerIds).neq('status', 'revoked');
    await sb.from('gateway_partners').update({ status: 'cancelled' }).in('id', partnerIds);
  }

  // ===== G. MCP route: tools/list advertises the fourth tool =====

  const routeSrc = fs.readFileSync(path.resolve(process.cwd(), 'app/api/mcp/property-intelligence/route.ts'), 'utf-8');
  record('G1. Route source references SCENARIO_TOOL_NAME and dispatches it via getScenarioIntelligenceGated',
    /SCENARIO_TOOL_NAME = 'homerates_scenario_intelligence'/.test(routeSrc) && /getScenarioIntelligenceGated\(/.test(routeSrc) ? 'PASS' : 'FAIL', 'source-inspected');

  const toolsListResult = await callAdapter({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: meta() } }, mcpHeaders('tools/list', null));
  const listedTools: { name: string; annotations?: Record<string, unknown> }[] = toolsListResult.json?.result?.tools ?? [];
  record('G2. tools/list now advertises exactly 4 tools, including homerates_scenario_intelligence',
    listedTools.length === 4 && listedTools.some((t) => t.name === 'homerates_scenario_intelligence') ? 'PASS' : 'FAIL',
    JSON.stringify(listedTools.map((t) => t.name)));
  const scenarioListing = listedTools.find((t) => t.name === 'homerates_scenario_intelligence');
  record('G3. homerates_scenario_intelligence carries read-only MCP annotations',
    JSON.stringify(scenarioListing?.annotations) === JSON.stringify({ readOnlyHint: true, destructiveHint: false, openWorldHint: false }) ? 'PASS' : 'FAIL',
    JSON.stringify(scenarioListing?.annotations));

  const mcpCallNoAuth = await callAdapter(
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'homerates_scenario_intelligence', arguments: { price: 800000, program: 'conventional' }, _meta: meta() } },
    mcpHeaders('tools/call', 'homerates_scenario_intelligence'),
  );
  record('G5. tools/call against homerates_scenario_intelligence with no credential -> 401 UNAUTHORIZED (not a silent success)',
    mcpCallNoAuth.status === 401 ? 'PASS' : 'FAIL', JSON.stringify(mcpCallNoAuth.json));

  // Buyer Capacity Intelligence must still NOT be exposed by this workstream.
  record('G6. Buyer Capacity Intelligence remains unexposed (explicit instruction: do not expose it in this workstream)',
    !listedTools.some((t) => /buyer_capacity/i.test(t.name)) ? 'PASS' : 'FAIL', JSON.stringify(listedTools.map((t) => t.name)));

  console.log('\n=== FINAL RESULTS ===');
  console.table(results.map((r) => ({ name: r.name, status: r.status })));
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\n${pass}/${results.length} passed.`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
