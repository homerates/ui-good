// lib/aerialView.ts
// Server-only wrapper around Google's Aerial View API (drone-style flyover video
// per US postal address). GOOGLE_AERIAL_VIEW_API_KEY must never be exposed to the
// client -- unlike NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (referrer-restricted, client-side
// only), Aerial View is called server-to-server and needs its own unrestricted key.
//
// Two methods, two very different cost profiles -- see Google's docs:
//   - renderVideo: idempotent. Calling it again for an address that's already been
//     rendered just returns current state without re-rendering or re-billing. Safe
//     to poll repeatedly.
//   - lookupVideo: BILLABLE whenever it returns playable URIs. Google's own docs:
//     "Receiving a video is a billable event, so callers of this method should be
//     ready to use the returned URIs at the time of request." The returned URIs are
//     signed and short-lived -- never cache them, call this at most once per
//     address-transition, only when actually about to show the video to a viewer.

const AERIAL_BASE = 'https://aerialview.googleapis.com/v1/videos';

export type AerialViewState = 'ACTIVE' | 'PROCESSING' | 'ERROR';

export interface AerialViewUris {
  landscapeUri: string;
  portraitUri: string;
}

function apiKey(): string {
  const key = process.env.GOOGLE_AERIAL_VIEW_API_KEY;
  if (!key) throw new Error('GOOGLE_AERIAL_VIEW_API_KEY not configured');
  return key;
}

// Poll-safe, never billable -- checks (and if needed, queues) a render for this address.
export async function checkOrRenderVideo(address: string): Promise<AerialViewState> {
  const res = await fetch(`${AERIAL_BASE}:renderVideo?key=${apiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  if (!res.ok) return 'ERROR';
  const json = await res.json().catch(() => null);
  const state = json?.state as string | undefined;
  if (state === 'ACTIVE') return 'ACTIVE';
  if (state === 'PROCESSING' || state === 'STATE_UNSPECIFIED') return 'PROCESSING';
  return 'ERROR'; // unknown/missing state -- caller gives up, does not retry indefinitely
}

// `uris` is a map of media-type -> {landscapeUri, portraitUri} (confirmed live keys:
// IMAGE, MP4_LOW, MP4_MEDIUM, MP4_HIGH, DASH, HLS) -- NOT a flat object. IMAGE is a
// static thumbnail, not a video. DASH/HLS are streaming manifests that need MSE/hls.js
// support. MP4_* are direct, plain-<video>-playable files -- prefer the smallest
// (MP4_LOW, ~1-3MB) since this renders in a small card, not a full-screen player.
const VIDEO_KEY_PREFERENCE = ['MP4_LOW', 'MP4_MEDIUM', 'MP4_HIGH'] as const;

// BILLABLE -- call exactly once, only when about to hand the URI to a viewer.
// Never call this speculatively or inside a poll loop.
export async function lookupVideoUris(address: string): Promise<AerialViewUris | null> {
  const url = `${AERIAL_BASE}:lookupVideo?address=${encodeURIComponent(address)}&key=${apiKey()}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  if (json?.state !== 'ACTIVE' || !json?.uris) return null;
  for (const key of VIDEO_KEY_PREFERENCE) {
    const entry = json.uris[key] as { landscapeUri?: string; portraitUri?: string } | undefined;
    if (entry?.landscapeUri) {
      return { landscapeUri: entry.landscapeUri, portraitUri: entry.portraitUri ?? entry.landscapeUri };
    }
  }
  return null;
}
