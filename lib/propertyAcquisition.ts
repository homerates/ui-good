// lib/propertyAcquisition.ts
//
// Shared candidate contract + downstream processing for BOTH property
// acquisition sources (automated web discovery and spreadsheet import).
// Neither source may fork into its own pipeline past this point -- both
// normalize into PropertyCandidate, then processAcquisitionCandidates()
// is the ONE path both call.
//
// This module does not alter Decision Score, LLPA, OBMMI, the INDEX
// threshold, or the five-card methodology -- it only gets an address to
// the point where the EXISTING /api/property/lookup pipeline (basic
// enrichment -> properties + property_snapshots) can take over exactly as
// it already does for an organic user lookup.
//
// No persisted acquisition-candidate queue table exists, and none is added
// here (Part 5's own instruction: reuse if possible, justify before adding
// schema). Reasoning: this session has no way to apply a DDL migration
// against the live database and verify it actually ran (same constraint
// noted in the prior Property Intelligence workstream) -- and a queue
// table isn't actually load-bearing for correctness here. The candidate
// states this module needs (discovered/validated/duplicate/queued/
// processing/enriched/rejected/failed) all reduce to two already-durable
// facts: does a `properties` row exist for this normalized address
// (dedup, via the existing address_full UNIQUE constraint), and does that
// row have real enrichment (checked live via lib/propertyIntelligence.ts,
// same as every other consumer). Every run's own in-memory audit trail
// (returned in the response) is the queue for that run; a future daily
// cron re-runs discovery fresh each day rather than resuming a stored
// backlog, which is correct for "find what's on the market right now."

export type AcquisitionSourceType = 'web_signal' | 'spreadsheet';

export interface PropertyCandidate {
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  observed_status?: string | null;
  observed_price?: number | null;
  source_url?: string | null;
  source_type: AcquisitionSourceType;
  observed_at: string;
}

export type CandidateOutcome =
  | 'invalid'
  | 'duplicate_in_batch'
  | 'duplicate_existing'
  | 'lookup_succeeded'
  | 'lookup_failed';

export interface ProcessedCandidateResult {
  candidate: PropertyCandidate;
  normalizedAddress: string | null;
  outcome: CandidateOutcome;
  reason?: string;
  propertyId?: string;
}

const ADDRESS_SHAPE = /^(.*),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5})$/;

function normAddrLoose(s: string): string {
  return s.trim().toLowerCase();
}

// Builds a canonical "street, city, ST zip" string from whatever the
// candidate actually supplied, then validates the result against the same
// strict shape the rest of this workstream already relies on (properties
// backfill, deep-enrich candidate selection). Never invents a missing part.
export function normalizeCandidateAddress(c: PropertyCandidate): string | null {
  let full = c.address.trim();
  if (c.city && c.state && c.zip && !ADDRESS_SHAPE.test(full)) {
    // Candidate supplied structured fields separately (typical spreadsheet
    // row, or a discovery extraction that split the address) -- assemble
    // the canonical shape rather than rejecting a genuinely good address
    // just because it wasn't pre-formatted with commas.
    const street = full.replace(new RegExp(`,?\\s*${c.city}.*$`, 'i'), '').trim();
    full = `${street || full}, ${c.city}, ${c.state.toUpperCase()} ${c.zip}`;
  }
  return ADDRESS_SHAPE.test(full) ? full : null;
}

export interface ProcessAcquisitionOptions {
  origin: string; // for the internal server-to-server call to /api/property/lookup
}

import { getSupabase } from './supabaseServer';

export async function processAcquisitionCandidates(
  candidates: PropertyCandidate[],
  options: ProcessAcquisitionOptions,
): Promise<ProcessedCandidateResult[]> {
  const sb = getSupabase();
  const results: ProcessedCandidateResult[] = [];
  const seenInBatch = new Set<string>();

  // Validate + dedup-in-batch first (cheap, no DB/network calls).
  const toCheck: { candidate: PropertyCandidate; normalized: string }[] = [];
  for (const candidate of candidates) {
    const normalized = normalizeCandidateAddress(candidate);
    if (!normalized) {
      results.push({ candidate, normalizedAddress: null, outcome: 'invalid', reason: 'Address does not resolve to a "street, city, ST zip" shape.' });
      continue;
    }
    const key = normAddrLoose(normalized);
    if (seenInBatch.has(key)) {
      results.push({ candidate, normalizedAddress: normalized, outcome: 'duplicate_in_batch', reason: 'Same normalized address already seen earlier in this batch.' });
      continue;
    }
    seenInBatch.add(key);
    toCheck.push({ candidate, normalized });
  }

  // One bulk existence check against `properties`, chunked -- same pattern
  // as the publish cron, for the same reason (avoid one query per candidate).
  //
  // Deliberately NOT a `.in('address_full', chunk)` filter: `address_full`'s
  // casing is inconsistent across this table's own write paths (some rows
  // lowercased by /api/property/lookup's own upsert, others written with
  // original mixed-case text by an earlier backfill) -- confirmed directly
  // by testing an exact-cased query against a known lowercase-stored row and
  // getting zero matches. Postgres text equality is case-sensitive with no
  // collation override here, so a case-sensitive IN-filter silently misses
  // real duplicates whenever the stored casing differs from the candidate's,
  // defeating this function's one job of not re-triggering enrichment for
  // an address that already exists. Fetch and compare case-insensitively in
  // JS instead -- the same pattern lib/propertyIntelligence.ts's
  // bulkMergeCorpus() already uses correctly for this exact reason.
  const existingSet = new Set<string>();
  if (sb && toCheck.length > 0) {
    const { data } = await sb.from('properties').select('address_full');
    for (const r of data ?? []) existingSet.add(r.address_full.toLowerCase());
  }

  for (const { candidate, normalized } of toCheck) {
    if (existingSet.has(normalized.toLowerCase())) {
      results.push({ candidate, normalizedAddress: normalized, outcome: 'duplicate_existing', reason: 'A properties row already exists for this address -- not re-enriched.' });
      continue;
    }

    // Hand off to the EXISTING basic-enrichment pipeline, exactly as an
    // organic user lookup would trigger it -- no new enrichment logic here.
    try {
      const res = await fetch(`${options.origin}/api/property/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: normalized }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        results.push({ candidate, normalizedAddress: normalized, outcome: 'lookup_failed', reason: body?.error ?? `HTTP ${res.status}` });
        continue;
      }
      // The lookup route reconciles against loosely-matching existing rows
      // before upserting (see its own cachePropertyResult) -- re-read by
      // address to get the canonical id it actually wrote to, rather than
      // assuming our normalized string is the exact stored key.
      const { data: prop } = sb
        ? await sb.from('properties').select('id').ilike('address_full', `%${normalized.split(',')[0].trim()}%`).limit(1).maybeSingle()
        : { data: null };
      results.push({ candidate, normalizedAddress: normalized, outcome: 'lookup_succeeded', propertyId: prop?.id });
    } catch (e) {
      results.push({ candidate, normalizedAddress: normalized, outcome: 'lookup_failed', reason: e instanceof Error ? e.message : String(e) });
    }
  }

  return results;
}
