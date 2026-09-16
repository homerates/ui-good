# AMI Qualifier — Lender/LO Capability Summary

_Factual summary of the tool as shipped. Every claim corresponds to a live data
table, a running API route, or a confirmed ETL result. Nothing below is
aspirational._

---

## 1. What the tool does

A lender, LO, or borrower enters a property address (or ZIP code / county), an
annual household income, and a household size. The tool returns a single,
consolidated qualification screen covering:

- HomeReady and Home Possible income eligibility against the current
  FHFA-published area median income for that county
- HUD-based DPA/CRA threshold (household-size-adjusted)
- The property's FFIEC census tract income level designation (Low / Moderate /
  Middle / Upper) under federal CRA guidelines
- Whether the tract is federally designated Distressed or Underserved
- An income comparison against the FFIEC area median family income (MFI) for the
  applicable MSA/MD — the standard 80%-of-MFI test used in CRA/HMDA community
  development lending analysis

The response is returned in a single API call. The underlying data is all from
published federal sources held in a local database, so lookups are
sub-second regardless of which federal portals are up or down.

---

## 2. Datasets

### 2a. FHFA Area Median Income (HomeReady / Home Possible)

- **Source:** FHFA/GSE AMI data as used by Fannie Mae (effective June 13, 2026)
  and Freddie Mac, loaded via the HomeRates `gse_ami` table
- **Fallback:** HUD FY2026 Income Limits (`hud_features` table) for counties not
  yet in the FHFA dataset
- **What it drives:** HomeReady and Home Possible pass/fail (income ≤ 80% of the
  4-person area AMI, unadjusted for household size per agency rules); DPA/CRA
  reference threshold at 120% of HUD household-size-adjusted AMI; income as a
  percentage of AMI shown on a visual meter
- **Thresholds returned:** 50% AMI, 80% AMI, 100% AMI (4-person), 120% AMI
  (HUD household-adjusted), and a size-adjusted AMI for the borrower's household

### 2b. FFIEC Census Tract Income Level (2025 data year)

- **Source:** FFIEC Census Flat File 2025, downloaded from ffiec.gov (released
  2025-07-10). ETL loaded **84,893 census tracts** into the `ffiec_census_tracts`
  table
- **Designations:** Low, Moderate, Middle, or Upper income — the four standard
  CRA tract classifications, computed from each tract's median family income as a
  percentage of the area MFI
- **What it drives:** `tract_income_level` returned per geocoded address; flag
  `tract_eligible` when the tract is Low or Moderate income (or Distressed /
  Underserved per 2c below)

### 2c. FFIEC Distressed & Underserved Tract Designations (2026 list)

- **Source:** FFIEC 2026 Distressed or Underserved Tracts list, published
  annually under the CRA Interagency Q&A. **4,270 tracts** flagged in the same
  `ffiec_census_tracts` table via a separate ETL pass
- **Context:** D&U designation applies to a subset of nonmetro tracts that meet
  specific economic hardship criteria (high poverty, persistent unemployment, or
  population loss). A tract can be D&U regardless of its income level
  classification
- **What it drives:** `distressed_underserved` boolean returned per geocoded
  address; counted in `tract_eligible` independently of the income-level
  classification

### 2d. FFIEC Estimated Median Family Income by MSA/MD (2025)

- **Source:** Column 14 (index 13) of the same FFIEC Census Flat File 2025,
  aggregated to one row per MSA/MD area in the `ffiec_mfi` table. **517 area
  entries** loaded (MSA/MD codes covering metropolitan and micropolitan areas;
  rural/nonmetro areas use statewide non-metro MFI figures)
- **What it drives:** The 80%-of-MFI income threshold (the federal CRA/HMDA
  standard for community development credit). Calculated as:
  `area MFI × household size factor × 0.80`
  using HUD's standard size adjustment factors (1-person: 70%, 2: 80%, 3: 90%,
  4: 100%, 5: 108%, 6: 116%, 7: 124%, 8: 132%)
- **Returned fields:** `ffiec_mfi_estimate` (raw area MFI), `ffiec_adjusted_limit`
  (size-adjusted 80% threshold), `income_eligible` (income ≤ that limit)

### 2e. Real-time address-to-census-tract geocoding

- **Source:** U.S. Census Bureau Geocoder API
  (`geocoding.geo.census.gov/geocoder/geographies/onelineaddress`)
- **Mechanism:** Returns a full 11-digit census tract GEOID
  (2-digit state + 3-digit county + 6-digit tract) that is looked up directly in
  the `ffiec_census_tracts` table
- **Caching:** Resolved address-to-tract mappings are cached locally in an
  `address_geocode_cache` table to avoid redundant API calls
- **Timeout:** 10-second limit per geocode request; service failures fall through
  to the county-level fallback (see Section 4)

---

## 3. What this replaces in a manual workflow

Without this tool, determining the complete area qualification picture for a
single property requires visiting at least three separate federal portals and
cross-referencing the results by hand:

| Task | Manual source |
|---|---|
| HomeReady AMI limit | Fannie Mae AMI Lookup Tool (`ami-lookup-tool.fanniemae.com`) |
| Home Possible AMI limit | Freddie Mac AMI and Property Eligibility Tool |
| HUD income limits (DPA / Section 8 thresholds) | HUD's online Income Limits database |
| Census tract income level (Low/Moderate/Middle/Upper) | FFIEC Geocode Map (`geomap.ffiec.gov/FFIECGeocMap`) — enter address, read tract designation and MSA/MD code |
| Distressed or Underserved status | Same FFIEC Geocode Map lookup, or FFIEC's separately published annual D&U list |
| Area MFI for the 80%-of-MFI calculation | FFIEC's published MFI tables, cross-referenced by MSA/MD code from the geocode result |
| 80% income threshold for the specific household size | Manual calculation: area MFI × size factor × 0.80 |

The AMI Qualifier returns all of the above in a single form submission, with
explicit sourcing called out in the result (FHFA vs. HUD fallback, geocoded tract
vs. county estimate).

---

## 4. Confidence levels and why they matter

The tool reports one of three resolution paths:

**`geocoded` (highest confidence)**
The address resolved to a specific 11-digit census tract GEOID via the Census
Bureau Geocoder. All FFIEC fields are tract-specific: the income level
designation, the D&U flag, and the area MFI are drawn from the data record for
that exact tract. This is the same lookup an examiner or underwriter would run on
geomap.ffiec.gov.

**`county_fallback` (reduced confidence)**
The input was a ZIP code, county name, or an address the Census Geocoder
couldn't match to a specific tract (service gap, new construction, non-standard
addressing). In this mode, the tool identifies the dominant MSA/MD for the
county (by counting which MSA/MD covers the most census tracts in that county)
and uses that area's MFI to compute the 80% threshold.

Critically: tract-level facts — income level designation (Low/Moderate/Middle/
Upper) and Distressed/Underserved status — are **not** shown in county_fallback
mode. Those designations are tract-specific; a county that contains both Moderate
and Upper tracts cannot be represented by a single designation without implying
false precision. The tool surfaces only the income threshold calculation in this
mode, and labels it explicitly as a county-level estimate.

**`unresolved`**
No FFIEC data could be linked to the input location. The main GSE/HUD AMI
calculation (HomeReady, Home Possible, DPA threshold) is still returned — the
FFIEC card is simply absent from the response.

The practical implication: to get the full FFIEC tract picture, the borrower
or LO should enter a complete street address, not just a ZIP or county name.
The form's location field accepts full street addresses and will trigger the
geocoded path when they resolve.

---

## 5. Important limitations

**This tool is a screening and estimation instrument based on published federal
data. It is not a lending determination, an AMI certification, or a program
eligibility finding.**

Specific caveats:

- **HomeReady / Home Possible:** The 80% AMI threshold used here matches the
  FHFA-published figures loaded into this database. Final eligibility requires
  running the subject property through DU or LPA, or verifying at the official
  Fannie Mae AMI Lookup Tool / Freddie Mac AMI Tool. The GSE underwriting systems
  are authoritative; this tool is a pre-screen.

- **FFIEC tract data currency:** The tract income level designations are from the
  FFIEC 2025 Census Flat File (the most recent release as of the build date of
  this tool, 2026-07-03). The FFIEC publishes updated data annually. Tracts near
  the boundary of income level bands may shift classifications in future years.

- **D&U list year:** The Distressed & Underserved designations are from the FFIEC
  2026 list. This list is also updated annually.

- **FFIEC MFI vs. FHFA AMI:** These are different figures published by different
  agencies for different purposes. The FFIEC MFI drives CRA community development
  lending analysis; the FHFA AMI drives HomeReady/Home Possible eligibility.
  The tool presents both separately and does not blend them.

- **County-level estimates:** When the result is `county_fallback`, the income
  threshold shown is based on the county's dominant MSA/MD, which may not match
  the specific neighborhood or census tract of the actual property. Get a street
  address for a definitive result.

- **DPA program counts:** The `dpaMatchCount` field shown in the GSE/HUD result
  reflects active DPA programs loaded into the HomeRates platform for lenders
  participating in its marketplace. It is not a comprehensive census of all
  available DPA programs in a given area.

---

_Build date: 2026-07-03. Seams 1–4 shipped to `dev` branch.
Data: FFIEC Census Flat File 2025 (2025-07-10 release), FFIEC D&U 2026 list,
FHFA GSE AMI 2026, HUD FY2026 Income Limits._
