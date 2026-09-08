// lib/gateway/oauthAuthorize.ts
//
// Phase OB -- shared logic behind app/api/oauth/authorize/route.ts, split
// into a plain module (not the route file itself) so it can export more
// than GET/POST/config: Next.js's App Router strictly type-checks route.ts
// files against an exact allowed export set and REJECTS the build if any
// other named export is present (confirmed directly -- exporting a
// `validate` function from the route file itself broke `next build` with
// a route-typegen error, even though it worked fine in dev/tsc). Keeping
// this logic here, imported by the thin route file, is what makes it
// possible for a test harness to exercise the same real validation logic
// without also invoking requireAdmin()/Clerk's auth() -- which throws
// outside a real Next.js request context (the `server-only` package).
//
// SECURITY -- client_id/redirect_uri are validated as a matching PAIR
// before anything else runs. Per OAuth 2.1, an error must never be
// reported by redirecting to an unvalidated redirect_uri (that's an open-
// redirect primitive); only once client_id+redirect_uri are both confirmed
// against the same registered gateway_oauth_clients row does validate()
// ever produce a redirect back to the caller, including for error
// responses.

import { NextResponse } from 'next/server';
import {
  lookupOAuthClient,
  validateRedirectUri,
  validateResource,
  validateScope,
  type OAuthClient,
} from './oauth';

export interface ValidatedAuthorizeRequest {
  client: OAuthClient;
  redirectUri: string;
  scope: string;
  resource: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string | null;
}

export type ValidateResult =
  | { ok: true; value: ValidatedAuthorizeRequest }
  | { ok: false; response: NextResponse };

export function localErrorPage(message: string, status = 400) {
  return new NextResponse(
    `<!doctype html><html><head><title>HomeRates OAuth</title></head><body style="font-family:sans-serif;max-width:32rem;margin:4rem auto;color:#1a1a1a">` +
      `<h1 style="font-size:1.1rem">Authorization request cannot be completed</h1>` +
      `<p>${message}</p></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

export function redirectWithError(redirectUri: string, error: string, description: string, state: string | null) {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state !== null) url.searchParams.set('state', state);
  return NextResponse.redirect(url.toString(), 302);
}

// Validates everything EXCEPT admin auth -- shared by the route's GET
// (render consent) and POST (process allow/cancel), since a forged direct
// POST must be re-validated in full, never trusting resubmitted hidden
// fields on faith. Returns either a validated request, or a Response to
// send immediately (a local error page if client/redirect_uri themselves
// are untrustworthy, or a redirect-with-error once they're confirmed but
// something else is wrong).
export async function validate(params: URLSearchParams): Promise<ValidateResult> {
  const clientId = params.get('client_id');
  const redirectUriParam = params.get('redirect_uri');
  const state = params.get('state');

  if (!clientId || !redirectUriParam) {
    return { ok: false, response: localErrorPage('Missing client_id or redirect_uri.') };
  }

  const client = await lookupOAuthClient(clientId);
  if (!client) {
    return { ok: false, response: localErrorPage('Unknown OAuth client.') };
  }
  if (!validateRedirectUri(client, redirectUriParam)) {
    return { ok: false, response: localErrorPage('redirect_uri does not match the registered value for this client.') };
  }

  // client_id + redirect_uri are now a confirmed, registered pair --
  // every error below this point is reported via redirect, per spec.
  const responseType = params.get('response_type');
  if (responseType !== 'code') {
    return { ok: false, response: redirectWithError(redirectUriParam, 'unsupported_response_type', 'Only response_type=code is supported.', state) };
  }

  const scope = validateScope(params.get('scope'));
  if (scope === null) {
    return { ok: false, response: redirectWithError(redirectUriParam, 'invalid_scope', 'The requested scope is not supported.', state) };
  }

  const resourceParam = params.get('resource');
  if (!resourceParam || !validateResource(resourceParam)) {
    return { ok: false, response: redirectWithError(redirectUriParam, 'invalid_target', 'The requested resource is not this authorization server\'s protected resource.', state) };
  }

  const codeChallenge = params.get('code_challenge');
  const codeChallengeMethod = params.get('code_challenge_method');
  if (!codeChallenge || codeChallengeMethod !== 'S256') {
    return { ok: false, response: redirectWithError(redirectUriParam, 'invalid_request', 'PKCE code_challenge with method S256 is required.', state) };
  }

  return {
    ok: true,
    value: { client, redirectUri: redirectUriParam, scope, resource: resourceParam, codeChallenge, codeChallengeMethod, state },
  };
}

export function consentPage(v: ValidatedAuthorizeRequest) {
  const hidden = (name: string, value: string) => `<input type="hidden" name="${name}" value="${value.replace(/"/g, '&quot;')}">`;
  const fields =
    hidden('client_id', v.client.clientId) +
    hidden('redirect_uri', v.redirectUri) +
    hidden('scope', v.scope) +
    hidden('resource', v.resource) +
    hidden('code_challenge', v.codeChallenge) +
    hidden('code_challenge_method', v.codeChallengeMethod) +
    (v.state !== null ? hidden('state', v.state) : '');

  return new NextResponse(
    `<!doctype html><html><head><title>HomeRates.ai</title></head>` +
      `<body style="font-family:sans-serif;max-width:28rem;margin:4rem auto;color:#1a1a1a">` +
      `<h1 style="font-size:1.25rem">HomeRates.ai</h1>` +
      `<p>Allow ChatGPT to access HomeRates Property Intelligence?</p>` +
      `<p style="color:#555">Requested access: <code>${v.scope}</code></p>` +
      `<form method="POST" style="display:flex;gap:0.75rem">` +
      fields +
      `<button type="submit" name="action" value="allow" style="padding:0.5rem 1rem">Allow</button>` +
      `<button type="submit" name="action" value="cancel" style="padding:0.5rem 1rem">Cancel</button>` +
      `</form></body></html>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
