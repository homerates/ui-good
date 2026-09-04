// lib/gateway/intelligenceGateway.ts
//
// Phase A + B + C + D, per docs/HOMERATES_INTELLIGENCE_GATEWAY_V1_IMPLEMENTATION_PLAN.md.
// NO LOGGING (Phase E), NO ENDPOINT -- this file is not wired to any app/api
// route. Nothing in this file is reachable over the network today.
//
// Required order of operations (LOCKED, architecture doc + Phase D spec):
//   1. kill-switch / circuit-state check
//   2. authentication
//   3. scope authorization
//   4. rate-limit / quota checks
//   5. address validation
//   6. property lookup
//   7. corpus-only intelligence
//   8. output shaping
//   9. schema validation
// No property work happens if any control/auth/limit step rejects the
// request -- an unauthenticated, unauthorized, rate-limited, or globally-
// disabled caller never causes a single row of property data to be read.
//
// The public function takes raw trusted transport inputs only -- request,
// apiKeyHeader, requestIp -- never a pre-built CallerContext. There is
// deliberately no second "already-authenticated" or "already-limited" entry
// point a future adapter could call to skip these checks. requestIp is
// trusted Gateway transport metadata (see rateLimit.ts's own note); a future
// adapter/transport layer must derive it from verified connection metadata,
// never from client-supplied request JSON.

import { getSupabase } from '../supabaseServer';
import { getPropertyIntelligenceCorpusOnly } from './corpusOnlyIntelligence';
import { shapeForExternalContract } from './outputShaping';
import { ExternalPropertyIntelligenceV1Schema, type ExternalPropertyIntelligenceV1 } from './outputSchema';
import { authenticateRequest, requireScope } from './auth';
import { isCircuitOpen, isKillSwitchEnabled } from './circuitBreaker';
import { checkAllLimits } from './rateLimit';

export type GatewayResult =
  | { ok: true; data: ExternalPropertyIntelligenceV1 }
  | {
      ok: false;
      error: 'SERVICE_DISABLED' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'RATE_LIMITED' | 'INVALID_REQUEST' | 'INTERNAL_ERROR';
      message: string;
    };

const MAX_ADDRESS_LENGTH = 300;

async function resolvePropertyId(address: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const normalized = address.trim().toLowerCase();
  // Case-insensitive match against address_full -- fetched and compared in
  // JS rather than trusting a case-sensitive .eq() filter, matching the same
  // established pattern used elsewhere in this corpus for exactly this
  // reason (address_full casing is genuinely inconsistent across write
  // paths -- see codebase_invariants memory).
  const { data } = await sb.from('properties').select('id, address_full');
  if (!data) return null;
  const match = data.find((p) => p.address_full.trim().toLowerCase() === normalized);
  return match?.id ?? null;
}

const SERVICE_DISABLED_MESSAGE = 'The Gateway is temporarily unavailable.';
const RATE_LIMITED_MESSAGE = 'Rate limit or quota exceeded.';

export async function getPropertyIntelligence(
  request: { address: string },
  apiKeyHeader: string | null,
  requestIp: string,
): Promise<GatewayResult> {
  // 1. Kill-switch / circuit-state -- cheapest possible check, first, before
  // even attempting authentication. A tripped breaker or an active kill
  // switch rejects every request with zero further work, regardless of how
  // valid the credential would otherwise be.
  const [circuitOpen, killSwitchOn] = await Promise.all([isCircuitOpen(), isKillSwitchEnabled()]);
  if (circuitOpen || killSwitchOn) {
    return { ok: false, error: 'SERVICE_DISABLED', message: SERVICE_DISABLED_MESSAGE };
  }

  // 2/3. Authentication, then scope authorization -- before request
  // validation, so an invalid/unauthorized caller never learns whether their
  // address input was even well-formed, and never causes a single Supabase
  // read beyond the credential lookup itself.
  const auth = await authenticateRequest(apiKeyHeader);
  if (!auth.ok) return auth;

  const scopeError = requireScope(auth.context, 'property_intelligence:read');
  if (scopeError) return scopeError;

  // 4. Rate limit / quota -- only evaluated once identity is established,
  // since every dimension is keyed by credential/partner/IP.
  const limits = await checkAllLimits(auth.context, requestIp);
  if (!limits.allowed) {
    return { ok: false, error: 'RATE_LIMITED', message: RATE_LIMITED_MESSAGE };
  }

  // 5. Address validation.
  const address = request.address?.trim();
  if (!address || address.length === 0 || address.length > MAX_ADDRESS_LENGTH) {
    return { ok: false, error: 'INVALID_REQUEST', message: 'address is required and must be 1-300 characters.' };
  }

  try {
    const propertyId = await resolvePropertyId(address);
    const raw = propertyId ? await getPropertyIntelligenceCorpusOnly(propertyId) : null;
    const shaped = shapeForExternalContract(address, raw);
    const parsed = ExternalPropertyIntelligenceV1Schema.safeParse(shaped);

    if (!parsed.success) {
      // Fail closed -- never return an unvalidated object, per the LOCKED
      // architecture decision (section 15). Full zod error detail stays in
      // the internal error, never in what a caller would receive.
      return { ok: false, error: 'INTERNAL_ERROR', message: 'Response failed contract validation.' };
    }
    return { ok: true, data: parsed.data };
  } catch {
    return { ok: false, error: 'INTERNAL_ERROR', message: 'An internal error occurred.' };
  }
}
