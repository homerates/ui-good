import { MetadataRoute } from 'next';
import { knowledgeHubArticles } from './knowledge-hub/articles';
import { marketNewsArticles } from './market-news/articles';
import { createClient } from '@supabase/supabase-js';

export const revalidate = 3600;

async function getGeneratedArticles() {
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data } = await sb
      .from('generated_articles')
      .select('slug, category, updated_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(500);
    return data ?? [];
  } catch { return []; }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const base = 'https://chat.homerates.ai';

    return [
        {
            url: base,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 1.0,
        },
        {
            url: `${base}/affordability-calculator`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.9,
        },
        {
            url: `${base}/fha-calculator`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.9,
        },
        {
            url: `${base}/dscr-calculator`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.9,
        },
        {
            url: `${base}/refinance-calculator`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: `${base}/conventional-loan-calculator`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.9,
        },

        {
            url: `${base}/calculators`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: `${base}/about`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.6,
        },
        {
            url: `${base}/privacy`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.4,
        },
        {
            url: `${base}/disclosures`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.4,
        },

        {
            url: `${base}/why-homerates`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.8,
        },

        // Homeowner D2C pages
        {
            url: `${base}/homeowner`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.8,
        },

        // Knowledge Hub landing + articles
        {
            url: `${base}/knowledge-hub`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        ...knowledgeHubArticles.map((a) => ({
            url: `${base}/knowledge-hub/${a.slug}`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.7,
        })),

        // Market News landing + articles
        {
            url: `${base}/market-news`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        ...marketNewsArticles.map((a) => ({
            url: `${base}/market-news/${a.slug}`,
            lastModified: new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.75,
        })),

        // Income cluster pages
        {
            url: `${base}/how-much-house-can-i-afford-on-80k-salary`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${base}/how-much-house-can-i-afford-on-95k-salary`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${base}/how-much-house-can-i-afford-on-100k-salary`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${base}/how-much-house-can-i-afford-on-120k-salary`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${base}/how-much-house-can-i-afford-on-150k-salary`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.7,
        },

        // Auto-generated articles from DB
        ...(await getGeneratedArticles()).map((a) => ({
            url: `${base}/${a.category}/${a.slug}`,
            lastModified: new Date(a.updated_at),
            changeFrequency: a.category === 'market-news' ? 'daily' as const : 'weekly' as const,
            priority: a.category === 'market-news' ? 0.8 : 0.75,
        })),
    ];
}
