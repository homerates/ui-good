// lib/gateway/intelligenceGateway.ts
//
// Phase A + B + C, per docs/HOMERATES_INTELLIGENCE_GATEWAY_V1_IMPLEMENTATION_PLAN.md.
// NO RATE LIMIT / QUOTA / CIRCUIT BREAKER (Phase D), NO LOGGING (Phase E), NO
// ENDPOINT -- this file is not wired to any app/api route. Nothing in this
// file is reachable over the network today.
//
// Flow: authenticate (raw API-key header string in, trusted CallerContext out
// -- see lib/gateway/auth.ts's branding note for why this can't be forged) ->
// scope check -> normalize + resolve address -> properties.id -> the ONE
// sanctioned call into existing intelligence (getPropertyIntelligenceCorpusOnly)
// -> shape into Contract V1 -> validate -> return. Authentication happens
// BEFORE any property lookup -- an unauthenticated or unauthorized caller
// never causes a single row of property data to be read.
//
// The public function takes a raw apiKeyHeader string, never a pre-built
// CallerContext -- there is deliberately no second "already-authenticated"
// entry point a future adapter could call to skip authentication.

import { getSupabase } from '../supabaseServer';
import { getPropertyIntelligenceCorpusOnly } from './corpusOnlyIntelligence';
import { shapeForExternalContract } from './outputShaping';
import { ExternalPropertyIntelligenceV1Schema, type ExternalPropertyIntelligenceV1 } from './outputSchema';
import { authenticateRequest, requireScope } from './auth';

export type GatewayResult =
  | { ok: true; data: ExternalPropertyIntelligenceV1 }
  | { ok: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_REQUEST' | 'INTERNAL_ERROR'; message: string };

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

export async function getPropertyIntelligence(
  request: { address: string },
  apiKeyHeader: string | null,
): Promise<GatewayResult> {
  // Authentication and authorization happen first, before anything else --
  // including before request validation -- so an invalid/unauthorized caller
  // never learns whether their address input was even well-formed, and never
  // causes a single Supabase read.
  const auth = await authenticateRequest(apiKeyHeader);
  if (!auth.ok) return auth;

  const scopeError = requireScope(auth.context, 'property_intelligence:read');
  if (scopeError) return scopeError;

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
