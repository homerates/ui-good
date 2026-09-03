// lib/gateway/intelligenceGateway.ts
//
// Phase A + Phase B only, per docs/HOMERATES_INTELLIGENCE_GATEWAY_V1_IMPLEMENTATION_PLAN.md.
// NO AUTH (Phase C), NO RATE LIMIT / QUOTA / CIRCUIT BREAKER (Phase D), NO
// LOGGING (Phase E), NO ENDPOINT -- this file is not wired to any app/api
// route. It exists to prove the corpus-only wrapper + output shaping path
// works end-to-end; nothing in this file is reachable over the network today.
//
// Flow: normalize + resolve address -> properties.id -> the ONE sanctioned
// call into existing intelligence (getPropertyIntelligenceCorpusOnly) ->
// shape into Contract V1 -> validate -> return. Never anything else.

import { getSupabase } from '../supabaseServer';
import { getPropertyIntelligenceCorpusOnly } from './corpusOnlyIntelligence';
import { shapeForExternalContract } from './outputShaping';
import { ExternalPropertyIntelligenceV1Schema, type ExternalPropertyIntelligenceV1 } from './outputSchema';

export type GatewayResult =
  | { ok: true; data: ExternalPropertyIntelligenceV1 }
  | { ok: false; error: 'INVALID_REQUEST' | 'INTERNAL_ERROR'; message: string };

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

export async function getPropertyIntelligence(request: { address: string }): Promise<GatewayResult> {
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
