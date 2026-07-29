// scripts/ingest-guideline-chunks.mjs
// Fetches official guideline pages, extracts verbatim text (cheerio DOM
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) throw new Error('Missing OPENAI_API_KEY');

// Phase 1: Fannie Mae Selling Guide only (confirmed fetchable as plain HTML
// via curl-equivalent fetch + cheerio). Freddie Mac's guide.freddiemac.com
// appeared to require JS rendering when tested; HUD Handbook 4000.1 and VA
// Pamphlet 26-7 are PDF-published, not HTML — both need a different
// extraction approach and are out of scope for this pass. Add them here once
// that's built.
const SOURCES = [
  {
    url: 'https://selling-guide.fanniemae.com/sel/b3-6-02/debt-income-ratios',
    source: 'fannie_mae',
    source_label: 'Fannie Mae Selling Guide',
    section_title: 'B3-6-02, Debt-to-Income Ratios',
    topic: 'dti',
  },
  {
    url: 'https://selling-guide.fanniemae.com/sel/b3-5.1-01/general-requirements-credit-scores',
    source: 'fannie_mae',
    source_label: 'Fannie Mae Selling Guide',
    section_title: 'B3-5.1-01, General Requirements for Credit Scores',
    topic: 'credit_score',
  },
  {
    url: 'https://selling-guide.fanniemae.com/sel/b2-1.2-01/loan-value-ltv-ratios',
    source: 'fannie_mae',
    source_label: 'Fannie Mae Selling Guide',
    section_title: 'B2-1.2-01, Loan-to-Value (LTV) Ratios',
    topic: 'ltv',
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
  },
];

const MAX_CHUNK_CHARS = 1200;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function fetchAndExtract(url) {
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

let totalInserted = 0;
for (const doc of SOURCES) {
  console.log(`Fetching ${doc.url} ...`);
  const lines = await fetchAndExtract(doc.url);
  const chunks = chunkLines(lines);
  console.log(`  ${doc.section_title}: ${chunks.length} chunks`);

  // Re-running is safe: clear any existing chunks for this URL first.
  const { error: delError } = await supabase.from('guideline_chunks').delete().eq('url', doc.url);
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
console.log(`Done. Inserted ${totalInserted} chunks total.`);
