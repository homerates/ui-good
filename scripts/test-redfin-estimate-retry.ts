// scripts/test-redfin-estimate-retry.ts
//
// Regression test for the Redfin-estimate retry added to
// lib/property/fetch.ts's fetchPropertyData() (2026-09-15). Real, live
// incident: 870 Doud St, Monterey -- Redfin's own live page has a real
// Redfin Estimate ($1,492,578, confirmed by directly browsing it), and
// lib/property/parse/redfin.ts's extractRedfinEstimate() correctly parses
// it when given that exact HTML (confirmed by calling it directly) -- but
// fetchPropertyData() itself returned no estimate for the same listing,
// and repeated calls escalated to an outright block. Redfin's bot-
// mitigation appears to intermittently serve a page with basic JSON-LD/
// price data intact but the heavier, more dynamic estimate widget
// omitted, distinct from a full block. Mocks global.fetch so this is
// deterministic and makes no real network calls.
//
// Run with: npx tsx scripts/test-redfin-estimate-retry.ts

type Status = 'PASS' | 'FAIL';
interface Result { name: string; status: Status; evidence: string }
const results: Result[] = [];
function record(name: string, status: Status, evidence: string) {
  results.push({ name, status, evidence });
  console.log(`[${status}] ${name} -- ${evidence}`);
}

const REDFIN_URL = 'https://www.redfin.com/CA/Monterey/870-Doud-St-93940/home/14960420';

function jsonLdHtml(): string {
  const blob = {
    '@type': ['Product', 'RealEstateListing'],
    offers: { price: 1450000, availability: 'InStock' },
    address: { streetAddress: '870 Doud St', addressLocality: 'Monterey', addressRegion: 'CA', postalCode: '93940' },
    numberOfBedrooms: 3,
    numberOfBathroomsTotal: 2,
    floorSize: { value: 1318 },
    taxAnnualAmount: 11020,
    image: 'https://ssl.cdn-redfin.com/photo/8/mbpaddedwide/825/genMid.ML82060825_0.jpg',
  };
  return `<html><head><title>870 Doud St, Monterey, CA 93940</title>` +
    `<script type="application/ld+json">${JSON.stringify(blob)}</script></head><body></body></html>`;
}

// Real page's structure (simplified) -- degraded response omits this section entirely.
const ESTIMATE_SECTION =
  `<div data-rf-test-name="redfinEstimateSection" class="sectionContainer avmInfoPanel">` +
  `<div class="RedfinEstimateValueHeader"><div class="price">$1,492,578</div></div></div>`;

function degradedHtml(): string { return jsonLdHtml(); }
function fullHtml(): string { return jsonLdHtml().replace('</body>', `${ESTIMATE_SECTION}</body>`); }

const realFetch = globalThis.fetch;
let fetchSequence: (() => string)[] = [];
let fetchCallCount = 0;

function installMock() {
  fetchCallCount = 0;
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    if (url.includes('redfin.com')) {
      const idx = fetchCallCount;
      fetchCallCount += 1;
      const gen = fetchSequence[idx] ?? fetchSequence[fetchSequence.length - 1];
      return new Response(gen(), { status: 200, headers: { 'content-type': 'text/html' } });
    }
    return realFetch(input);
  }) as typeof fetch;
}

function restoreFetch() { globalThis.fetch = realFetch; }

async function main() {
  const { fetchPropertyData } = await import('../lib/property/fetch');

  // A: degraded first response, full estimate on retry -> retry recovers it.
  {
    installMock();
    fetchSequence = [degradedHtml, fullHtml];
    const t0 = Date.now();
    const result: any = await fetchPropertyData(REDFIN_URL);
    const elapsedMs = Date.now() - t0;
    restoreFetch();
    record('A. Degraded first fetch, full estimate on retry -- recovered, exactly 2 fetches',
      result.ok === true && result.data?.estimatedValue === 1492578 && fetchCallCount === 2 ? 'PASS' : 'FAIL',
      JSON.stringify({ ok: result.ok, estimatedValue: result.data?.estimatedValue, fetchCallCount, elapsedMs }));
  }

  // B: both attempts degraded -> stays null, still ok:true (never becomes an error).
  {
    installMock();
    fetchSequence = [degradedHtml, degradedHtml];
    const result: any = await fetchPropertyData(REDFIN_URL);
    restoreFetch();
    record('B. Both attempts degraded -- estimatedValue stays null, still a successful (not error) result',
      result.ok === true && result.data?.estimatedValue == null && fetchCallCount === 2 ? 'PASS' : 'FAIL',
      JSON.stringify({ ok: result.ok, estimatedValue: result.data?.estimatedValue, fetchCallCount }));
  }

  // C: full estimate on the FIRST attempt -- no retry needed, exactly 1 fetch.
  {
    installMock();
    fetchSequence = [fullHtml, degradedHtml];
    const result: any = await fetchPropertyData(REDFIN_URL);
    restoreFetch();
    record('C. Estimate present on first attempt -- no retry fired, exactly 1 fetch',
      result.ok === true && result.data?.estimatedValue === 1492578 && fetchCallCount === 1 ? 'PASS' : 'FAIL',
      JSON.stringify({ ok: result.ok, estimatedValue: result.data?.estimatedValue, fetchCallCount }));
  }

  // D: retry itself throws (network error) -- never turns a successful fetch into a failure.
  {
    installMock();
    let call = 0;
    globalThis.fetch = (async (input: any) => {
      const url = typeof input === 'string' ? input : input?.url ?? String(input);
      if (url.includes('redfin.com')) {
        call += 1;
        if (call === 1) return new Response(degradedHtml(), { status: 200, headers: { 'content-type': 'text/html' } });
        throw new Error('simulated network failure on retry');
      }
      return realFetch(input);
    }) as typeof fetch;
    const result: any = await fetchPropertyData(REDFIN_URL);
    restoreFetch();
    record('D. Retry fetch itself throws -- original (no-estimate) result still returned successfully',
      result.ok === true && result.data?.price === 1450000 && result.data?.estimatedValue == null ? 'PASS' : 'FAIL',
      JSON.stringify({ ok: result.ok, price: result.data?.price, estimatedValue: result.data?.estimatedValue }));
  }

  console.log('\n=== FINAL RESULTS ===');
  console.table(results.map((r) => ({ name: r.name, status: r.status })));
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\nPASS=${pass} FAIL=${fail} TOTAL=${results.length}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
