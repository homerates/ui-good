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
//
// PUBLIC AUTHORITY ACCESS (2026-09-11, explicit product decision): a
// credential is now OPTIONAL for this specific tool. Rationale, stated
// directly by Rayaan: these are neutral, national FRED reference rates --
// the same public-authority data anyone can already read for free from
// stlouisfed.org with no login -- with zero marginal per-call cost (a pure
// Supabase read of already-synced data, never a live/paid provider call,
// unlike homerates_property_intelligence's demand-driven resolution path,
// which genuinely can trigger a paid external lookup and therefore keeps
// its existing credential requirement unchanged). Gating a public national
// average behind an API key/OAuth flow was blocking real MCP clients
// (confirmed live: Grok's connector sends tools/call with no Authorization
// header and gives up on 401, never attempting any auth negotiation) from
// a tool that has no borrower/property specificity to protect in the first
// place. A caller that DOES present a credential still gets the exact
// original authenticated path below (scope-checked, credential+partner-
// scoped quota) -- this is a new anonymous path ADDED alongside the
// existing one, not a replacement; ChatGPT's OAuth-issued tokens and any
// admin-issued Gateway credential keep working exactly as before. An
// anonymous caller is rate-limited by IP only (checkAndIncrement() directly,
// the same underlying primitive and the same configured ipPerMinute value
// checkAllLimits() already uses for its IP dimension -- not a new number).

import { authenticateRequest, requireAnyScope } from './auth';
import { isCircuitOpen, isKillSwitchEnabled } from './circuitBreaker';
import { checkAllLimits, checkAndIncrement } from './rateLimit';
import { PILOT_LIMITS } from './limits';
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

  // 2/3. Authentication + scope -- OPTIONAL for this tool (see header).
  // A presented credential still goes through the exact original
  // authenticated path unchanged; no credential at all is anonymous, not
  // an error.
  let partnerId: string | null = null;
  let credentialId: string | null = null;

  if (apiKeyHeader != null) {
    const auth = await authenticateRequest(apiKeyHeader);
    if (!auth.ok) return finish(auth, null, null);

    const scopeError = requireAnyScope(auth.context, [...BENCHMARK_RATES_SCOPES]);
    if (scopeError) return finish(scopeError, auth.context.partnerId, auth.context.credentialId);

    // 4. Rate limit / quota -- authenticated caller, full credential+partner+IP quota.
    const limits = await checkAllLimits(auth.context, requestIp);
    if (!limits.allowed) {
      return finish(
        { ok: false, error: 'RATE_LIMITED', message: RATE_LIMITED_MESSAGE },
        auth.context.partnerId,
        auth.context.credentialId,
      );
    }
    partnerId = auth.context.partnerId;
    credentialId = auth.context.credentialId;
  } else {
    // 4. Rate limit / quota -- anonymous caller, IP dimension only (no
    // credential/partner identity exists to key a quota on).
    const anonLimit = await checkAndIncrement('ip', requestIp, 'minute', PILOT_LIMITS.ipPerMinute);
    if (!anonLimit.allowed) {
      return finish({ ok: false, error: 'RATE_LIMITED', message: RATE_LIMITED_MESSAGE }, null, null);
    }
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
        partnerId,
        credentialId,
      );
    }
    return finish({ ok: true, data: parsed.data }, partnerId, credentialId);
  } catch {
    return finish(
      { ok: false, error: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      partnerId,
      credentialId,
    );
  }
}
