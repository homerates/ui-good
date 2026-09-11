// scripts/test-golden-prompts.ts
//
// Invocable-by-Design Contract Foundation (2026-09-10) -- platform-neutral
// golden-prompt fixture. 10 representative prompts an AI agent (ChatGPT,
// Claude, Grok, Gemini -- any MCP-compatible caller) might plausibly issue
// against this server, 5 "positive" (a real, exposed tool should answer
// correctly) and 5 "negative-guardrail" (the correct behavior is to NOT
// fabricate a capability, tool, or claim that doesn't exist). Each prompt is
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

    // ── NEGATIVE-GUARDRAIL prompts: no exposed tool / no fabrication ──

    // P3 -- "What's the 2026 conforming/FHA loan limit for this county?"
    // homerates_loan_limit_intelligence is NOT exposed -- tools/list must
    // show exactly the 2 real tools, nothing named for loan limits.
    {
      const r = await callAdapter({ jsonrpc: '2.0', id: 3001, method: 'tools/list', params: { _meta: meta() } }, mcpHeaders('tools/list', null));
      const names: string[] = (r.json?.result?.tools ?? []).map((t: any) => t.name);
      const ok = names.length === 2 && !names.some((n) => /loan_limit/i.test(n));
      record('P3', 'negative-guardrail', "What's the 2026 conforming/FHA loan limit for this county?", 'no-silent-assumptions (tool honestly absent)', ok, JSON.stringify(names));
    }

    // P4 -- "What's the maximum loan amount this borrower can qualify for
    // given their income and debts?" -- homerates_buyer_capacity_intelligence
    // is NOT exposed.
    {
      const r = await callAdapter({ jsonrpc: '2.0', id: 4001, method: 'tools/list', params: { _meta: meta() } }, mcpHeaders('tools/list', null));
      const names: string[] = (r.json?.result?.tools ?? []).map((t: any) => t.name);
      const ok = names.length === 2 && !names.some((n) => /buyer_capacity|qualif/i.test(n));
      record('P4', 'negative-guardrail', 'What is the maximum loan amount this borrower can qualify for?', 'no-silent-assumptions (tool honestly absent)', ok, JSON.stringify(names));
    }

    // P5 -- "Run a full conventional-vs-FHA scenario comparison for me."
    // homerates_scenario_intelligence is NOT exposed.
    {
      const r = await callAdapter({ jsonrpc: '2.0', id: 5001, method: 'tools/list', params: { _meta: meta() } }, mcpHeaders('tools/list', null));
      const names: string[] = (r.json?.result?.tools ?? []).map((t: any) => t.name);
      const ok = names.length === 2 && !names.some((n) => /scenario/i.test(n));
      record('P5', 'negative-guardrail', 'Run a full conventional-vs-FHA scenario comparison for me.', 'no-silent-assumptions (tool honestly absent)', ok, JSON.stringify(names));
    }

    // P6 -- "Summarize this property's market outlook in your own words."
    // The tool DOES exist (property_analysis is a real field), but the
    // guardrail is that AI-synthesized narrative must be labeled as such,
    // never silently presented as a HomeRates fact or valuation conclusion.
    {
      const ok = /property_analysis \(when present\) is HomeRates. own synthesis/.test(propertyDesc) && /not a valuation conclusion/.test(propertyDesc);
      record('P6', 'negative-guardrail', "Summarize this property's market outlook in your own words.", 'right-claim-type (synthesis must be labeled, not silent)', ok, 'TOOL_DESCRIPTION labels property_analysis as synthesis, not a valuation conclusion');
    }

    // P9 -- "Compare conventional vs FHA for me" issued directly as a
    // tools/call for a plausible-but-unregistered scenario-tool name. This
    // is the invocation-time twin of P5's discovery-time check: confirms no
    // internal mechanism (e.g. calcDispatcher.ts's isScenarioComparisonQuestion
    // text-matching, which is real and live for the first-party chat surface)
    // is accidentally reachable through MCP under a name an agent might guess.
    {
      const guessedName = 'homerates_scenario_intelligence';
      const body = { jsonrpc: '2.0', id: 9001, method: 'tools/call', params: { name: guessedName, arguments: {}, _meta: meta() } };
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', guessedName), ...authHeaders });
      const text = r.json?.result?.content?.[0]?.text;
      const ok = r.json?.result?.isError === true && text === `Unknown tool: ${guessedName}`;
      record('P9', 'negative-guardrail', 'Compare conventional vs FHA for me (guessed scenario-tool name).', 'no-silent-assumptions (guessed tool name rejected, not silently handled)', ok, JSON.stringify(r.json?.result));
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
