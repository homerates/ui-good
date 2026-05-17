// tools/gen-article-now.mjs
// One-shot: generate + publish a fresh market-news article
// Usage: node tools/gen-article-now.mjs

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TAVILY_KEY    = process.env.TAVILY_API_KEY;
const XAI_KEY       = process.env.XAI_API_KEY;
const XAI_MODEL     = 'grok-4-1-fast-non-reasoning';

const TITLE    = 'Home Prices in 2026: Which Markets Are Still Moving?';
const SLUG     = 'home-prices-2026-which-markets-are-still-moving-2026';
const CATEGORY = 'market-news';
const TAG      = 'Housing Market';
const SEO      = 'home prices 2026 housing market';
const QUERY    = 'home prices 2026 housing market trends cities appreciation depreciation';

function titleToSlug(t) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Tavily ────────────────────────────────────────────────────────────────────
async function tavilySearch(query) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: TAVILY_KEY, query, search_depth: 'advanced', max_results: 8, include_answer: true }),
  });
  const json = await res.json();
  const answer  = json.answer ? `SUMMARY: ${json.answer}\n\n` : '';
  const sources = (json.results ?? []).slice(0, 6)
    .map(r => `• ${r.title}: ${(r.content ?? '').slice(0, 350)}`).join('\n');
  return answer + sources;
}

// ── FRED ──────────────────────────────────────────────────────────────────────
async function getFred() {
  const res = await fetch('https://chat.homerates.ai/api/fred', { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return {};
  return res.json();
}

// ── Grok ──────────────────────────────────────────────────────────────────────
async function writeArticle(tavilyCtx, fred) {
  const fredLine = fred.mort30Avg
    ? `Live rates (FRED ${fred.asOf ?? 'today'}): 30Y fixed ${fred.mort30Avg}%, 15Y ${fred.mort15Avg ?? 'N/A'}%, 10Y Treasury ${fred.tenYearYield ?? 'N/A'}%, spread ${fred.spread ?? 'N/A'}%`
    : '';

  const prompt = `You are HomeRates.ai — a data-driven, authoritative mortgage and housing content platform. Write a high-quality, SEO-optimized article for our Market News section.

ARTICLE TITLE: "${TITLE}"
PRIMARY SEO KEYWORD: "${SEO}"
TODAY: May 2, 2026
${fredLine ? `\nLIVE MARKET DATA:\n${fredLine}` : ''}

RESEARCH DATA (from live web search):
${tavilyCtx || 'Use general market knowledge and label any estimates.'}

WRITING RULES:
- Length: 700–950 words of body content
- Tone: authoritative, data-first, never salesy
- Include at least one markdown table with real numbers (rate comparisons, payment impacts, etc.)
- Use ## section headers (no H1 — title is already H1)
- Embed live FRED rate data where relevant (use the exact numbers above)
- End with a ## Bottom Line section giving a concrete, actionable takeaway for buyers
- Mention that readers can run live scenarios at HomeRates.ai at least once naturally
- Do NOT invent MLS listings, specific property sales, or individual names
- Cite data sources inline (e.g., "per FRED", "according to NAR", "Redfin data shows")
- Optimise naturally for the primary SEO keyword

Return valid JSON only:
{
  "excerpt": "One sentence (140–160 chars) summarising the article for SEO meta description.",
  "body": "Full article in markdown. Start directly with ## first section — do NOT repeat the title."
}`;

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${XAI_KEY}` },
    body: JSON.stringify({
      model: XAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 2400,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(50_000),
  });
  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Grok returned no content');
  return JSON.parse(raw);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('🔍 Searching Tavily...');
const [tavilyCtx, fred] = await Promise.all([tavilySearch(QUERY), getFred()]);
console.log('📡 FRED:', fred.mort30Avg ? `30Y=${fred.mort30Avg}%` : 'unavailable');

console.log('✍️  Writing article with Grok...');
const article = await writeArticle(tavilyCtx, fred);
const wordCount = article.body.split(/\s+/).length;
const readTime  = Math.max(3, Math.round(wordCount / 200));

console.log(`\n📄 Title: ${TITLE}`);
console.log(`📝 Excerpt: ${article.excerpt}`);
console.log(`📊 Words: ${wordCount}, Read time: ${readTime}min`);
console.log(`🔗 Slug: ${SLUG}`);

const { data, error } = await supabase
  .from('generated_articles')
  .insert({
    slug:          SLUG,
    title:         TITLE,
    excerpt:       article.excerpt,
    body:          article.body,
    category:      CATEGORY,
    tag:           TAG,
    read_time:     readTime,
    published_at:  new Date().toISOString(),
    updated_at:    new Date().toISOString(),
    fred_snapshot: fred,
    is_auto:       true,
    status:        'published',
  })
  .select('id, slug')
  .single();

if (error) {
  console.error('❌ DB error:', error.message);
  process.exit(1);
}

const url = `https://chat.homerates.ai/market-news/${SLUG}`;
console.log(`\n✅ Published! ID: ${data.id}`);
console.log(`🌐 URL: ${url}`);
