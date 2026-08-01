// lib/addressNormalize.ts
// Shared helpers for reconciling an incoming address string against what's already stored
// in the `properties` table, keyed by `address_full`.
//
// Extracted 2026-07-31 after the THIRD occurrence today of duplicate `properties` rows for
// the same physical address — this time from punctuation variance (an extra comma before the
// zip, or a differently-placed comma) between what different callers pass in as the raw
// address string. The fuzzy-fallback match in app/api/homeowner/analysis/route.ts already
// strips commas before comparing candidates, so it correctly FINDS an existing loosely-
// matching row — but every write-back in that file (and the equivalent write path in
// app/api/property/lookup/route.ts, which had no fuzzy-match step at all) then upserted using
// a FRESHLY reconstructed key instead of the matched row's actual stored `address_full`. Since
// Supabase's upsert onConflict requires an exact match on the conflict target column, a key
// that merely *represents the same address* but isn't byte-identical to what's stored still
// creates a new row. The fix isn't a stricter normalizer — punctuation naturally varies by
// source (Google Places, a pasted Redfin URL, GPT-4o's own phrasing) — it's always writing
// back through whichever row was actually found, never a fresh reconstruction.
//
// No I/O — safe to import from either API route.

/** Lowercases, strips commas, collapses whitespace — for LOOSE comparison only, never as a
 *  storage key (existing address_full values must not be rewritten just to satisfy this). */
export function stripCommasAndSpaces(a: string): string {
  return a.toLowerCase().replace(/,\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

/** True if two address strings represent the same address once punctuation differences
 *  (comma placement, extra/missing commas) are ignored. Does NOT tolerate substantive
 *  differences — a different street name, house number, or missing ZIP still won't match. */
export function addressesMatchLoosely(a: string, b: string): boolean {
  return stripCommasAndSpaces(a) === stripCommasAndSpaces(b);
}

/** First N whitespace-separated tokens after loose normalization — used only to narrow a DB
 *  prefix query (`ilike address_full, '<prefix>%'`), never as an equality check on its own. */
export function addressPrefixTokens(a: string, n: number): string {
  return stripCommasAndSpaces(a).split(' ').slice(0, n).join(' ');
}
