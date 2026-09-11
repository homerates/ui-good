// scripts/test-golden-prompts.ts
//
// Invocable-by-Design Contract Foundation (2026-09-10) -- platform-neutral
// golden-prompt fixture. 10 representative prompts an AI agent (ChatGPT,
// Claude, Grok, Gemini -- any MCP-compatible caller) might plausibly issue
// against this server, originally 5 "positive" (a real, exposed tool should
// answer correctly) and 5 "negative-guardrail" (the correct behavior is to
// NOT fabricate a capability, tool, or claim that doesn't exist). UPDATED
// 2026-09-11 (Invocable Tool Workstream): P3 was a negative-guardrail
// ("loan limit tool doesn't exist") when written -- now that
// homerates_loan_limit_intelligence is real and exposed, asserting its
// absence would itself be a false test, so P3 was reclassified to positive
// and rewritten as a real executable call against the tool, matching P8's
// style. UPDATED AGAIN 2026-09-11 (same day, Invocable Tool Workstream):
// homerates_scenario_intelligence shipped next -- P5 (originally "scenario
// tool doesn't exist") gets the identical treatment, reclassified to
// positive with a real call. P9's guessed-tool-name guardrail was pointed
// at 'homerates_scenario_intelligence' as a plausible-but-unregistered
// name -- now that it's real, P9 was repointed at
// 'homerates_buyer_capacity_intelligence' (still genuinely unexposed),
// which serves the identical guardrail purpose. 7 positive / 3
// negative-guardrail now. Each prompt is
// scored on the dimensions the brief specified: right-tool, right-claim-type,
// source-as-of-correct, no-fabricated-precision, no-program-overclaim,
// no-silent-assumptions -- via real, executable assertions against the
// actual route/tool descriptions and (where a live call is meaningful) a
// real in-process call to the shipped route, exactly as
// scripts/test-external-adapter.ts already does. This is a NEW, narrower
// fixture layered on top of that suite, not a replacement for it -- it tests
// prompt-to-tool-selection guidance and cross-tool guardrails specifically,
// which the existing suites don't score.
//
// Run with: npx tsx scripts/test-golden-prompts.ts

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
import { issueCredential } from '../lib/gateway/credentials';
import { POST } from '../app/api/mcp/property-intelligence/route';

type Status = 'PASS' | 'FAIL';
interface Result { promptId: string; kind: 'positive' | 'negative-guardrail'; prompt: string; dimension: string; status: Status; evidence: string }
const results: Result[] = [];
let blockingFailure = false;

function record(promptId: string, kind: 'positive' | 'negative-guardrail', prompt: string, dimension: string, ok: boolean, evidence: string) {
  const status: Status = ok ? 'PASS' : 'FAIL';
  results.push({ promptId, kind, prompt, dimension, status, evidence });
  if (status === 'FAIL') blockingFailure = true;
  console.log(`[${status}] ${promptId} (${kind}) / ${dimension} -- ${evidence}`);
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
  // Real, evaluated tool descriptions as an actual MCP caller would see them
  // -- fetched via a live tools/list call, NOT regex-scraped from the raw
  // .ts source (the source stores each description as several quoted
  // fragments joined by `+`, so grepping it directly would match against
  // stray quote/plus-sign artifacts instead of the real assembled string).
  const toolsListResult = await callAdapter({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: meta() } }, mcpHeaders('tools/list', null));
  const listedTools: { name: string; description: string }[] = toolsListResult.json?.result?.tools ?? [];
  const propertyDesc = listedTools.find((t) => t.name === 'homerates_property_intelligence')?.description ?? '';
  const rateDesc = listedTools.find((t) => t.name === 'homerates_rate_oracle')?.description ?? '';

  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured.');
  const partnerIds: string[] = [];
  const { data: partner } = await sb.from('gateway_partners').insert({ name: 'Golden Prompt Fixture Test Partner', contact_email: 'gateway-validation@homerates.ai' }).select('id').single();
  if (!partner) throw new Error('partner insert failed');
  partnerIds.push(partner.id);
  await sb.from('gateway_partners').update({ status: 'active' }).eq('id', partner.id);

  try {
    const cred = await issueCredential(partner.id, ['property_intelligence:read']);
    const authHeaders = { authorization: `Bearer ${cred.plaintextKey}`, 'x-forwarded-for': '203.0.113.150' };

    // ── POSITIVE prompts: an exposed tool exists and must be correctly described ──

    // P1 -- "What are today's benchmark national mortgage rates?"
    // right-tool: homerates_rate_oracle. no-program-overclaim /
    // benchmark-ne-borrower-rate (semantic rule): description must say these
    // are national/neutral, not a personal quote.
    {
      const ok = /neutral, national reference rates/.test(rateDesc) && /not a quote or offer to any individual borrower/.test(rateDesc) && /do not reflect any specific credit score/.test(rateDesc);
      record('P1', 'positive', "What are today's benchmark national mortgage rates?", 'right-tool / no-program-overclaim', ok, 'homerates_rate_oracle description asserts neutral/national/non-personal framing');
    }

    // P2 -- "Give me full property + financing intelligence for this address."
    // right-tool: homerates_property_intelligence. right-claim-type: the
    // description must enumerate the full claim_type vocabulary so a caller
    // knows to distinguish fact from assumption from synthesis.
    {
      const claimTypes = ['PROPERTY FACT', 'MARKET FACT', 'ILLUSTRATIVE ASSUMPTION', 'DERIVED CALCULATION', 'ESTIMATE', 'AI INTERPRETATION'];
      const ok = claimTypes.every((c) => propertyDesc.includes(c));
      record('P2', 'positive', 'Give me full property + financing intelligence for this address.', 'right-tool / right-claim-type', ok, `all 6 claim types present in TOOL_DESCRIPTION: ${ok}`);
    }

    // P7 -- "Does the property tool distinguish its own value estimate from the asking price?"
    // no-fabricated-precision / asking-price-ne-avm (semantic rule).
    {
      const ok = /CURRENT_ASKING_PRICE/.test(propertyDesc) && /never call that figure HomeRates. estimate of value/.test(propertyDesc);
      record('P7', 'positive', "Does the property tool distinguish its own value estimate from the asking price?", 'no-fabricated-precision', ok, 'TOOL_DESCRIPTION explicitly separates purchase_price_basis / CURRENT_ASKING_PRICE from value_intelligence.avm');
    }

    // P8 -- "What's the current 5/1 ARM rate?" -- REAL executable call. The
    // underlying FRED series (MORTGAGE5US) was discontinued in 2022 -- this
    // is the direct, live proof that a caller asking for it gets UNAVAILABLE
    // + null, never a multi-year-stale number presented as current.
    {
      const body = { jsonrpc: '2.0', id: 8001, method: 'tools/call', params: { name: 'homerates_rate_oracle', arguments: {}, _meta: meta() } };
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', 'homerates_rate_oracle'), ...authHeaders });
      const data = r.json?.result?.content?.[0]?.text ? JSON.parse(r.json.result.content[0].text) : null;
      const arm = data?.five_one_arm;
      const ok = r.status === 200 && arm?.freshness_status === 'UNAVAILABLE' && arm?.value === null && typeof arm?.as_of === 'string';
      record('P8', 'positive', "What's the current 5/1 ARM rate?", 'source-as-of-correct / no-fabricated-precision (real call)', ok, JSON.stringify(arm));
    }

    // P10 -- "Can I trust this as the actual rate a lender will quote me?"
    // no-program-overclaim / benchmark-ne-borrower-rate: description must
    // explicitly disclaim LLPA/credit-score/down-payment dependency.
    {
      const ok = /an individual borrower.s actual rate depends on their credit, down payment, and loan program/.test(rateDesc);
      record('P10', 'positive', 'Can I trust this as the actual rate a lender will quote me?', 'no-program-overclaim', ok, 'BENCHMARK_RATES_TOOL_DESCRIPTION explicitly disclaims individual-borrower dependency');
    }

    // P3 -- "What's the 2026 conforming loan limit for Ventura County, CA?"
    // -- REAL executable call. right-tool: homerates_loan_limit_intelligence
    // (exposed 2026-09-11). Verifies the real Ventura County high-balance
    // limit comes back correctly classified, not a guessed/default figure.
    {
      const body = { jsonrpc: '2.0', id: 3001, method: 'tools/call', params: { name: 'homerates_loan_limit_intelligence', arguments: { county: 'Ventura', state: 'CA', loan_amount: 1000000 }, _meta: meta() } };
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', 'homerates_loan_limit_intelligence'), ...authHeaders });
      const data = r.json?.result?.content?.[0]?.text ? JSON.parse(r.json.result.content[0].text) : null;
      const ok = r.status === 200 && data?.contract_version === 'loan-limit-intelligence-v1' && data?.county_conforming_limit?.is_high_balance === true && data?.classification?.conventional === 'HIGH_BALANCE';
      record('P3', 'positive', "What's the 2026 conforming loan limit for Ventura County, CA?", 'right-tool / right-claim-type (real call)', ok, JSON.stringify(data));
    }

    // ── NEGATIVE-GUARDRAIL prompts: no exposed tool / no fabrication ──

    // P4 -- "What's the maximum loan amount this borrower can qualify for
    // given their income and debts?" -- homerates_buyer_capacity_intelligence
    // is NOT exposed.
    {
      const r = await callAdapter({ jsonrpc: '2.0', id: 4001, method: 'tools/list', params: { _meta: meta() } }, mcpHeaders('tools/list', null));
      const names: string[] = (r.json?.result?.tools ?? []).map((t: any) => t.name);
      const ok = names.length === 4 && !names.some((n) => /buyer_capacity|qualif/i.test(n));
      record('P4', 'negative-guardrail', 'What is the maximum loan amount this borrower can qualify for?', 'no-silent-assumptions (tool honestly absent)', ok, JSON.stringify(names));
    }

    // P5 -- "Run the numbers on a $900k purchase, 10% down, conventional." --
    // REAL executable call. right-tool: homerates_scenario_intelligence
    // (exposed 2026-09-11). Verifies the deal math comes back computed via
    // calcEngine.ts (correctly LTV-tiered PMI), not a guessed/default figure.
    {
      const body = { jsonrpc: '2.0', id: 5001, method: 'tools/call', params: { name: 'homerates_scenario_intelligence', arguments: { price: 900000, program: 'conventional', down_payment_pct: 10, rate_pct: 6.5 }, _meta: meta() } };
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', 'homerates_scenario_intelligence'), ...authHeaders });
      const data = r.json?.result?.content?.[0]?.text ? JSON.parse(r.json.result.content[0].text) : null;
      const ok = r.status === 200 && data?.contract_version === 'scenario-intelligence-v1' && data?.monthly_breakdown?.mortgage_insurance_label === 'PMI' && data?.monthly_breakdown?.mortgage_insurance > 0;
      record('P5', 'positive', 'Run the numbers on a $900k purchase, 10% down, conventional.', 'right-tool / right-claim-type (real call)', ok, JSON.stringify(data));
    }

    // P6 -- "Summarize this property's market outlook in your own words."
    // The tool DOES exist (property_analysis is a real field), but the
    // guardrail is that AI-synthesized narrative must be labeled as such,
    // never silently presented as a HomeRates fact or valuation conclusion.
    {
      const ok = /property_analysis \(when present\) is HomeRates. own synthesis/.test(propertyDesc) && /not a valuation conclusion/.test(propertyDesc);
      record('P6', 'negative-guardrail', "Summarize this property's market outlook in your own words.", 'right-claim-type (synthesis must be labeled, not silent)', ok, 'TOOL_DESCRIPTION labels property_analysis as synthesis, not a valuation conclusion');
    }

    // P9 -- "What's the most this borrower can afford?" issued directly as a
    // tools/call for a plausible-but-unregistered buyer-capacity-tool name
    // (homerates_scenario_intelligence no longer serves this purpose --
    // it's real and exposed now; homerates_buyer_capacity_intelligence
    // remains genuinely unexposed). Confirms no internal mechanism is
    // accidentally reachable through MCP under a name an agent might guess.
    {
      const guessedName = 'homerates_buyer_capacity_intelligence';
      const body = { jsonrpc: '2.0', id: 9001, method: 'tools/call', params: { name: guessedName, arguments: {}, _meta: meta() } };
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', guessedName), ...authHeaders });
      const text = r.json?.result?.content?.[0]?.text;
      const ok = r.json?.result?.isError === true && text === `Unknown tool: ${guessedName}`;
      record('P9', 'negative-guardrail', 'What is the most this borrower can afford? (guessed buyer-capacity-tool name)', 'no-silent-assumptions (guessed tool name rejected, not silently handled)', ok, JSON.stringify(r.json?.result));
    }

    console.log('\n=== FINAL RESULTS ===');
    console.table(results.map((r) => ({ id: r.promptId, kind: r.kind, dimension: r.dimension, status: r.status })));
    const pass = results.filter((r) => r.status === 'PASS').length;
    const fail = results.filter((r) => r.status === 'FAIL').length;
    console.log(`\nPASS=${pass} FAIL=${fail} TOTAL=${results.length}`);
  } finally {
    await sb.from('gateway_credentials').update({ status: 'revoked', revoked_at: new Date().toISOString() }).in('partner_id', partnerIds).neq('status', 'revoked');
    await sb.from('gateway_partners').update({ status: 'cancelled' }).in('id', partnerIds);
  }

  process.exit(blockingFailure ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
