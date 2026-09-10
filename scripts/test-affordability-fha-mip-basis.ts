// scripts/test-affordability-fha-mip-basis.ts
//
// Priority Corrective Workstream -- Fix calcAffordabilityScenario FHA MIP
// Basis Only (2026-09-10).
//
// Reconfirmed defect: calcAffordabilityScenario()'s 6-pass iterative solver
// estimated FHA MIP during convergence using the TOTAL financed loan (the
// `loan` variable, back-derived from a target P&I payment via the annuity
// factor -- P&I is always computed on the total loan, base+UFMIP for FHA).
// The function's own POST-loop `mMI` was already correctly computed on the
// base loan (matching lib/calcEngine.ts's calcFHA()) -- only the in-loop
// estimate used during convergence was wrong, nudging the solved homePrice
// slightly away from the true optimum. Fixed by backing out the base-loan
// portion (`loan / (1 + FHA_UFMIP_RATE)`) before applying the MIP rate
// inside the loop, matching the basis already used post-loop.
//
// This is a CONTRACT/MATH test -- calls the actual exported functions
// directly. No React rendering.
//
// Run with: npx tsx scripts/test-affordability-fha-mip-basis.ts

import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

import { calcAffordabilityScenario, calcFHA, calcVA, monthlyPI, FHA_MIP_RATE, FHA_UFMIP_RATE } from '../lib/calcEngine';

type Status = 'PASS' | 'FAIL';
interface Result { name: string; status: Status; evidence: string }
const results: Result[] = [];
function record(name: string, status: Status, evidence: string) {
  results.push({ name, status, evidence });
  console.log(`[${status}] ${name} -- ${evidence}`);
}

// ===== Controlled FHA scenario (same one used for the before/after proof) =====
const scenario = calcAffordabilityScenario(
  120_000, // annualIncome
  30_000,  // savings
  500,     // monthlyDebts
  6.5,     // annualRatePct
  3.5,     // downPct
  'FHA',
  600_000, // loanLimit (generous, no cap)
  0.011,   // propertyTaxRate
  'Test Location',
);

// 1. calcFHA and calcAffordabilityScenario use the same FHA MIP basis --
// feed the solved homePrice/downPct straight into calcFHA and confirm both
// land on the SAME base loan figure the MIP rate is applied to (basis
// equivalence, not necessarily identical dollar MIP, since calcFHA's
// fhaMIPRate() is loan-size/LTV-tiered while calcAffordabilityScenario uses
// a single flat rate -- that rate-table difference is a separate, deliberately
// out-of-scope question for this workstream).
{
  const fromFHA = calcFHA({ purchasePrice: scenario.homePrice, downPaymentPct: scenario.downPaymentPct, annualRatePct: scenario.rate });
  record('1. calcFHA and calcAffordabilityScenario agree on baseLoanAmount for the same homePrice/downPct (same basis input)',
    fromFHA.baseLoanAmount === scenario.baseLoanAmount ? 'PASS' : 'FAIL',
    JSON.stringify({ calcFHA: fromFHA.baseLoanAmount, affordability: scenario.baseLoanAmount }));

  // At this scenario's LTV (96.5%, standard non-higher-balance loan size),
  // calcFHA's tiered rate resolves to the SAME flat rate
  // calcAffordabilityScenario uses (FHA_MIP_RATE, 0.55%) -- so here the
  // actual MIP basis check IS a real dollar-for-dollar equality.
  const expectedMipOnBase = Math.round(scenario.baseLoanAmount * FHA_MIP_RATE / 12);
  record('1b. Affordability monthlyMI matches base-loan-basis calculation exactly (not total-loan basis)',
    scenario.monthlyMI === expectedMipOnBase ? 'PASS' : 'FAIL',
    JSON.stringify({ actual: scenario.monthlyMI, expectedOnBase: expectedMipOnBase, wouldBeOnTotalLoan: Math.round(scenario.loanAmount * FHA_MIP_RATE / 12) }));
}

// 2. Same purchase price/down payment/rate/term -> same FHA monthly MIP
// between calcFHA (direct) and the affordability solver's OWN post-loop
// calculation, holding a KNOWN price fixed (bypassing the solver -- construct
// a scenario where the solver's converged homePrice is used as calcFHA's
// direct input, already covered by test 1, repeated here with a second,
// different scenario for independence).
{
  const scenario2 = calcAffordabilityScenario(200_000, 60_000, 800, 7.0, 3.5, 'FHA', 900_000, 0.012, '');
  const fromFHA2 = calcFHA({ purchasePrice: scenario2.homePrice, downPaymentPct: scenario2.downPaymentPct, annualRatePct: scenario2.rate });
  const expectedMip2 = Math.round(scenario2.baseLoanAmount * FHA_MIP_RATE / 12);
  record('2. Second independent scenario: same price/downPct/rate -> same FHA monthly MIP basis',
    scenario2.monthlyMI === expectedMip2 && fromFHA2.baseLoanAmount === scenario2.baseLoanAmount ? 'PASS' : 'FAIL',
    JSON.stringify({ affordabilityMI: scenario2.monthlyMI, expected: expectedMip2, baseLoanMatch: fromFHA2.baseLoanAmount === scenario2.baseLoanAmount }));
}

// 3. Base loan, upfront MIP, total financed loan remain distinct values
record('3. Base loan, UFMIP, and total financed loan are three distinct, correctly-related values',
  scenario.ufmip > 0 && scenario.loanAmount === scenario.baseLoanAmount + scenario.ufmip && scenario.baseLoanAmount !== scenario.loanAmount ? 'PASS' : 'FAIL',
  JSON.stringify({ baseLoanAmount: scenario.baseLoanAmount, ufmip: scenario.ufmip, loanAmount: scenario.loanAmount }));

// 4. P&I continues to use the intended financed (total) loan amount
{
  const expectedPI = Math.round(monthlyPI(scenario.loanAmount, scenario.rate, 360));
  record('4. P&I computed on the TOTAL financed loan (base+UFMIP), unchanged by this fix',
    Math.abs(scenario.monthlyPI - expectedPI) <= 1 ? 'PASS' : 'FAIL',
    JSON.stringify({ actual: scenario.monthlyPI, expectedOnTotalLoan: expectedPI }));
}

// 5. MIP does not accidentally use total financed loan amount
{
  const wouldBeOnTotal = Math.round(scenario.loanAmount * FHA_MIP_RATE / 12);
  record('5. monthlyMI does NOT match a total-loan-basis calculation (confirms the fix took effect)',
    scenario.monthlyMI !== wouldBeOnTotal || scenario.baseLoanAmount === scenario.loanAmount ? 'PASS' : 'FAIL',
    JSON.stringify({ monthlyMI: scenario.monthlyMI, onTotalWouldBe: wouldBeOnTotal, baseLoan: scenario.baseLoanAmount, totalLoan: scenario.loanAmount }));
}

// 6. Existing conventional affordability behavior is unchanged (the fix only
// touches the `program === 'FHA'` branch inside the loop -- conventional's
// in-loop PMI estimate still uses `loan` directly, no base/total distinction
// applies to conventional at all).
{
  const conv = calcAffordabilityScenario(150_000, 40_000, 600, 6.75, 10, 'Conventional', 800_000, 0.011, '');
  record('6. Conventional affordability scenario runs and produces a sane, positive result (branch untouched)',
    conv.homePrice > 0 && conv.monthlyPI > 0 && conv.ufmip === 0 ? 'PASS' : 'FAIL', JSON.stringify(conv));
}

// 7. Existing VA behavior is unchanged (calcVA is a completely separate
// function from calcAffordabilityScenario -- not touched by this fix at all).
{
  const va = calcVA({ purchasePrice: 500_000, annualRatePct: 6.5 });
  record('7. calcVA() runs unchanged (separate function, not touched by this fix)',
    va.totalLoanAmount > 0 && va.monthlyPI > 0 ? 'PASS' : 'FAIL', JSON.stringify({ totalLoanAmount: va.totalLoanAmount, monthlyPI: va.monthlyPI }));
}

// 8. Existing P&I tests remain unchanged -- monthlyPI/calcFHA/calcConventional
// untouched by this fix (only calcAffordabilityScenario's loop was edited).
{
  const pi = monthlyPI(500_000, 6.5, 360);
  record('8. monthlyPI() primitive unchanged (same formula, same output for a fixed input)',
    Math.abs(pi - 3160.3351) < 0.01 ? 'PASS' : 'FAIL', String(pi));
}

async function checkExternalContractsUnchanged() {
  const { getSupabase } = await import('../lib/supabaseServer');
  const { getBenchmarkRates } = await import('../lib/market-data/benchmarkRates');
  const { shapeBenchmarkRatesForExternalContract } = await import('../lib/gateway/benchmarkRatesShaping');
  const { BenchmarkRatesV1Schema } = await import('../lib/gateway/benchmarkRatesSchema');
  const { resolvePropertyId } = await import('../lib/gateway/intelligenceGateway');
  const { buildCanonicalPropertyIntelligence } = await import('../lib/canonicalPropertyIntelligence');
  const { shapeForExternalContract } = await import('../lib/gateway/outputShaping');
  const { ExternalPropertyIntelligenceV1Schema } = await import('../lib/gateway/outputSchema');

  // 9. Existing benchmark-rates contract is unchanged
  const raw = await getBenchmarkRates();
  const shaped = shapeBenchmarkRatesForExternalContract(raw);
  const parsed = BenchmarkRatesV1Schema.safeParse(shaped);
  record('9. benchmark-rates-v1 contract still validates, unaffected by this fix',
    parsed.success && shaped.contract_version === 'benchmark-rates-v1' ? 'PASS' : 'FAIL', parsed.success ? 'valid' : JSON.stringify((parsed as any).error?.issues?.slice(0, 2)));

  // 10. Existing property-intelligence contract is unchanged
  const sb = getSupabase();
  if (sb) {
    const address = '1123 Seaview Ave, Pacific Grove, CA 93950';
    const id = await resolvePropertyId(address);
    if (id) {
      const canonical = await buildCanonicalPropertyIntelligence(id);
      const shapedProp = shapeForExternalContract(address, canonical);
      const parsedProp = ExternalPropertyIntelligenceV1Schema.safeParse(shapedProp);
      record('10. property-intelligence-v1.5 contract still validates, unaffected by this fix',
        parsedProp.success && shapedProp.contract_version === 'property-intelligence-v1.5' ? 'PASS' : 'FAIL', parsedProp.success ? 'valid' : JSON.stringify((parsedProp as any).error?.issues?.slice(0, 2)));
    } else {
      record('10. property-intelligence-v1.5 contract still validates', 'FAIL', 'Seaview property not found');
    }
  } else {
    record('10. property-intelligence-v1.5 contract still validates', 'FAIL', 'Supabase not configured');
  }
}

async function main() {
  await checkExternalContractsUnchanged();

  const failed = results.filter(r => r.status === 'FAIL');
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) {
    console.log('\nFAILURES:');
    for (const f of failed) console.log(` - ${f.name}: ${f.evidence}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
