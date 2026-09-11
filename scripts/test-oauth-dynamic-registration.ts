// scripts/test-oauth-dynamic-registration.ts
//
// Phase OC -- RFC 7591 Dynamic Client Registration test harness. Tests
// lib/gateway/oauth.ts's registerOAuthClient(), app/api/oauth/register/
// route.ts, the updated /api/oauth/token (now also supporting a 'none'
// auth-method client), and the updated authorization-server metadata --
// all DIRECTLY, in-process, the same faithful methodology every Gateway
// harness in this repo uses (Phase F/G/OA/OB).
//
// Built to unblock a real, live gap: Grok's MCP connector discovers our
// tools (tools/list, unauthenticated) but has no way to present a static
// API key, and our OAuth server previously had exactly one hardcoded
// client (the real ChatGPT pilot) with no self-registration path --
// confirmed live 2026-09-11 via real gateway_request_log/gateway_oauth_codes
// queries (Grok's credential was never used; zero authorization codes were
// ever issued to it).
//
// GRANTS NOTHING BY ITSELF -- every test below that reaches a real Gateway
// tool call explicitly flips the dynamically-created partner from its
// default 'pending' to 'active' first, mirroring what only a real Rayaan
// admin action does in production; a dedicated test also confirms the
// FORBIDDEN state before that flip.
//
// Run with: npx tsx scripts/test-oauth-dynamic-registration.ts

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
import { CANONICAL_RESOURCE, SUPPORTED_OAUTH_SCOPE, storeAuthorizationCode, registerOAuthClient, isValidRegistrationRedirectUri } from '../lib/gateway/oauth';
import { GET as authServerMetadata } from '../app/api/well-known/oauth-authorization-server/route';
import { POST as registerPost } from '../app/api/oauth/register/route';
import { POST as tokenPost } from '../app/api/oauth/token/route';
import { getBenchmarkRatesGated } from '../lib/gateway/benchmarkRatesGateway';

type Status = 'PASS' | 'FAIL';
interface Result { name: string; status: Status; evidence: string }
const results: Result[] = [];
function record(name: string, status: Status, evidence: string) {
  results.push({ name, status, evidence });
  console.log(`[${status}] ${name} -- ${evidence}`);
}

function b64url(buf: Buffer) { return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function newPkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = b64url(createHash('sha256').update(verifier, 'utf8').digest());
  return { verifier, challenge };
}

const partnerIdsToClean: string[] = [];

async function callRegister(body: unknown) {
  const req = new NextRequest('https://homerates.ai/api/oauth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const res = await registerPost(req);
  const status = res.status;
  const json = await res.json().catch(() => null);
  return { status, json };
}

async function callToken(params: Record<string, string>) {
  const req = new NextRequest('https://homerates.ai/api/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const res = await tokenPost(req);
  const status = res.status;
  const json = await res.json().catch(() => null);
  return { status, json };
}

async function main() {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured.');

  try {
    // ===== A. Metadata advertises the new registration_endpoint + 'none' method =====

    const metaRes = await authServerMetadata();
    const meta = await metaRes.json();
    record('A1. Authorization-server metadata advertises registration_endpoint', meta.registration_endpoint === 'https://homerates.ai/api/oauth/register' ? 'PASS' : 'FAIL', JSON.stringify(meta.registration_endpoint));
    record('A2. token_endpoint_auth_methods_supported now includes both client_secret_post and none', Array.isArray(meta.token_endpoint_auth_methods_supported) && meta.token_endpoint_auth_methods_supported.includes('client_secret_post') && meta.token_endpoint_auth_methods_supported.includes('none') ? 'PASS' : 'FAIL', JSON.stringify(meta.token_endpoint_auth_methods_supported));

    // ===== B. Redirect URI validation helper =====

    record('B1. isValidRegistrationRedirectUri rejects http:// (non-HTTPS)', !isValidRegistrationRedirectUri('http://example.com/callback') ? 'PASS' : 'FAIL', 'checked');
    record('B2. isValidRegistrationRedirectUri accepts a well-formed https:// URI', isValidRegistrationRedirectUri('https://grok.com/oauth/callback') ? 'PASS' : 'FAIL', 'checked');
    record('B3. isValidRegistrationRedirectUri rejects a malformed URI', !isValidRegistrationRedirectUri('not-a-url') ? 'PASS' : 'FAIL', 'checked');

    // ===== C. POST /api/oauth/register -- request validation =====

    const noRedirects = await callRegister({ client_name: 'Test Client' });
    record('C1. Missing redirect_uris -> 400 invalid_redirect_uri', noRedirects.status === 400 && noRedirects.json?.error === 'invalid_redirect_uri' ? 'PASS' : 'FAIL', JSON.stringify(noRedirects.json));

    const httpRedirect = await callRegister({ redirect_uris: ['http://insecure.example/cb'] });
    record('C2. Non-HTTPS redirect_uri -> 400 invalid_redirect_uri', httpRedirect.status === 400 && httpRedirect.json?.error === 'invalid_redirect_uri' ? 'PASS' : 'FAIL', JSON.stringify(httpRedirect.json));

    const badAuthMethod = await callRegister({ redirect_uris: ['https://example.com/cb'], token_endpoint_auth_method: 'client_secret_jwt' });
    record('C3. Unsupported token_endpoint_auth_method -> 400 invalid_client_metadata', badAuthMethod.status === 400 && badAuthMethod.json?.error === 'invalid_client_metadata' ? 'PASS' : 'FAIL', JSON.stringify(badAuthMethod.json));

    // ===== D. POST /api/oauth/register -- successful registration, both auth methods =====

    const grokLikeRedirect = 'https://grok.com/oauth/homerates-test-callback';
    const confidential = await callRegister({ client_name: 'Grok Test (confidential)', redirect_uris: [grokLikeRedirect] });
    record('D1. Confidential (default client_secret_post) registration -> 201 with client_id + client_secret', confidential.status === 201 && typeof confidential.json?.client_id === 'string' && typeof confidential.json?.client_secret === 'string' ? 'PASS' : 'FAIL', JSON.stringify({ status: confidential.status, hasId: !!confidential.json?.client_id, hasSecret: !!confidential.json?.client_secret }));
    record('D2. Confidential registration echoes token_endpoint_auth_method + redirect_uris + client_secret_expires_at:0', confidential.json?.token_endpoint_auth_method === 'client_secret_post' && confidential.json?.redirect_uris?.[0] === grokLikeRedirect && confidential.json?.client_secret_expires_at === 0 ? 'PASS' : 'FAIL', JSON.stringify(confidential.json));

    const publicClient = await callRegister({ client_name: 'Grok Test (public)', redirect_uris: [grokLikeRedirect], token_endpoint_auth_method: 'none' });
    record('D3. Public (none) registration -> 201 with client_id, NO client_secret field at all', publicClient.status === 201 && typeof publicClient.json?.client_id === 'string' && !('client_secret' in (publicClient.json ?? {})) ? 'PASS' : 'FAIL', JSON.stringify(publicClient.json));

    // Track the auto-created partners for cleanup (looked up by client_id).
    const { data: confClientRow } = await sb.from('gateway_oauth_clients').select('id, partner_id, registration_type, client_name').eq('client_id', confidential.json.client_id).single();
    const { data: pubClientRow } = await sb.from('gateway_oauth_clients').select('id, partner_id, registration_type, client_name, client_secret_hash').eq('client_id', publicClient.json.client_id).single();
    if (!confClientRow || !pubClientRow) throw new Error('Expected both dynamically-registered client rows to exist.');
    partnerIdsToClean.push(confClientRow.partner_id, pubClientRow.partner_id);

    record('E1. Dynamically-registered client rows are tagged registration_type=dynamic (vs the existing admin-created ChatGPT client)', confClientRow.registration_type === 'dynamic' && pubClientRow.registration_type === 'dynamic' ? 'PASS' : 'FAIL', JSON.stringify({ conf: confClientRow.registration_type, pub: pubClientRow.registration_type }));
    record('E2. Public (none) client stores a NULL client_secret_hash at rest', pubClientRow.client_secret_hash === null ? 'PASS' : 'FAIL', JSON.stringify(pubClientRow.client_secret_hash));

    const { data: confPartner } = await sb.from('gateway_partners').select('status').eq('id', confClientRow.partner_id).single();
    if (!confPartner) throw new Error('Expected the auto-created partner row to exist.');
    record('E3. Auto-created partner defaults to status=pending (the existing table default, unchanged) -- real access-control gate, not registration itself', confPartner.status === 'pending' ? 'PASS' : 'FAIL', JSON.stringify(confPartner));

    // ===== F. Full round-trip: PUBLIC ("none") client -- register -> (simulated admin
    // approval) -> token exchange with NO client_secret -> FORBIDDEN while pending
    // -> ACTIVE after admin approval -> real tool call succeeds =====

    {
      const { verifier, challenge } = newPkce();
      const code = await storeAuthorizationCode({
        oauthClientId: pubClientRow.id, redirectUri: grokLikeRedirect, codeChallenge: challenge,
        codeChallengeMethod: 'S256', resource: CANONICAL_RESOURCE, scope: SUPPORTED_OAUTH_SCOPE,
      });
      const tokenRes = await callToken({
        grant_type: 'authorization_code', code, redirect_uri: grokLikeRedirect,
        client_id: publicClient.json.client_id, code_verifier: verifier, resource: CANONICAL_RESOURCE,
        // Deliberately NO client_secret -- this is the whole point of 'none'.
      });
      record('F1. Public (none) client token exchange succeeds with NO client_secret', tokenRes.status === 200 && typeof tokenRes.json?.access_token === 'string' ? 'PASS' : 'FAIL', JSON.stringify({ status: tokenRes.status, hasToken: !!tokenRes.json?.access_token }));

      if (tokenRes.json?.access_token) {
        const resultWhilePending = await getBenchmarkRatesGated(tokenRes.json.access_token, '127.0.0.1');
        record('F2. Minted token is FORBIDDEN against a real tool while the partner is still pending (real access-control gate confirmed, not just theoretical)', !resultWhilePending.ok && resultWhilePending.error === 'FORBIDDEN' ? 'PASS' : 'FAIL', JSON.stringify(resultWhilePending));

        await sb.from('gateway_partners').update({ status: 'active' }).eq('id', pubClientRow.partner_id);
        const resultAfterApproval = await getBenchmarkRatesGated(tokenRes.json.access_token, '127.0.0.1');
        record('F3. Same token succeeds against a real tool once the partner is approved (active) -- full round-trip proven end to end', resultAfterApproval.ok === true ? 'PASS' : 'FAIL', JSON.stringify(resultAfterApproval.ok ? { ok: true } : resultAfterApproval));
      }
    }

    // ===== G. Full round-trip: CONFIDENTIAL (client_secret_post) dynamically-registered
    // client -- same flow, but WITH client_secret required, proving the new registration
    // path also works for a confidential client, not only 'none'. =====

    {
      const { verifier, challenge } = newPkce();
      const code = await storeAuthorizationCode({
        oauthClientId: confClientRow.id, redirectUri: grokLikeRedirect, codeChallenge: challenge,
        codeChallengeMethod: 'S256', resource: CANONICAL_RESOURCE, scope: SUPPORTED_OAUTH_SCOPE,
      });
      const tokenRes = await callToken({
        grant_type: 'authorization_code', code, redirect_uri: grokLikeRedirect,
        client_id: confidential.json.client_id, client_secret: confidential.json.client_secret,
        code_verifier: verifier, resource: CANONICAL_RESOURCE,
      });
      record('G1. Confidential dynamically-registered client token exchange succeeds with its real client_secret', tokenRes.status === 200 && typeof tokenRes.json?.access_token === 'string' ? 'PASS' : 'FAIL', JSON.stringify({ status: tokenRes.status }));

      const wrongSecretRes = await callToken({
        grant_type: 'authorization_code', code: 'irrelevant-already-consumed', redirect_uri: grokLikeRedirect,
        client_id: confidential.json.client_id, client_secret: 'totally-wrong-secret',
        code_verifier: verifier, resource: CANONICAL_RESOURCE,
      });
      record('G2. Confidential dynamically-registered client with a WRONG secret is still rejected invalid_client', wrongSecretRes.status === 401 && wrongSecretRes.json?.error === 'invalid_client' ? 'PASS' : 'FAIL', JSON.stringify(wrongSecretRes.json));
    }

    // ===== H. PKCE is still enforced for a 'none' client (its only real
    // authentication -- must not be skippable). =====

    {
      const { challenge } = newPkce();
      const code = await storeAuthorizationCode({
        oauthClientId: pubClientRow.id, redirectUri: grokLikeRedirect, codeChallenge: challenge,
        codeChallengeMethod: 'S256', resource: CANONICAL_RESOURCE, scope: SUPPORTED_OAUTH_SCOPE,
      });
      const wrongVerifierRes = await callToken({
        grant_type: 'authorization_code', code, redirect_uri: grokLikeRedirect,
        client_id: publicClient.json.client_id, code_verifier: 'totally-wrong-verifier', resource: CANONICAL_RESOURCE,
      });
      record('H1. Public (none) client with a WRONG PKCE verifier is rejected invalid_grant (PKCE is its entire authentication, never skippable)', wrongVerifierRes.status === 400 && wrongVerifierRes.json?.error === 'invalid_grant' ? 'PASS' : 'FAIL', JSON.stringify(wrongVerifierRes.json));
    }

    console.log('\n=== FINAL RESULTS ===');
    console.table(results.map((r) => ({ name: r.name, status: r.status })));
    const pass = results.filter((r) => r.status === 'PASS').length;
    const fail = results.filter((r) => r.status === 'FAIL').length;
    console.log(`\n${pass}/${results.length} passed.`);
    if (fail > 0) process.exit(1);
  } finally {
    if (partnerIdsToClean.length) {
      const { data: clientsToClean } = await sb.from('gateway_oauth_clients').select('id').in('partner_id', partnerIdsToClean);
      const clientIds = (clientsToClean ?? []).map((c: any) => c.id);
      if (clientIds.length) {
        await sb.from('gateway_oauth_codes').delete().in('oauth_client_id', clientIds);
        await sb.from('gateway_oauth_clients').delete().in('id', clientIds);
      }
      await sb.from('gateway_credentials').delete().in('partner_id', partnerIdsToClean);
      await sb.from('gateway_partners').delete().in('id', partnerIdsToClean);
    }
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
