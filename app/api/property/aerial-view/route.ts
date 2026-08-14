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
import { SupabaseClient } from '@supabase/supabase-js';
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

// `onConflict` is required here -- without it, Supabase's upsert defaults to the
// primary key (id, a fresh random UUID every call), so every write after the
// first for a given address silently fails a duplicate-key check on the
// address_normalized UNIQUE constraint instead of updating the existing row.
// Confirmed live 2026-08-14: every address checked after the previous fix was
// permanently frozen at its first-ever state/video_id because of this. Logging
// the error here (rather than swallowing it like before) so a future write
// failure surfaces in Vercel logs instead of silently corrupting the cache again.
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
  | { status: 'unavailable' };

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.trim();
  if (!address) {
    return NextResponse.json<AerialViewResponse>({ status: 'unavailable' });
  }

  // TEMP diagnostic, read-only, never writes to the cache: tests whether
  // Google's lookupVideo alone already has this address active, independent
  // of what our renderVideo-based PROCESSING checks have been reporting.
  // Remove once the "confirmed-available-elsewhere but stuck here" question
  // is resolved.
  if (req.nextUrl.searchParams.get('debugLookupOnly') === '1') {
    const uris = await lookupVideoUris(address).catch(() => null);
    return NextResponse.json({ debugLookupOnly: true, ready: !!uris, uris });
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
    const base = { address_normalized: normalized, address_raw: address, video_id: check.videoId, http_status: check.httpStatus, error_detail: check.errorDetail };

    if (check.state === 'ACTIVE') {
      await writeCache(sb, { ...base, state: 'ACTIVE' });
      const uris = await lookupVideoUris(address);
      if (uris) {
        return NextResponse.json<AerialViewResponse>({ status: 'ready', ...uris });
      }
      return NextResponse.json<AerialViewResponse>({ status: 'processing' });
    }

    if (check.state === 'PROCESSING') {
      await writeCache(sb, { ...base, state: 'PROCESSING' });
      return NextResponse.json<AerialViewResponse>({ status: 'processing' });
    }

    // ERROR -- cache permanently, short-circuits all future polls for this address.
    await writeCache(sb, { ...base, state: 'ERROR' });
    return NextResponse.json<AerialViewResponse>({ status: 'unavailable' });
  } catch (e) {
    // Best-effort: still worth knowing an uncaught exception happened, even though
    // we can't safely upsert here without knowing which step failed.
    console.error('[aerial-view] uncaught error', { error: String(e) });
    return NextResponse.json<AerialViewResponse>({ status: 'unavailable' });
  }
}
