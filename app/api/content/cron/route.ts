// app/api/content/cron/route.ts
// GET — daily content engine. Runs at 7am PT via Vercel cron.
// Generates 2 Market News + 1 Knowledge Hub article per day.
// Each article: FRED live rates + Tavily research + Grok writing.

export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextResponse } from 'next/server';

const APP_URL    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://chat.homerates.ai';
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: Request) {
  if (!CRON_SECRET || req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Import topic picker here to keep route lean
  const { pickTopicsForToday } = await import('@/content/topics');
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
  return NextResponse.json({ ok: true, ...results });
}
