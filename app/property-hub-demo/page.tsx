// app/property-hub-demo/page.tsx
// Standalone demo of PropertyJourneyHub with sample data — not linked from nav,
// not in a route group (same pattern as /viz-demo and /rates-oracle this
// session). Lets Rayaan view/evaluate the built component before Part 3's
// canonical route is approved; the component itself is what would get dropped
// into that real route later.

import AppNav from '../components/AppNav';
import { PropertyJourneyHub, type PropertyJourneyLevel } from '../components/PropertyJourneyHub';

const SAMPLE_LEVELS: PropertyJourneyLevel[] = [
  { id: 'l1', label: 'Financial Readiness', score: 82, href: '/chat', relevance: 0.4 },
  { id: 'l2', label: 'Property Evaluation', score: 74, href: '/check-property', relevance: 0.5 },
  { id: 'l3', label: 'Market Intelligence', score: 68, href: '/property-intel', relevance: 0.6 },
  { id: 'l4', label: 'Location Intelligence', score: null, href: '/property-intel', relevance: 0.95 },
  { id: 'l5', label: 'Rate Intelligence', score: null, href: '/rate-intelligence-engine', relevance: 0.3 },
];

export default function PropertyHubDemoPage() {
  return (
    <div className="page-standalone" style={{ background: '#080c12', minHeight: '100vh' }}>
      <AppNav />
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.25rem 4rem', fontFamily: "'DM Sans', system-ui, sans-serif", color: '#f0f4ff' }}>
        <div style={{ marginBottom: 8, textAlign: 'center' }}>
          <div style={{ fontSize: '0.68rem', color: '#8fa3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>
            Property Journey Hub — Demo
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>2420 E County Down Dr</h1>
          <p style={{ fontSize: '0.8rem', color: '#8fa3b8', marginTop: 6, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
            Sample scores — property image is real Street View/satellite imagery via the existing PropertyPhoto
            fallback chain (no flyover video: Higgsfield priced out at our likely volume, 2026-08-05). L4
            (Location Intelligence) is shown unscored with the highest relevance to demonstrate the "next step" emphasis.
          </p>
        </div>
        <div style={{ marginTop: 24 }}>
          <PropertyJourneyHub
            propertyAddress="2420 E County Down Dr, Chandler, AZ 85249"
            levels={SAMPLE_LEVELS}
          />
        </div>
      </main>
    </div>
  );
}
