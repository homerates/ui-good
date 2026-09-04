// lib/gateway/rateLimit.ts
//
// Rate-limit / quota enforcement via the atomic gateway_increment_counter()
// Postgres function (migration 083) -- never a client-side
// select-then-upsert. See that migration's own header for why: the existing
// lib/anonGate.ts pattern (SELECT current count, then a separate UPSERT of
// count+1) is a genuine, demonstrable race under concurrent requests, not a
// hypothetical one -- confirmed by inspecting that file directly during this
// design. checkAndIncrement() below delegates the entire read-and-increment
// to one atomic SQL statement inside the RPC; there is no window in this
// function's own code where two concurrent calls could observe and act on
// the same pre-increment value.
//
// FAIL CLOSED -- intentional inversion from lib/anonGate.ts's fail-open
// default. anonGate.ts protects a free consumer feature, where failing open
// on a DB hiccup is the right tradeoff (never block a real user over infra).
// This protects external cost/IP exposure (architecture doc section 22): any
// Supabase/RPC error here returns allowed:false, never allowed:true. An
// unreachable rate-limit store is a reason to deny, not a reason to assume
// the request is fine.

import { getSupabase } from '../supabaseServer';
import { utcWindowKey, type WindowType } from './windowKeys';
import { PILOT_LIMITS } from './limits';
import type { CallerContext } from './auth';

export type RateLimitScopeType = 'credential' | 'partner' | 'ip';

export async function checkAndIncrement(
  scopeType: RateLimitScopeType,
  scopeKey: string,
  windowType: WindowType,
  limit: number,
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const sb = getSupabase();
    if (!sb) return { allowed: false, remaining: 0 }; // fail closed -- no store reachable

    const windowKey = utcWindowKey(windowType);
    const { data, error } = await sb.rpc('gateway_increment_counter', {
      p_scope_type: scopeType,
      p_scope_key: scopeKey,
      p_window_type: windowType,
      p_window_key: windowKey,
    });

    if (error || typeof data !== 'number') return { allowed: false, remaining: 0 }; // fail closed

    const count = data;
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    return { allowed: false, remaining: 0 }; // fail closed
  }
}

interface RateLimitDimension {
  scopeType: RateLimitScopeType;
  scopeKey: string;
  windowType: WindowType;
  limit: number;
}

// Evaluates all 5 required dimensions (credential/minute, partner/minute,
// IP/minute, credential/day, credential/month) in that order, short-
// circuiting on the first blocking result. Every dimension checked BEFORE a
// block is still incremented, even if a later dimension ultimately blocks
// the request -- deliberate: a counter reflects "how many times a request
// with this identity was attempted," which is the quantity that actually
// matters for abuse prevention. Not incrementing an earlier-passed dimension
// when a later one blocks would let an attacker probe/exhaust an unrelated
// limit for free while never "spending" against the dimension they actually
// care about.
//
// requestIp is treated as trusted Gateway transport metadata, not user-
// declared request JSON -- there is still no external Gateway route in
// Phase D, so this is purely an internal service API today. A future
// adapter/transport layer must derive requestIp from trusted platform/
// request metadata (e.g. a verified connection-level source) and must never
// accept an arbitrary client-supplied IP field -- that parsing does not
// exist yet and is explicitly out of scope for this phase.
//
// Returns only allowed/not-allowed -- deliberately no dimension name, limit
// value, or counter key in the return type. Per architecture doc section 16,
// Contract V1 must never see raw quota strategy or internal counter detail;
// keeping that information out of this function's return type means there's
// nothing for a caller two layers up to accidentally leak.
export async function checkAllLimits(
  callerContext: CallerContext,
  requestIp: string,
): Promise<{ allowed: boolean }> {
  const dimensions: RateLimitDimension[] = [
    { scopeType: 'credential', scopeKey: callerContext.credentialId, windowType: 'minute', limit: PILOT_LIMITS.credentialPerMinute },
    { scopeType: 'partner', scopeKey: callerContext.partnerId, windowType: 'minute', limit: PILOT_LIMITS.partnerPerMinute },
    { scopeType: 'ip', scopeKey: requestIp, windowType: 'minute', limit: PILOT_LIMITS.ipPerMinute },
    { scopeType: 'credential', scopeKey: callerContext.credentialId, windowType: 'day', limit: PILOT_LIMITS.credentialPerDay },
    { scopeType: 'credential', scopeKey: callerContext.credentialId, windowType: 'month', limit: PILOT_LIMITS.credentialPerMonth },
  ];

  for (const d of dimensions) {
    const result = await checkAndIncrement(d.scopeType, d.scopeKey, d.windowType, d.limit);
    if (!result.allowed) return { allowed: false };
  }
  return { allowed: true };
}
