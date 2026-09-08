// app/api/oauth/authorize/route.ts
//
// Phase OB -- OAuth 2.1 authorization endpoint. Visited by a real human
// browser (redirected here by ChatGPT's OAuth flow), NOT by ChatGPT's
// backend directly -- unlike /api/oauth/token and the metadata routes,
// this route is deliberately NOT in middleware.ts's public allowlist. It
// stays behind Clerk's default auth.protect(), then this handler's own
// requireAdmin() check, exactly like the existing /api/admin/* routes
// (lib/adminAuth.ts). An anonymous internet visitor cannot reach the
// consent screen at all: Clerk's middleware redirects a signed-out browser
// to sign-in first; requireAdmin() additionally rejects any signed-in
// non-admin Clerk user. No new consumer identity system, no OIDC, no
// borrower-adjacent account linking -- the only "user" this endpoint knows
// about is the existing HomeRates admin.
//
// THIN ON PURPOSE -- all real validation/rendering logic lives in
// lib/gateway/oauthAuthorize.ts, not here. Next.js's App Router strictly
// type-checks route.ts files against an exact allowed export set (GET,
// POST, runtime, dynamic, etc.) and rejects the build if any other named
// export is present -- confirmed directly when an earlier version of this
// file exported a `validate` helper for testability and broke `next build`
// with a route-typegen error. This file therefore only ever exports GET
// and POST; every export a test harness needs lives in the plain module.
//
// GATEWAY BOUNDARY -- this file never imports or calls
// lib/gateway/intelligenceGateway.ts, auth.ts, or rateLimit.ts. It only
// uses lib/gateway/oauth.ts's Phase OA primitives (via oauthAuthorize.ts)
// plus, on approval, storeAuthorizationCode() to issue a code -- never a
// Gateway credential directly (that only happens later, in
// /api/oauth/token).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/adminAuth';
import { storeAuthorizationCode } from '../../../../lib/gateway/oauth';
import { validate, redirectWithError, consentPage } from '../../../../lib/gateway/oauthAuthorize';

export async function GET(req: NextRequest) {
  const result = await validate(req.nextUrl.searchParams);
  if (!result.ok) return result.response;

  const admin = await requireAdmin();
  if (admin.error) return admin.error;

  return consentPage(result.value);
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const params = new URLSearchParams();
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') params.set(key, value);
  }

  const result = await validate(params);
  if (!result.ok) return result.response;

  const admin = await requireAdmin();
  if (admin.error) return admin.error;

  const { client, redirectUri, scope, resource, codeChallenge, codeChallengeMethod, state } = result.value;
  const action = params.get('action');

  if (action !== 'allow') {
    return redirectWithError(redirectUri, 'access_denied', 'The user denied the authorization request.', state);
  }

  const code = await storeAuthorizationCode({
    oauthClientId: client.id,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    resource,
    scope,
  });

  const url = new URL(redirectUri);
  url.searchParams.set('code', code);
  if (state !== null) url.searchParams.set('state', state);
  return NextResponse.redirect(url.toString(), 302);
}
