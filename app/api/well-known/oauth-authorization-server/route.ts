// app/api/well-known/oauth-authorization-server/route.ts
//
// RFC 8414 OAuth 2.0 Authorization Server Metadata. Deferred from Phase OA
// (see that phase's report) because /api/oauth/authorize and
// /api/oauth/token did not exist yet -- publishing this document earlier
// would have advertised endpoints that 404'd. Both now exist (Phase OB), so
// this document is accurate.
//
// Publicly served at https://homerates.ai/.well-known/oauth-authorization-server
// via the rewrite in next.config.mjs -- same safe, normal-path approach
// proven in Phase OA for the protected-resource metadata route, avoiding
// any framework/build-tool ambiguity around dot-prefixed folder names.
//
// Advertises ONLY what is actually implemented: authorization_code grant,
// S256 PKCE, one token-endpoint auth method (client_secret_post). No OIDC
// field, no jwks_uri, no registration_endpoint (pre-registered client only,
// per the accepted design), no revocation_endpoint, no introspection_endpoint,
// no refresh_token in grant_types_supported (Phase OB never issues one).
//
// Static, no DB read, no partner/credential/client ID, no implementation detail.

import { NextResponse } from 'next/server';
import { SUPPORTED_OAUTH_SCOPE } from '../../../../lib/gateway/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ISSUER = 'https://homerates.ai';

export async function GET() {
  return NextResponse.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/api/oauth/authorize`,
    token_endpoint: `${ISSUER}/api/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: [SUPPORTED_OAUTH_SCOPE],
    token_endpoint_auth_methods_supported: ['client_secret_post'],
  });
}
