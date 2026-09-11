// lib/gateway/scenarioIntelligenceGateway.ts
//
// Invocable Tool Workstream (2026-09-11). A fourth Gateway capability,
// following the IDENTICAL required order of operations as the other three
// (kill-switch -> auth -> scope -> rate-limit -> request validation ->
// build -> schema validation -> log). Nothing about any existing pipeline
// is touched by this file.
//
// SCOPE -- accepts EITHER the existing property_intelligence:read scope
// (zero re-onboarding for the live OAuth/ChatGPT integration) or the
// narrower scenario_intelligence:read scope, same additive pattern as the
// other two narrower scopes.
//
// No external call to Grok or any live provider -- the only I/O this
// capability performs is a Supabase read (already-synced FRED rates via
// getBenchmarkRates(), already-synced loan-limit tables via
// getLoanLimitIntelligence()'s ZIP resolution) -- fully synchronous,
// deterministic math otherwise.

import { authenticateRequest, requireAnyScope } from './auth';
import { isCircuitOpen, isKillSwitchEnabled } from './circuitBreaker';
import { checkAllLimits } from './rateLimit';
import { logRequest, type GatewayLogErrorCode, type GatewayLogOutcome } from './requestLog';
import { getScenarioIntelligence, type ScenarioProgram, type ScenarioQuery } from '../pricing/scenarioIntelligence';
import { shapeScenarioIntelligenceForExternalContract } from './scenarioIntelligenceShaping';
import { ScenarioIntelligenceV1Schema, type ScenarioIntelligenceV1 } from './scenarioIntelligenceSchema';
import { performance } from 'perf_hooks';

export type ScenarioIntelligenceGatewayResult =
  | { ok: true; data: ScenarioIntelligenceV1 }
  | {
      ok: false;
      error: 'SERVICE_DISABLED' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'RATE_LIMITED' | 'INVALID_REQUEST' | 'INTERNAL_ERROR';
      message: string;
    };

export const SCENARIO_INTELLIGENCE_SCOPES = ['property_intelligence:read', 'scenario_intelligence:read'] as const;

const SERVICE_DISABLED_MESSAGE = 'The Gateway is temporarily unavailable.';
const RATE_LIMITED_MESSAGE = 'Rate limit or quota exceeded.';

export interface ScenarioRequestArgs {
  price?: unknown;
  program?: unknown;
  down_payment_pct?: unknown;
  down_payment_amount?: unknown;
  term_years?: unknown;
  rate_pct?: unknown;
  hoa_monthly?: unknown;
  zip?: unknown;
  county?: unknown;
  state?: unknown;
  property_tax_rate_pct?: unknown;
  insurance_annual?: unknown;
  credit_score?: unknown;
  buydown_points?: unknown;
  funding_fee_exempt?: unknown;
  annual_income?: unknown;
  monthly_debts?: unknown;
}

const VALID_PROGRAMS = new Set(['conventional', 'fha', 'va', 'jumbo']);

function positiveNumber(v: unknown, field: string, opts: { max?: number; allowZero?: boolean } = {}): { ok: true; value: number | undefined } | { ok: false; message: string } {
  if (v === undefined) return { ok: true, value: undefined };
  const n = Number(v);
  const floor = opts.allowZero ? 0 : 0;
  if (!Number.isFinite(n) || (opts.allowZero ? n < 0 : n <= 0) || (opts.max != null && n > opts.max)) {
    return { ok: false, message: `${field} must be a ${opts.allowZero ? 'non-negative' : 'positive'} number${opts.max != null ? ` no greater than ${opts.max}` : ''}.` };
  }
  return { ok: true, value: n };
}

function validateArgs(args: ScenarioRequestArgs): { ok: true; query: ScenarioQuery } | { ok: false; message: string } {
  if (args.price === undefined) return { ok: false, message: 'price is required.' };
  const price = Number(args.price);
  if (!Number.isFinite(price) || price <= 0 || price > 100_000_000) return { ok: false, message: 'price must be a positive number no greater than 100,000,000.' };

  if (args.program === undefined || typeof args.program !== 'string' || !VALID_PROGRAMS.has(args.program)) {
    return { ok: false, message: 'program is required and must be one of "conventional", "fha", "va", "jumbo".' };
  }
  const program = args.program as ScenarioProgram;

  if (args.down_payment_pct !== undefined && args.down_payment_amount !== undefined) {
    return { ok: false, message: 'Provide down_payment_pct OR down_payment_amount, not both.' };
  }

  const checks: Array<[unknown, string, { max?: number; allowZero?: boolean }]> = [
    [args.down_payment_pct, 'down_payment_pct', { max: 100, allowZero: true }],
    [args.down_payment_amount, 'down_payment_amount', { max: price, allowZero: true }],
    [args.term_years, 'term_years', { max: 50 }],
    [args.rate_pct, 'rate_pct', { max: 25 }],
    [args.hoa_monthly, 'hoa_monthly', { max: 20000, allowZero: true }],
    [args.property_tax_rate_pct, 'property_tax_rate_pct', { max: 10, allowZero: true }],
    [args.insurance_annual, 'insurance_annual', { max: 200000, allowZero: true }],
    [args.credit_score, 'credit_score', { max: 850 }],
    [args.buydown_points, 'buydown_points', { max: 10, allowZero: true }],
    [args.annual_income, 'annual_income', { max: 100_000_000, allowZero: true }],
    [args.monthly_debts, 'monthly_debts', { max: 1_000_000, allowZero: true }],
  ];
  const parsed: Record<string, number | undefined> = {};
  for (const [v, field, opts] of checks) {
    const r = positiveNumber(v, field, opts);
    if (!r.ok) return r;
    parsed[field] = r.value;
  }

  if (program !== 'fha' && args.credit_score !== undefined) return { ok: false, message: 'credit_score is only applicable to the fha program.' };
  if (program !== 'va' && (args.buydown_points !== undefined || args.funding_fee_exempt !== undefined)) {
    return { ok: false, message: 'buydown_points and funding_fee_exempt are only applicable to the va program.' };
  }

  const zip = typeof args.zip === 'string' && args.zip.trim().length > 0 ? args.zip.trim() : undefined;
  if (zip !== undefined && !/^\d{5}$/.test(zip)) return { ok: false, message: 'zip must be exactly 5 digits.' };
  const county = typeof args.county === 'string' && args.county.trim().length > 0 ? args.county.trim() : undefined;
  const state = typeof args.state === 'string' && args.state.trim().length > 0 ? args.state.trim() : undefined;
  if (state !== undefined && !/^[A-Za-z]{2}$/.test(state)) return { ok: false, message: 'state must be a 2-letter code, e.g. "CA".' };
  if ((county !== undefined) !== (state !== undefined)) return { ok: false, message: 'county and state must be provided together.' };

  if (args.funding_fee_exempt !== undefined && typeof args.funding_fee_exempt !== 'boolean') return { ok: false, message: 'funding_fee_exempt must be a boolean.' };

  return {
    ok: true,
    query: {
      price,
      program,
      downPaymentPct: parsed.down_payment_pct,
      downPaymentAmount: parsed.down_payment_amount,
      termYears: parsed.term_years,
      ratePct: parsed.rate_pct,
      hoaMonthly: parsed.hoa_monthly,
      zip, county, state,
      propertyTaxRatePct: parsed.property_tax_rate_pct,
      insuranceAnnual: parsed.insurance_annual,
      creditScore: parsed.credit_score,
      buydownPoints: parsed.buydown_points,
      fundingFeeExempt: typeof args.funding_fee_exempt === 'boolean' ? args.funding_fee_exempt : undefined,
      annualIncome: parsed.annual_income,
      monthlyDebts: parsed.monthly_debts,
    },
  };
}

export async function getScenarioIntelligenceGated(
  args: ScenarioRequestArgs,
  apiKeyHeader: string | null,
  requestIp: string,
): Promise<ScenarioIntelligenceGatewayResult> {
  const startedAt = performance.now();

  async function finish(
    result: ScenarioIntelligenceGatewayResult,
    partnerId: string | null,
    credentialId: string | null,
  ): Promise<ScenarioIntelligenceGatewayResult> {
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

  // 2/3. Authentication, then scope authorization.
  const auth = await authenticateRequest(apiKeyHeader);
  if (!auth.ok) return finish(auth, null, null);

  const scopeError = requireAnyScope(auth.context, [...SCENARIO_INTELLIGENCE_SCOPES]);
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

  // 6. Build result -- synchronous deterministic math + one Supabase read.
  try {
    const raw = await getScenarioIntelligence(validated.query);
    const shaped = shapeScenarioIntelligenceForExternalContract(raw);
    const parsed = ScenarioIntelligenceV1Schema.safeParse(shaped);

    if (!parsed.success) {
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
