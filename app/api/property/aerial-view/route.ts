// app/api/property/aerial-view/route.ts
// Polled by PropertyPreviewCard to check for / retrieve a Google Aerial View
// flyover video for a looked-up address. Encapsulates the entire lookup/render
// strategy server-side so the client never talks to Google directly and never
// sees the API key.
//
// Check lookupVideo FIRST, not renderVideo. Confirmed live 2026-08-14: Google's
// renderVideo endpoint can report an address as still PROCESSING for 40+ minutes
// even when lookupVideo -- checked directly, bypassing renderVideo entirely --
// already returns a real, playable video for that same address. The two
// endpoints don't agree; renderVideo appears to track its own request-scoped job
// state rather than "does a video exist for this address at all," which
// lookupVideo answers correctly regardless of how/when that video came to exist.
// Only fall back to renderVideo (to kick off a genuinely new render) once
// lookupVideo confirms nothing is available yet.
//
// This card is decorative -- any failure here (missing key, Google down, Supabase
// down) must never break the surrounding chat message, so every branch resolves to
// a 200 with a status field rather than throwing. Diagnostic detail (Google's
// videoId/http status/error) is persisted to aerial_view_cache's debug columns
// (migration 080) on every renderVideo check -- never returned in this response --
// so a stuck or failing address can be investigated later via a direct Supabase
// query instead of needing to reproduce it live with a temporary debug flag.
//
// Pro-gated (confirmed with Rayaan 2026-08-28, see project_aerial_flyover memory):
// Property Lookup itself stays free for everyone per the locked access model --
// only this video is a Pro perk. The gate sits here, server-side, before any
// Google call -- never client-side-only -- because lookupVideoUris() is a
// BILLABLE call the moment it returns real URIs. A free viewer must never be able
// to trigger that billable event even if the client-side UI would just hide the
// result; a non-Pro request short-circuits to 'locked' with zero Google calls.

import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { auth } from '@clerk/nextjs/server';
import { getSupabase } from '../../../../lib/supabaseServer';
import { checkOrRenderVideo, lookupVideoUris } from '../../../../lib/aerialView';
import { getUserPlan } from '../../../../lib/subscription';
import { isAdminId } from '../../../../lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Strips punctuation, lowercases, collapses whitespace -- mirrors the exact
// normalizeAddressStrict logic already used for writes to grok_property_cache
// (app/api/beta/grok-property/route.ts:253-255), so this cache keys the same way.
function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// `onConflict` is required here -- without it, Supabase's upsert defaults to the
// primary key (id, a fresh random UUID every call), so every write after the
// first for a given address silently fails a duplicate-key check on the
// address_normalized UNIQUE constraint instead of updating the existing row.
// Confirmed live 2026-08-14. Logging the error here (rather than swallowing it)
// so a future write failure surfaces in Vercel logs instead of silently
// corrupting the cache again.
async function writeCache(
  sb: SupabaseClient,
  row: { address_normalized: string; address_raw: string; state: string; video_id: string | null; http_status: number | null; error_detail: string | null },
) {
  const { error } = await sb
    .from('aerial_view_cache')
    .upsert({ ...row, checked_at: new Date().toISOString() }, { onConflict: 'address_normalized' });
  if (error) console.error('[aerial-view] cache write failed', { address: row.address_normalized, error: error.message });
}

type AerialViewResponse =
  | { status: 'ready'; landscapeUri: string; portraitUri: string }
  | { status: 'processing' }
  | { status: 'unavailable' }
  | { status: 'locked' };

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.trim();
  if (!address) {
    return NextResponse.json<AerialViewResponse>({ status: 'unavailable' });
  }

  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json<AerialViewResponse>({ status: 'unavailable' });

    const normalized = normalizeAddress(address);

    const { data: cached } = await sb
      .from('aerial_view_cache')
      .select('state')
      .eq('address_normalized', normalized)
      .maybeSingle();

    // Known-bad address -- never retried, zero Google calls, regardless of plan.
    if (cached?.state === 'ERROR' || cached?.state === 'UNAVAILABLE') {
      return NextResponse.json<AerialViewResponse>({ status: 'unavailable' });
    }

    // Pro gate -- must happen before any Google call (see file header). A free
    // viewer gets 'locked' immediately; the client shows a static badge and never
    // starts (or continues) polling, so this address never drives render/lookup
    // traffic on a free user's behalf.
    const { userId } = await auth();
    const [userPlanResult, adminBypass] = await Promise.all([
      userId ? getUserPlan(userId) : Promise.resolve(null),
      isAdminId(userId),
    ]);
    const plan = userPlanResult?.plan ?? 'free';
    // 'founding' isn't in PlanKey's type union, but getUserPlan() casts the raw
    // users.plan column value through `as PlanKey` unchecked (lib/subscription.ts) --
    // a real founding-tier user's plan can still be the runtime string 'founding'
    // despite the type saying otherwise, same as the established isPro check in
    // deal-rooms/page.tsx and app/api/deal-rooms/route.ts. Widen for the comparison.
    const isPro = adminBypass || plan === 'pro' || (plan as string) === 'founding';
    if (!isPro) {
      return NextResponse.json<AerialViewResponse>({ status: 'locked' });
    }

    // Ground truth first: does a video already exist for this address at all,
    // regardless of any render job's self-reported status?
    const uris = await lookupVideoUris(address);
    if (uris) {
      await writeCache(sb, {
        address_normalized: normalized, address_raw: address, state: 'ACTIVE',
        video_id: null, http_status: null, error_detail: null,
      });
      return NextResponse.json<AerialViewResponse>({ status: 'ready', ...uris });
    }

    // Nothing available yet -- check/kick off a render (idempotent, cheap, safe
    // to poll repeatedly) and report its status.
    const check = await checkOrRenderVideo(address);
    const base = { address_normalized: normalized, address_raw: address, video_id: check.videoId, http_status: check.httpStatus, error_detail: check.errorDetail };

    if (check.state === 'ERROR') {
      // Cache permanently -- short-circuits all future polls for this address.
      await writeCache(sb, { ...base, state: 'ERROR' });
      return NextResponse.json<AerialViewResponse>({ status: 'unavailable' });
    }

    // ACTIVE or PROCESSING per renderVideo -- either way lookupVideo just said
    // not ready, so report processing and let the next poll re-check lookupVideo.
    await writeCache(sb, { ...base, state: 'PROCESSING' });
    return NextResponse.json<AerialViewResponse>({ status: 'processing' });
  } catch (e) {
    console.error('[aerial-view] uncaught error', { error: String(e) });
    return NextResponse.json<AerialViewResponse>({ status: 'unavailable' });
  }
}
