// Regression test for the "January 2420" bug class (ISSUE-031 follow-up): a house number or
// other stray 4-digit number in source text getting misread as a sale year. Imports the real
// lib/dateSanity.ts — not a copy — so this stays true to whatever the app actually ships.
// Usage: node tools/test-date-sanity.mjs   (no build step, no live data, no network needed)
import { isPlausibleSaleYear } from '../lib/dateSanity.ts';

const thisYear = new Date().getFullYear();

const cases = [
  // [year, expected, label]
  [2420, false, 'the exact regression: house number "2420" misread as a year'],
  [thisYear + 1, false, 'one year in the future'],
  [thisYear, true, 'current year (edge: a same-year sale is valid)'],
  [2013, true, 'ordinary historical sale year'],
  [1900, true, '1900 (inclusive lower bound)'],
  [1899, false, 'just below the lower bound'],
  [0, false, 'garbage/unparsed input coerced to 0'],
];

let failed = 0;
for (const [year, expected, label] of cases) {
  const actual = isPlausibleSaleYear(year);
  const pass = actual === expected;
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — isPlausibleSaleYear(${year}) === ${expected} (${label})`);
}

if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll tests passed.');
