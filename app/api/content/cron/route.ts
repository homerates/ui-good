// app/api/content/cron/route.ts
// GET — daily content engine. Runs at 8am PT via Vercel cron.
// Generates 2 Market News + 1 Knowledge Hub article per day.
// Each article: FRED live rates + Tavily research + Grok writing.

export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { postArticleTweet } from '@/twitter';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const APP_URL     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://chat.homerates.ai';
const CRON_SECRET = process.env.CRON_SECRET;
const ADMIN_EMAIL = 'legatum2005@gmail.com';

async function alertAdmin(results: { published: number; skipped: number; failed: number; tweetFailed: number; articles: string[] }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const from = process.env.RESEND_FROM_EMAIL ?? 'digest@mail.homerates.ai';
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const subject = results.published === 0
    ? `⚠️ Content engine published 0 articles — ${dateStr}`
    : `⚠️ Content engine: ${results.tweetFailed} tweet(s) failed — ${dateStr}`;
  try {
    const resend = new Resend(key);
    await resend.emails.send({
      from,
      to: ADMIN_EMAIL,
      subject,
      html: `<p>Daily content cron results:</p>
<ul>
  <li>Published: ${results.published}</li>
  <li>Skipped (duplicate slugs): ${results.skipped}</li>
  <li>Failed (API/DB errors): ${results.failed}</li>
  <li>Tweet failures: ${results.tweetFailed}</li>
</ul>
${results.published === 0 ? `<p>Common causes: Grok/Tavily API key expired, Supabase insert blocked, or slug collision.</p>` : ''}
${results.tweetFailed > 0 ? `<p>Twitter failures: credentials may be expired/revoked. Check developer.x.com and regenerate tokens. Test at <a href="${APP_URL}/api/admin/test-twitter">/api/admin/test-twitter</a></p>` : ''}
<p><a href="${APP_URL}/admin">Open admin dashboard →</a></p>`,
    });
  } catch (e: any) {
    console.error('[ContentCron] alert email failed:', e.message);
  }
}

export async function GET(req: Request) {
  if (!CRON_SECRET || req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { pickTopicsForToday, MARKET_NEWS_TOPICS } = await import('@/content/topics');

  const badTopics = MARKET_NEWS_TOPICS.filter(t => !t.titleTemplate.includes('{date}'));
  if (badTopics.length > 0) {
    console.warn('[ContentCron] WARNING: market-news topics missing {date}:', badTopics.map(t => t.titleTemplate));
  }

  const results = { published: 0, skipped: 0, failed: 0, tweetFailed: 0, articles: [] as string[], tweeted: [] as string[] };

  // ── Phase 1: Generate today's articles ───────────────────────────────────────
  const topics = pickTopicsForToday({ news: 2, hub: 1 });
  const newlyPublished: Array<{ title: string; excerpt: string; slug: string; category: string }> = [];

  for (let i = 0; i < topics.length; i++) {
    try {
      const res = await fetch(`${APP_URL}/api/content/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
        body: JSON.stringify({ topic: topics[i], dayOffset: i }),
      });
      const json = await res.json();
      if (json.skipped) {
        results.skipped++;
        console.log('[ContentCron] Skipped (duplicate):', json.slug);
      } else if (json.ok) {
        results.published++;
        results.articles.push(json.slug);
        newlyPublished.push({ title: json.title, excerpt: json.excerpt ?? '', slug: json.slug, category: json.category });
        console.log('[ContentCron] Published:', json.slug);
      } else {
        results.failed++;
        console.error('[ContentCron] Generate failed:', json.error);
      }
    } catch (e: any) {
      results.failed++;
      console.error('[ContentCron] Generate error:', e.message);
    }
  }

  // ── Phase 2: Retry-tweet recent articles missing twitter_post_id ─────────────
  // Finds articles from the last 7 days whose fred_snapshot lacks twitter_post_id,
  // plus newly published ones above. Caps at 5 tweets per run to stay within rate limits.
  const supabase = db();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: unposted } = await supabase
    .from('generated_articles')
    .select('slug, title, excerpt, category, fred_snapshot')
    .gte('published_at', sevenDaysAgo)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(20);

  // Build tweet queue: newly published first, then retry candidates without twitter_post_id
  const toTweet: Array<{ title: string; excerpt: string; slug: string; category: string }> = [
    ...newlyPublished,
  ];
  for (const row of (unposted ?? [])) {
    const alreadyTweeted = !!(row.fred_snapshot as any)?.twitter_post_id;
    const alreadyQueued = toTweet.some(t => t.slug === row.slug);
    if (!alreadyTweeted && !alreadyQueued) {
      toTweet.push({ title: row.title, excerpt: row.excerpt ?? '', slug: row.slug, category: row.category });
    }
  }

  // Post up to 5 tweets per run (new + retries)
  for (const article of toTweet.slice(0, 5)) {
    try {
      const tweetResult = await postArticleTweet(article);
      if (tweetResult.success && tweetResult.tweetId) {
        console.log('[ContentCron] Tweeted:', article.slug, '— id:', tweetResult.tweetId);
        results.tweeted.push(article.slug);
        // Store tweet ID in fred_snapshot so we don't retry this article
        const { data: existing } = await supabase.from('generated_articles').select('fred_snapshot').eq('slug', article.slug).maybeSingle();
        await supabase.from('generated_articles').update({
          fred_snapshot: { ...(existing?.fred_snapshot ?? {}), twitter_post_id: tweetResult.tweetId, tweeted_at: new Date().toISOString() },
        }).eq('slug', article.slug);
      } else {
        results.tweetFailed++;
        console.error('[ContentCron] Tweet failed for', article.slug, ':', tweetResult.error);
      }
    } catch (e: any) {
      results.tweetFailed++;
      console.error('[ContentCron] Tweet threw for', article.slug, ':', e.message);
    }
  }

  console.log('[ContentCron] done', results);

  if (results.published === 0 || results.tweetFailed > 0) {
    await alertAdmin(results);
  }

  return NextResponse.json({ ok: true, ...results });
}
