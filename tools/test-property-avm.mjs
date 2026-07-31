// Regression test for lib/propertyAvm.ts's computeAvmTier — the single shared "what is this
// property worth right now" computation used by both app/api/homeowner/analysis/route.ts
// (wealth-building journey) and app/api/property/lookup/route.ts (buying journey, for
// SOLD/OFF_MARKET properties). Imports the real module, not a copy.
// Usage: node --experimental-strip-types tools/test-property-avm.mjs
import { computeAvmTier as computeAvmTierRaw, AVM_MAX } from '../lib/propertyAvm.ts';

// Simple flat-rate lookup — the test only cares about tier-priority/sanity-check behavior,
// not real state-level FHFA figures (those live in lib/homeownerCalc.ts, exercised by the
// production call sites, not by this unit test).
const testFhfaRate = () => 5.5;
const computeAvmTier = (input) => computeAvmTierRaw(input, testFhfaRate);

const base = {
  salePrice: null, saleDate: null, stateCode: null,
  liveAvmCandidate: null, dbEstCandidate: null, listPriceCandidate: null,
  actualValueOverride: null, trustScrapedEstimates: true,
};

let failed = 0;
function check(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) {
    console.log('  expected:', JSON.stringify(expected));
    console.log('  actual:  ', JSON.stringify(actual));
  }
}

// 1. actual_value override wins outright, ignoring every other tier
{
  const r = computeAvmTier({ ...base, actualValueOverride: 900_000, liveAvmCandidate: 500_000, salePrice: 400_000, saleDate: new Date('2020-01-01') });
  check('actualValueOverride wins outright', r.estimatedValue, 900_000);
  check('actualValueOverride -> avmSource redfin_estimate', r.avmSource, 'redfin_estimate');
}

// 2. Live AVM wins over FHFA baseline when sane
{
  const r = computeAvmTier({ ...base, liveAvmCandidate: 500_000, salePrice: 400_000, saleDate: new Date(Date.now() - 3 * 365.25 * 24 * 3600 * 1000), stateCode: 'CA' });
  check('sane liveAvm wins over FHFA baseline', r.estimatedValue, 500_000);
  check('sane liveAvm -> avmSource redfin_estimate', r.avmSource, 'redfin_estimate');
}

// 3. Live AVM below 75% of sale price is rejected as a wrong-page symptom -> falls to dbEst
{
  const r = computeAvmTier({ ...base, liveAvmCandidate: 100_000, dbEstCandidate: 480_000, salePrice: 400_000 });
  check('liveAvm below 75% of salePrice rejected, falls to dbEst', r.estimatedValue, 480_000);
}

// 4. dbEst approx equal to salePrice (leaked purchase price) is rejected
{
  const r = computeAvmTier({ ...base, dbEstCandidate: 401_000, salePrice: 400_000, listPriceCandidate: 420_000 });
  check('dbEst ~= salePrice rejected as leaked purchase price, falls to listPriceEst', r.estimatedValue, 420_000);
}

// 5. FHFA appreciation model computes from salePrice + saleDate when no scraped estimate exists
{
  const twoYearsAgo = new Date(Date.now() - 2 * 365.25 * 24 * 3600 * 1000);
  const r = computeAvmTier({ ...base, salePrice: 400_000, saleDate: twoYearsAgo, stateCode: 'AZ' });
  check('FHFA tier fires with no scraped estimate', r.avmSource, 'fhfa');
  check('FHFA tier produces an appreciated value above salePrice', r.estimatedValue > 400_000, true);
}

// 6. Nothing available at all -> everything null, ai_estimate
{
  const r = computeAvmTier({ ...base });
  check('no data at all -> estimatedValue null', r.estimatedValue, null);
  check('no data at all -> avmSource ai_estimate', r.avmSource, 'ai_estimate');
}

// 7. trustScrapedEstimates=false (LO has entered financials) ignores live/db/list candidates
{
  const r = computeAvmTier({ ...base, trustScrapedEstimates: false, liveAvmCandidate: 999_000, dbEstCandidate: 888_000, listPriceCandidate: 777_000, salePrice: 400_000, saleDate: new Date(Date.now() - 24 * 30 * 24 * 3600 * 1000) });
  check('trustScrapedEstimates=false ignores scraped candidates, uses FHFA baseline', r.avmSource, 'fhfa');
}

// 8. listPriceEst fallback only fires when nothing else (including FHFA) produced a value
{
  const r = computeAvmTier({ ...base, listPriceCandidate: 350_000 });
  check('listPriceEst fires as last resort with zero other data', r.estimatedValue, 350_000);
  check('listPriceEst -> avmSource ai_estimate', r.avmSource, 'ai_estimate');
}

// 9. Candidate above AVM_MAX is rejected outright
{
  const r = computeAvmTier({ ...base, liveAvmCandidate: AVM_MAX + 1 });
  check('candidate above AVM_MAX rejected', r.estimatedValue, null);
}

if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll tests passed.');
