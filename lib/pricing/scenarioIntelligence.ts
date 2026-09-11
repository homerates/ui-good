// lib/pricing/scenarioIntelligence.ts
//
// Invocable Tool Workstream (2026-09-11) -- canonical engine behind the new
// homerates_scenario_intelligence external tool. Deal/scenario math, NOT a
// bare calculate_piti: given a purchase scenario (price, program, down
// payment, rate, term, geography), this recomputes the FULL dependent
// chain (loan structure -> monthly breakdown -> loan-limit zone ->
// qualification) fresh from lib/calcEngine.ts every call -- no partial
// inputs are ever accepted, so "change one input" always recomputes
// everything downstream of it, by construction.
//
// Calls lib/calcEngine.ts's calcConventional/calcFHA/calcVA/calcJumbo
// DIRECTLY -- the same functions lib/cardBuilders/*.ts already build their
// markdown tables from via lib/calcDispatcher.ts. This does NOT reproduce
// AffordabilityPurchaseCard.tsx's own inline PMI/MIP formulas: a live
// verification during this workstream found AFFD-012's inline conventional
// PMI calculation does NOT tier PMI_RATE_LOW/STD by LTV the way
// calcEngine.ts's monthlyPMI() correctly does (confirmed empirically: an
// 85%-LTV scenario showed $312/mo on the card's own math vs $170/mo via
// calcEngine.ts) -- a real, pre-existing, unfixed drift in AFFD-012 itself,
// same class as the already-reported InteractiveSliderCard.tsx:283 issue
// (AD-28). Per explicit instruction, this engine is built against
// calcEngine.ts (the documented "single source of all mortgage math"), not
// against AFFD-012's own inline math -- see ARCHITECTURE_DECISIONS.md
// AD-31 for the full reasoning and the decision not to fix AFFD-012 here.
//
// Loan-limit-zone reuses lib/pricing/loanLimitIntelligence.ts's
// getLoanLimitIntelligence() verbatim (the same engine
// homerates_loan_limit_intelligence uses) -- no second classification
// table or formula. Rate-omitted handling reuses
// lib/market-data/benchmarkRates.ts's getBenchmarkRates() verbatim -- the
// same engine homerates_rate_oracle uses -- fetched exactly ONCE per call
// and threaded through unchanged, so the benchmark object echoed in the
// response is always the exact one actually used for the payment math.

import {
  calcConventional,
  calcFHA,
  calcVA,
  calcJumbo,
  TAX_RATE_DEFAULT,
  INS_RATE_DEFAULT,
} from '../calcEngine';
import { getBenchmarkRates, type BenchmarkRate } from '../market-data/benchmarkRates';
import { getLoanLimitIntelligence, type LoanLimitResult } from './loanLimitIntelligence';

export type ScenarioProgram = 'conventional' | 'fha' | 'va' | 'jumbo';
export type InputSource = 'USER_INPUT' | 'CURRENT_BENCHMARK' | 'EXPLICIT_ASSUMPTION' | 'PROPERTY_FACT' | 'UNKNOWN' | 'UNAVAILABLE';

export interface ScenarioQuery {
  price: number;
  program: ScenarioProgram;
  downPaymentPct?: number;
  downPaymentAmount?: number;
  termYears?: number;
  ratePct?: number;
  hoaMonthly?: number;
  zip?: string;
  county?: string;
  state?: string;
  propertyTaxRatePct?: number;
  insuranceAnnual?: number;
  creditScore?: number;
  buydownPoints?: number;
  fundingFeeExempt?: boolean;
  annualIncome?: number;
  monthlyDebts?: number;
}

export interface TaggedValue<T> {
  value: T;
  source: InputSource;
}

export interface ScenarioResult {
  program: ScenarioProgram;
  inputs: {
    price: TaggedValue<number>;
    downPaymentPct: TaggedValue<number>;
    downPaymentAmount: TaggedValue<number>;
    termYears: TaggedValue<number>;
    ratePct: TaggedValue<number | null>;
    propertyTaxRatePct: TaggedValue<number>;
    insuranceAnnual: TaggedValue<number>;
    hoaMonthly: TaggedValue<number | null>;
  };
  rateBenchmark: BenchmarkRate | null;
  loanStructure: {
    downPaymentAmount: number;
    baseLoanAmount: number;
    upfrontFee: number;
    upfrontFeeLabel: 'UFMIP' | 'VA_FUNDING_FEE' | 'NONE';
    totalLoanAmount: number;
    ltv: number;
  };
  monthlyBreakdown: {
    principalInterest: number;
    tax: number;
    insurance: number;
    mortgageInsurance: number;
    mortgageInsuranceLabel: 'PMI' | 'MIP' | 'NONE';
    hoa: number | null;
    piti: number;
    pitia: number | null;
  } | null;
  loanLimitZone: LoanLimitResult;
  jumboDetail: { conformingLimit: number; loanExceedsConforming: boolean } | null;
  programDetail: Record<string, unknown>;
  qualification: { frontEndDTI: number | null; backEndDTI: number | null } | null;
  assumptions: Array<{ field: string; value: unknown; reason: string }>;
}

// Exported (Invocable Tool Workstream, 2026-09-11) so
// homerates_buyer_capacity_intelligence can reuse the EXACT same
// program-minimum defaults -- "Buyer Capacity and Scenario Intelligence
// MUST consume the same... assumptions," not a second copy of this table.
export const PROGRAM_MIN_DOWN: Record<ScenarioProgram, number> = {
  conventional: 20, // no-PMI standard default -- calcConventional has no internal default, unlike the other 3 programs
  fha: 3.5,         // matches calcFHA()'s own internal default
  va: 0,            // matches calcVA()'s own internal default
  jumbo: 20,        // calcJumbo() enforces this floor internally regardless
};

export async function getScenarioIntelligence(q: ScenarioQuery): Promise<ScenarioResult> {
  const assumptions: ScenarioResult['assumptions'] = [];

  // ── Down payment ──────────────────────────────────────────────────────
  let downPaymentPct: number;
  let downPaymentSource: InputSource;
  if (q.downPaymentPct != null) {
    downPaymentPct = q.downPaymentPct;
    downPaymentSource = 'USER_INPUT';
  } else if (q.downPaymentAmount != null && q.price > 0) {
    downPaymentPct = (q.downPaymentAmount / q.price) * 100;
    downPaymentSource = 'USER_INPUT';
  } else {
    downPaymentPct = PROGRAM_MIN_DOWN[q.program];
    downPaymentSource = 'EXPLICIT_ASSUMPTION';
    assumptions.push({ field: 'down_payment_pct', value: downPaymentPct, reason: `No down payment supplied -- defaulted to the standard ${q.program} minimum.` });
  }

  // ── Term ──────────────────────────────────────────────────────────────
  const termYears = q.termYears ?? 30;
  const termSource: InputSource = q.termYears != null ? 'USER_INPUT' : 'EXPLICIT_ASSUMPTION';
  if (termSource === 'EXPLICIT_ASSUMPTION') assumptions.push({ field: 'term_years', value: termYears, reason: 'No loan term supplied -- defaulted to 30 years.' });

  // ── Rate -- never silently invented. USER_INPUT if supplied; otherwise
  // fetch the canonical benchmark ONCE and reuse the exact same object for
  // both the input echo and the standalone rateBenchmark field. ──────────
  let ratePct: number | null;
  let rateSource: InputSource;
  let rateBenchmark: BenchmarkRate | null = null;
  if (q.ratePct != null) {
    ratePct = q.ratePct;
    rateSource = 'USER_INPUT';
  } else {
    const benchmarks = await getBenchmarkRates();
    const picked = termYears <= 15 ? benchmarks.fifteenYearFixed : benchmarks.thirtyYearFixed;
    rateBenchmark = picked;
    if (picked.value == null) {
      ratePct = null;
      rateSource = 'UNAVAILABLE';
      assumptions.push({ field: 'rate_pct', value: null, reason: `No rate supplied and the current HomeRates benchmark (${picked.seriesId}) is UNAVAILABLE -- payment math cannot be computed without inventing a rate.` });
    } else {
      ratePct = picked.value;
      rateSource = 'CURRENT_BENCHMARK';
      assumptions.push({ field: 'rate_pct', value: ratePct, reason: `No rate supplied -- used the current HomeRates benchmark (${picked.seriesId}, as of ${picked.asOf}).` });
    }
  }

  // ── Tax / insurance -- illustrative national defaults when not
  // overridden. Geography does NOT currently refine these in this
  // codebase (no per-county tax/insurance table exists anywhere -- only
  // loan limits have real per-county data) -- documented honestly rather
  // than pretending geography changes this. ───────────────────────────────
  const propertyTaxRatePct = q.propertyTaxRatePct ?? Math.round(TAX_RATE_DEFAULT * 100 * 10000) / 10000;
  const taxSource: InputSource = q.propertyTaxRatePct != null ? 'USER_INPUT' : 'EXPLICIT_ASSUMPTION';
  if (taxSource === 'EXPLICIT_ASSUMPTION') assumptions.push({ field: 'property_tax_rate_pct', value: propertyTaxRatePct, reason: 'No property tax rate supplied -- defaulted to the national illustrative assumption (no per-county tax table exists in this codebase).' });

  const insuranceAnnual = q.insuranceAnnual ?? Math.round(q.price * INS_RATE_DEFAULT);
  const insSource: InputSource = q.insuranceAnnual != null ? 'USER_INPUT' : 'EXPLICIT_ASSUMPTION';
  if (insSource === 'EXPLICIT_ASSUMPTION') assumptions.push({ field: 'insurance_annual', value: insuranceAnnual, reason: 'No insurance amount supplied -- defaulted to the national illustrative assumption.' });

  // ── HOA -- a property fact when supplied, never defaulted to zero when
  // it isn't. The 0 passed to the calc-engine call below is ONLY a
  // parameter default the calc functions require -- PITI/PITIA below
  // still correctly report HOA as unknown, never as a confirmed $0. ──────
  const hoaKnown = q.hoaMonthly != null;
  const hoaForEngine = hoaKnown ? (q.hoaMonthly as number) : 0;
  const hoaSource: InputSource = hoaKnown ? 'PROPERTY_FACT' : 'UNKNOWN';

  // ── Loan structure + monthly breakdown -- calcEngine.ts direct call,
  // program by program. Every one of these functions is the SAME function
  // the rest of this codebase's scenario cards ultimately build their
  // markdown tables from (lib/cardBuilders/*.ts + lib/calcDispatcher.ts). ─
  let baseLoanAmount = 0;
  let downPaymentAmount = 0;
  let upfrontFee = 0;
  let upfrontFeeLabel: 'UFMIP' | 'VA_FUNDING_FEE' | 'NONE' = 'NONE';
  let totalLoanAmount = 0;
  let ltv = 0;
  let monthlyBreakdown: ScenarioResult['monthlyBreakdown'] = null;
  let jumboDetail: ScenarioResult['jumboDetail'] = null;
  let programDetail: Record<string, unknown> = {};
  let qualification: ScenarioResult['qualification'] = null;

  downPaymentAmount = q.price * (downPaymentPct / 100);
  baseLoanAmount = q.price - downPaymentAmount;

  if (ratePct != null) {
    if (q.program === 'conventional') {
      const r = calcConventional({
        purchasePrice: q.price, downPaymentPct, annualRatePct: ratePct, termYears,
        propertyTaxRate: propertyTaxRatePct, annualInsurance: insuranceAnnual, hoaMonthly: hoaForEngine,
        monthlyDebts: q.monthlyDebts, annualIncome: q.annualIncome,
      });
      totalLoanAmount = r.loanAmount; ltv = r.ltv;
      monthlyBreakdown = {
        principalInterest: r.monthlyPI, tax: r.monthlyTax, insurance: r.monthlyInsurance,
        mortgageInsurance: r.monthlyPMI, mortgageInsuranceLabel: r.monthlyPMI > 0 ? 'PMI' : 'NONE',
        hoa: hoaKnown ? hoaForEngine : null,
        piti: r.totalMonthly - hoaForEngine,
        pitia: hoaKnown ? r.totalMonthly : null,
      };
      programDetail = { pmiRemovalYears: r.pmiRemovalYears };
      qualification = { frontEndDTI: r.frontEndDTI, backEndDTI: r.backEndDTI };
    } else if (q.program === 'fha') {
      const r = calcFHA({
        purchasePrice: q.price, downPaymentPct, annualRatePct: ratePct, termYears,
        creditScore: q.creditScore, propertyTaxRate: propertyTaxRatePct, annualInsurance: insuranceAnnual,
        hoaMonthly: hoaForEngine, monthlyDebts: q.monthlyDebts, annualIncome: q.annualIncome,
      });
      baseLoanAmount = r.baseLoanAmount; upfrontFee = r.ufmip; upfrontFeeLabel = 'UFMIP';
      totalLoanAmount = r.totalLoanAmount; ltv = r.ltv;
      monthlyBreakdown = {
        principalInterest: r.monthlyPI, tax: r.monthlyTax, insurance: r.monthlyInsurance,
        mortgageInsurance: r.monthlyMIP, mortgageInsuranceLabel: r.monthlyMIP > 0 ? 'MIP' : 'NONE',
        hoa: hoaKnown ? hoaForEngine : null,
        piti: r.totalMonthly - hoaForEngine,
        pitia: hoaKnown ? r.totalMonthly : null,
      };
      programDetail = { mipRate: r.mipRate, mipDuration: r.mipDuration, totalMIPPaid: r.totalMIPPaid, meetsCreditRequirement: r.meetsCreditRequirement };
      qualification = { frontEndDTI: r.frontEndDTI, backEndDTI: r.backEndDTI };
    } else if (q.program === 'va') {
      const r = calcVA({
        purchasePrice: q.price, downPaymentPct, annualRatePct: ratePct, termYears,
        fundingFeeExempt: q.fundingFeeExempt, propertyTaxRate: propertyTaxRatePct, annualInsurance: insuranceAnnual,
        hoaMonthly: hoaForEngine, monthlyDebts: q.monthlyDebts, annualIncome: q.annualIncome,
        buydownPoints: q.buydownPoints,
      });
      baseLoanAmount = r.baseLoanAmount; upfrontFee = r.fundingFee; upfrontFeeLabel = 'VA_FUNDING_FEE';
      totalLoanAmount = r.totalLoanAmount; ltv = r.ltv;
      monthlyBreakdown = {
        principalInterest: r.monthlyPI, tax: r.monthlyTax, insurance: r.monthlyInsurance,
        mortgageInsurance: 0, mortgageInsuranceLabel: 'NONE',
        hoa: hoaKnown ? hoaForEngine : null,
        piti: r.totalMonthly - hoaForEngine,
        pitia: hoaKnown ? r.totalMonthly : null,
      };
      programDetail = {
        fundingFeePct: r.fundingFeePct, buydownPoints: r.buydownPoints, buydownCost: r.buydownCost,
        buydownMonthlySavings: r.buydownMonthlySavings, buydownBreakEvenMonths: r.buydownBreakEvenMonths,
      };
      qualification = { frontEndDTI: r.frontEndDTI, backEndDTI: r.backEndDTI };
    } else {
      const r = calcJumbo({
        purchasePrice: q.price, downPaymentPct, annualRatePct: ratePct, termYears,
        propertyTaxRate: propertyTaxRatePct, annualInsurance: insuranceAnnual, hoaMonthly: hoaForEngine,
        monthlyDebts: q.monthlyDebts, annualIncome: q.annualIncome,
      });
      totalLoanAmount = r.loanAmount; ltv = r.ltv;
      monthlyBreakdown = {
        principalInterest: r.monthlyPI, tax: r.monthlyTax, insurance: r.monthlyInsurance,
        mortgageInsurance: 0, mortgageInsuranceLabel: 'NONE',
        hoa: hoaKnown ? hoaForEngine : null,
        piti: r.totalMonthly - hoaForEngine,
        pitia: hoaKnown ? r.totalMonthly : null,
      };
      jumboDetail = { conformingLimit: r.conformingLimit, loanExceedsConforming: r.loanExceedsConforming };
      programDetail = { reservesRequired6mo: r.reservesRequired6mo, reservesRequired12mo: r.reservesRequired12mo };
      qualification = { frontEndDTI: r.frontEndDTI, backEndDTI: r.backEndDTI };
    }
  } else {
    // Rate unavailable -- loan structure (down payment/base loan/LTV) is
    // still real and computable without a rate; only payment-dependent
    // fields are withheld, never fabricated with a placeholder rate.
    totalLoanAmount = baseLoanAmount;
    ltv = q.price > 0 ? baseLoanAmount / q.price : 0;
  }

  // ── Loan-limit zone -- SAME engine as homerates_loan_limit_intelligence,
  // not reimplemented. Always computed (geography optional; the engine
  // itself handles absent geography honestly via COUNTY_REQUIRED/the
  // above-every-ceiling shortcut) so "loan crosses conforming baseline" /
  // "loan crosses county limit" always recompute from the CURRENT base
  // loan amount, matching AD-28's dynamic-classification behavior exactly. ─
  const loanLimitZone = await getLoanLimitIntelligence({
    zip: q.zip, county: q.county, state: q.state, units: 1,
    loanAmount: baseLoanAmount, program: 'both',
  });

  return {
    program: q.program,
    inputs: {
      price: { value: q.price, source: 'USER_INPUT' },
      downPaymentPct: { value: downPaymentPct, source: downPaymentSource },
      downPaymentAmount: { value: downPaymentAmount, source: downPaymentSource },
      termYears: { value: termYears, source: termSource },
      ratePct: { value: ratePct, source: rateSource },
      propertyTaxRatePct: { value: propertyTaxRatePct, source: taxSource },
      insuranceAnnual: { value: insuranceAnnual, source: insSource },
      hoaMonthly: { value: hoaKnown ? hoaForEngine : null, source: hoaSource },
    },
    rateBenchmark,
    loanStructure: {
      downPaymentAmount: Math.round(downPaymentAmount),
      baseLoanAmount: Math.round(baseLoanAmount),
      upfrontFee: Math.round(upfrontFee),
      upfrontFeeLabel,
      totalLoanAmount: Math.round(totalLoanAmount),
      ltv,
    },
    monthlyBreakdown,
    loanLimitZone,
    jumboDetail,
    programDetail,
    qualification,
    assumptions,
  };
}
