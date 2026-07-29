// scripts/ingest-guideline-chunks.mjs
// Fetches official guideline pages/PDFs, extracts verbatim text (DOM/PDF
// parsing — NOT an AI-summarization pass, so what's ingested is exactly what
// the source publishes), chunks it, embeds via OpenAI, and inserts into
// public.guideline_chunks (migration 074).
//
// Run: npx tsx --env-file=.env.local scripts/ingest-guideline-chunks.mjs
//
// To add more sources/topics, add entries to SOURCES below and re-run —
// existing rows for a URL are cleared and replaced so re-running is safe.

import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { PDFParse } from 'pdf-parse';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) throw new Error('Missing OPENAI_API_KEY');

// renderMode:
//   'static'    plain fetch + cheerio (Fannie Mae's guide serves real
//               content in the initial HTML).
//   'js'        Playwright renders the page first, extracts from
//               contentSelector (Freddie Mac's guide.freddiemac.com and
//               VA's KnowVA portal both populate their real content via
//               client-side JS — a plain fetch returns an empty shell).
//   'pdf'       Downloads a PDF and slices the text between startMarker and
//               endMarker (HUD Handbook 4000.1 — one 1883-page PDF covering
//               all topics; VA's old direct-PDF links now redirect to the
//               same KnowVA portal as 'js' sources, so VA uses 'js' here,
//               not 'pdf', despite being nominally PDF-published).
const SOURCES = [
  {
    url: 'https://selling-guide.fanniemae.com/sel/b3-6-02/debt-income-ratios',
    source: 'fannie_mae',
    source_label: 'Fannie Mae Selling Guide',
    section_title: 'B3-6-02, Debt-to-Income Ratios',
    topic: 'dti',
    renderMode: 'static',
  },
  {
    url: 'https://selling-guide.fanniemae.com/sel/b3-5.1-01/general-requirements-credit-scores',
    source: 'fannie_mae',
    source_label: 'Fannie Mae Selling Guide',
    section_title: 'B3-5.1-01, General Requirements for Credit Scores',
    topic: 'credit_score',
    renderMode: 'static',
  },
  {
    url: 'https://selling-guide.fanniemae.com/sel/b2-1.2-01/loan-value-ltv-ratios',
    source: 'fannie_mae',
    source_label: 'Fannie Mae Selling Guide',
    section_title: 'B2-1.2-01, Loan-to-Value (LTV) Ratios',
    topic: 'ltv',
    renderMode: 'static',
  },
  {
    // Directly covers this session's motivating bug report ("can a realtor
    // cover closing costs") — realtor/seller/lender contributions toward
    // closing costs fall under Fannie Mae's Interested Party Contribution framework.
    url: 'https://selling-guide.fanniemae.com/sel/b3-4.1-02/interested-party-contributions-ipcs',
    source: 'fannie_mae',
    source_label: 'Fannie Mae Selling Guide',
    section_title: 'B3-4.1-02, Interested Party Contributions (IPCs)',
    topic: 'interested_party_contributions',
    renderMode: 'static',
  },
  {
    url: 'https://guide.freddiemac.com/app/servicing/section/5401.2',
    source: 'freddie_mac',
    source_label: 'Freddie Mac Single-Family Seller/Servicer Guide',
    section_title: 'Section 5401.2, Monthly debt payment-to-income (DTI) ratio',
    topic: 'dti',
    renderMode: 'js',
    contentSelector: '#mainContent',
  },
  {
    url: 'https://guide.freddiemac.com/app/servicing/section/5203.2',
    source: 'freddie_mac',
    source_label: 'Freddie Mac Single-Family Seller/Servicer Guide',
    section_title: 'Section 5203.2, Credit Scores',
    topic: 'credit_score',
    renderMode: 'js',
    contentSelector: '#mainContent',
  },
  {
    url: 'https://guide.freddiemac.com/app/servicing/section/4203.1',
    source: 'freddie_mac',
    source_label: 'Freddie Mac Single-Family Seller/Servicer Guide',
    section_title: 'Section 4203.1, LTV/TLTV/HTLTV Ratios and Maximum Loan Amounts',
    topic: 'ltv',
    renderMode: 'js',
    contentSelector: '#mainContent',
  },
  {
    url: 'https://guide.freddiemac.com/app/servicing/section/5501.6',
    source: 'freddie_mac',
    source_label: 'Freddie Mac Single-Family Seller/Servicer Guide',
    section_title: 'Section 5501.6, Interested party contributions',
    topic: 'interested_party_contributions',
    renderMode: 'js',
    contentSelector: '#mainContent',
  },
  {
    url: 'https://www.hud.gov/sites/dfiles/OCHCO/documents/40001-hsgh-update15-052024.pdf',
    source: 'hud_fha',
    source_label: 'HUD Handbook 4000.1',
    section_title: 'II.A.1, Borrower Minimum Decision Credit Score (MDCS)',
    topic: 'credit_score',
    renderMode: 'pdf',
    startMarker: '(3) Borrower Minimum Decision Credit Score',
    endMarker: '(4) Borrower and Co-Borrower Ownership and Obligation Requirements',
  },
  {
    url: 'https://www.hud.gov/sites/dfiles/OCHCO/documents/40001-hsgh-update15-052024.pdf',
    source: 'hud_fha',
    source_label: 'HUD Handbook 4000.1',
    section_title: 'II.A.5, Calculating Qualifying Ratios & Approvable Ratio Requirements (Manual Underwriting)',
    topic: 'dti',
    renderMode: 'pdf',
    startMarker: 'vii. Calculating Qualifying Ratios (Manual)',
    endMarker: 'ix. Documenting Acceptable Compensating Factors (Manual)',
  },
  {
    url: 'https://www.hud.gov/sites/dfiles/OCHCO/documents/40001-hsgh-update15-052024.pdf',
    source: 'hud_fha',
    source_label: 'HUD Handbook 4000.1',
    section_title: 'II.A.2, Loan-to-Value Limits',
    topic: 'ltv',
    renderMode: 'pdf',
    startMarker: 'b. Loan-to-Value Limits (02/16/2021)',
    endMarker: '(B) LTV Limitations Based on Non-Occupying Borrower Status',
  },
  {
    url: 'https://www.hud.gov/sites/dfiles/OCHCO/documents/40001-hsgh-update15-052024.pdf',
    source: 'hud_fha',
    source_label: 'HUD Handbook 4000.1',
    section_title: 'II.A.4, Interested Party Contributions (TOTAL)',
    topic: 'interested_party_contributions',
    renderMode: 'pdf',
    // Directly names "real estate agents" as Interested Parties and has a
    // specific carve-out for realtor commission payments -- the single most
    // relevant passage in this whole corpus to this session's motivating bug.
    startMarker: '(G) Interested Party Contributions (TOTAL)',
    endMarker: '(H) Inducements to Purchase (TOTAL)',
  },
  {
    url: 'https://www.knowva.ebenefits.va.gov/system/templates/selfservice/va_ssnew/help/customer/locale/en-US/portal/554400000001018/content/554400000314662/VA-Pamphlet-VAP26-7-Chapter-04-Credit-Underwriting',
    source: 'va',
    source_label: 'VA Lenders Handbook (VA Pamphlet 26-7)',
    section_title: 'Chapter 4, Topic 7: Credit History – Required Documentation and Analysis',
    topic: 'credit_score',
    renderMode: 'js',
    contentSelector: '.article-content',
    startMarker: 'Topic 7: Credit History',
    endMarker: 'Topic 8: Automated Underwriting Cases',
  },
  {
    url: 'https://www.knowva.ebenefits.va.gov/system/templates/selfservice/va_ssnew/help/customer/locale/en-US/portal/554400000001018/content/554400000314662/VA-Pamphlet-VAP26-7-Chapter-04-Credit-Underwriting',
    source: 'va',
    source_label: 'VA Lenders Handbook (VA Pamphlet 26-7)',
    section_title: 'Chapter 4, Topic 5: Debts and Obligations',
    topic: 'dti',
    renderMode: 'js',
    contentSelector: '.article-content',
    startMarker: 'Topic 5: Debts and Obligations',
    endMarker: 'Topic 6: Debts Owed to the Federal Government',
  },
  // VA LTV (no-down-payment/entitlement) and funding fee content live in
  // different chapters of the handbook, not Chapter 4 — not sourced in this
  // pass. VA also has no interested-party-contribution framework identical
  // to Fannie/Freddie/HUD's; out of scope here too.
];

// Chrome/boilerplate lines to drop for 'js' sources — UI text that isn't
// part of the guideline content itself.
function chromeLinesFor(url) {
  if (url.includes('freddiemac.com')) {
    return new Set([
      'Search the Guide', 'search', '« Back', 'angle left', 'Prev', 'Next',
      'angle right', 'Guide Home', '-', 'link', 'Copy Link', 'print', 'Print', 'Current',
    ]);
  }
  return new Set();
}

const MAX_CHUNK_CHARS = 1200;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function extractStatic(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // Fannie Mae's guide page has 3 <article> tags: an empty outer wrapper,
  // the real content article (has xmlns, no region attr), and a huge
  // sitewide sidebar TOC tree (region="guide_side_toc"). Only the middle
  // one is the actual page content.
  const $article = $('article[xmlns]').not('[region="guide_side_toc"]').first();
  if ($article.length === 0) throw new Error(`No content article found for ${url}`);
  $article.find('script, style, aside, nav').remove();

  return $article.text()
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const jsPageCache = new Map();

async function extractJs(browser, doc) {
  let lines = jsPageCache.get(doc.url);
  if (!lines) {
    const page = await browser.newPage();
    try {
      await page.goto(doc.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000); // let post-networkidle client-side rendering settle
      const html = await page.content();
      const $ = cheerio.load(html);
      const $content = $(doc.contentSelector).first();
      $content.find('script, style').remove();
      // Insert line breaks at block-tag boundaries -- some of these pages
      // (VA's KnowVA) render as one long flattened string without them.
      $content.find('p, div, li, br, tr, h1, h2, h3, h4').after('\n');
      const chrome = chromeLinesFor(doc.url);
      lines = $content.text()
        .split('\n')
        .map(l => l.replace(/\s+/g, ' ').trim())
        .filter(l => l && !chrome.has(l));
      jsPageCache.set(doc.url, lines);
    } finally {
      await page.close();
    }
  }
  return doc.startMarker ? sliceBetweenMarkers(lines, doc) : lines;
}

const pdfTextCache = new Map();

async function extractPdf(doc) {
  let fullText = pdfTextCache.get(doc.url);
  if (!fullText) {
    console.log(`  Downloading + parsing PDF (this is slow, ~1900 pages)...`);
    const res = await fetch(doc.url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`PDF fetch failed ${res.status} for ${doc.url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const parser = new PDFParse({ data: buf });
    const result = await parser.getText();
    fullText = result.text;
    pdfTextCache.set(doc.url, fullText);
  }
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
  return sliceBetweenMarkers(lines, doc);
}

// Shared by 'js' and 'pdf' sources: slice the line array between two marker
// strings (inclusive of the start line), then drop PDF page-break artifacts
// (running headers, "-- N of 1883 --" page counters) that aren't real content.
const ARTIFACT_LINE_RE = /^--\s*\d+\s*of\s*\d+\s*--$|^Handbook 4000\.1 \d+$|^Last Revised: \d{2}\/\d{2}\/\d{4}$|^II\. ORIGINATION THROUGH POST-CLOSING\/ENDORSEMENT$|^A\. Title II Insured Housing Programs Forward Mortgages$/;

// Table-of-contents lines look like "Section Title .......... 177" (dot
// leaders + trailing page number). PDF-extracted TOCs can duplicate a real
// heading's exact text near the start of the document -- matching one of
// these instead of the real body heading silently slices out nearly the
// entire remaining document. Skip candidates that look like a TOC entry.
const TOC_LINE_RE = /\.{3,}\s*\d+$/;

function sliceBetweenMarkers(lines, doc) {
  const startIdx = lines.findIndex(l => l.includes(doc.startMarker) && !TOC_LINE_RE.test(l));
  if (startIdx === -1) throw new Error(`startMarker not found for ${doc.section_title}: "${doc.startMarker}"`);
  let endIdx = lines.findIndex((l, i) => i > startIdx && l.includes(doc.endMarker) && !TOC_LINE_RE.test(l));
  if (endIdx === -1) endIdx = lines.length;
  if (endIdx - startIdx > 200) {
    throw new Error(`Suspiciously large slice (${endIdx - startIdx} lines) for ${doc.section_title} -- likely a marker collision, refusing to ingest. Check startMarker/endMarker.`);
  }
  return lines.slice(startIdx, endIdx).filter(l => !ARTIFACT_LINE_RE.test(l));
}

function chunkLines(lines) {
  const chunks = [];
  let cur = '';
  for (const line of lines) {
    if (cur && (cur.length + line.length + 1) > MAX_CHUNK_CHARS) {
      chunks.push(cur);
      cur = line;
    } else {
      cur = cur ? `${cur}\n${line}` : line;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function embed(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.data[0].embedding;
}

const browser = await chromium.launch();
let totalInserted = 0;
try {
  for (const doc of SOURCES) {
    console.log(`Fetching (${doc.renderMode}) ${doc.section_title} ...`);
    const lines = doc.renderMode === 'js' ? await extractJs(browser, doc)
      : doc.renderMode === 'pdf' ? await extractPdf(doc)
        : await extractStatic(doc.url);
    const chunks = chunkLines(lines);
    console.log(`  -> ${chunks.length} chunks`);

    // Re-running is safe: clear any existing chunks for this exact
    // (url, section_title) pair first -- several HUD entries share one url.
    const { error: delError } = await supabase.from('guideline_chunks')
      .delete().eq('url', doc.url).eq('section_title', doc.section_title);
    if (delError) { console.error('DELETE ERROR:', delError.message); process.exit(1); }

    for (const chunkText of chunks) {
      const embedding = await embed(chunkText);
      const { error } = await supabase.from('guideline_chunks').insert({
        source: doc.source,
        source_label: doc.source_label,
        section_title: doc.section_title,
        url: doc.url,
        topic: doc.topic,
        chunk_text: chunkText,
        embedding,
      });
      if (error) { console.error('INSERT ERROR:', error.message); process.exit(1); }
      totalInserted++;
    }
  }
} finally {
  await browser.close();
}
console.log(`Done. Inserted ${totalInserted} chunks total.`);
