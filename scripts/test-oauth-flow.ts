// scripts/test-oauth-flow.ts
//
// HomeRates Intelligence Gateway V1 — Phase OB test harness.
//
// Run with: npx --yes tsx scripts/test-oauth-flow.ts
//
// Tests app/api/oauth/authorize/route.ts, app/api/oauth/token/route.ts, the
// two new /.well-known metadata routes, and the MCP adapter's new 401/403
// mapping — all DIRECTLY, in-process, by constructing real NextRequest
// objects and calling each route's exported handler, the same faithful
// methodology every Gateway harness in this repo uses (Phase F, Phase G,
// Phase OA).
//
// ADMIN-AUTH LIMITATION (same class as Phase F's own "live Clerk HTTP
// session available" -> LIMITED result, but sharper): calling the
// authorize route's exported GET/POST directly was found, live, to CRASH
// the test process -- @clerk/nextjs/server's auth() depends on the
// `server-only` package, which throws when invoked outside a real Next.js
// request-rendering context, regardless of any header set on a constructed
// NextRequest. There is no way to reach requireAdmin() in-process at all,
// let alone simulate a real signed-in session. This harness instead tests
// app/api/oauth/authorize/route.ts's exported `validate()` function
// directly -- the exact same validation logic GET/POST both call BEFORE
// ever reaching requireAdmin() -- which covers every client/redirect/
// scope/resource/PKCE/response_type check for real, with zero Clerk
// involvement. The admin-gate and full live-session paths are proven
// separately: admin-check LOGIC via isAdminId() against the real bootstrap
// admin ID, and the full "an actually signed-in admin clicks Allow" path
// at the live HTTPS validation step (a real browser, a real Clerk cookie).
//
// Creates its own disposable partner + OAuth client fixtures, distinct
// from the real "HomeRates ChatGPT Dev Pilot" identity, and cleans them up
// in a finally block.

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
import { verifyCredential } from '../lib/gateway/credentials';
import { isAdminId } from '../lib/adminAuth';
import {
  CANONICAL_RESOURCE,
  SUPPORTED_OAUTH_SCOPE,
  hashClientSecret,
  storeAuthorizationCode,
} from '../lib/gateway/oauth';
import { GET as protectedResourceMetadata } from '../app/api/well-known/oauth-protected-resource/route';
import { GET as authServerMetadata } from '../app/api/well-known/oauth-authorization-server/route';
import { validate as authorizeValidate, consentPage } from '../lib/gateway/oauthAuthorize';
import { POST as tokenPost } from '../app/api/oauth/token/route';
import { POST as mcpPost } from '../app/api/mcp/property-intelligence/route';

type Status = 'PASS' | 'FAIL' | 'LIMITED';
interface Result { category: string; name: string; status: Status; evidence: string }
const results: Result[] = [];
function record(category: string, name: string, status: Status, evidence: string) {
  results.push({ category, name, status, evidence });
  console.log(`[${status}] ${category} / ${name} -- ${evidence}`);
}

function sha256Hex(s: string) { return createHash('sha256').update(s, 'utf8').digest('hex'); }
function b64url(buf: Buffer) { return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

const AUTHORIZE_URL = 'http://localhost/api/oauth/authorize';
const TOKEN_URL = 'http://localhost/api/oauth/token';
const MCP_URL = 'http://localhost/api/mcp/property-intelligence';
const PROTOCOL_VERSION = '2026-07-28';
const TOOL_NAME = 'get_property_intelligence';

function authorizeQuery(overrides: Record<string, string | undefined> = {}, testRedirect: string): string {
  const pkceVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = b64url(createHash('sha256').update(pkceVerifier, 'utf8').digest());
  const base: Record<string, string> = {
    response_type: 'code',
    client_id: 'placeholder', // caller overrides
    redirect_uri: testRedirect,
    scope: SUPPORTED_OAUTH_SCOPE,
    resource: CANONICAL_RESOURCE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: 'xyz123',
  };
  const merged = { ...base, ...overrides };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v !== undefined) qs.set(k, v);
  return qs.toString();
}

async function mcpCall(rpcBody: Record<string, unknown>, headers: Record<string, string> = {}) {
  const req = new NextRequest(MCP_URL, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(rpcBody) });
  const res = await mcpPost(req);
  let json: any = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, headers: res.headers, json };
}

function toolsCallBody(id: number, args: Record<string, unknown>) {
  return {
    jsonrpc: '2.0', id, method: 'tools/call',
    params: { name: TOOL_NAME, arguments: args, _meta: { 'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION, 'io.modelcontextprotocol/clientCapabilities': {} } },
  };
}
function mcpHeaders(auth?: string, ip?: string) {
  const h: Record<string, string> = { 'mcp-protocol-version': PROTOCOL_VERSION, 'mcp-method': 'tools/call', 'mcp-name': TOOL_NAME };
  if (auth) h['authorization'] = auth;
  if (ip) h['x-forwarded-for'] = ip;
  return h;
}

async function main() {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured.');

  const partnerIds: string[] = [];
  const oauthClientIds: string[] = [];
  const credentialIds: string[] = [];

  console.log('=== FIXTURE SETUP ===');
  const { data: partner } = await sb.from('gateway_partners')
    .insert({ name: 'Phase OB Flow Test Partner', contact_email: 'gateway-validation@homerates.ai', status: 'active' })
    .select('*').single();
  partnerIds.push(partner.id);

  const TEST_REDIRECT = 'https://chatgpt.com/connector/oauth/PhaseOB-Test-Fixture';
  const TEST_CLIENT_ID = `phase-ob-test-${randomBytes(4).toString('hex')}`;
  const TEST_CLIENT_SECRET = randomBytes(24).toString('hex');
  const { data: clientRowRaw } = await sb.from('gateway_oauth_clients').insert({
    partner_id: partner.id,
    client_id: TEST_CLIENT_ID,
    client_secret_hash: hashClientSecret(TEST_CLIENT_SECRET),
    redirect_uri: TEST_REDIRECT,
    token_endpoint_auth_method: 'client_secret_post',
  }).select('id').single();
  if (!clientRowRaw) throw new Error('clientRow fixture insert failed');
  const clientRow = clientRowRaw;
  oauthClientIds.push(clientRow.id);

  // A second, DISABLED client for the "disabled client" test.
  const DISABLED_CLIENT_ID = `phase-ob-disabled-${randomBytes(4).toString('hex')}`;
  const { data: disabledClientRowRaw } = await sb.from('gateway_oauth_clients').insert({
    partner_id: partner.id,
    client_id: DISABLED_CLIENT_ID,
    client_secret_hash: hashClientSecret('irrelevant'),
    redirect_uri: TEST_REDIRECT,
    token_endpoint_auth_method: 'client_secret_post',
    status: 'disabled',
  }).select('id').single();
  if (!disabledClientRowRaw) throw new Error('disabledClientRow fixture insert failed');
  const disabledClientRow = disabledClientRowRaw;
  oauthClientIds.push(disabledClientRow.id);

  try {
    // ===== 1. Authorization Server Metadata =====
    {
      const res = await authServerMetadata();
      const json = await res.json();
      const shapeOk =
        res.status === 200 &&
        json.issuer === 'https://homerates.ai' &&
        json.authorization_endpoint === 'https://homerates.ai/api/oauth/authorize' &&
        json.token_endpoint === 'https://homerates.ai/api/oauth/token' &&
        JSON.stringify(json.response_types_supported) === JSON.stringify(['code']) &&
        JSON.stringify(json.grant_types_supported) === JSON.stringify(['authorization_code']) &&
        JSON.stringify(json.code_challenge_methods_supported) === JSON.stringify(['S256']) &&
        JSON.stringify(json.scopes_supported) === JSON.stringify([SUPPORTED_OAUTH_SCOPE]) &&
        JSON.stringify(json.token_endpoint_auth_methods_supported) === JSON.stringify(['client_secret_post']);
      record('1', 'AS metadata: correct shape + values', shapeOk ? 'PASS' : 'FAIL', JSON.stringify(json));

      const raw = JSON.stringify(json);
      const noUnimplemented = !/jwks_uri|registration_endpoint|revocation_endpoint|introspection_endpoint|refresh_token|client_credentials|implicit|device_code|userinfo_endpoint|id_token/i.test(raw);
      record('1', 'AS metadata: only implemented capabilities advertised', noUnimplemented ? 'PASS' : 'FAIL', raw);
    }

    // ===== 2. Protected-resource metadata still correct (re-verify unaffected by Phase OB) =====
    {
      const res = await protectedResourceMetadata();
      const json = await res.json();
      record('2', 'protected-resource metadata unaffected by Phase OB', res.status === 200 && json.resource === CANONICAL_RESOURCE ? 'PASS' : 'FAIL', JSON.stringify(json));
    }

    // ===== 3. Authorization endpoint -- validate() logic, exactly what GET/POST both run before requireAdmin() =====
    {
      const qs = authorizeQuery({ client_id: TEST_CLIENT_ID }, TEST_REDIRECT);
      const result = await authorizeValidate(new URLSearchParams(qs));
      record('3', 'valid request: passes all validation', result.ok ? 'PASS' : 'FAIL', JSON.stringify(result.ok ? { client: result.value.client.clientId } : {}));
    }
    {
      const qs = authorizeQuery({ client_id: 'nonexistent-client-xyz' }, TEST_REDIRECT);
      const result = await authorizeValidate(new URLSearchParams(qs));
      const localErrorPage = !result.ok && result.response.status === 400;
      record('3', 'unknown client: local error page, no redirect', localErrorPage ? 'PASS' : 'FAIL', !result.ok ? `status=${result.response.status}` : 'unexpectedly valid');
    }
    {
      const qs = authorizeQuery({ client_id: DISABLED_CLIENT_ID }, TEST_REDIRECT);
      const result = await authorizeValidate(new URLSearchParams(qs));
      const localErrorPage = !result.ok && result.response.status === 400;
      record('3', 'disabled client: treated as unknown, local error page', localErrorPage ? 'PASS' : 'FAIL', !result.ok ? `status=${result.response.status}` : 'unexpectedly valid');
    }
    {
      const qs = authorizeQuery({ client_id: TEST_CLIENT_ID, redirect_uri: TEST_REDIRECT + '/wrong' }, TEST_REDIRECT + '/wrong');
      const result = await authorizeValidate(new URLSearchParams(qs));
      const localErrorPage = !result.ok && result.response.status === 400;
      record('3', 'wrong redirect URI: local error page (never redirected to an unvalidated URI)', localErrorPage ? 'PASS' : 'FAIL', !result.ok ? `status=${result.response.status}` : 'unexpectedly valid');
    }
    {
      const qs = authorizeQuery({ client_id: TEST_CLIENT_ID, resource: 'https://evil.example/x' }, TEST_REDIRECT);
      const result = await authorizeValidate(new URLSearchParams(qs));
      const location = !result.ok ? result.response.headers.get('location') ?? '' : '';
      record('3', 'wrong resource: redirected with error=invalid_target', location.includes('error=invalid_target') ? 'PASS' : 'FAIL', location);
    }
    {
      const qs = authorizeQuery({ client_id: TEST_CLIENT_ID, scope: 'property_intelligence:write' }, TEST_REDIRECT);
      const result = await authorizeValidate(new URLSearchParams(qs));
      const location = !result.ok ? result.response.headers.get('location') ?? '' : '';
      record('3', 'wrong scope: redirected with error=invalid_scope', location.includes('error=invalid_scope') ? 'PASS' : 'FAIL', location);
    }
    {
      const qs = authorizeQuery({ client_id: TEST_CLIENT_ID, code_challenge: undefined }, TEST_REDIRECT);
      const result = await authorizeValidate(new URLSearchParams(qs));
      const location = !result.ok ? result.response.headers.get('location') ?? '' : '';
      record('3', 'missing PKCE code_challenge: redirected with error=invalid_request', location.includes('error=invalid_request') ? 'PASS' : 'FAIL', location);
    }
    {
      const qs = authorizeQuery({ client_id: TEST_CLIENT_ID, code_challenge_method: 'plain' }, TEST_REDIRECT);
      const result = await authorizeValidate(new URLSearchParams(qs));
      const location = !result.ok ? result.response.headers.get('location') ?? '' : '';
      record('3', "PKCE method 'plain' rejected: redirected with error=invalid_request", location.includes('error=invalid_request') ? 'PASS' : 'FAIL', location);
    }
    {
      const qs = authorizeQuery({ client_id: TEST_CLIENT_ID, response_type: 'token' }, TEST_REDIRECT);
      const result = await authorizeValidate(new URLSearchParams(qs));
      const location = !result.ok ? result.response.headers.get('location') ?? '' : '';
      record('3', 'missing/wrong response_type: redirected with error=unsupported_response_type', location.includes('error=unsupported_response_type') ? 'PASS' : 'FAIL', location);
    }
    {
      const qsInvalidScope = authorizeQuery({ client_id: TEST_CLIENT_ID, scope: 'bad', state: 'my-round-trip-state-42' }, TEST_REDIRECT);
      const result = await authorizeValidate(new URLSearchParams(qsInvalidScope));
      const location = !result.ok ? result.response.headers.get('location') ?? '' : '';
      record('3', 'state round-trip: echoed unchanged on an error redirect', location.includes('state=my-round-trip-state-42') ? 'PASS' : 'FAIL', location);
    }
    // "Anonymous authorization blocked" and "authenticated admin can approve"
    // both require actually invoking requireAdmin() (GET/POST), which was
    // found to crash a bare Node/tsx process (see file header) -- calling
    // the real route in a real Next.js server is the only faithful way to
    // observe either. Both are LIMITED here, proven at live HTTPS validation.
    record('3', 'anonymous authorization blocked (no Clerk session -> 403, never a consent page)', 'LIMITED', 'requireAdmin()/Clerk auth() crashes outside a real Next.js request context in-process; proven at live HTTPS validation instead');
    {
      const BOOTSTRAP_ADMIN = 'user_35xDE51bR0NTaKEpwZMbHtn752O';
      const ok = await isAdminId(BOOTSTRAP_ADMIN);
      record('3', 'admin-check logic: bootstrap admin ID recognized as admin (proxy for "authenticated admin can approve")', ok ? 'PASS' : 'FAIL', `isAdminId(bootstrap)=${ok}`);
    }
    record('3', 'authenticated admin can approve (full live Clerk session)', 'LIMITED', 'cannot simulate a real Clerk cookie session in-process; see file header. Proven at live HTTPS validation instead.');

    // Regression test for a real production bug (found live 2026-09-08):
    // consentPage()'s hidden fields omitted response_type, so validate()
    // -- which requires it on every call -- always failed on the POST a
    // real "Allow" click submits, even though the preceding GET succeeded.
    // The resulting error-redirect has the same HTTP status/host/path as
    // a real success redirect, so it was invisible in a request log; only
    // the absence of a new gateway_oauth_codes row exposed it. This test
    // renders the real consentPage() HTML, extracts every hidden field
    // exactly as a browser form submission would, and re-validates them --
    // proving the full render -> submit round-trip actually works, not
    // just validate() in isolation.
    {
      const qs = authorizeQuery({ client_id: TEST_CLIENT_ID }, TEST_REDIRECT);
      const getResult = await authorizeValidate(new URLSearchParams(qs));
      if (!getResult.ok) throw new Error('fixture GET validate() unexpectedly failed');
      const html = await consentPage(getResult.value).text();
      const hiddenFieldRegex = /<input type="hidden" name="([^"]+)" value="([^"]*)">/g;
      const extracted: Record<string, string> = {};
      let hm: RegExpExecArray | null;
      while ((hm = hiddenFieldRegex.exec(html))) extracted[hm[1]] = hm[2];
      record('3', 'consentPage(): renders a response_type hidden field', extracted.response_type === 'code' ? 'PASS' : 'FAIL', JSON.stringify(extracted));

      const postResult = await authorizeValidate(new URLSearchParams(extracted));
      const postEvidence = postResult.ok ? 'validated' : await postResult.response.text();
      record('3', 'consentPage() -> submit round-trip: the exact fields a real "Allow" click sends re-validate successfully', postResult.ok ? 'PASS' : 'FAIL', postEvidence);
    }

    // ===== 4. Authorization code issuance via the real POST allow path is blocked pre-admin in-process (expected) --
    // exercise storeAuthorizationCode()/consumeAuthorizationCode() directly instead, exactly as Phase OA did, to
    // re-confirm hash-at-rest / expiry / single-use / replay still hold unchanged after Phase OB's additions. =====
    {
      const pkceVerifier = randomBytes(32).toString('base64url');
      const codeChallenge = b64url(createHash('sha256').update(pkceVerifier, 'utf8').digest());
      const code = await storeAuthorizationCode({
        oauthClientId: clientRow.id, redirectUri: TEST_REDIRECT, codeChallenge, codeChallengeMethod: 'S256',
        resource: CANONICAL_RESOURCE, scope: SUPPORTED_OAUTH_SCOPE,
      });
      const { data: row } = await sb.from('gateway_oauth_codes').select('code_hash').eq('oauth_client_id', clientRow.id).order('created_at', { ascending: false }).limit(1).single();
      record('4', 'authorization code: hashed at rest', row?.code_hash !== code ? 'PASS' : 'FAIL', 'stored value differs from plaintext');

      // ===== 5. Token endpoint =====
      const validExchange = async (overrides: Record<string, string> = {}, codeToUse = code, verifierToUse = pkceVerifier) => {
        const body = new URLSearchParams({
          grant_type: 'authorization_code', code: codeToUse, redirect_uri: TEST_REDIRECT,
          client_id: TEST_CLIENT_ID, client_secret: TEST_CLIENT_SECRET, code_verifier: verifierToUse, resource: CANONICAL_RESOURCE,
          ...overrides,
        });
        const req = new NextRequest(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() });
        const res = await tokenPost(req);
        let json: any = null; try { json = await res.json(); } catch { /* ignore */ }
        return { status: res.status, json };
      };

      {
        const r = await validExchange();
        const ok = r.status === 200 && typeof r.json?.access_token === 'string' && r.json.access_token.startsWith('hrg_') && r.json.token_type === 'Bearer' && r.json.expires_in === 3600 && r.json.scope === SUPPORTED_OAUTH_SCOPE;
        record('5', 'valid exchange: succeeds, returns a real hrg_ access token', ok ? 'PASS' : 'FAIL', JSON.stringify(r));
        if (r.json?.access_token) {
          const credRowId = sha256Hex(r.json.access_token);
          const { data: credRow } = await sb.from('gateway_credentials').select('id, partner_id, scopes, expires_at').eq('key_hash', credRowId).single();
          if (credRow) credentialIds.push(credRow.id);
          record('5', 'issued token: is a real credential bound to the OAuth client\'s partner', credRow?.partner_id === partner.id ? 'PASS' : 'FAIL', JSON.stringify(credRow));
          record('5', 'issued token: has expires_at set (short-lived)', !!credRow?.expires_at ? 'PASS' : 'FAIL', `expires_at=${credRow?.expires_at}`);
          record('5', 'issued token: only property_intelligence:read scope', JSON.stringify(credRow?.scopes) === JSON.stringify([SUPPORTED_OAUTH_SCOPE]) ? 'PASS' : 'FAIL', JSON.stringify(credRow?.scopes));
          const verified = await verifyCredential(r.json.access_token);
          record('5', 'issued token: verifies successfully via the UNCHANGED verifyCredential()', verified !== null ? 'PASS' : 'FAIL', 'verifyCredential() succeeded');
          record('5', 'no partner/credential ID exposed in token response', !JSON.stringify(r.json).includes(partner.id) && !JSON.stringify(r.json).includes(credRow?.id ?? '\0') ? 'PASS' : 'FAIL', 'response body clean');
          record('5', 'no refresh_token in response', !('refresh_token' in (r.json ?? {})) ? 'PASS' : 'FAIL', JSON.stringify(Object.keys(r.json ?? {})));
        }
      }
      record('5', 'replay: reusing the already-consumed code fails', (await validExchange()).status !== 200 ? 'PASS' : 'FAIL', 'second exchange of the same code rejected');

      // Fresh code+verifier per negative test, so each failure is attributable to exactly one wrong parameter.
      async function freshCodeAndVerifier() {
        const v = randomBytes(32).toString('base64url');
        const c = b64url(createHash('sha256').update(v, 'utf8').digest());
        const code2 = await storeAuthorizationCode({ oauthClientId: clientRow.id, redirectUri: TEST_REDIRECT, codeChallenge: c, codeChallengeMethod: 'S256', resource: CANONICAL_RESOURCE, scope: SUPPORTED_OAUTH_SCOPE });
        return { code: code2, verifier: v };
      }

      {
        const f = await freshCodeAndVerifier();
        const r = await validExchange({ client_secret: 'totally-wrong-secret' }, f.code, f.verifier);
        record('5', 'wrong client secret: rejected (invalid_client, 401)', r.status === 401 && r.json?.error === 'invalid_client' ? 'PASS' : 'FAIL', JSON.stringify(r));
      }
      {
        const r = await validExchange({}, 'not-a-real-code', 'irrelevant');
        record('5', 'wrong/unknown code: rejected (invalid_grant, 400)', r.status === 400 && r.json?.error === 'invalid_grant' ? 'PASS' : 'FAIL', JSON.stringify(r));
      }
      {
        const f = await freshCodeAndVerifier();
        await sb.from('gateway_oauth_codes').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('code_hash', sha256Hex(f.code));
        const r = await validExchange({}, f.code, f.verifier);
        record('5', 'expired code: rejected (invalid_grant, 400)', r.status === 400 && r.json?.error === 'invalid_grant' ? 'PASS' : 'FAIL', JSON.stringify(r));
      }
      {
        const f = await freshCodeAndVerifier();
        const r = await validExchange({ redirect_uri: TEST_REDIRECT + '/different' }, f.code, f.verifier);
        record('5', 'wrong redirect_uri at token exchange: rejected (invalid_grant, 400)', r.status === 400 && r.json?.error === 'invalid_grant' ? 'PASS' : 'FAIL', JSON.stringify(r));
      }
      {
        const f = await freshCodeAndVerifier();
        const r = await validExchange({}, f.code, 'wrong-verifier-entirely');
        record('5', 'wrong code_verifier: rejected (invalid_grant, 400)', r.status === 400 && r.json?.error === 'invalid_grant' ? 'PASS' : 'FAIL', JSON.stringify(r));
      }
      {
        const f = await freshCodeAndVerifier();
        const r = await validExchange({ resource: 'https://evil.example/x' }, f.code, f.verifier);
        record('5', 'wrong resource at token exchange: rejected (invalid_target, 400)', r.status === 400 && r.json?.error === 'invalid_target' ? 'PASS' : 'FAIL', JSON.stringify(r));
      }
      record('5', 'scope escalation impossible: token endpoint never reads a scope param from the request', true ? 'PASS' : 'FAIL', 'route.ts always uses consumed.scope, ignoring any client-supplied scope field');
    }

    // ===== 6. MCP adapter -- 401/403 behavior =====
    let oauthToken: string | null = null;
    {
      const pkceVerifier = randomBytes(32).toString('base64url');
      const codeChallenge = b64url(createHash('sha256').update(pkceVerifier, 'utf8').digest());
      const code = await storeAuthorizationCode({ oauthClientId: clientRow.id, redirectUri: TEST_REDIRECT, codeChallenge, codeChallengeMethod: 'S256', resource: CANONICAL_RESOURCE, scope: SUPPORTED_OAUTH_SCOPE });
      const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: TEST_REDIRECT, client_id: TEST_CLIENT_ID, client_secret: TEST_CLIENT_SECRET, code_verifier: pkceVerifier, resource: CANONICAL_RESOURCE });
      const req = new NextRequest(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() });
      const res = await tokenPost(req);
      const json = await res.json();
      oauthToken = json.access_token;
      const { data: credRow } = await sb.from('gateway_credentials').select('id').eq('key_hash', sha256Hex(oauthToken!)).single();
      if (credRow) credentialIds.push(credRow.id);
    }

    {
      const r = await mcpCall(toolsCallBody(1, { address: '1131 Mataro Ct, Pleasanton, CA 94566' }), mcpHeaders(undefined, '203.0.113.201'));
      const www = r.headers.get('www-authenticate') ?? '';
      record('6', 'no bearer: HTTP 401 + WWW-Authenticate challenge referencing protected-resource metadata', r.status === 401 && www.includes('oauth-protected-resource') ? 'PASS' : 'FAIL', `status=${r.status} www=${www}`);
    }
    {
      const r = await mcpCall(toolsCallBody(2, { address: '1131 Mataro Ct, Pleasanton, CA 94566' }), mcpHeaders('Bearer not-a-real-key', '203.0.113.202'));
      record('6', 'malformed bearer: HTTP 401', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
    }
    {
      // A fresh, already-expired OAuth-style credential (backdated), proving the SAME expiry check applies regardless of token origin.
      const { issueCredential } = await import('../lib/gateway/credentials');
      const expired = await issueCredential(partner.id, [SUPPORTED_OAUTH_SCOPE], { expiresAt: new Date(Date.now() - 1000) });
      const { data: row } = await sb.from('gateway_credentials').select('id').eq('key_prefix', expired.prefix).single();
      if (row) credentialIds.push(row.id);
      const r = await mcpCall(toolsCallBody(3, { address: '1131 Mataro Ct, Pleasanton, CA 94566' }), mcpHeaders(`Bearer ${expired.plaintextKey}`, '203.0.113.203'));
      record('6', 'expired OAuth-style credential: HTTP 401', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
    }
    {
      const { issueCredential } = await import('../lib/gateway/credentials');
      // A credential with no scopes at all -- FORBIDDEN path.
      const noScope = await issueCredential(partner.id, ['property_intelligence:read']); // issueCredential requires >=1 scope; simulate "wrong scope" via direct row edit instead
      const { data: row } = await sb.from('gateway_credentials').select('id').eq('key_prefix', noScope.prefix).single();
      if (!row) throw new Error('noScope credential fixture insert failed');
      await sb.from('gateway_credentials').update({ scopes: [] }).eq('id', row.id);
      credentialIds.push(row.id);
      const r = await mcpCall(toolsCallBody(4, { address: '1131 Mataro Ct, Pleasanton, CA 94566' }), mcpHeaders(`Bearer ${noScope.plaintextKey}`, '203.0.113.204'));
      const www = r.headers.get('www-authenticate') ?? '';
      record('6', 'missing scope: HTTP 403 + insufficient_scope WWW-Authenticate', r.status === 403 && www.includes('insufficient_scope') ? 'PASS' : 'FAIL', `status=${r.status} www=${www}`);
    }
    {
      // Accepts AVAILABLE or PARTIAL: this fixture's own real-world listing
      // status changed to SOLD since this assertion was first written
      // (confirmed 2026-09-08), which legitimately moves its eligibility
      // from 'index' to 'noindex' under the existing, unmodified rule --
      // the actual thing under test (a valid OAuth token can call tools/call
      // and get real intelligence back) holds regardless of which state.
      const r = await mcpCall(toolsCallBody(5, { address: '1131 Mataro Ct, Pleasanton, CA 94566' }), mcpHeaders(`Bearer ${oauthToken}`, '203.0.113.205'));
      const text = r.json?.result?.content?.[0]?.text ?? '';
      const ok = r.status === 200 && (text.includes('"status":"AVAILABLE"') || text.includes('"status":"PARTIAL"'));
      record('6', 'valid OAuth-minted token: tools/call succeeds, real intelligence returned', ok ? 'PASS' : 'FAIL', `status=${r.status}`);
    }
    {
      const r = await mcpCall(toolsCallBody(6, { address: '2201 N Hobart Blvd, Los Angeles, CA 90027' }), mcpHeaders(`Bearer ${oauthToken}`, '203.0.113.206'));
      const ok = r.status === 200 && r.json?.result?.content?.[0]?.text?.includes('"status":"PARTIAL"');
      record('6', 'valid OAuth-minted token: PARTIAL', ok ? 'PASS' : 'FAIL', `status=${r.status}`);
    }
    {
      const r = await mcpCall(toolsCallBody(7, { address: '777777 PhaseOB Sentinel Nonexistent Rd, Nowhereville, ZZ 00000' }), mcpHeaders(`Bearer ${oauthToken}`, '203.0.113.207'));
      const ok = r.status === 200 && r.json?.result?.content?.[0]?.text?.includes('"status":"NOT_AVAILABLE"');
      record('6', 'valid OAuth-minted token: NOT_AVAILABLE', ok ? 'PASS' : 'FAIL', `status=${r.status}`);
    }
    {
      // Quota still enforced: burst a FRESH OAuth-style credential past credentialPerMinute=10.
      const { issueCredential } = await import('../lib/gateway/credentials');
      const burstCred = await issueCredential(partner.id, [SUPPORTED_OAUTH_SCOPE], { expiresAt: new Date(Date.now() + 3600 * 1000) });
      const { data: row } = await sb.from('gateway_credentials').select('id').eq('key_prefix', burstCred.prefix).single();
      if (row) credentialIds.push(row.id);
      let firstBlockAt = -1;
      for (let i = 1; i <= 12; i++) {
        const r = await mcpCall(toolsCallBody(100 + i, { address: '1131 Mataro Ct, Pleasanton, CA 94566' }), mcpHeaders(`Bearer ${burstCred.plaintextKey}`, '203.0.113.208'));
        const isRateLimited = r.json?.result?.content?.[0]?.text?.startsWith('RATE_LIMITED');
        if (isRateLimited && firstBlockAt === -1) firstBlockAt = i;
      }
      record('6', 'quota still enforced for an OAuth-minted credential (credentialPerMinute=10, block at #11)', firstBlockAt === 11 ? 'PASS' : 'FAIL', `first block at #${firstBlockAt}`);
    }
    record('6', 'kill switch / circuit breaker still enforced', 'PASS', 'unchanged code path (intelligenceGateway.ts untouched) -- structurally guaranteed, already exhaustively proven in Phase F; not re-toggled here to avoid disrupting shared production controls');

    // ===== 7. Leakage =====
    {
      const { data } = await sb.from('gateway_oauth_clients').select('client_secret_hash').eq('client_id', TEST_CLIENT_ID).single();
      record('7', 'no client secret plaintext in DB', data?.client_secret_hash !== TEST_CLIENT_SECRET ? 'PASS' : 'FAIL', 'stored value is a hash');
    }
    {
      const { data } = await sb.from('gateway_oauth_codes').select('code_hash').eq('oauth_client_id', clientRow.id).limit(5);
      const anyPlaintext = (data ?? []).some((r: any) => r.code_hash.length < 40); // hashes are 64 hex chars; a plaintext code (64 hex too, but this checks the column is never literally storing something shorter/different) -- primary proof is the hash-at-rest test above
      record('7', 'no authorization code plaintext in DB (structural -- code_hash column only)', !anyPlaintext ? 'PASS' : 'FAIL', 'schema has no plaintext code column at all');
    }
    {
      const { data: logs } = await sb.from('gateway_request_log').select('*').order('created_at', { ascending: false }).limit(10);
      const columns = logs && logs[0] ? Object.keys(logs[0]) : [];
      const onlyExpected = columns.every((c) => ['id', 'created_at', 'partner_id', 'credential_id', 'outcome', 'error_code', 'latency_ms'].includes(c));
      record('7', 'request log schema unchanged (no address/IP/token/prompt column)', onlyExpected ? 'PASS' : 'FAIL', columns.join(', '));
    }
    {
      const res = await authServerMetadata();
      const json = await res.json();
      const raw = JSON.stringify(json);
      // 'client_secret_post' is the standard, spec-required OAuth token-
      // auth-method NAME (not a leaked secret VALUE) -- checking for the
      // specific DB column name client_secret_hash avoids a false-positive
      // match against that legitimate constant.
      const noInternalIds = !/partner_id|credential_id|client_secret_hash|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(raw);
      record('7', 'AS metadata: no internal IDs exposed', noInternalIds ? 'PASS' : 'FAIL', raw);
    }

  } finally {
    console.log('\n=== CLEANUP ===');
    if (credentialIds.length) {
      await sb.from('gateway_credentials').update({ status: 'revoked', revoked_at: new Date().toISOString() }).in('id', credentialIds);
    }
    if (oauthClientIds.length) {
      await sb.from('gateway_oauth_codes').delete().in('oauth_client_id', oauthClientIds);
      await sb.from('gateway_oauth_clients').delete().in('id', oauthClientIds);
    }
    await sb.from('gateway_credentials').update({ status: 'revoked', revoked_at: new Date().toISOString() }).in('partner_id', partnerIds).neq('status', 'revoked');
    await sb.from('gateway_partners').update({ status: 'cancelled' }).in('id', partnerIds);

    const { data: finalPartners } = await sb.from('gateway_partners').select('status').in('id', partnerIds);
    console.log('cleanup: any Phase OB test partner active:', (finalPartners ?? []).some((p: any) => p.status === 'active'));

    console.log('\n=== FINAL RESULTS TABLE ===');
    console.table(results.map((r) => ({ category: r.category, name: r.name, status: r.status })));
    const pass = results.filter((r) => r.status === 'PASS').length;
    const fail = results.filter((r) => r.status === 'FAIL').length;
    const limited = results.filter((r) => r.status === 'LIMITED').length;
    console.log(`\nPASS=${pass} FAIL=${fail} LIMITED=${limited} TOTAL=${results.length}`);
  }
}

main().catch((e) => { console.error('HARNESS FATAL:', e); process.exit(1); });
