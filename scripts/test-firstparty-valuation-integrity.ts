// scripts/test-firstparty-valuation-integrity.ts
//
// North Star Workstream 9 -- Canonical Intelligence Source of Truth
// (2026-09-10).
//
// AD-22 (WS8) found two real, confirmed, first-party-only bugs in
// app/property-report/page.tsx, traced but explicitly NOT fixed in that
// workstream: (1) `resolveAvm(...) ?? price` silently presents the asking
// price back to the user labeled "AI Estimate" whenever Grok returns no
// independent valuation, and (2) `market_sale_to_list * 100` re-multiplies a
// value that is already a percent (98.4), producing "9840.0%".
//
// This workstream's source-of-truth audit found the SAME two-bug pattern
// also present in app/wl-report/page.tsx (identical AVM-as-price fallback,
// identical double-percentage bug), and a narrower version of the
// sale-to-list normalization gap (missing entirely, not just double-applied)
// in app/property-intel/page.tsx (two call sites) and app/instant/page.tsx --
// four more surfaces that had never been audited before. All were fixed by
// (a) making `avm` genuinely nullable everywhere, gating every avm-dependent
// display/text on `avm != null`, and showing market-median valuation context
// instead of a fabricated AI Estimate when no AVM exists (Phase 5's
// "prefer showing valuation context over hiding intelligence"), and (b)
// extracting the previously-inconsistent inline ">2 ? /100 : x" guard (some
// call sites had it, some silently didn't) into one shared
// `normalizeSaleToList()` helper in lib/scoring/decisionScore.ts, now used by
// every one of the 8 call sites across the codebase that call scoreL3 with a
// Grok-sourced sale-to-list value.
//
// This is a CONTRACT/SOURCE test -- it inspects source text and exercises the
// shared normalization/AVM helpers directly. It does not render the React
// pages (no browser harness exists in this suite); it proves the specific
// anti-patterns are structurally absent and the shared helper behaves
// correctly, not that the rendered UI looks a particular way.
//
// Run with: npx tsx scripts/test-firstparty-valuation-integrity.ts

import fs from 'fs';
import path from 'path';

import { normalizeSaleToList, resolveAvm, scoreL3 } from '../lib/scoring/decisionScore';

type Status = 'PASS' | 'FAIL';
interface Result { name: string; status: Status; evidence: string }
const results: Result[] = [];
function record(name: string, status: Status, evidence: string) {
  results.push({ name, status, evidence });
  console.log(`[${status}] ${name} -- ${evidence}`);
}

function readSrc(rel: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
}

// ===== A. normalizeSaleToList() unit behavior =====

record('A1. normalizeSaleToList: percent input (98.4) -> ratio (0.984)',
  Math.abs(normalizeSaleToList(98.4)! - 0.984) < 1e-9 ? 'PASS' : 'FAIL',
  String(normalizeSaleToList(98.4)));

record('A2. normalizeSaleToList: ratio input (0.984) stays unchanged',
  normalizeSaleToList(0.984) === 0.984 ? 'PASS' : 'FAIL',
  String(normalizeSaleToList(0.984)));

record('A3. normalizeSaleToList: null/undefined -> null',
  normalizeSaleToList(null) === null && normalizeSaleToList(undefined) === null ? 'PASS' : 'FAIL',
  JSON.stringify({ n: normalizeSaleToList(null), u: normalizeSaleToList(undefined) }));

record('A4. normalizeSaleToList: boundary value 2.0 stays unchanged (a real ratio can approach but never exceed ~1.3-1.5 in practice; 2 is the documented cutoff)',
  normalizeSaleToList(2) === 2 ? 'PASS' : 'FAIL',
  String(normalizeSaleToList(2)));

// ===== B. Proves the ACTUAL Seaview bug is fixed: un-normalized 98.4 fed to
// scoreL3 previously always fell into the "else 30" branch; normalized 0.984
// correctly lands in the "< 1.00 -> 68" branch. =====

{
  const unnormalized = scoreL3({ domMedian: 38, saleToList: 98.4 });
  const normalized = scoreL3({ domMedian: 38, saleToList: normalizeSaleToList(98.4) });
  // domScore(38)=55 either way; stlScore differs: un-normalized 98.4 always
  // falls into the lowest "else 30" branch, normalized 0.984 correctly lands
  // in the "<1.00 -> 68" branch. Averaged with domScore: (55+30)/2=43 vs (55+68)/2=62.
  record('B1. Un-normalized 98.4 corrupts L3 (documents the bug that existed, not a requirement)',
    unnormalized.score === 43 && /9840\.0%/.test(unnormalized.summary) ? 'PASS' : 'FAIL', JSON.stringify(unnormalized));
  record('B2. Normalized 98.4 -> 0.984 produces the correct, higher L3 score',
    normalized.score === 62 && normalized.score > unnormalized.score ? 'PASS' : 'FAIL', JSON.stringify(normalized));
}

// ===== C. resolveAvm never needs a caller-side "?? price" fallback -- proves
// the primitive itself stays properly nullable so call sites have no excuse
// to bolt one on. =====

record('C1. resolveAvm(null, null) -> null (never fabricates a value)',
  resolveAvm(null, null) === null ? 'PASS' : 'FAIL', String(resolveAvm(null, null)));

// ===== D. Source-inspection: the specific anti-pattern is structurally gone
// from every first-party surface it was found in. =====

const surfaces: { file: string; label: string }[] = [
  { file: 'app/property-report/page.tsx', label: 'property-report' },
  { file: 'app/wl-report/page.tsx', label: 'wl-report' },
  { file: 'app/property-intel/page.tsx', label: 'property-intel' },
  { file: 'app/instant/page.tsx', label: 'instant' },
  { file: 'app/chat/page.tsx', label: 'chat' },
  { file: 'app/api/instant-score/route.ts', label: 'instant-score API' },
];

for (const { file, label } of surfaces) {
  const src = readSrc(file);

  // D1: no raw inline ">2 ? x/100 : x" guard remains duplicated -- every site
  // must route through the shared helper now.
  const hasInlineGuard = /market_sale_to_list[^;]*>\s*2\s*\?/.test(src) || /stlRaw[^;]*>\s*2\s*\?/.test(src) || /s2lRaw[^;]*>\s*2\s*\?/.test(src);
  record(`D1. ${label}: no duplicated inline sale-to-list percent guard (uses shared normalizeSaleToList instead)`,
    !hasInlineGuard ? 'PASS' : 'FAIL', hasInlineGuard ? 'inline guard still present' : 'clean');

  record(`D2. ${label}: imports normalizeSaleToList from lib/scoring/decisionScore`,
    /normalizeSaleToList/.test(src) ? 'PASS' : 'FAIL', /normalizeSaleToList/.test(src) ? 'found' : 'missing');
}

// D3/D4 only apply to the two surfaces that had the asking-price-as-AVM bug.
for (const { file, label } of [{ file: 'app/property-report/page.tsx', label: 'property-report' }, { file: 'app/wl-report/page.tsx', label: 'wl-report' }]) {
  const src = readSrc(file);

  const hasAvmPriceFallback = /resolveAvm\([^)]*\)\s*\?\?\s*price/.test(src);
  record(`D3. ${label}: no "resolveAvm(...) ?? price" silent AVM-as-asking-price fallback`,
    !hasAvmPriceFallback ? 'PASS' : 'FAIL', hasAvmPriceFallback ? 'fallback still present' : 'clean');

  const hasMarketMedianFallback = /Market Median/.test(src) && /market_median_price/.test(src);
  record(`D4. ${label}: shows market-median valuation context when AVM is null (Phase 5 -- context over hiding)`,
    hasMarketMedianFallback ? 'PASS' : 'FAIL', hasMarketMedianFallback ? 'found' : 'missing');

  // D5: the "favorable entry" / "priced below AI estimate" claim must not
  // fire on an exact-equality (diff === 0) case -- must use a strict ">" test.
  const favorableEntryLines = src.split('\n').filter(l => /favorable entry|List priced below AI estimate/.test(l));
  const usesStrictGreaterThan = favorableEntryLines.every(l => /avmDiff\s*\?\?\s*0\)\s*>\s*0/.test(l) || /\(avmDiff\s*\?\?\s*0\)>0/.test(l));
  record(`D5. ${label}: "favorable entry" wording only fires on strictly-positive diff (avm===price no longer claims favorable)`,
    favorableEntryLines.length > 0 && usesStrictGreaterThan ? 'PASS' : 'FAIL',
    JSON.stringify(favorableEntryLines));
}

// ===== E. Live check against the real Seaview property (no AVM available):
// canonical, property-report-equivalent, and wl-report-equivalent logic must
// all agree avm/L2 stay null for this exact property, rather than one surface
// fabricating a value the others correctly omit. =====

async function liveSeaviewCheck() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  const { getSupabase } = await import('../lib/supabaseServer');
  const { resolvePropertyId } = await import('../lib/gateway/intelligenceGateway');
  const { buildCanonicalPropertyIntelligence } = await import('../lib/canonicalPropertyIntelligence');

  const sb = getSupabase();
  if (!sb) { record('E1. Seaview live check', 'FAIL', 'Supabase not configured'); return; }

  const address = '1123 Seaview Ave, Pacific Grove, CA 93950';
  const id = await resolvePropertyId(address);
  if (!id) { record('E1. Seaview live check', 'FAIL', 'property not found'); return; }

  const addrNorm = address.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const { data: grok } = await sb.from('grok_property_cache').select('grok_result').eq('address_normalized', addrNorm).maybeSingle();
  const gr = grok?.grok_result as any;

  const pageEquivalentAvm = resolveAvm(gr?.zillow_estimate ?? null, gr?.redfin_estimate ?? null);
  record('E1. Seaview: property-report/wl-report-equivalent avm computation stays null (no zillow/redfin estimate exists)',
    pageEquivalentAvm === null ? 'PASS' : 'FAIL', String(pageEquivalentAvm));

  const canonical = await buildCanonicalPropertyIntelligence(id);
  if (!canonical) { record('E2. Seaview: canonical intelligence build', 'FAIL', 'buildCanonicalPropertyIntelligence returned null'); return; }
  record('E2. Seaview: canonical valuation.pointEstimate also null -- first-party fix now agrees with canonical (same truth state)',
    canonical.valuation.pointEstimate === null ? 'PASS' : 'FAIL', String(canonical.valuation.pointEstimate));

  const rawStl = gr?.market_sale_to_list;
  const pageEquivalentRatio = normalizeSaleToList(rawStl ?? null);
  record('E3. Seaview: normalized sale-to-list is 0.984 (98.4%), not 9840% or a corrupted L3 input',
    pageEquivalentRatio != null && Math.abs(pageEquivalentRatio - 0.984) < 1e-9 ? 'PASS' : 'FAIL',
    JSON.stringify({ raw: rawStl, normalized: pageEquivalentRatio }));

  record('E4. Seaview: canonical market.saleToListPct still reports 98.4 (unaffected by this workstream, still correct)',
    canonical.market?.saleToListPct === 98.4 ? 'PASS' : 'FAIL', String(canonical.market?.saleToListPct));
}

async function main() {
  await liveSeaviewCheck();

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
