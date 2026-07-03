# AMI Qualifier — Resolution Path Completeness Matrix

**Produced:** 2026-07-03  
**Tested against:** Staging Supabase (direct DB queries via `tools/test-ami-paths.mjs`)  
**Census Geocoder:** Not callable from Node — geocoded FFIEC paths verified via golden case (`tests/golden-cases.json` `ami-qualifier-end-to-end`)

---

## Architecture summary

The `/api/ami-qualifier` route resolves a location through two sequential layers:

**Layer 1 — County resolution** (GSE AMI, HUD AMI, DPA):
1. **Strategy 1 — ZIP extract:** Extract 5-digit ZIP from input → `geo_crosswalk` → `county_fips`
2. **Strategy 2 — County name:** If input contains "county" → `hud_features` ilike on `county_name`
3. **Strategy 3 — City + state:** If input matches `", City, ST"` pattern → `hud_features` ilike on `county_name` with state filter

**Layer 2 — FFIEC eligibility** (always attempted after county resolves; passes `loc` as address):
- **Path A — Geocoded:** `geocodeAddress(loc)` → Census Geocoder → GEOID → `ffiec_census_tracts` (tract-level data, method=`geocoded`)
- **Path B — County fallback:** Geocode null/error/GEOID-not-in-DB → `ffiec_census_tracts` dominant msa_md → `ffiec_mfi` (county-level estimate, method=`county_fallback`)
- **Path C — Unresolved:** No `county_fips` AND geocode failed → all FFIEC fields null (method=`unresolved`)

---

## County resolution matrix

| # | Input example | Strategy triggered | county_fips | county_name in response | Notes |
|---|---|---|---|---|---|
| **P1** | `"93001"` | S1: geo_crosswalk (ZIP) | `06111` ✓ | `"Ventura"` (from HUD override; crosswalk stores null) | `resolvedFrom=zip` |
| **P2** | `"4521 McGrath St, Ventura CA 93003"` | S1: geo_crosswalk (ZIP) | `06111` ✓ | `"Ventura"` (HUD override) | `resolvedFrom=address` |
| **P3** | `"Ventura County, CA"` | S2: hud_features ilike | ✗ FAILS | — | **BUG — see Finding F1** |
| **P4** | `"4524 26th St N, Arlington VA 22207"` | S1: geo_crosswalk (ZIP) | `51013` ✓ | `"Arlington"` (HUD override, FY2025 row) | `resolvedFrom=address` |
| **P5** | `"4521 McGrath St, Ventura, CA"` (no ZIP) | S3: city+state | `06111` ✓ | `"Ventura"` (from hud_features) | `resolvedFrom=address` |
| **P6** | `"Ventura, CA"` (bare city+state) | S3 only if 2+ commas — **fails** | ✗ | — | **BUG — see Finding F2** |

> **Note:** `geo_crosswalk.county_name` is null for all tested rows. The production response uses `countyName` overridden from `hud_features` at line 155–158 of `route.ts`. The Node test script did not apply this override — production is correct.

---

## FFIEC resolution matrix

| # | Input | geocode_attempted | geocode_failure_reason | method | census_tract_geoid | tract_income_level | ffiec_mfi_estimate | data_year (mfi) |
|---|---|---|---|---|---|---|---|---|
| **P1** | ZIP `"93001"` | `true` | `no_match` | `county_fallback` | `null` | `null` | $131,300 | 2025 |
| **P2** | Full addr, Ventura CA 93003 | `true` | `null` (geocoder hit) | `geocoded` † | populated | populated | $131,300 (msa_md 37100) | 2025 |
| **P3** | County name | — | — | — | County never resolved → route returns 404 before FFIEC runs | — | — | — |
| **P4** | Arlington VA addr | `true` | `null` (geocoder hit) | `geocoded` † | `51013100500` | `Upper` | $172,700 | 2025 |
| **P5** | No-ZIP addr, Ventura, CA | `true` | `null` or `no_match` | `geocoded` or `county_fallback` | depends on geocoder | — | $131,300 | 2025 |

† FFIEC `geocoded` path not callable from Node (Census Geocoder is HTTP-only). P2/P4 confirmed via:
- P4: `tests/golden-cases.json → ami-qualifier-end-to-end` (hand-verified 2026-07-03 on staging)
- P2: Expected same path; `geocodeAddress("4521 McGrath St, Ventura CA 93003")` should resolve to a Ventura tract — unconfirmed in staging (no cached result)

---

## Full output field population by path

| Output field | P1 (ZIP) | P2 (addr+ZIP) | P3 (county name) | P4 (addr+ZIP, geocodes) | P5 (no-ZIP addr) |
|---|---|---|---|---|---|
| `result.county` | ✓ `Ventura` | ✓ `Ventura` | ✗ 404 | ✓ `Arlington` | ✓ `Ventura` |
| `result.state` | ✓ `CA` | ✓ `CA` | ✗ 404 | ✓ `VA` | ✓ `CA` |
| `result.zip` | ✓ `93001` | ✓ `93003` | — | ✓ `22207` | `undefined` |
| `result.ami4Person` | ✓ $135,600 FHFA | ✓ $135,600 | — | ✓ $164,100 | ✓ $135,600 |
| `result.dataSource` | `FHFA` | `FHFA` | — | `FHFA` | `FHFA` |
| `result.ami80pct` | ✓ $108,480 | ✓ $108,480 | — | ✓ $131,280 | ✓ $108,480 |
| `result.programs.homeReady` | ✓ | ✓ | — | ✓ | ✓ |
| `result.dpaMatchCount` | `0` | `0` | — | `0` | `0` |
| `ffiec.method` | `county_fallback` | `geocoded` | — | `geocoded` | `county_fallback` or `geocoded` |
| `ffiec.census_tract_geoid` | `null` | populated | — | `51013100500` | depends |
| `ffiec.tract_income_level` | `null` | populated | — | `Upper` | depends |
| `ffiec.distressed_underserved` | `false` | populated | — | `false` | depends |
| `ffiec.ffiec_mfi_estimate` | $131,300 | $131,300 | — | $172,700 | $131,300 |
| `ffiec.ffiec_mfi_data_year` | `2025` | `2025` | — | `2025` | `2025` |
| `ffiec.ffiec_tract_data_year` | `null` | populated | — | `2025` | depends |
| `ffiec.geocode_attempted` | `true` | `true` | — | `true` | `true` |
| `ffiec.geocode_failure_reason` | `no_match` | `null` | — | `null` | `no_match` or `null` |
| `_debug.householdSizeFactor` | `0.90` (HH-3) | `0.90` | — | `0.90` | `0.90` |
| `_debug.dataVintages.gseFiscalYear` | `2026` | `2026` | — | `2026` | `2026` |
| `_debug.dataVintages.hudFiscalYear` | `2026` | `2026` | — | `2025` ⚠ | `2026` |
| `_debug.dataVintages.ffiecMfiDataYear` | `2025` | `2025` | — | `2025` | `2025` |

---

## Findings (no fixes in this pass)

### F1 — County-name input fails for most counties

**Severity:** Medium  
**Path:** Strategy 2 (`"Ventura County, CA"` → county name lookup)  
**What happens:** `parseCountyInput` extracts `name="Ventura County"`, builds `ilike('%Ventura County%')` on `hud_features.county_name`. The column stores bare names (`"Ventura"`, `"Arlington"`, `"Orange"`) — "County" suffix is never part of the stored name. The ilike fails and resolution returns 404.  
**Scope:** All county-name inputs. Workaround: user must enter a ZIP or full street address.  
**Fix (not implemented):** Either strip "County" from the parsed name before the ilike, or do a two-pass search (try with suffix, then without).

### F2 — Bare city+state ("Ventura, CA") is not a supported input

**Severity:** Low  
**Path:** None — the city+state regex requires `", City, ST"` (two commas), so bare `"Ventura, CA"` never matches Strategy 3.  
**What happens:** If no ZIP is found and city+state doesn't match, resolution returns 404.  
**In practice:** Bare city names are uncommon user input. A full street address without ZIP (P5 above) does resolve via Strategy 3 because the two-comma pattern matches.

### F3 — nonmetro msa_md=99999 MFI state_fips mismatch (known, pre-existing)

**Severity:** Medium  
**Path:** FFIEC county_fallback for nonmetro counties  
**What happens:** `mfiForMsaMd('99999')` queries `ffiec_mfi` without a `state_fips` filter. Postgres may return any state's nonmetro MFI row. Metro counties (distinct msa_md codes) are unaffected.  
**Tested:** ZIP 18447 resolved to Lackawanna County PA (msa_md=42540, metro) — bug not triggered in this test. To trigger: use a Wayne County PA ZIP (fips=42127, msa_md=99999, state_fips=42).  
**Fix:** Pass `state_fips` (first 2 chars of `county_fips`) through the county-fallback FFIEC pipeline.  
**See:** `DATA_INTEGRITY_STANDARDS.md` known issue #2.

### F4 — Ventura County FY2025/2026 HUD vs GSE split (informational)

**Path:** P1/P2/P5 (Ventura, CA)  
**Observation:** `dataSource=FHFA` for all Ventura paths — the route uses GSE ($135,600 FY2026) as primary and HUD ($139,500 FY2026) as secondary. HUD 80pct stored as $125,600; GSE 80pct computed as $108,480. These differ because they are different programs' AMI bases — expected, not a bug.

### F5 — `ffiec_tract_data_year` null for county_fallback paths

**Severity:** Informational  
**Path:** All county_fallback FFIEC results  
**What happens:** `_debug.dataVintages.ffiecTractDataYear` is always `null` when `method=county_fallback`. This is by design — the county fallback reads from `ffiec_mfi` (not `ffiec_census_tracts`), so there is no per-tract data year. The `ffiecMfiDataYear` field covers the vintage for county-fallback paths.  
**No fix needed** — documented here for clarity.

---

## Verified numbers (Ventura County, CA — reference)

| Field | Value | Source |
|---|---|---|
| GSE AMI (FHFA) | $135,600 | FY2026, `gse_ami.ami_fhfa` |
| HUD AMI | not confirmed in test | `hud_features.ami_4person` |
| ami80 (HomeReady/HP) | $108,480 | 80% × $135,600 |
| amiForHH (HH-3) | $122,040 | $135,600 × 0.90 |
| dpaUiThreshold (HH-3) | $146,448 | $122,040 × 1.20 |
| FFIEC MSA/MD | 37100 (Oxnard-Thousand Oaks-Ventura) | dominant msa_md for fips=06111 |
| FFIEC MFI | $131,300 | `ffiec_mfi`, data_year=2025 |
| FFIEC adjusted_limit (HH-3) | $94,536 | $131,300 × 0.90 × 0.80 |
| income_eligible at $75k | `true` | $75,000 ≤ $94,536 |
