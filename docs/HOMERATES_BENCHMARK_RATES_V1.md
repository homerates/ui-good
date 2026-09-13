# HomeRates Intelligence Gateway — Benchmark Rates Contract V1

Companion to `docs/HOMERATES_EXTERNAL_PROPERTY_INTELLIGENCE_V1.md`. Same
Gateway (`app/api/mcp/property-intelligence/route.ts`), same OAuth resource,
a second tool: `get_benchmark_rates`. Built North Star Workstream 10
(2026-09-10) — see `ARCHITECTURE_DECISIONS.md` AD-24 for the full rationale.

## 1. Purpose

Give an external AI system a current, sourced, national mortgage-rate
benchmark it should not generate from model memory — training data is never
current for a rate that moves weekly, and a model has no way to know on its
own whether the number it recalls is from six months or two years ago.

## 2. Scope — what this tool is, and deliberately is not

**Is:** three neutral, national, published average rates (30-year fixed,
15-year fixed, 5/1 ARM), each sourced from the same FRED series family
(`MORTGAGE30US`/`MORTGAGE15US`/`MORTGAGE5US`) already exposed via Property
Intelligence's `financing_intelligence.market_rate` field. Address-independent
and borrower-independent — no input required for these three.

**As of V1.1 (2026-09-12, AD-36), ALSO is:** `llpa_adjusted_rate` — the
real, live OBMMI-observed 30-year conventional rate for a stated
credit-score/LTV profile (optional `credit_score`/`ltv_pct` inputs; default
"well-qualified" profile 740/80 when omitted). This is a deliberate,
explicit exception to the boundary below, made because Rate Oracle is meant
to be a genuinely more useful synthesizer than a bare rate survey — not
because the boundary itself was wrong. See AD-36 in
`ARCHITECTURE_DECISIONS.md` for the full reasoning, including why this does
not reopen the original Rate Role Correction bug (that bug was a mislabeled
number, not the mere existence of credit/LTV segmentation — this field
always ships with its own `assumed_profile` so it can never be presented as
neutral).

**Still is not, and still never will be via this tool:**
- The Decision Score (Autonomous DSC) engine's methodology or output — a
  locked trade secret, explicitly out of scope for this or any future
  widening of this tool.
- A quote, pre-approval, or offer to any individual.
- A property-specific rate — use `homerates_property_intelligence` for that.

**Still true, unchanged by V1.1:** `thirty_year_fixed`/`fifteen_year_fixed`/
`five_one_arm` never carry a credit score, LTV, or any borrower-specific
adjustment — the original Rate Role Correction boundary is fully intact for
those three fields, verified by `test-rate-role-correction.ts` and
`test-benchmark-rates-gateway.ts`'s B5 check.

## 3. Request contract

`tools/call` with `name: "homerates_rate_oracle"` (legacy alias
`get_benchmark_rates` still callable, not advertised). Optional arguments:

```json
{ "credit_score": 720, "ltv_pct": 90 }
```

Both optional; omit either or both to use the default well-qualified
profile (740/80) for `llpa_adjusted_rate`. `credit_score` must be 1-850,
`ltv_pct` must be 1-100 — an out-of-range value returns `INVALID_REQUEST`.

## 4. Response contract (`benchmark-rates-v1.1`)

```json
{
  "contract_version": "benchmark-rates-v1.1",
  "thirty_year_fixed": {
    "value": 6.71,
    "series_id": "MORTGAGE30US",
    "series_label": "30-Year Fixed Rate Mortgage Average",
    "source": "Federal Reserve Bank of St. Louis (FRED)",
    "as_of": "2026-09-03",
    "retrieved_at": "2026-09-10T19:31:45.530Z",
    "freshness_status": "CURRENT",
    "claim_type": "MARKET FACT"
  },
  "fifteen_year_fixed": { "...": "same shape, MORTGAGE15US" },
  "five_one_arm": { "...": "same shape, MORTGAGE5US" },
  "llpa_adjusted_rate": {
    "value": 6.833,
    "series_id": "OBMMIC30YFLVLE80FGE740",
    "series_label": "30Y Conforming: LTV<=80, FICO>=740",
    "source": "Rate data sourced from Optimal Blue Mortgage Market Indices (OBMMI)...",
    "as_of": "2026-09-10",
    "retrieved_at": "2026-09-12T23:49:28.777Z",
    "freshness_status": "CURRENT",
    "assumed_profile": { "credit_score": 740, "ltv_pct": 80, "is_default_profile": true },
    "claim_type": "MARKET FACT"
  },
  "disclaimer": "HomeRates.ai is an independent educational tool — ..."
}
```

`value` is `null`, never `0`, when a series has no synced observation at all
(`freshness_status: "UNAVAILABLE"` in that case) — true for all four rate
fields.

## 5. Freshness semantics (Phase 6 finding)

`as_of` is the FRED observation's own date — the date the underlying data
point represents, never the timestamp this response happened to be assembled.
`retrieved_at` is that latter thing, kept as a separate field precisely so a
caller never conflates the two.

These three series are Freddie Mac PMMS weekly averages, not daily
prints — `freshness_status` uses a **10-day** threshold (not
`lib/gateway/outputShaping.ts`'s 30-day property-enrichment threshold, a
different question) to tolerate one missed cron day or a holiday-shifted
publish without misclassifying a genuinely fresh weekly print as stale.

**Real, live finding from this workstream's own test run:** `MORTGAGE5US`
(5/1 ARM) had not received a new FRED observation since **2022-11-10** at
time of writing — `freshness_status: "STALE"` correctly flags this rather
than presenting a multi-year-old number as current. This tool is explicitly
designed to surface exactly this kind of staleness rather than hide it.

`llpa_adjusted_rate` uses its own, narrower thresholds (**3-day** STALE /
30-day UNAVAILABLE) reflecting OBMMI's real daily publish cadence — a
different, tighter cadence than the weekly PMMS series above, not the same
10-day threshold reused for a different-frequency series.

## 6. Auth / scope

Accepts either `property_intelligence:read` (so the existing OAuth/ChatGPT
integration works immediately, zero re-authorization) or the narrower
`benchmark_rates:read` (for a future rates-only partner credential). Same
kill-switch, rate-limit, and fail-closed schema-validation posture as
Property Intelligence — see `lib/gateway/benchmarkRatesGateway.ts`.

## 7. Versioning

- **V1 (2026-09-10):** initial version. Three neutral rates only.
- **V1.1 (2026-09-12, AD-36):** adds `llpa_adjusted_rate` + optional
  `credit_score`/`ltv_pct` inputs. Additive only — the three V1 fields are
  byte-for-byte unchanged in shape and meaning.
