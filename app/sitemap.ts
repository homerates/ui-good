import { MetadataRoute } from 'next';
import { knowledgeHubArticles } from './knowledge-hub/articles';
import { marketNewsArticles } from './market-news/articles';
import { createClient } from '@supabase/supabase-js';
import { getPropertyIntelligencePilotData } from '../lib/propertyIntelligencePilot';

export const revalidate = 3600;

// Canonical Property Intelligence pilot — hand-selected properties.id values only
// (no cron/automation yet; see the pilot's implementation report). Each is still
// re-checked against the real §8 threshold here so a property that becomes stale
// or loses its underlying data drops out of the sitemap automatically rather than
// requiring a manual edit to notice.
const PILOT_PROPERTY_IDS = [
  'dd9b27fc-8a8a-40b0-b7c1-3ca4d6d4d86c', // 1727 Stone Canyon Rd, Los Angeles
  '68011278-fc09-46c3-9526-0feb515d494b', // 40701 Penn Ln, Fremont
  '0f62a72b-ed54-4bf3-973b-bde12176bc0a', // 476 Jeanne Ct, Newbury Park
  '057d1dce-689b-4b19-9637-a152e8d403ca', // 16 Appomattox, Irvine
  '09ae496e-14be-4b74-b680-65e2b6b9c94d', // 107 Oxford #34, Irvine
];

async function getIndexEligiblePilotPages() {
  try {
    const results = await Promise.all(PILOT_PROPERTY_IDS.map(id => getPropertyIntelligencePilotData(id)));
    return results.filter((d): d is NonNullable<typeof d> => d != null && d.eligibility === 'index');
  } catch { return []; }
}

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

        // Canonical Property Intelligence pilot — index-eligible pages only
        ...(await getIndexEligiblePilotPages()).map((p) => ({
            url: `${base}/property-intelligence/${p.id}`,
            lastModified: p.provenance.intelligenceComputedAt ? new Date(p.provenance.intelligenceComputedAt) : new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.65,
        })),
    ];
}
