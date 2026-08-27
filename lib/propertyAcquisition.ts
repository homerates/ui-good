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
  // Optional -- present when the source export carries them (e.g. Redfin's
  // native CSV columns). Used only for desirabilityScore() below; never
  // required, never invented when absent.
  observed_days_on_market?: number | null;
  observed_property_type?: string | null;
  observed_beds?: number | null;
  observed_baths?: number | null;
  observed_sqft?: number | null;
  observed_year_built?: number | null;
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

// ── Desirability signal (internal prioritization only) ──────────────────────
//
// Purpose: when a source (a Redfin export, a discovery batch) hands over
// more candidates than can be processed at once, decide which ones are
// worth spending real enrichment budget on FIRST. Deliberately built from
// only objective, already-real market behavior already present in the
// source data -- NOT an AI-inferred "popularity" guess. Confirmed earlier
// this session that generic web search is unreliable even at the simpler
// task of finding one address; asking it to infer *why* an area is
// desirable would be a harder, fuzzier version of the same problem, and
// redundant with signals a real MLS export already states outright.
//
// Two real signals used, both direct market behavior, not inference:
//   - observed_status containing "pending" -- a real buyer already chose
//     this home; the strongest concrete demand signal a listing can carry.
//   - observed_days_on_market -- lower is a genuine proxy for demand (the
//     home attracted an accepted offer, or is attracting showings, faster
//     than a comparable stale listing). Capped rather than linear-forever,
//     since a very low DOM (a day or two) isn't meaningfully "more desired"
//     than a slightly higher one -- it's the difference between fast and
//     slow that carries signal, not fine-grained ranking within "fast."
//
// This score is NEVER rendered on the public property page (matches the
// same "internal prioritization signal only" boundary already established
// for featured_properties.search_count) -- it only decides processing
// order here, and (see lib/propertyIntelligence.ts) deep-enrich candidate
// priority once a property is anchored.
export function desirabilityScore(c: PropertyCandidate): number {
  let score = 0;
  const status = (c.observed_status ?? '').toLowerCase();
  if (status.includes('pending')) score += 50;
  else if (status.includes('active') || status.includes('for_sale') || status.includes('for sale')) score += 20;
  // A recently-sold reference in the same export is a useful comp but not
  // itself a live "worth enriching now" signal -- no boost, no penalty.

  if (c.observed_days_on_market != null && c.observed_days_on_market >= 0) {
    const dom = c.observed_days_on_market;
    const domScore = dom <= 7 ? 40 : dom <= 21 ? 28 : dom <= 45 ? 15 : dom <= 90 ? 5 : 0;
    score += domScore;
  }
  return score;
}

export interface ProcessAcquisitionOptions {
  origin: string; // for the internal server-to-server call to /api/property/lookup
  // Absolute Date.now()-comparable deadline (typically the caller's own
  // maxDuration minus a safety margin). When set, a failed lookup's single
  // retry is skipped if there isn't enough remaining budget for it -- a
  // retry must never be the reason a batch exceeds the route's timeout.
  deadlineMs?: number;
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

  // Highest desirability first -- when a caller hands over more candidates
  // than the batch cap allows, the ones with real market-demand signal
  // (pending status, low days-on-market) get real enrichment spend before
  // whatever happened to be earlier in the source file's row order. For a
  // caller that already paginates a larger list (the spreadsheet route),
  // this only re-orders within whatever page arrived here -- the route
  // itself sorts the full deduped list before slicing so this ordering is
  // meaningful across the whole file, not just within one batch.
  toCheck.sort((a, b) => desirabilityScore(b.candidate) - desirabilityScore(a.candidate));

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

  // Sequential (CONCURRENCY = 1), not parallel -- reverted after a live
  // regression: an earlier version of this function used CONCURRENCY = 4
  // to fix a timeout/hang problem (see the per-lookup timeout below), but
  // running 4 simultaneous /api/property/lookup calls means 4 simultaneous
  // Redfin scrape requests from this same server -- a real 350-row test
  // run immediately showed the failure rate jump from ~17% (an earlier
  // sequential test on comparable addresses) to 55%, consistent with
  // tripping Redfin's own anti-bot/rate-limit defenses under concurrent
  // load. Sequential was already proven reliable; the timeout problem is
  // solved instead by capping the batch size a caller requests per call
  // (see DEFAULT_BATCH_LIMIT in the spreadsheet route) rather than by
  // parallelizing scrape requests against an external site that doesn't
  // want to be hit that way.
  const CONCURRENCY = 1;
  const PER_LOOKUP_TIMEOUT_MS = 20_000;
  // Pacing between requests, not just avoiding concurrency: discovered on a
  // real sustained 216-row run that a fully back-to-back sequential stream
  // (no gap at all between one lookup finishing and the next starting)
  // still degrades over several minutes -- confirmed live by retrying two
  // "failed" addresses moments later from an entirely separate connection
  // and getting real, correct data both times. That rules out "bad
  // addresses" and points at a request-RATE-based defense (not just
  // concurrency-based), which a short gap between requests reduces.
  const PACING_DELAY_MS = 1_000;
  // One retry for a failed lookup, after a longer backoff -- since the
  // same evidence shows a real fraction of failures are transient, not
  // permanent. Bounded by remaining time budget (below) so a retry can
  // never be the reason a batch exceeds the route's own maxDuration.
  const RETRY_BACKOFF_MS = 3_000;

  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function attemptLookup(normalized: string): Promise<{ outcome: 'lookup_succeeded' | 'lookup_failed'; reason?: string; propertyId?: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PER_LOOKUP_TIMEOUT_MS);
    try {
      const res = await fetch(`${options.origin}/api/property/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: normalized }),
        signal: controller.signal,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        return { outcome: 'lookup_failed', reason: body?.error ?? `HTTP ${res.status}` };
      }
      // The lookup route reconciles against loosely-matching existing rows
      // before upserting (see its own cachePropertyResult) -- re-read by
      // address to get the canonical id it actually wrote to, rather than
      // assuming our normalized string is the exact stored key.
      const { data: prop } = sb
        ? await sb.from('properties').select('id').ilike('address_full', `%${normalized.split(',')[0].trim()}%`).limit(1).maybeSingle()
        : { data: null };
      return { outcome: 'lookup_succeeded', propertyId: prop?.id };
    } catch (e) {
      const timedOut = e instanceof Error && e.name === 'AbortError';
      return { outcome: 'lookup_failed', reason: timedOut ? `Timed out after ${PER_LOOKUP_TIMEOUT_MS / 1000}s` : e instanceof Error ? e.message : String(e) };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  let cursor = 0;
  async function worker() {
    while (cursor < toCheck.length) {
      const { candidate, normalized } = toCheck[cursor++];
      if (existingSet.has(normalized.toLowerCase())) {
        results.push({ candidate, normalizedAddress: normalized, outcome: 'duplicate_existing', reason: 'A properties row already exists for this address -- not re-enriched.' });
        continue;
      }

      let outcome = await attemptLookup(normalized);
      if (outcome.outcome === 'lookup_failed') {
        const enoughTimeForRetry = !options.deadlineMs || (Date.now() + RETRY_BACKOFF_MS + PER_LOOKUP_TIMEOUT_MS) < options.deadlineMs;
        if (enoughTimeForRetry) {
          await sleep(RETRY_BACKOFF_MS);
          const retryOutcome = await attemptLookup(normalized);
          if (retryOutcome.outcome === 'lookup_succeeded') {
            outcome = retryOutcome;
          } else {
            outcome = { outcome: 'lookup_failed', reason: `${outcome.reason ?? 'failed'} (retried once, also failed: ${retryOutcome.reason ?? 'failed'})` };
          }
        }
      }
      results.push({ candidate, normalizedAddress: normalized, ...outcome });

      // Pace even successful lookups -- the evidence points at a
      // request-rate defense, not a "punish failures" one.
      if (cursor < toCheck.length) await sleep(PACING_DELAY_MS);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toCheck.length) }, () => worker()));

  return results;
}
