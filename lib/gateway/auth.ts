// lib/gateway/auth.ts
//
// The Gateway's authentication + authorization layer. Owns the CallerContext
// type and is the ONLY place a valid CallerContext can be produced -- see the
// branding note below. Everything downstream (the corpus-only intelligence
// path) receives an already-trusted CallerContext; nothing downstream ever
// re-derives or re-validates identity.
//
// Separation, deliberate: verifyCredential() (lib/gateway/credentials.ts)
// answers "is this credential itself real, active, and unexpired" -- an
// identity/UNAUTHORIZED question. This file answers "is the account behind it
// currently allowed to do anything, and is it allowed to do THIS" -- an
// authorization/FORBIDDEN question, covering both partner-active status and
// scope. A credential that is cryptographically perfectly valid but belongs
// to a suspended partner is FORBIDDEN, not UNAUTHORIZED -- identity was
// proven, permission was not granted.

import { verifyCredential } from './credentials';
import { getSupabase } from '../supabaseServer';

// A CallerContext must never be constructable outside this file. The branded
// symbol below is not exported, so no other module can produce a value that
// structurally satisfies the CallerContext type -- a future adapter handed
// raw {credentialId, partnerId, scopes} from untrusted input cannot pass it
// off as a real CallerContext; TypeScript will reject the object literal for
// missing the (inaccessible) brand property. This is a compile-time
// guarantee, not a convention enforced by code review alone.
const CALLER_CONTEXT_BRAND: unique symbol = Symbol('CallerContext');

export interface CallerContext {
  readonly [CALLER_CONTEXT_BRAND]: true;
  readonly credentialId: string;
  readonly partnerId: string;
  readonly scopes: string[];
}

export type GatewayAuthError =
  | { ok: false; error: 'UNAUTHORIZED'; message: string }
  | { ok: false; error: 'FORBIDDEN'; message: string };

export type GatewayAuthResult = { ok: true; context: CallerContext } | GatewayAuthError;

// Generic, fixed messages only -- never leak *why* a credential failed
// (unknown prefix vs. wrong secret vs. expired vs. revoked all look identical
// externally), per architecture doc section 16.
const UNAUTHORIZED_MESSAGE = 'Invalid or missing credential.';
const FORBIDDEN_MESSAGE = 'This credential is not authorized for this operation.';

export async function authenticateRequest(apiKeyHeader: string | null): Promise<GatewayAuthResult> {
  if (!apiKeyHeader) return { ok: false, error: 'UNAUTHORIZED', message: UNAUTHORIZED_MESSAGE };

  const verified = await verifyCredential(apiKeyHeader);
  if (!verified) return { ok: false, error: 'UNAUTHORIZED', message: UNAUTHORIZED_MESSAGE };

  const sb = getSupabase();
  const { data: partner } = sb
    ? await sb.from('gateway_partners').select('status').eq('id', verified.partnerId).maybeSingle()
    : { data: null };
  if (!partner || partner.status !== 'active') {
    return { ok: false, error: 'FORBIDDEN', message: FORBIDDEN_MESSAGE };
  }

  const context = {
    credentialId: verified.credentialId,
    partnerId: verified.partnerId,
    scopes: verified.scopes,
    [CALLER_CONTEXT_BRAND]: true,
  } as CallerContext;

  return { ok: true, context };
}

export function requireScope(context: CallerContext, scope: string): GatewayAuthError | null {
  if (!context.scopes.includes(scope)) {
    return { ok: false, error: 'FORBIDDEN', message: FORBIDDEN_MESSAGE };
  }
  return null;
}
