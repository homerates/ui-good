// app/api/content/cron/route.ts
// GET — daily content engine. Runs at 7am PT via Vercel cron.
// Generates 2 Market News + 1 Knowledge Hub article per day.
// Each article: FRED live rates + Tavily research + Grok writing.

export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const APP_URL     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://chat.homerates.ai';
const CRON_SECRET = process.env.CRON_SECRET;
const ADMIN_EMAIL = 'legatum2005@gmail.com';

async function alertAdmin(results: { published: number; skipped: number; failed: number; articles: string[] }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const from = process.env.RESEND_FROM_EMAIL ?? 'digest@mail.homerates.ai';
  try {
    const resend = new Resend(key);
    await resend.emails.send({
      from,
      to: ADMIN_EMAIL,
      subject: `⚠️ Content engine published 0 articles — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      html: `<p>The daily content cron ran but published <strong>0 articles</strong>.</p>
<ul>
  <li>Skipped (duplicate slugs): ${results.skipped}</li>
  <li>Failed (API/DB errors): ${results.failed}</li>
</ul>
<p>Common causes:</p>
<ul>
  <li>All topic title templates use <code>{month}</code> instead of <code>{date}</code> — slugs collide within the same calendar month.</li>
  <li>Grok/Tavily API key expired or rate-limited.</li>
  <li>Supabase <code>generated_articles</code> table insert blocked.</li>
</ul>
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

  // Import topic picker here to keep route lean
  const { pickTopicsForToday, MARKET_NEWS_TOPICS } = await import('@/content/topics');

  // Guard: warn if any market-news topic is missing {date} — would cause slug collisions
  const badTopics = MARKET_NEWS_TOPICS.filter(t => !t.titleTemplate.includes('{date}'));
  if (badTopics.length > 0) {
    console.warn('[ContentCron] WARNING: market-news topics missing {date} in titleTemplate:', badTopics.map(t => t.titleTemplate));
  }

  const topics = pickTopicsForToday({ news: 2, hub: 1 });
  const results = { published: 0, skipped: 0, failed: 0, articles: [] as string[] };

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
      } else if (json.ok) {
        results.published++;
        results.articles.push(json.slug);
      } else {
        results.failed++;
        console.error('[ContentCron] failed:', json.error);
      }
    } catch (e: any) {
      results.failed++;
      console.error('[ContentCron] error:', e.message);
    }
  }

  console.log('[ContentCron] done', results);

  // Alert if nothing was published — silent zero is the failure mode we want to catch
  if (results.published === 0) {
    await alertAdmin(results);
  }

  return NextResponse.json({ ok: true, ...results });
}
