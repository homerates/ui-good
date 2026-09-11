// lib/gateway/loanLimitGateway.ts
//
// Invocable Tool Workstream (2026-09-11). A third Gateway capability,
// following the IDENTICAL required order of operations as
// lib/gateway/intelligenceGateway.ts's getPropertyIntelligence() and
// lib/gateway/benchmarkRatesGateway.ts's getBenchmarkRatesGated()
// (kill-switch -> auth -> scope -> rate-limit -> request validation ->
// build -> schema validation -> log). Nothing about either existing
// pipeline is touched by this file.
//
// SCOPE -- accepts EITHER the existing property_intelligence:read scope (so
// the live OAuth/ChatGPT integration works immediately, zero OAuth changes)
// or the narrower loan_limit_intelligence:read scope, same pattern as
// BENCHMARK_RATES_SCOPES.
//
// RATE LIMIT -- shares the same credential/partner/IP quota dimensions as
// the other two capabilities (one shared budget per credential, not a
// separate pool per tool).

import { authenticateRequest, requireAnyScope } from './auth';
import { isCircuitOpen, isKillSwitchEnabled } from './circuitBreaker';
import { checkAllLimits } from './rateLimit';
import { logRequest, type GatewayLogErrorCode, type GatewayLogOutcome } from './requestLog';
import { getLoanLimitIntelligence, type Program, type Units } from '../pricing/loanLimitIntelligence';
import { shapeLoanLimitIntelligenceForExternalContract } from './loanLimitShaping';
import { LoanLimitIntelligenceV1Schema, type LoanLimitIntelligenceV1 } from './loanLimitSchema';
import { performance } from 'perf_hooks';

export type LoanLimitGatewayResult =
  | { ok: true; data: LoanLimitIntelligenceV1 }
  | {
      ok: false;
      error: 'SERVICE_DISABLED' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'RATE_LIMITED' | 'INVALID_REQUEST' | 'INTERNAL_ERROR';
      message: string;
    };

export const LOAN_LIMIT_SCOPES = ['property_intelligence:read', 'loan_limit_intelligence:read'] as const;

const SERVICE_DISABLED_MESSAGE = 'The Gateway is temporarily unavailable.';
const RATE_LIMITED_MESSAGE = 'Rate limit or quota exceeded.';

export interface LoanLimitRequestArgs {
  zip?: unknown;
  county?: unknown;
  state?: unknown;
  year?: unknown;
  units?: unknown;
  loan_amount?: unknown;
  program?: unknown;
}

const VALID_UNITS = new Set([1, 2, 3, 4]);
const VALID_PROGRAMS = new Set(['conventional', 'fha', 'both']);

// Request validation lives here (not in the route, not in the engine) --
// same placement as intelligenceGateway.ts's address check: the Gateway
// owns business-input validation, callers just pass raw args through.
function validateArgs(args: LoanLimitRequestArgs): { ok: true; query: { zip?: string; county?: string; state?: string; year?: number; units?: Units; loanAmount?: number; program?: Program } } | { ok: false; message: string } {
  const hasZip = typeof args.zip === 'string' && args.zip.trim().length > 0;
  const hasCountyState = typeof args.county === 'string' && args.county.trim().length > 0 && typeof args.state === 'string' && args.state.trim().length > 0;

  if (!hasZip && !hasCountyState) {
    return { ok: false, message: 'Provide either zip, or both county and state.' };
  }
  if (hasZip && !/^\d{5}$/.test((args.zip as string).trim())) {
    return { ok: false, message: 'zip must be exactly 5 digits.' };
  }
  if (typeof args.state === 'string' && args.state.trim().length > 0 && !/^[A-Za-z]{2}$/.test(args.state.trim())) {
    return { ok: false, message: 'state must be a 2-letter code, e.g. "CA".' };
  }

  let units: Units | undefined;
  if (args.units !== undefined) {
    const n = Number(args.units);
    if (!Number.isInteger(n) || !VALID_UNITS.has(n)) {
      return { ok: false, message: 'units must be an integer 1-4.' };
    }
    units = n as Units;
  }

  let year: number | undefined;
  if (args.year !== undefined) {
    const n = Number(args.year);
    if (!Number.isInteger(n) || n < 2000 || n > 2100) {
      return { ok: false, message: 'year must be a 4-digit integer between 2000 and 2100.' };
    }
    year = n;
  }

  let loanAmount: number | undefined;
  if (args.loan_amount !== undefined) {
    const n = Number(args.loan_amount);
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, message: 'loan_amount must be a positive number.' };
    }
    loanAmount = n;
  }

  let program: Program | undefined;
  if (args.program !== undefined) {
    if (typeof args.program !== 'string' || !VALID_PROGRAMS.has(args.program)) {
      return { ok: false, message: 'program must be one of "conventional", "fha", "both".' };
    }
    program = args.program as Program;
  }

  return {
    ok: true,
    query: {
      zip: hasZip ? (args.zip as string).trim() : undefined,
      county: typeof args.county === 'string' ? args.county.trim() : undefined,
      state: typeof args.state === 'string' ? args.state.trim() : undefined,
      year,
      units,
      loanAmount,
      program,
    },
  };
}

export async function getLoanLimitIntelligenceGated(
  args: LoanLimitRequestArgs,
  apiKeyHeader: string | null,
  requestIp: string,
): Promise<LoanLimitGatewayResult> {
  const startedAt = performance.now();

  async function finish(
    result: LoanLimitGatewayResult,
    partnerId: string | null,
    credentialId: string | null,
  ): Promise<LoanLimitGatewayResult> {
    const latencyMs = Math.round(performance.now() - startedAt);
    const outcome: GatewayLogOutcome = result.ok ? 'AVAILABLE' : 'ERROR';
    const errorCode: GatewayLogErrorCode | null = result.ok ? null : result.error;
    await logRequest({ partnerId, credentialId, outcome, errorCode, latencyMs });
    return result;
  }

  // 1. Kill-switch / circuit-state.
  const [circuitOpen, killSwitchOn] = await Promise.all([isCircuitOpen(), isKillSwitchEnabled()]);
  if (circuitOpen || killSwitchOn) {
    return finish({ ok: false, error: 'SERVICE_DISABLED', message: SERVICE_DISABLED_MESSAGE }, null, null);
  }

  // 2/3. Authentication, then scope authorization -- before request
  // validation, same ordering rationale as the other two capabilities: an
  // unauthorized caller never learns whether their input was well-formed.
  const auth = await authenticateRequest(apiKeyHeader);
  if (!auth.ok) return finish(auth, null, null);

  const scopeError = requireAnyScope(auth.context, [...LOAN_LIMIT_SCOPES]);
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

  // 5. Request validation.
  const validated = validateArgs(args);
  if (!validated.ok) {
    return finish(
      { ok: false, error: 'INVALID_REQUEST', message: validated.message },
      auth.context.partnerId,
      auth.context.credentialId,
    );
  }

  // 6. Build result -- pure lookup, no address/corpus/property involved.
  try {
    const raw = await getLoanLimitIntelligence(validated.query);
    const shaped = shapeLoanLimitIntelligenceForExternalContract(raw);
    const parsed = LoanLimitIntelligenceV1Schema.safeParse(shaped);

    if (!parsed.success) {
      // Fail closed -- same posture as the other two capabilities: never
      // return an unvalidated object.
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
