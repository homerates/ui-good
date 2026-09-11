// lib/gateway/buyerCapacityIntelligenceGateway.ts
//
// Invocable Tool Workstream (2026-09-11). A fifth Gateway capability,
// following the IDENTICAL required order of operations as the other four
// (kill-switch -> auth -> scope -> rate-limit -> request validation ->
// build -> schema validation -> log).
//
// SCOPE -- accepts EITHER the existing property_intelligence:read scope
// (zero re-onboarding) or the narrower buyer_capacity_intelligence:read
// scope, same additive pattern as the other three narrower scopes.
//
// No external call to Grok or any live provider -- same I/O profile as
// homerates_scenario_intelligence (one benchmark-rate read, resolved once
// and reused across every internal search call, plus loan-limit ZIP
// resolution only on each band's final call).

import { authenticateRequest, requireAnyScope } from './auth';
import { isCircuitOpen, isKillSwitchEnabled } from './circuitBreaker';
import { checkAllLimits } from './rateLimit';
import { logRequest, type GatewayLogErrorCode, type GatewayLogOutcome } from './requestLog';
import { getBuyerCapacityIntelligence, type BuyerCapacityQuery } from '../pricing/buyerCapacityIntelligence';
import type { ScenarioProgram } from '../pricing/scenarioIntelligence';
import { shapeBuyerCapacityIntelligenceForExternalContract } from './buyerCapacityIntelligenceShaping';
import { BuyerCapacityIntelligenceV1Schema, type BuyerCapacityIntelligenceV1 } from './buyerCapacityIntelligenceSchema';
import { performance } from 'perf_hooks';

export type BuyerCapacityIntelligenceGatewayResult =
  | { ok: true; data: BuyerCapacityIntelligenceV1 }
  | {
      ok: false;
      error: 'SERVICE_DISABLED' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'RATE_LIMITED' | 'INVALID_REQUEST' | 'INTERNAL_ERROR';
      message: string;
    };

export const BUYER_CAPACITY_INTELLIGENCE_SCOPES = ['property_intelligence:read', 'buyer_capacity_intelligence:read'] as const;

const SERVICE_DISABLED_MESSAGE = 'The Gateway is temporarily unavailable.';
const RATE_LIMITED_MESSAGE = 'Rate limit or quota exceeded.';

export interface BuyerCapacityRequestArgs {
  annual_income?: unknown;
  program?: unknown;
  monthly_debts?: unknown;
  down_payment_pct?: unknown;
  available_cash?: unknown;
  rate_pct?: unknown;
  term_years?: unknown;
  zip?: unknown;
  county?: unknown;
  state?: unknown;
  property_tax_rate_pct?: unknown;
  insurance_annual?: unknown;
  credit_score?: unknown;
  funding_fee_exempt?: unknown;
}

const VALID_PROGRAMS = new Set(['conventional', 'fha', 'va', 'jumbo']);

function positiveNumber(v: unknown, field: string, opts: { max?: number; allowZero?: boolean } = {}): { ok: true; value: number | undefined } | { ok: false; message: string } {
  if (v === undefined) return { ok: true, value: undefined };
  const n = Number(v);
  if (!Number.isFinite(n) || (opts.allowZero ? n < 0 : n <= 0) || (opts.max != null && n > opts.max)) {
    return { ok: false, message: `${field} must be a ${opts.allowZero ? 'non-negative' : 'positive'} number${opts.max != null ? ` no greater than ${opts.max}` : ''}.` };
  }
  return { ok: true, value: n };
}

function validateArgs(args: BuyerCapacityRequestArgs): { ok: true; query: BuyerCapacityQuery } | { ok: false; message: string } {
  if (args.annual_income === undefined) return { ok: false, message: 'annual_income is required.' };
  const annualIncome = Number(args.annual_income);
  if (!Number.isFinite(annualIncome) || annualIncome <= 0 || annualIncome > 100_000_000) return { ok: false, message: 'annual_income must be a positive number no greater than 100,000,000.' };

  if (args.program === undefined || typeof args.program !== 'string' || !VALID_PROGRAMS.has(args.program)) {
    return { ok: false, message: 'program is required and must be one of "conventional", "fha", "va", "jumbo".' };
  }
  const program = args.program as ScenarioProgram;

  const checks: Array<[unknown, string, { max?: number; allowZero?: boolean }]> = [
    [args.monthly_debts, 'monthly_debts', { max: 1_000_000, allowZero: true }],
    [args.down_payment_pct, 'down_payment_pct', { max: 100, allowZero: true }],
    [args.available_cash, 'available_cash', { max: 100_000_000, allowZero: true }],
    [args.rate_pct, 'rate_pct', { max: 25 }],
    [args.term_years, 'term_years', { max: 50 }],
    [args.property_tax_rate_pct, 'property_tax_rate_pct', { max: 10, allowZero: true }],
    [args.insurance_annual, 'insurance_annual', { max: 200000, allowZero: true }],
    [args.credit_score, 'credit_score', { max: 850 }],
  ];
  const parsed: Record<string, number | undefined> = {};
  for (const [v, field, opts] of checks) {
    const r = positiveNumber(v, field, opts);
    if (!r.ok) return r;
    parsed[field] = r.value;
  }

  if (program !== 'fha' && args.credit_score !== undefined) return { ok: false, message: 'credit_score is only applicable to the fha program.' };
  if (program !== 'va' && args.funding_fee_exempt !== undefined) return { ok: false, message: 'funding_fee_exempt is only applicable to the va program.' };
  if (args.funding_fee_exempt !== undefined && typeof args.funding_fee_exempt !== 'boolean') return { ok: false, message: 'funding_fee_exempt must be a boolean.' };

  const zip = typeof args.zip === 'string' && args.zip.trim().length > 0 ? args.zip.trim() : undefined;
  if (zip !== undefined && !/^\d{5}$/.test(zip)) return { ok: false, message: 'zip must be exactly 5 digits.' };
  const county = typeof args.county === 'string' && args.county.trim().length > 0 ? args.county.trim() : undefined;
  const state = typeof args.state === 'string' && args.state.trim().length > 0 ? args.state.trim() : undefined;
  if (state !== undefined && !/^[A-Za-z]{2}$/.test(state)) return { ok: false, message: 'state must be a 2-letter code, e.g. "CA".' };
  if ((county !== undefined) !== (state !== undefined)) return { ok: false, message: 'county and state must be provided together.' };

  return {
    ok: true,
    query: {
      annualIncome,
      program,
      monthlyDebts: parsed.monthly_debts,
      downPaymentPct: parsed.down_payment_pct,
      availableCash: parsed.available_cash,
      ratePct: parsed.rate_pct,
      termYears: parsed.term_years,
      zip, county, state,
      propertyTaxRatePct: parsed.property_tax_rate_pct,
      insuranceAnnual: parsed.insurance_annual,
      creditScore: parsed.credit_score,
      fundingFeeExempt: typeof args.funding_fee_exempt === 'boolean' ? args.funding_fee_exempt : undefined,
    },
  };
}

export async function getBuyerCapacityIntelligenceGated(
  args: BuyerCapacityRequestArgs,
  apiKeyHeader: string | null,
  requestIp: string,
): Promise<BuyerCapacityIntelligenceGatewayResult> {
  const startedAt = performance.now();

  async function finish(
    result: BuyerCapacityIntelligenceGatewayResult,
    partnerId: string | null,
    credentialId: string | null,
  ): Promise<BuyerCapacityIntelligenceGatewayResult> {
    const latencyMs = Math.round(performance.now() - startedAt);
    const outcome: GatewayLogOutcome = result.ok ? 'AVAILABLE' : 'ERROR';
    const errorCode: GatewayLogErrorCode | null = result.ok ? null : result.error;
    await logRequest({ partnerId, credentialId, outcome, errorCode, latencyMs });
    return result;
  }

  const [circuitOpen, killSwitchOn] = await Promise.all([isCircuitOpen(), isKillSwitchEnabled()]);
  if (circuitOpen || killSwitchOn) {
    return finish({ ok: false, error: 'SERVICE_DISABLED', message: SERVICE_DISABLED_MESSAGE }, null, null);
  }

  const auth = await authenticateRequest(apiKeyHeader);
  if (!auth.ok) return finish(auth, null, null);

  const scopeError = requireAnyScope(auth.context, [...BUYER_CAPACITY_INTELLIGENCE_SCOPES]);
  if (scopeError) return finish(scopeError, auth.context.partnerId, auth.context.credentialId);

  const limits = await checkAllLimits(auth.context, requestIp);
  if (!limits.allowed) {
    return finish(
      { ok: false, error: 'RATE_LIMITED', message: RATE_LIMITED_MESSAGE },
      auth.context.partnerId,
      auth.context.credentialId,
    );
  }

  const validated = validateArgs(args);
  if (!validated.ok) {
    return finish(
      { ok: false, error: 'INVALID_REQUEST', message: validated.message },
      auth.context.partnerId,
      auth.context.credentialId,
    );
  }

  try {
    const raw = await getBuyerCapacityIntelligence(validated.query);
    const shaped = shapeBuyerCapacityIntelligenceForExternalContract(raw);
    const parsed = BuyerCapacityIntelligenceV1Schema.safeParse(shaped);

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
