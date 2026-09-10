// lib/gateway/benchmarkRatesGateway.ts
//
// North Star Workstream 10 -- Intelligence Gateway Capability Architecture.
// A second Gateway capability, address-independent, following the IDENTICAL
// required order of operations as lib/gateway/intelligenceGateway.ts's
// getPropertyIntelligence() (kill-switch -> auth -> scope -> rate-limit ->
// build -> schema validation -> log), minus the address-validation/corpus-
// lookup steps this capability has no use for. Nothing about the existing
// property-intelligence pipeline is touched by this file.
//
// SCOPE -- accepts EITHER the existing property_intelligence:read scope (so
// the live OAuth/ChatGPT integration works immediately, with zero OAuth
// changes -- lib/gateway/oauth.ts's SUPPORTED_OAUTH_SCOPE is deliberately
// left unchanged, since OAuth/security-model changes are out of scope for
// this workstream) or the narrower benchmark_rates:read scope. See
// lib/gateway/auth.ts's requireAnyScope() for the full reasoning.
//
// RATE LIMIT -- shares the same credential/partner/IP quota dimensions as
// property intelligence (lib/gateway/rateLimit.ts's checkAllLimits(), keyed
// by CallerContext + IP, not by capability) -- a deliberate, conservative
// default: one shared budget per credential across both capabilities, not a
// separate pool. No new limits config needed.

import { authenticateRequest, requireAnyScope } from './auth';
import { isCircuitOpen, isKillSwitchEnabled } from './circuitBreaker';
import { checkAllLimits } from './rateLimit';
import { logRequest, type GatewayLogErrorCode, type GatewayLogOutcome } from './requestLog';
import { getBenchmarkRates } from '../market-data/benchmarkRates';
import { shapeBenchmarkRatesForExternalContract } from './benchmarkRatesShaping';
import { BenchmarkRatesV1Schema, type BenchmarkRatesV1 } from './benchmarkRatesSchema';
import { performance } from 'perf_hooks';

export type BenchmarkRatesGatewayResult =
  | { ok: true; data: BenchmarkRatesV1 }
  | {
      ok: false;
      error: 'SERVICE_DISABLED' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'RATE_LIMITED' | 'INTERNAL_ERROR';
      message: string;
    };

export const BENCHMARK_RATES_SCOPES = ['property_intelligence:read', 'benchmark_rates:read'] as const;

const SERVICE_DISABLED_MESSAGE = 'The Gateway is temporarily unavailable.';
const RATE_LIMITED_MESSAGE = 'Rate limit or quota exceeded.';
const FORBIDDEN_MESSAGE = 'This credential is not authorized for this operation.';

export async function getBenchmarkRatesGated(
  apiKeyHeader: string | null,
  requestIp: string,
): Promise<BenchmarkRatesGatewayResult> {
  const startedAt = performance.now();

  async function finish(
    result: BenchmarkRatesGatewayResult,
    partnerId: string | null,
    credentialId: string | null,
  ): Promise<BenchmarkRatesGatewayResult> {
    const latencyMs = Math.round(performance.now() - startedAt);
    const outcome: GatewayLogOutcome = result.ok ? 'AVAILABLE' : 'ERROR';
    const errorCode: GatewayLogErrorCode | null = result.ok ? null : result.error;
    await logRequest({ partnerId, credentialId, outcome, errorCode, latencyMs });
    return result;
  }

  // 1. Kill-switch / circuit-state -- identical first check, same shared
  // controls as property intelligence (one global kill switch/breaker for
  // the whole Gateway, not per-capability).
  const [circuitOpen, killSwitchOn] = await Promise.all([isCircuitOpen(), isKillSwitchEnabled()]);
  if (circuitOpen || killSwitchOn) {
    return finish({ ok: false, error: 'SERVICE_DISABLED', message: SERVICE_DISABLED_MESSAGE }, null, null);
  }

  // 2/3. Authentication, then scope authorization.
  const auth = await authenticateRequest(apiKeyHeader);
  if (!auth.ok) return finish(auth, null, null);

  const scopeError = requireAnyScope(auth.context, [...BENCHMARK_RATES_SCOPES]);
  if (scopeError) return finish(scopeError, auth.context.partnerId, auth.context.credentialId);

  // 4. Rate limit / quota.
  const limits = await checkAllLimits(auth.context, requestIp);
  if (!limits.allowed) {
    return finish(
      { ok: false, error: 'RATE_LIMITED', message: RATE_LIMITED_MESSAGE },
      auth.context.partnerId,
      auth.context.credentialId,
    );
  }

  // 5. Build result -- no address, no corpus lookup, pure DB read.
  try {
    const raw = await getBenchmarkRates();
    const shaped = shapeBenchmarkRatesForExternalContract(raw);
    const parsed = BenchmarkRatesV1Schema.safeParse(shaped);

    if (!parsed.success) {
      // Fail closed -- same posture as intelligenceGateway.ts: never return
      // an unvalidated object.
      return finish(
        { ok: false, error: 'INTERNAL_ERROR', message: 'Response failed contract validation.' },
        auth.context.partnerId,
        auth.context.credentialId,
      );
    }
    return finish({ ok: true, data: parsed.data }, auth.context.partnerId, auth.context.credentialId);
  } catch {
    return finish(
      { ok: false, error: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      auth.context.partnerId,
      auth.context.credentialId,
    );
  }
}
