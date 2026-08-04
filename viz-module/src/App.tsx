import { PaymentCompositionExplorer } from './components/payment-explorer';
import { ClosingDisclosureAnnotator } from './components/closing-disclosure';
import { mockLoanScenario, mockLoanScenarioBounds } from './mock-data/loanScenario.mock';
import { mockClosingCosts } from './mock-data/closingCosts.mock';

// Demo page — Payment Composition Explorer + Closing Disclosure Annotator wired up so far.
// Location Context Panel gets added here once built, per the "one component at a time" process.
export default function App() {
  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      <header className="max-w-5xl mx-auto mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
          HomeRates Visualization Module — Dev Demo
        </p>
        <h1 className="text-2xl font-bold text-neutral-900 mt-1">Payment Composition Explorer</h1>
        <p className="text-sm text-neutral-600 mt-1 max-w-2xl">
          All figures below are illustrative — modeled from the consumer's own inputs, not a
          lender quote or offer.
        </p>
      </header>
      <main className="max-w-5xl mx-auto flex flex-col gap-10">
        <PaymentCompositionExplorer initialScenario={mockLoanScenario} bounds={mockLoanScenarioBounds} />

        <section>
          <h2 className="text-xl font-bold text-neutral-900 mb-4">Closing Disclosure Annotator</h2>
          <ClosingDisclosureAnnotator lineItems={mockClosingCosts} />
        </section>
      </main>
    </div>
  );
}
