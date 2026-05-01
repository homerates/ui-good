// app/s/[slug]/page.tsx
// Renders OG-tagged page for social crawlers, then client-redirects browsers to the shared thread.
// Server redirect() would bypass <head> OG tags — client redirect is required.

export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import ClientRedirect from './ClientRedirect';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getDb() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function resolveSlug(slug: string): Promise<string> {
  const supabase = getDb();
  if (!slug || !supabase) return '/chat';

  const { data: thread } = await supabase
    .from('shared_threads')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle();

  if (thread?.slug) return `/chat?shared=${slug}`;

  const { data: link } = await supabase
    .from('short_links')
    .select('target_url')
    .eq('slug', slug)
    .maybeSingle();

  return link?.target_url ?? '/chat';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const ogImage = `https://chat.homerates.ai/api/og?title=${encodeURIComponent('Live Mortgage Scenario')}&cat=Scenario`;
  return {
    title: 'Shared Mortgage Scenario | HomeRates.ai',
    description: 'View a live mortgage scenario with real rates and real math — powered by HomeRates.ai.',
    openGraph: {
      title: 'Shared Mortgage Scenario | HomeRates.ai',
      description: 'View a live mortgage scenario with real rates and real math — powered by HomeRates.ai.',
      url: `https://chat.homerates.ai/s/${slug}`,
      type: 'website',
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Shared Mortgage Scenario | HomeRates.ai',
      description: 'View a live mortgage scenario with real rates and real math — powered by HomeRates.ai.',
      images: [ogImage],
    },
  };
}

export default async function ShortRedirectPage(props: any) {
  const params = (await props.params) as { slug?: string } | undefined;
  const slug = params?.slug ?? '';
  const redirectUrl = await resolveSlug(slug);
  return <ClientRedirect to={redirectUrl} />;
}
