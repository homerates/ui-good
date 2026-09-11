// lib/market-data/benchmarkRates.ts
//
// North Star Workstream 10 -- Intelligence Gateway Capability Architecture.
// Address-independent, neutral national benchmark mortgage rates for the new
// external get_benchmark_rates tool. Reads ONLY the already-synced FRED
// series via lib/market-data/query.ts -- never calls FRED directly, never
// writes, never touches OBMMI/LLPA.
//
// Deliberately exposes ONLY the same neutral, national-average series family
// already proven safe for external exposure as
// lib/propertyIntelligence.ts's propertyMarketRate (which reads the
// identical MORTGAGE30US series) -- never an OBMMI credit/LTV-segmented rate
// or an LLPA-adjusted rate, both of which assume a specific borrower profile
// this address-independent, borrower-independent tool never collects. This
// is the same Rate Role Correction boundary already enforced in
// lib/gateway/outputShaping.ts, applied to a second tool rather than
// re-litigated -- see that file's own comments for the full history.

import { getLatest } from './query';

export type FreshnessStatus = 'CURRENT' | 'STALE' | 'UNAVAILABLE';

// FRED's mortgage-rate series (MORTGAGE30US/15US/5US) publish weekly
// (Freddie Mac PMMS, Thursdays) -- 10 days tolerates one missed cron day or
// a holiday-shifted publish without misclassifying a genuinely fresh weekly
// print as stale. This is a NEW, narrower threshold than
// lib/gateway/outputShaping.ts's 30-day STALE_THRESHOLD_MS, which measures
// property-enrichment recency, not rate recency -- a different question
// with a different natural cadence.
const STALE_THRESHOLD_MS = 10 * 24 * 60 * 60 * 1000;

// A series that hasn't published a new observation in a very long time isn't
// merely "stale" -- it has effectively stopped being published (Freddie Mac
// discontinued the 5/1 ARM PMMS series; FRED's MORTGAGE5US has carried no new
// observation since 2022-11-10, confirmed live during the "Intelligence
// Gateway Capability Architecture" workstream). Serving a multi-year-old
// number as merely "stale" would materially mislead a caller into treating it
// as a current-ish figure. 90 days is well beyond any plausible temporary
// sync outage (weekly cadence, 10-day CURRENT/STALE tolerance already above)
// but short enough to catch genuine discontinuation quickly -- past this
// point, the series is reported UNAVAILABLE and its value is withheld
// entirely, never presented as current or even approximately current.
const DISCONTINUED_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000;

const FRED_SOURCE_LABEL = 'Federal Reserve Bank of St. Louis (FRED)';

export interface BenchmarkRate {
  value: number | null;
  seriesId: string;
  seriesLabel: string;
  source: string;
  /** The FRED observation's own date -- never fetch/retrieval time. Null only when the series has no synced data at all. */
  asOf: string | null;
  /** When THIS response was assembled -- distinct from asOf. */
  retrievedAt: string;
  freshnessStatus: FreshnessStatus;
}

export interface BenchmarkRatesResult {
  thirtyYearFixed: BenchmarkRate;
  fifteenYearFixed: BenchmarkRate;
  fiveOneArm: BenchmarkRate;
}

const SERIES: { key: keyof BenchmarkRatesResult; seriesId: string; label: string }[] = [
  { key: 'thirtyYearFixed', seriesId: 'MORTGAGE30US', label: '30-Year Fixed Rate Mortgage Average' },
  { key: 'fifteenYearFixed', seriesId: 'MORTGAGE15US', label: '15-Year Fixed Rate Mortgage Average' },
  { key: 'fiveOneArm', seriesId: 'MORTGAGE5US', label: '5/1-Year Adjustable Rate Mortgage Average' },
];

function freshnessFor(asOf: string | null): FreshnessStatus {
  if (asOf == null) return 'UNAVAILABLE';
  const ageMs = Date.now() - new Date(asOf).getTime();
  if (ageMs > DISCONTINUED_THRESHOLD_MS) return 'UNAVAILABLE';
  return ageMs > STALE_THRESHOLD_MS ? 'STALE' : 'CURRENT';
}

export async function getBenchmarkRates(): Promise<BenchmarkRatesResult> {
  const retrievedAt = new Date().toISOString();
  const entries = await Promise.all(
    SERIES.map(async (s): Promise<[keyof BenchmarkRatesResult, BenchmarkRate]> => {
      const obs = await getLatest(s.seriesId);
      const asOf = obs?.observationDate ?? null;
      const freshnessStatus = freshnessFor(asOf);
      // A discontinued series withholds its VALUE entirely -- a caller must
      // never receive a real rate number labeled UNAVAILABLE (which would
      // invite "just ignore the label and use the number anyway"). asOf is
      // kept even when discontinued: showing the real last-observed date
      // ("last seen 2022-11-10") is honest, useful diagnostic context, not a
      // current-rate claim -- only the rate value itself is the thing that
      // must never be surfaced as if current.
      const value = freshnessStatus === 'UNAVAILABLE' ? null : (obs?.value ?? null);
      return [
        s.key,
        {
          value,
          seriesId: s.seriesId,
          seriesLabel: s.label,
          source: FRED_SOURCE_LABEL,
          asOf,
          retrievedAt,
          freshnessStatus,
        },
      ];
    }),
  );
  return Object.fromEntries(entries) as unknown as BenchmarkRatesResult;
}
