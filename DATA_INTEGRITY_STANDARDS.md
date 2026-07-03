# DATA_INTEGRITY_STANDARDS.md

**Status:** Hard rule, same enforcement tier as `BRAND.md`. Applies to any tool that produces a number, eligibility determination, or "you may qualify" statement shown to a consumer or lender — currently: AMI Qualifier, Loan Limits, and any future program-matching tool.

## The rules

**R1 — Every consumer/lender-facing number or determination must be traceable to a named, dated data source.** No undocumented, unverified, or "seems about right" figure may ship. If a number's source can't be named and dated, it doesn't go live.

**R2 — Negative results are shown as clearly as positive ones.** A program or check that was evaluated and failed must say so explicitly, with a plain-language reason. Silently omitting a program a user doesn't qualify for is a violation — it recreates the false-hope pattern this whole tool exists to avoid.

**R3 — Every dataset has a documented staleness threshold, and the app checks it.** Manual annual refresh is fine as a process; manual-with-no-safety-net is not. Run `tools/check-data-freshness.mjs` before any lender demo, before sharing output externally, and after any ETL refresh to confirm the load succeeded. If a dataset exceeds its threshold, that fact must be disclosed or the figure must be withheld.

**R4 — Every dataset has at least one golden test case.** A known input with a hand-verified expected output, re-run after any ETL refresh or logic change touching that dataset. See `tests/golden-cases.json`.

---

## Dataset registry

_Last audit: 2026-07-03. Run `node tools/check-data-freshness.mjs` to check current status._

| Dataset | Source | Vintage / Year | Refresh cadence | Last refreshed (DB) | Staleness threshold | ETL script | What it CANNOT tell you |
|---|---|---|---|---|---|---|---|
| HUD Area Median Income | HUD User API `https://www.huduser.gov/hudapi/public` (requires free token) | FY2026 (Oct 2025–Sept 2026); some counties still on FY2025 row | Annual — HUD publishes April–May | 2026-06-27 (FY2026 partial load; some counties FY2025 only) | 14 months from `MAX(updated_at)` on `hud_features` | `tools/etl-hud.mjs` | Whether a specific county received FY2026 data in the last ETL run — the tool silently uses the most-recent available fiscal year per county, which may be FY2025 even after a FY2026 ETL. Always check `dataSource` field in the response. |
| FHFA GSE AMI | Freddie Mac MFI raw file `https://sf.freddiemac.com/docs/csv/2026-mfi-raw-file.csv` (same AMI Fannie Mae uses for HomeReady) | FY2026 | Annual — FHFA publishes June | 2026-06-27 | 14 months from `MAX(updated_at)` on `gse_ami` | `tools/etl-gse-ami.mjs` | FHA, VA, USDA, or jumbo AMI — GSE only. AMI is uniform within a county; sub-county variation (e.g., high-cost corridors within a county) is not captured here. **Household-size note:** HomeReady and Home Possible use a flat 80% of area AMI with no household-size adjustment — the `ami80` threshold in `app/api/ami-qualifier/route.ts` is intentionally the same for a 2-person and 4-person household. This is correct per Fannie Mae/Freddie Mac guidelines; do not add size-factor adjustment in a future session without re-verifying against current agency guidelines first (this question was re-derived once already, 2026-07-03). |
| FFIEC Census Tract Income Level | FFIEC Census Flat File 2025, manually downloaded from `https://www.ffiec.gov/data/census/flat-files` (ffiec.gov blocks programmatic access) | 2025 (released 2025-07-10; 84,893 tracts loaded) | Annual — FFIEC publishes July; tract *boundaries* are Census-decennial, fixed until 2030 | 2026-07-03 | 14 months from `MAX(updated_at)` on `ffiec_census_tracts` | `tools/etl-ffiec.mjs` | Tract income level when only a ZIP or county is provided — the tool returns `county_fallback` and cannot determine per-tract classification without a geocodable street address. |
| FFIEC CRA Distressed & Underserved | FFIEC 2026 D&U list, manually downloaded from `https://www.ffiec.gov/data/cra/distressed` (same ETL pass, exported as CSV from Excel) | 2026 designation year (overlaid onto 2025 tract records; 4,270 tracts flagged) | Annual — FFIEC updates alongside CRA exam cycle | 2026-07-03 | Same row as tract income level above | `tools/etl-ffiec.mjs` | D&U status for a ZIP or county input — same geocode requirement as tract income level. D&U is only designated for nonmetro tracts; metro tracts are never D&U regardless of income level. |
| FFIEC Estimated Median Family Income | FFIEC Census Flat File 2025, column 14 (aggregated per MSA/MD; 517 area entries) | 2025 | Annual | 2026-07-03 | 14 months from `MAX(data_year)` on `ffiec_mfi` | `tools/etl-ffiec.mjs` | **Known bug (2026-07-03):** For nonmetro counties (`msa_md = 99999`), `ffiec_mfi` has one row per state. The current eligibility lookup (`lib/ffiecEligibility.ts`) does not filter by `state_fips` when calling `mfiForMsaMd()`, so nonmetro counties receive the first row Postgres returns — which may be the wrong state's MFI. Fix: pass `state_fips` through the county-fallback pipeline. Metro counties (distinct MSA/MD codes) are not affected. |
| DPA Programs | Internally managed — lenders declare their own programs via HomeRates admin UI (`/api/admin/dpa-programs`). No external data source. | N/A — platform inventory | On-demand as lenders onboard | 0 active programs as of 2026-07-03 | N/A | None | A result of 0 matched programs means no HomeRates marketplace lenders have posted active DPA programs — not that no DPA programs exist in the area. This is NOT a comprehensive DPA inventory. |
| FEMA National Risk Index | FEMA NRI via ArcGIS REST API `https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0` | 2024 NRI release (no `data_year` column in table; source release stated in migration 009 comment) | Irregular — FEMA updates approximately every 1–2 years | 2026-04-07 | 30 months from `MAX(updated_at)` on `fema_risk` | `tools/etl-fema.mjs` | Sub-county or parcel-level risk. Insurance pressure and premium delta estimates are heuristics derived from composite score and dominant hazard — not actuarial figures. Does not account for property elevation, construction type, flood-zone mapping (FIRM), or local mitigation. |
| Conforming Loan Limits | FHFA `FullCountyLoanLimitList2026_HERA-BASED_FINAL_FLAT.xlsx` (encoded in source) | CY2026 (effective Jan 1, 2026) | Annual — FHFA publishes November for following calendar year | Hardcoded in `lib/loanLimitsNational2026.ts` + `lib/loanLimits2026.ts`; no DB table | **Manual check only** — search both files for `2026` year constant before each FHFA November release | No ETL script; static TypeScript data | Non-listed counties default to the national baseline silently. Does not include FHA, VA, USDA, or jumbo limits. Counties added or reclassified after the last file encoding will use the wrong limits. |

---

## Known data quality issues

_Added to the registry "What it CANNOT tell you" column above; listed here for visibility:_

1. **HUD FY2026 partial load**: As of 2026-06-27, some counties (including Arlington County VA `51013`) have FY2025 rows as their most recent. The `ami-qualifier` route uses GSE (FHFA) as primary when available, so this only affects counties missing from the `gse_ami` table entirely. Track by running: `SELECT COUNT(*) FROM hud_features WHERE fiscal_year = 2026`.

2. **FFIEC nonmetro MFI state mismatch — FIXED 2026-07-03**: `msa_md = 99999` rows in `ffiec_mfi` are keyed `(msa_md, state_fips, data_year)`. `mfiForMsaMd()` now passes `state_fips` (derived from `county_fips.slice(0, 2)`) and filters `WHERE msa_md = '99999' AND state_fips = $1`. Before fix: Postgres returned Wyoming's $99,300 MFI for Wayne County PA instead of PA's $83,700. Golden test case added: `ffiec-mfi-wayne-county-pa-nonmetro-state-fips`.

3. **DPA programs: 0 active**: No lenders have posted active programs to the platform as of 2026-07-03. The `dpaMatchCount` field will always return 0 until at least one lender onboards a program. This is expected product state, not a data error — but should be documented when sharing AMI Qualifier output externally.

4. **ami50pct field: wrong multiplier for non-4-person households — FIXED 2026-07-03**: `ami50pct` was computed as `amiForHH × 0.50` (household-size-adjusted HUD base), which returned $54,240 for HH=2 in Ventura ($108,480 × 0.50) — appearing to be "40% of AMI" when divided by FHFA's $135,600. Fixed: `ami50pct` is now `Math.round(ami4 × 0.50)` — flat 50% of the FHFA 4-person AMI, same base and no-size-adjustment policy as `ami80pct`. Ventura now returns $67,800 regardless of household size. HUD's stored `ami_50pct` ($78,500 for Ventura, using a different median baseline) is intentionally not used for this field. Golden test case added: `ami50pct-flat-50-ventura`.

5. **extractZip() house-number collision — FIXED 2026-07-03**: `extractZip()` matched the first 5-digit sequence in the address string. Full addresses with 5-digit house numbers (e.g. "12104 Topa Vista Rd, Santa Paula, CA 93060") returned house number "12104" as the ZIP instead of "93060". "12104" is not in `geo_crosswalk`, so Strategies 1-3 all failed → 404. Fix: use `[...input.matchAll(/\b(\d{5})\b/g)]` and return the last match — ZIP codes always appear after the street name in US address strings. Golden test case added: `ami-qualifier-12104-topa-vista-rd-santa-paula`.

6. **Census Geocoder miss rate (documented 2026-07-03)**: The Census Geocoder returns no match for some valid US addresses. Tested: `344 Campbell Ct, Santa Paula, CA 93060` — all formatting variants fail (exact string, no comma before state, "Court" spelled out, no commas, no ZIP). Controls (Arlington VA, DC, Ventura CA, Los Angeles) geocode correctly. Root cause: address simply not in Census geocoder database (rural routes, newer developments, or certain street naming conventions). This is not a formatting problem — `AddressAutocomplete` correctly strips `, USA` from Google's `formatted_address` before the geocoder call. The `county_fallback` FFIEC path handles these gracefully with no degradation in county-level results. Match rate for a broader test set is not yet quantified.

---

## Staleness check

Run before any lender demo, when drafting external materials, or after any ETL refresh:

```sh
node --env-file=.env.local tools/check-data-freshness.mjs
```

Exits 0 if all datasets are fresh, exits 1 if any are STALE. See that file for threshold definitions.

---

## Golden test cases

See `tests/golden-cases.json` for one verified input → expected output per dataset.
The AMI Qualifier end-to-end case (Seam 3, verified 2026-07-03):

- **Input:** `4524 26th St N, Arlington VA 22207`, income `$95,000`, household size `3`
- **Expected:** `census_tract_geoid: 51013100500`, `tract_income_level: Upper`, `distressed_underserved: false`, `ffiec_mfi_estimate: 172700`, `ffiec_adjusted_limit: 124344`, `income_eligible: true`
