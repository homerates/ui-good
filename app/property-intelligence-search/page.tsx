// app/property-intelligence-search/page.tsx
//
// Human-facing entry page for the Property Intelligence capability. See
// PropertyIntelligenceSearchClient.tsx for the interactive UI and the
// reuse-not-a-new-pipeline rationale. Split into a Server Component (this
// file, owns `metadata`) + a Client Component (the actual form) because
// Next.js App Router doesn't allow a `'use client'` file to also export
// `metadata` -- the standard pattern already used for other client-driven
// pages in this repo.
//
// `?q=` is read here (a plain search param on a Server Component page,
// no client-side effect needed) and passed down as the client component's
// initial input value only -- it never triggers a lookup by itself; see
// the client file's own header for the cost guardrail.

import type { Metadata } from 'next';
import PropertyIntelligenceSearchClient from './PropertyIntelligenceSearchClient';

export const metadata: Metadata = {
  title: 'Property Intelligence Search | HomeRates.ai',
  description:
    'Search any home by address or Zillow/Redfin link and explore HomeRates property, financing, ownership cost, market and decision intelligence.',
  alternates: { canonical: 'https://homerates.ai/property-intelligence-search' },
  openGraph: {
    title: 'Property Intelligence Search | HomeRates.ai',
    description:
      'Search any home by address or Zillow/Redfin link and explore HomeRates property, financing, ownership cost, market and decision intelligence.',
    url: 'https://homerates.ai/property-intelligence-search',
    siteName: 'HomeRates.ai',
    type: 'website',
  },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <PropertyIntelligenceSearchClient initialValue={q ?? ''} />;
}
