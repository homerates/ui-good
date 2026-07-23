// lib/market-data/registry.ts
// AD-11 Market Data Service — static registry of every standalone FRED series
// currently in use across the app, re-verified directly against source files
// (not from memory of the earlier Map-phase report) before finalizing:
//   - src/lib/fred.ts                        -> DGS10, MORTGAGE30US
//   - app/api/answers/route.ts (getFredSnapshot, ~L1420-1592)
//                                             -> DGS10, MORTGAGE30US, FEDFUNDS,
//                                                UNRATE, CPIAUCSL, MSPUS,
//                                                MORTGAGE15US, MORTGAGE5US,
//                                                DGS2, DGS30, T10Y2Y, SOFR,
//                                                HOUST, EXHOSLUSM495S, MSACSR,
//                                                CSUSHPINSA, RRVRUSQ156N,
//                                                PCEPILFE, CUSR0000SAH1
//   - app/api/rate-intelligence-engine/route.ts -> MORTGAGE30US
//   - app/api/rate-marketplace/route.ts       -> MORTGAGE30US (duplicate)
//   - app/api/answers/scenario/route.ts       -> MORTGAGE30US, DGS10
//   - app/api/rate-intelligence/route.ts      -> MORTGAGE30US, MORTGAGE15US,
//                                                DGS10, FEDFUNDS, CPIAUCSL
//   - app/api/ticker/route.ts                 -> EFFR (+ DGS10/MORTGAGE30US
//                                                via src/lib/fred.ts)
//
// One finding worth flagging, not fixed here (Seam 1 does not touch consumer
// files): app/api/answers/route.ts declares a `hourlyEarnings: g('CES0500000003')`
// getter, but CES0500000003 is never actually included in that function's
// `allIds` fetch list or fetched separately (unlike PCEPILFE/CUSR0000SAH1,
// which ARE fetched separately) -- so `hourlyEarnings` is always null in that
// route today. Registered here anyway since it's clearly an intended data
// point (comment + type field + getter all reference it); the bug is in the
// existing consumer, not something this registry should paper over.
//
// 21 standalone series + 17 OBMMI series (Seam 3a) = 38 series total.
//
// AD-11 Seam 3a: the 17 OBMMI (Optimal Blue Mortgage Market Indices) series
// below were confirmed live against FRED's own API (release_id=473,
// GET /fred/release/series), not scraped or guessed -- FRED's OBMMI web
// pages return 403 to a plain fetch. All 17 are fetchable through the same
// GET /fred/series/observations endpoint every other series in this registry
// uses (confirmed directly), daily frequency, back to 2017-01-03. Segment
// boundaries (LTV <=80 vs >80, FICO <680/680-699/700-719/720-739/>=740) are
// read directly from each series' own title, not inferred.
import type { SeriesDefinition } from './types';

export const OBMMI_CITATION =
    'Rate data sourced from Optimal Blue Mortgage Market Indices (OBMMI), distributed via the Federal Reserve Economic Data (FRED) platform, release 473. OBMMI is a trademark of Optimal Blue.';

export const REGISTRY: SeriesDefinition[] = [
    // ── Rates ──────────────────────────────────────────────────────────────
    { seriesId: 'MORTGAGE30US', label: '30-Year Fixed Rate Mortgage Average', category: 'rate', unit: 'percent', frequency: 'weekly', seasonallyAdjusted: false, source: 'fred' },
    { seriesId: 'MORTGAGE15US', label: '15-Year Fixed Rate Mortgage Average', category: 'rate', unit: 'percent', frequency: 'weekly', seasonallyAdjusted: false, source: 'fred' },
    { seriesId: 'MORTGAGE5US',  label: '5/1-Year Adjustable Rate Mortgage Average', category: 'rate', unit: 'percent', frequency: 'weekly', seasonallyAdjusted: false, source: 'fred' },

    // ── Treasury yields ────────────────────────────────────────────────────
    { seriesId: 'DGS10',  label: '10-Year Treasury Constant Maturity Rate', category: 'treasury', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred' },
    { seriesId: 'DGS2',   label: '2-Year Treasury Constant Maturity Rate',  category: 'treasury', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred' },
    { seriesId: 'DGS30',  label: '30-Year Treasury Constant Maturity Rate', category: 'treasury', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred' },
    { seriesId: 'T10Y2Y', label: '10-Year Minus 2-Year Treasury Spread',   category: 'treasury', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred' },

    // ── Fed / money market ─────────────────────────────────────────────────
    { seriesId: 'FEDFUNDS', label: 'Federal Funds Effective Rate (monthly avg)', category: 'macro', unit: 'percent', frequency: 'monthly', seasonallyAdjusted: false, source: 'fred' },
    { seriesId: 'EFFR',     label: 'Effective Federal Funds Rate (daily)',       category: 'macro', unit: 'percent', frequency: 'daily',   seasonallyAdjusted: false, source: 'fred', notes: 'Distinct from FEDFUNDS (monthly avg) -- do not conflate.' },
    { seriesId: 'SOFR',     label: 'Secured Overnight Financing Rate',           category: 'macro', unit: 'percent', frequency: 'daily',   seasonallyAdjusted: false, source: 'fred' },

    // ── Macro / inflation / labor ──────────────────────────────────────────
    { seriesId: 'UNRATE',         label: 'Unemployment Rate',                                    category: 'macro', unit: 'percent', frequency: 'monthly', seasonallyAdjusted: true,  source: 'fred' },
    { seriesId: 'CPIAUCSL',       label: 'CPI for All Urban Consumers: All Items',                category: 'macro', unit: 'index',   frequency: 'monthly', seasonallyAdjusted: true,  source: 'fred' },
    { seriesId: 'PCEPILFE',       label: 'Core PCE Price Index (YoY %)',                          category: 'macro', unit: 'percent', frequency: 'monthly', seasonallyAdjusted: true,  source: 'fred', fetchUnits: 'pc1', notes: 'Fetched as YoY % change, not index level.' },
    { seriesId: 'CUSR0000SAH1',   label: 'CPI: Shelter (YoY %)',                                  category: 'macro', unit: 'percent', frequency: 'monthly', seasonallyAdjusted: true,  source: 'fred', fetchUnits: 'pc1', notes: 'Fetched as YoY % change, not index level.' },
    { seriesId: 'CES0500000003',  label: 'Average Hourly Earnings, Total Private',                category: 'macro', unit: 'dollars', frequency: 'monthly', seasonallyAdjusted: true,  source: 'fred', notes: 'Registered for parity with answers/route.ts intent; that route never actually fetches it today (pre-existing bug, not fixed in this seam).' },

    // ── Housing ────────────────────────────────────────────────────────────
    { seriesId: 'MSPUS',          label: 'Median Sales Price of Houses Sold',        category: 'housing', unit: 'dollars',    frequency: 'quarterly', seasonallyAdjusted: false, source: 'fred' },
    { seriesId: 'HOUST',          label: 'Housing Starts: Total New Privately Owned', category: 'housing', unit: 'thousands',  frequency: 'monthly',   seasonallyAdjusted: true,  source: 'fred' },
    { seriesId: 'EXHOSLUSM495S',  label: 'Existing Home Sales',                       category: 'housing', unit: 'millions',   frequency: 'monthly',   seasonallyAdjusted: true,  source: 'fred' },
    { seriesId: 'MSACSR',         label: 'Monthly Supply of Houses',                  category: 'housing', unit: 'months',     frequency: 'monthly',   seasonallyAdjusted: true,  source: 'fred' },
    { seriesId: 'CSUSHPINSA',     label: 'S&P/Case-Shiller U.S. National Home Price Index', category: 'housing', unit: 'index', frequency: 'monthly', seasonallyAdjusted: false, source: 'fred' },
    { seriesId: 'RRVRUSQ156N',    label: 'Rental Vacancy Rate',                       category: 'housing', unit: 'percent',    frequency: 'quarterly', seasonallyAdjusted: false, source: 'fred' },

    // ── OBMMI (Optimal Blue Mortgage Market Indices) — Seam 3a ──────────────
    // Daily, real observed locked-rate averages (not a synthetic model), from
    // FRED release 473. requiresCitation because OBMMI is Optimal Blue's
    // trademarked product, distributed via FRED under their release terms.
    { seriesId: 'OBMMIC30YF', label: '30-Year Fixed Rate Conforming Mortgage Index (OBMMI)', category: 'obmmi', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred_release', fredReleaseId: 473, loanType: 'conforming', termYears: 30, requiresCitation: true, citationText: OBMMI_CITATION },
    { seriesId: 'OBMMIC15YF', label: '15-Year Fixed Rate Conforming Mortgage Index (OBMMI)', category: 'obmmi', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred_release', fredReleaseId: 473, loanType: 'conforming', termYears: 15, requiresCitation: true, citationText: OBMMI_CITATION },

    // Conforming 30Y, segmented LTV x FICO (2 x 5 = 10 series)
    { seriesId: 'OBMMIC30YFLVLE80FLT680',    label: '30Y Conforming: LTV<=80, FICO<680',      category: 'obmmi', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred_release', fredReleaseId: 473, loanType: 'conforming', termYears: 30, ltvMax: 80, ficoMax: 679, requiresCitation: true, citationText: OBMMI_CITATION },
    { seriesId: 'OBMMIC30YFLVLE80FB680A699', label: '30Y Conforming: LTV<=80, FICO 680-699',   category: 'obmmi', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred_release', fredReleaseId: 473, loanType: 'conforming', termYears: 30, ltvMax: 80, ficoMin: 680, ficoMax: 699, requiresCitation: true, citationText: OBMMI_CITATION },
    { seriesId: 'OBMMIC30YFLVLE80FB700A719', label: '30Y Conforming: LTV<=80, FICO 700-719',   category: 'obmmi', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred_release', fredReleaseId: 473, loanType: 'conforming', termYears: 30, ltvMax: 80, ficoMin: 700, ficoMax: 719, requiresCitation: true, citationText: OBMMI_CITATION },
    { seriesId: 'OBMMIC30YFLVLE80FB720A739', label: '30Y Conforming: LTV<=80, FICO 720-739',   category: 'obmmi', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred_release', fredReleaseId: 473, loanType: 'conforming', termYears: 30, ltvMax: 80, ficoMin: 720, ficoMax: 739, requiresCitation: true, citationText: OBMMI_CITATION },
    { seriesId: 'OBMMIC30YFLVLE80FGE740',    label: '30Y Conforming: LTV<=80, FICO>=740',      category: 'obmmi', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred_release', fredReleaseId: 473, loanType: 'conforming', termYears: 30, ltvMax: 80, ficoMin: 740, requiresCitation: true, citationText: OBMMI_CITATION },
    { seriesId: 'OBMMIC30YFLVGT80FLT680',    label: '30Y Conforming: LTV>80, FICO<680',       category: 'obmmi', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred_release', fredReleaseId: 473, loanType: 'conforming', termYears: 30, ltvMin: 80, ficoMax: 679, requiresCitation: true, citationText: OBMMI_CITATION },
    { seriesId: 'OBMMIC30YFLVGT80FB680A699', label: '30Y Conforming: LTV>80, FICO 680-699',    category: 'obmmi', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred_release', fredReleaseId: 473, loanType: 'conforming', termYears: 30, ltvMin: 80, ficoMin: 680, ficoMax: 699, requiresCitation: true, citationText: OBMMI_CITATION },
    { seriesId: 'OBMMIC30YFLVGT80FB700A719', label: '30Y Conforming: LTV>80, FICO 700-719',    category: 'obmmi', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred_release', fredReleaseId: 473, loanType: 'conforming', termYears: 30, ltvMin: 80, ficoMin: 700, ficoMax: 719, requiresCitation: true, citationText: OBMMI_CITATION },
    { seriesId: 'OBMMIC30YFLVGT80FB720A739', label: '30Y Conforming: LTV>80, FICO 720-739',    category: 'obmmi', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred_release', fredReleaseId: 473, loanType: 'conforming', termYears: 30, ltvMin: 80, ficoMin: 720, ficoMax: 739, requiresCitation: true, citationText: OBMMI_CITATION },
    { seriesId: 'OBMMIC30YFLVGT80FGE740',    label: '30Y Conforming: LTV>80, FICO>=740',       category: 'obmmi', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred_release', fredReleaseId: 473, loanType: 'conforming', termYears: 30, ltvMin: 80, ficoMin: 740, requiresCitation: true, citationText: OBMMI_CITATION },

    // Non-adjusted variant of the headline 30Y conforming index. FRED's release
    // metadata doesn't document the exact NA-vs-primary methodology difference
    // beyond the title -- registered for completeness; no consumer uses it yet.
    { seriesId: 'OBMMIC30YFNA', label: '30-Year Fixed Rate Conforming Non-Adjusted Mortgage Index (OBMMI)', category: 'obmmi', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred_release', fredReleaseId: 473, loanType: 'conforming', termYears: 30, requiresCitation: true, citationText: OBMMI_CITATION, notes: 'Methodology delta vs OBMMIC30YF not documented in FRED release metadata; not currently used by any consumer.' },

    // Program-specific 30Y indices (no LTV/FICO segmentation on FRED's side)
    { seriesId: 'OBMMIFHA30YF',    label: '30-Year Fixed Rate FHA Mortgage Index (OBMMI)',              category: 'obmmi', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred_release', fredReleaseId: 473, loanType: 'fha',   termYears: 30, requiresCitation: true, citationText: OBMMI_CITATION },
    { seriesId: 'OBMMIJUMBO30YF',  label: '30-Year Fixed Rate Jumbo Mortgage Index (OBMMI)',            category: 'obmmi', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred_release', fredReleaseId: 473, loanType: 'jumbo', termYears: 30, requiresCitation: true, citationText: OBMMI_CITATION },
    { seriesId: 'OBMMIUSDA30YF',   label: '30-Year Fixed Rate USDA Mortgage Index (OBMMI)',             category: 'obmmi', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred_release', fredReleaseId: 473, loanType: 'usda',  termYears: 30, requiresCitation: true, citationText: OBMMI_CITATION },
    { seriesId: 'OBMMIVA30YF',     label: '30-Year Fixed Rate Veterans Affairs Mortgage Index (OBMMI)', category: 'obmmi', unit: 'percent', frequency: 'daily', seasonallyAdjusted: false, source: 'fred_release', fredReleaseId: 473, loanType: 'va',    termYears: 30, requiresCitation: true, citationText: OBMMI_CITATION },
];

export function getSeriesDefinition(seriesId: string): SeriesDefinition | undefined {
    return REGISTRY.find(s => s.seriesId === seriesId);
}
