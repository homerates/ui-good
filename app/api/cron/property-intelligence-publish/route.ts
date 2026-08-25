// app/api/cron/property-intelligence-publish/route.ts
//
// Daily corpus-growth job for the Canonical Property Intelligence system.
// Deliberately its own cron (not folded into /api/content/cron) -- a
// different data shape and failure mode than the editorial-article pipeline.
//
// WHAT THIS JOB DOES NOT DO, on purpose:
//   - It does not discover newly-listed properties. No legitimate source for
//     that exists in this codebase today (audited directly: no MLS/IDX/
//     listing-feed integration, no listing-syndication rights, nothing in
//     package.json or app/api). See the implementation report's "New Listing
//     Source" section -- NEW LISTING SOURCE REQUIRED.
//   - It never calls Grok, Tavily, or any paid enrichment API. It only reads
//     already-completed organic enrichment (a real user's property lookup or
//     Decision Score run) that already exists in featured_properties or
//     grok_property_cache.
//
// WHAT IT ACTUALLY DOES: some organic HomeRates activity produces real,
// cached property intelligence (featured_properties, grok_property_cache)
// for an address that never got a `properties` anchor row -- because that
// row is what the canonical public page is keyed on (properties.id), such
// intelligence is otherwise invisible to /property-intelligence/[id] and the
// sitemap forever. This job finds those rows from roughly the last day,
// backfills a `properties` anchor from already-known fields (mirroring
// exactly what was done manually for the pilot's first 5 properties), and
// stops. Eligibility itself is computed live by
// lib/propertyIntelligence.ts's listIndexEligiblePropertyIds() on every
// sitemap regeneration -- this job does not decide or persist INDEX/NOINDEX.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabase } from '../../../../lib/supabaseServer';

const CRON_SECRET = process.env.CRON_SECRET;

// Conservative and configurable: this job does no external API calls, so the
// real constraint is just DB read/write volume, not a rate limit -- but an
// uncontrolled batch size is exactly the "uncontrolled scale" this workstream
// was told to avoid. 50/run at a daily cadence is far more than the observed
// organic rate (single digits to low tens of new addresses/day based on the
// corpus audit), documented here rather than derived from a hard external
// limit, since no such limit applies to this job.
const BATCH_CAP = parseInt(process.env.PROPERTY_INTELLIGENCE_BATCH_CAP ?? '50', 10);

// Slightly over 24h so a slow previous run or clock drift can't create a gap
// between two consecutive daily runs. Configurable so a manually-triggered
// catch-up run (e.g. after the cron was down for a few days) can widen the
// window without a code change.
const LOOKBACK_HOURS = parseInt(process.env.PROPERTY_INTELLIGENCE_LOOKBACK_HOURS ?? '26', 10);

function normAddr(full: string): string {
  return full.trim().toLowerCase();
}

function parseAddress(full: string): { addressLine: string; city: string; state: string; zip: string } | null {
  const m = full.match(/^(.*),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5})$/);
  if (!m) return null;
  return { addressLine: m[1].trim(), city: m[2].trim(), state: m[3].trim(), zip: m[4].trim() };
}

interface Candidate {
  address: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  propertyType: string | null;
  timestamp: string;
  source: 'featured_properties' | 'grok_property_cache';
}

export async function GET(req: Request) {
  if (!CRON_SECRET || req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'Supabase unavailable' }, { status: 500 });

  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const results = { scanned: 0, backfilled: 0, skippedExisting: 0, skippedUnparseable: 0, errors: [] as string[] };

  try {
    const [{ data: fpRows }, { data: grokRows }] = await Promise.all([
      sb.from('featured_properties').select('address, beds, baths, sqft, property_type, score_computed_at').gte('score_computed_at', since),
      sb.from('grok_property_cache').select('address_raw, fetched_at').gte('fetched_at', since),
    ]);

    const candidates = new Map<string, Candidate>();
    for (const r of fpRows ?? []) {
      candidates.set(normAddr(r.address), { address: r.address, beds: r.beds, baths: r.baths, sqft: r.sqft, propertyType: r.property_type, timestamp: r.score_computed_at, source: 'featured_properties' });
    }
    for (const r of grokRows ?? []) {
      const key = normAddr(r.address_raw);
      if (!candidates.has(key)) {
        candidates.set(key, { address: r.address_raw, beds: null, baths: null, sqft: null, propertyType: null, timestamp: r.fetched_at, source: 'grok_property_cache' });
      }
    }

    results.scanned = candidates.size;

    // One bulk existence check up front, not one query per candidate -- with
    // the cap bounding INSERT attempts rather than candidates examined (see
    // below), a corpus that's mostly already backfilled would otherwise cost
    // one DB round-trip per already-existing address on every single run,
    // which only gets worse as the corpus fills in over time. Chunked to stay
    // well clear of PostgREST's query-string length limit on a wide manual
    // catch-up run (normal daily volume is far smaller than one chunk).
    const addressList = Array.from(candidates.values()).map(c => c.address);
    const existingSet = new Set<string>();
    const EXISTENCE_CHECK_CHUNK = 100;
    for (let i = 0; i < addressList.length; i += EXISTENCE_CHECK_CHUNK) {
      const chunk = addressList.slice(i, i + EXISTENCE_CHECK_CHUNK);
      const { data: existingRows } = await sb.from('properties').select('address_full').in('address_full', chunk);
      for (const r of existingRows ?? []) existingSet.add(r.address_full);
    }

    // The cap bounds actual INSERT attempts, not how many candidates are
    // looked at -- capping the candidate list itself would mean that once
    // the first BATCH_CAP addresses are backfilled, every future run re-scans
    // and re-skips exactly those same addresses forever, making zero further
    // progress into the rest of the list.
    let insertAttempts = 0;

    // One bad property must never stop the batch -- each is fully isolated.
    for (const c of candidates.values()) {
      if (insertAttempts >= BATCH_CAP) break;
      try {
        if (existingSet.has(c.address)) { results.skippedExisting++; continue; }
        insertAttempts++;

        const parsed = parseAddress(c.address);
        if (!parsed) { results.skippedUnparseable++; continue; }

        const { error } = await sb.from('properties').insert({
          address_full: c.address,
          address_line: parsed.addressLine,
          city: parsed.city,
          state: parsed.state,
          zip: parsed.zip,
          county: null,
          beds: c.beds,
          baths: c.baths,
          sqft: c.sqft,
          year_built: null,
          property_type: c.propertyType,
          lat: null,
          lng: null,
          apn: null,
          enriched_at: c.timestamp,
          enrichment_source: `${c.source}_organic_backfill`,
          confidence: null,
        });
        if (error) {
          // Unique-constraint races (a concurrent request backfilled the same
          // address between our existence check and this insert) are expected
          // and benign -- anything else is recorded, never thrown.
          if (!error.message?.includes('duplicate key')) results.errors.push(`${c.address}: ${error.message}`);
        } else {
          results.backfilled++;
        }
      } catch (e) {
        results.errors.push(`${c.address}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), partial: results }, { status: 500 });
  }

  return NextResponse.json({ ok: true, since, batchCap: BATCH_CAP, ...results });
}
