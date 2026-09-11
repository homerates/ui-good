// scripts/test-external-adapter.ts
//
// HomeRates Intelligence Gateway V1 — Phase G adapter test harness.
//
// Run with: npx --yes tsx scripts/test-external-adapter.ts
//
// Tests app/api/mcp/property-intelligence/route.ts DIRECTLY, in-process, by
// constructing real NextRequest objects and calling the route's exported
// POST() handler — a full, faithful invocation of the actual shipped route
// code (Next.js route handlers are plain functions over Web-standard
// Request/Response; no live dev server is required to exercise them for
// real, matching this repo's established Gateway validation methodology).
//
// This is a SEPARATE, clearly delineated harness from
// scripts/test-intelligence-gateway.ts (Phase F, the canonical internal
// Gateway release gate) — this file does not modify or weaken that one; it
// tests the NEW adapter layer only. Phase F is re-run independently after
// this file, unchanged.
//
// UPDATED for MCP protocol revision 2026-07-28 (stateless, per-request
// metadata) — see the route file's own header for the full protocol
// research. Every tools/list and tools/call request built below carries the
// real required headers (MCP-Protocol-Version, Mcp-Method, Mcp-Name where
// applicable) and body _meta fields, matching the actual spec, not a
// simplified stand-in. The legacy initialize/notifications/initialized
// handshake is tested separately as the narrow compatibility shim it is —
// not the primary flow.
//
// Creates its own fixtures and cleans them up in a finally block (the exact
// lesson learned and fixed in Phase F: a crash mid-run must not strand
// fixtures). One real test-script bug was found and fixed during this
// file's own first version: every call shared one fallback IP, so a
// rate-limit burst test exhausted it and contaminated every later test in
// the same run. Every test block below uses its own distinct IP for
// exactly this reason.

import fs from 'fs';
import path from 'path';
import { randomBytes, createHash } from 'crypto';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

import { NextRequest } from 'next/server';
import { getSupabase } from '../lib/supabaseServer';
import { issueCredential, revokeCredential } from '../lib/gateway/credentials';
import { getPropertyIntelligenceCorpusOnly } from '../lib/gateway/corpusOnlyIntelligence';
import { buildCanonicalPropertyIntelligence } from '../lib/canonicalPropertyIntelligence';
import { getPropertyIntelligenceData } from '../lib/propertyIntelligence';
import { ExternalPropertyIntelligenceV1Schema } from '../lib/gateway/outputSchema';
import { shapeForExternalContract } from '../lib/gateway/outputShaping';
import { resolvePropertyId } from '../lib/gateway/intelligenceGateway';
import { POST } from '../app/api/mcp/property-intelligence/route';

function sha256Hex(s: string) { return createHash('sha256').update(s, 'utf8').digest('hex'); }

type Status = 'PASS' | 'FAIL';
interface Result { category: string; name: string; status: Status; evidence: string }
const results: Result[] = [];
let blockingFailure = false;

function record(category: string, name: string, status: Status, evidence: string) {
  results.push({ category, name, status, evidence });
  if (status === 'FAIL') blockingFailure = true;
  console.log(`[${status}] ${category} / ${name} -- ${evidence}`);
}

const ROUTE_URL = 'http://localhost/api/mcp/property-intelligence';
const PROTOCOL_VERSION = '2026-07-28';

// Phase 1 (2026-09-08, demand-driven external resolution) CHANGE: the route
// now calls resolveExternalPropertyIntelligence() (lib/externalPropertyResolution.ts),
// which -- ONLY on a NOT_AVAILABLE result -- makes one real self-fetch to the
// live /api/property/lookup endpoint, which itself makes real paid Tavily/
// GPT-4o calls. Every pre-existing test below that uses the sentinel
// nonexistentAddr fixture for unrelated control-plane assertions (auth,
// scope, rate-limit, circuit breaker, kill switch, leakage, adversarial) has
// nothing to do with resolution behavior -- without this interception, every
// run of this suite would burn real external-provider cost and real network
// latency against a garbage address, dozens of times, and (confirmed live)
// the added latency was enough to shift the rate-limit-burst test's timing
// and break it. Intercepted by DEFAULT (canned NOT_AVAILABLE-preserving
// response, zero real cost). The dedicated Resolution test block below
// installs `resolutionFetchHandler` for its own scope only, then clears it
// immediately after -- a fully controlled/mocked stand-in for
// /api/property/lookup (never real Tavily/GPT-4o), so those tests exercise
// lib/externalPropertyResolution.ts's real logic deterministically without
// live-provider flakiness or cost. Phase 9 (separately) is where one real,
// live address is used for genuine end-to-end validation on dev.
let interceptResolutionFetch = true;
let resolutionFetchCallCount = 0;
// Progressive Intelligence (2026-09-09): resolveExternalPropertyIntelligence()
// now also fires a fire-and-forget POST to /api/beta/grok-property (via
// after(), falling back to an un-awaited call outside a real Next.js request
// scope -- exactly this test harness's own calling convention, see
// callAdapter() below). Intercepted the same way /api/property/lookup
// already is -- a real, uncontrolled call here would hit live Grok/xAI
// infrastructure on every NEWLY_RESOLVED/RESOLUTION_SKIPPED test in this
// suite, which is neither cheap nor deterministic for a regression gate.
let grokTriggerFetchCallCount = 0;
// Held in a mutable ref object (not a bare `let`) so re-pointing `.handler`
// from a later test block is unambiguous for both us and the type checker.
type ResolutionMockHandler = (address: string) => Promise<{ status: number; body: unknown }>;
const resolutionMock: { handler: ResolutionMockHandler | null } = { handler: null };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  if (url.includes('/api/property/lookup')) {
    if (resolutionMock.handler) {
      resolutionFetchCallCount += 1;
      let address = '';
      try { address = JSON.parse(String(init?.body ?? '{}')).address ?? ''; } catch { /* noop */ }
      const { status, body } = await resolutionMock.handler(address);
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }
    if (interceptResolutionFetch) {
      resolutionFetchCallCount += 1;
      return new Response(JSON.stringify({ ok: false, error: 'test-harness: resolution not attempted (intercepted)' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
  }
  if (url.includes('/api/beta/grok-property')) {
    grokTriggerFetchCallCount += 1;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(input, init);
}) as typeof fetch;

async function callAdapter(rpcBody: Record<string, unknown>, headers: Record<string, string> = {}) {
  const req = new NextRequest(ROUTE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(rpcBody),
  });
  const res = await POST(req);
  const status = res.status;
  let json: any = null;
  try { json = await res.json(); } catch { /* e.g. 202 has no body */ }
  return { status, json };
}

// Every call site below passes its own distinct IP suffix -- sharing one
// fallback IP across independent tests would let an earlier test's rate-
// limit burst exhaust the ip-minute dimension for every later test in the
// same run (found and fixed here; the same lesson Phase F's harness already
// encoded for exactly this reason).
function authHeaders(key: string, ip: string) { return { authorization: `Bearer ${key}`, 'x-forwarded-for': ip }; }

function meta(overrides: Record<string, unknown> = {}) {
  return {
    'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION,
    'io.modelcontextprotocol/clientCapabilities': {},
    ...overrides,
  };
}

function mcpHeaders(method: string, name: string | null, overrides: Record<string, string> = {}) {
  const h: Record<string, string> = { 'mcp-protocol-version': PROTOCOL_VERSION, 'mcp-method': method };
  if (name !== null) h['mcp-name'] = name;
  return { ...h, ...overrides };
}

function toolsListBody(id: number, metaOverrides: Record<string, unknown> = {}) {
  return { jsonrpc: '2.0', id, method: 'tools/list', params: { _meta: meta(metaOverrides) } };
}

function toolsCallBody(id: number, toolName: string, args: Record<string, unknown>, metaOverrides: Record<string, unknown> = {}) {
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name: toolName, arguments: args, _meta: meta(metaOverrides) } };
}

// Invocable-by-Design Contract Foundation (2026-09-10): canonical names.
// TOOL_NAME/BENCHMARK_RATES_TOOL_NAME below are what tools/list now
// advertises; the LEGACY_* constants are the pre-rename names, which
// tools/call must still accept for already-connected callers.
const TOOL_NAME = 'homerates_property_intelligence';
const LEGACY_TOOL_NAME = 'get_property_intelligence';
const BENCHMARK_RATES_TOOL_NAME = 'homerates_rate_oracle';
const LEGACY_BENCHMARK_RATES_TOOL_NAME = 'get_benchmark_rates';

async function main() {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured.');

  const partnerIds: string[] = [];
  const resolutionTestPropertyIds: string[] = [];

  console.log('=== FIXTURE SETUP ===');
  const { data: partner } = await sb.from('gateway_partners').insert({ name: 'Phase G Adapter Test Partner', contact_email: 'gateway-validation@homerates.ai' }).select('*').single();
  partnerIds.push(partner.id);
  await sb.from('gateway_partners').update({ status: 'active' }).eq('id', partner.id);

  const cred = await issueCredential(partner.id, ['property_intelligence:read']);
  const { data: credRow } = await sb.from('gateway_credentials').select('id').eq('key_prefix', cred.prefix).single();

  const noScopePrefix = randomBytes(6).toString('hex');
  const noScopeSecret = randomBytes(32).toString('hex');
  const noScopePlain = `hrg_${noScopePrefix}_${noScopeSecret}`;
  await sb.from('gateway_credentials').insert({ partner_id: partner.id, key_prefix: noScopePrefix, key_hash: sha256Hex(noScopePlain), scopes: [], status: 'active' });

  const nonexistentAddr = '777777 PhaseG Sentinel Nonexistent Rd, Nowhereville, ZZ 00000';

  try {
    // ===== find real AVAILABLE and PARTIAL fixtures =====
    const { data: candidates } = await sb.from('properties').select('id, address_full').limit(200);
    let availableAddress: string | null = null;
    let partialAddress: string | null = null;
    let availableRawId: string | null = null;
    for (const c of candidates ?? []) {
      const d = await getPropertyIntelligenceCorpusOnly(c.id);
      if (!d) continue;
      if (!availableAddress && d.eligibility === 'index') { availableAddress = c.address_full; availableRawId = c.id; }
      if (!partialAddress && d.eligibility === 'noindex') { partialAddress = c.address_full; }
      if (availableAddress && partialAddress) break;
    }
    console.log('AVAILABLE fixture:', availableAddress);
    console.log('PARTIAL fixture:', partialAddress);

    // A fresh, single-purpose credential per business-logic test block below
    // -- NOT shared `cred` -- so no test's real Gateway calls can push
    // credential/minute (limit 10) over threshold depending on how many
    // other tests happened to run first, or how fast/slow this particular
    // run executes relative to a UTC minute boundary. `cred` itself is
    // still used for the handful of tests that specifically need a *known,
    // reusable* valid credential (adapter-level rejections that never reach
    // the Gateway's rate-limit check at all, or paired same-credential
    // comparisons like 15.1).
    async function freshCred() {
      const c = await issueCredential(partner.id, ['property_intelligence:read']);
      return c.plaintextKey;
    }

    // ===== LEGACY HANDSHAKE SHIM (narrow compatibility path, not primary flow) =====
    console.log('\n=== LEGACY HANDSHAKE SHIM ===');
    const init = await callAdapter({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
    record('Legacy', 'initialize still answered (compat shim)', init.status === 200 && init.json?.result?.capabilities?.tools !== undefined ? 'PASS' : 'FAIL', JSON.stringify(init.json));

    const notif = await callAdapter({ jsonrpc: '2.0', method: 'notifications/initialized' });
    record('Legacy', 'notifications/initialized returns 202, no body', notif.status === 202 && notif.json === null ? 'PASS' : 'FAIL', `status=${notif.status}`);

    // ===== CURRENT PROTOCOL (2026-07-28) CONFORMANCE =====
    console.log('\n=== CURRENT PROTOCOL CONFORMANCE ===');

    // 1. valid current-protocol tools/list
    {
      // WS10: this server now advertises 2 tools. Invocable-by-Design
      // Contract Foundation (2026-09-10): those 2 tools are now advertised
      // under their canonical names (TOOL_NAME/BENCHMARK_RATES_TOOL_NAME),
      // never the legacy names -- tools/list must show ONLY the new names.
      const r = await callAdapter(toolsListBody(2), mcpHeaders('tools/list', null));
      const toolNames = (r.json?.result?.tools ?? []).map((t: any) => t.name);
      const ok = r.status === 200 && r.json?.result?.resultType === 'complete' && r.json.result.tools?.length === 2 && toolNames.includes(TOOL_NAME) && toolNames.includes(BENCHMARK_RATES_TOOL_NAME) && !toolNames.includes(LEGACY_TOOL_NAME) && !toolNames.includes(LEGACY_BENCHMARK_RATES_TOOL_NAME) && r.json.result._meta?.['io.modelcontextprotocol/serverInfo'] !== undefined;
      record('Conformance', 'valid current-protocol tools/list', ok ? 'PASS' : 'FAIL', JSON.stringify(toolNames));
    }

    // 1b. Backward compatibility: a caller that cached the pre-rename tool
    // names must still be able to invoke them via tools/call, even though
    // tools/list no longer advertises them.
    if (availableAddress) {
      const key = await freshCred();
      const body = toolsCallBody(2001, LEGACY_TOOL_NAME, { address: availableAddress });
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', LEGACY_TOOL_NAME), ...authHeaders(key, '203.0.113.201') });
      const data = r.json?.result?.content?.[0]?.text ? JSON.parse(r.json.result.content[0].text) : null;
      const ok = r.status === 200 && r.json?.result?.isError !== true && data != null;
      record('Conformance', 'legacy tool name get_property_intelligence still callable via tools/call', ok ? 'PASS' : 'FAIL', JSON.stringify(r.json?.result?.isError ? r.json.result : { hasData: data != null }));
    }
    {
      const body = toolsCallBody(2002, LEGACY_BENCHMARK_RATES_TOOL_NAME, {});
      const r = await callAdapter(body, mcpHeaders('tools/call', LEGACY_BENCHMARK_RATES_TOOL_NAME));
      // No credential attached -- expect a Gateway UNAUTHORIZED mapping (not
      // "Unknown tool"), which proves the legacy name reached the benchmark
      // dispatch branch rather than falling through to the unknown-tool guard.
      const ok = r.json?.result?.content?.[0]?.text !== `Unknown tool: ${LEGACY_BENCHMARK_RATES_TOOL_NAME}`;
      record('Conformance', 'legacy tool name get_benchmark_rates still recognized (not "Unknown tool") via tools/call', ok ? 'PASS' : 'FAIL', JSON.stringify(r.json?.result));
    }

    // 2. valid current-protocol tools/call
    if (availableAddress) {
      const key = await freshCred();
      const body = toolsCallBody(3, TOOL_NAME, { address: availableAddress });
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(key, '203.0.113.60') });
      const data = r.json?.result?.content?.[0]?.text ? JSON.parse(r.json.result.content[0].text) : null;
      const ok = r.status === 200 && r.json?.result?.resultType === 'complete' && r.json.result.isError === false && data?.availability?.status === 'AVAILABLE';
      record('Conformance', 'valid current-protocol tools/call (AVAILABLE)', ok ? 'PASS' : 'FAIL', JSON.stringify(r.json).slice(0, 200));
    }

    // 3. protocol-version header missing -> reject
    {
      const body = toolsListBody(4);
      const r = await callAdapter(body, { 'mcp-method': 'tools/list' }); // no mcp-protocol-version
      record('Conformance', 'missing MCP-Protocol-Version header -> rejected', r.status === 400 && r.json?.error?.code === -32020 ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }

    // 4. Mcp-Method disagrees with body -> reject
    {
      const body = toolsListBody(5);
      const r = await callAdapter(body, mcpHeaders('tools/call', null)); // header says tools/call, body says tools/list
      record('Conformance', 'Mcp-Method header disagrees with body -> rejected', r.status === 400 && r.json?.error?.code === -32020 ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }

    // 5. Mcp-Name disagrees with body (tools/call) -> reject
    if (availableAddress) {
      const body = toolsCallBody(6, TOOL_NAME, { address: availableAddress });
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', 'some_other_tool'), ...authHeaders(cred.plaintextKey, '203.0.113.61') });
      record('Conformance', 'Mcp-Name header disagrees with body -> rejected', r.status === 400 && r.json?.error?.code === -32020 ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }

    // 6. missing Mcp-Method header entirely
    {
      const body = toolsListBody(7);
      const r = await callAdapter(body, { 'mcp-protocol-version': PROTOCOL_VERSION }); // no mcp-method
      record('Conformance', 'missing Mcp-Method header -> rejected', r.status === 400 && r.json?.error?.code === -32020 ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }

    // 7. missing Mcp-Name header on tools/call (required for this method)
    if (availableAddress) {
      const body = toolsCallBody(8, TOOL_NAME, { address: availableAddress });
      const r = await callAdapter(body, { 'mcp-protocol-version': PROTOCOL_VERSION, 'mcp-method': 'tools/call', ...authHeaders(cred.plaintextKey, '203.0.113.62') }); // no mcp-name
      record('Conformance', 'missing Mcp-Name header on tools/call -> rejected', r.status === 400 && r.json?.error?.code === -32020 ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }

    // 8. mismatched tool name (header agrees with body, but names a tool that doesn't exist) -- distinct from header/body agreement check; this exercises the tool-lookup path, not header validation
    if (availableAddress) {
      const body = toolsCallBody(9, 'not_a_real_tool', { address: availableAddress });
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', 'not_a_real_tool'), ...authHeaders(cred.plaintextKey, '203.0.113.63') });
      record('Conformance', 'header/body agree but name unknown tool -> clean tool error', r.status === 200 && r.json?.result?.isError === true && r.json.result.content[0].text.includes('Unknown tool') ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }

    // 9. request metadata shape: missing _meta.protocolVersion in body
    {
      const body: any = toolsListBody(10);
      delete body.params._meta['io.modelcontextprotocol/protocolVersion'];
      const r = await callAdapter(body, mcpHeaders('tools/list', null));
      record('Conformance', 'missing _meta.protocolVersion in body -> rejected (-32602)', r.status === 400 && r.json?.error?.code === -32602 ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }

    // 9b. request metadata shape: missing _meta.clientCapabilities in body
    {
      const body: any = toolsListBody(11);
      delete body.params._meta['io.modelcontextprotocol/clientCapabilities'];
      const r = await callAdapter(body, mcpHeaders('tools/list', null));
      record('Conformance', 'missing _meta.clientCapabilities in body -> rejected (-32602)', r.status === 400 && r.json?.error?.code === -32602 ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }

    // 9c. header/body protocol version mismatch
    {
      const body = toolsListBody(12, { 'io.modelcontextprotocol/protocolVersion': '2025-06-18' });
      const r = await callAdapter(body, mcpHeaders('tools/list', null)); // header says 2026-07-28, body says 2025-06-18
      record('Conformance', 'MCP-Protocol-Version header disagrees with body -> rejected (-32020)', r.status === 400 && r.json?.error?.code === -32020 ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }

    // 9d. unsupported protocol version (header and body agree, but on an unsupported version)
    {
      const body = toolsListBody(13, { 'io.modelcontextprotocol/protocolVersion': '1999-01-01' });
      const r = await callAdapter(body, { 'mcp-protocol-version': '1999-01-01', 'mcp-method': 'tools/list' });
      record('Conformance', 'unsupported protocol version -> rejected (-32022)', r.status === 400 && r.json?.error?.code === -32022 && Array.isArray(r.json.error.data?.supported) ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }

    // 10. no session dependency
    {
      // Comments legitimately explain the no-session design decision (the
      // word "session" appears there on purpose) -- strip comments before
      // scanning for actual session-handling CODE, same technique as the
      // 14.14 no-live-provider check below.
      const routeSource = fs.readFileSync(path.resolve(process.cwd(), 'app/api/mcp/property-intelligence/route.ts'), 'utf8');
      const codeOnly = routeSource.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const noSession = !/mcp-session-id|sessionid/i.test(codeOnly);
      record('Conformance', 'no session state (no Mcp-Session-Id header read/written in route code)', noSession ? 'PASS' : 'FAIL', `code (comments stripped) references a session header: ${!noSession}`);
      // Two independent tools/call requests with no shared header/state between them, in reverse id order, still each succeed independently.
      if (availableAddress) {
        const key = await freshCred();
        const rA = await callAdapter(toolsCallBody(901, TOOL_NAME, { address: nonexistentAddr }), { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(key, '203.0.113.64') });
        const rB = await callAdapter(toolsCallBody(900, TOOL_NAME, { address: availableAddress }), { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(key, '203.0.113.64') });
        record('Conformance', 'two independent requests need no session/order dependency', rA.json?.result?.isError === false && rB.json?.result?.isError === false ? 'PASS' : 'FAIL', `A=${rA.status} B=${rB.status}`);
      }
    }

    // 11. existing HomeRates auth still enforced (modern protocol path)
    {
      const body = toolsCallBody(14, TOOL_NAME, { address: nonexistentAddr });
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', TOOL_NAME), authorization: 'Bearer hrg_garbage_notreal', 'x-forwarded-for': '203.0.113.65' });
      // Phase OB CHANGE: UNAUTHORIZED now maps to a real HTTP 401 +
      // WWW-Authenticate challenge (MCP 2026-07-28 Authorization spec's
      // "Invalid or expired tokens MUST receive a HTTP 401 response"),
      // not a JSON-RPC 200 isError:true result. Updated from the pre-Phase-OB
      // assertion, which checked r.json.result.isError/content[0].text.
      record('Conformance', 'invalid credential still -> UNAUTHORIZED (modern path)', r.status === 401 && r.json?.error === 'invalid_token' ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }
    {
      const body = toolsCallBody(15, TOOL_NAME, { address: nonexistentAddr });
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(noScopePlain, '203.0.113.66') });
      // Phase OB CHANGE: FORBIDDEN now maps to a real HTTP 403 +
      // insufficient_scope WWW-Authenticate challenge, not a JSON-RPC 200
      // isError:true result. Same reasoning as the UNAUTHORIZED case above.
      record('Conformance', 'missing scope still -> FORBIDDEN (modern path)', r.status === 403 && r.json?.error === 'insufficient_scope' ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }

    // 12. Contract V1 unchanged
    if (availableAddress) {
      const key = await freshCred();
      const body = toolsCallBody(16, TOOL_NAME, { address: availableAddress });
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(key, '203.0.113.67') });
      const data = JSON.parse(r.json.result.content[0].text);
      const parsed = ExternalPropertyIntelligenceV1Schema.safeParse(data);
      record('Conformance', 'Contract V1 schema still validates (modern path)', parsed.success ? 'PASS' : 'FAIL', parsed.success ? 'valid' : JSON.stringify(parsed.error?.issues?.slice(0, 3)));
    }

    // Unknown method -> HTTP 404 (spec-correct, changed from the prior 200-status implementation)
    {
      const r = await callAdapter({ jsonrpc: '2.0', id: 17, method: 'resources/list', params: { _meta: meta() } }, mcpHeaders('resources/list', null));
      record('Conformance', 'unknown method -> HTTP 404 + JSON-RPC -32601', r.status === 404 && r.json?.error?.code === -32601 ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }

    // ===== Version-aware validation (added 2026-09-08) -- reproduces the
    // EXACT two real ChatGPT request shapes observed live in production:
    // a 2025-11-25 tools/list with only the MCP-Protocol-Version header
    // (no Mcp-Method/Mcp-Name/_meta at all), and a 2026-07-28
    // server/discover with the full modern shape. See
    // validateModernRequest()'s own header comment in route.ts for why
    // these two generations are validated differently. =====

    // Test A / F -- real 2025-11-25 tools/list shape: header only, no
    // Mcp-Method, no Mcp-Name, no _meta. Must succeed, not be rejected
    // merely because Mcp-Method is absent.
    {
      const body = { jsonrpc: '2.0', id: 100, method: 'tools/list' };
      const r = await callAdapter(body, { 'mcp-protocol-version': '2025-11-25' });
      // WS10: 2 tools now (see the current-protocol conformance test above).
      // Invocable-by-Design Contract Foundation: canonical names only.
      const toolNames = (r.json?.result?.tools ?? []).map((t: any) => t.name);
      const ok = r.status === 200 && Array.isArray(r.json?.result?.tools) && r.json.result.tools.length === 2 && toolNames.includes(TOOL_NAME) && toolNames.includes(BENCHMARK_RATES_TOOL_NAME);
      record('Version-aware', 'A/F: real 2025-11-25 tools/list (no Mcp-Method/Mcp-Name/_meta) -> 200, two tools', ok ? 'PASS' : 'FAIL', JSON.stringify(toolNames));
    }

    // Test B -- real 2026-07-28 server/discover shape: Mcp-Method header +
    // full _meta (protocolVersion, clientInfo, clientCapabilities).
    {
      const body = {
        jsonrpc: '2.0', id: 101, method: 'server/discover',
        params: { _meta: { 'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION, 'io.modelcontextprotocol/clientInfo': { name: 'test-client', version: '1.0.0' }, 'io.modelcontextprotocol/clientCapabilities': {} } },
      };
      const r = await callAdapter(body, { 'mcp-protocol-version': PROTOCOL_VERSION, 'mcp-method': 'server/discover' });
      const ok = r.status === 200 && r.json?.result?.resultType === 'complete' && Array.isArray(r.json.result.supportedVersions) && r.json.result.supportedVersions.includes('2025-11-25') && r.json.result.supportedVersions.includes('2026-07-28') && JSON.stringify(r.json.result.capabilities) === JSON.stringify({ tools: {} });
      record('Version-aware', 'B: real 2026-07-28 server/discover -> 200, correct capabilities/supportedVersions', ok ? 'PASS' : 'FAIL', JSON.stringify(r.json));
      const noUnsupportedCapabilities = !/resources|prompts|sampling|elicitation|subscriptions|tasks/i.test(JSON.stringify(r.json?.result?.capabilities ?? {}));
      record('Version-aware', 'B: server/discover advertises ONLY tools, no unsupported capabilities', noUnsupportedCapabilities ? 'PASS' : 'FAIL', JSON.stringify(r.json?.result?.capabilities));
    }

    // Test C -- 2026-07-28 tools/list with full modern headers (already
    // covered by the earlier Conformance tests, re-asserted here for
    // completeness alongside the other lettered cases).
    {
      const r = await callAdapter(toolsListBody(102), mcpHeaders('tools/list', null));
      record('Version-aware', 'C: 2026-07-28 tools/list with modern headers -> 200', r.status === 200 && Array.isArray(r.json?.result?.tools) ? 'PASS' : 'FAIL', JSON.stringify(r.json).slice(0, 150));
    }

    // Test D -- 2026-07-28 tools/call, existing Gateway behavior unchanged.
    if (availableAddress) {
      const key = await freshCred();
      const body = toolsCallBody(103, TOOL_NAME, { address: availableAddress });
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(key, '203.0.113.90') });
      const data = r.json?.result?.content?.[0]?.text ? JSON.parse(r.json.result.content[0].text) : null;
      record('Version-aware', 'D: 2026-07-28 tools/call -> existing Gateway behavior unchanged (AVAILABLE)', r.status === 200 && data?.availability?.status === 'AVAILABLE' ? 'PASS' : 'FAIL', JSON.stringify(r.json).slice(0, 150));
    }

    // Test E -- 2026-07-28 header/body mismatch still rejected (strict
    // path unweakened by the 2025-11-25 leniency).
    {
      const r = await callAdapter(toolsListBody(104), mcpHeaders('tools/call', null)); // header says tools/call, body says tools/list
      record('Version-aware', 'E: 2026-07-28 header/body mismatch -> 400 protocol error', r.status === 400 && r.json?.error?.code === -32020 ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }

    // Unsupported/unknown protocol version entirely (neither generation).
    {
      const r = await callAdapter({ jsonrpc: '2.0', id: 105, method: 'tools/list' }, { 'mcp-protocol-version': '1999-01-01' });
      record('Version-aware', 'unknown protocol version (neither supported generation) -> 400 -32022', r.status === 400 && r.json?.error?.code === -32022 ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }

    // ===== §14-equivalent DIRECT ADAPTER TESTS, re-run against the modern protocol =====
    console.log('\n=== DIRECT ADAPTER TESTS (modern protocol) ===');

    // PARTIAL
    if (partialAddress) {
      const key = await freshCred();
      const body = toolsCallBody(20, TOOL_NAME, { address: partialAddress });
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(key, '203.0.113.68') });
      const data = r.json?.result?.content?.[0]?.text ? JSON.parse(r.json.result.content[0].text) : null;
      record('14.2', 'valid credential + PARTIAL property', r.json?.result?.isError === false && data?.availability?.status === 'PARTIAL' ? 'PASS' : 'FAIL', JSON.stringify(r.json).slice(0, 200));
    } else {
      record('14.2', 'valid credential + PARTIAL property', 'FAIL', 'no PARTIAL fixture found in first 200 rows');
    }

    // NOT_AVAILABLE
    {
      const key = await freshCred();
      const body = toolsCallBody(21, TOOL_NAME, { address: nonexistentAddr });
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(key, '203.0.113.69') });
      const data = JSON.parse(r.json.result.content[0].text);
      record('14.3', 'valid credential + NOT_AVAILABLE property', r.json?.result?.isError === false && data?.availability?.status === 'NOT_AVAILABLE' ? 'PASS' : 'FAIL', JSON.stringify(r.json).slice(0, 200));
    }

    // malformed (empty) address
    {
      const key = await freshCred();
      const body = toolsCallBody(22, TOOL_NAME, { address: '' });
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(key, '203.0.113.70') });
      record('14.4', 'malformed (empty) address -> INVALID_REQUEST', r.json?.result?.isError === true && r.json.result.content[0].text.startsWith('INVALID_REQUEST') ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }

    // revoked credential
    {
      const revocable = await issueCredential(partner.id, ['property_intelligence:read']);
      const { data: row } = await sb.from('gateway_credentials').select('id').eq('key_prefix', revocable.prefix).single();
      await revokeCredential(row!.id);
      const body = toolsCallBody(23, TOOL_NAME, { address: nonexistentAddr });
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(revocable.plaintextKey, '203.0.113.71') });
      // Phase OB CHANGE: see the two Conformance-section assertions above.
      record('14.6', 'revoked credential -> UNAUTHORIZED', r.status === 401 && r.json?.error === 'invalid_token' ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }

    // rate-limited credential
    {
      const rateCred = await issueCredential(partner.id, ['property_intelligence:read']);
      let firstBlock: number | null = null;
      for (let i = 1; i <= 11; i++) {
        const body = toolsCallBody(200 + i, TOOL_NAME, { address: nonexistentAddr });
        const r = await callAdapter(body, { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(rateCred.plaintextKey, '203.0.113.80') });
        if (r.json?.result?.isError === true && r.json.result.content[0].text.startsWith('RATE_LIMITED') && firstBlock === null) firstBlock = i;
      }
      record('14.8', 'rate-limited credential (credential/minute=10, block at #11)', firstBlock === 11 ? 'PASS' : 'FAIL', `first block at #${firstBlock}`);
    }

    // circuit open / kill switch
    {
      await sb.from('gateway_config').update({ value: { open: true } }).eq('key', 'circuit_state');
      const body = toolsCallBody(300, TOOL_NAME, { address: nonexistentAddr });
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(cred.plaintextKey, '203.0.113.81') });
      await sb.from('gateway_config').update({ value: { open: false } }).eq('key', 'circuit_state');
      record('14.9', 'circuit_state.open=true -> SERVICE_DISABLED', r.json?.result?.isError === true && r.json.result.content[0].text.startsWith('SERVICE_DISABLED') ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }
    {
      await sb.from('gateway_config').update({ value: { enabled: true } }).eq('key', 'kill_switch');
      const body = toolsCallBody(301, TOOL_NAME, { address: nonexistentAddr });
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(cred.plaintextKey, '203.0.113.82') });
      await sb.from('gateway_config').update({ value: { enabled: false } }).eq('key', 'kill_switch');
      record('14.10', 'kill_switch.enabled=true -> SERVICE_DISABLED', r.json?.result?.isError === true && r.json.result.content[0].text.startsWith('SERVICE_DISABLED') ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }
    {
      const cfgCheck = await sb.from('gateway_config').select('*');
      const restored = cfgCheck.data?.every((r: any) => (r.key === 'circuit_state' ? r.value.open === false : r.value.enabled === false));
      record('14.9/10', 'global controls restored to safe defaults', restored ? 'PASS' : 'FAIL', JSON.stringify(cfgCheck.data));
    }

    // logging still occurs
    {
      const key = await freshCred();
      const { data: keyRow } = await sb.from('gateway_credentials').select('id').eq('key_hash', sha256Hex(key)).single();
      const body = toolsCallBody(302, TOOL_NAME, { address: nonexistentAddr });
      await callAdapter(body, { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(key, '203.0.113.83') });
      const { data: logRow } = await sb.from('gateway_request_log').select('*').eq('credential_id', keyRow!.id).order('created_at', { ascending: false }).limit(1).single();
      record('14.11', 'logging still occurs through the adapter', logRow && logRow.outcome === 'NOT_AVAILABLE' ? 'PASS' : 'FAIL', JSON.stringify(logRow));
    }

    // no forbidden leakage (structural key scan on a real successful response)
    if (availableAddress) {
      const key = await freshCred();
      const body = toolsCallBody(303, TOOL_NAME, { address: availableAddress });
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(key, '203.0.113.84') });
      const data = JSON.parse(r.json.result.content[0].text);
      const diKeys = Object.keys(data.decision_intelligence ?? {}).sort();
      const rawText = JSON.stringify(data);
      const forbidden = ['methodologyVersion', 'l2', 'l3', 'l4', 'verdict', 'featured_properties', availableRawId ?? '__no_id__'].filter((s) => rawText.includes(`"${s}"`));
      record('14.13', 'no forbidden leakage (decision_intelligence keys + forbidden substrings)', JSON.stringify(diKeys) === '["drivers","limitations"]' && forbidden.length === 0 ? 'PASS' : 'FAIL', `keys=${JSON.stringify(diKeys)} forbidden=${JSON.stringify(forbidden)}`);
    }

    // no paid/live provider path (structural)
    {
      // Phase 1 CHANGE (2026-09-08): the route now imports
      // lib/externalPropertyResolution.ts instead of the Gateway directly --
      // that file's job is to call the UNCHANGED Gateway first and, only on
      // NOT_AVAILABLE, self-fetch the existing first-party lookup route (the
      // one deliberate, documented exception to "no live/paid provider
      // reference" this task adds -- see that file's own header). Updated
      // check has two parts: (1) the route itself references neither a
      // provider name nor the Gateway directly -- it goes through the
      // orchestrator only; (2) the orchestrator's own import list contains
      // no direct Tavily/Grok/OpenAI/Redfin client import -- its only
      // external contact is the one code-commented self-fetch by URL string.
      const routeSource = fs.readFileSync(path.resolve(process.cwd(), 'app/api/mcp/property-intelligence/route.ts'), 'utf8');
      const resolutionSource = fs.readFileSync(path.resolve(process.cwd(), 'lib/externalPropertyResolution.ts'), 'utf8');
      const routeCodeOnly = routeSource.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const resolutionCodeOnly = resolutionSource.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const routeOnlyImportsResolution = routeSource.includes("from '../../../../lib/externalPropertyResolution'") && !/propertyIntelligence['"]|grok|tavily|redfin|openai/i.test(routeCodeOnly);
      const resolutionNoDirectProviderImport = !/from ['"].*(grok|tavily|redfin|openai)/i.test(resolutionCodeOnly);
      const ok = routeOnlyImportsResolution && resolutionNoDirectProviderImport;
      record('14.14', 'adapter route imports only the orchestrator; orchestrator has no direct live/paid provider import', ok ? 'PASS' : 'FAIL', `route=${routeOnlyImportsResolution} resolution=${resolutionNoDirectProviderImport}`);
    }

    // first-party path unchanged
    {
      const direct = availableRawId ? await getPropertyIntelligenceData(availableRawId) : null;
      record('14.15', 'first-party getPropertyIntelligenceData() unaffected', direct && 'eligibility' in direct ? 'PASS' : 'FAIL', direct ? 'shape intact' : 'no fixture');
    }

    // ===== ADVERSARIAL TESTS (modern protocol) =====
    console.log('\n=== ADVERSARIAL TESTS ===');

    if (availableAddress) {
      const key = await freshCred();
      const body1 = toolsCallBody(500, TOOL_NAME, { address: availableAddress });
      const body2 = toolsCallBody(501, TOOL_NAME, {
        address: availableAddress,
        include_internal_scores: true,
        methodologyVersion: 'SENTINEL_ADVERSARIAL_METHODOLOGY',
        debug: true,
        force_refresh: true,
        api_key: 'SENTINEL_ADVERSARIAL_KEY',
      });
      const r1 = await callAdapter(body1, { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(key, '203.0.113.85') });
      const r2 = await callAdapter(body2, { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(key, '203.0.113.85') });
      const t1 = r1.json.result.content[0].text;
      const t2 = r2.json.result.content[0].text;
      record('15.1', 'extra/unexpected tool-call arguments are structurally inert', t1 === t2 && !t2.includes('SENTINEL_ADVERSARIAL') ? 'PASS' : 'FAIL', `identical=${t1 === t2}`);
    }

    {
      const body = toolsCallBody(502, TOOL_NAME, { address: nonexistentAddr, credential: cred.plaintextKey, apiKey: cred.plaintextKey });
      const r = await callAdapter(body, mcpHeaders('tools/call', TOOL_NAME)); // no Authorization header
      // Phase OB CHANGE: see the two Conformance-section assertions above.
      record('15.2', 'credential embedded in request body is never read as auth', r.status === 401 && r.json?.error === 'invalid_token' ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }

    {
      const bogusKey = 'hrg_deadbeefcafe_SENTINEL_SHOULD_NEVER_APPEAR_IN_ANY_RESPONSE';
      const body = toolsCallBody(503, TOOL_NAME, { address: nonexistentAddr });
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', TOOL_NAME), authorization: `Bearer ${bogusKey}`, 'x-forwarded-for': '203.0.113.86' });
      const bodyText = JSON.stringify(r.json);
      record('15.3', 'invalid credential value is never echoed back', !bodyText.includes('SENTINEL_SHOULD_NEVER_APPEAR') ? 'PASS' : 'FAIL', bodyText.slice(0, 150));
    }

    if (availableRawId && availableAddress) {
      const key = await freshCred();
      const raw: any = await getPropertyIntelligenceCorpusOnly(availableRawId);
      const body = toolsCallBody(504, TOOL_NAME, { address: availableAddress });
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(key, '203.0.113.87') });
      const bodyText = r.json.result.content[0].text as string;
      const leaks: string[] = [];
      if (raw?.id && bodyText.includes(raw.id)) leaks.push('internal properties.id');
      if (raw?.decisionIntelligence?.methodologyVersion && bodyText.includes(raw.decisionIntelligence.methodologyVersion)) leaks.push('methodologyVersion string');
      if (raw?.provenance?.propertyEnrichmentSource && bodyText.includes(`"${raw.provenance.propertyEnrichmentSource}"`)) leaks.push('raw provenance pipeline name');
      record('15.4', 'real internal id/methodologyVersion/pipeline-name absent from real response', leaks.length === 0 ? 'PASS' : 'FAIL', JSON.stringify(leaks));
    }

    {
      const body = toolsCallBody(505, 'get_internal_track5_scores', {});
      const r = await callAdapter(body, { ...mcpHeaders('tools/call', 'get_internal_track5_scores'), ...authHeaders(cred.plaintextKey, '203.0.113.88') });
      record('15.5', 'calling an unlisted tool name returns a clean tool error, no hidden capability', r.json?.result?.isError === true && r.json.result.content[0].text.includes('Unknown tool') ? 'PASS' : 'FAIL', JSON.stringify(r.json));
    }

    {
      const methods = ['resources/list', 'prompts/list', 'completion/complete', 'sampling/createMessage'];
      const allRejected = [];
      for (const m of methods) {
        const r = await callAdapter({ jsonrpc: '2.0', id: 600, method: m, params: { _meta: meta() } }, mcpHeaders(m, null));
        allRejected.push(r.status === 404 && r.json?.error?.code === -32601);
      }
      record('15.6', 'no undocumented MCP surface (resources/prompts/completion/sampling)', allRejected.every(Boolean) ? 'PASS' : 'FAIL', JSON.stringify(allRejected));
    }

    // ===== DEMAND-DRIVEN RESOLUTION (2026-09-08, Phase 8 A-J) =====
    // resolutionMock.handler stands in for the real /api/property/lookup
    // self-fetch for every test below -- deterministic, zero real Tavily/
    // GPT-4o cost, exercising lib/externalPropertyResolution.ts's actual
    // logic (not a copy of it). Phase 9 (separate, live, on dev) is where a
    // single real address goes through the genuine self-fetch end to end.
    console.log('\n=== DEMAND-DRIVEN RESOLUTION ===');

    async function insertTestProperty(
      addressFull: string,
      opts: { avm?: number; hoaMonthly?: number } = {},
    ): Promise<string> {
      const now = new Date().toISOString();
      const { data: prop } = await sb!
        .from('properties')
        .insert({
          address_full: addressFull,
          address_line: addressFull,
          city: 'Testville',
          state: 'ZZ',
          zip: '00001',
          beds: 3,
          baths: 2,
          sqft: 1500,
          latest_listing_status: 'SOLD',
          latest_value: opts.avm ?? null,
          enriched_at: now,
          enrichment_source: 'test_harness',
          confidence: 0.65,
          updated_at: now,
        })
        .select('id')
        .single();
      resolutionTestPropertyIds.push(prop!.id);
      const snapshotData: Record<string, unknown> = { city: 'Testville', state: 'ZZ', estimatedValue: opts.avm ?? null };
      if (opts.hoaMonthly !== undefined) snapshotData.hoaMonthly = opts.hoaMonthly;
      await sb!.from('property_snapshots').insert({
        property_id: prop!.id,
        snapshot_type: 'full',
        source: 'test_harness',
        data: snapshotData,
        fetched_at: now,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        confidence: 0.65,
      });
      return prop!.id as string;
    }

    function parseAdapterData(r: { json: any }): any {
      const text = r.json?.result?.content?.[0]?.text;
      return text ? JSON.parse(text) : null;
    }

    // R-A: existing property -- no resolution attempt at all.
    if (availableAddress) {
      const key = await freshCred();
      const before = resolutionFetchCallCount;
      const r = await callAdapter(toolsCallBody(700, TOOL_NAME, { address: availableAddress }), { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(key, '203.0.113.90') });
      const data = parseAdapterData(r);
      const ok = data?.availability?.status === 'AVAILABLE' && resolutionFetchCallCount === before;
      record('Resolution', 'R-A existing property -- no resolution attempted', ok ? 'PASS' : 'FAIL', `status=${data?.availability?.status} fetchDelta=${resolutionFetchCallCount - before}`);
    }

    // R-B: valid unknown property -> resolves, persists, note present.
    const dedupeAddr = `${Date.now()} Resolution Test Ave, Testville, ZZ 00001`;
    {
      resolutionMock.handler = async (addr) => {
        await insertTestProperty(addr, { avm: 450000, hoaMonthly: 225 });
        return { status: 200, body: { ok: true, data: { address: addr } } };
      };
      const key = await freshCred();
      const before = resolutionFetchCallCount;
      const grokBefore = grokTriggerFetchCallCount;
      const t0 = Date.now();
      const r = await callAdapter(toolsCallBody(701, TOOL_NAME, { address: dedupeAddr }), { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(key, '203.0.113.91') });
      const elapsedMs = Date.now() - t0;
      resolutionMock.handler = null;
      const data = parseAdapterData(r);
      const attempted = resolutionFetchCallCount - before === 1;
      const combinedText = `${data?.availability?.reason ?? ''} ${(data?.decision_intelligence?.limitations ?? []).join(' ')}`;
      const notedAsNew = combinedText.includes('just been added');
      const persisted = Boolean(await resolvePropertyId(dedupeAddr));
      const ok = attempted && notedAsNew && persisted;
      record('Resolution', 'R-B valid unknown property -- resolves, persists, note present', ok ? 'PASS' : 'FAIL', JSON.stringify({ attempted, notedAsNew, persisted, status: data?.availability?.status }));
      // Progressive Intelligence: a newly-resolved property with no comps/
      // location yet should fire exactly one Fast-Follow enrichment trigger,
      // and the response must not have waited on it (elapsedMs stays in the
      // same budget as before this feature existed, not anywhere near
      // Grok's own 85-140s timeout -- see R-J below for the stronger,
      // source-level non-blocking check).
      const triggered = grokTriggerFetchCallCount - grokBefore === 1;
      const progress = data?.intelligence_progress;
      record('Resolution', 'R-K newly-resolved property fires exactly one Fast-Follow enrichment trigger', triggered && progress?.status === 'enriching' ? 'PASS' : 'FAIL', JSON.stringify({ triggered, progress, elapsedMs }));
    }

    // R-C: repeat request for the SAME now-persisted address -> no second
    // resolution attempt (existing-hit path only), no "just added" note.
    {
      const key = await freshCred();
      const before = resolutionFetchCallCount;
      const r = await callAdapter(toolsCallBody(702, TOOL_NAME, { address: dedupeAddr }), { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(key, '203.0.113.92') });
      const data = parseAdapterData(r);
      const combinedText = `${data?.availability?.reason ?? ''} ${(data?.decision_intelligence?.limitations ?? []).join(' ')}`;
      const ok = resolutionFetchCallCount === before && !combinedText.includes('just been added');
      record('Resolution', 'R-C repeat address -- dedupe, no second resolution attempt', ok ? 'PASS' : 'FAIL', `fetchDelta=${resolutionFetchCallCount - before} notedAsNew=${combinedText.includes('just been added')}`);
    }

    // R-D: URL-shaped input -> never treated as a plain address, no resolution attempt.
    {
      const key = await freshCred();
      const before = resolutionFetchCallCount;
      const r = await callAdapter(toolsCallBody(703, TOOL_NAME, { address: 'https://www.redfin.com/CA/Somewhere/123-Fake-St' }), { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(key, '203.0.113.93') });
      const data = parseAdapterData(r);
      const ok = data?.availability?.status === 'NOT_AVAILABLE' && resolutionFetchCallCount === before;
      record('Resolution', 'R-D URL-shaped input -- no resolution attempted', ok ? 'PASS' : 'FAIL', `status=${data?.availability?.status} fetchDelta=${resolutionFetchCallCount - before}`);
    }

    // R-E: resolution genuinely fails -> stays NOT_AVAILABLE, no property row created.
    {
      const failAddr = `${Date.now()} Doomed Resolution Ln, Nowhere, ZZ 00002`;
      resolutionMock.handler = async () => ({ status: 200, body: { ok: false, error: 'Could not find property data for this address.' } });
      const key = await freshCred();
      const before = resolutionFetchCallCount;
      const r = await callAdapter(toolsCallBody(704, TOOL_NAME, { address: failAddr }), { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(key, '203.0.113.94') });
      resolutionMock.handler = null;
      const data = parseAdapterData(r);
      const attempted = resolutionFetchCallCount - before === 1;
      const stillNotAvailable = data?.availability?.status === 'NOT_AVAILABLE';
      const noRowCreated = !(await resolvePropertyId(failAddr));
      record('Resolution', 'R-E resolution failure -- stays NOT_AVAILABLE, no row created', attempted && stillNotAvailable && noRowCreated ? 'PASS' : 'FAIL', JSON.stringify({ attempted, stillNotAvailable, noRowCreated }));
    }

    // R-F: HOA confirmed -- PITI excludes it, PITIA = PITI + HOA exactly.
    {
      const addr = `${Date.now()} HOA Confirmed Ct, Testville, ZZ 00001`;
      const id = await insertTestProperty(addr, { avm: 500000, hoaMonthly: 300 });
      const raw = await buildCanonicalPropertyIntelligence(id);
      const shaped = shapeForExternalContract(addr, raw);
      const oc = shaped.ownership_cost_intelligence;
      const ok = oc?.hoa.value === 300 && oc?.estimated_piti.value != null && oc?.estimated_pitia.value === (oc!.estimated_piti.value as number) + 300;
      record('Resolution', 'R-F HOA confirmed -- PITI excludes HOA, PITIA = PITI + HOA', ok ? 'PASS' : 'FAIL', JSON.stringify(oc));
    }

    // R-G: HOA unconfirmed -- never silently treated as zero; PITIA stays null.
    {
      const addr = `${Date.now()} HOA Unknown Way, Testville, ZZ 00001`;
      const id = await insertTestProperty(addr, { avm: 500000 });
      const raw = await buildCanonicalPropertyIntelligence(id);
      const shaped = shapeForExternalContract(addr, raw);
      const oc = shaped.ownership_cost_intelligence;
      const ok = oc?.hoa.value === null && oc?.estimated_pitia.value === null && oc?.estimated_piti.value != null;
      record('Resolution', 'R-G HOA unconfirmed -- never zero, PITIA stays null', ok ? 'PASS' : 'FAIL', JSON.stringify(oc));
    }

    // R-H: existing, real, previously-confirmed corpus address -- unchanged,
    // no resolution attempted. Best-effort: only runs if present in this
    // environment (same conditional-skip convention as availableAddress above).
    // Accepts AVAILABLE or PARTIAL (not just AVAILABLE): this fixture's own
    // real-world listing status changed to SOLD since the assertion was
    // first written (confirmed 2026-09-08 -- lifecycleStatus flipped, so
    // eligibility legitimately moved from 'index' to 'noindex' under the
    // existing, unmodified eligibility rule, nothing to do with any of this
    // session's changes). The test's actual intent -- a known corpus address
    // is served from existing intelligence, never re-triggering resolution --
    // holds regardless of which of the two "we have real data" states it's in.
    {
      const mataro = '1131 Mataro Ct, Pleasanton, CA 94566';
      const mataroId = await resolvePropertyId(mataro);
      if (mataroId) {
        const key = await freshCred();
        const before = resolutionFetchCallCount;
        const r = await callAdapter(toolsCallBody(705, TOOL_NAME, { address: mataro }), { ...mcpHeaders('tools/call', TOOL_NAME), ...authHeaders(key, '203.0.113.95') });
        const data = parseAdapterData(r);
        const status = data?.availability?.status;
        const ok = (status === 'AVAILABLE' || status === 'PARTIAL') && resolutionFetchCallCount === before;
        record('Resolution', 'R-H existing Mataro Ct regression -- unchanged, no resolution attempted', ok ? 'PASS' : 'FAIL', JSON.stringify({ status, fetchDelta: resolutionFetchCallCount - before }));
      }
    }

    // R-I: invalid credential rejected before any resolution attempt (no auth bypass via the new path).
    {
      const before = resolutionFetchCallCount;
      const freshUnknownAddr = `${Date.now()} Security Bypass Test Rd, Testville, ZZ 00001`;
      const r = await callAdapter(toolsCallBody(706, TOOL_NAME, { address: freshUnknownAddr }), { ...mcpHeaders('tools/call', TOOL_NAME), authorization: 'Bearer hrg_totally_invalid', 'x-forwarded-for': '203.0.113.96' });
      const ok = r.status === 401 && resolutionFetchCallCount === before;
      record('Resolution', 'R-I invalid credential rejected before any resolution attempt', ok ? 'PASS' : 'FAIL', `status=${r.status} fetchDelta=${resolutionFetchCallCount - before}`);
    }

    // R-J: the Fast-Follow enrichment trigger (Progressive Intelligence,
    // 2026-09-09) exists and references grok-property (R-K above proves it
    // fires), but must NEVER be awaited on the response path -- source-level
    // check that the call site doesn't block the function's return, since a
    // real Grok call can take up to 140s (see app/api/beta/grok-property/route.ts),
    // far past any acceptable synchronous tool-call latency. This replaces
    // the old, now-obsolete invariant ("never reference Grok at all") --
    // the correct invariant was always "never BLOCK on Grok," not "never
    // trigger it."
    {
      const resolutionSource = fs.readFileSync(path.resolve(process.cwd(), 'lib/externalPropertyResolution.ts'), 'utf8');
      const codeOnly = resolutionSource.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const referencesGrok = /grok-property/i.test(codeOnly);
      // The only two call sites of triggerFastFollowEnrichmentIfNeeded must
      // never be preceded by `await` -- it is a synchronous, fire-and-schedule
      // function (schedules work via after(), or falls back to an un-awaited
      // call), never one whose completion the response waits on.
      const callSites = codeOnly.match(/[\w).]*\s*triggerFastFollowEnrichmentIfNeeded\(/g) ?? [];
      const noneAwaited = callSites.length >= 3 && callSites.every((c) => !/await\s*$/.test(c.replace(/triggerFastFollowEnrichmentIfNeeded\($/, '')));
      // The function's own internal fetch call is fire-and-schedule (after())
      // or an un-awaited fallback -- never directly awaited inline in a way
      // that would block resolveExternalPropertyIntelligence's own return.
      const noInlineBlockingFetch = /after\(runTrigger\)/.test(codeOnly) && /void runTrigger\(\)/.test(codeOnly);
      const ok = referencesGrok && noneAwaited && noInlineBlockingFetch;
      record('Resolution', 'R-J Fast-Follow enrichment trigger exists but never blocks the response (after()/un-awaited, not inline await)', ok ? 'PASS' : 'FAIL', JSON.stringify({ referencesGrok, callSiteCount: callSites.length, noneAwaited, noInlineBlockingFetch }));
    }

    console.log('\n=== FINAL RESULTS ===');
    console.table(results.map((r) => ({ category: r.category, name: r.name, status: r.status })));
    const pass = results.filter((r) => r.status === 'PASS').length;
    const fail = results.filter((r) => r.status === 'FAIL').length;
    console.log(`\nPASS=${pass} FAIL=${fail} TOTAL=${results.length}`);
  } finally {
    console.log('\n=== CLEANUP ===');
    if (resolutionTestPropertyIds.length) {
      await sb.from('property_snapshots').delete().in('property_id', resolutionTestPropertyIds);
      await sb.from('properties').delete().in('id', resolutionTestPropertyIds);
    }
    await sb.from('gateway_credentials').update({ status: 'revoked', revoked_at: new Date().toISOString() }).in('partner_id', partnerIds).neq('status', 'revoked');
    await sb.from('gateway_partners').update({ status: 'cancelled' }).in('id', partnerIds);
    const { data: creds } = await sb.from('gateway_credentials').select('id').in('partner_id', partnerIds);
    const credIds = (creds ?? []).map((c: any) => c.id);
    if (credIds.length) await sb.from('gateway_usage_counters').delete().in('scope_key', credIds);
    await sb.from('gateway_usage_counters').delete().in('scope_key', partnerIds);
    const cutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: deletedLogs } = await sb.from('gateway_request_log').delete().gte('created_at', cutoff).select('id');
    await sb.from('gateway_config').update({ value: { open: false } }).eq('key', 'circuit_state');
    await sb.from('gateway_config').update({ value: { enabled: false } }).eq('key', 'kill_switch');

    const { data: finalPartners } = await sb.from('gateway_partners').select('status').in('id', partnerIds);
    const { data: finalCreds } = await sb.from('gateway_credentials').select('status').in('partner_id', partnerIds);
    console.log('final partner statuses:', JSON.stringify(finalPartners));
    console.log('final credential statuses:', JSON.stringify(finalCreds));
    console.log('deleted log rows:', deletedLogs?.length ?? 0);
  }

  process.exit(blockingFailure ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
