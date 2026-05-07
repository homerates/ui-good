// app/api/admin/test-twitter/route.ts
// GET — posts a tweet. Admin only.
// ?mode=test (default): diagnostic test tweet
// ?mode=retry: finds up to 5 recent articles without twitter_post_id and tweets them
// ?slug=&category=&title=&excerpt=: posts that specific article

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/adminAuth';
import { postArticleTweet } from '@/twitter';

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
}

export async function GET(req: NextRequest) {
    const { error } = await requireAdmin();
    if (error) return error;

    const { searchParams } = req.nextUrl;
    const mode = searchParams.get('mode') ?? 'test';

    if (mode === 'retry') {
        // Find recent published articles that haven't been tweeted yet
        const supabase = db();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: articles, error: dbErr } = await supabase
            .from('generated_articles')
            .select('slug, title, excerpt, category, fred_snapshot')
            .gte('published_at', sevenDaysAgo)
            .eq('status', 'published')
            .order('published_at', { ascending: false })
            .limit(20);

        if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

        const unposted = (articles ?? []).filter(a => !(a.fred_snapshot as any)?.twitter_post_id);
        const results: any[] = [];

        for (const article of unposted.slice(0, 5)) {
            const tweetResult = await postArticleTweet({
                title: article.title,
                excerpt: article.excerpt ?? '',
                slug: article.slug,
                category: article.category,
            });
            if (tweetResult.success && tweetResult.tweetId) {
                const { data: existing } = await supabase.from('generated_articles').select('fred_snapshot').eq('slug', article.slug).maybeSingle();
                await supabase.from('generated_articles').update({
                    fred_snapshot: { ...(existing?.fred_snapshot ?? {}), twitter_post_id: tweetResult.tweetId, tweeted_at: new Date().toISOString() },
                }).eq('slug', article.slug);
            }
            results.push({ slug: article.slug, ...tweetResult });
        }

        return NextResponse.json({ mode: 'retry', totalUnposted: unposted.length, processed: results });
    }

    // Default: test tweet (or specific article via query params)
    const slug     = searchParams.get('slug')     ?? 'test';
    const category = searchParams.get('category') ?? 'market-news';
    const title    = searchParams.get('title')    ?? 'HomeRates.ai — Live Mortgage Intelligence';
    const excerpt  = searchParams.get('excerpt')  ?? 'Testing our automated content pipeline. Real mortgage data, AI-powered analysis, live rates from FRED.';

    const result = await postArticleTweet({ title, excerpt, slug, category });
    return NextResponse.json({ mode: 'test', ...result });
}
