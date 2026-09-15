// scripts/test-no-hardcoded-ticker-data.ts
//
// Regression guard for AD-46 (ARCHITECTURE_DECISIONS.md): a real, live
// incident where app/page.tsx and app/consumer-home/page.tsx both rendered
// their "LIVE" ticker from a fully hardcoded, months-stale JavaScript array
// -- never calling /api/ticker or any FRED-backed source at all. A real
// user saw "30Y FIXED 6.38% / FED FUNDS 5.25%" (pre-February-2026 figures)
// and confirmed clearing cache on multiple browsers didn't fix it, because
// the page never fetched live data in the first place.
//
// This is a pure source-inspection test (no network calls, no Supabase) --
// deliberately cheap to run on every check, since its only job is to make
// sure this exact bug class can never silently ship again: any page in
// app/ that renders a ticker-shaped element (an id/class containing
// "ticker-track" or a *-ticker-track class) must fetch a live endpoint
// (/api/ticker or /api/fred) somewhere in the same file, and must not
// contain a hardcoded array of rate-looking values feeding that ticker.
//
// Run with: npx tsx scripts/test-no-hardcoded-ticker-data.ts

import fs from 'fs';
import path from 'path';

type Status = 'PASS' | 'FAIL';
interface Result { name: string; status: Status; evidence: string }
const results: Result[] = [];
function record(name: string, status: Status, evidence: string) {
  results.push({ name, status, evidence });
  console.log(`[${status}] ${name} -- ${evidence}`);
}

const APP_DIR = path.resolve(process.cwd(), 'app');

// The exact frozen values from the real incident -- if any of these literal
// strings ever reappear anywhere in app/, something has regressed even if
// the structural checks below somehow miss it.
const KNOWN_STALE_LITERALS = ["'6.38%'", "'5.25%'", "'4.21%'", "5.87%'"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function main() {
  const files = walk(APP_DIR);

  // A. No known-stale literal values anywhere in app/ (the exact regression check).
  let foundStale: { file: string; literal: string }[] = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf-8');
    for (const lit of KNOWN_STALE_LITERALS) {
      if (src.includes(lit)) foundStale.push({ file: path.relative(process.cwd(), file), literal: lit });
    }
  }
  record('A. No known pre-incident stale rate literals (6.38%, 5.25%, 4.21%, 5.87%) anywhere in app/',
    foundStale.length === 0 ? 'PASS' : 'FAIL', JSON.stringify(foundStale));

  // B. Every file with a *-ticker-track element (id or class) fetches a live
  // endpoint somewhere in the same file. Generalizes past the two specific
  // files fixed today, so a future new page copying this ticker pattern is
  // covered automatically.
  const tickerTrackRe = /(?:id|className)=["'`][^"'`]*-?ticker-track["'`]/;
  const liveFetchRe = /fetch\(\s*['"`]\/api\/(ticker|fred)['"`]|getFredSnapshot\s*\(|getSnapshot\s*\(/;
  // app/knowledge-hub/page.tsx reuses the same ticker-track CSS pattern for an
  // unrelated static "TOPICS" article marquee (marqueeItems/topics) -- never
  // rate or FRED data, so it isn't the AD-46 bug class this test guards
  // against. Confirmed by direct inspection 2026-09-15; excluded by name
  // rather than by content-sniffing, which would be far more fragile.
  const KNOWN_NON_RATE_TICKERS = ['app/knowledge-hub/page.tsx', 'app\\knowledge-hub\\page.tsx'];
  const failures: { file: string; reason: string }[] = [];
  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    if (KNOWN_NON_RATE_TICKERS.includes(rel)) continue;
    const src = fs.readFileSync(file, 'utf-8');
    if (!tickerTrackRe.test(src)) continue; // not a ticker-shaped page at all
    if (!liveFetchRe.test(src)) {
      failures.push({ file: rel, reason: 'has a ticker-track element but no live fetch/getFredSnapshot/getSnapshot call in the same file' });
    }
  }
  record('B. Every ticker-track page fetches a live endpoint (not just today\'s two known files)',
    failures.length === 0 ? 'PASS' : 'FAIL', JSON.stringify(failures));

  // C. The two specific files fixed today, checked explicitly by name (belt
  // and suspenders on top of B's generalized scan).
  for (const rel of ['app/page.tsx', 'app/consumer-home/page.tsx']) {
    const full = path.resolve(process.cwd(), rel);
    const src = fs.readFileSync(full, 'utf-8');
    const hasLiveFetch = /fetch\(\s*['"`]\/api\/ticker['"`]/.test(src);
    const hasHardcodedArray = /const\s+tickerData\s*=\s*\[/.test(src);
    record(`C. ${rel} fetches /api/ticker and has no hardcoded tickerData array`,
      hasLiveFetch && !hasHardcodedArray ? 'PASS' : 'FAIL',
      JSON.stringify({ hasLiveFetch, hasHardcodedArray }));
  }

  console.log('\n=== FINAL RESULTS ===');
  console.table(results.map((r) => ({ name: r.name, status: r.status })));
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\nPASS=${pass} FAIL=${fail} TOTAL=${results.length}`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
