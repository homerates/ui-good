// app/api/oauth/register/route.ts
//
// Phase OC -- RFC 7591 OAuth 2.0 Dynamic Client Registration. Called
// directly by a third-party MCP client's own backend (e.g. Grok) -- no
// Clerk session, same public-route pattern as /api/oauth/token and
// /api/mcp/property-intelligence (see middleware.ts's allowlist).
//
// GRANTS NOTHING BY ITSELF. See migration 086's own header and
// lib/gateway/oauth.ts's registerOAuthClient() for the full security
// reasoning: a successful registration only produces a client_id (and,
// for a confidential client, a client_secret) -- the real access-control
// boundary is unchanged and still requires (1) a real HomeRates admin
// Clerk session approving the request on /api/oauth/authorize's consent
// page, and (2) that client's auto-created gateway_partner being manually
// promoted from its default 'pending' status to 'active' on the existing
// Gateway Partners admin page before any resulting credential can call a
// real tool.
//
// This implementation supports exactly ONE redirect_uri per client
// (matching gateway_oauth_clients' existing single redirect_uri column,
// unchanged by this phase) -- if redirect_uris contains more than one, only
// the first is stored/honored. A client presenting a different redirect_uri
// at /api/oauth/authorize than the one it registered here is rejected
// there, exactly as for the existing manually-registered ChatGPT client.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { registerOAuthClient, isValidRegistrationRedirectUri, type TokenEndpointAuthMethod } from '../../../../lib/gateway/oauth';

const VALID_AUTH_METHODS = new Set<TokenEndpointAuthMethod>(['client_secret_post', 'none']);
const MAX_CLIENT_NAME_LENGTH = 200;

function registrationError(error: string, description: string, status: number) {
  return NextResponse.json({ error, error_description: description }, { status });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return registrationError('invalid_client_metadata', 'Request body must be a JSON object.', 400);
  }

  const redirectUris = (body as Record<string, unknown>).redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || typeof redirectUris[0] !== 'string') {
    return registrationError('invalid_redirect_uri', 'redirect_uris must be a non-empty array of at least one URI string.', 400);
  }
  const redirectUri = redirectUris[0];
  if (!isValidRegistrationRedirectUri(redirectUri)) {
    return registrationError('invalid_redirect_uri', 'redirect_uris[0] must be a well-formed https:// URI.', 400);
  }

  const rawClientName = (body as Record<string, unknown>).client_name;
  if (rawClientName !== undefined && (typeof rawClientName !== 'string' || rawClientName.length > MAX_CLIENT_NAME_LENGTH)) {
    return registrationError('invalid_client_metadata', `client_name must be a string no longer than ${MAX_CLIENT_NAME_LENGTH} characters.`, 400);
  }
  const clientName = typeof rawClientName === 'string' && rawClientName.trim().length > 0 ? rawClientName.trim() : null;

  const rawAuthMethod = (body as Record<string, unknown>).token_endpoint_auth_method;
  const tokenEndpointAuthMethod: TokenEndpointAuthMethod =
    rawAuthMethod === undefined ? 'client_secret_post' : (rawAuthMethod as TokenEndpointAuthMethod);
  if (!VALID_AUTH_METHODS.has(tokenEndpointAuthMethod)) {
    return registrationError('invalid_client_metadata', 'token_endpoint_auth_method must be "client_secret_post" or "none".', 400);
  }

  try {
    const registered = await registerOAuthClient({ clientName, redirectUri, tokenEndpointAuthMethod });
    return NextResponse.json(
      {
        client_id: registered.clientId,
        ...(registered.clientSecret ? { client_secret: registered.clientSecret } : {}),
        client_id_issued_at: registered.clientIdIssuedAt,
        client_secret_expires_at: 0, // never expires, per RFC 7591 convention for "no expiration"
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: tokenEndpointAuthMethod,
        ...(clientName ? { client_name: clientName } : {}),
      },
      { status: 201 },
    );
  } catch {
    return registrationError('invalid_client_metadata', 'Registration could not be completed.', 500);
  }
}
