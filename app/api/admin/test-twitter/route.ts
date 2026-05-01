// app/api/admin/test-twitter/route.ts
// GET — posts a tweet. Admin only.
// Without params: posts a diagnostic test tweet.
// With params: ?slug=&category=&title=&excerpt= — posts that specific article.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/adminAuth';
import { postArticleTweet } from '@/twitter';

export async function GET(req: NextRequest) {
    const { error } = await requireAdmin();
    if (error) return error;

    const { searchParams } = req.nextUrl;
    const slug     = searchParams.get('slug')     ?? 'test';
    const category = searchParams.get('category') ?? 'market-news';
    const title    = searchParams.get('title')    ?? 'HomeRates.ai — Live Mortgage Intelligence';
    const excerpt  = searchParams.get('excerpt')  ?? 'Testing our automated content pipeline. Real mortgage data, AI-powered analysis, live rates from FRED.';

    const result = await postArticleTweet({ title, excerpt, slug, category });

    return NextResponse.json(result);
}
