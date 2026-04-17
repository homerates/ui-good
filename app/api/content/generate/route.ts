// app/api/content/generate/route.ts
// POST — generate and publish one article
// Body: { topic: TopicSeed, dayOffset?: number, dryRun?: boolean }
// Auth: cron secret OR internal call

export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveTopicVariables, titleToSlug, currentYear } from '@/content/topics';
import type { TopicSeed } from '@/content/topics';

const XAI_API_KEY    = process.env.XAI_API_KEY;
const XAI_MODEL      = 'grok-4-1-fast-non-reasoning';
const TAVILY_KEY     = process.env.TAVILY_API_KEY;
const FRED_URL       = process.env.NEXT_PUBLIC_APP_URL ?? 'https://chat.homerates.ai';
const SITE_HOST      = 'chat.homerates.ai';
const INDEXNOW_KEY   = '41d38600a6084855bb51b535bddf8953';

// ── IndexNow ping — notifies Bing, Yandex + 8 other engines instantly ────────
async function pingIndexNow(url: string): Promise<void> {
  try {
    await fetch('https://api.indexnow.org/indexnow', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host:        SITE_HOST,
        key:         INDEXNOW_KEY,
        keyLocation: `https://${SITE_HOST}/${INDEXNOW_KEY}.txt`,
        urlList:     [url],
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch { /* non-fatal */ }
}

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Tavily search ─────────────────────────────────────────────────────────────
async function tavilySearch(query: string): Promise<string> {
  if (!TAVILY_KEY) return '';
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_KEY,
        query,
        search_depth: 'basic',
        max_results: 6,
        include_answer: true,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return '';
    const json = await res.json();
    const answer  = json.answer ? `SUMMARY: ${json.answer}\n\n` : '';
    const sources = (json.results ?? [])
      .slice(0, 5)
      .map((r: any) => `• ${r.title}: ${(r.content ?? '').slice(0, 300)}`)
      .join('\n');
    return answer + sources;
  } catch {
    return '';
  }
}

// ── FRED snapshot ─────────────────────────────────────────────────────────────
async function getFredSnapshot(): Promise<Record<string, any>> {
  try {
    const res = await fetch(`${FRED_URL}/api/fred`, { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

// ── Grok article writer ───────────────────────────────────────────────────────
async function writeArticle(opts: {
  title: string;
  category: string;
  seoFocus: string;
  tavilyContext: string;
  fredSnapshot: Record<string, any>;
}): Promise<{ body: string; excerpt: string; readTime: number } | null> {
  if (!XAI_API_KEY) return null;

  const fred = opts.fredSnapshot;
  const fredLine = fred.mort30Avg
    ? `Live rates (FRED ${fred.asOf ?? 'today'}): 30Y fixed ${fred.mort30Avg}%, 15Y ${fred.mort15Avg ?? 'N/A'}%, 10Y Treasury ${fred.tenYearYield ?? 'N/A'}%, spread ${fred.spread ?? 'N/A'}%`
    : '';

  const prompt = `You are HomeRates.ai — a data-driven, authoritative mortgage and housing content platform. Write a high-quality, SEO-optimized article for our ${opts.category === 'market-news' ? 'Market News' : 'Knowledge Hub'} section.

ARTICLE TITLE: "${opts.title}"
PRIMARY SEO KEYWORD: "${opts.seoFocus}"
TODAY: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
${fredLine ? `\nLIVE MARKET DATA:\n${fredLine}` : ''}

RESEARCH DATA (from live web search — use specific facts and numbers from here):
${opts.tavilyContext || 'No web data available — use general market knowledge and clearly label any estimates.'}

WRITING RULES:
- Length: 650–900 words of body content
- Tone: authoritative, data-first, never salesy or vague
- Include at least one markdown table with real numbers
- Use ## section headers (no H1 — title is H1)
- Embed live FRED rate data where relevant (use the numbers above exactly)
- Include specific city/state data where the topic calls for it
- End with a clear "## Bottom Line" section that gives a concrete takeaway
- Internal link suggestion: mention that readers can "run live scenarios at HomeRates.ai" at least once naturally
- Do NOT invent MLS listings, specific property sales, or names of individuals
- DO cite data sources inline (e.g., "per FRED", "according to NAR", "Redfin data shows")
- Optimise naturally for the primary SEO keyword without keyword stuffing

Return valid JSON only:
{
  "excerpt": "One sentence (140-160 chars) summarising the article for SEO meta description and card preview.",
  "body": "Full article in markdown. Start directly with ## first section — do NOT repeat the title."
}`;

  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${XAI_API_KEY}` },
      body: JSON.stringify({
        model: XAI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 2200,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const raw  = json.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.body || !parsed.excerpt) return null;
    const wordCount = parsed.body.split(/\s+/).length;
    const readTime  = Math.max(3, Math.round(wordCount / 200));
    return { body: parsed.body, excerpt: parsed.excerpt, readTime };
  } catch {
    return null;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const cronSecret  = process.env.CRON_SECRET;
  const authHeader  = req.headers.get('x-cron-secret');
  const isInternal  = cronSecret && authHeader === cronSecret;
  if (!isInternal) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const seed: TopicSeed    = body.topic;
  const dayOffset: number  = body.dayOffset ?? 0;
  const dryRun: boolean    = body.dryRun ?? false;

  if (!seed) return NextResponse.json({ error: 'topic required' }, { status: 400 });

  const { title, query, seoFocus } = resolveTopicVariables(seed, dayOffset);
  const slug = `${titleToSlug(title)}-${currentYear()}`;

  // Check for duplicate
  const supabase = db();
  const { data: existing } = await supabase
    .from('generated_articles')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existing) {
    console.log('[Content] Skipping duplicate:', slug);
    return NextResponse.json({ ok: true, skipped: true, slug });
  }

  // Fetch data in parallel
  const [tavilyContext, fredSnapshot] = await Promise.all([
    tavilySearch(query),
    getFredSnapshot(),
  ]);

  const article = await writeArticle({
    title,
    category: seed.category,
    seoFocus,
    tavilyContext,
    fredSnapshot,
  });

  if (!article) {
    console.error('[Content] Grok write failed for:', title);
    return NextResponse.json({ error: 'Article generation failed' }, { status: 500 });
  }

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, title, slug, excerpt: article.excerpt, bodyPreview: article.body.slice(0, 400) });
  }

  const { data, error } = await supabase
    .from('generated_articles')
    .insert({
      slug,
      title,
      excerpt:      article.excerpt,
      body:         article.body,
      category:     seed.category,
      tag:          seed.tag,
      read_time:    article.readTime,
      published_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
      fred_snapshot: fredSnapshot,
      is_auto:      true,
      status:       'published',
    })
    .select('id, slug')
    .single();

  if (error) {
    console.error('[Content] DB insert failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log('[Content] Published:', slug);

  // Ping IndexNow — notifies Bing, Yandex, and participating engines immediately
  pingIndexNow(`https://${SITE_HOST}/${seed.category}/${slug}`);

  return NextResponse.json({ ok: true, slug, id: data?.id, title, category: seed.category });
}
