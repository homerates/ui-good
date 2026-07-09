# components/ Hard Rules

## PropertyPhoto and PropertyMap

### Do not remove `return_error_code=true` from Street View URLs

`PropertyPhoto` uses a tier-based fallback: Street View → satellite → empty gradient.
The fallback only works because `return_error_code=true` makes the Street View Static API
return a real HTTP error (not the grey "no imagery" placeholder image) when no imagery
exists. Without this parameter, `onError` never fires and every Street View miss silently
shows a grey box. This parameter looks like noise in a URL — it is not.

### The `key={tier}` pattern is load-bearing

`PropertyPhoto` changes the `<img>` element's `key` prop when `tier` changes. This forces
React to unmount and remount the element, which fires a new image load for the fallback URL.
Without `key={tier}`, React reuses the same DOM node and the src change may not re-trigger
a load in all browsers.

### Provider-agnostic interface

`PropertyMap` and `PropertyPhoto` accept plain `address`, `lat`, `lng` props — no Google
types in the public interface. API key and URL construction are internal. Call sites must
not construct `maps.googleapis.com` URLs directly — use these components instead.

### PropertyMap vs PropertyPhoto — when to use which

- **PropertyMap** — renders a map (satellite or roadmap view). Use when the map *is* the
  content (property location on a result card, overlay with address label). No photos.
- **PropertyPhoto** — renders a real photo first (Street View), falls back to satellite map
  if unavailable. Use in list rows, thumbnails, and sidebars where a photo of the property
  is the goal and a map is only a last resort.

### Candidate pages not yet migrated

These pages still construct Google Maps URLs inline rather than using PropertyMap/PropertyPhoto.
Migrate when touching them:
- `app/home-report/page.tsx` — inline streetViewUrl / staticMapUrl strings
- `app/report/[token]/page.tsx` — constructs URLs via NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
- `app/wl-report/page.tsx` — heroPhoto / heroFB inline fallback chain
