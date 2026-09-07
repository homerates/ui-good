// scripts/test-oauth-foundation.ts
//
// HomeRates Intelligence Gateway V1 — Phase OA test harness.
//
// Run with: npx --yes tsx scripts/test-oauth-foundation.ts
//
// Phase OA builds OAuth 2.1 FOUNDATION ONLY (migration 085, lib/gateway/oauth.ts,
// the optional issueCredential() expiry param, and the RFC 9728 protected-
// resource metadata route) — there is no /api/oauth/authorize or
// /api/oauth/token route yet (Phase OB), so this harness tests exactly the
// primitives that exist: OAuth client lookup/secret verification, redirect/
// resource/scope validation, PKCE S256 verification, authorization-code
// storage/single-use consumption, the new optional credential-expiry
// support, and the protected-resource metadata endpoint.
//
// MIGRATION-DEPENDENT TESTS: migration 085 (gateway_oauth_clients,
// gateway_oauth_codes) is NOT applied by this script — Rayaan applies every
// migration manually in the Supabase SQL Editor (CLAUDE.md / DEPLOY_WORKFLOW.md).
// Tests that need those two tables are wrapped so a "relation does not
// exist" Postgres error (42P01) is reported as BLOCKED, not FAIL or a
// harness crash — this script is safe to run both before and after the
// migration is applied. Every other test (PKCE math, scope/resource/
// redirect string validation, existing-credential-issuance regression, the
// metadata route) needs no new table and always runs for real.

import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

import { NextRequest } from 'next/server';
import { getSupabase } from '../lib/supabaseServer';
import { issueCredential, revokeCredential, verifyCredential } from '../lib/gateway/credentials';
import { GET as protectedResourceMetadata } from '../app/api/well-known/oauth-protected-resource/route';
import {
  CANONICAL_RESOURCE,
  SUPPORTED_OAUTH_SCOPE,
  hashClientSecret,
  verifyClientSecret,
  lookupOAuthClient,
  validateRedirectUri,
  validateResource,
  validateScope,
  verifyPkce,
  storeAuthorizationCode,
  consumeAuthorizationCode,
  type OAuthClient,
} from '../lib/gateway/oauth';

type Status = 'PASS' | 'FAIL' | 'BLOCKED';
interface Result { category: string; name: string; status: Status; evidence: string }
const results: Result[] = [];

function record(category: string, name: string, status: Status, evidence: string) {
  results.push({ category, name, status, evidence });
  console.log(`[${status}] ${category} / ${name} -- ${evidence}`);
}

function isMissingRelation(err: unknown): boolean {
  const code = (err as any)?.code;
  const msg = err instanceof Error ? err.message : ((err as any)?.message ?? String(err));
  // 42P01 is the raw Postgres "undefined_table" code; PGRST205 is
  // PostgREST's own code for "table not in its schema cache" -- found live
  // (2026-09-07) that Supabase's REST layer returns PGRST205, not 42P01,
  // when a table genuinely doesn't exist yet, since PostgREST never even
  // reaches Postgres for a table absent from its cached schema.
  return code === '42P01' || code === 'PGRST205' || /relation .* does not exist/i.test(msg) || /could not find the table/i.test(msg);
}

// Sticky: once any test observes migration 085's tables are missing, every
// LATER DB-dependent test short-circuits straight to BLOCKED without even
// attempting its body -- otherwise a missing first fixture (e.g. the client
// insert) cascades into a string of confusing "X not set" FAILs in every
// test that depends on it, instead of one clear signal.
let migrationApplied = true;

// Wraps a DB-dependent test: on a "relation does not exist" error, records
// BLOCKED instead of FAIL/crashing, so this harness is safe to run both
// before and after migration 085 is applied.
async function dbTest(category: string, name: string, fn: () => Promise<{ pass: boolean; evidence: string }>) {
  if (!migrationApplied) {
    record(category, name, 'BLOCKED', 'migration 085 not yet applied (skipped -- depends on an earlier blocked fixture)');
    return;
  }
  try {
    const { pass, evidence } = await fn();
    record(category, name, pass ? 'PASS' : 'FAIL', evidence);
  } catch (e) {
    if (isMissingRelation(e)) {
      migrationApplied = false;
      record(category, name, 'BLOCKED', 'migration 085 not yet applied (relation does not exist)');
    } else {
      const detail = e instanceof Error ? e.message : ((e as any)?.message ?? JSON.stringify(e));
      record(category, name, 'FAIL', `threw: ${detail}`);
    }
  }
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function main() {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured.');

  const partnerIds: string[] = [];
  const oauthClientIds: string[] = [];
  const oauthTestCredIds: string[] = [];

  console.log('=== FIXTURE SETUP ===');
  const { data: partner } = await sb.from('gateway_partners')
    .insert({ name: 'Phase OA Foundation Test Partner', contact_email: 'gateway-validation@homerates.ai', status: 'active' })
    .select('*').single();
  partnerIds.push(partner.id);

  const TEST_REDIRECT = 'https://chatgpt.com/connector/oauth/PhaseOA-Test-Fixture';
  const TEST_CLIENT_ID = `phase-oa-test-${randomBytes(4).toString('hex')}`;
  const TEST_CLIENT_SECRET = randomBytes(24).toString('hex');

  try {
    // ===== 1. Protected-resource metadata (no DB dependency) =====
    {
      const res = await protectedResourceMetadata();
      const json = await res.json();
      const shapeOk =
        res.status === 200 &&
        json.resource === CANONICAL_RESOURCE &&
        Array.isArray(json.authorization_servers) && json.authorization_servers.includes('https://homerates.ai') &&
        Array.isArray(json.scopes_supported) && json.scopes_supported.includes(SUPPORTED_OAUTH_SCOPE);
      record('1', 'protected-resource metadata: shape + values', shapeOk ? 'PASS' : 'FAIL', JSON.stringify(json));

      const raw = JSON.stringify(json);
      const noInternalIds = !/partner_id|credential_id|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(raw);
      record('1', 'protected-resource metadata: no internal IDs leaked', noInternalIds ? 'PASS' : 'FAIL', raw);
    }

    // ===== 2. Resource validation (pure function) =====
    record('2', 'validateResource: exact canonical resource', validateResource(CANONICAL_RESOURCE) ? 'PASS' : 'FAIL', CANONICAL_RESOURCE);
    record('2', 'validateResource: rejects trailing slash variant', !validateResource(CANONICAL_RESOURCE + '/') ? 'PASS' : 'FAIL', CANONICAL_RESOURCE + '/');
    record('2', 'validateResource: rejects different host', !validateResource('https://evil.example/api/mcp/property-intelligence') ? 'PASS' : 'FAIL', 'different host rejected');
    record('2', 'validateResource: rejects http scheme', !validateResource(CANONICAL_RESOURCE.replace('https', 'http')) ? 'PASS' : 'FAIL', 'http scheme rejected');

    // ===== 3. Scope validation (pure function) =====
    record('3', 'validateScope: exact supported scope', validateScope(SUPPORTED_OAUTH_SCOPE) === SUPPORTED_OAUTH_SCOPE ? 'PASS' : 'FAIL', SUPPORTED_OAUTH_SCOPE);
    record('3', 'validateScope: omitted defaults to supported scope', validateScope(undefined) === SUPPORTED_OAUTH_SCOPE ? 'PASS' : 'FAIL', 'undefined -> default');
    record('3', 'validateScope: unknown scope rejected, never elevated', validateScope('property_intelligence:write') === null ? 'PASS' : 'FAIL', 'property_intelligence:write rejected');
    record('3', 'validateScope: broader scope string rejected', validateScope('admin:all') === null ? 'PASS' : 'FAIL', 'admin:all rejected');

    // ===== 4. PKCE S256 (pure function) =====
    {
      const verifier = randomBytes(32).toString('base64url');
      const challenge = b64url(require('crypto').createHash('sha256').update(verifier, 'utf8').digest());
      record('4', 'verifyPkce: correct S256 verifier/challenge pair', verifyPkce(verifier, challenge, 'S256') ? 'PASS' : 'FAIL', 'valid pair verified');
      record('4', 'verifyPkce: wrong verifier rejected', !verifyPkce('wrong-verifier', challenge, 'S256') ? 'PASS' : 'FAIL', 'mismatched verifier rejected');
      record('4', "verifyPkce: 'plain' method rejected outright", !verifyPkce(verifier, verifier, 'plain') ? 'PASS' : 'FAIL', 'plain method never accepted, even with matching value');
      record('4', 'verifyPkce: unknown method rejected', !verifyPkce(verifier, challenge, 'S1') ? 'PASS' : 'FAIL', 'S1 rejected');
    }

    // ===== 5. Optional Gateway credential expiration (existing table, no migration needed) =====
    {
      const noExpiry = await issueCredential(partner.id, ['property_intelligence:read']);
      const { data: noExpiryRow } = await sb.from('gateway_credentials').select('id, expires_at').eq('key_prefix', noExpiry.prefix).single();
      if (!noExpiryRow) throw new Error('noExpiryRow fixture insert failed');
      oauthTestCredIds.push(noExpiryRow.id);
      record('5', 'issueCredential() with no expiresAt: existing behavior unchanged (expires_at null)', noExpiryRow.expires_at === null ? 'PASS' : 'FAIL', `expires_at=${noExpiryRow.expires_at}`);
      const verifiedNoExpiry = await verifyCredential(noExpiry.plaintextKey);
      record('5', 'issueCredential() with no expiresAt: still verifies successfully', verifiedNoExpiry !== null ? 'PASS' : 'FAIL', 'verifyCredential() succeeded');

      const future = new Date(Date.now() + 60 * 60 * 1000);
      const withExpiry = await issueCredential(partner.id, ['property_intelligence:read'], { expiresAt: future });
      const { data: withExpiryRow } = await sb.from('gateway_credentials').select('id, expires_at').eq('key_prefix', withExpiry.prefix).single();
      if (!withExpiryRow) throw new Error('withExpiryRow fixture insert failed');
      oauthTestCredIds.push(withExpiryRow.id);
      record('5', 'issueCredential() with future expiresAt: stored correctly', withExpiryRow.expires_at !== null ? 'PASS' : 'FAIL', `expires_at=${withExpiryRow.expires_at}`);
      const verifiedWithExpiry = await verifyCredential(withExpiry.plaintextKey);
      record('5', 'short-lived credential (not yet expired): verifies successfully', verifiedWithExpiry !== null ? 'PASS' : 'FAIL', 'verifyCredential() succeeded before expiry');

      // Simulate expiry having passed -- directly backdate expires_at, since
      // this harness cannot literally wait out a real TTL.
      await sb.from('gateway_credentials').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', withExpiryRow.id);
      const verifiedExpired = await verifyCredential(withExpiry.plaintextKey);
      record('5', 'short-lived credential (backdated past expiry): verifyCredential() rejects it', verifiedExpired === null ? 'PASS' : 'FAIL', 'verifyCredential() correctly returned null');
    }

    // ===== 6. Existing static pilot credential remains untouched and valid =====
    {
      const PILOT_PARTNER_ID = 'b40f8d49-725c-45e8-8111-e7e95ec62837';
      const { data: pilotPartner } = await sb.from('gateway_partners').select('status').eq('id', PILOT_PARTNER_ID).single();
      record('6', 'HomeRates ChatGPT Dev Pilot partner: still active', pilotPartner?.status === 'active' ? 'PASS' : 'FAIL', JSON.stringify(pilotPartner));
      const { data: pilotCreds } = await sb.from('gateway_credentials').select('status, expires_at').eq('partner_id', PILOT_PARTNER_ID);
      const anyActive = (pilotCreds ?? []).some((c: any) => c.status === 'active');
      record('6', 'HomeRates ChatGPT Dev Pilot credential: still active, unchanged', anyActive ? 'PASS' : 'FAIL', JSON.stringify(pilotCreds));
    }

    // ===== 7. OAuth client table (migration-dependent) =====
    let testClientRowId: string | null = null;
    await dbTest('7', 'gateway_oauth_clients: insert test client row', async () => {
      const { data, error } = await sb.from('gateway_oauth_clients').insert({
        partner_id: partner.id,
        client_id: TEST_CLIENT_ID,
        client_secret_hash: hashClientSecret(TEST_CLIENT_SECRET),
        redirect_uri: TEST_REDIRECT,
        token_endpoint_auth_method: 'client_secret_post',
      }).select('id').single();
      if (error) throw error;
      testClientRowId = data.id;
      oauthClientIds.push(data.id);
      return { pass: !!data.id, evidence: `inserted row id=${data.id}` };
    });

    let lookedUpClient: OAuthClient | null = null;
    await dbTest('7', 'lookupOAuthClient: finds the test client by client_id', async () => {
      lookedUpClient = await lookupOAuthClient(TEST_CLIENT_ID);
      return { pass: lookedUpClient !== null && lookedUpClient.partnerId === partner.id, evidence: JSON.stringify(lookedUpClient) };
    });

    await dbTest('7', 'lookupOAuthClient: unknown client_id returns null', async () => {
      const r = await lookupOAuthClient('nonexistent-client-' + randomBytes(4).toString('hex'));
      return { pass: r === null, evidence: 'null returned for unknown client_id' };
    });

    await dbTest('7', 'client secret hashing/verification: correct secret verifies', async () => {
      if (!lookedUpClient) throw new Error('lookedUpClient not set (earlier test failed)');
      const ok = verifyClientSecret(TEST_CLIENT_SECRET, lookedUpClient.clientSecretHash);
      return { pass: ok, evidence: 'correct secret verified true' };
    });

    await dbTest('7', 'client secret hashing/verification: wrong secret rejected', async () => {
      if (!lookedUpClient) throw new Error('lookedUpClient not set (earlier test failed)');
      const ok = verifyClientSecret('totally-wrong-secret', lookedUpClient.clientSecretHash);
      return { pass: !ok, evidence: 'wrong secret verified false' };
    });

    await dbTest('7', 'no plaintext client secret stored at rest', async () => {
      const { data, error } = await sb.from('gateway_oauth_clients').select('client_secret_hash').eq('client_id', TEST_CLIENT_ID).single();
      if (error) throw error;
      const isPlaintext = data.client_secret_hash === TEST_CLIENT_SECRET;
      return { pass: !isPlaintext, evidence: 'stored value is a hash, not the plaintext secret' };
    });

    // ===== 8. Redirect URI validation against the real stored client =====
    await dbTest('8', 'redirect exact match: correct redirect_uri accepted', async () => {
      if (!lookedUpClient) throw new Error('lookedUpClient not set');
      return { pass: validateRedirectUri(lookedUpClient, TEST_REDIRECT), evidence: 'exact match accepted' };
    });
    await dbTest('8', 'wrong redirect: different redirect_uri rejected', async () => {
      if (!lookedUpClient) throw new Error('lookedUpClient not set');
      return { pass: !validateRedirectUri(lookedUpClient, TEST_REDIRECT + '/extra'), evidence: 'mismatched redirect rejected' };
    });

    // ===== 9. Authorization codes (migration-dependent) =====
    let plaintextCode: string | null = null;
    let pkceVerifier: string | null = null;
    let pkceChallenge: string | null = null;

    await dbTest('9', 'storeAuthorizationCode: issues a code, hashed at rest', async () => {
      if (!testClientRowId) throw new Error('testClientRowId not set');
      pkceVerifier = randomBytes(32).toString('base64url');
      pkceChallenge = b64url(require('crypto').createHash('sha256').update(pkceVerifier, 'utf8').digest());
      plaintextCode = await storeAuthorizationCode({
        oauthClientId: testClientRowId,
        redirectUri: TEST_REDIRECT,
        codeChallenge: pkceChallenge,
        codeChallengeMethod: 'S256',
        resource: CANONICAL_RESOURCE,
        scope: SUPPORTED_OAUTH_SCOPE,
      });
      const { data, error } = await sb.from('gateway_oauth_codes').select('code_hash').eq('oauth_client_id', testClientRowId).single();
      if (error) throw error;
      const hashedNotPlaintext = data.code_hash !== plaintextCode;
      return { pass: !!plaintextCode && hashedNotPlaintext, evidence: 'plaintext code returned once; stored value is a hash' };
    });

    await dbTest('9', 'PKCE end-to-end: stored code_challenge verifies against the real verifier', async () => {
      if (!testClientRowId || !pkceChallenge || !pkceVerifier) throw new Error('fixtures not set');
      const { data, error } = await sb.from('gateway_oauth_codes').select('code_challenge').eq('oauth_client_id', testClientRowId).single();
      if (error) throw error;
      return { pass: verifyPkce(pkceVerifier, data.code_challenge, 'S256'), evidence: 'end-to-end PKCE verification against the stored row succeeded' };
    });

    await dbTest('9', 'consumeAuthorizationCode: wrong redirect_uri rejected (and burns the code)', async () => {
      if (!plaintextCode) throw new Error('plaintextCode not set');
      const wrong = await consumeAuthorizationCode(plaintextCode, TEST_REDIRECT + '/wrong');
      return { pass: wrong === null, evidence: 'mismatched redirect_uri returns null' };
    });

    await dbTest('9', 'consumeAuthorizationCode: already-burned code cannot be reused even with the correct redirect_uri', async () => {
      if (!plaintextCode) throw new Error('plaintextCode not set');
      const reused = await consumeAuthorizationCode(plaintextCode, TEST_REDIRECT);
      return { pass: reused === null, evidence: 'code already consumed by the prior (wrong-redirect) attempt -- confirms single-use burns on ANY presentation' };
    });

    // Fresh code for a clean single-use success + expiration test.
    let secondCode: string | null = null;
    await dbTest('9', 'storeAuthorizationCode: second fixture code for success/expiry tests', async () => {
      if (!testClientRowId || !pkceChallenge) throw new Error('fixtures not set');
      secondCode = await storeAuthorizationCode({
        oauthClientId: testClientRowId,
        redirectUri: TEST_REDIRECT,
        codeChallenge: pkceChallenge,
        codeChallengeMethod: 'S256',
        resource: CANONICAL_RESOURCE,
        scope: SUPPORTED_OAUTH_SCOPE,
      });
      return { pass: !!secondCode, evidence: 'second code issued' };
    });

    await dbTest('9', 'consumeAuthorizationCode: valid code + correct redirect_uri succeeds exactly once', async () => {
      if (!secondCode) throw new Error('secondCode not set');
      const consumed = await consumeAuthorizationCode(secondCode, TEST_REDIRECT);
      const ok = consumed !== null && consumed.resource === CANONICAL_RESOURCE && consumed.scope === SUPPORTED_OAUTH_SCOPE;
      return { pass: ok, evidence: JSON.stringify(consumed) };
    });

    await dbTest('9', 'consumeAuthorizationCode: single-use -- second attempt on the same code fails', async () => {
      if (!secondCode) throw new Error('secondCode not set');
      const reused = await consumeAuthorizationCode(secondCode, TEST_REDIRECT);
      return { pass: reused === null, evidence: 'second consumption attempt correctly rejected' };
    });

    await dbTest('9', 'authorization-code expiration: an expired code is rejected even if otherwise valid', async () => {
      if (!testClientRowId || !pkceChallenge) throw new Error('fixtures not set');
      const expiredCode = await storeAuthorizationCode({
        oauthClientId: testClientRowId,
        redirectUri: TEST_REDIRECT,
        codeChallenge: pkceChallenge,
        codeChallengeMethod: 'S256',
        resource: CANONICAL_RESOURCE,
        scope: SUPPORTED_OAUTH_SCOPE,
      });
      // Backdate expires_at directly -- this harness cannot literally wait
      // out the real 60s TTL.
      const codeHash = require('crypto').createHash('sha256').update(expiredCode, 'utf8').digest('hex');
      await sb.from('gateway_oauth_codes').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('code_hash', codeHash);
      const consumed = await consumeAuthorizationCode(expiredCode, TEST_REDIRECT);
      return { pass: consumed === null, evidence: 'backdated-expired code correctly rejected' };
    });

  } finally {
    console.log('\n=== CLEANUP ===');
    // Revoke/cancel every Phase OA test fixture. Never touches the retained
    // "HomeRates ChatGPT Dev Pilot" partner/credential (a different, fixed
    // partner ID never included in partnerIds).
    if (oauthClientIds.length) {
      await sb.from('gateway_oauth_codes').delete().in('oauth_client_id', oauthClientIds);
      await sb.from('gateway_oauth_clients').delete().in('id', oauthClientIds);
    }
    if (oauthTestCredIds.length) {
      await sb.from('gateway_credentials').update({ status: 'revoked', revoked_at: new Date().toISOString() }).in('id', oauthTestCredIds);
    }
    await sb.from('gateway_credentials').update({ status: 'revoked', revoked_at: new Date().toISOString() }).in('partner_id', partnerIds).neq('status', 'revoked');
    await sb.from('gateway_partners').update({ status: 'cancelled' }).in('id', partnerIds);

    const { data: finalPartners } = await sb.from('gateway_partners').select('status').in('id', partnerIds);
    const anyActive = (finalPartners ?? []).some((p: any) => p.status === 'active');
    console.log('cleanup: any Phase OA test partner active:', anyActive);

    console.log('\n=== FINAL RESULTS TABLE ===');
    console.table(results.map((r) => ({ category: r.category, name: r.name, status: r.status })));
    const pass = results.filter((r) => r.status === 'PASS').length;
    const fail = results.filter((r) => r.status === 'FAIL').length;
    const blocked = results.filter((r) => r.status === 'BLOCKED').length;
    console.log(`\nPASS=${pass} FAIL=${fail} BLOCKED=${blocked} TOTAL=${results.length}`);
  }
}

main().catch((e) => { console.error('HARNESS FATAL:', e); process.exit(1); });
