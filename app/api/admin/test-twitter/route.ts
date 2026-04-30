// app/api/admin/test-twitter/route.ts
// GET — tests Twitter credentials by posting a test tweet
// Admin only

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/adminAuth';
import { postArticleTweet } from '@/twitter';

export async function GET() {
    const { error } = await requireAdmin();
    if (error) return error;

    const result = await postArticleTweet({
        title:    'HomeRates.ai — Live Mortgage Intelligence',
        excerpt:  'Testing our automated content pipeline. Real mortgage data, AI-powered analysis, live rates from FRED.',
        slug:     'test',
        category: 'market-news',
    });

    return NextResponse.json(result);
}
