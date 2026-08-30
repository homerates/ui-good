// app/api/cron/property-intelligence-deep-enrich/route.ts
//
// Daily DEEP enrichment job for the Canonical Property Intelligence system.
// Separate from /api/cron/property-intelligence-publish (data acquisition/
// anchoring) on purpose -- this job spends real external money (Grok-4.3
// with live web search) and has a genuinely different failure mode and
// cost profile, so it gets its own rollback/observability boundary.
//
// REUSES the existing enrichment engine rather than duplicating it: calls
// this app's own POST /api/beta/grok-property with { deep: true } exactly
// as the interactive UI already does, server-to-server, and drains its SSE
// stream. That route's own cacheResult() already handles the merge-with-
// existing-basic-entry logic and the grok_property_cache upsert (real
// fetched_at/expires_at, model='grok-4.3-search', deep_analysis:true) --
// this cron does not touch that table directly.
//
// WHAT THIS JOB DOES NOT DO:
//   - Never triggered by a page request or a crawler -- the public page
//     (app/property-intelligence/[id]/page.tsx) only ever reads cached
//     intelligence via lib/propertyIntelligence.ts, never calls this route
//     or /api/beta/grok-property.
//   - Never re-enriches a property that already has a deep_analysis:true
//     cache entry younger than DEEP_FRESH_MS.
//   - Never attempts a property whose address doesn't even parse into a
//     plausible "street, city, ST zip" shape -- spending a paid call on a
//     known-malformed address is pure waste.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { getSupabase } from '../../../../lib/supabaseServer';
import { listDeepEnrichmentCandidates } from '../../../../lib/propertyIntelligence';

const CRON_SECRET = process.env.CRON_SECRET;

// Deep calls are genuinely expensive (grok-4.3 + live web search, up to
// ~140s each per the existing route's own timeout) -- unlike the free
// publish cron, this batch cap is deliberately small. Bounded further by
// DEEP_ENRICH_CONCURRENCY and the route's own maxDuration so a run can
// never silently run past what Vercel will allow.
const BATCH_CAP = parseInt(process.env.DEEP_ENRICH_BATCH_CAP ?? '5', 10);
const CONCURRENCY = parseInt(process.env.DEEP_ENRICH_CONCURRENCY ?? '2', 10);

// Stop dispatching new candidates once less than this much time remains in
// the route's own maxDuration budget -- a single call's own worst case.
const PER_CALL_WORST_CASE_MS = 145_000;
const SAFETY_MARGIN_MS = 10_000;

function parseAddress(full: string): boolean {
  // Case-insensitive -- confirmed live 2026-08-30: 453 of 521 real candidates
  // were being rejected as "malformed" purely because address_full is stored
  // lowercase for many rows (a known casing inconsistency across write paths,
  // not a real address defect). e.g. "ca 90710" failed [A-Z]{2} outright.
  return /^(.*),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5})$/i.test(full);
}

async function drainDeepStream(origin: string, address: string, redfin: Record<string, unknown> | null): Promise<'done' | 'error' | 'timeout'> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PER_CALL_WORST_CASE_MS);
  try {
    const res = await fetch(`${origin}/api/beta/grok-property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, redfin, deep: true }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) return 'error';

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const payload = JSON.parse(trimmed.slice(6));
          if (payload.done) return 'done';
          if (payload.error) return 'error';
        } catch { /* ignore partial/malformed SSE frames -- keep reading */ }
      }
    }
    return 'error'; // stream ended without a done/error event
  } catch (e) {
    return e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'error';
  } finally {
    clearTimeout(timeoutId);
  }
}

function normAddr(full: string): string {
  return full.trim().toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function GET(req: Request) {
  if (!CRON_SECRET || req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sbClient = getSupabase();
  if (!sbClient) return NextResponse.json({ error: 'Supabase unavailable' }, { status: 500 });
  // Narrowed const for use inside the worker() closure below -- TS does not
  // carry the null-check narrowing of a captured variable into a nested
  // function declaration's body.
  const sb = sbClient;

  // Fixed base URL, not new URL(req.url).origin -- Vercel Cron invokes this
  // route via its internal deployment hostname (e.g. homerates-next-<hash>-...),
  // not the custom domain. Confirmed live 2026-08-30: the run completed in
  // ~1.65s (one Supabase round-trip, no real enrichment work), consistent with
  // the self-fetch below silently failing fast against that internal hostname.
  // Same fixed-base-URL pattern already used by every other server-to-server
  // call in this codebase (e.g. app/api/admin/*/invite/route.ts).
  const origin = process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'https://chat.homerates.ai';
  const runStart = Date.now();
  const results = {
    candidatesFound: 0,
    attempted: 0,
    succeeded: 0,   // deep call completed AND materialized an AVM or comp
    partial: 0,     // deep call completed but added neither AVM nor a comp
    failed: 0,      // call errored, timed out, or produced no cache entry
    skippedMalformed: 0,
    errors: [] as string[],
    attemptedAddresses: [] as string[],
  };

  try {
    const candidates = await listDeepEnrichmentCandidates();
    results.candidatesFound = candidates.length;
    const toAttempt = candidates.filter(c => {
      if (!parseAddress(c.addressFull)) { results.skippedMalformed++; return false; }
      return true;
    }).slice(0, BATCH_CAP);

    // Fetch each candidate's known facts (already-known, no new call) to ground
    // Grok's deep search -- same "treat as authoritative" contract the
    // interactive UI already relies on.
    const { data: props } = toAttempt.length > 0
      ? await sb.from('properties').select('id, address_full, beds, baths, sqft, year_built').in('id', toAttempt.map(c => c.id))
      : { data: [] as { id: string; address_full: string; beds: number | null; baths: number | null; sqft: number | null; year_built: number | null }[] };
    const propById = new Map((props ?? []).map(p => [p.id, p]));

    const { data: snapRows } = toAttempt.length > 0
      ? await sb.from('property_snapshots').select('property_id, data, fetched_at').eq('snapshot_type', 'full').in('property_id', toAttempt.map(c => c.id)).order('fetched_at', { ascending: false })
      : { data: [] as { property_id: string; data: Record<string, unknown>; fetched_at: string }[] };
    const latestSnapByProperty = new Map<string, Record<string, unknown>>();
    for (const s of snapRows ?? []) if (!latestSnapByProperty.has(s.property_id)) latestSnapByProperty.set(s.property_id, s.data);

    // Bounded concurrency, with a time-budget guard so a slow batch never
    // risks running past the route's own maxDuration.
    let cursor = 0;
    async function worker() {
      while (cursor < toAttempt.length) {
        if (Date.now() - runStart > maxDuration * 1000 - PER_CALL_WORST_CASE_MS - SAFETY_MARGIN_MS) return;
        const candidate = toAttempt[cursor++];
        const prop = propById.get(candidate.id);
        if (!prop) continue;
        const snap = latestSnapByProperty.get(candidate.id);

        const redfin: Record<string, unknown> = {
          current_list_price: snap?.price ?? null,
          bedrooms: prop.beds,
          bathrooms: prop.baths,
          sqft: prop.sqft,
          year_built: prop.year_built,
          days_on_market: snap?.daysOnMarket ?? null,
          last_sold_price: snap?.lastSalePrice ?? null,
          last_sold_date: snap?.lastSaleDate ?? null,
          lot_size_sqft: snap?.lotSizeSqft ?? null,
          tax_rate_effective: snap?.taxRateEffective ?? null,
          hoa_monthly: snap?.hoaMonthly ?? null,
        };

        results.attempted++;
        results.attemptedAddresses.push(prop.address_full);
        try {
          const outcome = await drainDeepStream(origin, prop.address_full, redfin);
          if (outcome !== 'done') { results.failed++; continue; }

          // Ground truth: re-read the cache the route itself just wrote, rather
          // than trusting the SSE payload parsed inline.
          const { data: cacheRow } = await sb
            .from('grok_property_cache')
            .select('grok_result')
            .eq('address_normalized', normAddr(prop.address_full))
            .maybeSingle();
          const gr = (cacheRow?.grok_result ?? {}) as Record<string, unknown>;
          const gotAvm = gr.zillow_estimate != null || gr.redfin_estimate != null;
          const gotComps = Array.isArray(gr.comparable_sales) && (gr.comparable_sales as unknown[]).length >= 1;
          if (gotAvm || gotComps) results.succeeded++;
          else results.partial++;
        } catch (e) {
          results.failed++;
          results.errors.push(`${prop.address_full}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toAttempt.length) }, () => worker()));
  } catch (e) {
    console.error('[deep-enrich] run failed', { error: e instanceof Error ? e.message : String(e), partial: results });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), partial: results }, { status: 500 });
  }

  // Logged, not just returned -- this route has no other caller to read the
  // response body, so without this a failing/no-op run is invisible in
  // Vercel's log viewer (confirmed live 2026-08-30: a run that silently did
  // nothing looked identical to a healthy one from the outside).
  console.log('[deep-enrich] run complete', { batchCap: BATCH_CAP, concurrency: CONCURRENCY, elapsedMs: Date.now() - runStart, ...results });
  return NextResponse.json({ ok: true, batchCap: BATCH_CAP, concurrency: CONCURRENCY, elapsedMs: Date.now() - runStart, ...results });
}
