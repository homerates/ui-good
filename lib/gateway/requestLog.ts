// lib/gateway/requestLog.ts
//
// Phase E1: best-effort, privacy-safe operational request logging.
//
// DELIBERATELY NOT FAIL-CLOSED -- the one place in lib/gateway/ that departs
// from the fail-closed posture used everywhere else (auth.ts, rateLimit.ts,
// circuitBreaker.ts). Those exist to make a real security/cost decision;
// this exists only to observe a decision already made. A failed log insert
// must never change what the Gateway returns to a caller, must never throw
// out of logRequest(), and must never itself attempt to log its own
// failure (no recursive logging). Logging must observe the Gateway.
// Logging must not redesign it.
//
// PRIVACY -- only ever writes the six columns defined in migration 084:
// partner_id, credential_id (both nullable -- see below), outcome,
// error_code, latency_ms, and an implicit created_at. Never accepts or
// derives a raw address, a raw or hashed API key, a raw IP, or any
// Property Intelligence / Track5 / methodology field -- there is no
// parameter on logRequest() through which any of those could even be
// passed.
//
// IDENTITY IS SOMETIMES ABSENT, ON PURPOSE -- SERVICE_DISABLED and
// UNAUTHORIZED rejections happen before a CallerContext is constructed
// (see auth.ts). logRequest() never authenticates or looks anything up to
// backfill partner_id/credential_id for those rows -- security/control
// precedence always wins over log richness (Phase E1 spec section 9).

import { getSupabase } from '../supabaseServer';

export type GatewayLogOutcome = 'AVAILABLE' | 'PARTIAL' | 'NOT_AVAILABLE' | 'ERROR';

export type GatewayLogErrorCode =
  | 'SERVICE_DISABLED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'INVALID_REQUEST'
  | 'INTERNAL_ERROR';

export interface GatewayLogEntry {
  partnerId: string | null;
  credentialId: string | null;
  outcome: GatewayLogOutcome;
  errorCode: GatewayLogErrorCode | null;
  latencyMs: number;
}

// Fire-and-forget from the caller's perspective, but internally awaited by
// intelligenceGateway.ts so the process doesn't exit mid-write in a
// short-lived serverless invocation -- awaiting a promise that always
// resolves (never rejects) does not reintroduce fail-closed behavior.
export async function logRequest(entry: GatewayLogEntry): Promise<void> {
  try {
    const sb = getSupabase();
    if (!sb) return; // no store reachable -- silently skip, never block the caller

    await sb.from('gateway_request_log').insert({
      partner_id: entry.partnerId,
      credential_id: entry.credentialId,
      outcome: entry.outcome,
      error_code: entry.errorCode,
      latency_ms: entry.latencyMs,
    });
    // Insert error intentionally not inspected/thrown -- a failed write is
    // exactly the case this function exists to absorb silently.
  } catch {
    // Never throw, never log-the-logging-failure. See file header.
  }
}
