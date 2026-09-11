// lib/pricing/buyerCapacityIntelligence.ts
//
// Invocable Tool Workstream (2026-09-11) -- canonical engine behind the new
// homerates_buyer_capacity_intelligence external tool. The INVERSE of
// homerates_scenario_intelligence: given income/debts/down-payment/rate/
// program, finds the supportable purchase-price band(s) instead of taking
// a price as input.
//
// GATE CHECK (per this workstream's explicit instruction: "Do not expose
// if current affordability solver still has unresolved methodological
// divergence"): lib/calcEngine.ts's EXISTING affordability solver,
// calcAffordabilityScenario(), was checked and DOES have unresolved
// divergence from calcConventional()/calcFHA() -- confirmed empirically
// during this workstream. Its conventional PMI is a flat PMI_RATE_STD
// regardless of LTV (an 85%-LTV scenario: $272/mo via the solver vs
// $149/mo via the real LTV-tiered monthlyPMI()); its FHA MIP uses a flat
// rate with NO higher-balance tier at all (a base loan of $1,249,125:
// $573/mo via the solver vs $781/mo via the real fhaMIPRate()). This is
// the same class of bug as AFFD-012's own PMI formula (AD-31), but this
// time inside calcEngine.ts itself.
//
// RESOLUTION (per explicit instruction): this engine does NOT call
// calcAffordabilityScenario() at all -- it never even imports it. Per the
// mandatory principle ("Buyer Capacity and Scenario Intelligence MUST
// consume the same calcEngine... Buyer Capacity may invert those engines.
// It may not duplicate them"), this engine inverts
// getScenarioIntelligence() ITSELF (lib/pricing/scenarioIntelligence.ts,
// the same engine the fourth tool uses) via binary search over price --
// every dollar amount, every PMI/MIP figure, every loan-limit
// classification in this file's output was computed by that same,
// already-correct function, never reimplemented here. This also makes the
// mandatory "feed the resulting price back into Scenario Intelligence"
// parity property close to definitional rather than merely tested: each
// band's `scenario` field IS a real getScenarioIntelligence() result,
// computed at that band's resolved price.

import { getScenarioIntelligence, PROGRAM_MIN_DOWN, type ScenarioProgram, type ScenarioResult } from './scenarioIntelligence';
import { getBenchmarkRates, type BenchmarkRate } from '../market-data/benchmarkRates';
import {
  DTI_CONSERVATIVE,
  DTI_STANDARD_MAX,
  DTI_CONVENTIONAL_MAX,
  DTI_VA_MAX,
  DTI_JUMBO_STD,
  DTI_JUMBO_MAX,
} from '../constants';

export type InputSource = 'USER_INPUT' | 'CURRENT_BENCHMARK' | 'EXPLICIT_ASSUMPTION' | 'UNKNOWN' | 'UNAVAILABLE';
export type CapacityConstraint = 'INCOME_DTI' | 'CASH_AVAILABLE' | 'NONE_AFFORDABLE';

export interface TaggedValue<T> {
  value: T;
  source: InputSource;
}

export interface BuyerCapacityQuery {
  annualIncome: number;
  program: ScenarioProgram;
  monthlyDebts?: number;
  downPaymentPct?: number;
  availableCash?: number;
  ratePct?: number;
  termYears?: number;
  zip?: string;
  county?: string;
  state?: string;
  propertyTaxRatePct?: number;
  insuranceAnnual?: number;
  creditScore?: number;
  fundingFeeExempt?: boolean;
}

export interface CapacityBand {
  label: string;
  dtiTarget: number;
  price: number;
  constraint: CapacityConstraint;
  downPaymentAmount: number;
  scenario: ScenarioResult | null;
}

export interface BuyerCapacityResult {
  program: ScenarioProgram;
  inputs: {
    annualIncome: TaggedValue<number>;
    monthlyDebts: TaggedValue<number>;
    downPaymentPct: TaggedValue<number>;
    availableCash: TaggedValue<number | null>;
    ratePct: TaggedValue<number | null>;
  };
  rateBenchmark: BenchmarkRate | null;
  bands: CapacityBand[];
  assumptions: Array<{ field: string; value: unknown; reason: string }>;
}

// Real, pre-existing, already-canonical DTI band constants
// (lib/constants.ts) -- not invented for this tool. "Prefer multiple
// transparent DTI test bands over one false-precision maximum" -- each
// program gets 2-3 bands drawn from the SAME constants already used
// elsewhere in this codebase (AffordabilityPurchaseCard.tsx's own
// dtiThreshold, calcFHA's 50%-back-end qualifies boundary, etc.).
interface DtiBandDef { label: string; target: number }
const PROGRAM_DTI_BANDS: Record<ScenarioProgram, DtiBandDef[]> = {
  conventional: [
    { label: 'Conservative', target: DTI_CONSERVATIVE },
    { label: 'Standard', target: DTI_STANDARD_MAX },
    { label: 'Maximum (compensating factors)', target: DTI_CONVENTIONAL_MAX },
  ],
  fha: [
    { label: 'Conservative', target: DTI_CONSERVATIVE },
    { label: 'Standard (FHA)', target: DTI_STANDARD_MAX },
    { label: 'Maximum (compensating factors)', target: DTI_CONVENTIONAL_MAX },
  ],
  va: [
    { label: 'Conservative', target: DTI_CONSERVATIVE },
    { label: 'VA Guideline', target: DTI_VA_MAX },
  ],
  jumbo: [
    { label: 'Conservative', target: DTI_CONSERVATIVE },
    { label: 'Standard (jumbo)', target: DTI_JUMBO_STD },
    { label: 'Maximum (jumbo)', target: DTI_JUMBO_MAX },
  ],
};

const SEARCH_FLOOR_PRICE = 10_000;
const SEARCH_CEILING_PRICE = 20_000_000;
const SEARCH_ITERATIONS = 40;

/** Binary search for the highest price whose back-end DTI (as computed by
 * getScenarioIntelligence() -- never reimplemented here) stays at or below
 * dtiTargetPct. Returns 0 if even the search floor already exceeds the
 * target (debts alone exceed this band, independent of price). */
async function findMaxPriceForDti(
  evalAt: (price: number) => Promise<ScenarioResult>,
  dtiTargetPct: number,
): Promise<number> {
  const floorResult = await evalAt(SEARCH_FLOOR_PRICE);
  const floorDti = floorResult.qualification?.backEndDTI ?? null;
  if (floorDti == null || floorDti > dtiTargetPct) return 0;

  let lo = SEARCH_FLOOR_PRICE;
  let hi = SEARCH_CEILING_PRICE;
  for (let i = 0; i < SEARCH_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const r = await evalAt(mid);
    const dti = r.qualification?.backEndDTI ?? null;
    if (dti != null && dti <= dtiTargetPct) lo = mid; else hi = mid;
  }
  return Math.round(lo);
}

export async function getBuyerCapacityIntelligence(q: BuyerCapacityQuery): Promise<BuyerCapacityResult> {
  const assumptions: BuyerCapacityResult['assumptions'] = [];

  const monthlyDebts = q.monthlyDebts ?? 0;
  const monthlyDebtsSource: InputSource = q.monthlyDebts != null ? 'USER_INPUT' : 'EXPLICIT_ASSUMPTION';
  if (monthlyDebtsSource === 'EXPLICIT_ASSUMPTION') assumptions.push({ field: 'monthly_debts', value: 0, reason: 'No monthly debts supplied -- assumed zero.' });

  const downPaymentPct = q.downPaymentPct ?? PROGRAM_MIN_DOWN[q.program];
  const downPaymentSource: InputSource = q.downPaymentPct != null ? 'USER_INPUT' : 'EXPLICIT_ASSUMPTION';
  if (downPaymentSource === 'EXPLICIT_ASSUMPTION') assumptions.push({ field: 'down_payment_pct', value: downPaymentPct, reason: `No down payment supplied -- defaulted to the standard ${q.program} minimum (same default Scenario Intelligence uses).` });

  // Rate resolved ONCE here (never re-fetched per search iteration or per
  // band) and passed explicitly into every internal
  // getScenarioIntelligence() call below -- guarantees the exact same rate
  // is used everywhere in this response, and avoids ~120+ redundant
  // Supabase reads across the search iterations for all bands combined.
  let ratePct: number;
  let rateSource: InputSource;
  let rateBenchmark: BenchmarkRate | null = null;
  if (q.ratePct != null) {
    ratePct = q.ratePct;
    rateSource = 'USER_INPUT';
  } else {
    const benchmarks = await getBenchmarkRates();
    const picked = (q.termYears ?? 30) <= 15 ? benchmarks.fifteenYearFixed : benchmarks.thirtyYearFixed;
    rateBenchmark = picked;
    if (picked.value == null) {
      // No rate supplied and the benchmark is itself unavailable -- every
      // band will be reported as NONE_AFFORDABLE / scenario: null rather
      // than computed against a fabricated rate.
      ratePct = NaN;
      rateSource = 'UNAVAILABLE';
      assumptions.push({ field: 'rate_pct', value: null, reason: `No rate supplied and the current HomeRates benchmark (${picked.seriesId}) is UNAVAILABLE -- capacity cannot be computed without inventing a rate.` });
    } else {
      ratePct = picked.value;
      rateSource = 'CURRENT_BENCHMARK';
      assumptions.push({ field: 'rate_pct', value: ratePct, reason: `No rate supplied -- used the current HomeRates benchmark (${picked.seriesId}, as of ${picked.asOf}).` });
    }
  }

  const evalAt = (price: number, includeGeography: boolean): Promise<ScenarioResult> =>
    getScenarioIntelligence({
      price,
      program: q.program,
      downPaymentPct,
      ratePct,
      termYears: q.termYears,
      annualIncome: q.annualIncome,
      monthlyDebts,
      propertyTaxRatePct: q.propertyTaxRatePct,
      insuranceAnnual: q.insuranceAnnual,
      creditScore: q.creditScore,
      fundingFeeExempt: q.fundingFeeExempt,
      // Geography is deliberately OMITTED during the search itself (kept
      // pure/fast, no Supabase round-trip per iteration) and supplied only
      // on the one final call per band, once the price is already resolved.
      ...(includeGeography ? { zip: q.zip, county: q.county, state: q.state } : {}),
    });

  const bands: CapacityBand[] = [];
  const rateUnavailable = Number.isNaN(ratePct);

  if (!rateUnavailable) {
    for (const bandDef of PROGRAM_DTI_BANDS[q.program]) {
      const dtiTargetPct = bandDef.target * 100;
      const incomeConstrainedPrice = await findMaxPriceForDti((p) => evalAt(p, false), dtiTargetPct);

      if (incomeConstrainedPrice <= 0) {
        bands.push({ label: bandDef.label, dtiTarget: bandDef.target, price: 0, constraint: 'NONE_AFFORDABLE', downPaymentAmount: 0, scenario: null });
        continue;
      }

      const cashConstrainedPrice = q.availableCash != null ? q.availableCash / (downPaymentPct / 100) : Infinity;
      const finalPrice = Math.round(Math.min(incomeConstrainedPrice, cashConstrainedPrice));
      const constraint: CapacityConstraint = cashConstrainedPrice < incomeConstrainedPrice ? 'CASH_AVAILABLE' : 'INCOME_DTI';

      const finalScenario = await evalAt(finalPrice, true);
      bands.push({
        label: bandDef.label,
        dtiTarget: bandDef.target,
        price: finalPrice,
        constraint,
        downPaymentAmount: Math.round(finalPrice * (downPaymentPct / 100)),
        scenario: finalScenario,
      });
    }
  } else {
    for (const bandDef of PROGRAM_DTI_BANDS[q.program]) {
      bands.push({ label: bandDef.label, dtiTarget: bandDef.target, price: 0, constraint: 'NONE_AFFORDABLE', downPaymentAmount: 0, scenario: null });
    }
  }

  return {
    program: q.program,
    inputs: {
      annualIncome: { value: q.annualIncome, source: 'USER_INPUT' },
      monthlyDebts: { value: monthlyDebts, source: monthlyDebtsSource },
      downPaymentPct: { value: downPaymentPct, source: downPaymentSource },
      availableCash: { value: q.availableCash ?? null, source: q.availableCash != null ? 'USER_INPUT' : 'UNKNOWN' },
      ratePct: { value: rateUnavailable ? null : ratePct, source: rateSource },
    },
    rateBenchmark,
    bands,
    assumptions,
  };
}
