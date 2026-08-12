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
// raw is included for debugging (e.g. surfaced behind a ?debug=1 flag in the route) --
// never logged or exposed by default.
export async function checkOrRenderVideo(address: string): Promise<{ state: AerialViewState; raw: unknown; httpStatus: number }> {
  const res = await fetch(`${AERIAL_BASE}:renderVideo?key=${apiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) return { state: 'ERROR', raw: json, httpStatus: res.status };
  const state = json?.state as string | undefined;
  if (state === 'ACTIVE') return { state: 'ACTIVE', raw: json, httpStatus: res.status };
  if (state === 'PROCESSING' || state === 'STATE_UNSPECIFIED') return { state: 'PROCESSING', raw: json, httpStatus: res.status };
  return { state: 'ERROR', raw: json, httpStatus: res.status }; // unknown/missing state -- caller gives up, does not retry indefinitely
}

// BILLABLE -- call exactly once, only when about to hand the URI to a viewer.
// Never call this speculatively or inside a poll loop.
// shape is included for debugging (e.g. surfaced behind ?debug=1) -- keys only,
// never the actual signed URI values.
export async function lookupVideoUris(address: string): Promise<{ uris: AerialViewUris | null; shape: unknown }> {
  const url = `${AERIAL_BASE}:lookupVideo?address=${encodeURIComponent(address)}&key=${apiKey()}`;
  const res = await fetch(url);
  if (!res.ok) return { uris: null, shape: { httpStatus: res.status } };
  const json = await res.json().catch(() => null);
  const shape = {
    httpStatus: res.status,
    state: json?.state,
    urisType: typeof json?.uris,
    urisKeys: json?.uris && typeof json.uris === 'object' ? Object.keys(json.uris) : null,
  };
  if (json?.state !== 'ACTIVE' || !json?.uris) return { uris: null, shape };
  // Per Google's docs, `uris` is a MAP of media-type -> {landscapeUri, portraitUri},
  // not a flat object -- take the first available entry.
  const first = Object.values(json.uris)[0] as { landscapeUri?: string; portraitUri?: string } | undefined;
  if (!first?.landscapeUri) return { uris: null, shape };
  return { uris: { landscapeUri: first.landscapeUri, portraitUri: first.portraitUri ?? first.landscapeUri }, shape };
}
