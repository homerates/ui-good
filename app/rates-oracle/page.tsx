// app/rates-oracle/page.tsx
// Personalized Rates Oracle — reached only via a ?sid= deep-link from
// DecisionScoreCard, never linked from nav (not added to lib/nav-config.ts,
// not in a route group — see NAVIGATION_SPEC.md, same standalone-page
// category as /rate-intelligence-engine). No SEO metadata: this isn't a
// public landing page.

import { Suspense } from 'react';
import AppNav from '../components/AppNav';
import RatesOracleClient from './RatesOracleClient';

export default function RatesOraclePage() {
  return (
    <div className="page-standalone" style={{ background: '#080c12', minHeight: '100vh' }}>
      <AppNav />
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.25rem 4rem', fontFamily: "'DM Sans', system-ui, sans-serif", color: '#f0f4ff' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: '0.68rem', color: '#8fa3b8', textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>
            Rates Oracle
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Where does your rate fall?</h1>
        </div>
        <Suspense fallback={<div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8fa3b8', fontSize: '0.9rem' }}>Loading…</div>}>
          <RatesOracleClient />
        </Suspense>
      </main>
    </div>
  );
}
