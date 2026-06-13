// tools/redfin-probe.mjs
// Diagnostic probe: fetches a Redfin listing URL N times with the SAME headers
// the production scraper uses, and reports exactly what Redfin serves each time.
// Usage: node tools/redfin-probe.mjs <redfin-url> [runs=3] [delayMs=4000]

const HEADERS = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest':  'document',
    'Sec-Fetch-Mode':  'navigate',
    'Sec-Fetch-Site':  'none',
    'Cache-Control':   'no-cache',
};

function extractJsonLdBlobs(html) {
    const blobs = [];
    const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        try {
            const parsed = JSON.parse(m[1]);
            blobs.push(parsed);
            if (Array.isArray(parsed?.['@graph'])) for (const item of parsed['@graph']) blobs.push(item);
        } catch { /* skip */ }
    }
    return blobs;
}

function summarizeBlob(b) {
    const type = typeof b?.['@type'] === 'string' ? b['@type'] : Array.isArray(b?.['@type']) ? b['@type'].join('+') : '?';
    const street = b?.address?.streetAddress ?? null;
    const price = b?.offers?.price ?? b?.price ?? null;
    return { type, street, price };
}

async function probe(url, run) {
    const t0 = Date.now();
    try {
        const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(15000) });
        const html = await res.text();
        const ms = Date.now() - t0;
        const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim().slice(0, 80);
        const ogImage = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i)?.[1]
            ?? html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1] ?? null;
        const blobs = extractJsonLdBlobs(html);
        const listingBlobs = blobs.map(summarizeBlob).filter(b => b.street || b.price);
        const priceInHtml = (html.match(/\$[\d]{3},[\d]{3},?[\d]{0,3}/g) ?? []).slice(0, 5);
        console.log(`\n── Run ${run} ─ HTTP ${res.status} · ${ms}ms · ${Math.round(html.length / 1024)}KB · final: ${res.url === url ? 'same' : res.url}`);
        console.log(`   title:    ${title || '(none)'}`);
        console.log(`   og:image: ${ogImage ? ogImage.slice(0, 90) : '(none)'}`);
        console.log(`   json-ld blobs: ${blobs.length} total, listing-shaped: ${listingBlobs.length}`);
        for (const lb of listingBlobs.slice(0, 4)) {
            console.log(`     · [${lb.type}] street="${lb.street}" price=${lb.price ?? 'NULL'}`);
        }
        console.log(`   $X,XXX,XXX strings in HTML: ${priceInHtml.length ? priceInHtml.join(' ') : '(none)'}`);
        return { status: res.status, hasPrice: listingBlobs.some(b => b.price), blobStreets: listingBlobs.map(b => b.street) };
    } catch (e) {
        console.log(`\n── Run ${run} ─ FETCH FAILED: ${e.message}`);
        return { status: 0, hasPrice: false, blobStreets: [] };
    }
}

const url = process.argv[2];
const runs = parseInt(process.argv[3] ?? '3', 10);
const delay = parseInt(process.argv[4] ?? '4000', 10);
if (!url) { console.error('Usage: node tools/redfin-probe.mjs <url> [runs] [delayMs]'); process.exit(1); }

console.log(`Probing ${url}\n${runs} runs, ${delay}ms apart, scraper-identical headers`);
const results = [];
for (let i = 1; i <= runs; i++) {
    results.push(await probe(url, i));
    if (i < runs) await new Promise(r => setTimeout(r, delay));
}
const withPrice = results.filter(r => r.hasPrice).length;
console.log(`\n══ SUMMARY ══ ${withPrice}/${runs} runs returned a JSON-LD price · statuses: ${results.map(r => r.status).join(', ')}`);
