// app/api/property/aerial-view/route.ts
// Polled by PropertyPreviewCard to check for / retrieve a Google Aerial View
// flyover video for a looked-up address. Encapsulates the entire "poll via
// renderVideo (cheap, idempotent), bill via lookupVideo once" strategy server-side
// so the client never talks to Google directly and never sees the API key.
//
// This card is decorative -- any failure here (missing key, Google down, Supabase
// down) must never break the surrounding chat message, so every branch resolves to
// a 200 with a status field rather than throwing. Diagnostic detail (Google's
// videoId/http status/error) is persisted to aerial_view_cache's debug columns
// (migration 080) on every check -- never returned in this response -- so a stuck
// or failing address can be investigated later via a direct Supabase query instead
// of needing to reproduce it live with a temporary debug flag.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '../../../../lib/supabaseServer';
import { checkOrRenderVideo, lookupVideoUris } from '../../../../lib/aerialView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Strips punctuation, lowercases, collapses whitespace -- mirrors the exact
// normalizeAddressStrict logic already used for writes to grok_property_cache
// (app/api/beta/grok-property/route.ts:253-255), so this cache keys the same way.
function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

type AerialViewResponse =
  | { status: 'ready'; landscapeUri: string; portraitUri: string }
  | { status: 'processing' }
  | { status: 'unavailable' };

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

    // Known-bad address -- never retried, zero Google calls.
    if (cached?.state === 'ERROR' || cached?.state === 'UNAVAILABLE') {
      return NextResponse.json<AerialViewResponse>({ status: 'unavailable' });
    }

    // Already confirmed ACTIVE -- skip the renderVideo idempotent-check hop,
    // go straight to the one billable lookupVideo call for this viewer.
    if (cached?.state === 'ACTIVE') {
      const uris = await lookupVideoUris(address);
      if (uris) {
        return NextResponse.json<AerialViewResponse>({ status: 'ready', ...uris });
      }
      // Cache said ACTIVE but Google no longer has it (expired/purged) -- fall
      // through to a fresh render-check below instead of trusting stale cache.
    }

    const check = await checkOrRenderVideo(address);
    const debugCols = { video_id: check.videoId, http_status: check.httpStatus, error_detail: check.errorDetail };

    if (check.state === 'ACTIVE') {
      await sb.from('aerial_view_cache').upsert({
        address_normalized: normalized,
        address_raw: address,
        state: 'ACTIVE',
        checked_at: new Date().toISOString(),
        ...debugCols,
      });
      const uris = await lookupVideoUris(address);
      if (uris) {
        return NextResponse.json<AerialViewResponse>({ status: 'ready', ...uris });
      }
      return NextResponse.json<AerialViewResponse>({ status: 'processing' });
    }

    if (check.state === 'PROCESSING') {
      await sb.from('aerial_view_cache').upsert({
        address_normalized: normalized,
        address_raw: address,
        state: 'PROCESSING',
        checked_at: new Date().toISOString(),
        ...debugCols,
      });
      return NextResponse.json<AerialViewResponse>({ status: 'processing' });
    }

    // ERROR -- cache permanently, short-circuits all future polls for this address.
    await sb.from('aerial_view_cache').upsert({
      address_normalized: normalized,
      address_raw: address,
      state: 'ERROR',
      checked_at: new Date().toISOString(),
      ...debugCols,
    });
    return NextResponse.json<AerialViewResponse>({ status: 'unavailable' });
  } catch (e) {
    // Best-effort: still worth knowing an uncaught exception happened, even though
    // we can't safely upsert here without knowing which step failed.
    void e;
    return NextResponse.json<AerialViewResponse>({ status: 'unavailable' });
  }
}
