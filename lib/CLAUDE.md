# lib/ — Hard Rules

## AMI Qualifier — County Resolution (app/api/ami-qualifier/route.ts)

**Strategy order is load-bearing — do not reorder without testing all 4 paths.**
S1: ZIP → geo_crosswalk (extractZip must use LAST 5-digit match — house numbers like 12104 appear first)
S2: county name → hud_features ilike (strips "County/Parish/Borough" suffix before query)
S3: city+state → hud_features ilike (two-comma form first, bare "City, ST" fallback)
S4: full-address geocoder → derive county from GEOID[0:5] (only fires when S1-S3 all fail)

**geo_crosswalk returns null county_name for many ZIPs — that's expected.** The HUD override later fills it in from `hud_features`.

## Census Geocoder (lib/censusGeocoder.ts)

**Vintage fallback order:** `Current_Current` → `ACS2025_Current` → `ACS2024_Current`. Try in sequence; stop at first match. All three vintages return the same 2020 census tract boundaries — vintage only affects address match coverage.

**null return = valid no-match. GeocoderError = actual failure.** Callers must distinguish — null is cached, error is not. The `address_geocode_cache` table stores `vintage_used` alongside the GEOID.

**GEOID structure:** `SS CCC TTTTTT` (2-char state FIPS + 3-char county FIPS + 6-char tract). `slice(0, 2)` = state, `slice(0, 5)` = county.

## FFIEC Eligibility (lib/ffiecEligibility.ts)

**Nonmetro counties (msa_md='99999') need state_fips filter.** `ffiec_mfi` has one row per state for msa_md=99999. Without `AND state_fips = $1`, Postgres returns an arbitrary state's MFI. Derive `state_fips = county_fips.slice(0, 2)` and always pass it to `mfiForMsaMd()`.
