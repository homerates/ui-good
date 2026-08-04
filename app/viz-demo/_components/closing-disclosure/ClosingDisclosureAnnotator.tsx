'use client';

import type { ClosingCostLineItem } from '../../_types';
import { flagForLineItem } from '../../_types';
import { Card } from '../shared';
import { ClosingCostBreakdownChart } from './ClosingCostBreakdownChart';
import { ClosingCostLineItemCard } from './ClosingCostLineItemCard';
import { formatCurrency } from '../../_lib/formatters';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card
        title="Closing cost breakdown"
        subtitle={`${formatCurrency(total)} total across ${lineItems.length} line items${
          flaggedCount > 0 ? ` — ${flaggedCount} outside the typical range for their category` : ''
        }`}
      >
        <ClosingCostBreakdownChart items={lineItems} />
      </Card>

      <Card title="Line items">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lineItems.map(item => (
            <ClosingCostLineItemCard key={item.id} item={item} />
          ))}
        </div>
        {usesMockRanges && (
          <p style={{ marginTop: 16, fontSize: 12, color: '#94a3b8', borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
            Typical-range figures shown here are illustrative placeholders, not verified industry
            benchmarks.
          </p>
        )}
      </Card>
    </div>
  );
}
