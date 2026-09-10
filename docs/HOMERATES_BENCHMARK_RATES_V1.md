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
and borrower-independent — no input at all.

**Is not, and never will be via this tool:**
- An OBMMI credit/LTV-segmented rate, or an LLPA-adjusted rate. Both assume a
  specific borrower profile (credit score, LTV) this tool never collects —
  the exact boundary `lib/gateway/outputShaping.ts`'s Rate Role Correction
  already enforces for Property Intelligence, applied here rather than
  re-litigated. `lib/market-data/benchmarkRates.ts` and
  `lib/gateway/benchmarkRatesGateway.ts` never import anything from
  `lib/pricing/llpa-engine.ts` or read an OBMMI series.
- A quote, pre-approval, or offer to any individual.
- A property-specific rate — use `get_property_intelligence` for that.

## 3. Request contract

`tools/call` with `name: "get_benchmark_rates"`, no arguments
(`inputSchema: { type: "object", properties: {}, additionalProperties: false }`).

## 4. Response contract (`benchmark-rates-v1`)

```json
{
  "contract_version": "benchmark-rates-v1",
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
  "disclaimer": "HomeRates.ai is an independent educational tool — ..."
}
```

`value` is `null`, never `0`, when a series has no synced observation at all
(`freshness_status: "UNAVAILABLE"` in that case).

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

## 6. Auth / scope

Accepts either `property_intelligence:read` (so the existing OAuth/ChatGPT
integration works immediately, zero re-authorization) or the narrower
`benchmark_rates:read` (for a future rates-only partner credential). Same
kill-switch, rate-limit, and fail-closed schema-validation posture as
Property Intelligence — see `lib/gateway/benchmarkRatesGateway.ts`.

## 7. Versioning

- **V1 (2026-09-10):** initial version. Three rates, as documented above.
