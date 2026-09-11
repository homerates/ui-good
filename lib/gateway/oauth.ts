// lib/gateway/oauth.ts
//
// Phase OA -- OAuth 2.1 foundation for a future ChatGPT private-plugin
// connection (Phase OB). This file is a HELPER LIBRARY ONLY: no HTTP route
// calls anything here yet, and nothing here mints a Gateway credential
// through a public route. It provides exactly the primitives Phase OB's
// /api/oauth/authorize and /api/oauth/token routes will need: OAuth client
// lookup/verification, redirect/resource/scope validation, PKCE (S256-only)
// verification, and authorization-code storage/single-use consumption.
//
// GATEWAY BOUNDARY, UNCHANGED -- nothing here imports or calls
// lib/gateway/intelligenceGateway.ts, lib/gateway/auth.ts, or
// lib/gateway/rateLimit.ts. The eventual bridge (Phase OB, not built here)
// is: a consumed authorization code resolves to {oauthClientId -> partnerId,
// scope}, and Phase OB's token endpoint calls the EXISTING issueCredential()
// (credentials.ts, extended in this same phase with an optional expiresAt)
// to mint a real, short-lived hrg_<prefix>_<secret> credential as the OAuth
// access token. This file does not do that minting itself -- only the
// protocol scaffolding around it.
//
// NEVER LOGGED -- authorization codes (plaintext), PKCE code_verifier
// values, and client secrets (plaintext) never appear in any log call in
// this file. A future access token (Phase OB) is, by design, just an
// existing Gateway credential plaintext key -- already covered by
// credentials.ts's own "never persist/log the plaintext" discipline.

import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { getSupabase } from '../supabaseServer';

// The one supported pilot scope -- reusing the existing Gateway scope
// string verbatim (see ALLOWED_GATEWAY_SCOPES in credentials.ts). There is
// no broader OAuth scope; an unrecognized or missing scope is never
// silently widened to this value except at the one explicit default point
// documented on validateScope() below.
export const SUPPORTED_OAUTH_SCOPE = 'property_intelligence:read';

// The exact canonical resource URI (RFC 8707) for this MCP server. Resource
// comparison is always exact string equality -- no scheme/host/trailing-
// slash normalization on our side; callers must send exactly this value.
export const CANONICAL_RESOURCE = 'https://homerates.ai/api/mcp/property-intelligence';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function timingSafeEqualUtf8(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ---- OAuth client -------------------------------------------------------

export interface OAuthClient {
  id: string;
  partnerId: string;
  clientId: string;
  // Phase OC: null for a 'none' (public, PKCE-only) client -- see
  // registerOAuthClient() below. Never null for 'client_secret_post'/
  // 'client_secret_basic' clients, including the existing ChatGPT pilot row.
  clientSecretHash: string | null;
  redirectUri: string;
  tokenEndpointAuthMethod: string;
}

export async function lookupOAuthClient(clientId: string): Promise<OAuthClient | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data } = await sb
    .from('gateway_oauth_clients')
    .select('id, partner_id, client_id, client_secret_hash, redirect_uri, token_endpoint_auth_method, status')
    .eq('client_id', clientId)
    .maybeSingle();
  if (!data) return null;
  // A disabled client looks identical to an unknown one -- no distinguishing
  // detail leaked, matching lib/gateway/auth.ts's "never leak *why*" posture.
  if (data.status !== 'active') return null;

  return {
    id: data.id,
    partnerId: data.partner_id,
    clientId: data.client_id,
    clientSecretHash: data.client_secret_hash,
    redirectUri: data.redirect_uri,
    tokenEndpointAuthMethod: data.token_endpoint_auth_method,
  };
}

export function hashClientSecret(plaintextSecret: string): string {
  return sha256Hex(plaintextSecret);
}

export function verifyClientSecret(plaintextSecret: string, storedHash: string): boolean {
  return timingSafeEqualHex(sha256Hex(plaintextSecret), storedHash);
}

// ---- Dynamic Client Registration (RFC 7591, Phase OC) --------------------
//
// Lets a compliant third-party MCP client (e.g. Grok) self-register instead
// of requiring a manually pre-created gateway_oauth_clients row (today's
// only client, the ChatGPT pilot, was created directly in Supabase). This
// function GRANTS NOTHING by itself -- see migration 086's own header for
// the full security reasoning: the authorization endpoint's existing
// admin-consent gate, and the auto-created partner's default 'pending'
// status, are the real access-control boundary, unchanged by this file.

const CLIENT_ID_BYTES = 16; // 128 bits -- a public identifier, not secret; no need to match credential-secret entropy
const CLIENT_SECRET_BYTES = 32; // 256 bits, matching issueCredential()'s own secret entropy

export type TokenEndpointAuthMethod = 'client_secret_post' | 'none';

export interface RegisterOAuthClientInput {
  clientName: string | null;
  redirectUri: string;
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;
}

export interface RegisteredOAuthClient {
  clientId: string;
  clientSecret: string | null; // null for a 'none' (public) client
  clientIdIssuedAt: number; // Unix seconds, per RFC 7591
}

// HTTPS-only, always -- this is a public production endpoint receiving
// registrations from arbitrary internet callers, not a local-dev tool, so
// no localhost/http exception is made (unlike some DCR implementations
// that special-case loopback URIs for native-app testing).
export function isValidRegistrationRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function registerOAuthClient(input: RegisterOAuthClientInput): Promise<RegisteredOAuthClient> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase unavailable.');

  // Every self-registered client gets its OWN gateway_partner -- reusing
  // the exact identity/rate-limit/revocation unit every other Gateway
  // caller already uses, not a new concept. status defaults to 'pending'
  // (the table's own existing default, migration 082) -- deliberately left
  // there; Rayaan promotes it to 'active' on the existing Gateway Partners
  // admin page once he recognizes/approves the integration, exactly as he
  // already does for a manually-created partner.
  const partnerName = input.clientName?.trim() || `Dynamic OAuth client (${new Date().toISOString().slice(0, 10)})`;
  const { data: partner, error: partnerErr } = await sb
    .from('gateway_partners')
    .insert({ name: partnerName, contact_email: 'dynamic-oauth-registration@homerates.ai' })
    .select('id')
    .single();
  if (partnerErr || !partner) throw new Error(`Failed to create partner for dynamic client: ${partnerErr?.message}`);

  const clientId = `oc_${randomBytes(CLIENT_ID_BYTES).toString('hex')}`;
  const isPublicClient = input.tokenEndpointAuthMethod === 'none';
  const clientSecret = isPublicClient ? null : randomBytes(CLIENT_SECRET_BYTES).toString('hex');
  const clientSecretHash = clientSecret ? hashClientSecret(clientSecret) : null;

  const { error: clientErr } = await sb.from('gateway_oauth_clients').insert({
    partner_id: partner.id,
    client_id: clientId,
    client_secret_hash: clientSecretHash,
    redirect_uri: input.redirectUri,
    token_endpoint_auth_method: input.tokenEndpointAuthMethod,
    client_name: input.clientName,
    registration_type: 'dynamic',
  });
  if (clientErr) throw new Error(`Failed to register OAuth client: ${clientErr.message}`);

  return { clientId, clientSecret, clientIdIssuedAt: Math.floor(Date.now() / 1000) };
}

// ---- Redirect / resource / scope validation -----------------------------

// Exact string match only -- no scheme/host normalization, no trailing-
// slash tolerance. A future ChatGPT-created connector with a different
// callback is supported by storing a different redirect_uri on its OWN
// gateway_oauth_clients row, never by loosening this comparison.
export function validateRedirectUri(client: OAuthClient, redirectUri: string): boolean {
  return client.redirectUri === redirectUri;
}

export function validateResource(resource: string): boolean {
  return resource === CANONICAL_RESOURCE;
}

// Returns the validated scope string, or null if the request must be
// rejected. Omitted scope defaults to the one supported pilot scope (the
// only scope that will ever exist for this pilot); any EXPLICITLY supplied
// scope that isn't exactly SUPPORTED_OAUTH_SCOPE is rejected outright --
// never silently narrowed or widened to something else.
export function validateScope(requestedScope: string | undefined | null): string | null {
  if (requestedScope === undefined || requestedScope === null || requestedScope === '') {
    return SUPPORTED_OAUTH_SCOPE;
  }
  return requestedScope === SUPPORTED_OAUTH_SCOPE ? SUPPORTED_OAUTH_SCOPE : null;
}

// ---- PKCE (S256 only) ----------------------------------------------------

// Per the accepted design and the current MCP/OAuth 2.1 spec, `plain` is
// never accepted -- rejected before the verifier is ever compared, so a
// caller cannot downgrade PKCE by simply asserting a weaker method.
export function verifyPkce(codeVerifier: string, codeChallenge: string, codeChallengeMethod: string): boolean {
  if (codeChallengeMethod !== 'S256') return false;
  const computed = base64url(createHash('sha256').update(codeVerifier, 'utf8').digest());
  return timingSafeEqualUtf8(computed, codeChallenge);
}

// ---- Authorization codes -------------------------------------------------

const AUTH_CODE_BYTES = 32; // 256 bits, matching Gateway credential secret entropy
const AUTH_CODE_TTL_SECONDS = 60; // short-lived by design -- exchanged immediately, not stored for later use

export interface StoreAuthorizationCodeInput {
  oauthClientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string; // must be 'S256' -- also enforced by the DB CHECK constraint
  resource: string;
  scope: string;
}

// Returns the plaintext code exactly once, mirroring issueCredential()'s
// existing plaintext-secret discipline (credentials.ts) -- only its SHA-256
// hash is ever persisted.
export async function storeAuthorizationCode(input: StoreAuthorizationCodeInput): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase unavailable.');

  const code = randomBytes(AUTH_CODE_BYTES).toString('hex');
  const codeHash = sha256Hex(code);
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000).toISOString();

  const { error } = await sb.from('gateway_oauth_codes').insert({
    code_hash: codeHash,
    oauth_client_id: input.oauthClientId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: input.codeChallengeMethod,
    resource: input.resource,
    scope: input.scope,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`Failed to store authorization code: ${error.message}`);

  return code;
}

export interface ConsumedAuthorizationCode {
  oauthClientId: string;
  codeChallenge: string;
  resource: string;
  scope: string;
}

// Single-use, atomic consumption: the UPDATE only matches a row that is
// both unexpired and not yet used; Postgres's own row-level locking makes
// "check and mark used" one atomic operation, so two concurrent exchange
// attempts for the same code can never both succeed.
//
// The code is marked used_at BEFORE the redirect_uri comparison below, on
// purpose: an authorization code presented with a mismatched redirect_uri
// is a failed exchange attempt, and per standard OAuth 2.1 guidance such an
// attempt should burn the code immediately rather than leave it available
// for a second attempt with a different redirect_uri -- burning on ANY
// presentation, valid or invalid, is the safer posture against a code-
// guessing/redirect-fixation retry.
//
// Returns null on ANY failure (unknown hash, already used, expired, or
// redirect_uri mismatch) -- callers get no signal distinguishing these
// cases, matching the Gateway's existing "never leak why" posture.
export async function consumeAuthorizationCode(
  plaintextCode: string,
  redirectUri: string,
): Promise<ConsumedAuthorizationCode | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const codeHash = sha256Hex(plaintextCode);
  const nowIso = new Date().toISOString();

  const { data, error } = await sb
    .from('gateway_oauth_codes')
    .update({ used_at: nowIso })
    .eq('code_hash', codeHash)
    .is('used_at', null)
    .gt('expires_at', nowIso)
    .select('oauth_client_id, redirect_uri, code_challenge, resource, scope')
    .maybeSingle();

  if (error || !data) return null;
  if (data.redirect_uri !== redirectUri) return null;

  return {
    oauthClientId: data.oauth_client_id,
    codeChallenge: data.code_challenge,
    resource: data.resource,
    scope: data.scope,
  };
}
