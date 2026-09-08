// app/api/oauth/authorize/route.ts
//
// Phase OB -- OAuth 2.1 authorization endpoint. Visited by a real human
// browser (redirected here by ChatGPT's OAuth flow, typically a fresh,
// sandboxed in-app browser with no pre-existing HomeRates session at all),
// NOT by ChatGPT's backend directly. This route IS in middleware.ts's
// public allowlist -- Clerk's own auth.protect() throws a raw
// NEXT_HTTP_ERROR_FALLBACK;404 (not a redirect) for a Route Handler with no
// session, proven live 2026-09-08, so it can't be the outer gate here.
// GET does its own auth() check instead: no session -> redirectToSignIn()
// (Clerk's own real sign-in flow, returning here after); session but not
// admin -> flat 403, same shape as every other admin route
// (lib/adminAuth.ts). No new consumer identity system, no OIDC, no
// borrower-adjacent account linking -- the only "user" this endpoint knows
// about is the existing HomeRates admin, and reaching the consent screen
// still always requires a real admin sign-in.
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
import { auth } from '@clerk/nextjs/server';
import { requireAdmin, isAdminId } from '../../../../lib/adminAuth';
import { storeAuthorizationCode } from '../../../../lib/gateway/oauth';
import { validate, redirectWithError, consentPage } from '../../../../lib/gateway/oauthAuthorize';

export async function GET(req: NextRequest) {
  const result = await validate(req.nextUrl.searchParams);
  if (!result.ok) return result.response;

  // GET-only: distinguish "no Clerk session at all" from "signed in but not
  // admin" -- requireAdmin() bundles both into one flat 403, which broke
  // every real ChatGPT connection attempt (proven live 2026-09-08):
  // ChatGPT's OAuth step opens a fresh, sandboxed in-app browser with no
  // pre-existing HomeRates session, and a flat 403 gave the pilot admin no
  // way to establish one. auth()'s own redirectToSignIn({ returnBackUrl })
  // is Clerk's first-class, documented mechanism for exactly this --
  // req.url is the SAME request validate() already vetted above (client_id,
  // redirect_uri, PKCE, scope, resource all checked), so the return
  // destination is always same-origin and already-validated, never an
  // open-redirect risk. POST is intentionally untouched: by the time a
  // POST happens the admin already has a session from this GET round-trip,
  // so requireAdmin() there works exactly as before.
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn({ returnBackUrl: req.url });
  }
  if (!(await isAdminId(userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
