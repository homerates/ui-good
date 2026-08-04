'use client';

import './vizDemo.css';
import { PaymentCompositionExplorer } from './_components/payment-explorer';
import { ClosingDisclosureAnnotator } from './_components/closing-disclosure';
import { mockLoanScenario, mockLoanScenarioBounds } from './_mock-data/loanScenario.mock';
import { mockClosingCosts } from './_mock-data/closingCosts.mock';

// Standalone presentation-layer demo, ported in from viz-module/ (a separate Vite scaffold) so
// it deploys through the normal Next.js/Vercel pipeline instead of living only on localhost.
// Deliberately NOT linked from any nav menu — see CLAUDE.md Navigation Hard Rules; this route
// exists to preview these components, not as a shipped consumer surface yet.
//
// Styling is inline (React style objects), not Tailwind classes — this app has no active
// Tailwind entry point (tailwindcss is installed but never @import'd in app/globals.css), so
// utility classes here would silently be no-ops. vizDemo.css covers only what inline styles
// can't (a responsive grid breakpoint, a hover state) and is namespaced to avoid colliding
// with the rest of the app's global CSS.
//
// COMPLIANCE: nothing on this page ranks, compares, or recommends a specific lender, loan
// product, or property listing — every figure here visualizes the consumer's own scenario
// inputs or a clearly-labeled illustrative/mock range. See ClosingCostLineItem and LoanScenario
// doc comments for how that constraint is enforced in the data shapes themselves.
export default function VizDemoPage() {
  return (
    <div className="page-standalone" style={{ backgroundColor: '#f8fafc', color: '#0f172a', padding: '32px 24px' }}>
      <header style={{ maxWidth: 960, margin: '0 auto 32px' }}>
        <p style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#00e87a', margin: 0 }}>
          HomeRates Visualization Module — Dev Demo
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginTop: 4, marginBottom: 0 }}>
          Payment Composition Explorer
        </h1>
        <p style={{ fontSize: 14, color: '#475569', marginTop: 4, maxWidth: 640 }}>
          All figures below are illustrative — modeled from the consumer&apos;s own inputs, not a
          lender quote or offer.
        </p>
      </header>
      <main style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>
        <PaymentCompositionExplorer initialScenario={mockLoanScenario} bounds={mockLoanScenarioBounds} />

        <section>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>
            Closing Disclosure Annotator
          </h2>
          <ClosingDisclosureAnnotator lineItems={mockClosingCosts} />
        </section>
      </main>
    </div>
  );
}
