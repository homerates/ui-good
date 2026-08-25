import { MetadataRoute } from 'next';
import { knowledgeHubArticles } from './knowledge-hub/articles';
import { marketNewsArticles } from './market-news/articles';
import { createClient } from '@supabase/supabase-js';
import { listIndexEligiblePropertyIds } from '../lib/propertyIntelligence';

export const revalidate = 3600;
// Without this, Next.js's Data Cache silently caches the underlying fetch()
// calls Supabase's client makes (since this route is ISR-eligible, not
// force-dynamic) independently of -- and outliving -- this route's own
// revalidate window. Confirmed directly: with this route on default fetch
// caching, /sitemap.xml served a stale property-intelligence count (78)
// across multiple fresh builds and processes with zero DB changes in
// between, while a force-dynamic route calling the exact same function in
// the same process always returned the true current count (86). This
// forces every fetch inside the route to be genuinely live on each
// regeneration, while the route's own output is still cached for
// `revalidate` seconds as intended.
export const fetchCache = 'force-no-store';

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
            url: `${base}/support`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.5,
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

        // Pro / LO landing pages
        {
            url: `${base}/for-pros`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${base}/professionals`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.7,
        },
        {
            url: `${base}/founding`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.85,
        },
        {
            url: `${base}/loan-limits`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${base}/pricing`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.75,
        },
        {
            url: `${base}/compare`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.75,
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

        // Platform Intelligence Hub + marketing pillar pages
        {
            url: `${base}/platform`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.85,
        },
        {
            url: `${base}/searchable-by-design`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.8,
        },
        {
            url: `${base}/decision-score`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.85,
        },
        {
            url: `${base}/autonomous-intelligence`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.8,
        },
        {
            url: `${base}/track5-intelligence`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.8,
        },
        {
            url: `${base}/ai-coach`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.8,
        },
        {
            url: `${base}/property-intelligence`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.8,
        },
        {
            url: `${base}/best-mortgage-ai-platform`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.8,
        },
        {
            url: `${base}/best-dscr-calculator-2026`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.8,
        },
        {
            url: `${base}/private-vault-mortgage`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.75,
        },
        {
            url: `${base}/compare-mortgage-quotes`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.75,
        },
        {
            url: `${base}/consumer-mortgage-platform`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.75,
        },
        {
            url: `${base}/unbiased-mortgage-rates`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.75,
        },
        {
            url: `${base}/property-intelligence-cards`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.75,
        },
        // Tools — public pages with client-side auth gating
        {
            url: `${base}/jumbo-calculator`,
            lastModified: new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.9,
        },
        {
            url: `${base}/va-calculator`,
            lastModified: new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.9,
        },
        {
            url: `${base}/check-property`,
            lastModified: new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.8,
        },
        {
            url: `${base}/property-intel`,
            lastModified: new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.8,
        },
        {
            url: `${base}/investor-intel`,
            lastModified: new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.75,
        },
        {
            url: `${base}/lab`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.75,
        },
        // Auto-generated articles from DB
        ...(await getGeneratedArticles()).map((a) => ({
            url: `${base}/${a.category}/${a.slug}`,
            lastModified: new Date(a.updated_at),
            changeFrequency: a.category === 'market-news' ? 'daily' as const : 'weekly' as const,
            priority: a.category === 'market-news' ? 0.8 : 0.75,
        })),

        // Canonical Property Intelligence corpus — every properties.id row that
        // currently passes the real §8 threshold (cheap presence-only check, no
        // LLPA/OBMMI calls; see lib/propertyIntelligence.ts). A property that
        // loses its underlying data or goes sold/off-market drops out on the
        // next hourly regeneration without a manual edit.
        ...(await listIndexEligiblePropertyIds()).map((p) => ({
            url: `${base}/property-intelligence/${p.id}`,
            lastModified: p.lastModified ? new Date(p.lastModified) : new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.65,
        })),
    ];
}
