// app/api/well-known/oauth-protected-resource/route.ts
//
// RFC 9728 OAuth 2.0 Protected Resource Metadata, required by the MCP
// 2026-07-28 Authorization spec ("MCP servers MUST implement OAuth 2.0
// Protected Resource Metadata"). Publicly served at
// https://homerates.ai/.well-known/oauth-protected-resource via the
// rewrite in next.config.mjs -- this file lives at a normal (non-dot)
// path so it is never subject to any framework/build-tool ambiguity
// around dot-prefixed folder names.
//
// Phase OA only -- this document deliberately does NOT reference a
// /.well-known/oauth-authorization-server endpoint's specific
// authorization_endpoint/token_endpoint values, because those routes
// (Phase OB's /api/oauth/authorize and /api/oauth/token) do not exist yet.
// `authorization_servers` only needs the issuer identifier, which is
// stable regardless of Phase OB's timing -- see lib/gateway/oauth.ts's
// header and the Phase OA report for why the AS-metadata endpoint itself
// is deliberately deferred to Phase OB rather than published now with
// forward-looking URLs that would 404 until then.
//
// Static, no DB read, no partner/credential ID, no implementation detail.

import { NextResponse } from 'next/server';
import { CANONICAL_RESOURCE, SUPPORTED_OAUTH_SCOPE } from '../../../../lib/gateway/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    resource: CANONICAL_RESOURCE,
    authorization_servers: ['https://homerates.ai'],
    scopes_supported: [SUPPORTED_OAUTH_SCOPE],
    bearer_methods_supported: ['header'],
  });
}
