// lib/externalPropertyResolution.ts
//
// Demand-driven external property resolution -- the ONLY new orchestration
// layer added by the "External Property Resolution + Demand-Driven
// Acquisition V1" task (2026-09-08). Lives OUTSIDE lib/gateway/ deliberately:
// the Gateway import-boundary rule (scripts/check-gateway-import-boundary.mjs,
// see corpusOnlyIntelligence.ts's own header) forbids anything under
// lib/gateway/ from importing app/api/property/lookup, lib/propertyIntelligence.ts
// directly, or doing its own external fetch. This file needs to do exactly
// the fetch the boundary exists to keep out of lib/gateway/ -- so it sits
// beside the Gateway, calling its UNCHANGED public entry point first and its
// newly-exported resolvePropertyId() second, never editing anything inside
// lib/gateway/ itself beyond that one additive export.
//
// What this function adds, precisely: when getPropertyIntelligence() (the
// existing, completely unmodified Gateway pipeline -- kill-switch, auth,
// scope, rate-limit, address validation, corpus-only lookup, output shaping,
// schema validation, all untouched) comes back NOT_AVAILABLE because no
// properties row exists yet for the address, this function makes ONE
// self-fetch call to the existing, unmodified /api/property/lookup route --
// the same first-party resolution pipeline chat and /check-property already
// use today -- to resolve and persist a new property record, then re-asks
// the Gateway for that address so the caller gets real (if partial)
// intelligence instead of a bare NOT_AVAILABLE for any valid address.
//
// What this function deliberately does NOT do:
//   - It does not call Grok, deep-enrichment, or Tavily's autonomous
//     discovery queue. /api/property/lookup's own internal Tavily/GPT-4o
//     calls are the existing, already-shipped cost of ordinary first-party
//     address resolution (confirmed via Phase 0 audit) -- not a new paid
//     path introduced here. Deep enrichment stays entirely on its existing
//     cron cadence; a freshly-resolved property simply becomes naturally
//     eligible for it next cycle via lib/propertyIntelligence.ts's existing,
//     unmodified listDeepEnrichmentCandidates() derived-state query -- no
//     flag, no second queue, no code change needed there.
//   - It never re-runs auth/scope/rate-limit/kill-switch a second time --
//     those already gated the first getPropertyIntelligence() call, and
//     resolvePropertyId() (the only Gateway import here) does no control-flow
//     work of its own.
//   - It makes at most ONE /api/property/lookup call per external request,
//     ever -- no retry, no recursion, no loop. A second identical request
//     for the same still-unresolved address simply gets NOT_AVAILABLE again
//     (or AVAILABLE/PARTIAL if the first resolution succeeded and this is a
//     genuinely later request) -- see Phase 8 test C (repeat-address dedupe:
//     the SECOND request for an address that resolved on the first call
//     never re-triggers resolution, since getPropertyIntelligence() already
//     finds the now-persisted row on its first, unmodified lookup pass).
//   - It never forwards a caller-controlled URL anywhere -- the self-fetch
//     target is the fixed, hardcoded internal route path below; the request
//     body sent to it is `{ address }`, the same trusted, length-capped
//     string the Gateway already validated before this function ever runs.
//
// Base URL: reuses the exact, already-precedented pattern from
// app/api/cron/property-intelligence-deep-enrich/route.ts -- a fixed env var
// with a hardcoded fallback, never `new URL(req.url).origin`, since Vercel's
// internal deployment hostname differs from the public custom domain (this
// exact mistake previously caused a silent cron no-op -- ISSUE-038).

import { after } from 'next/server';
import { getPropertyIntelligence, resolvePropertyId, type GatewayResult } from './gateway/intelligenceGateway';
import { buildCanonicalPropertyIntelligence } from './canonicalPropertyIntelligence';
import { shapeForExternalContract } from './gateway/outputShaping';
import { ExternalPropertyIntelligenceV1Schema } from './gateway/outputSchema';

const SELF_FETCH_BASE_URL = process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'https://chat.homerates.ai';
const RESOLUTION_TIMEOUT_MS = 20_000;

// Progressive Intelligence (2026-09-09): the first-party chat product never
// waits for Grok comps/location before showing a user something useful --
// app/chat/page.tsx renders the property/financing card immediately, then a
// CLIENT-SIDE background call (the user's own open browser tab) hits the
// exact same /api/beta/grok-property endpoint below and updates the same
// message once deep analysis lands. An external caller has no browser tab to
// do that follow-up itself, so the server does it here instead -- same
// endpoint, same cache table (grok_property_cache), same deep-enrichment
// lifecycle, not a second pipeline.
//
// Scheduled via Next's after() rather than a bare un-awaited promise: AD-18
// (this same file's sibling workstream) proved a fire-and-forget call in a
// route handler is not reliably guaranteed to run to completion once the
// response has been sent -- after() is the platform-supported mechanism for
// exactly "run this once the response is out, but guarantee it finishes."
// Never awaited by the caller -- the external response returns immediately
// regardless of how long this takes (Grok's own route times out at 140s for
// deep mode, far past any acceptable synchronous tool-call latency).
//
// Fires at most once per returned result, only when intelligence_progress
// says 'enriching' (comps and location narrative both still absent) --
// skipped entirely once either exists, so a property that's already been
// enriched (by this trigger, by the passive deep-enrichment cron, or by a
// first-party chat session) never re-triggers. No new debounce/job-state
// table: worst case, a very rapidly repeated request for the same
// not-yet-enriched address can fire more than one of these before the first
// completes and writes the cache -- bounded by the Gateway's own existing
// per-credential/per-partner rate limits (10/min, 30/min), not a new limit.
function triggerFastFollowEnrichmentIfNeeded(result: GatewayResult): void {
  if (!result.ok) return;
  const progress = result.data.intelligence_progress;
  if (!progress || progress.status !== 'enriching') return;
  const address = result.data.property?.address ?? result.data.query.address_requested;
  if (!address) return;

  const p = result.data.property;
  const v = result.data.value_intelligence;
  const oc = result.data.ownership_cost_intelligence;
  const redfin = {
    current_list_price: v?.list_price.value ?? undefined,
    bedrooms: p?.beds ?? undefined,
    bathrooms: p?.baths ?? undefined,
    sqft: p?.sqft ?? undefined,
    last_sold_price: v?.last_sale.price ?? undefined,
    last_sold_date: v?.last_sale.date ?? undefined,
    hoa_monthly: oc?.hoa.value ?? undefined,
  };

  const runTrigger = async () => {
    try {
      await fetch(`${SELF_FETCH_BASE_URL}/api/beta/grok-property`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, deep: true, redfin }),
        signal: AbortSignal.timeout(145_000),
      });
    } catch {
      // Best-effort. A failed trigger leaves the property exactly where it
      // was -- still eligible for the passive deep-enrichment cron, and
      // still returning its correct, unaffected Workstream 4 PARTIAL/
      // NOT_AVAILABLE result on any request in the meantime. Never surfaced
      // to the caller -- this is strictly additive.
    }
  };

  try {
    // after() throws when called outside a real Next.js request-handling
    // context -- always true for a genuine deployed request (every real
    // caller reaches this function through the MCP route's own POST
    // handler), but NOT true for test harnesses that construct a
    // NextRequest and call a route's exported POST directly as a plain
    // function (scripts/test-external-adapter.ts, scripts/test-oauth-flow.ts
    // do exactly this). Falling back to an un-awaited call in that case is
    // the AD-18-proven-unreliable pattern, but only ever exercised outside
    // real production, where it's harmless test-harness behavior, never a
    // production correctness question.
    after(runTrigger);
  } catch {
    void runTrigger();
  }
}

// Same rejection the Gateway's own address validation already performs is
// not enough here -- a syntactically valid but URL-shaped "address" (a
// pasted Redfin/Zillow link) would route to /api/property/lookup's `url`
// branch instead of its `address` branch, a different code path than what
// this external contract is documented to accept. Rejected before any
// self-fetch is attempted -- this is a resolution-eligibility check, not a
// new Gateway validation rule, so it never changes what getPropertyIntelligence()
// itself accepts or rejects.
function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim()) || /^www\./i.test(value.trim());
}

// Privacy-safe outcome logging -- outcome + latency only, never the address,
// matching the existing Gateway requestLog.ts discipline (see that file).
//
// RESOLUTION_FAILED_PROVIDER vs RESOLUTION_FAILED_POST_PERSISTENCE (added
// 2026-09-09, North Star Workstream 2): a single 'RESOLUTION_FAILED' outcome
// used to conflate two structurally different failure modes -- (1) the
// self-fetch itself came back ok:false (Tavily/Redfin found nothing, or the
// identity check in lib/addressIdentity.ts rejected every candidate -- no
// persistence was ever attempted), and (2) the self-fetch reported ok:true
// but the immediate resolvePropertyId() re-check still found nothing. Direct
// timing reproduction proved (2) was a real, observable fire-and-forget
// persistence race (see ARCHITECTURE_DECISIONS.md) -- now fixed by awaiting
// cachePropertyResult() in app/api/property/lookup/route.ts, so this outcome
// should be rare going forward, but is kept distinct rather than re-merged
// into (1) so a recurrence is visible instead of silently reabsorbed into
// "provider failure." The EXTERNAL contract's NOT_AVAILABLE reason text is
// unchanged by this split -- it stays generic and privacy-safe either way;
// this distinction is for internal observability only.
function logResolutionOutcome(
  outcome:
    | 'EXISTING_HIT'
    | 'NEWLY_RESOLVED'
    | 'RESOLUTION_FAILED_PROVIDER'
    | 'RESOLUTION_FAILED_POST_PERSISTENCE'
    | 'RESOLUTION_FAILED_SHAPING'
    | 'RESOLUTION_SKIPPED',
  latencyMs: number,
) {
  console.log('[external-resolution]', { outcome, latencyMs });
}

async function attemptResolution(address: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RESOLUTION_TIMEOUT_MS);
    try {
      const res = await fetch(`${SELF_FETCH_BASE_URL}/api/property/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
        signal: controller.signal,
      });
      if (!res.ok) return false;
      const body = await res.json().catch(() => null);
      return Boolean(body?.ok);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return false;
  }
}

// Re-shapes and re-validates a freshly-resolved property through the exact
// same output path the Gateway itself uses (shapeForExternalContract ->
// ExternalPropertyIntelligenceV1Schema) -- never a bespoke second shaping
// path that could drift from Contract V1.1.
async function shapeResolvedProperty(address: string, propertyId: string): Promise<GatewayResult> {
  const raw = await buildCanonicalPropertyIntelligence(propertyId);
  const shaped = shapeForExternalContract(address, raw);
  const parsed = ExternalPropertyIntelligenceV1Schema.safeParse(shaped);
  if (!parsed.success) {
    return { ok: false, error: 'INTERNAL_ERROR', message: 'Response failed contract validation.' };
  }
  return { ok: true, data: parsed.data };
}

// Appends a natural-language note marking a just-resolved property, without
// exposing any internal state-machine name (NEWLY_RESOLVED_PARTIAL etc.
// never cross this boundary -- see Phase 3's consumer-safe response-state
// design). Written to BOTH availability.reason (always present whenever
// status isn't AVAILABLE) and decision_intelligence.limitations (present
// only when decision_intelligence itself is non-null) -- not either/or.
// A freshly-resolved property commonly has neither AVM nor comparables yet
// (basic first-party lookup alone doesn't guarantee either), which makes
// raw.eligibility 'unavailable' and decision_intelligence null even after a
// real, successful resolution -- confirmed by reading getPropertyIntelligenceData()'s
// eligibility derivation directly. Relying on decision_intelligence alone
// would silently drop this note for exactly that common case, leaving a
// caller unable to tell "we just added this" apart from a bare unknown
// address -- the one thing this whole feature exists to signal.
const RESOLVED_NOTE =
  'This property was not previously in our system and has just been added. Some intelligence layers may be limited until enrichment completes.';

function withResolvedNote(result: GatewayResult): GatewayResult {
  if (!result.ok) return result;
  const availability = result.data.availability.reason
    ? { ...result.data.availability, reason: `${result.data.availability.reason} ${RESOLVED_NOTE}` }
    : result.data.availability;
  const decisionIntelligence = result.data.decision_intelligence
    ? { ...result.data.decision_intelligence, limitations: [...result.data.decision_intelligence.limitations, RESOLVED_NOTE] }
    : result.data.decision_intelligence;
  return { ok: true, data: { ...result.data, availability, decision_intelligence: decisionIntelligence } };
}

// The external MCP tool's sole entry point (replaces a direct call to
// getPropertyIntelligence() in app/api/mcp/property-intelligence/route.ts).
// Same signature and return type as getPropertyIntelligence(), so nothing
// else in that route's 401/403/JSON-RPC mapping needs to change.
export async function resolveExternalPropertyIntelligence(
  request: { address: string },
  apiKeyHeader: string | null,
  requestIp: string,
): Promise<GatewayResult> {
  const startedAt = Date.now();

  const first = await getPropertyIntelligence(request, apiKeyHeader, requestIp);
  if (!first.ok || first.data.availability.status !== 'NOT_AVAILABLE') {
    if (first.ok) logResolutionOutcome('EXISTING_HIT', Date.now() - startedAt);
    triggerFastFollowEnrichmentIfNeeded(first);
    return first;
  }

  const address = request.address?.trim() ?? '';
  if (!address || looksLikeUrl(address)) {
    logResolutionOutcome('RESOLUTION_SKIPPED', Date.now() - startedAt);
    return first;
  }

  // A NOT_AVAILABLE result can mean either "never seen this address" (no
  // properties row at all) or "this address IS already in our corpus but
  // doesn't meet the full data bar" (e.g. a prior resolution that never
  // got an AVM/comparable -- confirmed via getPropertyIntelligenceData()'s
  // own eligibility derivation, which returns 'unavailable', not 'noindex',
  // for exactly that case). Only the first is genuinely "unknown" and
  // worth a resolution attempt -- re-running one for an address already in
  // the corpus would be a repeat, wasted external call on every single
  // request for an already-attempted incomplete property, not demand-driven
  // acquisition for an unknown address. resolvePropertyId() -- the same
  // lookup getPropertyIntelligence() already performed internally -- tells
  // us directly which case this is, instead of pattern-matching the
  // human-readable reason string.
  const alreadyKnown = await resolvePropertyId(address);
  if (alreadyKnown) {
    logResolutionOutcome('RESOLUTION_SKIPPED', Date.now() - startedAt);
    // KNOWN + INCOMPLETE (Phase 8): genuine external demand for a property
    // we already have basic facts for, but haven't enriched, is exactly the
    // case worth prioritizing over waiting for the passive cron -- unlike
    // the malformed/URL-shaped skip above, which never reaches here.
    triggerFastFollowEnrichmentIfNeeded(first);
    return first;
  }

  // Provider/identity failure: the self-fetch's own response body said
  // ok:false -- either Tavily/Redfin found nothing, or every candidate
  // failed lib/addressIdentity.ts's identity check. cachePropertyResult()
  // is never invoked in this case (see app/api/property/lookup/route.ts's
  // handleAddress()), so there is no persisted row to race against.
  const resolved = await attemptResolution(address);
  if (!resolved) {
    logResolutionOutcome('RESOLUTION_FAILED_PROVIDER', Date.now() - startedAt);
    return first;
  }

  // Post-persistence check: the self-fetch reported ok:true, meaning
  // handleAddress() DID call (and, as of 2026-09-09, await) cachePropertyResult().
  // A null result here immediately after a successful self-fetch would
  // indicate the persistence-race class of failure proven and fixed by this
  // workstream -- kept as its own outcome so a recurrence is visible rather
  // than silently reabsorbed into RESOLUTION_FAILED_PROVIDER.
  const propertyId = await resolvePropertyId(address);
  if (!propertyId) {
    logResolutionOutcome('RESOLUTION_FAILED_POST_PERSISTENCE', Date.now() - startedAt);
    return first;
  }

  const second = await shapeResolvedProperty(address, propertyId);
  logResolutionOutcome(second.ok ? 'NEWLY_RESOLVED' : 'RESOLUTION_FAILED_SHAPING', Date.now() - startedAt);
  const withNote = withResolvedNote(second);
  triggerFastFollowEnrichmentIfNeeded(withNote);
  return withNote;
}
