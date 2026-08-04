import type { ClosingCostLineItem } from '../../types';
import { flagForLineItem } from '../../types';
import { Card } from '../shared';
import { ClosingCostBreakdownChart } from './ClosingCostBreakdownChart';
import { ClosingCostLineItemCard } from './ClosingCostLineItemCard';
import { formatCurrency } from '../../lib/formatters';

interface ClosingDisclosureAnnotatorProps {
  lineItems: ClosingCostLineItem[];
}

/**
 * Visual companion to a Loan Estimate / Closing Disclosure — never re-derives or re-quotes the
 * document itself, just visualizes the structured line items the caller already has. This
 * component has no lender field anywhere in its data path (see ClosingCostLineItem) — there is
 * nothing here to accidentally turn into a lender comparison.
 */
export function ClosingDisclosureAnnotator({ lineItems }: ClosingDisclosureAnnotatorProps) {
  const total = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const flaggedCount = lineItems.filter(item => flagForLineItem(item) !== 'within-range').length;
  const usesMockRanges = lineItems.some(item => item.rangeSource === 'mock');

  return (
    <div className="flex flex-col gap-5">
      <Card
        title="Closing cost breakdown"
        subtitle={`${formatCurrency(total)} total across ${lineItems.length} line items${
          flaggedCount > 0 ? ` — ${flaggedCount} outside the typical range for their category` : ''
        }`}
      >
        <ClosingCostBreakdownChart items={lineItems} />
      </Card>

      <Card title="Line items">
        <div className="flex flex-col gap-2">
          {lineItems.map(item => (
            <ClosingCostLineItemCard key={item.id} item={item} />
          ))}
        </div>
        {usesMockRanges && (
          <p className="mt-4 text-xs text-neutral-400 border-t border-neutral-200 pt-3">
            Typical-range figures shown here are illustrative placeholders, not verified industry
            benchmarks — see README "Data Sources" before using this with real consumer data.
          </p>
        )}
      </Card>
    </div>
  );
}
