// lib/twitter.ts
// Posts article summaries to X (Twitter) via OAuth 1.0a
// Called by /api/content/cron after each successful article publish

import { TwitterApi } from 'twitter-api-v2';

const SITE = 'https://chat.homerates.ai';

const CATEGORY_EMOJI: Record<string, string> = {
    'market-news':   '📊',
    'knowledge-hub': '💡',
};

const CATEGORY_TAGS: Record<string, string> = {
    'market-news':   '#mortgage #housing #realestate',
    'knowledge-hub': '#mortgage #homebuying #realestate',
};

function buildClient(): TwitterApi | null {
    const { TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET } = process.env;
    if (!TWITTER_API_KEY || !TWITTER_API_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_TOKEN_SECRET) {
        return null;
    }
    return new TwitterApi({
        appKey:      TWITTER_API_KEY,
        appSecret:   TWITTER_API_SECRET,
        accessToken: TWITTER_ACCESS_TOKEN,
        accessSecret: TWITTER_ACCESS_TOKEN_SECRET,
    });
}

export async function postArticleTweet(opts: {
    title:    string;
    excerpt:  string;
    slug:     string;
    category: string;
}): Promise<{ success: boolean; tweetId?: string; error?: string }> {
    const client = buildClient();
    if (!client) {
        console.warn('[Twitter] Credentials not configured — skipping post');
        return { success: false, error: 'credentials_missing' };
    }

    try {
        const emoji    = CATEGORY_EMOJI[opts.category] ?? '📰';
        const hashtags = CATEGORY_TAGS[opts.category]  ?? '#mortgage #realestate';
        const url      = `${SITE}/${opts.category}/${opts.slug}`;

        // X counts all URLs as 23 chars regardless of length.
        // Budget: emoji(2) + space(1) + title + 2nl + excerpt + 2nl + url(23) + 2nl + hashtags
        const fixedCost = 3 + opts.title.length + 2 + 2 + 23 + 2 + hashtags.length;
        const excerptBudget = Math.max(40, 270 - fixedCost);
        const excerpt = opts.excerpt.length > excerptBudget
            ? opts.excerpt.slice(0, excerptBudget - 1) + '…'
            : opts.excerpt;

        const text = `${emoji} ${opts.title}\n\n${excerpt}\n\n${url}\n\n${hashtags}`;

        const result = await client.v2.tweet(text);
        console.log('[Twitter] Posted:', result.data.id, '—', opts.slug);
        return { success: true, tweetId: result.data.id };
    } catch (e: any) {
        console.error('[Twitter] Post failed:', e.message);
        return { success: false, error: e.message };
    }
}
