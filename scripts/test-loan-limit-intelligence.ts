// scripts/test-loan-limit-intelligence.ts
//
// Invocable Tool Workstream (2026-09-11). Tests the new
// homerates_loan_limit_intelligence capability end to end:
// lib/pricing/loanLimitIntelligence.ts (engine, reuses AD-28's
// classifyConventionalLoan() and the existing FHFA/HUD loan-limit tables
// verbatim) -> lib/gateway/loanLimitGateway.ts (auth/scope/rate-limit/
// kill-switch/validation pipeline, identical order to the other two
// capabilities) -> lib/gateway/loanLimitSchema.ts (external contract
// validation) -> app/api/mcp/property-intelligence/route.ts (tools/list +
// tools/call dispatch for the third tool on the same MCP server).
//
// Run with: npx tsx scripts/test-loan-limit-intelligence.ts

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
import { getLoanLimitIntelligence, CURRENT_LOAN_LIMIT_YEAR } from '../lib/pricing/loanLimitIntelligence';
import { shapeLoanLimitIntelligenceForExternalContract } from '../lib/gateway/loanLimitShaping';
import { LoanLimitIntelligenceV1Schema } from '../lib/gateway/loanLimitSchema';
import { getLoanLimitIntelligenceGated } from '../lib/gateway/loanLimitGateway';
import { issueCredential, revokeCredential, ALLOWED_GATEWAY_SCOPES } from '../lib/gateway/credentials';
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

  // ===== A. Engine layer -- the required golden test matrix =====

  // A1. Ventura County (high-balance, real HUD FHA figure), 1-unit.
  const ventura = await getLoanLimitIntelligence({ county: 'Ventura', state: 'CA', units: 1 });
  record('A1. Ventura County resolves, is high-balance, FHA limit available (CA has real per-county FHA data)',
    ventura.countyResolution.status === 'RESOLVED' && ventura.countyConformingLimit.isHighBalance === true && ventura.fhaCountyLimit.status === 'AVAILABLE' ? 'PASS' : 'FAIL',
    JSON.stringify({ resolution: ventura.countyResolution, conforming: ventura.countyConformingLimit, fha: ventura.fhaCountyLimit }));

  // A2. Los Angeles County (highest CA ceiling tier), 1-unit.
  const la = await getLoanLimitIntelligence({ county: 'Los Angeles', state: 'CA', units: 1 });
  record('A2. Los Angeles County resolves, is high-balance at the $1,249,125 ceiling',
    la.countyResolution.status === 'RESOLVED' && la.countyConformingLimit.value === 1249125 ? 'PASS' : 'FAIL',
    JSON.stringify(la.countyConformingLimit));

  // A3. Non-high-cost county (Fresno) -- conforming limit equals the national baseline.
  const fresno = await getLoanLimitIntelligence({ county: 'Fresno', state: 'CA', units: 1 });
  record('A3. Non-high-cost county (Fresno) conforming limit equals the national baseline, isHighBalance false',
    fresno.countyConformingLimit.value === 832750 && fresno.countyConformingLimit.isHighBalance === false ? 'PASS' : 'FAIL',
    JSON.stringify(fresno.countyConformingLimit));

  // A4. 1-unit vs 2-unit -- both supported, 2-unit baseline is the documented $1,066,250.
  const twoUnit = await getLoanLimitIntelligence({ county: 'Fresno', state: 'CA', units: 2 });
  record('A4. 2-unit is supported and returns the distinct 2-unit national baseline ($1,066,250)',
    twoUnit.nationalBaselineLimit.value === 1066250 ? 'PASS' : 'FAIL',
    JSON.stringify(twoUnit.nationalBaselineLimit));

  // A5. Exact baseline ($832,750) in a HIGH-COST county (LA) is still CONFORMING --
  // "at or below the national baseline" is conforming everywhere, regardless of county.
  const laAtBaseline = await getLoanLimitIntelligence({ county: 'Los Angeles', state: 'CA', units: 1, loanAmount: 832750 });
  record('A5. Exact national baseline loan amount classifies CONFORMING even in a high-cost county',
    laAtBaseline.classification.conventional === 'CONFORMING' ? 'PASS' : 'FAIL',
    JSON.stringify(laAtBaseline.classification));

  // A6. $1 above baseline in a STANDARD (non-high-cost) county -- the critical edge
  // case: this must be ABOVE_CONFORMING_LIMIT, NOT HIGH_BALANCE, since a standard
  // county's own ceiling equals the baseline -- there is no high-balance tier to fall into.
  const fresnoOverBaseline = await getLoanLimitIntelligence({ county: 'Fresno', state: 'CA', units: 1, loanAmount: 832751 });
  record('A6. $1 above baseline in a non-high-cost county -> ABOVE_CONFORMING_LIMIT, never HIGH_BALANCE',
    fresnoOverBaseline.classification.conventional === 'ABOVE_CONFORMING_LIMIT' ? 'PASS' : 'FAIL',
    JSON.stringify(fresnoOverBaseline.classification));

  // A7. Exact county limit (Ventura, at its own real conforming ceiling) -> HIGH_BALANCE
  // (at-or-below the county ceiling), and exactly at its FHA limit -> WITHIN_FHA_LIMIT.
  const venturaAtLimit = await getLoanLimitIntelligence({ county: 'Ventura', state: 'CA', units: 1, loanAmount: ventura.countyConformingLimit.value! });
  record('A7. Exact county conforming limit classifies HIGH_BALANCE (at-or-below is still within the tier)',
    venturaAtLimit.classification.conventional === 'HIGH_BALANCE' ? 'PASS' : 'FAIL',
    JSON.stringify(venturaAtLimit.classification));
  const venturaAtFhaLimit = await getLoanLimitIntelligence({ county: 'Ventura', state: 'CA', units: 1, loanAmount: ventura.fhaCountyLimit.value! });
  record('A7b. Exact FHA county limit classifies WITHIN_FHA_LIMIT',
    venturaAtFhaLimit.classification.fha === 'WITHIN_FHA_LIMIT' ? 'PASS' : 'FAIL',
    JSON.stringify(venturaAtFhaLimit.classification));

  // A8. $1 above the county limit -> ABOVE_CONFORMING_LIMIT / ABOVE_FHA_LIMIT.
  const venturaOverLimit = await getLoanLimitIntelligence({ county: 'Ventura', state: 'CA', units: 1, loanAmount: ventura.countyConformingLimit.value! + 1 });
  record('A8. $1 above the county conforming limit -> ABOVE_CONFORMING_LIMIT',
    venturaOverLimit.classification.conventional === 'ABOVE_CONFORMING_LIMIT' ? 'PASS' : 'FAIL',
    JSON.stringify(venturaOverLimit.classification));
  const venturaOverFhaLimit = await getLoanLimitIntelligence({ county: 'Ventura', state: 'CA', units: 1, loanAmount: ventura.fhaCountyLimit.value! + 1 });
  record('A8b. $1 above the FHA county limit -> ABOVE_FHA_LIMIT',
    venturaOverFhaLimit.classification.fha === 'ABOVE_FHA_LIMIT' ? 'PASS' : 'FAIL',
    JSON.stringify(venturaOverFhaLimit.classification));

  // A9. Unknown ZIP -- never resolves, everything that needs a county reports
  // COUNTY_REQUIRED (never a guessed/default county).
  const unknownZip = await getLoanLimitIntelligence({ zip: '00000', loanAmount: 900000 });
  record('A9. Unknown ZIP -> county_resolution UNRESOLVED, county-dependent fields COUNTY_REQUIRED',
    unknownZip.countyResolution.status === 'UNRESOLVED' && unknownZip.countyConformingLimit.status === 'COUNTY_REQUIRED' && unknownZip.fhaCountyLimit.status === 'COUNTY_REQUIRED' ? 'PASS' : 'FAIL',
    JSON.stringify({ resolution: unknownZip.countyResolution, conforming: unknownZip.countyConformingLimit, fha: unknownZip.fhaCountyLimit }));

  // A9b. Unknown county name (resolvable state, unresolvable county) -- falls back
  // to the national baseline (documented, existing fallback behavior), never a crash.
  const unknownCounty = await getLoanLimitIntelligence({ county: 'Not A Real County', state: 'CA', units: 1 });
  record('A9b. Unknown county name (with a valid state) falls back to the national baseline, no crash',
    unknownCounty.countyResolution.status === 'RESOLVED' && unknownCounty.countyConformingLimit.value === 832750 ? 'PASS' : 'FAIL',
    JSON.stringify(unknownCounty.countyConformingLimit));

  // A10. Wrong year -- county still resolves (geography doesn't depend on year), but
  // every limit/classification field reports UNAVAILABLE, never a stale number.
  const wrongYear = await getLoanLimitIntelligence({ county: 'Ventura', state: 'CA', year: 2024, loanAmount: 900000 });
  record('A10. Wrong year (2024) -> county resolves, but baseline/county/FHA limits + classification all UNAVAILABLE',
    wrongYear.countyResolution.status === 'RESOLVED' &&
    wrongYear.nationalBaselineLimit.status === 'UNAVAILABLE' &&
    wrongYear.countyConformingLimit.status === 'UNAVAILABLE' &&
    wrongYear.fhaCountyLimit.status === 'UNAVAILABLE' &&
    wrongYear.classification.conventional === 'UNAVAILABLE' &&
    wrongYear.classification.fha === 'UNAVAILABLE' &&
    wrongYear.isCurrentYear === false
      ? 'PASS' : 'FAIL',
    JSON.stringify(wrongYear));
  record('A10b. Requesting no year at all defaults to the current data year (2026), is_current_year true',
    (await getLoanLimitIntelligence({ county: 'Ventura', state: 'CA' })).isCurrentYear && CURRENT_LOAN_LIMIT_YEAR === 2026 ? 'PASS' : 'FAIL',
    `CURRENT_LOAN_LIMIT_YEAR=${CURRENT_LOAN_LIMIT_YEAR}`);

  // A11. Real, honest FHA data gap outside California -- never fabricated from the
  // conforming limit (proven: WA's King county is high-balance for conforming, but
  // its FHA limit is a genuine unknown, not silently set equal to the conforming figure).
  const nonCaFha = await getLoanLimitIntelligence({ county: 'King', state: 'WA', units: 1, loanAmount: 900000 });
  record('A11. Non-CA county (WA King) FHA limit/classification honestly UNAVAILABLE, never fabricated from the conforming limit',
    nonCaFha.fhaCountyLimit.status === 'UNAVAILABLE' && nonCaFha.fhaCountyLimit.value === null && nonCaFha.classification.fha === 'UNAVAILABLE' && nonCaFha.countyConformingLimit.value !== null ? 'PASS' : 'FAIL',
    JSON.stringify({ conforming: nonCaFha.countyConformingLimit, fha: nonCaFha.fhaCountyLimit }));

  // A12. program scoping -- 'conventional' suppresses FHA classification (still
  // COUNTY_REQUIRED/UNAVAILABLE-free -- explicitly null, "not requested"), and
  // vice versa; raw limit figures are unaffected by program either way.
  const programConv = await getLoanLimitIntelligence({ county: 'Ventura', state: 'CA', loanAmount: 900000, program: 'conventional' });
  const programFha = await getLoanLimitIntelligence({ county: 'Ventura', state: 'CA', loanAmount: 900000, program: 'fha' });
  record('A12. program="conventional" computes only the conventional classification (fha stays null, not a status code)',
    programConv.classification.conventional !== null && programConv.classification.fha === null ? 'PASS' : 'FAIL',
    JSON.stringify(programConv.classification));
  record('A12b. program="fha" computes only the FHA classification; raw limit figures still present regardless of program',
    programFha.classification.fha !== null && programFha.classification.conventional === null && programFha.countyConformingLimit.value !== null ? 'PASS' : 'FAIL',
    JSON.stringify({ classification: programFha.classification, conforming: programFha.countyConformingLimit }));

  // A13. No location at all, loan far above every possible ceiling -- conventional
  // resolves immediately without needing a county (matches AD-28's existing
  // short-circuit); FHA still correctly needs a county (can't confirm CA vs not).
  const noLocationHugeLoan = await getLoanLimitIntelligence({ loanAmount: 5_000_000 });
  record('A13. No location + loan above every possible ceiling -> conventional ABOVE_CONFORMING_LIMIT without a county; FHA still COUNTY_REQUIRED',
    noLocationHugeLoan.classification.conventional === 'ABOVE_CONFORMING_LIMIT' && noLocationHugeLoan.classification.fha === 'COUNTY_REQUIRED' ? 'PASS' : 'FAIL',
    JSON.stringify(noLocationHugeLoan.classification));

  // ===== B. External contract shape =====

  const shaped = shapeLoanLimitIntelligenceForExternalContract(ventura);
  const parsed = LoanLimitIntelligenceV1Schema.safeParse(shaped);
  record('B1. Shaped output passes LoanLimitIntelligenceV1Schema validation', parsed.success ? 'PASS' : 'FAIL', parsed.success ? 'valid' : JSON.stringify((parsed as any).error?.issues));
  record('B2. contract_version is loan-limit-intelligence-v1', shaped.contract_version === 'loan-limit-intelligence-v1' ? 'PASS' : 'FAIL', shaped.contract_version);
  record('B3. Raw limit fields carry claim_type MARKET FACT; classification carries DERIVED CALCULATION',
    shaped.national_baseline_limit.claim_type === 'MARKET FACT' && shaped.county_conforming_limit.claim_type === 'MARKET FACT' && shaped.fha_county_limit.claim_type === 'MARKET FACT' && shaped.classification.claim_type === 'DERIVED CALCULATION' ? 'PASS' : 'FAIL',
    'checked all 4');
  record('B4. as_of block distinguishes requested_year from current_data_year',
    shaped.as_of.requested_year === CURRENT_LOAN_LIMIT_YEAR && shaped.as_of.current_data_year === CURRENT_LOAN_LIMIT_YEAR && shaped.as_of.is_current_year === true ? 'PASS' : 'FAIL',
    JSON.stringify(shaped.as_of));
  record('B5. disclaimer field present and non-empty', typeof shaped.disclaimer === 'string' && shaped.disclaimer.length > 0 ? 'PASS' : 'FAIL', shaped.disclaimer.slice(0, 40));

  // ===== C. Scope / gateway auth =====

  record('C1. loan_limit_intelligence:read is in ALLOWED_GATEWAY_SCOPES', (ALLOWED_GATEWAY_SCOPES as readonly string[]).includes('loan_limit_intelligence:read') ? 'PASS' : 'FAIL', JSON.stringify(ALLOWED_GATEWAY_SCOPES));

  const { data: partner, error: partnerErr } = await sb.from('gateway_partners').insert({
    name: 'Loan Limit Intelligence Test Partner', contact_email: 'gateway-validation@homerates.ai',
  }).select('id').single();
  if (partnerErr || !partner) throw new Error(`partner insert failed: ${partnerErr?.message}`);
  const partnerIds = [partner.id];
  await sb.from('gateway_partners').update({ status: 'active' }).eq('id', partner.id);

  try {
    const credPropOnly = await issueCredential(partner.id, ['property_intelligence:read']);
    const resultViaPropScope = await getLoanLimitIntelligenceGated({ county: 'Ventura', state: 'CA' }, credPropOnly.plaintextKey, '127.0.0.1');
    record('C2. Existing property_intelligence:read-only credential can call the loan-limit tool (zero re-onboarding)',
      resultViaPropScope.ok ? 'PASS' : 'FAIL', JSON.stringify(resultViaPropScope.ok ? { ok: true } : resultViaPropScope));

    const credLoanOnly = await issueCredential(partner.id, ['loan_limit_intelligence:read']);
    const resultViaLoanScope = await getLoanLimitIntelligenceGated({ county: 'Ventura', state: 'CA' }, credLoanOnly.plaintextKey, '127.0.0.1');
    record('C3. loan_limit_intelligence:read-only credential can call the loan-limit tool',
      resultViaLoanScope.ok ? 'PASS' : 'FAIL', JSON.stringify(resultViaLoanScope.ok ? { ok: true } : resultViaLoanScope));

    const authLoanOnly = await authenticateRequest(credLoanOnly.plaintextKey);
    const scopeCheckForProperty = authLoanOnly.ok ? requireAnyScope(authLoanOnly.context, ['property_intelligence:read']) : null;
    record('C4. loan_limit_intelligence:read-only credential is FORBIDDEN from property_intelligence:read scope (genuinely narrower)',
      authLoanOnly.ok && scopeCheckForProperty?.error === 'FORBIDDEN' ? 'PASS' : 'FAIL', JSON.stringify(scopeCheckForProperty));

    const resultNoAuth = await getLoanLimitIntelligenceGated({ county: 'Ventura', state: 'CA' }, null, '127.0.0.1');
    record('C5. Missing credential -> UNAUTHORIZED', !resultNoAuth.ok && resultNoAuth.error === 'UNAUTHORIZED' ? 'PASS' : 'FAIL', JSON.stringify(resultNoAuth));

    // ===== D. Request validation (INVALID_REQUEST) =====

    const noLocation = await getLoanLimitIntelligenceGated({}, credLoanOnly.plaintextKey, '127.0.0.1');
    record('D1. Neither zip nor county+state -> INVALID_REQUEST', !noLocation.ok && noLocation.error === 'INVALID_REQUEST' ? 'PASS' : 'FAIL', JSON.stringify(noLocation));

    const badZip = await getLoanLimitIntelligenceGated({ zip: '123' }, credLoanOnly.plaintextKey, '127.0.0.1');
    record('D2. Malformed zip (not 5 digits) -> INVALID_REQUEST', !badZip.ok && badZip.error === 'INVALID_REQUEST' ? 'PASS' : 'FAIL', JSON.stringify(badZip));

    const badUnits = await getLoanLimitIntelligenceGated({ county: 'Ventura', state: 'CA', units: 5 }, credLoanOnly.plaintextKey, '127.0.0.1');
    record('D3. units out of range (5) -> INVALID_REQUEST', !badUnits.ok && badUnits.error === 'INVALID_REQUEST' ? 'PASS' : 'FAIL', JSON.stringify(badUnits));

    const badProgram = await getLoanLimitIntelligenceGated({ county: 'Ventura', state: 'CA', program: 'heloc' }, credLoanOnly.plaintextKey, '127.0.0.1');
    record('D4. Invalid program value -> INVALID_REQUEST', !badProgram.ok && badProgram.error === 'INVALID_REQUEST' ? 'PASS' : 'FAIL', JSON.stringify(badProgram));

    const goodCall = await getLoanLimitIntelligenceGated({ county: 'Ventura', state: 'CA', units: 1, loan_amount: 900000 }, credLoanOnly.plaintextKey, '127.0.0.1');
    record('D5. Valid request via the gated entry point returns ok:true with a schema-valid payload', goodCall.ok ? 'PASS' : 'FAIL', JSON.stringify(goodCall.ok ? { contract_version: goodCall.data.contract_version } : goodCall));

    // ===== E4. Real tools/call against the MCP route (needs an active partner/credential,
    // so it runs here, before this try block's finally revokes/cancels them) =====

    const mcpCallBody = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'homerates_loan_limit_intelligence', arguments: { county: 'Ventura', state: 'CA', units: 1, loan_amount: 900000 }, _meta: meta() } };
    const mcpCallResult = await callAdapter(mcpCallBody, { ...mcpHeaders('tools/call', 'homerates_loan_limit_intelligence'), authorization: `Bearer ${credLoanOnly.plaintextKey}`, 'x-forwarded-for': '203.0.113.170' });
    const mcpData = mcpCallResult.json?.result?.content?.[0]?.text ? JSON.parse(mcpCallResult.json.result.content[0].text) : null;
    record('E4. Real tools/call against homerates_loan_limit_intelligence succeeds end to end',
      mcpCallResult.status === 200 && mcpCallResult.json?.result?.isError === false && mcpData?.contract_version === 'loan-limit-intelligence-v1' ? 'PASS' : 'FAIL',
      JSON.stringify(mcpData ?? mcpCallResult.json));
  } finally {
    await sb.from('gateway_credentials').update({ status: 'revoked', revoked_at: new Date().toISOString() }).in('partner_id', partnerIds).neq('status', 'revoked');
    await sb.from('gateway_partners').update({ status: 'cancelled' }).in('id', partnerIds);
  }

  // ===== E. MCP route: tools/list advertises the third tool =====

  const routeSrc = fs.readFileSync(path.resolve(process.cwd(), 'app/api/mcp/property-intelligence/route.ts'), 'utf-8');
  record('E1. Route source references LOAN_LIMIT_TOOL_NAME and dispatches it via getLoanLimitIntelligenceGated',
    /LOAN_LIMIT_TOOL_NAME = 'homerates_loan_limit_intelligence'/.test(routeSrc) && /getLoanLimitIntelligenceGated\(/.test(routeSrc) ? 'PASS' : 'FAIL', 'source-inspected');

  const toolsListResult = await callAdapter({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: meta() } }, mcpHeaders('tools/list', null));
  const listedTools: { name: string; annotations?: Record<string, unknown> }[] = toolsListResult.json?.result?.tools ?? [];
  record('E2. tools/list now advertises exactly 3 tools, including homerates_loan_limit_intelligence',
    listedTools.length === 3 && listedTools.some((t) => t.name === 'homerates_loan_limit_intelligence') ? 'PASS' : 'FAIL',
    JSON.stringify(listedTools.map((t) => t.name)));
  const loanLimitListing = listedTools.find((t) => t.name === 'homerates_loan_limit_intelligence');
  record('E3. homerates_loan_limit_intelligence carries read-only MCP annotations',
    JSON.stringify(loanLimitListing?.annotations) === JSON.stringify({ readOnlyHint: true, destructiveHint: false, openWorldHint: false }) ? 'PASS' : 'FAIL',
    JSON.stringify(loanLimitListing?.annotations));

  const mcpCallNoAuth = await callAdapter(
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'homerates_loan_limit_intelligence', arguments: { county: 'Ventura', state: 'CA' }, _meta: meta() } },
    mcpHeaders('tools/call', 'homerates_loan_limit_intelligence'),
  );
  record('E5. tools/call against homerates_loan_limit_intelligence with no credential -> 401 UNAUTHORIZED (not a silent success)',
    mcpCallNoAuth.status === 401 ? 'PASS' : 'FAIL', JSON.stringify(mcpCallNoAuth.json));

  // ===== F. No stale 2024 FHA constant anywhere in the new code =====

  const newFiles = [
    'lib/pricing/loanLimitIntelligence.ts',
    'lib/gateway/loanLimitSchema.ts',
    'lib/gateway/loanLimitShaping.ts',
    'lib/gateway/loanLimitGateway.ts',
  ];
  const staleFound = newFiles.some((f) => /498,?257|766,?550|1,?149,?825|356,?362/.test(fs.readFileSync(path.resolve(process.cwd(), f), 'utf-8')));
  record('F1. No stale 2024 FHA/conforming constant literal appears in any new loan-limit file', !staleFound ? 'PASS' : 'FAIL', staleFound ? 'FOUND STALE CONSTANT' : 'none found');

  console.log('\n=== FINAL RESULTS ===');
  console.table(results.map((r) => ({ name: r.name, status: r.status })));
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\n${pass}/${results.length} passed.`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
