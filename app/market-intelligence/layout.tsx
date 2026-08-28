// app/market-intelligence/layout.tsx
//
// The page itself must stay a Client Component ('use client' — it uses
// useAuth/useUser/useState/useEffect), and Next.js App Router doesn't allow
// exporting `metadata` from a Client Component. This layout is the standard
// pattern for adding real metadata to a route whose page can't carry it
// directly — purely additive, does not touch page.tsx or its behavior.

import type { Metadata } from 'next';

const BASE = 'https://chat.homerates.ai';
const URL = `${BASE}/market-intelligence`;

export const metadata: Metadata = {
  title: 'Market Rate Intelligence — Live FRED Data & AI Rate Forecast | HomeRates.ai',
  description:
    'Live 30-year mortgage rate trends, a rate correlation matrix, a 90-day AI-powered rate forecast, and 5 years of historical context — sourced from FRED and Optimal Blue via FRED, updated continuously. Free, no login required.',
  keywords: [
    'mortgage rate trends',
    'mortgage rate forecast',
    'FRED mortgage rate data',
    '30 year fixed rate trend',
    'mortgage rate correlation',
    'historical mortgage rates',
  ],
  alternates: { canonical: URL },
  openGraph: {
    title: 'Market Rate Intelligence — Live FRED Data & AI Rate Forecast | HomeRates.ai',
    description:
      'AI-powered rate analysis, correlation tracking, and a 90-day forecast oracle — powered by FRED and Optimal Blue via FRED.',
    url: URL,
    siteName: 'HomeRates.ai',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Market Rate Intelligence | HomeRates.ai',
    description: 'Live mortgage rate trends, correlation matrix, and a 90-day AI rate forecast — powered by FRED.',
  },
};

export default function MarketIntelligenceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
