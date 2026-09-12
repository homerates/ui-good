// app/api/oauth/token/route.ts
//
// Phase OB -- OAuth 2.1 token endpoint. Called directly by ChatGPT's
// backend (client_id + client_secret in the request body) -- no Clerk
// session, listed in middleware.ts's public allowlist alongside
// /api/mcp/property-intelligence for the same reason.
//
// Supports ONLY grant_type=authorization_code, client_secret_post auth.
// No refresh_token grant, no client_credentials, no implicit.
//
// THE ENTIRE BRIDGE, IN ONE LINE: once every OAuth-layer check below
// passes, this handler calls the EXISTING issueCredential()
// (lib/gateway/credentials.ts) -- completely unchanged since Phase A-F --
// to mint a real, short-lived hrg_<prefix>_<secret> Gateway credential,
// bound to the SAME gateway_partner the OAuth client itself is bound to.
// That plaintext key IS the OAuth access_token returned below. No second
// authenticated Gateway entry point is created; the Gateway (auth.ts,
// rateLimit.ts, circuitBreaker.ts, requestLog.ts) never learns or cares
// that a credential came from this endpoint rather than the admin UI.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { issueCredential } from '../../../../lib/gateway/credentials';
import {
  lookupOAuthClient,
  verifyClientSecret,
  consumeAuthorizationCode,
  verifyPkce,
  validateResource,
} from '../../../../lib/gateway/oauth';

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour, per the accepted pilot design

function oauthError(error: string, description: string, status: number) {
  return NextResponse.json({ error, error_description: description }, { status });
}

async function parseBody(req: NextRequest): Promise<URLSearchParams> {
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const json = await req.json().catch(() => ({}));
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(json ?? {})) {
      if (typeof v === 'string') params.set(k, v);
    }
    return params;
  }
  // Standard OAuth token requests are application/x-www-form-urlencoded
  // (RFC 6749 Section 4.1.3) -- the primary, expected path.
  const form = await req.formData().catch(() => null);
  const params = new URLSearchParams();
  if (form) {
    for (const [k, v] of form.entries()) {
      if (typeof v === 'string') params.set(k, v);
    }
  }
  return params;
}

export async function POST(req: NextRequest) {
  const params = await parseBody(req);

  const grantType = params.get('grant_type');
  if (grantType !== 'authorization_code') {
    return oauthError('unsupported_grant_type', 'Only grant_type=authorization_code is supported.', 400);
  }

  const clientId = params.get('client_id');
  if (!clientId) {
    return oauthError('invalid_client', 'Client authentication failed.', 401);
  }

  const client = await lookupOAuthClient(clientId);
  if (!client) {
    return oauthError('invalid_client', 'Client authentication failed.', 401);
  }

  // Phase OC: a 'none'-method client (dynamically registered, public/PKCE-
  // only -- see lib/gateway/oauth.ts's registerOAuthClient()) has no secret
  // to verify; PKCE below is its entire authentication. Every other method
  // (today: only 'client_secret_post', the existing ChatGPT pilot path)
  // keeps the EXACT original secret-required-and-verified behavior,
  // including the same generic invalid_client message either way -- never
  // reveal whether client_id itself was unknown vs. the secret was wrong
  // (lib/gateway/auth.ts's existing "never leak why" posture, applied here too).
  if (client.tokenEndpointAuthMethod !== 'none') {
    const clientSecret = params.get('client_secret');
    if (!clientSecret || !client.clientSecretHash || !verifyClientSecret(clientSecret, client.clientSecretHash)) {
      return oauthError('invalid_client', 'Client authentication failed.', 401);
    }
  }

  const code = params.get('code');
  const redirectUri = params.get('redirect_uri');
  if (!code || !redirectUri) {
    return oauthError('invalid_request', 'code and redirect_uri are required.', 400);
  }

  const consumed = await consumeAuthorizationCode(code, redirectUri);
  if (!consumed || consumed.oauthClientId !== client.id) {
    return oauthError('invalid_grant', 'The authorization code is invalid, expired, already used, or was issued to a different client.', 400);
  }

  const codeVerifier = params.get('code_verifier');
  if (!codeVerifier || !verifyPkce(codeVerifier, consumed.codeChallenge, 'S256')) {
    return oauthError('invalid_grant', 'PKCE verification failed.', 400);
  }

  // resource is OPTIONAL here too (RFC 8707), same treatment as the
  // authorize step -- omitted defaults to CANONICAL_RESOURCE, so a client
  // that omitted it at both steps still matches consumed.resource (which
  // was stored as the SAME default when the authorization code was issued).
  const resource = validateResource(params.get('resource'));
  if (resource === null || resource !== consumed.resource) {
    return oauthError('invalid_target', 'The requested resource does not match the authorization request.', 400);
  }

  // Scope is never re-read from the token request -- consumed.scope (fixed
  // at authorization time) is the only authoritative source, so a token
  // request cannot escalate scope by simply asking for a broader one here.
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const { plaintextKey } = await issueCredential(client.partnerId, [consumed.scope], { expiresAt });

  // No refresh_token, no partner/credential ID, no internal detail --
  // exactly the standard OAuth token response shape and nothing more.
  return NextResponse.json({
    access_token: plaintextKey,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: consumed.scope,
  });
}
