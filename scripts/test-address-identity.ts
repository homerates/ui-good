// scripts/test-address-identity.ts
//
// Deterministic unit tests for lib/addressIdentity.ts -- the property-identity
// gate built 2026-09-08 to close the broadSearchFallback() data-integrity gap
// (see that file's own header for the full incident). Pure logic, no I/O, no
// live Tavily/Supabase calls needed for test cases A-H -- run with:
//   npx tsx scripts/test-address-identity.ts

import { validatePropertyIdentity, normalizeStreetName, parseAddressComponents } from '../lib/addressIdentity';

type Status = 'PASS' | 'FAIL';
interface Result { name: string; status: Status; evidence: string }
const results: Result[] = [];
function record(name: string, status: Status, evidence: string) {
  results.push({ name, status, evidence });
  console.log(`[${status}] ${name} -- ${evidence}`);
}

const REQUESTED = '1131 Mataro Ct, Pleasanton, CA 94566';

// A. EXACT MATCH
{
  const r = validatePropertyIdentity(REQUESTED, { address: '1131 Mataro Ct', city: 'Pleasanton', state: 'CA', zip: '94566' });
  record('A. exact match', r.ok && r.code === 'CANDIDATE_ADDRESS_MATCH' ? 'PASS' : 'FAIL', JSON.stringify(r));
}

// B. NORMALIZED MATCH -- "Court" vs "Ct.", trailing period, spelled-out suffix
{
  const requested = '1131 Mataro Court, Pleasanton, CA 94566';
  const r = validatePropertyIdentity(requested, { address: '1131 Mataro Ct.', city: 'Pleasanton', state: 'CA', zip: '94566' });
  record('B. normalized suffix match (Court vs Ct.)', r.ok && r.code === 'CANDIDATE_ADDRESS_MATCH' ? 'PASS' : 'FAIL', JSON.stringify(r));
}

// C. HOUSE NUMBER MISMATCH
{
  const r = validatePropertyIdentity(REQUESTED, { address: '1155 Mataro Ct', city: 'Pleasanton', state: 'CA', zip: '94566' });
  record('C. house number mismatch -> rejected', !r.ok && r.code === 'CANDIDATE_ADDRESS_REJECTED' ? 'PASS' : 'FAIL', JSON.stringify(r));
}

// D. STREET MISMATCH
{
  const r = validatePropertyIdentity(REQUESTED, { address: '1131 Arbor Dr', city: 'Pleasanton', state: 'CA', zip: '94566' });
  record('D. street mismatch -> rejected', !r.ok && r.code === 'CANDIDATE_ADDRESS_REJECTED' ? 'PASS' : 'FAIL', JSON.stringify(r));
}

// E. ZIP MISMATCH
{
  const r = validatePropertyIdentity(REQUESTED, { address: '1131 Mataro Ct', city: 'Pleasanton', state: 'CA', zip: '90210' });
  record('E. ZIP mismatch -> rejected', !r.ok && r.code === 'CANDIDATE_ADDRESS_REJECTED' ? 'PASS' : 'FAIL', JSON.stringify(r));
}
// E2. documented ZIP+4 edge case still matches
{
  const r = validatePropertyIdentity(REQUESTED, { address: '1131 Mataro Ct', city: 'Pleasanton', state: 'CA', zip: '94566-1234' });
  record('E2. ZIP+4 candidate vs plain 5-digit requested -> matches (documented edge case)', r.ok ? 'PASS' : 'FAIL', JSON.stringify(r));
}

// F. CITY MISMATCH (no alias mechanism exists in this repo -> always fails)
{
  const r = validatePropertyIdentity(REQUESTED, { address: '1131 Mataro Ct', city: 'Dublin', state: 'CA', zip: '94566' });
  record('F. city mismatch -> rejected (no alias mechanism)', !r.ok && r.code === 'CANDIDATE_ADDRESS_REJECTED' ? 'PASS' : 'FAIL', JSON.stringify(r));
}

// G. REAL-ESTATE DOMAIN BUT WRONG PROPERTY -- a fully valid, well-formed
// candidate for a completely different real address.
{
  const r = validatePropertyIdentity(REQUESTED, { address: '42 Ocean View Ter', city: 'Half Moon Bay', state: 'CA', zip: '94019' });
  record('G. valid candidate, wrong property -> rejected', !r.ok && r.code === 'CANDIDATE_ADDRESS_REJECTED' ? 'PASS' : 'FAIL', JSON.stringify(r));
}

// H. INSUFFICIENT ADDRESS EVIDENCE -- only a domain-level result, no parseable address at all
{
  const r = validatePropertyIdentity(REQUESTED, { address: null, city: null, state: null, zip: null });
  record('H. insufficient evidence -> fail closed', !r.ok && r.code === 'NO_VERIFIABLE_CANDIDATE' ? 'PASS' : 'FAIL', JSON.stringify(r));
}
// H2. candidate has a street but no state/city/zip at all, requested specifies all -- state is required
{
  const r = validatePropertyIdentity(REQUESTED, { address: '1131 Mataro Ct' });
  record('H2. candidate missing state entirely -> fail closed', !r.ok && r.code === 'NO_VERIFIABLE_CANDIDATE' ? 'PASS' : 'FAIL', JSON.stringify(r));
}

// Directional normalization sanity check (allowed per spec)
{
  const a = normalizeStreetName('North Main Street');
  const b = normalizeStreetName('N Main St');
  record('Directional + suffix normalization (North Main Street == N Main St)', a === b ? 'PASS' : 'FAIL', `"${a}" vs "${b}"`);
}

// parseAddressComponents sanity: street-only string (this codebase's actual
// candidate.address shape from parsePropertyFromText) parses without a comma.
{
  const p = parseAddressComponents('1131 Mataro Ct');
  const ok = p?.houseNumber === '1131' && p?.street === 'Mataro Ct' && p?.city === null && p?.state === null;
  record('parseAddressComponents: street-only input (no comma)', ok ? 'PASS' : 'FAIL', JSON.stringify(p));
}

console.log('\n=== FINAL RESULTS ===');
console.table(results.map((r) => ({ name: r.name, status: r.status })));
const pass = results.filter((r) => r.status === 'PASS').length;
const fail = results.filter((r) => r.status === 'FAIL').length;
console.log(`\nPASS=${pass} FAIL=${fail} TOTAL=${results.length}`);
process.exit(fail > 0 ? 1 : 0);
