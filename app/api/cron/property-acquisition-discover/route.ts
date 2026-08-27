// app/api/cron/property-acquisition-discover/route.ts
//
// Option 1 -- automated web signal discovery, wired as its own cron/test
// endpoint. Separate from the deep-enrich and publish crons -- discovery,
// deep enrichment, and publication are three genuinely different failure
// modes and cost profiles, kept as three separate rollback boundaries.
//
// This route's job ends once clean, normalized candidates have been handed
// to the existing /api/property/lookup pipeline via
// processAcquisitionCandidates(). It does not enrich further itself, does
// not decide INDEX/NOINDEX, and does not touch the sitemap -- those stay
// the deep-enrich cron's and the sitemap's job respectively, unchanged.
//
// Bounded by design: GEOGRAPHIES and PER_GEOGRAPHY_CAP are both
// configurable (env for the real daily cron; query params for a one-off
// controlled test), defaulting to a SINGLE geography and a small cap so a
// misconfiguration can never fan out into an uncontrolled nationwide crawl.

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { discoverForSaleCandidates } from '../../../../lib/propertyDiscovery';
import { processAcquisitionCandidates } from '../../../../lib/propertyAcquisition';

const CRON_SECRET = process.env.CRON_SECRET;

// Conservative default: one geography, a small accepted-candidate cap. Real
// production values (if this is ever promoted beyond test mode) come from
// env vars, never hardcoded higher without a documented decision -- see the
// implementation report's Recommendation section for why this stayed at
// test scale rather than being wired into vercel.json's cron list.
const DEFAULT_GEOGRAPHIES = (process.env.PROPERTY_DISCOVERY_GEOGRAPHIES ?? 'Irvine, CA').split('|').map(s => s.trim()).filter(Boolean);
const DEFAULT_PER_GEOGRAPHY_CAP = parseInt(process.env.PROPERTY_DISCOVERY_CAP ?? '20', 10);

export async function GET(req: NextRequest) {
  if (!CRON_SECRET || req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const geographiesParam = url.searchParams.get('geographies'); // pipe-separated, for controlled testing
  const capParam = url.searchParams.get('cap');
  const geographies = geographiesParam ? geographiesParam.split('|').map(s => s.trim()).filter(Boolean) : DEFAULT_GEOGRAPHIES;
  const perGeographyCap = capParam ? parseInt(capParam, 10) : DEFAULT_PER_GEOGRAPHY_CAP;

  const origin = url.origin;
  const discovery = await discoverForSaleCandidates(geographies, perGeographyCap);
  // 15s margin under this route's own maxDuration -- same reasoning as the
  // spreadsheet route: lets processAcquisitionCandidates skip a failed
  // lookup's retry once too little budget remains, rather than risk the
  // retry pushing this request past its own timeout.
  const deadlineMs = Date.now() + (maxDuration - 15) * 1000;
  const processed = await processAcquisitionCandidates(discovery.candidates, { origin, deadlineMs });

  const counts = {
    searchRequests: discovery.queryLog.length,
    candidatesReturnedRaw: discovery.queryLog.reduce((a, q) => a + q.resultsReturned, 0),
    candidatesExtracted: discovery.candidateLog.length,
    candidatesAccepted: discovery.candidateLog.filter(c => c.accepted).length,
    invalid: processed.filter(p => p.outcome === 'invalid').length,
    duplicateInBatch: processed.filter(p => p.outcome === 'duplicate_in_batch').length,
    duplicateExisting: processed.filter(p => p.outcome === 'duplicate_existing').length,
    lookupSucceeded: processed.filter(p => p.outcome === 'lookup_succeeded').length,
    lookupFailed: processed.filter(p => p.outcome === 'lookup_failed').length,
  };

  return NextResponse.json({
    ok: true,
    geographies,
    perGeographyCap,
    counts,
    queryLog: discovery.queryLog,
    candidateLog: discovery.candidateLog,
    processed,
  });
}
