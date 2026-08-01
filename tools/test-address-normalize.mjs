// Regression test for lib/addressNormalize.ts — the fix for the THIRD occurrence today of
// duplicate `properties` rows for the same address, this time from punctuation variance
// (extra/missing comma before the ZIP) between what different callers pass in.
// Usage: node --experimental-strip-types tools/test-address-normalize.mjs
import { stripCommasAndSpaces, addressesMatchLoosely, addressPrefixTokens } from '../lib/addressNormalize.ts';

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

// The exact regression: an extra comma before the ZIP vs. the correctly-formatted address.
check(
  'extra comma before ZIP matches the correctly-formatted address',
  addressesMatchLoosely(
    '2420 e county down dr, chandler, az, 85249',
    '2420 e county down dr, chandler, az 85249',
  ),
  true,
);

check(
  'case-insensitive',
  addressesMatchLoosely('123 MAIN ST, Springfield, IL 62704', '123 main st, springfield, il 62704'),
  true,
);

check(
  'different house number does NOT match (never treat as the same address)',
  addressesMatchLoosely('123 Main St, Springfield, IL 62704', '124 Main St, Springfield, IL 62704'),
  false,
);

check(
  'different street name does NOT match',
  addressesMatchLoosely('123 Main St, Springfield, IL 62704', '123 Oak St, Springfield, IL 62704'),
  false,
);

check(
  'missing ZIP entirely does NOT match (a genuinely incomplete address, not just punctuation)',
  addressesMatchLoosely('2420 E County Down Dr, Chandler, AZ', '2420 E County Down Dr, Chandler, AZ 85249'),
  false,
);

check(
  'addressPrefixTokens ignores commas when building the narrowing prefix',
  addressPrefixTokens('2420 E County Down Dr, Chandler, AZ, 85249', 3),
  '2420 e county',
);

if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll tests passed.');
