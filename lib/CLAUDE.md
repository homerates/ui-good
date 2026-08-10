# lib/ — Hard Rules

## AMI Qualifier — County Resolution (app/api/ami-qualifier/route.ts)

**Strategy order is load-bearing — do not reorder without testing all paths.**
S0: trusted coordinates (lat/lng from a Google Places selection) → `geocodeCoordinates()` → derive county from GEOID[0:5] (added 2026-08-10, purely additive — only fires when the caller supplies lat/lng, never changes S1-S4 behavior). Fixes bare city-name inputs like "Menifee, CA" whose city name ≠ county name, which S3 below cannot resolve. Runs before S1 but does not need to "win" — if S1's ZIP match also fires (e.g. a full address was selected), it overwrites S0's result harmlessly since both resolve to the same county.
S1: ZIP → geo_crosswalk (extractZip must use LAST 5-digit match — house numbers like 12104 appear first)
S2: county name → hud_features ilike (strips "County/Parish/Borough" suffix before query)
S3: city+state → hud_features ilike (two-comma form first, bare "City, ST" fallback) — **only matches when city name equals county name** (e.g. "Ventura, CA", "Sacramento, CA"); most CA cities don't share their county's name, which is why S0 exists.
S4: full-address geocoder → derive county from GEOID[0:5] (only fires when S1-S3 all fail; gated on the input starting with a house number, since the Census onelineaddress geocoder cannot resolve bare city names — confirmed live 2026-08-10, returns zero `addressMatches` for e.g. "Menifee, CA")

**geo_crosswalk returns null county_name for many ZIPs — that's expected.** The HUD override later fills it in from `hud_features`.

**Do not add a server-side Google Geocoding API call.** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is HTTP-referrer-restricted (required for client-side Maps JS/Places use) and returns `REQUEST_DENIED` when called server-to-server (confirmed live 2026-08-10) — it cannot geocode from an API route. S0 gets its lat/lng from the client instead: `AddressAutocomplete`'s `onSelectPlace` callback fetches the `location` field via Places API (New) `Place.fetchFields()` (a Basic Data field, same tier as `formattedAddress` — no extra API-key restriction needed beyond what Places API (New) already requires), and the page passes those coordinates to this route. The route then only needs the Census coordinates endpoint (public, no key) to turn them into a county FIPS.

## Census Geocoder (lib/censusGeocoder.ts)

**Vintage fallback order:** `Current_Current` → `ACS2025_Current` → `ACS2024_Current`. Try in sequence; stop at first match. All three vintages return the same 2020 census tract boundaries — vintage only affects address match coverage. Applies to both `geocodeAddress()` (onelineaddress endpoint) and `geocodeCoordinates()` (coordinates endpoint, added 2026-08-10) — same vintage chain, different Census Geocoder endpoint.

**null return = valid no-match. GeocoderError = actual failure.** Callers must distinguish — null is cached, error is not. The `address_geocode_cache` table stores `vintage_used` alongside the GEOID. Note: `geocodeCoordinates()` does not write to this cache — it's keyed by normalized address text, not coordinates, and coordinate lookups are low-volume (only fire on an explicit AMI qualifier submission with a Places-selected location).

**`geocodeCoordinates()` response shape differs from `geocodeAddress()`.** No `addressMatches` wrapper — it's a direct spatial join, so the block-group data lives at `result.geographies['Census Block Groups'][0]` instead of `result.addressMatches[0].geographies[...]`. Same `STATE`/`COUNTY`/`TRACT` fields once you're there.

**GEOID structure:** `SS CCC TTTTTT` (2-char state FIPS + 3-char county FIPS + 6-char tract). `slice(0, 2)` = state, `slice(0, 5)` = county.

## FFIEC Eligibility (lib/ffiecEligibility.ts)

**Nonmetro counties (msa_md='99999') need state_fips filter.** `ffiec_mfi` has one row per state for msa_md=99999. Without `AND state_fips = $1`, Postgres returns an arbitrary state's MFI. Derive `state_fips = county_fips.slice(0, 2)` and always pass it to `mfiForMsaMd()`.
